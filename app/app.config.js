/**
 * Dynamic config on top of app.json.
 *
 * Apple only lets one developer team register a given bundle id, so each person who builds on their own Mac/Apple ID
 * needs their own id and team. Set them in app/.env.local (git-ignored) or in the shell:
 *
 *   LANCE_BUNDLE_ID=com.yourname.lance     iOS bundle id and Android package (the watch app becomes <id>.watch)
 *   LANCE_APPLE_TEAM_ID=ABCDE12345         your Apple development team id
 *
 * With nothing set, the values from app.json are used unchanged.
 *
 * RevenueCat public SDK keys (never secret keys), read into extra.revenueCat:
 *
 *   LANCE_RC_IOS_KEY=appl_...              iOS key
 *   LANCE_RC_ANDROID_KEY=goog_...          Android key
 *   LANCE_RC_TEST_KEY=test_...             Test Store key, used only in development builds (__DEV__)
 *
 * With no key the app runs as free and the paywall reports an error.
 */
module.exports = ({ config }) => {
  const bundleId = process.env.LANCE_BUNDLE_ID;
  const teamId = process.env.LANCE_APPLE_TEAM_ID;

  const ios = Object.assign({}, config.ios);
  const android = Object.assign({}, config.android);

  if (bundleId) {
    ios.bundleIdentifier = bundleId;
    android.package = bundleId;
  }
  if (teamId) {
    ios.appleTeamId = teamId;
  }

  const extra = Object.assign({}, config.extra, {
    revenueCat: {
      ios: process.env.LANCE_RC_IOS_KEY,
      android: process.env.LANCE_RC_ANDROID_KEY,
      test: process.env.LANCE_RC_TEST_KEY,
    },
  });

  return Object.assign({}, config, { ios: ios, android: android, extra: extra });
};
