import React, { useRef, useEffect, useState, useCallback, useMemo, useContext, createContext } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ActivityIndicator,
  FlatList, TextInput, Keyboard, Animated, Dimensions, Easing,
  LayoutChangeEvent, Platform, ToastAndroid, NativeModules,
  Linking, ScrollView, BackHandler, useWindowDimensions, PanResponder,
} from 'react-native';
import { ThemeContext, ThemeProvider, useColors } from './theme';
import type { ThemeColors, ThemePref } from './theme';
import { useIsWideLayout } from './responsive';
import MapWebView, { MapWebViewRef } from './MapWebView';
import { WebView } from 'react-native-webview';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView, BlurTargetView } from 'expo-blur';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Clipboard from 'expo-clipboard';
import { Directory, Paths } from 'expo-file-system';
import transportData from './assets/transport-data.json';
import { APP_VERSION, APP_CODENAME } from './constants';
import { CHANGELOGS, ChangelogEntry } from './changelogs';
import { WHATSNEW } from './whatsnew';
import { searchGares, nearbyGares, coordGare, coordPoteau, isNetworkError, nearbyStopsWithCoords, regionWideRailStops, NearbyStop, linesForArea, LineChip, comparerLignesParMode, stopPointsForArea, stationExits, modesArret } from './api';
import { GHOST_STOP_ID, GHOST_STOP_LABEL, GHOST_STOP_NAME, GHOST_CHIPS, GHOST_STOP_COORD } from './ghostStop';
import { logger, LogEntry } from './logger';
import { Image as ExpoImage } from 'expo-image';
import { MODE_ICONS } from './modeIcons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';
import NativeSchedules, { type SchedulesRef } from './NativeSchedules';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedLib, { useSharedValue, useDerivedValue, useAnimatedStyle, withSpring, runOnJS, useFrameCallback } from 'react-native-reanimated';
import { registerForPushNotificationsAsync } from './notifications';
import { PanelLayout, panelCardStyle, panelChipStyle, PANEL_CARD_RADIUS } from './PanelLayout';
import { PanelHeader, PanelPillAction } from './PanelHeader';
import { PanelEmptyState } from './PanelEmptyState';
import { Icon, IconAccueilCouleur, IconFavorisCouleur, IconInfoTraficCouleur, IconPositionCouleur } from './Icon';
import TraficScreen from './TraficScreen';
import { FadeBottom, FadeTop, hexToRgba, FONDU_HAUT, FONDU_BAS } from './Fade';
import { definirRect, retirerRect, definirOrigine, definirEnvoyeur, renvoyerVerre } from './verreWeb';
import type { RectVerre } from './verreWeb';
// Import de type uniquement : pas de require() exécuté au chargement du bundle.
// react-native-device-info (dépendance de cette lib) plante à l'évaluation de
// son module si le natif n'est pas lié (Expo Go, ou dev client pas encore
// reconstruit) — on charge donc ces deux libs en require() différé, dans un
// try/catch, uniquement quand on en a réellement besoin (voir plus bas).
import type SpInAppUpdatesType from 'sp-react-native-in-app-updates';
import type { AndroidUpdateType, AndroidInstallStatus } from 'sp-react-native-in-app-updates';

// ─── CONSTANTES DE LAYOUT ────────────────────────────────────────────────────
const NAV_BAR_BOTTOM = 16;
const NAV_BAR_HEIGHT = 58;
const SEARCH_BAR_HEIGHT = 52;
const SEARCH_BAR_BOTTOM = NAV_BAR_BOTTOM + NAV_BAR_HEIGHT + 10;
// En layout large, le tiroir permanent est plus étroit que sur téléphone
// (420, voir sideCard) — il reste affiché en continu plutôt que de passage,
// autant laisser plus de place visible à la carte derrière lui.
const WIDE_PANEL_WIDTH = 340;
// La carte reste toujours plein écran (voir AccueilScreen) — cette valeur
// ne sert qu'à confiner les CONTRÔLES flottants (recherche, barre de nav...)
// à la zone non recouverte par le tiroir, pour qu'ils ne s'affichent pas
// par-dessus lui (zIndex plus élevé). Largeur du tiroir + sa marge au bord
// (12) + un espace avant les contrôles (12).
const WIDE_PANEL_INSET = WIDE_PANEL_WIDTH + 24;

// Étoile favoris avec petit retour visuel à l'ajout (pas au retrait) : un
// "pop" du trait + un halo jaune qui grossit et s'estompe, pour qu'ajouter
// un favori se sente comme une vraie action plutôt qu'un simple changement
// de couleur silencieux. Le halo est un cercle animé en opacité/échelle
// (pas une ombre colorée `shadowColor`, ignorée par Android — seule
// `elevation` compte côté Android, et elle ne prend pas de couleur).
function FavoriStar({ active, onPress, size = 22, color }: { active: boolean; onPress: () => void; size?: number; color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const prevActive = useRef(active);
  useEffect(() => {
    if (active && !prevActive.current) {
      scale.setValue(1);
      glow.setValue(0);
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, friction: 3 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }),
      ]).start();
      Animated.timing(glow, { toValue: 1, duration: 450, useNativeDriver: true }).start(() => glow.setValue(0));
    }
    prevActive.current = active;
  }, [active]);

  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.2] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.55, 0] });

  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', width: size, height: size, borderRadius: size / 2,
            backgroundColor: '#F2B705', opacity: glowOpacity, transform: [{ scale: glowScale }],
          }}
        />
        <Animated.View style={{ transform: [{ scale }] }}>
          <Icon name="favoris" size={size} color={color} />
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`;
}

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Gare = { id: string; label: string; lat?: number; lon?: number; distance?: number; modes?: string[] };
type FavorisProps = {
  // Tiroir en verre dépoli : pas de fondu de couleur unie (il ferait un halo).
  verre?: boolean;
  favoris: Gare[];
  onSupprimerFavori: (gare: Gare) => void;
  onSelectionnerGare: (id: string, label: string) => void;
  onReordonnerFavoris: (from: number, to: number) => void;
  // Le tiroir reste monté (juste translaté hors écran) quand on le ferme, pour
  // éviter un remount coûteux à chaque ouverture — donc `editMode` doit être
  // remis à zéro explicitement à la fermeture, sinon il persiste à la
  // prochaine ouverture.
  actif: boolean;
};
type AccueilProps = {
  onBasculerFavori: (gare: Gare) => void;
  estFavori: (id: string) => boolean;
  onHeaderLayout: (height: number) => void;
  onGareChoisie: (id: string, label: string) => void;
  onOpenSettings: () => void;
  onClosePanel: () => void;
  onMapTapped: () => void;
  activeTab: string;
  mapRef: React.RefObject<MapWebViewRef | null>;
  panelOpen: boolean;
  updateDownloadingBg: boolean;
  showDebugOverlay: boolean;
  gareActuelle: { id: string; label: string } | null;
  onQuitterVueArret: () => void;
  onRevenirAccueil: () => void;
  // Sur écran large (voir responsive.ts), le tiroir Favoris/Trafic ouvert
  // reste affiché en permanence et recouvre la carte (comme sur téléphone,
  // elle ne se redimensionne plus) — ces valeurs animées servent à confiner
  // les contrôles flottants (header, réglages, recherche) à la zone non
  // recouverte, avec un glissement en douceur plutôt qu'un saut (voir
  // navLeftInsetAnim/navRightInsetAnim dans AppInner, même mécanisme que la
  // barre de nav).
  mapLeftInset: Animated.Value;
  mapRightInset: Animated.Value;
  // Voile sombre sur la carte seule (pas sur le titre ni les réglages) quand un tiroir est ouvert.
  voileOpacity?: Animated.AnimatedAddition<number>;
};

// ─── RENDU CONTENU CHANGELOG ─────────────────────────────────────────────────
function renderInline(text: string, baseColor: string, c: ThemeColors): React.ReactNode[] {
  return text.split(/(\*\*.*?\*\*)/g).map((seg, i) => {
    if (seg.startsWith('**') && seg.endsWith('**')) {
      return (
        <Text key={i} style={{ fontFamily: 'GrandParis-Bold', color: c.text }}>
          {seg.slice(2, -2)}
        </Text>
      );
    }
    return <Text key={i} style={{ fontFamily: 'GrandParis-Light', color: baseColor }}>{seg}</Text>;
  });
}

function ChangelogContent({ content, c }: { content: string; c: ThemeColors }) {
  const renderLine = (line: string, i: number, insideCard = false) => {
    const trimmed = line.trim();
    const isBullet = /^[*\-•]/.test(trimmed);
    const isSection = trimmed.startsWith('**') && trimmed.endsWith('**');

    if (isSection) {
      return (
        <Text key={i} style={{ fontFamily: 'GrandParis-Bold', color: c.text, fontSize: 13, lineHeight: 20, marginTop: i === 0 ? 0 : 6 }}>
          {trimmed.slice(2, -2)}
        </Text>
      );
    }

    const rawText = isBullet ? trimmed.replace(/^[*\-•]\s*/, '') : trimmed;
    return (
      <Text key={i} style={{ fontSize: 13, lineHeight: insideCard ? 22 : 20, paddingLeft: isBullet ? 4 : 0 }}>
        {isBullet && <Text style={{ fontFamily: 'GrandParis-Light', color: c.textSub }}>{'• '}</Text>}
        {renderInline(rawText, insideCard ? c.text : c.textSub, c)}
      </Text>
    );
  };

  type Block = { type: 'line'; text: string } | { type: 'card'; lines: string[] };
  const blocks: Block[] = [];
  let inCard = false;
  let cardLines: string[] = [];

  for (const line of content.split('\n')) {
    if (line.trim() === '===') {
      if (inCard) {
        blocks.push({ type: 'card', lines: cardLines });
        cardLines = [];
        inCard = false;
      } else {
        inCard = true;
      }
    } else if (inCard) {
      if (line.trim()) cardLines.push(line);
    } else {
      if (line.trim()) blocks.push({ type: 'line', text: line });
    }
  }

  return (
    <View style={{ gap: 3 }}>
      {blocks.map((block, bi) => {
        if (block.type === 'card') {
          return (
            <View key={bi} style={{
              borderRadius: 10, borderWidth: 1, borderColor: c.accent,
              backgroundColor: c.bgCard, padding: 10, gap: 6, marginVertical: 4,
            }}>
              {block.lines.map((line, li) => renderLine(line, li, true))}
            </View>
          );
        }
        return renderLine(block.text, bi);
      })}
    </View>
  );
}

// ─── PAGE PARAMÈTRES ─────────────────────────────────────────────────────────
function SettingsModal({ visible, onClose, showDebugOverlay, setShowDebugOverlay, flouActif, setFlouActif, pushToken, onOpenGhostStop, onReplayWhatsNew, onTestUpdateModal, onReplayOnboarding, hasPendingUpdate, onOpenPendingUpdate, onClearMapCache, onReportBug }: { visible: boolean; onClose: () => void; showDebugOverlay: boolean; setShowDebugOverlay: (v: boolean) => void; flouActif: boolean; setFlouActif: (v: boolean) => void; pushToken: string | null; onOpenGhostStop: () => void; onReplayWhatsNew: () => void; onTestUpdateModal: () => void; onReplayOnboarding: () => void; hasPendingUpdate: boolean; onOpenPendingUpdate: () => void; onClearMapCache: () => void; onReportBug: () => void }) {
  const c = useColors();
  const { pref, setPref, isDark, oled, setOled } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();
  // Pas de <Modal> ici (voir le commentaire au-dessus de ModalBackdrop) :
  // sur un écran redimensionnable en direct (fenêtre Samsung DeX...), la
  // fenêtre native séparée qu'ouvre <Modal> se retrouvait mal dimensionnée
  // (miniature, coincée en haut à gauche) au lieu de suivre la vraie taille
  // de la fenêtre hôte. Même mécanisme de montage/animation que les autres
  // modales "maison" (voir useModalCardAnim), en glissant depuis le bas.
  const { height: winH } = useWindowDimensions();
  const { anim: slideAnim, mounted } = useModalCardAnim(visible, true);
  // Thème sombre : l'ombre claire des cartes est invisible, on la renforce (noire, plus large).
  const ombreCarte = isDark ? { shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 } : null;
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>(() => logger.get());
  useEffect(() => { const unsub = logger.subscribe(() => setLogs(logger.get())); return () => { unsub(); }; }, []);
  const [devMode, setDevMode] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('@gp_dev_mode').then(v => { if (v === '1') setDevMode(true); });
  }, []);

  // Logo qui tourne sur lui-même pour signaler que le mode dev est actif
  const devLogoSpin = useRef(new Animated.Value(0)).current;
  const devLogoSpinLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (devMode && visible) {
      devLogoSpin.setValue(0);
      devLogoSpinLoopRef.current = Animated.loop(
        Animated.timing(devLogoSpin, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
      );
      devLogoSpinLoopRef.current.start();
    } else {
      devLogoSpinLoopRef.current?.stop();
      Animated.timing(devLogoSpin, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
    return () => devLogoSpinLoopRef.current?.stop();
  }, [devMode, visible]);
  const devLogoSpinDeg = devLogoSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const [showChangelog, setShowChangelog] = useState(false);
  const changelogAnim = useRef(new Animated.Value(0)).current;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const advancedAnim = useRef(new Animated.Value(0)).current;
  // Taille du cache de tuiles de la WebView (dossier interne de Chromium), lue
  // à l'ouverture des paramètres avancés et après chaque vidage.
  const [octetsCache, setOctetsCache] = useState<number | null>(null);
  const rafraichirTailleCache = useCallback(() => {
    try {
      const dossier = new Directory(Paths.cache, 'WebView', 'Default', 'HTTP Cache');
      setOctetsCache(dossier.exists ? (dossier.size ?? 0) : 0);
    } catch {
      setOctetsCache(null);
    }
  }, []);
  useEffect(() => { if (showAdvanced) rafraichirTailleCache(); }, [showAdvanced, rafraichirTailleCache]);
  const formaterOctets = (o: number) =>
    o >= 1024 * 1024 ? `${(o / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo` : `${Math.round(o / 1024)} Ko`;
  // Petite animation au vidage : un balai balaie le chiffre, qui décompte
  // jusqu'à 0 (p va de 0 à 1 ; animation JS car elle pilote du texte).
  const balai = useRef(new Animated.Value(0)).current;
  const [balaiActif, setBalaiActif] = useState(false);
  const [octetsAffiches, setOctetsAffiches] = useState<number | null>(null);
  const viderAvecAnimation = () => {
    const depart = octetsCache ?? 0;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClearMapCache();
    setBalaiActif(true);
    balai.setValue(0);
    const id = balai.addListener(({ value }) => setOctetsAffiches(Math.round(depart * (1 - value))));
    Animated.timing(balai, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: false }).start(() => {
      balai.removeListener(id);
      setBalaiActif(false);
      setOctetsAffiches(null);
      rafraichirTailleCache();
    });
  };
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const contentAnim = useRef(new Animated.Value(0)).current;

  const [toggleWidth, setToggleWidth] = useState(0);

  const toggleVersion = (version: string) => {
    if (activeVersion === version) {
      Animated.timing(contentAnim, { toValue: 0, duration: 180, useNativeDriver: true })
        .start(() => setActiveVersion(null));
    } else if (activeVersion !== null) {
      Animated.timing(contentAnim, { toValue: 0, duration: 140, useNativeDriver: true })
        .start(() => {
          setActiveVersion(version);
          contentAnim.setValue(0);
          Animated.timing(contentAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
        });
    } else {
      setActiveVersion(version);
      contentAnim.setValue(0);
      Animated.timing(contentAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  };
  const renderChangelogEntry = (entry: ChangelogEntry, showDivider: boolean) => (
    <View key={entry.version}>
      {showDivider && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />}
      <TouchableOpacity
        style={styles.changelogRow}
        onPress={() => toggleVersion(entry.version)}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.changelogVersion, { color: c.text }]}>v{entry.version}</Text>
            {entry.codename && (
              <View style={styles.codenameBadge}>
                <Text style={styles.codenameBadgeText}>{entry.codename}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.changelogDate, { color: c.textSub }]}>{entry.date}</Text>
        </View>
        <Text style={{ color: c.textSub, fontSize: 18 }}>
          {activeVersion === entry.version ? '˅' : '›'}
        </Text>
      </TouchableOpacity>
      {activeVersion === entry.version && (
        <Animated.View style={{
          opacity: contentAnim,
          transform: [{ translateY: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
        }}>
          <View style={[styles.changelogContent, { borderTopColor: c.border }]}>
            <ChangelogContent content={entry.content} c={c} />
          </View>
        </Animated.View>
      )}
    </View>
  );

  const [versionTaps, setVersionTaps] = useState(0);
  const [trainVisible, setTrainVisible] = useState(false);
  const trainAnim = useRef(new Animated.Value(0)).current;
  const klaxon = useAudioPlayer(require('./others/klaxon.mp3'));

  const TRAINS = [
    require('./others/rerng.png'),
    require('./others/z2n.png'),
    require('./others/regio2n.png'),
    require('./others/francilien.png'),
  ];
  const [trainImg, setTrainImg] = useState(TRAINS[0]);

  function lancerTrain() {
    setTrainImg(TRAINS[Math.floor(Math.random() * TRAINS.length)]);
    klaxon.seekTo(0);
    klaxon.play();
    const screenW = Dimensions.get('window').width;
    trainAnim.setValue(-1200);
    setTrainVisible(true);
    Animated.timing(trainAnim, {
      toValue: screenW,
      duration: 3500,
      useNativeDriver: true,
    }).start(() => setTrainVisible(false));
  }

  const THEME_OPTIONS: { key: ThemePref; icon: string; label: string }[] = [
    { key: 'auto',  icon: '🌐', label: 'Système' },
    { key: 'light', icon: '☀️', label: 'Clair'  },
    { key: 'dark',  icon: '🌙', label: 'Sombre' },
  ];
  const cursorAnim = useRef(new Animated.Value(THEME_OPTIONS.findIndex(o => o.key === pref))).current;
  useEffect(() => {
    const idx = THEME_OPTIONS.findIndex(o => o.key === pref);
    Animated.spring(cursorAnim, { toValue: idx, useNativeDriver: true, tension: 280, friction: 22 }).start();
  }, [pref]);

  const LIENS = [
    { icon: '💬', label: 'Chaîne WhatsApp', url: 'https://whatsapp.com/channel/0029VbCSkQt5vKA7MojdZH3N' },
    { icon: '🐛', label: 'Signaler un bug',      url: BUG_FORM_URL, action: onReportBug },
    { icon: '✉️',  label: 'Contact',              url: 'mailto:contact@grandpaname.fun' },
  ];

  if (!mounted) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, {
      zIndex: 20000, elevation: 20,
      transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [winH, 0] }) }],
    }]}>
      <View style={[styles.settingsPage, { backgroundColor: c.bg, paddingTop: insets.top }]}>

        {/* En-tête au gabarit des volets (PanelHeader) : icône + titre 24 px, action « Fermer » alignée. */}
        <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 4 }}>
          <PanelHeader
            icon={<Icon name="parametres" size={26} color={c.accent} />}
            title="Paramètres"
            right={<PanelPillAction label="Fermer" onPress={onClose} />}
          />
        </View>

        <View style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 72 }}>

            {/* ── Apparence ── */}
            <Text style={[styles.settingsSection, { color: c.textSub }]}>APPARENCE</Text>
            <View style={[styles.settingsCard, ombreCarte, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
              <Text style={[styles.settingsRowLabel, { color: c.text }]}>Thème</Text>
              <View
                style={[styles.themeToggle, { backgroundColor: c.bgSubtle }]}
                onLayout={(e) => setToggleWidth(e.nativeEvent.layout.width)}
              >
                {toggleWidth > 0 && (() => {
                  const PAD = 3, GAP = 2, N = THEME_OPTIONS.length;
                  const optW = (toggleWidth - 2 * PAD - (N - 1) * GAP) / N;
                  const cursorX = cursorAnim.interpolate({
                    inputRange: [0, 1, 2],
                    outputRange: [0, optW + GAP, 2 * (optW + GAP)],
                  });
                  return (
                    <Animated.View style={{
                      position: 'absolute', left: PAD, top: PAD, bottom: PAD, width: optW,
                      borderRadius: 13, backgroundColor: c.bgCard,
                      shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6,
                      shadowOffset: { width: 0, height: 2 },
                      transform: [{ translateX: cursorX }],
                    }} />
                  );
                })()}
                {THEME_OPTIONS.map(({ key, icon, label }) => (
                  <TouchableOpacity key={key} style={styles.themeOption} onPress={() => setPref(key)}>
                    <Text style={{ fontSize: 15, backgroundColor: 'transparent' }}>{icon}</Text>
                    <Text style={[styles.themeOptionLabel, { color: pref === key ? c.text : c.textSub, backgroundColor: 'transparent' }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── À propos ── */}
            <Text style={[styles.settingsSection, { color: c.textSub }]}>À PROPOS</Text>
            <View style={[styles.settingsCard, ombreCarte, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
              <View style={styles.aProposHeader}>
                <TouchableOpacity
                  delayLongPress={5000}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    const newVal = !devMode;
                    setDevMode(newVal);
                    AsyncStorage.setItem('@gp_dev_mode', newVal ? '1' : '0').catch(() => {});
                    if (Platform.OS === 'android') {
                      ToastAndroid.show(newVal ? '🛠️ Mode dev activé' : '🛠️ Mode dev désactivé', ToastAndroid.SHORT);
                    }
                  }}
                >
                  <Animated.Image
                    source={require('./assets/icon.png')}
                    style={[styles.aProposLogo, { transform: [{ rotate: devLogoSpinDeg }] }]}
                  />
                </TouchableOpacity>
                <View>
                  <Text style={[styles.aProposNom, { color: c.text }]}>Grand Paname</Text>
                  <TouchableOpacity onPress={() => {
                    const next = versionTaps + 1;
                    setVersionTaps(next);
                    if (next >= 7) { setVersionTaps(0); lancerTrain(); }
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Text style={[styles.aProposVersion, { color: c.textSub }]}>Version {APP_VERSION}</Text>
                      <View style={styles.codenameBadge}>
                        <Text style={styles.codenameBadgeText}>{APP_CODENAME}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.settingsDivider, { backgroundColor: c.border }]} />
              <Text style={[styles.aProposLigne, { color: c.textSub }]}>🚀 Propulsé par Grand Paname</Text>
              <Text style={[styles.aProposLigne, { color: c.textSub }]}>❤️ Fait avec amour par un Francilien</Text>
              <Text style={[styles.aProposLigne, { color: c.textSub }]}>✨ Réalisé à l'aide de Gemini et Claude</Text>
            </View>

            {/* ── Liens ── */}
            <Text style={[styles.settingsSection, { color: c.textSub }]}>LIENS</Text>
            <View style={[styles.settingsCard, ombreCarte, { backgroundColor: c.bgCard, borderColor: c.borderCard, padding: 0 }]}>
              {LIENS.map((item, i) => (
                <TouchableOpacity
                  key={item.url}
                  style={[
                    styles.lienRow,
                    i < LIENS.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                  ]}
                  onPress={() => { if ('action' in item && item.action) item.action(); else Linking.openURL(item.url); }}
                >
                  <Text style={{ fontSize: 17 }}>{item.icon}</Text>
                  <Text style={[styles.lienLabel, { color: c.text }]}>{item.label}</Text>
                  <Text style={{ color: c.textSub, fontSize: 20 }}>›</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Historique des versions ── */}
            <Text style={[styles.settingsSection, { color: c.textSub }]}>
              HISTORIQUE DES VERSIONS
            </Text>
            <View style={[styles.settingsCard, ombreCarte, { backgroundColor: c.bgCard, borderColor: c.borderCard, padding: 0 }]}>
              {CHANGELOGS.slice(0, 3).map((entry, i) => renderChangelogEntry(entry, i > 0))}
            </View>
            {CHANGELOGS.length > 3 && (
              <TouchableOpacity
                style={{ alignSelf: 'center', marginTop: 10 }}
                onPress={() => {
                  if (!showChangelog) {
                    setShowChangelog(true);
                    changelogAnim.setValue(0);
                    Animated.timing(changelogAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
                  } else {
                    Animated.timing(changelogAnim, { toValue: 0, duration: 200, useNativeDriver: true })
                      .start(() => setShowChangelog(false));
                  }
                }}
              >
                <Text style={{ color: c.textSub, fontSize: 12, fontFamily: 'GrandParis-Medium' }}>
                  {showChangelog ? 'Masquer les anciennes versions' : 'Afficher les plus anciennes versions'}
                </Text>
              </TouchableOpacity>
            )}
            {showChangelog && (
              <Animated.View style={[styles.settingsCard, ombreCarte, { backgroundColor: c.bgCard, borderColor: c.borderCard, padding: 0, marginTop: 10, opacity: changelogAnim, transform: [{ translateY: changelogAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }]}>
                {CHANGELOGS.slice(3).map((entry, i) => renderChangelogEntry(entry, i > 0))}
              </Animated.View>
            )}

            {/* ── Paramètres avancés ── */}
            <TouchableOpacity
              style={[styles.settingsCard, ombreCarte, { backgroundColor: c.bgCard, borderColor: '#f39c1250', borderWidth: 1, marginTop: 24, flexDirection: 'row', alignItems: 'center' }]}
              onPress={() => {
                if (!showAdvanced) {
                  setShowAdvanced(true);
                  advancedAnim.setValue(0);
                  Animated.timing(advancedAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
                } else {
                  Animated.timing(advancedAnim, { toValue: 0, duration: 200, useNativeDriver: true })
                    .start(() => setShowAdvanced(false));
                }
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#f39c1225', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Icon name="parametres" size={18} color="#f39c12" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingsRowLabel, { color: c.text }]}>Paramètres Avancés</Text>
                <Text style={{ fontSize: 11, color: c.textSub, fontFamily: 'GrandParis-Light', marginTop: 2 }}>
                  Pour les plus téméraires
                </Text>
              </View>
              <Text style={{ color: c.textSub, fontSize: 20 }}>
                {showAdvanced ? '˅' : '›'}
              </Text>
            </TouchableOpacity>
            {showAdvanced && (
              <Animated.View style={{
                opacity: advancedAnim,
                transform: [{ translateY: advancedAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
              }}>
                <View style={[styles.settingsCard, ombreCarte, { backgroundColor: c.bgCard, borderColor: c.borderCard, marginTop: 10 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: isDark ? 1 : 0.5 }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={[styles.settingsRowLabel, { color: c.text }]}>Mode sombre OLED</Text>
                      <Text style={{ fontSize: 11, color: c.textSub, fontFamily: 'GrandParis-Light', marginTop: 2 }}>
                        Tranforme le mode sombre en noir profond pour économiser la batterie sur les écrans OLED{!isDark ? ' (nécessite le thème sombre)' : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      disabled={!isDark}
                      onPress={() => setOled(!oled)}
                      style={{
                        width: 44, height: 26, borderRadius: 13,
                        backgroundColor: oled ? c.accent : c.dragBar,
                        justifyContent: 'center', paddingHorizontal: 3,
                      }}
                    >
                      <View style={{
                        width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                        alignSelf: oled ? 'flex-end' : 'flex-start',
                      }} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={[styles.settingsCard, ombreCarte, { backgroundColor: c.bgCard, borderColor: c.borderCard, marginTop: 10 }]}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    onPress={viderAvecAnimation}
                    disabled={balaiActif}
                  >
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={[styles.settingsRowLabel, { color: c.text }]}>Vider le cache de la carte</Text>
                      <Text style={{ fontSize: 11, color: c.textSub, fontFamily: 'GrandParis-Light', marginTop: 2 }}>
                        Supprime les images de carte mémorisées sur le téléphone. Elles se retéléchargeront au fur et à mesure.
                      </Text>
                    </View>
                    {octetsCache != null && (
                      <View style={{ marginRight: 8, width: 72, alignItems: 'flex-end', justifyContent: 'center' }}>
                        <Text style={{ color: c.textSub, fontSize: 13, fontFamily: 'GrandParis-Medium' }}>
                          {formaterOctets(balaiActif ? (octetsAffiches ?? octetsCache) : octetsCache)}
                        </Text>
                        {balaiActif && (
                          <Animated.Text
                            pointerEvents="none"
                            style={{
                              position: 'absolute', right: 0, fontSize: 28,
                              opacity: balai.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }),
                              transform: [
                                { translateX: balai.interpolate({ inputRange: [0, 1], outputRange: [14, -46] }) },
                                { rotate: balai.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ['0deg', '-18deg', '10deg', '-18deg', '0deg'] }) },
                              ],
                            }}
                          >🧹</Animated.Text>
                        )}
                      </View>
                    )}
                    <Text style={{ color: c.textSub, fontSize: 20 }}>›</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* ── Débogage (mode dev, caché) ── */}
            {devMode && (
              <>
                <Text style={[styles.settingsSection, { color: c.textSub }]}>DÉBOGAGE</Text>
                <TouchableOpacity
                  style={[styles.settingsCard, ombreCarte, { backgroundColor: c.bgCard, borderColor: c.borderCard, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={onOpenGhostStop}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingsRowLabel, { color: c.text }]}>Arrêt fantôme</Text>
                    <Text style={{ fontSize: 11, color: c.textSub, fontFamily: 'GrandParis-Light', marginTop: 2 }}>
                      Données fictives pour tester le moteur natif
                    </Text>
                  </View>
                  <Text style={{ color: c.textSub, fontSize: 20 }}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.settingsCard, ombreCarte, { backgroundColor: c.bgCard, borderColor: c.borderCard, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: pushToken ? 1 : 0.5 }]}
                  disabled={!pushToken}
                  onPress={async () => {
                    if (!pushToken) return;
                    await Clipboard.setStringAsync(pushToken);
                    if (Platform.OS === 'android') ToastAndroid.show('Token copié !', ToastAndroid.SHORT);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingsRowLabel, { color: c.text }]}>Copier le token de notifications push</Text>
                    <Text style={{ fontSize: 11, color: c.textSub, fontFamily: 'GrandParis-Light', marginTop: 2 }}>
                      {pushToken
                        ? "Colle-le sur expo.dev/notifications pour t'envoyer un test"
                        : 'Indisponible (permission refusée, Expo Go, ou pas encore prêt)'}
                    </Text>
                  </View>
                  <Text style={{ color: c.textSub, fontSize: 18 }}>📋</Text>
                </TouchableOpacity>
                <View style={[styles.settingsCard, ombreCarte, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.settingsRowLabel, { color: c.text }]}>Infos de debug</Text>
                      <Text style={{ fontSize: 11, color: c.textSub, fontFamily: 'GrandParis-Light', marginTop: 2 }}>
                        Affiche le zoom et les coordonnées en direct sur la carte
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setShowDebugOverlay(!showDebugOverlay)}
                      style={{
                        width: 44, height: 26, borderRadius: 13,
                        backgroundColor: showDebugOverlay ? c.accent : c.dragBar,
                        justifyContent: 'center', paddingHorizontal: 3,
                      }}
                    >
                      <View style={{
                        width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                        alignSelf: showDebugOverlay ? 'flex-end' : 'flex-start',
                      }} />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.settingsDivider, { backgroundColor: c.border, marginVertical: 12 }]} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.settingsRowLabel, { color: c.text }]}>Flou (verre dépoli)</Text>
                      <Text style={{ fontSize: 11, color: c.textSub, fontFamily: 'GrandParis-Light', marginTop: 2 }}>
                        Désactive le flou des volets pour comparer la fluidité
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setFlouActif(!flouActif)}
                      style={{
                        width: 44, height: 26, borderRadius: 13,
                        backgroundColor: flouActif ? c.accent : c.dragBar,
                        justifyContent: 'center', paddingHorizontal: 3,
                      }}
                    >
                      <View style={{
                        width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                        alignSelf: flouActif ? 'flex-end' : 'flex-start',
                      }} />
                    </TouchableOpacity>
                  </View>
                  {hasPendingUpdate && (
                    <>
                      <View style={[styles.settingsDivider, { backgroundColor: c.border, marginVertical: 12 }]} />
                      <TouchableOpacity
                        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                        onPress={() => { onClose(); setTimeout(onOpenPendingUpdate, 200); }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.settingsRowLabel, { color: c.text }]}>⬆️ Mettre à jour Grand Paname</Text>
                          <Text style={{ fontSize: 11, color: c.textSub, fontFamily: 'GrandParis-Light', marginTop: 2 }}>
                            Une mise à jour est disponible, tu l'avais reportée
                          </Text>
                        </View>
                        <Text style={{ color: c.textSub, fontSize: 20 }}>›</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  <View style={[styles.settingsDivider, { backgroundColor: c.border, marginVertical: 12 }]} />
                  <TouchableOpacity
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    onPress={() => { onClose(); setTimeout(onReplayWhatsNew, 200); }}
                  >
                    <Text style={[styles.settingsRowLabel, { color: c.text }]}>Rejouer "Quoi de neuf"</Text>
                    <Text style={{ color: c.textSub, fontSize: 20 }}>›</Text>
                  </TouchableOpacity>
                  <View style={[styles.settingsDivider, { backgroundColor: c.border, marginVertical: 12 }]} />
                  <TouchableOpacity
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    onPress={() => { onClose(); setTimeout(onReplayOnboarding, 200); }}
                  >
                    <Text style={[styles.settingsRowLabel, { color: c.text }]}>Rejouer le tutoriel</Text>
                    <Text style={{ color: c.textSub, fontSize: 20 }}>›</Text>
                  </TouchableOpacity>
                  <View style={[styles.settingsDivider, { backgroundColor: c.border, marginVertical: 12 }]} />
                  <TouchableOpacity
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    onPress={() => { onClose(); setTimeout(onTestUpdateModal, 200); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.settingsRowLabel, { color: c.text }]}>Tester la modale de mise à jour</Text>
                      <Text style={{ fontSize: 11, color: c.textSub, fontFamily: 'GrandParis-Light', marginTop: 2 }}>
                        Simule tout le flow (prompt → "téléchargement" → prêt) sans Play Store
                      </Text>
                    </View>
                    <Text style={{ color: c.textSub, fontSize: 20 }}>›</Text>
                  </TouchableOpacity>
                  <View style={[styles.settingsDivider, { backgroundColor: c.border, marginVertical: 12 }]} />
                  <TouchableOpacity
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    onPress={() => setShowLogs(v => !v)}
                  >
                    <Text style={[styles.settingsRowLabel, { color: c.text }]}>
                      Logs ({logs.length})
                    </Text>
                    <Text style={{ color: c.textSub, fontSize: 20 }}>{showLogs ? '˅' : '›'}</Text>
                  </TouchableOpacity>
                  {showLogs && (
                    <>
                      <View style={[styles.settingsDivider, { backgroundColor: c.border, marginTop: 8 }]} />
                      <TouchableOpacity
                        onPress={() => logger.clear()}
                        style={{ alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 8,
                                 backgroundColor: c.bgSubtle, borderRadius: 6, marginBottom: 8 }}
                      >
                        <Text style={{ fontSize: 12, color: c.textSub, fontFamily: 'GrandParis-Light' }}>Effacer</Text>
                      </TouchableOpacity>
                      <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
                        {logs.length === 0
                          ? <Text style={{ color: c.textSub, fontSize: 12, fontFamily: 'GrandParis-Light' }}>Aucun log.</Text>
                          : logs.map((entry, i) => {
                              const d = new Date(entry.ts);
                              const hms = d.toTimeString().slice(0, 8);
                              const color = entry.level === 'ERROR' ? '#e74c3c'
                                          : entry.level === 'WARN'  ? '#e67e22'
                                          : c.textSub;
                              return (
                                <Text key={i} style={{ fontSize: 11, fontFamily: 'GrandParis-Light', color, marginBottom: 2 }}>
                                  {hms} <Text style={{ fontFamily: 'GrandParis-Bold' }}>[{entry.level}]</Text> {entry.msg}
                                </Text>
                              );
                            })
                        }
                      </ScrollView>
                    </>
                  )}
                </View>
              </>
            )}

            {/* Footer */}
            <Text style={[styles.settingsFooter, { color: c.textSub }]}>
              © 2026 Grand Paname. Données : API IDFM, OpenStreetMap.
            </Text>
          </ScrollView>
          {/* Les fondus sont posés APRÈS la liste : posé avant, celui du haut était recouvert
              par le ScrollView et ne se voyait pas. */}
          <FadeTop color={c.bg} />
          <FadeBottom color={c.bg} />
        </View>

      </View>
      {trainVisible && (
        <Animated.Image
          source={trainImg}
          style={[styles.trainEasterEgg, { transform: [{ translateX: trainAnim }] }]}
          resizeMode="contain"
        />
      )}
    </Animated.View>
  );
}

// ─── SIGNALER UN BUG (formulaire Tally intégré) ─────────────────────────────
// Le formulaire s'ouvre dans l'app (fenêtre plein écran) au lieu de renvoyer
// vers le navigateur. La version de l'app et la plateforme sont passées en
// paramètres d'URL : Tally les récupère si le formulaire contient des champs
// cachés nommés "version" et "plateforme" (sinon ils sont simplement ignorés).
const BUG_FORM_URL = 'https://tally.so/r/A7qJxe';

function BugReportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  // Le formulaire (Tally) est une page web claire : en thème sombre on inverse ses
  // couleurs (et on ré-inverse les images) plutôt que de laisser un écran blanc.
  const cssSombre = "(function(){var s=document.createElement('style');s.textContent='html{background:#fefefe!important;filter:invert(1) hue-rotate(180deg)!important}img,video,picture,canvas{filter:invert(1) hue-rotate(180deg)!important}';(document.head||document.documentElement).appendChild(s);})();true;";
  const insets = useSafeAreaInsets();
  const { anim, mounted } = useModalCardAnim(visible);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    if (visible) { setChargement(true); setErreur(false); setEssai(n => n + 1); }
  }, [visible]);
  const url = `${BUG_FORM_URL}?version=${encodeURIComponent(APP_VERSION)}&plateforme=${Platform.OS}`;

  if (!mounted) return null;
  return (
    <ModalBackdrop mounted={mounted} anim={anim} onRequestClose={onClose} fullBleed>
      <View style={{ flex: 1, marginTop: insets.top + 12, backgroundColor: c.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 }}>
          <Text style={{ fontSize: 17, fontFamily: 'GrandParis-Bold', color: c.text }}>🐛 Signaler un bug</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.btnBg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSub }}>✕</Text>
          </TouchableOpacity>
        </View>
        {erreur ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
            <Text style={{ fontSize: 14, fontFamily: 'GrandParis-Medium', color: c.text, textAlign: 'center' }}>Impossible de charger le formulaire.</Text>
            <Text style={{ fontSize: 12, fontFamily: 'GrandParis-Light', color: c.textSub, textAlign: 'center' }}>Vérifie ta connexion, puis réessaie.</Text>
            <TouchableOpacity onPress={() => { setErreur(false); setChargement(true); setEssai(n => n + 1); }} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: c.accent }}>
              <Text style={{ color: '#fff', fontFamily: 'GrandParis-Medium' }}>Réessayer</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL(BUG_FORM_URL)}>
              <Text style={{ color: c.accent, fontFamily: 'GrandParis-Medium' }}>Ouvrir dans le navigateur</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <WebView
              key={essai}
              source={{ uri: url }}
              style={{ flex: 1, backgroundColor: c.bg }}
              injectedJavaScriptBeforeContentLoaded={isDark ? cssSombre : undefined}
              onLoadEnd={() => setChargement(false)}
              onError={() => { setErreur(true); setChargement(false); }}
              onHttpError={() => { setErreur(true); setChargement(false); }}
              setSupportMultipleWindows={false}
              // Reste dans le formulaire ; tout autre lien (ex : site de Tally)
              // s'ouvre dans le navigateur plutôt que dans l'app.
              onShouldStartLoadWithRequest={(req) => {
                if (req.url.startsWith('https://tally.so')) return true;
                if (req.url.startsWith('about:')) return true;
                Linking.openURL(req.url).catch(() => {});
                return false;
              }}
            />
            {chargement ? (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={c.accent} />
              </View>
            ) : null}
          </View>
        )}
      </View>
    </ModalBackdrop>
  );
}

// ─── EASTER EGG : FEUR ───────────────────────────────────────────────────────
function FeurModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const player = useVideoPlayer(require('./others/feur.mp4'), p => { p.loop = false; });
  useEffect(() => {
    if (visible) { player.currentTime = 0; player.play(); }
    else player.pause();
  }, [visible]);
  // Pas de <Modal> ici non plus (voir le commentaire dans SettingsModal) —
  // même souci de fenêtre native mal dimensionnée sur écran redimensionnable.
  if (!visible) return null;
  return (
    <TouchableOpacity
      style={[styles.feurOverlay, StyleSheet.absoluteFill, { zIndex: 20000, elevation: 20 }]}
      onPress={onClose}
      activeOpacity={1}
    >
      <View style={styles.feurBox}>
        <Text style={styles.feurTitre}>FEUR ! 💇‍♂️</Text>
        <VideoView player={player} style={styles.feurVideo} contentFit="contain" nativeControls={false} />
        <Text style={styles.feurHint}>Tape pour fermer</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── ÉCRAN D'ACCUEIL ─────────────────────────────────────────────────────────
// Compteur de fps du mode debug. « UI » : images par seconde du thread
// d'interface (Reanimated, callback à chaque image dessinée) ; « JS » : boucle
// requestAnimationFrame côté JavaScript. Une chute de UI = l'affichage saccade.
function CompteurFps() {
  const [fps, setFps] = useState({ ui: 0, js: 0 });
  const n = useSharedValue(0);
  const t0 = useSharedValue(0);
  const majUi = (v: number) => setFps(f => ({ ...f, ui: v }));
  useFrameCallback((info) => {
    'worklet';
    n.value += 1;
    const t = info.timestamp;
    if (t0.value === 0) { t0.value = t; return; }
    if (t - t0.value >= 500) {
      runOnJS(majUi)(Math.round((n.value * 1000) / (t - t0.value)));
      n.value = 0; t0.value = t;
    }
  });
  useEffect(() => {
    let raf = 0, n2 = 0, debut = Date.now();
    const boucle = () => {
      n2 += 1;
      const dt = Date.now() - debut;
      if (dt >= 500) {
        const v = Math.round((n2 * 1000) / dt);
        setFps(f => ({ ...f, js: v }));
        n2 = 0; debut = Date.now();
      }
      raf = requestAnimationFrame(boucle);
    };
    raf = requestAnimationFrame(boucle);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <Text style={{ color: fps.ui < 45 ? '#ff8a80' : '#b9f6ca', fontSize: 11, fontFamily: 'GrandParis-Medium' }}>
      {fps.ui} fps UI · {fps.js} fps JS
    </Text>
  );
}

// Flou de la barre de nav devant le volet des horaires : flou natif dont la cible est
// le volet seul, MAIS découpé au bord haut du volet. Sans ça, quand le volet est
// bas (ou en train de monter) et que le haut de la barre est encore sur la carte,
// le flou du volet recouvrait le flou de la carte et la barre « perdait son flou ».
// La découpe suit `panelY` (position du volet) à chaque image, sur le thread UI.
function FlouNavSurPanneau({ panelY, hautVolet, navTop, cible, isDark, teinte }: {
  panelY: { value: number }; hautVolet: number; navTop: number;
  cible: React.RefObject<View | null>; isDark: boolean; teinte: string;
}) {
  const H = NAV_BAR_HEIGHT - 2;
  const porte = useAnimatedStyle(() => {
    const d = Math.min(H, Math.max(0, hautVolet + panelY.value - navTop));
    return { position: 'absolute', left: 0, right: 0, top: d, height: H - d, overflow: 'hidden' };
  });
  const interne = useAnimatedStyle(() => {
    const d = Math.min(H, Math.max(0, hautVolet + panelY.value - navTop));
    return { position: 'absolute', left: 0, right: 0, top: -d, height: H };
  });
  const contenu = (
    <>
      <BlurView intensity={22} tint={isDark ? 'dark' : 'light'} blurMethod="dimezisBlurView" blurTarget={cible} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: teinte }]} />
    </>
  );
  return (
    <ReanimatedLib.View pointerEvents="none" style={porte}>
      <ReanimatedLib.View style={interne}>
        {/* Flou uniforme sur toute la barre (un dégradé en haut laissait le texte des horaires net
            sous les libellés). */}
        {contenu}
      </ReanimatedLib.View>
    </ReanimatedLib.View>
  );
}

// Verre dépoli des éléments posés sur la carte (en-tête, réglages, barre de
// recherche, barre de nav, tiroirs). La cible du flou est la carte SEULE (voir
// AccueilScreen) : un BlurView placé dans sa propre cible ne fonctionnerait pas.
// Le voile de teinte est porté par le fond du conteneur (pas par la couche),
// ce qui garde aussi l'ombre. `dense` : petits éléments à texte, plus opaques.
//
// PAR ZONE (2026-09-30) : flouter la carte (une WebView) partout en même temps
// a fait planter l'app (« La version installée de WebView a provoqué la
// défaillance »), crash natif dans le thread de rendu. Le flou est donc activé
// zone par zone pour trouver la cause : mettre une zone à true, tester, etc.
// Sans flou, la zone utilise une teinte plus opaque pour rester lisible.
// 'web' : vrai flou fait DANS la carte (backdrop-filter, voir verreWeb.ts), sans
// limite de nombre ; 'natif' : BlurView natif (max 3 à la fois, sinon plantage) ;
// false : pas de flou, faux verre.
// 'suivi' : flou fait dans la carte comme 'web', mais pour un élément qui BOUGE
// (tiroirs, barre de recherche) : son rectangle est envoyé à la carte à chaque
// mouvement au lieu d'être mesuré une fois.
const VERRE_FLOU_ZONES: Record<'tiroirs' | 'entete' | 'reglages' | 'recherche' | 'nav' | 'pastilles', 'web' | 'suivi' | 'natif' | false> =
  { tiroirs: 'natif', entete: 'web', reglages: 'web', recherche: 'suivi', nav: 'web', pastilles: 'web' };
type ZoneVerre = keyof typeof VERRE_FLOU_ZONES;
// Interrupteur général (réglages de debug) : à faux, aucun flou nulle part.
// Variable de module, mise à jour au rendu d'AppInner (les composants qui
// l'utilisent se rendent en dessous, donc avec la bonne valeur).
let flouGlobalActif = true;
// Flous NATIFS (tiroirs, barre de recherche) : coupés tant qu'une fenêtre à flou
// (nouveautés, bienvenue, mise à jour) est affichée — leurs propres flous ciblent
// toute l'app dont la carte, et le total dépasse le plafond (plantage du WebView).
let flouNatifActif = true;
const BlurCarteContext = createContext<React.RefObject<View | null> | null>(null);
// Opacité de la teinte par zone : [clair, sombre]. Un seul endroit à régler.
// Sans flou (interrupteur coupé ou zone à false), la teinte est plus opaque.
const OPACITE_VERRE: Record<ZoneVerre, [number, number]> = {
  entete: [0.45, 0.5], reglages: [0.45, 0.5], nav: [0.45, 0.5],
  recherche: [0.6, 0.62], tiroirs: [0.68, 0.72], pastilles: [0.45, 0.5],
};
function teinteVerre(isDark: boolean, c: ThemeColors, _dense: boolean, zone: ZoneVerre): string {
  const [clair, sombre] = OPACITE_VERRE[zone];
  const sansFlou = !flouGlobalActif || !VERRE_FLOU_ZONES[zone] || (VERRE_FLOU_ZONES[zone] === 'natif' && !flouNatifActif);
  const a = Math.min(0.95, (isDark ? sombre : clair) + (sansFlou ? 0.2 : 0));
  return isDark ? hexToRgba(c.bgCard, a) : `rgba(255,255,255,${a})`;
}
// Surfaces translucides : pas d'ombre portée (l'ombre d'Android se voit à travers
// un fond translucide et donne l'impression de calques superposés) ; une fine
// bordure claire (sombre : bordure du thème) dessine le contour à la place.
function bordureVerre(isDark: boolean, c: ThemeColors) {
  return { borderWidth: 1, borderColor: isDark ? c.borderCard : 'rgba(255,255,255,0.6)' };
}
function CoucheVerre({ zone, rayon = 16, ombre, idVerre, fondu, masque, cibleNatif, natifForce }: { zone: ZoneVerre; rayon?: number; ombre?: string; idVerre?: string; fondu?: boolean; masque?: boolean; cibleNatif?: React.RefObject<View | null>; natifForce?: boolean }) {
  const idRect = idVerre ?? zone;
  const ref = useContext(BlurCarteContext);
  const { isDark } = useContext(ThemeContext);
  const coul = useColors();
  const zoneMode = flouGlobalActif ? VERRE_FLOU_ZONES[zone] : false;
  // `cibleNatif` : flou natif d'un élément posé sur un autre élément NATIF (ex: la barre
  // de nav devant le volet des horaires) — le flou de la carte n'y verrait que le
  // volet opaque. La cible ne contient pas de WebView, donc sans risque de plantage.
  const surNatif = !!cibleNatif && flouGlobalActif && flouNatifActif && zoneMode !== false;
  // `natifForce` : flou natif collé à l'élément pendant qu'il glisse (barre de
  // recherche qui suit le clavier) — le flou de la carte aurait du retard.
  const natifOk = !!natifForce && flouGlobalActif && flouNatifActif && zoneMode !== false;
  const mode = surNatif ? 'panneau' : natifOk ? 'natif' : (zoneMode === 'natif' && !flouNatifActif ? false : zoneMode);
  // Le flou de la carte reste actif même quand le flou du volet prend le relais
  // (mode 'panneau') : le volet monte en ~0,3 s, et tant qu'il ne recouvre pas
  // toute la barre, sa partie encore sur la carte doit rester floutée.
  const webActif = mode === 'web' || (mode === 'panneau' && zoneMode === 'web');
  const vue = useRef<View>(null);
  const fonduFait = useRef(false);
  const dernierRect = useRef<RectVerre | null>(null);
  const mesurer = useCallback(() => {
    vue.current?.measureInWindow((x, y, w, h) => {
      if (w <= 0 || h <= 0) return;
      dernierRect.current = { id: idRect, x, y, w, h, r: rayon, o: ombre };
      // `fondu` : le flou apparaît en fondu (même durée que l'élément natif) au lieu de surgir.
      if (fondu && !fonduFait.current) {
        fonduFait.current = true;
        definirRect({ id: idRect, x, y, w, h, r: rayon, o: ombre, op: 0 });
        setTimeout(() => definirRect({ id: idRect, x, y, w, h, r: rayon, o: ombre, op: 1, anim: true, d: 300 }), 40);
      } else definirRect({ id: idRect, x, y, w, h, r: rayon, o: ombre, op: fondu ? 1 : undefined });
    });
  }, [idRect, rayon, ombre, fondu]);
  // `masque` : l'élément natif s'estompe (200 ms) → le flou s'estompe avec lui.
  useEffect(() => {
    if (masque && dernierRect.current && webActif) definirRect({ ...dernierRect.current, op: 0, anim: true, d: 200 });
  }, [masque]);
  useEffect(() => {
    if (!webActif) return;
    mesurer();
    return () => { fonduFait.current = false; retirerRect(idRect); };
  }, [webActif, mesurer, idRect]);
  return (
    <>
      {mode === 'panneau' && <BlurView intensity={22} tint={isDark ? 'dark' : 'light'} blurMethod="dimezisBlurView" blurTarget={cibleNatif} style={StyleSheet.absoluteFill} pointerEvents="none" />}
      {mode === 'panneau' && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: teinteVerre(isDark, coul, true, zone) }]} />}
      {/* Flou natif : il est dessiné PAR-DESSUS le fond du conteneur, donc la teinte
          doit être une couche au-dessus du flou (sinon elle est invisible). */}
      {mode === 'natif' && <BlurView intensity={zone === 'recherche' ? 30 : 22} tint={isDark ? 'dark' : 'light'} blurMethod="dimezisBlurView" blurTarget={ref ?? undefined} style={StyleSheet.absoluteFill} pointerEvents="none" />}
      {mode === 'natif' && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: teinteVerre(isDark, coul, true, zone) }]} />}
      {webActif && <View ref={vue} collapsable={false} onLayout={mesurer} pointerEvents="none" style={StyleSheet.absoluteFill} />}
      {/* Reflet en dégradé, sur toutes les surfaces (avec ou sans flou) : donne
          l'aspect « verre » aux zones qui n'ont pas le droit au vrai flou. */}
      <LinearGradient
        pointerEvents="none"
        colors={isDark ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
}

function AccueilScreen({ onBasculerFavori, estFavori, onHeaderLayout, onGareChoisie, onOpenSettings, onClosePanel, onMapTapped, activeTab, mapRef, panelOpen, updateDownloadingBg, showDebugOverlay, gareActuelle, onQuitterVueArret, onRevenirAccueil, mapLeftInset, mapRightInset, voileOpacity }: AccueilProps) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();
  const [loadingGps, setLoadingGps] = useState(false);
  const [gpsSearchStatus, setGpsSearchStatus] = useState<string | null>(null);
  const [followingLocation, setFollowingLocation] = useState(false);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const headingWatchRef = useRef<Location.LocationSubscription | null>(null);
  const lastHeadingRef = useRef<number | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  useEffect(() => {
    return () => {
      locationWatchRef.current?.remove();
      headingWatchRef.current?.remove();
    };
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Gare[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [feurVisible, setFeurVisible] = useState(false);
  const [headerBarHeight, setHeaderBarHeight] = useState(0);

  // Logo qui tourne sur lui-même pendant le téléchargement d'une mise à jour
  const logoSpin = useRef(new Animated.Value(0)).current;
  const logoSpinLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (updateDownloadingBg) {
      logoSpin.setValue(0);
      logoSpinLoopRef.current = Animated.loop(
        Animated.timing(logoSpin, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
      );
      logoSpinLoopRef.current.start();
    } else {
      logoSpinLoopRef.current?.stop();
      Animated.timing(logoSpin, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
    return () => logoSpinLoopRef.current?.stop();
  }, [updateDownloadingBg]);
  const logoSpinDeg = logoSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // Pilule "mise à jour en cours" qui glisse depuis le haut, sous le header
  const [updatePillMounted, setUpdatePillMounted] = useState(false);
  const updatePillAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (updateDownloadingBg) {
      setUpdatePillMounted(true);
      Animated.spring(updatePillAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 12 }).start();
    } else if (updatePillMounted) {
      Animated.timing(updatePillAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setUpdatePillMounted(false));
    }
  }, [updateDownloadingBg]);

  const blurCarteRef = useContext(BlurCarteContext);
  const origineCarteRef = useRef<View>(null);
  useEffect(() => {
    definirEnvoyeur(liste => mapRef.current?.setGlassRects(liste));
    return () => definirEnvoyeur(null);
  }, [mapRef]);
  // Même mouvement à ressort que les tiroirs et la barre de nav (voir guide graphique).
  // Barre de recherche : elle ne glisse plus, elle s'estompe, change de place, puis
  // réapparaît. Un glissement laissait le flou (fait dans la carte, donc décalé
  // d'une image ou deux) traîner derrière ; un fondu ne montre aucun décalage.
  const barreOpacite = useRef(new Animated.Value(1)).current;
  const jetonBarre = useRef(0);
  // Clavier : la barre glisse au-dessus de lui (ressort) avec un flou NATIF collé
  // à elle ; hors clavier, son flou est celui de la carte (fondu, voir ressortBarre).
  const [barreNative, setBarreNative] = useState(false);
  const glisserBarre = (toValue: number, fin?: () => void) => {
    jetonBarre.current++;
    barreOpacite.setValue(1);
    retirerRect('recherche');
    Animated.spring(searchBarBottom, { toValue, stiffness: 120, damping: 15, mass: 0.5, useNativeDriver: false }).start(({ finished }) => { if (finished) fin?.(); });
  };
  const ressortBarre = (v: Animated.Value, toValue: number) => {
    const actuel = (v as any).__getValue() as number;
    if (actuel === toValue) return;
    const jeton = ++jetonBarre.current;
    const cacher = toValue < 0;
    const dejaCachee = actuel < 0;
    if (dejaCachee && cacher) { v.setValue(toValue); return; }
    envoyerVerreRecherche(actuel, true, 0, 110);
    Animated.timing(barreOpacite, { toValue: 0, duration: 110, useNativeDriver: false }).start(({ finished }) => {
      if (!finished || jeton !== jetonBarre.current) return;
      v.setValue(toValue);
      if (cacher) return;
      envoyerVerreRecherche(toValue, false, 0, 0);
      setTimeout(() => { if (jeton === jetonBarre.current) envoyerVerreRecherche(toValue, true, 1, 180); }, 30);
      Animated.timing(barreOpacite, { toValue: 1, duration: 180, useNativeDriver: false }).start();
    });
  };
  const searchBarBottom = useRef(new Animated.Value(SEARCH_BAR_BOTTOM)).current;
  const resultsBottom   = useRef(Animated.add(searchBarBottom, SEARCH_BAR_HEIGHT + 8)).current;
  const panelOpenRef = useRef(panelOpen);
  // La barre de recherche se range aussi quand un tiroir (Favoris/Trafic) s'ouvre.
  const barreRangee = panelOpen || activeTab !== 'accueil';
  // Verre de la barre de recherche : la carte anime elle-même le déplacement
  // (transition CSS de `bottom`), on ne lui envoie que la position cible.
  const { width: largeurFenetre } = useWindowDimensions();
  const flouOn = flouGlobalActif;
  const envoyerVerreRecherche = (b: number, anim: boolean, op = 1, d = 260) => {
    if (!flouGlobalActif || VERRE_FLOU_ZONES.recherche !== 'suivi') return;
    definirRect({ id: 'recherche', x: largeurFenetre * 0.06, w: largeurFenetre * 0.88, h: SEARCH_BAR_HEIGHT, b, r: 30, o: '0 2px 8px rgba(0,0,0,0.09)', anim, d, op });
  };
  useEffect(() => {
    if (!flouOn || VERRE_FLOU_ZONES.recherche !== 'suivi') { retirerRect('recherche'); return; }
    envoyerVerreRecherche((searchBarBottom as any).__getValue(), false);
    return () => retirerRect('recherche');
  }, [flouOn, largeurFenetre]);
  panelOpenRef.current = barreRangee;

  useEffect(() => {
    ressortBarre(searchBarBottom, barreRangee ? -(SEARCH_BAR_HEIGHT + 20) : SEARCH_BAR_BOTTOM);
  }, [barreRangee]);

  const vpAbortRef = useRef<AbortController | null>(null);
  const regionRailStopsRef = useRef<NearbyStop[]>([]);
  // Liste des gares RER/Train de toute la région (~3 Mo de JSON à télécharger et
  // analyser). Avant : chargée au premier changement de viewport, donc en plein
  // premier zoom, ce qui provoquait une image de 100 à 200 ms (mesuré à froid ;
  // 5-6 images sautées au lieu de 8-11 sans cet échange). Maintenant : gardée sur
  // le téléphone (rafraîchie au plus une fois par semaine), lue au démarrage et
  // rafraîchie en arrière-plan quelques secondes après l'ouverture de l'app.
  const regionRailStopsFetchedRef = useRef(false);
  useEffect(() => {
    let annule = false;
    const CLE = '@gp_region_rail_stops_v1';
    const DUREE_MS = 7 * 24 * 3600 * 1000;
    (async () => {
      try {
        const brut = await AsyncStorage.getItem(CLE);
        let frais = false;
        if (brut) {
          const { t, stops } = JSON.parse(brut);
          if (Array.isArray(stops) && stops.length > 0) {
            regionRailStopsRef.current = stops;
            frais = typeof t === 'number' && Date.now() - t < DUREE_MS;
          }
        }
        if (frais || annule) return;
        regionRailStopsFetchedRef.current = true;
        // Assez tard pour ne pas tomber sur les premiers gestes de la carte.
        await new Promise(r => setTimeout(r, 25000));
        if (annule) return;
        const stops = await regionWideRailStops();
        if (annule || stops.length === 0) return;
        regionRailStopsRef.current = stops;
        AsyncStorage.setItem(CLE, JSON.stringify({ t: Date.now(), stops })).catch(() => {});
      } catch {
        regionRailStopsFetchedRef.current = false;
      }
    })();
    return () => { annule = true; };
  }, []);
  const [debugInfo, setDebugInfo] = useState({ zoom: 0, lat: 0, lon: 0 });

  const handleViewportChanged = useCallback(async (lat: number, lon: number, zoom: number, radius: number) => {
    // Ne re-render tout AccueilScreen (recherche, résultats, bouton GPS...)
    // que si l'overlay de debug est effectivement affiché — sinon ce
    // setState tournait à chaque pan/zoom pour ne rafraîchir qu'un texte
    // masqué, saccadant l'interaction avec la carte pour rien.
    if (showDebugOverlay) setDebugInfo({ zoom, lat, lon });
    // Secours : rien en cache ni de chargement prévu (ex : lecture du cache en
    // échec) → on charge la liste maintenant, comme avant.
    if (!regionRailStopsFetchedRef.current && regionRailStopsRef.current.length === 0) {
      regionRailStopsFetchedRef.current = true;
      regionWideRailStops().then(stops => { regionRailStopsRef.current = stops; }).catch(() => {});
    }
    if (zoom < 11.5) { mapRef.current?.setNearbyStops([]); return; }
    // Sous le zoom 13 seules les gares RER/Train sont dessinées, et on a déjà
    // la liste complète de la région : inutile de télécharger et analyser ~1,5 Mo
    // d'arrêts proches (le poids de ce téléchargement, pendant qu'on dézoome,
    // se sentait comme un à-coup).
    if (zoom < 13 && regionRailStopsRef.current.length > 0) {
      vpAbortRef.current?.abort();
      mapRef.current?.setNearbyStops(regionRailStopsRef.current);
      return;
    }
    vpAbortRef.current?.abort();
    vpAbortRef.current = new AbortController();
    try {
      const stops = await nearbyStopsWithCoords(lat, lon, vpAbortRef.current.signal, radius, zoom);
      const ids = new Set(stops.map(s => s.id));
      const merged = stops.concat(regionRailStopsRef.current.filter(s => !ids.has(s.id)));
      mapRef.current?.setNearbyStops(merged);
    } catch {}
  }, [mapRef, showDebugOverlay]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, (e) => {
      setBarreNative(true);
      glisserBarre(e.endCoordinates.height + 20);
    });
    const s2 = Keyboard.addListener(hideEvt, () => {
      // Si le volet horaires est ouvert, c'est lui qui gère la position de la
      // barre (cachée) — Keyboard.dismiss() (appelé par fermerRecherche() à
      // l'ouverture d'une gare) ne doit pas la remettre visible en course
      // avec l'animation d'ouverture du volet.
      if (panelOpenRef.current) { setBarreNative(false); return; }
      glisserBarre(SEARCH_BAR_BOTTOM, () => { setBarreNative(false); envoyerVerreRecherche(SEARCH_BAR_BOTTOM, false); });
    });
    return () => { s1.remove(); s2.remove(); };
  }, []);

  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fermerRecherche = () => {
    if (searchDebounceRef.current) { clearTimeout(searchDebounceRef.current); searchDebounceRef.current = null; }
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    setGpsSearchStatus(null);
  };

  useEffect(() => {
    if (activeTab !== 'accueil') fermerRecherche();
  }, [activeTab]);

  const choisirGare = (id: string, label: string) => {
    fermerRecherche();
    onGareChoisie(id, label);
  };

  const rechercherGare = (texte: string) => {
    const motNettoy = texte.toLowerCase().replace(/[^\w]/g, '').trim();
    if (motNettoy === 'quoi') { setFeurVisible(true); setSearchQuery(texte); return; }
    setSearchQuery(texte);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (texte.length < 2) {
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const results = await searchGares(texte, controller.signal);
        setSearchResults(results.length > 0 ? results : [{ id: 'vide', label: 'Aucune gare trouvée 😕' }]);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        logger.error(`search: ${e?.message}`);
        const msg = isNetworkError(e) ? '📵 Pas de connexion internet' : '⚠️ Impossible de joindre le serveur';
        setSearchResults([{ id: 'erreur', label: msg }]);
      }
      setIsSearching(false);
    }, 300);
  };

  const declarerClicGpsNatif = async () => {
    onRevenirAccueil();
    fermerRecherche();
    setIsSearching(true);
    try {
      setLoadingGps(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (Platform.OS === 'android') {
          ToastAndroid.show('📍 Autorisation de localisation refusée', ToastAndroid.SHORT);
        }
        return;
      }
      let loc = await Location.getLastKnownPositionAsync();
      if (!loc) loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const lat = loc!.coords.latitude;
      const lon = loc!.coords.longitude;
      mapRef.current?.recenterOnUser(lat, lon);
      setFollowingLocation(true);
      const controller = new AbortController();
      searchAbortRef.current = controller;

      const attendre = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      let results = await nearbyGares(lat, lon, controller.signal, 1500);
      if (results.length === 0) {
        setGpsSearchStatus('🔍 Rien trouvé... on cherche un peu plus loin (5 km)');
        [results] = await Promise.all([nearbyGares(lat, lon, controller.signal, 5000), attendre(2200)]);
      }
      if (results.length === 0) {
        setGpsSearchStatus('🔍 Toujours rien... on cherche vers perpette. (15 km)');
        [results] = await Promise.all([nearbyGares(lat, lon, controller.signal, 15000), attendre(2200)]);
      }
      if (results.length > 0) {
        setGpsSearchStatus(null);
        setSearchResults(results);
      } else {
        setGpsSearchStatus("🫥 Aucun arrêt trouvé, même en cherchant loin. Vous êtes vraiment au milieu de nulle part !");
      }

      if (!locationWatchRef.current) {
        locationWatchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 5 },
          (p) => mapRef.current?.setUserLocation(p.coords.latitude, p.coords.longitude)
        );
      }
      if (!headingWatchRef.current) {
        headingWatchRef.current = await Location.watchHeadingAsync((h) => {
          const heading = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          const prev = lastHeadingRef.current;
          if (prev !== null) {
            const diff = Math.abs(heading - prev);
            if (Math.min(diff, 360 - diff) < 5) return;
          }
          lastHeadingRef.current = heading;
          mapRef.current?.setUserHeading(heading);
        });
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      logger.error(`nearby: ${e?.message}`);
      const msg = isNetworkError(e) ? '📵 Pas de connexion internet' : '⚠️ Impossible de géolocaliser ou joindre le serveur';
      setGpsSearchStatus(null);
      setSearchResults([{ id: 'erreur', label: msg }]);
    } finally { setLoadingGps(false); setIsSearching(false); }
  };

  const handleFollowExited = useCallback(() => setFollowingLocation(false), []);

  const showResults = searchResults.length > 0;

  return (
    <View style={styles.container}>
      {/* La carte reste TOUJOURS plein écran, même quand un tiroir permanent
          est ouvert (écran large, voir responsive.ts) — le tiroir (opaque)
          la recouvre juste visuellement, comme sur téléphone. Redimensionner
          son conteneur pour "faire de la place" forçait Leaflet à recharger
          les tuiles de la zone révélée à chaque ouverture/fermeture (délai
          visible), en plus d'avoir vraisemblablement déclenché le bug de
          panneau vide après rotation — approche abandonnée. */}
      {/* onStartShouldSetResponderCapture : ferme le clavier dès le début du
          toucher (avant même que le clic remonte de la WebView via le pont
          JS, qui arrive trop tard côté natif Android pour fiabiliser la
          fermeture — le clavier reste ouvert sous la station qui s'ouvre).
          On retourne false pour ne jamais capter le geste : la WebView reçoit
          le toucher normalement. */}
      <BlurTargetView ref={blurCarteRef ?? undefined} style={StyleSheet.absoluteFill}>
      <View
        ref={origineCarteRef}
        collapsable={false}
        onLayout={() => origineCarteRef.current?.measureInWindow((x, y) => definirOrigine(x, y))}
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponderCapture={() => { Keyboard.dismiss(); return false; }}
      >
        <MapWebView
          ref={mapRef}
          isDark={isDark}
          onStationSelected={onGareChoisie}
          onViewportChanged={handleViewportChanged}
          onMapTapped={onMapTapped}
          onFollowExited={handleFollowExited}
          onReady={() => {
            mapRef.current?.setTheme(isDark);
            renvoyerVerre();
            mapRef.current?.setTransportData(transportData as { stops: any[]; lines: any[] });
          }}
        />
      </View>
      </BlurTargetView>

      {/* Voile sombre limité à la carte : sous l'en-tête, les réglages et la
          barre de recherche (rendus après, dans l'enveloppe ci-dessous). */}
      {voileOpacity && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0)', opacity: voileOpacity }]}
          pointerEvents={activeTab !== 'accueil' ? 'auto' : 'none'}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClosePanel} />
        </Animated.View>
      )}

      {/* Enveloppe dédiée aux contrôles flottants (en-tête, pastille
          réglages, barre de recherche, résultats...) — eux continuent de se
          confiner à la zone non recouverte par le tiroir permanent, pour ne
          pas s'afficher par-dessus (ils ont un zIndex plus élevé). Comme ils
          utilisent tous `position:'absolute'`, ils se positionnent par
          rapport au parent direct — les enfermer ici suffit à les confiner
          sans recalculer leurs marges un par un.
          `pointerEvents="box-none"` est CRITIQUE ici : cette enveloppe
          couvre tout l'écran (top:0, bottom:0) et, sans lui, une vue
          transparente intercepte quand même les touchers sur toute sa
          surface par défaut — même là où rien n'est affiché. Sans ce
          réglage, la carte en dessous ne recevait plus aucun geste (pan,
          zoom, tap) dès que ce wrapper a été introduit. */}
      <Animated.View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, left: mapLeftInset, right: mapRightInset }}>

      {/* Overlay d'infos de debug (mode dev) */}
      {showDebugOverlay && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: insets.top + 12 + headerBarHeight + 8, right: 12, zIndex: 9,
            backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'GrandParis-Medium' }}>
            Zoom {debugInfo.zoom.toFixed(2)}
          </Text>
          <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'GrandParis-Light' }}>
            {debugInfo.lat.toFixed(4)}, {debugInfo.lon.toFixed(4)}
          </Text>
          <CompteurFps />
        </View>
      )}

      {/* Pilule "mise à jour en cours" qui glisse depuis le haut, sous le header */}
      {updatePillMounted && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: insets.top + 12 + headerBarHeight + 8, left: 0, right: 0,
            alignItems: 'center', zIndex: 9,
            opacity: updatePillAnim,
          }}
        >
          <View style={[styles.updateBgPill, { backgroundColor: teinteVerre(isDark, c, true, 'pastilles'), ...bordureVerre(isDark, c) }]}>
            <CoucheVerre zone="pastilles" idVerre="pastille_maj" rayon={20} fondu masque={!updateDownloadingBg} />
            <ActivityIndicator size="small" color={c.accent} />
            <Text style={{ fontFamily: 'GrandParis-Medium', fontSize: 12, color: c.text }}>Mise à jour...</Text>
          </View>
        </Animated.View>
      )}

      {/* Header pill flottant */}
      <View
        style={[styles.headerNatif, { backgroundColor: teinteVerre(isDark, c, true, 'entete'), ...bordureVerre(isDark, c), top: insets.top + 12 }]}
        onLayout={(e: LayoutChangeEvent) => {
          const { y, height } = e.nativeEvent.layout;
          onHeaderLayout(y + height);
          setHeaderBarHeight(height);
        }}
      >
        <CoucheVerre zone="entete" rayon={20} ombre="0 -2px 8px rgba(0,0,0,0.12)" />
        <Animated.Image
          source={require('./assets/icon.png')}
          style={[styles.logoApp, { transform: [{ rotate: logoSpinDeg }] }]}
        />
        <Text style={[styles.titreGrandPaname, { color: c.text }]}>Grand Paname</Text>
      </View>

      {/* Bulle paramètres */}
      <TouchableOpacity
        style={[styles.settingsBubble, { backgroundColor: teinteVerre(isDark, c, true, 'reglages'), ...bordureVerre(isDark, c), top: insets.top + 12 }]}
        onPress={onOpenSettings}
      >
        <CoucheVerre zone="reglages" rayon={22} ombre="0 -2px 8px rgba(0,0,0,0.12)" />
        <Icon name="parametres" size={18} color={c.text} />
      </TouchableOpacity>

      {/* Overlay transparent : tap sur la carte ferme la liste */}
      {showResults && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, { zIndex: 998 }]}
          activeOpacity={1}
          onPress={fermerRecherche}
        />
      )}

      {/* Statut de la recherche GPS par paliers, au-dessus de la barre de recherche */}
      {gpsSearchStatus && (
        <Animated.View style={[styles.gpsStatusPill, { bottom: resultsBottom, backgroundColor: teinteVerre(isDark, c, true, 'pastilles'), ...bordureVerre(isDark, c) }]}>
          <CoucheVerre zone="pastilles" idVerre="pastille_gps" rayon={16} />
          <Text style={{ fontSize: 14, fontFamily: 'GrandParis-Medium', color: c.text, textAlign: 'center' }}>
            {gpsSearchStatus}
          </Text>
        </Animated.View>
      )}

      {/* Résultats au-dessus de la barre de recherche */}
      {showResults && (
        <Animated.View style={[styles.searchResultsContainer, { bottom: resultsBottom, backgroundColor: c.bg }]}>
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => (
              <View style={[styles.searchResultRow, { borderBottomColor: c.border }]}>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  onPress={() => { if (!['erreur', 'vide'].includes(item.id)) choisirGare(item.id, item.label); }}
                >
                  <Text style={[styles.searchResultText, { color: c.text, flex: 1 }]}>{item.label}</Text>
                  {!!item.modes?.length && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 3, marginTop: 1 }}>
                      {item.modes.map(mode => (
                        <ExpoImage
                          key={mode}
                          source={{ uri: MODE_ICONS[mode] ?? MODE_ICONS['BUS'] }}
                          style={{ width: 18, height: 18, tintColor: isDark ? '#ddeeff' : '#25303b' }}
                          contentFit="contain"
                        />
                      ))}
                    </View>
                  )}
                  {item.distance != null && (
                    <View style={[styles.distancePill, { backgroundColor: c.bgSubtle }]}>
                      <Text style={{ fontSize: 11, fontFamily: 'GrandParis-Medium', color: c.textSub }}>
                        {formatDistance(item.distance)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                {!['erreur', 'vide'].includes(item.id) && (
                  <View style={styles.etoileAction}>
                    <FavoriStar active={estFavori(item.id)} onPress={() => onBasculerFavori(item)} size={22} color={estFavori(item.id) ? '#F2B705' : c.textSub} />
                  </View>
                )}
              </View>
            )}
          />
          <FadeBottom color={c.bg} />
        </Animated.View>
      )}

      {/* Barre de recherche flottante, ou nom de l'arrêt affiché tant qu'on
          reste sur sa vue (poteaux compris), même horaires fermées */}
      <Animated.View style={[styles.bottomSearchBar, { bottom: searchBarBottom, opacity: barreOpacite, backgroundColor: teinteVerre(isDark, c, true, 'recherche'), ...bordureVerre(isDark, c) }]}>
        <CoucheVerre zone="recherche" natifForce={barreNative} />
        {gareActuelle ? (
          <>
            <TouchableOpacity
              style={styles.searchContainer}
              onPress={() => onGareChoisie(gareActuelle.id, gareActuelle.label)}
            >
              <Text
                style={[styles.searchInput, { backgroundColor: c.pillCenter, color: c.text, textAlignVertical: 'center', fontFamily: 'GrandParis-Medium', borderWidth: 1, borderColor: c.accent }]}
                numberOfLines={1}
              >
                {gareActuelle.label.split('(')[0].trim()}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.boutonGpsBarre, { backgroundColor: c.bgSubtle }]} onPress={onQuitterVueArret}>
              <Text style={{ fontSize: 18, color: c.textSub, fontWeight: '600' }}>✕</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.searchContainer}>
              <TextInput
                ref={searchInputRef}
                style={[styles.searchInput, { backgroundColor: c.bgSubtle, color: c.text }]}
                placeholder="Rechercher un arrêt..."
                value={searchQuery}
                onChangeText={rechercherGare}
                onFocus={onClosePanel}
                placeholderTextColor={c.textSub}
                autoCorrect={false}
              />
              {isSearching && (
                <ActivityIndicator style={{ position: 'absolute', right: 12 }} size="small" color={c.accent} />
              )}
              {searchQuery.length > 0 && !isSearching && (
                <TouchableOpacity style={{ position: 'absolute', right: 12 }} onPress={fermerRecherche}>
                  <Text style={{ fontSize: 15, color: c.textSub, fontWeight: '600' }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.boutonGpsBarre, { backgroundColor: followingLocation ? c.pillCenter : c.bgSubtle }]}
              onPress={declarerClicGpsNatif}
              disabled={loadingGps}
            >
              {loadingGps
                ? <ActivityIndicator size="small" color={c.accent} />
                : <IconPositionCouleur size={18} dotColor={isDark ? '#FFFFFF' : '#0F2544'} />
              }
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
      </Animated.View>
      <FeurModal visible={feurVisible} onClose={() => setFeurVisible(false)} />
    </View>
  );
}

// Masque de dégradé pour le fondu des bords de la liste des favoris sur le verre.
// Module natif : absent d'un build de développement plus ancien que son
// installation → on retombe sur les fondus de couleur (voir GardeMasque).
let MaskedView: any = null;
try { MaskedView = require('@react-native-masked-view/masked-view').default; } catch { MaskedView = null; }
class GardeMasque extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { erreur: boolean }> {
  state = { erreur: false };
  static getDerivedStateFromError() { return { erreur: true }; }
  render() { return this.state.erreur ? this.props.fallback : this.props.children; }
}

// ─── ÉCRAN FAVORIS ────────────────────────────────────────────────────────────
const FAV_ITEM_H = 72;
const FAV_GAP    = 10;
const FAV_SLOT_H = FAV_ITEM_H + FAV_GAP;

function FavorisScreen({ favoris, onSupprimerFavori, onSelectionnerGare, onReordonnerFavoris, actif, verre }: FavorisProps) {
  const c = useColors();
  const [editMode, setEditMode] = useState(false);
  useEffect(() => { if (!actif) setEditMode(false); }, [actif]);
  // Fondu des bords de liste sur le verre : teinte translucide proche de celle du tiroir.
  const [hauteurListe, setHauteurListe] = useState(0);
  // Pictos des modes de chaque favori (RER, Train, Métro, Tram, Bus...) : pas
  // enregistrés avec le favori, donc demandés une fois puis gardés 30 jours.
  const { isDark: sombre } = useContext(ThemeContext);
  const [modesParId, setModesParId] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let annule = false;
    const CLE = '@gp_modes_favoris_v2';
    (async () => {
      let cache: Record<string, { m: string[]; t: number }> = {};
      try { cache = JSON.parse((await AsyncStorage.getItem(CLE)) || '{}'); } catch {}
      const maintenant = Date.now();
      const valides: Record<string, string[]> = {};
      const aDemander: string[] = [];
      for (const f of favoris) {
        const e = cache[f.id];
        if (e) valides[f.id] = e.m;
        if (!e || maintenant - e.t > 30 * 24 * 3600 * 1000) aDemander.push(f.id);
      }
      if (!annule) setModesParId(valides);
      let modifie = false;
      for (const id of aDemander) {
        if (annule) return;
        try {
          const m = await modesArret(id);
          cache[id] = { m, t: Date.now() };
          modifie = true;
          if (!annule) setModesParId(p => ({ ...p, [id]: m }));
        } catch {}
      }
      if (modifie) AsyncStorage.setItem(CLE, JSON.stringify(cache)).catch(() => {});
    })();
    return () => { annule = true; };
  }, [favoris.map(f => f.id).join('|')]);
  const teinteFondu = useContext(ThemeContext).isDark ? hexToRgba(c.bgCard, 0.3) : 'rgba(255,255,255,0.6)';
  const yMap = useRef(new Map<string, Animated.Value>()).current;
  const isAnimating = useRef(false);
  const getY = (id: string): Animated.Value => {
    if (!yMap.has(id)) {
      const idx = favoris.findIndex(f => f.id === id);
      yMap.set(id, new Animated.Value((idx >= 0 ? idx : favoris.length) * FAV_SLOT_H));
    }
    return yMap.get(id)!;
  };

  useEffect(() => {
    if (isAnimating.current) return;
    favoris.forEach((f, i) => {
      const y = yMap.get(f.id);
      if (y) y.setValue(i * FAV_SLOT_H);
      else yMap.set(f.id, new Animated.Value(i * FAV_SLOT_H));
    });
    const ids = new Set(favoris.map(f => f.id));
    yMap.forEach((_, id) => { if (!ids.has(id)) yMap.delete(id); });
  }, [favoris]);

  const handleReorder = (from: number, to: number) => {
    if (isAnimating.current || from < 0 || to < 0 || from >= favoris.length || to >= favoris.length) return;
    const yA = getY(favoris[from].id);
    const yB = getY(favoris[to].id);
    isAnimating.current = true;
    Animated.parallel([
      Animated.timing(yA, { toValue: to   * FAV_SLOT_H, duration: 260, useNativeDriver: true }),
      Animated.timing(yB, { toValue: from * FAV_SLOT_H, duration: 260, useNativeDriver: true }),
    ]).start(() => {
      isAnimating.current = false;
      onReordonnerFavoris(from, to);
    });
  };

  const liste = (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: FONDU_HAUT, paddingBottom: 60, paddingHorizontal: 8 }}>
            <View style={{ height: favoris.length * FAV_SLOT_H - FAV_GAP }}>
              {favoris.map((item, index) => (
                <Animated.View
                  key={item.id}
                  style={{ position: 'absolute', left: 0, right: 0, height: FAV_ITEM_H, transform: [{ translateY: getY(item.id) }] }}
                >
                  <TouchableOpacity
                    style={[panelCardStyle, { height: FAV_ITEM_H, justifyContent: 'space-between', backgroundColor: c.bgCard, borderColor: c.borderCard }]}
                    onPress={() => { if (!editMode) onSelectionnerGare(item.id, item.label); }}
                    activeOpacity={editMode ? 1 : 0.7}
                  >
                    {editMode && (
                      <TouchableOpacity
                        onPress={() => onSupprimerFavori(item)}
                        style={styles.boutonSupprimer}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.boutonSupprimerTexte}>✕</Text>
                      </TouchableOpacity>
                    )}
                    <View style={[panelChipStyle, { backgroundColor: c.iconGareBg }]}>
                      {(() => {
                        const modes = (modesParId[item.id] || []).slice(0, 4);
                        if (modes.length === 0) return <Icon name="position" size={20} color={c.accent} />;
                        const t = modes.length === 1 ? 24 : modes.length === 2 ? 18 : 15;
                        return (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', width: modes.length > 2 ? 34 : 40, gap: 2 }}>
                            {modes.map(mode => (
                              <ExpoImage key={mode} source={{ uri: MODE_ICONS[mode] ?? MODE_ICONS['BUS'] }} style={{ width: t, height: t, tintColor: sombre ? '#ddeeff' : '#25303b' }} contentFit="contain" />
                            ))}
                          </View>
                        );
                      })()}
                    </View>
                    <View style={styles.alignementFavori}>
                      {(() => {
                        const m = item.label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
                        const name = m ? m[1].trim() : item.label;
                        const city = m ? m[2].trim() : null;
                        return (
                          <>
                            <Text style={[styles.texteNomGareFavori, { color: c.text }]} numberOfLines={1}>{name}</Text>
                            {city && <Text style={[styles.texteVilleFavori, { color: c.textSub }]} numberOfLines={1}>{city}</Text>}
                          </>
                        );
                      })()}
                    </View>
                    {editMode ? (
                      <View style={styles.boutonsOrdre}>
                        <TouchableOpacity
                          onPress={() => handleReorder(index, index - 1)}
                          disabled={index === 0}
                          hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                        >
                          <Text style={{ color: index === 0 ? c.border : c.accent, fontSize: 20 }}>↑</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleReorder(index, index + 1)}
                          disabled={index === favoris.length - 1}
                          hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                        >
                          <Text style={{ color: index === favoris.length - 1 ? c.border : c.accent, fontSize: 20 }}>↓</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={{ color: c.textSub, fontSize: 24, marginLeft: 6, marginTop: -3 }}>›</Text>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
    </ScrollView>
  );
  return (
    <PanelLayout
      icon={<IconFavorisCouleur size={26} dotColor={c.text} />}
      title="Favoris"
      subtitle={`${favoris.length} ${favoris.length === 1 ? 'gare enregistrée' : 'gares enregistrées'}`}
      headerRight={favoris.length > 0 ? <PanelPillAction label={editMode ? 'Terminer' : 'Modifier'} actif={editMode} onPress={() => setEditMode(e => !e)} /> : undefined}
    >
      {favoris.length === 0 ? (
        <PanelEmptyState
          icon={<Icon name="recherche" size={44} color={c.textSub} />}
          title="Aucun favori pour l'instant"
          description="Recherchez une gare depuis l'accueil et appuyez sur l'étoile ☆ pour l'ajouter ici."
        />
      ) : (
        // Marge négative + padding identique : la zone de défilement (et le masque) dépasse de 8 px de
        // chaque côté, sinon les ombres des cartes, collées aux bords, étaient coupées.
        <View style={{ flex: 1, marginHorizontal: -8 }} onLayout={(e) => setHauteurListe(e.nativeEvent.layout.height)}>
          {verre && MaskedView ? (
            <GardeMasque fallback={<>{liste}<FadeTop color={teinteFondu} /><FadeBottom color={teinteFondu} /></>}>
              <MaskedView
                style={{ flex: 1 }}
                maskElement={
                  <LinearGradient
                    colors={['rgba(0,0,0,0)', 'rgba(0,0,0,1)', 'rgba(0,0,0,1)', 'rgba(0,0,0,0)']}
                    locations={hauteurListe > 0 ? [0, FONDU_HAUT / hauteurListe, 1 - FONDU_BAS / hauteurListe, 1] : [0, 0.02, 0.94, 1]}
                    style={{ flex: 1 }}
                  />
                }
              >
                {liste}
              </MaskedView>
            </GardeMasque>
          ) : (
            <>
              {liste}
              <FadeTop color={verre ? teinteFondu : c.bg} />
              <FadeBottom color={verre ? teinteFondu : c.bg} />
            </>
          )}
        </View>
      )}
    </PanelLayout>
  );
}

// ─── MOTEUR COMMUN AUX MODALES-CARTES CENTRÉES ─────────────────────────────
// "Quoi de neuf", mise à jour disponible, visite guidée... partagent toutes
// le même mécanisme (Modal plein écran, fond sombre, carte qui apparaît en
// fondu + léger zoom ressort). Un seul hook + deux composants réutilisés
// partout, pour ne pas réimplémenter (et re-casser, comme ça a été le cas
// sur la visite guidée) ce mécanisme à chaque nouvelle modale.
function useModalCardAnim(visible: boolean, sansRebond = false) {
  const anim = useRef(new Animated.Value(0)).current;
  // `mounted` reste true pendant l'animation de fermeture (visible passe à
  // false immédiatement côté parent, mais on ne démonte qu'une fois l'anim
  // terminée) — sinon `anim` reste bloqué à sa valeur finale et la prochaine
  // ouverture ne rejoue plus rien visuellement.
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Timing + easing plutôt qu'un spring : un spring anime aussi l'opacité
      // (pas seulement l'échelle) puisque les deux partagent la même valeur
      // `anim`, et le léger rebond d'un spring sur une opacité (qui doit
      // rester bornée 0→1) lit comme un raté plutôt qu'un effet voulu. Le
      // easing "back" garde un petit effet ressort uniquement sur le zoom,
      // sans that à-coup.
      // `sansRebond` : page qui glisse depuis le bord (Paramètres) — l'easing « back »
      // la ferait dépasser sa position puis revenir (saccade visible), on lui donne
      // la courbe douce des tiroirs.
      if (sansRebond) {
        // Même ressort que le volet des horaires et la barre de recherche (raideur 120,
        // amortissement 15, masse 0,5) : léger rebond d'arrivée.
        Animated.spring(anim, { toValue: 1, stiffness: 120, damping: 15, mass: 0.5, useNativeDriver: true }).start();
      } else {
        Animated.timing(anim, { toValue: 1, duration: 280, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
      }
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: sansRebond ? 260 : 200, easing: sansRebond ? Easing.bezier(0.4, 0, 0.2, 1) : Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]);
  return { anim, mounted };
}

// Depuis expo-blur 55+, le flou "dimezisBlurView" sur Android n'opère plus
// automatiquement sur tout ce qu'il y a derrière : il faut désigner
// explicitement la vue à flouter via un <BlurTargetView> + une ref passée en
// `blurTarget`, sinon le flou retombe silencieusement sur "none" (aucun
// voile flouté, juste le fond net). Ce contexte porte cette ref depuis la
// racine (voir App(), qui enveloppe tout le contenu visible derrière les
// modales dans un <BlurTargetView>) jusqu'à ModalCard, sans la faire
// traverser WhatsNewModal/OnboardingTour/UpdateModal en props.
const BlurTargetContext = createContext<React.RefObject<View | null> | null>(null);

// Pas de <Modal> ici : sur Android, une Modal s'ouvre dans une fenêtre native
// séparée de l'activité principale — un BlurView posé dedans ne peut flouter
// que ce qu'il y a DANS cette fenêtre (donc rien de l'app réelle derrière).
// Comme on veut le flou sur la carte elle-même (glassmorphism), pas sur tout
// le fond de l'app, il faut que la carte partage la même fenêtre que le reste
// de l'UI — un simple calque superposé, comme le panneau gare ou les tiroirs.
function ModalBackdrop({ mounted, anim, onRequestClose, fullBleed, children }: {
  mounted: boolean;
  anim: Animated.Value;
  onRequestClose?: () => void;
  // Pas de padding/centrage : le contenu (ex: l'écran d'accueil du tuto, en
  // glassmorphism plein écran) remplit tout l'espace au lieu d'être une
  // carte flottante avec de la marge autour.
  fullBleed?: boolean;
  children: React.ReactNode;
}) {
  if (!mounted) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20000, elevation: 20 }]}>
      {/* Léger voile (pas de flou) juste pour la lisibilité — le fond de
          l'app reste net. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.15)', opacity: anim }]} />
      {/* Le tap en dehors de la carte ne ferme la modale que si onRequestClose
          est fourni (WhatsNew, mise à jour) — sinon (visite guidée) on bloque
          quand même les taps vers ce qu'il y a derrière, sans rien fermer. */}
      {onRequestClose ? (
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onRequestClose} />
      ) : (
        <View style={StyleSheet.absoluteFill} />
      )}
      <Animated.View
        pointerEvents="box-none"
        style={fullBleed ? { flex: 1, opacity: anim } : { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, opacity: anim }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

// La carte standard (titre/texte/boutons) posée sur le fond flouté — vrai
// effet "glassmorphism" : son propre flou (pas juste une teinte translucide
// qui laisse deviner le flou du fond derrière), et une fine bordure claire
// façon reflet de verre. Pas de voile de couleur en plus par-dessus : la prop
// `tint` du BlurView applique déjà elle-même un voile assez marqué en interne
// (~55% de blanc/noir à intensity=70) — en superposer un second rendait la
// carte quasi opaque.
function ModalCard({ anim, style, containerStyle, pulseKey, children }: {
  anim: Animated.Value; style?: object; containerStyle?: object;
  // Change de valeur (ex: le numéro d'étape d'un carrousel) → petit pulse de
  // zoom sur CETTE carte, sans toucher à `anim` (qui pilote aussi l'opacité
  // du fond derrière) : juste une deuxième interpolation combinée dans le
  // même tableau `transform`, pas une deuxième Animated.View imbriquée.
  pulseKey?: string | number;
  children: React.ReactNode;
}) {
  const { isDark } = useContext(ThemeContext);
  const blurTargetRef = useContext(BlurTargetContext);
  const pulse = useRef(new Animated.Value(1)).current;
  const firstRender = useRef(true);
  useEffect(() => {
    if (pulseKey === undefined) return;
    if (firstRender.current) { firstRender.current = false; return; }
    pulse.setValue(0.95);
    Animated.timing(pulse, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
  }, [pulseKey]);

  return (
    <Animated.View style={[{
      width: '100%', maxWidth: 420, borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1.5, borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.55)',
      transform: [
        { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
        { scale: pulse },
      ],
    }, containerStyle]}>
      <BlurView intensity={45} tint={isDark ? 'dark' : 'light'} blurMethod="dimezisBlurView" blurTarget={blurTargetRef ?? undefined} style={StyleSheet.absoluteFill} />
      <View style={[{ padding: 22, gap: 14 }, style]}>
        {children}
      </View>
    </Animated.View>
  );
}

// Bouton standard des modales-cartes : même gabarit partout (padding, rayon,
// hauteur minimale garantie) — seule la couleur et la largeur changent d'un
// appel à l'autre. La minHeight est ce qui évite qu'un bouton avec juste une
// icône (le retour) se retrouve plus bas qu'un bouton avec du texte (ce qui
// arrivait quand chaque bouton fixait sa propre hauteur via le padding +
// contenu, sans hauteur commune imposée).
function ModalButton({ onPress, backgroundColor, style, children }: {
  onPress: () => void;
  backgroundColor: string;
  style?: object;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[{
        backgroundColor, borderRadius: 30, paddingVertical: 14, minHeight: 48,
        alignItems: 'center', justifyContent: 'center',
      }, style]}
    >
      {children}
    </TouchableOpacity>
  );
}

// ─── MODALE "QUOI DE NEUF" ───────────────────────────────────────────────────
function WhatsNewModal({ visible, onClose, onOpenChangelog }: { visible: boolean; onClose: () => void; onOpenChangelog: () => void }) {
  const c = useColors();
  const { anim, mounted } = useModalCardAnim(visible);
  // Toujours la dernière entrée de la liste (WHATSNEW est trié du plus
  // récent au plus ancien, comme CHANGELOGS) — pas un match exact sur
  // APP_VERSION : sinon, dès qu'une version sort sans entrée whatsnew (ou que
  // l'app a déjà avancé d'une version de plus entre-temps), la modale ne
  // s'affiche jamais pour cette nouveauté, même si l'utilisateur ne l'a
  // jamais vue.
  const entry = WHATSNEW[0];

  const handleClose = () => {
    if (entry) AsyncStorage.setItem('@gp_whatsnew_seen_version', entry.version).catch(() => {});
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(onClose);
  };

  if (!mounted || !entry) return null;

  const Feature = ({ emoji, title, description }: { emoji: string; title: string; description: string }) => (
    <View style={{ borderRadius: 10, borderWidth: 1, borderColor: c.accent, backgroundColor: c.bgCard, padding: 12, gap: 4 }}>
      <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 14, color: c.text }}>{emoji}  {title}</Text>
      <Text style={{ fontFamily: 'GrandParis-Regular', fontSize: 13, color: c.text, lineHeight: 19 }}>{description}</Text>
    </View>
  );

  return (
    <ModalBackdrop mounted={mounted} anim={anim} onRequestClose={handleClose}>
      <ModalCard anim={anim} style={{ padding: 24, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 20, color: c.text }}>✨ Quoi de neuf ?</Text>
          <View style={{ backgroundColor: c.accent, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
            <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 11, color: '#fff', letterSpacing: 0.5 }}>v{entry.version}</Text>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          {entry.features.map((f, i) => (
            <Feature key={i} emoji={f.emoji} title={f.title} description={f.description} />
          ))}
        </View>

        {entry.footer && (
          <Text style={{ fontFamily: 'GrandParis-Regular', fontSize: 12, color: c.textSub, textAlign: 'center', lineHeight: 18 }}>
            {entry.footer + '\n'}
            <Text onPress={() => { handleClose(); setTimeout(onOpenChangelog, 300); }} style={{ color: c.accent }}>
              Voir l'historique des versions →
            </Text>
          </Text>
        )}

        <ModalButton onPress={handleClose} backgroundColor={c.accent}>
          <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 15, color: '#fff' }}>C'est parti !</Text>
        </ModalButton>
      </ModalCard>
    </ModalBackdrop>
  );
}

// ─── VISITE GUIDÉE (premier lancement) ─────────────────────────────────────
// Cartes centrées façon "Quoi de neuf", sans halo positionné sur un élément
// réel : une première version pointait la barre de recherche / la carte /
// l'onglet favoris via measureInWindow(), mais ces coordonnées se sont
// révélées peu fiables d'un appareil à l'autre (encoche, barre de statut,
// gestes de nav...), avec un halo qui se retrouvait décalé du vrai élément.
// Une carte centrée ne dépend d'aucune mesure et s'affiche donc correctement
// partout.
type TourStep = { key: string; emoji: string; title: string; text: string };

function OnboardingTour({ visible, steps, onFinish }: { visible: boolean; steps: TourStep[]; onFinish: () => void }) {
  const c = useColors();
  const { anim, mounted } = useModalCardAnim(visible);
  // Rebond du logo/emoji à chaque étape — seule Animated.View imbriquée dans
  // la carte, et seulement sur le petit logo/emoji (jamais sur un conteneur
  // qui porte aussi le fond/les boutons, contrairement à la version d'avant
  // qui rendait la carte translucide sur certains appareils).
  const logoBounce = useRef(new Animated.Value(1)).current;
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => { if (visible) setStepIndex(0); }, [visible]);

  // Rebond du logo/emoji à chaque étape (le pulse de la carte elle-même est
  // géré par ModalCard via pulseKey, sans toucher à `anim` — un reset de
  // `anim` ici perturbait aussi l'opacité du fond, partagée avec la carte).
  useEffect(() => {
    if (!mounted || stepIndex === 0) return;
    logoBounce.setValue(0.5);
    Animated.timing(logoBounce, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
  }, [stepIndex]);

  if (!mounted) return null;
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const finir = () => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(onFinish);
  };
  const suivant = () => {
    if (isLast) { finir(); return; }
    setStepIndex(i => i + 1);
  };
  const precedent = () => setStepIndex(i => Math.max(0, i - 1));

  const dots = (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
      {steps.map((s, i) => (
        <View key={s.key} style={{
          width: i === stepIndex ? 18 : 6, height: 6, borderRadius: 3,
          backgroundColor: i === stepIndex ? c.accent : c.borderCard,
        }} />
      ))}
    </View>
  );

  // Pas de onRequestClose : impossible de fermer la visite guidée en tapant
  // en dehors — voir aussi le BackHandler central dans AppInner qui neutralise
  // aussi le bouton retour matériel pendant le tuto.
  return (
    <ModalBackdrop mounted={mounted} anim={anim} fullBleed={isFirst}>
      {isFirst ? (
        // Écran d'accueil : un fond glassmorphique plein écran (contrairement
        // aux étapes suivantes, dont la carte ne fait que la taille de son
        // contenu) pour bien détacher le texte du fond réel derrière, quel
        // qu'il soit.
        <ModalCard
          anim={anim}
          pulseKey={stepIndex}
          containerStyle={{ flex: 1, width: '100%', maxWidth: '100%', borderRadius: 0, borderWidth: 0 }}
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 22, padding: 32 }}
        >
          <LinearGradient
            colors={[c.accent, '#7c3aed']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{
              width: 108, height: 108, borderRadius: 30,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: c.accent, shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 14,
            }}
          >
            <View style={{ width: 84, height: 84, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
              <Animated.Image source={require('./assets/icon.png')} style={{ width: 66, height: 66, borderRadius: 14 }} resizeMode="contain" />
            </View>
          </LinearGradient>

          <View style={{ alignItems: 'center', gap: 8 }}>
            <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 28, color: c.text, textAlign: 'center' }}>{step.title}</Text>
            <Text style={{ fontFamily: 'GrandParis-Regular', fontSize: 15, color: c.text, textAlign: 'center', lineHeight: 21, maxWidth: 300 }}>
              {step.text}
            </Text>
          </View>

          {dots}

          <ModalButton onPress={suivant} backgroundColor={c.accent} style={{ paddingHorizontal: 52 }}>
            <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 15, color: '#fff' }}>Suivant</Text>
          </ModalButton>
        </ModalCard>
      ) : (
        <ModalCard anim={anim} pulseKey={stepIndex}>
          <Animated.Text style={{ fontSize: 40, transform: [{ scale: logoBounce }] }}>{step.emoji}</Animated.Text>
          <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 19, color: c.text, marginTop: 12 }}>{step.title}</Text>
          <Text style={{ fontFamily: 'GrandParis-Regular', fontSize: 14, color: c.text, lineHeight: 20, marginTop: 6 }}>{step.text}</Text>

          <View style={{ marginTop: 2 }}>{dots}</View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <ModalButton onPress={precedent} backgroundColor="#fff" style={{ width: 48 }}>
              {/* Chevron (deux traits en "L" pivoté) plutôt qu'un triangle
                  plein ou un caractère "‹", qui n'est jamais bien centré
                  selon la police/le rendu. */}
              <View style={{
                width: 10, height: 10, marginLeft: 3,
                borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: '#25303b',
                transform: [{ rotate: '45deg' }],
              }} />
            </ModalButton>
            <ModalButton onPress={suivant} backgroundColor={c.accent} style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 15, color: '#fff' }}>{isLast ? "C'est parti !" : 'Suivant'}</Text>
            </ModalButton>
          </View>
        </ModalCard>
      )}
    </ModalBackdrop>
  );
}

// ─── MODALE "MISE À JOUR DISPONIBLE" ────────────────────────────────────────
function UpdateModal({ visible, mode, onAccept, onDismiss }: {
  visible: boolean;
  mode: 'prompt' | 'ready';
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  const { anim, mounted } = useModalCardAnim(visible);
  // `displayedMode` ne se met à jour que quand la modale est (re)ouverte —
  // si on suivait `mode` directement, un changement de mode simultané à la
  // fermeture (ready -> prompt reset) ferait flasher le mauvais contenu
  // pendant les ~180ms de l'animation de fermeture.
  const [displayedMode, setDisplayedMode] = useState(mode);
  useEffect(() => { if (visible) setDisplayedMode(mode); }, [visible]);

  if (!mounted) return null;
  const ready = displayedMode === 'ready';

  return (
    <ModalBackdrop mounted={mounted} anim={anim}>
      <ModalCard anim={anim} style={{ padding: 24, gap: 16 }}>
        <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 20, color: c.text }}>
          {ready ? '✅ Mise à jour prête' : '⬆️ Mise à jour disponible'}
        </Text>

        <Text style={{ fontFamily: 'GrandParis-Regular', fontSize: 13, color: c.text, lineHeight: 19 }}>
          {ready
            ? "Le téléchargement est terminé. Redémarre l'app pour l'installer."
            : "Une nouvelle version de Grand Paname est disponible sur le Play Store. Tu veux l'installer maintenant ?"}
        </Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <ModalButton onPress={onDismiss} backgroundColor="transparent" style={{ flex: 1, borderWidth: 1, borderColor: c.borderCard }}>
            <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 15, color: c.textSub }}>Plus tard</Text>
          </ModalButton>
          <ModalButton onPress={onAccept} backgroundColor={c.accent} style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 15, color: '#fff' }}>{ready ? 'Redémarrer' : 'Mettre à jour'}</Text>
          </ModalButton>
        </View>
      </ModalCard>
    </ModalBackdrop>
  );
}

// Orientation libre partout, y compris sur téléphone : le paysage y est
// désormais un vrai mode supporté (panneau Favoris/Trafic permanent, voir
// responsive.ts), pas juste toléré. Ça correspond aussi à ce qu'exige
// Google Play sur les grands écrans (tablettes/pliables) — Android 16
// ignorera de toute façon les verrous d'orientation sur ces appareils, mais
// l'app doit rester utilisable quand ça arrive plutôt que de casser sa mise
// en page.
function useAdaptiveOrientationLock() {
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
  }, []);
}

// ─── APP PRINCIPALE ───────────────────────────────────────────────────────────
// Entrée de la barre de navigation. La pastille d'état actif n'est pas ici :
// c'est un calque unique qui glisse d'une entrée à l'autre (voir AppInner).
function NavItem({ actif, label, onPress, icone, couleurTexte }: {
  actif: boolean; label: string; onPress: () => void; icone: React.ReactNode; couleurTexte: string;
}) {
  return (
    <TouchableOpacity style={styles.tabItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.tabPill}>{icone}</View>
      <Text style={[styles.tabLabel, { color: couleurTexte, fontFamily: actif ? 'GrandParis-Bold' : 'GrandParis-Medium' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AppInner() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  useAdaptiveOrientationLock();

  // `useWindowDimensions` (réactif) plutôt que `Dimensions.get('window')`
  // (figé à l'exécution du module) : sur un écran redimensionnable en direct
  // (fenêtre Samsung DeX, pliable qu'on ouvre/referme...), la valeur figée
  // ne suivait jamais le vrai changement de taille — le panneau d'horaires
  // (PANEL_H, points d'ancrage mi/plein écran) restait calculé pour la
  // taille de fenêtre du tout premier lancement, coupant le contenu dès que
  // la fenêtre réelle différait.
  const { width: screenWidth, height: SCREEN_H } = useWindowDimensions();

  const PANEL_H = SCREEN_H - insets.top;

  const [activeTab, setActiveTab] = useState<'accueil' | 'favoris' | 'trafic'>('accueil');
  // Écran large (voir responsive.ts) : le tiroir ouvert reste affiché en
  // permanence (il ne glisse plus hors champ) et recouvre la carte comme sur
  // téléphone — la carte, elle, reste toujours plein écran (pas de resize,
  // pas de rechargement de tuiles). Ces insets servent uniquement à confiner
  // les CONTRÔLES flottants (recherche, barre de nav...) à la zone non
  // recouverte, pour qu'ils ne s'affichent pas par-dessus le tiroir (voir
  // AccueilScreen et la barre de nav plus bas, tous deux zIndex plus élevé).
  const isWideLayout = useIsWideLayout();
  const mapLeftInset = isWideLayout && activeTab === 'favoris' ? WIDE_PANEL_INSET : 0;
  const mapRightInset = isWideLayout && activeTab === 'trafic' ? WIDE_PANEL_INSET : 0;
  // Version animée de ces insets, pour que la barre de nav (voir plus bas)
  // glisse en douceur au lieu de sauter instantanément quand un tiroir
  // permanent s'ouvre/se ferme (changement de largeur du même ordre que le
  // tiroir lui-même — même durée que son slide, 300ms, pour rester en phase).
  const navLeftInsetAnim = useRef(new Animated.Value(0)).current;
  const navRightInsetAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(navLeftInsetAnim, { toValue: mapLeftInset, duration: 300, useNativeDriver: false }).start();
  }, [mapLeftInset]);
  useEffect(() => {
    Animated.timing(navRightInsetAnim, { toValue: mapRightInset, duration: 300, useNativeDriver: false }).start();
  }, [mapRightInset]);
  const [favoris, setFavoris] = useState<Gare[]>([]);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [gareActuelle, setGareActuelle] = useState<{ id: string; label: string; osmOnly?: boolean } | null>(null);
  // Vrai pendant l'animation de fermeture complète (croix) : la barre du bas
  // doit tout de suite réafficher la recherche au lieu du nom de l'arrêt,
  // alors que gareActuelle reste renseignée pour le titre du volet qui descend.
  const [quittantVueArret, setQuittantVueArret] = useState(false);
  const [panelIsOpen, setPanelIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBugForm, setShowBugForm] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  useEffect(() => { AsyncStorage.getItem('@gp_debug_overlay').then(v => { if (v === '1') setShowDebugOverlay(true); }); }, []);
  const [flouActif, setFlouActif] = useState(true);
  useEffect(() => { AsyncStorage.getItem('@gp_debug_flou').then(v => { if (v === '0') setFlouActif(false); }).catch(() => {}); }, []);
  flouGlobalActif = flouActif;
  // Pas de comparaison avec APP_VERSION : on affiche la dernière entrée
  // whatsnew tant que l'utilisateur ne l'a pas vue, même s'il a depuis
  // avancé d'une version de plus (ex: une version sort sans entrée
  // whatsnew, puis on en ajoute une pour l'annoncer après coup — elle
  // doit quand même s'afficher).
  const checkWhatsNew = useCallback(() => {
    const latest = WHATSNEW[0];
    if (!latest) return;
    AsyncStorage.getItem('@gp_whatsnew_seen_version').then(v => {
      if (v !== latest.version) setShowWhatsNew(true);
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('@gp_onboarding_seen').then(seen => {
      if (seen !== '1') {
        // "Pas encore vu le tuto" couvre aussi bien un vrai premier lancement
        // qu'une mise à jour depuis une version d'avant l'existence de cette
        // clé (ex: 3.2.0, qui a introduit le tuto) — dans ce dernier cas,
        // marquer silencieusement "quoi de neuf" comme vu privait ces
        // utilisateurs existants de l'annonce, sans qu'ils l'aient jamais
        // vue (bug de la 3.2.0). On enchaîne donc avec "quoi de neuf" juste
        // après le tuto (voir onFinish du OnboardingTour) au lieu de le
        // supprimer.
        setShowOnboarding(true);
        AsyncStorage.setItem('@gp_onboarding_seen', '1').catch(() => {});
        return;
      }
      checkWhatsNew();
    });
  }, [checkWhatsNew]);
  // Gardé pour permettre de le copier depuis Paramètres > Débogage — sans
  // ça, tester une notif push demande de la ligne de commande (curl vers
  // l'API Expo Push, ou passer par Firebase Console) pour se procurer le
  // token de CET appareil. Avec le token copié, il suffit d'aller sur
  // https://expo.dev/notifications, de le coller et d'envoyer.
  const [pushToken, setPushToken] = useState<string | null>(null);
  useEffect(() => { registerForPushNotificationsAsync().then(setPushToken); }, []);

  // ── Mise à jour Play Store depuis l'app ──────────────────────────────────
  // require() différé partout ci-dessous : ces deux libs plantent à l'évaluation
  // de leur module si le natif n'est pas lié (Expo Go / dev client pas rebuild).
  // Un import statique en tête de fichier crasherait tout le bundle avant même
  // qu'un try/catch puisse intervenir ; require() à l'intérieur d'un try/catch
  // reporte cette évaluation au bon endroit et au bon moment.
  const inAppUpdates = useRef<SpInAppUpdatesType | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  // Fenêtre à flou affichée (ou en train de se fermer, ~0,6 s) → flous natifs coupés.
  const fenetreFlou = showWhatsNew || showOnboarding || showUpdateModal;
  const [flouSuspendu, setFlouSuspendu] = useState(false);
  useEffect(() => {
    if (fenetreFlou) { setFlouSuspendu(true); return; }
    const t = setTimeout(() => setFlouSuspendu(false), 600);
    return () => clearTimeout(t);
  }, [fenetreFlou]);
  flouNatifActif = !flouSuspendu && !fenetreFlou;
  const [updateReady, setUpdateReady] = useState(false);
  // true dès qu'une vraie mise à jour (pas le test dev) a été détectée ou
  // téléchargée, et reste vrai même après avoir tapé "Plus tard" — permet de
  // la retrouver et la relancer depuis les Paramètres plutôt que d'attendre
  // qu'elle se represente au prochain lancement de l'app.
  const [hasPendingUpdate, setHasPendingUpdate] = useState(false);
  const [updateDownloadingBg, setUpdateDownloadingBg] = useState(false);
  const [fakeUpdateTest, setFakeUpdateTest] = useState(false);
  const fakeUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (fakeUpdateTimerRef.current) clearTimeout(fakeUpdateTimerRef.current); }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // On vérifie que les modules natifs sont bien liés AVANT de les require() —
    // sinon leur simple chargement lève une exception bruyante (Expo Go, ou
    // dev client pas encore reconstruit avec ces libs). Cas normal en dev,
    // pas la peine de logger quoi que ce soit.
    if (!NativeModules.RNDeviceInfo || !NativeModules.SpInAppUpdates) return;
    try {
      const SpInAppUpdates = require('sp-react-native-in-app-updates').default;
      const { getBuildNumber } = require('react-native-device-info');
      inAppUpdates.current = new SpInAppUpdates(__DEV__);
      // Sur Android, la lib compare le versionCode du Store au curVersion fourni —
      // il faut donc lui passer le versionCode natif (getBuildNumber), pas le nom
      // de version APP_VERSION (semver "3.1.1"), sinon la comparaison est absurde.
      inAppUpdates.current
        ?.checkNeedsUpdate({ curVersion: getBuildNumber() })
        .then((result: { shouldUpdate: boolean }) => { if (result.shouldUpdate) { setShowUpdateModal(true); setHasPendingUpdate(true); } })
        .catch((e: any) => logger.warn(`checkNeedsUpdate: ${e?.message}`));
    } catch (e: any) {
      logger.warn(`in-app-updates indisponible : ${e?.message}`);
    }
  }, []);

  // Déclenche le téléchargement (mode FLEXIBLE) : la boîte de dialogue native
  // Play Store s'affiche par-dessus, puis on referme notre modale pour laisser
  // l'app utilisable pendant le téléchargement en arrière-plan. On la rouvre
  // en mode "ready" une fois le téléchargement terminé, plutôt que de
  // redémarrer l'app tout seul sans prévenir.
  const declarerMiseAJour = () => {
    if (!inAppUpdates.current) { setShowUpdateModal(false); return; }
    try {
      const { IAUUpdateKind, IAUInstallStatus } = require('sp-react-native-in-app-updates');
      const onStatus = (status: { status: AndroidInstallStatus }) => {
        if (status.status === IAUInstallStatus.DOWNLOADED) {
          inAppUpdates.current?.removeStatusUpdateListener(onStatus);
          setUpdateDownloadingBg(false);
          setUpdateReady(true);
          setShowUpdateModal(true);
        } else if (status.status === IAUInstallStatus.FAILED || status.status === IAUInstallStatus.CANCELED) {
          inAppUpdates.current?.removeStatusUpdateListener(onStatus);
          setUpdateDownloadingBg(false);
        }
      };
      inAppUpdates.current.addStatusUpdateListener(onStatus);
      inAppUpdates.current
        .startUpdate({ updateType: IAUUpdateKind.FLEXIBLE as AndroidUpdateType })
        .then(() => { setShowUpdateModal(false); setUpdateDownloadingBg(true); })
        .catch((e: any) => {
          logger.warn(`startUpdate: ${e?.message}`);
          inAppUpdates.current?.removeStatusUpdateListener(onStatus);
          setShowUpdateModal(false);
        });
    } catch (e: any) {
      logger.warn(`declarerMiseAJour: ${e?.message}`);
      setShowUpdateModal(false);
    }
  };

  // Cinématique simulée pour le bouton de test dev : reproduit le même
  // enchaînement que le vrai flow (fermeture pendant le "téléchargement",
  // réouverture en mode "ready") sans toucher au module natif.
  const declarerMiseAJourFake = () => {
    setShowUpdateModal(false);
    setUpdateDownloadingBg(true);
    fakeUpdateTimerRef.current = setTimeout(() => {
      setUpdateDownloadingBg(false);
      setUpdateReady(true);
      setShowUpdateModal(true);
    }, 8000);
  };

  const handleUpdateAccept = () => {
    if (fakeUpdateTest) {
      if (updateReady) {
        logger.info('Simulation : redémarrage (test dev)');
        setShowUpdateModal(false);
        setUpdateReady(false);
        setFakeUpdateTest(false);
      } else {
        declarerMiseAJourFake();
      }
      return;
    }
    if (updateReady) {
      inAppUpdates.current?.installUpdate();
    } else {
      declarerMiseAJour();
    }
  };

  const handleUpdateDismiss = () => {
    setUpdateDownloadingBg(false);
    if (fakeUpdateTimerRef.current) { clearTimeout(fakeUpdateTimerRef.current); fakeUpdateTimerRef.current = null; }
    setShowUpdateModal(false);
    // Pour une vraie mise à jour (pas le test dev), on garde `updateReady` et
    // `hasPendingUpdate` intacts après "Plus tard" : la modale doit pouvoir
    // se rouvrir dans le bon mode (prompt/ready) depuis les Paramètres, sans
    // redemander le téléchargement s'il est déjà fait.
    if (fakeUpdateTest) {
      setUpdateReady(false);
      setFakeUpdateTest(false);
    }
  };

  const handleOpenPendingUpdate = () => setShowUpdateModal(true);
  const nativeSchedulesRef = useRef<SchedulesRef>(null);
  const svLayout = useSharedValue(0);
  const [panelLines, setPanelLines] = useState<LineChip[] | null>(null);
  const linesAbortRef = useRef<AbortController | null>(null);
  // Arrêt dont le chargement (chips, poteaux, sorties) est en cours ou terminé.
  // Volontairement une ref : deux taps rapprochés sur la carte arrivent avant
  // le re-rendu, la valeur de l'état React (`gareActuelle`) serait alors
  // périmée et ferait croire à tort qu'un arrêt est "déjà ouvert".
  const gareIdRef = useRef<string | null>(null);

  type PanelLineItem = { type: 'chip'; chip: LineChip } | { type: 'mode'; mode: string };
  const panelLineItems = useMemo((): PanelLineItem[] => {
    if (!panelLines || panelLines.length === 0) return [];
    const sorted = [...panelLines].sort(comparerLignesParMode);
    const items: PanelLineItem[] = [];
    let lastGroup = '';
    for (const chip of sorted) {
      if (chip.mode !== lastGroup) {
        items.push({ type: 'mode', mode: chip.mode });
        lastGroup = chip.mode;
      }
      items.push({ type: 'chip', chip });
    }
    return items;
  }, [panelLines]);
  // Icône du mode dominant affichée dans l'en-tête du panneau (premier
  // groupe de la liste déjà triée par comparerLignesParMode).
  const headerModeIcon = useMemo(() => {
    const first = panelLineItems.find((i): i is { type: 'mode'; mode: string } => i.type === 'mode');
    return first ? (MODE_ICONS[first.mode] ?? MODE_ICONS['BUS']) : null;
  }, [panelLineItems]);
  const mapRef = useRef<MapWebViewRef | null>(null);
  const viderCacheCarte = useCallback(() => {
    mapRef.current?.clearCache();
    if (Platform.OS === 'android') ToastAndroid.show('Cache de la carte vidé', ToastAndroid.SHORT);
  }, []);
  const blurTargetRef = useRef<View | null>(null);

  // ── Panel animé (Reanimated) ─────────────────────────────────────────────
  // Tout ce qui pilote le volet vit désormais en shared values Reanimated
  // (lues/écrites depuis des worklets qui tournent sur le thread UI), et non
  // plus en Animated.Value + refs JS. C'est une contrainte de
  // react-native-gesture-handler : un Gesture.Pan dont les callbacks
  // tournent sur le thread JS (via .runOnJS(true)) désactive le geste natif
  // du ScrollView de façon globale pendant qu'il est actif — documenté par
  // l'équipe RNGH (issues #2622, #2170, #625) — quelle que soit la relation
  // simultaneousWithExternalGesture déclarée. En gardant les callbacks comme
  // de vrais worklets (thread UI), cette coexistence fonctionne correctement.
  const snapHiddenSV = useSharedValue(PANEL_H);
  const snapHalfSV   = useSharedValue(PANEL_H - SCREEN_H * 0.50);
  const snapFullSV   = useSharedValue(headerHeight > 0 ? headerHeight - insets.top + 8 : PANEL_H);
  // Écrire dans une shared value pendant le rendu (plutôt que dans un effet)
  // déclenche un warning Reanimated ("Writing to `value` during component
  // render") et, vu la fréquence des re-rendus de cet écran, répète cette
  // écriture bien plus souvent que nécessaire — potentiellement pendant
  // qu'un geste de scroll est en cours. On ne met donc à jour que lorsque
  // les valeurs sources changent réellement.
  useEffect(() => {
    snapHiddenSV.value = PANEL_H;
    snapHalfSV.value   = PANEL_H - SCREEN_H * 0.50;
    snapFullSV.value   = headerHeight > 0 ? headerHeight - insets.top + 8 : PANEL_H;
    // Les trois lignes ci-dessus ne mettent à jour que les POINTS D'ANCRAGE
    // — pas `panelY`, la position réellement affichée. Sans ça, après un
    // changement de hauteur d'écran (rotation), `panelY` restait à
    // l'ancienne position "hidden" — celle calculée pour la précédente
    // hauteur d'écran (ex: paysage, plus petite). Cette ancienne valeur ne
    // suffit plus à cacher le panneau une fois revenu à un écran plus haut
    // (portrait) : le panneau réapparaissait, vide, coincé en haut de
    // l'écran. On resynchronise instantanément (pas de spring ici, ce n'est
    // pas un geste utilisateur) `panelY` sur la cible actuelle, quel que
    // soit le snap en cours (hidden/half/full).
    panelY.value = panelSnapSV.value === 'hidden' ? snapHiddenSV.value
                 : panelSnapSV.value === 'half'   ? snapHalfSV.value
                                                   : snapFullSV.value;
  }, [PANEL_H, SCREEN_H, headerHeight, insets.top]);

  const panelY      = useSharedValue(PANEL_H);
  const panelSnapSV = useSharedValue<'hidden' | 'half' | 'full'>('hidden');
  const dragStartY  = useSharedValue(PANEL_H);
  const contentDragEngagedSV = useSharedValue(false);
  // Tiré du volet depuis la LISTE des horaires (voir contenuPanGesture).
  const listScrollY = useSharedValue(0);
  const toucheDepartY = useSharedValue(0);
  const toucheDepartX = useSharedValue(0);
  const decisionTouche = useSharedValue(0); // 0 indécis, 1 volet, -1 liste/horizontal

  // Hauteur visible du contenu, dérivée directement de panelY (seule source
  // de vérité, pilotée sur le thread UI) plutôt que via un second spring
  // séparé — deux animations indépendantes avec la même physique peuvent
  // diverger visuellement dès que le thread JS est occupé (rendu de la
  // liste des horaires pendant le mouvement), d'où un décalage entre le
  // volet et son contenu. useDerivedValue recalcule automatiquement à
  // chaque frame où panelY change : il n'y a plus qu'une seule animation
  // réelle, le contenu suit toujours exactement le volet.
  const contentH = useDerivedValue(() => {
    const snapFull = snapFullSV.value;
    const snapHalf = snapHalfSV.value;
    const sv = svLayout.value;
    if (sv <= 0 || snapFull >= snapHalf) return 50;
    // Le conteneur du contenu descend jusqu'au bas du volet, qui dépasse en bas de l'écran
    // d'autant que le volet est translaté (`panelY`). La hauteur VISIBLE est donc
    // `sv − panelY` (bornée entre plein écran et mi-hauteur). Avant, en plein écran on
    // gardait `sv` entier : le bas de la liste se trouvait sous le bord de l'écran, donc
    // derrière la barre de nav (dernier horaire caché).
    const y = Math.min(snapHalf, Math.max(snapFull, panelY.value));
    return Math.max(50, sv - y);
  });

  const panelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelY.value }],
  }));
  const contentAnimatedStyle = useAnimatedStyle(() => ({
    height: contentH.value,
  }));

  const snapTo = useCallback((snap: 'hidden' | 'half' | 'full', onDone?: () => void) => {
    const to = snap === 'hidden' ? snapHiddenSV.value
             : snap === 'half'   ? snapHalfSV.value
                                 : snapFullSV.value;
    panelSnapSV.value = snap;

    panelY.value = withSpring(to, { damping: 15, stiffness: 120, mass: 0.5 }, (finished) => {
      if (finished && onDone) runOnJS(onDone)();
    });
  }, [panelY, panelSnapSV, snapHiddenSV, snapHalfSV, snapFullSV]);

  const snapToRef = useRef(snapTo);
  snapToRef.current = snapTo;

  // Ferme uniquement le volet des horaires : la vue de l'arrêt (poteaux
  // compris) reste affichée, avec son nom à la place de la barre de
  // recherche, jusqu'à ce qu'on quitte explicitement via quitterVueArret.
  // Ne doit PAS annuler le chargement en cours (lignes/poteaux) : la vue de
  // l'arrêt reste affichée, et un volet baissé trop vite laissait les
  // poteaux physiques jamais dessinés (seul quitterVueArret annule).
  const fermerPanel = useCallback(() => {
    setPanelIsOpen(false);
    snapTo('hidden');
  }, [snapTo]);
  const fermerPanelRef = useRef(fermerPanel);
  fermerPanelRef.current = fermerPanel;

  // Quitte complètement la vue de l'arrêt : ferme le volet, efface les
  // poteaux/pin de la carte et fait réapparaître la barre de recherche.
  // Jeton de fermeture : la fermeture n'efface l'arrêt qu'à la fin de
  // l'animation du volet. Si un autre arrêt est ouvert entre-temps
  // (ouvrirGare invalide le jeton), cette fin d'animation, exécutée en retard,
  // ne doit surtout pas effacer le nouvel arrêt (volet ouvert mais vide).
  const jetonFermetureRef = useRef(0);
  const quitterVueArret = useCallback(() => {
    linesAbortRef.current?.abort();
    setPanelIsOpen(false);
    setQuittantVueArret(true);
    gareIdRef.current = null;
    const jeton = ++jetonFermetureRef.current;
    snapTo('hidden', () => {
      if (jetonFermetureRef.current !== jeton) return;
      setGareActuelle(null); setPanelLines(null); setQuittantVueArret(false);
    });
    mapRef.current?.clearActiveStation();
  }, [snapTo]);

  // Garde-fou : un volet ouvert sans aucun arrêt sélectionné n'a pas de sens
  // (panneau vide, sans nom) — on le range plutôt que de le laisser affiché.
  useEffect(() => {
    if (!gareActuelle && panelSnapSV.value !== 'hidden') {
      setPanelIsOpen(false);
      snapTo('hidden');
    }
  }, [gareActuelle, snapTo, panelSnapSV]);

  // Appelé via runOnJS depuis les worklets onEnd des deux gestes (poignée et
  // contenu) : décide, sur le thread JS, quel snap viser en fonction de la
  // vitesse/distance du relâchement. Lit panelSnapSV.value directement (les
  // shared values sont lisibles depuis n'importe quel thread).
  const handleDragEnd = useCallback((vy: number, dy: number) => {
    if (vy < -0.5 || dy < -60) {
      snapToRef.current('full');
    } else if (vy > 0.5 || dy > 60) {
      if (panelSnapSV.value === 'full') snapToRef.current('half');
      else fermerPanelRef.current();
    } else {
      snapToRef.current(panelSnapSV.value);
    }
  }, [panelSnapSV]);

  // Les callbacks des deux gestes sont maintenant de vrais worklets (thread
  // UI), pas des callbacks .runOnJS(true) (thread JS) : RNGH désactive
  // sinon le geste natif du ScrollView de façon globale tant qu'un Pan est
  // actif, peu importe simultaneousWithExternalGesture (bug documenté,
  // issues RNGH #2622/#2170/#625 — testé, confirmé sur cette app). Seul
  // handleDragEnd (qui décide du prochain snap et peut fermer le volet)
  // repasse sur le thread JS via runOnJS, puisqu'il touche React state.
  // TROUVÉ (après une longue série de fausses pistes sur l'en-tête,
  // confirmé par test) : le vrai coupable était `Gesture.Native()` posé sur
  // le ScrollView de la liste (composé via simultaneousWithExternalGesture
  // avec nos Pan). Cette composition Native+Pan gèle le scroll natif au bout
  // d'un moment — bug documenté de RNGH (issues #2622/#2170/#625). En
  // retirant complètement ce wrapper (le ScrollView redevient 100% natif,
  // sans aucune implication RNGH), le blocage disparaît.
  //
  // Plus délicat : `contentPanGesture` gérait aussi le tiré-pour-agrandir
  // depuis le titre/les pastilles, mais en étant attaché à TOUTE la zone
  // (jusqu'à la liste elle-même) et activé seulement "liste tout en haut".
  // Résultat : dès qu'on commençait à scroller depuis le haut de la liste
  // (le cas le plus courant), ce geste le prenait pour un tiré-pour-agrandir
  // au lieu de laisser le scroll natif agir. La liste elle-même ne doit donc
  // plus jamais porter aucun Pan concurrent — seuls la poignée et le bloc
  // titre/pastilles (jamais scrollables) restent glissables, sans condition
  // sur la position de scroll : plus aucune zone d'ambiguïté possible.
  const headerPanGesture = useMemo(() =>
    Gesture.Pan()
      .onBegin(() => {
        'worklet';
        panelY.value = panelY.value; // annule un spring en cours
        dragStartY.value = panelY.value;
      })
      .onUpdate((e) => {
        'worklet';
        panelY.value = Math.max(snapFullSV.value - 30, Math.min(snapHiddenSV.value, dragStartY.value + e.translationY));
      })
      .onEnd((e) => {
        'worklet';
        runOnJS(handleDragEnd)(e.velocityY / 1000, e.translationY);
      })
      .activeOffsetY([-5, 5])
      .failOffsetX([-15, 15])
  , [handleDragEnd, panelY, dragStartY, snapFullSV, snapHiddenSV]);

  const titleChipsPanGesture = useMemo(() =>
    Gesture.Pan()
      .onBegin(() => {
        'worklet';
        contentDragEngagedSV.value = false;
      })
      .onUpdate((e) => {
        'worklet';
        if (!contentDragEngagedSV.value) {
          contentDragEngagedSV.value = true;
          panelY.value = panelY.value; // annule un spring en cours
          dragStartY.value = panelY.value;
        }
        panelY.value = Math.max(snapFullSV.value - 30, Math.min(snapHiddenSV.value, dragStartY.value + e.translationY));
      })
      .onEnd((e) => {
        'worklet';
        if (!contentDragEngagedSV.value) return;
        contentDragEngagedSV.value = false;
        runOnJS(handleDragEnd)(e.velocityY / 1000, e.translationY);
      })
      .activeOffsetY([-10, 10])
      .failOffsetX([-20, 20])
  , [handleDragEnd, panelY, dragStartY, snapFullSV, snapHiddenSV, contentDragEngagedSV]);

  // ── Données ──────────────────────────────────────────────────────────────
  // Tiré du volet depuis n'importe où sur la liste des horaires, sans gêner son défilement.
  // Le ScrollView reste 100 % natif (voir le long commentaire plus haut : un Pan concurrent
  // le gelait) ; ce Pan est en ACTIVATION MANUELLE : il ne prend le geste que quand on le
  // décide, et se déclare en échec dès qu'il s'agit d'un défilement de liste.
  //  - seul un tiré vers le bas depuis le HAUT de la liste déplace le volet (replier / fermer) ;
  //  - sinon (liste défilée, ou geste vers le haut) la liste défile normalement, y compris
  //    en mode semi-ouvert.
  const contenuPanGesture = useMemo(() =>
    Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((e) => {
        'worklet';
        decisionTouche.value = 0;
        if (e.allTouches.length > 0) { toucheDepartY.value = e.allTouches[0].absoluteY; toucheDepartX.value = e.allTouches[0].absoluteX; }
      })
      .onTouchesMove((e, mgr) => {
        'worklet';
        if (decisionTouche.value !== 0 || e.allTouches.length === 0) return;
        const dy = e.allTouches[0].absoluteY - toucheDepartY.value;
        const dx = e.allTouches[0].absoluteX - toucheDepartX.value;
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) { decisionTouche.value = -1; mgr.fail(); return; }
        if (Math.abs(dy) < 8) return;
        // Quel que soit l'état du volet (mi-hauteur ou plein écran) : seul un tiré vers le BAS
        // depuis le haut de la liste déplace le volet ; tout le reste fait défiler la liste
        // (compromis voulu : on peut défiler les horaires en mode semi-ouvert ; pour agrandir
        // le volet, on le tire par la poignée, le titre ou les pastilles de lignes).
        if (!(dy > 0 && listScrollY.value <= 1)) { decisionTouche.value = -1; mgr.fail(); return; }
        decisionTouche.value = 1;
        mgr.activate();
      })
      .onStart(() => {
        'worklet';
        panelY.value = panelY.value; // annule un ressort en cours
        dragStartY.value = panelY.value;
      })
      .onUpdate((e) => {
        'worklet';
        panelY.value = Math.max(snapFullSV.value - 30, Math.min(snapHiddenSV.value, dragStartY.value + e.translationY));
      })
      .onEnd((e) => {
        'worklet';
        runOnJS(handleDragEnd)(e.velocityY / 1000, e.translationY);
      })
  , [handleDragEnd, panelY, dragStartY, snapFullSV, snapHiddenSV, panelSnapSV, listScrollY, toucheDepartY, toucheDepartX, decisionTouche]);

  const [fontsLoaded] = useFonts({
    'GrandParis-Light':   require('./assets/GrandParis-Light.otf'),
    'GrandParis':         require('./assets/GrandParis.otf'),
    'GrandParis-Regular': require('./assets/GrandParis-Regular.otf'),
    'GrandParis-Medium':  require('./assets/GrandParis-Medium.otf'),
    'GrandParis-Bold':    require('./assets/GrandParis-Bold.otf'),
  });

  // Pastille de la barre de nav : un seul calque qui glisse vers l'onglet actif.
  const [largeurBarreNav, setLargeurBarreNav] = useState(0);
  const indexNav = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(indexNav, {
      toValue: activeTab === 'favoris' ? 0 : activeTab === 'accueil' ? 1 : 2,
      stiffness: 300, damping: 24, mass: 1, overshootClamping: true, useNativeDriver: true,
    }).start();
  }, [activeTab]);
  const largeurEntreeNav = largeurBarreNav > 0 ? (largeurBarreNav - 2 - 12) / 3 : 0;
  // Le flou d'un tiroir n'est monté que pendant qu'il est visible (le nombre de
  // flous simultanés sur la carte est limité, voir VERRE_FLOU_ZONES) : il reste
  // monté pendant l'animation de fermeture, sinon il disparaîtrait d'un coup.
  // Géométrie des tiroirs (téléphone), lue aussi par les gestes créés une seule fois.
  const geomTiroir = useRef({ top: 0, bottom: 0, larg: 0 });
  geomTiroir.current = { top: headerHeight + 12, bottom: NAV_BAR_BOTTOM + NAV_BAR_HEIGHT + 12, larg: screenWidth * 0.82 };
  // Rectangle de verre d'un tiroir, envoyé à la carte. `tx` = décalage horizontal
  // (0 = ouvert, ±largeur d'écran = fermé) ; `anim` : la carte anime le passage
  // (transition CSS, sur son propre thread), sinon suit tel quel (doigt).
  const rectTiroir = (tab: 'favoris' | 'trafic', tx: number, anim: boolean): RectVerre => {
    const g = geomTiroir.current;
    return {
      id: tab === 'favoris' ? 'tiroir_fav' : 'tiroir_trafic',
      x: tab === 'favoris' ? 0 : screenWidth - g.larg, y: g.top, b: g.bottom, w: g.larg,
      r: tab === 'favoris' ? '0 28px 28px 0' : '28px 0 0 28px', o: '0 6px 24px rgba(0,0,0,0.28)', tx, anim, d: 450, nf: VERRE_FLOU_ZONES.tiroirs === 'natif',
    };
  };
  // Flou natif d'un tiroir : monté seulement pendant qu'il est visible (un flou natif
  // fait redessiner la carte à chaque image), y compris pendant sa fermeture.
  const [flouFav, setFlouFav] = useState(false);
  const [flouTrafic, setFlouTrafic] = useState(false);
  const tiroirBlurRef = useRef<View | null>(null);
  // Cible du flou de la barre de nav devant le volet des horaires : le volet seul (pas la carte).
  const panelBlurRef = useRef<View | null>(null);
  const favSlideAnim  = useRef(new Animated.Value(-screenWidth)).current;
  const traficSlideAnim = useRef(new Animated.Value(screenWidth)).current;

  // Voile sombre derrière le tiroir ouvert, lié à sa position (0 = fermé, 1 = ouvert).
  const voileOpacity = useRef(Animated.add(
    favSlideAnim.interpolate({ inputRange: [-screenWidth, 0], outputRange: [0, 1], extrapolate: 'clamp' }),
    traficSlideAnim.interpolate({ inputRange: [0, screenWidth], outputRange: [1, 0], extrapolate: 'clamp' }),
  )).current;

  // Glisser un tiroir vers son bord le referme, en suivant le doigt ; en deçà
  // du seuil il revient en place. sens = -1 (Favoris, à gauche) / 1 (Trafic).
  // Le retour en place est ignoré si l'onglet a changé entre-temps (ex: tap sur
  // un favori pendant le glissement) : sinon le ressort écraserait l'animation
  // de fermeture et laisserait le tiroir à moitié ouvert.
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  // Fermeture lancée directement par le geste (voir onPanResponderRelease) : l'effet
  // d'onglet ne doit pas relancer sa propre animation par-dessus.
  const fermeParGesteRef = useRef(false);
  const creerSwipeTiroir = (anim: Animated.Value, sens: 1 | -1, tab: 'favoris' | 'trafic') => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => activeTabRef.current === tab && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && g.dx * sens > 0,
    onPanResponderGrant: () => anim.stopAnimation(),
    onPanResponderMove: (_, g) => {
      const v = sens * Math.max(0, g.dx * sens);
      anim.setValue(v);
      if (VERRE_FLOU_ZONES.tiroirs === 'suivi') definirRect(rectTiroir(tab, v, false));
    },
    onPanResponderRelease: (_, g) => {
      if (activeTabRef.current !== tab) return;
      if (g.dx * sens > 80 || g.vx * sens > 0.5) {
        // La fermeture démarre TOUT DE SUITE avec la vitesse du doigt : avant, elle attendait
        // le changement d'onglet (rendu + effet) puis repartait de zéro avec une courbe, d'où
        // un petit arrêt au moment où on lâche le doigt.
        fermeParGesteRef.current = true;
        Animated.spring(anim, { toValue: sens * screenWidth, velocity: g.vx, stiffness: 220, damping: 26, mass: 1, overshootClamping: true, useNativeDriver: true })
          .start(({ finished }) => { fermeParGesteRef.current = false; if (finished) { setFlouFav(false); setFlouTrafic(false); } });
        setActiveTab('accueil');
      } else {
        Animated.spring(anim, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        if (VERRE_FLOU_ZONES.tiroirs === 'suivi') definirRect(rectTiroir(tab, 0, true));
      }
    },
    onPanResponderTerminate: () => {
      if (activeTabRef.current === tab) {
        Animated.spring(anim, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        if (VERRE_FLOU_ZONES.tiroirs === 'suivi') definirRect(rectTiroir(tab, 0, true));
      }
    },
  });
  const swipeFav = useRef(creerSwipeTiroir(favSlideAnim, -1, 'favoris')).current;
  const swipeTrafic = useRef(creerSwipeTiroir(traficSlideAnim, 1, 'trafic')).current;

  // Envoi à la carte de l'état des tiroirs (ouvert / fermé) à chaque changement
  // d'onglet : la carte anime le glissement de son côté.
  useEffect(() => {
    if (isWideLayout || !flouActif || VERRE_FLOU_ZONES.tiroirs !== 'suivi') {
      retirerRect('tiroir_fav'); retirerRect('tiroir_trafic');
      return;
    }
    definirRect(rectTiroir('favoris', activeTab === 'favoris' ? 0 : -screenWidth, true));
    definirRect(rectTiroir('trafic', activeTab === 'trafic' ? 0 : screenWidth, true));
  }, [activeTab, flouActif, isWideLayout, headerHeight]);
  useEffect(() => () => { retirerRect('tiroir_fav'); retirerRect('tiroir_trafic'); }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('@grand_paname_favoris');
        if (stored) setFavoris(JSON.parse(stored));
      } catch (e: any) { logger.error(`Chargement favoris: ${e?.message}`); }
    })();
  }, []);

  const sauvegarderFavoris = async (list: Gare[]) => {
    try { await AsyncStorage.setItem('@grand_paname_favoris', JSON.stringify(list)); }
    catch (e: any) { logger.error(`Sauvegarde favoris: ${e?.message}`); }
  };

  const reordonnerFavoris = useCallback((from: number, to: number) => {
    setFavoris(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      sauvegarderFavoris(next);
      return next;
    });
  }, []);

  const basculerFavori = useCallback((gare: Gare) => {
    Haptics.selectionAsync().catch(() => {});
    const labelPropre = gare.label.replace(/\s*-\s*à\s*\d+m\s*$/i, '').trim();
    // Les pictos de modes de la recherche sont recalculés à chaque recherche :
    // inutile (et périmé) de les enregistrer avec le favori.
    const { modes: _modes, ...gareSansModes } = gare;
    const garePropre = { ...gareSansModes, label: labelPropre };
    setFavoris(prev => {
      const idx = prev.findIndex(f => f.id === garePropre.id);
      const next = idx > -1 ? prev.filter(f => f.id !== garePropre.id) : [...prev, garePropre];
      sauvegarderFavoris(next);
      return next;
    });
  }, []);

  const estFavori = useCallback((id: string) => favoris.some(f => f.id === id), [favoris]);

  const ouvrirGare = useCallback((id: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const isOSM = id.startsWith('osm:');
    // "Déjà ouverte" seulement si son chargement n'a pas été annulé entre-temps
    // (un tap rapide sur un autre arrêt l'annule : il faut alors le relancer).
    const dejaOuverte = gareIdRef.current === id && !!linesAbortRef.current && !linesAbortRef.current.signal.aborted;
    gareIdRef.current = id;
    jetonFermetureRef.current++;
    setQuittantVueArret(false);
    setGareActuelle({ id, label, osmOnly: isOSM });
    setPanelIsOpen(true);
    setActiveTab('accueil');
    if (panelSnapSV.value === 'hidden') snapTo('half');

    if (isOSM) {
      setPanelLines([]);
      return;
    }

    if (id === GHOST_STOP_ID) {
      setPanelLines(GHOST_CHIPS);
      mapRef.current?.flyTo(GHOST_STOP_COORD.lat, GHOST_STOP_COORD.lon);
      mapRef.current?.showStation(id, GHOST_STOP_COORD.lat, GHOST_STOP_COORD.lon, label);
      return;
    }

    if (dejaOuverte) {
      // Même station déjà ouverte (ex: on reclique un autre poteau du même
      // arrêt) : rien à faire, les horaires natifs se rafraîchissent déjà
      // tout seuls, pas besoin de retoucher au zoom ni au contenu.
      return;
    }

    setPanelLines(null);
    linesAbortRef.current?.abort();
    const ctrl = new AbortController();
    linesAbortRef.current = ctrl;

    // Les horaires (chips de lignes du panneau) ne dépendent pas des poteaux
    // de bus : on ne les fait plus attendre sur cette recherche, plus lente
    // sur les grosses stations (traitement par lots, voir stopPointsForArea).
    // Toutes les requêtes partent EN MÊME TEMPS (avant, elles s'enchaînaient : lignes,
    // puis coordonnée, puis poteaux et sorties — le déplacement de la carte
    // n'avait lieu qu'à la toute fin). Le résultat est le même, seule l'attente
    // diminue : on attend la plus lente au lieu de la somme.
    const pointsP = stopPointsForArea(id, ctrl.signal).catch(() => []);
    const coordP = coordGare(id).catch(() => null);
    const exitsP = coordP.then(c => (c ? stationExits(c.lat, c.lon, 200, id).catch(() => []) : []));
    linesForArea(id, ctrl.signal)
      .then(lines => {
        if (ctrl.signal.aborted) return;
        setPanelLines(lines);

        // Le bus est déjà détaillé sur ses poteaux physiques dispersés (voir
        // stopPointsForArea) — le remettre ici en plus, avec parfois 20+
        // lignes, rendrait l'encadré principal illisible. Le tram, comme
        // RER/Métro/Train/Câble/Fluvial, reste un point unique bien
        // identifié : il reste dans l'encadré principal.
        const groupes = new Map<string, { mode: string; lines: { code: string; color: string; textColor: string }[] }>();
        for (const l of lines) {
          if (l.mode === 'BUS') continue;
          if (!groupes.has(l.mode)) groupes.set(l.mode, { mode: l.mode, lines: [] });
          groupes.get(l.mode)!.lines.push({ code: l.code, color: l.color, textColor: l.textColor });
        }
        const modeGroups = Array.from(groupes.values());

        // Le stop_area d'un câble/funiculaire isolé (ex: funiculaire de
        // Montmartre) a parfois une coordonnée décalée par rapport au vrai
        // poteau — on préfère alors la position du poteau physique. Mais
        // quand le câble est en correspondance avec un mode lourd (ex: le
        // métro 8 à Pointe du Lac), on garde la coordonnée du pôle pour que
        // l'étiquette reste groupée et cohérente avec ce mode lourd.
        const aDuCable = modeGroups.some(g => g.mode === 'CABLE');
        const aUnModeLourd = modeGroups.some(g => g.mode === 'RER' || g.mode === 'TRAIN' || g.mode === 'METRO' || g.mode === 'TRAM');
        const cablePoteau = aDuCable && !aUnModeLourd;
        const coordPromise = cablePoteau
          ? coordPoteau(id).then(c => c ?? coordP)
          : coordP;

        coordPromise.catch(() => null).then(coord => {
          if (ctrl.signal.aborted || !coord) return;
          const main = { lat: coord.lat, lon: coord.lon, modeGroups };
          // Affiche le point principal tout de suite, mais sans bouger la
          // caméra : le zoom attend les poteaux de bus pour n'animer qu'une
          // seule fois vers le cadrage final (sinon on zoome une première
          // fois sur le point seul, puis une seconde fois — en dézoomant —
          // pour englober les poteaux, ce qui donne un aller-retour visible).
          mapRef.current?.showStopCluster(id, label, main, [], false);
          Promise.all([
            pointsP,
            // Câble isolé : coordonnée du poteau différente, sorties à recalculer ; sinon
            // les sorties demandées dès le départ.
            cablePoteau ? stationExits(coord.lat, coord.lon, 200, id).catch(() => []) : exitsP,
          ]).then(([points, exits]) => {
            if (ctrl.signal.aborted) return;
            mapRef.current?.showStopCluster(id, label, main, points, true, exits);
          });
        });
      })
      .catch(() => setPanelLines([]));
  }, [gareActuelle, snapTo]);

  const selectionnerDepuisFavoris = useCallback((id: string, label: string) => {
    setActiveTab('accueil');
    setTimeout(() => ouvrirGare(id, label), 50);
  }, [ouvrirGare]);


  useEffect(() => {
    // Ressort amorti (sans dépassement : un rebond ferait apparaître un vide au
    // bord de l'écran) pour un mouvement plus naturel qu'un simple timing.
    // Même courbe et même durée que la transition CSS du verre dans la carte
    // (voir setGlassRects) pour que le flou et le tiroir restent synchrones.
    const ressort = (v: Animated.Value, toValue: number) =>
      Animated.timing(v, { toValue, duration: 450, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true });
    if (activeTab === 'favoris') {
      // Range le volet des horaires en arrière-plan (comme fermerPanel) sans
      // quitter la vue de l'arrêt : la carte reste sur l'arrêt ouvert, avec
      // son nom dans la barre de recherche, prêt à réafficher le volet en
      // revenant sur l'onglet Accueil.
      fermerPanel();
      setFlouFav(true); setFlouTrafic(false);
      Animated.parallel([
        ressort(favSlideAnim, 0),
        ressort(traficSlideAnim, screenWidth),
      ]).start();
    } else if (activeTab === 'trafic') {
      setFlouTrafic(true); setFlouFav(false);
      Animated.parallel([
        ressort(traficSlideAnim, 0),
        ressort(favSlideAnim, -screenWidth),
      ]).start();
    } else {
      if (fermeParGesteRef.current) return;
      Animated.parallel([
        ressort(favSlideAnim, -screenWidth),
        ressort(traficSlideAnim, screenWidth),
      ]).start(({ finished }) => { if (finished) { setFlouFav(false); setFlouTrafic(false); } });
    }
  }, [activeTab, fermerPanel]);

  const showSettingsRef = useRef(showSettings);
  showSettingsRef.current = showSettings;
  const showBugFormRef = useRef(showBugForm);
  showBugFormRef.current = showBugForm;
  const showWhatsNewRef = useRef(showWhatsNew);
  showWhatsNewRef.current = showWhatsNew;
  const showOnboardingRef = useRef(showOnboarding);
  showOnboardingRef.current = showOnboarding;
  const showUpdateModalRef = useRef(showUpdateModal);
  showUpdateModalRef.current = showUpdateModal;
  const panelIsOpenRef = useRef(panelIsOpen);
  panelIsOpenRef.current = panelIsOpen;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showBugFormRef.current) { setShowBugForm(false); return true; }
      if (showSettingsRef.current) { setShowSettings(false); return true; }
      // On consomme l'événement (empêche de quitter l'app) sans fermer le
      // tuto : impossible de le passer, y compris via le bouton retour.
      if (showOnboardingRef.current) { return true; }
      if (showWhatsNewRef.current) { setShowWhatsNew(false); return true; }
      if (showUpdateModalRef.current) { handleUpdateDismiss(); return true; }
      if (panelIsOpenRef.current) { fermerPanelRef.current(); return true; }
      if (activeTabRef.current !== 'accueil') { setActiveTab('accueil'); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg }}><ActivityIndicator size="large" color={c.accent} /></View>;
  }

  // En layout large (voir responsive.ts), le tiroir reste affiché en
  // permanence (il ne glisse plus hors champ) : il n'a donc plus besoin
  // d'éviter verticalement le header logo+titre (en haut) ni la barre de
  // recherche/nav (en bas), qui restent confinés à une zone qui ne
  // chevauche pas le tiroir (voir mapLeftInset/mapRightInset). Lui laisser
  // toute la hauteur de l'écran (juste les insets système) au lieu de leur
  // garder la même marge que sur téléphone — sans ça, en paysage (hauteur
  // d'écran réduite), il ne restait presque plus de place pour le contenu
  // du tiroir (mesuré à 106px de haut, pas même assez pour une seule carte
  // favori de 72px).
  // Téléphone : tiroir pleine hauteur collé au bord (comme un tiroir de
  // navigation natif), entre le titre de l'app et la barre de nav.
  const tiroirTop    = isWideLayout ? insets.top + 12 : headerHeight + 12;
  const tiroirBottom = isWideLayout ? insets.bottom + 12 : NAV_BAR_BOTTOM + NAV_BAR_HEIGHT + 12;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['left', 'right']}>
      {/* `translucent`/`backgroundColor` retirés (SDK 55+) : la barre de statut
          est désormais toujours translucide/transparente nativement (edge-to-
          edge obligatoire), ces props n'existent plus. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Fournit blurTargetRef à ModalCard (voir BlurTargetContext) — tout le
          contenu qui doit apparaître flouté derrière une modale doit vivre
          DANS ce BlurTargetView, donc AVANT les modales elles-mêmes. */}
      <BlurTargetContext.Provider value={blurTargetRef}>
      <BlurCarteContext.Provider value={tiroirBlurRef}>
      <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>

      <AccueilScreen
        onBasculerFavori={basculerFavori}
        estFavori={estFavori}
        onHeaderLayout={setHeaderHeight}
        onGareChoisie={ouvrirGare}
        onOpenSettings={() => setShowSettings(true)}
        onClosePanel={() => setActiveTab('accueil')}
        onMapTapped={fermerPanel}
        updateDownloadingBg={updateDownloadingBg}
        showDebugOverlay={showDebugOverlay}
        activeTab={activeTab}
        mapRef={mapRef}
        panelOpen={panelIsOpen}
        gareActuelle={gareActuelle && !quittantVueArret ? { id: gareActuelle.id, label: gareActuelle.label } : null}
        onQuitterVueArret={quitterVueArret}
        onRevenirAccueil={() => setActiveTab('accueil')}
        mapLeftInset={navLeftInsetAnim}
        mapRightInset={navRightInsetAnim}
        voileOpacity={isWideLayout ? undefined : voileOpacity}
      />

      {/* Zone de fermeture des tiroirs (sans voile) — absente en layout large
          où le tiroir reste ouvert en permanence à côté de la carte : la
          carte doit rester utilisable (tap, drag) sans fermer le tiroir. */}

      {/* Tiroirs latéraux */}
      {headerHeight > 0 && (
        <>
          <Animated.View {...(isWideLayout ? {} : swipeFav.panHandlers)} style={[
            styles.sideCard, styles.sideCardLeft,
            // Plus étroit en layout large : le tiroir reste affiché en
            // permanence à côté de la carte (pas juste de passage comme sur
            // téléphone), donc autant lui laisser moins de place pour que
            // la carte en garde davantage.
            isWideLayout ? { maxWidth: WIDE_PANEL_WIDTH } : styles.sideCardFavoris,
            { top: tiroirTop, bottom: tiroirBottom, backgroundColor: isWideLayout ? c.bg : teinteVerre(isDark, c, false, 'tiroirs'), ...(!isWideLayout && isDark ? { borderColor: c.borderCard } : null), transform: [{ translateX: favSlideAnim }] }
          ]}>
            {!isWideLayout && flouFav && <CoucheVerre zone="tiroirs" />}
            <View style={[styles.cardContentWrapper, !isWideLayout && { paddingTop: 20, paddingBottom: 16 }]}>
              <FavorisScreen favoris={favoris} onSupprimerFavori={basculerFavori} onSelectionnerGare={selectionnerDepuisFavoris} onReordonnerFavoris={reordonnerFavoris} actif={activeTab === 'favoris'} verre={!isWideLayout} />
            </View>
          </Animated.View>
          <Animated.View {...(isWideLayout ? {} : swipeTrafic.panHandlers)} style={[
            styles.sideCard, styles.sideCardRight,
            isWideLayout ? { maxWidth: WIDE_PANEL_WIDTH } : styles.sideCardTrafic,
            { top: tiroirTop, bottom: tiroirBottom, backgroundColor: isWideLayout ? c.bg : teinteVerre(isDark, c, false, 'tiroirs'), ...(!isWideLayout && isDark ? { borderColor: c.borderCard } : null), transform: [{ translateX: traficSlideAnim }] }
          ]}>
            {!isWideLayout && flouTrafic && <CoucheVerre zone="tiroirs" />}
            <View style={[styles.cardContentWrapper, !isWideLayout && { paddingTop: 20, paddingBottom: 16 }]}>
              <TraficScreen />
            </View>
          </Animated.View>
        </>
      )}

      {/* Enveloppe dédiée aux insets, même principe que dans AccueilScreen
          pour la carte/barre de recherche : confine le fondu + la barre de
          nav à la zone visible de la carte plutôt que de les laisser
          s'étendre par-dessus le tiroir permanent (écran large, voir
          responsive.ts). Sans ça, la barre de nav — seul moyen de changer
          d'onglet en layout large, le tap en dehors du tiroir étant
          désactivé — se retrouvait à cheval sur le tiroir. Version animée
          des insets (navLeftInsetAnim/navRightInsetAnim) pour que la barre
          glisse en douceur au lieu de sauter à l'ouverture/fermeture. */}
      <Animated.View style={{ position: 'absolute', bottom: 0, top: 0, left: navLeftInsetAnim, right: navRightInsetAnim, zIndex: 600, elevation: 21 }} pointerEvents="box-none">

      {/* Fondu progressif en bas de l'écran pour détacher la barre de navigation du contenu */}
      <LinearGradient
        pointerEvents="none"
        colors={isDark
          ? ['rgba(1,14,38,0)', 'rgba(1,14,38,0.35)', 'rgba(1,14,38,0.75)']
          : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.75)']}
        locations={[0, 0.6, 1]}
        style={styles.bottomFade}
      />

      {/* Volet des horaires ouvert : la barre passe devant lui, le flou de la carte
          ne s'y voit plus (le volet est natif, au-dessus de la carte) → teinte
          plus opaque (celle du « faux verre », zone 'pastilles' sans flou). */}
      {/* Barre de navigation : trois entrées identiques (même pastille, même
          icône, même libellé) ; seul l'état actif change, avec une pastille
          qui apparaît en ressort. */}
      <View
        style={[styles.floatingTabBar, { backgroundColor: teinteVerre(isDark, c, true, 'nav'), ...bordureVerre(isDark, c), boxShadow: [{ offsetX: 0, offsetY: 7, blurRadius: 16, color: 'rgba(0,0,0,0.26)' }] }]}
        onLayout={(e) => setLargeurBarreNav(e.nativeEvent.layout.width)}
      >
        <CoucheVerre zone="nav" rayon={30} />
        {panelIsOpen && flouGlobalActif && flouNatifActif && VERRE_FLOU_ZONES.nav !== false && (
          <FlouNavSurPanneau
            panelY={panelY} hautVolet={SCREEN_H - PANEL_H} navTop={SCREEN_H - NAV_BAR_BOTTOM - NAV_BAR_HEIGHT}
            cible={panelBlurRef} isDark={isDark} teinte={isDark ? hexToRgba(c.bgCard, 0.62) : 'rgba(255,255,255,0.62)'}
          />
        )}
        {largeurEntreeNav > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.tabItem, {
              position: 'absolute', top: 0, bottom: 0, left: 6, width: largeurEntreeNav, flex: 0,
              transform: [{ translateX: indexNav.interpolate({ inputRange: [0, 1, 2], outputRange: [0, largeurEntreeNav, 2 * largeurEntreeNav] }) }],
            }]}
          >
            <View style={[styles.tabPill, { backgroundColor: c.pillCenter }]} />
            <Text style={[styles.tabLabel, { opacity: 0 }]}>Accueil</Text>
          </Animated.View>
        )}
        <NavItem
          actif={activeTab === 'favoris'} label="Favoris" onPress={() => setActiveTab('favoris')}
          couleurTexte={activeTab === 'favoris' ? c.text : c.textTab}
          icone={activeTab === 'favoris'
            ? <IconFavorisCouleur size={22} dotColor={isDark ? '#FFFFFF' : '#0F2544'} />
            : <Icon name="favoris" size={22} color={c.textTab} />}
        />
        <NavItem
          actif={activeTab === 'accueil'} label="Accueil" onPress={() => setActiveTab('accueil')}
          couleurTexte={activeTab === 'accueil' ? c.text : c.textTab}
          icone={activeTab === 'accueil'
            ? <IconAccueilCouleur size={22} dotColor={isDark ? '#FFFFFF' : '#0F2544'} />
            : <Icon name="accueil" size={22} color={c.textTab} />}
        />
        <NavItem
          actif={activeTab === 'trafic'} label="Trafic" onPress={() => setActiveTab('trafic')}
          couleurTexte={activeTab === 'trafic' ? c.text : c.textTab}
          icone={activeTab === 'trafic'
            ? <IconInfoTraficCouleur size={22} dotColor={isDark ? '#FFFFFF' : '#0F2544'} />
            : <Icon name="info-trafic" size={22} color={c.textTab} />}
        />
      </View>
      </Animated.View>

      {/* Panel gare : bottom sheet animé */}
      <View style={[StyleSheet.absoluteFill, { zIndex: 500, elevation: 0 }]} pointerEvents="box-none">
        <ReanimatedLib.View style={[styles.garePanel, { height: PANEL_H, backgroundColor: c.bg }, panelAnimatedStyle]}>

          <GestureDetector gesture={headerPanGesture}>
            <View style={styles.dragZone}>
              <View style={[styles.dragBar, { backgroundColor: c.dragBar }]} />
            </View>
          </GestureDetector>
          <BlurTargetView ref={panelBlurRef} style={{ flex: 1 }}>
          <GestureDetector gesture={titleChipsPanGesture}>
          <View>
            <View style={styles.sheetHeader}>
              <View style={[styles.sheetIconGare, { backgroundColor: c.iconGareBg }]}>
                {headerModeIcon ? (
                  <ExpoImage
                    source={{ uri: headerModeIcon }}
                    style={{ width: 20, height: 20, tintColor: isDark ? '#ddeeff' : '#25303b' }}
                    contentFit="contain"
                  />
                ) : (
                  <Text style={{ fontSize: 16 }}>🚏</Text>
                )}
              </View>
              <Text style={[styles.sheetTitreGare, { color: c.text }]} numberOfLines={2}>
                {gareActuelle?.label.split('(')[0].trim() || ''}
              </Text>
              <View style={styles.sheetActions}>
                {!gareActuelle?.osmOnly && (
                  <TouchableOpacity style={[styles.sheetBoutonAction, { backgroundColor: c.btnBg }]} onPress={() => mapRef.current?.recenterActiveStation()}>
                    <IconPositionCouleur size={15} dotColor={isDark ? '#FFFFFF' : '#0F2544'} />
                  </TouchableOpacity>
                )}
                {gareActuelle && !gareActuelle.osmOnly && (
                  <View style={[styles.sheetBoutonAction, { backgroundColor: c.btnBg }]}>
                    <FavoriStar
                      active={estFavori(gareActuelle.id)}
                      onPress={() => basculerFavori({ id: gareActuelle.id, label: gareActuelle.label })}
                      size={15}
                      color={estFavori(gareActuelle.id) ? '#F2B705' : c.textSub}
                    />
                  </View>
                )}
                <TouchableOpacity style={[styles.sheetBoutonFermer, { backgroundColor: c.btnBg }]} onPress={quitterVueArret}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSub }}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* La barre de chips (lignes desservies) doit aussi permettre de
                tirer le volet vers le bas — sinon on ne peut le faire que
                depuis la poignée ou le titre, pas "de n'importe où" en haut
                du panneau comme attendu d'un vrai bottom sheet. */}
            {gareActuelle && (
              <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
                {panelLines === null ? (
                  <View style={{ height: 38, justifyContent: 'center', paddingLeft: 16 }}>
                    <ActivityIndicator size="small" color={c.accent} />
                  </View>
                ) : panelLineItems.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' }}
                  >
                    {panelLineItems.map((item, i) =>
                      item.type === 'mode' ? (
                        <ExpoImage
                          key={`mode-${i}`}
                          source={{ uri: MODE_ICONS[item.mode] ?? MODE_ICONS['BUS'] }}
                          style={{
                            width: 22, height: 22,
                            marginRight: 4, marginLeft: i > 0 ? 6 : 0,
                            tintColor: isDark ? '#ddeeff' : '#25303b',
                          }}
                          contentFit="contain"
                        />
                      ) : (
                        <TouchableOpacity
                          key={item.chip.id}
                          onPress={() => nativeSchedulesRef.current?.scrollTo(item.chip.code)}
                          style={{
                            backgroundColor: '#' + item.chip.color,
                            borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
                            borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', marginRight: 4,
                          }}
                        >
                          <Text style={{ color: item.chip.textColor, fontSize: 12, fontFamily: 'GrandParis-Bold' }}>{item.chip.code}</Text>
                        </TouchableOpacity>
                      )
                    )}
                  </ScrollView>
                ) : null}
              </View>
            )}
          </View>
          </GestureDetector>
          <View style={{ flex: 1 }} onLayout={e => { svLayout.value = e.nativeEvent.layout.height; }}>
            <ReanimatedLib.View style={[{ overflow: 'hidden' }, contentAnimatedStyle]}>
            <GestureDetector gesture={contenuPanGesture}>
            <View style={{ flex: 1 }} collapsable={false}>
            {gareActuelle?.osmOnly ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <Text style={{ fontSize: 28, marginBottom: 12 }}>🚏</Text>
                <Text style={{ fontSize: 15, color: c.textSub, textAlign: 'center', fontFamily: 'GrandParis' }}>
                  Cet arrêt n'est pas référencé dans les données temps réel IDFM.{'\n'}Aucun horaire disponible.
                </Text>
              </View>
            ) : gareActuelle ? (
              <NativeSchedules
                ref={nativeSchedulesRef}
                stopId={gareActuelle.id}
                stopName={gareActuelle.id === GHOST_STOP_ID ? GHOST_STOP_NAME : gareActuelle.label.split('(')[0].trim()}
                onScrollY={(y) => { listScrollY.value = y; }}
              />
            ) : null}
            </View>
            </GestureDetector>
            </ReanimatedLib.View>
          </View>
          </BlurTargetView>

        </ReanimatedLib.View>
      </View>

      </BlurTargetView>

      {/* Modal paramètres */}
      <SettingsModal onReportBug={() => setShowBugForm(true)} onClearMapCache={viderCacheCarte} visible={showSettings} onClose={() => setShowSettings(false)} showDebugOverlay={showDebugOverlay} setShowDebugOverlay={(v) => { setShowDebugOverlay(v); AsyncStorage.setItem('@gp_debug_overlay', v ? '1' : '0').catch(() => {}); }} flouActif={flouActif} setFlouActif={(v) => { setFlouActif(v); AsyncStorage.setItem('@gp_debug_flou', v ? '1' : '0').catch(() => {}); }} pushToken={pushToken} onOpenGhostStop={() => { ouvrirGare(GHOST_STOP_ID, GHOST_STOP_LABEL); setShowSettings(false); }} onReplayWhatsNew={() => { AsyncStorage.removeItem('@gp_whatsnew_seen_version').catch(() => {}); setShowWhatsNew(true); }} onTestUpdateModal={() => { setUpdateReady(false); setFakeUpdateTest(true); setShowUpdateModal(true); }} onReplayOnboarding={() => { setActiveTab('accueil'); setShowOnboarding(true); }} hasPendingUpdate={hasPendingUpdate} onOpenPendingUpdate={handleOpenPendingUpdate} />
      <BugReportModal visible={showBugForm} onClose={() => setShowBugForm(false)} />
      <WhatsNewModal visible={showWhatsNew} onClose={() => setShowWhatsNew(false)} onOpenChangelog={() => setShowSettings(true)} />
      <OnboardingTour
        visible={showOnboarding}
        onFinish={() => { setShowOnboarding(false); checkWhatsNew(); }}
        steps={[
          { key: 'welcome', emoji: '👋', title: 'Bienvenue sur Grand Paname', text: "Naviguez le Grand Paris, tout simplement !\n Découvrez votre nouveau compagnon de transport en Île-de-France." },
          { key: 'search', emoji: '🔎', title: 'Vos horaires en un clic !', text: "Tapez le nom d'un arrêt dans la barre de recherche pour accéder à tous ses horaires en un instant.\nVous pouvez également utiliser la géolocalisation pour trouver les arrêts à proximité." },
          { key: 'map', emoji: '🗺️', title: 'Explorez la carte', text: 'Accédez au plan du réseau et cliquez directement sur un arrêt pour voir ses horaires, ligne par ligne.' },
          { key: 'favoris', emoji: '⭐', title: 'Retrouve tes favoris', text: "Ajoute un arrêt en favori avec l'étoile dans son panneau d'horaires : il apparaîtra dans l'onglet Favoris pour un accès rapide." },
          { key: 'wip', emoji: '🚧', title: 'Work in Progress', text: "L'application est encore en développement : certaines fonctionnalités sont en cours de construction.\nMerci pour votre patience et vos retours !" },
        ]}
      />
      <UpdateModal
        visible={showUpdateModal}
        mode={updateReady ? 'ready' : 'prompt'}
        onAccept={handleUpdateAccept}
        onDismiss={handleUpdateDismiss}
      />

      </BlurCarteContext.Provider>
      </BlurTargetContext.Provider>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <View style={{ flex: 1 }}>
          <SafeAreaProvider>
            <AppInner />
          </SafeAreaProvider>
        </View>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  // Header flottant
  headerNatif: {
    position: 'absolute', top: 12, left: 15,
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0, shadowRadius: 8, elevation: 0, zIndex: 10,
  },
  logoApp: { width: 28, height: 28, marginRight: 8, resizeMode: 'contain' },
  titreGrandPaname: { fontSize: 18, fontFamily: 'GrandParis-Medium' },

  // Bulle paramètres
  settingsBubble: {
    position: 'absolute', top: 12, right: 15,
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0, shadowRadius: 8, elevation: 0, zIndex: 10,
  },

  // Pilule "mise à jour en cours" (sous le header)
  updateBgPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0, shadowRadius: 8, elevation: 0,
  },

  // Barre de recherche
  bottomSearchBar: {
    position: 'absolute', left: '6%', right: '6%',
    height: SEARCH_BAR_HEIGHT, borderRadius: 30, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0, shadowRadius: 12, elevation: 0, zIndex: 9998,
  },
  boutonGpsBarre: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  searchContainer: { flex: 1, position: 'relative', justifyContent: 'center' },
  searchInput: {
    height: 40, borderRadius: 20,
    paddingHorizontal: 15, paddingRight: 36,
    fontSize: 15, fontFamily: 'GrandParis-Light',
  },

  // Résultats
  searchResultsContainer: {
    position: 'absolute', left: '6%', right: '6%',
    borderRadius: 16, maxHeight: 220,
    zIndex: 999, elevation: 10,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, overflow: 'hidden',
  },
  gpsStatusPill: {
    position: 'absolute', width: '88%', alignSelf: 'center',
    borderRadius: 16, borderWidth: 1, overflow: 'hidden',
    paddingVertical: 14, paddingHorizontal: 16,
    zIndex: 999, elevation: 0,
    shadowColor: '#000', shadowOpacity: 0, shadowRadius: 10,
  },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, paddingHorizontal: 15,
  },
  searchResultText: { fontSize: 15, fontFamily: 'GrandParis-Medium' },
  distancePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  etoileAction: { padding: 10 },

  // Tiroir
  alignementFavori: { flex: 1, flexDirection: 'column', justifyContent: 'center' },
  texteNomGareFavori: { fontSize: 16, fontFamily: 'GrandParis-Medium' },
  texteVilleFavori: { fontSize: 12.5, fontFamily: 'GrandParis-Light', marginTop: 2 },
  boutonSupprimer: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#e74c3c', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  boutonSupprimerTexte: { color: '#fff', fontSize: 11, fontWeight: 'bold' as const },
  boutonsOrdre: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 4 },

  // Nav bar
  bottomFade: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: NAV_BAR_BOTTOM + NAV_BAR_HEIGHT + 90, zIndex: 900,
  },
  floatingTabBar: {
    position: 'absolute', bottom: NAV_BAR_BOTTOM, alignSelf: 'center',
    width: '88%', height: NAV_BAR_HEIGHT, borderRadius: 30, borderWidth: 1, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0, shadowRadius: 12, elevation: 0, zIndex: 9999, paddingHorizontal: 6,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabPill: { width: 64, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontFamily: 'GrandParis-Medium', fontSize: 11 },

  // Tiroirs latéraux
  sideCard: {
    // `width: '80%'` seul est pensé pour un écran de téléphone — sur un
    // grand écran (tablette, fenêtre desktop redimensionnée), 80% peut
    // représenter plus de 1000px et le tiroir avale quasiment tout l'écran.
    // `maxWidth` le borne à une largeur de panneau raisonnable, cohérente
    // avec les cartes modales (voir ModalCard, même valeur).
    position: 'absolute', width: '80%', maxWidth: 420, zIndex: 101, overflow: 'hidden', borderRadius: 24,
    shadowColor: '#0d1b2e', shadowOffset: { width: 6, height: 0 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 20,
  },
  sideCardLeft: { left: 12 },
  sideCardRight: { right: 12 },
  // Téléphone : collé au bord, arrondi seulement côté carte, sans marge.
  sideCardFavoris: { left: 0, width: '82%', elevation: 0, shadowOpacity: 0, borderRadius: 0, borderWidth: 1, borderLeftWidth: 0, borderColor: 'rgba(255,255,255,0.35)', borderTopRightRadius: 28, borderBottomRightRadius: 28 },
  sideCardTrafic: { right: 0, width: '82%', elevation: 0, shadowOpacity: 0, borderRadius: 0, borderWidth: 1, borderRightWidth: 0, borderColor: 'rgba(255,255,255,0.35)', borderTopLeftRadius: 28, borderBottomLeftRadius: 28 },
  cardContentWrapper: { flex: 1, paddingTop: 24, paddingHorizontal: 18, paddingBottom: 16 },

  // Panel gare
  garePanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: 24,
  },
  dragZone: { height: 26, alignItems: 'center', justifyContent: 'center' },
  dragBar: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 2, paddingBottom: 14,
  },
  sheetIconGare: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  sheetTitreGare: { flex: 1, fontSize: 18, lineHeight: 21, fontFamily: 'GrandParis-Bold', letterSpacing: 0.1, marginRight: 8 },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetBoutonAction: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetBoutonFermer: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },

  // Page paramètres
  settingsPage: { flex: 1 },
  settingsSection: {
    fontSize: 12, fontFamily: 'GrandParis-Bold', letterSpacing: 0.8,
    marginTop: 22, marginBottom: 8, marginHorizontal: 24,
  },
  // Cartes au gabarit des volets : mêmes coins et même ombre douce (voir PanelLayout).
  settingsCard: {
    marginHorizontal: 16, borderRadius: PANEL_CARD_RADIUS, borderWidth: 1,
    overflow: 'hidden', padding: 16,
    shadowColor: '#1a2a4a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  settingsRowLabel: { fontSize: 15, fontFamily: 'GrandParis-Medium', marginBottom: 12 },
  themeToggle: { flexDirection: 'row', borderRadius: 16, padding: 3, gap: 2 },
  themeOption: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 9, borderRadius: 13, backgroundColor: 'transparent',
  },
  themeOptionLabel: { fontSize: 13, fontFamily: 'GrandParis-Medium' },
  aProposHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  aProposLogo: { width: 44, height: 44, borderRadius: 12, resizeMode: 'contain' },
  aProposNom: { fontSize: 16, fontFamily: 'GrandParis-Bold' },
  aProposVersion: { fontSize: 13, fontFamily: 'GrandParis-Light', marginTop: 2 },
  settingsDivider: { height: 1, marginBottom: 12 },
  aProposLigne: { fontSize: 13, fontFamily: 'GrandParis-Light', marginBottom: 5 },
  lienRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12,
  },
  lienLabel: { flex: 1, fontSize: 15, fontFamily: 'GrandParis-Medium' },
  settingsFooter: {
    fontSize: 11, fontFamily: 'GrandParis-Light', textAlign: 'center',
    marginTop: 20, marginHorizontal: 16,
  },
  feurOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center',
  },
  feurBox: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center', width: '85%',
  },
  feurTitre: { fontSize: 52, fontFamily: 'GrandParis-Bold', marginBottom: 16, textAlign: 'center' },
  feurVideo: { width: 280, height: 200, borderRadius: 12 },
  feurHint: { marginTop: 12, color: '#888', fontSize: 13, fontFamily: 'GrandParis-Light' },
  trainEasterEgg: { position: 'absolute', bottom: '22%', left: 0, height: 500, width: 1200, zIndex: 999 },
  codenameBadge: {
    backgroundColor: '#5e4bb6', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2,
  },
  codenameBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'GrandParis-Medium' },
  changelogRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16,
  },
  changelogVersion: { fontSize: 14, fontFamily: 'GrandParis-Bold' },
  changelogDate: { fontSize: 12, fontFamily: 'GrandParis-Light', marginTop: 2 },
  changelogContent: {
    paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
