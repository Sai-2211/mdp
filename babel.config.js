module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Required by react-native-reanimated. Keep this plugin last.
    plugins: ['react-native-reanimated/plugin'],
  };
};

