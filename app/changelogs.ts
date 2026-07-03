export type ChangelogEntry = {
  version: string;
  date: string;
  codename?: string;
  content: string;
};

export const CHANGELOGS: ChangelogEntry[] = [
  {
    version: '3.0.0',
    date: '1er juillet 2026',
    codename: 'Comté',
    content: `**🚀 Nouveautés**
* Chers voyageurs, votre application **Grand Paname** est désormais (presque) **100% native** ! Profitez d'une expérience plus fluide, plus rapide et plus agréable que jamais ! Il nous reste encore quelques détails à peaufiner, mais vous pouvez déjà profiter de cette version 3.0, aussi appelée "Comté" 🧀. Cette transition marque un tournant dans l'histoire de l'application et nous ouvre beaucoup de perspectives pour l'avenir ! Merci de suivre l'aventure, restez connectés !
* Carte interactive intégrée directement dans l'app. D'autres fonctionnalités sont à venir, restez à l'écoute !`,
  },
  {
    version: '2.3.2',
    date: '4 mai 2026',
    content: `**🛠️ Corrections & Améliorations**
* Améliorations visuelles et techniques diverses.

Bon voyage !`,
  },
  {
    version: '2.3.1',
    date: '21 avril 2026',
    content: `**🛠️ Corrections & Améliorations**
* Réorganisation interne des fichiers pour une meilleure fluidité.
* Restylage de la sidebar.
* Améliorations visuelles diverses.

Bon voyage !`,
  },
  {
    version: '2.3',
    date: '17 avril 2026',
    content: `**🚀 Nouveautés**
* **🦊 Pana (Bêta) :** Dites bonjour à Pana, votre nouvel assistant intelligent intégré à l'application ! Posez-lui vos questions sur les horaires de prochains départs ou l'état du trafic, il reniflera les bonnes informations pour vous.
* **🎨 Design & Thèmes :** Interface des gares relookée et support complet des modes clair et sombre.

**🛠️ Corrections & Améliorations**
* Lecture simplifiée avec défilement (scroll) pour les messages longs.
* Barre latérale réorganisée pour plus de fluidité.
* Amélioration du message de recherche de position.
* Correction du bouton "Contact"
* Corrections diverses

Bon voyage !`,
  },
  {
    version: '2.2',
    date: '10 avril 2026',
    content: `**🛠️ Améliorations & Corrections**
* Correction et fiabilisation du système de favoris
* Nouveau menu déroulant pour l'historique des mises à jour
* Pop-ups d'info trafic repassés au premier plan pour une meilleure lisibilité
* Optimisation de l'actualisation en temps réel (suppression des sauts d'écran)
* Ajout d'une section Crédits avec liens de contact et signalement de bugs
* Nouveau design interactif (effet de survol) sur les cartes de bienvenue`,
  },
  {
    version: '2.1.1',
    date: '31 mars 2026',
    content: `**🛠️ Améliorations & Corrections visuelles**
* Le nouvel effet glassmorphism a été étendu à de nouveaux éléments, notamment le titre principal de la gare et les pop-ups d'info trafic pour une interface plus moderne
* Harmonisation générale du design avec des bords arrondis uniformes, des ombres ajustées et des superpositions de calques ajustées lors du défilement de la page pour un meilleur confort d'utilisation`,
  },
  {
    version: '2.1.0',
    date: '31 mars 2026',
    content: `**🚀 Nouveautés**
* **🎨 Nouveaux visuels :** Profitez de titres plus élégants, dynamiques et collants ("sticky") pour une navigation plus fluide dans les listes de départs.
* **📱 Canal WhatsApp :** Intégration d'un raccourci direct vers la chaîne officielle dans le panneau latéral pour ne rien rater des mises à jour.

**🛠️ Corrections & Améliorations**
* Ajustement de l'interactivité de la carte de situation pour éviter les clics accidentels et rendre la navigation générale plus agréable.
* Correction du bug d'affichage en cas de refus d'accès à la position et ajustement de la précision des résultats proches.
* Correction du filtre de détection des alertes et ajustement de l'impact visuel pour une meilleure lisibilité sans encombrer l'écran.
* Amélioration du tri pour prioriser les lignes classiques et repousser les Noctiliens en fin de liste.
* Fermeture automatique du panneau latéral après la sélection d'un favori et corrections de titres divers.
* Divers ajustements visuels et techniques`,
  },
  {
    version: '2.0.0',
    date: '26 mars 2026',
    codename: 'Beaufort',
    content: `**🚀 Nouveautés**
* **📍 Géolocalisation instantanée :** Trouvez immédiatement les gares autour de vous grâce au nouveau bouton "Me localiser" directement intégré à la barre de recherche.
* **🗺️ Cartographie indicative :** Visualisez instantanément l'emplacement exact de votre arrêt ou de votre station grâce à une petite carte indicative affichée en tête des départs.
* **🚦 Info Trafic Intelligent :** Restez au courant des infos importantes sur vos lignes en temps réel ! Retrouvez pour chaque ligne les infos importantes, triées intelligemment et aux couleurs dynamiques selon la gravité pour vous afficher uniquement ce dont vous avez besoin.

**🛠️ Corrections & Améliorations**
* L'URL de votre navigateur se met désormais à jour selon la gare consultée !
* Ajout d'un bouton "Retour à l'accueil" (🏠) dans le panneau latéral pour réinitialiser rapidement l'application.
* Diverses améliorations internes`,
  },
  {
    version: '1.1.2',
    date: '25 mars 2026',
    content: `**🛠️ Corrections & Améliorations**
* Corrections internes.`,
  },
  {
    version: '1.1.1',
    date: '25 mars 2026',
    content: `**🛠️ Corrections & Améliorations**
* Correction de l'affichage des couleurs des indices de lignes pour un meilleur affichage en mode sombre.`,
  },
  {
    version: '1.1',
    date: '15 décembre 2025',
    content: `**🛠️ Corrections & Améliorations**
* Correction de l'affichage des couleurs pour un meilleur confort visuel.
* Le câble C1 est ouvert ! Mise à jour de l'interface pour les départs du Câble C1.`,
  },
  {
    version: '1.0.2',
    date: '5 décembre 2025',
    content: `**🛠️ Corrections & Améliorations**
* La suppression des favoris peut maintenant être faite individuellement
* Correction de l'affichage des temps d'attente des bus sur mobile pour mieux afficher les destinations
* Correction de l'affichage sur mobile pour éviter les espaces blancs inutiles
* Correction de l'affichage des directions pour les gares Cergy-Préfecture et Cergy-St-Christophe`,
  },
  {
    version: '1.0.1',
    date: '04 décembre 2025',
    content: `**🛠️ Corrections & Améliorations**
* Les icônes de modes ont été mises à jour
* Correction de l'ordre d'affichage des lignes de bus et de tramway
* Le bouton de favori a été mis à jour
* Easter-egg ajouté. Hein, quoi?? 👀`,
  },
  {
    version: '1.0.0',
    date: '03 décembre 2025',
    codename: 'Abondance',
    content: `Ça y est, nous y est ! Voici la version finale de Grand Paname, la v1.0 ! Plus beau, plus pratique, tout est fait pour vous faciliter le voyage ! Avec cette version, sobrement nommée Abondance 🧀, se concrétise ce petit projet que je porte avec un objectif : apporter des fonctions qui manquent aux applis de transport classiques ! Restez à l'écoute, de nouvelles fonctionnalités arrivent... 😉 — Maxime

**🚀 Nouveautés**
* **🔄 Actualisation invisible :** Le rafraîchissement des données se fait désormais sans rechargement visuel de la page.
* **⭐ Système de Favoris :** Sauvegardez vos arrêts favoris pour les retrouver rapidement dans le panneau latéral.
* **🚌 Bus de remplacement :** Les bus de substitution sont désormais intégrés dans les départs de la ligne qu'ils remplacent avec un affichage spécifique.
* **👋 Accueil :** Nouvelle page d'accueil plus accueillante avec un nouveau logo et tout nouveau tutoriel d'utilisation.

**🛠️ Corrections & Améliorations**
* Amélioration visuelle globale des textes (police, taille, harmonie...)
* Mise à jour du panneau d'information latéral.
* Suppression de la répétition du nom de la ville si celui-ci est déjà présent dans le nom de la gare.
* Lignes de départs compactées pour éviter les retours à la ligne et améliorer la lisibilité.
* Correction d'un bug affichant "Dernier train" sur des départs classiques.
* Correction du filtrage des directions pour certains terminus du RER D`,
  },
  {
    version: '0.11.1',
    date: '1er décembre 2025',
    content: `**🛠️ Corrections & Améliorations**
* Correction du bug qui empêchait le badge "Dernier départ" de s'afficher correctement.
* Amélioration de l'affichage pour toujours montrer le prochain bus de nuit, même s'il est prévu dans plus d'une heure.
* Ajout d'un easter-egg pour l'ouverture future du câble C1
* Changement de l'icône du site`,
  },
  {
    version: '0.11',
    date: '30 novembre 2025',
    content: `**🚀 Nouveautés**
* **🧠 Nouvelle logique "Smart Geo" :** Tri intelligent des directions (Paris/Banlieue) de tous les RER et Transiliens, pour éviter qu'un départ se retrouve dans la mauvaise catégorie de direction.

**🛠️ Corrections & Améliorations**
* Affinement de la règle d'affichage du badge "Dernier départ".`,
  },
  {
    version: '0.10.4',
    date: '29 novembre 2025',
    content: `**🚀 Nouveautés**
* 🏁 Mise en évidence graphique des ultimes passages de la journée.
* 🆔 L'application utilise désormais la police officielle des transports d'Île-de-France.
* 🚧 Ajout de la mention "(Bêta)" dans le titre et d'un panneau d'avertissement "Pre-release" dans la barre latérale.

**🛠️ Corrections & Améliorations**
* Le message de chargement ("Actualisation...") est désormais intégré dans une zone fixe pour ne plus décaler le contenu de la page à chaque rafraîchissement.
* Suppression de certaines lignes de train qui s'affichaient à tort en "Service terminé" dans des gares où elles ne marquent pas l'arrêt.
* Correction d'un bug qui empêchait l'affichage du RER D`,
  },
  {
    version: '0.10.3',
    date: '29 novembre 2025',
    codename: 'Milk',
    content: `**🚀 Nouveautés & Améliorations**
* **Tri Alphabétique 🔤 :** Les destinations des Métros, Trams et Câbles sont désormais triées par ordre alphabétique pour un affichage plus stable (les Bus restent triés par temps d'attente).
* **Feedback visuel ⏳ :** Ajout d'un message de chargement ("Chargement des prochains passages...") pour confirmer la prise en compte de la recherche.
* **Interface :** Le numéro de version s'affiche désormais avec une mention "⚠️ Pre-release" et est plus discret dans le panneau latéral.

**🛠️ Corrections**
* La recherche : le message d'erreur "Aucun résultat trouvé" reste désormais affiché correctement si la gare n'existe pas.
* État Vide : Ajout d'un panneau clair lorsqu'aucun départ n'est prévu pour l'arrêt sélectionné.`,
  },
  {
    version: '0.10.2',
    date: '28 novembre 2025',
    content: `**🚀 Nouveauté**
* Ajout d'un message lorsqu'aucun départ n'est affiché pour un arrêt.`,
  },
  {
    version: '0.10.1',
    date: '28 novembre 2025',
    content: `**🛠️ Corrections**
* Correction du clavier mobile qui restait affiché après avoir validé une recherche.
* Correction de l'affichage en mode clair (les titres et textes sont désormais bien lisibles sur fond blanc).`,
  },
  {
    version: '0.10',
    date: '28 novembre 2025',
    content: `**🚀 Nouveautés**
* Les RER et Trains s'affichent désormais dans des cartes colorées, harmonisées avec les Bus.
* Barre de recherche améliorée avec menu déroulant et fermeture automatique du clavier sur téléphone.
* Nouveau style visuel, plus clair, pour signaler les lignes dont le service est terminé.

**🛠️ Corrections & Améliorations**
* Les TER sont enfin reconnus et rangés dans la catégorie TRAIN.
* Les destinations sont maintenant triées par ordre d'arrivée (le prochain départ en premier).
* Masquage automatique des directions vers le terminus où vous vous trouvez déjà.
* Les lignes RER/Métro/Tram s'affichent désormais même sans données temps réel immédiates.
* Meilleure gestion de l'affichage des lignes Transilien (H, K, J...) et correction de bugs mineurs.`,
  },
  {
    version: '0.9.1',
    date: '27 novembre 2025',
    content: `**🎨 Améliorations Visuelles**
* **Footer Épuré 🧹 :** Suppression de la catégorie "Autres" dans le pied de page pour éliminer les doublons et les affichages parasites. Seuls les modes officiels (Bus, RER, etc.) sont conservés.
* **Gestion des Terminus Bus 🚌 :** Les lignes de bus dont le service est terminé ne s'affichent plus dans le tableau principal avec la mention "Service terminé". Elles basculent automatiquement et discrètement dans la liste des lignes disponibles en bas de page.

**⚙️ Technique**
* Correction de l'ordre d'affichage des versions dans l'historique.`,
  },
  {
    version: '0.9',
    date: '26 novembre 2025',
    content: `**🚀 Nouveautés**
* **Footer Intelligent 🧠 :** La section "Autres modes disponibles" en bas de page a été repensée. Elle liste désormais précisément les lignes (avec leur numéro et leur couleur) qui desservent l'arrêt mais n'ont pas de départs prévus dans l'immédiat.
* **Organisation :** Les lignes sans départ sont proprement triées par mode de transport et par numéro pour une lecture plus facile.

**🛠️ Corrections & Améliorations**
* Affichage RER simplifié et regroupé lorsque le service est terminé.
* Déplacement du Changelog : désormais dans le volet latéral !`,
  },
  {
    version: '0.8.6',
    date: '26 novembre 2025',
    content: `**🚀 Nouveautés**
* Mode 🚠 CÂBLE intégré (dont le Funiculaire de Montmartre).
* Ajout de ce menu "Historique des versions".

**🛠️ Améliorations**
* Recherche accélérée (affichage immédiat à la sélection).
* Les modes sans départs proches sont regroupés discrètement en bas.

**🐛 Corrections**
* Retour des noms de villes dans les terminus de BUS.`,
  },
];
