import React, { useLayoutEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
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
  // Identifie ce que l'en-tête montre (« liste », « ligne-42 »…). Quand elle change, l'icône, le titre, le sous-titre et
  // l'action de droite se fondent en glissant vers le nouveau contenu ; sans elle, ils changent sans animation.
  cle?: string;
};

// Fondu glissé entre deux contenus : l'ancien monte et s'efface, le nouveau monte depuis le bas en apparaissant.
// Ne s'anime que quand `cle` change (pas au premier affichage, pas quand le texte se met à jour avec la même clé).
function Transition({ cle, children, ancrage = 'left', style }: { cle: string; children: React.ReactNode; ancrage?: 'left' | 'right'; style?: any }) {
  const v = useRef(new Animated.Value(1)).current;
  const dernier = useRef<{ cle: string; children: React.ReactNode }>({ cle, children });
  const [precedent, setPrecedent] = useState<React.ReactNode>(null);
  // Avant l'affichage : le nouveau contenu est mis à transparent dans la même image, sans éclair.
  useLayoutEffect(() => {
    if (dernier.current.cle !== cle) {
      setPrecedent(dernier.current.children);
      v.stopAnimation();
      v.setValue(0);
      Animated.timing(v, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true })
        .start(({ finished }) => { if (finished) setPrecedent(null); });
    }
    dernier.current = { cle, children };
  });
  return (
    <View style={style}>
      <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
        {children}
      </Animated.View>
      {precedent !== null && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 0, [ancrage]: 0,
            opacity: v.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }],
          }}
        >
          {precedent}
        </Animated.View>
      )}
    </View>
  );
}

export function PanelHeader({ icon, title, titleBadge, subtitle, right, align = 'left', cle }: PanelHeaderProps) {
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
          {icon ? <Transition cle={cle ?? 'i'} ancrage={isRight ? 'right' : 'left'}>{icon}</Transition> : null}
          <Transition cle={cle ?? title} ancrage={isRight ? 'right' : 'left'} style={{ flexShrink: 1 }}>
            <Text style={[styles.title, { color: c.text }, icon ? (isRight ? styles.titleWithIconRight : styles.titleWithIcon) : null]}>{title}</Text>
          </Transition>
          {titleBadge ? <View style={styles.titleBadgeWrap}>{titleBadge}</View> : null}
        </View>
        {subtitle ? (
          <Transition cle={cle ?? subtitle} ancrage={isRight ? 'right' : 'left'}>
            <Text style={[styles.subtitle, { color: c.textSub }, isRight && { textAlign: 'right' }]}>{subtitle}</Text>
          </Transition>
        ) : null}
      </View>
      {right ? <Transition cle={cle ?? 'd'} ancrage="right">{right}</Transition> : null}
    </View>
  );
}

// Bouton d'action d'en-tête (ex: « Modifier ») : pastille de 32 px, la même
// hauteur que la ligne du titre, donc alignée dessus. `actif` = état « en cours ».
export function PanelPillAction({ label, onPress, actif }: { label: string; onPress: () => void; actif?: boolean }) {
  const c = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.pill, { backgroundColor: actif ? c.accent : c.pillCenter }]}
    >
      <Text style={{ color: actif ? '#fff' : c.accent, fontSize: 13, fontFamily: 'GrandParis-Medium' }}>{label}</Text>
    </TouchableOpacity>
  );
}

// Bouton d'action d'en-tête en forme de pastille ronde avec une icône (ex: la cloche des alertes du volet
// Trafic) : même hauteur que la ligne du titre. Sans `onPress`, la pastille s'affiche sans réagir au toucher.
export function PanelIconAction({ icon, onPress, label }: { icon: React.ReactNode; onPress?: () => void; label: string }) {
  const c = useColors();
  const style = [styles.pillIcon, { backgroundColor: c.pillCenter }];
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={style} accessibilityRole="button" accessibilityLabel={label}>{icon}</TouchableOpacity>
  ) : (
    <View style={style} accessibilityLabel={label}>{icon}</View>
  );
}

// Dimensions communes à tous les volets (ne pas les redéfinir dans un écran).
export const PANEL_TITLE_SIZE = 24;
export const PANEL_TITLE_LINE = 32;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', height: PANEL_TITLE_LINE },
  title: { fontSize: PANEL_TITLE_SIZE, lineHeight: PANEL_TITLE_LINE, fontFamily: 'GrandParis-Bold' },
  titleWithIcon: { marginLeft: 8 },
  titleWithIconRight: { marginRight: 8 },
  titleBadgeWrap: { marginLeft: 8 },
  subtitle: { fontSize: 13, fontFamily: 'GrandParis-Light', marginTop: 2 },
  pillIcon: { width: PANEL_TITLE_LINE, height: PANEL_TITLE_LINE, borderRadius: PANEL_TITLE_LINE / 2, alignItems: 'center', justifyContent: 'center' },
  pill: { height: PANEL_TITLE_LINE, paddingHorizontal: 14, borderRadius: PANEL_TITLE_LINE / 2, alignItems: 'center', justifyContent: 'center' },
});
