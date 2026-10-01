import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useColors } from './theme';
import { Icon, IconInfoTraficCouleur } from './Icon';
import { PanelLayout } from './PanelLayout';
import { PanelEmptyState } from './PanelEmptyState';
import { MODE_ICONS } from './modeIcons';
import { chargerTrafic, oublierPerturbations, ORDRE_MODES, LIBELLE_MODE, LigneTrafic, EtatTrafic } from './traficApi';

// Tiroir « Info trafic » — version simple (étape 1 du plan de la 3.4.0) : l'état de chaque ligne
// lourde en un coup d'œil. Pas encore de détail au toucher ni de recherche de bus.
const COULEUR_ETAT: Record<EtatTrafic, string | null> = { normal: null, perturbe: '#F39C12', interrompu: '#E5493E' };

function Pastille({ ligne, fond }: { ligne: LigneTrafic; fond: string }) {
  const point = COULEUR_ETAT[ligne.etat];
  return (
    <View style={styles.pastilleCase}>
      <View style={[styles.pastille, { backgroundColor: '#' + ligne.color }]}>
        <Text style={[styles.pastilleTexte, { color: '#' + ligne.textColor }]} numberOfLines={1}>{ligne.code}</Text>
      </View>
      {point && <View style={[styles.pastillePoint, { backgroundColor: point, borderColor: fond }]} />}
    </View>
  );
}

export default function TraficScreen({ actif, verre }: { actif: boolean; verre?: boolean }) {
  const c = useColors();
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
          {ORDRE_MODES.map(mode => {
            const deMode = lignes.filter(l => l.mode === mode);
            if (deMode.length === 0) return null;
            return (
              <View key={mode} style={styles.section}>
                <View style={styles.sectionTitre}>
                  <ExpoImage source={{ uri: MODE_ICONS[mode] ?? MODE_ICONS['BUS'] }} style={[styles.sectionIcone, { tintColor: c.textSub }]} contentFit="contain" />
                  <Text style={[styles.sectionTexte, { color: c.textSub }]}>{LIBELLE_MODE[mode].toUpperCase()}</Text>
                </View>
                <View style={styles.grille}>
                  {deMode.map(l => <Pastille key={l.id} ligne={l} fond={verre ? c.bgCard : c.bg} />)}
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
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // La case est un peu plus grande que la pastille pour que le point d'état, qui dépasse du coin, ne soit pas coupé.
  pastilleCase: { width: 56, height: 40, alignItems: 'center', justifyContent: 'center' },
  pastille: { minWidth: 48, height: 32, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  pastilleTexte: { fontSize: 14, fontFamily: 'GrandParis-Bold' },
  pastillePoint: { position: 'absolute', top: 1, right: 1, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
});
