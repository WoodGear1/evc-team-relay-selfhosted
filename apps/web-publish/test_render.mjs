import { renderMarkdown } from './src/lib/markdown.js';
import fs from 'fs';

async function test() {
    try {
        const md = fs.readFileSync('doc_content.txt', 'utf8');
        const result = await renderMarkdown(md);
        console.log("Success! Length:", result.length);
    } catch (e) {
        console.error("FAILED TO RENDER:");
        console.error(e);
    }
}
test();