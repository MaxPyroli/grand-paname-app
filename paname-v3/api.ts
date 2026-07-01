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
