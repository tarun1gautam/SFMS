const crypto = require('crypto');

// Set this in your .env — 32 raw bytes, base64-encoded. Generate once with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Rotate by re-encrypting existing rows if you ever change it; there's no
// versioning here, so treat this key with the same care as your JWT secret.
const KEY = Buffer.from(process.env.MFA_ENCRYPTION_KEY, 'base64');
const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended for GCM

if (!process.env.MFA_ENCRYPTION_KEY || KEY.length !== 32) {
  throw new Error('MFA_ENCRYPTION_KEY must be set to a base64-encoded 32-byte key.');
}

/**
 * Encrypts a TOTP secret for storage. Returns a single string
 * "iv:authTag:ciphertext" (all base64) so it fits in one TEXT column.
 */
function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/**
 * Decrypts a value produced by encryptSecret. Throws if the stored value
 * has been tampered with (GCM auth tag check fails).
 */
function decryptSecret(stored) {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(':');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Malformed encrypted secret.');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return plaintext.toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
