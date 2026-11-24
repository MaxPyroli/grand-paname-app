import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Keyboard, Animated, Easing } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useColors } from './theme';
import { hexToRgba } from './Fade';
import { MODE_ICONS } from './modeIcons';
import { PanelPillAction } from './PanelHeader';
import { Icon } from './Icon';
import { ListeFondue } from './ListeFondue';
import { rechercherLignesBus, prechargerDetailLigne, LigneTrafic, EtatTrafic } from './traficApi';

// Recherche d'une ligne de bus par son numéro (« 104 », « N32 »). Les bus ne sont pas dans la liste (plus de 1 800 lignes) :
// chaque frappe lance, après 300 ms de pause, une petite requête.
//
// Deux morceaux :
//  - `BoutonRechercheBus` : le faux champ tout en bas de la liste Info trafic ; le toucher ouvre le mode recherche.
//  - `RechercheBus` : le MODE RECHERCHE, qui prend la place de la liste. Le titre « Bus » est tout en haut (avec « Fermer »), les
//    résultats dans un menu DÉFILANT entre le titre et la barre, la barre de saisie en bas, au-dessus du clavier : ni le titre
//    ni la barre ne sont jamais cachés.
const LIBELLE_ETAT: Record<EtatTrafic, string> = { normal: 'Trafic normal', info: 'Information', travaux: 'Travaux en cours', perturbe: 'Trafic perturbé', interrompu: 'Trafic interrompu' };
const COULEUR_ETAT: Record<EtatTrafic, string> = { normal: '#2ECC71', info: '#3C91DC', travaux: '#FFC400', perturbe: '#F39C12', interrompu: '#E5493E' };

export function BoutonRechercheBus({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={[styles.champ, { backgroundColor: hexToRgba(c.text, 0.07), borderColor: c.borderCard }]}>
      <Text style={[styles.saisie, { color: c.textSub }]}>Rechercher un bus (ex. 104, N32)</Text>
    </TouchableOpacity>
  );
}

// Une ligne de résultat : elle apparaît en fondu en glissant de 14 px vers le haut, avec un petit décalage (`rang` : 0 = la plus proche de la barre).
function LigneResultat({ l, rang, attenue, onOuvrir, suivie, onBasculerBus }: { l: LigneTrafic; rang: number; attenue: boolean; onOuvrir: (l: LigneTrafic) => void; suivie: boolean; onBasculerBus: (l: LigneTrafic) => void }) {
  const c = useColors();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 260, delay: Math.min(rang, 6) * 45, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, rang]);
  // Pendant une nouvelle recherche, les résultats déjà là s'estompent un peu au lieu de disparaître d'un coup.
  const att = useRef(new Animated.Value(1)).current;
  useEffect(() => { Animated.timing(att, { toValue: attenue ? 0.45 : 1, duration: 160, useNativeDriver: true }).start(); }, [attenue, att]);
  return (
    <Animated.View style={{ opacity: Animated.multiply(v, att), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={() => { Keyboard.dismiss(); onOuvrir(l); }}   // le clavier se ferme dès qu'on ouvre une ligne
        onPressIn={() => prechargerDetailLigne(l.id)}
        style={[styles.ligne, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}
      >
        <View style={[styles.pastille, { backgroundColor: '#' + l.color }]}>
          <Text style={[styles.pastilleTexte, { color: '#' + l.textColor }]} numberOfLines={1}>{l.code}</Text>
        </View>
        <Text style={[styles.libelle, { color: c.text }]} numberOfLines={1}>Bus {l.code}</Text>
        <View style={[styles.pointEtat, { backgroundColor: COULEUR_ETAT[l.etat] }]} />
        <Text style={[styles.etat, { color: c.textSub }]} numberOfLines={1}>{LIBELLE_ETAT[l.etat]}</Text>
        {/* Cloche : suivre cette ligne pour les alertes trafic (fond d'accent quand elle est suivie). */}
        <TouchableOpacity
          hitSlop={8}
          onPress={() => onBasculerBus(l)}
          accessibilityRole="switch"
          accessibilityState={{ checked: suivie }}
          accessibilityLabel={`Alertes pour le bus ${l.code}`}
          style={[styles.cloche, { backgroundColor: suivie ? c.accent : hexToRgba(c.text, 0.08) }]}
        >
          <Icon name="notifications" size={15} color={suivie ? '#fff' : c.textSub} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Trois cartes grises qui pulsent pendant la recherche (même principe que le squelette du détail d'une ligne).
function SqueletteResultats() {
  const c = useColors();
  const pulse = useRef(new Animated.Value(0)).current;
  const entree = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entree, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const boucle = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    boucle.start();
    return () => boucle.stop();
  }, [pulse, entree]);
  const opacity = Animated.multiply(entree, pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }));
  const gris = hexToRgba(c.text, 0.13);
  return (
    <Animated.View style={{ opacity }} pointerEvents="none">
      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.ligne, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
          <View style={[styles.pastille, { backgroundColor: gris }]} />
          <View style={{ width: 70 + i * 16, height: 12, borderRadius: 6, backgroundColor: gris }} />
          <View style={{ marginLeft: 'auto', width: 84, height: 10, borderRadius: 5, backgroundColor: gris }} />
        </View>
      ))}
    </Animated.View>
  );
}

// Un message (aide, aucun résultat, erreur) : fondu à l'apparition.
function Message({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 240, useNativeDriver: true }).start(); }, [v]);
  return <Animated.Text style={[styles.info, { color: c.textSub, opacity: v }]}>{children}</Animated.Text>;
}

// `basClavier` : hauteur dont le clavier recouvre le bas de cette zone (0 sans clavier).
export default function RechercheBus({ onOuvrir, onFermer, basClavier, suivies, onBasculerBus }: { onOuvrir: (l: LigneTrafic) => void; onFermer: () => void; basClavier: number; suivies: string[]; onBasculerBus: (l: LigneTrafic) => void }) {
  const c = useColors();
  const [texte, setTexte] = useState('');
  const [resultats, setResultats] = useState<LigneTrafic[] | null>(null);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState(false);
  const numero = useRef(0);
  const defilement = useRef<ScrollView>(null);

  useEffect(() => {
    const q = texte.trim();
    const mon = ++numero.current;
    if (q === '') { setResultats(null); setCharge(false); setErreur(false); return; }
    setCharge(true);
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => {
      rechercherLignesBus(q, ctrl.signal)
        .then(r => { if (numero.current === mon) { setResultats(r); setErreur(false); setCharge(false); } })
        .catch(e => { if (numero.current === mon && e?.name !== 'AbortError') { setErreur(true); setResultats(null); setCharge(false); } });
    }, 300);
    return () => { clearTimeout(minuteur); ctrl.abort(); };
  }, [texte]);

  // Les résultats sont collés à la barre (en bas du menu défilant) : on défile en bas à chaque nouveau résultat.
  const liste = resultats === null ? [] : [...resultats].reverse();   // le numéro exact (premier du tri) est le plus proche de la barre
  useEffect(() => { const t = setTimeout(() => defilement.current?.scrollToEnd({ animated: false }), 30); return () => clearTimeout(t); }, [resultats, erreur, basClavier]);

  return (
    <View style={[StyleSheet.absoluteFill, { paddingBottom: basClavier > 0 ? basClavier : 16 }]}>
      <View style={styles.titre}>
        <ExpoImage source={{ uri: MODE_ICONS['BUS'] }} style={[styles.titreIcone, { tintColor: c.textSub }]} contentFit="contain" />
        <Text style={[styles.titreTexte, { color: c.textSub }]}>BUS</Text>
        <View style={{ marginLeft: 'auto' }}>
          <PanelPillAction label="Fermer" onPress={() => { Keyboard.dismiss(); onFermer(); }} />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <ListeFondue verre sansBas>
          <ScrollView
            ref={defilement}
            style={{ flex: 1 }}
            contentContainerStyle={styles.menu}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {erreur && <Message>Impossible de chercher pour l'instant. Vérifie ta connexion.</Message>}
            {resultats === null && !erreur && !charge && <Message>Tape le numéro d'une ligne de bus pour voir son trafic.</Message>}
            {resultats !== null && resultats.length === 0 && !charge && !erreur && <Message>Aucune ligne de bus trouvée pour « {texte.trim()} ».</Message>}
            {charge && (resultats === null || resultats.length === 0) && !erreur && <SqueletteResultats />}
            {liste.map((l, i) => <LigneResultat key={l.id} l={l} rang={liste.length - 1 - i} attenue={charge} onOuvrir={onOuvrir} suivie={suivies.includes(l.id)} onBasculerBus={onBasculerBus} />)}
          </ScrollView>
        </ListeFondue>
      </View>
      <View style={[styles.champ, { backgroundColor: hexToRgba(c.text, 0.07), borderColor: c.borderCard }]}>
        <TextInput
          style={[styles.saisie, { color: c.text }]}
          value={texte}
          onChangeText={setTexte}
          placeholder="Rechercher un bus (ex. 104, N32)"
          placeholderTextColor={c.textSub}
          autoCorrect={false}
          autoCapitalize="characters"
          returnKeyType="search"
          autoFocus
        />
        {charge && <ActivityIndicator size="small" color={c.accent} />}
        {!charge && texte !== '' && (
          <TouchableOpacity onPress={() => setTexte('')} hitSlop={10}>
            <Text style={{ color: c.textSub, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titre: { flexDirection: 'row', alignItems: 'center', marginLeft: 4, marginBottom: 4, gap: 8, minHeight: 32 },
  titreIcone: { width: 18, height: 18 },
  titreTexte: { fontSize: 12, fontFamily: 'GrandParis-Bold', letterSpacing: 0.8 },
  menu: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 22, paddingBottom: 6 },
  champ: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, gap: 8 },
  saisie: { flex: 1, fontSize: 14, fontFamily: 'GrandParis-Medium', paddingVertical: 0 },
  info: { fontSize: 12, fontFamily: 'GrandParis-Light', marginBottom: 8, marginLeft: 4 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1 },
  pastille: { minWidth: 46, height: 26, borderRadius: 13, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  pastilleTexte: { fontSize: 13, fontFamily: 'GrandParis-Bold', includeFontPadding: false },
  libelle: { fontSize: 14, fontFamily: 'GrandParis-Medium', flexShrink: 1 },
  pointEtat: { width: 9, height: 9, borderRadius: 4.5, marginLeft: 'auto' },
  etat: { fontSize: 12, fontFamily: 'GrandParis-Light', maxWidth: 104 },
  cloche: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
});
