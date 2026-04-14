import parseDiff from 'parse-diff';
const diff = `--- previous
+++ current
@@ -0,0 +1,11 @@
+# 📌 Заметки для репо-сервера Relay
+
+- **Что это?** Центральный узел для обмена файлами
+- **Фичи:**
+  - P2P (в планах)
+  - Хранение ключей
+  - Git Sync
+
+## План
+1. Настроить Docker
+2. Поднять SvelteKit`;
+console.log(JSON.stringify(parseDiff(diff), null, 2));
