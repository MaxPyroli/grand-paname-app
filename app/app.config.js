// app.config.js plutôt qu'app.json : on a besoin de logique dynamique pour
// distinguer le build "dev" (installé à côté de la version publique sur le
// téléphone, avec son propre identifiant d'app) du build de production.
// EAS Build renseigne automatiquement EAS_BUILD_PROFILE avec le nom du
// profil eas.json utilisé (development / preview / production). En local
// (expo start, expo run:android sans EAS), cette variable n'existe pas — on
// considère alors qu'on est en dev par défaut.
const IS_DEV = (process.env.EAS_BUILD_PROFILE ?? 'development') === 'development';

const BASE_ID = 'fun.grandpaname.app';
const APP_ID = IS_DEV ? `${BASE_ID}.dev` : BASE_ID;

export default {
  expo: {
    name: IS_DEV ? 'Grand Paname Dev' : 'Grand Paname',
    slug: 'grand-paname',
    version: '3.1.2',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/splash_icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: APP_ID,
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'Grand Paname utilise votre position pour afficher les gares et arrêts proches.',
        NSLocationAlwaysAndWhenInUseUsageDescription: 'Grand Paname utilise votre position pour afficher les gares et arrêts proches.',
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      versionCode: 30102,
      // google-services.json est gitignore (pas commité) donc EAS Build ne le
      // voit pas nativement — on le fournit via une variable d'environnement
      // EAS de type "fichier" (GOOGLE_SERVICES_JSON), qui pointe vers un
      // chemin temporaire au moment du build. En local, on retombe sur le
      // fichier du repo.
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: APP_ID,
      permissions: [
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.MODIFY_AUDIO_SETTINGS',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-font',
      'expo-video',
      [
        'expo-audio',
        {
          microphonePermission: false,
          recordAudioAndroid: false,
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            enableMultiDex: true,
          },
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'Grand Paname utilise votre position pour afficher les gares et arrêts proches.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
          color: '#ffffff',
        },
      ],
    ],
    extra: {
      eas: {
        projectId: '5cdd5f6c-cf74-4b17-8c74-c347c0b6e301',
      },
    },
  },
};
