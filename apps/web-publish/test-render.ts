import { renderMarkdown } from './src/lib/markdown.js';

const obj = {"name": "user-settings-subscriptions", "path": "Пока нет ддизайна/user-settings-subscriptions.md", "type": "doc", "content": "#уточнения-дизайна \n# Попап НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ > ПОДПИСКИ\n### Структура\n- Переключение между разделами:\n\t- [Интеграции](user-settings-profile-design-integrations.md) \n\t- [Подписки](user-settings-subscriptions.md)\n\t- [Профиль](user-settings-profile-design-integrations.md)\n\t- [Уведомление о рейде](../Пока нет ТЗ/user-settings-raid-allert.md)\n\t- [Приватность](user-settings-privacy.md)\n\t- Кнопка выйти из аккаунта - выходит из аккаунта\n- Контент:\n- # УТОЧНЕНИЕ ПО ДИЗАЙНУ\n\n- фыафыа\n- фыв\n> - [ ] фыаа\n\n`фыаафыафыа` [[фыва]]\n> [!info] фыаыа фыф ыа\n> фыаыафафыа фыафыа\n$$\nфы фыафыа 12ыафафпр\n$$\n\n<center>фыафыа</center>\n\n<font color=\"#494429\">фыаыфа</font>\n==фыаыфафыа==\n\n<mark style=\"background:#ff4d4f\">фыафафы</mark>\n#уточнения-дизайна \n# Попап НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ > ПОДПИСКИ\n### Структура\n- Переключение между разделами:\n\t- [Интеграции](user-settings-profile-design-integrations.md) \n\t- [Подписки](user-settings-subscriptions.md)\n\t- [Профиль](user-settings-profile-design-integrations.md)\n\t- [Уведомление о рейде](../Пока нет ТЗ/user-settings-raid-allert.md)\n\t- [Приватность](user-settings-privacy.md)\n\t- Кнопка выйти из аккаунта - выходит из аккаунта\n- Контент:\n- # УТОЧНЕНИЕ ПО ДИЗАЙНУ\n\n- фыафыа\n- фыв\n> - [ ] фыаа\n\n`фыаафыафыа` [[фыва]]\n> [!info] фыаыа\n> фыаыафафыа\n$$\nфыафафпр\n$$\n\n\t<center>фыаффыа ыаы ыа</center>\n\n<font color=\"#494429\">фыаыфа</font>\n==фыаыфафыа==я\n\n<mark style=\"background:#ff4d4f\">фыафафы</mark>\n\nasf<sub>asf<sup>asfasf</sup>asfasf</sub>\n\n\n```\nasfasfasf\n```\n\n\n`asfasf`\n\n```\n111\n111\n\ngas\n\ngas\n\nff\n\nasf\nas\n```\n\n\nфыафыафаы\n\n![](https://cp.obsidian.wgwg.ru/v1/web/shares/sajt-rustroom-2-0/assets?path=img%2FPasted-image-20260407062538.png)![](https://cp.obsidian.wgwg.ru/v1/web/shares/sajt-rustroom-2-0/assets?path=img%2FPasted-image-20260407082816.png)\n"};

async function main() {
    try {
        console.log("Rendering...");
        const result = await renderMarkdown(obj.content);
        import('fs').then(fs => fs.writeFileSync('output.html', result));
        console.log("Success! Length:", result.length);
    } catch (e) {
        console.error("Render failed:");
        console.error(e);
    }
}

main();