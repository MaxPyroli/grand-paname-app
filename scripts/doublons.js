// Repère, parmi les jetons push, ceux qui appartiennent à un téléphone déjà
// représenté par un jeton plus récent (même `deviceKey`). Fonction pure, séparée
// pour pouvoir la tester sans Firestore.
//
// `docs` : liste d'objets { x: { deviceKey?, updatedAt? } , ... } ; `millis(x)`
// donne la date de mise à jour en millisecondes. Renvoie l'ensemble des éléments
// à supprimer (tous sauf le plus récent de chaque groupe). Les lignes sans
// `deviceKey` ne sont jamais regroupées.
function choisirDoublons(docs, millis) {
  const groupes = new Map();
  for (const d of docs) {
    const cle = d.x.deviceKey;
    if (!cle) continue;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(d);
  }
  const aSupprimer = new Set();
  for (const g of groupes.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => millis(b.x) - millis(a.x));
    g.slice(1).forEach(d => aSupprimer.add(d));
  }
  return aSupprimer;
}

module.exports = { choisirDoublons };
