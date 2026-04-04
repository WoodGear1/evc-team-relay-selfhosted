/**
 * Safe custom block renderers for web publishing.
 *
 * Only whitelisted block types are rendered. All content is sanitized
 * to prevent XSS. No arbitrary JS or raw HTML injection.
 */

export interface CustomBlockConfig {
	type: string;
	render: (content: string, attrs: Record<string, string>) => string;
}

let customBlockCounter = 0;

const SAFE_TEXT = (text: string): string =>
	text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

const decodeHtmlEntities = (text: string): string =>
	text
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');

/**
 * Whitelist of supported custom block types.
 */
export const CUSTOM_BLOCKS: Record<string, CustomBlockConfig> = {
	card: {
		type: 'card',
		render: (content, attrs) => {
			const title = attrs.title ? `<div class="custom-card-title">${SAFE_TEXT(attrs.title)}</div>` : '';
			return `<div class="custom-card">${title}<div class="custom-card-body">${SAFE_TEXT(content)}</div></div>`;
		}
	},

	callout: {
		type: 'callout',
		render: (content, attrs) => {
			const kind = attrs.kind || 'info';
			const safeKind = ['info', 'warning', 'error', 'success', 'note', 'tip'].includes(kind) ? kind : 'info';
			const title = attrs.title ? `<div class="callout-title">${SAFE_TEXT(attrs.title)}</div>` : '';
			return `<div class="callout callout-${safeKind}">${title}<div class="callout-body">${SAFE_TEXT(content)}</div></div>`;
		}
	},

	badge: {
		type: 'badge',
		render: (content, attrs) => {
			const color = attrs.color || 'default';
			const safeColor = ['default', 'blue', 'green', 'red', 'yellow', 'purple'].includes(color)
				? color
				: 'default';
			return `<span class="badge badge-${safeColor}">${SAFE_TEXT(content)}</span>`;
		}
	},

	tabs: {
		type: 'tabs',
		render: (content, attrs) => {
			const tabsId = `custom-tabs-${customBlockCounter++}`;
			const tabLabels = (attrs.labels || '').split(',').map((l) => l.trim()).filter(Boolean);
			const tabContents = content.split('---tab---').map((c) => c.trim());

			if (tabLabels.length === 0) return `<div class="custom-tabs-error">No tab labels provided</div>`;

			const inputs = tabLabels
				.map(
					(_, i) =>
						`<input type="radio" name="${tabsId}" id="${tabsId}-${i}" class="custom-tabs-input" ${i === 0 ? 'checked' : ''}>`
				)
				.join('');

			const controls = tabLabels
				.map(
					(label, i) =>
						`<label class="tab-btn" for="${tabsId}-${i}">${SAFE_TEXT(label)}</label>`
				)
				.join('');

			const panels = tabLabels
				.map(
					(_, i) =>
						`<div class="tab-panel tab-panel-${i}">${SAFE_TEXT(tabContents[i] || '')}</div>`
				)
				.join('');

			return `<div class="custom-tabs" data-tabs-id="${tabsId}">${inputs}<div class="tab-headers">${controls}</div><div class="tab-panels">${panels}</div></div>`;
		}
	}
};

/**
 * Theme presets for published pages.
 */
export const THEME_PRESETS: Record<string, Record<string, string>> = {
	default: {
		'--page-max-width': '800px',
		'--page-font-family': 'system-ui, -apple-system, sans-serif',
		'--page-bg': '#ffffff',
		'--page-text': '#1e293b',
		'--page-accent': '#3b82f6'
	},
	minimal: {
		'--page-max-width': '680px',
		'--page-font-family': 'Georgia, serif',
		'--page-bg': '#fafaf9',
		'--page-text': '#292524',
		'--page-accent': '#78716c'
	},
	dark: {
		'--page-max-width': '800px',
		'--page-font-family': 'system-ui, -apple-system, sans-serif',
		'--page-bg': '#0f172a',
		'--page-text': '#e2e8f0',
		'--page-accent': '#60a5fa'
	},
	wide: {
		'--page-max-width': '1200px',
		'--page-font-family': 'system-ui, -apple-system, sans-serif',
		'--page-bg': '#ffffff',
		'--page-text': '#1e293b',
		'--page-accent': '#8b5cf6'
	}
};

/**
 * Process markdown content and replace whitelisted custom blocks.
 * Blocks use the format: ```custom-type attrs\ncontent\n```
 */
export function processCustomBlocks(html: string): string {
	return html.replace(
		/<pre><code class="[^"]*\blanguage-custom-(\w+)\b[^"]*">([\s\S]*?)<\/code><\/pre>/g,
		(_, blockType, rawContent) => {
			const config = CUSTOM_BLOCKS[blockType];
			const decodedContent = decodeHtmlEntities(rawContent);
			if (!config) return `<pre><code>${SAFE_TEXT(decodedContent)}</code></pre>`;

			const lines = decodedContent.split('\n');
			const attrLine = lines[0] || '';
			const content = lines.slice(1).join('\n').trim();

			const attrs: Record<string, string> = {};
			attrLine.replace(/(\w+)="([^"]*)"/g, (__, key, val) => {
				attrs[key] = val;
				return '';
			});

			return config.render(content, attrs);
		}
	);
}

/**
 * Apply theme preset CSS variables to a container element.
 */
export function applyThemePreset(preset: string): string {
	const vars = THEME_PRESETS[preset] || THEME_PRESETS['default'];
	return Object.entries(vars)
		.map(([key, val]) => `${key}: ${val}`)
		.join('; ');
}
