<script lang="ts">
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const branding = $derived($page.data?.serverInfo?.branding);

	let email = $state('');
	let password = $state('');
	let totpCode = $state('');
	let isSubmitting = $state(false);
	let formError = $state('');
	let infoMessage = $state('');
	let requiresTwoFactor = $state(false);

	const isPasswordLogin = $derived(Boolean(data.passwordLoginEnabled));
	const returnTo = $derived(data.returnTo || '/');

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!email.trim() || !password) {
			formError = 'Email and password are required.';
			return;
		}

		if (requiresTwoFactor && !totpCode.trim()) {
			formError = 'Two-factor code is required.';
			return;
		}

		isSubmitting = true;
		formError = '';
		infoMessage = '';

		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: email.trim(),
					password,
					totp_code: requiresTwoFactor ? totpCode.trim() : undefined,
					returnTo
				})
			});

			const result = await response
				.json()
				.catch(() => ({ message: 'Failed to sign in' }));

			if (!response.ok) {
				throw new Error(result.message || 'Failed to sign in');
			}

			if (result.requiresTwoFactor) {
				requiresTwoFactor = true;
				infoMessage = result.message || 'Two-factor authentication is required.';
				return;
			}

			window.location.assign(result.returnTo || returnTo);
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Failed to sign in';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Sign In - {branding?.name || 'Docs'}</title>
</svelte:head>

<div class="login-container">
	<div class="login-content">
		<div class="login-icon">🔐</div>

		<h1 class="login-title">Sign In</h1>

		{#if isPasswordLogin}
			<p class="login-description">
				Sign in with your account to open private or members-only documents.
			</p>

			{#if data.error}
				<div class="error-message">
					<p>{data.error}</p>
				</div>
			{/if}

			{#if infoMessage}
				<div class="info-message">
					<p>{infoMessage}</p>
				</div>
			{/if}

			<form class="login-form" onsubmit={handleSubmit}>
				<label class="field">
					<span>Email</span>
					<input
						type="email"
						bind:value={email}
						placeholder="you@example.com"
						autocomplete="username"
						disabled={isSubmitting || requiresTwoFactor}
					/>
				</label>

				<label class="field">
					<span>Password</span>
					<input
						type="password"
						bind:value={password}
						placeholder="Enter your password"
						autocomplete="current-password"
						disabled={isSubmitting || requiresTwoFactor}
					/>
				</label>

				{#if requiresTwoFactor}
					<label class="field">
						<span>Two-Factor Code</span>
						<input
							type="text"
							bind:value={totpCode}
							placeholder="123456"
							autocomplete="one-time-code"
							inputmode="numeric"
							disabled={isSubmitting}
						/>
					</label>
				{/if}

				{#if formError}
					<div class="error-message">
						<p>{formError}</p>
					</div>
				{/if}

				<button type="submit" class="btn btn-primary" disabled={isSubmitting}>
					{#if isSubmitting}
						Signing In...
					{:else if requiresTwoFactor}
						Verify Code
					{:else}
						Sign In
					{/if}
				</button>
			</form>
		{:else if data.error}
			<div class="error-message">
				<p>{data.error}</p>
			</div>

			<p class="login-hint">
				Please contact the system administrator to configure OAuth authentication,
				or ask the document owner to change visibility to "protected" (password-based).
			</p>
		{:else}
			<p class="login-description">Redirecting to sign in...</p>
			<div class="loading-spinner"></div>
		{/if}

		<div class="login-actions">
			<button onclick={() => window.history.back()} class="btn btn-secondary">Go Back</button>
			<a href="/" class="btn btn-secondary">Go Home</a>
		</div>
	</div>
</div>

<style>
	.login-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 70vh;
		padding: 2rem;
		text-align: center;
	}

	.login-content {
		max-width: 500px;
		width: 100%;
	}

	.login-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.login-title {
		font-size: 2rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0 0 1rem 0;
	}

	.login-description {
		font-size: 1.125rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.6;
		margin: 0 0 1rem 0;
	}

	.error-message,
	.info-message {
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.error-message {
		background-color: hsl(var(--destructive) / 0.12);
		color: hsl(var(--destructive));
	}

	.info-message {
		background-color: hsl(var(--primary) / 0.12);
		color: hsl(var(--primary));
	}

	.error-message p,
	.info-message p {
		margin: 0;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin: 0 0 2rem 0;
		text-align: left;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field span {
		font-size: 0.9375rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.field input {
		width: 100%;
		padding: 0.75rem 0.875rem;
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		font-size: 1rem;
		background-color: hsl(var(--background));
		color: hsl(var(--foreground));
	}

	.field input:focus {
		outline: 2px solid hsl(var(--ring) / 0.35);
		border-color: hsl(var(--primary));
	}

	.field input:disabled {
		background-color: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}

	.login-hint {
		font-size: 0.9375rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.6;
		margin: 0 0 2rem 0;
		padding: 1rem;
		background-color: hsl(var(--muted));
		border-radius: 8px;
	}

	.loading-spinner {
		width: 40px;
		height: 40px;
		border: 4px solid hsl(var(--border));
		border-top-color: hsl(var(--primary));
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 1rem auto 2rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.login-actions {
		display: flex;
		gap: 1rem;
		justify-content: center;
		flex-wrap: wrap;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 500;
		border-radius: 6px;
		text-decoration: none;
		cursor: pointer;
		transition: background-color 0.2s, transform 0.1s;
		border: none;
	}

	.btn:active {
		transform: scale(0.98);
	}

	.btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.btn-primary {
		background-color: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}

	.btn-primary:hover {
		filter: brightness(0.95);
	}

	.btn-secondary {
		background-color: hsl(var(--secondary));
		color: hsl(var(--secondary-foreground));
		border: 1px solid hsl(var(--border));
	}

	.btn-secondary:hover {
		background-color: hsl(var(--muted));
	}

	@media (max-width: 768px) {
		.login-icon {
			font-size: 3rem;
		}

		.login-title {
			font-size: 1.5rem;
		}

		.login-actions {
			flex-direction: column;
		}

		.btn {
			width: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.loading-spinner {
			animation: none;
		}

		.btn {
			transition: none;
		}

		.btn:active {
			transform: none;
		}
	}
</style>
