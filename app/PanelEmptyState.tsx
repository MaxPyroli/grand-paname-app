import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from './theme';
import { useUIScale, rf } from './scale';

// État vide standard des volets (aucun favori, aucun scan encore fait...) :
// icône + titre + description, centrés. Partagé pour que ces écrans restent
// cohérents entre eux plutôt que de recopier chacun leur propre variante.
type PanelEmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
};

export function PanelEmptyState({ icon, title, description }: PanelEmptyStateProps) {
  const c = useColors();
  // `container` est flex:1 (pas de hauteur fixe) : rien ne peut couper ce
  // texte s'il grossit un peu.
  const scale = useUIScale();
  const styles = useMemo(() => makeStyles(scale), [scale]);
  return (
    <View style={styles.container}>
      <View style={styles.icon}>{icon}</View>
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      <Text style={[styles.description, { color: c.textSub }]}>{description}</Text>
    </View>
  );
}

const makeStyles = (s: number) => StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  icon: { marginBottom: 14 },
  title: { fontSize: rf(17, s), fontFamily: 'GrandParis-Bold', marginBottom: 8, textAlign: 'center' },
  description: { fontSize: rf(14, s), fontFamily: 'GrandParis-Light', textAlign: 'center', lineHeight: 22 },
});
