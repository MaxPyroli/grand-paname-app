import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Animated, Easing, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from './theme';
import { Icon } from './Icon';
import { panelCardStyle, PANEL_CONTENT_TOP_PAD } from './PanelLayout';
import { ListeFondue } from './ListeFondue';
import { FONDU_BAS, hexToRgba } from './Fade';
import { decouperSurligne } from './traficTexte';
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
      {p.texte !== '' && (
        <Text style={[styles.texte, { color: c.textSub }]}>
          {/* Noms de stations, dates et horaires : entourés d'un contour arrondi (vues dans le texte). */}
          {decouperSurligne(p.texte).map((seg, i) => seg.type === 'texte' ? seg.texte : (
            <View key={i} style={[styles.puce, { borderColor: seg.type === 'station' ? c.accent : hexToRgba(c.text, 0.4) }]}>
              <Text style={[styles.puceTexte, { color: c.text }]}>{seg.texte}</Text>
            </View>
          ))}
        </Text>
      )}
    </View>
  );
}

// Squelette pendant le chargement : trois cartes grises qui pulsent, à la place des perturbations.
function SqueletteDetail({ couleur }: { couleur: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const boucle = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    boucle.start();
    return () => boucle.stop();
  }, [pulse]);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.2] });
  const bloc = (largeur: string | number, hauteur: number, marge = 0) => (
    <Animated.View style={{ width: largeur as any, height: hauteur, borderRadius: 6, backgroundColor: couleur, opacity, marginTop: marge }} />
  );
  return (
    <View style={{ paddingTop: PANEL_CONTENT_TOP_PAD }} pointerEvents="none">
      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.carte, { borderColor: 'transparent' }]}>
          {bloc(90, 10)}{bloc('85%', 14, 12)}{bloc('100%', 11, 12)}{bloc('70%', 11, 7)}
        </View>
      ))}
    </View>
  );
}

export default function TraficDetail({ ligne, verre }: { ligne: LigneTrafic; verre?: boolean }) {
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
  if (detail === null) return <SqueletteDetail couleur={c.textSub} />;
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
    <ListeFondue verre={verre}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingTop: PANEL_CONTENT_TOP_PAD, paddingBottom: FONDU_BAS + 16 }}>
      {detail.enCours.length > 0 && <Text style={[styles.section, { color: c.textSub }]}>EN COURS</Text>}
      {detail.enCours.map(p => <Carte key={p.id + p.titre} p={p} />)}
      {detail.aVenir.length > 0 && <Text style={[styles.section, { color: c.textSub, marginTop: detail.enCours.length > 0 ? 10 : 0 }]}>À VENIR</Text>}
      {detail.aVenir.map(p => <Carte key={p.id + p.titre} p={p} />)}
    </ScrollView>
    </ListeFondue>
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
  texte: { fontSize: 13, fontFamily: 'GrandParis-Light', lineHeight: 24, marginTop: 6 },
  puce: { height: 22, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 6, marginHorizontal: 1, justifyContent: 'center' },
  puceTexte: { fontSize: 12.5, fontFamily: 'GrandParis-Bold', includeFontPadding: false },
});
