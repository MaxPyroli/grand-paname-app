import React, { useRef, useEffect, useState, useCallback, useMemo, useContext } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ActivityIndicator,
  FlatList, TextInput, Keyboard, Image, Animated, Dimensions,
  LayoutChangeEvent, Platform, PanResponder,
  Modal, Linking, ScrollView,
} from 'react-native';
import { ThemeContext, ThemeProvider, useColors } from './theme';
import type { ThemeColors, ThemePref } from './theme';
import MapWebView, { MapWebViewRef } from './MapWebView';
import { useFonts } from 'expo-font';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import transportData from './assets/transport-data.json';
import { APP_VERSION, APP_CODENAME } from './constants';
import { CHANGELOGS } from './changelogs';
import { WHATSNEW } from './whatsnew';
import { searchGares, nearbyGares, coordGare, isNetworkError, nearbyStopsWithCoords, linesForArea, LineChip } from './api';
import { GHOST_STOP_ID, GHOST_STOP_LABEL, GHOST_STOP_NAME, GHOST_CHIPS, GHOST_STOP_COORD } from './ghostStop';
import { logger, LogEntry } from './logger';
import { Image as ExpoImage } from 'expo-image';
import { MODE_ICONS } from './modeIcons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';
import NativeSchedules, { type SchedulesRef } from './NativeSchedules';

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

function FadeBottom({ color, height = 56 }: { color: string; height?: number }) {
  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height }} pointerEvents="none">
      <LinearGradient colors={['transparent', color]} style={{ flex: 1 }} />
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

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Gare = { id: string; label: string; lat?: number; lon?: number };
type FavorisProps = {
  favoris: Gare[];
  onSupprimerFavori: (gare: Gare) => void;
  onSelectionnerGare: (id: string, label: string) => void;
  onReordonnerFavoris: (from: number, to: number) => void;
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
function SettingsModal({ visible, onClose, nativeSchedules, setNativeSchedules, onOpenGhostStop, onReplayWhatsNew }: { visible: boolean; onClose: () => void; nativeSchedules: boolean; setNativeSchedules: (v: boolean) => void; onOpenGhostStop: () => void; onReplayWhatsNew: () => void }) {
  const c = useColors();
  const { pref, setPref } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>(() => logger.get());
  useEffect(() => { const unsub = logger.subscribe(() => setLogs(logger.get())); return () => { unsub(); }; }, []);
  const [devMode, setDevMode] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('@gp_dev_mode').then(v => { if (v === '1') setDevMode(true); });
  }, []);
  const [showChangelog, setShowChangelog] = useState(false);
  const changelogAnim = useRef(new Animated.Value(0)).current;
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
    { icon: '💬', label: 'Communauté WhatsApp', url: 'https://whatsapp.com/channel/0029VbCSkQt5vKA7MojdZH3N' },
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
                    const newVal = !devMode;
                    setDevMode(newVal);
                    AsyncStorage.setItem('@gp_dev_mode', newVal ? '1' : '0').catch(() => {});
                  }}
                >
                  <Image source={require('./assets/app_icon.png')} style={styles.aProposLogo} />
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
            <TouchableOpacity
              style={styles.changelogSectionHeader}
              onPress={() => {
                if (!showChangelog) {
                  setShowChangelog(true);
                  setActiveVersion(null);
                  changelogAnim.setValue(0);
                  Animated.timing(changelogAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
                } else {
                  Animated.timing(changelogAnim, { toValue: 0, duration: 200, useNativeDriver: true })
                    .start(() => setShowChangelog(false));
                }
              }}
            >
              <Text style={[styles.settingsSection, { color: c.textSub, marginTop: 0, marginBottom: 0, marginHorizontal: 0 }]}>
                HISTORIQUE DES VERSIONS
              </Text>
              <Text style={{ color: c.textSub, fontSize: 18, marginRight: 4 }}>
                {showChangelog ? '˅' : '›'}
              </Text>
            </TouchableOpacity>
            {showChangelog && (
              <Animated.View style={{
                opacity: changelogAnim,
                transform: [{ translateY: changelogAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
              }}>
                <View style={[styles.settingsCard, { backgroundColor: c.bgCard, borderColor: c.borderCard, padding: 0 }]}>
                  {CHANGELOGS.map((entry, i) => (
                    <View key={entry.version}>
                      {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />}
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
                  ))}
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
function AccueilScreen({ onBasculerFavori, estFavori, onHeaderLayout, onGareChoisie, onOpenSettings, onClosePanel, onMapTapped, activeTab, mapRef, panelOpen }: AccueilProps) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();
  const [loadingGps, setLoadingGps] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Gare[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [feurVisible, setFeurVisible] = useState(false);

  const searchBarBottom = useRef(new Animated.Value(SEARCH_BAR_BOTTOM)).current;
  const resultsBottom   = useRef(Animated.add(searchBarBottom, SEARCH_BAR_HEIGHT + 8)).current;

  useEffect(() => {
    Animated.timing(searchBarBottom, {
      toValue: panelOpen ? -(SEARCH_BAR_HEIGHT + 20) : SEARCH_BAR_BOTTOM,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [panelOpen]);

  const vpAbortRef = useRef<AbortController | null>(null);

  const handleViewportChanged = useCallback(async (lat: number, lon: number, zoom: number, radius: number) => {
    if (zoom < 11.5) { mapRef.current?.setNearbyStops([]); return; }
    vpAbortRef.current?.abort();
    vpAbortRef.current = new AbortController();
    try {
      const stops = await nearbyStopsWithCoords(lat, lon, vpAbortRef.current.signal, radius);
      mapRef.current?.setNearbyStops(stops);
    } catch {}
  }, [mapRef]);

  useEffect(() => {
    (async () => { await Location.requestForegroundPermissionsAsync(); })();
  }, []);

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
    fermerRecherche();
    setIsSearching(true);
    try {
      setLoadingGps(true);
      let loc = await Location.getLastKnownPositionAsync();
      if (!loc) loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const lat = loc!.coords.latitude;
      const lon = loc!.coords.longitude;
      mapRef.current?.setUserLocation(lat, lon);
      const results = await nearbyGares(lat, lon);
      setSearchResults(results.length > 0 ? results : [{ id: 'vide', label: 'Aucun arrêt dans un rayon de 1.5km 😕' }]);
    } catch (e: any) {
      logger.error(`nearby: ${e?.message}`);
      const msg = isNetworkError(e) ? '📵 Pas de connexion internet' : '⚠️ Impossible de géolocaliser ou joindre le serveur';
      setSearchResults([{ id: 'erreur', label: msg }]);
    } finally { setLoadingGps(false); setIsSearching(false); }
  };

  const showResults = searchResults.length > 0;

  return (
    <View style={styles.container}>
      <MapWebView
        ref={mapRef}
        isDark={isDark}
        onStationSelected={onGareChoisie}
        onViewportChanged={handleViewportChanged}
        onMapTapped={onMapTapped}
        onReady={() => {
          mapRef.current?.setTheme(isDark);
          mapRef.current?.setTransportData(transportData as { stops: any[]; lines: any[] });
        }}
      />

      {/* Header pill flottant */}
      <View
        style={[styles.headerNatif, { backgroundColor: c.bgFloat, top: insets.top + 12 }]}
        onLayout={(e: LayoutChangeEvent) => {
          const { y, height } = e.nativeEvent.layout;
          onHeaderLayout(y + height);
        }}
      >
        <Image source={require('./assets/app_icon.png')} style={styles.logoApp} />
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
                  style={{ flex: 1, paddingVertical: 15 }}
                  onPress={() => { if (item.id !== 'erreur' && item.id !== 'vide') choisirGare(item.id, item.label); }}
                >
                  <Text style={[styles.searchResultText, { color: c.text }]}>{item.label}</Text>
                </TouchableOpacity>
                {item.id !== 'erreur' && item.id !== 'vide' && (
                  <TouchableOpacity style={styles.etoileAction} onPress={() => onBasculerFavori(item)}>
                    <Text style={{ fontSize: 22 }}>{estFavori(item.id) ? '⭐' : '☆'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
          <FadeBottom color={c.bg} height={40} />
        </Animated.View>
      )}

      {/* Barre de recherche flottante */}
      <Animated.View style={[styles.bottomSearchBar, { bottom: searchBarBottom, backgroundColor: c.bgFloat }]}>
        <View style={styles.searchContainer}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: c.bgSubtle, color: c.text }]}
            placeholder="Rechercher une gare..."
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
        <TouchableOpacity style={[styles.boutonGpsBarre, { backgroundColor: c.bgSubtle }]} onPress={declarerClicGpsNatif} disabled={loadingGps}>
          {loadingGps
            ? <ActivityIndicator size="small" color={c.accent} />
            : <Text style={{ fontSize: 18 }}>📍</Text>
          }
        </TouchableOpacity>
      </Animated.View>
      <FeurModal visible={feurVisible} onClose={() => setFeurVisible(false)} />
    </View>
  );
}

// ─── ÉCRAN FAVORIS ────────────────────────────────────────────────────────────
const FAV_ITEM_H = 72;
const FAV_GAP    = 10;
const FAV_SLOT_H = FAV_ITEM_H + FAV_GAP;

function FavorisScreen({ favoris, onSupprimerFavori, onSelectionnerGare, onReordonnerFavoris }: FavorisProps) {
  const c = useColors();
  const [editMode, setEditMode] = useState(false);
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

// ─── MODALE "QUOI DE NEUF" ───────────────────────────────────────────────────
function WhatsNewModal({ visible, onClose, onOpenChangelog }: { visible: boolean; onClose: () => void; onOpenChangelog: () => void }) {
  const c = useColors();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 14 }).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(onClose);
  };

  const entry = WHATSNEW.find(e => e.version === APP_VERSION);

  if (!visible || !entry) return null;

  const Feature = ({ emoji, title, description }: { emoji: string; title: string; description: string }) => (
    <View style={{ borderRadius: 10, borderWidth: 1, borderColor: c.accent, backgroundColor: c.bgCard, padding: 12, gap: 4 }}>
      <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 14, color: c.text }}>{emoji}  {title}</Text>
      <Text style={{ fontFamily: 'GrandParis-Light', fontSize: 13, color: c.textSub, lineHeight: 19 }}>{description}</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
      <Animated.View style={{
        flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
        opacity: anim,
      }}>
        <Animated.View style={{
          width: '100%', borderRadius: 18,
          backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.borderCard,
          padding: 24, gap: 16,
          transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
        }}>
          <View style={{ gap: 8 }}>
            <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 20, color: c.text }}>✨ Quoi de neuf ?</Text>
            <View style={{ backgroundColor: c.accent, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
              <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 11, color: '#fff', letterSpacing: 0.5 }}>v{APP_VERSION}</Text>
            </View>
          </View>

          <View style={{ gap: 10 }}>
            {entry.features.map((f, i) => (
              <Feature key={i} emoji={f.emoji} title={f.title} description={f.description} />
            ))}
          </View>

          {entry.footer && (
            <Text style={{ fontFamily: 'GrandParis-Light', fontSize: 12, color: c.textSub, textAlign: 'center', lineHeight: 18 }}>
              {entry.footer + '\n'}
              <Text onPress={() => { handleClose(); setTimeout(onOpenChangelog, 300); }} style={{ color: c.accent }}>
                Voir l'historique des versions →
              </Text>
            </Text>
          )}

          <TouchableOpacity
            onPress={handleClose}
            style={{ backgroundColor: c.accent, borderRadius: 30, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: 'GrandParis-Bold', fontSize: 15, color: '#fff' }}>C'est parti !</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── APP PRINCIPALE ───────────────────────────────────────────────────────────
function AppInner() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const { isDark } = useContext(ThemeContext);

  const PANEL_H = SCREEN_H - insets.top;

  const [activeTab, setActiveTab] = useState<'accueil' | 'favoris' | 'assistant'>('accueil');
  const [favoris, setFavoris] = useState<Gare[]>([]);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [gareActuelle, setGareActuelle] = useState<{ id: string; label: string; osmOnly?: boolean } | null>(null);
  const [panelIsOpen, setPanelIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [nativeSchedules, setNativeSchedules] = useState(true);
  useEffect(() => { AsyncStorage.getItem('@gp_native_schedules').then(v => { if (v === '0') setNativeSchedules(false); }); }, []);
  useEffect(() => {
    AsyncStorage.getItem('@gp_last_seen_version').then(v => {
      if (v !== APP_VERSION) {
        setShowWhatsNew(true);
        AsyncStorage.setItem('@gp_last_seen_version', APP_VERSION).catch(() => {});
      }
    });
  }, []);
  const [nativeRefreshKey, setNativeRefreshKey] = useState(0);
  const nativeSchedulesRef = useRef<SchedulesRef>(null);
  const [svLayout, setSvLayout] = useState(0);
  const [panelLines, setPanelLines] = useState<LineChip[] | null>(null);
  const linesAbortRef = useRef<AbortController | null>(null);

  type PanelLineItem = { type: 'chip'; chip: LineChip } | { type: 'mode'; mode: string };
  const panelLineItems = useMemo((): PanelLineItem[] => {
    if (!panelLines || panelLines.length === 0) return [];
    const MODE_ORDER: Record<string, number> = { RER: 0, TRAIN: 1, METRO: 2, TRAM: 3, CABLE: 4, FLUVIAL: 5, BUS: 6 };
    const sorted = [...panelLines].sort((a, b) => {
      const isLetterA = a.mode === 'BUS' && isNaN(Number(a.code[0]));
      const isLetterB = b.mode === 'BUS' && isNaN(Number(b.code[0]));
      const oa = (MODE_ORDER[a.mode] ?? 6) + (isLetterA ? 0.5 : 0);
      const ob = (MODE_ORDER[b.mode] ?? 6) + (isLetterB ? 0.5 : 0);
      if (oa !== ob) return oa - ob;
      return a.code.localeCompare(b.code, undefined, { numeric: true });
    });
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
  const webViewRef = useRef<WebView>(null);
  const mapRef = useRef<MapWebViewRef | null>(null);
  const APP_URL = process.env.EXPO_PUBLIC_APP_URL || '';

  // ── Panel animé ──────────────────────────────────────────────────────────
  const snapRef = useRef({ hidden: PANEL_H, half: PANEL_H - SCREEN_H * 0.50, full: PANEL_H });
  snapRef.current.hidden = PANEL_H;
  snapRef.current.half   = PANEL_H - SCREEN_H * 0.50;
  snapRef.current.full   = headerHeight > 0 ? headerHeight - insets.top + 8 : PANEL_H;

  const panelY      = useRef(new Animated.Value(PANEL_H)).current;
  const panelYJS    = useRef(new Animated.Value(PANEL_H)).current;
  const panelSnap   = useRef<'hidden' | 'half' | 'full'>('hidden');

  // Hauteur visible du contenu = svLayout + paddingBottom - panelY (dérivation exacte pour position:absolute bottom:0)
  const contentAreaH = useMemo(() => {
    const snapFull = snapRef.current.full;
    const snapHalf = snapRef.current.half;
    if (svLayout <= 0 || snapFull >= snapHalf) return new Animated.Value(50);
    return panelYJS.interpolate({
      inputRange:  [snapFull, snapHalf],
      outputRange: [svLayout, Math.max(50, svLayout + NAV_BAR_HEIGHT + NAV_BAR_BOTTOM - snapHalf)],
      extrapolate: 'clamp',
    });
  }, [panelYJS, svLayout, headerHeight]);
  const currentY    = useRef(PANEL_H);
  const startY      = useRef(PANEL_H);

  useEffect(() => {
    const id = panelY.addListener(({ value }) => { currentY.current = value; });
    return () => panelY.removeListener(id);
  }, []);

  const snapTo = useCallback((snap: 'hidden' | 'half' | 'full', onDone?: () => void) => {
    const to = snap === 'hidden' ? snapRef.current.hidden
             : snap === 'half'   ? snapRef.current.half
                                 : snapRef.current.full;
    panelSnap.current = snap;

    Animated.parallel([
      Animated.spring(panelY,   { toValue: to, useNativeDriver: true,  tension: 68, friction: 13 }),
      Animated.spring(panelYJS, { toValue: to, useNativeDriver: false, tension: 68, friction: 13 }),
    ]).start(({ finished }) => { if (finished) onDone?.(); });
  }, [panelY, panelYJS]);

  const snapToRef = useRef(snapTo);
  snapToRef.current = snapTo;

  const fermerPanel = useCallback(() => {
    linesAbortRef.current?.abort();
    setPanelIsOpen(false);
    snapTo('hidden', () => { setGareActuelle(null); setPanelLines(null); });
  }, [snapTo]);
  const fermerPanelRef = useRef(fermerPanel);
  fermerPanelRef.current = fermerPanel;


  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        panelY.stopAnimation();
        panelYJS.stopAnimation();
        startY.current = currentY.current;
      },
      onPanResponderMove: (_, g) => {
        const next = Math.max(snapRef.current.full - 30, Math.min(snapRef.current.hidden, startY.current + g.dy));
        panelY.setValue(next);
        panelYJS.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        if (g.vy < -0.5 || g.dy < -60) {
          snapToRef.current('full');
        } else if (g.vy > 0.5 || g.dy > 60) {
          if (panelSnap.current === 'full') snapToRef.current('half');
          else fermerPanelRef.current();
        } else {
          snapToRef.current(panelSnap.current);
        }
      },
    })
  ).current;

  // ── Données ──────────────────────────────────────────────────────────────
  const [fontsLoaded] = useFonts({
    'GrandParis-Light':  require('./assets/GrandParis-Light.otf'),
    'GrandParis':        require('./assets/GrandParis.otf'),
    'GrandParis-Medium': require('./assets/GrandParis-Medium.otf'),
    'GrandParis-Bold':   require('./assets/GrandParis-Bold.otf'),
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
    const isOSM = id.startsWith('osm:');
    const dejaOuverte = gareActuelle?.id === id;
    setGareActuelle({ id, label, osmOnly: isOSM });
    setPanelIsOpen(true);
    setActiveTab('accueil');
    if (panelSnap.current === 'hidden') snapTo('half');

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
      const url = `${APP_URL}?selectionned_stop_id=${id}&selectionned_stop_name=${encodeURIComponent(label)}&t=${Date.now()}`;
      webViewRef.current?.injectJavaScript(`window.location.href = "${url}"; true;`);
    }
    if (!dejaOuverte) {
      setPanelLines(null);
      linesAbortRef.current?.abort();
      const ctrl = new AbortController();
      linesAbortRef.current = ctrl;
      linesForArea(id, ctrl.signal)
        .then(lines => { if (!ctrl.signal.aborted) setPanelLines(lines); })
        .catch(() => setPanelLines([]));
    }
    if (!dejaOuverte) {
      coordGare(id)
        .then(coord => {
          if (coord) {
            mapRef.current?.flyTo(coord.lat, coord.lon);
            mapRef.current?.showStation(id, coord.lat, coord.lon, label);
          }
        })
        .catch(e => logger.warn(`coord ${id}: ${e?.message}`));
    }
  }, [gareActuelle, APP_URL, snapTo]);

  const selectionnerDepuisFavoris = useCallback((id: string, label: string) => {
    setActiveTab('accueil');
    setTimeout(() => ouvrirGare(id, label), 50);
  }, [ouvrirGare]);

  const rechargerWebView = () => {
    webViewRef.current?.injectJavaScript(`location.reload(); true;`);
  };


  useEffect(() => {
    const D = 300;
    if (activeTab === 'favoris') {
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
  }, [activeTab]);

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
        activeTab={activeTab}
        mapRef={mapRef}
        panelOpen={panelIsOpen}
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
              <FavorisScreen favoris={favoris} onSupprimerFavori={basculerFavori} onSelectionnerGare={selectionnerDepuisFavoris} onReordonnerFavoris={reordonnerFavoris} />
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
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View style={[styles.garePanel, { height: PANEL_H, backgroundColor: c.bg, transform: [{ translateY: panelY }], paddingBottom: NAV_BAR_HEIGHT + NAV_BAR_BOTTOM }]}>

          <View {...panResponder.panHandlers}>
            <View style={styles.dragZone}>
              <View style={[styles.dragBar, { backgroundColor: c.dragBar }]} />
            </View>
            <View style={[styles.sheetHeader, { borderBottomColor: c.border }]}>
              <Text style={[styles.sheetTitreGare, { color: c.text }]} numberOfLines={1}>
                {gareActuelle?.label.split('(')[0].trim() || ''}
              </Text>
              <View style={styles.sheetActions}>
                {!gareActuelle?.osmOnly && (
                  <TouchableOpacity style={[styles.sheetBoutonAction, { backgroundColor: c.btnBg }]} onPress={nativeSchedules ? () => setNativeRefreshKey(k => k + 1) : rechargerWebView}>
                    <Text style={{ fontSize: 15 }}>🔄</Text>
                  </TouchableOpacity>
                )}
                {gareActuelle && !gareActuelle.osmOnly && (
                  <TouchableOpacity
                    style={[styles.sheetBoutonAction, { backgroundColor: c.btnBg }]}
                    onPress={() => basculerFavori({ id: gareActuelle.id, label: gareActuelle.label })}
                  >
                    <Text style={{ fontSize: 15 }}>{estFavori(gareActuelle.id) ? '⭐' : '☆'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.sheetBoutonFermer, { backgroundColor: c.btnBg }]} onPress={fermerPanel}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSub }}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

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
          <View style={{ flex: 1 }} onLayout={e => setSvLayout(e.nativeEvent.layout.height)}>
            <Animated.View style={{ height: contentAreaH, overflow: 'hidden' }}>
            {gareActuelle?.osmOnly ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <Text style={{ fontSize: 28, marginBottom: 12 }}>🚏</Text>
                <Text style={{ fontSize: 15, color: c.textSub, textAlign: 'center', fontFamily: 'GrandParis' }}>
                  Cet arrêt n'est pas référencé dans les données temps réel IDFM.{'\n'}Aucun horaire disponible.
                </Text>
              </View>
            ) : gareActuelle && (nativeSchedules || gareActuelle.id === GHOST_STOP_ID) ? (
              <NativeSchedules ref={nativeSchedulesRef} stopId={gareActuelle.id} stopName={gareActuelle.id === GHOST_STOP_ID ? GHOST_STOP_NAME : gareActuelle.label.split('(')[0].trim()} refreshKey={nativeRefreshKey} />
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
            </Animated.View>
          </View>

        </Animated.View>
      </View>

      {/* Modal paramètres */}
      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} nativeSchedules={nativeSchedules} setNativeSchedules={(v) => { setNativeSchedules(v); AsyncStorage.setItem('@gp_native_schedules', v ? '1' : '0').catch(() => {}); }} onOpenGhostStop={() => { ouvrirGare(GHOST_STOP_ID, GHOST_STOP_LABEL); setShowSettings(false); }} onReplayWhatsNew={() => { AsyncStorage.removeItem('@gp_last_seen_version').catch(() => {}); setShowWhatsNew(true); }} />
      <WhatsNewModal visible={showWhatsNew} onClose={() => setShowWhatsNew(false)} onOpenChangelog={() => setShowSettings(true)} />

    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <View style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppInner />
        </SafeAreaProvider>
      </View>
    </ThemeProvider>
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
    borderRadius: 16, maxHeight: 280,
    zIndex: 999, elevation: 10,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, overflow: 'hidden',
  },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, paddingHorizontal: 15,
  },
  searchResultText: { fontSize: 15, fontFamily: 'GrandParis-Medium' },
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
  dragZone: { height: 30, alignItems: 'center', justifyContent: 'center' },
  dragBar: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1,
  },
  sheetTitreGare: { flex: 1, fontSize: 17, fontFamily: 'GrandParis-Bold', marginRight: 8 },
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
  changelogSectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 24, marginBottom: 8, marginHorizontal: 20,
  },
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
