/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'watch',
  name: 'LANCE Watch',
  displayName: 'LANCE',
  bundleIdentifier: '.watch',
  deploymentTarget: '11.0',
  frameworks: ['SwiftUI', 'WatchConnectivity', 'HealthKit'],
  entitlements: {
    'com.apple.developer.healthkit': true,
  },
  colors: {
    $accent: '#D6F23F',
  },
};
