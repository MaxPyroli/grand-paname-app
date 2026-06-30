import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ActivityIndicator,
  FlatList, TextInput, Keyboard, Image, Animated, Dimensions,
  LayoutChangeEvent, Platform, PanResponder,
} from 'react-native';
import MapWebView, { MapWebViewRef } from './MapWebView';
import { useFonts } from 'expo-font';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';

// ─── CONSTANTES DE LAYOUT ────────────────────────────────────────────────────
const NAV_BAR_BOTTOM = 16;
const NAV_BAR_HEIGHT = 58;
const SEARCH_BAR_HEIGHT = 52;
const SEARCH_BAR_BOTTOM = NAV_BAR_BOTTOM + NAV_BAR_HEIGHT + 10;
const { height: SCREEN_H } = Dimensions.get('window');

// ─── INJECTION WEBVIEW ───────────────────────────────────────────────────────
const WEBVIEW_HIDE_JS = `
(function() {
  // Injection CSS préventive pour tous les éléments Streamlit flottants
  var css = document.createElement('style');
  css.textContent = [
    'header[data-testid="stHeader"]{display:none!important}',
    '[data-testid="stToolbar"]{display:none!important}',
    '[data-testid="stDecoration"]{display:none!important}',
    '[data-testid="stMainMenuButton"]{display:none!important}',
    '[data-testid="stStatusWidget"]{display:none!important}',
    '#MainMenu{display:none!important}',
    'footer{display:none!important}',
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

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Gare = { id: string; label: string };
type FavorisProps = {
  favoris: Gare[];
  onSupprimerFavori: (gare: Gare) => void;
  onSelectionnerGare: (id: string, label: string) => void;
};
type AccueilProps = {
  favoris: Gare[];
  onBasculerFavori: (gare: Gare) => void;
  estFavori: (id: string) => boolean;
  onHeaderLayout: (height: number) => void;
  onGareChoisie: (id: string, label: string) => void;
};

// ─── ÉCRAN D'ACCUEIL ─────────────────────────────────────────────────────────
function AccueilScreen({ favoris, onBasculerFavori, estFavori, onHeaderLayout, onGareChoisie }: AccueilProps) {
  const mapRef = useRef<MapWebViewRef>(null);
  const [loadingGps, setLoadingGps] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Gare[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const APP_URL = process.env.EXPO_PUBLIC_APP_URL || '';

  // Valeur animée pour remonter la barre de recherche au-dessus du clavier
  const searchBarBottom = useRef(new Animated.Value(SEARCH_BAR_BOTTOM)).current;
  const resultsBottom   = useRef(Animated.add(searchBarBottom, SEARCH_BAR_HEIGHT + 8)).current;

  useEffect(() => {
    (async () => { await Location.requestForegroundPermissionsAsync(); })();
  }, []);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const s1 = Keyboard.addListener(showEvt, (e) => {
      Animated.timing(searchBarBottom, {
        toValue: e.endCoordinates.height + 8,
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

  const fermerRecherche = () => {
    Keyboard.dismiss();
    setSearchQuery('');
    setSearchResults([]);
  };

  const choisirGare = (id: string, label: string) => {
    fermerRecherche();
    onGareChoisie(id, label);
  };

  const rechercherGare = async (texte: string) => {
    setSearchQuery(texte);
    if (texte.length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const api = APP_URL.replace('8501', '8000');
      const res = await fetch(`${api}/api/search?q=${texte}`);
      const json = await res.json();
      setSearchResults(json.results?.length > 0 ? json.results : [{ id: 'vide', label: 'Aucune gare trouvée 😕' }]);
    } catch {
      setSearchResults([{ id: 'erreur', label: '⚠️ Impossible de joindre le serveur' }]);
    } finally { setIsSearching(false); }
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
      const api = APP_URL.replace('8501', '8000');
      const res = await fetch(`${api}/api/nearby?lat=${lat}&lon=${lon}`);
      const json = await res.json();
      setSearchResults(json.results?.length > 0 ? json.results : [{ id: 'vide', label: 'Aucun arrêt dans un rayon de 1.5km 😕' }]);
    } catch {
      setSearchResults([{ id: 'erreur', label: '⚠️ Impossible de géolocaliser ou joindre le serveur' }]);
    } finally { setLoadingGps(false); setIsSearching(false); }
  };

  const showResults = searchResults.length > 0;

  return (
    <View style={styles.container}>
      <MapWebView ref={mapRef} onStationSelected={onGareChoisie} />

      {/* Header pill flottant */}
      <View
        style={styles.headerNatif}
        onLayout={(e: LayoutChangeEvent) => {
          const { y, height } = e.nativeEvent.layout;
          onHeaderLayout(y + height);
        }}
      >
        <Image source={require('./assets/app_icon.png')} style={styles.logoApp} />
        <Text style={styles.titreGrandPaname}>Grand Paname</Text>
      </View>

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
        <Animated.View style={[styles.searchResultsContainer, { bottom: resultsBottom }]}>
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View style={styles.searchResultRow}>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 15 }}
                  onPress={() => { if (item.id !== 'erreur' && item.id !== 'vide') choisirGare(item.id, item.label); }}
                >
                  <Text style={styles.searchResultText}>{item.label}</Text>
                </TouchableOpacity>
                {item.id !== 'erreur' && item.id !== 'vide' && (
                  <TouchableOpacity style={styles.etoileAction} onPress={() => onBasculerFavori(item)}>
                    <Text style={{ fontSize: 22 }}>{estFavori(item.id) ? '⭐' : '☆'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        </Animated.View>
      )}

      {/* Barre de recherche flottante — monte au-dessus du clavier */}
      <Animated.View style={[styles.bottomSearchBar, { bottom: searchBarBottom }]}>
        <TouchableOpacity style={styles.boutonGpsBarre} onPress={declarerClicGpsNatif} disabled={loadingGps}>
          {loadingGps
            ? <ActivityIndicator size="small" color="#3498db" />
            : <Text style={{ fontSize: 18 }}>📍</Text>
          }
        </TouchableOpacity>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher une gare..."
            value={searchQuery}
            onChangeText={rechercherGare}
            placeholderTextColor="#7f8c8d"
            autoCorrect={false}
          />
          {isSearching && (
            <ActivityIndicator style={{ position: 'absolute', right: 12 }} size="small" color="#3498db" />
          )}
          {searchQuery.length > 0 && !isSearching && (
            <TouchableOpacity style={{ position: 'absolute', right: 12 }} onPress={fermerRecherche}>
              <Text style={{ fontSize: 15, color: '#aaa', fontWeight: '600' }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// ─── ÉCRAN FAVORIS ────────────────────────────────────────────────────────────
function FavorisScreen({ favoris, onSupprimerFavori, onSelectionnerGare }: FavorisProps) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.titreTiroir}>⭐ Mes Favoris</Text>
      <Text style={styles.sousTitreTiroir}>
        {favoris.length} {favoris.length === 1 ? 'gare enregistrée' : 'gares enregistrées'}
      </Text>
      {favoris.length === 0 ? (
        <View style={styles.etatVide}>
          <Text style={styles.etatVideEmoji}>🔍</Text>
          <Text style={styles.etatVideTitre}>Aucun favori pour l'instant</Text>
          <Text style={styles.etatVideDesc}>
            Recherchez une gare depuis l'accueil et appuyez sur l'étoile ☆ pour l'ajouter ici.
          </Text>
        </View>
      ) : (
        <FlatList
          data={favoris}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.itemFavoriNatif} onPress={() => onSelectionnerGare(item.id, item.label)} activeOpacity={0.7}>
              <View style={styles.alignementFavori}>
                <View style={styles.iconGare}><Text style={{ fontSize: 16 }}>🚉</Text></View>
                <Text style={styles.texteNomGareFavori} numberOfLines={2}>{item.label}</Text>
              </View>
              <View style={styles.actionsItemFavori}>
                <TouchableOpacity style={styles.boutonSupprimerFavori} onPress={() => onSupprimerFavori(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={{ fontSize: 16 }}>🗑️</Text>
                </TouchableOpacity>
                <Text style={{ color: '#3498db', fontSize: 20, marginLeft: 8 }}>›</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

// ─── ÉCRAN ASSISTANT ──────────────────────────────────────────────────────────
function AssistantScreen() {
  return (
    <View style={styles.cardContent}>
      <Text style={styles.cardTitle}>Pana (Assistant IA)</Text>
      <Text style={styles.cardSubtitle}>Espace de discussion en construction 🚧</Text>
    </View>
  );
}

// ─── APP PRINCIPALE ───────────────────────────────────────────────────────────
function AppInner() {
  const insets = useSafeAreaInsets();

  const PANEL_H = SCREEN_H - insets.top;

  const [activeTab, setActiveTab] = useState<'accueil' | 'favoris' | 'assistant'>('accueil');
  const [favoris, setFavoris] = useState<Gare[]>([]);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [gareActuelle, setGareActuelle] = useState<{ id: string; label: string } | null>(null);
  const webViewRef = useRef<WebView>(null);
  const APP_URL = process.env.EXPO_PUBLIC_APP_URL || '';

  // ── Panel animé ──────────────────────────────────────────────────────────
  // snapRef mis à jour chaque render pour que les closures stales lisent toujours les bonnes valeurs
  const snapRef = useRef({ hidden: PANEL_H, half: PANEL_H - SCREEN_H * 0.50, full: PANEL_H });
  snapRef.current.hidden = PANEL_H;
  snapRef.current.half   = PANEL_H - SCREEN_H * 0.50;
  // SNAP_FULL = headerHeight + 8 : panel démarre juste sous le titre (même formule que tiroirTop)
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

  // PanResponder sur le drag handle
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
  const slideAnim = useRef(new Animated.Value(screenWidth)).current;
  const [lastTab, setLastTab] = useState<'favoris' | 'assistant'>('favoris');

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('@grand_paname_favoris');
        if (stored) setFavoris(JSON.parse(stored));
      } catch (e) { console.log('Erreur chargement favoris', e); }
    })();
  }, []);

  const sauvegarderFavoris = async (list: Gare[]) => {
    try { await AsyncStorage.setItem('@grand_paname_favoris', JSON.stringify(list)); }
    catch (e) { console.log('Erreur sauvegarde', e); }
  };

  const basculerFavori = useCallback((gare: Gare) => {
    setFavoris(prev => {
      const idx = prev.findIndex(f => f.id === gare.id);
      const next = idx > -1 ? prev.filter(f => f.id !== gare.id) : [...prev, gare];
      sauvegarderFavoris(next);
      return next;
    });
  }, []);

  const estFavori = useCallback((id: string) => favoris.some(f => f.id === id), [favoris]);

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
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#3498db" /></View>;
  }

  const tiroirTop    = insets.top + headerHeight + 8;
  const tiroirBottom = SEARCH_BAR_BOTTOM + SEARCH_BAR_HEIGHT + 8;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top', 'left', 'right']}>
          <StatusBar style="dark" />

          <AccueilScreen
            favoris={favoris}
            onBasculerFavori={basculerFavori}
            estFavori={estFavori}
            onHeaderLayout={setHeaderHeight}
            onGareChoisie={ouvrirGare}
          />

          {/* Overlay tiroirs latéraux */}
          {activeTab !== 'accueil' && (
            <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
              <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setActiveTab('accueil')} />
              </BlurView>
            </View>
          )}

          {/* Tiroirs latéraux */}
          {headerHeight > 0 && (
            <Animated.View style={[
              styles.sideCard,
              lastTab === 'favoris' ? styles.sideCardLeft : styles.sideCardRight,
              { top: tiroirTop, bottom: tiroirBottom, transform: [{ translateX: slideAnim }] }
            ]}>
              <View style={[StyleSheet.absoluteFill, styles.glassFond,
                lastTab === 'favoris' ? styles.glassBordureDroite : styles.glassBordureGauche]} />
              <View style={styles.cardContentWrapper}>
                {lastTab === 'favoris' && (
                  <FavorisScreen favoris={favoris} onSupprimerFavori={basculerFavori} onSelectionnerGare={selectionnerDepuisFavoris} />
                )}
                {lastTab === 'assistant' && <AssistantScreen />}
              </View>
            </Animated.View>
          )}

          {/* Barre de navigation */}
          <View style={styles.floatingTabBar}>
            <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('favoris')}>
              <View style={[styles.tabPill, activeTab === 'favoris' && styles.tabPillActive]}>
                <Text style={styles.tabIcon}>{activeTab === 'favoris' ? '⭐' : '☆'}</Text>
              </View>
              <Text style={[styles.tabLabel, activeTab === 'favoris' && styles.tabLabelActive]}>Favoris</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('accueil')}>
              <View style={[styles.tabPill, styles.tabPillCenter, activeTab === 'accueil' && styles.tabPillCenterActive]}>
                <Text style={[styles.tabIcon, { fontSize: 22 }]}>🚇</Text>
              </View>
              <Text style={[styles.tabLabel, activeTab === 'accueil' && styles.tabLabelActive]}>Accueil</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('assistant')}>
              <View style={[styles.tabPill, activeTab === 'assistant' && styles.tabPillActive]}>
                <Text style={styles.tabIcon}>{activeTab === 'assistant' ? '🤖' : '💬'}</Text>
              </View>
              <Text style={[styles.tabLabel, activeTab === 'assistant' && styles.tabLabelActive]}>Pana</Text>
            </TouchableOpacity>
          </View>

          {/* ── Panel gare : bottom sheet animé ─────────────────────────── */}
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Animated.View style={[styles.garePanel, { height: PANEL_H, transform: [{ translateY: panelY }] }]}>

              {/* Zone de drag */}
              <View {...panResponder.panHandlers} style={styles.dragZone}>
                <View style={styles.dragBar} />
              </View>

              {/* Header station */}
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitreGare} numberOfLines={1}>
                  {gareActuelle?.label.split('(')[0].trim() || ''}
                </Text>
                <View style={styles.sheetActions}>
                  <TouchableOpacity style={styles.sheetBoutonAction} onPress={rechargerWebView}>
                    <Text style={{ fontSize: 15 }}>🔄</Text>
                  </TouchableOpacity>
                  {gareActuelle && (
                    <TouchableOpacity
                      style={styles.sheetBoutonAction}
                      onPress={() => basculerFavori({ id: gareActuelle.id, label: gareActuelle.label })}
                    >
                      <Text style={{ fontSize: 15 }}>{estFavori(gareActuelle.id) ? '⭐' : '☆'}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.sheetBoutonAction} onPress={togglePanel}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#555' }}>
                      {panelSnapState === 'full' ? '↓' : '↑'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.sheetBoutonAction} onPress={basculerSidebar}>
                    <Text style={{ fontSize: 15 }}>⚙️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.sheetBoutonFermer} onPress={fermerPanel}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#7f8c8d' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* WebView station */}
              <View style={{ flex: 1 }}>
                {gareActuelle && (
                  <WebView
                    ref={webViewRef}
                    source={{ uri: urlGareActuelle }}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    startInLoadingState={true}
                    injectedJavaScript={WEBVIEW_HIDE_JS}
                  />
                )}
              </View>

            </Animated.View>
          </View>

        </SafeAreaView>
  );
}

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppInner />
      </SafeAreaProvider>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  // Header flottant
  headerNatif: {
    position: 'absolute', top: 12, left: 15,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.90)', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10, shadowRadius: 8, elevation: 8, zIndex: 10,
  },
  logoApp: { width: 28, height: 28, marginRight: 8, resizeMode: 'contain' },
  titreGrandPaname: { fontSize: 18, fontFamily: 'GrandParis-Medium', color: '#25303b' },

  // Barre de recherche (bottom, dynamique)
  bottomSearchBar: {
    position: 'absolute',
    left: '6%', right: '6%',
    height: SEARCH_BAR_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderRadius: 30,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 16, zIndex: 9998,
  },
  boutonGpsBarre: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f1f2f6', alignItems: 'center', justifyContent: 'center',
  },
  searchContainer: { flex: 1, position: 'relative', justifyContent: 'center' },
  searchInput: {
    backgroundColor: '#f1f2f6', height: 40, borderRadius: 20,
    paddingHorizontal: 15, paddingRight: 36,
    fontSize: 15, color: '#2c3e50', fontFamily: 'GrandParis-Light',
  },

  // Résultats (bottom, dynamique)
  searchResultsContainer: {
    position: 'absolute', left: '6%', right: '6%',
    backgroundColor: 'white', borderRadius: 16, maxHeight: 280,
    zIndex: 999, elevation: 10,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, overflow: 'hidden',
  },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#f1f2f6', paddingHorizontal: 15,
  },
  searchResultText: { fontSize: 15, color: '#25303b', fontFamily: 'GrandParis-Medium' },
  etoileAction: { padding: 10 },

  // Tiroir
  titreTiroir: { fontSize: 20, fontFamily: 'GrandParis-Bold', color: '#25303b', marginBottom: 4 },
  sousTitreTiroir: { fontSize: 13, fontFamily: 'GrandParis-Light', color: '#7f8c8d', marginBottom: 20 },
  etatVide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  etatVideEmoji: { fontSize: 44, marginBottom: 14 },
  etatVideTitre: { fontSize: 17, fontFamily: 'GrandParis-Bold', color: '#25303b', marginBottom: 8, textAlign: 'center' },
  etatVideDesc: { fontSize: 14, fontFamily: 'GrandParis-Light', color: '#7f8c8d', textAlign: 'center', lineHeight: 22 },
  itemFavoriNatif: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FFFFFF', padding: 14, borderRadius: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(210,218,230,0.8)',
    shadowColor: '#1a2a4a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  alignementFavori: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconGare: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#e3f2fd', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  texteNomGareFavori: { fontSize: 15, fontFamily: 'GrandParis-Medium', color: '#2c3e50', flex: 1 },
  actionsItemFavori: { flexDirection: 'row', alignItems: 'center' },
  boutonSupprimerFavori: { padding: 4 },
  cardContent: { flex: 1, alignItems: 'center', paddingTop: 20 },
  cardTitle: { fontSize: 26, fontFamily: 'GrandParis-Bold', color: '#2c3e50', marginBottom: 10 },
  cardSubtitle: { fontSize: 16, fontFamily: 'GrandParis-Light', color: '#7f8c8d' },

  // Nav bar
  floatingTabBar: {
    position: 'absolute', bottom: NAV_BAR_BOTTOM, alignSelf: 'center',
    width: '88%', height: NAV_BAR_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.90)', borderRadius: 30,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 16, zIndex: 9999, paddingHorizontal: 6,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabPill: { width: 56, height: 28, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  tabPillActive: { backgroundColor: '#EBEBEB' },
  tabPillCenter: { width: 64, height: 32, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  tabPillCenterActive: { backgroundColor: '#DDEEFF' },
  tabIcon: { fontSize: 20, lineHeight: 26 },
  tabLabel: { fontFamily: 'GrandParis-Medium', fontSize: 10, color: '#8E8E93' },
  tabLabelActive: { color: '#25303b' },

  // Tiroirs latéraux
  sideCard: { position: 'absolute', width: '80%', zIndex: 101, overflow: 'hidden', borderRadius: 24 },
  sideCardLeft: { left: 12 },
  sideCardRight: { right: 12 },
  glassFond: { backgroundColor: '#F0F3F8', borderRadius: 24 },
  glassBordureDroite: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#0d1b2e', shadowOffset: { width: 10, height: 0 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 20,
  },
  glassBordureGauche: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#0d1b2e', shadowOffset: { width: -10, height: 0 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 20,
  },
  cardContentWrapper: { flex: 1, paddingTop: 24, paddingHorizontal: 18, paddingBottom: 16 },

  // Panel gare (bottom sheet natif) — height appliquée en inline (dépend de insets.top)
  garePanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: 24,
  },
  dragZone: {
    height: 30, alignItems: 'center', justifyContent: 'center',
  },
  dragBar: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#d0d5dc',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0f2f5',
  },
  sheetTitreGare: {
    flex: 1, fontSize: 17, fontFamily: 'GrandParis-Bold', color: '#25303b', marginRight: 8,
  },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetBoutonAction: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#f1f2f6', alignItems: 'center', justifyContent: 'center',
  },
  sheetBoutonFermer: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#f1f2f6', alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
});
