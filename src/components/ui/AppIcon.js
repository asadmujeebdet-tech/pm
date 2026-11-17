'use client';

import Image from 'next/image';
import { useState } from 'react';
import { getInitials } from '@/lib/format';

const sizes = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

function isImageSource(value) {
  if (typeof value !== 'string' || !value) return false;
  if (value.startsWith('/api/apps/')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export default function AppIcon({ name, src, size = 'md' }) {
  const validSource = isImageSource(src) ? src : null;
  const [failedSource, setFailedSource] = useState(null);
  const showImage = validSource && failedSource !== validSource;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--neutral)] font-semibold text-[var(--muted)] ${sizes[size] || sizes.md}`}
      aria-label={`${name || 'App'} icon`}
    >
      {getInitials(name)}
      {showImage && (
        <Image
          src={validSource}
          alt=""
          width={64}
          height={64}
          unoptimized
          onError={() => setFailedSource(validSource)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}
