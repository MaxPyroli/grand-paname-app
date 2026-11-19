import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAV_BAR_BOTTOM } from './layout';

// Géométrie des deux barres du bas (navigation et recherche), selon l'orientation.
//  - Portrait : la barre de recherche est AU-DESSUS de la barre de navigation, toutes deux à 88 % de la largeur.
//  - Paysage (largeur > hauteur) : les deux barres sont CÔTE À CÔTE sur la même ligne, ce qui libère toute la hauteur
//    que prenait la barre de recherche (la hauteur d'un téléphone en paysage est très faible).
// Mêmes menus dans les deux cas : seule la disposition change (décision du 2026-11-18, voir guide graphique).
export type GeometrieBarres = {
  paysage: boolean;
  navLeft: number; navWidth: number;
  margeG: number; margeD: number;   // marge de chaque côté (≥ zone de la caméra)
  rechercheLeft: number; rechercheWidth: number; rechercheRight: number;
  rechercheBottom: number;   // distance du bas de l'écran
};

export function useGeometrieBarres(hauteurNav: number, hauteurRecherche: number, ecartVertical: number): GeometrieBarres {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const paysage = width > height;
  if (!paysage) {
    const marge = width * 0.06;
    return { paysage, margeG: marge, margeD: marge, navLeft: marge, navWidth: width * 0.88, rechercheLeft: marge, rechercheWidth: width * 0.88, rechercheRight: marge, rechercheBottom: NAV_BAR_BOTTOM + hauteurNav + ecartVertical };
  }
  // Marges : 12 dp, ou la zone de la caméra (encoche) si elle est plus large : le contenu ne passe jamais dessous.
  const margeG = Math.max(12, insets.left + 12);
  const margeD = Math.max(12, insets.right + 12);
  const marge = margeG;
  const navWidth = Math.min(Math.round(width * 0.44), 400);
  const rechercheLeft = marge + navWidth + 10;
  const rechercheWidth = width - margeD - rechercheLeft;
  // Centrée verticalement sur la barre de navigation (qui est un peu plus haute).
  return { paysage, margeG, margeD, navLeft: marge, navWidth, rechercheLeft, rechercheWidth, rechercheRight: margeD, rechercheBottom: NAV_BAR_BOTTOM + Math.round((hauteurNav - hauteurRecherche) / 2) };
}
