import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig';
import { APP_VERSION } from './constants';
import { logger } from './logger';

// Comportement d'affichage quand une notif arrive alors que l'app est ouverte
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function firebaseApp(): FirebaseApp {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

async function saveTokenToFirestore(token: string) {
  try {
    const db = getFirestore(firebaseApp());
    // Le token sert d'ID de doc : ré-enregistrer le même appareil met juste à
    // jour la ligne existante au lieu d'en créer une nouvelle à chaque lancement.
    await setDoc(doc(db, 'pushTokens', token), {
      token,
      platform: Platform.OS,
      appVersion: APP_VERSION,
      updatedAt: serverTimestamp(),
    });
  } catch (e: any) {
    logger.warn(`saveTokenToFirestore: ${e?.message}`);
  }
}

// Demande la permission, récupère le token Expo Push de cet appareil et
// l'enregistre dans Firestore. Renvoie null si refusé/indisponible (Expo Go,
// simulateur, pas de projectId, etc.) sans jamais faire planter l'app.
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') {
      logger.info('Notifications : permission refusée');
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      logger.warn('Notifications : projectId EAS introuvable');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await saveTokenToFirestore(token);
    logger.info('Notifications : token enregistré');
    return token;
  } catch (e: any) {
    // Attendu en Expo Go (push distant non supporté) ou avant rebuild natif
    logger.warn(`registerForPushNotificationsAsync: ${e?.message}`);
    return null;
  }
}
