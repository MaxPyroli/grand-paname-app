// Envoie une notification push à tous les appareils enregistrés dans Firestore.
//
// Usage :
//   node send-notification.js "Titre" "Corps du message"
//
// Prérequis :
//   - firebase-service-account.json à la racine du repo (clé privée du compte
//     de service Firebase — Paramètres du projet > Comptes de service >
//     Générer une nouvelle clé privée). Ne JAMAIS commiter ce fichier.
//   - npm install (dans ce dossier scripts/) pour installer firebase-admin.

const path = require('path');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  || path.join(__dirname, '..', 'firebase-service-account.json');

const [, , title, body] = process.argv;

if (!title || !body) {
  console.error('Usage: node send-notification.js "Titre" "Corps du message"');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = require(SERVICE_ACCOUNT_PATH);
} catch (e) {
  console.error(`Impossible de charger le compte de service Firebase (${SERVICE_ACCOUNT_PATH}).`);
  console.error("Récupère-le dans la console Firebase : Paramètres du projet > Comptes de service > Générer une nouvelle clé privée.");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function attendre(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const snapshot = await db.collection('pushTokens').get();
  const tokens = snapshot.docs.map(d => d.data().token).filter(Boolean);

  if (tokens.length === 0) {
    console.log('Aucun token enregistré dans Firestore.');
    return;
  }

  console.log(`Envoi à ${tokens.length} appareil(s)...`);

  const invalidTokens = [];
  const ticketIdParToken = new Map();

  for (const batch of chunk(tokens, 100)) {
    const messages = batch.map(token => ({
      to: token,
      title,
      body,
      sound: 'default',
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const json = await res.json();
    const tickets = json.data || [];
    tickets.forEach((ticket, i) => {
      if (ticket.status === 'error') {
        console.warn(`  Erreur pour ${batch[i]}: ${ticket.message} (${ticket.details?.error})`);
        if (ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(batch[i]);
      } else if (ticket.id) {
        ticketIdParToken.set(ticket.id, batch[i]);
      }
    });
  }

  // Un ticket "ok" veut juste dire qu'Expo a transmis le message à FCM, pas
  // qu'il a été livré au téléphone. Le vrai statut de livraison n'est connu
  // qu'en interrogeant les reçus, disponibles quelques secondes après l'envoi.
  if (ticketIdParToken.size > 0) {
    console.log('Vérification des reçus de livraison...');
    await attendre(15000);

    for (const idsBatch of chunk([...ticketIdParToken.keys()], 300)) {
      const res = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: idsBatch }),
      });
      const json = await res.json();
      const receipts = json.data || {};

      for (const id of idsBatch) {
        const token = ticketIdParToken.get(id);
        const receipt = receipts[id];
        if (!receipt) {
          console.warn(`  Reçu introuvable pour ${token}`);
        } else if (receipt.status === 'error') {
          console.warn(`  Échec de livraison pour ${token}: ${receipt.message} (${receipt.details?.error})`);
          if (receipt.details?.error === 'DeviceNotRegistered') invalidTokens.push(token);
        } else {
          console.log(`  Livré à ${token}`);
        }
      }
    }
  }

  if (invalidTokens.length > 0) {
    console.log(`Nettoyage de ${invalidTokens.length} token(s) invalide(s)...`);
    await Promise.all(invalidTokens.map(t => db.collection('pushTokens').doc(t).delete()));
  }

  console.log('Terminé.');
}

main().catch(e => { console.error(e); process.exit(1); });
