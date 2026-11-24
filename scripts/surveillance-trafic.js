// Surveillance du trafic — lancement MANUEL (la logique est dans functions/alertes-trafic.js, la même que celle de la
// Cloud Function Firebase). Par défaut : SIMULATION (rien n'est envoyé ni écrit). Envoi réel : ENVOI_REEL=1.
//
// Variables d'environnement :
//   PRIM_API_KEY                  clé de l'API PRIM (ou EXPO_PUBLIC_NAVITIA_KEY)
//   FIREBASE_SERVICE_ACCOUNT      contenu JSON du compte de service (ou FIREBASE_SERVICE_ACCOUNT_PATH = chemin du fichier)
//   ENVOI_REEL=1                  envoie vraiment et enregistre l'état
//
// Usage local :  node surveillance-trafic.js          (simulation)
//                ENVOI_REEL=1 node surveillance-trafic.js

const path = require('path');
const logique = require('../functions/alertes-trafic.js');

async function main() {
  const cle = process.env.PRIM_API_KEY || process.env.EXPO_PUBLIC_NAVITIA_KEY;
  if (!cle) throw new Error('PRIM_API_KEY manquante.');
  const admin = require('firebase-admin');
  const compte = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, '..', 'firebase-service-account.json'));
  admin.initializeApp({ credential: admin.credential.cert(compte) });
  await logique.executerSurveillance({
    db: admin.firestore(), horodatage: admin.firestore.FieldValue.serverTimestamp(), cle, reel: process.env.ENVOI_REEL === '1',
  });
}

const { alertesActuelles, nouvellesAlertes, composerMessages, libelleLigne, dateNavitia } = logique;
module.exports = { alertesActuelles, nouvellesAlertes, composerMessages, libelleLigne, dateNavitia };

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
