import { LIGNE_ICONS } from './ligneIcons';
import type { ModeTrafic } from './traficApi';

// Symbole officiel d'une ligne (fichier `app/icons/lignes/<mode>-<ligne>.svg`, voir `ligneIcons.ts`).
// Le code de ligne vient de Navitia : « 7B » → métro 7 bis, « T3a » → tram 3a, « C1 » → câble 1.
// Les tramways et le câble ont une version « support foncé » (texte clair) pour le mode sombre.
// Renvoie `undefined` si la ligne n'a pas de symbole : l'appelant dessine alors sa pastille de couleur.
export function symboleLigne(mode: ModeTrafic, code: string, sombre: boolean): string | undefined {
  let cle: string;
  switch (mode) {
    case 'METRO': cle = 'metro-' + code.toLowerCase().replace(/^(\d+)b$/, '$1bis'); break;
    case 'RER': cle = 'rer-' + code.toUpperCase(); break;
    case 'TRAIN': cle = 'train-' + code.toUpperCase(); break;
    case 'TRAM': cle = 'tram-' + code.toLowerCase().replace(/^t/, ''); break;
    case 'CABLE': cle = 'cable-' + code.toLowerCase().replace(/^c/, ''); break;
    default: return undefined;   // bus : pas de symbole officiel, pastille aux couleurs de la ligne
  }
  return (sombre ? LIGNE_ICONS[cle + '-fonce'] : undefined) ?? LIGNE_ICONS[cle];
}
