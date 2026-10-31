// Team chat messages are encrypted at rest (AES-256-GCM) so a database dump does not reveal who wrote what. The key
// is CHAT_ENCRYPTION_KEY in .env (32 bytes, hex or base64); without one it is derived from JWT_SECRET, so the chat
// works out of the box - but set a key of its own before going live. The server holds the key: the admin reads
// every chat, so this is not end-to-end encryption, and changing the key makes earlier messages unreadable.
const crypto = require('crypto');

const PREFIX = 'enc1:';
let cached = null;
const keyOf = () => {
  if (cached) return cached;
  const raw = String(process.env.CHAT_ENCRYPTION_KEY || '').trim();
  if (raw) {
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (buf.length !== 32) throw new Error('CHAT_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)');
    cached = buf;
  } else {
    if (!process.env.JWT_SECRET) throw new Error('Set CHAT_ENCRYPTION_KEY (or JWT_SECRET) to encrypt team chat');
    cached = crypto.createHash('sha256').update(`team-chat:${process.env.JWT_SECRET}`).digest();
  }
  return cached;
};

const encryptText = (text) => {
  const plain = String(text ?? '');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyOf(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`;
};

// Text stored before encryption (or with a different key) comes back as it is / as unreadable.
const decryptText = (stored) => {
  const value = String(stored ?? '');
  if (!value.startsWith(PREFIX)) return value;
  try {
    const [iv, tag, body] = value.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyOf(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '[message cannot be read: encryption key changed]';
  }
};

module.exports = { encryptText, decryptText };
