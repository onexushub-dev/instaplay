/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'watch',
  name: 'LANCE Watch',
  displayName: 'LANCE',
  bundleIdentifier: '.watch',
  deploymentTarget: '11.0',
  frameworks: ['SwiftUI', 'WatchConnectivity'],
  colors: {
    $accent: '#D6F23F',
  },
};
