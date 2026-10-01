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

// Empreinte courte (non cryptographique) : on évite de stocker l'identifiant
// Android brut, on n'a besoin que de reconnaître "le même téléphone".
function empreinte(texte: string): string {
  let h1 = 0x811c9dc5, h2 = 0x9747b28c;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
    h2 ^= h2 >>> 13;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

// Identifie ce téléphone + cette application (l'identifiant Android est stable
// après une réinstallation, mais propre à la clé de signature : la version de
// développement et celle du Play Store restent donc distinctes). Sert à l'outil
// d'envoi (scripts/notifications-ui.js) pour supprimer les anciens jetons d'un
// même téléphone. Import paresseux : si le module natif manque, on n'enregistre
// simplement pas d'empreinte, sans jamais faire planter l'app.
function cleAppareil(): string | null {
  if (Platform.OS !== 'android') return null;
  try {
    const Application = require('expo-application');
    const id: string | null = Application.getAndroidId?.() ?? null;
    if (!id) return null;
    return empreinte(`${id}:${Application.applicationId ?? ''}`);
  } catch {
    return null;
  }
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
      deviceKey: cleAppareil(),
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
      // Catégories de notifications visibles dans les réglages Android de l'app
      // (Réglages > Applications > Grand Paname > Notifications). Les `id` sont
      // ceux à donner en `channelId` à l'envoi (voir scripts/notifications-ui.js) ;
      // le nom affiché peut être changé ici à tout moment (Android met à jour le
      // nom d'une catégorie existante, mais pas son niveau d'importance).
      await Notifications.setNotificationChannelAsync('trafic', {
        name: 'Info Trafic',
        description: 'Perturbations et informations sur le trafic.',
        importance: Notifications.AndroidImportance.HIGH,
      });
      await Notifications.setNotificationChannelAsync('maj', {
        name: 'Mises à jour',
        description: "Nouvelles versions et nouveautés de l'application.",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Autres',
        description: 'Toutes les autres notifications.',
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
