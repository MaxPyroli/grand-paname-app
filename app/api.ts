import { NAVITIA_BASE, NAVITIA_KEY } from './constants';
import { logger } from './logger';

export type SearchResult = { id: string; label: string; distance?: number };

// ── Helpers ──────────────────────────────────────────────────────────────────

function villeDepuisRegions(regions: any[]): string {
  for (const lvl of [8, 9, 7]) {
    const r = regions.find((r: any) => r.level === lvl);
    if (r?.name) return r.name;
  }
  return regions[0]?.name || '';
}

async function navitia(path: string, signal?: AbortSignal): Promise<any> {
  const url = `${NAVITIA_BASE}/${path}`;
  logger.info(`→ ${path.split('?')[0]}`);
  const r = await fetch(url, { headers: { apiKey: NAVITIA_KEY }, signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function isNetworkError(e: any): boolean {
  const msg: string = e?.message || '';
  return (
    msg.includes('Network request failed') ||
    msg.includes('Failed to fetch') ||
    msg.includes('network') ||
    e?.name === 'NetworkError'
  );
}

// ── API publique ──────────────────────────────────────────────────────────────

export async function searchGares(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const data = await navitia(`places?q=${encodeURIComponent(q)}&type[]=stop_area&count=8`, signal);
  const results: SearchResult[] = [];
  for (const p of data?.places || []) {
    if (!p.stop_area) continue;
    const sa = p.stop_area;
    const ville = villeDepuisRegions(sa.administrative_regions || []);
    results.push({ id: sa.id, label: ville ? `${sa.name} (${ville})` : sa.name });
  }
  logger.info(`search "${q}" → ${results.length} résultat(s)`);
  return results;
}

export async function nearbyGares(lat: number, lon: number, signal?: AbortSignal, distance = 1500): Promise<SearchResult[]> {
  const data = await navitia(
    `coords/${lon};${lat}/places_nearby?type[]=stop_area&distance=${distance}&count=60`,
    signal
  );
  const results: SearchResult[] = [];
  for (const p of data?.places_nearby || []) {
    if (!p.stop_area) continue;
    const sa = p.stop_area;
    const ville = villeDepuisRegions(sa.administrative_regions || []);
    const dist = parseInt(p.distance || '0');
    const label = ville ? `${sa.name} (${ville})` : sa.name;
    results.push({ id: sa.id, label, distance: dist });
  }
  logger.info(`nearby (${lat.toFixed(4)}, ${lon.toFixed(4)}) → ${results.length} arrêt(s)`);
  return results;
}

export type NearbyStop = SearchResult & { lat: number; lon: number; modes: string[]; stop_area_id: string };

function modesDepuisPhysicalModes(physModes: any[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of physModes || []) {
    const id: string = m?.id || '';
    let mode = 'BUS';
    if (id.includes('Metro'))                                     mode = 'METRO';
    else if (id.includes('RapidTransit'))                         mode = 'RER';
    else if (id.includes('LocalTrain') || id.includes('LongDistance')) mode = 'TRAIN';
    else if (id.includes('Tramway'))                              mode = 'TRAM';
    else if (id.includes('Cable') || id.includes('Funicular'))    mode = 'CABLE';
    else if (id.includes('Ferry') || id.includes('Boat'))         mode = 'FLUVIAL';
    if (!seen.has(mode)) { seen.add(mode); result.push(mode); }
  }
  return result.length > 0 ? result : ['BUS'];
}

// Liste complète des gares RER/Transilien de toute la région (~250 chacune).
// Contrairement à nearbyStopsWithCoords (rayon + quota, vite saturé par les
// arrêts de bus proches), cette liste est petite et quasi-fixe : on la
// charge une seule fois (pas à chaque déplacement de carte) pour garantir
// que toutes les gares s'affichent même au zoom le plus large, sans
// alourdir les recherches de proximité classiques.
export async function regionWideRailStops(signal?: AbortSignal): Promise<NearbyStop[]> {
  const [rer, train] = await Promise.all([
    navitia(`physical_modes/physical_mode:RapidTransit/stop_areas?count=300`, signal),
    navitia(`physical_modes/physical_mode:LocalTrain/stop_areas?count=300`, signal),
  ]);
  const byId = new Map<string, NearbyStop>();
  const ajouter = (data: any, mode: string) => {
    for (const sa of data?.stop_areas || []) {
      const coord = sa.coord;
      if (!coord?.lat || !coord?.lon) continue;
      const existing = byId.get(sa.id);
      if (existing) {
        if (!existing.modes.includes(mode)) existing.modes.push(mode);
        continue;
      }
      const ville = villeDepuisRegions(sa.administrative_regions || []);
      byId.set(sa.id, {
        id: sa.id,
        stop_area_id: sa.id,
        label: ville ? `${sa.name} (${ville})` : sa.name,
        lat: parseFloat(coord.lat),
        lon: parseFloat(coord.lon),
        modes: [mode],
      });
    }
  };
  ajouter(rer, 'RER');
  ajouter(train, 'TRAIN');
  logger.info(`regionWideRailStops → ${byId.size}`);
  return Array.from(byId.values());
}

const HEAVY_MODES = new Set(['RER', 'TRAIN', 'METRO', 'TRAM']);

export async function nearbyStopsWithCoords(lat: number, lon: number, signal?: AbortSignal, distance = 1000): Promise<NearbyStop[]> {
  const count = Math.min(Math.ceil(distance / 15), 500);

  const base = `coords/${lon};${lat}/places_nearby?distance=${distance}&count=${count}&depth=2`;
  const [areaData, pointData] = await Promise.all([
    navitia(`${base}&type[]=stop_area`, signal),
    navitia(`${base}&type[]=stop_point`, signal),
  ]);

  const results: NearbyStop[] = [];

  // Stop_areas ayant un mode lourd (RER/Train/Métro/Tram) — un câble en
  // correspondance sur l'un d'eux (ex: métro 8 + C1 à Pointe du Lac) reste
  // affiché groupé avec ce mode lourd plutôt qu'en poteau séparé.
  const heavyAreaIds = new Set<string>();
  for (const p of areaData?.places_nearby || []) {
    const sa = p.stop_area;
    if (!sa) continue;
    const modes = modesDepuisPhysicalModes(sa.physical_modes);
    if (modes.some(m => HEAVY_MODES.has(m))) heavyAreaIds.add(sa.id);
  }

  // Bus/fluvial stop_points — position exacte de chaque poteau, affichés
  // individuellement. Câble/funiculaire isolé (pas de mode lourd co-localisé) —
  // même position exacte, mais regroupée/moyennée par stop_area, car une
  // télécabine a souvent 2 poteaux distincts très proches (ex: câble C1).
  const cableParArea = new Map<string, { lat: number; lon: number }[]>();
  const cableInfo = new Map<string, { label: string; firstId: string }>();
  for (const p of pointData?.places_nearby || []) {
    if (!p.stop_point) continue;
    const sp = p.stop_point;
    const coord = sp.coord;
    if (!coord?.lat || !coord?.lon) continue;
    const modes = modesDepuisPhysicalModes(sp.physical_modes);
    const stopAreaId = sp.stop_area?.id ?? sp.id;
    const ville = villeDepuisRegions(sp.administrative_regions || []);
    const label = ville ? `${sp.name} (${ville})` : sp.name;

    if (modes.includes('CABLE') && !heavyAreaIds.has(stopAreaId)) {
      if (!cableParArea.has(stopAreaId)) cableParArea.set(stopAreaId, []);
      cableParArea.get(stopAreaId)!.push({ lat: parseFloat(coord.lat), lon: parseFloat(coord.lon) });
      if (!cableInfo.has(stopAreaId)) cableInfo.set(stopAreaId, { label, firstId: sp.id });
      continue;
    }

    if (!modes.includes('BUS') && !modes.includes('FLUVIAL')) continue;
    results.push({
      id: sp.id,
      stop_area_id: stopAreaId,
      label,
      lat: parseFloat(coord.lat),
      lon: parseFloat(coord.lon),
      modes,
    });
  }
  for (const [stopAreaId, coords] of cableParArea) {
    const info = cableInfo.get(stopAreaId)!;
    const cLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
    const cLon = coords.reduce((s, c) => s + c.lon, 0) / coords.length;
    results.push({ id: info.firstId, stop_area_id: stopAreaId, label: info.label, lat: cLat, lon: cLon, modes: ['CABLE'] });
  }

  // Non-bus stop_areas (RER, Métro, Tram, Train, câble en correspondance…) —
  // le câble isolé est géré au-dessus via ses stop_points, moyennés.
  for (const p of areaData?.places_nearby || []) {
    if (!p.stop_area) continue;
    const sa = p.stop_area;
    const coord = sa.coord;
    if (!coord?.lat || !coord?.lon) continue;
    const modes = modesDepuisPhysicalModes(sa.physical_modes);
    const isCableIsole = modes.includes('CABLE') && !modes.some(m => HEAVY_MODES.has(m));
    if (modes.every(m => m === 'BUS' || m === 'AUTRE') || isCableIsole) continue;
    const ville = villeDepuisRegions(sa.administrative_regions || []);
    results.push({
      id: sa.id,
      stop_area_id: sa.id,
      label: ville ? `${sa.name} (${ville})` : sa.name,
      lat: parseFloat(coord.lat),
      lon: parseFloat(coord.lon),
      modes,
    });
  }

  logger.info(`nearbyStops (${lat.toFixed(4)}, ${lon.toFixed(4)}) → ${results.length}`);
  return results;
}

export type LineChip = { id: string; code: string; color: string; textColor: string; mode: string };

export function modeDepuisCommercialMode(id: string): string {
  if (id.includes('RapidTransit') || id.includes('RER')) return 'RER';
  if (id.includes('LocalTrain') || id.includes('LongDistance') || (id.includes('Train') && !id.includes('Tram'))) return 'TRAIN';
  if (id.includes('Metro')) return 'METRO';
  if (id.includes('Tram') || id.includes('TramTrain')) return 'TRAM';
  if (id.includes('Cable') || id.includes('Funicular')) return 'CABLE';
  if (id.includes('Ferry') || id.includes('Boat') || id.includes('Fluvial')) return 'FLUVIAL';
  return 'BUS';
}

const MODE_ORDER: Record<string, number> = { RER: 0, TRAIN: 1, METRO: 2, TRAM: 3, CABLE: 4, FLUVIAL: 5, BUS: 6 };

// Ordre d'affichage des lignes : RER/train/métro/tram/câble/fluvial puis bus,
// avec les bus "Noctilien" (code commençant par une lettre) repoussés après
// les bus numérotés classiques, puis tri alphanumérique du code.
export function comparerLignesParMode(a: { code: string; mode: string }, b: { code: string; mode: string }): number {
  const isLettreA = a.mode === 'BUS' && isNaN(Number(a.code[0]));
  const isLettreB = b.mode === 'BUS' && isNaN(Number(b.code[0]));
  const oa = (MODE_ORDER[a.mode] ?? 6) + (isLettreA ? 0.5 : 0);
  const ob = (MODE_ORDER[b.mode] ?? 6) + (isLettreB ? 0.5 : 0);
  if (oa !== ob) return oa - ob;
  return a.code.localeCompare(b.code, undefined, { numeric: true });
}

function chipDepuisLigne(l: any): LineChip {
  const color: string = l.color || '888888';
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const textColor = l.text_color
    ? `#${l.text_color}`
    : (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#000000' : '#ffffff';
  return {
    id: l.id || '',
    code: l.code || l.name || '?',
    color,
    textColor,
    mode: modeDepuisCommercialMode(l.commercial_mode?.id || ''),
  };
}

export async function linesForArea(stopAreaId: string, signal?: AbortSignal): Promise<LineChip[]> {
  // Sans count explicite, Navitia plafonne à 25 lignes par page — les gros
  // pôles (Châtelet, Gare de Lyon...) en ont davantage.
  const data = await navitia(`stop_areas/${stopAreaId}/lines?count=100`, signal);
  return (data?.lines || []).map(chipDepuisLigne).sort(comparerLignesParMode);
}

export type StopPointDetail = { id: string; lat: number; lon: number; lines: LineChip[] };

// Les arrêts physiques (poteaux) de bus d'une station peuvent être dispersés
// dans tout un quartier, chacun desservi par des lignes différentes.
// depth=3 fait remonter directement les lignes de chaque poteau dans la
// même réponse (un seul appel, pas un par poteau) — RER/Métro/Train/Tram/
// Câble/Fluvial restent un point unique bien identifié, donc on ne garde
// ici que les poteaux desservis par au moins une ligne de bus.
export async function stopPointsForArea(stopAreaId: string, signal?: AbortSignal): Promise<StopPointDetail[]> {
  const data = await navitia(`stop_areas/${stopAreaId}/stop_points?count=50&depth=3`, signal);
  const points: StopPointDetail[] = (data?.stop_points || [])
    .filter((sp: any) => sp.coord?.lat && sp.coord?.lon)
    .map((sp: any) => ({
      id: sp.id,
      lat: parseFloat(sp.coord.lat),
      lon: parseFloat(sp.coord.lon),
      lines: (sp.lines || []).map(chipDepuisLigne).filter((l: LineChip) => l.mode === 'BUS').sort(comparerLignesParMode),
    }));
  return points.filter(p => p.lines.length > 0);
}

export async function coordGare(stopId: string): Promise<{ lat: number; lon: number } | null> {
  const data = await navitia(`stop_areas/${stopId}`);
  const coord = data?.stop_areas?.[0]?.coord;
  if (coord) {
    logger.info(`coord ${stopId} → ${coord.lat}, ${coord.lon}`);
    return { lat: parseFloat(coord.lat), lon: parseFloat(coord.lon) };
  }
  logger.warn(`coord ${stopId} → aucune coordonnée`);
  return null;
}

// Pour certaines petites stations (câble, funiculaire...), la coordonnée du
// stop_area lui-même peut être décalée par rapport au vrai poteau physique
// (visible sur la carte : l'icône ne tombe pas exactement sur le rail/câble).
// Le stop_point, lui, correspond à la position réelle du quai — mais un
// stop_area peut regrouper plusieurs poteaux de modes différents (ex: le
// funiculaire ET un arrêt de bus voisin dans le même pôle), donc on cible
// précisément ceux desservis par une ligne du mode demandé. Certaines
// stations (télécabines à 2 voies comme le câble C1) ont 2 poteaux distincts
// très proches : on prend leur moyenne pour n'afficher qu'un seul point.
export async function coordPoteau(stopAreaId: string, mode: string = 'CABLE'): Promise<{ lat: number; lon: number } | null> {
  const data = await navitia(`stop_areas/${stopAreaId}/stop_points?count=20&depth=3`);
  const points = data?.stop_points || [];
  const matches = points.filter((sp: any) =>
    (sp.lines || []).some((l: any) => modeDepuisCommercialMode(l.commercial_mode?.id || '') === mode)
  );
  const cibles = matches.length > 0 ? matches : points.slice(0, 1);
  const coords = cibles.map((sp: any) => sp.coord).filter(Boolean);
  if (coords.length === 0) return null;
  const lat = coords.reduce((s: number, c: any) => s + parseFloat(c.lat), 0) / coords.length;
  const lon = coords.reduce((s: number, c: any) => s + parseFloat(c.lon), 0) / coords.length;
  return { lat, lon };
}
