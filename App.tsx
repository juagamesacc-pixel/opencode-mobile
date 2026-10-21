import 'react-native-url-polyfill/auto';
import React from 'react';
// Named import loads the module (its side effect must run first) without a
// second, duplicate import from the same package.
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SettingsProvider, useSettings } from './src/state/settings';
import { ServersProvider } from './src/state/servers';
import { DialogHost } from './src/components/dialog';
import { RootNavigator } from './src/navigation/RootNavigator';

function ThemedStatusBar() {
  const { theme } = useSettings();
  return <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <ServersProvider>
            <RootNavigator />
            <ThemedStatusBar />
            {/* Themed replacement for the system Alert dialogs, mounted once
                under the theme context so appAlert() is theme-aware. */}
            <DialogHost />
          </ServersProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
