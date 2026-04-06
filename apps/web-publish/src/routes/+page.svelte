<script lang="ts">
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const branding = $derived($page.data?.serverInfo?.branding);
	const instanceName = $derived(branding?.name || 'Docs');
	const currentUser = $derived($page.data?.currentUser);
	const adminUrl = $derived($page.data?.adminUrl);
	const shares = $derived(data?.shares || []);
</script>

<svelte:head>
	<title>{instanceName}</title>
	<meta name="description" content="{instanceName} — browse published documentation" />
</svelte:head>

<div class="home-wrap">
	<header class="home-header">
		<div class="header-glow"></div>
		<div class="header-inner">
			{#if branding?.logo_url}
				<img src={branding.logo_url} alt={instanceName} class="header-logo" />
			{:else}
				<div class="header-logo-fallback">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<circle cx="12" cy="12" r="10" opacity="0.3" />
						<circle cx="12" cy="12" r="6" />
						<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
					</svg>
				</div>
			{/if}
			<h1 class="header-title">{instanceName}</h1>
			<p class="header-sub">Published documentation &amp; knowledge bases</p>

			<div class="header-actions">
				{#if currentUser}
					<span class="user-badge">
						<span class="user-avatar">{(currentUser.name || currentUser.email)?.[0]?.toUpperCase() || '?'}</span>
						{currentUser.name || currentUser.email}
					</span>
					{#if adminUrl}
						<a href={adminUrl} target="_blank" rel="noopener" class="btn btn-secondary">Admin Panel</a>
					{/if}
				{:else}
					<a href="/login" class="btn btn-primary">Sign in</a>
				{/if}
			</div>
		</div>
	</header>

	<main class="home-main">
		{#if shares.length > 0}
			<section class="shares-section">
				<h2 class="section-title">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
					</svg>
					Available Spaces
				</h2>
				<div class="share-grid">
					{#each shares as share}
						<a href="/{share.slug}" class="share-card">
							<div class="share-card-icon">
								{#if share.kind === 'folder'}
									<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
										<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
									</svg>
								{:else}
									<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
										<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
										<polyline points="14 2 14 8 20 8"/>
										<line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
										<polyline points="10 9 9 9 8 9"/>
									</svg>
								{/if}
							</div>
							<div class="share-card-body">
								<h3 class="share-name">{share.title || share.path}</h3>
								{#if share.description}
									<p class="share-desc">{share.description}</p>
								{/if}
								<div class="share-meta">
									<span class="share-badge" class:public={share.visibility === 'public'} class:protected={share.visibility === 'protected'}>
										{share.visibility === 'public' ? 'Public' : 'Password'}
									</span>
									{#if share.updated_at}
										<span class="share-date">{new Date(share.updated_at).toLocaleDateString()}</span>
									{/if}
								</div>
							</div>
							<svg class="share-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
						</a>
					{/each}
				</div>
			</section>
		{:else}
			<div class="empty-state">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
					<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
				</svg>
				<h2>No published spaces yet</h2>
				<p>Published documentation will appear here once an admin enables web publishing.</p>
				{#if !currentUser}
					<a href="/login" class="btn btn-primary" style="margin-top: 1rem;">Sign in to manage</a>
				{/if}
			</div>
		{/if}
	</main>
</div>

<style>
	.home-wrap {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	/* ---- Header ---- */
	.home-header {
		position: relative;
		text-align: center;
		padding: 3.5rem 1.5rem 2.5rem;
		overflow: hidden;
	}

	.header-glow {
		position: absolute;
		top: 30%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 700px;
		height: 350px;
		background: radial-gradient(ellipse, hsl(var(--primary) / 0.1), transparent 70%);
		pointer-events: none;
	}

	:global(.dark) .header-glow {
		background: radial-gradient(ellipse, hsl(var(--primary) / 0.15), transparent 70%);
	}

	.header-inner {
		position: relative;
		z-index: 1;
		max-width: 640px;
		margin: 0 auto;
	}

	.header-logo {
		width: 64px;
		height: 64px;
		object-fit: contain;
		margin-bottom: 1rem;
	}

	.header-logo-fallback {
		width: 64px;
		height: 64px;
		color: hsl(var(--primary));
		margin: 0 auto 1rem;
	}

	.header-logo-fallback svg {
		width: 100%;
		height: 100%;
	}

	.header-title {
		font-size: 2.25rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: hsl(var(--foreground));
		margin: 0;
	}

	.header-sub {
		margin: 0.5rem 0 0;
		color: hsl(var(--muted-foreground));
		font-size: 1rem;
	}

	.header-actions {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-top: 1.5rem;
		flex-wrap: wrap;
	}

	.user-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.85rem;
		border-radius: 0.625rem;
		font-size: 0.875rem;
		font-weight: 500;
		background: hsl(var(--muted) / 0.5);
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border) / 0.4);
	}

	.user-avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 999px;
		background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)));
		color: white;
		font-size: 0.65rem;
		font-weight: 700;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 1.1rem;
		border-radius: 0.625rem;
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
		border: 1px solid transparent;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.btn-primary {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}

	.btn-primary:hover {
		filter: brightness(1.08);
		transform: translateY(-1px);
		box-shadow: 0 4px 16px hsl(var(--primary) / 0.3);
		text-decoration: none;
	}

	.btn-secondary {
		background: hsl(var(--card));
		color: hsl(var(--foreground));
		border-color: hsl(var(--border) / 0.5);
	}

	.btn-secondary:hover {
		border-color: hsl(var(--primary) / 0.3);
		background: hsl(var(--primary) / 0.06);
		text-decoration: none;
	}

	/* ---- Main ---- */
	.home-main {
		flex: 1;
		max-width: 860px;
		width: 100%;
		margin: 0 auto;
		padding: 0 1.5rem 3rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		margin-bottom: 1rem;
		letter-spacing: -0.01em;
	}

	.section-title svg {
		opacity: 0.5;
	}

	/* ---- Share Grid ---- */
	.share-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.share-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-radius: 12px;
		border: 1px solid hsl(var(--border) / 0.35);
		background: hsl(var(--card) / 0.65);
		backdrop-filter: blur(8px);
		text-decoration: none;
		color: inherit;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.share-card:hover {
		background: hsl(var(--primary) / 0.05);
		border-color: hsl(var(--primary) / 0.25);
		box-shadow: 0 6px 24px hsl(var(--primary) / 0.07);
		transform: translateY(-2px);
		text-decoration: none;
	}

	.share-card-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 10px;
		background: hsl(var(--primary) / 0.08);
		color: hsl(var(--primary));
		transition: background-color 0.2s ease;
	}

	.share-card:hover .share-card-icon {
		background: hsl(var(--primary) / 0.14);
	}

	.share-card-body {
		flex: 1;
		min-width: 0;
	}

	.share-name {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.share-desc {
		margin: 0.2rem 0 0;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.share-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.35rem;
	}

	.share-badge {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 0.1rem 0.4rem;
		border-radius: 999px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.share-badge.public {
		background: hsl(142 71% 45% / 0.12);
		color: hsl(142 71% 45%);
	}

	.share-badge.protected {
		background: hsl(38 92% 50% / 0.12);
		color: hsl(38 92% 50%);
	}

	.share-date {
		font-size: 0.7rem;
		color: hsl(var(--muted-foreground) / 0.6);
	}

	.share-arrow {
		flex-shrink: 0;
		color: hsl(var(--muted-foreground) / 0.3);
		transition: color 0.2s ease, transform 0.2s ease;
	}

	.share-card:hover .share-arrow {
		color: hsl(var(--primary));
		transform: translateX(3px);
	}

	/* ---- Empty State ---- */
	.empty-state {
		text-align: center;
		padding: 4rem 1rem;
		color: hsl(var(--muted-foreground));
	}

	.empty-state h2 {
		margin: 1rem 0 0.5rem;
		font-size: 1.25rem;
		color: hsl(var(--foreground));
	}

	.empty-state p {
		max-width: 360px;
		margin: 0 auto;
		font-size: 0.9rem;
	}

	@media (max-width: 640px) {
		.home-header {
			padding: 2rem 1rem 1.5rem;
		}

		.header-title {
			font-size: 1.75rem;
		}

		.share-card {
			padding: 0.85rem 1rem;
		}

		.share-card-icon {
			width: 38px;
			height: 38px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.share-card, .btn {
			transition: none;
		}
		.share-card:hover {
			transform: none;
		}
	}
</style>
