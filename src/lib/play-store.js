import 'server-only';

const PACKAGE_NAME_PATTERN = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export function parsePlayStoreUrl(value) {
  const input = String(value || '').trim();
  if (!input) return null;

  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Enter a valid Google Play Store URL.');
  }
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'play.google.com'
    || url.port
    || url.pathname !== '/store/apps/details'
  ) {
    throw new Error('Use a Google Play URL in the format https://play.google.com/store/apps/details?id=package.name.');
  }

  const packageName = url.searchParams.get('id') || '';
  if (!PACKAGE_NAME_PATTERN.test(packageName)) {
    throw new Error('The Google Play URL must include a valid application package name.');
  }

  const canonicalUrl = new URL('https://play.google.com/store/apps/details');
  canonicalUrl.searchParams.set('id', packageName);
  canonicalUrl.searchParams.set('hl', 'en');
  canonicalUrl.searchParams.set('gl', 'US');
  return { packageName, url: canonicalUrl.toString() };
}

export function sanitizePlayStoreUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (
      url.protocol === 'https:'
      && url.hostname === 'play.google.com'
      && !url.port
      && url.pathname === '/store/apps/details'
      && PACKAGE_NAME_PATTERN.test(url.searchParams.get('id') || '')
    ) {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function sanitizePlayStoreIconUrl(value) {
  try {
    const icon = new URL(String(value || ''));
    if (
      icon.protocol === 'https:'
      && (icon.hostname === 'googleusercontent.com' || icon.hostname.endsWith('.googleusercontent.com'))
    ) {
      return icon.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function sanitizeImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol === 'https:' && !url.username && !url.password) return url.toString();
  } catch {
    return null;
  }
  return null;
}

export function sanitizeAppUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (
      ['https:', 'http:'].includes(url.protocol)
      && !url.username
      && !url.password
    ) return url.toString();
  } catch {
    return null;
  }
  return null;
}

async function readLimitedHtml(response) {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_PAGE_BYTES || !response.body) {
    throw new Error('The Play Store response is unavailable or too large.');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PAGE_BYTES) {
      await reader.cancel();
      throw new Error('The Play Store response is too large.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function getAttribute(tag, attribute) {
  const expression = new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(expression);
  return (match?.[1] || match?.[2] || match?.[3] || '').replaceAll('&amp;', '&');
}

function extractIconUrl(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const property = getAttribute(tag, 'property').toLowerCase();
    if (property !== 'og:image') continue;
    const value = getAttribute(tag, 'content');
    const iconUrl = sanitizePlayStoreIconUrl(value);
    if (iconUrl) return iconUrl;
  }
  return null;
}

export async function fetchPlayStoreIcon(playStore) {
  if (!playStore) return { iconUrl: null, warning: '' };
  try {
    const response = await fetch(playStore.url, {
      headers: { accept: 'text/html' },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok || response.status >= 300) {
      return { iconUrl: null, warning: 'The app was saved, but its Play Store icon could not be fetched. You can upload one manually.' };
    }
    const html = await readLimitedHtml(response);
    const iconUrl = extractIconUrl(html);
    return {
      iconUrl,
      warning: iconUrl ? '' : 'The app was saved, but no Play Store icon was found. You can upload one manually.',
    };
  } catch (error) {
    console.error('Unable to fetch app metadata from Google Play:', error);
    return { iconUrl: null, warning: 'The app was saved, but its Play Store icon could not be fetched. You can upload one manually.' };
  }
}
