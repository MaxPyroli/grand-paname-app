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

// Ordre d'affichage des modes dans l'aperçu.
export const ORDRE_MODES: ModeTrafic[] = ['RER', 'TRAIN', 'METRO', 'TRAM', 'CABLE'];
export const LIBELLE_MODE: Record<ModeTrafic, string> = {
  RER: 'RER', TRAIN: 'Transilien', METRO: 'Métro', TRAM: 'Tramway', CABLE: 'Câble',
};

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
  const modes = ['Metro', 'RapidTransit', 'LocalTrain', 'Tramway', 'Funicular'];
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

// État d'une ligne : la plus grave des perturbations EN COURS qui visent la ligne elle-même
// (pas un arrêt de la ligne : une panne d'ascenseur ne rend pas la ligne perturbée).
// `BLOQUANTE` = interrompu, `PERTURBEE` = perturbé, `INFORMATION` = rien à signaler.
export function etatDesLignes(lignes: LigneBrute[], bulk: any, maintenant = Date.now()): LigneTrafic[] {
  const perturbations = new Map<string, any>();
  for (const p of bulk?.disruptions || []) perturbations.set(p.id, p);

  const ciblees = new Map<string, Set<string>>(); // id de ligne → ids de perturbations qui la visent
  for (const l of bulk?.lines || []) {
    for (const o of l.impactedObjects || []) {
      if (o.type !== 'line') continue;
      const ens = ciblees.get(o.id) ?? new Set<string>();
      (o.disruptionIds || []).forEach((id: string) => ens.add(id));
      ciblees.set(o.id, ens);
    }
  }

  return lignes.map(l => {
    let etat: EtatTrafic = 'normal';
    let nb = 0;
    for (const id of ciblees.get(l.id) ?? []) {
      const p = perturbations.get(id);
      if (!p) continue;
      const periodes: any[] = p.applicationPeriods || [];
      const enCours = periodes.length === 0 || periodes.some(x => dateNavitia(x.begin) <= maintenant && maintenant <= dateNavitia(x.end));
      if (!enCours) continue;
      const nv: EtatTrafic = p.severity === 'BLOQUANTE' ? 'interrompu' : p.severity === 'PERTURBEE' ? 'perturbe' : 'normal';
      if (nv === 'normal') continue;
      nb++;
      if (nv === 'interrompu' || etat === 'normal') etat = nv;
    }
    return { ...l, etat, nbPerturbations: nb };
  });
}

// Toutes les lignes lourdes avec leur état, triées par mode puis par code.
export async function chargerTrafic(signal?: AbortSignal): Promise<LigneTrafic[]> {
  const [lignes, bulk] = await Promise.all([chargerLignesLourdes(signal), chargerPerturbations(signal)]);
  return etatDesLignes(lignes, bulk).sort((a, b) =>
    ORDRE_MODES.indexOf(a.mode) - ORDRE_MODES.indexOf(b.mode) || comparerCodes(a.code, b.code));
}

// Force une relecture (tirer pour actualiser) : vide les caches de perturbations.
export function oublierPerturbations() { cachePerturbations = null; }
