import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { memo } from 'react';
import { View, Text, FlatList, Animated, Easing, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from './theme';
import { Icon } from './Icon';
import { panelCardStyle, PANEL_CONTENT_TOP_PAD } from './PanelLayout';
import { ListeFondue } from './ListeFondue';
import { FONDU_BAS, hexToRgba } from './Fade';
import { decouperSurligne, creerAnalyseStations, AnalyseStations } from './traficTexte';
import { PanelEmptyState } from './PanelEmptyState';
import { effacerNotificationsLigne, type AlerteRecue } from './notifications';
import { detailGPE } from './gpe';
import { chargerDetailLigne, libelleMiseAJour, oublierDetailLigne, detailEnCache, DetailLigne, LigneTrafic, PerturbationLigne, CausePerturbation, TypePerturbation } from './traficApi';

// Détail d'une ligne du volet Trafic (étape 1.3 du plan de la 3.4.0) : ses perturbations en cours puis à venir,
// en français, venues de Navitia (voir `chargerDetailLigne`).
// Une couleur et un libellé par nature de perturbation (voir `TypePerturbation`) ; la cause (travaux / incident) est
// rappelée à part, dans une petite pastille.
export const COULEUR_TYPE: Record<TypePerturbation, string> = { interrompu: '#E5493E', perturbe: '#F39C12', info: '#3C91DC' };
const LIBELLE_TYPE: Record<TypePerturbation, string> = { interrompu: 'Trafic interrompu', perturbe: 'Trafic perturbé', info: 'Information' };
const COULEUR_TERMINEE = '#2E9E5B';
const LIBELLE_CAUSE: Record<CausePerturbation, string> = { travaux: 'Travaux', perturbation: 'Incident', information: 'Info' };

const CARTES_IMMEDIATES = 3;      // de quoi remplir l'écran : le reste attend la fin du glissement
const DUREE_APPARITION_MS = 130;

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

const Carte = memo(function Carte({ p, analyse }: { p: PerturbationLigne; analyse: AnalyseStations }) {
  const c = useColors();
  // Annonce notifiée puis terminée : même carte, mais bien marquée « terminée » (vert, coche), sans période.
  if (p.terminee) {
    return (
      <View style={[styles.carte, { backgroundColor: c.bgCard, borderColor: COULEUR_TERMINEE }]}>
        <View style={styles.carteHaut}>
          <View style={styles.cause}>
            <Icon name="valider" size={14} color={COULEUR_TERMINEE} />
            <Text style={[styles.causeTexte, { color: COULEUR_TERMINEE }]}>TERMINÉE</Text>
          </View>
          <View style={[styles.pastilleCause, { borderColor: hexToRgba(c.text, 0.3) }]}>
            <Text style={[styles.pastilleCauseTexte, { color: c.textSub }]}>{LIBELLE_TYPE[p.type]}</Text>
          </View>
        </View>
        <Text style={[styles.periode, { color: c.textSub }]}>Cette perturbation est terminée.</Text>
        <Text style={[styles.titre, { color: c.text }]}>{p.titre}</Text>
        {p.texte !== '' && <TexteRiche texte={p.texte} analyse={analyse} />}
        {p.miseAJour !== null && <Text style={[styles.miseAJour, { color: c.textSub }]}>{libelleMiseAJour(p.miseAJour, 'Notifiée')}</Text>}
      </View>
    );
  }
  return (
    <View style={[styles.carte, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
      <View style={styles.carteHaut}>
        {/* Travaux : MÊME signe que dans la liste (rond noir à centre jaune) et libellé « TRAVAUX » ; la gravité (interrompu /
            perturbé) passe dans la pastille de droite. Les autres causes gardent la couleur de leur type. */}
        {p.cause === 'travaux' ? (
          <>
            <View style={styles.cause}>
              <View style={[styles.point, styles.pointTravaux, { borderWidth: 1, borderColor: hexToRgba(c.text, 0.35) }]}><View style={styles.pointTravauxCentre} /></View>
              <Text style={[styles.causeTexte, { color: c.text }]}>TRAVAUX</Text>
            </View>
            <View style={[styles.pastilleCause, { borderColor: COULEUR_TYPE[p.type] }]}>
              <Text style={[styles.pastilleCauseTexte, { color: COULEUR_TYPE[p.type] }]}>{LIBELLE_TYPE[p.type]}</Text>
            </View>
          </>
        ) : (
          <>
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
          </>
        )}
      </View>
      <Text style={[styles.periode, { color: c.textSub }]}>{p.periode}</Text>
      <Text style={[styles.titre, { color: c.text }]}>{p.titre}</Text>
      {p.texte !== '' && <TexteRiche texte={p.texte} analyse={analyse} />}
      {p.miseAJour !== null && <Text style={[styles.miseAJour, { color: c.textSub }]}>{libelleMiseAJour(p.miseAJour)}</Text>}
    </View>
  );
});

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

export default function TraficDetail({ ligne, alerte = null, verre, pret = true }: { ligne: LigneTrafic; alerte?: AlerteRecue | null; verre?: boolean; pret?: boolean }) {
  const c = useColors();
  // Données déjà là (préchargées, ou ligne déjà ouverte) : affichées dès le premier rendu, sans écran de chargement.
  const [detail, setDetail] = useState<DetailLigne | null>(() => ligne.id.startsWith('gpe-') ? detailGPE(ligne.code) : detailEnCache(ligne.id));
  const [erreur, setErreur] = useState(false);
  // Onglet choisi par l'utilisateur ; tant qu'il n'a rien choisi : « En cours » s'il y en a, sinon « Plus tard ».
  const [ongletChoisi, setOngletChoisi] = useState<'enCours' | 'plusTard' | null>(null);
  // Les deux listes (« En cours » et « Plus tard ») restent MONTÉES en permanence, l'une au-dessus de l'autre : changer
  // d'onglet ne reconstruit rien (plus de clignotement, le défilement de chaque onglet est gardé), la liste choisie
  // glisse simplement en place pendant que l'autre s'efface. `position` : 0 = « En cours », 1 = « Plus tard ».
  const position = useRef(new Animated.Value(0)).current;
  const changerOnglet = (cle: 'enCours' | 'plusTard') => {
    if (cle === onglet) return;
    setOngletChoisi(cle);
    Animated.timing(position, { toValue: cle === 'plusTard' ? 1 : 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  // Pas encore de données : le squelette est visible dès l'ouverture (l'écran glisse avec ses cases grises), puis il
  // s'efface en fondu pendant que le contenu apparaît (pas de blanc, pas de bascule sèche). Données déjà en mémoire :
  // pas de squelette, les premières cartes arrivent avec le glissement. Le contenu part toujours de transparent, même
  // depuis la mémoire : si le téléphone réutilise une vue de la ligne précédente, son ancien contenu n'est jamais visible.
  const apparition = useRef(new Animated.Value(0)).current;
  const [squeletteRetire, setSqueletteRetire] = useState(() => detail !== null);
  // `pret` : l'écran a fini de glisser. Le contenu complet (beaucoup de petites vues) n'est monté qu'à ce moment-là,
  // sinon son montage fait saccader le glissement. AVANT, on ne monte que le visible : les premières cartes de
  // « En cours » (`CARTES_IMMEDIATES`), dès que les données sont là, sans attendre la fin du mouvement.
  // Une fois complet, il le reste tant que cette vue existe : si on rouvre la même ligne pendant que la vue se referme
  // (elle n'est pas démontée), `pret` repasse à faux.
  const [dejaPret, setDejaPret] = useState(pret);
  useEffect(() => { if (pret) setDejaPret(true); }, [pret]);
  const complet = pret || dejaPret;
  const contenuPret = detail !== null;
  useEffect(() => {
    if (!contenuPret) return;
    Animated.timing(apparition, { toValue: 1, duration: DUREE_APPARITION_MS, useNativeDriver: true })
      .start(() => setSqueletteRetire(true));
  }, [contenuPret, apparition]);
  // Perturbations affichées = vues : les notifications de cette ligne n'ont plus lieu d'être.
  useEffect(() => { if (contenuPret) effacerNotificationsLigne(ligne); }, [contenuPret, ligne.id]);
  const analyse = useMemo(() => creerAnalyseStations(detail?.stations ?? []), [detail]);

  const charger = useCallback(async () => {
    if (ligne.id.startsWith('gpe-')) return;   // ligne pas encore en service : rien à demander au serveur
    setErreur(false);
    try {
      let d = await chargerDetailLigne(ligne.id);
      // Une ligne perturbée sans aucune perturbation dans le détail est suspecte (réponse incomplète du serveur) :
      // on la relit une fois avant de conclure qu'il n'y a rien à signaler.
      if ((ligne.etat === 'perturbe' || ligne.etat === 'interrompu') && d.enCours.length === 0 && d.aVenir.length === 0) {
        oublierDetailLigne(ligne.id);
        await new Promise(res => setTimeout(res, 500));
        d = await chargerDetailLigne(ligne.id);
      }
      setDetail(d);
    } catch { setErreur(true); }
  }, [ligne.id, ligne.etat]);
  useEffect(() => { charger(); }, [charger]);

  // TOUJOURS deux onglets (« En cours » / « Plus tard »), même pour une ligne sans aucune perturbation (demande de l'utilisateur) :
  // même présentation pour toutes les lignes. Un onglet vide dit ce qu'il en est.
  const deuxOnglets = detail !== null;
  const onglet: 'enCours' | 'plusTard' = ongletChoisi ?? 'enCours';
  // Listes à plat (titres + cartes) pour la virtualisation. Un seul type de perturbation : pas d'onglets, titre de section.
  // Arrivée par une notification : si l'alerte touchée ne figure plus dans les perturbations, elle est terminée ; elle
  // s'affiche alors en tête de « En cours », marquée « terminée ». Depuis le menu Info trafic (aucune alerte), rien de tel.
  const alertesRecues = useMemo<PerturbationLigne[]>(() => {
    if (!detail || !alerte || alerte.ligneId !== ligne.id) return [];
    const norme = (t: string) => t.replace(/\s+/g, '').toLowerCase();
    const actuelles = new Set([...detail.enCours, ...detail.aVenir].map(p => norme(p.titre)));
    if (actuelles.has(norme(alerte.titre))) return [];
    return [{
      id: 'terminee-' + alerte.id, titre: alerte.titre, texte: alerte.detail === alerte.titre ? '' : alerte.detail, cause: 'perturbation' as const,
      niveau: alerte.niveau, type: alerte.niveau, enCours: false, debut: alerte.recueLe, fin: alerte.recueLe, periode: '', miseAJour: alerte.recueLe, terminee: true,
    }];
  }, [detail, alerte, ligne.id]);
  const elementsEnCours = useMemo(() => {
    if (!detail) return [];
    const l: { cle: string; p?: PerturbationLigne; titre?: string }[] = [];
    alertesRecues.forEach(p => l.push({ cle: p.id, p }));
    detail.enCours.forEach(p => l.push({ cle: 'e-' + p.id + p.titre, p }));
    return l;
  }, [detail, deuxOnglets, alertesRecues]);
  const elementsPlusTard = useMemo(() => {
    if (!detail) return [];
    const l: { cle: string; p?: PerturbationLigne; titre?: string; espace?: boolean }[] = [];
    detail.aVenir.forEach(p => l.push({ cle: 'a-' + p.id + p.titre, p }));
    return l;
  }, [detail, deuxOnglets]);
  const liste = (donnees: { cle: string; p?: PerturbationLigne; titre?: string; espace?: boolean }[], vide?: { titre: string; texte: string }) => (
    <ListeFondue verre={verre}>
      {/* Liste VIRTUALISÉE : une ligne comme le RER C compte ~30 cartes (des dizaines de petites vues chacune) ; les
          dessiner toutes d'un coup rendait le défilement saccadé. Seules les cartes proches de l'écran existent. */}
      <FlatList
        data={donnees}
        keyExtractor={e => e.cle}
        renderItem={({ item }) => item.p
          ? <Carte p={item.p} analyse={analyse} />
          : <Text style={[styles.section, { color: c.textSub, marginTop: item.espace ? 10 : 0 }]}>{item.titre}</Text>}
        showsVerticalScrollIndicator={false}
        initialNumToRender={4}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={40}
        windowSize={5}
        removeClippedSubviews
        ListEmptyComponent={vide ? (
          <View style={styles.videOnglet}>
            <Icon name="valider" size={34} color={c.textSub} />
            <Text style={[styles.videTitre, { color: c.text }]}>{vide.titre}</Text>
            <Text style={[styles.videTexte, { color: c.textSub }]}>{vide.texte}</Text>
          </View>
        ) : null}
        contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 10, paddingBottom: FONDU_BAS + 16, flexGrow: 1 }}
      />
    </ListeFondue>
  );

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
  return (
    <View style={{ flex: 1 }}>
      {!squeletteRetire && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: apparition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} pointerEvents="none">
          <SqueletteDetail />
        </Animated.View>
      )}
      {contenuPret && detail !== null && (
        <Animated.View style={{ flex: 1, opacity: apparition }}>
          {(
            <>
            {deuxOnglets && (
              <View style={styles.onglets}>
                {([['enCours', 'En cours', detail.enCours.length], ['plusTard', 'Plus tard', detail.aVenir.length]] as const).map(([cle, libelle, n]) => {
                  const actif = onglet === cle;
                  return (
                    <TouchableOpacity
                      key={cle}
                      activeOpacity={0.7}
                      onPress={() => changerOnglet(cle)}
                      style={[styles.onglet, { backgroundColor: actif ? c.accent : hexToRgba(c.text, 0.08) }]}
                    >
                      <Text style={[styles.ongletTexte, { color: actif ? '#fff' : c.textSub }]}>{libelle} · {n}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {deuxOnglets ? (
              <View style={{ flex: 1 }}>
                <Animated.View
                  needsOffscreenAlphaCompositing
                  pointerEvents={onglet === 'enCours' ? 'auto' : 'none'}
                  style={[StyleSheet.absoluteFill, {
                    opacity: position.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                    transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [0, -28] }) }],
                  }]}
                >{liste(complet ? elementsEnCours : elementsEnCours.slice(0, CARTES_IMMEDIATES), { titre: 'Rien en cours', texte: 'Aucune perturbation en cours sur cette ligne.' })}</Animated.View>
                <Animated.View
                  needsOffscreenAlphaCompositing
                  pointerEvents={onglet === 'plusTard' ? 'auto' : 'none'}
                  style={[StyleSheet.absoluteFill, {
                    opacity: position,
                    transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
                  }]}
                >{(complet || onglet === 'plusTard') && liste(elementsPlusTard, { titre: "Rien d'annoncé", texte: 'Aucune perturbation annoncée prochainement sur cette ligne.' })}</Animated.View>
              </View>
            ) : null}
            </>
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
  videOnglet: { alignItems: 'center', justifyContent: 'center', paddingTop: 48, paddingHorizontal: 24, gap: 8 },
  videTitre: { fontSize: 16, fontFamily: 'GrandParis-Bold', textAlign: 'center' },
  videTexte: { fontSize: 13, fontFamily: 'GrandParis-Light', textAlign: 'center', lineHeight: 20 },
  onglets: { flexDirection: 'row', gap: 8, paddingTop: PANEL_CONTENT_TOP_PAD, paddingLeft: 4 },
  onglet: { height: 32, borderRadius: 16, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  ongletTexte: { fontSize: 13, fontFamily: 'GrandParis-Medium', includeFontPadding: false },
  section: { fontSize: 12, fontFamily: 'GrandParis-Bold', letterSpacing: 0.8, marginLeft: 4, marginBottom: 10 },
  carte: { ...panelCardStyle, flexDirection: 'column', alignItems: 'stretch', paddingVertical: 14, marginBottom: 10 },
  carteHaut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cause: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  point: { width: 9, height: 9, borderRadius: 4.5 },
  pointTravaux: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  pointTravauxCentre: { width: 5.5, height: 5.5, borderRadius: 2.75, backgroundColor: '#FFC400' },
  causeTexte: { fontSize: 11, fontFamily: 'GrandParis-Bold', letterSpacing: 0.6, flexShrink: 1 },
  periode: { fontSize: 12, fontFamily: 'GrandParis-Medium', marginBottom: 6 },
  miseAJour: { fontSize: 10, fontFamily: 'GrandParis-Light', marginTop: 6, alignSelf: 'flex-end', opacity: 0.7 },
  pastilleCause: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, height: 20, justifyContent: 'center', marginLeft: 8, flexShrink: 0 },
  pastilleCauseTexte: { fontSize: 11, fontFamily: 'GrandParis-Medium', includeFontPadding: false },
  titre: { fontSize: 15, fontFamily: 'GrandParis-Bold', lineHeight: 20 },
  texte: { fontSize: 13, fontFamily: 'GrandParis-Light', lineHeight: 24 },
  rangee: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  puce: { height: 22, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 6, justifyContent: 'center' },
  puceTexte: { fontSize: 12.5, fontFamily: 'GrandParis-Bold', includeFontPadding: false },
});
