import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
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
    // ScrollView plutôt qu'une simple View centrée : sur un volet bas (écran
    // en paysage, où la hauteur disponible est bien plus réduite qu'en
    // portrait), le contenu centré peut dépasser la hauteur du volet — sans
    // ça, le volet parent (`overflow:hidden`) coupait silencieusement le
    // titre/la description en trop, ne laissant que l'icône visible. Ici,
    // ça défile au pire au lieu de disparaître.
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.icon}>{icon}</View>
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      <Text style={[styles.description, { color: c.textSub }]}>{description}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  icon: { marginBottom: 14 },
  title: { fontSize: 17, fontFamily: 'GrandParis-Bold', marginBottom: 8, textAlign: 'center' },
  description: { fontSize: 14, fontFamily: 'GrandParis-Light', textAlign: 'center', lineHeight: 22 },
});
