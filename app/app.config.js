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

  return Object.assign({}, config, { ios: ios, android: android });
};
