import React, { useEffect, useState, useCallback, useMemo, memo, startTransition, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet, ToastAndroid, Platform, Animated } from 'react-native';
import { GestureDetector, ScrollView, type NativeGesture } from 'react-native-gesture-handler';
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
  // Câble C2 — actif
  {
    key: 'C2|F8A01D', code: 'C2', color: 'F8A01D', textColor: '#000000', mode: 'CABLE',
    directions: undefined,
    destinations: [
      { destination: 'Fort d\'Aubervilliers', departs: [
        { valTri: 3,  affichage: '3 min',  couleurTemps: '#f97316', heure: '09:15' },
        { valTri: 11, affichage: '11 min', couleurTemps: '#22c55e', heure: '09:23' },
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

  const lignesMap = new Map<string, { code: string; color: string; textColor: string; mode: string; isSubstitution: boolean; dests: Map<string, Depart[]> }>();

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
    const isSubstitution = mode === 'BUS' && RAIL_CODES.has(code);

    // Les Noctiliens et les bus de substitution sont peu fréquents : un
    // départ réel tombe facilement au-delà de 2h, il ne faut pas l'étiqueter
    // "Terminé" pour autant (ça affichait un vrai horaire du lendemain à
    // côté du mot "Terminé", contradictoire). Noctilien détecté via le
    // préfixe "N" + chiffres (N01, N153...) pour ne pas mordre sur les bus
    // de substitution comme la ligne "D" (remplacement RER D).
    const isNocti = mode === 'BUS' && /^N\d/.test(code);
    const valTri = computeValTri(dateStr, (isNocti || isSubstitution) ? 720 : 120);
    if (valTri < -5) continue;

    const lineKey = `${code}|${color}|${mode}`;
    if (!lignesMap.has(lineKey)) lignesMap.set(lineKey, { code, color, textColor, mode, isSubstitution, dests: new Map() });
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

    if (entry.isSubstitution) {
      const destinations: DestGroupe[] = [];
      for (const [destination, departs] of entry.dests) {
        const sorted = departs.sort((a, b) => a.valTri - b.valTri);
        destinations.push({ destination, departs: sorted.slice(0, 3) });
      }
      destinations.sort((a, b) => (a.departs[0]?.valTri ?? 9999) - (b.departs[0]?.valTri ?? 9999));
      lignes.push({ key, code: entry.code, color: entry.color, textColor: entry.textColor, mode: entry.mode, destinations, isSubstitution: true });
      continue;
    }

    const isNocti = entry.mode === 'BUS' && /^N\d/.test(entry.code);
    const destinations: DestGroupe[] = [];
    for (const [destination, departs] of entry.dests) {
      const sorted = departs.sort((a, b) => a.valTri - b.valTri);
      const filtered: Depart[] = [];
      for (let i = 0; i < sorted.length && filtered.length < 3; i++) {
        if (i > 0 && !isNocti && sorted[i].valTri > 62) break;
        filtered.push(sorted[i]);
      }
      destinations.push({ destination, departs: filtered });
    }
    destinations.sort((a, b) => (a.departs[0]?.valTri ?? 9999) - (b.departs[0]?.valTri ?? 9999));

    const hasNearby = entry.mode === 'BUS' && destinations.some(d => (d.departs[0]?.valTri ?? 9999) < 62);
    const finalDests = hasNearby
      ? destinations.filter(d => (d.departs[0]?.valTri ?? 9999) < 62)
      : destinations;

    lignes.push({ key, code: entry.code, color: entry.color, textColor: entry.textColor, mode: entry.mode, destinations: finalDests });
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

  return lignes.sort(comparerLignesParMode);
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

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [c.borderCard, `#${ligne.color}`],
  });
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
    : ligne.destinations.every(d => (d.departs[0]?.valTri ?? 0) >= 3000);

  return (
    <Animated.View style={[s.carte, {
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
        {toutTermine ? (
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
            <View key={di} style={s.destRow}>
              <Text style={[s.destTexte, { color: c.text }]} numberOfLines={2} ellipsizeMode="tail">{dest.destination}</Text>
              <View style={s.departsRow}>
                {dest.departs.map((dep, i) => (
                  <View key={i} style={s.departItem}>
                    <Text style={[s.tempsTexte, { color: dep.couleurTemps }]}>{dep.affichage}</Text>
                    <Text style={[s.heureTexte, { color: c.textSub }]}>{dep.heure}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </View>
    </Animated.View>
  );
});

// ── Composant principal ───────────────────────────────────────────────────────

type Props = { stopId: string; stopName?: string; onAtTopChange?: (atTop: boolean) => void; nativeGesture?: NativeGesture };
export type SchedulesRef = { scrollTo: (code: string) => void };

const NativeSchedules = forwardRef<SchedulesRef, Props>(function NativeSchedules(
  { stopId, stopName = '', onAtTopChange, nativeGesture },
  ref,
) {
  const c = useColors();
  const [lignes, setLignes] = useState<LigneGroupe[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const isInitialLoad = useRef(true);
  const scrollRef = useRef<ScrollView>(null);
  const yPositions = useRef<Record<string, number>>({});
  const terminatedBusCodes = useRef<Set<string>>(new Set());
  const [highlightState, setHighlightState] = useState<{ code: string; tick: number } | null>(null);
  const toastCooldown = useRef(false);
  const atTopRef = useRef(true);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const atTop = e.nativeEvent.contentOffset.y <= 2;
    if (atTop !== atTopRef.current) {
      atTopRef.current = atTop;
      onAtTopChange?.(atTop);
    }
  }, [onAtTopChange]);

  useEffect(() => { onAtTopChange?.(atTopRef.current); }, []);

  useImperativeHandle(ref, () => ({
    scrollTo: (code: string) => {
      const y = yPositions.current[code];
      if (y !== undefined) {
        scrollRef.current?.scrollTo({ y, animated: true });
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
  useEffect(() => { setLignes(null); isInitialLoad.current = true; }, [stopId]);

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
      terminatedBusCodes.current = terminatedCodes;
      const filtered = GHOST_LIGNES_BASE.filter(x => x.mode !== 'BUS' || !terminatedCodes.has(x.code));
      isInitialLoad.current = false;
      setLignes(filtered);
      return;
    }

    const ctrl = new AbortController();
    abortCourantRef.current = () => ctrl.abort();
    fetchLignes(stopId, stopName, ctrl.signal)
      .then(l => {
        terminatedBusCodes.current = new Set(
          l.filter(x => x.mode === 'BUS' && x.destinations.every(d => (d.departs[0]?.valTri ?? 0) >= 3000))
           .map(x => x.code)
        );
        const filtered = l.filter(x => x.mode !== 'BUS' || !terminatedBusCodes.current.has(x.code));
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

  const listView = (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={s.listContent}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      overScrollMode="never"
      bounces={false}
    >
      {renderItems.map((item, i) =>
        item.type === 'mode' ? (
          <View key={`mode-${i}`} style={[s.modeSeparator, i === 0 && { marginTop: 0 }]}>
            <ExpoImage
              source={{ uri: MODE_ICONS[item.mode] ?? MODE_ICONS['BUS'] }}
              style={[s.modeIcon, { tintColor: c.textSub }]}
              contentFit="contain"
            />
            <View style={[s.modeSeparatorLine, { backgroundColor: c.border }]} />
          </View>
        ) : (
          <View key={item.ligne.key} onLayout={e => { yPositions.current[item.ligne.code] = e.nativeEvent.layout.y; }}>
            <LigneCard ligne={item.ligne} highlightTick={highlightState?.code === item.ligne.code ? highlightState.tick : 0} />
          </View>
        )
      )}
    </ScrollView>
  );

  // GestureDetector expose le geste natif du scroll au parent (App.tsx), qui
  // le compose avec le geste de drag du volet pour permettre de tirer le
  // volet vers le bas depuis l'intérieur de la liste, une fois en haut.
  return nativeGesture ? <GestureDetector gesture={nativeGesture}>{listView}</GestureDetector> : listView;
});

export default memo(NativeSchedules);

const s = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 10, gap: 8, paddingBottom: 74 },
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
  // RER/Train
  dirLabel: { fontSize: 11, fontFamily: 'GrandParis-Medium', fontWeight: '700', marginBottom: 1 },
  rerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rerDest: { flex: 1, fontSize: 13, fontFamily: 'GrandParis' },
});
