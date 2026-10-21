// The watch app and its widget share one app group, named after the watch app's bundle id (see WatchSharedState).
const bundleId = process.env.LANCE_BUNDLE_ID || 'app.lance.mobile';
const group = `group.${bundleId}.watch`;

/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'watch-widget',
  name: 'LANCE Watch Widget',
  displayName: 'LANCE',
  bundleIdentifier: '.watch.widget',
  deploymentTarget: '11.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: {
    'com.apple.security.application-groups': [group],
  },
  colors: {
    $accent: '#D6F23F',
  },
};
