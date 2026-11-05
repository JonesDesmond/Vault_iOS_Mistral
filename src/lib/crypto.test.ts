import { describe, it, expect } from 'vitest';
import {
  sha256Hex, sha256HexNoble, deriveKeyBytes, deriveKeyBytesNoble,
  aesGcmEncrypt, aesGcmDecrypt, aesGcmEncryptNoble, aesGcmDecryptNoble,
  utf8, fromUtf8, hex, unhex, subtleAvailable
} from './crypto';
import { uid, isIOS } from './compat';

describe('crypto fallbacks (iPhone 6s / plain http compatibility)', () => {
  it('sha256 matches the known vector for "abc" on both paths', async () => {
    const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(await sha256Hex('abc')).toBe(expected);
    expect(sha256HexNoble(utf8('abc'))).toBe(expected);
  });

  it('WebCrypto and pure-JS AES-256-GCM are cross-compatible', async () => {
    const salt = unhex('00112233445566778899aabbccddeeff');
    const iv = unhex('0102030405060708090a0b0c');
    const msg = utf8('Receipt Vault backup — äöü €15,17');
    const keyWeb = await deriveKeyBytes('passwörd', salt);
    const keyNoble = deriveKeyBytesNoble('passwörd', salt);
    expect(hex(keyWeb)).toBe(hex(keyNoble));

    const cWeb = await aesGcmEncrypt(keyWeb, iv, msg);
    const cNoble = aesGcmEncryptNoble(keyNoble, iv, msg);
    expect(hex(cWeb)).toBe(hex(cNoble));

    expect(fromUtf8(await aesGcmDecrypt(keyWeb, iv, cNoble))).toBe('Receipt Vault backup — äöü €15,17');
    expect(fromUtf8(aesGcmDecryptNoble(keyNoble, iv, cWeb))).toBe('Receipt Vault backup — äöü €15,17');
    expect(fromUtf8(await aesGcmDecrypt(keyNoble, iv, await aesGcmEncrypt(keyWeb, iv, msg)))).toBe('Receipt Vault backup — äöü €15,17');
  });

  it('reports whether WebCrypto subtle is available (node has it)', () => {
    expect(subtleAvailable()).toBe(true);
  });
});

describe('compat helpers', () => {
  it('uid() returns a UUID-shaped id even without crypto.randomUUID', () => {
    expect(uid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('isIOS returns a boolean', () => {
    expect(typeof isIOS()).toBe('boolean');
  });
});
