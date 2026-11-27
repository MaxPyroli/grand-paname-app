// Travaux observés (collection Firestore `journalTravaux`) : aucun n'a été envoyé. Lecture seule.
// Usage : node journal-travaux.js [jours]        (défaut : 3)
const path = require('path');
const FORMAT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function main() {
  const jours = Number(process.argv[2]) || 3;
  const admin = require('firebase-admin');
  const compte = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, '..', 'firebase-service-account.json'));
  admin.initializeApp({ credential: admin.credential.cert(compte) });
  const snap = await admin.firestore().collection('journalTravaux').where('at', '>=', new Date(Date.now() - jours * 86_400_000)).orderBy('at').get();
  const entrees = snap.docs.flatMap(d => { const x = d.data(); return (x.travaux || []).map(t => ({ ...t, at: x.at.toMillis() })); });
  if (entrees.length === 0) { console.log(`Aucun nouveau travaux observé sur les ${jours} derniers jours.`); return; }
  for (const t of entrees) console.log(`${FORMAT.format(t.at)}  ${t.gravite.padEnd(9)} ${t.lignes.join(', ')} : ${t.titre}`);
  const horsBus = entrees.filter(t => t.lignes.some(l => !l.startsWith('Bus')));
  console.log(`\n${entrees.length} annonce(s) de travaux nouvelles, dont ${horsBus.length} hors bus.`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
