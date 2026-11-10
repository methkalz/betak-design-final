/**
 * يمدّ app.json بقرارٍ واحد: كيف يُربط التحديث اللاسلكيّ بالنسخة المثبَّتة.
 *
 * - المعاينة (Expo Go وتطبيق preview): `sdkVersion` → `exposdk:58.0.0`، وهو
 *   الوحيد الذي يقبله Expo Go، فتبقى المعاينة على الآيفون كما هي.
 * - المتجر (APP_VARIANT=production): `fingerprint` → بصمة الجزء الأصليّ. تحديثٌ
 *   يحتاج حزمةً أصليّة جديدة لا يصل إلى نسخةٍ قديمة تفتقر إليها فتنهار؛ ينتظر
 *   نسخة المتجر الجديدة، ورسالة «يتوفر تحديث» تدلّ عليها.
 *
 * ⚠️ APP_VARIANT=production مطلوبٌ في **البناء والنشر معًا**: eas.json يضعه لبناء
 * production، و`bun run update:prod` يضعه للنشر. نشرٌ بدونه يحسب runtime المعاينة
 * فلا يصل إلى أيّ نسخة متجر.
 */
module.exports = ({ config }) => ({
  ...config,
  runtimeVersion:
    process.env.APP_VARIANT === 'production' ? { policy: 'fingerprint' } : config.runtimeVersion,
});
