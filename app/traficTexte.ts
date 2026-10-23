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
const NUM = '\\d{1,2}(?:er)?\\*?';
const DEBUT = "(?:[Dd]u|[Ll]e|[Jj]usqu['’]au|[Àà] partir du)";
const DATE_COMPLETE = `(?:${JOUR}\\s+)?${NUM}\\s+${MOIS}(?:\\s+\\d{4})?`;
const FIN = `(?:\\s+(?:au|jusqu['’]au)\\s+${DATE_COMPLETE})?(?:\\s+inclus)?`;
// « du 19 octobre au 25 octobre inclus », « jusqu'au 22 avril 2027 », « le vendredi 2 octobre »
const PERIODE = `${DEBUT}\\s+${DATE_COMPLETE}${FIN}`;
// « du 12 au 23 octobre »
const PERIODE_COURTE = `[Dd]u\\s+(?:${JOUR}\\s+)?${NUM}\\s+au\\s+(?:${JOUR}\\s+)?${NUM}\\s+${MOIS}(?:\\s+\\d{4})?(?:\\s+inclus)?`;
// Listes de dates : « les samedis 7 et 28 novembre », « dimanches 1er, 8, 15 et 29 novembre et le mercredi 11 novembre »,
// « 17-18 et 24-25 octobre », « lundi 19 octobre au vendredi 23 octobre ». Le mois est obligatoire (évite les nombres seuls).
const ELEMENT_DATE = `(?:${JOUR}s?\\s+)?${NUM}(?:-${NUM})?`;
const LIEN_DATES = '(?:\\s*,\\s*|\\s+et\\s+|\\s+au\\s+)';
const LISTE_DATES = `${ELEMENT_DATE}(?:${LIEN_DATES}${ELEMENT_DATE})*\\s+${MOIS}(?:${LIEN_DATES}(?:(?:les|le)\\s+)?${ELEMENT_DATE}(?:${LIEN_DATES}${ELEMENT_DATE})*\\s+${MOIS})*(?:\\s+\\d{4})?`;
// « 23/10 », « Vendredi 23/10 », « du 16/11 au 27/11 »
const SEP_NUM = '(?:\\s*,\\s*|\\s+et\\s+|\\s+au\\s+)';
const ELEMENT_NUM = '\\d{1,2}(?:/\\d{1,2}(?:/\\d{2,4})?)?';
// (la liste doit contenir au moins une date « jj/mm » : sinon n'importe quel nombre serait pris pour une date)
const DATE_NUMERIQUE = `(?:${JOUR}\\s+)?(?=(?:\\d{1,2}${SEP_NUM})*\\d{1,2}/\\d{1,2})${ELEMENT_NUM}(?:${SEP_NUM}${ELEMENT_NUM})*`;
const RYTHME = '(?:en semaine|le week-end|les week-ends|tous les jours|tous les soirs|chaque soir|chaque nuit|toute la journée)';
// « 22h10 », « de 10h00 à 16h00 », « à partir de 21h15 »
const HEURE = '(?:\\d{1,2}\\s?[hH](?:\\d{2})?|\\d{1,2}:\\d{2})';
const HORAIRE = `(?:(?:de|à partir de|jusqu['’]à|dès|vers|après|avant)\\s+)?${HEURE}(?:\\s+(?:à|et|jusqu['’]à)\\s+${HEURE})?`;

// Nom de station : mots à majuscule reliés au besoin par « de », « du », « la », « sur », un tiret entouré d'espaces…
// Les abréviations usuelles (« Aérop. », « St. ») gardent leur point ; sinon pas de point : « Eaubonne. Les »
// s'arrête à « Eaubonne ». Les tirets longs (« Cergy–Le Haut ») et les chiffres en fin de nom (« Gaulle 2 ») sont admis.
const MAJ = 'A-ZÀ-ÖØ-Þ';
const MIN = 'a-zà-öø-ÿœ';
const ABREV = '(?:Aérop|Aéro|St|Ste|Av|Bd|Pl|Pte|Gal|Mal)\\.';
const MOT_DEBUT = `(?:${ABREV}|[${MAJ}][${MAJ}${MIN}0-9'’\\-–]*)`;
// (un nombre seul peut finir un nom, « Gaulle 2 », mais pas « 21h07 » ni « 23/10 » : ce sont des heures et des dates)
const MOT_SUITE = `(?:${ABREV}|[${MAJ}][${MAJ}${MIN}0-9'’\\-–]*|\\d{1,2}(?![\\dhH:/]))`;
const LIEN = `(?:\\s+[-–]\\s+(?!(?:Du|Le|Les|Au|À|De)\\b)|\\s+(?:(?:de|du|des|la|le|les|sur|sous|en|aux?|l['’]|d['’])\\s*)*)`;
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
  `(${TRONCON})|(${GARES})|(${PAIRE})|(${ARRET})|(${PERIODE})|(${PERIODE_COURTE})|(${HORAIRE})|(${RYTHME})|(${SOLO})|(${LISTE_DATES})|(${DATE_NUMERIQUE})`, 'g');

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

const UNE_DATE = new RegExp(`(?:${JOUR}s?\\s+)?(?:\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?|${NUM}(?:-${NUM})?)(?:\\s+${MOIS})?(?:\\s+\\d{4})?`, 'g');
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

export type AnalyseStations = {
  // Le candidat repéré par la forme est-il une station de la ligne ?
  estStation: (candidat: string) => boolean;
  // Positions [début, fin[ des noms de stations de la ligne trouvés DIRECTEMENT dans le texte.
  trouver: (texte: string) => Array<[number, number]>;
};

function normaliserMot(m: string): string {
  const x = m.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return x === 'saint' ? 'st' : x === 'sainte' ? 'ste' : x;
}
function motsAvecPosition(texte: string): { m: string; debut: number; fin: number }[] {
  const sortie: { m: string; debut: number; fin: number }[] = [];
  const re = /[A-Za-zÀ-ÖØ-öø-ÿŒœ0-9]+/g;
  let r: RegExpExecArray | null;
  while ((r = re.exec(texte)) !== null) sortie.push({ m: normaliserMot(r[0]), debut: r.index, fin: r.index + r[0].length });
  return sortie;
}

export function creerAnalyseStations(noms: string[]): AnalyseStations {
  const stations = noms.map(n => significatifs(n));

  // Index pour la recherche directe : premier mot → écritures possibles du nom (complet, sans parenthèses, sans
  // « Paris » devant). Un nom d'un seul mot court ou banal ne sert pas à la recherche directe (trop de faux positifs).
  const index = new Map<string, string[][]>();
  for (const nom of noms) {
    const ecritures = new Set([nom, nom.replace(/\([^)]*\)/g, ' '), nom.replace(/\([^)]*\)/g, ' ').replace(/^\s*Paris\s+/i, '')]);
    for (const e of ecritures) {
      const mots = motsAvecPosition(e).map(x => x.m);
      if (mots.length === 0 || (mots.length === 1 && mots[0].length < 4)) continue;
      const liste = index.get(mots[0]) ?? [];
      if (!liste.some(l => l.join(' ') === mots.join(' '))) liste.push(mots);
      index.set(mots[0], liste);
    }
  }

  return {
    estStation: (candidat: string) => {
      const mc = significatifs(candidat);
      if (mc.length === 0) return false;
      return stations.some(ms => mc.every(m => ms.some(s => memeMot(m, s))));
    },
    trouver: (texte: string) => {
      const mots = motsAvecPosition(texte);
      const trouves: Array<[number, number]> = [];
      for (let i = 0; i < mots.length; ) {
        let meilleur = 0;
        // Un nom propre commence par une majuscule : évite de prendre un mot courant pour une station.
        const c = texte[mots[i].debut];
        if (c !== c.toLowerCase()) {
          for (const ecriture of index.get(mots[i].m) ?? []) {
            if (ecriture.length > meilleur && ecriture.every((m, k) => mots[i + k]?.m === m)) meilleur = ecriture.length;
          }
        }
        if (meilleur > 0) { trouves.push([mots[i].debut, mots[i + meilleur - 1].fin]); i += meilleur; } else i++;
      }
      return trouves;
    },
  };
}

export function decouperSurligne(texte: string, analyse?: AnalyseStations): Segment[] {
  const brut = decouperBrut(texte);
  if (!analyse || texte.length === 0) return brut;
  // Peinture caractère par caractère : d'abord ce que le repérage par la forme a trouvé (stations validées par la liste
  // de la ligne, dates, horaires), puis les noms de stations trouvés directement dans le texte, qui l'emportent.
  const types: Segment['type'][] = new Array(texte.length).fill('texte');
  let pos = 0;
  for (const seg of brut) {
    const fin = pos + seg.texte.length;
    const type = seg.type === 'station' ? (analyse.estStation(seg.texte) ? 'station' : 'texte') : seg.type;
    if (type !== 'texte') for (let k = pos; k < fin; k++) types[k] = type;
    pos = fin;
  }
  for (const [debut, fin] of analyse.trouver(texte)) {
    for (let k = debut; k < fin; k++) if (types[k] !== 'quand') types[k] = 'station';
  }
  const sortie: Segment[] = [];
  let debut = 0;
  for (let k = 1; k <= texte.length; k++) {
    if (k === texte.length || types[k] !== types[debut]) {
      sortie.push({ texte: texte.slice(debut, k), type: types[debut] });
      debut = k;
    }
  }
  return sortie;
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
    else if (m[5] || m[6] || m[10] || m[11]) segments.push(...marquer(m[0], UNE_DATE, 'quand'));
    else if (m[7]) segments.push(...marquer(m[0], UNE_HEURE, 'quand'));
    else segments.push({ texte: m[0], type: 'quand' });
    dernier = m.index + m[0].length;
  }
  if (dernier < texte.length) segments.push({ texte: texte.slice(dernier), type: 'texte' });
  return segments;
}
