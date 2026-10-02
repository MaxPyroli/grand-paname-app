import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useColors, ThemeContext } from './theme';
import { Icon, IconInfoTraficCouleur } from './Icon';
import { PanelLayout } from './PanelLayout';
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

export default function TraficScreen({ actif, verre }: { actif: boolean; verre?: boolean }) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  const [lignes, setLignes] = useState<LigneTrafic[] | null>(null);
  const [erreur, setErreur] = useState(false);
  const [actualise, setActualise] = useState(false);
  const derniere = useRef(0);

  const charger = useCallback(async (forcer = false) => {
    if (forcer) oublierPerturbations();
    setErreur(false);
    try {
      setLignes(await chargerTrafic());
      derniere.current = Date.now();
    } catch {
      setErreur(true);
    }
  }, []);

  // Premier chargement à l'ouverture du tiroir, puis relecture quand on y revient après plus d'une minute.
  useEffect(() => {
    if (actif && Date.now() - derniere.current > 60_000) charger();
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
    >
      {lignes === null && !erreur ? (
        <View style={styles.centre}><ActivityIndicator color={c.accent} /></View>
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
      ) : (
        <ScrollView
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
            const deSection = lignes.filter(l => section.modes.includes(l.mode));
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
