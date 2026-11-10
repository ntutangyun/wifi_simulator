/**
 * The AES-128 block cipher (FIPS 197), encryption only — what the P802.15.4ab draft's narrowband
 * channel-switching PRNG is built from.
 *
 * The draft defines `NbaPrng(key, data)` as "the AES-128 block cipher described in B.2.2", keyed by
 * the session's PRNG seed and fed the ranging block index, both as MSB zero-padded 128-bit
 * unsigned integers (comment resolutions 15-24/0223r1, 15-24/0658r1, 15-26/0195r1; the worked
 * example table in 15-26/0215r2 and, with a legal one-octet seed, 15-26/0408r2). Annex B.2.2 of
 * IEEE Std 802.15.4-2024 is the standard's own use of the same cipher (CCM*). Nothing else in the
 * engine needs a cipher, so this is the bare block operation and nothing more: no modes, no
 * decryption, no key reuse across calls beyond what one call needs.
 *
 * Pure TypeScript on purpose: the simulator runs in the browser as well as under Node, and the
 * draft's PRNG has to give the same channel in both.
 */

/** The S-box of FIPS 197 §5.1.1, generated rather than tabulated so there is no 256-entry literal
 * to mistype: the multiplicative inverse in GF(2^8) followed by the affine map. */
const SBOX: Uint8Array = (() => {
  const s = new Uint8Array(256)
  let p = 1
  let q = 1
  do {
    // p ← p·3, q ← q/3 in GF(2^8) with the AES polynomial x^8 + x^4 + x^3 + x + 1.
    p = (p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0)) & 0xff
    q ^= q << 1
    q ^= q << 2
    q ^= q << 4
    q &= 0xff
    if (q & 0x80) q ^= 0x09
    const rot = (x: number, k: number): number => ((x << k) | (x >> (8 - k))) & 0xff
    s[p] = (q ^ rot(q, 1) ^ rot(q, 2) ^ rot(q, 3) ^ rot(q, 4) ^ 0x63) & 0xff
  } while (p !== 1)
  s[0] = 0x63
  return s
})()

function xtime(b: number): number {
  return ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 0xff
}

/** FIPS 197 §5.2: the eleven 16-byte round keys of a 128-bit key. */
function expandKey(key: Uint8Array): Uint8Array {
  const w = new Uint8Array(176)
  w.set(key)
  let rcon = 1
  for (let i = 16; i < 176; i += 4) {
    let t0 = w[i - 4]
    let t1 = w[i - 3]
    let t2 = w[i - 2]
    let t3 = w[i - 1]
    if (i % 16 === 0) {
      const tmp = t0
      t0 = SBOX[t1] ^ rcon
      t1 = SBOX[t2]
      t2 = SBOX[t3]
      t3 = SBOX[tmp]
      rcon = xtime(rcon)
    }
    w[i] = w[i - 16] ^ t0
    w[i + 1] = w[i - 15] ^ t1
    w[i + 2] = w[i - 14] ^ t2
    w[i + 3] = w[i - 13] ^ t3
  }
  return w
}

/** Encrypt one 16-byte block under a 16-byte key (FIPS 197 §5.1). */
export function aes128Encrypt(key: Uint8Array, block: Uint8Array): Uint8Array {
  if (key.length !== 16 || block.length !== 16) {
    throw new Error(`aes128Encrypt: key and block must be 16 bytes, got ${key.length} and ${block.length}`)
  }
  const w = expandKey(key)
  const s = new Uint8Array(16)
  for (let i = 0; i < 16; i++) s[i] = block[i] ^ w[i]
  for (let round = 1; round <= 10; round++) {
    // SubBytes
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]]
    // ShiftRows: the state is column-major, so row r is bytes r, r+4, r+8, r+12.
    let t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t
    t = s[2]; s[2] = s[10]; s[10] = t
    t = s[6]; s[6] = s[14]; s[14] = t
    t = s[3]; s[3] = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = t
    // MixColumns, every round but the last.
    if (round < 10) {
      for (let c = 0; c < 16; c += 4) {
        const a0 = s[c], a1 = s[c + 1], a2 = s[c + 2], a3 = s[c + 3]
        const all = a0 ^ a1 ^ a2 ^ a3
        s[c] = a0 ^ all ^ xtime(a0 ^ a1)
        s[c + 1] = a1 ^ all ^ xtime(a1 ^ a2)
        s[c + 2] = a2 ^ all ^ xtime(a2 ^ a3)
        s[c + 3] = a3 ^ all ^ xtime(a3 ^ a0)
      }
    }
    // AddRoundKey
    const k = round * 16
    for (let i = 0; i < 16; i++) s[i] ^= w[k + i]
  }
  return s
}

/** A non-negative integer as a 16-byte big-endian block, MSB zero-padded — how the draft feeds
 * both the seed and the block index to `NbaPrng`. Integers above 2^53 cannot reach here. */
export function u128be(n: number): Uint8Array {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`u128be: need a non-negative safe integer, got ${n}`)
  const out = new Uint8Array(16)
  let v = n
  for (let i = 15; i >= 0 && v > 0; i--) {
    out[i] = v % 256
    v = Math.floor(v / 256)
  }
  return out
}
