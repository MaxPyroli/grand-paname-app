// Réglages des notifications, gardés sur le téléphone. Seul le niveau d'alertes part au serveur (voir
// `enregistrerNiveauAlertes` dans notifications.ts) : c'est lui qui choisit quoi envoyer.
import AsyncStorage from '@react-native-async-storage/async-storage';

// toutes : interruptions, perturbations et informations ; standard : interruptions et perturbations (par défaut) ;
// interruptions : uniquement le trafic annoncé comme interrompu.
export type NiveauAlertes = 'toutes' | 'standard' | 'interruptions';
export type PrefsNotifs = {
  niveau: NiveauAlertes;
  dansApp: boolean;     // app ouverte : notification de l'app (true) ou notification Android (false)
  vibration: boolean;   // vibration des alertes affichées par l'app
};
export const PREFS_DEFAUT: PrefsNotifs = { niveau: 'standard', dansApp: true, vibration: true };
const CLE = '@gp_pref_notifs';

// Lit une valeur enregistrée en ne gardant que ce qui est valable (le reste prend la valeur par défaut).
export function lireValeur(brut: string | null): PrefsNotifs {
  try {
    const v = brut ? JSON.parse(brut) : {};
    return {
      niveau: v.niveau === 'toutes' || v.niveau === 'interruptions' ? v.niveau : 'standard',
      dansApp: v.dansApp !== false,
      vibration: v.vibration !== false,
    };
  } catch {
    return PREFS_DEFAUT;
  }
}

let courantes = PREFS_DEFAUT;
let chargement: Promise<PrefsNotifs> | null = null;
const abonnes = new Set<() => void>();

export function chargerPrefs(): Promise<PrefsNotifs> {
  chargement ??= AsyncStorage.getItem(CLE)
    .then(brut => { courantes = lireValeur(brut); abonnes.forEach(f => f()); return courantes; })
    .catch(() => courantes);
  return chargement.then(() => courantes);
}
export const lirePrefs = (): PrefsNotifs => courantes;
export async function changerPrefs(changement: Partial<PrefsNotifs>): Promise<void> {
  await chargerPrefs();
  courantes = { ...courantes, ...changement };
  abonnes.forEach(f => f());
  try { await AsyncStorage.setItem(CLE, JSON.stringify(courantes)); } catch { /* sans gravité */ }
}
export function suivrePrefs(f: () => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; }
