/**
 * uuid.js — generateTransferId()
 *
 * crypto.randomUUID() only exists in secure contexts (HTTPS, or the
 * localhost/127.0.0.1 exemption). Accessing the app over a plain-HTTP LAN
 * IP (e.g. http://10.31.2.75:8080) is an insecure context, so that function
 * is simply absent there — calling it throws "crypto.randomUUID is not a
 * function". crypto.getRandomValues() has no such restriction, so it's used
 * as the fallback to build a spec-compliant v4 UUID by hand.
 */

export function generateTransferId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return (
      hex.slice(0, 4).join('') + '-' +
      hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' +
      hex.slice(8, 10).join('') + '-' +
      hex.slice(10, 16).join('')
    );
  }

  // Last-resort fallback (extremely old browsers only) — not
  // cryptographically strong, but this ID only needs to be unique per
  // transfer, not unguessable, so Math.random() is acceptable here.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}