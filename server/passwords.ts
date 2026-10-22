// Password hashing with Node's built-in scrypt. Stored as "scrypt$N$r$p$salt$hash" (base64 parts).

import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, ScryptOptions } from 'crypto';

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
    new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => err ? reject(err) : resolve(key)));

const N = 16384, R = 8, P = 1, KEYLEN = 32;

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string) {
    const salt = randomBytes(16);
    const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
    return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string | null) {
    const [kind, n, r, p, salt, hash] = (stored || '').split('$');
    if (kind !== 'scrypt' || !hash) return false;
    const expected = Buffer.from(hash, 'base64');
    const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +r, p: +p });
    return timingSafeEqual(key, expected);
}

// Unambiguous characters only, since admins read these out or paste them into a message
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** A one-time password such as "k7wq-mz3d-p9xa", which the user must change at first sign-in. */
export const tempPassword = () =>
    Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')).join('-');
