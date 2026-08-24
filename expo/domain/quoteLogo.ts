/**
 * علامة المحلّ - قضيبٌ وثلاث طيّات.
 *
 * **متجهيّة مضمَّنة لا صورة**: الوثيقة مكتفيةٌ بذاتها (تُطبع داخل إطارٍ أو
 * WebView بلا شبكة)، وصورةٌ نقطيّة base64 تُثقلها وتبهت عند الطباعة. الـSVG
 * يطبع حادًّا عند أيّ دقّة ويزن بضع مئات البايتات.
 *
 * والشكل ليس اختراعًا: هو **علامة التطبيق نفسها** في `app/index.tsx` - قضيبٌ
 * وثلاث لوحات - فتتّحد هويّة الشاشة والورقة لأوّل مرّة.
 *
 * `currentColor` لا لونٌ مثبَّت: العلامة ترث لون القالب، فتخدم الثمانية.
 */

/**
 * @param size ضلع المربّع بالبكسل
 * @param opacity شفافيّة العلامة كلّها (لاستعمالها فوق كتلةٍ لونية)
 */
export function quoteLogoSvg(size = 34, opacity = 1): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="opacity:${opacity}">
  <rect x="5" y="7" width="54" height="5.5" rx="2.75" fill="currentColor"/>
  <path d="M13 14.5h11.5v25.8c0 3.9-2.6 6.3-5.75 6.3S13 44.2 13 40.3z" fill="currentColor" opacity=".95"/>
  <path d="M26.25 14.5h11.5v31.4c0 3.9-2.6 6.3-5.75 6.3s-5.75-2.4-5.75-6.3z" fill="currentColor" opacity=".62"/>
  <path d="M39.5 14.5H51v25.8c0 3.9-2.6 6.3-5.75 6.3S39.5 44.2 39.5 40.3z" fill="currentColor" opacity=".95"/>
</svg>`;
}
