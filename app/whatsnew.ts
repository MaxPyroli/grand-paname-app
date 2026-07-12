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
