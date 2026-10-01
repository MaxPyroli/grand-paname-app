import React from 'react';
import { View, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { PanelHeader } from './PanelHeader';
import { FONDU_HAUT } from './Fade';

// Gabarit commun à tous les volets latéraux : quatre zones toujours dans le
// même ordre, avec le même espacement — en-tête, actions (optionnel, juste
// en dessous du titre), contenu (scrollable ou non, à la charge de
// l'écran), footer (optionnel, fixé en bas — pour une barre d'action
// persistante, pas dans le flux scrollable). Avant ce composant, chaque
// écran recopiait sa propre version de ces zones à la main (tailles,
// marges, ordre différents d'un écran à l'autre) ; ici, un nouvel écran
// hérite de la mise en page simplement en remplissant ces emplacements, pas
// en la refaisant.
// Hauteur à donner au `FadeTop` (voir Fade.tsx) posé sur le ScrollView d'un
// volet, et padding à donner au `contentContainerStyle` de CE MÊME
// ScrollView (pas au wrapper du moteur, qui est avant le ScrollView et ne
// le recouvre pas — le fondu se superpose au tout début du contenu qui
// défile, donc c'est là qu'il faut le tampon). `PANEL_CONTENT_TOP_PAD` est
// volontairement un peu plus grand que `PANEL_FADE_TOP_HEIGHT`, pas égal :
// le dernier pixel d'un LinearGradient n'atteint pas toujours une
// transparence parfaite (même souci que documenté sur `FadeBottom` en mode
// `strong`), et sans cette petite marge, le premier élément reste
// légèrement mangé par le fondu au repos.
export const PANEL_FADE_TOP_HEIGHT = FONDU_HAUT;
export const PANEL_CONTENT_TOP_PAD = PANEL_FADE_TOP_HEIGHT + 6;

// Carte standard d'un volet (favori, et plus tard les cartes du Trafic) :
// mêmes coins, mêmes marges, même ombre. `hauteur` = hauteur fixe éventuelle.
export const PANEL_CARD_RADIUS = 20;
export const panelCardStyle = {
  flexDirection: 'row' as const, alignItems: 'center' as const,
  paddingHorizontal: 12, borderRadius: PANEL_CARD_RADIUS, borderWidth: 1,
  shadowColor: '#1a2a4a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
};
// Puce ronde à gauche d'une carte (icône dans un carré arrondi).
export const panelChipStyle = { width: 42, height: 42, borderRadius: 15, alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 12 };

type PanelLayoutProps = {
  icon?: React.ReactNode;
  title: string;
  titleBadge?: React.ReactNode;
  subtitle?: string;
  headerRight?: React.ReactNode;
  headerAlign?: 'left' | 'right';
  onTitlePress?: () => void;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

export function PanelLayout({ icon, title, titleBadge, subtitle, headerRight, headerAlign, onTitlePress, actions, footer, children }: PanelLayoutProps) {
  const header = <PanelHeader icon={icon} title={title} titleBadge={titleBadge} subtitle={subtitle} right={headerRight} align={headerAlign} />;
  return (
    <View style={styles.container}>
      {onTitlePress ? (
        <TouchableWithoutFeedback onPress={onTitlePress}>
          <View>{header}</View>
        </TouchableWithoutFeedback>
      ) : header}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
      <View style={styles.content}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actions: { marginBottom: 16 },
  content: { flex: 1 },
  footer: { marginTop: 12 },
});
