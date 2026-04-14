import { Marked } from 'marked';
import { createHighlighter } from 'shiki';

async function test() {
    try {
        const highlighter = await createHighlighter({
            themes: ['github-light', 'vitesse-dark'],
            langs: ['javascript', 'typescript'] // leaving text out to see if it throws
        });
        const html = highlighter.codeToHtml("hello", {
            lang: 'text',
            themes: { light: 'github-light', dark: 'vitesse-dark' }
        });
        console.log("Success:", html);
    } catch (e) {
        console.error("Error:", e);
    }
}
test();