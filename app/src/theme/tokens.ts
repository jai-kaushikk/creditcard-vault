// Mirrors design-system/tokens.json. Keep the two in step.

export type ColorScheme = 'light' | 'dark';

const light = {
  surface: '#f6f4ef',
  surfaceRaised: '#ffffff',
  surfaceSunken: '#ece9e1',
  line: '#d9d4c7',
  lineStrong: '#7a8580',
  ink: '#14201c',
  inkMuted: '#5a6661',
  vault: '#0f5c4a',
  vaultSoft: '#dcefe8',
  onVault: '#ffffff',
  brass: '#c8952c',
  brassSoft: '#f6ecd6',
  brassInk: '#6b4a06',
  lent: '#1d5fa8',
  lentSoft: '#e2ecf8',
  owe: '#b0470b',
  oweSoft: '#fbe9dc',
  danger: '#b42318',
  dangerSoft: '#fbe4e1',
  focus: '#1d5fa8',
  scrim: 'rgba(20,32,28,0.56)',
  glassFill: 'rgba(255,255,255,0.72)',
  glassFillStrong: 'rgba(255,255,255,0.88)',
  glassStroke: 'rgba(255,255,255,0.6)',
  glassHighlight: 'rgba(255,255,255,0.9)',
  glassTint: 'rgba(15,92,74,0.12)',
  shadow: '#14201c',
};

const dark: typeof light = {
  surface: '#0e1412',
  surfaceRaised: '#17201d',
  surfaceSunken: '#0a0f0d',
  line: '#2a3531',
  lineStrong: '#64766f',
  ink: '#eef2ef',
  inkMuted: '#9fb0a9',
  vault: '#3ecfa6',
  vaultSoft: '#0f2e26',
  onVault: '#06231b',
  brass: '#e0b45a',
  brassSoft: '#33270e',
  brassInk: '#e0b45a',
  lent: '#7db4f0',
  lentSoft: '#12243a',
  owe: '#f5a05a',
  oweSoft: '#3a1f0c',
  danger: '#ff8a7a',
  dangerSoft: '#3d1410',
  focus: '#7db4f0',
  scrim: 'rgba(0,0,0,0.66)',
  glassFill: 'rgba(23,32,29,0.75)',
  glassFillStrong: 'rgba(23,32,29,0.9)',
  glassStroke: 'rgba(255,255,255,0.14)',
  glassHighlight: 'rgba(255,255,255,0.24)',
  glassTint: 'rgba(62,207,166,0.18)',
  shadow: '#000000',
};

export const palettes = { light, dark };
export type Palette = typeof light;

// Card faces look the same in both themes: a card looks like a card.
export const cardFaces = {
  onyx: '#15201c',
  jade: '#0f5c4a',
  brass: '#5e4515',
  slate: '#2b3a55',
} as const;
export type CardFace = keyof typeof cardFaces;
export const onCard = '#f5f2ea';
export const onCardMuted = '#d6d0bf';
export const cardTag = 'rgba(255,255,255,0.16)';

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48 } as const;
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;

export const fonts = {
  regular: 'SchibstedGrotesk_400Regular',
  medium: 'SchibstedGrotesk_500Medium',
  semibold: 'SchibstedGrotesk_600SemiBold',
  bold: 'SchibstedGrotesk_700Bold',
  mono: 'IBMPlexMono_500Medium',
  monoBold: 'IBMPlexMono_600SemiBold',
} as const;

export const type = {
  displayXl: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, letterSpacing: -0.3 },
  title: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26 },
  headline: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  cardNumber: { fontFamily: fonts.mono, fontSize: 18, lineHeight: 24, letterSpacing: 1.4 },
  otp: { fontFamily: fonts.monoBold, fontSize: 28, lineHeight: 36, letterSpacing: 6 },
} as const;
