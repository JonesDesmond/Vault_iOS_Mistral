// Backup / restore. JSON export of all tables (photos/PDFs as data URLs), optionally
// encrypted with a password using AES-256-GCM (PBKDF2 key derivation, WebCrypto only).

import { db } from '../db';
import type { VaultItem, PaymentMethod, Settings, InboxFile } from '../types';

const MAGIC = 'RVLT1';

async function blobToDataURL(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

async function dataURLToBlob(data: string): Promise<Blob> {
  const res = await fetch(data);
  return res.blob();
}

async function bufToB64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function b64ToBuf(b64: string): Promise<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(password: string, salt: BufferSource): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function serialize(): Promise<string> {
  const [items, paymentMethods, settings, inbox] = await Promise.all([
    db.items.toArray(), db.paymentMethods.toArray(), db.settings.toArray(), db.inbox.toArray()
  ]);
  const convAttachments = async (its: VaultItem[]) => Promise.all(its.map(async it => ({
    ...it,
    attachments: await Promise.all(it.attachments.map(async a => ({ ...a, blob: await blobToDataURL(a.blob), thumb: a.thumb ? await blobToDataURL(a.thumb) : undefined })))
  })));
  const convInbox = async (fs: InboxFile[]) => Promise.all(fs.map(async f => ({ ...f, blob: await blobToDataURL(f.blob) })));
  const payload = {
    app: 'receipt-vault',
    version: 1,
    exportedAt: new Date().toISOString(),
    items: await convAttachments(items),
    paymentMethods,
    settings,
    inbox: await convInbox(inbox)
  };
  return JSON.stringify(payload);
}

async function deserialize(json: string): Promise<void> {
  const payload = JSON.parse(json);
  if (payload.app !== 'receipt-vault') throw new Error('Not a Receipt Vault backup file');
  const convAttachments = async (its: VaultItem[]) => Promise.all(its.map(async it => ({
    ...it,
    attachments: await Promise.all((it.attachments ?? []).map(async (a: any) => ({ ...a, blob: await dataURLToBlob(a.blob), thumb: a.thumb ? await dataURLToBlob(a.thumb) : undefined })))
  })));
  const convInbox = async (fs: InboxFile[]) => Promise.all((fs ?? []).map(async (f: any) => ({ ...f, blob: await dataURLToBlob(f.blob) })));
  await db.transaction('rw', db.items, db.paymentMethods, db.settings, db.inbox, async () => {
    await db.items.clear();
    await db.paymentMethods.clear();
    await db.settings.clear();
    await db.inbox.clear();
    await db.items.bulkPut(await convAttachments(payload.items ?? []));
    await db.paymentMethods.bulkPut(payload.paymentMethods ?? []);
    await db.settings.bulkPut(payload.settings ?? []);
    await db.inbox.bulkPut(await convInbox(payload.inbox ?? []));
  });
}

/** Plain JSON backup. */
export async function exportBackupPlain(): Promise<Blob> {
  return new Blob([await serialize()], { type: 'application/json' });
}

/** Password-encrypted backup (AES-256-GCM). */
export async function exportBackupEncrypted(password: string): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = new TextEncoder().encode(await serialize());
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const envelope = JSON.stringify({
    magic: MAGIC,
    kdf: 'PBKDF2-SHA256-210000',
    cipher: 'AES-256-GCM',
    salt: await bufToB64(salt.buffer),
    iv: await bufToB64(iv.buffer),
    data: await bufToB64(cipher)
  });
  return new Blob([envelope], { type: 'application/json' });
}

export async function importBackup(file: Blob, password?: string): Promise<void> {
  const text = await file.text();
  let json: string;
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    const env = JSON.parse(trimmed);
    if (env.magic !== MAGIC) throw new Error('Unknown encrypted backup format');
    if (!password) throw new Error('This backup is encrypted — enter the password');
    const key = await deriveKey(password, new Uint8Array(await b64ToBuf(env.salt)));
    const cipher = await b64ToBuf(env.data);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(await b64ToBuf(env.iv)) }, key, cipher);
    json = new TextDecoder().decode(plain);
  } else {
    if (password) throw new Error('This backup is not encrypted');
    json = trimmed;
  }
  await deserialize(json);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
