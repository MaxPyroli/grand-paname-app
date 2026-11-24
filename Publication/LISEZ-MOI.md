# Publication de Grand Paname

Tout ce qui sert à publier l'app sur la Play Console, au même endroit. Ce sont des COPIES : les originaux restent dans `app/` (l'app lit ses images dans `app/assets/`, ne rien y changer d'ici).

## Contenu
| Dossier / fichier | À quoi ça sert |
|---|---|
| `icones/icone-play-store-512.png` | L'icône de la fiche Play Store (512 × 512, c'est la bonne taille) |
| `icones/icone-adaptative-premier-plan-2000.png`, `icone-monochrome-2000.png` | Icône Android adaptative et icône thématique (dans l'app, via `app/assets/`) |
| `icones/icone-notification-96.png` | Petite icône des notifications (silhouette blanche sur fond transparent, norme Android) ; branchée dans `app.config.js` |
| `icones/ecran-demarrage-2000.png`, `favicon-48.png` | Écran de démarrage et favicon |
| `captures-ecran/` | Captures d'écran de la fiche Play Store (vide pour l'instant : à prendre sur le téléphone, 2 à 8 images, format téléphone) |
| `textes/notes-de-version-3.4.0.txt` | Notes de version à coller dans la Play Console (500 caractères max) |
| `textes/politique-de-confidentialite.html` | La page de confidentialité (copie de `docs/confidentialite.html`) |

## L'AAB à envoyer
Pas copié ici (68 Mo par version) : il est dans `archive\Grand-Paname-<version>.aab` (ex. `archive\Grand-Paname-3.4.0.aab`, code de version 304001).

## Avant chaque envoi
1. Le code de version (`versionCode` dans `app/app.config.js`) est plus grand que celui du dernier AAB construit.
2. La signature est la bonne clé de production (voir le journal de développement).
3. Le changelog (`app/changelogs.ts`) et le « Quoi de neuf » (`app/whatsnew.ts`) sont à jour.
4. Les notes de version de `textes/` correspondent à la version.

## Pas ici, volontairement
Mots de passe du keystore, clés, compte de service : jamais dans ce dossier.
