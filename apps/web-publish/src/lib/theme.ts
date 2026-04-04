export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme-mode';
export const THEME_ATTRIBUTE = 'data-theme';
export const THEME_MODE_ATTRIBUTE = 'data-theme-mode';
export const HIGHLIGHT_STYLESHEET_ID = 'hljs-theme-link';
export const HIGHLIGHT_LIGHT_STYLESHEET =
	'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github.min.css';
export const HIGHLIGHT_DARK_STYLESHEET =
	'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github-dark.min.css';

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
	return value === 'light' || value === 'dark' || value === 'system';
}

export function getStoredThemeMode(): ThemeMode {
	if (typeof localStorage === 'undefined') {
		return 'system';
	}

	const stored = localStorage.getItem(THEME_STORAGE_KEY);
	return isThemeMode(stored) ? stored : 'system';
}

export function persistThemeMode(themeMode: ThemeMode) {
	if (typeof localStorage === 'undefined') {
		return;
	}

	localStorage.setItem(THEME_STORAGE_KEY, themeMode);
}

export function getSystemThemeQuery(): MediaQueryList | null {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return null;
	}

	return window.matchMedia('(prefers-color-scheme: dark)');
}

export function resolveTheme(themeMode: ThemeMode, prefersDark: boolean): ResolvedTheme {
	if (themeMode === 'system') {
		return prefersDark ? 'dark' : 'light';
	}

	return themeMode;
}

export function getResolvedThemeFromDom(): ResolvedTheme {
	if (typeof document === 'undefined') {
		return 'light';
	}

	return document.documentElement.getAttribute(THEME_ATTRIBUTE) === 'dark' ? 'dark' : 'light';
}

export function syncHighlightTheme(resolvedTheme: ResolvedTheme) {
	if (typeof document === 'undefined') {
		return;
	}

	const href =
		resolvedTheme === 'dark' ? HIGHLIGHT_DARK_STYLESHEET : HIGHLIGHT_LIGHT_STYLESHEET;
	let link = document.getElementById(HIGHLIGHT_STYLESHEET_ID) as HTMLLinkElement | null;

	if (!link) {
		link = document.createElement('link');
		link.id = HIGHLIGHT_STYLESHEET_ID;
		link.rel = 'stylesheet';
		document.head.appendChild(link);
	}

	if (link.href !== href) {
		link.href = href;
	}
}

export function applyResolvedTheme(resolvedTheme: ResolvedTheme, themeMode: ThemeMode) {
	if (typeof document === 'undefined') {
		return;
	}

	const root = document.documentElement;
	root.setAttribute(THEME_ATTRIBUTE, resolvedTheme);
	root.setAttribute(THEME_MODE_ATTRIBUTE, themeMode);
	root.classList.toggle('dark', resolvedTheme === 'dark');
	root.style.colorScheme = resolvedTheme;
	syncHighlightTheme(resolvedTheme);
}
