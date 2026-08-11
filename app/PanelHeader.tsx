import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from './theme';

// En-tête standard de tous les volets latéraux (Favoris, Scanner, et les
// prochains) : même taille de titre, même position, même espacement,
// partagés par construction plutôt que recopiés à la main à chaque écran
// (c'est cette recopie approximative qui rendait les volets visiblement
// différents les uns des autres). `icon` attend une icône déjà dimensionnée
// (voir Icon.tsx) — ce composant ne fait que la mise en page autour.
type PanelHeaderProps = {
  icon?: React.ReactNode;
  title: string;
  // Accolé juste après le texte du titre (ex: un badge "BÊTA") — distinct de
  // `right`, qui vit à l'autre bout de la rangée.
  titleBadge?: React.ReactNode;
  subtitle?: string;
  right?: React.ReactNode;
  // 'right' mirrore toute la rangée (icône+titre à droite, `right` à
  // gauche) — utilisé pour que les deux tiroirs de part et d'autre de
  // l'onglet Accueil (Favoris à gauche, Trafic à droite) aient leurs
  // titres "tournés" l'un vers l'autre plutôt que tous les deux à gauche.
  align?: 'left' | 'right';
};

export function PanelHeader({ icon, title, titleBadge, subtitle, right, align = 'left' }: PanelHeaderProps) {
  const c = useColors();
  const isRight = align === 'right';
  return (
    <View style={[styles.row, isRight && { flexDirection: 'row-reverse' }]}>
      <View style={[{ flex: 1 }, isRight && { alignItems: 'flex-end' }]}>
        {/* En mode 'right', l'icône passe après le texte (row-reverse) pour
            rester du côté centre-écran — le côté vers lequel le titre
            "regarde" — plutôt que de rester avant le texte et se retrouver
            côté bord de l'écran. */}
        <View style={[styles.titleRow, isRight && { flexDirection: 'row-reverse' }]}>
          {icon}
          <Text style={[styles.title, { color: c.text }, icon ? (isRight ? styles.titleWithIconRight : styles.titleWithIcon) : null]}>{title}</Text>
          {titleBadge ? <View style={styles.titleBadgeWrap}>{titleBadge}</View> : null}
        </View>
        {subtitle ? <Text style={[styles.subtitle, { color: c.textSub }, isRight && { textAlign: 'right' }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 20, fontFamily: 'GrandParis-Bold' },
  titleWithIcon: { marginLeft: 8 },
  titleWithIconRight: { marginRight: 8 },
  titleBadgeWrap: { marginLeft: 8 },
  subtitle: { fontSize: 13, fontFamily: 'GrandParis-Light', marginTop: 4 },
});
