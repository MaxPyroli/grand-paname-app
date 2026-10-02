import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from './theme';
import { Icon } from './Icon';
import { panelCardStyle } from './PanelLayout';
import { PanelEmptyState } from './PanelEmptyState';
import { chargerDetailLigne, DetailLigne, LigneTrafic, NiveauPerturbation, PerturbationLigne, CausePerturbation } from './traficApi';

// Détail d'une ligne du volet Trafic (étape 1.3 du plan de la 3.4.0) : ses perturbations en cours puis à venir,
// en français, venues de Navitia (voir `chargerDetailLigne`).
export const COULEUR_NIVEAU: Record<NiveauPerturbation, string> = { interrompu: '#E5493E', perturbe: '#F39C12', info: '#3C91DC' };
const LIBELLE_CAUSE: Record<CausePerturbation, string> = { travaux: 'Travaux', perturbation: 'Perturbation', information: 'Information' };

function Carte({ p }: { p: PerturbationLigne }) {
  const c = useColors();
  return (
    <View style={[styles.carte, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
      <View style={styles.carteHaut}>
        <View style={styles.cause}>
          <View style={[styles.point, { backgroundColor: COULEUR_NIVEAU[p.niveau] }]} />
          <Text style={[styles.causeTexte, { color: c.textSub }]}>{LIBELLE_CAUSE[p.cause].toUpperCase()}</Text>
        </View>
        <Text style={[styles.periode, { color: c.textSub }]} numberOfLines={1}>{p.periode}</Text>
      </View>
      <Text style={[styles.titre, { color: c.text }]}>{p.titre}</Text>
      {p.texte !== '' && <Text style={[styles.texte, { color: c.textSub }]}>{p.texte}</Text>}
    </View>
  );
}

export default function TraficDetail({ ligne }: { ligne: LigneTrafic }) {
  const c = useColors();
  const [detail, setDetail] = useState<DetailLigne | null>(null);
  const [erreur, setErreur] = useState(false);

  const charger = useCallback(async () => {
    setErreur(false);
    try { setDetail(await chargerDetailLigne(ligne.id)); } catch { setErreur(true); }
  }, [ligne.id]);
  useEffect(() => { charger(); }, [charger]);

  if (erreur) {
    return (
      <View style={styles.centre}>
        <PanelEmptyState
          icon={<Icon name="info-trafic" size={44} color={c.textSub} />}
          title="Impossible de charger la ligne"
          description="Vérifie ta connexion, puis réessaie."
        />
        <TouchableOpacity onPress={charger} style={[styles.reessayer, { backgroundColor: c.accent }]}>
          <Text style={styles.reessayerTexte}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (detail === null) return <View style={styles.centre}><ActivityIndicator color={c.accent} /></View>;
  if (detail.enCours.length === 0 && detail.aVenir.length === 0) {
    return (
      <PanelEmptyState
        icon={<Icon name="valider" size={44} color={c.textSub} />}
        title="Rien à signaler"
        description="Aucune perturbation en cours ni annoncée prochainement sur cette ligne."
      />
    );
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 6, paddingBottom: 24 }}>
      {detail.enCours.length > 0 && <Text style={[styles.section, { color: c.textSub }]}>EN COURS</Text>}
      {detail.enCours.map(p => <Carte key={p.id + p.titre} p={p} />)}
      {detail.aVenir.length > 0 && <Text style={[styles.section, { color: c.textSub, marginTop: detail.enCours.length > 0 ? 10 : 0 }]}>À VENIR</Text>}
      {detail.aVenir.map(p => <Carte key={p.id + p.titre} p={p} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  reessayer: { height: 40, borderRadius: 20, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  reessayerTexte: { color: '#fff', fontFamily: 'GrandParis-Bold', fontSize: 14 },
  section: { fontSize: 12, fontFamily: 'GrandParis-Bold', letterSpacing: 0.8, marginLeft: 4, marginBottom: 10 },
  carte: { ...panelCardStyle, flexDirection: 'column', alignItems: 'stretch', paddingVertical: 14, marginBottom: 10 },
  carteHaut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cause: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  point: { width: 9, height: 9, borderRadius: 4.5 },
  causeTexte: { fontSize: 11, fontFamily: 'GrandParis-Bold', letterSpacing: 0.6 },
  periode: { fontSize: 12, fontFamily: 'GrandParis-Medium', flexShrink: 1, marginLeft: 10 },
  titre: { fontSize: 15, fontFamily: 'GrandParis-Bold', lineHeight: 20 },
  texte: { fontSize: 13, fontFamily: 'GrandParis-Light', lineHeight: 19, marginTop: 6 },
});
