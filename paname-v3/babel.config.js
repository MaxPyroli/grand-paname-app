module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // ⚠️ react-native-reanimated/plugin DOIT être le DERNIER plugin de la liste
      'react-native-reanimated/plugin',
    ],
  };
};
