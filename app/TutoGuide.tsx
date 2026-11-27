import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './theme';
import { hexToRgba } from './Fade';
import { PANEL_CARD_RADIUS } from './PanelLayout';
import { NAV_BAR_BOTTOM, NAV_BAR_HEIGHT } from './layout';
import { CoucheSurface, useSurfaceVerre, useTexteSurAccent } from './surface';
import { ETAPES, EtapeId, EtatApp, etape, etapeSuivante, gesteFait, placerBulle, retourNecessaire } from './tuto';
import { lireCible } from './tutoCibles';

// Tutoriel guidé : le reste de l'écran s'assombrit, le VRAI élément reste éclairé et touchable, une bulle explique.
// Les positions sont mesurées PAR RAPPORT au calque du tutoriel lui-même : un décalage propre au téléphone (barre
// d'état, encoche) s'annule. Sécurité : si l'élément n'est pas trouvé, RIEN n'est bloqué et la bulle propose « Suivant ».
//
// Transitions : le voile est UNE SEULE vue (une très épaisse bordure autour d'un trou arrondi) dont le trou GLISSE d'un
// élément au suivant. Dessin fait par la carte graphique ; essayé d'abord en tracé SVG redessiné à chaque image : saccadé. La bulle, elle, s'efface, puis ne réapparaît qu'une fois la nouvelle place connue et STABLE (les volets et les
// barres s'animent) : elle ne se « téléporte » jamais à l'écran.
type Rect = { x: number; y: number; w: number; h: number };
type Affiche = { id: EtapeId; rect: Rect | null; libre: boolean; introuvable: boolean };
const MARGE = 6;
const VOILE = 'rgba(0,0,0,0.62)';
const BORD = 4;   // le contour reste toujours à cette distance au moins des bords de l'écran
const RAYONS: Record<string, number> = { recherche: 32, volet: 28, etoile: 20, navFavoris: 24, navTrafic: 24, cloche: 20 };
// Courbe des tiroirs de l'app (voir guide graphique, « Animations »).
const GLISSE = { duration: 420, easing: Easing.bezier(0.22, 1, 0.36, 1) };
const SORTIE_MS = 140;

// Zone éclairée d'un élément : un peu plus grande que lui, mais jamais hors de l'écran.
function zone(r: Rect, ecranW: number, ecranH: number): Rect {
  const x = Math.max(BORD, r.x - MARGE), y = Math.max(BORD, r.y - MARGE);
  return { x, y, w: Math.max(0, Math.min(ecranW - BORD, r.x + r.w + MARGE) - x), h: Math.max(0, Math.min(ecranH - BORD, r.y + r.h + MARGE) - y) };
}
const proches = (a: Rect, b: Rect, tol: number) => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol && Math.abs(a.w - b.w) < tol && Math.abs(a.h - b.h) < tol;

export function TutoGuide({ visible, etat, onEtape, onPasser, onFin, onExemple }: {
  visible: boolean;
  etat: EtatApp;
  onEtape: (id: EtapeId) => void;      // à chaque arrivée sur une étape (préparer l'app)
  onPasser: () => void;
  onFin: () => void;
  onExemple: () => Promise<boolean>;   // « Me montrer avec Châtelet » ; faux si l'arrêt n'a pas pu être ouvert
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const fenetre = useWindowDimensions();
  const surface = useSurfaceVerre(true);
  const texteSurAccent = useTexteSurAccent();
  const [id, setId] = useState<EtapeId>('bienvenue');
  const [affiche, setAffiche] = useState<Affiche | null>(null);   // ce que la bulle et le trou montrent
  const [enTransition, setEnTransition] = useState(true);
  const [clavier, setClavier] = useState(false);
  const [exempleEnCours, setExempleEnCours] = useState(false);
  const [exempleRate, setExempleRate] = useState(false);
  const [taille, setTaille] = useState({ w: fenetre.width, h: fenetre.height });
  const calque = useRef<View>(null);
  const [hauteurBulle, setHauteurBulle] = useState(220);   // mesurée au premier affichage
  // Geste déjà fait en arrivant (tutoriel rejoué : l'arrêt est déjà en favori) : on propose « Suivant » au lieu de sauter.
  const dejaFait = useRef(false);
  const etatRef = useRef(etat);
  etatRef.current = etat;

  // Trou du voile (animé côté natif).
  const tx = useSharedValue(fenetre.width / 2);
  const ty = useSharedValue(fenetre.height / 2);
  const tw = useSharedValue(0);
  const th = useSharedValue(0);
  const tr = useSharedValue(24);
  const voile = useSharedValue(0);
  const bulleVue = useSharedValue(0);
  const trouOuvert = useRef(false);

  useEffect(() => { if (visible) { setId('bienvenue'); setAffiche(null); trouOuvert.current = false; voile.value = 0; bulleVue.value = 0; tw.value = 0; th.value = 0; } }, [visible]);

  useEffect(() => {
    if (!visible) return;
    dejaFait.current = id === 'favori' && gesteFait(id, etatRef.current);
    setExempleRate(false);
    onEtape(id);
  }, [id, visible]);

  // Avancer quand le geste est fait ; revenir en arrière si la personne a quitté ce dont l'étape a besoin.
  useEffect(() => {
    if (!visible) return undefined;
    const retour = retourNecessaire(id, etat);
    if (retour) { setId(retour); return undefined; }
    if (!dejaFait.current && gesteFait(id, etat)) {
      // Un instant pour voir le résultat du geste avant l'étape suivante.
      const t = setTimeout(() => setId(etapeSuivante(id)), id === 'recherche' ? 900 : 650);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [visible, id, etat.gareOuverte, etat.gareEnFavori, etat.onglet, etat.vueTraficOuverte]);

  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setClavier(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setClavier(false));
    return () => { a.remove(); b.remove(); };
  }, []);

  // Pendant la saisie d'un arrêt (clavier ouvert, résultats au-dessus de la barre), plus de voile : rien ne doit gêner.
  const libre = id === 'recherche' && clavier;

  // À chaque étape (ou passage en saisie) : la bulle sort, on attend que l'élément soit trouvé et immobile, puis elle
  // revient à sa place. Ensuite on continue de surveiller : un petit mouvement est suivi, un grand refait la transition.
  const cible = etape(id).cible;
  useEffect(() => {
    if (!visible) return undefined;
    let fini = false;
    let minuteur: ReturnType<typeof setTimeout>;
    let precedent: Rect | null = null;
    let montre: Rect | null = null;
    let publie = false;
    let essais = 0;
    const debut = Date.now();
    setEnTransition(true);
    bulleVue.value = withTiming(0, { duration: SORTIE_MS });

    const publier = (rect: Rect | null, introuvable: boolean) => {
      // Jamais avant la fin de la sortie de la bulle précédente.
      const reste = Math.max(0, SORTIE_MS + 20 - (Date.now() - debut));
      publie = true;
      montre = rect;
      clearTimeout(minuteur);
      minuteur = setTimeout(() => {
        if (fini) return;
        setAffiche({ id, rect, libre, introuvable });
        setEnTransition(false);
        if (cible && !libre) minuteur = setTimeout(mesurer, 300);
      }, reste);
    };

    const mesurer = () => {
      if (fini || !cible) return;
      essais++;
      const vue = lireCible(cible);
      const encore = () => {
        if (fini) return;
        if (!publie && essais > 16) { publier(null, true); return; }
        minuteur = setTimeout(mesurer, publie ? 300 : 110);
      };
      if (!vue || !calque.current) { encore(); return; }
      let repondu = false;
      // Filet : une vue démontée ne répond jamais.
      const filet = setTimeout(() => { if (!repondu) { repondu = true; encore(); } }, 250);
      calque.current.measureInWindow((ox, oy, _ow, oh) => {
        vue.measureInWindow((x, y, w, h) => {
          if (repondu || fini) return;
          repondu = true;
          clearTimeout(filet);
          if (!(w > 0) || !(h > 0)) { encore(); return; }
          let r = { x: x - ox, y: y - oy, w, h };
          // Volet des horaires : on mesure sa poignée, on éclaire tout le volet jusqu'au-dessus de la barre de navigation.
          if (cible === 'volet') r = { ...r, h: Math.max(h, oh - NAV_BAR_BOTTOM - NAV_BAR_HEIGHT - 8 - r.y) };
          const dansEcran = r.x > -r.w / 2 && r.y > -r.h / 2 && r.x < _ow - r.w / 2 && r.y < oh - 8;
          if (!dansEcran) { precedent = null; encore(); return; }
          const immobile = !!precedent && proches(precedent, r, 1.5);
          precedent = r;
          if (!publie) {
            if (immobile) publier(r, false); else encore();
            return;
          }
          if (immobile && montre && !proches(montre, r, 1.5)) {
            if (proches(montre, r, 28)) { montre = r; setAffiche({ id, rect: r, libre, introuvable: false }); }
            else {
              // Grand déplacement (volet tiré…) : nouvelle sortie puis retour à la bonne place.
              setEnTransition(true);
              bulleVue.value = withTiming(0, { duration: SORTIE_MS });
              montre = r;
              clearTimeout(minuteur);
              minuteur = setTimeout(() => {
                if (fini) return;
                setAffiche({ id, rect: r, libre, introuvable: false });
                setEnTransition(false);
                minuteur = setTimeout(mesurer, 300);
              }, SORTIE_MS + 20);
              return;
            }
          }
          encore();
        });
      });
    };

    if (!cible || libre) publier(null, false);
    else minuteur = setTimeout(mesurer, 120);
    return () => { fini = true; clearTimeout(minuteur); };
  }, [visible, id, libre]);

  // Quand la nouvelle place est connue : le trou glisse (ou s'ouvre), le voile suit, la bulle revient.
  useEffect(() => {
    if (!visible || !affiche) return;
    const r = affiche.rect;
    if (r && !affiche.libre) {
      const cibleAffichee = etape(affiche.id).cible!;
      const trou = zone(r, taille.w, taille.h);
      const rayon = Math.min(RAYONS[cibleAffichee], trou.h / 2, trou.w / 2);
      if (!trouOuvert.current) {
        // Ouverture : le trou part un peu plus grand que l'élément et se referme sur lui.
        tx.value = trou.x - 24; ty.value = trou.y - 24; tw.value = trou.w + 48; th.value = trou.h + 48; tr.value = rayon + 12;
        trouOuvert.current = true;
      }
      tx.value = withTiming(trou.x, GLISSE); ty.value = withTiming(trou.y, GLISSE);
      tw.value = withTiming(trou.w, GLISSE); th.value = withTiming(trou.h, GLISSE); tr.value = withTiming(rayon, GLISSE);
    } else if (trouOuvert.current) {
      // Plus rien à éclairer : le trou se referme sur son centre.
      tx.value = withTiming(tx.value + tw.value / 2, { duration: 260 }); ty.value = withTiming(ty.value + th.value / 2, { duration: 260 });
      tw.value = withTiming(0, { duration: 260 }); th.value = withTiming(0, { duration: 260 });
      trouOuvert.current = false;
    }
    // Voile : absent en saisie libre et quand l'élément est introuvable (rien ne doit être bloqué ni assombri).
    voile.value = withTiming(affiche.libre || affiche.introuvable ? 0 : 1, { duration: 260 });
    bulleVue.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [visible, affiche]);

  // Une seule vue : un trou arrondi entouré d'une bordure plus large que l'écran (le rayon intérieur d'une bordure est
  // le rayon extérieur moins son épaisseur). Aucun coin clair qui dépasse, et rien à redessiner en logiciel.
  const epaisseur = Math.ceil(Math.max(taille.w, taille.h));
  const styleVoile = useAnimatedStyle(() => ({
    left: tx.value - epaisseur, top: ty.value - epaisseur,
    width: tw.value + 2 * epaisseur, height: th.value + 2 * epaisseur,
    borderRadius: epaisseur + Math.max(0, Math.min(tr.value, tw.value / 2, th.value / 2)),
    opacity: voile.value,
  }), [epaisseur]);
  const styleContour = useAnimatedStyle(() => ({
    left: tx.value, top: ty.value, width: tw.value, height: th.value,
    borderRadius: Math.max(0, Math.min(tr.value, tw.value / 2, th.value / 2)),
    opacity: tw.value < 8 || th.value < 8 ? 0 : voile.value,
  }));
  const styleBulle = useAnimatedStyle(() => ({ opacity: bulleVue.value, transform: [{ translateY: (1 - bulleVue.value) * 10 }] }));

  if (!visible) return null;

  const montree = affiche;
  const e = montree ? etape(montree.id) : null;
  const rect = montree && !montree.libre ? montree.rect : null;
  const eclaire = rect ? zone(rect, taille.w, taille.h) : null;
  const centree = !!e && !e.cible;
  const boutonSuivant = !!e && (e.attend === 'bouton' || !!montree?.introuvable || dejaFait.current);
  const rang = e ? ETAPES.findIndex(x => x.id === e.id) : 0;
  const suivant = () => { if (!montree) return; if (montree.id === 'fin') onFin(); else setId(etapeSuivante(montree.id)); };
  // Touchers : tout est bloqué sauf le trou ; en saisie libre ou si l'élément est introuvable, rien n'est bloqué.
  const bloquer = !!montree && !montree.libre && !montree.introuvable;

  // Bulle : du côté de l'élément où elle tient (voir `placerBulle`) ; en haut de l'écran quand rien n'est éclairé.
  const positionBulle = montree?.libre ? { top: insets.top + 8 }
    : !eclaire ? { top: insets.top + 90 }
    : placerBulle(eclaire, taille.h, hauteurBulle, insets.top + 8, NAV_BAR_BOTTOM + NAV_BAR_HEIGHT + 16);

  return (
    <View
      ref={calque}
      collapsable={false}
      pointerEvents="box-none"
      style={styles.calque}
      onLayout={ev => { const { width, height } = ev.nativeEvent.layout; setTaille({ w: width, h: height }); }}
    >
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderWidth: epaisseur, borderColor: VOILE }, styleVoile]} />
      <Animated.View pointerEvents="none" style={[styles.contour, { borderColor: c.accent }, styleContour]} />

      {/* Zones transparentes qui bloquent les touchers autour de l'élément (le voile dessiné, lui, ne capte rien). */}
      {(!montree || centree) && <View style={StyleSheet.absoluteFill} />}
      {bloquer && eclaire && (
        <>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(0, eclaire.y) }} onStartShouldSetResponder={() => true} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: eclaire.y + eclaire.h, bottom: 0 }} onStartShouldSetResponder={() => true} />
          <View style={{ position: 'absolute', left: 0, width: Math.max(0, eclaire.x), top: eclaire.y, height: eclaire.h }} onStartShouldSetResponder={() => true} />
          <View style={{ position: 'absolute', left: eclaire.x + eclaire.w, right: 0, top: eclaire.y, height: eclaire.h }} onStartShouldSetResponder={() => true} />
          {/* L'étape « horaires » montre sans faire toucher : le volet reste protégé (on avance avec « Suivant »). */}
          {montree!.id === 'horaires' && <View style={{ position: 'absolute', left: eclaire.x, top: eclaire.y, width: eclaire.w, height: eclaire.h }} onStartShouldSetResponder={() => true} />}
        </>
      )}

      {montree && e && (
        <Animated.View
          // La clé force un nouveau placement : une bulle ne passe jamais d'un ancrage « haut » à un ancrage « bas ».
          key={`${montree.id}-${montree.libre}-${'bottom' in positionBulle ? 'bas' : 'haut'}-${centree}`}
          pointerEvents={enTransition ? 'none' : 'box-none'}
          style={[centree ? styles.centre : [styles.flottante, positionBulle], styleBulle]}
        >
          <View
            style={[styles.carte, { borderColor: surface.bordure }]}
            accessibilityViewIsModal={centree}
            onLayout={ev => { const h = Math.ceil(ev.nativeEvent.layout.height); if (!centree && Math.abs(h - hauteurBulle) > 2) setHauteurBulle(h); }}
          >
            <CoucheSurface fond={surface.fond} flou={surface.flou} />
            <View style={styles.interieur}>
              {e.id === 'bienvenue' && <Image source={require('./assets/icon.png')} style={styles.logo} resizeMode="contain" />}
              <Text style={[styles.titre, { color: c.text }, centree && styles.centreTexte, centree && { fontSize: 22 }]}>{e.titre}</Text>
              {!montree.libre && <Text style={[styles.texte, { color: c.textSub }, centree && styles.centreTexte]}>{e.texte}</Text>}
              {exempleRate && <Text style={[styles.texte, { color: c.textSub }]}>L'arrêt d'exemple n'a pas pu s'ouvrir. Vérifie ta connexion, ou cherche le tien.</Text>}

              <View style={styles.points}>
                {ETAPES.map((x, i) => (
                  <View key={x.id} style={{ width: i === rang ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === rang ? c.accent : hexToRgba(c.text, 0.2) }} />
                ))}
              </View>

              <View style={styles.boutons}>
                {e.id !== 'fin' && (
                  <TouchableOpacity onPress={onPasser} style={styles.passer} accessibilityRole="button">
                    <Text style={[styles.passerTexte, { color: c.textSub }]}>Passer</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }} />
                {e.id === 'recherche' && !montree.libre && (
                  <TouchableOpacity
                    disabled={exempleEnCours}
                    onPress={async () => { setExempleEnCours(true); setExempleRate(!(await onExemple())); setExempleEnCours(false); }}
                    style={[styles.bouton, { borderWidth: 1, borderColor: c.accent }]}
                  >
                    {exempleEnCours ? <ActivityIndicator size="small" color={c.accent} /> : <Text style={[styles.boutonTexte, { color: c.accent }]}>Me montrer avec Châtelet</Text>}
                  </TouchableOpacity>
                )}
                {boutonSuivant && (
                  <TouchableOpacity onPress={suivant} style={[styles.bouton, { backgroundColor: c.accent }]}>
                    <Text style={[styles.boutonTexte, { color: texteSurAccent }]}>{e.id === 'bienvenue' ? "C'est parti" : e.id === 'fin' ? "Explorer l'app" : 'Suivant'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Au-dessus de la barre de navigation, du volet et des fenêtres ; sous les notifications internes (30000).
  calque: { ...StyleSheet.absoluteFill, zIndex: 25000, elevation: 25 },
  // Contour net, sans lueur ni ombre (elles faisaient des halos sales autour des éléments).
  contour: { position: 'absolute', borderWidth: 2 },
  centre: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  flottante: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  carte: { width: '100%', maxWidth: 420, borderRadius: PANEL_CARD_RADIUS, borderWidth: 1, overflow: 'hidden' },
  interieur: { padding: 18, gap: 8 },
  logo: { width: 76, height: 76, borderRadius: 18, alignSelf: 'center', marginBottom: 6 },
  titre: { fontSize: 18, fontFamily: 'GrandParis-Bold' },
  texte: { fontSize: 14, lineHeight: 20, fontFamily: 'GrandParis-Regular' },
  centreTexte: { textAlign: 'center' },
  points: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 6 },
  boutons: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  passer: { height: 36, justifyContent: 'center', paddingHorizontal: 4 },
  passerTexte: { fontSize: 13, fontFamily: 'GrandParis-Medium' },
  bouton: { minHeight: 36, borderRadius: 18, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  boutonTexte: { fontSize: 13, fontFamily: 'GrandParis-Medium' },
});
