<script lang="ts">
	const CONTROL_PLANE_URL =
		typeof process !== 'undefined' && process.env.CONTROL_PLANE_URL
			? process.env.CONTROL_PLANE_URL
			: 'http://control-plane:8000';

	interface CommentItem {
		id: string;
		thread_id: string;
		body_markdown: string;
		created_by: string | null;
		created_by_email: string | null;
		created_at: string;
		edited_at: string | null;
	}

	interface CommentThread {
		id: string;
		share_id: string;
		target_id: string;
		anchor_type: string;
		anchor_id: string | null;
		status: string;
		created_by: string | null;
		created_by_email: string | null;
		resolved_by: string | null;
		resolved_at: string | null;
		created_at: string;
		items: CommentItem[];
	}

	let {
		linkId,
		targetId,
		authToken = undefined
	}: {
		linkId: string;
		targetId: string;
		authToken?: string;
	} = $props();

	let threads = $state<CommentThread[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let newCommentBody = $state('');
	let replyingTo = $state<string | null>(null);
	let replyBody = $state('');

	async function fetchComments() {
		if (!authToken) {
			threads = [];
			error = 'Sign in to view and post comments.';
			loading = false;
			return;
		}

		loading = true;
		error = null;
		try {
			const headers: Record<string, string> = {};
			if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
			const resp = await fetch(
				`/api/comments?link_id=${linkId}&include_resolved=true`,
				{ headers }
			);
			if (!resp.ok) throw new Error('Failed to load comments');
			threads = await resp.json();
		} catch (err: any) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	async function createThread() {
		if (!authToken) return;
		if (!newCommentBody.trim()) return;
		try {
			const headers: Record<string, string> = {
				'Content-Type': 'application/json'
			};
			if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
			const resp = await fetch('/api/comments', {
				method: 'POST',
				headers,
				body: JSON.stringify({
					link_id: linkId,
					target_id: targetId,
					body: newCommentBody
				})
			});
			if (!resp.ok) throw new Error('Failed to create comment');
			newCommentBody = '';
			await fetchComments();
		} catch (err: any) {
			error = err.message;
		}
	}

	async function reply(threadId: string) {
		if (!authToken) return;
		if (!replyBody.trim()) return;
		try {
			const headers: Record<string, string> = {
				'Content-Type': 'application/json'
			};
			if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
			const resp = await fetch(`/api/comments/${threadId}/reply`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ body: replyBody })
			});
			if (!resp.ok) throw new Error('Failed to reply');
			replyBody = '';
			replyingTo = null;
			await fetchComments();
		} catch (err: any) {
			error = err.message;
		}
	}

	async function toggleResolve(threadId: string, currentStatus: string) {
		if (!authToken) return;
		const action = currentStatus === 'open' ? 'resolve' : 'reopen';
		try {
			const headers: Record<string, string> = {};
			if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
			const resp = await fetch(`/api/comments/${threadId}/${action}`, {
				method: 'POST',
				headers
			});
			if (!resp.ok) throw new Error(`Failed to ${action} thread`);
			await fetchComments();
		} catch (err: any) {
			error = err.message;
		}
	}

	$effect(() => {
		fetchComments();
	});

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleString();
	}
</script>

<section class="comments-section">
	<h3>Comments</h3>

	{#if loading}
		<p class="loading">Loading comments...</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else}
		<!-- New comment form -->
		<div class="new-comment">
			<textarea
				bind:value={newCommentBody}
				placeholder="Write a comment..."
				rows="3"
			></textarea>
			<button onclick={createThread} disabled={!newCommentBody.trim()}>
				Post Comment
			</button>
		</div>

		{#if threads.length === 0}
			<p class="empty">No comments yet. Be the first to comment!</p>
		{:else}
			{#each threads as thread (thread.id)}
				<div class="thread" class:resolved={thread.status === 'resolved'}>
					<div class="thread-header">
						<span class="anchor">
							{thread.anchor_type}{thread.anchor_id ? ` #${thread.anchor_id}` : ''}
						</span>
						<span class="status" class:open={thread.status === 'open'}>
							{thread.status}
						</span>
					</div>

					{#each thread.items as item (item.id)}
						<div class="comment-item">
							<div class="meta">
								<strong>{item.created_by_email || 'Anonymous'}</strong>
								<span class="date">{formatDate(item.created_at)}</span>
							</div>
							<p class="body">{item.body_markdown}</p>
						</div>
					{/each}

					<div class="thread-actions">
						<button onclick={() => (replyingTo = replyingTo === thread.id ? null : thread.id)}>
							{replyingTo === thread.id ? 'Cancel' : 'Reply'}
						</button>
						<button onclick={() => toggleResolve(thread.id, thread.status)}>
							{thread.status === 'open' ? 'Resolve' : 'Reopen'}
						</button>
					</div>

					{#if replyingTo === thread.id}
						<div class="reply-form">
							<textarea
								bind:value={replyBody}
								placeholder="Write a reply..."
								rows="2"
							></textarea>
							<button onclick={() => reply(thread.id)} disabled={!replyBody.trim()}>
								Send Reply
							</button>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	{/if}
</section>

<style>
	.comments-section {
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid hsl(var(--border));
	}

	.thread {
		border-left: 3px solid hsl(var(--primary));
		padding-left: 1rem;
		margin-bottom: 1.5rem;
	}

	.thread.resolved {
		border-left-color: hsl(var(--success));
		opacity: 0.7;
	}

	.thread-header {
		display: flex;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: hsl(var(--muted-foreground));
		margin-bottom: 0.5rem;
	}

	.status.open {
		color: hsl(var(--primary));
	}

	.comment-item {
		margin-bottom: 0.75rem;
	}

	.meta {
		font-size: 0.85rem;
		margin-bottom: 0.25rem;
	}

	.date {
		color: hsl(var(--muted-foreground));
		margin-left: 0.5rem;
	}

	.body {
		margin: 0;
		white-space: pre-wrap;
	}

	textarea {
		width: 100%;
		padding: 0.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		resize: vertical;
		font-family: inherit;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
	}

	button {
		padding: 0.375rem 0.75rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		cursor: pointer;
		font-size: 0.85rem;
	}

	button:hover {
		background: hsl(var(--secondary));
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.thread-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.new-comment {
		margin-bottom: 1.5rem;
	}

	.new-comment button {
		margin-top: 0.5rem;
	}

	.reply-form {
		margin-top: 0.5rem;
	}

	.reply-form button {
		margin-top: 0.25rem;
	}

	.loading, .empty {
		color: hsl(var(--muted-foreground));
	}

	.error {
		color: hsl(var(--destructive));
	}
</style>
