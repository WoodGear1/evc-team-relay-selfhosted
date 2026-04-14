import { renderMarkdown } from './src/lib/markdown.js';

const markdown = `
\`\`\`javascript
console.log('hello');
\`\`\`
`;

async function main() {
    try {
        const result = await renderMarkdown(markdown);
        console.log(result);
    } catch (e) {
        console.error("Render failed:");
        console.error(e);
    }
}

main();