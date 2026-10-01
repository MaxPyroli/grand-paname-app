import { useEffect, useState, useCallback, useMemo, memo, startTransition, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet, ToastAndroid, Platform, Animated, Easing, ScrollView, FlatList } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { NAVITIA_BASE, NAVITIA_KEY } from './constants';
import { useColors } from './theme';
import { modeDepuisCommercialMode, comparerLignesParMode } from './api';
import { GEOGRAPHIE_RER, TOPOLOGIE_LIGNES, normaliserGare } from './lignesData';
import { GHOST_STOP_ID } from './ghostStop';
import { MODE_ICONS } from './modeIcons';

// Codes à une lettre RER/Transilien connus (utilisé pour repérer les bus de
// substitution, qui reprennent le même code que la ligne lourde remplacée).
const RAIL_CODES = new Set(Object.keys(GEOGRAPHIE_RER));
const RER_LETTERS = new Set(['A', 'B', 'C', 'D', 'E']);

// ── Types ────────────────────────────────────────────────────────────────────

type Depart = {
  valTri: number;
  affichage: string;
  couleurTemps: string;
  heure: string;
};

type DestGroupe = {
  destination: string;
  departs: Depart[];
  // Vrai quand l'unique départ affiché est au-delà du seuil "proche"
  // (62 min / 122 min Noctilien) : on préfère alors afficher son heure
  // ("Premier départ : hh:mm") plutôt qu'un compte à rebours du genre
  // "174 min", peu lisible pour un départ aussi lointain.
  premierLointain?: boolean;
};

type DepartAvecDest = {
  dest: string;
  depart: Depart;
};

type DirectionGroupe = {
  label: string;
  items: DepartAvecDest[];
};

type LigneGroupe = {
  key: string;
  code: string;
  color: string;
  textColor: string;
  mode: string;
  directions?: DirectionGroupe[];
  destinations: DestGroupe[];
  // Bus de remplacement d'une ligne RER/Train (même code, ex: "D" pour le
  // RER D) — affiché comme une carte bus à part entière, distincte de la
  // carte RER/Train (voir RAIL_CODES).
  isSubstitution?: boolean;
  // Identifiant Navitia de la ligne (sert à interroger ses perturbations).
  lineId?: string;
  // État de fonctionnement (câble/funiculaire pour l'instant : les horaires y
  // sont théoriques, donc sans cette info on afficherait des départs même à
  // l'arrêt). Voir fetchEtatLigne.
  etat?: EtatLigne;
};

type EtatLigne = {
  niveau: 'ok' | 'perturbe' | 'arret' | 'inconnu';
  message?: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseNavitiaDate(s: string): Date {
  const y = +s.slice(0, 4), mo = +s.slice(4, 6) - 1, d = +s.slice(6, 8);
  const h = +s.slice(9, 11), mn = +s.slice(11, 13), sec = +s.slice(13, 15);
  return new Date(y, mo, d, h, mn, sec);
}

function computeValTri(dateStr: string, capMinutes = 120): number {
  const dep = parseNavitiaDate(dateStr);
  const delta = Math.round((dep.getTime() - Date.now()) / 60000);
  if (delta > capMinutes) return 3000;
  return delta;
}

function heureDepuis(dateStr: string): string {
  const dep = parseNavitiaDate(dateStr);
  return `${String(dep.getHours()).padStart(2, '0')}:${String(dep.getMinutes()).padStart(2, '0')}`;
}

function formatTemps(valTri: number): { texte: string; couleur: string } {
  if (valTri >= 3000) return { texte: 'Terminé', couleur: '#6b7280' };
  if (valTri <= 0) return { texte: 'À quai', couleur: '#ef4444' };
  if (valTri === 1) return { texte: 'À l\'approche', couleur: '#f97316' };
  if (valTri < 5) return { texte: `${valTri} min`, couleur: '#f97316' };
  return { texte: `${valTri} min`, couleur: '#22c55e' };
}

function computeContrast(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#000000' : '#ffffff';
}

// ── Direction RER/Train ───────────────────────────────────────────────────────

// Cherche dans la route l'entrée dont le fragment matché est le plus long
// (évite qu'un fragment court comme "COLOMBES" prenne le pas sur "BOIS COLOMBES"
// juste parce qu'il apparaît avant dans le tableau)
function meilleurIndex(route: string[], gareN: string): number {
  let best = -1;
  let bestLen = -1;
  for (let i = 0; i < route.length; i++) {
    if (gareN.includes(route[i]) && route[i].length > bestLen) {
      best = i;
      bestLen = route[i].length;
    }
  }
  return best;
}

function calculerDirectionRelative(code: string, maGare: string, terminus: string): 0 | 1 | null {
  const ligne = TOPOLOGIE_LIGNES[code];
  if (!ligne) return null;
  const gareN = normaliserGare(maGare);
  const termN = normaliserGare(terminus);
  for (const route of ligne.routes) {
    const idxDep  = meilleurIndex(route, gareN);
    const idxTerm = meilleurIndex(route, termN);
    if (idxDep !== -1 && idxTerm !== -1) {
      return idxTerm > idxDep ? 1 : 0;
    }
  }
  return null;
}

function buildDirections(code: string, stopName: string, dests: Map<string, Depart[]>): DirectionGroupe[] {
  const allDeparts: DepartAvecDest[] = [];
  for (const [dest, departs] of dests) {
    for (const d of departs) {
      if (d.valTri < 3000) allDeparts.push({ dest, depart: d });
    }
  }
  allDeparts.sort((a, b) => a.depart.valTri - b.depart.valTri);

  const geo = GEOGRAPHIE_RER[code];
  if (!geo) {
    return [{ label: '', items: allDeparts.slice(0, 4) }];
  }

  const stopN = normaliserGare(stopName);

  let mots1 = [...geo.mots_1];
  let mots2 = [...geo.mots_2];

  // Ajustements contextuels RER C : nord de Paris → INVALIDES devient direction EST
  if (code === 'C') {
    const zoneNord = ['MAILLOT','PEREIRE','CLICHY','OUEN','GENNEVILLIERS','ERMONT','PONTOISE','FOCH','MARTIN','BOULAINVILLIERS','KENNEDY','JAVEL','GARIGLIANO'];
    if (zoneNord.some(k => stopN.includes(k))) {
      mots1 = mots1.filter(m => m !== 'INVALIDES');
      if (!mots2.includes('INVALIDES')) mots2 = [...mots2, 'INVALIDES'];
    }
  }
  // Ajustements contextuels RER D : nord de Paris → GARE DE LYON devient direction SUD
  if (code === 'D') {
    const zoneNord = ['CREIL','ORRY','COYE','SURVILLIERS','FOSSES','LOUVRES','GOUSSAINVILLE','VILLIERS LE BEL','GARGES','SARCELLES','PIERREFITTE','STAINS','SAINT DENIS','STADE DE FRANCE','NORD'];
    if (zoneNord.some(k => stopN.includes(k))) {
      mots2 = mots2.filter(m => m !== 'GARE DE LYON');
      if (!mots1.includes('GARE DE LYON')) mots1 = [...mots1, 'GARE DE LYON'];
    }
  }

  const p1: DepartAvecDest[] = [];
  const p2: DepartAvecDest[] = [];
  const p3: DepartAvecDest[] = [];

  for (const item of allDeparts) {
    const termN = normaliserGare(item.dest);
    const dir = calculerDirectionRelative(code, stopName, item.dest);
    if (dir === 0) p1.push(item);
    else if (dir === 1) p2.push(item);
    else if (mots1.some(m => termN.includes(normaliserGare(m)))) p1.push(item);
    else if (mots2.some(m => termN.includes(normaliserGare(m)))) p2.push(item);
    else p3.push(item);
  }

  const directions: DirectionGroupe[] = [];

  if (!geo.term_1.some(t => stopN.includes(normaliserGare(t)))) {
    directions.push({ label: geo.labels[0], items: p1.slice(0, 4) });
  }
  if (!geo.term_2.some(t => stopN.includes(normaliserGare(t)))) {
    directions.push({ label: geo.labels[1], items: p2.slice(0, 4) });
  }
  if (p3.length > 0) {
    directions.push({ label: 'AUTRES DIRECTIONS', items: p3.slice(0, 4) });
  }

  return directions;
}

// ── Données fantôme (mode dev) ────────────────────────────────────────────────

const GHOST_LIGNES_BASE: LigneGroupe[] = [
  // RER A — 2 directions actives
  {
    key: 'A|E2231A', code: 'A', color: 'E2231A', textColor: '#ffffff', mode: 'RER',
    directions: [
      { label: 'vers Brie-Comte-Robert', items: [
        { dest: 'Brie-Comte-Robert', depart: { valTri: 3,  affichage: '3 min',  couleurTemps: '#f97316', heure: '09:15' } },
        { dest: 'Brie-Comte-Robert',                    depart: { valTri: 11, affichage: '11 min', couleurTemps: '#22c55e', heure: '09:23' } },
      ]},
      { label: 'vers Cergy / Poissy / Saint-Germain', items: [
        { dest: 'Cergy-le-Haut',         depart: { valTri: 6,  affichage: '6 min',  couleurTemps: '#22c55e', heure: '09:18' } },
        { dest: 'Saint-Germain-en-Laye', depart: { valTri: 14, affichage: '14 min', couleurTemps: '#22c55e', heure: '09:26' } },
      ]},
    ],
    destinations: [],
  },
  // RER F — 1 direction active, 1 terminée
  {
    key: 'F|FF6600', code: 'F', color: 'FF6600', textColor: '#ffffff', mode: 'RER',
    directions: [
      { label: 'vers Saint-Martin-de-Ré', items: [
        { dest: 'Saint-Pierre-des-Corps', depart: { valTri: 8,  affichage: '8 min',  couleurTemps: '#22c55e', heure: '09:20' } },
        { dest: 'Saint-Martin-de-Ré', depart: { valTri: 23, affichage: '23 min', couleurTemps: '#22c55e', heure: '09:35' } },
      ]},
      { label: 'vers La-Trinité-des-Laitiers', items: [] },
    ],
    destinations: [],
  },
  // Train W — terminé sur les 2 directions
  {
    key: 'W|E4007C', code: 'W', color: 'E4007C', textColor: '#ffffff', mode: 'TRAIN',
    directions: [
      { label: 'vers Rambouillet',      items: [] },
      { label: 'vers Paris-Montparnasse', items: [] },
    ],
    destinations: [],
  },
  // Métro 18 — 2 destinations actives
  {
    key: '18|00a093', code: '18', color: '00a093', textColor: '#ffffff', mode: 'METRO',
    directions: undefined,
    destinations: [
      { destination: 'Versailles-Chantiers', departs: [
        { valTri: 1, affichage: 'Approche', couleurTemps: '#f97316', heure: '09:13' },
        { valTri: 7, affichage: '7 min',    couleurTemps: '#22c55e', heure: '09:19' },
      ]},
      { destination: 'Boissy-Saint-Léger', departs: [
        { valTri: 4, affichage: '4 min', couleurTemps: '#f97316', heure: '09:16' },
        { valTri: 9, affichage: '9 min', couleurTemps: '#22c55e', heure: '09:21' },
      ]},
    ],
  },
  // Métro 19 — À quai
  {
    key: '19|D5A800', code: '19', color: 'D5A800', textColor: '#000000', mode: 'METRO',
    directions: undefined,
    destinations: [
      { destination: 'Saint-Denis Pleyel', departs: [
        { valTri: 0, affichage: 'À quai', couleurTemps: '#ef4444', heure: '09:12' },
        { valTri: 6, affichage: '6 min',  couleurTemps: '#22c55e', heure: '09:18' },
      ]},
    ],
  },
  // Tram T15 — 1 dest active, 1 terminée
  {
    key: 'T15|003DA5', code: 'T15', color: '003DA5', textColor: '#ffffff', mode: 'TRAM',
    directions: undefined,
    destinations: [
      { destination: 'Noisy-le-Sec', departs: [
        { valTri: 5,    affichage: '5 min',   couleurTemps: '#22c55e', heure: '09:17' },
        { valTri: 13,   affichage: '13 min',  couleurTemps: '#22c55e', heure: '09:25' },
      ]},
      { destination: 'Pont de Rungis', departs: [
        { valTri: 3000, affichage: 'Terminé', couleurTemps: '#6b7280', heure: '--:--' },
      ]},
    ],
  },
  // Câble C1 — en fonctionnement (affiche la fréquence)
  {
    key: 'C1|00A3E0', code: 'C1', color: '00A3E0', textColor: '#ffffff', mode: 'CABLE',
    directions: undefined,
    etat: { niveau: 'ok' },
    destinations: [
      { destination: 'Villa Nova', departs: [
        { valTri: 1, affichage: 'À l\'approche', couleurTemps: '#f97316', heure: '09:13' },
      ]},
    ],
  },
  // Câble C2 — perturbé
  {
    key: 'C2|F8A01D', code: 'C2', color: 'F8A01D', textColor: '#000000', mode: 'CABLE',
    directions: undefined,
    etat: { niveau: 'perturbe', message: 'Vitesse réduite, temps d\'attente allongé entre chaque cabine.' },
    destinations: [
      { destination: 'Fort d\'Aubervilliers', departs: [
        { valTri: 3,  affichage: '3 min',  couleurTemps: '#f97316', heure: '09:15' },
        { valTri: 11, affichage: '11 min', couleurTemps: '#22c55e', heure: '09:23' },
      ]},
    ],
  },
  // Câble C3 — à l'arrêt
  {
    key: 'C3|8B5CF6', code: 'C3', color: '8B5CF6', textColor: '#ffffff', mode: 'CABLE',
    directions: undefined,
    etat: { niveau: 'arret', message: 'Arrêt de la ligne pour cause d\'incident technique. Reprise du service prévue dans la soirée, merci de votre compréhension.' },
    destinations: [
      { destination: 'Terminus fictif', departs: [
        { valTri: 2, affichage: '2 min', couleurTemps: '#f97316', heure: '09:14' },
      ]},
    ],
  },
  // Bus 423 — actif
  {
    key: '423|0066CC', code: '423', color: '0066CC', textColor: '#ffffff', mode: 'BUS',
    directions: undefined,
    destinations: [
      { destination: 'Villecresnes - Mairie', departs: [
        { valTri: 7,  affichage: '7 min',  couleurTemps: '#22c55e', heure: '09:19' },
        { valTri: 19, affichage: '19 min', couleurTemps: '#22c55e', heure: '09:31' },
        { valTri: 32, affichage: '32 min', couleurTemps: '#22c55e', heure: '09:44' },
      ]},
    ],
  },
  // Bus 9467 — terminé → filtré de la liste, Toast si clic sur chip
  {
    key: '9467|0066CC', code: '9467', color: '0066CC', textColor: '#ffffff', mode: 'BUS',
    directions: undefined,
    destinations: [
      { destination: 'Boissy-Saint-Léger RER', departs: [
        { valTri: 3000, affichage: 'Terminé', couleurTemps: '#6b7280', heure: '--:--' },
      ]},
    ],
  },
  // Noctilien N67 — actif
  {
    key: 'N67|003189', code: 'N67', color: '003189', textColor: '#ffffff', mode: 'BUS',
    directions: undefined,
    destinations: [
      { destination: 'Gare de Lyon', departs: [
        { valTri: 18, affichage: '18 min', couleurTemps: '#22c55e', heure: '09:30' },
        { valTri: 42, affichage: '42 min', couleurTemps: '#22c55e', heure: '09:54' },
      ]},
    ],
  },
  // Bus F (remplacement RER F) — actif
  {
    key: 'F-BUS|FF6600', code: 'F', color: 'FF6600', textColor: '#ffffff', mode: 'BUS',
    directions: undefined,
    destinations: [
      { destination: 'Creil (remplacement RER F)', departs: [
        { valTri: 10, affichage: '10 min', couleurTemps: '#22c55e', heure: '09:22' },
        { valTri: 25, affichage: '25 min', couleurTemps: '#22c55e', heure: '09:37' },
      ]},
    ],
  },
];

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchDepartures(url: string, signal: AbortSignal): Promise<any[]> {
  const r = await fetch(url, { headers: { apiKey: NAVITIA_KEY }, signal });
  // Navitia renvoie un vrai HTTP 404 (avec un corps JSON valide, departures:[])
  // quand il ne trouve strictement aucun départ pour la fenêtre demandée —
  // ce n'est pas une vraie erreur, juste "aucun résultat", donc on ne le
  // traite pas comme un échec.
  if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return data?.departures || [];
}

// Cache court par ligne : l'état d'une ligne bouge rarement, inutile de le
// redemander à chaque rafraîchissement des horaires (toutes les 15 s).
const etatLigneCache = new Map<string, { at: number; etat: EtatLigne }>();
const ETAT_LIGNE_TTL_MS = 60_000;

const ORDRE_ETAT: Record<EtatLigne['niveau'], number> = { inconnu: 0, ok: 1, perturbe: 2, arret: 3 };

// Perturbations en cours sur une ligne (info trafic Navitia/IDFM). Seules
// comptent celles qui visent la ligne elle-même, actives à cet instant : une
// panne d'ascenseur dans une gare ne dit rien du fonctionnement de la ligne.
async function fetchEtatLigne(lineId: string, signal: AbortSignal): Promise<EtatLigne> {
  const cache = etatLigneCache.get(lineId);
  if (cache && Date.now() - cache.at < ETAT_LIGNE_TTL_MS) return cache.etat;

  const r = await fetch(`${NAVITIA_BASE}/lines/${encodeURIComponent(lineId)}/line_reports?count=20`, { headers: { apiKey: NAVITIA_KEY }, signal });
  // 404 = aucune perturbation connue pour cette ligne.
  if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`);
  const data = r.ok ? await r.json() : {};

  const now = Date.now();
  let niveau: EtatLigne['niveau'] = 'ok';
  let message: string | undefined;
  for (const d of data?.disruptions || []) {
    if (d.status && d.status !== 'active') continue;
    const periodes: any[] = d.application_periods || [];
    const enCours = periodes.length === 0 || periodes.some(p =>
      parseNavitiaDate(p.begin).getTime() <= now && now <= parseNavitiaDate(p.end).getTime());
    if (!enCours) continue;
    const visePLigne = (d.impacted_objects || []).length === 0 ||
      (d.impacted_objects || []).some((o: any) => o?.pt_object?.embedded_type === 'line' && o?.pt_object?.id === lineId);
    if (!visePLigne) continue;
    const effet: string = d.severity?.effect || '';
    if (effet === 'ADDITIONAL_SERVICE') continue;
    const nv: EtatLigne['niveau'] = effet === 'NO_SERVICE' ? 'arret' : 'perturbe';
    if (ORDRE_ETAT[nv] > ORDRE_ETAT[niveau]) {
      niveau = nv;
      const texte: string | undefined = (d.messages || []).find((m: any) => m?.text)?.text;
      message = texte ? texte.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined;
    }
  }
  const etat: EtatLigne = { niveau, message };
  etatLigneCache.set(lineId, { at: Date.now(), etat });
  return etat;
}

async function fetchLignes(stopId: string, stopName: string, signal: AbortSignal): Promise<LigneGroupe[]> {
  const base = `${NAVITIA_BASE}/stop_areas/${stopId}/departures`;

  // Dans les gares très fréquentées par le bus/Noctilien (ex: Saint-Lazare la
  // nuit), les rares départs RER/Train/Métro peuvent se retrouver noyés
  // au-delà du compteur global de 100 et disparaître complètement, comme si
  // le service était terminé alors qu'il ne l'est pas. On ajoute donc un
  // appel dédié qui exclut le bus, à l'abri de ce bruit.
  const [tousDeparts, departsRail] = await Promise.all([
    fetchDepartures(`${base}?count=100`, signal),
    fetchDepartures(`${base}?count=30&forbidden_uris[]=physical_mode:Bus`, signal),
  ]);

  const vus = new Set<string>();
  const departures: any[] = [];
  for (const d of [...tousDeparts, ...departsRail]) {
    const cle = `${d.route?.line?.code || ''}|${d.stop_date_time?.departure_date_time || ''}|${d.display_informations?.direction || ''}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    departures.push(d);
  }

  const lignesMap = new Map<string, { code: string; color: string; textColor: string; mode: string; isSubstitution: boolean; lineId?: string; dests: Map<string, Depart[]> }>();

  for (const d of departures) {
    const info = d.stop_date_time;
    if (!info) continue;
    const dateStr: string = info.departure_date_time || '';
    if (!dateStr) continue;

    const route = d.route || {};
    const line = route.line || {};
    const code: string = line.code || line.name || '?';
    const color: string = line.color || '888888';
    const textColor: string = line.text_color ? `#${line.text_color}` : computeContrast(color);
    const mode: string = modeDepuisCommercialMode(line.commercial_mode?.id || '');
    const dest: string = (d.display_informations?.direction || route.name || '?').replace(/\s*\([^)]+\)$/, '');

    // Bus de substitution RER/Train (ex: ligne "D" en remplacement du RER D) :
    // reprend le code à une lettre de la ligne lourde qu'il remplace. On le
    // garde comme carte bus à part (voir isSubstitution plus bas), séparée
    // de la carte RER/Train grâce à la clé incluant le mode.
    // Un simple code à une lettre ne suffit pas : certaines gares (ex: Massy)
    // ont de vraies lignes de bus dont le code coïncide avec une lettre de
    // RER/Transilien (A-E, H, J, K, L, N, P, R, U, V), sans aucun rapport
    // avec un remplacement. On exige donc en plus que le réseau du départ
    // évoque du rail (RER/Transilien/SNCF) — absent de la réponse pour un bus
    // "normal" de la RATP/Transdev/etc. Si le champ réseau est manquant côté
    // Navitia, on reste permissif (comportement d'avant) plutôt que de
    // désactiver la détection silencieusement.
    const network = String(d.display_informations?.network || line.network?.name || '');
    const looksLikeRailNetwork = !network || /RER|Transilien|SNCF/i.test(network);
    const isSubstitution = mode === 'BUS' && RAIL_CODES.has(code) && looksLikeRailNetwork;

    // Les Noctiliens et les bus de substitution sont peu fréquents : un
    // départ réel tombe facilement au-delà de 3h, il ne faut pas l'exclure
    // pour autant. Noctilien détecté via le préfixe "N" + chiffres (N01,
    // N153...) pour ne pas mordre sur les bus de substitution comme la ligne
    // "D" (remplacement RER D). Les bus classiques restent cappés à 3h
    // (RER/Train à 2h) : au-delà, le calcul est cappé (valTri=3000) et donc
    // exclu partout en aval.
    const isNocti = mode === 'BUS' && /^N\d/.test(code);
    const capMinutes = (isNocti || isSubstitution) ? 720 : (mode === 'BUS' ? 180 : 120);
    const valTri = computeValTri(dateStr, capMinutes);
    if (valTri < -5) continue;

    const lineKey = `${code}|${color}|${mode}`;
    if (!lignesMap.has(lineKey)) lignesMap.set(lineKey, { code, color, textColor, mode, isSubstitution, lineId: line.id, dests: new Map() });
    const entry = lignesMap.get(lineKey)!;
    if (!entry.dests.has(dest)) entry.dests.set(dest, []);

    const { texte, couleur } = formatTemps(valTri);
    entry.dests.get(dest)!.push({ valTri, affichage: texte, couleurTemps: couleur, heure: heureDepuis(dateStr) });
  }

  const lignes: LigneGroupe[] = [];
  for (const [key, entry] of lignesMap) {
    const isRail = entry.mode === 'RER' || entry.mode === 'TRAIN';

    if (isRail) {
      const directions = buildDirections(entry.code, stopName, entry.dests);
      lignes.push({ key, code: entry.code, color: entry.color, textColor: entry.textColor, mode: entry.mode, directions, destinations: [] });
      continue;
    }

    // Un bus de substitution est traité comme un Noctilien pour le seuil de
    // regroupement (départs espacés, on tolère un plus grand écart avant de
    // couper la liste), mais reste poussé comme sa propre carte "isSubstitution"
    // (voir plus bas, après la boucle) pour ne jamais remplacer la carte
    // RER/Train de la ligne qu'il dessert.
    const destinationIsNocti = entry.isSubstitution || (entry.mode === 'BUS' && /^N\d/.test(entry.code));
    const destinations: DestGroupe[] = [];
    for (const [destination, departs] of entry.dests) {
      // Un départ cappé (valTri >= 3000, à plus de 3h) ne veut pas dire
      // "service terminé" — juste qu'il est trop lointain pour être montré.
      const reels = departs.filter(d => d.valTri < 3000).sort((a, b) => a.valTri - b.valTri);
      const filtered: Depart[] = [];
      // Une fois qu'un départ est déjà affiché, les suivants n'intéressent
      // plus au-delà de 62 min (2h pour les Noctiliens/bus de substitution,
      // plus espacés).
      const seuilSuivant = destinationIsNocti ? 122 : 62;
      for (let i = 0; i < reels.length && filtered.length < 3; i++) {
        if (i > 0 && reels[i].valTri > seuilSuivant) break;
        filtered.push(reels[i]);
      }
      if (filtered.length === 0) continue;
      const premierLointain = filtered.length === 1 && filtered[0].valTri > 62;
      destinations.push({ destination, departs: filtered, premierLointain });
    }
    destinations.sort((a, b) => (a.departs[0]?.valTri ?? 9999) - (b.departs[0]?.valTri ?? 9999));

    const hasNearby = entry.mode === 'BUS' && destinations.some(d => (d.departs[0]?.valTri ?? 9999) < 62);
    const finalDests = hasNearby
      ? destinations.filter(d => (d.departs[0]?.valTri ?? 9999) < 62)
      : destinations;

    lignes.push({ key, code: entry.code, color: entry.color, textColor: entry.textColor, mode: entry.mode, destinations: finalDests, isSubstitution: entry.isSubstitution, lineId: entry.lineId });
  }

  // Un bus de substitution ne doit jamais remplacer la carte RER/Train de la
  // ligne qu'il dessert : si aucun départ réel de cette ligne lourde n'est
  // remonté (service entièrement basculé sur le bus), on affiche quand même
  // sa carte, en "service terminé", à côté de la carte bus.
  const codesRailPresents = new Set(lignes.filter(l => l.mode === 'RER' || l.mode === 'TRAIN').map(l => l.code));
  for (const ligne of lignes.filter(l => l.isSubstitution)) {
    if (codesRailPresents.has(ligne.code)) continue;
    codesRailPresents.add(ligne.code);
    lignes.push({
      key: `${ligne.code}|rail-placeholder`,
      code: ligne.code,
      color: ligne.color,
      textColor: ligne.textColor,
      mode: RER_LETTERS.has(ligne.code) ? 'RER' : 'TRAIN',
      destinations: [],
    });
  }

  // État de fonctionnement des câbles/funiculaires (horaires théoriques : voir
  // fetchEtatLigne). Échec réseau → "inconnu", jamais un faux "ok".
  await Promise.all(lignes.filter(l => l.mode === 'CABLE' && l.lineId).map(async l => {
    let etat: EtatLigne;
    try { etat = await fetchEtatLigne(l.lineId!, signal); }
    catch (e: any) { if (e?.name === 'AbortError') throw e; etat = { niveau: 'inconnu' }; }
    // Aucun départ en pleine journée alors que l'API ne signale rien : on ne
    // dit pas "service terminé", on demande de vérifier (comme l'ancienne
    // version Streamlit, plage 6h-23h).
    const heure = new Date().getHours();
    const aucunDepart = l.destinations.every(d => d.departs.length === 0);
    if (aucunDepart && (etat.niveau === 'ok' || etat.niveau === 'inconnu')) {
      // En journée : anormal, on le signale. La nuit : simple fin de service,
      // pas de bandeau (la carte affiche "Service terminé").
      etat = heure >= 6 && heure < 23
        ? { niveau: 'perturbe', message: "Aucun départ détecté, vérifiez l'état de la ligne." }
        : undefined as any;
    }
    l.etat = etat;
  }));

  return lignes.sort(comparerLignesParMode);
}

// ── Bandeau d'état (câble) ────────────────────────────────────────────────────

const COULEUR_ETAT: Record<EtatLigne['niveau'], string> = {
  ok: '#22c55e', perturbe: '#f97316', arret: '#ef4444', inconnu: '#9ca3af',
};
const ICONE_ETAT: Record<EtatLigne['niveau'], string> = {
  ok: '', perturbe: '⚠️', arret: '❌', inconnu: '',
};

// Texte qui défile en boucle quand il est plus long que la place disponible
// (sinon il reste fixe). Défilement en pilote natif : pas de charge JS.
// La largeur réelle du texte est mesurée dans un ScrollView horizontal caché :
// dans une simple vue, la largeur mesurée serait plafonnée à celle de la zone
// et le texte, tronqué avec "…", ne défilerait jamais.
function TexteDefilant({ texte, couleur }: { texte: string; couleur: string }) {
  const [largeurZone, setLargeurZone] = useState(0);
  const [largeurTexte, setLargeurTexte] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const defile = largeurZone > 0 && largeurTexte > largeurZone;
  const ESPACE = 48;

  useEffect(() => {
    x.setValue(0);
    if (!defile) return;
    const distance = largeurTexte + ESPACE;
    // Boucle relancée à la main à chaque tour : Animated.loop en pilote natif
    // finissait par s'arrêter de défiler (surtout après un re-rendu).
    let annule = false;
    const tour = () => {
      if (annule) return;
      x.setValue(0);
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(x, { toValue: -distance, duration: (distance / 40) * 1000, easing: Easing.linear, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) tour(); });
    };
    tour();
    return () => { annule = true; x.stopAnimation(); };
  }, [defile, largeurTexte, x]);

  const styleTexte = [s.bandeauEtatMessage, { color: couleur }];
  return (
    <View style={{ overflow: 'hidden' }} onLayout={e => setLargeurZone(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        scrollEnabled={false}
        pointerEvents="none"
        style={{ position: 'absolute', opacity: 0 }}
        onContentSizeChange={w => setLargeurTexte(Math.ceil(w))}
      >
        <Text style={styleTexte} numberOfLines={1}>{texte}</Text>
      </ScrollView>
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: x }] }}>
        <Text style={[styleTexte, largeurTexte > 0 && { width: largeurTexte }]} numberOfLines={1}>{texte}</Text>
        {defile ? <Text style={[styleTexte, { width: largeurTexte, marginLeft: ESPACE }]} numberOfLines={1}>{texte}</Text> : null}
      </Animated.View>
    </View>
  );
}

// Affiché seulement quand la ligne est perturbée ou interrompue : en
// fonctionnement normal, rien (pas de bruit sur la carte).
function BandeauEtat({ etat }: { etat: EtatLigne }) {
  if (etat.niveau !== 'perturbe' && etat.niveau !== 'arret') return null;
  const couleur = COULEUR_ETAT[etat.niveau];
  return (
    <View style={[s.bandeauEtat, { backgroundColor: `${couleur}26`, borderColor: couleur }]}>
      <Text style={{ fontSize: 18 }}>{ICONE_ETAT[etat.niveau]}</Text>
      {etat.message ? <View style={{ flex: 1 }}><TexteDefilant texte={etat.message} couleur={couleur} /></View> : null}
    </View>
  );
}

// ── Carte ligne (memoïsée pour éviter re-renders pendant le scroll) ───────────

type LigneCardProps = { ligne: LigneGroupe; highlightTick?: number };

const LigneCard = memo(function LigneCard({ ligne, highlightTick }: LigneCardProps) {
  const c = useColors();
  const fg = ligne.textColor;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!highlightTick) return;
    glowAnim.setValue(1);
    Animated.timing(glowAnim, { toValue: 0, duration: 1000, useNativeDriver: false }).start();
  }, [highlightTick]);

  // Câble perturbé/à l'arrêt : cadre coloré, visible d'un coup d'œil.
  const problemeEtat = ligne.etat?.niveau === 'perturbe' || ligne.etat?.niveau === 'arret';
  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [problemeEtat ? COULEUR_ETAT[ligne.etat!.niveau] : c.borderCard, `#${ligne.color}`],
  });
  // Les horaires d'un câble sont théoriques : à l'arrêt ils seraient trompeurs.
  const cacherHoraires = ligne.etat?.niveau === 'arret';
  const frequenceC1 = ligne.mode === 'CABLE' && ligne.code === 'C1' && ligne.etat?.niveau === 'ok';
  const shadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });
  const elevation = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 8],
  });

  const toutTermine = ligne.directions
    ? ligne.directions.every(d => d.items.length === 0)
    : ligne.destinations.every(d => d.departs.length === 0);

  return (
    <Animated.View style={[s.carte, problemeEtat && { borderWidth: 2 }, {
      backgroundColor: c.bgCard,
      borderColor,
      shadowColor: `#${ligne.color}`,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity,
      shadowRadius: 10,
      elevation,
    }]}>
      <View style={[s.badgeWrap, { backgroundColor: `#${ligne.color}` }]}>
        <Text style={[s.badgeTexte, { color: fg }]} numberOfLines={1}>{ligne.code}</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        {ligne.isSubstitution ? (
          <Text style={{ fontSize: 11, fontWeight: '700', color: c.textSub }}>🚌 BUS DE REMPLACEMENT</Text>
        ) : null}
        {ligne.etat ? <BandeauEtat etat={ligne.etat} /> : null}
        {cacherHoraires ? null
        : toutTermine && problemeEtat ? null
        : toutTermine ? (
          <Text style={[s.destTexte, { color: c.textSub, textAlign: 'left', paddingTop: 4 }]}>😴 Service terminé</Text>
        ) : ligne.directions ? (
          ligne.directions.map((dir, di) => (
            <View key={di} style={{ gap: 2 }}>
              {dir.label ? <Text style={[s.dirLabel, { color: c.accent }]}>{dir.label}</Text> : null}
              {dir.items.length === 0 ? (
                <Text style={[s.destTexte, { color: c.textSub, textAlign: 'left' }]}>😴 Service terminé</Text>
              ) : (
                dir.items.map((item, i) => (
                  <View key={i} style={s.rerRow}>
                    <Text style={[s.rerDest, { color: c.text }]} numberOfLines={1} ellipsizeMode="tail">{item.dest}</Text>
                    <View style={s.departItem}>
                      <Text style={[s.tempsTexte, { color: item.depart.couleurTemps }]}>{item.depart.affichage}</Text>
                      <Text style={[s.heureTexte, { color: c.textSub }]}>{item.depart.heure}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ))
        ) : (
          ligne.destinations.map((dest, di) => (
            // Une seule ligne de texte (fréquence du C1) : hauteur mini = celle du
            // badge, pour rester centrée comme les lignes à deux lignes (minutes + heure).
            <View key={di} style={[s.destRow, frequenceC1 && { minHeight: 29 }]}>
              <Text style={[s.destTexte, { color: c.text }]} numberOfLines={2} ellipsizeMode="tail">{dest.destination}</Text>
              {dest.departs.length === 0 ? (
                <Text style={[s.destTexte, { color: c.textSub }]} numberOfLines={1}>😴 Terminé</Text>
              ) : frequenceC1 ? (
                <View style={s.departItem}>
                  <Text style={[s.tempsTexte, { color: '#22c55e' }]}>Départ toutes les ~30 s</Text>
                </View>
              ) : dest.premierLointain ? (
                <Text style={[s.destTexte, { color: c.textSub }]} numberOfLines={1}>Premier départ : {dest.departs[0].heure}</Text>
              ) : (
                <View style={s.departsRow}>
                  {dest.departs.map((dep, i) => (
                    <View key={i} style={s.departItem}>
                      <Text style={[s.tempsTexte, { color: dep.couleurTemps }]}>{dep.affichage}</Text>
                      <Text style={[s.heureTexte, { color: c.textSub }]}>{dep.heure}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}
      </View>
    </Animated.View>
  );
});

// ── Composant principal ───────────────────────────────────────────────────────

// `onScrollY` : position de défilement de la liste (0 = tout en haut), pour que le volet sache
// quand un tiré vers le bas doit déplacer le volet plutôt que faire défiler la liste.
type Props = { stopId: string; stopName?: string; onScrollY?: (y: number) => void };
export type SchedulesRef = { scrollTo: (code: string) => void };

const NativeSchedules = forwardRef<SchedulesRef, Props>(function NativeSchedules(
  { stopId, stopName = '', onScrollY },
  ref,
) {
  const c = useColors();
  const [lignes, setLignes] = useState<LigneGroupe[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const isInitialLoad = useRef(true);
  const scrollRef = useRef<FlatList<any>>(null);
  // Éléments affichés (mis à jour à chaque rendu) : la liste est virtualisée, donc on
  // retrouve une ligne par son INDEX et non par une position mesurée (les lignes
  // pas encore affichées n'ont pas de position).
  const itemsRef = useRef<any[]>([]);
  const [highlightState, setHighlightState] = useState<{ code: string; tick: number } | null>(null);
  const toastCooldown = useRef(false);

  useImperativeHandle(ref, () => ({
    scrollTo: (code: string) => {
      const index = itemsRef.current.findIndex(it => it.type === 'ligne' && it.ligne.code === code);
      if (index >= 0) {
        scrollRef.current?.scrollToIndex({ index, animated: true });
        setHighlightState(prev => ({ code, tick: (prev?.tick ?? 0) + 1 }));
      } else {
        if (Platform.OS === 'android' && !toastCooldown.current) {
          toastCooldown.current = true;
          ToastAndroid.show('Aucun départ actuellement pour cette ligne à cet arrêt', ToastAndroid.SHORT);
          setTimeout(() => { toastCooldown.current = false; }, 2000);
        }
      }
    },
  }), []);

  // Vide les données immédiatement quand on change de gare (évite d'afficher les horaires de l'ancienne gare)
  useEffect(() => { setLignes(null); isInitialLoad.current = true; onScrollY?.(0); }, [stopId]);

  // Pointe toujours vers l'annulation de la requête EN COURS. `charger()` est
  // rappelé à chaque tick du setInterval ci-dessous ; sans cette ref, seul le
  // tout premier appel serait annulable au démontage, et les requêtes des
  // ticks suivants continueraient inutilement en arrière-plan.
  const abortCourantRef = useRef<() => void>(() => {});

  const charger = useCallback(() => {
    setErreur(null);

    if (stopId === GHOST_STOP_ID) {
      abortCourantRef.current = () => {};
      const terminatedCodes = new Set(
        GHOST_LIGNES_BASE
          .filter(x => x.mode === 'BUS' && x.destinations.every(d => (d.departs[0]?.valTri ?? 0) >= 3000))
          .map(x => x.code)
      );
      const filtered = GHOST_LIGNES_BASE.filter(x => x.mode !== 'BUS' || !terminatedCodes.has(x.code));
      isInitialLoad.current = false;
      setLignes(filtered);
      return;
    }

    const ctrl = new AbortController();
    abortCourantRef.current = () => ctrl.abort();
    fetchLignes(stopId, stopName, ctrl.signal)
      .then(l => {
        const terminatedCodes = new Set(
          l.filter(x => x.mode === 'BUS' && x.destinations.every(d => d.departs.length === 0))
           .map(x => x.code)
        );
        const filtered = l.filter(x => x.mode !== 'BUS' || !terminatedCodes.has(x.code));
        if (isInitialLoad.current) {
          isInitialLoad.current = false;
          setLignes(filtered);
        } else {
          startTransition(() => setLignes(filtered));
        }
      })
      .catch(e => { if (e.name !== 'AbortError') setErreur(e.message); });
  }, [stopId, stopName]);

  useEffect(() => {
    charger();
    const timer = setInterval(charger, 15000);
    return () => { abortCourantRef.current(); clearInterval(timer); };
  }, [charger]);

  // Regroupe les lignes déjà triées par mode (comparerLignesParMode) en
  // insérant un séparateur (icône + trait) avant chaque nouveau mode, pour
  // mieux distinguer RER / train / métro / tram / bus dans la liste.
  type RenderItem = { type: 'mode'; mode: string } | { type: 'ligne'; ligne: LigneGroupe };
  const renderItems = useMemo((): RenderItem[] => {
    if (!lignes) return [];
    const items: RenderItem[] = [];
    let lastMode = '';
    for (const ligne of lignes) {
      if (ligne.mode !== lastMode) {
        items.push({ type: 'mode', mode: ligne.mode });
        lastMode = ligne.mode;
      }
      items.push({ type: 'ligne', ligne });
    }
    return items;
  }, [lignes]);

  if (erreur) {
    return (
      <View style={s.centre}>
        <Text style={{ color: '#ef4444', marginBottom: 12 }}>Erreur : {erreur}</Text>
        <TouchableOpacity onPress={charger} style={{ padding: 10 }}>
          <Text style={{ color: c.accent }}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!lignes) {
    return <View style={s.centre}><ActivityIndicator color={c.accent} /></View>;
  }

  if (lignes.length === 0) {
    return (
      <View style={s.centre}>
        <Text style={{ color: c.textSub, fontFamily: 'GrandParis' }}>Aucun départ disponible</Text>
      </View>
    );
  }

  itemsRef.current = renderItems;
  // Liste virtualisée : seules les premières lignes sont créées au départ. Rendre les
  // 30+ lignes d'une grosse gare d'un coup faisait doubler les images saccadées à
  // l'ouverture du volet (mesuré : ~20 % contre ~12 % avec 8 lignes).
  const listView = (
    <FlatList
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={s.listContent}
      overScrollMode="always"
      bounces={true}
      data={renderItems}
      onScroll={onScrollY ? (e) => onScrollY(e.nativeEvent.contentOffset.y) : undefined}
      scrollEventThrottle={16}
      extraData={highlightState}
      keyExtractor={(item, i) => (item.type === 'mode' ? `mode-${i}` : item.ligne.key)}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      windowSize={9}
      updateCellsBatchingPeriod={50}
      onScrollToIndexFailed={(info) => {
        scrollRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
        setTimeout(() => scrollRef.current?.scrollToIndex({ index: info.index, animated: true }), 200);
      }}
      renderItem={({ item, index: i }) =>
        item.type === 'mode' ? (
          <View style={[s.modeSeparator, i === 0 && { marginTop: 0 }]}>
            <ExpoImage
              source={{ uri: MODE_ICONS[item.mode] ?? MODE_ICONS['BUS'] }}
              style={[s.modeIcon, { tintColor: c.textSub }]}
              contentFit="contain"
            />
            <View style={[s.modeSeparatorLine, { backgroundColor: c.border }]} />
          </View>
        ) : (
          <LigneCard ligne={item.ligne} highlightTick={highlightState?.code === item.ligne.code ? (highlightState?.tick ?? 0) : 0} />
        )
      }
    />
  );

  return listView;
});

export default memo(NativeSchedules);

const s = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 10, gap: 8, paddingBottom: 88 },
  modeSeparator: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  modeIcon: { width: 20, height: 20 },
  modeSeparatorLine: { flex: 1, height: 1 },
  carte: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: 12, padding: 10, gap: 10,
    borderWidth: 1,
  },
  badgeWrap: {
    minWidth: 36, paddingHorizontal: 6, paddingVertical: 4,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  badgeTexte: { fontSize: 13, fontFamily: 'GrandParis-Bold' },
  // Bus/Métro
  destRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  destTexte: { flex: 1, fontSize: 13, fontFamily: 'GrandParis' },
  departsRow: { flexDirection: 'row', gap: 8 },
  departItem: { alignItems: 'flex-end' },
  tempsTexte: { fontSize: 13, fontFamily: 'GrandParis-Medium' },
  heureTexte: { fontSize: 10, fontFamily: 'GrandParis' },
  // Câble : bandeau d'état
  bandeauEtat: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  bandeauEtatTitre: { fontSize: 13, fontFamily: 'GrandParis-Bold' },
  bandeauEtatMessage: { fontSize: 12, fontFamily: 'GrandParis-Medium' },
  // RER/Train
  dirLabel: { fontSize: 11, fontFamily: 'GrandParis-Medium', fontWeight: '700', marginBottom: 1 },
  rerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rerDest: { flex: 1, fontSize: 13, fontFamily: 'GrandParis' },
});
