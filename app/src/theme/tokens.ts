// Design tokens taken from the mockups (https://claude.ai/artifact/2Cj7DeSydAkeWGADELpFKw). The UI is always dark.

export const colors = {
  ground: '#0F100D',
  recordingGround: '#070806',
  surface: '#1B1D18',
  border: '#3A3D34',
  text: '#F3EFE4',
  muted: '#A9A79C',
  soft: '#CFCBBF',
  accent: '#CFEA79',
  onAccent: '#0F100D',
  rec: '#FF5A36',
  warning: '#FF8A3D',
  warningGround: '#3A1D10',
} as const;

export const fonts = {
  display: 'BarlowCondensed_700Bold',
  displayBold: 'BarlowCondensed_800ExtraBold',
  body: 'Manrope_400Regular',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
} as const;

export const radius = { chip: 20, card: 14, button: 16, sheet: 24 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
