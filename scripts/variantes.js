// Version de l'app d'un appareil enregistré (champ `variante` de son document `pushTokens`, écrit par l'app depuis la
// 3.4.0) : « stable » (Play Store) ou « dev » (version de développement). Les appareils enregistrés avant n'ont pas
// d'étiquette : « ancien ». Ce sont presque tous de vrais utilisateurs, donc ils comptent avec « stable ».
//
// Filtre de l'outil de gestion : « stable » (stable + anciens), « dev », « toutes ».

const FILTRES = ['stable', 'dev', 'toutes'];

function varianteDe(doc) {
  return doc && (doc.variante === 'stable' || doc.variante === 'dev') ? doc.variante : 'ancien';
}

function filtreValide(f) {
  return FILTRES.includes(f) ? f : 'stable';
}

function correspond(variante, filtre) {
  if (filtre === 'toutes') return true;
  if (filtre === 'dev') return variante === 'dev';
  return variante !== 'dev';
}

module.exports = { FILTRES, varianteDe, filtreValide, correspond };
