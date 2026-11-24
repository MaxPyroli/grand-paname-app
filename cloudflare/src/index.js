// Surveillance du trafic sur Cloudflare Workers : un passage toutes les 2 minutes (au lieu de 7 heures en moyenne sur GitHub).
// La logique (détection, comparaison avec l'état, messages, envoi Expo, bilans) est la MÊME que celle de la Cloud Function
// et du lanceur manuel : `functions/alertes-trafic.js`.
//
// Réglages (voir docs/alertes-trafic-cloudflare.md) :
//   secrets   PRIM_API_KEY, FIREBASE_SERVICE_ACCOUNT (le JSON du compte de service, en une seule valeur)
//   variable  ENVOI_REEL = "1" pour envoyer pour de bon ; sinon SIMULATION (rien n'est envoyé ni écrit)
//   variable  NOTIFIER_DEV = "1" pour envoyer AUSSI aux installations de développement (par défaut : non)
import { creerFirestore, SERVEUR_HORODATAGE } from './firestore.js';
import logique from '../../functions/alertes-trafic.js';

async function passage(env) {
  const compte = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  await logique.executerSurveillance({
    db: creerFirestore(compte), horodatage: SERVEUR_HORODATAGE, cle: env.PRIM_API_KEY, reel: env.ENVOI_REEL === '1', notifierDev: env.NOTIFIER_DEV === '1',
  });
}

export default {
  // Déclenché par la planification (wrangler.toml) ; `waitUntil` laisse le passage finir.
  async scheduled(_evenement, env, ctx) { ctx.waitUntil(passage(env)); },
  // Adresse de contrôle : n'affiche rien de sensible, ne lance rien.
  async fetch() { return new Response('Surveillance du trafic Grand Paname : active.', { status: 200 }); },
};
