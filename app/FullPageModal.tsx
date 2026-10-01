import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
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
export function FullPageModal({ visible, children }: {
  visible: boolean;
  children: React.ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = Dimensions.get('window');
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  // Reste monté pendant l'animation de sortie (sinon la page disparaît d'un
  // coup au lieu de glisser vers le bas) ; démonté une fois hors écran, pour
  // ne pas laisser une vue plein écran inutile intercepter les taps.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      slideAnim.setValue(screenHeight);
      Animated.timing(slideAnim, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(slideAnim, { toValue: screenHeight, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true })
        .start(() => setMounted(false));
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <Animated.View style={[
      styles.root,
      { backgroundColor: c.bg, paddingTop: insets.top + 8, transform: [{ translateY: slideAnim }] },
    ]}>
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
