// Journal des alertes trafic ENVOYÉES (collection Firestore `journalAlertes`, écrite par la surveillance en réel).
// Sert à comprendre les répétitions : quelle annonce, quel `disruption_id`, quel texte. Lecture seule.
//
// Usage :  node journal-alertes.js                 (24 dernières heures, toutes les lignes)
//          node journal-alertes.js 48 "RER A"      (48 h, une seule ligne)
//          node journal-alertes.js 48 "" texte     (avec le texte complet de chaque annonce)
// Compte de service : FIREBASE_SERVICE_ACCOUNT_PATH, sinon ../firebase-service-account.json

const path = require('path');
const FORMAT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const norme = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const court = s => (s || '—').slice(0, 8);

// `entrees` : triées de la plus ancienne à la plus récente. Résume les répétitions.
function analyser(entrees) {
  const groupes = new Map();   // ligne + disruption_id → entrées
  const textes = new Set(); const annonces = new Set();
  let memeTexte = 0, memeAnnonce = 0;
  for (const e of entrees) {
    const texte = norme((e.titre || '') + (e.detail || ''));
    const t = `${e.ligneId}|${texte}`;
    if (texte && textes.has(t)) memeTexte++;
    textes.add(t);
    const a = `${e.ligneId}|${e.perturbationId}`;
    if (annonces.has(a) && e.motifEnvoi === 'nouvelle') memeAnnonce++;
    annonces.add(a);
    if (!e.disruptionId) continue;
    const k = `${e.ligne}|${e.disruptionId}`;
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(e);
  }
  return {
    total: entrees.length,
    sansDisruptionId: entrees.filter(e => !e.disruptionId).length,
    memeTexte,        // texte déjà envoyé pour cette ligne
    memeAnnonce,      // même annonce renvoyée comme « nouvelle » (disparue puis revenue)
    groupesRepetes: [...groupes.values()].filter(g => g.length > 1),
    groupes: groupes.size,
  };
}

async function main() {
  const heures = Number(process.argv[2]) || 24;
  const filtre = (process.argv[3] || '').toLowerCase();
  const avecTexte = process.argv[4] === 'texte';
  const admin = require('firebase-admin');
  const compte = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, '..', 'firebase-service-account.json'));
  admin.initializeApp({ credential: admin.credential.cert(compte) });
  const depuis = new Date(Date.now() - heures * 3_600_000);
  const snap = await admin.firestore().collection('journalAlertes').where('at', '>=', depuis).orderBy('at').get();
  const entrees = snap.docs.flatMap(d => { const x = d.data(); return (x.alertes || []).map(a => ({ ...a, at: x.at.toMillis() })); })
    .filter(e => !filtre || e.ligne.toLowerCase() === filtre);
  if (entrees.length === 0) { console.log(`Aucune alerte envoyée enregistrée sur les ${heures} dernières heures.`); return; }
  for (const e of entrees) {
    console.log(`${FORMAT.format(e.at)}  ${e.ligne.padEnd(14)} annonce ${court(e.perturbationId)}  disruption ${court(e.disruptionId)}  ${e.motifEnvoi.padEnd(11)} ${e.gravite.padEnd(9)} ${e.titre || '(sans texte)'}`);
    if (avecTexte && e.detail) console.log('      ' + e.detail.replace(/\n/g, '\n      '));
  }
  const r = analyser(entrees);
  console.log(`\n${r.total} alerte(s) ; ${r.memeTexte} au texte déjà envoyé ; ${r.memeAnnonce} annonce(s) renvoyée(s) comme nouvelles ; ${r.sansDisruptionId} sans disruption_id ; ${r.groupes} disruption_id différent(s).`);
  for (const g of r.groupesRepetes) {
    console.log(`  ${g[0].ligne}, disruption ${court(g[0].disruptionId)} : ${g.length} envois, ${new Set(g.map(e => e.perturbationId)).size} annonce(s) différente(s)`);
  }
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { analyser };
