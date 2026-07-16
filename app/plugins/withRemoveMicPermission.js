// expo-audio déclare RECORD_AUDIO dans son propre AndroidManifest.xml natif,
// indépendamment de l'option `recordAudioAndroid: false` côté config JS (qui
// ne fait qu'éviter de la redemander, sans jamais retirer celle du module).
// L'app ne fait jamais d'enregistrement audio (juste de la lecture), donc on
// force sa suppression explicite dans le manifest final fusionné.
const { withAndroidManifest } = require('expo/config-plugins');

const withRemoveMicPermission = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (manifest.$ && !manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }
    if (!manifest['uses-permission']) manifest['uses-permission'] = [];
    manifest['uses-permission'].push({
      $: {
        'android:name': 'android.permission.RECORD_AUDIO',
        'tools:node': 'remove',
      },
    });
    return config;
  });
};

module.exports = withRemoveMicPermission;
