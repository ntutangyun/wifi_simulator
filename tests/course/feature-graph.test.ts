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
import {
  BASELINE, DOCS, DOC_CORPORA, DOC_META_AT, DOC_META_MISSING, DOC_PATH, SPINE, UNDATED, graphFor,
  creditsOrgs, parseCoverage, quarterOf, type Track,
} from '../../src/course/featureGraph'
import docMeta from '../../src/course/docMeta.json'
import lessonMeta from '../../src/course/lessonMeta.json'
import orgLogos from '../../src/course/orgLogos.json'
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

  /**
   * **Every feature says what it is, in the map's own words.**
   *
   * `intro` is the one field here that is neither read off a coverage document nor computed from
   * the corpus, so it is the one field that can be missing without anything else noticing — a
   * column whose panel opens on 「what is a sub-round?」 and answers with a clause number. The
   * length floor is what stops a placeholder passing as an answer.
   *
   * It also may not quote: this repository carries no standards text, and a sentence lifted out
   * of a draft would be a copy of member-only material sitting in a UI string. Two markers of
   * that are cheap to test — a run of English long enough to be a lifted sentence, and the
   * quotation marks a copied line usually arrives in.
   */
  it('introduces every feature, in its own words', () => {
    for (const g of graph.groups) {
      expect(g.intro.length, `${g.id}: no introduction`).toBeGreaterThan(40)
      expect(g.intro, `${g.id}: ends mid-sentence`).toMatch(/[。」）]$/)
      expect(/[A-Za-z][A-Za-z ,.'-]{70,}/.test(g.intro),
        `${g.id}: a long run of English reads like a sentence lifted from a draft`).toBe(false)
      expect(g.intro.includes('“') || g.intro.includes('"'),
        `${g.id}: quoted text — paraphrase instead`).toBe(false)
    }
    // The same text twice would mean a copy-paste that left one feature describing another.
    const seen = new Set(graph.groups.map((g) => g.intro))
    expect(seen.size, 'two features share an introduction').toBe(graph.groups.length)
  })

  /**
   * **A document's own marks follow the same rule the group's list does.**
   *
   * The group's company list drops the task group's own paperwork, because counting it made the
   * secretary's employer the top contributor to nearly every feature. Each document ALSO draws
   * its marks on its own line, and for three iterations those lines went on printing that same
   * name on an agenda and on a set of minutes — the aggregate was right and every row of it was
   * wrong. `creditsOrgs` is the one rule; this is the assertion that it covers both.
   */
  it('credits a company for a contribution and never for the group’s own paperwork', () => {
    const PAPERWORK = ['agenda', 'closing-report', 'minutes', 'process', 'motion-dock',
      'timeline', 'comments-sheet']
    for (const k of PAPERWORK) expect(creditsOrgs(k), k).toBe(false)
    for (const k of ['proposal', 'cr', 'pdt', 'sfd', 'draft']) expect(creditsOrgs(k), k).toBe(true)
    // And the aggregate is exactly the documents that pass it.
    for (const g of graph.groups) {
      const named = new Set(g.docs.filter((d) => creditsOrgs(d.kind)).flatMap((d) => d.orgs))
      expect(g.orgs.map((o) => o.name).sort(), `${g.id}`).toEqual([...named].sort())
    }
  })

  /**
   * **Each sub-feature gets its own documents, and they are that row's own.**
   *
   * The column's timeline is the union of its rows; the panel now prints the per-row cut under
   * each sub-feature, and the way that could quietly lie is by handing a row the column's whole
   * list — which reads perfectly and says 「this one line was argued twenty-five times」.
   */
  it('gives every sub-feature the documents that row itself cites', () => {
    for (const g of graph.groups) {
      expect(g.rowDetails.map((d) => d.row.feature)).toEqual(g.rows.map((r) => r.feature))
      for (const d of g.rowDetails) {
        expect(d.docs.map((x) => x.dcn).sort(),
          `${g.id}/${d.row.feature.slice(0, 20)}: not this row's own citations`)
          .toEqual(d.row.dcns.filter((n) => n in docMeta.docs).sort())
        expect(d.docs.map((x) => x.date), `${g.id}: out of order`)
          .toEqual([...d.docs.map((x) => x.date)].sort())
      }
      // Every row's documents are a subset of the column's, except where a published row's
      // citations are kept out of the column by `datesFrom` — never the other way round.
      const all = new Set(g.docs.map((d) => d.dcn))
      const extra = g.rowDetails.flatMap((d) => d.docs.map((x) => x.dcn))
        .filter((dcn) => !all.has(dcn))
      expect([...new Set(extra)].every((dcn) => g.rows.some((r) =>
        r.dcns.includes(dcn) && r.statusKind === 'published')),
      `${g.id}: a row cites ${extra.join(',')}, which the column does not`).toBe(true)
    }
  })

  it('names only groups that exist in its dependencies', () => {
    const ids = new Set(SPINE[track].map((g) => g.id))
    for (const g of SPINE[track]) {
      for (const n of g.needs) expect(ids, `${g.id} needs ${n.id}`).toContain(n.id)
    }
  })

  /**
   * **The rule the spine is held to: an edge is a feature dependency, and it says why.**
   *
   * The first spine drawn here mixed two graphs — what a feature requires, and the order a reader
   * meets things in — and the giveaway was that several edges had no reason anyone could write
   * (`grid` did not need `shapes`; a slot grid exists whatever the reply time rides in). Requiring
   * a reason per edge is cheap and it is what keeps the two apart, so it is asserted rather than
   * trusted: an edge whose reason is missing or a stub does not get to be in the picture.
   */
  it('gives every dependency a reason, in the lesson’s own language', () => {
    for (const g of SPINE[track]) {
      for (const n of g.needs) {
        expect(n.why.length, `${g.id} needs ${n.id}: no reason given`).toBeGreaterThan(8)
        expect(n.why, `${g.id} needs ${n.id}: the reason is about the course, not the feature`)
          .not.toMatch(/先学|讲完|这一课之后|读者先/)
      }
    }
  })

  /**
   * **A column may not write down what its own bar already counts.** The header draws a stacked
   * bar from its rows, so a verdict spelled out in the title is a second, hand-written copy — on
   * 2026-10-14 the two disagreed: `recover` was titled 「出错之后：三节全建」 while §八's three rows
   * are 已建模 2 and 部分建模 1 (辅助信息 §10.35 — Request = 0 built, the bit layout and the message
   * content not). Renamed to what the feature IS; this is the assertion that keeps a verdict out of
   * a name, since a name does not move when the engine does.
   *
   * 「缺席」 is the one verdict a title may carry, because a group in the `absent` family exists in
   * order to say so — and then it has to be true of every row.
   */
  it('leaves the verdict to the bar, except an absence that is total', () => {
    for (const g of graph.groups) {
      for (const [what, text] of [['title', g.title], ['note', g.note]] as const) {
        expect(text, `${g.id}: the ${what} counts what the bar already counts`)
          .not.toMatch(/全建|都建了|全部建|全没建/)
      }
      if (/缺席/.test(g.title)) {
        expect(g.rows.filter((r) => r.engine !== '未建模').map((r) => r.feature.slice(0, 24)),
          `${g.id}: 「缺席」 is claimed, and these rows are not 未建模`).toEqual([])
        expect(g.family, `${g.id}: 「缺席」 belongs to the absent family`).toBe('absent')
      }
    }
  })

  it('has no cycle, so a dependency chain has an end', () => {
    const byId = new Map(SPINE[track].map((g) => [g.id, g]))
    const walk = (id: string, path: string[]): void => {
      for (const n of byId.get(id)?.needs ?? []) {
        expect(path, `cycle: ${[...path, id, n.id].join(' → ')}`).not.toContain(n.id)
        walk(n.id, [...path, id])
      }
    }
    for (const g of SPINE[track]) walk(g.id, [])
  })

  /**
   * The depth is still the longest dependency chain, and it still orders a band from left to
   * right — it just no longer decides the row. Asserting it separately from the drawing is the
   * point: the column rule used to BE this assertion, and when the layout turned on its side
   * nothing would have noticed the spine's own order quietly breaking.
   */
  it('keeps every group deeper than everything it needs', () => {
    const depth = new Map(graph.groups.map((g) => [g.id, g.depth]))
    for (const g of graph.groups) {
      for (const n of g.needs) {
        expect(depth.get(n.id)!, `${n.id} must be shallower than ${g.id}`)
          .toBeLessThan(depth.get(g.id)!)
      }
    }
    expect(graph.groups.filter((g) => g.needs.length === 0).every((g) => g.depth === 0)).toBe(true)
  })

  /**
   * **A section of the document is not a feature.**
   *
   * §十四 of the UWB table is a heading with twelve rows under it — the compact frame, hyper block
   * mode, discovery and association, PHY parameter negotiation, the wake-up radio, offload to the
   * narrowband radio, the ranging support service, the LE UWB PHY, streaming — and for one picture
   * it was one column titled 「4ab 的其余整块」. That column made the widest claim on the screen:
   * that these twelve rows are one thing, with one history and one set of dependencies. They are
   * not, and their own citations say so: the streaming row argues from the 2021 PAR, while the
   * compact frame's security was still being voted through in 2026.
   *
   * So this holds the split in place. Every row of that section must land in one of these eight
   * groups, each group must be `absent` (the section exists to list what this repository decided
   * not to build), and **no group may mix in a row from anywhere else** — which is what would
   * happen if a `has()` pattern here started matching a row of §十一 or §十二.
   */
  it('splits the document’s catch-all section into the features it holds', () => {
    const REST = ['compact', 'hyperblock', 'assoc', 'wur', 'offload', 'rss', 'leuwb', 'stream']
    const inSection = graph.rows.filter((r) => r.section.startsWith('十四'))
    if (track !== 'uwb') {
      // Not a free pass for the other track: these ids are the UWB spine's, and a Wi-Fi group
      // answering to one of them would mean this list had drifted onto the wrong document.
      expect(graph.groups.filter((g) => REST.includes(g.id)).map((g) => g.id)).toEqual([])
      return
    }
    expect(inSection.length, 'the catch-all section lost its rows').toBeGreaterThan(10)
    const placed = graph.groups.filter((g) => REST.includes(g.id))
    expect(placed.map((g) => g.id).sort(), 'a group of the split went missing').toEqual([...REST].sort())
    expect(placed.flatMap((g) => g.rows).length, 'the split drops or doubles a row')
      .toBe(inSection.length)
    for (const g of placed) {
      expect(g.rows.length, `${g.id}: empty`).toBeGreaterThan(0)
      expect(g.family, `${g.id}`).toBe('absent')
      expect(g.rows.filter((r) => !r.section.startsWith('十四')).map((r) => r.feature),
        `${g.id}: swallowed a row from another section`).toEqual([])
    }
  })

  /**
   * **The claim the layout makes: a feature is built on features that came first.**
   *
   * Columns are ordered by the row of their first event, so a dependency must not start to the
   * RIGHT of the feature that needs it — that would say a feature was built on something tabled
   * later, and one of the two would be wrong. On 2026-10-15, with the dates read off 70 cited
   * documents and 91 lesson files, **there is not one** on either track.
   *
   * Same column is fine and common: 17 of the 27 UWB features share the published row, which has
   * no dates inside it at all.
   */
  it('never puts a dependency after the feature that needs it', () => {
    const at = new Map(graph.columns.map((c, i) => [c.group.id, i]))
    const late: string[] = []
    for (const [i, c] of graph.columns.entries()) {
      for (const n of c.group.needs) {
        const j = at.get(n.id)
        if (j !== undefined && j > i) {
          late.push(`${c.group.title}（${c.group.since ?? c.group.era}）needs `
            + `${n.id}（${graph.groups.find((x) => x.id === n.id)?.since ?? 'baseline'}）`)
        }
      }
    }
    expect(late).toEqual([])
  })

  /**
   * The matrix's own geometry: an event lands in the row its date belongs to, the lane covers
   * every event of its column, and a quarter nobody wrote in is still a row.
   */
  it('puts every event in the row its own date names', () => {
    const rowKey = graph.matrixRows.map((r) => r.key)
    expect(rowKey[0], 'the published row is above every quarter')
      .toBe(graph.columns.some((c) => c.events.some((e) => e.kind === 'published'))
        ? BASELINE : rowKey[0])
    const years = rowKey.filter((k) => k !== BASELINE)
    expect(years, 'quarters run end to end — an idle quarter is a row, not a gap').toEqual(
      years.length === 0 ? [] : Array.from({ length: years.length }, (_, i) => {
        const y0 = Number(years[0]!.slice(0, 4))
        const q0 = Number(years[0]!.slice(5))
        return `${y0 + Math.floor((q0 - 1 + i) / 4)}Q${((q0 - 1 + i) % 4) + 1}`
      }))

    for (const c of graph.columns) {
      for (const e of c.events) {
        expect(rowKey[e.row], `${c.group.id}: ${e.label} is in the wrong row`)
          .toBe(e.kind === 'published' ? BASELINE : quarterOf(e.date))
        expect(e.row, `${c.group.id}: ${e.label} outside its own lane`)
          .toBeGreaterThanOrEqual(c.firstRow)
        expect(e.row).toBeLessThanOrEqual(c.lastRow)
      }
      expect(c.events.map((e) => e.row), `${c.group.id}: events out of order`)
        .toEqual([...c.events.map((e) => e.row)].sort((x, y) => x - y))
    }
    // Every row states how many events it holds, and the UI thins the empty ones on that number.
    for (const [i, r] of graph.matrixRows.entries()) {
      expect(r.events, `row ${r.key} miscounts itself`)
        .toBe(graph.columns.reduce((n, c) => n + c.events.filter((e) => e.row === i).length, 0))
    }
  })

  it('gives every group exactly one column', () => {
    expect(graph.columns.length).toBe(graph.groups.length)
    expect([...new Set(graph.columns.map((c) => c.group.id))].length).toBe(graph.groups.length)
    // Left to right: the row a column's first event lands in, never decreasing — and a column
    // with no event at all is 「never」, which belongs at the right end and not before 2021.
    const firsts = graph.columns.map((c) => (c.firstRow < 0 ? Infinity : c.firstRow))
    expect(firsts).toEqual([...firsts].sort((a, b) => a - b))
  })

  /**
   * **An empty column says something, and it may only say that one thing.**
   *
   * A column holds no event exactly when the coverage table files its rows as having no clause to
   * point at and no document number to cite (`UNDATED`: positioning, the UWB fading model, DL/UL
   * TDoA, AoA/PDoA). Any other empty column would be a feature whose citations stopped resolving
   * — a hole in `docMeta.json` drawn as a blank lane, which is the one way this picture could lie
   * quietly. The lessons used to fill those lanes with a green block each; they are links in the
   * panel now, so the blankness is load-bearing and gets an assertion.
   */
  it('leaves a column empty only when nothing in these corpora dates it', () => {
    for (const c of graph.columns) {
      expect(c.events.length === 0, `${c.group.id}: ${c.events.length} events, era ${c.group.era}`)
        .toBe(c.group.era === UNDATED)
      expect(c.events.some((e) => e.label.startsWith('@')),
        `${c.group.id}: a lesson is in the grid again — it belongs in the panel`).toBe(false)
    }
  })

  /**
   * **A published row may not date anything.** §九 of the UWB table argues about the HRP PHY of
   * IEEE Std 802.15.4-2024 and cites a 2026 PICS contribution for its clause numbers; the rule
   * that keeps the 2007 radio out of 2026 is worth an assertion, because it is invisible in the
   * output — a wrong answer here looks like a tidy picture.
   */
  it('dates a group from draft rows only, and gives a draft row a document to be dated by', () => {
    for (const g of graph.groups) {
      const dating = g.rows.filter((r) => r.statusKind !== 'published' || r.status.includes('草案'))
      if (g.since !== null) {
        expect(dating.flatMap((r) => r.dcns).length, `${g.id} is dated but cites nothing`)
          .toBeGreaterThan(0)
        expect(g.until!.localeCompare(g.since), `${g.id}: since after until`)
          .toBeGreaterThanOrEqual(0)
      }
      if (g.family === 'draft') {
        expect(g.since, `${g.id} is a draft feature and must cite a contribution`).not.toBeNull()
      }
    }
  })

  /**
   * The group's own paperwork is evidence of WHEN, never of WHO: an agenda, minutes, a closing
   * report and the comment spreadsheet are written by the chair, the secretary and the technical
   * editor. The first cut of these chips counted them, and the chair came out as the biggest
   * contributor to every feature in the draft.
   */
  it('takes companies from contributions, not from the group’s own paperwork', () => {
    const PAPER = new Set(['agenda', 'closing-report', 'minutes', 'process', 'motion-dock',
      'timeline', 'comments-sheet'])
    for (const g of graph.groups) {
      const fromPaper = new Set(g.docs.filter((d) => PAPER.has(d.kind)).flatMap((d) => d.orgs))
      const fromWork = new Set(g.docs.filter((d) => !PAPER.has(d.kind)).flatMap((d) => d.orgs))
      for (const o of g.orgs) {
        expect(fromWork, `${g.id}: ${o.name} is only on paperwork`).toContain(o.name)
      }
      for (const o of fromPaper) {
        if (!fromWork.has(o)) {
          expect(g.orgs.map((x) => x.name), `${g.id}: ${o} came from paperwork alone`)
            .not.toContain(o)
        }
      }
    }
  })

  it('carries every dependency, with its reason', () => {
    expect(graph.edges.length).toBe(SPINE[track].reduce((n, g) => n + g.needs.length, 0))
    expect(graph.edges.every((e) => e.why.length > 8)).toBe(true)
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

/**
 * **`src/course/docMeta.json` is the one file here whose source is outside the repository**, so it
 * is the one that can go stale without anything in a diff. These assertions are what makes a
 * forgotten `npx vite-node scripts/doc-meta.ts` a red test rather than a box with no date.
 */
describe('the document metadata behind the time axis', () => {
  const DCN = /\b(1[15]-\d\d\/\d{4})(?:r\d+)?/g

  it('has an entry for every document either coverage table cites', () => {
    const cited = new Set<string>()
    for (const track of TRACKS) {
      for (const m of DOCS[track].matchAll(DCN)) cited.add(m[1]!)
    }
    const have = new Set(Object.keys(docMeta.docs))
    expect([...cited].filter((d) => !have.has(d) && !DOC_META_MISSING.includes(d)),
      'a citation with no metadata: run `npx vite-node scripts/doc-meta.ts`').toEqual([])
    // And nothing stale in the other direction: a document nobody cites is dead weight.
    expect([...have].filter((d) => !cited.has(d))).toEqual([])
    expect(docMeta.cited).toBe(cited.size)
  })

  it('found all of them, and says so', () => {
    expect(DOC_META_MISSING, 'a cited document no mirror held — the picture dates it by nothing')
      .toEqual([])
    expect(DOC_CORPORA.length).toBeGreaterThanOrEqual(1)
    expect(DOC_META_AT).toMatch(/^\d{4}-\d\d-\d\d$/)
  })

  it('holds one spelling per company', () => {
    // The shapes that mean a missed alias in `scripts/doc-meta.ts`: the same company arriving
    // twice under two spellings would draw two chips and claim a participant that is not there.
    const bad = [...new Set(Object.values(docMeta.docs).flatMap((d) => d.orgs))]
      .filter((o) => /\bet al\b|,? Inc\.?$|Technologies$|Semiconductor$|Electronics$|^self/.test(o))
    expect(bad, 'normalise these in scripts/doc-meta.ts#ALIAS').toEqual([])
  })

  /**
   * **The gist is counted, and a count can be checked.** Every figure a block prints comes from
   * here, so this is where a regex that started matching version numbers or vote percentages
   * (「802.15.4」 → 15.4, 「Draft 4.0」 → 4.0, 「67.8%」 → 67.8 — all three happened) gets caught.
   */
  it('gives a gist that is counted, not quoted', () => {
    const CHAPTERS = new Set(['8', '10', '11', '12', '13', '16', '19'])
    for (const [dcn, d] of Object.entries(docMeta.docs)) {
      const g = d.gist as {
        clause?: string; cids?: number; acc?: number; rev?: number; rej?: number
      }
      expect(Object.keys(g).every((k) => ['clause', 'cids', 'acc', 'rev', 'rej'].includes(k)),
        `${dcn}: ${Object.keys(g).join(',')}`).toBe(true)
      if (g.clause !== undefined) {
        expect(g.clause, `${dcn}: not a clause number`).toMatch(/^\d{1,2}(\.\d+)+$/)
        expect(CHAPTERS, `${dcn}: §${g.clause} is in no chapter of this standard`)
          .toContain(g.clause.split('.')[0]!)
      }
      for (const k of ['cids', 'acc', 'rev', 'rej'] as const) {
        if (g[k] === undefined) continue
        expect(Number.isInteger(g[k]), `${dcn}.${k}`).toBe(true)
        expect(g[k]!).toBeGreaterThan(0)
      }
    }
    // The gist is the point of reading the text at all, so most documents must have one.
    const withGist = Object.values(docMeta.docs).filter((d) => Object.keys(d.gist).length > 0)
    expect(withGist.length).toBeGreaterThan(Object.keys(docMeta.docs).length / 2)
    expect(docMeta.noText, 'a cited document whose text the mirror never extracted').toEqual([])
  })

  it('dates every document, as an ISO day', () => {
    for (const [dcn, d] of Object.entries(docMeta.docs)) {
      expect(d.date, dcn).toMatch(/^\d{4}-\d\d-\d\d$/)
      // A document number carries its own year: `15-22/0381` cannot be dated 2026.
      expect(Number(d.date.slice(0, 4)), `${dcn} is dated outside its own year`)
        .toBeGreaterThanOrEqual(2000 + Number(dcn.slice(3, 5)))
      expect(d.kind.length).toBeGreaterThan(0)
    }
  })
})

/**
 * **`src/course/lessonMeta.json` is the engine half of the time axis**, generated from this
 * repository's own git history. It is the one date in the picture this repository is answerable
 * for, so a lesson it cannot date is a hole in the green dots rather than a loud failure — which
 * is why it is asserted here.
 */
/**
 * **The company marks are committed, not fetched**, so they are data like any other and can go
 * stale like any other: a company that stops appearing on a cited document should stop having a
 * mark, and a new one must land in `logos` or in `missing` rather than nowhere.
 */
describe('the company marks', () => {
  const named = [...new Set(Object.values(docMeta.docs).flatMap((d) => d.orgs))].sort()

  it('covers every company on a cited document, by a mark or by its initials', () => {
    const logos = Object.keys(orgLogos.logos)
    expect([...logos, ...orgLogos.missing].sort(),
      'run `npx vite-node scripts/org-logos.ts` after a new company appears').toEqual(named)
    expect(logos.filter((n) => orgLogos.missing.includes(n)),
      'a company cannot be both drawn and missing').toEqual([])
  })

  it('holds one real path and one brand colour per mark', () => {
    for (const [name, logo] of Object.entries(orgLogos.logos)) {
      expect(logo.path.length, name).toBeGreaterThan(40)
      expect(logo.path[0], `${name}: an SVG path starts with a move`).toMatch(/[Mm]/)
      expect(logo.hex, name).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(logo.slug, name).toMatch(/^[a-z0-9.-]+$/)
    }
    expect(orgLogos.license).toContain('CC0')
    expect(orgLogos.version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('the lesson dates behind the panel’s links', () => {
  it('dates every lesson, and knows which it could not', () => {
    expect(lessonMeta.orphans, 'a lesson git cannot date').toEqual([])
    const ids = new Set(LESSONS.map((l) => l.id))
    expect(Object.keys(lessonMeta.lessons).filter((id) => !ids.has(id)),
      'metadata for a lesson that no longer exists: run `npx vite-node scripts/lesson-meta.ts`')
      .toEqual([])
    expect(LESSONS.filter((l) => !(l.id in lessonMeta.lessons)).map((l) => l.id)).toEqual([])
  })

  it('dates them as ISO days, added no later than last touched', () => {
    for (const [id, m] of Object.entries(lessonMeta.lessons)) {
      expect(m.added, id).toMatch(/^\d{4}-\d\d-\d\d$/)
      expect(m.touched, id).toMatch(/^\d{4}-\d\d-\d\d$/)
      expect(m.added.localeCompare(m.touched), `${id}: added after it was last touched`)
        .toBeLessThanOrEqual(0)
      expect(m.file.startsWith('src/course/'), `${id}: ${m.file}`).toBe(true)
    }
  })

  /**
   * **Every cited lesson reaches the panel, dated and titled.** It used to reach the grid as a
   * green block; what replaced that is a link, and a link with no title is a button that says
   * 「@uwb-mms」 — which is what the old card already said and what the reader could not act on.
   */
  it('reaches the panel: every cited lesson is a dated, titled link', () => {
    for (const track of TRACKS) {
      for (const c of graphFor(track).columns) {
        const refs = c.group.lessonRefs
        expect(refs.map((r) => r.id).sort(), `${c.group.id}`)
          .toEqual([...c.group.lessons].sort())
        for (const r of refs) {
          expect(r.added, `${c.group.id}/${r.id}`).toMatch(/^\d{4}-\d\d-\d\d$/)
          expect(r.title.length, `${c.group.id}/${r.id}: a link with no name`)
            .toBeGreaterThan(0)
          expect(r.file.startsWith('src/course/'), `${c.group.id}/${r.id}: ${r.file}`).toBe(true)
        }
        // Oldest first: the panel prints them as a short history of this feature's teaching.
        expect(refs.map((r) => r.added)).toEqual([...refs.map((r) => r.added)].sort())
      }
    }
  })
})
