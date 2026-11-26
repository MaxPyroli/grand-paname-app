// Info trafic — version SIMPLE (étape 1 du plan de la 3.4.0) : une requête pour la liste des lignes
// lourdes, une requête pour toutes les perturbations du réseau, et on croise les deux.
// Pas encore de nettoyage des textes ni de détail : seulement « quel est l'état de chaque ligne ? ».
import { NAVITIA_BASE, NAVITIA_KEY } from './constants';
import { modeDepuisCommercialMode } from './api';

const URL_PERTURBATIONS = 'https://prim.iledefrance-mobilites.fr/marketplace/disruptions_bulk/disruptions/v2';
const TTL_PERTURBATIONS_MS = 60_000;
const TTL_LIGNES_MS = 24 * 3600 * 1000;

// `travaux` = des travaux EN COURS qui touchent la ligne en ce moment (les travaux prévus plus tard ne comptent pas), sans
// incident en direct par-dessus.
export type EtatTrafic = 'normal' | 'info' | 'travaux' | 'perturbe' | 'interrompu';
export type ModeTrafic = 'RER' | 'TRAIN' | 'METRO' | 'TRAM' | 'CABLE' | 'BUS';

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

// État d'une ligne : la plus grave des perturbations EN COURS qui la touchent. MÊMES RÈGLES que le détail d'une ligne
// (`analyserDetailLigne`), pour que le point de la liste et le type affiché dans le détail ne se contredisent pas :
//   gravité « bloquante » sur la ligne → interrompu ; « bloquante » sur un arrêt (station fermée…) → perturbé ;
//   cause « information » (match, manifestation) → info ; « perturbée » → perturbé ; « information » → info.
//   Exception étroite : un titre qui commence par « Traffic interrupted » (la version anglaise du flux en masse de
//   « Trafic interrompu ») est une interruption même codé « perturbée ».
// Le flux ne contient aucune panne d'ascenseur ou d'escalator (vérifié : 0 sur plus de 1 000 perturbations).
const RANG_ETAT: Record<EtatTrafic, number> = { normal: 0, info: 1, travaux: 2, perturbe: 3, interrompu: 4 };
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
      let nv: EtatTrafic = p.severity === 'BLOQUANTE' ? (surLaLigne ? 'interrompu' : 'perturbe')
        : p.cause === 'INFORMATION' ? 'info'
        : p.severity === 'PERTURBEE' ? 'perturbe' : 'info';
      if (nv === 'perturbe' && surLaLigne && /^\s*traffic\s+interrupted/i.test(String(p.title || ''))) nv = 'interrompu';
      nb++;
      // Des travaux en cours ne sont ni un incident ni une interruption « en direct » : ils ont leur propre état, plus
      // faible qu'un incident en direct (la ligne affiche l'incident s'il y en a un) et plus fort qu'une simple info.
      if (p.cause === 'TRAVAUX') nv = 'travaux';
      if (RANG_ETAT[nv] > RANG_ETAT[etat]) etat = nv;
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

// ── Recherche d'une ligne de bus ───────────────────────────────────────────────
// Les bus ne sont pas dans la liste (plus de 1 800 lignes) : on les cherche à la demande par leur numéro
// (`pt_objects`, une petite requête), puis on calcule leur état avec les perturbations déjà en cache (60 s).
export async function rechercherLignesBus(texte: string, signal?: AbortSignal): Promise<LigneTrafic[]> {
  const q = texte.trim();
  if (q === '') return [];
  const r = await fetch(`${NAVITIA_BASE}/pt_objects?q=${encodeURIComponent(q)}&type%5B%5D=line&count=15&disable_disruption=true`, { headers: { apiKey: NAVITIA_KEY }, signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  const brutes: LigneBrute[] = (d.pt_objects || [])
    .map((o: any) => o.line)
    .filter((l: any) => l && (l.physical_modes || []).some((m: any) => String(m.id).includes('Bus')))
    .map((l: any) => ({ id: l.id, code: l.code || l.name, color: l.color || '888888', textColor: l.text_color || 'FFFFFF', mode: 'BUS' as ModeTrafic }))
    // Le numéro exact d'abord (« 104 » avant « 1104 »), puis par ordre naturel.
    .sort((a: LigneBrute, b: LigneBrute) => (b.code.toLowerCase() === q.toLowerCase() ? 1 : 0) - (a.code.toLowerCase() === q.toLowerCase() ? 1 : 0) || comparerCodes(a.code, b.code));
  if (brutes.length === 0) return [];
  // Sans les perturbations (réseau en panne), les bus sont affichés « normaux » plutôt que de masquer le résultat.
  const bulk = await chargerPerturbations(signal).catch(() => null);
  return etatDesLignes(brutes, bulk);
}

// Une ligne de BUS d'après son identifiant (toucher d'une notification : les bus ne sont pas dans la liste des lignes),
// avec son état d'après les perturbations. Null si ce n'est pas un bus connu.
export async function chargerLigneBus(id: string, signal?: AbortSignal): Promise<LigneTrafic | null> {
  const r = await fetch(`${NAVITIA_BASE}/lines/${encodeURIComponent(id)}?depth=1&disable_geojson=true&disable_disruption=true`, { headers: { apiKey: NAVITIA_KEY }, signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const l = ((await r.json()).lines || [])[0];
  if (!l || !(l.physical_modes || []).some((m: any) => String(m.id).includes('Bus'))) return null;
  const brute: LigneBrute = { id: l.id, code: l.code || l.name, color: l.color || '888888', textColor: l.text_color || 'FFFFFF', mode: 'BUS' };
  const bulk = await chargerPerturbations(signal).catch(() => null);
  return etatDesLignes([brute], bulk)[0];
}

// État des bus suivis (numéro et couleurs gardés sur le téléphone), d'après les perturbations. Sans réseau : « normal ».
export async function etatDesBus(bus: { id: string; code: string; color: string; textColor: string }[]): Promise<LigneTrafic[]> {
  const brutes: LigneBrute[] = bus.map(b => ({ id: b.id, code: b.code, color: b.color, textColor: b.textColor, mode: 'BUS' as const }))
    .sort((a, b) => comparerCodes(a.code, b.code));
  const bulk = await chargerPerturbations().catch(() => null);
  return etatDesLignes(brutes, bulk);
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
export type TypePerturbation = 'interrompu' | 'perturbe' | 'info';

export type PerturbationLigne = {
  id: string;
  titre: string;
  texte: string;
  cause: CausePerturbation;
  niveau: NiveauPerturbation;
  type: TypePerturbation;
  enCours: boolean;
  debut: number;
  fin: number;
  periode: string;   // « Jusqu'au 19 décembre », « À partir du 12 octobre »…
  miseAJour: number | null;   // dernière mise à jour de l'annonce par l'exploitant (ms), si connue
  // Annonce notifiée puis terminée : reconstruite depuis la mémoire des alertes reçues (voir TraficDetail) ; `miseAJour` = heure de réception.
  terminee?: boolean;
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

// Mention courte : « Mis à jour à 13:52 » le jour même, « Mis à jour le 24/11 à 13:52 » sinon.
export function libelleMiseAJour(t: number, prefixe = 'Mis à jour', maintenant = Date.now()): string {
  const d = new Date(t);
  const deux = (n: number) => String(n).padStart(2, '0');
  const jour = d.toDateString() === new Date(maintenant).toDateString() ? '' : ` le ${deux(d.getDate())}/${deux(d.getMonth() + 1)}`;
  return `${prefixe}${jour} à ${deux(d.getHours())}:${deux(d.getMinutes())}`;
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
    // Trois types seulement (décision de l'utilisateur), d'après la gravité du serveur :
    //   bloquante sur la LIGNE → interrompu ; bloquante sur un ARRÊT (station fermée, arrêt non desservi) → perturbé ;
    //   perturbée → perturbé (quelle que soit l'étiquette : « fortement perturbé », « arrêts non desservis »…) ;
    //   information → info. Vérifié : « bloquante » sur la ligne = trafic réellement interrompu (32 cas sur 32).
    const surLaLigne = ((d.impacted_objects || []) as any[]).some(o => o?.pt_object?.embedded_type === 'line');
    //   Une annonce de cause « information » (match, manifestation…) est une info, même codée « perturbée » ;
    //   « bloquante » reste « interrompu » même avec cette cause (ex. T14 : météo, service interrompu).
    let type: TypePerturbation = nom === 'bloquante' ? (surLaLigne ? 'interrompu' : 'perturbe')
      : d.cause === 'information' ? 'info'
      : nom === 'perturbée' ? 'perturbe' : 'info';
    // Seule exception au code, étroite : un TITRE qui commence par « Trafic interrompu » (ex. T13 « Trafic interrompu -
    // panne de courant », codé « perturbée » par erreur) est une interruption. Le corps du texte n'est jamais lu.
    if (type === 'perturbe' && /^\s*trafic\s+interrompu\b/i.test(titre)) type = 'interrompu';
    const cause: CausePerturbation = d.cause === 'travaux' ? 'travaux' : d.cause === 'information' ? 'information' : 'perturbation';
    const periode = enCours
      ? (fin - maintenant > JOURS_SANS_FIN * 86_400_000 ? 'Jusqu\'à nouvel ordre' : `Jusqu'au ${jourMois(fin - 6 * 3_600_000)}`)   // une fin à 4 h 30 est la fin de la veille (journée de service)
      : `À partir du ${jourMois(debut)}`;

    // Une même annonce est souvent publiée plusieurs fois (une par période) : on la garde une fois.
    const cle = titre + '|' + texte;
    const miseAJour = /^\d{8}T\d{6}$/.test(d.updated_at || '') ? dateNavitia(d.updated_at) : null;
    const existante = parId.get(cle);
    if (existante) {
      if (miseAJour !== null) existante.miseAJour = Math.max(existante.miseAJour ?? 0, miseAJour);
      existante.enCours = existante.enCours || enCours;
      existante.debut = Math.min(existante.debut, debut);
      existante.fin = Math.max(existante.fin, fin);
      if (existante.enCours) existante.periode = enCours ? periode : existante.periode;
      continue;
    }
    parId.set(cle, { id: d.id || cle, titre, texte: texte === titre ? '' : texte, cause, niveau, type, enCours, debut, fin, periode, miseAJour });
  }
  const rangCause: Record<CausePerturbation, number> = { perturbation: 0, travaux: 1, information: 2 };
  const gravite: Record<TypePerturbation, number> = { interrompu: 0, perturbe: 1, info: 2 };
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
// Un détail vu il y a moins de 3 minutes s'affiche tout de suite ; au-delà d'une minute il est relu en arrière-plan et
// l'écran se met à jour quand la réponse arrive (voir `chargerDetailLigne`, qui ne réutilise que les données de moins d'une minute).
const DUREE_AFFICHAGE_DETAIL_MS = 3 * 60_000;
export function detailEnCache(idLigne: string): DetailLigne | null {
  const connu = cacheDetails.get(idLigne);
  return connu && Date.now() - connu.at < DUREE_AFFICHAGE_DETAIL_MS ? connu.detail : null;
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
      // Les stations de la ligne (pour les contours) sont demandées EN MÊME TEMPS que les perturbations, pas après : une
      // requête de moins dans la file d'attente (elles sont gardées 24 h, donc presque toujours déjà là).
      const stationsEnParallele = chargerStationsLigne(idLigne, signal);
      // Le serveur répond « 429 » (trop de requêtes) si on en envoie trop vite, et parfois 5xx : on réessaie
      // jusqu'à 3 fois en espaçant, plutôt que d'afficher une erreur ou un détail vide.
      const t0 = Date.now();
      let r: Response | null = null;
      for (let essai = 0; essai < 4; essai++) {
        r = await fetch(`${NAVITIA_BASE}/lines/${encodeURIComponent(idLigne)}/line_reports?count=200&depth=0`, { headers: { apiKey: NAVITIA_KEY }, signal });
        if (r.ok || r.status === 404 || (r.status !== 429 && r.status < 500)) break;
        await new Promise(res => setTimeout(res, 400 * (essai + 1)));
      }
      if (!r || (!r.ok && r.status !== 404)) throw new Error(`HTTP ${r?.status}`);
      const t1 = Date.now();
      const json = r.ok ? await r.json() : {};
      const t2 = Date.now();
      const detail = analyserDetailLigne(json);
      // Les stations ne servent qu'à repérer des noms dans les textes : inutile s'il n'y a aucun texte.
      if (detail.enCours.length + detail.aVenir.length > 0) detail.stations = await stationsEnParallele;
      cacheDetails.set(idLigne, { at: Date.now(), detail });
      // Mesure (développement seulement) : où part le temps sur le téléphone ? `adb logcat -s ReactNativeJS`
      if (__DEV__) console.log(`[trafic] détail ${idLigne} : réseau ${t1 - t0} ms, lecture JSON ${t2 - t1} ms, analyse + stations ${Date.now() - t2} ms`);
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
