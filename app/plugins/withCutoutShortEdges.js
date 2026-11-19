// Zone de la caméra (« encoche ») en PAYSAGE : par défaut Android laisse une bande grise à côté de l'encoche. Avec
// `shortEdges`, la fenêtre de l'app s'étend sous l'encoche (le fond de l'app y est dessiné) ; le contenu reste à
// l'écart grâce aux marges de sécurité (`useSafeAreaInsets` : voir responsive.ts et App.tsx).
// Demande un nouveau build natif (ne se recharge pas à chaud).
const { withAndroidStyles } = require('expo/config-plugins');

const NOM = 'android:windowLayoutInDisplayCutoutMode';

const withCutoutShortEdges = (config) =>
  withAndroidStyles(config, (config) => {
    const styles = config.modResults.resources.style || [];
    const theme = styles.find((s) => s.$ && s.$.name === 'AppTheme');
    if (theme) {
      theme.item = (theme.item || []).filter((i) => !(i.$ && i.$.name === NOM));
      theme.item.push({ $: { name: NOM }, _: 'shortEdges' });
    }
    return config;
  });

module.exports = withCutoutShortEdges;
