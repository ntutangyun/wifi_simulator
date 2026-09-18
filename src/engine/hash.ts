/**
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
