# Alertes trafic sur Firebase (remplace la tâche planifiée GitHub)

Pourquoi : la tâche GitHub `Surveillance du trafic` ne passe en pratique que toutes les 3 à 4 heures. Une Cloud Function planifiée passe toutes les 2 minutes.

## Ce qui est prêt (écrit, testé en local avec une fausse base, JAMAIS déployé)
- `functions/alertes-trafic.js` : toute la logique (détection, comparaison avec l'état gardé dans `systeme/alertesTrafic`, messages, envoi Expo). Même logique que l'ancien programme, qui n'en est plus qu'un lanceur manuel (`scripts/surveillance-trafic.js`).
- `functions/index.js` : fonction `surveillanceTrafic`, toutes les 2 minutes, région `europe-west1`, une seule instance à la fois. Simulation par défaut.
- `firebase.json`, `.firebaserc` (projet `grand-paname-app`), `functions/package.json` (Node 22).
- Tests : `app/tests/surveillance*.test.mjs` (`npm test` depuis `app`).

## Ce que l'utilisateur doit faire (je ne déploie rien sans son accord)
1. Console Firebase → passer le projet au forfait **Blaze** si ce n'est pas déjà le cas (carte demandée ; coût attendu quasi nul) et régler une alerte de budget.
2. Installer l'outil : `npm install -g firebase-tools`, puis `firebase login`.
3. Dans `functions` : `npm install`.
4. Créer le secret de la clé PRIM : `firebase functions:secrets:set PRIM_API_KEY` (l'outil demande la valeur ; ne jamais la coller dans un fichier ni dans une conversation).
5. Déployer : `firebase deploy --only functions`.
6. Regarder les journaux (`firebase functions:log`) : les passages en simulation doivent dire « MODE SIMULATION ».
7. Passer en réel : définir le paramètre `ENVOI_REEL` = `1` (au déploiement l'outil le demande, ou fichier `functions/.env` avec `ENVOI_REEL=1`, non versionné), redéployer. Le premier passage réel enregistre l'état sans rien envoyer.
8. Une fois le réel validé : supprimer `.github/workflows/surveillance-trafic.yml` (sinon deux surveillances en parallèle).

## Attention
- Ne pas activer le réel des DEUX côtés (GitHub et Firebase) : doubles notifications.
- Les règles Firestore refusent la lecture des jetons au public ; la fonction passe par le compte de service du projet (pas de règle à changer).
