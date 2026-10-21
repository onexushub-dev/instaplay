/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'watch-widget',
  name: 'LANCE Watch Widget',
  displayName: 'LANCE',
  bundleIdentifier: '.watch.widget',
  deploymentTarget: '11.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents', 'WatchConnectivity'],
  colors: {
    $accent: '#D6F23F',
  },
};
