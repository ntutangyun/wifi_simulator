/**
 * Shared Wi-Fi scene builders for tier 1 and tier 2 lessons: the three floor
 * plans (`oneRoom`, `hallwayHouse`, `longApartment`), the scenario helper
 * `sc`, and the width / MU-MIMO / rate scenario builders several lessons
 * share. `sc`, `oneRoom`, `hallwayHouse` and `longApartment` are re-exported
 * from `./lessonKit` so existing imports of them keep working unchanged.
 */
import type { ChannelWidth, Nss } from '../model/caps'
import type { NodeCfg, Room, Scenario, Wall } from '../model/scenario'
import { brick, node } from './lessonKit'

/** Single 10×8 room with a brick shell. */
export function oneRoom(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }],
    walls: [brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0)],
  }
}

/**
 * Room A | brick hallway (AP) | Room B. The stations' ray crosses TWO brick
 * walls (~24 dB) at ~8.4 m, landing below the −82 dBm preamble threshold —
 * genuinely hidden — while each station reaches the AP through one wall.
 */
export function hallwayHouse(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [
      { x: 0, y: 0, w: 4, h: 8, name: 'Room A' },
      { x: 4, y: 0, w: 2, h: 8, name: 'Hallway' },
      { x: 6, y: 0, w: 4, h: 8, name: 'Room B' },
    ],
    walls: [
      brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0),
      brick(4, 0, 4, 8), brick(6, 0, 6, 8),
    ],
  }
}

/**
 * Long 16×8 apartment: a study (0–6) and a far living room (6–16) split by
 * brick. Wide enough that the far station is genuinely far — ~11.5 m plus one
 * wall lands it at ~−75 dBm (12 Mb/s), 40 dB under the near station, so the
 * near frame's capture clears its 30 dB decode threshold by ~10 dB instead of
 * sitting on the edge of it.
 */
export function longApartment(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [
      { x: 0, y: 0, w: 6, h: 8, name: 'Study' },
      { x: 6, y: 0, w: 10, h: 8, name: 'Living room' },
    ],
    walls: [
      brick(0, 0, 16, 0), brick(16, 0, 16, 8), brick(16, 8, 0, 8), brick(0, 8, 0, 0),
      brick(6, 0, 6, 8),
    ],
  }
}

export function sc(house: { rooms: Room[]; walls: Wall[] }, nodes: NodeCfg[], extra: Partial<Scenario> = {}): Scenario {
  return {
    ...house, nodes,
    // Lessons are about the Wi-Fi MAC: no cloud servers, so no WAN delay and
    // every quoted timestamp stays where it is.
    servers: [],
    seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    ...extra,
  }
}

/**
 * A router and one laptop on the same desk in the study of a long flat, both
 * at a chosen channel width and stream count. Module 4 is about what one frame
 * costs, so aggregation is off: every data frame is a single 1500-byte MSDU,
 * 1530 octets on the air. MLO is off too, so the pair keeps one 5 GHz lane.
 * The far living room is there for the experiments: it is the only part of the
 * flat where a wide channel runs out of signal.
 */
export function widthScenario(widthMhz: ChannelWidth, nss: Nss, apNss: Nss = nss): Scenario {
  const feats = { edca: true, qam4k: true }
  const ap = node('ap', 'Router', 'ap', 3, 4, 'eht', 'idle', feats)
  const sta = node('sta-1', 'Laptop', 'sta', 4, 4, 'eht', 'saturated', feats)
  ap.caps.widthMhz = widthMhz
  ap.caps.nss = apNss
  sta.caps.widthMhz = widthMhz
  sta.caps.nss = nss
  return sc(longApartment(), [ap, sta])
}
/**
 * A four-stream router and three two-stream phones, each pulling its own
 * video stream, in one room. A fourth device — a laptop backing up files flat
 * out — keeps the channel busy: without it the router drains each phone's
 * video packet long before the next one lands, and a queue that never holds
 * more than one destination at a time never gives the AP a second station to
 * group. `mumimoOn` toggles only the phones' and router's MU-MIMO capability;
 * OFDMA stays negotiated throughout, because it is OFDMA capability, not
 * MU-MIMO capability, that lets the AP consider more than one destination at
 * once at all — MU-MIMO only chooses itself over OFDMA once that door is open.
 */
export function mumimoScenario(mumimoOn: boolean): Scenario {
  const feats = { edca: true, ampdu: true, txop: true, ofdma: true, qam4k: true, mumimo: mumimoOn }
  const ap = node('ap', 'Router', 'ap', 5, 4, 'eht', 'idle', feats)
  const sta1 = node('sta-1', 'Phone 1', 'sta', 4, 3, 'eht', 'video', feats)
  const sta2 = node('sta-2', 'Phone 2', 'sta', 6, 3, 'eht', 'video', feats)
  const sta3 = node('sta-3', 'Phone 3', 'sta', 5, 5.5, 'eht', 'video', feats)
  const backup = node('sta-4', 'Laptop (backup)', 'sta', 2, 6.5, 'eht', 'saturated', feats)
  ap.caps.widthMhz = 160
  ap.caps.nss = 4
  for (const s of [sta1, sta2, sta3]) {
    s.caps.widthMhz = 160
    s.caps.nss = 2
  }
  backup.caps.widthMhz = 160
  backup.caps.nss = 1
  return sc(oneRoom(), [ap, sta1, sta2, sta3, backup])
}
/**
 * Two saturated uploaders on one AP: one on the desk beside it, one in the
 * far corner of the flat behind a brick wall. Aggregation and TXOP are off,
 * so every exchange is exactly one MSDU — clean, one-for-one accounting of
 * failures against the far station's working MCS.
 */
export function rateScenario(): Scenario {
  const feats = { edca: true }
  const ap = node('ap', 'AP', 'ap', 4, 4, 'eht', 'idle', feats)
  const near = node('sta-1', 'Near uploader', 'sta', 4.8, 4.3, 'eht', 'saturated', feats)
  const far = node('sta-2', 'Far uploader', 'sta', 15, 7, 'eht', 'saturated', feats)
  return sc(longApartment(), [ap, near, far])
}
