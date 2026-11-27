import { createContext, useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemeContext, useColors } from './theme';
import { hexToRgba } from './Fade';

// Surface commune des éléments posés PAR-DESSUS l'app : notifications internes (`NotifCentre`) et fenêtres
// (« Quoi de neuf », mise à jour, visite guidée). C'est le VERRE DÉPOLI de l'en-tête de l'app (demande de l'utilisateur) :
// flou, teinte légère du thème, reflet en dégradé et fine bordure claire.
//
// Le flou est ici NATIF (le flou « dans la carte » de l'en-tête ne verrait pas les paramètres ou les volets). Il vise toute
// l'app (`BlurTargetContext`, fourni par App.tsx), carte comprise : trop de flous natifs à la fois font PLANTER la WebView
// (voir docs/guide-graphique.md 5 bis). `avecFlou` n'est donc vrai que pour UNE notification à la fois.
export const BlurTargetContext = createContext<React.RefObject<View | null> | null>(null);

// Interrupteur « Flou (verre dépoli) » des réglages (tenu à jour par App.tsx au rendu).
let flouAutorise = true;
export function autoriserFlouSurface(oui: boolean) { flouAutorise = oui; }

export function useSurfaceVerre(avecFlou: boolean): { fond: string; bordure: string; flou: boolean } {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  const cible = useContext(BlurTargetContext);
  const flou = avecFlou && flouAutorise && !!cible;
  // Avec flou : les teintes de l'en-tête (45 % clair, 50 % sombre). Sans flou (carte en attente dans la pile, flou coupé) :
  // presque opaque, pour rester lisible.
  const opacite = flou ? (isDark ? 0.5 : 0.45) : 0.96;
  return {
    fond: isDark ? hexToRgba(c.bgCard, opacite) : `rgba(255,255,255,${opacite})`,
    bordure: isDark ? c.borderCard : 'rgba(255,255,255,0.6)',
    flou,
  };
}

// À poser en premier enfant d'une boîte arrondie en `overflow: 'hidden'` : flou, teinte, reflet.
export function CoucheSurface({ fond, flou }: { fond: string; flou: boolean }) {
  const { isDark } = useContext(ThemeContext);
  const cible = useContext(BlurTargetContext);
  return (
    <>
      {flou && <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} blurMethod="dimezisBlurView" blurTarget={cible ?? undefined} style={StyleSheet.absoluteFill} pointerEvents="none" />}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fond }]} />
      <LinearGradient
        pointerEvents="none"
        colors={isDark ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
}

// Texte posé sur un bouton à la couleur d'accent (l'accent du thème sombre est clair : texte noir).
export function useTexteSurAccent(): string {
  const { isDark } = useContext(ThemeContext);
  return isDark ? '#000000' : '#ffffff';
}
