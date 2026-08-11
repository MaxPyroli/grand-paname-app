import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from './theme';

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
  return (
    <View style={styles.container}>
      <View style={styles.icon}>{icon}</View>
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      <Text style={[styles.description, { color: c.textSub }]}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  icon: { marginBottom: 14 },
  title: { fontSize: 17, fontFamily: 'GrandParis-Bold', marginBottom: 8, textAlign: 'center' },
  description: { fontSize: 14, fontFamily: 'GrandParis-Light', textAlign: 'center', lineHeight: 22 },
});
