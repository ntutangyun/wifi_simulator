/**
 * Angle of arrival from a phase difference (PDoA) — the model behind an anchor
 * that reports a *bearing* to a tag, not only a distance.
 *
 * The physics is one line. An anchor carries two receive antennas, `d` apart on
 * its boresight axis; a wavefront arriving at azimuth θ off boresight reaches
 * the far one later by d·sin θ, which at the carrier is a phase difference
 *
 *     φ = 2π · (d / λ) · sin θ
 *
 * With the usual half-wavelength spacing (d = λ/2, the widest that is still
 * unambiguous over ±90°) that collapses to φ = π·sin θ, so the whole ±90° field
 * of view maps onto exactly one turn of phase, −π to +π, and nothing wraps.
 *
 * Three consequences the lesson and the tests live on.
 *
 * 1. **The estimate is worst where the geometry is flattest.** Inverting the
 *    line gives dθ = dφ / (2π·(d/λ)·cos θ), so the same phase noise is worth
 *    σ_φ/(π·cos θ) radians of angle: 2.7° at boresight, 5.5° at 60°, and
 *    unbounded at ±90°, where a degree of angle changes no phase at all.
 * 2. **A two-element array cannot tell front from back.** sin(180° − θ) = sin θ,
 *    so a tag *behind* the anchor produces exactly the phase of its mirror image
 *    in front of it, and `azimuthFromPdoaDeg` — which has nothing else to go on —
 *    reports that mirror. This is not a modelling shortcut: it is what a real
 *    two-antenna PDoA anchor does, and why deployments point anchors at the room
 *    and add a third antenna (or a second axis) when they need the other half.
 * 3. **One anchor is enough for a position.** A range is a circle and a bearing
 *    is a ray; together they meet in one point, which is what makes AoA the only
 *    mode in this simulator that fixes a tag from a single anchor.
 *
 * Everything here is pure geometry — no state, no randomness. The session's one
 * noise knob is `AOA_SIGMA_PHI_RAD`, and the device draws it (see
 * src/uwb/device.ts `measureAoa`).
 */
import type { Vec3 } from '../model/types'
import { C_M_PER_NS, UWB_CHANNEL_MHZ, type UwbChannelNo } from './phy'

/**
 * 1-σ of a phase-difference measurement, in radians (model). 0.15 rad ≈ 8.6° of
 * phase is a representative figure for a BPRF receiver estimating the PDoA of an
 * STS over a short baseline; at boresight it is 2.7° of bearing, which is what a
 * commodity AoA anchor is specified at. It is a property of the receiver, not of
 * the session's timestamp noise, so it lives here as one constant rather than as
 * another field of UwbSessionCfg.
 */
export const AOA_SIGMA_PHI_RAD = 0.15

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

/** The largest bearing sigma the model will report; see `aoaSigmaDeg`. */
export const AOA_SIGMA_CLAMP_DEG = 45

/** Carrier wavelength of a ranging channel: c / f (0.0375 m on channel 9, 0.0462 m on channel 5). */
export function wavelengthM(ch: UwbChannelNo): number {
  return (C_M_PER_NS * 1e9) / (UWB_CHANNEL_MHZ[ch] * 1e6)
}

/** Antenna spacing of the model's two-element array: λ/2, the widest spacing that keeps
 * every azimuth in ±90° at its own phase (at λ the field of view would fold in two). */
export function antennaSpacingM(ch: UwbChannelNo): number {
  return wavelengthM(ch) / 2
}

/** Wrap an angle in degrees to (−180, 180]. */
function wrapDeg(deg: number): number {
  const w = ((deg + 180) % 360 + 360) % 360 - 180
  return w === -180 ? 180 : w
}

/**
 * True azimuth of `to` seen from `from`, relative to the boresight `yawDeg` points along
 * (0° = +x, 90° = +y), wrapped to (−180, 180]. Positive is counter-clockwise, i.e. to the
 * anchor's left. Purely horizontal: the two antennas sit side by side, so height differences
 * change the elevation of the arrival and not its azimuth.
 */
export function trueAzimuthDeg(from: Vec3, yawDeg: number, to: Vec3): number {
  return wrapDeg(Math.atan2(to.y - from.y, to.x - from.x) * RAD - yawDeg)
}

/**
 * The phase difference a true azimuth produces: 2π·(d/λ)·sin θ, which is π·sin θ at d = λ/2.
 * Behind the anchor the geometry mirrors — sin(180° − θ) = sin θ — so a tag at 135° produces
 * precisely the phase of one at 45°, and no inverse can tell them apart (see the module note).
 */
export function pdoaRad(thetaDeg: number, ch: UwbChannelNo): number {
  return 2 * Math.PI * (antennaSpacingM(ch) / wavelengthM(ch)) * Math.sin(thetaDeg * DEG)
}

/**
 * Estimated azimuth from a measured phase difference, in degrees, clamped to ±90°: the inverse
 * of `pdoaRad` over the field of view a two-element array has. Noise can push a measurement past
 * ±π, where the arc sine has no answer; the argument is clamped rather than dropped, so a tag
 * at the very edge of the field of view reads as being at the edge instead of producing nothing.
 */
export function azimuthFromPdoaDeg(phiRad: number, ch: UwbChannelNo): number {
  const sin = phiRad / (2 * Math.PI * (antennaSpacingM(ch) / wavelengthM(ch)))
  return Math.asin(Math.max(-1, Math.min(1, sin))) * RAD
}

/**
 * The bearing sigma at an estimated azimuth, in degrees: σ_φ / (2π·(d/λ)·cos θ), i.e.
 * σ_φ/(π·cos θ) at half-wavelength spacing — 2.73° at boresight, 3.16° at 30°, 5.47° at 60°.
 *
 * It diverges at ±90°, where the array is blind to angle, so it is clamped at 45°. The clamp is
 * a statement about the model, not about the receiver: past about ±85° the linearisation this
 * sigma comes from has stopped describing the error at all, and a number bigger than a quadrant
 * would only make an error ellipse the size of the room look meaningful.
 */
export function aoaSigmaDeg(thetaDeg: number): number {
  const cos = Math.cos(thetaDeg * DEG)
  if (cos <= 0) return AOA_SIGMA_CLAMP_DEG
  return Math.min(AOA_SIGMA_CLAMP_DEG, (AOA_SIGMA_PHI_RAD / (Math.PI * cos)) * RAD)
}
