/**
 * A failed load or import comes back as sentences, not as a serialised `ZodError`.
 *
 * **Why this is a test and not a style note.** The two handlers rendered `String(err)`, which for
 * a `ZodError` is the whole issue array as JSON. That was survivable while the schema's messages
 * were short; the tampered-driver rules of 2026-10-05 made them long — the longest runs past 200
 * characters and names three fields and two remedies — so the same renderer started emitting
 * something nobody reads. The slice that made the sentences long is the slice that owes the
 * rendering.
 *
 * The two things that have to hold at once, and they pull in opposite directions:
 *  - **our own sentences must read at a glance.** A `custom` issue is a complete Chinese sentence
 *    that already names the node and the field; its `path` is a routing tag (`['nodes']`,
 *    `['uwb']`) and printing it is noise.
 *  - **zod's own issues must not lose their locating information.** "Expected number, received
 *    string" is useless on its own, so those keep `path: message`, with array indices spelled
 *    `nodes[0].caps.generation` the way a person would say it.
 */
import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'
import { scenarioFromJson, scenarioLoadIssues, scenarioToJson } from '../../src/editor/planOps'
import { TAMPER_PRESETS, defaultScenario, type Scenario } from '../../src/model/scenario'

/** The failure, caught, exactly as the editor's handlers catch it. */
function caught(json: string): unknown {
  try {
    scenarioFromJson(json)
    throw new Error('expected this plan to be refused')
  } catch (e) {
    return e
  }
}

/** A plan that breaks two of this slice's three rules at once. */
function twoRefusals(): string {
  const base = defaultScenario()
  const nodes = base.nodes.map((n) => (n.kind === 'ap'
    ? { ...n, tamper: { ...TAMPER_PRESETS.greedy } }
    : { ...n, gameAccel: true }))
  return scenarioToJson({ ...base, nodes } as Scenario)
}

describe('a refused plan is rendered as sentences', () => {
  it('prints one line per reason, and nothing around them', () => {
    const lines = scenarioLoadIssues(caught(twoRefusals()))
    expect(lines.length, 'one AP-side tamper and two station-side game-mode booleans').toBe(3)
    for (const line of lines) {
      expect(line, 'a serialised issue object leaked into the line').not.toContain('"code"')
      expect(line).not.toContain('"path"')
      expect(line).not.toContain('"message"')
      expect(line.startsWith('['), 'the whole array was stringified').toBe(false)
    }
    expect(lines.some((l) => l.includes('tamper'))).toBe(true)
    expect(lines.some((l) => l.includes('gameAccel'))).toBe(true)
  })

  /** The regression in its own right: `String(err)` is what this replaced, and it is unreadable. */
  it('is not what `String(err)` gives, which is the whole array as JSON', () => {
    const err = caught(twoRefusals())
    expect(err).toBeInstanceOf(ZodError)
    expect(String(err)).toContain('"code"')
    expect(scenarioLoadIssues(err).join('\n')).not.toContain('"code"')
  })

  /** A `custom` issue is already a whole sentence; its `path` is a routing tag, not a location. */
  it('leaves a custom issue’s routing path off the line', () => {
    const lines = scenarioLoadIssues(caught(twoRefusals()))
    for (const line of lines) expect(line.startsWith('nodes'), line.slice(0, 20)).toBe(false)
  })

  /** zod's own issue is useless without the where, so the where stays — and reads like a path. */
  it('keeps the location on an issue zod generated itself', () => {
    const bad = defaultScenario() as unknown as { nodes: { caps: { generation: string } }[] }
    bad.nodes[1].caps.generation = 'wifi9'
    const lines = scenarioLoadIssues(caught(JSON.stringify(bad)))
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0], 'array indices are written the way a person says them').toContain('nodes[1].caps.generation')
    expect(lines[0]).toContain('：')
  })

  /** A file that is not JSON at all still gets one readable line rather than a stack trace. */
  it('says a malformed file is malformed, in a sentence', () => {
    const lines = scenarioLoadIssues(caught('{ this is not json'))
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('不是合法的 JSON')
  })

  /** And anything else still arrives as exactly one line, so the caller renders one list. */
  it('turns any other failure into a single line', () => {
    expect(scenarioLoadIssues(new Error('boom'))).toEqual(['Error: boom'])
    expect(scenarioLoadIssues('plain').length).toBe(1)
  })
})
