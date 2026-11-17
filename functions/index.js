// Cloud Function Firebase : surveillance du trafic, toutes les 2 minutes (remplace la tâche planifiée GitHub, qui
// prenait 3 à 4 heures entre deux passages). La logique est dans `alertes-trafic.js`.
//
// Sécurité : par défaut SIMULATION (rien n'est envoyé ni écrit). L'envoi réel s'active en donnant la valeur 1 au
// paramètre ENVOI_REEL (voir docs/alertes-trafic-firebase.md).
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { executerSurveillance } = require('./alertes-trafic.js');

admin.initializeApp();

const PRIM_API_KEY = defineSecret('PRIM_API_KEY');
const ENVOI_REEL = defineString('ENVOI_REEL', { default: '0' });

exports.surveillanceTrafic = onSchedule(
  {
    schedule: 'every 2 minutes',
    timeZone: 'Europe/Paris',
    region: 'europe-west1',
    secrets: [PRIM_API_KEY],
    timeoutSeconds: 120,
    memory: '256MiB',
    maxInstances: 1,   // jamais deux passages en même temps (l'état est lu puis réécrit)
    retryCount: 0,     // un passage raté sera remplacé par le suivant, 2 minutes plus tard
  },
  async () => {
    await executerSurveillance({
      db: admin.firestore(),
      horodatage: admin.firestore.FieldValue.serverTimestamp(),
      cle: PRIM_API_KEY.value(),
      reel: ENVOI_REEL.value() === '1',
    });
  },
);
