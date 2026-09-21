/**
 * Range and position record emission for `UwbDevice`: turning a time-of-flight into a UWB_RANGE,
 * and the angle-of-arrival fix a DS-TWR anchor solves from its own range and bearing. Split out
 * of device.ts (pure move); every function here takes the device as its first argument.
 */
import { AOA_SIGMA_PHI_RAD, aoaSigmaDeg, azimuthFromPdoaDeg, pdoaRad, trueAzimuthDeg } from './aoa'
import { gaussian } from './clock'
import { rangeSigmaM } from './position'
import { rctuToMetres } from './ranging'
import type { RoundState, UwbDevice } from './device'

export function reportRange(
  dev: UwbDevice, r: RoundState, peer: string, method: 'ss' | 'ds', tofRctu: number, tofRawRctu: number | undefined,
  fom: number,
  /** MMS with an integrity train only: whether that train vouched for this range. Absent
   * everywhere else, so a 4z UWB_RANGE compares equal to the one it always was. */
  integrity?: boolean,
): void {
  const distM = rctuToMetres(tofRctu)
  dev.emit({
    t: dev.now(), type: 'UWB_RANGE', node: dev.id, peer, method,
    tofRctu, ...(tofRawRctu !== undefined ? { tofRawRctu } : {}),
    distM, trueDistM: dev.geometry.trueDistM(dev.id, peer), fom, block: r.block, round: r.round,
    ...(integrity !== undefined ? { integrity } : {}),
  })
  if (dev.cfg.role === 'tag') {
    r.ranges.push({ id: peer, distM })
    // An MMS block is several pair rounds long and the fix is solved from all of them, so
    // there the range has to outlive the round it was measured in.
    if (r.plan.mode === 'mms') dev.blockRanges.set(peer, distM)
  }
  // An anchor that measured a bearing this round and has just finished the range that goes
  // with it holds both halves of a position — so it solves one, alone. Only DS-TWR ever
  // reaches this: an SS round ends at the tag, and the anchor never computes a range at all.
  else if (dev.cfg.aoa) emitAoaFix(dev, r, peer, distM)
}

/**
 * Anchor, angle-of-arrival session: one phase-difference measurement of the frame that has
 * just arrived from the tag, and the bearing it implies.
 *
 * The model measures the *true* azimuth's phase and adds the receiver's phase noise
 * (`AOA_SIGMA_PHI_RAD`), rather than adding angular noise to the angle. That is the order the
 * physics happens in, and it is why the bearing error grows towards the edge of the field of
 * view all by itself: the same phase error is worth more degrees where sin θ is flattest.
 * A tag behind the anchor arrives with the phase of its mirror image in front (sin(180° − θ)
 * = sin θ), so `thetaDeg` lands in the front half while `trueThetaDeg` says where the tag
 * really was — the record carries both precisely so the two can be compared.
 */
export function measureAoa(dev: UwbDevice, r: RoundState, tag: string): void {
  const trueThetaDeg = trueAzimuthDeg(dev.cfg.pos, dev.cfg.yawDeg, dev.geometry.anchorPos(tag))
  const phiRad = pdoaRad(trueThetaDeg, dev.cfg.channel) + gaussian(dev.rng) * AOA_SIGMA_PHI_RAD
  const thetaDeg = azimuthFromPdoaDeg(phiRad, dev.cfg.channel)
  r.aoaThetaDeg = thetaDeg
  dev.emit({
    t: dev.now(), type: 'UWB_AOA', node: dev.id, peer: tag,
    thetaDeg, trueThetaDeg, block: r.block, round: r.round,
  })
}

/**
 * Anchor, angle-of-arrival session: the tag's position from this anchor's own range and
 * bearing — a circle and a ray, which meet in exactly one point. No other mode in this
 * simulator fixes anything from one anchor, and nothing here is solved iteratively: the
 * answer is the polar coordinate itself, so `gdop` is 1 by construction.
 *
 * The range is a *slant* distance in 3-D and the bearing is horizontal, so the two cannot be
 * multiplied together directly: an anchor on the ceiling is further from the tag than the
 * floor plan says. What goes along the bearing is the horizontal leg of that triangle,
 * √(r² − Δz²), with Δz taken against the height the tag is configured at — the same
 * assumption `solvePosition` makes when it solves a 2-D fix for a tag whose z it is handed
 * rather than solving (see src/uwb/position.ts). Without it the lesson's own geometry — an
 * anchor at 2.2 m, a tag at 1.0 m, 4 m apart on the floor — would be placed 18 cm too far
 * out along the ray, a bias no amount of averaging removes. A range shorter than the height
 * difference (only possible when noise eats a near-vertical geometry) leaves nothing
 * horizontal at all, and the fix collapses onto the anchor rather than taking a root of a
 * negative number.
 *
 * The two axes of the error ellipse are the two measurements, and they are wildly unequal:
 * along the ray the range's 2.1 cm (at 100 ps), across it the bearing's rh·σ_θ — 19 cm at 4 m
 * and boresight, and worse off to the side. So the major axis is across the ray at any useful
 * distance, and the ellipse is turned a quarter turn from the bearing; it is only at a few
 * centimetres from the anchor that the range becomes the worse of the two.
 */
function emitAoaFix(dev: UwbDevice, r: RoundState, tag: string, distM: number): void {
  const thetaDeg = r.aoaThetaDeg
  if (thetaDeg === null) return
  const bearingRad = (dev.cfg.yawDeg + thetaDeg) * (Math.PI / 180)
  const truth = dev.geometry.anchorPos(tag)
  // The horizontal leg of the slant range, against the tag's configured height.
  const dz = dev.cfg.pos.z - truth.z
  const horizM = Math.sqrt(Math.max(0, distM * distM - dz * dz))
  const sigmaAlongM = rangeSigmaM(dev.cfg.tsNoisePs)
  const sigmaAcrossM = horizM * aoaSigmaDeg(thetaDeg) * (Math.PI / 180)
  const alongIsMajor = sigmaAlongM >= sigmaAcrossM
  dev.emit({
    t: dev.now(), type: 'UWB_POSITION', node: dev.id,
    x: dev.cfg.pos.x + horizM * Math.cos(bearingRad),
    y: dev.cfg.pos.y + horizM * Math.sin(bearingRad),
    trueX: truth.x, trueY: truth.y, gdop: 1,
    ellipse: {
      a: Math.max(sigmaAlongM, sigmaAcrossM),
      b: Math.min(sigmaAlongM, sigmaAcrossM),
      thetaRad: alongIsMajor ? bearingRad : bearingRad + Math.PI / 2,
    },
    anchors: [dev.id], block: r.block, method: 'aoa', of: tag,
  })
}
