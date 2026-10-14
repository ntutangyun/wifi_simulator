/**
 * **The spine is the only hand-authored thing in `src/course/featureGraph.ts`, so it is the only
 * thing here that can be wrong on its own.** The rows come out of the two coverage documents at
 * build time, which is why no test here checks a figure: the documents' own tests
 * (`wifi-coverage.test.ts`, `uwb-coverage.test.ts`) already pin their totals against their own
 * rows, and this file would only be a third copy.
 *
 * What it pins instead is that the picture is COMPLETE:
 *
 *  1. the browser parser and the test-side parser find the same rows in both documents — they
 *     cannot be one function (one reads the file system) and they must not drift;
 *  2. every row lands in exactly one group, so a row added to a document cannot quietly fall out
 *     of the graph;
 *  3. no group is empty, so a group left behind by a document's reorganisation shows up here;
 *  4. **every lesson of the track is claimed by some group.** On 2026-10-14 the UWB table turned
 *     out never to mention `@uwb-ancillary-request` or `@uwb-ancillary-loss` — the engine had run
 *     nine days ahead of its own coverage table, and nothing noticed. This is the assertion that
 *     would have.
 */
import { describe, it, expect } from 'vitest'
import { DOCS, DOC_PATH, SPINE, graphFor, parseCoverage, wrapCjk, type Track } from '../../src/course/featureGraph'
import { LESSONS } from '../../src/course/lessons'
import { trackOf } from '../../src/course/curriculum'
import { dataRows, readDoc } from './coverage'

const HEAD: Record<Track, readonly string[]> = {
  wifi: ['特性', '标准依据', '本仿真器', '位置与证据'],
  uwb: ['特性', '标准状态', '本仿真器', '位置与证据'],
}
const TRACKS: Track[] = ['wifi', 'uwb']

describe.each(TRACKS)('%s: the graph is built from the document, not from a copy', (track) => {
  const graph = graphFor(track)

  it('parses the same rows the coverage test parses', () => {
    const mine = parseCoverage(DOCS[track])
    const theirs = dataRows(readDoc(DOC_PATH[track]), HEAD[track])
    expect(mine.length, `${DOC_PATH[track]}: two parsers, two answers`).toBe(theirs.length)
    expect(mine.map((r) => r.feature)).toEqual(theirs.map((r) => r[0]))
  })

  it('reads the document the repository has, not one baked in', () => {
    // The `?raw` import is the whole point: edit the document, and this changes with it.
    expect(DOCS[track]).toBe(readDoc(DOC_PATH[track]))
  })

  it('places every row in exactly one group', () => {
    expect(graph.misplaced, graph.misplaced.map((m) =>
      `「${m.feature.slice(0, 36)}」 → ${m.groups.length === 0 ? 'no group' : m.groups.join(', ')}`)
      .join('\n')).toEqual([])
    expect(graph.groups.reduce((n, g) => n + g.rows.length, 0)).toBe(graph.rows.length)
  })

  it('has no empty group', () => {
    expect(graph.groups.filter((g) => g.rows.length === 0).map((g) => g.id)).toEqual([])
  })

  it('names only groups that exist in its dependencies', () => {
    const ids = new Set(SPINE[track].map((g) => g.id))
    for (const g of SPINE[track]) {
      for (const n of g.needs) expect(ids, `${g.id} needs ${n}`).toContain(n)
    }
  })

  it('draws every group and every dependency', () => {
    expect(graph.boxes.length).toBe(graph.groups.length)
    expect(graph.edges.length).toBe(SPINE[track].reduce((n, g) => n + g.needs.length, 0))
  })

  it('counts what it draws, rather than restating the document', () => {
    expect(graph.engineCounts.reduce((n, [, c]) => n + c, 0)).toBe(graph.rows.length)
    expect(graph.statusCounts.reduce((n, [, c]) => n + c, 0)).toBe(graph.rows.length)
  })
})

const idsOf = (track: Track): string[] =>
  LESSONS.filter((l) => trackOf(l) === track).map((l) => l.id)

describe('a lesson no coverage row cites', () => {
  /**
   * **The UWB table enumerates its subject, so this list has to be empty.** It was not, between
   * 2026-10-05 and 2026-10-14: `@uwb-ancillary-request` shipped 49 minutes after the row that
   * called its clause 「仍未建」, and `@uwb-ancillary-loss` was split out six days later. Nothing
   * noticed, because the table's own test pins that cited symbols exist and not that an uncited
   * lesson is missing. This is that assertion.
   */
  it('uwb: none', () => {
    expect(graphFor('uwb', idsOf('uwb')).orphanLessons).toEqual([])
  })

  /**
   * **The Wi-Fi table does not enumerate its subject**, and says so in its scope section, so here
   * the list is pinned rather than emptied — a new name in it is a question worth asking, and
   * these eight have answers:
   *
   *  - `@tier1-project`, `@tier1-project-review` — a project and its review. Neither teaches a
   *    feature; they ask the reader to predict what the features already in the table do.
   *  - `@bianchi-vs-sim`, `@rate-vs-model` — a model held against the simulator. The feature rows
   *    they lean on are cited from the lessons that teach those features.
   *  - `@claim-to-contribution` — what a measurement has to become to be submitted. Its subject
   *    is another lesson's number, not a feature of the radio.
   *  - `@frame-qos-fcs`, `@edca-cost` — second lessons of a feature whose rows cite the first
   *    (`@frame-anatomy`, `@edca`).
   *  - `@uhr-rate-ladder` — **the one that is a real gap**: the engine grew a fifth generation
   *    (`'uhr'`, 2026-10-10) and the Wi-Fi table has no feature row for it. The document knows
   *    the lesson exists — §15's roadmap names it — but §六's PHY-parameter rows stop at EHT.
   */
  it('wifi: these eight, and no ninth', () => {
    expect(graphFor('wifi', idsOf('wifi')).orphanLessons).toEqual([
      'frame-qos-fcs', 'bianchi-vs-sim', 'rate-vs-model', 'tier1-project',
      'tier1-project-review', 'edca-cost', 'uhr-rate-ladder', 'claim-to-contribution',
    ])
  })
})

describe('wrapCjk measures the box in pixels, not in characters', () => {
  it('wraps full-width text at the character count the box holds', () => {
    expect(wrapCjk('一二三四五', 3, 2)).toEqual(['一二三', '四五'])
  })

  it('fits more of a Latin string on the same line', () => {
    expect(wrapCjk('abcdefgh', 3, 2)[0]!.length).toBeGreaterThan(3)
  })

  it('marks a truncation rather than ending mid-word in silence', () => {
    const out = wrapCjk('一二三四五六七八九十', 2, 2)
    expect(out).toHaveLength(2)
    expect(out[1]!.endsWith('…')).toBe(true)
  })

  it('leaves a string that fits exactly alone', () => {
    expect(wrapCjk('一二', 2, 2)).toEqual(['一二'])
  })
})
