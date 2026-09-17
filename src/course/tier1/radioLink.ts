/**
 * Shared scenario for the two radio lessons of Tier 1 M1 (the link budget and
 * the decode thresholds): one router, one laptop, and a distance you can walk.
 */
import type { Scenario } from '../../model/scenario'
import { longApartment, node, sc, type LessonVariant } from '../lessonKit'

/**
 * A router on a shelf against the study's left wall and one laptop uploading
 * flat out, both antennas 1 m above the floor, Wi-Fi 7 at 20 MHz. Aggregation
 * is off, so every data frame is one 1500-byte MSDU (1530 octets on the air).
 * The laptop sits on the flat's centre line `distanceM` metres from the router;
 * beyond 5.5 m the direct ray crosses the brick wall between study and living room.
 */
export function primerScenario(distanceM: number): Scenario {
  const feats = { edca: true, qam4k: true }
  const ap = node('ap', 'Router', 'ap', 0.5, 4, 'eht', 'idle', feats, 1)
  const sta = node('sta-1', 'Laptop', 'sta', 0.5 + distanceM, 4, 'eht', 'saturated', feats, 1)
  ap.caps.widthMhz = 20
  sta.caps.widthMhz = 20
  return sc(longApartment(), [ap, sta])
}

/** The four positions both lessons use: 1, 5, 9 and 14 m from the router. */
export const PRIMER_DISTANCES = [1, 5, 9, 14]

export const primerVariants: LessonVariant[] = [
  { label: { en: 'Desk (1 m)', zh: '书桌（1 m）' }, scenario: () => primerScenario(1) },
  { label: { en: 'Study (5 m)', zh: '书房（5 m）' }, scenario: () => primerScenario(5) },
  { label: { en: 'Living room (9 m, brick)', zh: '客厅（9 m，砖墙）' }, scenario: () => primerScenario(9) },
  { label: { en: 'Far wall (14 m, brick)', zh: '远端墙边（14 m，砖墙）' }, scenario: () => primerScenario(14) },
]
