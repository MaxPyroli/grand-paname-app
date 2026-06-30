import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, FlatList, TextInput, Keyboard, Image, Animated, Dimensions, LayoutChangeEvent } from 'react-native';
import { useFonts } from 'expo-font';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// ─── CONSTANTES DE LAYOUT ────────────────────────────────────────────────────
const NAV_BAR_BOTTOM = 16;
const NAV_BAR_HEIGHT = 58;

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

// ─── ÉCRAN D'ACCUEIL : CARTE NATIVE + RECHERCHE ───────────────────────────────
// La WebView ne vit plus ici : cet écran ne s'occupe que de trouver une gare
// (recherche, GPS, ou plus tard un tap sur la carte) et de prévenir le parent.
function AccueilScreen({ favoris, onBasculerFavori, estFavori, onHeaderLayout, onGareChoisie }: AccueilProps) {
  const [loadingGps, setLoadingGps] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Gare[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const APP_URL = process.env.EXPO_PUBLIC_APP_URL || '';

  useEffect(() => {
    (async () => { await Location.requestForegroundPermissionsAsync(); })();
  }, []);

  const choisirGare = (gareId: string, gareLabel: string) => {
    Keyboard.dismiss();
    setSearchQuery("");
    setSearchResults([]);
    onGareChoisie(gareId, gareLabel);
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

  return (
    <View style={styles.container}>
      {/* ── Réservation future : carte native react-native-maps ── */}
      {/* Pour l'instant un simple placeholder. À remplacer par :
          <MapView style={StyleSheet.absoluteFill} ... /> avec les marqueurs de gares. */}
      <View style={styles.cartePlaceholder}>
        <Text style={styles.cartePlaceholderEmoji}>🗺️</Text>
        <Text style={styles.cartePlaceholderTexte}>Carte interactive — bientôt disponible</Text>
      </View>

      {/* onLayout mesure la hauteur réelle du header (height + y = position absolue du bas du header) */}
      <View
        style={styles.headerNatif}
        onLayout={(e: LayoutChangeEvent) => {
          const { y, height } = e.nativeEvent.layout;
          onHeaderLayout(y + height);
        }}
      >
        <View style={styles.headerPremiereLigne}>
          <View style={styles.titleContainer}>
            <Image source={require('./assets/app_icon.png')} style={styles.logoApp} />
            <Text style={styles.titreGrandPaname}>Grand Paname</Text>
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

      {searchResults.length > 0 && (
        <View style={styles.searchResultsContainer}>
          <FlatList
            data={searchResults} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View style={styles.searchResultRow}>
                <TouchableOpacity
                  style={{flex: 1, paddingVertical: 15}}
                  onPress={() => { if (item.id !== "erreur" && item.id !== "vide") choisirGare(item.id, item.label); }}
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

      {loadingGps && (
        <View style={styles.chargementFlottant}>
          <ActivityIndicator size="large" color="#3498db" />
        </View>
      )}
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
  const [headerHeight, setHeaderHeight] = useState(0);

  // ── Gestion de la gare actuellement affichée dans le bottom sheet
  const [gareActuelle, setGareActuelle] = useState<{ id: string; label: string } | null>(null);
  const webViewRef = useRef<WebView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const APP_URL = process.env.EXPO_PUBLIC_APP_URL || '';

  // Points d'ancrage du bottom sheet : fermé (caché), mi-hauteur, plein écran
  const snapPoints = useMemo(() => ['1%', '50%', '92%'], []);

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

  // ── Choix d'une gare : depuis recherche, GPS, ou favoris → ouvre/met à jour le bottom sheet
  const ouvrirGareDansBottomSheet = useCallback((id: string, label: string) => {
    const dejaOuverte = gareActuelle?.id === id;
    setGareActuelle({ id, label });

    const nomEncode = encodeURIComponent(label);
    const urlTarget = `${APP_URL}?selectionned_stop_id=${id}&selectionned_stop_name=${nomEncode}&t=${Date.now()}`;

    if (dejaOuverte) {
      // Même gare déjà affichée : on remonte juste le sheet si besoin
      webViewRef.current?.injectJavaScript(`window.location.href = "${urlTarget}"; true;`);
    } else {
      // Nouvelle gare : la WebView va se recharger via sa prop source (voir plus bas)
    }
    bottomSheetRef.current?.snapToIndex(2); // ouverture en plein écran
  }, [gareActuelle, APP_URL]);

  const selectionnerDepuisFavoris = useCallback((id: string, label: string) => {
    setActiveTab('accueil');
    setTimeout(() => ouvrirGareDansBottomSheet(id, label), 50);
  }, [ouvrirGareDansBottomSheet]);

  const fermerBottomSheet = useCallback(() => {
    bottomSheetRef.current?.close();
  }, []);

  const rechargerWebView = () => {
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

  // URL ciblée que la WebView du bottom sheet doit charger
  const urlGareActuelle = gareActuelle
    ? `${APP_URL}?selectionned_stop_id=${gareActuelle.id}&selectionned_stop_name=${encodeURIComponent(gareActuelle.label)}&t=${Date.now()}`
    : APP_URL;

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

  const tiroirTop = headerHeight + 8;
  const tiroirBottom = NAV_BAR_BOTTOM + NAV_BAR_HEIGHT + 8;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top', 'left', 'right']}>
          <StatusBar style="dark" />

          <AccueilScreen
            favoris={favoris}
            onBasculerFavori={basculerFavori}
            estFavori={estFavori}
            onHeaderLayout={setHeaderHeight}
            onGareChoisie={ouvrirGareDansBottomSheet}
          />

          {/* Fond sombre quand un tiroir latéral est ouvert */}
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

          {/* ── Bottom Sheet : remonte depuis le bas quand une gare est choisie ── */}
          <BottomSheet
            ref={bottomSheetRef}
            index={-1}
            snapPoints={snapPoints}
            enablePanDownToClose={true}
            backdropComponent={(props) => (
              <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={1} opacity={0.35} pressBehavior="close" />
            )}
            handleIndicatorStyle={styles.bottomSheetHandle}
            backgroundStyle={styles.bottomSheetFond}
            onClose={() => setGareActuelle(null)}
          >
            <BottomSheetView style={{ flex: 1 }}>
              {/* En-tête du sheet : nom de la gare + actions rapides */}
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitreGare} numberOfLines={1}>
                  {gareActuelle?.label.split('(')[0].trim() || ''}
                </Text>
                <View style={styles.sheetActions}>
                  <TouchableOpacity style={styles.sheetBoutonAction} onPress={rechargerWebView}>
                    <Text style={{ fontSize: 16 }}>🔄</Text>
                  </TouchableOpacity>
                  {gareActuelle && (
                    <TouchableOpacity
                      style={styles.sheetBoutonAction}
                      onPress={() => basculerFavori({ id: gareActuelle.id, label: gareActuelle.label })}
                    >
                      <Text style={{ fontSize: 16 }}>{estFavori(gareActuelle.id) ? '⭐' : '☆'}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.sheetBoutonAction} onPress={basculerSidebar}>
                    <Text style={{ fontSize: 16 }}>⚙️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.sheetBoutonFermer} onPress={fermerBottomSheet}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#7f8c8d' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* La WebView Streamlit : carte + départs de la gare choisie */}
              <View style={{ flex: 1 }}>
                {gareActuelle ? (
                  <WebView
                    ref={webViewRef}
                    source={{ uri: urlGareActuelle }}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    startInLoadingState={true}
                  />
                ) : (
                  <View style={{ flex: 1 }} />
                )}
              </View>
            </BottomSheetView>
          </BottomSheet>

        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  // ─ Placeholder carte (réservé pour react-native-maps)
  cartePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E8ECF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartePlaceholderEmoji: { fontSize: 42, marginBottom: 10, opacity: 0.5 },
  cartePlaceholderTexte: { fontFamily: 'GrandParis-Medium', fontSize: 14, color: '#9aa5b1' },

  headerNatif: {
    paddingHorizontal: 15, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.82)',
    elevation: 3, zIndex: 10,
  },
  headerPremiereLigne: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  headerDeuxiemeLigne: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  titleContainer: { flexDirection: 'row', alignItems: 'center' },
  logoApp: { width: 35, height: 35, marginRight: 8, resizeMode: 'contain' },
  titreGrandPaname: { fontSize: 25, fontFamily: 'GrandParis-Medium', color: '#25303b' },
  boutonGpsBarre: { padding: 8, backgroundColor: '#f1f2f6', borderRadius: 20, marginRight: 8, width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  searchContainer: { flex: 1, position: 'relative', justifyContent: 'center' },
  searchInput: { backgroundColor: '#f1f2f6', height: 40, borderRadius: 20, paddingHorizontal: 15, fontSize: 16, color: '#2c3e50', fontFamily: 'GrandParis-Light' },
  searchResultsContainer: { position: 'absolute', top: 110, left: 15, right: 15, backgroundColor: 'white', borderRadius: 10, maxHeight: 300, zIndex: 999, elevation: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f2f6', paddingHorizontal: 15 },
  searchResultText: { fontSize: 16, color: '#25303b', fontFamily: 'GrandParis-Medium' },
  etoileAction: { padding: 10 },
  chargementFlottant: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.4)', zIndex: 10 },

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
    position: 'absolute', bottom: NAV_BAR_BOTTOM, alignSelf: 'center',
    width: '88%', height: NAV_BAR_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: 30,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12,
    elevation: 16, zIndex: 9999, paddingHorizontal: 6,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabPill: {
    width: 56, height: 28, borderRadius: 14, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },
  tabPillActive: { backgroundColor: '#EBEBEB' },
  tabPillCenter: {
    width: 64, height: 32, borderRadius: 16, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },
  tabPillCenterActive: { backgroundColor: '#DDEEFF' },
  tabIcon: { fontSize: 20, lineHeight: 26 },
  tabLabel: { fontFamily: 'GrandParis-Medium', fontSize: 10, color: '#8E8E93' },
  tabLabelActive: { color: '#25303b' },

  // ─── TIROIRS LATÉRAUX ─────────────────────────────────────────────────────
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

  // ─── BOTTOM SHEET (gare sélectionnée) ─────────────────────────────────────
  bottomSheetFond: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  bottomSheetHandle: {
    backgroundColor: '#d0d5dc',
    width: 40,
    height: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f5',
  },
  sheetTitreGare: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'GrandParis-Bold',
    color: '#25303b',
    marginRight: 10,
  },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetBoutonAction: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#f1f2f6',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetBoutonFermer: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#f1f2f6',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
});