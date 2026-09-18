/**
 * Determinism helpers with no dependencies: the string hash every RNG stream id
 * comes from, and the tie-break order both media sort same-instant events with.
 *
 * FNV-1a over a string. The engine derives its per-node RNG stream ids from it
 * (`root.fork(hashStr(id))`), so it is the reason a node's random stream depends
 * only on its own name — add a node to a scenario and every other node replays
 * bit-for-bit.
 *
 * It lives in a module of its own, with no dependencies, because both the Wi-Fi
 * host (engine/simulation.ts) and the UWB network (uwb/network.ts) need it and
 * the host already imports the network.
 */
export function hashStr(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Orders two ids by UTF-16 code unit. Deliberately NOT `localeCompare`: without a
 * locale that uses the host's ICU collation, which can order ids with punctuation or
 * mixed case differently between builds — and this order is the `seq` order of the
 * records of a same-instant batch, which the timeline hash covers. A replay must not
 * depend on which ICU the machine shipped.
 */
export function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
