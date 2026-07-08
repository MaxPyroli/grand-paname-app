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
