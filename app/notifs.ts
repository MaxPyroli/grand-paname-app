// Moteur des notifications INTERNES de l'app (celles affichées par l'app elle-même, pas les notifications du téléphone).
// Une seule porte d'entrée : `notifier(...)`, appelable de n'importe où. L'affichage est fait par `NotifCentre`.
//
// Trois formes (voir docs/guide-graphique.md) :
//   carte   en haut ; la toucher agit ; disparaît seule (7 s)            — alerte trafic, mise à jour prête
//   pilule  en bas ; petite confirmation ; disparaît seule (2,5 s)       — « Cache vidé », « Localisation refusée »
//   choix   en haut, avec des boutons ; reste jusqu'à la réponse
// Règles : une seule à la fois par emplacement (haut / bas), les autres attendent ; une interruption passe devant ; une
// notification de même `cle` remplace l'ancienne au lieu de s'ajouter.
//
// Ce fichier ne dépend d'aucun composant : la file d'attente est testable seule (tests/notifs.test.ts).
import type { IconName } from './Icon';
import type { ModeTrafic } from './traficApi';

export type FormeNotif = 'carte' | 'pilule' | 'choix';
export type TypeNotif = 'info' | 'succes' | 'attention' | 'erreur' | 'perturbe' | 'interrompu';
export type ActionNotif = { libelle: string; principal?: boolean; onPress?: () => void };

export type DemandeNotif = {
  forme?: FormeNotif;        // 'pilule' par défaut
  type?: TypeNotif;          // 'info' par défaut
  titre: string;
  texte?: string;
  icone?: IconName;          // sinon choisie d'après le type
  ligne?: { mode: ModeTrafic; code: string };   // affiche le symbole officiel de la ligne à la place de l'icône
  onPress?: () => void;      // carte : toucher la carte
  actions?: ActionNotif[];   // choix : les boutons
  duree?: number | null;     // ms ; null = reste jusqu'à ce qu'on la ferme
  vibration?: boolean;
  cle?: string;              // même clé = remplace
};
export type Notif = DemandeNotif & { cle: string; forme: FormeNotif; type: TypeNotif; duree: number | null; version: number };

export type Emplacement = 'haut' | 'bas';
export const emplacementDe = (forme: FormeNotif): Emplacement => (forme === 'pilule' ? 'bas' : 'haut');

const DUREES: Record<FormeNotif, number | null> = { carte: 7000, pilule: 2500, choix: null };
const PRIORITE: Record<TypeNotif, number> = { interrompu: 2, perturbe: 1, erreur: 1, attention: 0, info: 0, succes: 0 };
export const FILE_MAX = 5;

// Ajoute une notification à une file (la première est celle affichée). Renvoie une NOUVELLE file.
export function inserer(file: Notif[], n: Notif): Notif[] {
  const meme = file.findIndex(x => x.cle === n.cle);
  if (meme >= 0) return file.map((x, i) => (i === meme ? n : x));
  // Plus prioritaire que celle affichée (une interruption, par exemple) : elle passe devant, l'autre reviendra après.
  if (file.length > 0 && PRIORITE[n.type] > PRIORITE[file[0].type]) return limiter([n, ...file]);
  return limiter([...file, n]);
}

// File trop longue : on retire la plus ancienne des moins prioritaires parmi celles qui ATTENDENT (jamais celle affichée).
function limiter(file: Notif[]): Notif[] {
  if (file.length <= FILE_MAX) return file;
  let victime = 1;
  for (let i = 2; i < file.length; i++) if (PRIORITE[file[i].type] < PRIORITE[file[victime].type]) victime = i;
  return file.filter((_, i) => i !== victime);
}

let compteur = 0;
export function preparer(d: DemandeNotif): Notif {
  compteur++;
  const forme = d.forme ?? 'pilule';
  return { ...d, forme, type: d.type ?? 'info', duree: d.duree === undefined ? DUREES[forme] : d.duree, cle: d.cle ?? `notif-${compteur}`, version: compteur };
}

// ── Magasin ───────────────────────────────────────────────────────────────────
let files: Record<Emplacement, Notif[]> = { haut: [], bas: [] };
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach(f => f());

export function notifier(d: DemandeNotif): string {
  const n = preparer(d);
  const e = emplacementDe(n.forme);
  files = { ...files, [e]: inserer(files[e], n) };
  prevenir();
  return n.cle;
}

export function fermerNotif(cle: string): void {
  files = { haut: files.haut.filter(n => n.cle !== cle), bas: files.bas.filter(n => n.cle !== cle) };
  prevenir();
}

export function toutFermer(): void { files = { haut: [], bas: [] }; prevenir(); }

export const lireFile = (e: Emplacement): Notif[] => files[e];
export function suivreNotifs(f: () => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; }

// ── Alerte trafic ─────────────────────────────────────────────────────────────
// « Métro 7 bis : trafic perturbé » (titre de la notification du téléphone) → la ligne et son état.
const MODES_TITRE: Record<string, ModeTrafic> = { 'Métro': 'METRO', 'RER': 'RER', 'Transilien': 'TRAIN', 'Tram': 'TRAM', 'Câble': 'CABLE', 'Bus': 'BUS' };
export function lireTitreAlerte(titre: string): { mode: ModeTrafic; code: string; etat: string } | null {
  const m = titre.match(/^(Métro|RER|Transilien|Tram|Câble|Bus) (\S+?)( bis)?\s*:\s*(.+)$/);
  if (!m) return null;
  return { mode: MODES_TITRE[m[1]], code: m[2] + (m[3] ? 'B' : ''), etat: m[4].charAt(0).toUpperCase() + m[4].slice(1) };
}

export function notifDAlerte(a: { ligneId: string; titre: string; ligneTitre?: string; niveau: 'interrompu' | 'perturbe' }, onPress: () => void): DemandeNotif {
  const titreComplet = a.ligneTitre || a.titre;
  const lu = lireTitreAlerte(titreComplet);
  return {
    forme: 'carte', type: a.niveau, cle: 'alerte-' + a.ligneId, vibration: true, onPress,
    titre: lu?.etat ?? titreComplet,
    texte: a.ligneTitre && a.titre !== a.ligneTitre ? a.titre : undefined,
    ligne: lu ? { mode: lu.mode, code: lu.code } : undefined,
  };
}
