import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import type { SyntaxID, ThemeID, ThemeMode } from '../theme/themes';
import { buildTheme } from '../theme/themes';

export interface FeatureFlags {
  session_chat_chip_timeline: boolean;
}

export interface Settings {
  onboardingCompleted: boolean;
  setupGuideSeen: boolean;
  analyticsConsent: boolean;
  developerTools: boolean;
  featureFlags: FeatureFlags;
  overrideChipTimeline: boolean;
  chipTimeline: boolean;
  chipTimelineIntroDone: boolean;
  chipTimelineIntroSnoozedUntil: number | null;
  collapseConsecutiveToolCalls: boolean;
  followUpDelivery: 'queue' | 'steer';
  hideUserDirectoryPrefix: boolean;
  selectedThemeID: ThemeID;
  themeMode: ThemeMode;
  selectedSyntaxID: SyntaxID;
  textMateEnabled: boolean;
  textMateDisabledLanguages: string[];
  textMateForceEnabledLanguages: string[];
  markdownHighlight: boolean;
  recentWindowHours: number;
}

export const DEFAULT_SETTINGS: Settings = {
  onboardingCompleted: false,
  setupGuideSeen: false,
  analyticsConsent: false,
  developerTools: false,
  featureFlags: { session_chat_chip_timeline: true },
  overrideChipTimeline: false,
  chipTimeline: true,
  chipTimelineIntroDone: false,
  chipTimelineIntroSnoozedUntil: null,
  collapseConsecutiveToolCalls: true,
  followUpDelivery: 'queue',
  hideUserDirectoryPrefix: true,
  selectedThemeID: 'porcelain',
  themeMode: 'system',
  selectedSyntaxID: 'match',
  textMateEnabled: true,
  textMateDisabledLanguages: [],
  textMateForceEnabledLanguages: [],
  markdownHighlight: true,
  recentWindowHours: 24,
};

const STORAGE_KEY = 'opencode_mobile_settings_v1';

export interface DiagEntry {
  id: string;
  time: number;
  level: 'info' | 'warn' | 'error';
  tag: string;
  message: string;
}

interface SettingsContextValue {
  settings: Settings;
  ready: boolean;
  theme: ReturnType<typeof buildTheme>;
  update: (patch: Partial<Settings>) => void;
  reset: () => Promise<void>;
  diagnostics: DiagEntry[];
  logDiag: (level: DiagEntry['level'], tag: string, message: string) => void;
  clearDiagnostics: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

let diagRing: DiagEntry[] = [];

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagEntry[]>([]);
  const saveTimer = useRef<any>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed, featureFlags: { ...DEFAULT_SETTINGS.featureFlags, ...(parsed.featureFlags || {}) } });
        } catch {}
      }
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  const persist = useCallback((next: Settings) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    }, 120);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  }, [persist]);

  const reset = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const logDiag = useCallback((level: DiagEntry['level'], tag: string, message: string) => {
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, time: Date.now(), level, tag, message };
    diagRing = [...diagRing.slice(-499), entry];
    setDiagnostics(diagRing);
  }, []);

  const clearDiagnostics = useCallback(() => {
    diagRing = [];
    setDiagnostics([]);
  }, []);

  const resolvedMode: 'light' | 'dark' = settings.themeMode === 'system'
    ? (system === 'dark' ? 'dark' : 'light')
    : settings.themeMode;

  const theme = useMemo(
    () => buildTheme(settings.selectedThemeID, resolvedMode, settings.selectedSyntaxID),
    [settings.selectedThemeID, settings.selectedSyntaxID, resolvedMode],
  );

  const value = useMemo(() => ({
    settings, ready, theme, update, reset, diagnostics, logDiag, clearDiagnostics,
  }), [settings, ready, theme, update, reset, diagnostics, logDiag, clearDiagnostics]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
