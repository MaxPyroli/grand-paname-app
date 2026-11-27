// Ce qu'Android laisse réellement passer, comparé à ce que l'utilisateur a demandé dans les paramètres de l'app.
// Fichier sans dépendance : testable seul (tests/categories-notifs.test.ts).
import type { NiveauAlertes } from './prefsNotifs.ts';

export type CategorieAlerte = 'information' | 'perturbation' | 'interruption';
export const NOMS_CATEGORIES: Record<CategorieAlerte, string> = {
  information: 'Info Trafic : Information',
  perturbation: 'Info Trafic : Perturbation',
  interruption: 'Info Trafic : Interruption',
};
export const canalDe = (c: CategorieAlerte) => `trafic_${c}`;

// Valeurs d'`AndroidImportance` (expo-notifications) : NONE = catégorie désactivée ; jusqu'à LOW = sans son.
const DESACTIVEE = 2, SANS_SON = 4;

// Les catégories dont un niveau d'alerte a besoin (voir `voulue` dans functions/alertes-trafic.js).
export function categoriesDuNiveau(niveau: NiveauAlertes): CategorieAlerte[] {
  if (niveau === 'interruptions') return ['interruption'];
  return niveau === 'toutes' ? ['interruption', 'perturbation', 'information'] : ['interruption', 'perturbation'];
}

export type Souci =
  | { genre: 'app' }
  | { genre: 'desactivee'; categorie: CategorieAlerte }
  | { genre: 'silencieuse'; categorie: CategorieAlerte };

// `autorisees` : les notifications de l'app sont permises. `canaux` : les catégories connues d'Android (une catégorie
// absente n'est pas encore créée : rien à signaler).
export function soucisNotifs(niveau: NiveauAlertes, autorisees: boolean, canaux: { id: string; importance: number }[]): Souci[] {
  if (!autorisees) return [{ genre: 'app' }];
  const soucis: Souci[] = [];
  for (const categorie of categoriesDuNiveau(niveau)) {
    const canal = canaux.find(c => c.id === canalDe(categorie));
    if (!canal) continue;
    if (canal.importance === DESACTIVEE) soucis.push({ genre: 'desactivee', categorie });
    // « Information » est silencieuse par nature.
    else if (categorie !== 'information' && canal.importance > DESACTIVEE && canal.importance <= SANS_SON) soucis.push({ genre: 'silencieuse', categorie });
  }
  return soucis;
}

export function texteSouci(s: Souci): string {
  if (s.genre === 'app') return 'Les notifications de Grand Paname sont désactivées dans Android : aucune alerte ne peut arriver quand l’app est fermée. Toucher pour les activer.';
  const nom = `« ${NOMS_CATEGORIES[s.categorie]} »`;
  return s.genre === 'desactivee'
    ? `La catégorie ${nom} est désactivée dans Android : ces alertes n’arriveront pas en notification. Toucher pour l’activer.`
    : `La catégorie ${nom} est réglée sans son dans Android. Toucher pour la modifier.`;
}
