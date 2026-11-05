// Optional fingerprint / Face ID unlock via WebAuthn platform authenticator.
// This is a privacy screen, not encryption: the PIN hash remains the real lock.

function b64urlToBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function bufferToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function webauthnAvailable(): Promise<boolean> {
  return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.());
}

export async function enrollWebAuthn(): Promise<string> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Receipt Vault' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'receipt-vault-owner', displayName: 'Receipt Vault owner' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000
    }
  });
  if (!cred) throw new Error('No credential created');
  return bufferToB64url((cred as PublicKeyCredential).rawId);
}

export async function unlockWithWebAuthn(credentialIdB64url: string): Promise<boolean> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type: 'public-key', id: b64urlToBuffer(credentialIdB64url) }],
      userVerification: 'required',
      timeout: 60000
    }
  });
  return !!assertion;
}
