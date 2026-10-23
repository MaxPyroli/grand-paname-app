import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Animated, Easing, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from './theme';
import { Icon } from './Icon';
import { panelCardStyle, PANEL_CONTENT_TOP_PAD } from './PanelLayout';
import { ListeFondue } from './ListeFondue';
import { FONDU_BAS, hexToRgba } from './Fade';
import { decouperSurligne, creerAnalyseStations, AnalyseStations } from './traficTexte';
import { PanelEmptyState } from './PanelEmptyState';
import { chargerDetailLigne, oublierDetailLigne, detailEnCache, DetailLigne, LigneTrafic, PerturbationLigne, CausePerturbation, TypePerturbation } from './traficApi';

// Détail d'une ligne du volet Trafic (étape 1.3 du plan de la 3.4.0) : ses perturbations en cours puis à venir,
// en français, venues de Navitia (voir `chargerDetailLigne`).
// Une couleur et un libellé par nature de perturbation (voir `TypePerturbation`) ; la cause (travaux / incident) est
// rappelée à part, dans une petite pastille.
export const COULEUR_TYPE: Record<TypePerturbation, string> = { interrompu: '#E5493E', perturbe: '#F39C12', info: '#3C91DC' };
const LIBELLE_TYPE: Record<TypePerturbation, string> = { interrompu: 'Trafic interrompu', perturbe: 'Trafic perturbé', info: 'Information' };
const LIBELLE_CAUSE: Record<CausePerturbation, string> = { travaux: 'Travaux', perturbation: 'Incident', information: 'Info' };

type Mot = { texte: string; puce: 'station' | 'quand' | null; espace: boolean };

// Texte d'une perturbation avec un contour arrondi autour des noms de stations, des dates et des horaires.
// Un paragraphe sans contour reste un simple texte (retour à la ligne naturel). Un paragraphe avec contours est posé
// mot à mot dans une rangée qui passe à la ligne : les contours sont alors alignés sur les mots de façon sûre
// (des vues glissées dans un texte se décalent selon la police et la ligne). L'espace entre deux mots est une marge
// à DROITE du premier : une marge à gauche décalait de 4 px tout contour qui commence une ligne.
function TexteRiche({ texte, analyse }: { texte: string; analyse: AnalyseStations }) {
  const c = useColors();
  return (
    <View style={{ marginTop: 6 }}>
      {texte.split('\n').filter(l => l.trim() !== '').map((paragraphe, i) => {
        const segments = decouperSurligne(paragraphe, analyse);
        const espace = i > 0 ? { marginTop: 4 } : null;
        if (!segments.some(s => s.type !== 'texte')) {
          return <Text key={i} style={[styles.texte, { color: c.textSub }, espace]}>{paragraphe}</Text>;
        }
        const mots: Mot[] = [];
        let blanc = false;
        for (const seg of segments) {
          if (seg.type === 'texte') {
            for (const morceau of seg.texte.match(/\S+|\s+/g) ?? []) {
              if (/^\s+$/.test(morceau)) blanc = true;
              else { mots.push({ texte: morceau, puce: null, espace: blanc }); blanc = false; }
            }
          } else {
            mots.push({ texte: seg.texte.trim(), puce: seg.type, espace: blanc });
            blanc = false;
          }
        }
        return (
          <View key={i} style={[styles.rangee, espace]}>
            {mots.map((m, j) => m.puce ? (
              <View key={j} style={[styles.puce, { marginRight: mots[j + 1]?.espace ? 4 : 0, borderColor: m.puce === 'station' ? c.accent : hexToRgba(c.text, 0.4) }]}>
                <Text style={[styles.puceTexte, { color: c.text }]}>{m.texte}</Text>
              </View>
            ) : (
              <Text key={j} style={[styles.texte, { color: c.textSub, marginRight: mots[j + 1]?.espace ? 4 : 0 }]}>{m.texte}</Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function Carte({ p, analyse }: { p: PerturbationLigne; analyse: AnalyseStations }) {
  const c = useColors();
  return (
    <View style={[styles.carte, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
      <View style={styles.carteHaut}>
        <View style={styles.cause}>
          <View style={[styles.point, { backgroundColor: COULEUR_TYPE[p.type] }]} />
          <Text style={[styles.causeTexte, { color: COULEUR_TYPE[p.type] }]}>
            {LIBELLE_TYPE[p.type].toUpperCase()}
          </Text>
        </View>
        {/* La cause n'est rappelée que si elle apporte quelque chose (« Information » + type Information = doublon). */}
        {!(p.cause === 'information' && p.type === 'info') && (
          <View style={[styles.pastilleCause, { borderColor: hexToRgba(c.text, 0.3) }]}>
            <Text style={[styles.pastilleCauseTexte, { color: c.textSub }]}>{LIBELLE_CAUSE[p.cause]}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.periode, { color: c.textSub }]}>{p.periode}</Text>
      <Text style={[styles.titre, { color: c.text }]}>{p.titre}</Text>
      {p.texte !== '' && <TexteRiche texte={p.texte} analyse={analyse} />}
    </View>
  );
}

// Squelette pendant le chargement : trois cartes grises qui pulsent, à la place des perturbations.
function SqueletteDetail() {
  const c = useColors();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const boucle = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    boucle.start();
    return () => boucle.stop();
  }, [pulse]);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  // Barres grises neutres (le texte à 14 % d'opacité) qui pulsent ; les cartes ont le même fond et le même bord que les
  // vraies cartes (une carte sans fond mais avec ombre dessinait un contour étrange).
  const bloc = (largeur: string | number, hauteur: number, marge = 0) => (
    <Animated.View style={{ width: largeur as any, height: hauteur, borderRadius: 6, backgroundColor: hexToRgba(c.text, 0.14), opacity, marginTop: marge }} />
  );
  return (
    <View style={{ paddingTop: PANEL_CONTENT_TOP_PAD }} pointerEvents="none">
      {[0, 1, 2].map(i => (
        // Sans ombre : une ombre (élévation) sous une couche qui s'estompe se dessine comme un halo sale sur Android.
        <View key={i} style={[styles.carte, { backgroundColor: c.bgCard, borderColor: c.borderCard, shadowOpacity: 0, elevation: 0 }]}>
          {bloc(90, 10)}{bloc('85%', 14, 12)}{bloc('100%', 11, 12)}{bloc('70%', 11, 7)}
        </View>
      ))}
    </View>
  );
}

export default function TraficDetail({ ligne, verre, pret = true }: { ligne: LigneTrafic; verre?: boolean; pret?: boolean }) {
  const c = useColors();
  // Données déjà là (préchargées, ou ligne déjà ouverte) : affichées dès le premier rendu, sans écran de chargement.
  const [detail, setDetail] = useState<DetailLigne | null>(() => detailEnCache(ligne.id));
  const [erreur, setErreur] = useState(false);
  // Pas encore de données : le squelette est visible dès l'ouverture (l'écran glisse avec ses cases grises), puis il
  // s'efface en fondu pendant que le contenu apparaît (pas de blanc, pas de bascule sèche). Données déjà en mémoire :
  // pas de squelette. Le contenu part toujours de transparent (160-200 ms), même depuis la mémoire : si le téléphone
  // réutilise une vue de la ligne précédente, son ancien contenu n'est jamais visible.
  const apparition = useRef(new Animated.Value(0)).current;
  // `pret` : l'écran a fini de glisser. Le contenu (beaucoup de petites vues) n'est monté qu'à ce moment-là, sinon son
  // montage fait saccader le glissement ; le squelette occupe la place pendant ce temps.
  const [squeletteRetire, setSqueletteRetire] = useState(false);
  const contenuPret = pret && detail !== null;
  useEffect(() => {
    if (!contenuPret) return;
    Animated.timing(apparition, { toValue: 1, duration: 220, useNativeDriver: true })
      .start(() => setSqueletteRetire(true));
  }, [contenuPret, apparition]);
  const analyse = useMemo(() => creerAnalyseStations(detail?.stations ?? []), [detail]);

  const charger = useCallback(async () => {
    setErreur(false);
    try {
      let d = await chargerDetailLigne(ligne.id);
      // Une ligne perturbée sans aucune perturbation dans le détail est suspecte (réponse incomplète du serveur) :
      // on la relit une fois avant de conclure qu'il n'y a rien à signaler.
      if (ligne.etat !== 'normal' && d.enCours.length === 0 && d.aVenir.length === 0) {
        oublierDetailLigne(ligne.id);
        await new Promise(res => setTimeout(res, 1200));
        d = await chargerDetailLigne(ligne.id);
      }
      setDetail(d);
    } catch { setErreur(true); }
  }, [ligne.id, ligne.etat]);
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
  const vide = detail !== null && detail.enCours.length === 0 && detail.aVenir.length === 0;
  return (
    <View style={{ flex: 1 }}>
      {!squeletteRetire && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: apparition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} pointerEvents="none">
          <SqueletteDetail />
        </Animated.View>
      )}
      {contenuPret && detail !== null && (
        <Animated.View style={{ flex: 1, opacity: apparition }}>
          {vide ? (
            <PanelEmptyState
              icon={<Icon name="valider" size={44} color={c.textSub} />}
              title="Rien à signaler"
              description="Aucune perturbation en cours ni annoncée prochainement sur cette ligne."
            />
          ) : (
            <ListeFondue verre={verre}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingTop: PANEL_CONTENT_TOP_PAD, paddingBottom: FONDU_BAS + 16 }}>
                {detail.enCours.length > 0 && <Text style={[styles.section, { color: c.textSub }]}>EN COURS</Text>}
                {detail.enCours.map(p => <Carte key={p.id + p.titre} p={p} analyse={analyse} />)}
                {detail.aVenir.length > 0 && <Text style={[styles.section, { color: c.textSub, marginTop: detail.enCours.length > 0 ? 10 : 0 }]}>PLUS TARD</Text>}
                {detail.aVenir.map(p => <Carte key={p.id + p.titre} p={p} analyse={analyse} />)}
              </ScrollView>
            </ListeFondue>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  reessayer: { height: 40, borderRadius: 20, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  reessayerTexte: { color: '#fff', fontFamily: 'GrandParis-Bold', fontSize: 14 },
  section: { fontSize: 12, fontFamily: 'GrandParis-Bold', letterSpacing: 0.8, marginLeft: 4, marginBottom: 10 },
  carte: { ...panelCardStyle, flexDirection: 'column', alignItems: 'stretch', paddingVertical: 14, marginBottom: 10 },
  carteHaut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cause: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  point: { width: 9, height: 9, borderRadius: 4.5 },
  causeTexte: { fontSize: 11, fontFamily: 'GrandParis-Bold', letterSpacing: 0.6, flexShrink: 1 },
  periode: { fontSize: 12, fontFamily: 'GrandParis-Medium', marginBottom: 6 },
  pastilleCause: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, height: 20, justifyContent: 'center', marginLeft: 8, flexShrink: 0 },
  pastilleCauseTexte: { fontSize: 11, fontFamily: 'GrandParis-Medium', includeFontPadding: false },
  titre: { fontSize: 15, fontFamily: 'GrandParis-Bold', lineHeight: 20 },
  texte: { fontSize: 13, fontFamily: 'GrandParis-Light', lineHeight: 24 },
  rangee: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  puce: { height: 22, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 6, justifyContent: 'center' },
  puceTexte: { fontSize: 12.5, fontFamily: 'GrandParis-Bold', includeFontPadding: false },
});
