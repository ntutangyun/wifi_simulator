/**
 * The editor says the schema's sentence about a tampered driver, and does not own a second one.
 *
 * Same discipline as `selectivity-switch.test.ts` point 2, and the same reason: a panel that
 * paraphrases a refusal and a schema that refuses are two wordings of one rule, and the one that
 * drifts is always the one the user reads. `driverRefusalsFor` (src/model/scenario.ts) is the
 * single copy; `FloorPlanEditor.tsx` renders exactly what it returns.
 *
 * **Why this file reads the component's SOURCE rather than rendering it.** There is no DOM test
 * harness in this repository for `FloorPlanEditor` — it is a canvas-driven component wired to a
 * UI context — and the claim is not about layout. It is that the editor holds no second copy of
 * these sentences, which is a claim about the text of the file: the same shape
 * `tests/course/limits.test.ts` uses for its "leave a ruler in your own test file" check, and
 * weak on purpose. It cannot tell a good rendering from a bad one; it can tell that the wording
 * has exactly one home, which is the failure this rule was written to avoid.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  TAMPER_PRESETS, defaultScenario, driverRefusalsFor, type NodeCfg, type Scenario,
} from '../../src/model/scenario'

const EDITOR = new URL('../../src/editor/FloorPlanEditor.tsx', import.meta.url)
const source = (): string => readFileSync(EDITOR, 'utf8')

/** The stock plan with the game-mode boolean on a station, which the engine never reads there. */
function accelOnSta(): { sc: Scenario; n: NodeCfg } {
  const base = defaultScenario()
  const n: NodeCfg = { ...base.nodes[1], gameAccel: true }
  return { sc: { ...base, nodes: [base.nodes[0], n, base.nodes[2]] }, n }
}

/** The stock plan with a preset on the access point, which `simulation.ts` drops on the way in. */
function tamperOnAp(): { sc: Scenario; n: NodeCfg } {
  const base = defaultScenario()
  const n: NodeCfg = { ...base.nodes[0], tamper: { ...TAMPER_PRESETS.greedy } }
  return { sc: { ...base, nodes: [n, base.nodes[1], base.nodes[2]] }, n }
}

describe('the node panel speaks the schema’s own refusal', () => {
  it('renders whatever `driverRefusalsFor` returns, for the selected node', () => {
    const src = source()
    expect(src, 'the panel reads the single copy of the rules').toContain('driverRefusalsFor(scenario, selNode)')
    expect(src, 'and imports it from the model rather than re-deriving it').toContain('driverRefusalsFor')
  })

  /**
   * The anti-drift check. Each refusal is a long sentence; if the component held its own copy,
   * some distinctive run of it would appear in the component's text. None does — the component
   * only names the function.
   */
  it('holds no second wording of any of the three sentences', () => {
    const src = source()
    const sentences = [...driverRefusalsFor(accelOnSta().sc, accelOnSta().n),
      ...driverRefusalsFor(tamperOnAp().sc, tamperOnAp().n)]
    expect(sentences.length, 'the fixtures above really do raise refusals').toBe(2)
    for (const why of sentences) {
      // a distinctive 12-character run of each sentence, which a paraphrase would not reproduce
      const probe = why.slice(0, 12)
      expect(src.includes(probe), `the editor carries its own copy of 「${probe}…」`).toBe(false)
    }
  })

  /**
   * And the sentences are worth rendering: each one names the field the user clicked and tells
   * them where it belongs. A refusal that only says "invalid" sends the reader to the source.
   */
  it('says which field it is about and what to do instead', () => {
    const accel = driverRefusalsFor(accelOnSta().sc, accelOnSta().n)
    expect(accel.length).toBe(1)
    expect(accel[0]).toContain('gameAccel')
    expect(accel[0]).toContain('接入点')
    const tamper = driverRefusalsFor(tamperOnAp().sc, tamperOnAp().n)
    expect(tamper.length).toBe(1)
    expect(tamper[0]).toContain('tamper')
    expect(tamper[0]).toContain('站点')
    // a node with nothing wrong gets nothing printed beside its controls
    const clean = defaultScenario()
    for (const n of clean.nodes) expect(driverRefusalsFor(clean, n)).toEqual([])
  })
})
