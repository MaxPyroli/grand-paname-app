import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { ThemeContext, useColors, type ThemeColors } from '../theme';
import { Icon, type IconName } from '../Icon';
import { PanelHeader, PanelPillAction } from '../PanelHeader';
import { PANEL_CARD_RADIUS, panelCardStyle, panelChipStyle } from '../PanelLayout';
import { FadeBottom, FadeTop, hexToRgba } from '../Fade';

// Composants communs des Paramètres. Ajouter un réglage = poser un de ces éléments avec son icône, sa famille, ses
// textes et son action : la mise en page, les couleurs et les trois thèmes sont définis ICI et nulle part ailleurs.
// (voir docs/guide-graphique.md, « Paramètres »)

// ── Familles de couleurs ───────────────────────────────────────────────────────
// bleu : notifications et affichage ; or : découverte ; vert : aide ; orange : réglages avancés.
// Le rouge reste réservé aux problèmes de trafic.
export type Famille = 'bleu' | 'or' | 'vert' | 'orange';
export function couleursFamille(f: Famille, c: ThemeColors, sombre: boolean): { trait: string; fond: string } {
  switch (f) {
    case 'or': return { trait: sombre ? '#F2B705' : '#c79200', fond: 'rgba(242,183,5,0.16)' };
    case 'vert': return { trait: sombre ? '#4cc27d' : '#2E9E5B', fond: 'rgba(46,158,91,0.14)' };
    case 'orange': return { trait: '#f39c12', fond: 'rgba(243,156,18,0.15)' };
    default: return { trait: c.accent, fond: c.iconGareBg };
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────
export function PageReglages({ icone, titre, sousTitre, action, onAction, children }: {
  icone: IconName; titre: string; sousTitre?: string; action: string; onAction: () => void; children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.entete}>
        <PanelHeader
          icon={<Icon name={icone} size={26} color={c.accent} />}
          title={titre}
          subtitle={sousTitre}
          right={<PanelPillAction label={action} onPress={onAction} />}
        />
      </View>
      <View style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contenu}>
          {children}
        </ScrollView>
        {/* Les fondus sont posés APRÈS la liste : avant, la liste les recouvrirait. */}
        <FadeTop color={c.bg} />
        <FadeBottom color={c.bg} />
      </View>
    </View>
  );
}

// ── Carte ──────────────────────────────────────────────────────────────────────
export function Carte({ children, titre, style, avancee }: { children: React.ReactNode; titre?: string; style?: StyleProp<ViewStyle>; avancee?: boolean }) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  return (
    <View style={[panelCardStyle, styles.carte, { backgroundColor: c.bgCard, borderColor: avancee ? 'rgba(243,156,18,0.35)' : c.borderCard }, isDark && styles.ombreSombre, style]}>
      {titre ? <Text style={[styles.titreCarte, { color: c.text }]}>{titre}</Text> : null}
      {children}
    </View>
  );
}

export function Puce({ icone, famille = 'bleu' }: { icone: IconName; famille?: Famille }) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  const f = couleursFamille(famille, c, isDark);
  return (
    <View style={[panelChipStyle, { backgroundColor: f.fond }]}>
      <Icon name={icone} size={22} color={f.trait} />
    </View>
  );
}

export function Chevron({ couleur }: { couleur?: string }) {
  const c = useColors();
  return <View style={{ marginRight: 4 }}><Icon name="avancer" size={12} color={couleur ?? c.accent} /></View>;
}

// ── Ligne ──────────────────────────────────────────────────────────────────────
// `droite` : 'suivant' (flèche), 'externe' (ouvre un autre écran du téléphone), un élément libre, ou rien.
export function LigneReglage({ icone, famille, titre, texte, droite = 'suivant', onPress, desactivee, trait }: {
  icone: IconName; famille?: Famille; titre: string; texte?: string; droite?: 'suivant' | 'externe' | React.ReactNode | null;
  onPress?: () => void; desactivee?: boolean; trait?: boolean;
}) {
  const c = useColors();
  const contenu = (
    <>
      <Puce icone={icone} famille={famille} />
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text style={[styles.titre, { color: c.text }]}>{titre}</Text>
        {texte ? <Text style={[styles.texte, { color: c.textSub }]}>{texte}</Text> : null}
      </View>
      {droite === 'suivant' ? <Chevron couleur={famille === 'orange' ? c.textSub : undefined} />
        : droite === 'externe' ? <View style={{ marginRight: 2 }}><Icon name="externe" size={18} color={c.accent} /></View>
        : droite}
    </>
  );
  const style = [styles.ligne, trait && { borderTopWidth: 1, borderTopColor: c.border }, desactivee && { opacity: 0.4 }];
  return onPress
    ? <TouchableOpacity activeOpacity={0.6} style={style} onPress={onPress} disabled={desactivee} accessibilityRole="button">{contenu}</TouchableOpacity>
    : <View style={style} pointerEvents={desactivee ? 'none' : 'auto'}>{contenu}</View>;
}

export function Interrupteur({ actif, onChange, label, desactive }: { actif: boolean; onChange: (v: boolean) => void; label: string; desactive?: boolean }) {
  const c = useColors();
  return (
    <TouchableOpacity
      onPress={() => onChange(!actif)} disabled={desactive} hitSlop={8}
      accessibilityRole="switch" accessibilityState={{ checked: actif, disabled: desactive }} accessibilityLabel={label}
      style={[styles.rail, { backgroundColor: actif ? c.accent : c.dragBar }]}
    >
      <View style={[styles.rond, { alignSelf: actif ? 'flex-end' : 'flex-start' }]} />
    </TouchableOpacity>
  );
}

// ── Tuiles (deux par rangée) ───────────────────────────────────────────────────
export function Tuiles({ children }: { children: React.ReactNode }) {
  return <View style={styles.tuiles}>{children}</View>;
}
export function Tuile({ icone, famille, titre, onPress }: { icone: IconName; famille?: Famille; titre: string; onPress: () => void }) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  return (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress} accessibilityRole="button"
      style={[panelCardStyle, styles.tuile, { backgroundColor: c.bgCard, borderColor: c.borderCard }, isDark && styles.ombreSombre]}>
      <View style={{ marginRight: -2 }}><Puce icone={icone} famille={famille} /></View>
      <Text style={[styles.titreTuile, { color: c.text }]} numberOfLines={2}>{titre}</Text>
    </TouchableOpacity>
  );
}

// ── Sélecteur à curseur glissant (ex : thème) ──────────────────────────────────
export function Selecteur<T extends string>({ options, valeur, onChange }: { options: { cle: T; titre: string }[]; valeur: T; onChange: (v: T) => void }) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  const [largeur, setLargeur] = useState(0);
  const index = Math.max(0, options.findIndex(o => o.cle === valeur));
  const curseur = useRef(new Animated.Value(index)).current;
  useEffect(() => { Animated.spring(curseur, { toValue: index, useNativeDriver: true, tension: 280, friction: 22 }).start(); }, [index, curseur]);
  const part = largeur > 0 ? (largeur - 6) / options.length : 0;
  return (
    <View style={[styles.selecteur, { backgroundColor: c.bgSubtle }]} onLayout={e => setLargeur(e.nativeEvent.layout.width)}>
      {part > 0 && (
        <Animated.View style={[styles.curseur, { width: part, backgroundColor: isDark ? c.pillCenter : c.bgCard, transform: [{ translateX: Animated.multiply(curseur, part) }] }]} />
      )}
      {options.map(o => (
        <TouchableOpacity key={o.cle} style={styles.option} onPress={() => onChange(o.cle)} accessibilityRole="radio" accessibilityState={{ checked: o.cle === valeur }}>
          <Text style={{ fontSize: 13, fontFamily: 'GrandParis-Medium', color: o.cle === valeur ? c.text : c.textSub }}>{o.titre}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Liste de choix (un seul), avec une explication sous chacun ──────────────────
// `points` : pastilles de couleur rappelant ce que le choix contient. `avertissement` : affiché quand le choix est pris.
export type Choix<T extends string> = { cle: T; titre: string; texte: string; points?: string[]; avertissement?: string };
export function ListeChoix<T extends string>({ choix, valeur, onChange }: { choix: Choix<T>[]; valeur: T; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View>
      {choix.map(o => {
        const pris = o.cle === valeur;
        return (
          <TouchableOpacity key={o.cle} activeOpacity={0.7} onPress={() => onChange(o.cle)} accessibilityRole="radio" accessibilityState={{ checked: pris }}
            style={[styles.choix, { borderColor: pris ? c.accent : c.borderCard, backgroundColor: pris ? c.pillCenter : 'transparent' }]}>
            <View style={[styles.bouton, pris ? { borderWidth: 5, borderColor: c.accent, backgroundColor: '#fff' } : { borderColor: c.dragBar }]} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.titreChoix, { color: c.text }]}>{o.titre}</Text>
                <View style={styles.points}>{o.points?.map(p => <View key={p} style={[styles.point, { backgroundColor: p }]} />)}</View>
              </View>
              <Text style={[styles.texte, { color: c.textSub }]}>{o.texte}</Text>
              {pris && o.avertissement ? <Avertissement texte={o.avertissement} /> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Avertissement({ texte, onPress }: { texte: string; onPress?: () => void }) {
  const c = useColors();
  const orange = '#F39C12';
  const style = [styles.avertissement, { borderColor: hexToRgba(orange, 0.55), backgroundColor: hexToRgba(orange, 0.13) }];
  const contenu = (
    <>
      <Icon name="info-trafic" size={18} color={orange} />
      <Text style={[styles.texteAvertissement, { color: c.text }]}>{texte}</Text>
      {onPress ? <Icon name="externe" size={16} color={orange} /> : null}
    </>
  );
  return onPress
    ? <TouchableOpacity activeOpacity={0.7} style={style} onPress={onPress} accessibilityRole="button">{contenu}</TouchableOpacity>
    : <View style={style} accessibilityRole="alert">{contenu}</View>;
}

const styles = StyleSheet.create({
  entete: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 4 },
  contenu: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 72 },
  // La carte reprend le gabarit des volets, en colonne.
  carte: { flexDirection: 'column', alignItems: 'stretch', borderRadius: PANEL_CARD_RADIUS, marginBottom: 10 },
  ombreSombre: { shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  titreCarte: { fontSize: 15, fontFamily: 'GrandParis-Medium', marginTop: 12, marginBottom: 10, marginHorizontal: 2 },
  ligne: { flexDirection: 'row', alignItems: 'center', minHeight: 62, paddingVertical: 8 },
  titre: { fontSize: 15, fontFamily: 'GrandParis-Medium' },
  texte: { fontSize: 12, lineHeight: 16, fontFamily: 'GrandParis-Light', marginTop: 2 },
  rail: { width: 44, height: 26, borderRadius: 13, paddingHorizontal: 3, justifyContent: 'center' },
  rond: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  tuiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tuile: { width: '48.4%', height: 64, paddingHorizontal: 10, marginBottom: 10 },
  titreTuile: { flex: 1, fontSize: 14, lineHeight: 17, fontFamily: 'GrandParis-Medium' },
  selecteur: { flexDirection: 'row', borderRadius: 16, padding: 3 },
  curseur: { position: 'absolute', left: 3, top: 3, bottom: 3, borderRadius: 13, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  option: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
  choix: { flexDirection: 'row', borderWidth: 1, borderRadius: 15, padding: 10, marginBottom: 8, gap: 10 },
  bouton: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, marginTop: 1 },
  titreChoix: { flex: 1, fontSize: 14, fontFamily: 'GrandParis-Medium' },
  points: { flexDirection: 'row', gap: 3, marginLeft: 8 },
  point: { width: 9, height: 9, borderRadius: 4.5 },
  avertissement: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10, marginTop: 8 },
  texteAvertissement: { flex: 1, fontSize: 12, lineHeight: 16, fontFamily: 'GrandParis-Light' },
});
