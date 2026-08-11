import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

// Multiplicateur "modéré" basé sur la largeur d'écran, pour les quelques
// éléments qu'on veut voir grandir un peu sur un grand écran (fenêtre
// Samsung DeX redimensionnée, tablette...) sans devenir démesurés. Jamais
// < 1 (rien de plus petit que la taille téléphone de référence).
//
// Volontairement PAS appliqué partout dans l'app (voir la tentative
// précédente, abandonnée) : un scaling généralisé de toutes les polices ET
// tous les cadres à la fois, sans pouvoir tester chaque écran en direct,
// a créé plus de régressions (texte/cadres désynchronisés) qu'il n'en a
// résolu. À utiliser uniquement sur des éléments simples, auto-dimensionnés
// (pas de hauteur fixe qui pourrait couper leur contenu), et vérifiés un
// par un.
const BASE_WIDTH = 400;
const MAX_SCALE = 1.5;
const MODERATION = 0.4;

export function useUIScale(): number {
  const { width } = useWindowDimensions();
  return useMemo(() => {
    const raw = width / BASE_WIDTH;
    if (raw <= 1) return 1;
    return Math.min(1 + (raw - 1) * MODERATION, MAX_SCALE);
  }, [width]);
}

export function rf(size: number, scale: number): number {
  return Math.round(size * scale);
}
