import { useWindowDimensions } from 'react-native';

// Seuil au-delà duquel on a assez de place pour montrer un tiroir
// (Favoris/Trafic, plafonné à 420px de large — voir sideCard dans App.tsx)
// EN PERMANENCE à côté de la carte plutôt qu'en recouvrement temporaire :
// 420 (tiroir) + un minimum confortable pour la carte à côté. En dessous,
// comportement téléphone inchangé (tiroir qui glisse par-dessus la carte).
//
// Volontairement une largeur fixe simple (pas de multiplicateur continu,
// pas de scaling de taille) — voir scale.ts (chantier abandonné) pour
// pourquoi on évite cette approche : ici on change uniquement la
// DISPOSITION (où les choses s'affichent), jamais leur taille.
const WIDE_LAYOUT_BREAKPOINT = 900;

export function useIsWideLayout(): boolean {
  const { width } = useWindowDimensions();
  return width >= WIDE_LAYOUT_BREAKPOINT;
}
