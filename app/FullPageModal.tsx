import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './theme';
import { NAV_BAR_BOTTOM, NAV_BAR_HEIGHT } from './layout';

// Moteur des onglets qui sont de "vraies pages" plutôt que des tiroirs
// glissant par-dessus la carte (Favoris, Trafic) : un overlay plein écran
// dans le MÊME arbre React (pas un <Modal> natif). Un <Modal> ouvre une
// vraie fenêtre OS séparée, avec son propre temps de composition — sur
// Android ça se traduisait par un flash blanc à l'ouverture et, pire, la
// barre de navigation dupliquée le temps que la fenêtre se mette en place
// (il fallait la re-rendre DANS le Modal puisqu'il recouvre tout, y compris
// la vraie). En restant dans l'arbre principal, il n'y a plus qu'une seule
// <TabBar>, déjà rendue par App.tsx — cette page vient juste s'empiler
// au-dessus de la carte/des tiroirs (zIndex) mais en dessous d'elle.
// La contrainte qui empêchait <Modal> pour les tiroirs (flou de la carte
// visible dessous, cassé dans une fenêtre séparée) ne s'applique pas non
// plus ici : ces pages n'ont pas besoin de montrer la carte en transparence.
export function FullPageModal({ visible, cote, children }: {
  visible: boolean;
  // Côté d'où la page arrive : « gauche » (onglet de gauche) ou « droite » (onglet de droite), comme
  // les tiroirs Favoris et Trafic qu'elle vient recouvrir.
  cote: 'gauche' | 'droite';
  children: React.ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const hors = cote === 'gauche' ? -screenWidth : screenWidth;
  const slideAnim = useRef(new Animated.Value(visible ? 0 : hors)).current;
  // La page reste TOUJOURS montée (simplement hors écran quand elle est fermée) : l'ancienne
  // version la montait au moment de l'ouverture, donc elle partait une ou deux images après la
  // page qui s'en va, et on voyait la carte entre les deux au passage direct Bientôt ↔ Scanner.
  // Ici les deux pages démarrent exactement en même temps. Fermée, elle ne reçoit aucun toucher.
  useEffect(() => {
    if (visible) {
      // Ressort commun (celui du volet des horaires, de la barre de recherche et des Paramètres).
      Animated.spring(slideAnim, { toValue: 0, stiffness: 120, damping: 15, mass: 0.5, useNativeDriver: true }).start();
    } else {
      // Même ressort à la sortie (sans dépassement) : la page qui part et celle qui arrive ont la
      // même physique et restent collées, comme un carrousel.
      Animated.spring(slideAnim, { toValue: hors, stiffness: 120, damping: 15, mass: 0.5, overshootClamping: true, useNativeDriver: true }).start();
    }
  }, [visible, hors]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.root,
        { backgroundColor: c.bg, paddingTop: insets.top + 8, transform: [{ translateX: slideAnim }] },
      ]}
    >
      <View style={styles.content}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Au-dessus de la carte, des tiroirs (101) et du volet des horaires (500) mais en dessous
  // de la barre de navigation (600), qui doit rester visible par-dessus cette page.
  root: { ...StyleSheet.absoluteFill, zIndex: 550, paddingHorizontal: 18 },
  // Marge basse pour que le contenu (ex: le bouton "Scanner le passe" en bas
  // de ScannerScreen) ne se retrouve pas caché sous la barre flottante.
  content: { flex: 1, paddingBottom: NAV_BAR_BOTTOM + NAV_BAR_HEIGHT + 16 },
});
