// Crypto helpers that work on old iOS (iPhone 6s = iOS 15.8 max) and on plain http
// (where window.crypto.subtle is unavailable): WebCrypto when present, otherwise the
// bundled pure-JS noble libraries. Both produce standard PBKDF2-SHA256 / AES-256-GCM,
// so backup files are interchangeable between the two paths.

import { sha256 as nobleSha256 } from '@noble/hashes/sha256';
import { pbkdf2 as noblePbkdf2 } from '@noble/hashes/pbkdf2';
import { gcm as nobleGcm } from '@noble/ciphers/aes';

function utf8Encode(s: string): Uint8Array<ArrayBuffer> {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const c2 = s.charCodeAt(++i);
      c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
  }
  return new Uint8Array(out);
}

function utf8Decode(b: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(b);
  let s = '';
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c < 0x80) s += String.fromCharCode(c);
    else if (c < 0xe0) s += String.fromCharCode(((c & 0x1f) << 6) | (b[++i] & 0x3f));
    else if (c < 0xf0) s += String.fromCharCode(((c & 0x0f) << 12) | ((b[++i] & 0x3f) << 6) | (b[++i] & 0x3f));
    else {
      const cp = ((c & 0x07) << 18) | ((b[++i] & 0x3f) << 12) | ((b[++i] & 0x3f) << 6) | (b[++i] & 0x3f);
      s += String.fromCodePoint(cp);
    }
  }
  return s;
}

const enc = { encode: utf8Encode };
const dec = { decode: utf8Decode };

export function subtleAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

export function hex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

export function unhex(h: string): Uint8Array {
  const b = new Uint8Array(h.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return b;
}

export function sha256HexNoble(data: Uint8Array): string {
  return hex(nobleSha256(data));
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  if (subtleAvailable()) {
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)));
  }
  return sha256HexNoble(bytes);
}

export async function hashPin(salt: string, pin: string): Promise<string> {
  return sha256Hex(`${salt}:${pin}`);
}

export const KDF_ITERATIONS = 210000;

export async function deriveKeyBytes(password: string, salt: Uint8Array): Promise<Uint8Array> {
  if (subtleAvailable()) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    return new Uint8Array(await crypto.subtle.exportKey('raw', key));
  }
  return noblePbkdf2(nobleSha256, enc.encode(password), salt, { c: KDF_ITERATIONS, dkLen: 32 });
}

export function deriveKeyBytesNoble(password: string, salt: Uint8Array): Uint8Array {
  return noblePbkdf2(nobleSha256, enc.encode(password), salt, { c: KDF_ITERATIONS, dkLen: 32 });
}

export async function aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  if (subtleAvailable()) {
    const k = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['encrypt']);
    return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, k, plaintext as BufferSource));
  }
  return nobleGcm(key, iv).encrypt(plaintext);
}

export async function aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, cipher: Uint8Array): Promise<Uint8Array> {
  if (subtleAvailable()) {
    const k = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, k, cipher as BufferSource));
  }
  return nobleGcm(key, iv).decrypt(cipher);
}

export function aesGcmEncryptNoble(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return nobleGcm(key, iv).encrypt(plaintext);
}

export function aesGcmDecryptNoble(key: Uint8Array, iv: Uint8Array, cipher: Uint8Array): Uint8Array {
  return nobleGcm(key, iv).decrypt(cipher);
}

export function utf8(s: string): Uint8Array {
  return enc.encode(s);
}

export function fromUtf8(b: Uint8Array): string {
  return dec.decode(b);
}
