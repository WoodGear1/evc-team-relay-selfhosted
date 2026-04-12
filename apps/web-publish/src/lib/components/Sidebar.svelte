<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import FileTree from './FileTree.svelte';
	import type { FolderItem } from '$lib/file-tree';
	import type { ResolvedTheme, ThemeMode } from '$lib/theme';

	interface Branding {
		name: string;
		logo_url: string;
		favicon_url: string;
	}

	interface Props {
		isAuthenticated?: boolean;
		shareName?: string;
		folderItems?: FolderItem[];
		currentSlug?: string;
		currentPath?: string;
		branding?: Branding;
		themeMode?: ThemeMode;
		resolvedTheme?: ResolvedTheme;
		adminUrl?: string | null;
		onThemeModeChange?: (themeMode: ThemeMode) => void;
		onCollapseChange?: (collapsed: boolean) => void;
	}

	const themeOptions: Array<{ value: ThemeMode; label: string; shortLabel: string }> = [
		{ value: 'light', label: 'Light', shortLabel: 'L' },
		{ value: 'dark', label: 'Dark', shortLabel: 'D' },
		{ value: 'system', label: 'System', shortLabel: 'S' }
	];

	let {
		isAuthenticated = false,
		shareName = '',
		folderItems = [],
		currentSlug = '',
		currentPath = '',
		branding,
		themeMode = 'system',
		resolvedTheme = 'light',
		adminUrl = null,
		onThemeModeChange,
		onCollapseChange
	}: Props = $props();

	let menuOpen = $state(false);
	let isCollapsed = $state(false);

	onMount(() => {
		if (browser) {
			const saved = localStorage.getItem('sidebar-collapsed');
			if (saved !== null) {
				isCollapsed = saved === 'true';
			}
			onCollapseChange?.(isCollapsed);
		}
	});

	function toggleMenu() {
		menuOpen = !menuOpen;
	}

	function closeMenu() {
		menuOpen = false;
	}

	function toggleCollapse() {
		isCollapsed = !isCollapsed;
		if (browser) {
			localStorage.setItem('sidebar-collapsed', String(isCollapsed));
		}
		onCollapseChange?.(isCollapsed);
	}

	function setThemeMode(nextMode: ThemeMode) {
		onThemeModeChange?.(nextMode);
	}

	$effect(() => {
		if ($page.url) {
			closeMenu();
		}
	});
</script>

<!-- Mobile hamburger -->
<button class="hamburger" class:open={menuOpen} onclick={toggleMenu} aria-label="Toggle menu">
	<span></span>
	<span></span>
	<span></span>
</button>

<!-- Collapse toggle (desktop) -->
<button
	class="collapse-toggle"
	class:collapsed={isCollapsed}
	onclick={toggleCollapse}
	aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
	title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
>
	<svg class="collapse-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		{#if isCollapsed}
			<polyline points="9 18 15 12 9 6" />
		{:else}
			<polyline points="15 18 9 12 15 6" />
		{/if}
	</svg>
</button>

<aside class="sidebar" class:open={menuOpen} class:collapsed={isCollapsed}>
	<div class="sidebar-header">
		<a href="/" class="logo-link">
			<div class="brand-container">
				{#if branding?.logo_url}
					<img src={branding.logo_url} alt="{branding.name} logo" class="brand-logo" />
				{:else}
					<div class="brand-logo-default">
						<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
							<circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="1.5" />
							<circle cx="12" cy="12" r="2" fill="currentColor" />
						</svg>
					</div>
				{/if}
				{#if !isCollapsed}
					<div class="brand-text">
						<h1 class="site-title">{branding?.name || 'Published Docs'}</h1>
					</div>
				{/if}
			</div>
		</a>
	</div>

	<nav class="sidebar-nav">
		{#if folderItems && folderItems.length > 0}
			{#if !isCollapsed}
				<div class="nav-section">
					<div class="nav-section-header">Contents</div>
				</div>
				<FileTree items={folderItems} {currentSlug} {currentPath} onNavigate={closeMenu} />
			{:else}
				<div class="collapsed-hint" title="Expand to see contents">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
					</svg>
				</div>
			{/if}
		{:else if isAuthenticated && adminUrl}
			<a href="{adminUrl}/shares" class="nav-link" target="_blank" rel="noopener" data-sveltekit-reload onclick={closeMenu}>
				<span class="nav-icon">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<polyline points="14 2 14 8 20 8" />
					</svg>
				</span>
				{#if !isCollapsed}<span class="nav-text">My Shares</span>{/if}
			</a>
			<a href="{adminUrl}/settings/branding" class="nav-link" target="_blank" rel="noopener" onclick={closeMenu}>
				<span class="nav-icon">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
					</svg>
				</span>
				{#if !isCollapsed}<span class="nav-text">Settings</span>{/if}
			</a>
		{:else if !isCollapsed}
			<div class="nav-hint">
				<p>Share documents with your team or publicly.</p>
				<p class="hint-subtext">Sign in to manage your shares.</p>
			</div>
		{/if}
	</nav>

	<div class="sidebar-footer">
		<div class="theme-switcher" class:collapsed={isCollapsed}>
			<div
				class="theme-switcher-options"
				class:collapsed={isCollapsed}
				role="radiogroup"
				aria-label="Color theme"
			>
				{#each themeOptions as option}
					<button
						type="button"
						class="theme-option"
						class:active={themeMode === option.value}
						class:collapsed={isCollapsed}
						role="radio"
						aria-checked={themeMode === option.value}
						aria-label={`Use ${option.label.toLowerCase()} theme`}
						title={option.label}
						onclick={() => setThemeMode(option.value)}
					>
						<svg class="theme-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							{#if option.value === 'light'}
								<circle cx="12" cy="12" r="5" />
								<line x1="12" y1="1" x2="12" y2="3" />
								<line x1="12" y1="21" x2="12" y2="23" />
								<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
								<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
								<line x1="1" y1="12" x2="3" y2="12" />
								<line x1="21" y1="12" x2="23" y2="12" />
								<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
								<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
							{:else if option.value === 'dark'}
								<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
							{:else}
								<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
								<line x1="8" y1="21" x2="16" y2="21" />
								<line x1="12" y1="17" x2="12" y2="21" />
							{/if}
						</svg>
					</button>
				{/each}
			</div>
		</div>
		
	</div>
</aside>

<!-- Overlay for mobile -->
{#if menuOpen}
	<div
		class="overlay"
		onclick={closeMenu}
		onkeydown={(e) => e.key === 'Escape' && closeMenu()}
		role="button"
		tabindex="-1"
		aria-label="Close menu"
	></div>
{/if}

<style>
	/* ── Hamburger ── */
	.hamburger {
		display: none;
		position: fixed;
		top: 0.65rem;
		left: 0.65rem;
		z-index: 1002;
		background: hsl(var(--background) / 0.85);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: 10px;
		padding: 0;
		cursor: pointer;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 4px;
		width: 2.5rem;
		height: 2.5rem;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.hamburger:hover {
		background: hsl(var(--background) / 0.9);
		border-color: hsl(var(--primary) / 0.3);
	}

	.hamburger span {
		display: block;
		width: 20px;
		height: 2px;
		background-color: hsl(var(--foreground));
		border-radius: 1px;
		transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s;
	}

	.hamburger.open span:nth-child(1) {
		transform: translateY(6px) rotate(45deg);
	}

	.hamburger.open span:nth-child(2) {
		opacity: 0;
	}

	.hamburger.open span:nth-child(3) {
		transform: translateY(-6px) rotate(-45deg);
	}

	/* ── Collapse Toggle ── */
	.collapse-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		position: fixed;
		left: 238px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 1001;
		width: 20px;
		height: 40px;
		background: hsl(var(--sidebar-accent) / 0.6);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid hsl(var(--border) / 0.3);
		border-left: none;
		border-radius: 0 8px 8px 0;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		opacity: 0;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.collapse-toggle:hover,
	.collapse-toggle.collapsed {
		opacity: 1;
	}

	.collapse-toggle:hover {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
		border-color: hsl(var(--primary) / 0.3);
	}

	.collapse-toggle.collapsed {
		left: 48px;
		opacity: 0.7;
	}

	.collapse-toggle.collapsed:hover {
		opacity: 1;
	}

	.collapse-icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.overlay {
		display: none;
	}

	/* ── Sidebar ── */
	.sidebar {
		width: 250px;
		height: 100vh;
		background: hsl(var(--sidebar-background) / 0.85);
		backdrop-filter: blur(20px) saturate(1.2);
		-webkit-backdrop-filter: blur(20px) saturate(1.2);
		border-right: 1px solid hsl(var(--border) / 0.4);
		display: flex;
		flex-direction: column;
		position: fixed;
		left: 0;
		top: 0;
		overflow-y: auto;
		overflow-x: hidden;
		z-index: 1000;
		transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.sidebar.collapsed {
		width: 60px;
	}

	/* ── Sidebar Header ── */
	.sidebar-header {
		padding: 1.25rem 1rem;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.sidebar.collapsed .sidebar-header {
		padding: 1rem 0.5rem;
	}

	.logo-link {
		text-decoration: none;
		color: inherit;
		display: block;
	}

	.brand-container {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.brand-logo {
		width: 32px;
		height: 32px;
		color: hsl(var(--sidebar-foreground));
		flex-shrink: 0;
		object-fit: contain;
	}

	.brand-logo-default {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		color: hsl(var(--primary));
		filter: drop-shadow(0 0 6px hsl(var(--primary) / 0.3));
	}

	.brand-logo-default svg {
		width: 100%;
		height: 100%;
	}

	.brand-text {
		display: flex;
		flex-direction: column;
	}

	.site-title {
		font-size: 1.125rem;
		font-weight: 700;
		margin: 0;
		color: hsl(var(--foreground));
		line-height: 1.2;
		letter-spacing: -0.01em;
		transition: color 0.2s;
	}

	.logo-link:hover .site-title {
		color: hsl(var(--primary));
	}

	/* ── Navigation ── */
	.sidebar-nav {
		flex: 1;
		padding: 0.5rem 0;
		overflow-y: auto;
	}

	.nav-link {
		display: flex;
		align-items: center;
		padding: 0.625rem 1rem;
		color: hsl(var(--sidebar-foreground));
		text-decoration: none;
		border-left: 3px solid transparent;
		border-radius: 0 8px 8px 0;
		margin-right: 0.5rem;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.sidebar.collapsed .nav-link {
		justify-content: center;
		padding: 0.75rem 0;
		margin-right: 0;
		border-radius: 0;
	}

	.nav-link:hover {
		background: hsl(var(--primary) / 0.08);
		border-left-color: hsl(var(--primary));
		color: hsl(var(--primary));
	}

	.nav-link:focus-visible {
		outline: none;
		background: hsl(var(--primary) / 0.08);
		border-left-color: hsl(var(--primary));
		color: hsl(var(--primary));
	}

	.nav-icon {
		margin-right: 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	.nav-icon svg {
		width: 16px;
		height: 16px;
	}

	.sidebar.collapsed .nav-icon {
		margin-right: 0;
	}

	.nav-text {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.nav-hint {
		padding: 1rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.hint-subtext {
		color: hsl(var(--muted-foreground));
		opacity: 0.6;
		font-size: 0.75rem;
		margin-top: 0.5rem;
	}

	.nav-section {
		margin-bottom: 0.25rem;
	}

	.nav-section-header {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: hsl(var(--muted-foreground));
		padding: 0.5rem 1rem;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.collapsed-hint {
		display: flex;
		justify-content: center;
		padding: 1rem 0;
		color: hsl(var(--muted-foreground));
	}

	/* ── Sidebar Footer ── */
	.sidebar-footer {
		padding: 0.875rem;
		border-top: 1px solid hsl(var(--border) / 0.3);
		margin-top: auto;
	}

	/* ── Theme Switcher ── */
	.theme-switcher {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.theme-switcher.collapsed {
		align-items: center;
	}

	.theme-switcher-options {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.4rem;
		padding: 0.35rem;
		background: hsl(var(--muted) / 0.5);
		border-radius: 1rem;
		border: 1px solid hsl(var(--border) / 0.3);
	}

	.theme-switcher-options.collapsed {
		grid-template-columns: 1fr;
		width: 100%;
	}

	.theme-option {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.65rem 0.375rem;
		border: 1px solid transparent;
		border-radius: 0.8rem;
		background: transparent;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.theme-option.collapsed {
		min-width: 2.25rem;
		padding: 0.6rem 0.35rem;
	}

	.theme-icon {
		flex-shrink: 0;
		opacity: 0.82;
		width: 1.05rem;
		height: 1.05rem;
		transition: opacity 0.2s, transform 0.2s;
	}

	.theme-option:hover {
		background: hsl(var(--background) / 0.92);
		color: hsl(var(--foreground));
		border-color: hsl(var(--primary) / 0.25);
		transform: translateY(-1px);
	}

	.theme-option:hover .theme-icon {
		opacity: 1;
		transform: scale(1.05);
	}

	.theme-option:focus-visible {
		outline: none;
		background: hsl(var(--background) / 0.8);
		color: hsl(var(--foreground));
		box-shadow: 0 0 0 2px hsl(var(--ring) / 0.3);
	}

	.theme-option.active {
		background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
		box-shadow: 0 10px 22px hsl(var(--primary) / 0.28);
	}

	.theme-option.active .theme-icon {
		opacity: 1;
	}

	/* ── Mobile ── */
	@media (max-width: 768px) {
		.hamburger {
			display: flex;
		}

		.collapse-toggle {
			display: none;
		}

		.sidebar {
			transform: translateX(-100%);
			transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
			box-shadow: 4px 0 24px hsl(var(--background) / 0.5);
			z-index: 1001;
			width: 260px;
		}

		.sidebar.open {
			transform: translateX(0);
		}

		.sidebar.collapsed {
			width: 260px;
		}

		.overlay {
			display: block;
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: hsl(var(--background) / 0.6);
			backdrop-filter: blur(4px);
			-webkit-backdrop-filter: blur(4px);
			z-index: 999;
			animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		}

		@keyframes fadeIn {
			from { opacity: 0; }
			to { opacity: 1; }
		}
	}

	/* ── Reduced motion ── */
	@media (prefers-reduced-motion: reduce) {
		.hamburger,
		.hamburger span,
		.sidebar,
		.nav-link,
		.overlay,
		.collapse-toggle,
		.theme-option {
			transition: none;
		}

		.overlay {
			animation: none;
		}
	}
</style>
