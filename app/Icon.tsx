import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import IconAccueil from './assets/icons/mono/icon-accueil.svg';
import IconDiscussion from './assets/icons/mono/icon-discussion.svg';
import IconFavoris from './assets/icons/mono/icon-favoris.svg';
import IconParametres from './assets/icons/mono/icon-parametres.svg';
import IconPosition from './assets/icons/mono/icon-position.svg';
import IconRecherche from './assets/icons/mono/icon-recherche.svg';

const ICONS = {
  accueil: IconAccueil,
  discussion: IconDiscussion,
  favoris: IconFavoris,
  parametres: IconParametres,
  position: IconPosition,
  recherche: IconRecherche,
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color = '#000' }: { name: IconName; size?: number; color?: string }) {
  const Component = ICONS[name];
  return <Component width={size} height={size} color={color} />;
}

// Versions "couleur" des icônes d'onglets (palette du logo), pour l'état
// actif de la barre de navigation uniquement (voir LISEZMOI du dossier
// icones-app-svg). Le trait a une couleur de marque fixe, mais le point
// "station" doit rester lisible sur la pastille active — blanc sur fond
// sombre, bleu nuit sur fond clair — d'où `dotColor` au lieu d'un import
// statique du SVG couleur (qui a le blanc en dur).
export function IconAccueilCouleur({ size = 22, dotColor = '#FFFFFF' }: { size?: number; dotColor?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M16,50 L50,20 L84,50" fill="none" stroke="#2E9BD6" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M26,52 L26,82 L74,82 L74,52" fill="none" stroke="#2E9BD6" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={50} cy={67} r={6} fill={dotColor} />
    </Svg>
  );
}

export function IconFavorisCouleur({ size = 22, dotColor = '#FFFFFF' }: { size?: number; dotColor?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M50,16 L59.3,42.2 L86,43 L64.9,59.8 L72.4,86 L50,70.5 L27.6,86 L35.1,59.8 L14,43 L40.7,42.2 Z" fill="none" stroke="#F2B705" strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={50} cy={55} r={6} fill={dotColor} />
    </Svg>
  );
}

export function IconDiscussionCouleur({ size = 22, dotColor = '#FFFFFF' }: { size?: number; dotColor?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M50,18 C69,18 84,30.5 84,46 C84,61.5 69,74 50,74 C45,74 40.5,73.2 36.5,71.8 L20,80 L26,64.5 C19.8,59.5 16,53.1 16,46 C16,30.5 31,18 50,18 Z" fill="none" stroke="#27A65C" strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={36} cy={46} r={4.6} fill={dotColor} />
      <Circle cx={50} cy={46} r={4.6} fill={dotColor} />
      <Circle cx={64} cy={46} r={4.6} fill={dotColor} />
    </Svg>
  );
}

export function IconPositionCouleur({ size = 22, dotColor = '#FFFFFF' }: { size?: number; dotColor?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M50,86 C50,86 20,58 20,40 C20,24 33,13 50,13 C67,13 80,24 80,40 C80,58 50,86 50,86 Z" fill="none" stroke="#E5493E" strokeWidth={9} strokeLinejoin="round" />
      <Circle cx={50} cy={40} r={7} fill={dotColor} />
    </Svg>
  );
}
