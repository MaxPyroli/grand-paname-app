import { NAVITIA_BASE, NAVITIA_KEY } from './constants';
import { logger } from './logger';

export type SearchResult = { id: string; label: string };

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

export async function nearbyGares(lat: number, lon: number): Promise<SearchResult[]> {
  const data = await navitia(
    `coords/${lon};${lat}/places_nearby?type[]=stop_area&distance=1500&count=60`
  );
  const results: SearchResult[] = [];
  for (const p of data?.places_nearby || []) {
    if (!p.stop_area) continue;
    const sa = p.stop_area;
    const ville = villeDepuisRegions(sa.administrative_regions || []);
    const dist = parseInt(p.distance || '0');
    const label = ville
      ? `${sa.name} (${ville}) - à ${dist}m`
      : `${sa.name} - à ${dist}m`;
    results.push({ id: sa.id, label });
  }
  logger.info(`nearby (${lat.toFixed(4)}, ${lon.toFixed(4)}) → ${results.length} arrêt(s)`);
  return results;
}

export type NearbyStop = SearchResult & { lat: number; lon: number; modes: string[]; stop_area_id: string };

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchOSMStops(lat: number, lon: number, distance: number, signal?: AbortSignal): Promise<any[]> {
  const q = `[out:json][timeout:10];(node["highway"="bus_stop"]["name"](around:${distance},${lat},${lon});node["public_transport"="platform"]["name"](around:${distance},${lat},${lon}););out;`;
  const endpoints: Array<{ url: string; init: RequestInit }> = [
    {
      url: 'https://overpass-api.de/api/interpreter',
      init: { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: q },
    },
    {
      url: 'https://overpass-api.de/api/interpreter',
      init: { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(q)}` },
    },
    {
      url: 'https://overpass.kumi.systems/api/interpreter',
      init: { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: q },
    },
  ];
  for (const { url, init } of endpoints) {
    try {
      const r = await fetch(url, { ...init, signal });
      if (!r.ok) { logger.warn(`Overpass ${url} HTTP ${r.status}`); continue; }
      const data = await r.json();
      logger.info(`Overpass OK (${url}) → ${data.elements?.length ?? 0} nœuds`);
      return data.elements || [];
    } catch (e: any) {
      logger.warn(`Overpass ${url} error: ${e?.message}`);
    }
  }
  return [];
}

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

export async function nearbyStopsWithCoords(lat: number, lon: number, signal?: AbortSignal, distance = 1000): Promise<NearbyStop[]> {
  const count = Math.min(Math.ceil(distance / 15), 500);

  const base = `coords/${lon};${lat}/places_nearby?distance=${distance}&count=${count}&depth=2`;
  const [areaData, pointData] = await Promise.all([
    navitia(`${base}&type[]=stop_area`, signal),
    navitia(`${base}&type[]=stop_point`, signal),
  ]);

  const results: NearbyStop[] = [];

  // Bus/fluvial stop_points — precise poteau location
  for (const p of pointData?.places_nearby || []) {
    if (!p.stop_point) continue;
    const sp = p.stop_point;
    const coord = sp.coord;
    if (!coord?.lat || !coord?.lon) continue;
    const modes = modesDepuisPhysicalModes(sp.physical_modes);
    if (!modes.includes('BUS') && !modes.includes('FLUVIAL')) continue;
    const stopAreaId = sp.stop_area?.id ?? sp.id;
    results.push({
      id: sp.id,
      stop_area_id: stopAreaId,
      label: sp.name,
      lat: parseFloat(coord.lat),
      lon: parseFloat(coord.lon),
      modes,
    });
  }

  // Non-bus stop_areas (RER, Métro, Tram, Train, Câble…)
  for (const p of areaData?.places_nearby || []) {
    if (!p.stop_area) continue;
    const sa = p.stop_area;
    const coord = sa.coord;
    if (!coord?.lat || !coord?.lon) continue;
    const modes = modesDepuisPhysicalModes(sa.physical_modes);
    if (modes.every(m => m === 'BUS' || m === 'AUTRE')) continue;
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

export async function linesForArea(stopAreaId: string, signal?: AbortSignal): Promise<LineChip[]> {
  const data = await navitia(`stop_areas/${stopAreaId}/lines`, signal);
  return (data?.lines || []).map((l: any) => {
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
  });
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
