import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
const key = () => {
  const secret = process.env.IDENTITY_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('Configure IDENTITY_ENCRYPTION_KEY (32+ characters)');
  return createHmac('sha256', secret).update('xtra-cash-identity-v1').digest();
};
export function secretHash(value: string) { return createHmac('sha256', key()).update(value).digest('hex'); }
export function encryptIdentity(value: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(v => v.toString('base64url')).join('.');
}
export function decryptIdentity(value: string) {
  const [iv, tag, data] = value.split('.').map(v => Buffer.from(v, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
