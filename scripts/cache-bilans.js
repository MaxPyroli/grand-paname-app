// Bilans du serveur gardés sur ce PC, pour ne lire chacun qu'UNE fois dans Firestore. Sans cela, la page des
// statistiques relisait jusqu'à 30 jours de bilans à chaque actualisation (720 par jour) et a épuisé le quota gratuit
// de lectures le 27/11/2026, ce qui bloque aussi le serveur d'alertes. Les bilans ne contiennent aucun jeton.
const JOURS = 30;
const DELAI_MINI_MS = 5 * 60_000;

// `lire(depuis)` : bilans { at (ms), ... } strictement postérieurs à `depuis` (Date).
// `stockage` : { charger() → { bilans, luA } | null, sauver(valeur) }.
function creerCacheBilans({ lire, stockage, horloge = Date.now }) {
  let etat = null;
  let enCours = null;
  async function actualiser() {
    etat ??= stockage.charger() || { bilans: [], luA: 0 };
    const maintenant = horloge();
    const limite = maintenant - JOURS * 86_400_000;
    if (maintenant - etat.luA >= DELAI_MINI_MS) {
      const dernier = etat.bilans.reduce((m, b) => Math.max(m, b.at), limite);
      const nouveaux = await lire(new Date(dernier));
      etat = { bilans: [...etat.bilans, ...nouveaux].filter(b => b.at >= limite), luA: maintenant };
      stockage.sauver(etat);
    }
    return etat.bilans.filter(b => b.at >= limite);
  }
  // Une seule lecture à la fois, même si deux requêtes arrivent ensemble.
  return () => (enCours ??= actualiser().finally(() => { enCours = null; }));
}

module.exports = { creerCacheBilans, DELAI_MINI_MS };
