// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Vendored third-party bundles: xterm.js for the in-app terminal WebView
    // (imported as a TS string in `src/assets_terminal.ts` and served from
    // `assets/terminal/`). Not hand-written; keep them out of lint.
    ignores: ['dist/*', 'src/assets_terminal.ts', 'assets/terminal/*'],
  },
]);
