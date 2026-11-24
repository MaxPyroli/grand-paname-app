# Alertes trafic sur Cloudflare Workers (gratuit, passage toutes les 2 minutes)

Pourquoi : la tâche GitHub ne passe qu'en moyenne toutes les 7 heures (jusqu'à 9 h). Cloudflare exécute une tâche planifiée à la minute près, sans carte bancaire.

## Ce qui est prêt (écrit, testé en local avec un faux réseau, JAMAIS déployé)
- `cloudflare/src/index.js` : le Worker (planifié toutes les 2 minutes, `wrangler.toml`). Même logique que la Cloud Function Firebase et le lanceur manuel : `functions/alertes-trafic.js`.
- `cloudflare/src/firestore.js` : petit client Firestore (REST + compte de service, signature RS256 avec WebCrypto) car `firebase-admin` ne tourne pas sur Cloudflare.
- `cloudflare/wrangler.toml` : SIMULATION par défaut (`ENVOI_REEL = "0"` : rien n'est envoyé ni écrit).
- Tests : `app/tests/cloudflare-firestore.test.mjs` (`npm test` depuis `app`).

## Ce que l'utilisateur doit faire (aucun compte n'est créé par l'agent)
1. Créer un compte Cloudflare **gratuit** sur dash.cloudflare.com (pas de carte demandée pour Workers).
2. Dans un terminal, depuis la racine du projet :
   - `cd cloudflare`
   - `npm.cmd install`
   - `npx.cmd wrangler login` (ouvre le navigateur pour valider)
3. Créer les deux secrets (jamais dans un fichier ni dans une conversation) :
   - `npx.cmd wrangler secret put PRIM_API_KEY` (coller la valeur de `EXPO_PUBLIC_NAVITIA_KEY` de `app/.env`)
   - `type ..\firebase-service-account.json | npx.cmd wrangler secret put FIREBASE_SERVICE_ACCOUNT` (cmd.exe ; le fichier entier, en une seule valeur)
4. Déployer en SIMULATION : `npx.cmd wrangler deploy`
5. Regarder les journaux : `npx.cmd wrangler tail` : on doit voir « MODE SIMULATION » toutes les 2 minutes, sans erreur.
6. Passer en RÉEL : `npx.cmd wrangler deploy --var ENVOI_REEL:1`
7. Arrêter la surveillance GitHub (sinon deux surveillances en parallèle, donc des notifications en double) : `gh variable delete ALERTES_REELLES` (ou demander à l'agent).

## Point à vérifier au déploiement (limite NON confirmée)
Le forfait gratuit limite le temps de calcul d'un passage (de l'ordre de 10 ms pour les requêtes web ; la limite exacte des tâches planifiées n'a pas pu être vérifiée hors ligne). Lire 1,6 Mo de perturbations peut dépasser 10 ms. Si `wrangler tail` montre « Exceeded CPU limit » :
- le Worker s'arrête avant d'envoyer (aucune notification) ; rien n'est cassé côté données ;
- solutions : forfait Workers payant (5 $/mois), Firebase Blaze, ou revenir sur GitHub.
Ne pas supprimer la surveillance GitHub avant d'avoir vu au moins quelques passages réussis (étape 5) puis une vraie notification (étape 6).
