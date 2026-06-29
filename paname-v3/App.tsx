import React, { useRef, useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, FlatList, TextInput, Keyboard, Image, Animated, Dimensions } from 'react-native';
import { useFonts } from 'expo-font'; 
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur'; // Le secret pour l'effet One UI translucide

function RechercheScreen() {
  const webViewRef = useRef<WebView>(null);
  const APP_URL = process.env.EXPO_PUBLIC_APP_URL || ''; 
  const [loadingGps, setLoadingGps] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [favoris, setFavoris] = useState<any[]>([]);
  const [afficherFavoris, setAfficherFavoris] = useState(false);

  useEffect(() => {
    (async () => {
      await Location.requestForegroundPermissionsAsync();
      chargerFavoris(); 
    })();
  }, []);

  const chargerFavoris = async () => {
    try {
      const stored = await AsyncStorage.getItem('@grand_paname_favoris');
      if (stored) setFavoris(JSON.parse(stored));
    } catch (e) { console.log("Erreur chargement favoris", e); }
  };

  const basculerFavori = async (gare: any) => {
    let nouveauxFavoris = [...favoris];
    const index = nouveauxFavoris.findIndex(f => f.id === gare.id);
    if (index > -1) {
      nouveauxFavoris.splice(index, 1); 
    } else {
      nouveauxFavoris.push({ id: gare.id, label: gare.label }); 
    }
    setFavoris(nouveauxFavoris);
    await AsyncStorage.setItem('@grand_paname_favoris', JSON.stringify(nouveauxFavoris));
  };

  const estFavori = (id: string) => favoris.some(f => f.id === id);

  const forcerActualisation = () => {
    if (webViewRef.current) webViewRef.current.reload();
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

  const selectionnerGareEtChargerPage = (gareId: string, gareLabel: string) => {
    Keyboard.dismiss(); 
    setSearchQuery(""); 
    setSearchResults([]); 
    setAfficherFavoris(false);
    const nomEncode = encodeURIComponent(gareLabel);
    const urlTarget = `${APP_URL}?selectionned_stop_id=${gareId}&selectionned_stop_name=${nomEncode}&t=${Date.now()}`;
    webViewRef.current?.injectJavaScript(`window.location.href = "${urlTarget}"; true;`);
  };

  const rechercherGare = async (texte: string) => {
    setSearchQuery(texte);
    setAfficherFavoris(false); 
    if (texte.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const apiFastApiUrl = APP_URL.replace("8501", "8000");
      const response = await fetch(`${apiFastApiUrl}/api/search?q=${texte}`);
      const json = await response.json();
      if (json.results && json.results.length > 0) {
        setSearchResults(json.results);
      } else {
        setSearchResults([{ id: "vide", label: "Aucune gare trouvée 😕" }]);
      }
    } catch (e) {
      setSearchResults([{ id: "erreur", label: "⚠️ Impossible de joindre le serveur" }]);
    } finally {
      setIsSearching(false);
    }
  };

  const declarerClicGpsNatif = async () => {
    Keyboard.dismiss(); 
    setAfficherFavoris(false); 
    setSearchQuery("");
    setIsSearching(true);
    try {
      setLoadingGps(true); 
      let location = await Location.getLastKnownPositionAsync();
      if (!location) location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      let lat = location!.coords.latitude;
      let lon = location!.coords.longitude;
      
      const apiFastApiUrl = APP_URL.replace("8501", "8000");
      const response = await fetch(`${apiFastApiUrl}/api/nearby?lat=${lat}&lon=${lon}`);
      const json = await response.json();
      if (json.results && json.results.length > 0) {
        setSearchResults(json.results); 
      } else {
        setSearchResults([{ id: "vide", label: "Aucun arrêt dans un rayon de 1.5km 😕" }]);
      }
    } catch (erreur) {
      setSearchResults([{ id: "erreur", label: "⚠️ Impossible de géolocaliser ou joindre le serveur" }]);
    } finally {
      setLoadingGps(false);
      setIsSearching(false);
    }
  };

  const injecterEcouteurClic = `
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
        let lat = location!.coords.latitude;
        let lon = location!.coords.longitude;
        webViewRef.current?.injectJavaScript(`window.location.href = "${APP_URL}?lat=${lat}&lon=${lon}&t=${Date.now()}"; true;`);
      } catch (erreur: any) { } finally { setLoadingGps(false); }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerNatif}>
        <View style={styles.headerPremiereLigne}>
          <View style={styles.titleContainer}>
            <Image source={require('./assets/app_icon.png')} style={styles.logoApp} />
            <Text style={styles.titreGrandPaname}>Grand Paname</Text>
          </View>
          <View style={styles.headerBoutonsDroite}>
            <TouchableOpacity style={styles.boutonFavoris} onPress={() => { Keyboard.dismiss(); setSearchResults([]); setAfficherFavoris(!afficherFavoris); }}>
              <Text style={{fontSize: 22, marginRight: 10}}>⭐</Text>
            </TouchableOpacity>
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

      <View style={styles.coque}>
        {afficherFavoris && (
          <View style={styles.searchResultsContainer}>
            {favoris.length === 0 ? (
              <Text style={{padding: 15, color: '#7f8c8d', textAlign: 'center', fontFamily: 'GrandParis-Light'}}>
                Aucun favori. Cherchez une gare et cliquez sur l'étoile vide pour l'ajouter !
              </Text>
            ) : (
              <FlatList
                data={favoris} keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.searchResultRow}>
                    <TouchableOpacity style={{flex: 1, paddingVertical: 15}} onPress={() => selectionnerGareEtChargerPage(item.id, item.label)}>
                      <Text style={styles.searchResultText}>{item.label}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.etoileAction} onPress={() => basculerFavori(item)}>
                      <Text style={{fontSize: 20}}>⭐</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        )}

        {searchResults.length > 0 && !afficherFavoris && (
          <View style={styles.searchResultsContainer}>
            <FlatList
              data={searchResults} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <View style={styles.searchResultRow}>
                  <TouchableOpacity 
                    style={{flex: 1, paddingVertical: 15}} 
                    onPress={() => { if (item.id !== "erreur" && item.id !== "vide") { selectionnerGareEtChargerPage(item.id, item.label); } }}
                  >
                    <Text style={styles.searchResultText}>{item.label}</Text>
                  </TouchableOpacity>
                  {item.id !== "erreur" && item.id !== "vide" && (
                    <TouchableOpacity style={styles.etoileAction} onPress={() => basculerFavori(item)}>
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
          domStorageEnabled={true} startInLoadingState={true} injectedJavaScript={injecterEcouteurClic} onMessage={gererMessageWeb}
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

function FavorisScreen() {
  return (
    <View style={styles.cardContent}>
      <Text style={styles.cardTitle}>Mes Trajets</Text>
      <Text style={styles.cardSubtitle}>Espace natif en construction 🚧</Text>
    </View>
  );
}

function AssistantScreen() {
  return (
    <View style={styles.cardContent}>
      <Text style={styles.cardTitle}>Pana (Assistant IA)</Text>
      <Text style={styles.cardSubtitle}>Espace de discussion en construction 🚧</Text>
    </View>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'accueil' | 'favoris' | 'assistant'>('accueil');

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
    if (activeTab !== 'accueil') {
      setLastTab(activeTab); // Mémorise quel menu est ouvert
      const startPos = activeTab === 'favoris' ? -screenWidth : screenWidth; // Favoris vient de gauche, Pana de droite
      slideAnim.setValue(startPos);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350, // Vitesse de l'animation
        useNativeDriver: true,
      }).start();
    } else {
      // Pour la fermeture, on le renvoie du côté d'où il venait
      const exitPos = lastTab === 'favoris' ? -screenWidth : screenWidth;
      Animated.timing(slideAnim, {
        toValue: exitPos,
        duration: 350,
        useNativeDriver: true,
      }).start();
    }
  }, [activeTab]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3498db" />
      </View>
    );
  }

  const isModalVisible = activeTab === 'favoris' || activeTab === 'assistant';

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        
        {/* Écran principal (toujours en fond) */}
        <RechercheScreen />

        {/* 1. FOND FLOU GLOBAL (S'affiche si un menu est ouvert) */}
        {activeTab !== 'accueil' && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setActiveTab('accueil')} />
            </BlurView>
          </View>
        )}

        {/* 2. MENU LATÉRAL ANIMÉ ET GLASSMORPHIQUE */}
        <Animated.View style={[
          styles.sideCard,
          lastTab === 'favoris' ? styles.sideCardLeft : styles.sideCardRight,
          { transform: [{ translateX: slideAnim }] }
        ]}>
          {/* C'est ici qu'on fait l'effet Glassmorphism sur le tiroir lui-même ! */}
          <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
          
          <View style={styles.cardContentWrapper}>
            {lastTab === 'favoris' && <FavorisScreen />}
            {lastTab === 'assistant' && <AssistantScreen />}
          </View>
        </Animated.View>

        {/* Barre de navigation flottante personnalisée */}
        <View style={styles.floatingTabBar}>
          <TouchableOpacity 
            style={styles.tabItem} 
            onPress={() => setActiveTab('favoris')}
          >
            <Text style={{ fontSize: 22 }}>{activeTab === 'favoris' ? '⭐' : '☆'}</Text>
            <Text style={[styles.tabLabel, activeTab === 'favoris' && styles.tabLabelActive]}>Favoris</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tabItem, styles.tabItemCenter]} 
            onPress={() => setActiveTab('accueil')}
          >
            <View style={[styles.centerCircle, activeTab === 'accueil' && styles.centerCircleActive]}>
              <Text style={{ fontSize: 24 }}>🚇</Text>
            </View>
            <Text style={[styles.tabLabel, activeTab === 'accueil' && styles.tabLabelActive]}>Accueil</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.tabItem} 
            onPress={() => setActiveTab('assistant')}
          >
            <Text style={{ fontSize: 22 }}>{activeTab === 'assistant' ? '🤖' : '💬'}</Text>
            <Text style={[styles.tabLabel, activeTab === 'assistant' && styles.tabLabelActive]}>Pana</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  headerNatif: { paddingHorizontal: 15, paddingVertical: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e1e8ed', elevation: 3, zIndex: 10 },
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
  searchResultsContainer: { position: 'absolute', top: 5, left: 15, right: 15, backgroundColor: 'white', borderRadius: 10, maxHeight: 300, zIndex: 999, elevation: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f2f6', paddingHorizontal: 15 },
  searchResultText: { fontSize: 16, color: '#25303b', fontFamily: 'GrandParis-Medium' },
  etoileAction: { padding: 10 },
  
  coque: { 
    flex: 1, 
    position: 'relative', 
    // Le paddingBottom a été supprimé ici pour que la carte prenne tout l'écran !
  },
  chargementFlottant: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.7)', zIndex: 10 },

  // --- STYLES ONE UI (Modal / Card / Blur) ---
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end', // Aligner la carte en bas
  },
  bottomCard: {
    backgroundColor: '#ffffff',
    height: '75%', // Hauteur de la carte
    borderTopLeftRadius: 30, // Bords très arrondis
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 110, // Espace pour la barre flottante
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#dfe6e9',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  cardContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 20,
  },
  cardTitle: {
    fontSize: 28,
    fontFamily: 'GrandParis-Bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  cardSubtitle: {
    fontSize: 16,
    fontFamily: 'GrandParis-Light',
    color: '#7f8c8d',
  },

  // --- STYLES BARRE FLOTTANTE (Façon Samsung Health) ---
  floatingTabBar: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center', // Centre la pilule
    width: '85%', // Ne touche plus les bords
    height: 65,
    backgroundColor: 'rgba(255, 255, 255, 0.90)', 
    borderRadius: 35,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 15, // z-index très haut pour rester AU-DESSUS des menus
    zIndex: 9999,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  tabItemCenter: {
    marginTop: -25, // Le bouton central qui déborde légèrement vers le haut
  },
  // On réduit un peu le bouton central pour qu'il ne déborde pas trop
  centerCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f1f2f6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  centerCircleActive: {
    backgroundColor: '#e3f2fd', // Couleur de fond quand l'accueil est actif
  },
  tabLabel: {
    fontFamily: 'GrandParis-Medium',
    fontSize: 10,
    color: '#7f8c8d',
    marginTop: 4,
  },
  tabLabelActive: {
    color: '#3498db', // Bleu quand c'est actif
  },
  // --- STYLES DES TIROIRS LATERAUX ---
  sideCard: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '85%', // Laisse une marge pour voir l'écran derrière
    zIndex: 101, // Sous la barre de navigation
    overflow: 'hidden',
  },
  sideCardLeft: { left: 0, borderTopRightRadius: 30, borderBottomRightRadius: 30 },
  sideCardRight: { right: 0, borderTopLeftRadius: 30, borderBottomLeftRadius: 30 },
  cardContentWrapper: {
    flex: 1,
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 110, // Pousse le texte vers le haut pour ne pas être caché par la barre
  },
});