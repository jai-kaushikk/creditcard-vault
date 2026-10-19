import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { palettes, type ColorScheme, type Palette } from '@/theme/tokens';

export type Settings = {
  appearance: 'system' | 'light' | 'dark';
  glass: boolean;
  biometricLock: boolean;
  hideInSwitcher: boolean;
  lockAfterSeconds: number;
  defaultLimitMinor: number;
  defaultShareDays: number;
};

const DEFAULTS: Settings = {
  appearance: 'system',
  glass: true,
  biometricLock: true,
  hideInSwitcher: true,
  lockAfterSeconds: 60,
  defaultLimitMinor: 500000,
  defaultShareDays: 14,
};

const KEY = 'cv.settings.v1';

type Ctx = {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
  scheme: ColorScheme;
  c: Palette;
};

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const system = useColorScheme();

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const scheme: ColorScheme =
    settings.appearance === 'system' ? (system === 'dark' ? 'dark' : 'light') : settings.appearance;

  const value = useMemo(
    () => ({ settings, ready, update, scheme, c: palettes[scheme] }),
    [settings, ready, update, scheme],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}

/** Colours for the current scheme plus whether glass effects are on. */
export function useTheme() {
  const { c, scheme, settings } = useSettings();
  return { c, scheme, glass: settings.glass };
}
