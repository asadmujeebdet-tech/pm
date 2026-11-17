import 'server-only';

import sanitizeHtml from 'sanitize-html';

const SAFE_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function sanitizeDescription(value) {
  const html = String(value || '');
  if (html.length > 50000) throw new Error('The description must be 50,000 characters or fewer.');
  return sanitizeHtml(html, {
    allowedTags: [
      'a', 'blockquote', 'br', 'code', 'em', 'h1', 'h2', 'h3', 'li',
      'mark', 'ol', 'p', 'pre', 's', 'span', 'strong', 'u', 'ul',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      '*': ['style'],
    },
    allowedStyles: {
      '*': {
        color: [SAFE_COLOR],
        'background-color': [SAFE_COLOR],
        'text-align': [/^(left|center|right|justify)$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
      }),
    },
  });
}
