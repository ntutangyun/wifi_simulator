### Task 1: Phase model, config, anchor behaviour, records, view, overlay, editor

**Files:** create `src/uwb/aoa.ts`; modify `src/model/scenario.ts` (`UwbNodeCfg.yawDeg?`, `UwbSessionCfg.aoa`), `src/uwb/device.ts`, `src/uwb/network.ts`, `src/uwb/records.ts`, `src/uwb/view.ts`, `src/uwb/format.ts`, `src/uwb/ui/rows.ts`, `src/uwb/ui/UwbInspector.tsx`, `src/uwb/ui/UwbNodeFields.tsx`, `src/uwb/ui/UwbSessionFields.tsx`, `src/uwb/scene.ts`, `src/ui/i18n.ts`; tests `tests/uwb/aoa.test.ts`, `tests/uwb/network.test.ts` (+4), `tests/uwb/view.test.ts` (+1), `tests/uwb/scene.test.ts` (+1), `tests/ui/uwb-format.test.ts` (+1), `tests/editor/*` (+1).

**Interfaces:**

```ts
// src/uwb/aoa.ts
export const AOA_SIGMA_PHI_RAD = 0.15                                        // model
export function wavelengthM(ch: UwbChannelNo): number                        // c / f: 0.0375 (9), 0.0462 (5)
export function antennaSpacingM(ch: UwbChannelNo): number                    // λ / 2
/** True azimuth of `to` seen from `from` relative to boresight `yawDeg`, wrapped to (−180, 180]. */
export function trueAzimuthDeg(from: Vec3, yawDeg: number, to: Vec3): number
/** Phase difference for a true azimuth: 2π·(d/λ)·sin θ; behind the anchor (|θ| > 90°) the geometry mirrors: sin(180° − θ) = sin θ. */
export function pdoaRad(thetaDeg: number, ch: UwbChannelNo): number
/** Estimated azimuth from a measured phase difference, clamped to ±90°. */
export function azimuthFromPdoaDeg(phiRad: number, ch: UwbChannelNo): number
export function aoaSigmaDeg(thetaDeg: number): number                        // σ_φ / (π·cos θ) in degrees (∞ near ±90 → clamp at 45°)
// scenario.ts: UwbNodeCfg.yawDeg?: number (anchors; default 0; schema −180…180); UwbSessionCfg.aoa: boolean (default false).
// records.ts: { type: 'UWB_AOA'; node: string; peer: string; thetaDeg: number; trueThetaDeg: number; block: number; round: number }
//   UWB_POSITION gains `method` ('twr' | 'dl-tdoa' | 'ul-tdoa' | 'aoa') if slice 5 has not added it yet, and optional `of`.
// device.ts (anchor, session.aoa): on each response received from a tag: theta = trueAzimuthDeg(anchor, yaw, tag); phi = pdoaRad(theta) + gaussian·σ_φ;
//   thetaHat = azimuthFromPdoaDeg(phi); emit UWB_AOA; when the anchor also has this round's range to the tag (SS: none — the anchor has no range in SS;
//   DS: after the Final it has one) emit UWB_POSITION { node: anchor, method: 'aoa', of: tag, x = ax + r·cos(yaw + thetaHat), y = ay + r·sin(…),
//   gdop: 1, ellipse: { a: max(σ_r, r·σ_θ), b: min(…), thetaRad: bearing or bearing + π/2 accordingly }, anchors: [anchor] }.
// view.ts: UwbNodeView.aoa: Record<peer, { thetaDeg; trueThetaDeg; n }>; `of` routing of the position to the tag lane (if slice 5 has not added it, add it here).
// format.ts: `${node} AoA ← ${peer}: ${thetaDeg.toFixed(1)}° (true ${trueThetaDeg.toFixed(1)}°)`; inspector rows; scene: a bearing line from the anchor at yaw + thetaHat, length r, amber, ageing like rings; editor: yaw field on anchors, AoA checkbox in the session section.
```

- [ ] Tests: model closed forms (λ, d, pdoa at 0/30/90°, inverse, σ_θ at 0 → 2.73°, mirror behind); a DS scene with one anchor facing the room and one tag at 45°/4 m: `UWB_AOA` within 4σ_θ of the truth (pin the measured value), a `UWB_POSITION { method: 'aoa' }` on the anchor lane routed to the tag lane, error consistent with `r·σ_θ` across; a tag behind the anchor is mirrored; `aoa: false` byte-identical (fixture untouched); overlay bearing line present; editor fields round-trip.
- [ ] Commit `feat(uwb): angle of arrival — PDoA model, anchor bearings, single-anchor fixes, overlay and editor`.

---

