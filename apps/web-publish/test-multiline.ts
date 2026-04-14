import { getHighlighter } from 'shiki';

async function main() {
    const highlighter = await getHighlighter({
        themes: ['github-light', 'vitesse-dark'],
        langs: ['javascript']
    });

    const code = `function test() {\n  return 1;\n}`;
    const highlightedHtml = highlighter.codeToHtml(code, {
        lang: 'javascript',
        themes: {
            light: 'github-light',
            dark: 'vitesse-dark'
        },
        transformers: [
            {
                line(node, line) {
                    node.properties.class = (node.properties.class || '') + ' code-line';
                    node.children.unshift({
                        type: 'element',
                        tagName: 'span',
                        properties: { class: 'line-num' },
                        children: [{ type: 'text', value: String(line) }]
                    });
                }
            }
        ]
    });
    console.log(highlightedHtml);
}
main();