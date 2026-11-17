// Statistiques des alertes trafic : lit les bilans que laisse chaque passage RÉEL de la surveillance (collection Firestore
// `statsAlertes`) et les affiche. Lecture seule, aucun jeton affiché.
//
// Usage :  node stats-alertes.js           (7 derniers jours)
//          node stats-alertes.js 3         (3 derniers jours)
// Compte de service : FIREBASE_SERVICE_ACCOUNT_PATH, sinon ../firebase-service-account.json

const path = require('path');

const FORMAT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const duree = ms => ms == null ? '—' : ms >= 3600_000 ? `${Math.floor(ms / 3600_000)} h ${String(Math.round(ms % 3600_000 / 60_000)).padStart(2, '0')}` : `${Math.round(ms / 60_000)} min`;

// `passages` : bilans triés du plus ancien au plus récent (at en millisecondes). Renvoie un résumé.
function resumer(passages) {
  const ecarts = passages.slice(1).map((p, i) => p.at - passages[i].at);
  return {
    passages: passages.length,
    erreurs: passages.filter(p => p.erreur).length,
    notifications: passages.reduce((n, p) => n + (p.envoyees || 0), 0),
    nouvelles: passages.reduce((n, p) => n + (p.nouvelles || 0), 0),
    ecartMoyen: ecarts.length ? ecarts.reduce((a, b) => a + b, 0) / ecarts.length : null,
    ecartMax: ecarts.length ? Math.max(...ecarts) : null,
  };
}

async function main() {
  const jours = Number(process.argv[2]) || 7;
  const admin = require('firebase-admin');
  const compte = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, '..', 'firebase-service-account.json'));
  admin.initializeApp({ credential: admin.credential.cert(compte) });
  const depuis = new Date(Date.now() - jours * 86_400_000);
  const snap = await admin.firestore().collection('statsAlertes').where('at', '>=', depuis).orderBy('at').get();
  const passages = snap.docs.map(d => { const x = d.data(); return { ...x, at: x.at.toMillis() }; });
  if (passages.length === 0) { console.log(`Aucun passage réel enregistré sur les ${jours} derniers jours.`); return; }

  console.log(`Passages réels des ${jours} derniers jours (heure de Paris)\n`);
  console.log('Heure         Depuis le précédent   Perturb.  Nouv.  Abonnés  Envoyées  Remarque');
  passages.forEach((p, i) => {
    const note = p.erreur ? `ERREUR : ${p.erreur}` : p.premierPassage ? 'premier passage' : p.jetonsPerimes ? `${p.jetonsPerimes} jeton(s) périmé(s)` : '';
    console.log(`${FORMAT.format(p.at).padEnd(13)} ${(i ? duree(p.at - passages[i - 1].at) : '—').padEnd(21)} ${String(p.perturbations).padStart(8)}  ${String(p.nouvelles).padStart(5)}  ${String(p.abonnes).padStart(7)}  ${String(p.envoyees).padStart(8)}  ${note}`);
  });
  const r = resumer(passages);
  console.log(`\n${r.passages} passage(s), ${r.erreurs} erreur(s), ${r.nouvelles} perturbation(s) nouvelle(s) détectée(s), ${r.notifications} notification(s) envoyée(s).`);
  console.log(`Écart entre deux passages : moyen ${duree(r.ecartMoyen)}, le plus long ${duree(r.ecartMax)}.`);
}

module.exports = { resumer, duree };

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
}
