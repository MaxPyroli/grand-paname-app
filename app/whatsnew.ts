export type WhatsNewFeature = {
  emoji: string;
  title: string;
  description: string;
};

export type WhatsNewEntry = {
  version: string;
  features: WhatsNewFeature[];
  footer?: string;
};

export const WHATSNEW: WhatsNewEntry[] = [
  {
    version: '3.4.0',
    features: [
      {
        emoji: '🚦',
        title: 'Info trafic',
        description:
          "L'état de toutes les lignes de Train / RER, métro, tramway, câble et bus en un coup d'œil, avec les symboles officiels. Chaque ligne détaille ce qui se passe « En cours » et « Plus tard », et la recherche trouve n'importe quelle ligne de bus.",
      },
      {
        emoji: '🔔',
        title: 'Alertes trafic',
        description:
          "Touche la cloche d'une ligne (bus compris) pour la suivre : tu reçois une notification dès qu'une nouvelle perturbation ou une interruption la touche.",
      },
      {
        emoji: '📱',
        title: 'Mode paysage repensé',
        description:
          "Mêmes menus qu'en portrait, mais organisés pour l'écran large : barres côte à côte et volet des horaires sur le côté.",
      },
    ],
    footer: "Et aussi des corrections sur la carte, les animations et les flous — détails dans le changelog complet.",
  },
  {
    version: '3.3.3',
    features: [
      {
        emoji: '⚡',
        title: 'Plus rapide, plus fluide',
        description:
          "Les performances et la fluidité de l'application ont été grandement améliorées, surtout sur la carte. Profitez d'une expérience plus agréable et plus rapide !",
      },
    ],
    footer: "Et aussi une interface repensée (Accueil, Favoris, Horaires, Paramètres), plein de corrections — détails dans le changelog complet.",
  },
  {
    version: '3.3.0',
    features: [
      {
        emoji: '🎨',
        title: 'De vraies icônes partout',
        description:
          "Adieu les émojis approximatifs ! Toute l'interface passe à de vraies icônes originales, pour un rendu plus net et cohérent sur tous les écrans (barre de navigation, favoris, réglages, position, recherche...).",
      },
    ],
    footer: "Aussi un nouvel onglet Info Trafic (contenu à venir) et plein de petites corrections — détails dans le changelog complet.",
  },
  {
    version: '3.2.0',
    features: [
      {
        emoji: '🗺️',
        title: 'Affichage des arrêts en un coup d\'œil',
        description:
          "La carte affiche maintenant toutes les lignes d'un arrêt, le point d'arrêt précis pour les bus, et les différents accès (sorties) d'une station.",
      },
      {
        emoji: '👋',
        title: 'Tutoriel de bienvenue',
        description:
          "Un petit tour guidé s'affiche au premier lancement pour découvrir l'app : recherche, carte, favoris...",
      },
    ],
    footer: "Plein d'autres corrections aussi (favoris, recherche, affichage des destinations...) — détails dans le changelog complet.",
  },
  {
    version: '3.1.2',
    features: [
      {
        emoji: '✨',
        title: 'Plein de corrections et améliorations',
        description:
          "La carte suit désormais votre position en direct, des nouveaux paramètres avancés ont été ajoutés, les gares RER/Train s'affichent mieux et plein d'autres améliorations ont été apportées pour rendre l'app plus agréable à utiliser ! Plus de détails dans le changelog complet.",
      },
    ],
    footer: "👀 Alors oui, on a sauté la 3.1.1 pour des raisons techniques, mais on en a profité pour corriger plein de bugs et améliorer l'app. On espère que ça vous plaira ! 😀",
  },
  {
    version: '3.1.0',
    features: [
      {
        emoji: '🕐',
        title: 'Horaires Natifs',
        description:
          "Le moteur d'horaires tourne désormais directement sur votre appareil — plus rapide, plus fluide, et juste mieux en fait du coup.",
      },
      {
        emoji: '🗺️',
        title: 'Arrêts sur la carte',
        description:
          'Zoomez sur la carte pour voir les arrêts à proximité et accédez à leurs horaires en un tap. Plus facile que de demander son chemin à un Parisien quand même.',
      },
    ],
    footer: 'On a aussi tué quelques bugs dans la nuit. Ils ne souffrent plus. 🐛',
  },
];
