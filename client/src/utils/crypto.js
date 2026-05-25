// ── Helpers ───────────────────────────────────────────────────────────────────
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('Invalid hex string');
  }
  return new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));
}

export function generateSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Key generation ────────────────────────────────────────────────────────────
export async function generateKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportPublicKey(key) {
  const jwk = await crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(jwk);
}

export async function importPublicKey(jwkStr) {
  return crypto.subtle.importKey(
    'jwk', JSON.parse(jwkStr),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true, ['encrypt']
  );
}

// ── Private key wrapping (PBKDF2 → AES-GCM) ──────────────────────────────────
async function deriveWrappingKey(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: 120000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPrivateKey(privateKey, password, saltHex) {
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveWrappingKey(password, saltHex);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    enc.encode(JSON.stringify(jwk))
  );
  return { encryptedPrivateKey: toBase64(ciphertext), keyIv: toBase64(iv) };
}

export async function decryptPrivateKey(encryptedB64, ivB64, password, saltHex) {
  const wrappingKey = await deriveWrappingKey(password, saltHex);
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivB64) },
    wrappingKey,
    fromBase64(encryptedB64)
  );
  const jwk = JSON.parse(dec.decode(plaintext));
  return crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true, ['decrypt']
  );
}

// ── Message encryption (hybrid: AES-GCM + RSA-OAEP) ─────────────────────────
export async function encryptMessage(plaintext, recipientPubKey, senderPubKey) {
  const enc = new TextEncoder();
  const messageKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, messageKey, enc.encode(plaintext)
  );
  const rawKey = await crypto.subtle.exportKey('raw', messageKey);

  const [encKeyRecipient, encKeySender] = await Promise.all([
    crypto.subtle.encrypt({ name: 'RSA-OAEP' }, recipientPubKey, rawKey),
    crypto.subtle.encrypt({ name: 'RSA-OAEP' }, senderPubKey, rawKey),
  ]);

  return {
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
    enc_key_recipient: toBase64(encKeyRecipient),
    enc_key_sender: toBase64(encKeySender),
  };
}

export async function decryptMessage(msg, privateKey, isSender) {
  const encKeyB64 = isSender ? msg.enc_key_sender : msg.enc_key_recipient;
  const rawKey = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' }, privateKey, fromBase64(encKeyB64)
  );
  const messageKey = await crypto.subtle.importKey(
    'raw', rawKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(msg.iv) }, messageKey, fromBase64(msg.ciphertext)
  );
  return dec.decode(plaintext);
}
