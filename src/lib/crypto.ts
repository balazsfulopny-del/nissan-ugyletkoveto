import type { PinBox } from './domain';

/* PIN: PBKDF2 (310 000 kör, SHA-256) → kulcs, ami egy véletlen dokumentum kulcsot (AES-GCM 256) burkol.
   A dokumentumok ezzel a kulccsal titkosítva kerülnek a felhőbe; a PIN nélkül olvashatatlanok. */
const te = new TextEncoder();
const SUB = () => crypto.subtle;
const B = (x: Uint8Array | ArrayBuffer) => x as unknown as ArrayBuffer;
export const ITER = 310000;
export const b64 = (buf: ArrayBuffer | Uint8Array) => { const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 32768))); return btoa(s); };
export const unb64 = (t: string) => { const s = atob(t), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

async function kekOf(pin: string, salt: Uint8Array, it: number) {
  const base = await SUB().importKey('raw', B(te.encode(pin)), 'PBKDF2', false, ['deriveKey']);
  return SUB().deriveKey({ name: 'PBKDF2', salt: B(salt), iterations: it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function wrapRaw(pin: string, raw: Uint8Array, it = ITER): Promise<PinBox> {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await kekOf(pin, salt, it);
  return { salt: b64(salt), iv: b64(iv), w: b64(await SUB().encrypt({ name: 'AES-GCM', iv: B(iv) }, k, B(raw))), it, v: 1, len: pin.length };
}
export async function unwrap(pin: string, P: PinBox) {
  const k = await kekOf(pin, unb64(P.salt), P.it);
  return new Uint8Array(await SUB().decrypt({ name: 'AES-GCM', iv: B(unb64(P.iv)) }, k, B(unb64(P.w))));
}
export const useRaw = (raw: Uint8Array) => SUB().importKey('raw', B(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
export const newRaw = () => crypto.getRandomValues(new Uint8Array(32));

/* binary format: "NUK2" | 12 byte iv | ciphertext */
const MAGIC = te.encode('NUK2');
export async function encBlob(key: CryptoKey, data: ArrayBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await SUB().encrypt({ name: 'AES-GCM', iv: B(iv) }, key, data));
  const out = new Uint8Array(4 + 12 + ct.length); out.set(MAGIC, 0); out.set(iv, 4); out.set(ct, 16);
  return out;
}
export async function decBlob(key: CryptoKey, data: ArrayBuffer) {
  const u = new Uint8Array(data);
  if (u.length < 16 || String.fromCharCode(...u.subarray(0, 4)) !== 'NUK2') {
    // v1 format from the old app: text "NUK1.<iv b64>.<ct b64>"
    const t = new TextDecoder().decode(u); const [m, iv, ct] = t.split('.');
    if (m !== 'NUK1') throw new Error('bad format');
    return new Uint8Array(await SUB().decrypt({ name: 'AES-GCM', iv: B(unb64(iv)) }, key, B(unb64(ct))));
  }
  return new Uint8Array(await SUB().decrypt({ name: 'AES-GCM', iv: B(u.slice(4, 16)) }, key, B(u.slice(16))));
}
