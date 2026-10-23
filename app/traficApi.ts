// Info trafic — version SIMPLE (étape 1 du plan de la 3.4.0) : une requête pour la liste des lignes
// lourdes, une requête pour toutes les perturbations du réseau, et on croise les deux.
// Pas encore de nettoyage des textes ni de détail : seulement « quel est l'état de chaque ligne ? ».
import { NAVITIA_BASE, NAVITIA_KEY } from './constants';
import { modeDepuisCommercialMode } from './api';

const URL_PERTURBATIONS = 'https://prim.iledefrance-mobilites.fr/marketplace/disruptions_bulk/disruptions/v2';
const TTL_PERTURBATIONS_MS = 60_000;
const TTL_LIGNES_MS = 24 * 3600 * 1000;

export type EtatTrafic = 'normal' | 'perturbe' | 'interrompu';
export type ModeTrafic = 'RER' | 'TRAIN' | 'METRO' | 'TRAM' | 'CABLE';

export type LigneTrafic = {
  id: string;
  code: string;
  color: string;      // sans « # »
  textColor: string;  // sans « # »
  mode: ModeTrafic;
  etat: EtatTrafic;
  nbPerturbations: number;
};

type LigneBrute = { id: string; code: string; color: string; textColor: string; mode: ModeTrafic };

// Ordre de tri des lignes dans l'aperçu (les RER avant les Transilien).
export const ORDRE_MODES: ModeTrafic[] = ['RER', 'TRAIN', 'METRO', 'TRAM', 'CABLE'];

// Sections de l'aperçu : RER et Transilien sont regroupés sous « Train / RER », comme dans les autres appli.
// `icone` = clé de l'icône dans `modeIcons.ts`.
export const SECTIONS_TRAFIC: { cle: string; libelle: string; icone: string; modes: ModeTrafic[] }[] = [
  { cle: 'TRAIN_RER', libelle: 'Train / RER', icone: 'TRAIN_RER', modes: ['RER', 'TRAIN'] },
  { cle: 'METRO', libelle: 'Métro', icone: 'METRO', modes: ['METRO'] },
  { cle: 'TRAM', libelle: 'Tramway', icone: 'TRAM', modes: ['TRAM'] },
  { cle: 'CABLE', libelle: 'Câble', icone: 'CABLE', modes: ['CABLE'] },
];

let cacheLignes: { at: number; lignes: LigneBrute[] } | null = null;
let cachePerturbations: { at: number; data: any } | null = null;

// Date Navitia/PRIM « AAAAMMJJTHHMMSS » (heure locale de Paris).
function dateNavitia(s: string): number {
  return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15)).getTime();
}

// Tri naturel des codes de ligne (1, 2, 3, 3bis, 4… 14 ; T1, T2… T13 ; A, B…).
function comparerCodes(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
}

async function chargerLignesLourdes(signal?: AbortSignal): Promise<LigneBrute[]> {
  if (cacheLignes && Date.now() - cacheLignes.at < TTL_LIGNES_MS) return cacheLignes.lignes;
  // Le câble C1 est un « téléphérique » (SuspendedCableCar) ; le funiculaire de Montmartre est à part.
  const modes = ['Metro', 'RapidTransit', 'LocalTrain', 'Tramway', 'SuspendedCableCar', 'Funicular'];
  const filtre = modes.map(m => `physical_mode.id=physical_mode:${m}`).join(' or ');
  const url = `${NAVITIA_BASE}/lines?filter=${encodeURIComponent(filtre)}&count=200&depth=0&disable_geojson=true&disable_disruption=true`;
  const r = await fetch(url, { headers: { apiKey: NAVITIA_KEY }, signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  const lignes: LigneBrute[] = (d.lines || []).map((l: any) => ({
    id: l.id,
    code: l.code || l.name,
    color: l.color || '888888',
    textColor: l.text_color || 'FFFFFF',
    mode: modeDepuisCommercialMode(l.physical_modes?.[0]?.id || '') as ModeTrafic,
  })).filter((l: LigneBrute) => ORDRE_MODES.includes(l.mode));
  cacheLignes = { at: Date.now(), lignes };
  return lignes;
}

async function chargerPerturbations(signal?: AbortSignal): Promise<any> {
  if (cachePerturbations && Date.now() - cachePerturbations.at < TTL_PERTURBATIONS_MS) return cachePerturbations.data;
  const r = await fetch(URL_PERTURBATIONS, { headers: { apiKey: NAVITIA_KEY }, signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  cachePerturbations = { at: Date.now(), data };
  return data;
}

// État d'une ligne : la plus grave des perturbations EN COURS qui la touchent.
// `BLOQUANTE` = interrompu, `PERTURBEE` = perturbé, `INFORMATION` = rien à signaler.
// Une perturbation posée sur la ligne entière compte telle quelle. Une perturbation posée sur un arrêt
// (« arrêt non desservi », train en panne en station…) ne coupe pas la ligne : elle la rend « perturbée »
// au plus, même si sa gravité est « bloquante » (la ligne circule, seul l'arrêt est fermé).
// Le flux ne contient aucune panne d'ascenseur ou d'escalator (vérifié : 0 sur plus de 1 000 perturbations).
export function etatDesLignes(lignes: LigneBrute[], bulk: any, maintenant = Date.now()): LigneTrafic[] {
  const perturbations = new Map<string, any>();
  for (const p of bulk?.disruptions || []) perturbations.set(p.id, p);

  // id de ligne → (id de perturbation → posée sur la ligne entière ?)
  const ciblees = new Map<string, Map<string, boolean>>();
  for (const l of bulk?.lines || []) {
    for (const o of l.impactedObjects || []) {
      const surLaLigne = o.type === 'line';
      if (!surLaLigne && o.type !== 'stop_point') continue;
      const ens = ciblees.get(l.id) ?? new Map<string, boolean>();
      for (const id of (o.disruptionIds || []) as string[]) ens.set(id, (ens.get(id) ?? false) || surLaLigne);
      ciblees.set(l.id, ens);
    }
  }

  return lignes.map(l => {
    let etat: EtatTrafic = 'normal';
    let nb = 0;
    for (const [id, surLaLigne] of ciblees.get(l.id) ?? []) {
      const p = perturbations.get(id);
      if (!p) continue;
      const periodes: any[] = p.applicationPeriods || [];
      const enCours = periodes.length === 0 || periodes.some(x => dateNavitia(x.begin) <= maintenant && maintenant <= dateNavitia(x.end));
      if (!enCours) continue;
      let nv: EtatTrafic = p.severity === 'BLOQUANTE' ? 'interrompu' : p.severity === 'PERTURBEE' ? 'perturbe' : 'normal';
      if (nv === 'normal') continue;
      if (!surLaLigne) nv = 'perturbe';
      nb++;
      if (nv === 'interrompu' || etat === 'normal') etat = nv;
    }
    return { ...l, etat, nbPerturbations: nb };
  });
}

// Toutes les lignes lourdes avec leur état, triées par mode puis par code.
// Un seul chargement à la fois : le préchargement au lancement et l'ouverture du volet partagent la même requête.
let enCours: Promise<LigneTrafic[]> | null = null;
export function chargerTrafic(signal?: AbortSignal): Promise<LigneTrafic[]> {
  if (!enCours) {
    enCours = Promise.all([chargerLignesLourdes(signal), chargerPerturbations(signal)])
      .then(([lignes, bulk]) => etatDesLignes(lignes, bulk).sort((a, b) =>
        ORDRE_MODES.indexOf(a.mode) - ORDRE_MODES.indexOf(b.mode) || comparerCodes(a.code, b.code)))
      .finally(() => { enCours = null; });
  }
  return enCours;
}

// Force une relecture (tirer pour actualiser) : vide les caches de perturbations.
export function oublierPerturbations() { cachePerturbations = null; }

// ── Détail d'une ligne ────────────────────────────────────────────────────────
// Les perturbations « en masse » sont en anglais ; le détail vient donc de Navitia (`line_reports`, en français,
// avec titre et texte). Une requête par ligne, à la demande, gardée 60 s.

export type NiveauPerturbation = 'interrompu' | 'perturbe' | 'info';
export type CausePerturbation = 'travaux' | 'perturbation' | 'information';
// Nature de la perturbation, d'après l'étiquette officielle courte (canal « cbiv ») : « Trafic interrompu »,
// « Trafic fortement perturbé », « Trafic perturbé », « Arrêt(s) non desservi(s) », « Autre » ; à défaut, la gravité.
export type TypePerturbation = 'interrompu' | 'partielle' | 'fortement' | 'perturbe' | 'arret' | 'info';

export type PerturbationLigne = {
  id: string;
  titre: string;
  texte: string;
  cause: CausePerturbation;
  niveau: NiveauPerturbation;
  type: TypePerturbation;
  arretsPluriel: boolean;   // « Arrêt(s) non desservi(s) » : plusieurs arrêts
  enCours: boolean;
  debut: number;
  fin: number;
  periode: string;   // « Jusqu'au 19 décembre », « À partir du 12 octobre »…
};

// `stations` : noms des stations de la ligne, pour ne repérer dans les textes que les VRAIS noms de stations de la ligne.
export type DetailLigne = { enCours: PerturbationLigne[]; aVenir: PerturbationLigne[]; stations: string[] };

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS_A_VENIR = 45;           // les travaux plus lointains ne sont pas listés
const JOURS_SANS_FIN = 730;         // au-delà, « jusqu'à nouvel ordre » (les travaux de plusieurs mois ont une vraie date de fin)
const ENTITES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };

function jourMois(t: number): string {
  const d = new Date(t);
  return `${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]}`;
}

// Texte d'une perturbation : les messages Navitia contiennent du HTML et des entités (« &#233; », « &lt; »).
export function nettoyerTexte(brut: string): string {
  return brut
    .replace(/<\s*br\s*\/?>|<\/p>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&([a-z]+);/gi, (m, nom) => ENTITES[nom.toLowerCase()] ?? m)
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const PANNE_EQUIPEMENT = /ascenseur|escalator|escalier m[ée]canique/i;

// Perturbations d'une ligne à partir d'une réponse `line_reports`.
export function analyserDetailLigne(data: any, maintenant = Date.now()): DetailLigne {
  const parId = new Map<string, PerturbationLigne>();
  for (const d of data?.disruptions || []) {
    if (d.status === 'past') continue;
    const message = (...canaux: string[]): string => {
      for (const canal of canaux) {
        const m = (d.messages || []).find((x: any) => x?.channel?.name === canal && x?.text);
        if (m) return nettoyerTexte(m.text);
      }
      return '';
    };
    const titre = message('titre', 'notification', 'cbiv');
    if (!titre || PANNE_EQUIPEMENT.test(titre)) continue;   // les pannes d'ascenseur noieraient les vraies perturbations
    const texte = message('moteur', 'email', 'web', 'mobile');

    const periodes = ((d.application_periods || []) as any[]).map(p => [dateNavitia(p.begin), dateNavitia(p.end)]);
    if (periodes.length === 0) continue;
    const enCours = periodes.some(([a, b]) => a <= maintenant && maintenant <= b);
    const debut = Math.min(...periodes.map(p => p[0]));
    const fin = Math.max(...periodes.map(p => p[1]));
    if (!enCours && debut - maintenant > JOURS_A_VENIR * 86_400_000) continue;

    const nom = d.severity?.name;
    const niveau: NiveauPerturbation = nom === 'bloquante' ? 'interrompu' : nom === 'perturbée' ? 'perturbe' : 'info';
    const etiquette = message('cbiv').toLowerCase();
    // Vérifié sur toutes les lignes lourdes (voir journal du 2026-10-23) : « bloquante » posée sur la LIGNE = trafic
    // réellement interrompu (32 cas sur 32, textes concordants) ; « bloquante » posée sur un ARRÊT = station fermée ou
    // arrêt non desservi, jamais une ligne coupée. En revanche beaucoup d'interruptions de tronçon (travaux de nuit,
    // incidents) sont codées « perturbée » : le code ne les voit pas, seul le texte les annonce.
    const surLaLigne = ((d.impacted_objects || []) as any[]).some(o => o?.pt_object?.embedded_type === 'line');
    let type: TypePerturbation;
    if (nom === 'bloquante') {
      type = surLaLigne ? 'interrompu' : 'arret';
    } else {
      type =
        /fortement/.test(etiquette) ? 'fortement'
        : /non desservi/.test(etiquette) ? 'arret'
        : /perturb/.test(etiquette) ? 'perturbe'
        : /autre|information/.test(etiquette) ? 'info'
        : niveau === 'perturbe' ? 'perturbe' : 'info';
      // Le texte annonce une interruption de la ligne elle-même alors que le code dit « perturbée » : on le dit, mais
      // comme « interruption partielle » — pas « trafic interrompu », qui est réservé au code (pas « interrompu sur une
      // autre ligne »).
      const lu = `${titre} ${texte}`;
      if (type !== 'info'
        && (/(?:trafic|circulation|service)\s+(?:est\s+|sera\s+)?interrompu(?!\s+sur\s+(?:la\s+ligne|le\s+(?:rer|m[eé]tro|tram)|les\s+rer|ligne))/i.test(lu) || /interrompu\s+entre/i.test(lu))) {
        type = 'partielle';
      }
    }
    const arretsPluriel = /\(s\)/.test(etiquette);
    const cause: CausePerturbation = d.cause === 'travaux' ? 'travaux' : d.cause === 'information' ? 'information' : 'perturbation';
    const periode = enCours
      ? (fin - maintenant > JOURS_SANS_FIN * 86_400_000 ? 'Jusqu\'à nouvel ordre' : `Jusqu'au ${jourMois(fin - 6 * 3_600_000)}`)   // une fin à 4 h 30 est la fin de la veille (journée de service)
      : `À partir du ${jourMois(debut)}`;

    // Une même annonce est souvent publiée plusieurs fois (une par période) : on la garde une fois.
    const cle = titre + '|' + texte;
    const existante = parId.get(cle);
    if (existante) {
      existante.enCours = existante.enCours || enCours;
      existante.debut = Math.min(existante.debut, debut);
      existante.fin = Math.max(existante.fin, fin);
      if (existante.enCours) existante.periode = enCours ? periode : existante.periode;
      continue;
    }
    parId.set(cle, { id: d.id || cle, titre, texte: texte === titre ? '' : texte, cause, niveau, type, arretsPluriel, enCours, debut, fin, periode });
  }
  const rangCause: Record<CausePerturbation, number> = { perturbation: 0, travaux: 1, information: 2 };
  const gravite: Record<TypePerturbation, number> = { interrompu: 0, partielle: 1, fortement: 2, perturbe: 3, arret: 4, info: 5 };
  const tout = [...parId.values()];
  return {
    // Les plus graves d'abord ; à gravité égale, un incident avant des travaux, et le plus récent d'abord.
    enCours: tout.filter(p => p.enCours).sort((a, b) => gravite[a.type] - gravite[b.type] || rangCause[a.cause] - rangCause[b.cause] || b.debut - a.debut),
    aVenir: tout.filter(p => !p.enCours).sort((a, b) => a.debut - b.debut),
    stations: [],
  };
}

const cacheDetails = new Map<string, { at: number; detail: DetailLigne }>();

// Détail déjà en mémoire (frais) : permet d'afficher une ligne tout de suite, sans écran de chargement.
export function detailEnCache(idLigne: string): DetailLigne | null {
  const connu = cacheDetails.get(idLigne);
  return connu && Date.now() - connu.at < TTL_PERTURBATIONS_MS ? connu.detail : null;
}

// Noms des stations d'une ligne (change quasiment jamais : gardés 24 h). Échec réseau → liste vide, sans erreur :
// les textes s'afficheront simplement sans contour autour des stations.
const cacheStations = new Map<string, { at: number; noms: string[] }>();
async function chargerStationsLigne(idLigne: string, signal?: AbortSignal): Promise<string[]> {
  const connu = cacheStations.get(idLigne);
  if (connu && Date.now() - connu.at < 24 * 3600 * 1000) return connu.noms;
  try {
    const r = await fetch(`${NAVITIA_BASE}/lines/${encodeURIComponent(idLigne)}/stop_areas?count=1000&depth=0&disable_geojson=true&disable_disruption=true`, { headers: { apiKey: NAVITIA_KEY }, signal });
    if (!r.ok) return [];
    const noms: string[] = ((await r.json()).stop_areas || []).map((s: any) => String(s.name || '')).filter(Boolean);
    cacheStations.set(idLigne, { at: Date.now(), noms });
    return noms;
  } catch {
    return [];
  }
}

// Une seule requête en vol par ligne : le préchargement (doigt posé, lignes perturbées) et l'ouverture du détail la partagent.
const detailsEnCours = new Map<string, Promise<DetailLigne>>();

export function chargerDetailLigne(idLigne: string, signal?: AbortSignal): Promise<DetailLigne> {
  const connu = cacheDetails.get(idLigne);
  if (connu && Date.now() - connu.at < TTL_PERTURBATIONS_MS) return Promise.resolve(connu.detail);
  let enCours = detailsEnCours.get(idLigne);
  if (!enCours) {
    enCours = (async () => {
      // Le serveur répond « 429 » (trop de requêtes) si on en envoie trop vite, et parfois 5xx : on réessaie
      // jusqu'à 3 fois en espaçant, plutôt que d'afficher une erreur ou un détail vide.
      let r: Response | null = null;
      for (let essai = 0; essai < 4; essai++) {
        r = await fetch(`${NAVITIA_BASE}/lines/${encodeURIComponent(idLigne)}/line_reports?count=200&depth=0`, { headers: { apiKey: NAVITIA_KEY }, signal });
        if (r.ok || r.status === 404 || (r.status !== 429 && r.status < 500)) break;
        await new Promise(res => setTimeout(res, 600 * (essai + 1)));
      }
      if (!r || (!r.ok && r.status !== 404)) throw new Error(`HTTP ${r?.status}`);
      const detail = analyserDetailLigne(r.ok ? await r.json() : {});
      // Les stations ne servent qu'à repérer des noms dans les textes : inutile s'il n'y a aucun texte.
      if (detail.enCours.length + detail.aVenir.length > 0) detail.stations = await chargerStationsLigne(idLigne, signal);
      cacheDetails.set(idLigne, { at: Date.now(), detail });
      return detail;
    })().finally(() => { detailsEnCours.delete(idLigne); });
    detailsEnCours.set(idLigne, enCours);
  }
  return enCours;
}

// Oublie le détail gardé d'une ligne (pour forcer une relecture).
export function oublierDetailLigne(idLigne: string) { cacheDetails.delete(idLigne); }

// Charge le détail d'une ligne à l'avance, sans rien afficher ni signaler d'erreur.
export function prechargerDetailLigne(idLigne: string): void {
  chargerDetailLigne(idLigne).catch(() => {});
}
