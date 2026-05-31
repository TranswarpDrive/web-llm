/**
 * AES-256-GCM encryption for API keys at rest.
 * Uses the MASTER_ENCRYPTION_KEY from Worker Secrets.
 */

function getKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret).slice(0, 32); // Use first 32 bytes for AES-256

  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(plaintext: string, masterKey: string): Promise<{ ciphertext: string; nonce: string }> {
  const key = await getKey(masterKey);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    nonce: btoa(String.fromCharCode(...nonce)),
  };
}

export async function decrypt(ciphertext: string, nonce: string, masterKey: string): Promise<string> {
  const key = await getKey(masterKey);
  const nonceBytes = Uint8Array.from(atob(nonce), c => c.charCodeAt(0));
  const cipherBytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonceBytes },
    key,
    cipherBytes
  );

  return new TextDecoder().decode(decrypted);
}
