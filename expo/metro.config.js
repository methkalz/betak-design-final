/**
 * إعداد Metro - الافتراضيّ من Expo بلا إضافات.
 *
 * كان يلفّ الإعداد بـ`withRorkMetro` من `@rork-ai/toolkit-sdk` - بقيّةٌ من
 * السقالة الأولى. أُسقطت الحزمة لأن **لا سطرَ في التطبيق يستوردها**، وكانت
 * تجرّ معها `react-native-maps` و`@teovilla/react-native-web-maps`
 * و`expo-location`: ثلاث حزمٍ أصليّة تحتاج توافقًا مع كلّ ترقية منصّة،
 * وتضيف إذن موقعٍ إلى تطبيق محلّ ستائر.
 *
 * ★ ولم يكن أثرها في `metro.config.js` ظاهرًا لبحثٍ في مجلّدات المصدر -
 * إعدادُ البناء يعيش في الجذر. الدرس: حذفُ تبعيّةٍ يُفحص بالبناء لا بالنحو.
 */
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
