// Liste les tokens push enregistrés dans Firestore, avec leurs métadonnées,
// pour aider à identifier quel token correspond à quel appareil.
//
// Usage :
//   node list-tokens.js

const path = require('path');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  || path.join(__dirname, '..', 'firebase-service-account.json');

let serviceAccount;
try {
  serviceAccount = require(SERVICE_ACCOUNT_PATH);
} catch (e) {
  console.error(`Impossible de charger le compte de service Firebase (${SERVICE_ACCOUNT_PATH}).`);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const snapshot = await db.collection('pushTokens').orderBy('updatedAt', 'desc').get();

  if (snapshot.empty) {
    console.log('Aucun token enregistré dans Firestore.');
    return;
  }

  snapshot.docs.forEach(d => {
    const data = d.data();
    const updated = data.updatedAt?.toDate?.() ?? null;
    console.log(`${data.token}`);
    console.log(`  plateforme : ${data.platform}`);
    console.log(`  version app: ${data.appVersion}`);
    console.log(`  mis à jour : ${updated ? updated.toLocaleString('fr-FR') : '?'}`);
    console.log('');
  });
}

main().catch(e => { console.error(e); process.exit(1); });
