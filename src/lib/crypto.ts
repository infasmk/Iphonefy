import CryptoJS from 'crypto-js';

export function toHttpsImage(image?: string): string {
  if (!image) {
    return '';
  }

  return image
    .trim()
    .replace(/^http:/i, 'https:')
    .replace(/50x50/g, '500x500')
    .replace(/150x150/g, '500x500');
}

export function decodeSaavnMedia(encrypted?: string): string {
  if (!encrypted) {
    return '';
  }

  try {
    const key = CryptoJS.enc.Utf8.parse('38346591');
    const ciphertext = CryptoJS.enc.Base64.parse(encrypted);
    const decrypted = CryptoJS.DES.decrypt({ ciphertext }, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    const decoded = CryptoJS.enc.Utf8.stringify(decrypted)
      .replace(/\.mp4.*$/i, '.mp4')
      .replace(/\.m4a.*$/i, '.m4a')
      .replace(/^http:/i, 'https:');
    return decoded;
  } catch {
    return '';
  }
}

export function formatDuration(seconds?: number): string {
  if (!seconds || Number.isNaN(seconds)) {
    return '--:--';
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function pickText(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return fallback;
}

export function storageGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function storageSet<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore persistence failures in private browsing mode.
  }
}