import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay, runOnJS, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, ThemeContext } from './theme';
import { CoucheSurface, useSurfaceVerre, useTexteSurAccent } from './surface';
import { hexToRgba } from './Fade';
import { Icon, IconName } from './Icon';
import { PANEL_CARD_RADIUS } from './PanelLayout';
import { symboleLigne } from './symbolesLignes';
import { Element, Emplacement, Notif, TypeNotif, fermerNotif, lireFile, majElements, suivreNotifs } from './notifs';

// Affichage des notifications internes (voir `notifs.ts`). Posé une seule fois, au-dessus de tout, dans `App.tsx`.
// Animations et geste exécutés ENTIÈREMENT côté interface native (Reanimated + gesture-handler) : le travail JavaScript
// du moment (réception d'une alerte, mémorisation…) ne les saccade pas. Surface en verre dépoli (voir surface.tsx).
const COULEURS: Record<TypeNotif, string | null> = {
  info: null, succes: '#2E9E5B', attention: '#F39C12', erreur: '#E5493E', perturbe: '#F39C12', interrompu: '#E5493E',
};
const ICONES: Record<TypeNotif, IconName> = {
  info: 'notifications', succes: 'valider', attention: 'info-trafic', erreur: 'quitter', perturbe: 'info-trafic', interrompu: 'info-trafic',
};
const MARGE_HALO = 24;   // place autour de la carte pour que le halo tienne dans l'image dessinée
const HORS_CHAMP = 220;
const RESSORT = { damping: 18, stiffness: 190, mass: 0.7 };
// Pile des cartes : celles qui attendent dépassent sous la première, un peu plus petites à chaque rang.
const CARTES_VISIBLES = 3;
const DECALAGE_PILE = 12;
const REDUCTION_PILE = 0.05;

// `basTitre` : bas de l'en-tête « Grand Paname » (depuis le haut de l'écran) ; les pilules se placent dessous.
export function NotifCentre({ basTitre }: { basTitre: number }) {
  const insets = useSafeAreaInsets();
  // UN SEUL flou natif pour tout le moteur (limite de la carte) : la carte de devant ; la pilule seulement s'il n'y a
  // aucune carte à l'écran.
  const [desCartes, setDesCartes] = useState(() => lireFile('cartes').length > 0);
  useEffect(() => suivreNotifs(() => setDesCartes(lireFile('cartes').length > 0)), []);
  // Une colonne en haut de l'écran : la carte, puis la pilule dessous (ou à sa place s'il n'y a pas de carte).
  return (
    <View pointerEvents="box-none" style={[styles.conteneur, { top: insets.top + 8 - MARGE_HALO }]}>
      <Place emplacement="cartes" flouPermis />
      {/* Sous le titre, comme l'ancienne pastille de mise à jour ; avec une carte à l'écran, sous la carte (plus basse). */}
      <View pointerEvents="box-none" style={{ width: '100%', alignItems: 'center', marginTop: desCartes || basTitre <= 0 ? 0 : Math.max(0, basTitre - insets.top) }}>
        <Place emplacement="pilules" flouPermis={!desCartes} />
      </View>
    </View>
  );
}

// Une file (cartes ou pilules). Les cartes en attente sont EMPILÉES sous la première (jusqu'à 3 visibles) : quand une
// carte part, celle du dessous remonte et se dévoile ; quand une plus urgente arrive, elle pousse les autres vers le fond.
// Les pilules se suivent une à une. TOUTES les vues sont posées au même endroit et ne changent jamais de mode de
// disposition ni d'ordre : seules des valeurs animées bougent (position, taille, hauteur), sinon l'animation saute.
function Place({ emplacement, flouPermis }: { emplacement: Emplacement; flouPermis: boolean }) {
  const max = emplacement === 'cartes' ? CARTES_VISIBLES : 1;
  const [elements, setElements] = useState<Element[]>(() => majElements([], lireFile(emplacement), max));
  useEffect(() => suivreNotifs(() => setElements(avant => majElements(avant, lireFile(emplacement), max))), [emplacement, max]);
  const sortieFinie = useCallback((cle: string) => setElements(avant => avant.filter(e => !(e.sortante && e.n.cle === cle))), []);
  // Hauteur naturelle de chaque carte (mesurée) : les cartes du fond prennent celle de la carte de devant.
  const [hauteurs, setHauteurs] = useState<Record<string, number>>({});
  const mesurer = useCallback((cle: string, h: number) => setHauteurs(avant => (avant[cle] === h ? avant : { ...avant, [cle]: h })), []);
  if (elements.length === 0) return null;
  const tete = elements.find(e => !e.sortante && e.rang === 0) ?? elements[0];
  const hauteurTete = hauteurs[tete.n.cle] ?? 0;
  const attente = Math.max(0, elements.filter(e => !e.sortante).length - 1);
  return (
    <View
      pointerEvents="box-none"
      // marginBottom : les marges de halo de la pile et de la pilule se recouvrent ; il reste 8 sous ce qui dépasse.
      style={[styles.place, { height: hauteurTete + 2 * MARGE_HALO, marginBottom: 8 - 2 * MARGE_HALO + attente * DECALAGE_PILE }]}
    >
      {elements.map(e => (
        <Carte
          key={e.n.cle} n={e.n} rang={e.rang} sortante={e.sortante} hauteurTete={hauteurTete} onMesure={mesurer} onSortie={sortieFinie}
          // Le flou va à la carte de devant ; pendant qu'une autre sort, il reste sur celle qui arrive.
          avecFlou={flouPermis && e.n.cle === tete.n.cle}
        />
      ))}
    </View>
  );
}

function Carte({ n, rang, sortante, hauteurTete, avecFlou, onMesure, onSortie }: {
  n: Notif; rang: number; sortante: boolean; hauteurTete: number; avecFlou: boolean;
  onMesure: (cle: string, h: number) => void; onSortie: (cle: string) => void;
}) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  const surface = useSurfaceVerre(avecFlou);
  const texteSurAccent = useTexteSurAccent();
  const sens = -1;   // tout arrive et repart par le haut
  const devant = rang === 0 && !sortante;
  // Une carte qui arrive directement devant glisse depuis le haut ; une carte qui arrive en attente apparaît à sa place.
  const y = useSharedValue(rang === 0 ? sens * HORS_CHAMP : 0);
  const profondeur = useSharedValue(rang);
  const opacite = useSharedValue(0);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibree = useRef(0);

  const arreterMinuteur = useCallback(() => { if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; } }, []);
  // Seule la carte de devant s'écoule : celles de la pile attendent leur tour sans perdre de temps.
  const lancerMinuteur = useCallback(() => {
    arreterMinuteur();
    if (devant && n.duree !== null) minuteur.current = setTimeout(() => fermerNotif(n.cle), n.duree);
  }, [devant, n.cle, n.duree, n.version, arreterMinuteur]);

  // Entrée : à l'image suivante, une fois la carte dessinée (sinon les premières images de l'animation sont perdues).
  useEffect(() => {
    if (sortante) return;
    const image = requestAnimationFrame(() => {
      opacite.value = withTiming(1, { duration: 140 });
      y.value = withSpring(0, RESSORT);
    });
    return () => cancelAnimationFrame(image);
  }, [sortante, y, opacite]);
  useEffect(() => { profondeur.value = withSpring(rang, RESSORT); }, [rang, profondeur]);
  useEffect(() => {
    if (!devant) return;
    if (n.vibration && vibree.current !== n.version) { vibree.current = n.version; Vibration.vibrate([0, 180, 110, 180]); }
    lancerMinuteur();
    return arreterMinuteur;
  }, [n.version, devant]);
  useEffect(() => {
    if (!sortante) return;
    arreterMinuteur();
    opacite.value = withDelay(130, withTiming(0, { duration: 90 }));
    y.value = withTiming(sens * HORS_CHAMP, { duration: 220, easing: Easing.in(Easing.cubic) }, fini => { if (fini) runOnJS(onSortie)(n.cle); });
  }, [sortante, onSortie, n.cle, sens, y, opacite, arreterMinuteur]);

  const fermer = useCallback(() => fermerNotif(n.cle), [n.cle]);
  // Balayer vers le haut pour fermer ; tant que le doigt est posé, le minuteur est arrêté.
  const geste = Gesture.Pan()
    .enabled(devant)
    .activeOffsetY([-8, 8])
    .onBegin(() => { runOnJS(arreterMinuteur)(); })
    .onUpdate(e => { const d = e.translationY * sens; y.value = sens * (d > 0 ? d : d * 0.15); })
    .onEnd(e => {
      if (e.translationY * sens > 28 || e.velocityY * sens > 500) runOnJS(fermer)();
      else y.value = withSpring(0, RESSORT);
    })
    .onFinalize(() => { runOnJS(lancerMinuteur)(); });

  const style = useAnimatedStyle(() => ({
    opacity: opacite.value,
    transform: [{ translateY: y.value + profondeur.value * DECALAGE_PILE }, { scale: 1 - profondeur.value * REDUCTION_PILE }],
  }));
  // Hauteur de la boîte, ANIMÉE : la sienne devant ; en attente celle de la carte de devant (seul le bord prévu dépasse).
  const [naturelle, setNaturelle] = useState(0);
  const hauteur = useSharedValue(0);
  const cible = rang > 0 && !sortante && hauteurTete > 0 ? hauteurTete : naturelle;
  useEffect(() => {
    if (cible <= 0) return;
    hauteur.value = hauteur.value === 0 ? cible : withSpring(cible, { ...RESSORT, overshootClamping: true });
  }, [cible, hauteur]);
  const styleHauteur = useAnimatedStyle(() => (hauteur.value > 0 ? { height: hauteur.value } : {}));
  // La carte juste derrière porte DÉJÀ son texte, caché par celle de devant : il se découvre quand celle-ci s'en va. Il n'est
  // masqué que là où il se verrait à tort : plus loin dans la pile, ou carte plus haute que celle de devant (son texte
  // dépasserait dans le bord visible).
  const masquerTexte = !sortante && (rang >= 2 || (rang === 1 && naturelle > hauteurTete + 2));
  const texteVisible = useSharedValue(masquerTexte ? 0 : 1);
  useEffect(() => { texteVisible.value = withTiming(masquerTexte ? 0 : 1, { duration: 120 }); }, [masquerTexte, texteVisible]);
  const styleContenu = useAnimatedStyle(() => ({ opacity: texteVisible.value }));
  const surMesure = useCallback((e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height) + 2;   // + la bordure de la boîte
    setNaturelle(h);
    onMesure(n.cle, h);
  }, [n.cle, onMesure]);

  const accent = COULEURS[n.type] ?? c.accent;
  const alerte = n.type === 'perturbe' || n.type === 'interrompu';
  const fond = surface.fond;
  const bordure = alerte ? hexToRgba(accent, 0.55) : surface.bordure;
  const halo = alerte
    ? [{ offsetX: 0, offsetY: 2, blurRadius: 18, spreadDistance: 1, color: hexToRgba(accent, isDark ? 0.38 : 0.28) }]
    : [{ offsetX: 0, offsetY: 3, blurRadius: 12, spreadDistance: 0, color: 'rgba(0,0,0,0.22)' }];
  const symbole = n.ligne ? symboleLigne(n.ligne.mode, n.ligne.code, isDark) : undefined;

  let contenu: React.ReactNode;
  if (n.forme === 'pilule') {
    contenu = (
      <View onLayout={e => onMesure(n.cle, Math.ceil(e.nativeEvent.layout.height))}>
      <TouchableOpacity
        activeOpacity={n.onPress ? 0.8 : 1}
        onPress={() => { n.onPress?.(); fermer(); }}
        style={[styles.pilule, { borderColor: bordure, boxShadow: halo }]}
        accessibilityRole="alert"
      >
        <View pointerEvents="none" style={styles.verrePilule}><CoucheSurface fond={fond} flou={surface.flou} /></View>
        {n.chargement ? <ActivityIndicator size="small" color={accent} /> : <Icon name={n.icone ?? ICONES[n.type]} size={16} color={accent} />}
        <Text style={[styles.piluleTexte, { color: c.text }]} numberOfLines={2}>{n.titre}</Text>
      </TouchableOpacity>
      </View>
    );
  } else {
    const corps = (
      <>
        {n.ligne ? (
          <View style={styles.case}>
            {symbole ? (
              <ExpoImage source={{ uri: symbole }} style={styles.symbole} contentFit="contain" />
            ) : (
              <View style={[styles.repli, { backgroundColor: hexToRgba(c.text, 0.1) }]}>
                <Text style={[styles.repliTexte, { color: c.text }]} numberOfLines={1}>{n.ligne.code}</Text>
              </View>
            )}
            <View style={[styles.point, { backgroundColor: accent, borderColor: bordure }]} />
          </View>
        ) : (
          <View style={[styles.puce, { backgroundColor: hexToRgba(accent, 0.16) }]}>
            <Icon name={n.icone ?? ICONES[n.type]} size={20} color={accent} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.titre, { color: c.text }]} numberOfLines={n.forme === 'choix' ? 2 : 1}>{n.titre}</Text>
          {!!n.texte && <Text style={[styles.texte, { color: c.textSub }]} numberOfLines={n.forme === 'choix' ? 4 : 2}>{n.texte}</Text>}
        </View>
      </>
    );
    // La boîte (fond, bordure, halo) a une hauteur animée ; le contenu, lui, garde sa hauteur naturelle (mesurée).
    const boite = (
      <Animated.View style={[styles.boite, { borderColor: bordure, boxShadow: halo }, styleHauteur]}>
        <CoucheSurface fond={fond} flou={surface.flou} />
        <View onLayout={surMesure} style={styles.interieur}>
          <Animated.View style={styleContenu}>
            <View style={styles.rangee}>
              {corps}
              {n.forme === 'carte' && n.onPress && <Text style={[styles.fleche, { color: c.textSub }]}>›</Text>}
            </View>
            {n.forme === 'choix' && (
              <View style={styles.actions}>
                {(n.actions ?? []).map(a => (
                  <TouchableOpacity
                    key={a.libelle}
                    activeOpacity={0.75}
                    disabled={!devant}
                    onPress={() => { fermer(); a.onPress?.(); }}
                    style={[styles.bouton, a.principal && { backgroundColor: c.accent }]}
                  >
                    <Text style={[styles.boutonTexte, { color: a.principal ? texteSurAccent : c.textSub }]}>{a.libelle}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Animated.View>
        </View>
      </Animated.View>
    );
    contenu = n.forme === 'choix' ? <View accessibilityRole="alert">{boite}</View> : (
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={!devant}
        onPress={() => { fermer(); n.onPress?.(); }}
        accessibilityRole="button"
        accessibilityLabel={`${n.titre}. ${n.texte ?? ''}`}
      >
        {boite}
      </TouchableOpacity>
    );
  }

  return (
    // La marge autour de la carte (pour le halo) ne capte aucun toucher : le geste est posé sur la carte seule.
    <Animated.View
      pointerEvents={devant ? 'box-none' : 'none'}
      style={[styles.mobile, n.forme === 'pilule' && styles.centree, { zIndex: sortante ? 20 : 10 - rang }, style]}
    >
      <GestureDetector gesture={geste}>
        <View collapsable={false}>{contenu}</View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Au-dessus de TOUT : les paramètres, le formulaire de bug et les fenêtres sont à zIndex 20000, élévation 20.
  conteneur: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 30000, elevation: 30 },
  place: { width: '100%', maxWidth: 484 },   // carte de 460 au plus, à 12 des bords
  mobile: { position: 'absolute', top: 0, left: 0, right: 0, paddingVertical: MARGE_HALO, paddingHorizontal: 12 },
  centree: { alignItems: 'center' },
  boite: { borderRadius: PANEL_CARD_RADIUS, borderWidth: 1, overflow: 'hidden' },
  interieur: { paddingVertical: 12, paddingHorizontal: 14 },
  rangee: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  case: { minWidth: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  symbole: { width: 34, height: 34 },
  repli: { minWidth: 38, height: 28, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  repliTexte: { fontSize: 13, fontFamily: 'GrandParis-Bold' },
  point: { position: 'absolute', top: 0, right: 0, width: 13, height: 13, borderRadius: 6.5, borderWidth: 2 },
  puce: { width: 40, height: 40, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  titre: { fontSize: 14, fontFamily: 'GrandParis-Bold' },
  texte: { fontSize: 12, fontFamily: 'GrandParis-Regular', marginTop: 2, lineHeight: 17 },
  fleche: { fontSize: 22, marginTop: -2 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  bouton: { height: 32, borderRadius: 16, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  boutonTexte: { fontSize: 13, fontFamily: 'GrandParis-Medium' },
  verrePilule: { ...StyleSheet.absoluteFill, borderRadius: 15, overflow: 'hidden' },
  pilule: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  piluleTexte: { fontSize: 13, fontFamily: 'GrandParis-Medium', flexShrink: 1 },
});
