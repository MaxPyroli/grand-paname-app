import React, { useRef, useEffect, useState, useCallback, useMemo, createContext, useContext } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ActivityIndicator,
  FlatList, TextInput, Keyboard, Image, Animated, Dimensions,
  LayoutChangeEvent, Platform, PanResponder, useColorScheme,
  Modal, Linking, ScrollView,
} from 'react-native';
import MapWebView, { MapWebViewRef } from './MapWebView';
import { useFonts } from 'expo-font';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import transportData from './assets/transport-data.json';
import { APP_VERSION } from './constants';
import { searchGares, nearbyGares, coordGare, isNetworkError } from './api';
import { logger, LogEntry } from './logger';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';

// ─── THÈME ───────────────────────────────────────────────────────────────────
const C = {
  light: {
    bg:         '#ffffff',
    bgFloat:    'rgba(255,255,255,0.92)',
    bgSubtle:   '#f1f2f6',
    bgCard:     '#ffffff',
    text:       '#25303b',
    textSub:    '#7f8c8d',
    textTab:    '#8E8E93',
    border:     '#f0f2f5',
    borderCard: 'rgba(210,218,230,0.8)',
    dragBar:    '#d0d5dc',
    pillActive: '#EBEBEB',
    pillCenter: '#DDEEFF',
    accent:     '#3498db',
    btnBg:      '#f1f2f6',
    iconGareBg: '#e3f2fd',
  },
  dark: {
    bg:         '#010e26',
    bgFloat:    'rgba(1,14,38,0.97)',
    bgSubtle:   '#07213f',
    bgCard:     '#031a3a',
    text:       '#ddeeff',
    textSub:    '#6e99cc',
    textTab:    '#4d7ab0',
    border:     '#0d2e58',
    borderCard: 'rgba(20,60,120,0.45)',
    dragBar:    '#164070',
    pillActive: '#07213f',
    pillCenter: '#0a2d64',
    accent:     '#5ab3f5',
    btnBg:      '#07213f',
    iconGareBg: '#0a2d64',
  },
};
type ThemeColors = typeof C.light;
type ThemePref = 'auto' | 'light' | 'dark';

// ─── CONTEXTE THÈME ──────────────────────────────────────────────────────────
const ThemeContext = createContext<{
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  isDark: boolean;
}>({ pref: 'auto', setPref: () => {}, isDark: false });

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('auto');
  const system = useColorScheme();
  const isDark = pref === 'dark' || (pref === 'auto' && system === 'dark');

  useEffect(() => {
    AsyncStorage.getItem('@gp_theme_pref').then(v => {
      if (v === 'light' || v === 'dark' || v === 'auto') setPrefState(v);
    }).catch(() => {});
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem('@gp_theme_pref', p).catch(() => {});
  }, []);

  return (
    <ThemeContext.Provider value={{ pref, setPref, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

function useColors(): ThemeColors {
  const { isDark } = useContext(ThemeContext);
  return isDark ? C.dark : C.light;
}

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
  const css = dark ? [
    'html,:root{--background-color:#010e26;--secondary-background-color:#07213f;--text-color:#ddeeff;--primary-color:#5ab3f5}',
    '.stApp,body,html{background-color:#010e26!important}',
    'section[data-testid="stMain"],section.main,.block-container,[data-testid="stMainBlockContainer"]{background-color:#010e26!important}',
  ].join('') : '';
  return `(function(){var s=document.getElementById('_gp_dark_theme');if(!s){s=document.createElement('style');s.id='_gp_dark_theme';document.head.appendChild(s);}s.textContent=${JSON.stringify(css)};})();true;`;
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
  activeTab: string;
  mapRef: React.RefObject<MapWebViewRef | null>;
};

// ─── PAGE PARAMÈTRES ─────────────────────────────────────────────────────────
function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { pref, setPref } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>(() => logger.get());
  useEffect(() => { const unsub = logger.subscribe(() => setLogs(logger.get())); return () => { unsub(); }; }, []);
  const [devMode, setDevMode] = useState(false);
  const [logoTaps, setLogoTaps] = useState(0);
  useEffect(() => { AsyncStorage.getItem('@gp_dev_mode').then(v => { if (v === '1') setDevMode(true); }); }, []);
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
      duration: 1400,
      useNativeDriver: true,
    }).start(() => setTrainVisible(false));
  }

  const THEME_OPTIONS: { key: ThemePref; icon: string; label: string }[] = [
    { key: 'auto',  icon: '🌐', label: 'Auto'   },
    { key: 'light', icon: '☀️', label: 'Clair'  },
    { key: 'dark',  icon: '🌙', label: 'Sombre' },
  ];

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
          <TouchableOpacity style={styles.settingsBackBtn} onPress={onClose}>
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
              <View style={[styles.themeToggle, { backgroundColor: c.bgSubtle }]}>
                {THEME_OPTIONS.map(({ key, icon, label }) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.themeOption,
                      pref === key && {
                        backgroundColor: c.bgFloat,
                        shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 4,
                        shadowOffset: { width: 0, height: 1 }, elevation: 3,
                      },
                    ]}
                    onPress={() => setPref(key)}
                  >
                    <Text style={{ fontSize: 15 }}>{icon}</Text>
                    <Text style={[styles.themeOptionLabel, { color: pref === key ? c.text : c.textSub }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── À propos ── */}
            <Text style={[styles.settingsSection, { color: c.textSub }]}>À PROPOS</Text>
            <View style={[styles.settingsCard, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
              <View style={styles.aProposHeader}>
                <TouchableOpacity onPress={() => {
                    const next = logoTaps + 1;
                    setLogoTaps(next);
                    if (next >= 5) {
                      setLogoTaps(0);
                      const newVal = !devMode;
                      setDevMode(newVal);
                      AsyncStorage.setItem('@gp_dev_mode', newVal ? '1' : '0').catch(() => {});
                    }
                  }}>
                  <Image source={require('./assets/app_icon.png')} style={styles.aProposLogo} />
                </TouchableOpacity>
                <View>
                  <Text style={[styles.aProposNom, { color: c.text }]}>Grand Paname</Text>
                  <TouchableOpacity onPress={() => {
                    const next = versionTaps + 1;
                    setVersionTaps(next);
                    if (next >= 7) { setVersionTaps(0); lancerTrain(); }
                  }}>
                    <Text style={[styles.aProposVersion, { color: c.textSub }]}>Version {APP_VERSION}</Text>
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

            {/* ── Débogage (mode dev, caché) ── */}
            {devMode && (
              <>
                <Text style={[styles.settingsSection, { color: c.textSub }]}>DÉBOGAGE</Text>
                <View style={[styles.settingsCard, { backgroundColor: c.bgCard, borderColor: c.borderCard }]}>
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
          <VideoView player={player} style={styles.feurVideo} contentFit="contain" />
          <Text style={styles.feurHint}>Tape pour fermer</Text>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── ÉCRAN D'ACCUEIL ─────────────────────────────────────────────────────────
function AccueilScreen({ onBasculerFavori, estFavori, onHeaderLayout, onGareChoisie, onOpenSettings, onClosePanel, activeTab, mapRef }: AccueilProps) {
  const c = useColors();
  const { isDark } = useContext(ThemeContext);
  const [loadingGps, setLoadingGps] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Gare[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [feurVisible, setFeurVisible] = useState(false);

  const searchBarBottom = useRef(new Animated.Value(SEARCH_BAR_BOTTOM)).current;
  const resultsBottom   = useRef(Animated.add(searchBarBottom, SEARCH_BAR_HEIGHT + 8)).current;

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
        onStationSelected={onGareChoisie}
        onReady={() => {
          mapRef.current?.setTheme(isDark);
          mapRef.current?.setTransportData(transportData as { stops: any[]; lines: any[] });
        }}
      />

      {/* Header pill flottant */}
      <View
        style={[styles.headerNatif, { backgroundColor: c.bgFloat }]}
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
        style={[styles.settingsBubble, { backgroundColor: c.bgFloat }]}
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
        <TouchableOpacity style={[styles.boutonGpsBarre, { backgroundColor: c.bgSubtle }]} onPress={declarerClicGpsNatif} disabled={loadingGps}>
          {loadingGps
            ? <ActivityIndicator size="small" color={c.accent} />
            : <Text style={{ fontSize: 18 }}>📍</Text>
          }
        </TouchableOpacity>
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
      </Animated.View>
      <FeurModal visible={feurVisible} onClose={() => setFeurVisible(false)} />
    </View>
  );
}

// ─── ÉCRAN FAVORIS ────────────────────────────────────────────────────────────
function FavorisScreen({ favoris, onSupprimerFavori, onSelectionnerGare, onReordonnerFavoris }: FavorisProps) {
  const c = useColors();
  const [editMode, setEditMode] = useState(false);

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
        <FlatList
          data={favoris}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60, paddingTop: 28 }}
          renderItem={({ item, index }) => (
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
                <View style={[styles.iconGare, { backgroundColor: c.iconGareBg }]}>
                  <Text style={{ fontSize: 16 }}>🚉</Text>
                </View>
                <Text style={[styles.texteNomGareFavori, { color: c.text }]} numberOfLines={2}>{item.label}</Text>
              </View>
              {editMode ? (
                <View style={styles.boutonsOrdre}>
                  <TouchableOpacity
                    onPress={() => onReordonnerFavoris(index, index - 1)}
                    disabled={index === 0}
                    hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
                  >
                    <Text style={{ color: index === 0 ? c.border : c.accent, fontSize: 20 }}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onReordonnerFavoris(index, index + 1)}
                    disabled={index === favoris.length - 1}
                    hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
                  >
                    <Text style={{ color: index === favoris.length - 1 ? c.border : c.accent, fontSize: 20 }}>↓</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={{ color: c.accent, fontSize: 20, marginLeft: 8 }}>›</Text>
              )}
            </TouchableOpacity>
          )}
        />
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
    <View style={styles.cardContent}>
      <Text style={[styles.cardTitle, { color: c.text }]}>En construction...🏗️</Text>
      <Text style={[styles.cardSubtitle, { color: c.textSub }]}>De nouvelles fonctionnalités arrivent... 👀</Text>
    </View>
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
  const [gareActuelle, setGareActuelle] = useState<{ id: string; label: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const mapRef = useRef<MapWebViewRef | null>(null);
  const APP_URL = process.env.EXPO_PUBLIC_APP_URL || '';

  // ── Panel animé ──────────────────────────────────────────────────────────
  const snapRef = useRef({ hidden: PANEL_H, half: PANEL_H - SCREEN_H * 0.50, full: PANEL_H });
  snapRef.current.hidden = PANEL_H;
  snapRef.current.half   = PANEL_H - SCREEN_H * 0.50;
  snapRef.current.full   = headerHeight > 0 ? headerHeight + 8 : PANEL_H;

  const panelY      = useRef(new Animated.Value(PANEL_H)).current;
  const panelSnap   = useRef<'hidden' | 'half' | 'full'>('hidden');
  const [panelSnapState, setPanelSnapState] = useState<'hidden' | 'half' | 'full'>('hidden');
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
    setPanelSnapState(snap);
    Animated.spring(panelY, {
      toValue: to, useNativeDriver: true, tension: 68, friction: 13,
    }).start(({ finished }) => { if (finished) onDone?.(); });
  }, [panelY]);

  const snapToRef = useRef(snapTo);
  snapToRef.current = snapTo;

  const fermerPanel = useCallback(() => {
    snapTo('hidden', () => setGareActuelle(null));
  }, [snapTo]);
  const fermerPanelRef = useRef(fermerPanel);
  fermerPanelRef.current = fermerPanel;

  const togglePanel = useCallback(() => {
    snapTo(panelSnap.current === 'full' ? 'half' : 'full');
  }, [snapTo]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        panelY.stopAnimation();
        startY.current = currentY.current;
      },
      onPanResponderMove: (_, g) => {
        const next = Math.max(snapRef.current.full - 30, Math.min(snapRef.current.hidden, startY.current + g.dy));
        panelY.setValue(next);
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
  const slideAnim = useRef(new Animated.Value(-screenWidth)).current;
  const [lastTab, setLastTab] = useState<'favoris' | 'assistant'>('favoris');

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
    const dejaOuverte = gareActuelle?.id === id;
    setGareActuelle({ id, label });
    setActiveTab('accueil');
    if (dejaOuverte) {
      const url = `${APP_URL}?selectionned_stop_id=${id}&selectionned_stop_name=${encodeURIComponent(label)}&t=${Date.now()}`;
      webViewRef.current?.injectJavaScript(`window.location.href = "${url}"; true;`);
    }
    if (panelSnap.current === 'hidden') snapTo('half');
    coordGare(id)
      .then(coord => {
        if (coord) {
          mapRef.current?.flyTo(coord.lat, coord.lon);
          mapRef.current?.showStation(id, coord.lat, coord.lon);
        }
      })
      .catch(e => logger.warn(`coord ${id}: ${e?.message}`));
  }, [gareActuelle, APP_URL, snapTo]);

  const selectionnerDepuisFavoris = useCallback((id: string, label: string) => {
    setActiveTab('accueil');
    setTimeout(() => ouvrirGare(id, label), 50);
  }, [ouvrirGare]);

  const rechargerWebView = () => {
    webViewRef.current?.injectJavaScript(`location.reload(); true;`);
  };

  const basculerSidebar = () => {
    Keyboard.dismiss();
    webViewRef.current?.injectJavaScript(`
      var o = document.querySelector('[data-testid="collapsedControl"]');
      if (o) { o.click(); }
      else { var c = document.querySelector('section[data-testid="stSidebar"] button'); if (c) c.click(); }
      true;
    `);
  };

  useEffect(() => {
    if (activeTab !== 'accueil') {
      setLastTab(activeTab);
      slideAnim.setValue(activeTab === 'favoris' ? -screenWidth : screenWidth);
      Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: lastTab === 'favoris' ? -screenWidth : screenWidth,
        duration: 320, useNativeDriver: true,
      }).start();
    }
  }, [activeTab]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg }}><ActivityIndicator size="large" color={c.accent} /></View>;
  }

  const tiroirTop    = insets.top + headerHeight + 8;
  const tiroirBottom = SEARCH_BAR_BOTTOM + SEARCH_BAR_HEIGHT + 8;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <AccueilScreen
        onBasculerFavori={basculerFavori}
        estFavori={estFavori}
        onHeaderLayout={setHeaderHeight}
        onGareChoisie={ouvrirGare}
        onOpenSettings={() => setShowSettings(true)}
        onClosePanel={() => setActiveTab('accueil')}
        activeTab={activeTab}
        mapRef={mapRef}
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
        <Animated.View style={[
          styles.sideCard,
          lastTab === 'favoris' ? styles.sideCardLeft : styles.sideCardRight,
          { top: tiroirTop, bottom: tiroirBottom, backgroundColor: c.bg, transform: [{ translateX: slideAnim }] }
        ]}>
          <View style={styles.cardContentWrapper}>
            {lastTab === 'favoris' && (
              <FavorisScreen favoris={favoris} onSupprimerFavori={basculerFavori} onSelectionnerGare={selectionnerDepuisFavoris} onReordonnerFavoris={reordonnerFavoris} />
            )}
            {lastTab === 'assistant' && <AssistantScreen />}
          </View>
        </Animated.View>
      )}

      {/* Barre de navigation */}
      <View style={[styles.floatingTabBar, { backgroundColor: c.bgFloat }]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('favoris')}>
          <View style={[styles.tabPill, activeTab === 'favoris' && { backgroundColor: c.pillActive }]}>
            <Text style={styles.tabIcon}>{activeTab === 'favoris' ? '⭐' : '☆'}</Text>
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
        <Animated.View style={[styles.garePanel, { height: PANEL_H, backgroundColor: c.bg, transform: [{ translateY: panelY }] }]}>

          <View {...panResponder.panHandlers} style={styles.dragZone}>
            <View style={[styles.dragBar, { backgroundColor: c.dragBar }]} />
          </View>

          <View style={[styles.sheetHeader, { borderBottomColor: c.border }]}>
            <Text style={[styles.sheetTitreGare, { color: c.text }]} numberOfLines={1}>
              {gareActuelle?.label.split('(')[0].trim() || ''}
            </Text>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={[styles.sheetBoutonAction, { backgroundColor: c.btnBg }]} onPress={rechargerWebView}>
                <Text style={{ fontSize: 15 }}>🔄</Text>
              </TouchableOpacity>
              {gareActuelle && (
                <TouchableOpacity
                  style={[styles.sheetBoutonAction, { backgroundColor: c.btnBg }]}
                  onPress={() => basculerFavori({ id: gareActuelle.id, label: gareActuelle.label })}
                >
                  <Text style={{ fontSize: 15 }}>{estFavori(gareActuelle.id) ? '⭐' : '☆'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.sheetBoutonAction, { backgroundColor: c.btnBg }]} onPress={togglePanel}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>
                  {panelSnapState === 'full' ? '↓' : '↑'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetBoutonAction, { backgroundColor: c.btnBg }]} onPress={basculerSidebar}>
                <Text style={{ fontSize: 15 }}>⚙️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetBoutonFermer, { backgroundColor: c.btnBg }]} onPress={fermerPanel}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.textSub }}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ flex: 1 }}>
            {gareActuelle && (
              <WebView
                ref={webViewRef}
                source={{ uri: urlGareActuelle }}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                injectedJavaScript={WEBVIEW_HIDE_JS + getWebviewDarkJS(isDark)}
              />
            )}
          </View>

        </Animated.View>
      </View>

      {/* Modal paramètres */}
      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />

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
    padding: 14, borderRadius: 14, marginBottom: 10, borderWidth: 1,
    shadowColor: '#1a2a4a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  alignementFavori: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconGare: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  texteNomGareFavori: { fontSize: 15, fontFamily: 'GrandParis-Medium', flex: 1 },
  actionsItemFavori: { flexDirection: 'row', alignItems: 'center' },
  boutonSupprimerFavori: { padding: 4 },
  favorisTitreRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  boutonSupprimer: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#e74c3c', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  boutonSupprimerTexte: { color: '#fff', fontSize: 11, fontWeight: 'bold' as const },
  boutonsOrdre: { flexDirection: 'column', alignItems: 'center', marginLeft: 8 },
  cardContent: { flex: 1, alignItems: 'center', paddingTop: 20 },
  cardTitle: { fontSize: 26, fontFamily: 'GrandParis-Bold', marginBottom: 10 },
  cardSubtitle: { fontSize: 16, fontFamily: 'GrandParis-Light' },

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
  settingsBackBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, width: 80 },
  settingsBackArrow: { fontSize: 28, lineHeight: 30, marginRight: 2 },
  settingsBackLabel: { fontSize: 17 },
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
    gap: 5, paddingVertical: 9, borderRadius: 10,
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
});
