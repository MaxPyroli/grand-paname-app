// Mise en avant des informations importantes d'une perturbation : jours, dates, horaires et stations.
// Le texte est découpé en morceaux typés :
//   - `station` : un nom de station ou de gare ;
//   - `quand`   : une date, un horaire ou un rythme (« en semaine ») ;
//   - `texte`   : le reste.
// Chaque nom, date ou horaire est un morceau À PART (« du lundi 21 septembre au vendredi 02 octobre » → deux
// morceaux marqués), pour pouvoir les entourer un par un. Expressions écrites à la main : pas d'option
// « insensible à la casse », elle ferait reconnaître n'importe quel mot comme un nom de station.
export type Segment = { texte: string; type: 'texte' | 'station' | 'quand' };

const JOUR = '(?:[Ll]undi|[Mm]ardi|[Mm]ercredi|[Jj]eudi|[Vv]endredi|[Ss]amedi|[Dd]imanche)';
const MOIS = '(?:[Jj]anvier|[Ff]évrier|[Mm]ars|[Aa]vril|[Mm]ai|[Jj]uin|[Jj]uillet|[Aa]oût|[Ss]eptembre|[Oo]ctobre|[Nn]ovembre|[Dd]écembre)';
const NUM = '\\d{1,2}(?:er)?';
const DEBUT = "(?:[Dd]u|[Ll]e|[Jj]usqu['’]au|[Àà] partir du)";
const DATE_COMPLETE = `(?:${JOUR}\\s+)?${NUM}\\s+${MOIS}(?:\\s+\\d{4})?`;
const FIN = `(?:\\s+(?:au|jusqu['’]au)\\s+${DATE_COMPLETE})?(?:\\s+inclus)?`;
// « du 19 octobre au 25 octobre inclus », « jusqu'au 22 avril 2027 », « le vendredi 2 octobre »
const PERIODE = `${DEBUT}\\s+${DATE_COMPLETE}${FIN}`;
// « du 12 au 23 octobre »
const PERIODE_COURTE = `[Dd]u\\s+(?:${JOUR}\\s+)?${NUM}\\s+au\\s+(?:${JOUR}\\s+)?${NUM}\\s+${MOIS}(?:\\s+\\d{4})?(?:\\s+inclus)?`;
const RYTHME = '(?:en semaine|le week-end|les week-ends|tous les jours|tous les soirs|chaque soir|chaque nuit|toute la journée)';
// « 22h10 », « de 10h00 à 16h00 », « à partir de 21h15 »
const HEURE = '\\d{1,2}\\s?h(?:\\d{2})?';
const HORAIRE = `(?:(?:de|à partir de|jusqu['’]à|dès|vers|après|avant)\\s+)?${HEURE}(?:\\s+(?:à|et|jusqu['’]à)\\s+${HEURE})?`;

// Nom de station : mots à majuscule reliés au besoin par « de », « du », « la », « sur », un tiret entouré d'espaces…
// Les abréviations usuelles (« Aérop. », « St. ») gardent leur point ; sinon pas de point : « Eaubonne. Les »
// s'arrête à « Eaubonne ». Les tirets longs (« Cergy–Le Haut ») et les chiffres en fin de nom (« Gaulle 2 ») sont admis.
const MAJ = 'A-ZÀ-ÖØ-Þ';
const MIN = 'a-zà-öø-ÿœ';
const ABREV = '(?:Aérop|Aéro|St|Ste|Av|Bd|Pl|Pte|Gal|Mal)\\.';
const MOT_DEBUT = `(?:${ABREV}|[${MAJ}][${MAJ}${MIN}0-9'’\\-–]*)`;
const MOT_SUITE = `(?:${ABREV}|[${MAJ}0-9][${MAJ}${MIN}0-9'’\\-–]*)`;
const LIEN = `(?:\\s+[-–]\\s+|\\s+(?:(?:de|du|des|la|le|les|sur|sous|en|aux?|l['’]|d['’])\\s*)*)`;
const STATION = `${MOT_DEBUT}(?:${LIEN}${MOT_SUITE})*`;
const SEP_STATIONS = '(?:<>|<->|↔|et|à)';
const SEP_LISTE = '(?:\\s*,\\s*|\\s+et\\s+)';
// « entre Père-Lachaise et Barbès - Rochechouart », « entre Argenteuil <> Ermont Eaubonne »
const TRONCON = `entre\\s+${STATION}\\s*${SEP_STATIONS}\\s*${STATION}`;
// « les gares de Bois Colombes, Colombes et Le Stade »
const GARES = `gares?\\s+(?:de\\s+|d['’])?${STATION}(?:${SEP_LISTE}${STATION})*`;
// « Asnières sur Seine <> Argenteuil », « Paris Saint-Lazare vers Ermont Eaubonne »
const PAIRE = `${STATION}(?:\\s*(?:<>|<->|↔)\\s*|\\s+vers\\s+)${STATION}`;
// « l'arrêt n'est pas desservi à Saint-Michel »
const ARRET = `(?:desservi|desservie|fermée?)\\s+(?:à|en gare de|à la station)\\s+${STATION}`;
// « au départ de Cergy–Le Haut », « jusqu'à Maisons-Laffitte », « vers Paris », « à Sartrouville » (mais pas « du RER B »)
const SOLO = `(?:au départ de|jusqu['’]à|depuis|vers|à|de)\\s+(?!(?:RER|Métro|Transilien|Tram|Tramway|Bus|Ligne|Île|France)\\b)${STATION}`;

const MOTIF = new RegExp(
  `(${TRONCON})|(${GARES})|(${PAIRE})|(${ARRET})|(${PERIODE})|(${PERIODE_COURTE})|(${HORAIRE})|(${RYTHME})|(${SOLO})`, 'g');

// Découpe un morceau déjà repéré en sous-morceaux marqués d'un type (les dates d'une période, les noms d'un tronçon…).
function marquer(texte: string, motif: RegExp, type: Segment['type']): Segment[] {
  const sortie: Segment[] = [];
  let dernier = 0;
  motif.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(texte)) !== null) {
    if (m[0] === '') { motif.lastIndex++; continue; }
    if (m.index > dernier) sortie.push({ texte: texte.slice(dernier, m.index), type: 'texte' });
    sortie.push({ texte: m[0], type });
    dernier = m.index + m[0].length;
  }
  if (dernier < texte.length) sortie.push({ texte: texte.slice(dernier), type: 'texte' });
  return sortie;
}

const UNE_DATE = new RegExp(`(?:${JOUR}\\s+)?${NUM}(?:\\s+${MOIS})?(?:\\s+\\d{4})?`, 'g');
const UNE_HEURE = new RegExp(HEURE, 'g');
const UNE_STATION = new RegExp(STATION, 'g');

// ── Stations réelles de la ligne ──────────────────────────────────────────────────────────────────────────────────
// Le repérage par la forme ne sait pas dire si « Grande Couronne » est une station : on ne garde donc que les noms
// qui correspondent à une station de la ligne (« Paris St-Lazare » ↔ « Paris Saint-Lazare », « Aérop. » ↔ « Aéroport »).
const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'au', 'aux', 'et', 'paris', 'gare', 'station', 'l', 'd']);
function mots(nom: string): string[] {
  return nom
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-–'’().,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(m => (m === 'saint' ? 'st' : m === 'sainte' ? 'ste' : m));
}
const significatifs = (nom: string) => mots(nom).filter(m => !MOTS_VIDES.has(m) && (m.length > 1 || /\d/.test(m)));
const memeMot = (a: string, b: string) => a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));

export function creerFiltreStations(noms: string[]): (candidat: string) => boolean {
  const stations = noms.map(n => significatifs(n));
  return (candidat: string) => {
    const mc = significatifs(candidat);
    if (mc.length === 0) return false;
    return stations.some(ms => mc.every(m => ms.some(s => memeMot(m, s))));
  };
}

export function decouperSurligne(texte: string, estStation?: (candidat: string) => boolean): Segment[] {
  const segments = decouperBrut(texte);
  if (!estStation) return segments;
  return segments.map(s => (s.type === 'station' && !estStation(s.texte) ? { texte: s.texte, type: 'texte' as const } : s));
}

function decouperBrut(texte: string): Segment[] {
  const segments: Segment[] = [];
  let dernier = 0;
  MOTIF.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MOTIF.exec(texte)) !== null) {
    if (m[0] === '') { MOTIF.lastIndex++; continue; }
    if (m.index > dernier) segments.push({ texte: texte.slice(dernier, m.index), type: 'texte' });
    if (m[1] || m[2] || m[3] || m[4] || m[9]) segments.push(...marquer(m[0], UNE_STATION, 'station'));
    else if (m[5] || m[6]) segments.push(...marquer(m[0], UNE_DATE, 'quand'));
    else if (m[7]) segments.push(...marquer(m[0], UNE_HEURE, 'quand'));
    else segments.push({ texte: m[0], type: 'quand' });
    dernier = m.index + m[0].length;
  }
  if (dernier < texte.length) segments.push({ texte: texte.slice(dernier), type: 'texte' });
  return segments;
}
