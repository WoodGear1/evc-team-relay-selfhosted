<script lang="ts">
	import { page } from '$app/stores';

	const branding = $derived($page.data?.serverInfo?.branding);
	const instanceName = $derived(branding?.name || 'Relay');
	const subtitle = $derived(`${instanceName} web publishing`);
</script>

<svelte:head>
	<title>{instanceName}</title>
	<meta
		name="description"
		content={`${instanceName} web publishing portal`}
	/>
	<meta property="og:title" content={instanceName} />
	<meta property="og:description" content={`${instanceName} web publishing portal`} />
	<meta property="og:type" content="website" />
	{#if branding?.logo_url}
		<meta property="og:image" content={branding.logo_url} />
	{/if}
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={instanceName} />
	<meta name="twitter:description" content={`${instanceName} web publishing portal`} />
	{#if branding?.logo_url}
		<meta name="twitter:image" content={branding.logo_url} />
	{/if}
</svelte:head>

<div class="home-container">
	<div class="hero-section">
		<div class="hero-content">
			<div class="logo-container">
				{#if branding?.logo_url}
					<img src={branding.logo_url} alt={`${instanceName} logo`} class="logo" />
				{:else}
					<svg class="logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
						<path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				{/if}
			</div>
			<h1 class="instance-name">{instanceName}</h1>
			<p class="subtitle">{subtitle}</p>
			<p class="description">
				Open a published document or folder by its direct URL. Public pages open instantly,
				protected pages ask for a password, and member-only pages require sign-in.
			</p>
			<div class="info-grid">
				<div class="info-card">
					<h2>Public</h2>
					<p>Accessible to anyone with the link.</p>
				</div>
				<div class="info-card">
					<h2>Password Protected</h2>
					<p>Requires a password before content is shown.</p>
				</div>
				<div class="info-card">
					<h2>Members Only</h2>
					<p>Visible only to authenticated share members.</p>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.home-container {
		width: 100%;
		min-height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.hero-section {
		width: min(960px, 100%);
		padding: 2rem;
	}

	.hero-content {
		max-width: 820px;
		margin: 0 auto;
		text-align: center;
		padding: 3rem;
		border: 1px solid hsl(var(--border));
		border-radius: 1.5rem;
		background:
			radial-gradient(circle at top, hsl(var(--primary) / 0.12), transparent 40%),
			hsl(var(--card));
		box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
	}

	.logo-container {
		display: flex;
		justify-content: center;
		margin-bottom: 2rem;
	}

	.logo {
		width: 120px;
		height: 120px;
		color: var(--muted-foreground);
		object-fit: contain;
	}

	.instance-name {
		font-size: 3rem;
		font-weight: 700;
		color: var(--foreground);
		margin: 0;
		letter-spacing: -0.02em;
	}

	.subtitle {
		margin: 0.75rem 0 0;
		font-size: 1.1rem;
		color: hsl(var(--primary));
		font-weight: 600;
	}

	.description {
		max-width: 640px;
		margin: 1.5rem auto 0;
		color: hsl(var(--muted-foreground));
		font-size: 1rem;
	}

	.info-grid {
		margin-top: 2.25rem;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
	}

	.info-card {
		padding: 1rem 1.1rem;
		border-radius: 1rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--background) / 0.92);
		text-align: left;
	}

	.info-card h2 {
		font-size: 1rem;
		margin-bottom: 0.35rem;
	}

	.info-card p {
		margin: 0;
		color: hsl(var(--muted-foreground));
		font-size: 0.95rem;
	}

	@media (max-width: 768px) {
		.hero-content {
			padding: 2rem 1.25rem;
		}

		.logo {
			width: 80px;
			height: 80px;
		}

		.instance-name {
			font-size: 2rem;
		}

		.info-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hero-content {
			box-shadow: none;
		}
	}
</style>
