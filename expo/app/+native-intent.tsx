/**
 * Deep-link mapping for baytakdesign:// links documented in the mobile guide:
 *   baytakdesign://projects/{id}
 *   baytakdesign://visits/{id}
 *   baytakdesign://discount-requests/{id}
 *   baytakdesign://quotations/{id}
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const clean = path.replace(/^.*?:\/\//, '/').replace(/^\/+/, '/');
    const [, segment, id] = clean.split('/');
    if (segment === 'projects' && id) return `/project/${id}`;
    if (segment === 'visits' && id) return `/visit/${id}`;
    if (segment === 'quotations' && id) return `/quotation/${id}`;
    if (segment === 'discount-requests') return '/discounts';
    return path.startsWith('/') ? path : '/';
  } catch (e) {
    console.log('[deep-link] failed to resolve', e);
    return '/';
  }
}
