/**
 * Echo geometry: the second way home. An object in the room that reflects gives
 * every transmission a **second arrival** at every receiver — later than the
 * direct one, because it went further, and weaker, because it spread twice and
 * lost something at the object. This module is that geometry and nothing else.
 *
 * **Why it lives beside the engine rather than inside a radio.** The delay of an
 * echo is `(|TX→S| + |S→RX|) / c` whatever sent it; carrier, modulation and frame
 * format do not enter the sum. Only two things differ between radios, and both
 * are kept outside this file: **which path-loss law applies** — passed in as
 * `(dM: number) => number`, which is the single reason one module can serve both
 * the UWB stack and the Wi-Fi engine — and **what the receiver does with the
 * extra path**, which is sensing for UWB and multipath for Wi-Fi. So this file
 * imports no channel, no PHY and no radio-specific constant. `fading.ts` next
 * door is the same shape and the same precedent: pure functions, radio-agnostic,
 * wired to one side at a time.
 *
 * **Everything here is pure.** Same three points in, same number out, always —
 * for the reason `fading.ts` spells out at length: a consumer asks these
 * questions several times over one frame's life, from different call sites, and
 * two answers to one question would make the timeline depend on event ordering.
 *
 * Walls are **not** scatterers (design §9): they still only add delay and loss to
 * the direct ray. Turning a wall into a reflector needs image sources and a
 * visibility test, and the path count explodes. That is another slice.
 */
import type { Vec3 } from '../model/types'

/**
 * One reflecting object in a scenario. It does not transmit, does not receive
 * and does not appear in any link table; all it does is give a signal another
 * route.
 */
export interface ScattererCfg {
  id: string
  /** Position, metres. */
  pos: Vec3
  /** How much weaker this object is than an ideal reflector, dB. model */
  extraLossDb: number
}

/**
 * Metres of flight per nanosecond: the speed of light in vacuum, which since
 * 1983 is not measured but *defines* the metre. physics
 *
 * Written out here rather than imported from `src/uwb/units.ts`, which holds the
 * same figure, because this module sits under `engine/` and `uwb/channel.ts`
 * already imports `engine/propagation` — an import the other way would run the
 * dependency backwards to save one line. A defined constant cannot drift apart
 * from a copy of itself the way a tuned one could, so the duplication costs
 * nothing that matters. Indoor air is a per-mille slower and this engine ignores
 * that everywhere, direct path included.
 */
const C_M_PER_NS = 0.299792458 // physics

/**
 * Everything that happens **at** the object, in one number: how much of what
 * arrives leaves again, in which direction, and how much of that the receiver's
 * aperture catches. The radar equation writes those as a cross-section and a
 * stack of `(4π)` and `λ` factors, and this simulator computes none of them, so
 * one constant stands in for the lot.
 *
 * **It is a summary, not a derivation.** 10 dB is a round figure this simulator
 * picked. No radar cross-section in m² appears anywhere in this repository,
 * because none was used — a real echo's strength varies with an object's size,
 * material and orientation, and this engine models no one of those. Writing a σ
 * down and then not using it would be worse than having none.
 *
 * The direction of the error is known and worth stating rather than hiding:
 * charging the caller's path loss twice, once per leg, spends the receive
 * aperture twice too, so an echo here lands **well below** where a bistatic radar
 * budget would put it. The design (§5) accepted that rather than invent a
 * cross-section. A consumer that needs echoes to be audible at all should come
 * back and retune this one number, not work around it downstream. model
 */
export const SCATTER_LOSS_DB = 10

function distM(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
}

/** Straight-line distance TX→RX, metres: the path every arrival today takes. */
export function directPathM(tx: Vec3, rx: Vec3): number {
  return distM(tx, rx)
}

/**
 * The bistatic distance TX→S→RX, metres: the whole road the echo travels. Two
 * legs summed, which is all "reflection" means once the object is a point.
 */
export function echoPathM(tx: Vec3, s: Vec3, rx: Vec3): number {
  return distM(tx, s) + distM(s, rx)
}

/**
 * How much further the echo went than the direct ray, metres. This is the
 * quantity everything interesting is measured in: the delay that separates the
 * two arrivals, and therefore whether a receiver can tell them apart at all.
 *
 * **Never negative.** The triangle inequality says the detour cannot be shorter
 * than the straight line, so a negative value could only be floating-point noise
 * from a scatterer sitting on the line; clamping keeps an echo from ever
 * arriving before the signal that caused it. physics
 */
export function echoExcessM(tx: Vec3, s: Vec3, rx: Vec3): number {
  return Math.max(0, echoPathM(tx, s, rx) - directPathM(tx, rx))
}

/** Flight time of the direct ray, ns. Fractional: the caller rounds to the
 * integer nanosecond its event queue runs on, as the direct path already does. */
export function directDelayNs(tx: Vec3, rx: Vec3): number {
  return directPathM(tx, rx) / C_M_PER_NS
}

/**
 * Flight time of the echo, ns — later than `directDelayNs` for every scatterer
 * off the line, and equal to it for one exactly on it. There is no third case,
 * and that is the triangle inequality rather than a modelling decision. physics
 */
export function echoDelayNs(tx: Vec3, s: Vec3, rx: Vec3): number {
  return echoPathM(tx, s, rx) / C_M_PER_NS
}

/**
 * The echo's path loss, dB: the caller's law charged once per leg, plus the
 * scatter summary, plus whatever this particular object is worse than an ideal
 * reflector.
 *
 * `pathLossDb` arrives as a parameter and is the whole reason this module is not
 * UWB's. Give it `uwbPathLossDb`-with-its-pl0 bound and the echo is a UWB echo;
 * give it the Wi-Fi law and the same geometry is Wi-Fi multipath. Wall loss, if
 * a caller wants it, belongs inside that closure per leg — the walls in the way
 * of TX→S are not the walls in the way of S→RX, which is exactly why this
 * function does not take a wall list and pretend one number covers both.
 */
export function echoLossDb(
  tx: Vec3, s: Vec3, rx: Vec3, pathLossDb: (dM: number) => number, extraLossDb = 0,
): number {
  return pathLossDb(distM(tx, s)) + pathLossDb(distM(s, rx)) + SCATTER_LOSS_DB + extraLossDb
}

/**
 * Can the receiver tell this echo from the direct path? Yes exactly when the
 * extra flight time exceeds `resolutionNs`.
 *
 * **The resolution is a parameter, not UWB's chip.** A UWB caller passes
 * `UWB_CHIP_NS` (2.003205 ns, standard §16.2.4, ≈ 0.6 m of extra path) and gets
 * the design's §4 condition exactly; a Wi-Fi caller's resolution is set by its
 * channel bandwidth and is a different number entirely. Importing the chip here
 * would have written one radio's receiver into a file whose claim is that it
 * belongs to neither — the same mistake as importing the path-loss law, one
 * paragraph further down the same page.
 *
 * The consequence is a fact about real equipment, not a simplification: a
 * scatterer standing close to the line between the two ends is **invisible**,
 * because its echo merges into the direct path. Walk it away from the line and it
 * appears. That is what "resolution" means, as a distance rather than a word.
 */
export function isResolvable(tx: Vec3, s: Vec3, rx: Vec3, resolutionNs: number): boolean {
  return echoExcessM(tx, s, rx) / C_M_PER_NS > resolutionNs
}
