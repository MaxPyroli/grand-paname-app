// Moteur des notifications INTERNES de l'app (celles affichées par l'app elle-même, pas les notifications du téléphone).
// Une seule porte d'entrée : `notifier(...)`, appelable de n'importe où. L'affichage est fait par `NotifCentre`.
//
// Trois formes (voir docs/guide-graphique.md) :
//   carte   en haut ; la toucher agit ; disparaît seule (7 s)            — alerte trafic, mise à jour prête
//   pilule  en haut ; petite confirmation ; disparaît seule (2,5 s)      — « Cache vidé », « Localisation refusée »
//   choix   en haut, avec des boutons ; reste jusqu'à la réponse
// Tout s'affiche en haut de l'écran. Règles : une seule carte (ou carte à boutons) et une seule pilule à la fois, la pilule
// se plaçant sous la carte ; les autres attendent ; une interruption passe devant ; une notification de même `cle`
// remplace l'ancienne au lieu de s'ajouter.
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
  chargement?: boolean;       // pilule : un rond qui tourne à la place de l'icône (tâche en cours)
  cle?: string;              // même clé = remplace
};
export type Notif = DemandeNotif & { cle: string; forme: FormeNotif; type: TypeNotif; duree: number | null; version: number };

// Deux files indépendantes : les cartes (avec ou sans boutons) et les pilules.
export type Emplacement = 'cartes' | 'pilules';
export const emplacementDe = (forme: FormeNotif): Emplacement => (forme === 'pilule' ? 'pilules' : 'cartes');

const DUREES: Record<FormeNotif, number | null> = { carte: 7000, pilule: 2500, choix: null };
const PRIORITE: Record<TypeNotif, number> = { interrompu: 2, perturbe: 1, erreur: 1, attention: 0, info: 0, succes: 0 };
export const FILE_MAX = 5;

// Ajoute une notification à une file (la première est celle affichée). Renvoie une NOUVELLE file.
export function inserer(file: Notif[], n: Notif): Notif[] {
  const meme = file.findIndex(x => x.cle === n.cle);
  if (meme >= 0) return file.map((x, i) => (i === meme ? n : x));
  // Une pilule qui reste (tâche en cours) ne bloque pas les messages passagers : ils passent devant, elle revient ensuite.
  if (file.length > 0 && file[0].forme === 'pilule' && file[0].duree === null && n.duree !== null) return limiter([n, ...file]);
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

// ── Ce qui est affiché ────────────────────────────────────────────────────────
export type Element = { n: Notif; rang: number; sortante: boolean };

// Nouvelle liste des éléments à dessiner après un changement de file. L'ORDRE de la liste ne change jamais (seuls les
// rangs bougent) : sinon les vues sont démontées puis remontées et l'animation saute. Un élément vu qui quitte la file
// reste en « sortante » le temps de son animation ; au-delà de `max`, il est seulement caché (retiré).
export function majElements(avant: Element[], file: Notif[], max: number): Element[] {
  const suite: Element[] = [];
  for (const el of avant) {
    const i = file.findIndex(x => x.cle === el.n.cle);
    if (i < 0) suite.push(el.sortante ? el : { ...el, rang: 0, sortante: true });
    else if (i < max) suite.push({ n: file[i], rang: i, sortante: false });
  }
  file.slice(0, max).forEach((n, rang) => {
    if (!suite.some(el => el.n.cle === n.cle)) suite.push({ n, rang, sortante: false });
  });
  return suite;
}

// ── Magasin ───────────────────────────────────────────────────────────────────
let files: Record<Emplacement, Notif[]> = { cartes: [], pilules: [] };
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
  files = { cartes: files.cartes.filter(n => n.cle !== cle), pilules: files.pilules.filter(n => n.cle !== cle) };
  prevenir();
}

export function toutFermer(): void { files = { cartes: [], pilules: [] }; prevenir(); }

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

// Une notification du téléphone concerne-t-elle cette ligne ? Celles qu'Android a affichées lui-même (app fermée ou en
// arrière-plan) sont rendues à l'app SANS leurs données : seul leur titre permet alors de reconnaître la ligne.
export function concerneLigne(contenu: { title?: string | null; data?: any } | undefined, ligne: { id: string; mode: ModeTrafic; code: string }): boolean {
  if (contenu?.data?.type === 'trafic') return contenu.data.ligneId === ligne.id;
  const lu = lireTitreAlerte(contenu?.title || '');
  return !!lu && lu.mode === ligne.mode && lu.code.toUpperCase() === ligne.code.toUpperCase();
}

export function notifDAlerte(a: { ligneId: string; titre: string; ligneTitre?: string; niveau: 'interrompu' | 'perturbe' | 'info' }, onPress: () => void): DemandeNotif {
  const titreComplet = a.ligneTitre || a.titre;
  const lu = lireTitreAlerte(titreComplet);
  return {
    forme: 'carte', type: a.niveau, cle: 'alerte-' + a.ligneId, vibration: true, onPress,
    titre: lu?.etat ?? titreComplet,
    texte: a.ligneTitre && a.titre !== a.ligneTitre ? a.titre : undefined,
    ligne: lu ? { mode: lu.mode, code: lu.code } : undefined,
  };
}
