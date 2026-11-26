import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, ThemeContext } from './theme';
import { hexToRgba } from './Fade';
import { Icon, IconName } from './Icon';
import { PANEL_CARD_RADIUS } from './PanelLayout';
import { symboleLigne } from './symbolesLignes';
import { Emplacement, Notif, TypeNotif, fermerNotif, lireFile, suivreNotifs } from './notifs';

// Affichage des notifications internes (voir `notifs.ts`). Posé une seule fois, au-dessus de tout, dans `App.tsx`.
// Animations et geste exécutés ENTIÈREMENT côté interface native (Reanimated + gesture-handler) : le travail JavaScript
// du moment (réception d'une alerte, mémorisation…) ne les saccade pas. La carte est dessinée une fois en image puis
// seulement déplacée (`renderToHardwareTextureAndroid`) : le halo flou n'est pas recalculé à chaque image.
const COULEURS: Record<TypeNotif, string | null> = {
  info: null, succes: '#2E9E5B', attention: '#F39C12', erreur: '#E5493E', perturbe: '#F39C12', interrompu: '#E5493E',
};
const ICONES: Record<TypeNotif, IconName> = {
  info: 'notifications', succes: 'valider', attention: 'info-trafic', erreur: 'quitter', perturbe: 'info-trafic', interrompu: 'info-trafic',
};
const MARGE_HALO = 24;   // place autour de la carte pour que le halo tienne dans l'image dessinée
const HORS_CHAMP = 220;
const RESSORT = { damping: 18, stiffness: 190, mass: 0.7 };

export function NotifCentre() {
  const insets = useSafeAreaInsets();
  // Une colonne en haut de l'écran : la carte, puis la pilule dessous (ou à sa place s'il n'y a pas de carte).
  return (
    <View pointerEvents="box-none" style={[styles.conteneur, { top: insets.top + 8 - MARGE_HALO }]}>
      <Place emplacement="cartes" />
      <Place emplacement="pilules" />
    </View>
  );
}

// Une file (cartes ou pilules) : montre la première notification de sa file, fait sortir l'ancienne avant l'arrivée
// de la suivante.
function Place({ emplacement }: { emplacement: Emplacement }) {
  const [tete, setTete] = useState<Notif | undefined>(() => lireFile(emplacement)[0]);
  const [affichee, setAffichee] = useState<Notif | undefined>(tete);
  useEffect(() => suivreNotifs(() => setTete(lireFile(emplacement)[0])), [emplacement]);
  // Même clé : le contenu change sur place, sans refaire l'entrée.
  useEffect(() => { if (tete && (!affichee || affichee.cle === tete.cle)) setAffichee(tete); }, [tete, affichee]);
  const sortieFinie = useCallback(() => setAffichee(lireFile(emplacement)[0]), [emplacement]);
  if (!affichee) return null;
  const sortante = !tete || tete.cle !== affichee.cle;
  return <Carte key={affichee.cle} n={affichee} sortante={sortante} onSortie={sortieFinie} />;
}

function Carte({ n, sortante, onSortie }: { n: Notif; sortante: boolean; onSortie: () => void }) {
  const c = useColors();
  const { isDark, oled } = useContext(ThemeContext);
  const sens = -1;   // tout arrive et repart par le haut
  const y = useSharedValue(sens * HORS_CHAMP);
  const opacite = useSharedValue(0);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arreterMinuteur = useCallback(() => { if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; } }, []);
  const lancerMinuteur = useCallback(() => {
    arreterMinuteur();
    if (n.duree !== null) minuteur.current = setTimeout(() => fermerNotif(n.cle), n.duree);
  }, [n.cle, n.duree, n.version, arreterMinuteur]);

  // Entrée : à l'image suivante, une fois la carte dessinée (sinon les premières images de l'animation sont perdues).
  useEffect(() => {
    if (sortante) return;
    const image = requestAnimationFrame(() => {
      opacite.value = withTiming(1, { duration: 140 });
      y.value = withSpring(0, RESSORT);
    });
    return () => cancelAnimationFrame(image);
  }, [sortante, y, opacite]);
  useEffect(() => {
    if (sortante) return;
    if (n.vibration) Vibration.vibrate([0, 180, 110, 180]);
    lancerMinuteur();
    return arreterMinuteur;
  }, [n.version, sortante]);
  useEffect(() => {
    if (!sortante) return;
    arreterMinuteur();
    opacite.value = withTiming(0, { duration: 180 });
    y.value = withTiming(sens * HORS_CHAMP, { duration: 200, easing: Easing.in(Easing.cubic) }, fini => { if (fini) runOnJS(onSortie)(); });
  }, [sortante, onSortie, sens, y, opacite, arreterMinuteur]);

  const fermer = useCallback(() => fermerNotif(n.cle), [n.cle]);
  // Balayer vers le bord pour fermer ; tant que le doigt est posé, le minuteur est arrêté.
  const geste = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onBegin(() => { runOnJS(arreterMinuteur)(); })
    .onUpdate(e => { const d = e.translationY * sens; y.value = sens * (d > 0 ? d : d * 0.15); })
    .onEnd(e => {
      if (e.translationY * sens > 28 || e.velocityY * sens > 500) runOnJS(fermer)();
      else y.value = withSpring(0, RESSORT);
    })
    .onFinalize(() => { runOnJS(lancerMinuteur)(); });

  const style = useAnimatedStyle(() => ({ opacity: opacite.value, transform: [{ translateY: y.value }] }));

  const accent = COULEURS[n.type] ?? c.accent;
  const alerte = n.type === 'perturbe' || n.type === 'interrompu';
  // La carte suit le thème : presque noire en OLED, un cran plus claire que les écrans en sombre.
  const fond = isDark ? (oled ? '#0d0d0d' : '#0b2550') : c.bgCard;
  const bordure = alerte ? hexToRgba(accent, 0.55) : c.borderCard;
  const halo = alerte
    ? [{ offsetX: 0, offsetY: 2, blurRadius: 18, spreadDistance: 1, color: hexToRgba(accent, isDark ? 0.38 : 0.28) }]
    : [{ offsetX: 0, offsetY: 3, blurRadius: 12, spreadDistance: 0, color: 'rgba(0,0,0,0.22)' }];
  const symbole = n.ligne ? symboleLigne(n.ligne.mode, n.ligne.code, isDark) : undefined;

  let contenu: React.ReactNode;
  if (n.forme === 'pilule') {
    contenu = (
      <TouchableOpacity
        activeOpacity={n.onPress ? 0.8 : 1}
        onPress={() => { n.onPress?.(); fermer(); }}
        style={[styles.pilule, { backgroundColor: fond, borderColor: bordure, boxShadow: halo }]}
        accessibilityRole="alert"
      >
        <Icon name={n.icone ?? ICONES[n.type]} size={16} color={accent} />
        <Text style={[styles.piluleTexte, { color: c.text }]} numberOfLines={2}>{n.titre}</Text>
      </TouchableOpacity>
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
            <View style={[styles.point, { backgroundColor: accent, borderColor: fond }]} />
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
    contenu = n.forme === 'choix' ? (
      <View style={[styles.carte, { backgroundColor: fond, borderColor: bordure, boxShadow: halo }]} accessibilityRole="alert">
        <View style={styles.rangee}>{corps}</View>
        <View style={styles.actions}>
          {(n.actions ?? []).map(a => (
            <TouchableOpacity
              key={a.libelle}
              activeOpacity={0.75}
              onPress={() => { fermer(); a.onPress?.(); }}
              style={[styles.bouton, a.principal && { backgroundColor: c.accent }]}
            >
              <Text style={[styles.boutonTexte, { color: a.principal ? (isDark ? '#000000' : '#ffffff') : c.textSub }]}>{a.libelle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    ) : (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => { fermer(); n.onPress?.(); }}
        style={[styles.carte, styles.rangee, { backgroundColor: fond, borderColor: bordure, boxShadow: halo }]}
        accessibilityRole="button"
        accessibilityLabel={`${n.titre}. ${n.texte ?? ''}`}
      >
        {corps}
        {n.onPress && <Text style={[styles.fleche, { color: c.textSub }]}>›</Text>}
      </TouchableOpacity>
    );
  }

  return (
    <>
      {/* La marge autour de la carte (pour le halo) ne capte aucun toucher : le geste est posé sur la carte seule. */}
      <Animated.View pointerEvents="box-none" renderToHardwareTextureAndroid style={[styles.mobile, n.forme !== 'pilule' && styles.pleineLargeur, style]}>
        <GestureDetector gesture={geste}>
          <View collapsable={false}>{contenu}</View>
        </GestureDetector>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  // Au-dessus de TOUT : les paramètres, le formulaire de bug et les fenêtres sont à zIndex 20000, élévation 20.
  conteneur: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 30000, elevation: 30 },
  // marginBottom : les marges de halo de la carte et de la pilule se recouvrent, il reste 8 entre les deux.
  mobile: { maxWidth: '100%', paddingVertical: MARGE_HALO, paddingHorizontal: 12, marginBottom: 8 - 2 * MARGE_HALO },
  pleineLargeur: { width: '100%', maxWidth: 484 },   // carte de 460 au plus, à 12 des bords
  carte: { borderRadius: PANEL_CARD_RADIUS, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14 },
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
  pilule: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  piluleTexte: { fontSize: 13, fontFamily: 'GrandParis-Medium', flexShrink: 1 },
});
