/**
 * @entire-vc/tokens
 * Entire VC Design Tokens
 * 
 * Usage:
 * ```ts
 * import { themes, fontFamily, spacing } from '@entire-vc/tokens';
 * ```
 */

export * from './colors';
export * from './typography';
export * from './spacing';
export * from './effects';

// Re-export theme utilities
export { themes, type ThemeName, type ThemeColors } from './colors';
