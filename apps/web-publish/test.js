import { createHighlighter } from 'shiki';

async function test() {
    console.log("Loading shiki...");
    const highlighterInstance = await createHighlighter({
        themes: ['github-light', 'vitesse-dark'],
        langs: ['javascript', 'typescript', 'html', 'css', 'json', 'bash', 'yaml', 'markdown', 'rust', 'python', 'go', 'cpp', 'c', 'java', 'sql', 'php', 'swift', 'ruby']
    });

    console.log("Loaded languages:", highlighterInstance.getLoadedLanguages());

    try {
        const highlightedHtml = highlighterInstance.codeToHtml("test code", {
            lang: 'text',
            themes: {
                light: 'github-light',
                dark: 'vitesse-dark'
            },
            defaultColor: false
        });
        console.log("Success:", highlightedHtml);
    } catch (e) {
        console.error("Error highlighting text:", e);
    }
}

test();