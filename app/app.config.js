// app.config.js plutôt qu'app.json : on a besoin de logique dynamique pour
// distinguer le build "dev" (installé à côté de la version publique sur le
// téléphone, avec son propre identifiant d'app) du build de production.
//
// On lit APP_VARIANT (défini explicitement dans eas.json → env pour chaque
// profil), PAS EAS_BUILD_PROFILE : ce dernier est une variable d'environnement
// interne à l'EAS CLI, invisible pour l'outil de "fingerprint" qu'EAS utilise
// pour décider de réutiliser ou non un build/prebuild en cache. Comme le
// contenu des fichiers ne changeait jamais entre un build dev et un build
// prod (seule EAS_BUILD_PROFILE différait), EAS considérait les deux comme
// identiques et réutilisait le même dossier android/ (et les mêmes
// credentials) entre les deux — d'où des builds de prod signés/packagés
// comme des builds dev. APP_VARIANT étant une valeur littérale dans
// eas.json, elle fait bien partie de l'empreinte du projet.
const IS_DEV = process.env.APP_VARIANT !== 'production';

const BASE_ID = 'fun.grandpaname.app';
const APP_ID = IS_DEV ? `${BASE_ID}.dev` : BASE_ID;

export default {
  expo: {
    name: IS_DEV ? 'Grand Paname Dev' : 'Grand Paname',
    slug: 'grand-paname',
    version: '3.1.3',
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
      versionCode: 30103,
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
            enableProguardInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
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
