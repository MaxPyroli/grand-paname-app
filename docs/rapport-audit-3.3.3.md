# Rapport d'audit — Grand Paname 3.3.3 (2026-10-01)

Audit du code et du projet avant la mise en package. Ce qui est **vérifié** (outil ou mesure) est séparé de ce qui est **déduit** ou **non testé**. Rien n'est commité ni publié.

## 1. Résumé

- Le projet est **sain** : la vérification de types stricte passe (options `strict`, `noUnusedLocals`, `noUnusedParameters`), le paquet JavaScript se génère sans erreur (Hermes, 5,7 Mo), `expo-doctor` : 19 contrôles sur 21 réussis.
- Les versions sont synchronisées (3.3.3 dans `app.config.js`, `package.json`, `package-lock.json`, `changelogs.ts` ; code de version 303030).
- Aucun secret n'est dans le dépôt Git (clés de signature, `google-services.json`, `.env` sont ignorés).
- **Risques principaux avant publication** : le flou sur la carte (plantage connu au-delà de 3 flous natifs, désormais contenu mais jamais testé sur un autre téléphone), les nouveaux gestes du volet des horaires (testés par gestes simulés seulement) et l'absence de tests automatiques.
- **Un nouveau build natif est obligatoire** (nouveau module de masque, suppression de modules inutiles, canal de notification par défaut) : pas de mise à jour à distance possible pour cette version.

## 2. Ce qui a été nettoyé pendant l'audit

| Action | Détail |
|---|---|
| Styles morts supprimés | `titreTiroir`, `sousTitreTiroir`, `tabIcon` (`App.tsx`) |
| Dépendances inutilisées retirées | `@react-navigation/bottom-tabs`, `@react-navigation/native`, `react-native-screens`, `buffer` (aucun import nulle part ; allège le build natif) |
| Protection des clés de signature | `.easignore` : `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.keystore` (avant, un build cloud EAS les aurait envoyées) |
| Fausse piste évitée | `assets/grandParisBoldBase64.ts` semblait inutilisé (mon détecteur cherchait le nom avec extension) ; il est utilisé par `MapWebView.tsx` (police dans la carte). **Conservé.** |

Vérifié après : types OK, paquet JavaScript généré.

## 3. Constats et recommandations

### À faire avant la publication (recommandé)
1. **Tester sur un second téléphone** (idéalement plus modeste, Android 12 ou moins) : flous, gestes, fluidité. Tout a été validé sur un seul appareil (Samsung SM-S938B).
2. **Déplacer les anciennes clés de signature hors du dossier du projet** : `app/@maxpyroli__grand-paname_OLD_1/2/3.jks` et la clé courante sont dans `app/` (ignorées par Git, mais présentes). Les ranger dans un dossier sauvegardé hors du dépôt.
3. **Après la sortie de la 3.3.3** : vider les jetons de notification (`node scripts/clear-tokens.js`, 31 appareils ; confirmation demandée avant).
4. **Tally** : rendre la question « version » du formulaire optionnelle (elle est préremplie par l'app), la supprimer quand la 3.3.3 sera répandue.

### À planifier (non bloquant)
5. **Découper `App.tsx`** (3 700 lignes : écrans, modales, carte, gestes, réglages dans un seul fichier). Découpage proposé : `SettingsModal`, `AccueilScreen`, modales (Nouveautés / Bienvenue / Mise à jour / Bug), `FavorisScreen`, gestes du volet. Chantier à faire après la publication, avec tests, pas avant.
6. **Mises à jour de correctifs Expo** : 17 paquets ont une version de correctif plus récente (ex. `expo` 57.0.15 → 57.0.26, `react-native` 0.86.2 → 0.86.3). À faire dans un second temps, avec un nouveau cycle de test, pas la veille d'une publication.
7. **Firebase (SDK web complet)** : sert seulement à enregistrer le jeton de notification dans Firestore, mais alourdit le paquet et le démarrage. Remplaçable par un appel REST simple (gain estimé non mesuré).
8. **Doublon `react-native-device-info`** (3 copies via `sp-react-native-in-app-updates`) : signalé par `expo-doctor`, sans effet observé (la version de l'app est celle de premier niveau).
9. **Tests automatiques** : il n'y en a aucun. Au minimum : calcul des modes (`modesDepuisCommercialMode`), tri des lignes, regroupement des doublons de jetons (`doublons.js`), arrondis de la carte.
10. **Règles de sécurité Firestore** : non vérifiées (elles ne sont pas dans le dépôt). À contrôler dans la console : l'app écrit dans `pushTokens` ; personne d'autre que l'outil d'envoi ne doit pouvoir lire ou lister la collection.
11. **Clés dans le paquet** : `EXPO_PUBLIC_NAVITIA_KEY` et `EXPO_PUBLIC_CARTO_API_KEY` sont embarquées dans l'app (c'est inévitable pour une app qui appelle ces services directement). Vérifier côté fournisseurs qu'elles sont limitées (quotas, restrictions d'usage).

### Flou et affichage (nouveau dans la 3.3.3)
- Règle : jamais plus de 3 flous natifs visibles sur la carte (plantage au-delà, mesuré). Appliquée : tiroir ouvert (un seul), barre de recherche en flou carte, flous natifs suspendus pendant les fenêtres Nouveautés / Bienvenue / Mise à jour, flou natif de la barre de navigation seulement devant le volet.
- Le flou fait dans la carte dépend de la version de WebView du téléphone (support de `backdrop-filter` depuis la v76) ; sans support, il ne s'affiche pas mais la teinte reste lisible.
- **Piste de sécurité à envisager** : désactiver le flou automatiquement sur les petits téléphones (peu de mémoire), l'interrupteur existe déjà dans le mode développeur.

### Performances (mesurées avec `scripts/bench-fluidite.sh` et `dumpsys gfxinfo`)
- Ouverture d'un arrêt : de ≈ 21 % à ≈ 10-12 % d'images saccadées (liste des horaires paresseuse, requêtes en parallèle ; la caméra part à ≈ 1 s au lieu de ≈ 3,2 s).
- Déplacements de carte : ≈ 3-7 % d'images saccadées après la correction des flous (53 % avec 3 flous natifs permanents).
- Reste : ≈ 1 s cumulée de blocages du fil JavaScript à l'ouverture d'un gros arrêt (traitement des réponses réseau), le goulot est `linesForArea` (≈ 1 s).

### Dettes de code repérées (non traitées)
- Exports inutilisés : `PANEL_CONTENT_TOP_PAD` (constante) et quelques types exportés sans usage externe.
- `assets/icons/*/icon-discussion.svg` : non importés (n'alourdissent pas l'app, seuls les fichiers importés sont inclus).
- `app/icons/` (jeu d'icônes source, dossier de conception) et `app/dist/` (ancien export, ignoré par Git, 7 Mo) : à ranger ou supprimer à la main.
- Commentaires historiques très longs dans `App.tsx` (récits de pistes abandonnées) : utiles, mais à déplacer vers `docs/` lors du découpage.

## 4. Préparation du package (checklist)

Procédure détaillée : fiche mémoire « Build Android local sur Windows ». Résumé :

1. Vérifier l'état : `git status`, types OK, version 3.3.3 / code 303030 partout.
2. **Commits** (aucun n'est fait) — découpage proposé :
   - nettoyage antérieur du 25-27 septembre (`Icon.tsx`, `responsive.ts`, `lignesData.ts`, `.gitignore`…) ;
   - outil de notifications (`scripts/`, `notifications.ts`, `doublons.js`) ;
   - interface 3.3.3 (volets, barre de navigation, flous, `Fade.tsx`, `verreWeb.ts`, gabarit des volets) ;
   - fonctionnalités (câble C1, sorties, formulaire de bug, cache de la carte, pictos de modes) ;
   - version / changelog / documentation (`docs/`, `AGENTS.md`).
3. Récupérer la clé de signature (`eas credentials`, profil production), la placer **hors du dépôt**.
4. `APP_VARIANT=production npx expo prebuild --platform android --clean`, puis vérifier `applicationId fun.grandpaname.app` (sans `.dev`).
5. `gradlew bundleRelease` avec la clé (chemin absolu), vérifier le nom de paquet et l'empreinte de signature.
6. Copier l'AAB dans `archive\3.3.3\app-release.aab`.
7. Téléverser dans la Play Console (piste interne), vérifier que le code de version 303030 est accepté.
8. Supprimer `app/android/` (sinon `eas credentials` se trompe d'identifiant).
9. Après la sortie : `node scripts/clear-tokens.js` (avec confirmation), puis nettoyer la question « version » de Tally.

Précaution : le build de production n'a **jamais été lancé** avec les nouveautés de cette version (masque, flous, gestes). Un premier essai complet du build de production sur le téléphone, avant le téléversement, est recommandé.

## 5. Ce qui n'a pas été vérifié

- Comportement sur un autre téléphone, en paysage, sur tablette.
- Gestes au vrai doigt (lancers rapides, diagonales) sur le volet des horaires et les tiroirs.
- Build de production signé.
- Règles Firestore, quotas des clés API.
