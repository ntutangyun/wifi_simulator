/**
 * The phase-difference model behind an angle of arrival (src/uwb/aoa.ts). Every
 * number here is a closed form — the module holds no state and draws nothing —
 * so the assertions are the formulas themselves, evaluated at the angles the
 * lesson and the engine tests use.
 */
import { describe, expect, it } from 'vitest'
import {
  AOA_SIGMA_CLAMP_DEG, AOA_SIGMA_PHI_RAD, antennaSpacingM, aoaSigmaDeg, azimuthFromPdoaDeg,
  pdoaRad, trueAzimuthDeg, wavelengthM,
} from '../../src/uwb/aoa'

const at = (x: number, y: number) => ({ x, y, z: 1 })

describe('wavelength and antenna spacing', () => {
  it('is c / f on both ranging channels', () => {
    // 7987.2 MHz and 6489.6 MHz (standard Table 11-9): 3.75 cm and 4.62 cm.
    expect(wavelengthM(9)).toBeCloseTo(0.0375341, 7)
    expect(wavelengthM(5)).toBeCloseTo(0.0461958, 7)
  })

  it('spaces the two antennas half a wavelength apart — 1.9 cm on channel 9', () => {
    expect(antennaSpacingM(9)).toBeCloseTo(0.0187671, 7)
    expect(antennaSpacingM(5)).toBeCloseTo(0.0230979, 7)
    for (const ch of [5, 9] as const) expect(antennaSpacingM(ch) / wavelengthM(ch)).toBeCloseTo(0.5, 12)
  })
})

describe('pdoaRad', () => {
  it('is π·sin θ: nothing at boresight, π/2 at 30°, a half turn at the edge', () => {
    expect(pdoaRad(0, 9)).toBeCloseTo(0, 12)
    expect(pdoaRad(30, 9)).toBeCloseTo(Math.PI / 2, 12)
    expect(pdoaRad(90, 9)).toBeCloseTo(Math.PI, 12)
    expect(pdoaRad(-30, 9)).toBeCloseTo(-Math.PI / 2, 12)
  })

  it('is the same on both channels, because the spacing is defined in wavelengths', () => {
    for (const deg of [0, 17, 30, 63, 90]) expect(pdoaRad(deg, 5)).toBeCloseTo(pdoaRad(deg, 9), 12)
  })

  it('mirrors behind the anchor: sin(180° − θ) = sin θ', () => {
    expect(pdoaRad(135, 9)).toBeCloseTo(pdoaRad(45, 9), 12)
    expect(pdoaRad(-160, 9)).toBeCloseTo(pdoaRad(-20, 9), 12)
    // …which is why the inverse brings a tag behind the anchor back into the front half.
    expect(azimuthFromPdoaDeg(pdoaRad(135, 9), 9)).toBeCloseTo(45, 12)
    expect(azimuthFromPdoaDeg(pdoaRad(180, 9), 9)).toBeCloseTo(0, 12)
  })
})

describe('azimuthFromPdoaDeg', () => {
  it('inverts pdoaRad over the whole field of view', () => {
    for (const deg of [-90, -63, -30, 0, 17, 45, 90]) {
      expect(azimuthFromPdoaDeg(pdoaRad(deg, 9), 9)).toBeCloseTo(deg, 10)
    }
  })

  it('clamps a phase noise pushed past ±π to the edge of the field of view', () => {
    expect(azimuthFromPdoaDeg(4, 9)).toBe(90)
    expect(azimuthFromPdoaDeg(-4, 9)).toBe(-90)
  })
})

describe('trueAzimuthDeg', () => {
  it('measures from the anchor’s own boresight, positive to its left', () => {
    expect(trueAzimuthDeg(at(0, 0), 0, at(1, 0))).toBeCloseTo(0, 12)
    expect(trueAzimuthDeg(at(0, 0), 0, at(0, 1))).toBeCloseTo(90, 12)
    // The same tag, seen by an anchor turned to face +y: now it is 90° to the right.
    expect(trueAzimuthDeg(at(0, 0), 90, at(1, 0))).toBeCloseTo(-90, 12)
    // The engine test’s geometry: an anchor at (5, 0.5) facing the room sees the tag at 45°.
    expect(trueAzimuthDeg(at(5, 0.5), 90, at(2.17157288, 3.32842712))).toBeCloseTo(45, 6)
  })

  it('wraps to (−180, 180] instead of running off past a half turn', () => {
    expect(trueAzimuthDeg(at(0, 0), -170, at(-1, -0.0000001))).toBeCloseTo(-10, 4)
    expect(trueAzimuthDeg(at(0, 0), 90, at(0, -1))).toBeCloseTo(180, 12)
    expect(trueAzimuthDeg(at(0, 0), 170, at(0, 1))).toBeCloseTo(-80, 12)
  })
})

describe('aoaSigmaDeg', () => {
  it('is σ_φ/(π·cos θ): 2.74° at boresight, and worse off to the side', () => {
    expect(aoaSigmaDeg(0)).toBeCloseTo(2.7357, 4)
    expect(aoaSigmaDeg(0)).toBeCloseTo((AOA_SIGMA_PHI_RAD / Math.PI) * (180 / Math.PI), 12)
    expect(aoaSigmaDeg(30)).toBeCloseTo(3.1589, 4)
    expect(aoaSigmaDeg(45)).toBeCloseTo(3.8688, 4)
    expect(aoaSigmaDeg(60)).toBeCloseTo(5.4713, 4)
    // Symmetric: the array is as good to its right as to its left.
    expect(aoaSigmaDeg(-60)).toBeCloseTo(aoaSigmaDeg(60), 12)
  })

  it('is clamped where the array is blind to angle', () => {
    expect(aoaSigmaDeg(80)).toBeCloseTo(15.7541, 4) // still meaningful
    expect(aoaSigmaDeg(89)).toBe(AOA_SIGMA_CLAMP_DEG)
    expect(aoaSigmaDeg(90)).toBe(AOA_SIGMA_CLAMP_DEG)
    expect(aoaSigmaDeg(-90)).toBe(AOA_SIGMA_CLAMP_DEG)
  })

  it('is what a cross-range error is measured against: 19 cm at 4 m, straight ahead', () => {
    expect(4 * aoaSigmaDeg(0) * (Math.PI / 180)).toBeCloseTo(0.191, 3)
  })
})
