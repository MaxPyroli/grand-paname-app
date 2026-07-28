import React, { useRef, useEffect, useState, useCallback, useMemo, useContext } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ActivityIndicator,
  FlatList, TextInput, Keyboard, Animated, Dimensions, Easing,
  LayoutChangeEvent, Platform, ToastAndroid, NativeModules,
  Modal, Linking, ScrollView, BackHandler,
} from 'react-native';
import { ThemeContext, ThemeProvider, useColors } from './theme';
import type { ThemeColors, ThemePref } from './theme';
import MapWebView, { MapWebViewRef } from './MapWebView';
import { useFonts } from 'expo-font';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as ScreenOrientation from 'expo-screen-orientation';
import transportData from './assets/transport-data.json';
import { APP_VERSION, APP_CODENAME } from './constants';
import { CHANGELOGS, ChangelogEntry } from './changelogs';
import { WHATSNEW } from './whatsnew';
import { searchGares, nearbyGares, coordGare, coordPoteau, isNetworkError, nearbyStopsWithCoords, regionWideRailStops, NearbyStop, linesForArea, LineChip, comparerLignesParMode, stopPointsForArea, stationExits } from './api';
import { GHOST_STOP_ID, GHOST_STOP_LABEL, GHOST_STOP_NAME, GHOST_CHIPS, GHOST_STOP_COORD } from './ghostStop';
import { logger, LogEntry } from './logger';
import { Image as ExpoImage } from 'expo-image';
import { MODE_ICONS } from './modeIcons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';
import NativeSchedules, { type SchedulesRef } from './NativeSchedules';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedLib, { useSharedValue, useDerivedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { registerForPushNotificationsAsync } from './notifications';
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
const { height: SCREEN_H } = Dimensions.get('window');

// ─── INJECTION WEBVIEW ───────────────────────────────────────────────────────
const WEBVIEW_HIDE_JS = `
(function() {
  var css = document.createElement('style');
  css.textContent = [
    'header[data-testid="stHeader"]{display:none!important}',
    '[data-testid="stToolbar"]{display:none!important}',
    '[data-testid="stDecoration"]{display:none!important}',
    '[data-testid="stMainMenuButton"]{display:none!important}',
    '[data-testid="stStatusWidget"]{display:none!important}',
    '#MainMenu{display:none!important}',
    'footer{display:none!important}',
    'section[data-testid="stMain"]{padding-top:0!important}',
    'section.main{padding-top:0!important}',
    '.block-container{padding-top:0.75rem!important}',
    '[data-testid="stMainBlockContainer"]{padding-top:0.75rem!important}',
  ].join('');
  (document.head || document.documentElement).appendChild(css);

  var done = new WeakSet();
  function hide(el) {
    if (!el || done.has(el)) return;
    done.add(el);
    el.style.setProperty('display','none','important');
  }
  function climb(el, max) {
    var cur = el;
    for (var i = 0; i < max; i++) {
      if (!cur.parentElement || cur.parentElement.tagName === 'BODY') return cur;
      cur = cur.parentElement;
      if (cur.classList.contains('element-container') ||
          cur.getAttribute('data-testid') === 'stButton' ||
          cur.classList.contains('stButton') ||
          cur.classList.contains('stVerticalBlock')) return cur;
    }
    return el;
  }
  function run() {
    ['[data-testid="stDeckGlJsonChart"]','[data-testid="stPydeckChart"]',
     '[data-testid="stFoliumChart"]','[data-testid="stMap"]',
     '[data-testid="stToolbar"]','[data-testid="stDecoration"]',
     '[data-testid="stMainMenuButton"]','[data-testid="stStatusWidget"]',
     'header[data-testid="stHeader"]','#MainMenu','footer'].forEach(function(s) {
      document.querySelectorAll(s).forEach(function(el){ hide(el); });
    });
    document.querySelectorAll('.block-container,[data-testid="stMainBlockContainer"],section[data-testid="stMain"],section.main').forEach(function(el) {
      el.style.paddingTop = el.tagName === 'SECTION' ? '0' : '0.75rem';
    });
    var PAT = ['favori','favorite','⭐','★','☆','bookmark','sauvegarder','pana'];
    document.querySelectorAll('button,[role="button"],[data-testid*="Button"] *,div[data-testid*="pana"]').forEach(function(btn) {
      var txt = ((btn.textContent||'') + ' ' +
                 (btn.getAttribute('aria-label')||'') + ' ' +
                 (btn.getAttribute('title')||'')).toLowerCase();
      for (var i=0;i<PAT.length;i++) {
        if (txt.includes(PAT[i])) { hide(climb(btn,8)); break; }
      }
    });
  }
  run();
  new MutationObserver(run).observe(document.body,{childList:true,subtree:true});
})();
true;
`;

const getWebviewDarkJS = (dark: boolean): string => {
  const scheme = dark ? 'dark' : 'light';
  const css = dark ? [
    ':root,html{--background-color:#010e26!important;--secondary-background-color:#07213f!important;--text-color:#ddeeff!important;--primary-color:#5ab3f5!important}',
    'body,.stApp,[data-testid="stAppViewContainer"]{background-color:#010e26!important;color:#ddeeff!important}',
    'section[data-testid="stMain"],section.main,.block-container,[data-testid="stMainBlockContainer"],[data-testid="stVerticalBlock"],[data-testid="stHorizontalBlock"]{background-color:#010e26!important}',
    '[data-testid="stVerticalBlockBorderWrapper"]{background-color:#07213f!important;border-color:rgba(90,179,245,0.25)!important}',
    '[data-testid="stExpander"],[data-testid="stExpanderDetails"]{background-color:#07213f!important}',
    '[data-testid="stMarkdownContainer"] p,[data-testid="stMarkdownContainer"] li{color:#ddeeff!important}',
    'hr,[data-testid="stDivider"]{border-color:rgba(90,179,245,0.15)!important}',
  ].join('') : '';
  return `(function(){` +
    `document.documentElement.style.colorScheme='${scheme}';` +
    `document.documentElement.setAttribute('data-paname-theme','${scheme}');` +
    `var s=document.getElementById('_gp_dark_theme');` +
    `if(!s){s=document.createElement('style');s.id='_gp_dark_theme';document.head.appendChild(s);}` +
    `s.textContent=${JSON.stringify(css)};` +
  `})();true;`;
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function FadeBottom({ color, height = 56, strong = false }: { color: string; height?: number; strong?: boolean }) {
  // `strong` : un simple dégradé 2 points (transparent → couleur) reste très
  // léger visuellement sur les premiers 50-60% (l'œil ne perçoit presque rien
  // sous ~40% d'opacité) — le fondu paraît alors trop faible pour masquer une
  // vraie coupure nette (ex: liste d'horaires coupée par le clip du panneau).
  // Plusieurs paliers d'opacité rapprochés vers la fin donnent un fondu qui
  // "prend" plus tôt et masque mieux la coupure.
  // Le dernier palier est atteint avant la toute fin (0.88, pas 1) : une
  // marge opaque pleine de quelques % en réserve, pour ne pas dépendre du
  // pixel exact de la fin du dégradé — sur certains rendus, l'interpolation
  // du tout dernier pixel d'un LinearGradient n'atteint pas une opacité
  // parfaitement pleine, laissant filtrer un liseré d'un pixel du contenu
  // masqué en dessous.
  const colors = (strong
    ? [hexToRgba(color, 0), hexToRgba(color, 0.4), hexToRgba(color, 0.75), hexToRgba(color, 0.93), color, color]
    : ['transparent', color]) as [string, string, ...string[]];
  const locations = (strong ? [0, 0.35, 0.6, 0.78, 0.88, 1] : undefined) as [number, number, ...number[]] | undefined;
  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height }} pointerEvents="none">
      <LinearGradient colors={colors} locations={locations} style={{ flex: 1 }} />
    </View>
  );
}
function FadeTop({ color, height = 56 }: { color: string; height?: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height }} pointerEvents="none">
      <LinearGradient colors={[color, 'transparent']} style={{ flex: 1 }} />
    </View>
  );
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`;
}

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Gare = { id: string; label: string; lat?: number; lon?: number; distance?: number };
type FavorisProps = {
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
function SettingsModal({ visible, onClose, nativeSchedules, setNativeSchedules, showDebugOverlay, setShowDebugOverlay, onOpenGhostStop, onReplayWhatsNew, onTestUpdateModal, onReplayOnboarding }: { visible: boolean; onClose: () => void; nativeSchedules: boolean; setNativeSchedules: (v: boolean) => void; showDebugOverlay: boolean; setShowDebugOverlay: (v: boolean) => void; onOpenGhostStop: () => void; onReplayWhatsNew: () => void; onTestUpdateModal: () => void; onReplayOnboarding: () => void }) {
  const c = useColors();
  const { pref, setPref, isDark, oled, setOled } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();
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
    { icon: '🐛', label: 'Signaler un bug',      url: 'https://tally.so/r/A7qJxe' },
    { icon: '✉️',  label: 'Contact',              url: 'mailto:contact@grandpaname.fun' },
  ];

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.settingsPage, { backgroundColor: c.bg, paddingTop: insets.top }]}>

        {/* Nav header */}
        <View style={[styles.settingsNavHeader, { borderBottomColor: c.border }]}>
          <TouchableOpacity
            style={[styles.settingsBackBtn, { backgroundColor: c.btnBg }]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={[styles.settingsBackArrow, { color: c.accent }]}>‹</Text>
            <Text style={[styles.settingsBackLabel, { color: c.accent }]}>Retour</Text>
          </TouchableOpacity>
          <Text style={[styles.settingsNavTitle, { color: c.text }]}>Paramètres</Text>
          <View style={{ width: 80 }} />
        </View>

        <View style={{ flex: 1 }}>
          <FadeTop color={c.bg} height={32} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 72 }}>

            {/* ── Apparence ── */}
            <Text style={[styles.settingsSection, { color: c.textSub }]}>APPARENCE</Text>
            <View style={[styles.settingsCard, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
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
                      borderRadius: 10, backgroundColor: c.bgCard,
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
            <View style={[styles.settingsCard, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
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
            <View style={[styles.settingsCard, { backgroundColor: c.bgCard, borderColor: c.borderCard, padding: 0 }]}>
              {LIENS.map((item, i) => (
                <TouchableOpacity
                  key={item.url}
                  style={[
                    styles.lienRow,
                    i < LIENS.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                  ]}
                  onPress={() => Linking.openURL(item.url)}
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
            <View style={[styles.settingsCard, { backgroundColor: c.bgCard, borderColor: c.borderCard, padding: 0 }]}>
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
              <Animated.View style={[styles.settingsCard, { backgroundColor: c.bgCard, borderColor: c.borderCard, padding: 0, marginTop: 10, opacity: changelogAnim, transform: [{ translateY: changelogAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }]}>
                {CHANGELOGS.slice(3).map((entry, i) => renderChangelogEntry(entry, i > 0))}
              </Animated.View>
            )}

            {/* ── Paramètres avancés ── */}
            <TouchableOpacity
              style={[styles.settingsCard, { backgroundColor: c.bgCard, borderColor: '#f39c1250', borderWidth: 1, marginTop: 24, flexDirection: 'row', alignItems: 'center' }]}
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
                <Text style={{ fontSize: 18 }}>⚙️</Text>
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
                <View style={[styles.settingsCard, { backgroundColor: c.bgCard, borderColor: c.borderCard, marginTop: 10 }]}>
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
              </Animated.View>
            )}

            {/* ── Débogage (mode dev, caché) ── */}
            {devMode && (
              <>
                <Text style={[styles.settingsSection, { color: c.textSub }]}>DÉBOGAGE</Text>
                <TouchableOpacity
                  style={[styles.settingsCard, { backgroundColor: c.bgCard, borderColor: c.borderCard, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
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
                <View style={[styles.settingsCard, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.settingsRowLabel, { color: c.text }]}>Horaires webapp</Text>
                      <Text style={{ fontSize: 11, color: c.textSub, fontFamily: 'GrandParis-Light', marginTop: 2 }}>
                        Repasser sur la WebView Streamlit (dev)
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setNativeSchedules(!nativeSchedules);
                      }}
                      style={{
                        width: 44, height: 26, borderRadius: 13,
                        backgroundColor: !nativeSchedules ? c.accent : c.dragBar,
                        justifyContent: 'center', paddingHorizontal: 3,
                      }}
                    >
                      <View style={{
                        width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                        alignSelf: !nativeSchedules ? 'flex-end' : 'flex-start',
                      }} />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.settingsDivider, { backgroundColor: c.border, marginVertical: 12 }]} />
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
    </Modal>
  );
}

// ─── EASTER EGG : FEUR ───────────────────────────────────────────────────────
function FeurModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const player = useVideoPlayer(require('./others/feur.mp4'), p => { p.loop = false; });
  useEffect(() => {
    if (visible) { player.currentTime = 0; player.play(); }
    else player.pause();
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.feurOverlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.feurBox}>
          <Text style={styles.feurTitre}>FEUR ! 💇‍♂️</Text>
          <VideoView player={player} style={styles.feurVideo} contentFit="contain" nativeControls={false} />
          <Text style={styles.feurHint}>Tape pour fermer</Text>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── ÉCRAN D'ACCUEIL ─────────────────────────────────────────────────────────
function AccueilScreen({ onBasculerFavori, estFavori, onHeaderLayout, onGareChoisie, onOpenSettings, onClosePanel, onMapTapped, activeTab, mapRef, panelOpen, updateDownloadingBg, showDebugOverlay, gareActuelle, onQuitterVueArret, onRevenirAccueil }: AccueilProps) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();
  const [loadingGps, setLoadingGps] = useState(false);
  const [gpsSearchStatus, setGpsSearchStatus] = useState<string | null>(null);
  const [followingLocation, setFollowingLocation] = useState(false);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const headingWatchRef = useRef<Location.LocationSubscription | null>(null);
  const lastHeadingRef = useRef<number | null>(null);
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

  const searchBarBottom = useRef(new Animated.Value(SEARCH_BAR_BOTTOM)).current;
  const resultsBottom   = useRef(Animated.add(searchBarBottom, SEARCH_BAR_HEIGHT + 8)).current;
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;

  useEffect(() => {
    Animated.timing(searchBarBottom, {
      toValue: panelOpen ? -(SEARCH_BAR_HEIGHT + 20) : SEARCH_BAR_BOTTOM,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [panelOpen]);

  const vpAbortRef = useRef<AbortController | null>(null);
  const regionRailStopsRef = useRef<NearbyStop[]>([]);
  // Lancé au premier changement de viewport (donc au premier vrai zoom/pan de
  // l'utilisateur, voir _userInteracted dans MapWebView.tsx) plutôt qu'au
  // montage : évite une requête réseau supplémentaire pendant le chargement
  // initial de l'app, avant même que la carte ait été touchée.
  const regionRailStopsFetchedRef = useRef(false);
  const [debugInfo, setDebugInfo] = useState({ zoom: 0, lat: 0, lon: 0 });

  const handleViewportChanged = useCallback(async (lat: number, lon: number, zoom: number, radius: number) => {
    // Ne re-render tout AccueilScreen (recherche, résultats, bouton GPS...)
    // que si l'overlay de debug est effectivement affiché — sinon ce
    // setState tournait à chaque pan/zoom pour ne rafraîchir qu'un texte
    // masqué, saccadant l'interaction avec la carte pour rien.
    if (showDebugOverlay) setDebugInfo({ zoom, lat, lon });
    if (!regionRailStopsFetchedRef.current) {
      regionRailStopsFetchedRef.current = true;
      regionWideRailStops().then(stops => { regionRailStopsRef.current = stops; }).catch(() => {});
    }
    if (zoom < 11.5) { mapRef.current?.setNearbyStops([]); return; }
    vpAbortRef.current?.abort();
    vpAbortRef.current = new AbortController();
    try {
      const stops = await nearbyStopsWithCoords(lat, lon, vpAbortRef.current.signal, radius);
      const ids = new Set(stops.map(s => s.id));
      const merged = stops.concat(regionRailStopsRef.current.filter(s => !ids.has(s.id)));
      mapRef.current?.setNearbyStops(merged);
    } catch {}
  }, [mapRef, showDebugOverlay]);

  useEffect(() => {
    mapRef.current?.setTheme(isDark);
  }, [isDark]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, (e) => {
      Animated.timing(searchBarBottom, {
        toValue: e.endCoordinates.height + 20,
        duration: Platform.OS === 'ios' ? (e.duration ?? 250) : 220,
        useNativeDriver: false,
      }).start();
    });
    const s2 = Keyboard.addListener(hideEvt, (e) => {
      // Si le volet horaires est ouvert, c'est lui qui gère la position de la
      // barre (cachée) — Keyboard.dismiss() (appelé par fermerRecherche() à
      // l'ouverture d'une gare) ne doit pas la remettre visible en course
      // avec l'animation d'ouverture du volet.
      if (panelOpenRef.current) return;
      Animated.timing(searchBarBottom, {
        toValue: SEARCH_BAR_BOTTOM,
        duration: Platform.OS === 'ios' ? (e.duration ?? 200) : 180,
        useNativeDriver: false,
      }).start();
    });
    return () => { s1.remove(); s2.remove(); };
  }, []);

  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fermerRecherche = () => {
    if (searchDebounceRef.current) { clearTimeout(searchDebounceRef.current); searchDebounceRef.current = null; }
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
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
      <MapWebView
        ref={mapRef}
        isDark={isDark}
        onStationSelected={onGareChoisie}
        onViewportChanged={handleViewportChanged}
        onMapTapped={onMapTapped}
        onFollowExited={handleFollowExited}
        onReady={() => {
          mapRef.current?.setTheme(isDark);
          mapRef.current?.setTransportData(transportData as { stops: any[]; lines: any[] });
        }}
      />

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
            transform: [{ translateY: updatePillAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
          }}
        >
          <View style={[styles.updateBgPill, { backgroundColor: c.bgFloat }]}>
            <ActivityIndicator size="small" color={c.accent} />
            <Text style={{ fontFamily: 'GrandParis-Medium', fontSize: 12, color: c.text }}>Mise à jour...</Text>
          </View>
        </Animated.View>
      )}

      {/* Header pill flottant */}
      <View
        style={[styles.headerNatif, { backgroundColor: c.bgFloat, top: insets.top + 12 }]}
        onLayout={(e: LayoutChangeEvent) => {
          const { y, height } = e.nativeEvent.layout;
          onHeaderLayout(y + height);
          setHeaderBarHeight(height);
        }}
      >
        <Animated.Image
          source={require('./assets/icon.png')}
          style={[styles.logoApp, { transform: [{ rotate: logoSpinDeg }] }]}
        />
        <Text style={[styles.titreGrandPaname, { color: c.text }]}>Grand Paname</Text>
      </View>

      {/* Bulle paramètres */}
      <TouchableOpacity
        style={[styles.settingsBubble, { backgroundColor: c.bgFloat, top: insets.top + 12 }]}
        onPress={onOpenSettings}
      >
        <Text style={{ fontSize: 18 }}>⚙️</Text>
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
        <Animated.View style={[styles.gpsStatusPill, { bottom: resultsBottom, backgroundColor: c.bgFloat, borderColor: c.borderCard }]}>
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
                  {item.distance != null && (
                    <View style={[styles.distancePill, { backgroundColor: c.bgSubtle }]}>
                      <Text style={{ fontSize: 11, fontFamily: 'GrandParis-Medium', color: c.textSub }}>
                        {formatDistance(item.distance)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                {!['erreur', 'vide'].includes(item.id) && (
                  <TouchableOpacity style={styles.etoileAction} onPress={() => onBasculerFavori(item)}>
                    <Text style={{ fontSize: 22, color: estFavori(item.id) ? undefined : c.textSub }}>{estFavori(item.id) ? '⭐' : '☆'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
          <FadeBottom color={c.bg} height={40} />
        </Animated.View>
      )}

      {/* Barre de recherche flottante, ou nom de l'arrêt affiché tant qu'on
          reste sur sa vue (poteaux compris), même horaires fermées */}
      <Animated.View style={[styles.bottomSearchBar, { bottom: searchBarBottom, backgroundColor: c.bgFloat }]}>
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
                : <Text style={{ fontSize: 18 }}>📍</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
      <FeurModal visible={feurVisible} onClose={() => setFeurVisible(false)} />
    </View>
  );
}

// ─── ÉCRAN FAVORIS ────────────────────────────────────────────────────────────
const FAV_ITEM_H = 72;
const FAV_GAP    = 10;
const FAV_SLOT_H = FAV_ITEM_H + FAV_GAP;

function FavorisScreen({ favoris, onSupprimerFavori, onSelectionnerGare, onReordonnerFavoris, actif }: FavorisProps) {
  const c = useColors();
  const [editMode, setEditMode] = useState(false);
  useEffect(() => { if (!actif) setEditMode(false); }, [actif]);
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

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.favorisTitreRow}>
        <View>
          <Text style={[styles.titreTiroir, { color: c.text }]}>⭐ Mes Favoris</Text>
          <Text style={[styles.sousTitreTiroir, { color: c.textSub, marginBottom: 0 }]}>
            {favoris.length} {favoris.length === 1 ? 'gare enregistrée' : 'gares enregistrées'}
          </Text>
        </View>
        {favoris.length > 0 && (
          <TouchableOpacity onPress={() => setEditMode(e => !e)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: c.accent, fontSize: 14, fontFamily: 'GrandParis-Medium' }}>
              {editMode ? 'Terminer' : 'Modifier'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {favoris.length === 0 ? (
        <View style={styles.etatVide}>
          <Text style={styles.etatVideEmoji}>🔍</Text>
          <Text style={[styles.etatVideTitre, { color: c.text }]}>Aucun favori pour l'instant</Text>
          <Text style={[styles.etatVideDesc, { color: c.textSub }]}>
            Recherchez une gare depuis l'accueil et appuyez sur l'étoile ☆ pour l'ajouter ici.
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 28, paddingBottom: 60 }}>
            <View style={{ height: favoris.length * FAV_SLOT_H - FAV_GAP }}>
              {favoris.map((item, index) => (
                <Animated.View
                  key={item.id}
                  style={{ position: 'absolute', left: 0, right: 0, height: FAV_ITEM_H, transform: [{ translateY: getY(item.id) }] }}
                >
                  <TouchableOpacity
                    style={[styles.itemFavoriNatif, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}
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
                      <Text style={{ color: c.accent, fontSize: 20, marginLeft: 8 }}>›</Text>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          </ScrollView>
          <FadeTop color={c.bg} height={28} />
          <FadeBottom color={c.bg} />
        </View>
      )}
    </View>
  );
}

// ─── ÉCRAN ASSISTANT ──────────────────────────────────────────────────────────
function AssistantScreen() {
  const c = useColors();
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.favorisTitreRow}>
        <View>
          <Text style={[styles.titreTiroir, { color: c.text }]}>💭 À venir</Text>
          <Text style={[styles.sousTitreTiroir, { color: c.textSub, marginBottom: 0 }]}>Prochaines fonctionnalités</Text>
        </View>
      </View>
      <View style={styles.etatVide}>
        <Text style={styles.etatVideEmoji}>🏗️</Text>
        <Text style={[styles.etatVideTitre, { color: c.text }]}>En construction</Text>
        <Text style={[styles.etatVideDesc, { color: c.textSub }]}>De nouvelles fonctionnalités arrivent bientôt. Restez connectés ! 👀</Text>
      </View>
    </View>
  );
}

// ─── MOTEUR COMMUN AUX MODALES-CARTES CENTRÉES ─────────────────────────────
// "Quoi de neuf", mise à jour disponible, visite guidée... partagent toutes
// le même mécanisme (Modal plein écran, fond sombre, carte qui apparaît en
// fondu + léger zoom ressort). Un seul hook + deux composants réutilisés
// partout, pour ne pas réimplémenter (et re-casser, comme ça a été le cas
// sur la visite guidée) ce mécanisme à chaque nouvelle modale.
function useModalCardAnim(visible: boolean) {
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
      Animated.timing(anim, { toValue: 1, duration: 280, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]);
  return { anim, mounted };
}

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
      <BlurView intensity={45} tint={isDark ? 'dark' : 'light'} experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
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

// L'app n'est pas prévue pour le paysage sur téléphone (rien dans l'UI n'est
// pensé pour ça), mais Google Play exige depuis peu que les apps restent
// flexibles en orientation sur grands écrans (tablettes/pliables) — d'où
// l'absence de verrou statique dans app.config.js. Le compromis : verrouiller
// le portrait uniquement quand l'écran est de taille "téléphone" (répliquant
// le seuil sw600dp qu'utilise Android lui-même pour distinguer téléphone et
// tablette), et laisser l'orientation libre au-delà. Recalculé à chaque
// changement de dimensions pour suivre un pliable qu'on ouvre/referme.
function useAdaptiveOrientationLock() {
  useEffect(() => {
    const appliquer = () => {
      const { width, height } = Dimensions.get('screen');
      const smallestWidthDp = Math.min(width, height);
      const estTelephone = smallestWidthDp < 600;
      if (estTelephone) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      } else {
        ScreenOrientation.unlockAsync().catch(() => {});
      }
    };
    appliquer();
    const sub = Dimensions.addEventListener('change', appliquer);
    return () => sub.remove();
  }, []);
}

// ─── APP PRINCIPALE ───────────────────────────────────────────────────────────
function AppInner() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  useAdaptiveOrientationLock();

  const PANEL_H = SCREEN_H - insets.top;

  const [activeTab, setActiveTab] = useState<'accueil' | 'favoris' | 'assistant'>('accueil');
  const [favoris, setFavoris] = useState<Gare[]>([]);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [gareActuelle, setGareActuelle] = useState<{ id: string; label: string; osmOnly?: boolean } | null>(null);
  const [panelIsOpen, setPanelIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [nativeSchedules, setNativeSchedules] = useState(true);
  useEffect(() => { AsyncStorage.getItem('@gp_native_schedules').then(v => { if (v === '0') setNativeSchedules(false); }); }, []);
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  useEffect(() => { AsyncStorage.getItem('@gp_debug_overlay').then(v => { if (v === '1') setShowDebugOverlay(true); }); }, []);
  useEffect(() => {
    AsyncStorage.getItem('@gp_onboarding_seen').then(seen => {
      if (seen !== '1') {
        // Premier lancement : la visite guidée remplace "Quoi de neuf" (rien
        // de "nouveau" à raconter à quelqu'un qui découvre l'app), et on
        // marque directement la dernière entrée whatsnew comme vue pour ne
        // pas enchaîner avec cette modale juste après le tuto.
        setShowOnboarding(true);
        AsyncStorage.setItem('@gp_onboarding_seen', '1').catch(() => {});
        if (WHATSNEW[0]) AsyncStorage.setItem('@gp_whatsnew_seen_version', WHATSNEW[0].version).catch(() => {});
        return;
      }
      // Pas de comparaison avec APP_VERSION : on affiche la dernière entrée
      // whatsnew tant que l'utilisateur ne l'a pas vue, même s'il a depuis
      // avancé d'une version de plus (ex: une version sort sans entrée
      // whatsnew, puis on en ajoute une pour l'annoncer après coup — elle
      // doit quand même s'afficher).
      const latest = WHATSNEW[0];
      if (!latest) return;
      AsyncStorage.getItem('@gp_whatsnew_seen_version').then(v => {
        if (v !== latest.version) setShowWhatsNew(true);
      });
    });
  }, []);
  useEffect(() => { registerForPushNotificationsAsync(); }, []);

  // ── Mise à jour Play Store depuis l'app ──────────────────────────────────
  // require() différé partout ci-dessous : ces deux libs plantent à l'évaluation
  // de leur module si le natif n'est pas lié (Expo Go / dev client pas rebuild).
  // Un import statique en tête de fichier crasherait tout le bundle avant même
  // qu'un try/catch puisse intervenir ; require() à l'intérieur d'un try/catch
  // reporte cette évaluation au bon endroit et au bon moment.
  const inAppUpdates = useRef<SpInAppUpdatesType | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
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
        .then((result: { shouldUpdate: boolean }) => { if (result.shouldUpdate) setShowUpdateModal(true); })
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
    setUpdateReady(false);
    setFakeUpdateTest(false);
  };
  const nativeSchedulesRef = useRef<SchedulesRef>(null);
  const svLayout = useSharedValue(0);
  const [panelLines, setPanelLines] = useState<LineChip[] | null>(null);
  const linesAbortRef = useRef<AbortController | null>(null);

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
  const webViewRef = useRef<WebView>(null);
  const mapRef = useRef<MapWebViewRef | null>(null);
  const APP_URL = process.env.EXPO_PUBLIC_APP_URL || '';

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
  }, [PANEL_H, SCREEN_H, headerHeight, insets.top]);

  const panelY      = useSharedValue(PANEL_H);
  const panelSnapSV = useSharedValue<'hidden' | 'half' | 'full'>('hidden');
  const dragStartY  = useSharedValue(PANEL_H);
  const contentDragEngagedSV = useSharedValue(false);

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
    const t = Math.min(1, Math.max(0, (panelY.value - snapFull) / (snapHalf - snapFull)));
    const hMin = Math.max(50, sv + NAV_BAR_HEIGHT + NAV_BAR_BOTTOM - snapHalf);
    return sv + t * (hMin - sv);
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
  const fermerPanel = useCallback(() => {
    linesAbortRef.current?.abort();
    setPanelIsOpen(false);
    snapTo('hidden');
  }, [snapTo]);
  const fermerPanelRef = useRef(fermerPanel);
  fermerPanelRef.current = fermerPanel;

  // Quitte complètement la vue de l'arrêt : ferme le volet, efface les
  // poteaux/pin de la carte et fait réapparaître la barre de recherche.
  const quitterVueArret = useCallback(() => {
    linesAbortRef.current?.abort();
    setPanelIsOpen(false);
    snapTo('hidden', () => { setGareActuelle(null); setPanelLines(null); });
    mapRef.current?.clearActiveStation();
  }, [snapTo]);

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
  const [fontsLoaded] = useFonts({
    'GrandParis-Light':   require('./assets/GrandParis-Light.otf'),
    'GrandParis':         require('./assets/GrandParis.otf'),
    'GrandParis-Regular': require('./assets/GrandParis-Regular.otf'),
    'GrandParis-Medium':  require('./assets/GrandParis-Medium.otf'),
    'GrandParis-Bold':    require('./assets/GrandParis-Bold.otf'),
  });

  const { width: screenWidth } = Dimensions.get('window');
  const favSlideAnim  = useRef(new Animated.Value(-screenWidth)).current;
  const asstSlideAnim = useRef(new Animated.Value(screenWidth)).current;

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
    const garePropre = { ...gare, label: labelPropre };
    setFavoris(prev => {
      const idx = prev.findIndex(f => f.id === garePropre.id);
      const next = idx > -1 ? prev.filter(f => f.id !== garePropre.id) : [...prev, garePropre];
      sauvegarderFavoris(next);
      return next;
    });
  }, []);

  const estFavori = useCallback((id: string) => favoris.some(f => f.id === id), [favoris]);

  useEffect(() => {
    if (gareActuelle) {
      webViewRef.current?.injectJavaScript(getWebviewDarkJS(isDark));
    }
  }, [isDark]);

  const urlGareActuelle = useMemo(() => {
    if (!gareActuelle) return '';
    return `${APP_URL}?selectionned_stop_id=${gareActuelle.id}&selectionned_stop_name=${encodeURIComponent(gareActuelle.label)}&t=${Date.now()}`;
  }, [gareActuelle, APP_URL]);

  const ouvrirGare = useCallback((id: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const isOSM = id.startsWith('osm:');
    const dejaOuverte = gareActuelle?.id === id;
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
        const coordPromise = aDuCable && !aUnModeLourd
          ? coordPoteau(id).then(c => c ?? coordGare(id))
          : coordGare(id);

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
            stopPointsForArea(id, ctrl.signal).catch(() => []),
            stationExits(coord.lat, coord.lon).catch(() => []),
          ]).then(([points, exits]) => {
            if (ctrl.signal.aborted) return;
            mapRef.current?.showStopCluster(id, label, main, points, true, exits);
          });
        });
      })
      .catch(() => setPanelLines([]));
  }, [gareActuelle, APP_URL, snapTo]);

  const selectionnerDepuisFavoris = useCallback((id: string, label: string) => {
    setActiveTab('accueil');
    setTimeout(() => ouvrirGare(id, label), 50);
  }, [ouvrirGare]);


  useEffect(() => {
    const D = 300;
    if (activeTab === 'favoris') {
      // Range le volet des horaires en arrière-plan (comme fermerPanel) sans
      // quitter la vue de l'arrêt : la carte reste sur l'arrêt ouvert, avec
      // son nom dans la barre de recherche, prêt à réafficher le volet en
      // revenant sur l'onglet Accueil.
      fermerPanel();
      Animated.parallel([
        Animated.timing(favSlideAnim,  { toValue: 0,           duration: D, useNativeDriver: true }),
        Animated.timing(asstSlideAnim, { toValue: screenWidth,  duration: D, useNativeDriver: true }),
      ]).start();
    } else if (activeTab === 'assistant') {
      Animated.parallel([
        Animated.timing(asstSlideAnim, { toValue: 0,            duration: D, useNativeDriver: true }),
        Animated.timing(favSlideAnim,  { toValue: -screenWidth, duration: D, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(favSlideAnim,  { toValue: -screenWidth, duration: D, useNativeDriver: true }),
        Animated.timing(asstSlideAnim, { toValue: screenWidth,  duration: D, useNativeDriver: true }),
      ]).start();
    }
  }, [activeTab, fermerPanel]);

  const showSettingsRef = useRef(showSettings);
  showSettingsRef.current = showSettings;
  const showWhatsNewRef = useRef(showWhatsNew);
  showWhatsNewRef.current = showWhatsNew;
  const showOnboardingRef = useRef(showOnboarding);
  showOnboardingRef.current = showOnboarding;
  const showUpdateModalRef = useRef(showUpdateModal);
  showUpdateModalRef.current = showUpdateModal;
  const panelIsOpenRef = useRef(panelIsOpen);
  panelIsOpenRef.current = panelIsOpen;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
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

  const tiroirTop    = headerHeight + 8;
  const tiroirBottom = SEARCH_BAR_BOTTOM + SEARCH_BAR_HEIGHT + 8;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} translucent backgroundColor="transparent" />

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
        gareActuelle={gareActuelle ? { id: gareActuelle.id, label: gareActuelle.label } : null}
        onQuitterVueArret={quitterVueArret}
        onRevenirAccueil={() => setActiveTab('accueil')}
      />

      {/* Zone de fermeture des tiroirs (sans voile) */}
      {activeTab !== 'accueil' && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, { zIndex: 100 }]}
          activeOpacity={1}
          onPress={() => setActiveTab('accueil')}
        />
      )}

      {/* Tiroirs latéraux */}
      {headerHeight > 0 && (
        <>
          <Animated.View style={[
            styles.sideCard, styles.sideCardLeft,
            { top: tiroirTop, bottom: tiroirBottom, backgroundColor: c.bg, transform: [{ translateX: favSlideAnim }] }
          ]}>
            <View style={styles.cardContentWrapper}>
              <FavorisScreen favoris={favoris} onSupprimerFavori={basculerFavori} onSelectionnerGare={selectionnerDepuisFavoris} onReordonnerFavoris={reordonnerFavoris} actif={activeTab === 'favoris'} />
            </View>
          </Animated.View>
          <Animated.View style={[
            styles.sideCard, styles.sideCardRight,
            { top: tiroirTop, bottom: tiroirBottom, backgroundColor: c.bg, transform: [{ translateX: asstSlideAnim }] }
          ]}>
            <View style={styles.cardContentWrapper}>
              <AssistantScreen />
            </View>
          </Animated.View>
        </>
      )}

      {/* Fondu progressif en bas de l'écran pour détacher la barre de navigation du contenu */}
      <LinearGradient
        pointerEvents="none"
        colors={isDark
          ? ['rgba(1,14,38,0)', 'rgba(1,14,38,0.35)', 'rgba(1,14,38,0.75)']
          : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.75)']}
        locations={[0, 0.6, 1]}
        style={styles.bottomFade}
      />

      {/* Barre de navigation */}
      <View style={[styles.floatingTabBar, { backgroundColor: c.bgFloat }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('favoris')}>
          <View style={[styles.tabPill, activeTab === 'favoris' && { backgroundColor: c.pillActive }]}>
            <Text style={styles.tabIcon}>{activeTab === 'favoris' ? '❤️' : '🤍'}</Text>
          </View>
          <Text style={[styles.tabLabel, { color: activeTab === 'favoris' ? c.text : c.textTab }]}>Favoris</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('accueil')}>
          <View style={[styles.tabPill, styles.tabPillCenter, activeTab === 'accueil' && { backgroundColor: c.pillCenter }]}>
            <Text style={[styles.tabIcon, { fontSize: 22 }]}>🚇</Text>
          </View>
          <Text style={[styles.tabLabel, { color: activeTab === 'accueil' ? c.text : c.textTab }]}>Accueil</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('assistant')}>
          <View style={[styles.tabPill, activeTab === 'assistant' && { backgroundColor: c.pillActive }]}>
            <Text style={styles.tabIcon}>{activeTab === 'assistant' ? '🗯️' : '💭'}</Text>
          </View>
          <Text style={[styles.tabLabel, { color: activeTab === 'assistant' ? c.text : c.textTab }]}>...</Text>
        </TouchableOpacity>
      </View>

      {/* Panel gare : bottom sheet animé */}
      <View style={[StyleSheet.absoluteFill, { zIndex: 500, elevation: 0 }]} pointerEvents="box-none">
        <ReanimatedLib.View style={[styles.garePanel, { height: PANEL_H, backgroundColor: c.bg, paddingBottom: NAV_BAR_HEIGHT + NAV_BAR_BOTTOM }, panelAnimatedStyle]}>

          <GestureDetector gesture={headerPanGesture}>
            <View style={styles.dragZone}>
              <View style={[styles.dragBar, { backgroundColor: c.dragBar }]} />
            </View>
          </GestureDetector>
          <View style={{ flex: 1 }}>
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
                    <Text style={{ fontSize: 15 }}>📍</Text>
                  </TouchableOpacity>
                )}
                {gareActuelle && !gareActuelle.osmOnly && (
                  <TouchableOpacity
                    style={[styles.sheetBoutonAction, { backgroundColor: c.btnBg }]}
                    onPress={() => basculerFavori({ id: gareActuelle.id, label: gareActuelle.label })}
                  >
                    <Text style={{ fontSize: 15, color: estFavori(gareActuelle.id) ? undefined : c.textSub }}>{estFavori(gareActuelle.id) ? '⭐' : '☆'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.sheetBoutonFermer, { backgroundColor: c.btnBg }]} onPress={fermerPanel}>
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
            {gareActuelle?.osmOnly ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <Text style={{ fontSize: 28, marginBottom: 12 }}>🚏</Text>
                <Text style={{ fontSize: 15, color: c.textSub, textAlign: 'center', fontFamily: 'GrandParis' }}>
                  Cet arrêt n'est pas référencé dans les données temps réel IDFM.{'\n'}Aucun horaire disponible.
                </Text>
              </View>
            ) : gareActuelle && (nativeSchedules || gareActuelle.id === GHOST_STOP_ID) ? (
              <NativeSchedules
                ref={nativeSchedulesRef}
                stopId={gareActuelle.id}
                stopName={gareActuelle.id === GHOST_STOP_ID ? GHOST_STOP_NAME : gareActuelle.label.split('(')[0].trim()}
              />
            ) : gareActuelle ? (
              <WebView
                ref={webViewRef}
                source={{ uri: urlGareActuelle }}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                injectedJavaScript={WEBVIEW_HIDE_JS + getWebviewDarkJS(isDark)}
              />
            ) : null}
            {gareActuelle && !gareActuelle.osmOnly && (
              // Le panneau clippe la liste des horaires via `overflow:hidden`
              // (hauteur animée entre 'half' et 'full') — sans ce fondu, le
              // dernier item visible était tranché net au lieu de disparaître
              // progressivement.
              <FadeBottom color={c.bg} height={72} strong />
            )}
            </ReanimatedLib.View>
          </View>
          </View>

        </ReanimatedLib.View>
      </View>

      {/* Modal paramètres */}
      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} nativeSchedules={nativeSchedules} setNativeSchedules={(v) => { setNativeSchedules(v); AsyncStorage.setItem('@gp_native_schedules', v ? '1' : '0').catch(() => {}); }} showDebugOverlay={showDebugOverlay} setShowDebugOverlay={(v) => { setShowDebugOverlay(v); AsyncStorage.setItem('@gp_debug_overlay', v ? '1' : '0').catch(() => {}); }} onOpenGhostStop={() => { ouvrirGare(GHOST_STOP_ID, GHOST_STOP_LABEL); setShowSettings(false); }} onReplayWhatsNew={() => { AsyncStorage.removeItem('@gp_whatsnew_seen_version').catch(() => {}); setShowWhatsNew(true); }} onTestUpdateModal={() => { setUpdateReady(false); setFakeUpdateTest(true); setShowUpdateModal(true); }} onReplayOnboarding={() => { setActiveTab('accueil'); setShowOnboarding(true); }} />
      <WhatsNewModal visible={showWhatsNew} onClose={() => setShowWhatsNew(false)} onOpenChangelog={() => setShowSettings(true)} />
      <OnboardingTour
        visible={showOnboarding}
        onFinish={() => setShowOnboarding(false)}
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
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10, shadowRadius: 8, elevation: 8, zIndex: 10,
  },
  logoApp: { width: 28, height: 28, marginRight: 8, resizeMode: 'contain' },
  titreGrandPaname: { fontSize: 18, fontFamily: 'GrandParis-Medium' },

  // Bulle paramètres
  settingsBubble: {
    position: 'absolute', top: 12, right: 15,
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10, shadowRadius: 8, elevation: 8, zIndex: 10,
  },

  // Pilule "mise à jour en cours" (sous le header)
  updateBgPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10, shadowRadius: 8, elevation: 8,
  },

  // Barre de recherche
  bottomSearchBar: {
    position: 'absolute', left: '6%', right: '6%',
    height: SEARCH_BAR_HEIGHT, borderRadius: 30,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 16, zIndex: 9998,
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
    borderRadius: 16, borderWidth: 1,
    paddingVertical: 14, paddingHorizontal: 16,
    zIndex: 999, elevation: 10,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10,
  },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, paddingHorizontal: 15,
  },
  searchResultText: { fontSize: 15, fontFamily: 'GrandParis-Medium' },
  distancePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  etoileAction: { padding: 10 },

  // Tiroir
  titreTiroir: { fontSize: 20, fontFamily: 'GrandParis-Bold', marginBottom: 4 },
  sousTitreTiroir: { fontSize: 13, fontFamily: 'GrandParis-Light', marginBottom: 20 },
  etatVide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  etatVideEmoji: { fontSize: 44, marginBottom: 14 },
  etatVideTitre: { fontSize: 17, fontFamily: 'GrandParis-Bold', marginBottom: 8, textAlign: 'center' },
  etatVideDesc: { fontSize: 14, fontFamily: 'GrandParis-Light', textAlign: 'center', lineHeight: 22 },
  itemFavoriNatif: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, height: FAV_ITEM_H, borderRadius: 14, borderWidth: 1,
    shadowColor: '#1a2a4a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  alignementFavori: { flex: 1, flexDirection: 'column', justifyContent: 'center' },
  texteNomGareFavori: { fontSize: 15, fontFamily: 'GrandParis-Medium' },
  texteVilleFavori: { fontSize: 12, fontFamily: 'GrandParis-Light', marginTop: 2 },
  favorisTitreRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
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
    width: '88%', height: NAV_BAR_HEIGHT, borderRadius: 30,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 16, zIndex: 9999, paddingHorizontal: 6,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabPill: { width: 56, height: 28, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tabPillCenter: { width: 64, height: 32 },
  tabIcon: { fontSize: 20, lineHeight: 26 },
  tabLabel: { fontFamily: 'GrandParis-Medium', fontSize: 10 },

  // Tiroirs latéraux
  sideCard: {
    position: 'absolute', width: '80%', zIndex: 101, overflow: 'hidden', borderRadius: 24,
    shadowColor: '#0d1b2e', shadowOffset: { width: 6, height: 0 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 20,
  },
  sideCardLeft: { left: 12 },
  sideCardRight: { right: 12 },
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
  settingsNavHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingsBackBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, gap: 2,
  },
  settingsBackArrow: { fontSize: 20, lineHeight: 22 },
  settingsBackLabel: { fontSize: 15, fontFamily: 'GrandParis-Medium' },
  settingsNavTitle: { fontSize: 17, fontFamily: 'GrandParis-Bold', textAlign: 'center' },
  settingsSection: {
    fontSize: 11, fontFamily: 'GrandParis-Bold', letterSpacing: 0.8,
    marginTop: 24, marginBottom: 8, marginHorizontal: 20,
  },
  settingsCard: {
    marginHorizontal: 16, borderRadius: 16, borderWidth: 1,
    overflow: 'hidden', padding: 16,
  },
  settingsRowLabel: { fontSize: 15, fontFamily: 'GrandParis-Medium', marginBottom: 12 },
  themeToggle: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 2 },
  themeOption: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 9, borderRadius: 10, backgroundColor: 'transparent',
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
