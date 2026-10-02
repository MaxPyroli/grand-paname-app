import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, GestureResponderEvent, Animated, Easing, InteractionManager, TouchableOpacity, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useColors, ThemeContext } from './theme';
import { Icon, IconInfoTraficCouleur } from './Icon';
import { PanelLayout } from './PanelLayout';
import { PanelIconAction } from './PanelHeader';
import { PanelEmptyState } from './PanelEmptyState';
import { MODE_ICONS } from './modeIcons';
import { chargerTrafic, oublierPerturbations, SECTIONS_TRAFIC, LigneTrafic, EtatTrafic } from './traficApi';
import { symboleLigne } from './symbolesLignes';

// Tiroir « Info trafic » — version simple (étape 1 du plan de la 3.4.0) : l'état de chaque ligne
// lourde en un coup d'œil. Pas encore de détail au toucher ni de recherche de bus.
const COULEUR_ETAT: Record<EtatTrafic, string | null> = { normal: null, perturbe: '#F39C12', interrompu: '#E5493E' };

// Symbole officiel de la ligne ; à défaut (ligne inconnue), pastille aux couleurs de la ligne.
function Pastille({ ligne, fond, sombre }: { ligne: LigneTrafic; fond: string; sombre: boolean }) {
  const point = COULEUR_ETAT[ligne.etat];
  const symbole = symboleLigne(ligne.mode, ligne.code, sombre);
  return (
    <View style={styles.pastilleCase}>
      {symbole ? (
        <ExpoImage source={{ uri: symbole }} style={styles.symbole} contentFit="contain" />
      ) : (
        <View style={[styles.pastille, { backgroundColor: '#' + ligne.color }]}>
          <Text style={[styles.pastilleTexte, { color: '#' + ligne.textColor }]} numberOfLines={1}>{ligne.code}</Text>
        </View>
      )}
      {point && <View style={[styles.pastillePoint, { backgroundColor: point, borderColor: fond }]} />}
    </View>
  );
}

// Squelette affiché tant que le premier chargement n'est pas fini (rare : les données sont préchargées au lancement).
// Même mise en page que l'aperçu, avec des cases grises qui pulsent au lieu des symboles.
// Easter egg : tirer la liste vers le bas et garder le doigt posé 3 secondes fait apparaître (ou disparaître)
// les lignes 15 à 18 du Grand Paris Express parmi les lignes de métro. Pas encore en service : aucun état, juste leur symbole.
const LIGNES_GPE: LigneTrafic[] = ['15', '16', '17', '18'].map(code => ({
  id: 'gpe-' + code, code, color: '888888', textColor: 'FFFFFF', mode: 'METRO', etat: 'normal', nbPerturbations: 0,
}));

const NB_CASES_SQUELETTE: Record<string, number> = { TRAIN_RER: 14, METRO: 16, TRAM: 15, CABLE: 2 };

function Squelette({ couleur }: { couleur: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const boucle = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    boucle.start();
    return () => boucle.stop();
  }, [pulse]);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.24] });
  return (
    <View style={{ flex: 1, overflow: 'hidden' }} pointerEvents="none">
      <View style={[styles.legende, { height: 16 }]} />
      {SECTIONS_TRAFIC.map(section => (
        <View key={section.cle} style={styles.section}>
          <Animated.View style={[styles.squeletteTitre, { backgroundColor: couleur, opacity }]} />
          <View style={styles.grille}>
            {Array.from({ length: NB_CASES_SQUELETTE[section.cle] ?? 8 }, (_, i) => (
              <View key={i} style={styles.pastilleCase}>
                <Animated.View style={[styles.symbole, { borderRadius: 13, backgroundColor: couleur, opacity }]} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export default function TraficScreen({ actif, verre }: { actif: boolean; verre?: boolean }) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  const [lignes, setLignes] = useState<LigneTrafic[] | null>(null);
  const [erreur, setErreur] = useState(false);
  const [actualise, setActualise] = useState(false);
  const derniere = useRef(0);
  const [gpe, setGpe] = useState(false);
  // Geste de l'easter egg : doigt posé en haut de la liste, tiré d'au moins 60 px vers le bas, tenu 3 secondes.
  const geste = useRef({ debut: 0, y0: 0, y: 0, enHaut: false });
  const scrollY = useRef(0);
  const debutGeste = useCallback((e: GestureResponderEvent) => {
    geste.current = { debut: Date.now(), y0: e.nativeEvent.pageY, y: e.nativeEvent.pageY, enHaut: scrollY.current <= 0 };
  }, []);
  const mouvementGeste = useCallback((e: GestureResponderEvent) => { geste.current.y = e.nativeEvent.pageY; }, []);
  const finGeste = useCallback(() => {
    const g = geste.current;
    geste.current = { debut: 0, y0: 0, y: 0, enHaut: false };
    if (g.debut > 0 && g.enHaut && g.y - g.y0 >= 60 && Date.now() - g.debut >= 3000) setGpe(v => !v);
  }, []);
  const lignesAffichees = useMemo(() => {
    if (!lignes || !gpe) return lignes;
    const dernierMetro = lignes.map(l => l.mode).lastIndexOf('METRO');
    const absentes = LIGNES_GPE.filter(g => !lignes.some(l => l.mode === 'METRO' && l.code === g.code));
    return [...lignes.slice(0, dernierMetro + 1), ...absentes, ...lignes.slice(dernierMetro + 1)];
  }, [lignes, gpe]);

  // `silencieux` : préchargement en arrière-plan, une panne de réseau n'affiche pas d'erreur (le volet réessaiera à l'ouverture).
  const charger = useCallback(async (forcer = false, silencieux = false) => {
    if (forcer) oublierPerturbations();
    if (!silencieux) setErreur(false);
    try {
      setLignes(await chargerTrafic());
      derniere.current = Date.now();
    } catch {
      if (!silencieux) setErreur(true);
    }
  }, []);

  // Préchargement peu après le lancement de l'app, pour que le volet soit déjà rempli quand on l'ouvre.
  useEffect(() => {
    let minuteur: ReturnType<typeof setTimeout>;
    const tache = InteractionManager.runAfterInteractions(() => { minuteur = setTimeout(() => charger(false, true), 1500); });
    return () => { tache.cancel(); clearTimeout(minuteur); };
  }, [charger]);

  // À l'ouverture du tiroir : chargement si rien n'est encore là, sinon relecture si les données ont plus d'une minute.
  // Quand des données sont déjà affichées, la relecture attend la fin de l'animation du tiroir pour ne pas la saccader.
  useEffect(() => {
    if (!actif || Date.now() - derniere.current <= 60_000) return;
    if (derniere.current === 0) { charger(); return; }
    const minuteur = setTimeout(() => charger(), 600);
    return () => clearTimeout(minuteur);
  }, [actif, charger]);

  const nbPerturbees = (lignes ?? []).filter(l => l.etat !== 'normal').length;
  const sousTitre = lignes === null
    ? 'État du trafic en temps réel'
    : nbPerturbees === 0 ? 'Trafic normal sur toutes les lignes'
    : `${nbPerturbees} ligne${nbPerturbees > 1 ? 's' : ''} perturbée${nbPerturbees > 1 ? 's' : ''}`;

  return (
    <PanelLayout
      icon={<IconInfoTraficCouleur size={26} dotColor={c.text} />}
      title="Info trafic"
      subtitle={sousTitre}
      headerAlign="left"
      headerRight={<PanelIconAction icon={<Icon name="notifications" size={18} color={c.accent} />} label="Alertes trafic" />}
    >
      {lignes === null && !erreur ? (
        <Squelette couleur={c.textSub} />
      ) : lignes === null ? (
        <View style={styles.centre}>
          <PanelEmptyState
            icon={<Icon name="info-trafic" size={44} color={c.textSub} />}
            title="Impossible de charger le trafic"
            description="Vérifie ta connexion, puis réessaie."
          />
          <TouchableOpacity onPress={() => charger(true)} style={[styles.reessayer, { backgroundColor: c.accent }]}>
            <Text style={styles.reessayerTexte}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : lignesAffichees && (
        <ScrollView
          onTouchStart={debutGeste} onTouchMove={mouvementGeste} onTouchEnd={finGeste} onTouchCancel={finGeste}
          onScroll={e => { scrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={64}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={actualise} onRefresh={async () => { setActualise(true); await charger(true); setActualise(false); }} tintColor={c.accent} colors={[c.accent]} />}
        >
          <View style={styles.legende}>
            <View style={[styles.legendePoint, { backgroundColor: COULEUR_ETAT.perturbe! }]} />
            <Text style={[styles.legendeTexte, { color: c.textSub }]}>Perturbé</Text>
            <View style={[styles.legendePoint, { backgroundColor: COULEUR_ETAT.interrompu!, marginLeft: 14 }]} />
            <Text style={[styles.legendeTexte, { color: c.textSub }]}>Interrompu</Text>
          </View>
          {SECTIONS_TRAFIC.map(section => {
            const deSection = lignesAffichees.filter(l => section.modes.includes(l.mode));
            if (deSection.length === 0) return null;
            return (
              <View key={section.cle} style={styles.section}>
                <View style={styles.sectionTitre}>
                  <ExpoImage source={{ uri: MODE_ICONS[section.icone] ?? MODE_ICONS['BUS'] }} style={[styles.sectionIcone, { tintColor: c.textSub }]} contentFit="contain" />
                  <Text style={[styles.sectionTexte, { color: c.textSub }]}>{section.libelle.toUpperCase()}</Text>
                </View>
                <View style={styles.grille}>
                  {deSection.map(l => <Pastille key={l.id} ligne={l} fond={verre ? c.bgCard : c.bg} sombre={isDark} />)}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </PanelLayout>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  squeletteTitre: { height: 12, width: 110, borderRadius: 6, marginLeft: 4, marginBottom: 12 },
  reessayer: { height: 40, borderRadius: 20, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  reessayerTexte: { color: '#fff', fontFamily: 'GrandParis-Bold', fontSize: 14 },
  legende: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 4, marginLeft: 4 },
  legendePoint: { width: 9, height: 9, borderRadius: 4.5, marginRight: 6 },
  legendeTexte: { fontSize: 12, fontFamily: 'GrandParis-Medium' },
  section: { marginTop: 14 },
  sectionTitre: { flexDirection: 'row', alignItems: 'center', marginLeft: 4, marginBottom: 10, gap: 8 },
  sectionIcone: { width: 18, height: 18 },
  sectionTexte: { fontSize: 12, fontFamily: 'GrandParis-Bold', letterSpacing: 0.8 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  // La case est un peu plus grande que le symbole pour que le point d'état, qui dépasse du coin, ne soit pas coupé.
  pastilleCase: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  symbole: { width: 42, height: 42 },
  pastille: { minWidth: 48, height: 32, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  pastilleTexte: { fontSize: 14, fontFamily: 'GrandParis-Bold' },
  pastillePoint: { position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
});
