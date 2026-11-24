import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './theme';
import { PANEL_CARD_RADIUS } from './PanelLayout';
import { COULEUR_TYPE } from './TraficDetail';
import type { AlerteRecue } from './notifications';

// Petit pop-up affiché en haut de l'écran quand une alerte sur l'une de MES lignes arrive pendant que l'app est ouverte
// (à la place de la bannière du système, voir `setNotificationHandler`). Toucher = ouvrir la ligne ; glisser vers le haut
// = fermer ; sinon il se ferme tout seul au bout de quelques secondes. Carte opaque : l'ombre native y est permise.
const DUREE_MS = 7000;
const DECALAGE = -170;   // hors de l'écran, au-dessus

export function AlerteFlash({ alerte, onOuvrir, onFermer }: { alerte: AlerteRecue | null; onOuvrir: (a: AlerteRecue) => void; onFermer: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(DECALAGE)).current;
  // L'alerte affichée est gardée le temps de l'animation de sortie (le parent met `alerte` à null dès la fermeture).
  const [affichee, setAffichee] = useState<AlerteRecue | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alerteRef = useRef(alerte);
  alerteRef.current = alerte;

  const sortir = (apres?: () => void) => {
    if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; }
    Animated.timing(y, { toValue: DECALAGE, duration: 180, useNativeDriver: true }).start(() => { setAffichee(null); apres?.(); });
  };

  useEffect(() => {
    if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; }
    if (!alerte) return;
    setAffichee(alerte);
    // Une nouvelle alerte pendant qu'une autre est affichée : elle prend la place (la mémoire garde les deux).
    y.stopAnimation();
    Animated.spring(y, { toValue: 0, damping: 15, stiffness: 120, mass: 0.5, useNativeDriver: true }).start();
    minuteur.current = setTimeout(() => { minuteur.current = null; sortir(onFermer); }, DUREE_MS);
    return () => { if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerte]);

  const geste = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; } },
    onPanResponderMove: (_e, g) => { y.setValue(Math.min(0, g.dy)); },
    onPanResponderRelease: (_e, g) => {
      if (g.dy < -30 || g.vy < -0.5) sortir(onFermer);
      else Animated.spring(y, { toValue: 0, damping: 15, stiffness: 120, mass: 0.5, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => { Animated.spring(y, { toValue: 0, damping: 15, stiffness: 120, mass: 0.5, useNativeDriver: true }).start(); },
  })).current;

  if (!affichee) return null;
  const titreLigne = affichee.ligneTitre || affichee.titre;
  const sousTitre = affichee.ligneTitre && affichee.titre !== affichee.ligneTitre ? affichee.titre : '';
  return (
    <Animated.View
      {...geste.panHandlers}
      pointerEvents="box-none"
      style={[styles.conteneur, { top: insets.top + 8, transform: [{ translateY: y }] }]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => { const a = alerteRef.current ?? affichee; sortir(() => onOuvrir(a)); }}
        style={[styles.carte, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}
        accessibilityRole="button"
        accessibilityLabel={`${titreLigne}. Toucher pour voir le détail.`}
      >
        <View style={[styles.point, { backgroundColor: COULEUR_TYPE[affichee.niveau] }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.titre, { color: c.text }]} numberOfLines={1}>{titreLigne}</Text>
          {sousTitre !== '' && <Text style={[styles.texte, { color: c.textSub }]} numberOfLines={2}>{sousTitre}</Text>}
        </View>
        <Text style={[styles.fleche, { color: c.textSub }]}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  conteneur: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 9999, elevation: 20 },
  carte: {
    width: '100%', maxWidth: 460, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: PANEL_CARD_RADIUS, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#1a2a4a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6,
  },
  point: { width: 10, height: 10, borderRadius: 5 },
  titre: { fontSize: 14, fontFamily: 'GrandParis-Bold' },
  texte: { fontSize: 12, fontFamily: 'GrandParis-Regular', marginTop: 2, lineHeight: 17 },
  fleche: { fontSize: 22, marginTop: -2 },
});
