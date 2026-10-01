import { useWindowDimensions } from 'react-native';

// Seuil au-delà duquel le tiroir Favoris/Trafic (plafonné à 340px de large
// en layout large — voir sideCard/WIDE_PANEL_WIDTH dans App.tsx) reste
// affiché EN PERMANENCE (il ne glisse plus hors champ, ne se ferme plus au
// tap en dehors) plutôt qu'en recouvrement temporaire comme sur téléphone.
// 650dp correspond à peu près à un téléphone pivoté en paysage (~700-800dp
// selon les modèles) : validé sur appareil réel, le paysage téléphone est
// désormais un vrai mode supporté, pas juste toléré (voir aussi
// useAdaptiveOrientationLock, orientation libre partout).
//
// Volontairement une largeur fixe simple (pas de multiplicateur continu,
// pas de scaling de taille) : on adapte la disposition des panneaux,
// sans agrandir les textes ni les contrôles.
const WIDE_LAYOUT_BREAKPOINT = 650;

export function useIsWideLayout(): boolean {
  const { width } = useWindowDimensions();
  return width >= WIDE_LAYOUT_BREAKPOINT;
}
