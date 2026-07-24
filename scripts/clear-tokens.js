// Supprime tous les tokens push enregistrés dans Firestore, pour repartir de
// zéro (chaque appareil se ré-enregistre automatiquement au prochain
// lancement de l'app, via registerForPushNotificationsAsync).
//
// Usage :
//   node clear-tokens.js

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
  const snapshot = await db.collection('pushTokens').get();

  if (snapshot.empty) {
    console.log('Aucun token à supprimer.');
    return;
  }

  await Promise.all(snapshot.docs.map(d => d.ref.delete()));
  console.log(`${snapshot.size} token(s) supprimé(s).`);
}

main().catch(e => { console.error(e); process.exit(1); });
