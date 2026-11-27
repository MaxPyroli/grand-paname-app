# Continuité du projet

- En cas de reprise dans une nouvelle conversation, lire d'abord `docs/reprise-nouvelle-session.md` (état de la 3.4.0, décisions de l'utilisateur, points à vérifier sur téléphone, reste à faire).
- Lire `docs/journal-developpement.md` au début d'une tâche pour reprendre le contexte.
- L'utilisateur demande de noter systématiquement le travail effectué : changements et fichiers concernés, raisons, décisions, pistes abandonnées, vérifications et résultats, limites et suites à donner. Mettre à jour le journal avant de terminer une tâche significative, même sans commit.
- Distinguer les changements de l'agent des modifications préexistantes de l'utilisateur. Ne jamais présenter une lecture de code comme un test sur appareil, ni un travail local comme publié.
- Garder les réponses en conversation courtes ; consigner les détails dans le journal.
- Ne pas inscrire de secrets, clés, jetons, identifiants de cartes ou données personnelles dans les notes.
- La mémoire historique de Claude est consultable localement dans `C:/Users/maxim/.claude/projects/c--Users-maxim-Documents-grand-paname-app/memory/MEMORY.md`. Lire les fiches pertinentes avant un travail de build/publication ou sur un sujet déjà documenté. Confronter les informations anciennes au code actuel ; ne pas remplacer cette mémoire.
- Lire `docs/guide-graphique.md` avant de toucher à l'interface, et le compléter à chaque décision de design.
- Respecter également les consignes de `app/AGENTS.md` pour le code de l'application.


## Charte Paname Dev
- La charte commune est dans `MaxPyroli/showroom`, fichier `CHARTE.md` (lien brut : https://raw.githubusercontent.com/MaxPyroli/showroom/main/CHARTE.md ; copie locale : `C:/Users/maxim/Documents/CHARTE.md`). La lire au début d'une tâche qui touche à l'interface, aux textes, aux pages légales, au README ou au store.
- Identité à utiliser telle quelle : éditeur « Paname Dev », contact `contact@panamedev.fr`, copyright `© 2026 Paname Dev`, mention « Conçu et codé avec Claude ».
- Si l'app s'écarte de la charte, le signaler à l'utilisateur au lieu de corriger en silence ; noter toute nouvelle décision de design dans la section 8 de la charte.
- Précision de l'utilisateur (27/11) : Grand Paname a sa propre direction artistique ; les choix propres à l'app (ex. couleurs des paramètres par famille) se notent dans `docs/guide-graphique.md`, pas dans la charte.
