<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import Sidebar from '$lib/components/Sidebar.svelte';
import ViewerTopbar from '$lib/components/ViewerTopbar.svelte';
	import LoadingBar from '$lib/components/LoadingBar.svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import {
		THEME_STORAGE_KEY,
		applyResolvedTheme,
		getResolvedThemeFromDom,
		getStoredThemeMode,
		getSystemThemeQuery,
		persistThemeMode,
		resolveTheme,
		type ResolvedTheme,
		type ThemeMode
	} from '$lib/theme';

	let { children, data } = $props();

const currentUser = $derived(data?.currentUser || null);
const isAuthenticated = $derived(Boolean(currentUser));

	// Check if on home page
	const isHomePage = $derived($page.url.pathname === '/');

	// Extract folder items and slug from page data (if available)
	// Note: folderItems comes from page data, not layout data, so we use $page.data
	const folderItems = $derived($page.data?.folderItems);
	const currentSlug = $derived($page.data?.share?.web_slug);
	// Current path for highlighting active item in file tree
	const currentPath = $derived($page.data?.filePath || '');
const resourceKind = $derived($page.data?.resourceKind || 'share');
const adminUrl = $derived(data?.adminUrl || null);

	// Get branding from server info (from layout load)
	const branding = $derived(data?.serverInfo?.branding);

	// Track sidebar collapsed state for main content margin
	let sidebarCollapsed = $state(false);
	let themeMode = $state<ThemeMode>('system');
	let resolvedTheme = $state<ResolvedTheme>(browser ? getResolvedThemeFromDom() : 'light');

	function syncTheme(nextMode = themeMode, persist = false) {
		if (!browser) {
			return;
		}

		const mediaQuery = getSystemThemeQuery();
		themeMode = nextMode;
		resolvedTheme = resolveTheme(nextMode, Boolean(mediaQuery?.matches));
		applyResolvedTheme(resolvedTheme, themeMode);
		if (persist) {
			persistThemeMode(nextMode);
		}
	}

	function handleThemeModeChange(nextMode: ThemeMode) {
		syncTheme(nextMode, true);
	}

	function handleSidebarCollapseChange(collapsed: boolean) {
		sidebarCollapsed = collapsed;
	}

	onMount(() => {
		if (!browser) {
			return;
		}

		const mediaQuery = getSystemThemeQuery();
		const syncCollapsed = () => {
			sidebarCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
		};
		const syncStoredTheme = () => {
			syncTheme(getStoredThemeMode());
		};
		const handleStorage = (event: StorageEvent) => {
			if (!event.key || event.key === 'sidebar-collapsed') {
				syncCollapsed();
			}

			if (!event.key || event.key === THEME_STORAGE_KEY) {
				syncStoredTheme();
			}
		};
		const handleSystemThemeChange = () => {
			if (themeMode === 'system') {
				syncTheme('system');
			}
		};

		syncCollapsed();
		syncStoredTheme();
		window.addEventListener('storage', handleStorage);
		mediaQuery?.addEventListener?.('change', handleSystemThemeChange);

		return () => {
			window.removeEventListener('storage', handleStorage);
			mediaQuery?.removeEventListener?.('change', handleSystemThemeChange);
		};
	});
</script>

<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	{#if branding?.favicon_url}
		<link rel="icon" href={branding.favicon_url} />
	{/if}
	{#if branding?.name}
		<meta property="og:site_name" content={branding.name} />
	{/if}
	{#if branding?.custom_head_code}
		{@html branding.custom_head_code}
	{/if}
</svelte:head>

<LoadingBar />

<div class="app-container">
	{#if !isHomePage}
		<Sidebar
			{isAuthenticated}
			{folderItems}
			{currentSlug}
			{currentPath}
			{branding}
			{themeMode}
			{resolvedTheme}
			{adminUrl}
			onThemeModeChange={handleThemeModeChange}
			onCollapseChange={handleSidebarCollapseChange}
		/>
	{/if}
	<main class="main-content" class:collapsed={sidebarCollapsed} class:home-page={isHomePage}>
		<div class="content-wrapper" class:home-page={isHomePage}>
			{#if !isHomePage}
				<ViewerTopbar
					currentSlug={currentSlug}
					currentPath={currentPath}
					resourceKind={resourceKind}
					currentUser={currentUser}
					enableSearch={Boolean(currentSlug && folderItems?.length)}
				/>
			{/if}
			{@render children()}
		</div>
	</main>
</div>

{#if branding?.custom_body_code}
	{@html branding.custom_body_code}
{/if}

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: var(--font-sans, 'Inter', system-ui, -apple-system, sans-serif);
		background-color: hsl(var(--background));
		color: hsl(var(--foreground));
		line-height: 1.6;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(html) {
		scroll-behavior: smooth;
	}

	:global(:focus-visible) {
		outline: 2px solid hsl(var(--ring) / 0.5);
		outline-offset: 2px;
	}

	.app-container {
		display: flex;
		min-height: 100vh;
	}

	.main-content {
		flex: 1;
		margin-left: 250px;
		--sidebar-current-width: 250px;
		padding: 2rem 2.5rem;
		transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.main-content.collapsed {
		margin-left: 60px;
		--sidebar-current-width: 60px;
	}

	.main-content.home-page {
		margin-left: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
	}

	.content-wrapper {
		max-width: 900px;
		margin: 0 auto;
	}

	.content-wrapper.home-page {
		max-width: 1200px;
		width: 100%;
	}

	@media (max-width: 768px) {
		.app-container {
			flex-direction: column;
		}

		.main-content {
			margin-left: 0;
			--sidebar-current-width: 0px;
			padding: 1rem;
		}
	}

	@media (min-width: 769px) and (max-width: 1024px) {
		.main-content {
			padding: 1.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(html) {
			scroll-behavior: auto;
		}
	}
</style>
