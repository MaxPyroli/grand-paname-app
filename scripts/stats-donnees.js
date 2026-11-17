// Calculs des statistiques affichées par l'interface locale (`stats-ui.js`). Fonctions pures, sans réseau ni Firebase :
// elles reçoivent les données brutes et renvoient des chiffres. AUCUN jeton de notification n'en sort.
//
//   appareils  : documents `pushTokens`  { platform, appVersion, updatedAt (ms), alertesLignes[] }
//   passages   : bilans `statsAlertes`   { at (ms), perturbations, nouvelles, abonnes, envoyees, dureeMs, erreur, ... }
//   historique : envois manuels          { date (ISO), categorie, titre, destinataires, livres, echecs }
//   nomsLignes : Map idLigne → { code, mode } (facultatif : sans lui, l'identifiant est affiché tel quel)

const JOUR = 86_400_000;

function compter(valeurs) {
  const m = new Map();
  for (const v of valeurs) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].map(([nom, n]) => ({ nom, n })).sort((a, b) => b.n - a.n || String(a.nom).localeCompare(String(b.nom)));
}

// Compare deux numéros de version « 3.3.3 » (le plus récent d'abord).
function comparerVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] || 0) - (pa[i] || 0);
    if (d) return d;
  }
  return 0;
}

function statsAppareils(appareils, maintenant) {
  const parVersion = compter(appareils.map(a => a.appVersion || 'inconnue')).sort((x, y) => comparerVersions(x.nom, y.nom));
  const vus = (jours) => appareils.filter(a => a.updatedAt && maintenant - a.updatedAt <= jours * JOUR).length;
  const lignes = new Map();
  for (const a of appareils) for (const id of new Set(a.alertesLignes || [])) lignes.set(id, (lignes.get(id) || 0) + 1);
  return {
    total: appareils.length,
    parPlateforme: compter(appareils.map(a => a.platform || 'inconnue')),
    parVersion,
    vus7j: vus(7),
    vus30j: vus(30),
    avecAlertes: appareils.filter(a => (a.alertesLignes || []).length > 0).length,
    lignesSuivies: lignes,
  };
}

function nomLigne(id, nomsLignes) {
  const l = nomsLignes && nomsLignes.get(id);
  return l ? `${l.mode ? l.mode + ' ' : ''}${l.code}`.trim() : id;
}

function statsAlertes(passages, maintenant) {
  const tries = [...passages].sort((a, b) => a.at - b.at);
  const ecarts = tries.slice(1).map((p, i) => p.at - tries[i].at);
  const dernier24h = tries.filter(p => maintenant - p.at <= JOUR);
  const somme = (liste, k) => liste.reduce((n, p) => n + (p[k] || 0), 0);
  return {
    passages: tries.length,
    passages24h: dernier24h.length,
    erreurs: tries.filter(p => p.erreur).length,
    notificationsEnvoyees: somme(tries, 'envoyees'),
    nouvellesDetectees: somme(tries, 'nouvelles'),
    dernierPassage: tries.length ? tries[tries.length - 1].at : null,
    ecartMoyenMs: ecarts.length ? Math.round(ecarts.reduce((a, b) => a + b, 0) / ecarts.length) : null,
    ecartMaxMs: ecarts.length ? Math.max(...ecarts) : null,
    // Pour le graphique : un point par passage, avec l'écart depuis le précédent.
    serie: tries.map((p, i) => ({
      at: p.at, ecartMs: i ? p.at - tries[i - 1].at : null, perturbations: p.perturbations || 0, nouvelles: p.nouvelles || 0,
      envoyees: p.envoyees || 0, erreur: p.erreur || null, premier: !!p.premierPassage,
    })),
  };
}

function statsEnvois(historique) {
  const tries = [...historique].sort((a, b) => new Date(b.date) - new Date(a.date));
  return {
    total: tries.length,
    parCategorie: compter(tries.map(h => h.categorie || 'default')),
    recents: tries.slice(0, 10).map(h => ({
      date: new Date(h.date).getTime(), categorie: h.categorie, titre: h.titre, destinataires: h.destinataires, livres: h.livres, echecs: h.echecs,
    })),
  };
}

function agreger({ appareils = [], passages = [], historique = [], nomsLignes = null, maintenant = Date.now() }) {
  const a = statsAppareils(appareils, maintenant);
  const lignesPopulaires = [...a.lignesSuivies.entries()]
    .map(([id, n]) => ({ id, nom: nomLigne(id, nomsLignes), n }))
    .sort((x, y) => y.n - x.n || x.nom.localeCompare(y.nom, 'fr', { numeric: true }))
    .slice(0, 15);
  const { lignesSuivies, ...appareilsSansDetail } = a;
  return { genereA: maintenant, appareils: appareilsSansDetail, lignesPopulaires, alertes: statsAlertes(passages, maintenant), envois: statsEnvois(historique) };
}

module.exports = { agreger, comparerVersions, compter };
