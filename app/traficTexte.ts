// Mise en avant des informations importantes d'une perturbation : jours, dates, horaires et tronçon fermé
// (« entre Père-Lachaise et Barbès - Rochechouart »). Le texte est découpé en morceaux, ceux à surligner
// sont marqués `fort`. Expressions écrites à la main (pas d'option « insensible à la casse » : elle ferait
// reconnaître n'importe quel mot comme un nom de station).
export type Segment = { texte: string; fort: boolean };

const JOUR = '(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)';
const MOIS = '(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)';
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
// Nom de station : mots à majuscule, reliés au besoin par « de », « du », « la », « sur », un tiret entouré d'espaces…
const MAJ = 'A-ZÀ-ÖØ-Þ';
const MIN = 'a-zà-öø-ÿ';
const MOT = `[${MAJ}][${MAJ}${MIN}0-9'’\\-]*`;   // pas de point : « Eaubonne. Les » s'arrête à « Eaubonne »
const LIEN = `(?:\\s+-\\s+|\\s+(?:(?:de|du|des|la|le|les|sur|sous|en|aux?|l['’]|d['’])\\s*)*)`;
const STATION = `${MOT}(?:${LIEN}${MOT})*`;
// « entre Père-Lachaise et Barbès - Rochechouart », « entre Argenteuil <> Ermont Eaubonne »
const TRONCON = `entre\\s+${STATION}\\s*(?:<>|<->|↔|et|à)\\s*${STATION}`;
// « l'arrêt n'est pas desservi à Saint-Michel »
const ARRET = `(?:desservi|desservie|fermée?)\\s+(?:à|en gare de|à la station)\\s+${STATION}`;

const MOTIF = new RegExp(`(${TRONCON})|(${ARRET})|(${PERIODE})|(${PERIODE_COURTE})|(${HORAIRE})|(${RYTHME})`, 'g');

export function decouperSurligne(texte: string): Segment[] {
  const segments: Segment[] = [];
  let dernier = 0;
  MOTIF.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MOTIF.exec(texte)) !== null) {
    if (m[0] === '') { MOTIF.lastIndex++; continue; }
    if (m.index > dernier) segments.push({ texte: texte.slice(dernier, m.index), fort: false });
    segments.push({ texte: m[0], fort: true });
    dernier = m.index + m[0].length;
  }
  if (dernier < texte.length) segments.push({ texte: texte.slice(dernier), fort: false });
  return segments;
}
