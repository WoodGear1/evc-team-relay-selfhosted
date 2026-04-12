/**
 * Markdown parsing and rendering utilities.
 *
 * Supports Obsidian-flavored markdown features:
 * - YAML frontmatter stripping
 * - Comments (%%...%%)
 * - Highlights (==text==)
 * - Wikilinks ([[Note]], [[Note|Display]])
 * - Image/media embeds (![[image.png]])
 * - Callouts (> [!type] Title)
 * - Math/LaTeX ($...$ and $$...$$)
 * - Mermaid diagrams (```mermaid)
 * - Footnotes ([^1] and ^[inline])
 * - Tags (#tag, #nested/tag)
 * - Task lists with custom checkboxes ([x], [/], [-], etc.)
 */

import { Marked, type Token, type Tokens } from 'marked';
import markedFootnote from 'marked-footnote';
import { createHighlighter, type Highlighter } from 'shiki';
import katex from 'katex';
import DOMPurify from 'isomorphic-dompurify';
import { processCustomBlocks } from './customBlocks';

// ---------------------------------------------------------------------------
// Shiki Highlighter instance
// ---------------------------------------------------------------------------
let highlighterInstance: Highlighter | null = null;

async function getHighlighterInstance() {
	if (!highlighterInstance) {
		highlighterInstance = await createHighlighter({
			themes: ['github-light', 'vitesse-dark'],
			langs: ['javascript', 'typescript', 'html', 'css', 'json', 'bash', 'yaml', 'markdown', 'rust', 'python', 'go', 'cpp', 'c', 'java', 'sql', 'php', 'swift', 'ruby']
		});
	}
	return highlighterInstance;
}

// ---------------------------------------------------------------------------
// HTML escaping utility (defense-in-depth before DOMPurify)
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Math placeholder system
// ---------------------------------------------------------------------------

/** Unique prefix that won't appear in normal content */
const MATH_PLACEHOLDER_PREFIX = '\x00MATH_';
const MATH_PLACEHOLDER_SUFFIX = '\x00';

/** Store for math expressions extracted during preprocessing */
let mathStore: Map<string, { expression: string; displayMode: boolean }> = new Map();
let mathCounter = 0;

function resetMathStore(): void {
	mathStore = new Map();
	mathCounter = 0;
}

function createMathPlaceholder(expression: string, displayMode: boolean): string {
	const id = `${MATH_PLACEHOLDER_PREFIX}${mathCounter++}${MATH_PLACEHOLDER_SUFFIX}`;
	mathStore.set(id, { expression, displayMode });
	return id;
}

// ---------------------------------------------------------------------------
// Preprocessing pipeline
// ---------------------------------------------------------------------------

/**
 * Strip Obsidian comments (%%...%%) from content.
 * Handles both inline and multiline comments.
 */
function stripComments(text: string): string {
	return text.replace(/%%[\s\S]*?%%/g, '');
}

/**
 * Strip YAML frontmatter (---\n...\n---) from start of document.
 */
function stripFrontmatter(text: string): string {
	return text.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

/**
 * Protect math expressions from marked parsing by replacing them with placeholders.
 * Must be called AFTER stripping comments and frontmatter but BEFORE marked.parse().
 *
 * Order: $$...$$ first (display), then $...$ (inline).
 * Skip anything inside code fences or inline code.
 */
function protectMath(text: string): string {
	// First, protect code blocks and inline code so we don't match $ inside them
	const codeBlocks: { placeholder: string; content: string }[] = [];
	let codeCounter = 0;

	// Protect fenced code blocks (```...```)
	let result = text.replace(/```[\s\S]*?```/g, (match) => {
		const placeholder = `\x00CODE_BLOCK_${codeCounter++}\x00`;
		codeBlocks.push({ placeholder, content: match });
		return placeholder;
	});

	// Protect inline code (`...`)
	result = result.replace(/`[^`\n]+`/g, (match) => {
		const placeholder = `\x00CODE_BLOCK_${codeCounter++}\x00`;
		codeBlocks.push({ placeholder, content: match });
		return placeholder;
	});

	// Replace display math ($$...$$) - can be multiline
	result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_match, expr: string) => {
		return createMathPlaceholder(expr.trim(), true);
	});

	// Replace inline math ($...$) - single line only, not empty
	// Negative lookbehind for \ to avoid matching \$
	// Must not start or end with space (Obsidian behavior)
	result = result.replace(/(?<![\\$])\$([^\s$](?:[^$]*[^\s$])?)\$(?!\d)/g, (_match, expr: string) => {
		return createMathPlaceholder(expr, false);
	});

	// Restore code blocks
	for (const { placeholder, content } of codeBlocks) {
		result = result.replace(placeholder, content);
	}

	return result;
}

/**
 * Full preprocessing pipeline.
 * Returns cleaned markdown ready for marked.parse().
 */
function encodeSpacesInLinks(text: string): string {
	return text.replace(
		/\[([^\]]+)\]\(([^)]*\s[^)]*)\)/g,
		(_match, label: string, url: string) => {
			const encoded = url.replace(/ /g, '%20');
			return `[${label}](${encoded})`;
		}
	);
}

function preprocessMarkdown(raw: string): string {
	let text = raw;
	text = stripFrontmatter(text);
	text = stripComments(text);
	text = encodeSpacesInLinks(text);
	text = protectMath(text);
	return text;
}

// ---------------------------------------------------------------------------
// Post-processing: restore math placeholders with KaTeX HTML
// ---------------------------------------------------------------------------

/**
 * Replace math placeholders with rendered KaTeX HTML.
 */
function restoreMath(html: string): string {
	for (const [placeholder, { expression, displayMode }] of mathStore.entries()) {
		try {
			const rendered = katex.renderToString(expression, {
				displayMode,
				throwOnError: false,
				output: 'htmlAndMathml',
				trust: false
			});

			if (displayMode) {
				html = html.replace(
					placeholder,
					`<div class="katex-display">${rendered}</div>`
				);
			} else {
				html = html.replace(placeholder, rendered);
			}
		} catch {
			// If KaTeX fails, show the raw expression
			const escaped = expression
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			const wrapper = displayMode
				? `<div class="katex-error katex-display">$$${escaped}$$</div>`
				: `<span class="katex-error">$${escaped}$</span>`;
			html = html.replace(placeholder, wrapper);
		}
	}
	return html;
}

// ---------------------------------------------------------------------------
// Marked extensions: Highlights
// ---------------------------------------------------------------------------

/**
 * Inline extension for ==highlighted text==.
 */
const highlightExtension = {
	name: 'highlight' as const,
	level: 'inline' as const,
	start(src: string) {
		return src.indexOf('==');
	},
	tokenizer(src: string) {
		const match = src.match(/^==([^=]+)==/);
		if (match) {
			return {
				type: 'highlight',
				raw: match[0],
				text: match[1]
			};
		}
		return undefined;
	},
	renderer(token: { text: string }) {
		return `<mark>${escapeHtml(token.text)}</mark>`;
	}
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _slugifySegment(s: string): string {
	return s.replace(/ /g, '-');
}

function _slugifyPath(p: string): string {
	return p.split('/').map(_slugifySegment).join('/');
}

const _linkSvg = '<svg class="wikilink-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

// ---------------------------------------------------------------------------
// Marked extensions: Wikilinks
// ---------------------------------------------------------------------------

/**
 * Inline extension for [[wikilinks]] and [[target|display]].
 * Renders as styled chips. Resolved links navigate; unresolved are inert.
 */
const wikilinkExtension = {
	name: 'wikilink' as const,
	level: 'inline' as const,
	start(src: string) {
		const idx = src.indexOf('[[');
		if (idx === -1) return -1;
		if (idx > 0 && src[idx - 1] === '!') {
			const rest = src.slice(idx + 2);
			const next = rest.indexOf('[[');
			if (next === -1) return -1;
			return idx + 2 + next;
		}
		return idx;
	},
	tokenizer(src: string) {
		const match = src.match(/^\[\[([^\]]+)\]\]/);
		if (match) {
			const content = match[1];
			let target: string;
			let display: string;

			if (content.includes('|')) {
				const parts = content.split('|');
				target = parts[0].trim();
				display = parts.slice(1).join('|').trim();
			} else {
				target = content.trim();
				display = target;
			}

			return {
				type: 'wikilink',
				raw: match[0],
				target,
				display
			};
		}
		return undefined;
	},
	renderer(token: { target: string; display: string }) {
		const { target, display } = token;

		if (target.startsWith('#')) {
			const slug = target
				.slice(1)
				.toLowerCase()
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '-');
			const text = display.startsWith('#') ? display.slice(1) : display;
			return `<a class="wikilink-chip wikilink-resolved" href="#${escapeHtml(slug)}">${_linkSvg}<span>${escapeHtml(text)}</span></a>`;
		}

		if (_renderContext.slug && _renderContext.folderItems) {
			const item = _renderContext.folderItems.find(
				(i) => i.path === target || i.path === `${target}.md` || i.name === target
			);
			if (item) {
				const href = `/${_renderContext.slug}/${_slugifyPath(item.path)}`;
				return `<a class="wikilink-chip wikilink-resolved" href="${escapeHtml(href)}">${_linkSvg}<span>${escapeHtml(display)}</span></a>`;
			}
		}

		return `<span class="wikilink-chip wikilink-unresolved">${_linkSvg}<span>${escapeHtml(display)}</span></span>`;
	}
};

// ---------------------------------------------------------------------------
// Marked extensions: Tags
// ---------------------------------------------------------------------------

/**
 * Inline extension for #tags including nested tags like #project/urgent.
 * Must NOT match:
 * - Inside code blocks or inline code (handled by marked's parsing order)
 * - URL anchors (e.g., https://example.com#anchor)
 * - Heading references inside wikilinks (e.g., [[#heading]])
 */
const _isLetter = (ch: string) => /[\p{L}]/u.test(ch);

const tagExtension = {
	name: 'obsidianTag' as const,
	level: 'inline' as const,
	start(src: string) {
		let idx = src.indexOf('#');
		while (idx !== -1) {
			if (idx > 0 && (src[idx - 1] === ':' || src[idx - 1] === '/')) {
				idx = src.indexOf('#', idx + 1);
				continue;
			}
			if (idx + 1 < src.length && _isLetter(src[idx + 1])) {
				return idx;
			}
			idx = src.indexOf('#', idx + 1);
		}
		return -1;
	},
	tokenizer(src: string) {
		const match = src.match(/^#([\p{L}][\p{L}\p{N}\/_-]*)/u);
		if (match) {
			return {
				type: 'obsidianTag',
				raw: match[0],
				tag: match[1]
			};
		}
		return undefined;
	},
	renderer(token: { tag: string }) {
		const safe = escapeHtml(token.tag);
		return `<a class="tag-chip" data-tag="${safe}" href="#"><span class="tag-chip-hash">#</span>${safe}</a>`;
	}
};

// ---------------------------------------------------------------------------
// Marked extensions: Embeds
// ---------------------------------------------------------------------------

/**
 * Inline extension for ![[embed]] syntax.
 */
const embedExtension = {
	name: 'obsidianEmbed' as const,
	level: 'inline' as const,
	start(src: string) {
		return src.indexOf('![[');
	},
	tokenizer(src: string) {
		const match = src.match(/^!\[\[([^\]]+)\]\]/);
		if (match) {
			const content = match[1];
			let target: string;
			let size: string | null = null;

			if (content.includes('|')) {
				const parts = content.split('|');
				target = parts[0].trim();
				size = parts.slice(1).join('|').trim();
			} else {
				target = content.trim();
			}

			return {
				type: 'obsidianEmbed',
				raw: match[0],
				target,
				size
			};
		}
		return undefined;
	},
	renderer(token: { target: string; size: string | null }) {
		const { target, size } = token;
		const safeTarget = escapeHtml(target);
		const safeSize = size ? escapeHtml(size) : null;
		const ext = target.split('.').pop()?.toLowerCase() || '';
		const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];
		const videoExts = ['mp4', 'webm', 'ogv', 'mov'];
		const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'm4a'];

		// Image embeds with asset proxy
		if (imageExts.includes(ext)) {
			if (_renderContext.slug) {
				const encodedTarget = encodeURIComponent(target).replace(/%2F/g, '/');
				const styleAttr = safeSize ? ` style="max-width: ${safeSize}px"` : '';
				return `<img class="obsidian-embed-image" src="/${_renderContext.slug}/_assets/${encodedTarget}" alt="${safeTarget}" loading="lazy"${styleAttr} />`;
			}
			const sizeInfo = safeSize ? ` (${safeSize}px)` : '';
			return `<div class="obsidian-embed obsidian-embed-image"><span class="obsidian-embed-icon">&#128444;</span> Image: <strong>${safeTarget}</strong>${sizeInfo}</div>`;
		}

		// Video/audio embeds (placeholder for now)
		if (videoExts.includes(ext)) {
			return `<div class="obsidian-embed obsidian-embed-video"><span class="obsidian-embed-icon">&#127909;</span> Video: <strong>${safeTarget}</strong></div>`;
		}

		if (audioExts.includes(ext)) {
			return `<div class="obsidian-embed obsidian-embed-audio"><span class="obsidian-embed-icon">&#127925;</span> Audio: <strong>${safeTarget}</strong></div>`;
		}

		// Note embeds - show enhanced placeholder if found in folder
		// TODO: Inline note rendering requires async pre-processing pass
		if (_renderContext.folderItems) {
			const noteItem = _renderContext.folderItems.find(
				item => item.path === target || item.path === `${target}.md`
			);

			if (noteItem) {
				const noteName = escapeHtml(noteItem.name || target);
				// Show styled placeholder for found notes
				return `<div class="obsidian-embed obsidian-embed-note obsidian-embed-note-found">
					<span class="obsidian-embed-icon">&#128196;</span>
					<span class="obsidian-embed-note-name">${noteName}</span>
					<span class="obsidian-embed-note-hint">(in this folder)</span>
				</div>`;
			}
		}

		// Note embed not found - placeholder
		return `<div class="obsidian-embed obsidian-embed-note"><span class="obsidian-embed-icon">&#128196;</span> Embedded note: <strong>${safeTarget}</strong></div>`;
	}
};

// ---------------------------------------------------------------------------
// Marked extensions: Callouts
// ---------------------------------------------------------------------------

// SVG icon helper — compact Lucide-style icons for callouts
const _svg = (d: string) =>
	`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const CALLOUT_ICONS: Record<string, string> = {
	pencil:   _svg('<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'),
	info:     _svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
	todo:     _svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>'),
	clipboard:_svg('<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'),
	flame:    _svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
	check:    _svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>'),
	help:     _svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
	alert:    _svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
	xCircle:  _svg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
	zap:      _svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
	bug:      _svg('<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>'),
	list:     _svg('<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>'),
	quote:    _svg('<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/>'),
	octagon:  _svg('<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
	lightbulb:_svg('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>'),
};

/** Callout type metadata: icon key and CSS color class suffix */
const CALLOUT_TYPES: Record<string, { icon: string; color: string }> = {
	note:      { icon: 'pencil',    color: 'blue' },
	info:      { icon: 'info',      color: 'blue' },
	todo:      { icon: 'todo',      color: 'blue' },
	abstract:  { icon: 'clipboard', color: 'teal' },
	summary:   { icon: 'clipboard', color: 'teal' },
	tldr:      { icon: 'clipboard', color: 'teal' },
	tip:       { icon: 'lightbulb', color: 'cyan' },
	hint:      { icon: 'lightbulb', color: 'cyan' },
	important: { icon: 'flame',     color: 'cyan' },
	success:   { icon: 'check',     color: 'green' },
	check:     { icon: 'check',     color: 'green' },
	done:      { icon: 'check',     color: 'green' },
	question:  { icon: 'help',      color: 'yellow' },
	help:      { icon: 'help',      color: 'yellow' },
	faq:       { icon: 'help',      color: 'yellow' },
	warning:   { icon: 'alert',     color: 'orange' },
	caution:   { icon: 'alert',     color: 'orange' },
	attention: { icon: 'alert',     color: 'orange' },
	failure:   { icon: 'xCircle',   color: 'red' },
	fail:      { icon: 'xCircle',   color: 'red' },
	missing:   { icon: 'xCircle',   color: 'red' },
	danger:    { icon: 'octagon',   color: 'red-dark' },
	error:     { icon: 'octagon',   color: 'red-dark' },
	bug:       { icon: 'bug',       color: 'red' },
	example:   { icon: 'list',      color: 'purple' },
	quote:     { icon: 'quote',     color: 'gray' },
	cite:      { icon: 'quote',     color: 'gray' },
};

/**
 * Walk tokens to detect callout blockquotes and annotate them.
 * A callout blockquote has its first text line matching [!type].
 */
function walkTokensForCallouts(token: Token): void {
	if (token.type !== 'blockquote') return;

	const bq = token as Tokens.Blockquote;
	if (!bq.tokens || bq.tokens.length === 0) return;

	// Get the raw text of the first paragraph
	const firstChild = bq.tokens[0];
	if (firstChild.type !== 'paragraph') return;

	const para = firstChild as Tokens.Paragraph;
	const rawText = para.raw || para.text || '';

	// Check for callout pattern: [!type] or [!type]+ or [!type]-
	const calloutMatch = rawText.match(
		/^\[!(\w+)\]([-+])?\s*(.*)/s
	);

	if (!calloutMatch) return;

	const calloutType = calloutMatch[1].toLowerCase();
	const foldChar = calloutMatch[2] || ''; // '+', '-', or ''
	const titleAndRest = calloutMatch[3] || '';

	// Extract title (first line after [!type]) and remaining content
	const titleLines = titleAndRest.split('\n');
	const title = titleLines[0].trim() || calloutType.charAt(0).toUpperCase() + calloutType.slice(1);

	(bq as unknown as Record<string, unknown>)._callout = {
		type: calloutType,
		title,
		foldable: foldChar !== '',
		defaultOpen: foldChar !== '-'
	};
	// We intentionally do NOT modify para.text/tokens here.
	// The blockquote renderer strips the header from the rendered HTML instead,
	// which avoids stale-token bugs caused by clearing para.tokens.
}

/**
 * Walk tokens to detect and enhance task list items with custom checkboxes.
 * Obsidian supports custom checkbox statuses beyond [ ] and [x].
 */
function walkTokensForTaskLists(token: Token): void {
	if (token.type !== 'list_item') return;

	const li = token as Tokens.ListItem;
	if (!li.task) return;

	// Get the raw text to detect custom checkbox status
	const rawText = li.raw || li.text || '';

	// Match custom checkbox patterns: [x], [/], [-], [>], etc.
	const customCheckMatch = rawText.match(/^\[(.)\]\s/);

	if (customCheckMatch) {
		const status = customCheckMatch[1];
		// Mark this list item with custom task status
		(li as unknown as Record<string, unknown>)._taskStatus = status;
	}
}

// ---------------------------------------------------------------------------
// Configure marked instance
// ---------------------------------------------------------------------------

const marked = new Marked(
	{ async: true } as any,
	markedFootnote()
);

// Add inline extensions
marked.use({
	extensions: [highlightExtension, wikilinkExtension, tagExtension, embedExtension]
});

// Add walkTokens for callout, task list detection, and async shiki highlighting
marked.use({
	async walkTokens(token: Token) {
		walkTokensForCallouts(token);
		walkTokensForTaskLists(token);

		if (token.type === 'code') {
			const codeToken = token as Tokens.Code;
			if (codeToken.lang === 'mermaid') {
				(codeToken as any)._highlighted = `<div class="mermaid">${codeToken.text}</div>\n`;
			} else {
				try {
					const requestedLang = (codeToken.lang || 'text').trim().toLowerCase();
					const highlighter = await getHighlighterInstance();
					
					const loadedLangs = highlighter.getLoadedLanguages();
					const language = loadedLangs.includes(requestedLang as any) ? requestedLang : 'text';
					
					const langDisplay = language.charAt(0).toUpperCase() + language.slice(1);
					const codeContent = codeToken.text;
					const lineCount = codeContent.replace(/\n$/, '').split('\n').length;
					const lineCountDisplay = `${lineCount} line${lineCount !== 1 ? 's' : ''}`;
					
					const highlightedHtml = highlighter.codeToHtml(codeContent, {
						lang: language,
						themes: {
							light: 'github-light',
							dark: 'vitesse-dark'
						},
						defaultColor: false,
						transformers: [
							{
								line(node, line) {
									node.properties.class = (node.properties.class || '') + ' code-line';
									const originalChildren = [...node.children];
									node.children = [
										{
											type: 'element',
											tagName: 'span',
											properties: { class: 'line-num', 'data-line': String(line) },
											children: []
										},
										{
											type: 'element',
											tagName: 'span',
											properties: { class: 'code-line-content' },
											children: originalChildren
										}
									];
								}
							}
						]
					});

					(codeToken as any)._highlighted = `<div class="code-block-container relative group my-6 rounded-xl bg-muted/15 border border-border/50 overflow-hidden shadow-sm">
						<div class="code-block-header flex items-center justify-between px-4 py-2 bg-muted/40 backdrop-blur-md border-b border-border/30">
							<span class="code-lang text-xs font-mono text-muted-foreground uppercase tracking-wider">${langDisplay}</span>
							<span class="code-line-count font-mono">${lineCountDisplay}</span>
							<button class="code-copy-btn opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0 text-muted-foreground hover:text-foreground hover:bg-background border border-transparent hover:border-border rounded-md p-1.5 shadow-sm" aria-label="Copy code" title="Copy code">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
							</button>
						</div>
						<div class="shiki-wrapper overflow-x-auto text-[0.85rem] leading-[1.6]">
							${highlightedHtml}
						</div>
					</div>\n`;
				} catch (e) {
					console.warn('Shiki highlighting failed:', e);
					// Fallback is handled by the code renderer
				}
			}
		}
	}
});

// Custom renderer for callouts, mermaid, code blocks, and task lists
marked.use({
	renderer: {
		blockquote(this: unknown, token: Tokens.Blockquote) {
			const callout = (token as unknown as Record<string, unknown>)._callout as
				| { type: string; title: string; foldable: boolean; defaultOpen: boolean }
				| undefined;

			const parse = (tokens: Token[]) =>
				this && typeof (this as { parser?: { parse: (tokens: Token[]) => string } }).parser?.parse === 'function'
					? (this as { parser: { parse: (tokens: Token[]) => string } }).parser.parse(tokens)
					: '';

			if (!callout) {
				return `<blockquote>\n${parse(token.tokens)}</blockquote>\n`;
			}

			const meta = CALLOUT_TYPES[callout.type] || CALLOUT_TYPES['note'];
			const colorClass = `callout-${meta.color}`;
			const typeClass = `callout-${callout.type}`;
			const iconSvg = CALLOUT_ICONS[meta.icon] || CALLOUT_ICONS['info'];

			// Render all child tokens (includes the callout header text)
			let contentHtml = parse(token.tokens);

			// Strip the [!type] header from the first <p> in the rendered HTML
			contentHtml = contentHtml.replace(
				/^(\s*<p>)\[!\w+\][-+]?\s*[^\n<]*/,
				'$1'
			);
			// Clean empty paragraphs left after stripping
			contentHtml = contentHtml.replace(/<p>\s*<\/p>/g, '').trim();

			const titleHtml = `<div class="callout-title"><span class="callout-icon">${iconSvg}</span><span class="callout-title-text">${escapeHtml(callout.title)}</span>${callout.foldable ? '<span class="callout-fold-icon"></span>' : ''}</div>`;
			const contentWrapper = contentHtml
				? `<div class="callout-content">${contentHtml}</div>`
				: '';

			if (callout.foldable) {
				const openAttr = callout.defaultOpen ? ' open' : '';
				return `<details class="callout ${colorClass} ${typeClass}"${openAttr}><summary class="callout-header">${titleHtml}</summary>${contentWrapper}</details>\n`;
			}

			return `<div class="callout ${colorClass} ${typeClass}"><div class="callout-header">${titleHtml}</div>${contentWrapper}</div>\n`;
		},

		code(token: Tokens.Code): string {
			if ((token as any)._highlighted) {
				return (token as any)._highlighted;
			}
			return `<pre><code>${escapeHtml(token.text)}</code></pre>`;
		},

		listitem(this: unknown, token: Tokens.ListItem) {
			const taskStatus = (token as unknown as Record<string, unknown>)._taskStatus as string | undefined;

			// Render child tokens
			const body = this && typeof (this as { parser?: { parse: (tokens: Token[]) => string } }).parser?.parse === 'function'
				? (this as { parser: { parse: (tokens: Token[]) => string } }).parser.parse(token.tokens)
				: token.text || '';

			if (token.task) {
				// Task list item - replace default checkbox with custom one
				const checked = token.checked ? 'checked' : '';
				const status = taskStatus || (token.checked ? 'x' : ' ');

				// Remove the default checkbox if present in body
				const cleanBody = body.replace(/^<input[^>]*>\s*/, '');

				const safeStatus = /^[a-zA-Z0-9 \/?!*<>ilbS"\-x]$/.test(status) ? status.replace(/"/g, '&quot;') : ' ';
			return `<li class="task-list-item"><input type="checkbox" disabled ${checked} data-task="${safeStatus}"> ${cleanBody}</li>\n`;
			}

			// Regular list item
			return `<li>${body}</li>\n`;
		},

		link(token: Tokens.Link) {
			const href = token.href || '';
			const richText = token.text || href;
			const plainText = richText.replace(/<[^>]*>/g, '');

			// Internal document link (.md)
			if (href.endsWith('.md') || href.match(/\.md#/)) {
				const docSvg = '<svg class="chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

				if (_renderContext.slug && _renderContext.folderItems) {
					const decoded = decodeURIComponent(href);
					const cleanHref = decoded.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
					const baseName = cleanHref.split('/').pop() || cleanHref;
					const item = _renderContext.folderItems.find(
						(i) =>
							i.path === cleanHref ||
							i.path.endsWith(cleanHref) ||
							i.path === baseName ||
							i.path.endsWith('/' + baseName)
					);
					if (item) {
						const resolved = `/${_renderContext.slug}/${_slugifyPath(item.path)}`;
						return `<a class="doc-link-chip" href="${escapeHtml(resolved)}">${docSvg}<span>${richText}</span></a>`;
					}
				}

				return `<span class="doc-link-chip doc-link-unresolved">${docSvg}<span>${richText}</span></span>`;
			}

			// External URL
			if (href.startsWith('http://') || href.startsWith('https://')) {
				let domain = '';
				try { domain = new URL(href).hostname; } catch { /* ignore */ }
				const favicon = domain ? `<img class="ext-link-favicon" src="https://www.google.com/s2/favicons?sz=16&domain=${escapeHtml(domain)}" alt="" width="14" height="14" loading="lazy" />` : '';
				const extSvg = '<svg class="ext-link-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>';
				return `<a class="ext-link-chip" href="${escapeHtml(href)}" target="_blank" rel="noopener">${favicon}<span>${richText}</span>${extSvg}</a>`;
			}

			// Anchor / other
			return `<a href="${escapeHtml(href)}">${richText}</a>`;
		}
	}
});

// Configure marked options for GFM support
marked.setOptions({
	gfm: true,
	breaks: false,
	pedantic: false
});

// ---------------------------------------------------------------------------
// DOMPurify configuration
// ---------------------------------------------------------------------------

const SANITIZE_CONFIG = {
	ALLOWED_TAGS: [
		// Standard HTML
		'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
		'p', 'a', 'ul', 'ol', 'li',
		'blockquote', 'code', 'pre',
		'strong', 'em', 'del', 'u', 's', 'small', 'big', 'abbr', 'kbd',
		'table', 'thead', 'tbody', 'tr', 'th', 'td',
		'br', 'hr', 'img', 'span', 'div',
		// Obsidian HTML passthrough
		'center', 'font',
		// Highlights
		'mark',
		// Callouts (foldable)
		'details', 'summary',
		// Footnotes
		'section', 'sup', 'sub',
		// Task lists and code blocks
		'input', 'button',
		// KaTeX math elements
		'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'ms',
		'msup', 'msub', 'mfrac', 'mover', 'munder', 'munderover',
		'mtable', 'mtr', 'mtd', 'mtext', 'mspace', 'mpadded',
		'menclose', 'mglyph', 'msqrt', 'mroot', 'mstyle',
		'annotation', 'annotation-xml',
		// SVG (for mermaid and KaTeX)
		'svg', 'g', 'path', 'line', 'rect', 'circle', 'ellipse',
		'polygon', 'polyline', 'text', 'tspan',
		'defs', 'clipPath', 'use', 'symbol', 'marker',
		'foreignObject', 'image'
	],
	ALLOWED_ATTR: [
		'href', 'title', 'src', 'alt', 'class', 'id',
		'target', 'rel', 'loading',
		// Obsidian HTML passthrough
		'color', 'face', 'size', 'align', 'bgcolor',
		// Callouts
		'open',
		// Task lists and code blocks
		'type', 'disabled', 'checked',
		// KaTeX & SVG
		'style', 'aria-hidden', 'role',
		'viewBox', 'xmlns', 'xmlns:xlink',
		'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
		'width', 'height', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry',
		'transform', 'opacity', 'clip-path', 'clip-rule', 'fill-rule',
		'font-size', 'font-family', 'text-anchor', 'dominant-baseline',
		'dx', 'dy', 'x1', 'y1', 'x2', 'y2',
		'points', 'marker-end', 'marker-start',
		'xlink:href',
		// Data attributes for mermaid, task lists, code blocks
		'data-*'
	],
	ALLOW_DATA_ATTR: true,
	// Allow KaTeX style attributes but limit to safe properties
	FORBID_TAGS: [] as string[],
	FORBID_ATTR: [] as string[]
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Context for rendering markdown.
 * Used to resolve embeds and links.
 */
export interface RenderContext {
	/** Web share slug for asset URLs */
	slug?: string;
	/** Folder items for resolving note embeds */
	folderItems?: Array<{ path: string; name: string; type: string; content?: string }>;
}

/** Module-level storage for render context (accessed by embed extension renderer) */
let _renderContext: RenderContext = {};

/**
 * Parse and render markdown to HTML.
 * Supports Obsidian-flavored markdown features.
 * Sanitizes HTML output to prevent XSS.
 */
export async function renderMarkdown(markdown: string, context?: RenderContext): Promise<string> {
	// Reset math store for this render
	resetMathStore();

	// Store context for embed extension renderer
	_renderContext = context || {};

	// Step 1: Preprocess (strip frontmatter, comments, protect math)
	const preprocessed = preprocessMarkdown(markdown);

	// Step 2: Parse with marked (extensions handle highlights, wikilinks, callouts, footnotes, mermaid)
	const rawHtml = await marked.parse(preprocessed) as string;

	// Step 3: Restore math placeholders with KaTeX-rendered HTML
	const withMath = restoreMath(rawHtml);

	// Step 4: Expand whitelisted custom blocks before final sanitization.
	const withCustomBlocks = processCustomBlocks(withMath);

	// Step 5: Sanitize
	const purify = DOMPurify.sanitize ? DOMPurify : (DOMPurify as any).default || DOMPurify;
	const sanitizedHtml = purify.sanitize(withCustomBlocks, SANITIZE_CONFIG);

	// Clear context after rendering
	_renderContext = {};

	return sanitizedHtml;
}

/**
 * Extract title from markdown (first h1 heading, or YAML title, or filename).
 * Handles frontmatter stripping.
 */
export function extractTitle(markdown: string, fallback: string = 'Untitled'): string {
	// Try to extract title from YAML frontmatter first
	const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
	if (fmMatch) {
		const titleMatch = fmMatch[1].match(/^title:\s*(.+)$/m);
		if (titleMatch) {
			// Remove quotes if present
			return titleMatch[1].trim().replace(/^["']|["']$/g, '');
		}
	}

	// Strip frontmatter before looking for h1
	const stripped = stripFrontmatter(markdown);

	// Look for first h1 heading
	const h1Match = stripped.match(/^#\s+(.+)$/m);
	if (h1Match) {
		return h1Match[1].trim();
	}

	// Fallback to filename or default
	return fallback;
}

/**
 * Extract description from markdown for SEO meta tags.
 * Priority: frontmatter description > first paragraph text (up to 160 chars).
 */
export function extractDescription(markdown: string, fallback: string = ''): string {
	// Try frontmatter description first
	const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
	if (fmMatch) {
		const descMatch = fmMatch[1].match(/^description:\s*(.+)$/m);
		if (descMatch) {
			return descMatch[1].trim().replace(/^["']|["']$/g, '');
		}
	}

	// Strip frontmatter and find first paragraph of plain text
	const stripped = stripFrontmatter(markdown);
	// Remove headings, code blocks, images, links syntax, HTML tags
	const lines = stripped.split('\n');
	const textLines: string[] = [];
	let inCodeBlock = false;

	for (const line of lines) {
		if (line.startsWith('```')) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock) continue;
		if (line.startsWith('#')) continue;
		if (line.startsWith('![[')) continue;
		if (line.startsWith('![')) continue;
		if (line.startsWith('---')) continue;
		if (line.startsWith('> [!')) continue; // callout headers
		const trimmed = line.trim();
		if (trimmed.length === 0) {
			if (textLines.length > 0) break; // stop at first blank line after content
			continue;
		}
		// Clean markdown syntax from text
		const cleaned = trimmed
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
			.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1') // [[link|text]] → link
			.replace(/[*_~`]+/g, '') // bold, italic, strikethrough, code
			.replace(/==([^=]+)==/g, '$1') // highlights
			.replace(/<[^>]+>/g, ''); // HTML tags
		textLines.push(cleaned);
	}

	const description = textLines.join(' ').trim();
	if (description.length > 160) {
		return description.substring(0, 157) + '...';
	}
	return description || fallback;
}

/**
 * Estimate reading time in minutes.
 * Strips frontmatter and comments before counting.
 */
export function estimateReadingTime(markdown: string): number {
	const wordsPerMinute = 200;
	let text = stripFrontmatter(markdown);
	text = stripComments(text);
	const words = text.split(/\s+/).filter((w) => w.length > 0).length;
	return Math.ceil(words / wordsPerMinute);
}
