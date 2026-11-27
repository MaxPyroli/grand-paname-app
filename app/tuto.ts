// Déroulé du tutoriel guidé (sans aucun composant : testable seul, voir tests/tuto.test.ts). L'affichage est dans
// `TutoGuide.tsx`. Principe : on éclaire le VRAI élément de l'app et la personne fait le geste pour avancer.

export type CibleTuto = 'recherche' | 'volet' | 'etoile' | 'navFavoris' | 'navTrafic' | 'cloche';
export type EtapeId = 'bienvenue' | 'recherche' | 'horaires' | 'favori' | 'favoris' | 'trafic' | 'alertes' | 'fin';

export type Etape = {
  id: EtapeId;
  cible: CibleTuto | null;   // null : carte centrée
  attend: 'geste' | 'bouton';
  titre: string;
  texte: string;
};

export const ETAPES: Etape[] = [
  { id: 'bienvenue', cible: null, attend: 'bouton', titre: 'Bienvenue sur Grand Paname', texte: 'Naviguez le Grand Paris, tout simplement !\nUne petite visite pour découvrir l\'essentiel.' },
  { id: 'recherche', cible: 'recherche', attend: 'geste', titre: 'Cherche un arrêt', texte: 'Touche la barre, tape le nom d\'un arrêt puis choisis-le.' },
  { id: 'horaires', cible: 'volet', attend: 'bouton', titre: 'Les horaires en direct', texte: 'Les prochains passages, ligne par ligne. Glisse le volet vers le haut pour tout voir.' },
  { id: 'favori', cible: 'etoile', attend: 'geste', titre: 'Garde-le en favori', texte: 'Touche l\'étoile pour retrouver cet arrêt en un geste.' },
  { id: 'favoris', cible: 'navFavoris', attend: 'geste', titre: 'Tes favoris', texte: 'Ouvre l\'onglet Favoris.' },
  { id: 'trafic', cible: 'navTrafic', attend: 'geste', titre: 'L\'info trafic', texte: 'Ouvre l\'onglet Trafic : l\'état de toutes les lignes d\'un coup d\'œil.' },
  { id: 'alertes', cible: 'cloche', attend: 'geste', titre: 'Les alertes', texte: 'Touche la cloche pour choisir les lignes dont tu veux être prévenu.' },
  { id: 'fin', cible: null, attend: 'bouton', titre: 'Tout est prêt', texte: 'Bon voyage !' },
];

export const etape = (id: EtapeId): Etape => ETAPES.find(e => e.id === id)!;
export const etapeSuivante = (id: EtapeId): EtapeId => ETAPES[Math.min(ETAPES.length - 1, ETAPES.findIndex(e => e.id === id) + 1)].id;

// Où poser la bulle quand un élément est éclairé : du côté où elle TIENT (sous un élément du haut, sinon au-dessus) ; si
// elle ne tient d'aucun côté (volet des horaires tiré en grand), par-dessus l'élément, en bas de l'écran. Jamais hors champ.
export type PlaceBulle = { top: number } | { bottom: number };
export function placerBulle(zone: { y: number; h: number }, ecranH: number, bulleH: number, hautLibre: number, basLibre: number): PlaceBulle {
  const ecart = 14;
  const dessous = ecranH - basLibre - (zone.y + zone.h) - ecart >= bulleH;
  const dessus = zone.y - ecart - hautLibre >= bulleH;
  const enHaut = zone.y + zone.h / 2 < ecranH / 2;
  if (dessous && (enHaut || !dessus)) return { top: zone.y + zone.h + ecart };
  if (dessus) return { bottom: ecranH - zone.y + ecart };
  return { bottom: basLibre };
}

// Ce que le tutoriel observe dans l'app.
export type EtatApp = {
  gareOuverte: boolean;        // les horaires d'un arrêt sont affichés
  gareEnFavori: boolean;       // cet arrêt est dans les favoris
  onglet: string;              // 'accueil' | 'favoris' | 'trafic' | …
  vueTraficOuverte: boolean;   // une vue est ouverte par-dessus la liste du Trafic (ici : les alertes)
};

// Le geste attendu par l'étape a-t-il été fait ?
export function gesteFait(id: EtapeId, e: EtatApp): boolean {
  switch (id) {
    case 'recherche': return e.gareOuverte;
    case 'favori': return e.gareOuverte && e.gareEnFavori;
    case 'favoris': return e.onglet === 'favoris';
    case 'trafic': return e.onglet === 'trafic';
    case 'alertes': return e.onglet === 'trafic' && e.vueTraficOuverte;
    default: return false;
  }
}

// La personne a quitté ce qu'il faut pour l'étape en cours : où revenir (null : tout va bien).
export function retourNecessaire(id: EtapeId, e: EtatApp): EtapeId | null {
  if ((id === 'horaires' || id === 'favori') && !e.gareOuverte) return 'recherche';
  if (id === 'alertes' && e.onglet !== 'trafic') return 'trafic';
  return null;
}
