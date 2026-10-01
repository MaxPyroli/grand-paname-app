import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Longueurs standard des fondus de défilement (haut et bas de toute liste) : à utiliser
// partout au lieu de valeurs propres à chaque écran (voir le guide graphique).
export const FONDU_HAUT = 16;
export const FONDU_BAS = 40;

export function FadeBottom({ color, height = FONDU_BAS, strong = false }: { color: string; height?: number; strong?: boolean }) {
  // `strong` : un simple dégradé 2 points (transparent → couleur) reste très
  // léger visuellement sur les premiers 50-60% (l'œil ne perçoit presque rien
  // sous ~40% d'opacité) — le fondu paraît alors trop faible pour masquer une
  // vraie coupure nette (ex: liste d'horaires coupée par le clip du panneau).
  // Plusieurs paliers d'opacité rapprochés vers la fin donnent un fondu qui
  // "prend" plus tôt et masque mieux la coupure.
  // Le dernier palier est atteint avant la toute fin (0.88, pas 1) : une
  // marge opaque pleine de quelques % en réserve, pour ne pas dépendre du
  // pixel exact de la fin du dégradé — sur certains rendus, l'interpolation
  // du tout dernier pixel d'un LinearGradient n'atteint pas une opacité
  // parfaitement pleine, laissant filtrer un liseré d'un pixel du contenu
  // masqué en dessous.
  const colors = (strong
    ? [hexToRgba(color, 0), hexToRgba(color, 0.4), hexToRgba(color, 0.75), hexToRgba(color, 0.93), color, color]
    : [color.startsWith('rgba') ? color.replace(/[\d.]+\)$/, '0)') : 'transparent', color]) as [string, string, ...string[]];
  const locations = (strong ? [0, 0.35, 0.6, 0.78, 0.88, 1] : undefined) as [number, number, ...number[]] | undefined;
  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height }} pointerEvents="none">
      <LinearGradient colors={colors} locations={locations} style={{ flex: 1 }} />
    </View>
  );
}
export function FadeTop({ color, height = FONDU_HAUT }: { color: string; height?: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height }} pointerEvents="none">
      <LinearGradient colors={[color, color.startsWith('rgba') ? color.replace(/[\d.]+\)$/, '0)') : 'transparent']} style={{ flex: 1 }} />
    </View>
  );
}

