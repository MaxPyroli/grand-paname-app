import React, { useEffect, useState, useCallback, memo, startTransition, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, StyleSheet, ToastAndroid, Platform, Animated } from 'react-native';
import { NAVITIA_BASE, NAVITIA_KEY } from './constants';
import { useColors } from './theme';
import { modeDepuisCommercialMode } from './api';
import { GEOGRAPHIE_RER, TOPOLOGIE_LIGNES } from './lignesData';
import { GHOST_STOP_ID } from './ghostStop';

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
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseNavitiaDate(s: string): Date {
  const y = +s.slice(0, 4), mo = +s.slice(4, 6) - 1, d = +s.slice(6, 8);
  const h = +s.slice(9, 11), mn = +s.slice(11, 13), sec = +s.slice(13, 15);
  return new Date(y, mo, d, h, mn, sec);
}

function computeValTri(dateStr: string): number {
  const dep = parseNavitiaDate(dateStr);
  const delta = Math.round((dep.getTime() - Date.now()) / 60000);
  if (delta > 120) return 3000;
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

function calculerDirectionRelative(code: string, maGare: string, terminus: string): 0 | 1 | null {
  const ligne = TOPOLOGIE_LIGNES[code];
  if (!ligne) return null;
  const gareU = maGare.toUpperCase();
  const termU = terminus.toUpperCase();
  for (const route of ligne.routes) {
    const idxDep = route.findIndex(g => gareU.includes(g));
    const idxTerm = route.findIndex(g => termU.includes(g));
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

  const stopU = stopName.toUpperCase();

  let mots1 = [...geo.mots_1];
  let mots2 = [...geo.mots_2];

  // Ajustements contextuels RER C : nord de Paris → INVALIDES devient direction EST
  if (code === 'C') {
    const zoneNord = ['MAILLOT','PEREIRE','CLICHY','ST-OUEN','GENNEVILLIERS','ERMONT','PONTOISE','FOCH','MARTIN','BOULAINVILLIERS','KENNEDY','JAVEL','GARIGLIANO'];
    if (zoneNord.some(k => stopU.includes(k))) {
      mots1 = mots1.filter(m => m !== 'INVALIDES');
      if (!mots2.includes('INVALIDES')) mots2 = [...mots2, 'INVALIDES'];
    }
  }
  // Ajustements contextuels RER D : nord de Paris → GARE DE LYON devient direction SUD
  if (code === 'D') {
    const zoneNord = ['CREIL','ORRY','COYE','SURVILLIERS','FOSSES','LOUVRES','GOUSSAINVILLE','VILLIERS-LE-BEL','GARGES','SARCELLES','PIERREFITTE','STAINS','SAINT-DENIS','STADE DE FRANCE','NORD'];
    if (zoneNord.some(k => stopU.includes(k))) {
      mots2 = mots2.filter(m => m !== 'GARE DE LYON');
      if (!mots1.includes('GARE DE LYON')) mots1 = [...mots1, 'GARE DE LYON'];
    }
  }

  const p1: DepartAvecDest[] = [];
  const p2: DepartAvecDest[] = [];
  const p3: DepartAvecDest[] = [];

  for (const item of allDeparts) {
    const termU = item.dest.toUpperCase();
    const dir = calculerDirectionRelative(code, stopName, item.dest);
    if (dir === 0) p1.push(item);
    else if (dir === 1) p2.push(item);
    else if (mots1.some(m => termU.includes(m))) p1.push(item);
    else if (mots2.some(m => termU.includes(m))) p2.push(item);
    else p3.push(item);
  }

  const directions: DirectionGroupe[] = [];

  if (!geo.term_1.some(t => stopU.includes(t))) {
    directions.push({ label: geo.labels[0], items: p1.slice(0, 4) });
  }
  if (!geo.term_2.some(t => stopU.includes(t))) {
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

async function fetchLignes(stopId: string, stopName: string, signal: AbortSignal): Promise<LigneGroupe[]> {
  const url = `${NAVITIA_BASE}/stop_areas/${stopId}/departures?count=100`;
  const r = await fetch(url, { headers: { apiKey: NAVITIA_KEY }, signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();

  const MODE_ORDER: Record<string, number> = { RER: 0, TRAIN: 1, METRO: 2, TRAM: 3, CABLE: 4, FLUVIAL: 5, BUS: 6 };

  const lignesMap = new Map<string, { code: string; color: string; textColor: string; mode: string; dests: Map<string, Depart[]> }>();

  for (const d of data?.departures || []) {
    const info = d.stop_date_time;
    if (!info) continue;
    const dateStr: string = info.departure_date_time || '';
    if (!dateStr) continue;
    const valTri = computeValTri(dateStr);
    if (valTri < -5) continue;

    const route = d.route || {};
    const line = route.line || {};
    const code: string = line.code || line.name || '?';
    const color: string = line.color || '888888';
    const textColor: string = line.text_color ? `#${line.text_color}` : computeContrast(color);
    const mode: string = modeDepuisCommercialMode(line.commercial_mode?.id || '');
    const dest: string = (d.display_informations?.direction || route.name || '?').replace(/\s*\([^)]+\)$/, '');

    const lineKey = `${code}|${color}`;
    if (!lignesMap.has(lineKey)) lignesMap.set(lineKey, { code, color, textColor, mode, dests: new Map() });
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

    const isNocti = entry.mode === 'BUS' && isNaN(Number(entry.code[0]));
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

  return lignes.sort((a, b) => {
    const isNoctiA = a.mode === 'BUS' && isNaN(Number(a.code[0]));
    const isNoctiB = b.mode === 'BUS' && isNaN(Number(b.code[0]));
    const oa = (MODE_ORDER[a.mode] ?? 6) + (isNoctiA ? 0.5 : 0);
    const ob = (MODE_ORDER[b.mode] ?? 6) + (isNoctiB ? 0.5 : 0);
    if (oa !== ob) return oa - ob;
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });
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
        {toutTermine ? (
          <Text style={[s.destTexte, { color: c.textSub, textAlign: 'center' }]}>😴 Service terminé</Text>
        ) : ligne.directions ? (
          ligne.directions.map((dir, di) => (
            <View key={di} style={{ gap: 2 }}>
              {dir.label ? <Text style={[s.dirLabel, { color: c.accent }]}>{dir.label}</Text> : null}
              {dir.items.length === 0 ? (
                <Text style={[s.destTexte, { color: c.textSub, textAlign: 'center' }]}>😴 Service terminé</Text>
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
              <Text style={[s.destTexte, { color: c.text }]} numberOfLines={1} ellipsizeMode="tail">{dest.destination}</Text>
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

type Props = { stopId: string; stopName?: string; refreshKey?: number };
export type SchedulesRef = { scrollTo: (code: string) => void };

const NativeSchedules = forwardRef<SchedulesRef, Props>(function NativeSchedules(
  { stopId, stopName = '', refreshKey },
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

  const charger = useCallback(() => {
    setErreur(null);

    if (stopId === GHOST_STOP_ID) {
      const terminatedCodes = new Set(
        GHOST_LIGNES_BASE
          .filter(x => x.mode === 'BUS' && x.destinations.every(d => (d.departs[0]?.valTri ?? 0) >= 3000))
          .map(x => x.code)
      );
      terminatedBusCodes.current = terminatedCodes;
      const filtered = GHOST_LIGNES_BASE.filter(x => x.mode !== 'BUS' || !terminatedCodes.has(x.code));
      isInitialLoad.current = false;
      setLignes(filtered);
      return () => {};
    }

    const ctrl = new AbortController();
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
    return () => ctrl.abort();
  }, [stopId, stopName, refreshKey]);

  useEffect(() => {
    const cleanup = charger();
    const timer = setInterval(charger, 15000);
    return () => { cleanup(); clearInterval(timer); };
  }, [charger]);

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

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={s.listContent}>
      {lignes.map(ligne => (
        <View key={ligne.key} onLayout={e => { yPositions.current[ligne.code] = e.nativeEvent.layout.y; }}>
          <LigneCard ligne={ligne} highlightTick={highlightState?.code === ligne.code ? highlightState.tick : 0} />
        </View>
      ))}
    </ScrollView>
  );
});

export default memo(NativeSchedules);

const s = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 10, gap: 8, paddingBottom: 74 },
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
