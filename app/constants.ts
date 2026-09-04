import Constants from 'expo-constants';

export const APP_VERSION  = Constants.expoConfig?.version ?? '0.0.0';
export const APP_CODENAME = 'Comté';
export const NAVITIA_BASE = 'https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia';
export const NAVITIA_KEY  = process.env.EXPO_PUBLIC_NAVITIA_KEY ?? '';
// CARTO a fermé l'accès anonyme à ses tuiles de fond de carte (basemaps.
// cartocdn.com) : une clé API est désormais obligatoire, voir MapWebView.tsx.
export const CARTO_API_KEY = process.env.EXPO_PUBLIC_CARTO_API_KEY ?? '';
