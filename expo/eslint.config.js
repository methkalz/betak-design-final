const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // tools/ صفحات ويب مستقلة تُرفع لموقع المالك كما هي - ليست كود التطبيق
    ignores: ["dist/*", "tools/*"],
  },
]);
