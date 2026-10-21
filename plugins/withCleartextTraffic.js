/**
 * Sets android:usesCleartextTraffic="true" on the <application> element.
 *
 * OpenCode Mobile is a client for self-hosted opencode servers, which are
 * typically served over plain http:// on a LAN or tailnet (e.g.
 * http://192.168.1.10:4096). Android 9+ blocks cleartext by default in
 * release builds; the original app enabled it the same way.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const withCleartextTraffic = (config) => {
  return withAndroidManifest(config, (mod) => {
    const applications = mod.modResults?.manifest?.application || [];
    if (applications.length > 0) {
      applications[0].$['android:usesCleartextTraffic'] = 'true';
    }
    return mod;
  });
};

module.exports = withCleartextTraffic;
