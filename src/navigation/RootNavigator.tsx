import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { useSettings } from '../state/settings';
import { useServers } from '../state/servers';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { ServerSetupScreen } from '../screens/ServerSetupScreen';
import { PairQRScreen } from '../screens/PairQRScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { ChangesScreen } from '../screens/ChangesScreen';
import { FileViewerScreen } from '../screens/FileViewerScreen';
import { TerminalsScreen } from '../screens/TerminalsScreen';
import { TerminalScreen } from '../screens/TerminalScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AppearanceScreen } from '../screens/AppearanceScreen';
import { ThemePickerScreen } from '../screens/ThemePickerScreen';
import { SyntaxPickerScreen } from '../screens/SyntaxPickerScreen';
import { ServersScreen } from '../screens/ServersScreen';
import { DiagnosticsScreen } from '../screens/DiagnosticsScreen';
import { FeatureFlagsScreen } from '../screens/FeatureFlagsScreen';
import { TextMateLanguagesScreen } from '../screens/TextMateLanguagesScreen';
import { TextMateLogbookScreen } from '../screens/TextMateLogbookScreen';
import { AddProjectScreen } from '../screens/AddProjectScreen';
import { GalleryScreen } from '../screens/GalleryScreen';
import { AboutScreen } from '../screens/AboutScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { settings, ready: settingsReady, theme } = useSettings();
  const { servers, ready: serversReady } = useServers();
  const ready = settingsReady && serversReady;

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.textWeak} />
      </View>
    );
  }

  const initialRoute: keyof RootStackParamList = !settings.onboardingCompleted
    ? 'Onboarding'
    : servers.length === 0
      ? 'ServerSetup'
      : 'Home';

  const navTheme = {
    ...(theme.mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.mode === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      primary: theme.colors.interactive,
      background: theme.colors.background,
      card: theme.colors.surfaceRaised,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.error,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade' }} />
        <Stack.Screen name="ServerSetup" component={ServerSetupScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="PairQR" component={PairQRScreen} options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ animation: 'fade' }} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Changes" component={ChangesScreen} />
        <Stack.Screen name="FileViewer" component={FileViewerScreen} />
        <Stack.Screen name="Terminals" component={TerminalsScreen} />
        <Stack.Screen name="Terminal" component={TerminalScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Appearance" component={AppearanceScreen} />
        <Stack.Screen name="ThemePicker" component={ThemePickerScreen} />
        <Stack.Screen name="SyntaxPicker" component={SyntaxPickerScreen} />
        <Stack.Screen name="Servers" component={ServersScreen} />
        <Stack.Screen name="Diagnostics" component={DiagnosticsScreen} />
        <Stack.Screen name="FeatureFlags" component={FeatureFlagsScreen} />
        <Stack.Screen name="TextMateLanguages" component={TextMateLanguagesScreen} />
        <Stack.Screen name="TextMateLogbook" component={TextMateLogbookScreen} />
        <Stack.Screen name="AddProject" component={AddProjectScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Gallery" component={GalleryScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
