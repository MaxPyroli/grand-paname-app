import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseConfig } from './firebaseConfig';
import { APP_VERSION } from './constants';
import { logger } from './logger';
import { concerneLigne } from './notifs';
import type { ModeTrafic } from './traficApi';

// Comportement d'affichage quand une notif arrive alors que l'app est ouverte.
// Alerte trafic : UNIQUEMENT la notification interne de l'app. RIEN du côté du téléphone : ni bannière, ni son, ni entrée
// dans le volet, ni icône dans la barre d'état (décision de l'utilisateur : une copie rangée dans le volet faisait
// doublon). L'alerte reste gardée en mémoire par l'app (voir `ecouterAlerteTraficRecue`).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const alerteTrafic = (notification?.request?.content?.data as any)?.type === 'trafic';
    return {
      shouldPlaySound: !alerteTrafic,
      shouldSetBadge: false,
      shouldShowBanner: !alerteTrafic,
      shouldShowList: !alerteTrafic,
    };
  },
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

// « stable » = l'application du Play Store (fun.grandpaname.app) ; « dev » = la version de développement (suffixe .dev)
// ou Expo Go. Sert à l'outil de gestion (scripts/) pour ne compter que les vrais utilisateurs.
function varianteApp(): 'stable' | 'dev' {
  try {
    const Application = require('expo-application');
    return Application.applicationId === 'fun.grandpaname.app' ? 'stable' : 'dev';
  } catch {
    return 'dev';
  }
}

async function saveTokenToFirestore(token: string) {
  try {
    const db = getFirestore(firebaseApp());
    // Le token sert d'ID de doc : ré-enregistrer le même appareil met juste à
    // jour la ligne existante au lieu d'en créer une nouvelle à chaque lancement.
    // `merge` : ne pas effacer les autres champs du document (ex. `alertesLignes`, les lignes suivies pour les
    // alertes trafic) à chaque lancement de l'app.
    await setDoc(doc(db, 'pushTokens', token), {
      token,
      platform: Platform.OS,
      appVersion: APP_VERSION,
      deviceKey: cleAppareil(),
      variante: varianteApp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
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

// ── Alertes trafic ────────────────────────────────────────────────────────────
// Les lignes que l'utilisateur suit sont gardées sur le téléphone ET dans son document `pushTokens` (champ
// `alertesLignes`) : c'est ce champ que lit le programme de surveillance (scripts/surveillance-trafic.js) pour
// savoir qui prévenir. Rien de personnel n'est enregistré, seulement des identifiants de lignes.
const CLE_LIGNES_SUIVIES = '@gp_alertes_lignes';

export async function lireLignesSuivies(): Promise<string[]> {
  try {
    const brut = await AsyncStorage.getItem(CLE_LIGNES_SUIVIES);
    const liste = brut ? JSON.parse(brut) : [];
    return Array.isArray(liste) ? liste.filter((x: unknown) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Enregistre la liste (téléphone puis serveur). Renvoie 'ok', 'refuse' (notifications refusées par le téléphone :
// aucune alerte ne pourra arriver) ou 'erreur' (réseau : la liste est gardée sur le téléphone, à renvoyer plus tard).
export async function enregistrerLignesSuivies(lignes: string[]): Promise<'ok' | 'refuse' | 'erreur'> {
  try { await AsyncStorage.setItem(CLE_LIGNES_SUIVIES, JSON.stringify(lignes)); } catch { /* sans gravité */ }
  const token = await registerForPushNotificationsAsync();
  if (!token) return lignes.length > 0 ? 'refuse' : 'ok';
  try {
    const db = getFirestore(firebaseApp());
    await setDoc(doc(db, 'pushTokens', token), { alertesLignes: lignes, alertesMiseAJour: serverTimestamp() }, { merge: true });
    return 'ok';
  } catch (e: any) {
    logger.warn(`enregistrerLignesSuivies: ${e?.message}`);
    return 'erreur';
  }
}

// Lignes de BUS suivies : seul l'identifiant part au serveur (comme les autres lignes) ; leur numéro et leur couleur, nécessaires pour
// les afficher dans l'écran des alertes (les bus ne sont pas dans la liste des lignes), restent sur le téléphone.
const CLE_BUS_SUIVIS = '@gp_alertes_bus';
export type BusSuivi = { id: string; code: string; color: string; textColor: string };

export async function lireBusSuivis(): Promise<BusSuivi[]> {
  try {
    const brut = await AsyncStorage.getItem(CLE_BUS_SUIVIS);
    const liste = brut ? JSON.parse(brut) : [];
    return Array.isArray(liste) ? liste.filter((b: any) => b && typeof b.id === 'string' && typeof b.code === 'string') : [];
  } catch {
    return [];
  }
}
export async function enregistrerBusSuivis(bus: BusSuivi[]): Promise<void> {
  try { await AsyncStorage.setItem(CLE_BUS_SUIVIS, JSON.stringify(bus)); } catch { /* sans gravité */ }
}

// ── Alertes reçues, gardées en mémoire ────────────────────────────────────────
// Chaque alerte trafic reçue (app ouverte) ou touchée (app fermée) est gardée sur le téléphone : si la perturbation est
// terminée quand on ouvre la ligne, le détail de la ligne l'affiche quand même, marquée « terminée » (voir TraficDetail).
export type AlerteRecue = { id: string; ligneId: string; titre: string; detail: string; niveau: 'interrompu' | 'perturbe'; recueLe: number; ligneTitre?: string };
const CLE_ALERTES_RECUES = '@gp_alertes_recues';
const MAX_ALERTES_RECUES = 40;
const CONSERVATION_MS = 7 * 86_400_000;

async function lireToutesAlertes(): Promise<AlerteRecue[]> {
  try {
    const brut = await AsyncStorage.getItem(CLE_ALERTES_RECUES);
    const liste = brut ? JSON.parse(brut) : [];
    return Array.isArray(liste) ? liste.filter((a: any) => a && typeof a.id === 'string' && typeof a.ligneId === 'string' && typeof a.titre === 'string') : [];
  } catch { return []; }
}

// Alertes d'une ligne reçues il y a moins de `depuisMs` (les plus récentes d'abord).
export async function lireAlertesRecues(ligneId: string, depuisMs = 48 * 3_600_000): Promise<AlerteRecue[]> {
  const limite = Date.now() - depuisMs;
  return (await lireToutesAlertes()).filter(a => a.ligneId === ligneId && a.recueLe >= limite).sort((x, y) => y.recueLe - x.recueLe);
}

async function memoriserAlerte(a: AlerteRecue): Promise<void> {
  try {
    const limite = Date.now() - CONSERVATION_MS;
    const anciennes = await lireToutesAlertes();
    const deja = anciennes.find(x => x.id === a.id && x.ligneId === a.ligneId);
    const reste = anciennes.filter(x => x !== deja && x.recueLe >= limite);
    // Une alerte déjà connue garde sa date de réception (la première).
    await AsyncStorage.setItem(CLE_ALERTES_RECUES, JSON.stringify([deja ? { ...a, recueLe: deja.recueLe } : a, ...reste].slice(0, MAX_ALERTES_RECUES)));
  } catch { /* sans gravité */ }
}

// Alerte contenue dans une notification (null si ce n'est pas une alerte trafic de ligne).
function alerteDepuis(notification: Notifications.Notification | undefined, recueLe: number): AlerteRecue | null {
  const contenu: any = notification?.request?.content;
  const data: any = contenu?.data;
  if (data?.type !== 'trafic' || typeof data.ligneId !== 'string') return null;
  const p = data.perturbation;
  // Texte français de l'annonce ; à défaut (pas encore publié au moment de l'envoi), le titre de la notification
  // (« Métro 3 : trafic perturbé ») : mieux vaut une carte « terminée » sommaire que rien.
  const corps = String(contenu?.body || '').split('\n')[0];
  const titre = typeof p?.titre === 'string' && p.titre ? p.titre : (corps && corps !== 'Touche pour voir le détail.' ? corps : String(contenu?.title || ''));
  if (!titre) return null;
  const niveau = p?.niveau === 'interrompu' || (!p && /interrompu/i.test(String(contenu?.title || ''))) ? 'interrompu' : 'perturbe';
  return { id: typeof p?.id === 'string' ? p.id : `${data.ligneId}|${titre}`, ligneId: data.ligneId, titre, detail: typeof p?.detail === 'string' ? p.detail : '', niveau, recueLe, ligneTitre: String(contenu?.title || '') };
}

// Heure de réception d'une notification (selon le système, en secondes ou en millisecondes).
function heureNotification(n: Notifications.Notification | undefined): number {
  const d = Number(n?.date);
  return d > 1e12 ? d : d > 1e9 ? d * 1000 : Date.now();
}

// La ligne vient d'être consultée : ses notifications d'alerte encore présentes dans le volet du téléphone sont retirées.
export async function effacerNotificationsLigne(ligne: { id: string; mode: ModeTrafic; code: string }): Promise<void> {
  try {
    const presentes = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(presentes
      .filter(n => concerneLigne(n.request?.content, ligne))
      .map(n => Notifications.dismissNotificationAsync(n.request.identifier)));
  } catch (e: any) {
    logger.warn(`effacerNotificationsLigne: ${e?.message}`);
  }
}

// Appelle `quand(idLigne)` quand l'utilisateur touche une notification d'alerte trafic (app ouverte, en arrière-plan
// ou fermée : dans ce dernier cas, la notification qui a lancé l'app est relue au démarrage). L'alerte est gardée en
// mémoire, puis transmise à l'écran Trafic : le détail de la ligne l'affiche « terminée » si elle l'est (et seulement
// quand on arrive par la notification, jamais depuis le menu Info trafic).
export function ecouterToucherAlerteTrafic(quand: (idLigne: string, alerte: AlerteRecue | null) => void): () => void {
  const traiter = async (reponse: Notifications.NotificationResponse | null) => {
    const data: any = reponse?.notification?.request?.content?.data;
    if (data?.type !== 'trafic' || typeof data.ligneId !== 'string') return;
    const alerte = alerteDepuis(reponse?.notification, heureNotification(reponse?.notification));
    if (alerte) await memoriserAlerte(alerte);
    quand(data.ligneId, alerte);
  };
  const abonnement = Notifications.addNotificationResponseReceivedListener(traiter);
  Notifications.getLastNotificationResponseAsync().then(traiter).catch(() => {});
  return () => abonnement.remove();
}

// Appelle `quand(alerte)` quand une alerte trafic arrive pendant que l'app est ouverte (pour le pop-up) ; elle est aussi
// gardée en mémoire tout de suite, sans attendre qu'on la touche.
export function ecouterAlerteTraficRecue(quand: (alerte: AlerteRecue) => void): () => void {
  const abonnement = Notifications.addNotificationReceivedListener(n => {
    const alerte = alerteDepuis(n, Date.now());
    if (!alerte) return;
    memoriserAlerte(alerte);
    quand(alerte);
  });
  return () => abonnement.remove();
}
