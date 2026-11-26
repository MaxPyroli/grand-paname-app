import type { DetailLigne } from './traficApi';

// Lignes du Grand Paris Express (easter egg : 15 à 18, pas encore en service). Leur détail est celui de n'importe quelle
// ligne (`TraficDetail`) : une seule « perturbation » de type Information qui donne les ouvertures prévues.
// SOURCE : communiqué de la Société des grands projets du 24 septembre 2026, « Rappel du calendrier de mise en service
// des lignes 15, 16, 17 et 18 ». Les terminus de la 15 Sud (absents de ce rappel) viennent de la presse.
// À METTRE À JOUR à chaque nouveau calendrier (et quand un tronçon ouvre).
const OUVERTURES: Record<string, string[]> = {
  '15': [
    'Ligne 15 Sud, Pont de Sèvres – Noisy-Champs : automne 2027',
    'Lignes 15 Ouest et 15 Est : 2031',
  ],
  '16': [
    'Saint-Denis Pleyel – Parc du Blanc-Mesnil : automne 2028',
    'Parc du Blanc-Mesnil – Noisy-Champs : automne 2029',
  ],
  '17': [
    'Saint-Denis Pleyel – Le Bourget Aéroport : automne 2028',
    'Le Bourget Aéroport – Parc des Expositions : automne 2029',
    'Parc des Expositions – Le Mesnil-Amelot : fin 2030',
  ],
  '18': [
    'Massy-Palaiseau – Christ de Saclay : décembre 2026',
    'Massy-Palaiseau – Aéroport d\'Orly : automne 2027',
    'Aéroport d\'Orly – Versailles Chantiers : 2030',
  ],
};

export function detailGPE(code: string): DetailLigne {
  return {
    enCours: [{
      id: 'gpe-' + code,
      titre: 'Ligne pas encore en service : ouvertures prévues',
      texte: [...(OUVERTURES[code] ?? []), 'Calendrier de la Société des grands projets (24 septembre 2026), susceptible d\'évoluer.'].join('\n'),
      cause: 'information', niveau: 'info', type: 'info', enCours: true, debut: 0, fin: 0,
      periode: 'Grand Paris Express', miseAJour: null,
    }],
    aVenir: [],
    stations: [],
  };
}
