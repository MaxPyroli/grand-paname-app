import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Animated, Easing, InteractionManager, TouchableOpacity, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useColors, ThemeContext } from './theme';
import { Icon, IconInfoTraficCouleur } from './Icon';
import { PanelLayout, PANEL_CONTENT_TOP_PAD } from './PanelLayout';
import { PanelIconAction, PanelPillAction } from './PanelHeader';
import TraficDetail from './TraficDetail';
import { ListeFondue } from './ListeFondue';
import { PanelEmptyState } from './PanelEmptyState';
import { MODE_ICONS } from './modeIcons';
import { chargerTrafic, oublierPerturbations, prechargerDetailLigne, SECTIONS_TRAFIC, LigneTrafic, EtatTrafic } from './traficApi';
import { symboleLigne } from './symbolesLignes';
import { FONDU_BAS } from './Fade';

// Tiroir « Info trafic » — version simple (étape 1 du plan de la 3.4.0) : l'état de chaque ligne
// lourde en un coup d'œil. Pas encore de détail au toucher ni de recherche de bus.
const COULEUR_ETAT: Record<EtatTrafic, string | null> = { normal: null, perturbe: '#F39C12', interrompu: '#E5493E' };

// Symbole officiel de la ligne ; à défaut (ligne inconnue), pastille aux couleurs de la ligne.
// `onPress` ouvre le détail de la ligne ; `onAppui` sert au geste secret (voir plus bas).
function Pastille({ ligne, fond, sombre, onPress, onAppui }: { ligne: LigneTrafic; fond: string; sombre: boolean; onPress?: () => void; onAppui?: (code: string, pose: boolean) => void }) {
  const point = COULEUR_ETAT[ligne.etat];
  const symbole = symboleLigne(ligne.mode, ligne.code, sombre);
  const contenu = (
    <View
      style={styles.pastilleCase}
      {...(onAppui && ligne.mode === 'METRO' && DOIGTS_GPE.includes(ligne.code) ? {
        onTouchStart: () => onAppui(ligne.code, true),
        onTouchEnd: () => onAppui(ligne.code, false),
        onTouchCancel: () => onAppui(ligne.code, false),
      } : null)}
    >
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
  // Le 14 reste devant les lignes de l'easter egg qui sortent de derrière lui.
  const devant = ligne.mode === 'METRO' && ligne.code === '14' ? { zIndex: 2 } : null;
  return onPress ? <TouchableOpacity activeOpacity={0.6} onPress={onPress} onPressIn={() => prechargerDetailLigne(ligne.id)} style={devant}>{contenu}</TouchableOpacity> : <View style={devant}>{contenu}</View>;
}

// « Métro 7 bis », « RER A », « Transilien J », « Tram T3a », « Câble C1 ».
function libelleLigne(l: LigneTrafic): string {
  switch (l.mode) {
    case 'METRO': return 'Métro ' + l.code.replace(/^(\d+)B$/i, '$1 bis');
    case 'RER': return 'RER ' + l.code;
    case 'TRAIN': return 'Transilien ' + l.code;
    case 'TRAM': return 'Tram ' + l.code;
    default: return 'Câble ' + l.code;
  }
}
const LIBELLE_ETAT: Record<EtatTrafic, string> = { normal: 'Trafic normal', perturbe: 'Trafic perturbé', interrompu: 'Trafic interrompu' };

// Easter egg : un appui de 3 secondes sur le symbole du métro 14 fait apparaître (ou disparaître)
// les lignes 15 à 18 du Grand Paris Express parmi les lignes de métro. Pas encore en service : aucun état, juste leur symbole.
const DOIGTS_GPE = ['14'];
const LIGNES_GPE: LigneTrafic[] = ['15', '16', '17', '18'].map(code => ({
  id: 'gpe-' + code, code, color: '888888', textColor: 'FFFFFF', mode: 'METRO', etat: 'normal', nbPerturbations: 0,
}));

// Les lignes de l'easter egg sortent de derrière le métro 14 : chacune part de la case du 14 (décalage `dx`, `dy`
// en pixels), glisse jusqu'à sa place et apparaît en route, l'une après l'autre. Le 14 a un `zIndex` plus haut.
function Apparition({ rang, dx, dy, children }: { rang: number; dx: number; dy: number; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 550, delay: 200 + rang * 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, rang]);
  return (
    <Animated.View style={{
      zIndex: 1,
      opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
      transform: [
        { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
        { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) },
        { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
      ],
    }}>{children}</Animated.View>
  );
}

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

export default function TraficScreen({ actif, verre, retour, onDetail }: { actif: boolean; verre?: boolean; retour?: number; onDetail?: (ouvert: boolean) => void }) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  const [lignes, setLignes] = useState<LigneTrafic[] | null>(null);
  const [erreur, setErreur] = useState(false);
  const derniere = useRef(0);
  const [gpe, setGpe] = useState(false);
  const [ligneOuverte, setLigneOuverte] = useState<LigneTrafic | null>(null);
  const secretFait = useRef(false);
  const [largeurGrille, setLargeurGrille] = useState(0);
  // Geste de l'easter egg : appui long (3 secondes, bien plus long qu'un appui long ordinaire) sur le symbole du métro 14.
  const minuteurGeste = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appuiSymbole = useCallback((_code: string, pose: boolean) => {
    if (minuteurGeste.current) { clearTimeout(minuteurGeste.current); minuteurGeste.current = null; }
    if (pose) {
      secretFait.current = false;
      minuteurGeste.current = setTimeout(() => { minuteurGeste.current = null; secretFait.current = true; setGpe(v => !v); }, 3000);
    }
  }, []);
  useEffect(() => () => { if (minuteurGeste.current) clearTimeout(minuteurGeste.current); }, []);
  // Détail d'une ligne : il glisse par-dessus la liste (qui reste montée, donc ses symboles restent décodés et
  // réapparaissent sans délai au retour) avec le ressort commun des volets. `ligneOuverte` = ligne voulue ;
  // `ligneMontee` = ligne affichée, gardée le temps de l'animation de fermeture.
  const [ligneMontee, setLigneMontee] = useState<LigneTrafic | null>(null);
  const ouverture = useRef(new Animated.Value(0)).current;
  const ouvrirLigne = useCallback((l: LigneTrafic) => {
    // Le toucher qui termine le geste secret (appui de 3 s sur le 14) n'ouvre pas la ligne.
    if (secretFait.current) { secretFait.current = false; return; }
    setLigneMontee(l);
    setLigneOuverte(l);
    ouverture.stopAnimation();
    Animated.spring(ouverture, { toValue: 1, damping: 15, stiffness: 120, mass: 0.5, useNativeDriver: true }).start();
  }, [ouverture]);
  const fermerLigne = useCallback((immediat = false) => {
    setLigneOuverte(null);
    ouverture.stopAnimation();
    if (immediat) { ouverture.setValue(0); setLigneMontee(null); return; }
    Animated.spring(ouverture, { toValue: 0, damping: 15, stiffness: 120, mass: 0.5, overshootClamping: true, useNativeDriver: true })
      .start(({ finished }) => { if (finished) setLigneMontee(null); });
  }, [ouverture]);
  // Le volet qu'on referme revient à la liste (une fois l'animation de fermeture du volet finie).
  useEffect(() => {
    if (actif) return;
    const minuteur = setTimeout(() => fermerLigne(true), 500);
    return () => clearTimeout(minuteur);
  }, [actif, fermerLigne]);
  // Toucher l'onglet Trafic alors qu'on est dans le détail d'une ligne ramène au menu principal.
  useEffect(() => { onDetail?.(ligneOuverte !== null); }, [ligneOuverte, onDetail]);
  const retourVu = useRef(retour);
  useEffect(() => {
    if (retourVu.current === retour) return;
    retourVu.current = retour;
    fermerLigne();
  }, [retour, fermerLigne]);

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

  // Actualisation automatique toutes les minutes tant que le volet est ouvert (silencieuse : les données affichées restent).
  useEffect(() => {
    if (!actif) return;
    const repetition = setInterval(() => charger(true, true), 60_000);
    return () => clearInterval(repetition);
  }, [actif, charger]);

  // Les lignes perturbées sont les plus souvent ouvertes : leur détail est chargé à l'avance, une à une, quand le
  // volet est ouvert (une seule fois par ouverture ; les autres lignes sont préchargées au toucher).
  const prechauffe = useRef(false);
  useEffect(() => {
    if (!actif) { prechauffe.current = false; return; }
    if (!lignes || prechauffe.current) return;
    prechauffe.current = true;
    const aCharger = lignes.filter(l => l.etat !== 'normal');
    const minuteurs = aCharger.map((l, i) => setTimeout(() => prechargerDetailLigne(l.id), 800 + i * 350));
    return () => minuteurs.forEach(clearTimeout);
  }, [actif, lignes]);

  const nbPerturbees = (lignes ?? []).filter(l => l.etat !== 'normal').length;
  const sousTitre = lignes === null
    ? 'État du trafic en temps réel'
    : nbPerturbees === 0 ? 'Trafic normal sur toutes les lignes'
    : `${nbPerturbees} ligne${nbPerturbees > 1 ? 's' : ''} perturbée${nbPerturbees > 1 ? 's' : ''}`;

  return (
    <PanelLayout
      icon={ligneOuverte
        ? <ExpoImage source={{ uri: symboleLigne(ligneOuverte.mode, ligneOuverte.code, isDark) ?? '' }} style={{ width: 30, height: 30 }} contentFit="contain" />
        : <IconInfoTraficCouleur size={26} dotColor={c.text} />}
      title={ligneOuverte ? libelleLigne(ligneOuverte) : 'Info trafic'}
      subtitle={ligneOuverte ? LIBELLE_ETAT[ligneOuverte.etat] : sousTitre}
      headerAlign="left"
      headerRight={ligneOuverte
        ? <PanelPillAction label="Retour" onPress={() => fermerLigne()} />
        : <PanelIconAction icon={<Icon name="notifications" size={18} color={c.accent} />} label="Alertes trafic" />}
    >
      <View style={{ flex: 1 }}>
        <Animated.View
          style={{ flex: 1, opacity: ouverture.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' }), transform: [{ translateX: ouverture.interpolate({ inputRange: [0, 1], outputRange: [0, -28], extrapolate: 'clamp' }) }] }}
          pointerEvents={ligneOuverte ? 'none' : 'auto'}
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
        <ListeFondue verre={verre}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 8, paddingTop: PANEL_CONTENT_TOP_PAD, paddingBottom: FONDU_BAS + 16 }}
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
                <View style={styles.grille} onLayout={e => setLargeurGrille(e.nativeEvent.layout.width)}>
                  {deSection.map((l, i) => {
                    const pastille = <Pastille key={l.id} ligne={l} fond={verre ? c.bgCard : c.bg} sombre={isDark} onPress={l.id.startsWith('gpe-') ? undefined : () => ouvrirLigne(l)} onAppui={appuiSymbole} />;
                    if (!l.id.startsWith('gpe-')) return pastille;
                    // Position (colonne, rangée) de chaque case dans la grille à cases de 50 px espacées de 6 px.
                    const colonnes = largeurGrille > 0 ? Math.max(1, Math.floor((largeurGrille + 6) / 56)) : 6;
                    const i14 = deSection.findIndex(x => x.mode === 'METRO' && x.code === '14');
                    const dx = ((i14 % colonnes) - (i % colonnes)) * 56;
                    const dy = (Math.floor(i14 / colonnes) - Math.floor(i / colonnes)) * 56;
                    return <Apparition key={l.id} rang={+l.code - 15} dx={dx} dy={dy}>{pastille}</Apparition>;
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
        </ListeFondue>
      )}
        </Animated.View>
        {ligneMontee && (
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: ouverture.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }), transform: [{ translateX: ouverture.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) }] }]}
            pointerEvents={ligneOuverte ? 'auto' : 'none'}
          >
            <TraficDetail key={ligneMontee.id} ligne={ligneMontee} verre={verre} />
          </Animated.View>
        )}
      </View>
    </PanelLayout>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  squeletteTitre: { height: 12, width: 110, borderRadius: 6, marginLeft: 4, marginBottom: 12 },
  reessayer: { height: 40, borderRadius: 20, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  reessayerTexte: { color: '#fff', fontFamily: 'GrandParis-Bold', fontSize: 14 },
  legende: { flexDirection: 'row', alignItems: 'center', marginTop: 0, marginBottom: 4, marginLeft: 4 },
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
