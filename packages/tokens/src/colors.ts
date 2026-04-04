/**
 * Entire VC Color Palette
 * 
 * Base brand colors and theme-specific variations
 */

// Utility: Convert hex to RGB values
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) throw new Error(`Invalid hex color: ${hex}`);
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

export function hexToRgbString(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

// ============================================
// ENTIRE VC - Base Brand (Neutral/Professional)
// ============================================
export const entireColors = {
  primary: '#525769',
  primaryForeground: '#FFFFFF',
  secondary: '#DDE1E6',
  secondaryForeground: '#1A1A1A',
  
  // Neutrals
  background: '#FFFFFF',
  foreground: '#1A1A1A',
  muted: '#F4F4F5',
  mutedForeground: '#71717A',
  
  // UI Elements
  card: '#FFFFFF',
  cardForeground: '#1A1A1A',
  border: '#E4E4E7',
  input: '#E4E4E7',
  ring: '#525769',
  
  // Semantic
  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',
  success: '#22C55E',
  successForeground: '#FFFFFF',
  warning: '#F59E0B',
  warningForeground: '#FFFFFF',
  
  // Accent (same as primary for base theme)
  accent: '#525769',
  accentForeground: '#FFFFFF',
} as const;

// ============================================
// SPARK 🔥 - Creative/Energetic
// ============================================
export const sparkColors = {
  primary: '#FF6A3D',
  primaryForeground: '#FFFFFF',
  secondary: '#323643',
  secondaryForeground: '#FFFFFF',
  
  // Neutrals (dark theme base)
  background: '#1A1A1A',
  foreground: '#FAFAFA',
  muted: '#27272A',
  mutedForeground: '#A1A1AA',
  
  // UI Elements
  card: '#27272A',
  cardForeground: '#FAFAFA',
  border: '#3F3F46',
  input: '#3F3F46',
  ring: '#FF6A3D',
  
  // Semantic
  destructive: '#DC2626',
  destructiveForeground: '#FFFFFF',
  success: '#22C55E',
  successForeground: '#FFFFFF',
  warning: '#FFC947', // Brand yellow
  warningForeground: '#1A1A1A',
  
  // Accent (yellow fire)
  accent: '#FFC947',
  accentForeground: '#1A1A1A',
} as const;

// ============================================
// PLAYGROUND 🌊 - Tech/Trustworthy
// ============================================
export const playgroundColors = {
  primary: '#3D8BFF',
  primaryForeground: '#FFFFFF',
  secondary: '#AEB8C2',
  secondaryForeground: '#1A1A1A',
  
  // Neutrals
  background: '#FFFFFF',
  foreground: '#1A1A1A',
  muted: '#F1F5F9',
  mutedForeground: '#64748B',
  
  // UI Elements
  card: '#FFFFFF',
  cardForeground: '#1A1A1A',
  border: '#E2E8F0',
  input: '#E2E8F0',
  ring: '#3D8BFF',
  
  // Semantic
  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',
  success: '#22C55E',
  successForeground: '#FFFFFF',
  warning: '#F59E0B',
  warningForeground: '#FFFFFF',
  
  // Accent (teal/cyan)
  accent: '#33D6C9',
  accentForeground: '#1A1A1A',
} as const;

// ============================================
// TEAM RELAY - Professional/Collaborative
// ============================================
export const teamRelayColors = {
  primary: '#6366F1', // Indigo
  primaryForeground: '#FFFFFF',
  secondary: '#E0E7FF',
  secondaryForeground: '#3730A3',
  
  // Neutrals
  background: '#FFFFFF',
  foreground: '#1E1B4B',
  muted: '#F5F3FF',
  mutedForeground: '#6B7280',
  
  // UI Elements
  card: '#FFFFFF',
  cardForeground: '#1E1B4B',
  border: '#E5E7EB',
  input: '#E5E7EB',
  ring: '#6366F1',
  
  // Semantic
  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',
  success: '#10B981',
  successForeground: '#FFFFFF',
  warning: '#F59E0B',
  warningForeground: '#FFFFFF',
  
  // Accent
  accent: '#8B5CF6', // Purple
  accentForeground: '#FFFFFF',
} as const;

// Theme type
export type ThemeColors = typeof entireColors;

// All themes
export const themes = {
  entire: entireColors,
  spark: sparkColors,
  playground: playgroundColors,
  'team-relay': teamRelayColors,
} as const;

export type ThemeName = keyof typeof themes;
