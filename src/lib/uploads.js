import 'server-only';

import { randomUUID } from 'node:crypto';

const IMAGE_TYPES = {
  'image/png': { extensions: ['.png'], maxBytes: 5 * 1024 * 1024 },
  'image/jpeg': { extensions: ['.jpg', '.jpeg'], maxBytes: 5 * 1024 * 1024 },
  'image/webp': { extensions: ['.webp'], maxBytes: 5 * 1024 * 1024 },
};

function getFileExtension(filename) {
  const name = String(filename || '').toLowerCase();
  return name.slice(name.lastIndexOf('.'));
}

function isImageSignature(type, bytes) {
  if (type === 'image/png') {
    return bytes.length >= 8
      && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (type === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === 'image/webp') {
    return bytes.length >= 12
      && bytes.toString('ascii', 0, 4) === 'RIFF'
      && bytes.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

async function readFile(file, maxBytes, expectedType) {
  if (!file || typeof file.arrayBuffer !== 'function' || !Number.isSafeInteger(file.size)) {
    throw new Error('Choose a file to upload.');
  }
  if (file.size < 1 || file.size > maxBytes) {
    throw new Error(`The file must be smaller than ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length !== file.size) throw new Error('The uploaded file could not be read.');

  if (expectedType === 'image') {
    const rule = IMAGE_TYPES[file.type];
    if (!rule || !rule.extensions.includes(getFileExtension(file.name)) || !isImageSignature(file.type, bytes)) {
      throw new Error('Upload a valid PNG, JPG, JPEG, or WebP image.');
    }
    return { bytes, contentType: file.type, attachmentType: 'image' };
  }

  const isZip = bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && [0x03, 0x05, 0x07].includes(bytes[2])
    && [0x04, 0x06, 0x08].includes(bytes[3]);
  if (getFileExtension(file.name) !== '.apk' || !isZip) {
    throw new Error('Upload a valid APK file.');
  }
  return {
    bytes,
    contentType: 'application/vnd.android.package-archive',
    attachmentType: 'apk',
  };
}

export async function readProfileImage(file) {
  return readFile(file, 5 * 1024 * 1024, 'image');
}

export async function readAppIcon(file) {
  return readFile(file, 5 * 1024 * 1024, 'image');
}

export async function readTicketAttachment(file) {
  if (file?.type?.startsWith('image/')) {
    return readFile(file, 10 * 1024 * 1024, 'image');
  }
  return readFile(file, 50 * 1024 * 1024, 'apk');
}

export function createStoragePath(ownerId, file) {
  const extension = getFileExtension(file?.name);
  return `${ownerId}/${randomUUID()}${extension}`;
}
