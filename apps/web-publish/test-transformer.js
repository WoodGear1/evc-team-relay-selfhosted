import { createHighlighter } from 'shiki';

async function test() {
    const highlighter = await createHighlighter({
        themes: ['github-light', 'vitesse-dark'],
        langs: ['javascript']
    });

    const highlightedHtml = highlighter.codeToHtml("console.log('hi');\nconsole.log('there');", {
        lang: 'javascript',
        themes: {
            light: 'github-light',
            dark: 'vitesse-dark'
        },
        defaultColor: false,
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
test();