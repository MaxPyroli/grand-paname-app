import React, { useRef, useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, FlatList, TextInput, Keyboard, Image, Animated, Dimensions, LayoutChangeEvent } from 'react-native';
import { useFonts } from 'expo-font'; 
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';

// ─── CONSTANTES DE LAYOUT ────────────────────────────────────────────────────
const NAV_BAR_BOTTOM = 16;
const NAV_BAR_HEIGHT = 58; // plus compact

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Gare = { id: string; label: string };
type FavorisProps = {
  favoris: Gare[];
  onSupprimerFavori: (gare: Gare) => void;
  onSelectionnerGare: (id: string, label: string) => void;
};
type RechercheProps = {
  favoris: Gare[];
  onBasculerFavori: (gare: Gare) => void;
  estFavori: (id: string) => boolean;
  onHeaderLayout: (height: number) => void;
  naviguerVersGareRef: React.MutableRefObject<((id: string, label: string) => void) | null>;
};

// ─── ÉCRAN RECHERCHE ─────────────────────────────────────────────────────────
function RechercheScreen({ favoris, onBasculerFavori, estFavori, onHeaderLayout, naviguerVersGareRef }: RechercheProps) {
  const webViewRef = useRef<WebView>(null);
  const [hauteurHeader, setHauteurHeader] = useState(0); // LIGNE À AJOUTER
  const APP_URL = process.env.EXPO_PUBLIC_APP_URL || ''; 
  const [loadingGps, setLoadingGps] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Gare[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [gareCourante, setGareCourante] = useState<string | null>(null); // NOUVELLE LIGNE

  useEffect(() => {
    (async () => { await Location.requestForegroundPermissionsAsync(); })();
  }, []);

  const selectionnerGareEtChargerPage = useCallback((gareId: string, gareLabel: string) => {
    Keyboard.dismiss(); 
    setSearchQuery(""); 
    setSearchResults([]);

    // ✂️ LIGNE AJOUTÉE : On coupe le texte avant la parenthèse et on enlève les espaces
    const nomPropre = gareLabel.split('(')[0].trim();
    setGareCourante(nomPropre); 

    const nomEncode = encodeURIComponent(gareLabel);
    const urlTarget = `${APP_URL}?selectionned_stop_id=${gareId}&selectionned_stop_name=${nomEncode}&t=${Date.now()}`;
    webViewRef.current?.injectJavaScript(`window.location.href = "${urlTarget}"; true;`);
  }, [APP_URL]);

  const retourAccueil = () => {
    setGareCourante(null);
    webViewRef.current?.injectJavaScript(`window.location.href = "${APP_URL}"; true;`);
  };

  // On expose selectionnerGareEtChargerPage via le ref pour que App puisse l'appeler depuis FavorisScreen
  useEffect(() => {
    naviguerVersGareRef.current = selectionnerGareEtChargerPage;
  }, [selectionnerGareEtChargerPage]);

  const forcerActualisation = () => {
    webViewRef.current?.injectJavaScript(`location.reload(); true;`);
  };

  const basculerSidebar = () => {
    Keyboard.dismiss();
    webViewRef.current?.injectJavaScript(`
      var btnOpen = document.querySelector('[data-testid="collapsedControl"]');
      if (btnOpen) { btnOpen.click(); } 
      else { var btnClose = document.querySelector('section[data-testid="stSidebar"] button'); if (btnClose) btnClose.click(); }
      true;
    `);
  };

  const rechercherGare = async (texte: string) => {
    setSearchQuery(texte);
    if (texte.length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const apiFastApiUrl = APP_URL.replace("8501", "8000");
      const response = await fetch(`${apiFastApiUrl}/api/search?q=${texte}`);
      const json = await response.json();
      setSearchResults(json.results?.length > 0 ? json.results : [{ id: "vide", label: "Aucune gare trouvée 😕" }]);
    } catch {
      setSearchResults([{ id: "erreur", label: "⚠️ Impossible de joindre le serveur" }]);
    } finally { setIsSearching(false); }
  };

  const declarerClicGpsNatif = async () => {
    Keyboard.dismiss(); setSearchQuery(""); setIsSearching(true);
    try {
      setLoadingGps(true);
      let location = await Location.getLastKnownPositionAsync();
      if (!location) location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const lat = location!.coords.latitude;
      const lon = location!.coords.longitude;
      const apiFastApiUrl = APP_URL.replace("8501", "8000");
      const response = await fetch(`${apiFastApiUrl}/api/nearby?lat=${lat}&lon=${lon}`);
      const json = await response.json();
      setSearchResults(json.results?.length > 0 ? json.results : [{ id: "vide", label: "Aucun arrêt dans un rayon de 1.5km 😕" }]);
    } catch {
      setSearchResults([{ id: "erreur", label: "⚠️ Impossible de géolocaliser ou joindre le serveur" }]);
    } finally { setLoadingGps(false); setIsSearching(false); }
  };

  const injecterEcouteurClic = `
    // 🛡️ ASSASSINAT DU TITRE WEB : Coche la case "display: none" de force
    const style = document.createElement('style');
    style.innerHTML = '.sticky-station-title, .station-title { display: none !important; }';
    document.head.appendChild(style);
    document.body.style.paddingTop = "${hauteurHeader}px"; // LIGNE À AJOUTER
    document.addEventListener('click', function(event) {
      let target = event.target;
      while (target && target !== document) {
        if (target.tagName === 'BUTTON' && target.innerText && target.innerText.includes('Me localiser')) {
          event.preventDefault(); event.stopPropagation();
          window.ReactNativeWebView.postMessage("CLIC_LOCALISER");
          return;
        }
        target = target.parentNode;
      }
    }, true);
    true;
  `;

  const gererMessageWeb = async (event: any) => {
    if (event.nativeEvent.data === "CLIC_LOCALISER") {
      try {
        setLoadingGps(true);
        let location = await Location.getLastKnownPositionAsync();
        if (!location) location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        const lat = location!.coords.latitude;
        const lon = location!.coords.longitude;
        webViewRef.current?.injectJavaScript(`window.location.href = "${APP_URL}?lat=${lat}&lon=${lon}&t=${Date.now()}"; true;`);
      } catch {} finally { setLoadingGps(false); }
    }
  };

  return (
    <View style={styles.container}>
      {/* onLayout mesure la hauteur réelle du header (height + y = position absolue du bas du header) */}
      <View
        style={styles.headerNatif}
        onLayout={(e: LayoutChangeEvent) => {
          const { y, height } = e.nativeEvent.layout;
          onHeaderLayout(y + height);
          setHauteurHeader(y + height); // LIGNE À AJOUTER
        }}
      >
        {/* --- HEADER PRINCIPAL FIXE --- */}
        <View style={styles.headerPremiereLigne}>
          <View style={styles.titleContainer}>
            <Image source={require('./assets/app_icon.png')} style={styles.logoApp} />
            <Text style={styles.titreGrandPaname}>Grand Paname</Text>
          </View>
          <View style={styles.headerBoutonsDroite}>
            <TouchableOpacity style={styles.boutonActualiser} onPress={forcerActualisation}>
              <Text style={{fontSize: 18, marginRight: 10}}>🔄</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.boutonMenu} onPress={basculerSidebar}>
              <Text style={{fontSize: 22}}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.headerDeuxiemeLigne}>
          <TouchableOpacity style={styles.boutonGpsBarre} onPress={declarerClicGpsNatif}>
            <Text style={{fontSize: 18}}>📍</Text>
          </TouchableOpacity>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput} placeholder="Rechercher une gare..."
              value={searchQuery} onChangeText={rechercherGare} placeholderTextColor="#7f8c8d" autoCorrect={false}
            />
            {isSearching && <ActivityIndicator style={{position: 'absolute', right: 10}} size="small" color="#3498db" />}
          </View>
        </View>
      </View>

      {/* ✨ NOUVEAU : LE BADGE FLOTTANT DE LA STATION ✨ */}
      {gareCourante && (
        <View style={styles.badgeStationFlottant}>
          <TouchableOpacity onPress={retourAccueil} style={{ paddingRight: 10 }}>
            <Text style={{ fontSize: 20 }}>⬅️</Text>
          </TouchableOpacity>
          <Text style={styles.texteBadgeStation} numberOfLines={1}>
            {gareCourante}
          </Text>
        </View>
      )}

      <View style={styles.coque}>
        {searchResults.length > 0 && (
          <View style={styles.searchResultsContainer}>
            <FlatList
              data={searchResults} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <View style={styles.searchResultRow}>
                  <TouchableOpacity
                    style={{flex: 1, paddingVertical: 15}}
                    onPress={() => { if (item.id !== "erreur" && item.id !== "vide") selectionnerGareEtChargerPage(item.id, item.label); }}
                  >
                    <Text style={styles.searchResultText}>{item.label}</Text>
                  </TouchableOpacity>
                  {item.id !== "erreur" && item.id !== "vide" && (
                    <TouchableOpacity style={styles.etoileAction} onPress={() => onBasculerFavori(item)}>
                      <Text style={{fontSize: 22}}>{estFavori(item.id) ? '⭐' : '☆'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          </View>
        )}
        <WebView
          ref={webViewRef} source={{ uri: APP_URL }} javaScriptEnabled={true}
          domStorageEnabled={true} startInLoadingState={true}
          injectedJavaScript={injecterEcouteurClic} onMessage={gererMessageWeb}
        />
        {loadingGps && (
          <View style={styles.chargementFlottant}>
            <ActivityIndicator size="large" color="#3498db" />
          </View>
        )}
      </View>
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
          data={favoris} keyExtractor={(item) => item.id}
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
export default function App() {
  const [activeTab, setActiveTab] = useState<'accueil' | 'favoris' | 'assistant'>('accueil');
  const [favoris, setFavoris] = useState<Gare[]>([]);
  // Hauteur du header mesurée dynamiquement via onLayout
  const [headerHeight, setHeaderHeight] = useState(0);
  const webViewNavRef = useRef<((id: string, label: string) => void) | null>(null);

  const [fontsLoaded] = useFonts({
    'GrandParis-Light': require('./assets/GrandParis-Light.otf'),
    'GrandParis': require('./assets/GrandParis.otf'),
    'GrandParis-Medium': require('./assets/GrandParis-Medium.otf'),
    'GrandParis-Bold': require('./assets/GrandParis-Bold.otf'),
  });

  const screenWidth = Dimensions.get('window').width;
  const slideAnim = useRef(new Animated.Value(screenWidth)).current;
  const [lastTab, setLastTab] = useState<'favoris' | 'assistant'>('favoris');

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('@grand_paname_favoris');
        if (stored) setFavoris(JSON.parse(stored));
      } catch (e) { console.log("Erreur chargement favoris", e); }
    })();
  }, []);

  const sauvegarderFavoris = async (nouveauxFavoris: Gare[]) => {
    try { await AsyncStorage.setItem('@grand_paname_favoris', JSON.stringify(nouveauxFavoris)); }
    catch (e) { console.log("Erreur sauvegarde", e); }
  };

  const basculerFavori = useCallback((gare: Gare) => {
    setFavoris(prev => {
      const index = prev.findIndex(f => f.id === gare.id);
      const nouveaux = index > -1 ? prev.filter(f => f.id !== gare.id) : [...prev, { id: gare.id, label: gare.label }];
      sauvegarderFavoris(nouveaux);
      return nouveaux;
    });
  }, []);

  const estFavori = useCallback((id: string) => favoris.some(f => f.id === id), [favoris]);

  const selectionnerDepuisFavoris = useCallback((id: string, label: string) => {
    setActiveTab('accueil');
    // Léger délai pour laisser l'animation de fermeture démarrer avant d'injecter l'URL
    setTimeout(() => { if (webViewNavRef.current) webViewNavRef.current(id, label); }, 50);
  }, []);

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

  // Le tiroir commence juste sous le header mesuré, et finit juste au-dessus de la nav bar
  const tiroirTop = headerHeight + 8;
  const tiroirBottom = NAV_BAR_BOTTOM + NAV_BAR_HEIGHT + 8;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />

        <RechercheScreen
          favoris={favoris}
          onBasculerFavori={basculerFavori}
          estFavori={estFavori}
          onHeaderLayout={setHeaderHeight}
          naviguerVersGareRef={webViewNavRef}
        />

        {/* Fond sombre quand un tiroir est ouvert */}
        {activeTab !== 'accueil' && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setActiveTab('accueil')} />
            </BlurView>
          </View>
        )}

        {/* ── Tiroir latéral — flotte entre header mesuré et nav bar ── */}
        {headerHeight > 0 && (
          <Animated.View style={[
            styles.sideCard,
            lastTab === 'favoris' ? styles.sideCardLeft : styles.sideCardRight,
            { top: tiroirTop, bottom: tiroirBottom, transform: [{ translateX: slideAnim }] }
          ]}>
            <View style={[
              StyleSheet.absoluteFill,
              styles.glassFond,
              lastTab === 'favoris' ? styles.glassBordureDroite : styles.glassBordureGauche
            ]} />
            <View style={styles.cardContentWrapper}>
              {lastTab === 'favoris' && (
                <FavorisScreen favoris={favoris} onSupprimerFavori={basculerFavori} onSelectionnerGare={selectionnerDepuisFavoris} />
              )}
              {lastTab === 'assistant' && <AssistantScreen />}
            </View>
          </Animated.View>
        )}

        {/* ── Barre de navigation One UI claire ── */}
        <View style={styles.floatingTabBar}>

          {/* Favoris */}
          <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('favoris')}>
            <View style={[styles.tabPill, activeTab === 'favoris' && styles.tabPillActive]}>
              <Text style={styles.tabIcon}>{activeTab === 'favoris' ? '⭐' : '☆'}</Text>
            </View>
            <Text style={[styles.tabLabel, activeTab === 'favoris' && styles.tabLabelActive]}>Favoris</Text>
          </TouchableOpacity>

          {/* Accueil */}
          <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('accueil')}>
            <View style={[styles.tabPill, styles.tabPillCenter, activeTab === 'accueil' && styles.tabPillCenterActive]}>
              <Text style={[styles.tabIcon, { fontSize: 22 }]}>🚇</Text>
            </View>
            <Text style={[styles.tabLabel, activeTab === 'accueil' && styles.tabLabelActive]}>Accueil</Text>
          </TouchableOpacity>

          {/* Pana */}
          <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('assistant')}>
            <View style={[styles.tabPill, activeTab === 'assistant' && styles.tabPillActive]}>
              <Text style={styles.tabIcon}>{activeTab === 'assistant' ? '🤖' : '💬'}</Text>
            </View>
            <Text style={[styles.tabLabel, activeTab === 'assistant' && styles.tabLabelActive]}>Pana</Text>
          </TouchableOpacity>

        </View>

      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  headerNatif: {
    position: 'absolute', // LIGNE AJOUTÉE
    top: 0,               // LIGNE AJOUTÉE
    left: 0,              // LIGNE AJOUTÉE
    right: 0,             // LIGNE AJOUTÉE
    paddingHorizontal: 15, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.75)',
    elevation: 3, zIndex: 10,
  },
  headerPremiereLigne: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  headerDeuxiemeLigne: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  headerBoutonsDroite: { flexDirection: 'row', alignItems: 'center' },
  titleContainer: { flexDirection: 'row', alignItems: 'center' },
  logoApp: { width: 35, height: 35, marginRight: 8, resizeMode: 'contain' },
  titreGrandPaname: { fontSize: 25, fontFamily: 'GrandParis-Medium', color: '#25303b' },
  boutonGpsBarre: { padding: 8, backgroundColor: '#f1f2f6', borderRadius: 20, marginRight: 8, width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  searchContainer: { flex: 1, position: 'relative', justifyContent: 'center' },
  searchInput: { backgroundColor: '#f1f2f6', height: 40, borderRadius: 20, paddingHorizontal: 15, fontSize: 16, color: '#2c3e50', fontFamily: 'GrandParis-Light' },
  boutonActualiser: { padding: 5 },
  boutonFavoris: { padding: 5 },
  boutonMenu: { padding: 5 },
searchResultsContainer: { 
    position: 'absolute', 
    top: 90, // MODIFIÉ : 90 au lieu de 5 pour s'afficher sous le header
    left: 15, right: 15, backgroundColor: 'white', borderRadius: 10, maxHeight: 300, zIndex: 999, elevation: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 
  },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f2f6', paddingHorizontal: 15 },
  searchResultText: { fontSize: 16, color: '#25303b', fontFamily: 'GrandParis-Medium' },
  etoileAction: { padding: 10 },
  coque: { flex: 1, position: 'relative' },
  chargementFlottant: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 10 },

  // ─ Tiroir textes
  titreTiroir: { fontSize: 20, fontFamily: 'GrandParis-Bold', color: '#25303b', marginBottom: 4 },
  sousTitreTiroir: { fontSize: 13, fontFamily: 'GrandParis-Light', color: '#7f8c8d', marginBottom: 20 },

  // ─ État vide
  etatVide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  etatVideEmoji: { fontSize: 44, marginBottom: 14 },
  etatVideTitre: { fontSize: 17, fontFamily: 'GrandParis-Bold', color: '#25303b', marginBottom: 8, textAlign: 'center' },
  etatVideDesc: { fontSize: 14, fontFamily: 'GrandParis-Light', color: '#7f8c8d', textAlign: 'center', lineHeight: 22 },

  // ─ Items favoris
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

  // ─ Placeholder assistant
  cardContent: { flex: 1, alignItems: 'center', paddingTop: 20 },
  cardTitle: { fontSize: 26, fontFamily: 'GrandParis-Bold', color: '#2c3e50', marginBottom: 10 },
  cardSubtitle: { fontSize: 16, fontFamily: 'GrandParis-Light', color: '#7f8c8d' },

  // ─── BARRE DE NAVIGATION ONE UI CLAIRE ───────────────────────────────────
  floatingTabBar: {
    position: 'absolute',
    bottom: NAV_BAR_BOTTOM,
    alignSelf: 'center',
    width: '88%',
    height: NAV_BAR_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
    zIndex: 9999,
    paddingHorizontal: 6,
  },

  // Chaque onglet (colonne icône + label)
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },

  // Pilule latérale (Favoris / Pana) — dimensions fixes pour que borderRadius marche sur Android
  tabPill: {
    width: 56,
    height: 28,
    borderRadius: 14,          // = height/2 → cercle parfait garanti
    overflow: 'hidden',        // clip Android
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tabPillActive: {
    backgroundColor: '#EBEBEB',
  },

  // Pilule centrale Accueil — même logique, légèrement plus large, SANS fond au repos
  tabPillCenter: {
    width: 64,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent', // invisible au repos
  },
  tabPillCenterActive: {
    backgroundColor: '#DDEEFF',     // bleu doux seulement quand actif
  },

  tabIcon: {
    fontSize: 20,
    lineHeight: 26,
  },
  tabLabel: {
    fontFamily: 'GrandParis-Medium',
    fontSize: 10,
    color: '#8E8E93',
  },
  tabLabelActive: {
    color: '#25303b',
  },

  // ─── TIROIRS LATÉRAUX ─────────────────────────────────────────────────────
  sideCard: {
    position: 'absolute',
    width: '80%',
    zIndex: 101,
    overflow: 'hidden',
    borderRadius: 24,
  },
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
  badgeStationFlottant: {
    position: 'absolute',
    top: 95, // Ajuste ce chiffre selon la hauteur exacte de ton header
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.90)', // Effet semi-transparent
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    zIndex: 99,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  texteBadgeStation: {
    fontSize: 18,
    fontWeight: '900',
    color: '#041b3b',
    textTransform: 'uppercase',
  },
});
