/**
 * Every empirical claim of "MU-MIMO — splitting by space instead of frequency",
 * measured against the lesson's own two variants.
 *
 * Re-paced 2026-09-26: this half keeps what dividing space means, the antenna
 * arithmetic that caps the group, the trim procedure and the acknowledgement
 * round. What each way costs — the comparison table, the length formula, the
 * combined bytes and the 1,000-byte threshold the engine picks by — moved to
 * tests/course/mumimo-choose.test.ts with the prose, and is not duplicated here.
 *
 * Two corrections this file exists to hold:
 *  - "one round of acknowledgement settles the group" is 162 of 169 sends in the
 *    slicing variant, and the test pins the count rather than a bound;
 *  - the figure is the run's own first MU-MIMO send, so the phone drawn outside
 *    the group is the phone the engine trimmed — not a phone the simulator
 *    cannot reach, and not a sounding exchange, which it never runs at all.
 *
 * `tests/course/quoted-timestamps.test.ts` owns the two quoted sends'
 * timestamps, the 196 / 122 / 65 / 9 split and the added-phones experiment, and
 * `tests/course/lesson-claims.test.ts` owns the backup-off experiment; this file
 * does not duplicate them.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { mumimo, mumimoTopology } from '../../src/course/tier2/mumimo'
import { mumimoScenario } from '../../src/course/wifiScenes'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, runOf } from './kit'
import { ROOT, zhNumeral } from './coverage'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 500 * MS
const SIFS_NS = 16 * US
const PHONES = ['sta-1', 'sta-2', 'sta-3']

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const muSends = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'data' && r.frame.muParts !== undefined)

lessonShapeSuite(mumimo, { runNs: RUN_NS })

describe('mumimo · the lesson’s own scene', () => {
  it('is a Tier 2 lesson that needs the two halves of the idea it builds on', () => {
    expect(MODULES[mumimo.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(mumimo.needs).toEqual(['streams', 'ofdma-dl'])
    expect(mumimo.terms!.map((t) => t.term)).toEqual(['MU-MIMO', 'beamforming', 'sounding'])
  })

  it('keeps the same house and the same two variants, differing in one feature flag', () => {
    expect(mumimo.scenario()).toEqual(mumimoScenario(false))
    expect(mumimo.variants!.map((v) => v.scenario())).toEqual([mumimoScenario(false), mumimoScenario(true)])
    expect(mumimo.variants!.length).toBe(2)
    for (const v of mumimo.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    // "Exactly one feature flag: MU-MIMO, on the phones and the router."
    const [a, b] = mumimo.variants!.map((v) => v.scenario())
    for (const [i, n] of a.nodes.entries()) {
      const m = b.nodes[i]
      expect(n.id).toBe(m.id)
      expect({ ...n.caps.features, mumimo: null }).toEqual({ ...m.caps.features, mumimo: null })
      expect(n.caps.features!.mumimo).toBe(false)
      expect(m.caps.features!.mumimo).toBe(true)
      expect(n.caps.features!.ofdma).toBe(true)
      expect(m.caps.features!.ofdma).toBe(true)
    }
  })

  it('the antenna arithmetic behind "the group is never three": four against two and two', () => {
    const sc = mumimo.variants![1].scenario()
    expect(sc.nodes.find((n) => n.id === 'ap')!.caps.nss).toBe(4)
    for (const id of PHONES) expect(sc.nodes.find((n) => n.id === id)!.caps.nss).toBe(2)
    expect(2 + 2).toBeLessThanOrEqual(4)
    expect(2 + 2 + 2).toBeGreaterThan(4)
    // and the run keeps to it: never more than two members when space is what is divided
    expect(new Set(muSends(runOf(mumimo, 1, RUN_NS)).map((r) => r.frame.muParts!.length))).toEqual(new Set([2]))
    expect(new Set(muSends(runOf(mumimo, 0, RUN_NS)).map((r) => r.frame.muParts!.length)).has(3)).toBe(true)
  })
})

describe('mumimo · the figure is the run’s own first send by space', () => {
  const spec = mumimoTopology()

  it('draws the scene node for node, at the scene’s own positions', () => {
    const sc = mumimoScenario(true)
    expect(spec.nodes.map((n) => n.id)).toEqual(sc.nodes.map((n) => n.id))
    for (const n of spec.nodes) {
      const src = sc.nodes.find((x) => x.id === n.id)!
      expect([n.x, n.y], n.id).toEqual([src.pos.x, src.pos.y])
      expect(n.role, n.id).toBe(src.kind === 'ap' ? 'ap' : 'sta')
      expect(n.label.trim(), n.id).not.toBe('')
    }
    // every link starts at the router: this is one send, not a topology of peers
    for (const l of spec.links) expect(l.from).toBe('ap')
  })

  it('the two phones inside the ring, and the dashed one outside it, are that send’s members', () => {
    const first = muSends(runOf(mumimo, 1, RUN_NS))[0]
    const members = new Set(first.frame.muParts!.map((p) => p.dst))
    // the ring holds the router and exactly the members
    expect(new Set(spec.ring!.nodes)).toEqual(new Set(['ap', ...members]))
    expect(members).toEqual(new Set(['sta-2', 'sta-3']))
    // the accented links are the members', the dashed one is the phone that was trimmed
    const accent = spec.links.filter((l) => l.tone === 'accent').map((l) => l.to)
    expect(new Set(accent)).toEqual(members)
    const muted = spec.links.filter((l) => l.tone === 'muted').map((l) => l.to)
    expect(muted).toEqual(['sta-1'])
    expect(PHONES.filter((p) => !members.has(p))).toEqual(['sta-1'])
    // and it really is a full-width member each, not a slice each
    for (const p of first.frame.muParts!) {
      expect(p.ruFraction).toBeUndefined()
      expect(p.nss).toBe(2)
    }
  })

  it('"which phone is trimmed is not fixed": all three pairings occur over the run', () => {
    const pairs = new Set(muSends(runOf(mumimo, 1, RUN_NS))
      .map((r) => r.frame.muParts!.map((p) => p.dst).sort().join('+')))
    expect(pairs).toEqual(new Set(['sta-1+sta-2', 'sta-1+sta-3', 'sta-2+sta-3']))
  })
})

describe('mumimo · the trim procedure, run against every send by space', () => {
  it('steps 1, 3 and 4: two to four members, streams within the router’s four, full width each', () => {
    const sends = muSends(runOf(mumimo, 1, RUN_NS))
    expect(sends.length).toBeGreaterThan(50)
    for (const r of sends) {
      const parts = r.frame.muParts!
      expect(r.frame.muKind).toBe('mumimo')
      expect(parts.length).toBeGreaterThanOrEqual(2)
      expect(parts.length).toBeLessThanOrEqual(4)
      // step 3: the group is trimmed until the members' streams fit the antennas
      expect(parts.reduce((s, p) => s + (p.nss ?? 1), 0)).toBeLessThanOrEqual(4)
      // step 4: each survivor gets the whole width at its own stream count
      for (const p of parts) expect(p.ruFraction).toBeUndefined()
    }
  })

  it('step 4’s other branch: fewer than two survivors falls back, so no send by space is ever one member', () => {
    for (const r of muSends(runOf(mumimo, 1, RUN_NS))) expect(r.frame.muParts!.length).not.toBe(1)
  })
})

describe('mumimo · one round of acknowledgement settles the whole group', () => {
  // the counts the observation was written from, pinned rather than bounded (tier-2 review,
  // Minor 20): the OFDMA variant settles 162 of 169 sends, the MU-MIMO one 190 of 196, and the
  // rest are the sends the laptop talked over. Step 6 of this lesson quotes 162 of 169.
  it.each([[0, 'OFDMA', 169, 162], [1, 'MU-MIMO', 196, 190]] as const)('variant %i (%s)', (v, _name, total, ok) => {
    const rs = runOf(mumimo, v, RUN_NS)
    const sends = muSends(rs)
    expect(sends.length).toBeGreaterThan(50)
    let settled = 0, collided = 0
    for (const s of sends) {
      // every member's part is one PPDU, so they end together by construction; what the
      // observation claims is that one gap later the group is acknowledged in one round —
      // "unless the send collided with the laptop", which is the other branch here
      const bas = txs(rs, (r) => (r.frame.kind === 'ba' || r.frame.kind === 'mba')
        && r.t === s.t + s.frame.txTimeNs + SIFS_NS)
      if (bas.length > 0) {
        expect(new Set(bas.map((r) => r.t)).size).toBe(1)
        settled++
        continue
      }
      const hit = rs.some((r) => r.type === 'COLLISION' && r.t >= s.t && r.t <= s.t + s.frame.txTimeNs)
      expect(hit, `the send at ${s.t} was neither acknowledged nor collided with`).toBe(true)
      collided++
    }
    expect(sends.length).toBe(total)
    expect(settled + collided).toBe(sends.length)
    expect(settled).toBe(ok)
    expect(collided).toBe(total - ok)
  })
})

/**
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * Everything above measures the engine against a literal written in THIS file —
 * `expect(sc.nodes.find(…)!.caps.nss).toBe(4)`, `expect(sends.length).toBe(total)`,
 * `expect(settled).toBe(ok)`, and a `SIFS_NS = 16 * US` of its own. That is what keeps the
 * engine from drifting and leaves the lesson free to: every figure `@mumimo` hand-types could
 * be edited to a neighbouring number with this file still green.
 *
 * What follows is the other half, with no figure on this side. The antenna arithmetic is read
 * out of `picture`, the quiz and the worked table — including 「6 > 4」, which is an inequality
 * and is checked as one, and 「多出一半」, which is a ratio; the acknowledgement gap and the
 * 162-of-169 census come off step 6; the trimmed phone's three fates and their three percentages
 * come off their own sentence and are re-derived from the same run
 * `tests/course/quoted-timestamps.test.ts` derives them from, where they sit as literals; and
 * 「整条 160 MHz」 comes off the caption and off `observe`.
 *
 * `limits` is read too, and one of its figures is physics rather than bookkeeping: 「两个成员各
 * 拿一半就是各少 3 dB」 is checked as `10·log₁₀2` to the precision the sentence prints, which is
 * the only way that number can be wrong. Two engine constants the lesson quotes exist in exactly
 * one place each and are not exported — `MUMIMO_MIN_BYTES` and the `slice(0, 4)` that caps a
 * group — so they are read out of `mac.ts` itself, with the figure from the prose; the
 * **measured** form of the cap is the added-phones experiment, which
 * `tests/course/quoted-timestamps.test.ts` owns and this file does not duplicate.
 */
describe('mumimo · every printed figure is read back out of the lesson', () => {
  const bySpace = runOf(mumimo, 1, RUN_NS)
  const byFreq = runOf(mumimo, 0, RUN_NS)
  const spaceSends = muSends(bySpace)
  const freqSends = muSends(byFreq)
  const sc = mumimo.variants![1].scenario()
  const ap = sc.nodes.find((n) => n.id === 'ap')!
  const mac = readFileSync(resolve(ROOT, 'src/engine/mac.ts'), 'utf8')

  const steps = (mumimo.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
  const table = mumimo.numbers!.find((x) => x.kind === 'table') as
    { heading: string; rows: string[][] }
  const trimmedProse = (mumimo.numbers!
    .find((x) => (x as { heading?: string }).heading?.includes('被裁掉的那部手机')) as
    { text: string }).text
  const pictureText = (mumimo.picture! as { text?: string; caption?: string }[])
    .map((x) => `${x.text ?? ''}\n${x.caption ?? ''}`).join('\n')
  const quizText = mumimo.quiz!.flatMap((q) => [q.q, ...q.options, q.explain ?? '']).join('\n')
  const limitText = mumimo.limits.map((x) => x.text).join('\n')

  /** The captures of `re`, as numbers; a comma inside a figure is a thousands group. */
  const figs = (text: string, re: RegExp, what: string): number[] => {
    const m = re.exec(text)
    expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
    return m!.slice(1).map((x) => Number(x.replace(/[\s,]/g, '')))
  }
  /** `zhNumeral` reads 〇–九十九 and not 「两」, which is the form a quantified noun takes. */
  const zhCount = (s: string): number => {
    const n = zhNumeral(s.replace(/两/g, '二'))
    expect(n, `「${s}」 is not a number this reads`).not.toBeNull()
    return n!
  }
  const counted = (text: string, re: RegExp, what: string): number => {
    const m = re.exec(text)
    expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
    return zhCount(m![1])
  }
  const ZH = '[〇一二三四五六七八九十两]+'

  it('「这里的分组为什么永远不是三个」: four antennas, two streams each, and the third needs six', () => {
    const antennas = counted(pictureText, new RegExp(`这台路由器有(${ZH})根`), 'the router’s antennas')
    const each = counted(pictureText, new RegExp(`每部手机协商到(${ZH})条流`), 'each phone’s streams')
    const members = counted(pictureText, new RegExp(`(${ZH})部手机就把四根占满`), 'how many fit')
    const third = counted(pictureText, new RegExp(`第三部还得再要(${ZH})条`), 'what a third would need')

    expect(ap.caps.nss, 'the router’s own antenna count').toBe(antennas)
    for (const id of PHONES) {
      expect(sc.nodes.find((n) => n.id === id)!.caps.nss, `${id}’s negotiated streams`).toBe(each)
    }
    expect(members * each, 'the streams that many phones need').toBe(antennas)
    expect(third, 'the streams a third phone would bring the total to').toBe(3 * each)
    expect(third).toBeGreaterThan(antennas)
    // and the run keeps to it: never more than that many members when space is divided
    expect(new Set(spaceSends.map((r) => r.frame.muParts!.length))).toEqual(new Set([members]))
    // 「切片没有这道坎——三部手机各占一片都塞得下」
    expect(new Set(freqSends.map((r) => r.frame.muParts!.length)).has(3)).toBe(true)
  })

  it('the worked table: three queued, 6 > 4, two survivors, the whole channel, two streams each', () => {
    const rows = table.rows
    expect(rows, 'the table states exactly the seven rows this reads').toHaveLength(7)
    const [queued] = figs(rows[0][1], /^(\d+)$/, 'the phones with something queued')
    expect(PHONES.length).toBe(queued)
    // 「都协商过 MU-MIMO，且队首都有 1,000 字节」, answered 「是」
    const [minBytes] = figs(rows[1][0], /有 ([\d,]+) 字节/, 'the bytes the row requires at the head')
    expect(rows[1][1]).toBe('是')
    for (const id of PHONES) expect(sc.nodes.find((n) => n.id === id)!.caps.features!.mumimo).toBe(true)
    // the threshold is a `const` in one place and is not exported, so it is read where it lives
    expect(mac, `the MAC no longer uses ${minBytes} bytes as the head-of-queue threshold`)
      .toContain(`MUMIMO_MIN_BYTES = ${minBytes}`)

    // 「三部要的流数，对比路由器的四条」 → 「6 > 4」: an inequality, checked as one
    const [want, have] = figs(rows[2][1], /^(\d+) > (\d+)$/, 'the streams wanted against the antennas')
    expect(want).toBe(PHONES.length * sc.nodes.find((n) => n.id === 'sta-1')!.caps.nss!)
    expect(have).toBe(ap.caps.nss)
    expect(want, 'the table writes 「>」 between these two').toBeGreaterThan(have)

    const [survivors] = figs(rows[3][1], /^(\d+)$/, 'the members left after the trim')
    const [streams] = figs(rows[5][1], /^(\d+)$/, 'the streams each one uses')
    expect(new Set(spaceSends.map((r) => r.frame.muParts!.length))).toEqual(new Set([survivors]))
    expect(survivors * streams).toBe(have)
    for (const r of spaceSends) {
      for (const p of r.frame.muParts!) {
        expect(p.nss, `a member of the send at ${r.t}`).toBe(streams)
        // 「每个成员拿到的信道：全部」 — a cell with no figure is a claim too
        expect(p.ruFraction, `a member of the send at ${r.t} got a slice, not the whole channel`)
          .toBeUndefined()
      }
    }
    expect(rows[4][1]).toBe('全部')
  })

  it('step 6: one gap later the group is settled, 162 of 169 times and no other way', () => {
    const [gapUs] = figs(steps[5], /隔 (\d+) µs/, 'the gap before the acknowledgement')
    const [total] = figs(steps[5], /的 (\d+) 次分组发送里/, 'the sends step 6 counts')
    const [ok] = figs(steps[5], /有 (\d+) 次是这样/, 'the sends one round settles')
    const rest = counted(steps[5], new RegExp(`另外(${ZH})次`), 'the sends it does not')

    expect(freqSends.length, 'the sends of the variant step 6 counts').toBe(total)
    let settled = 0
    for (const s of freqSends) {
      const bas = txs(byFreq, (r) => (r.frame.kind === 'ba' || r.frame.kind === 'mba')
        && r.t === s.t + s.frame.txTimeNs + gapUs * US)
      if (bas.length > 0) settled++
    }
    expect(settled, `sends acknowledged exactly ${gapUs} µs after they end`).toBe(ok)
    expect(total - settled, 'and the rest, which the laptop talked over').toBe(rest)
    // 「另外七次是笔记本的发送与它相撞」: every one of them really is a collision
    for (const s of freqSends) {
      const bas = txs(byFreq, (r) => (r.frame.kind === 'ba' || r.frame.kind === 'mba')
        && r.t === s.t + s.frame.txTimeNs + gapUs * US)
      if (bas.length > 0) continue
      expect(byFreq.some((r) => r.type === 'COLLISION' && r.t >= s.t && r.t <= s.t + s.frame.txTimeNs),
        `the send at ${s.t} was neither acknowledged nor collided with`).toBe(true)
    }
  })

  it('steps 1 to 4: the list is cut to four, needs two, and is trimmed until the streams fit', () => {
    expect(steps, 'the lesson states exactly the steps this reads').toHaveLength(6)
    const least = counted(steps[0], new RegExp(`名单上不到(${ZH})部`), 'the members a group needs')
    const most = counted(steps[0], new RegExp(`只留前(${ZH})部`), 'the members a list is cut to')
    const [threshold] = figs(steps[1], /至少 ([\d,]+) 字节/, 'the bytes a member needs queued')
    const need = counted(steps[2], new RegExp(`(${ZH})部两流手机要四条`), 'the phones that fit')
    const over = counted(steps[2], new RegExp(`再加第三部就要(${ZH})条`), 'what a third would need')
    const survivors = counted(steps[3], new RegExp(`幸存者不足(${ZH})部`), 'the survivors a group needs')

    expect(least).toBe(2)
    expect(survivors).toBe(least)
    // the cap and the threshold are both written in one place in `mac.ts` and neither is
    // exported; the measured form of the cap is the added-phones experiment, next door
    expect(mac, `the MAC no longer cuts the list to ${most}`).toContain(`slice(0, ${most})`)
    expect(mac).toContain(`MUMIMO_MIN_BYTES = ${threshold}`)
    expect(need * 2).toBe(ap.caps.nss)
    expect(over).toBeGreaterThan(ap.caps.nss!)
    // step 4's two branches, against every send by space: never one member, never over the
    // antennas, and every survivor on the whole width
    for (const r of spaceSends) {
      expect(r.frame.muParts!.length, `the send at ${r.t}`).toBeGreaterThanOrEqual(least)
      expect(r.frame.muParts!.length, `the send at ${r.t}`).toBeLessThanOrEqual(most)
      expect(r.frame.muParts!.reduce((s, p) => s + (p.nss ?? 1), 0), `the send at ${r.t}`)
        .toBeLessThanOrEqual(ap.caps.nss!)
    }
    // step 5: 「每个成员的那一份都在同一瞬间结束」 — one PPDU, so one end for all of them
    for (const r of spaceSends) {
      expect(new Set(r.frame.muParts!.map(() => r.t + r.frame.txTimeNs)).size).toBe(1)
    }
  })

  it('「被裁掉的那部手机接下来去哪儿了」: 196 sends, and the three fates with their three shares', () => {
    const [sends] = figs(trimmedProse, /这段仿真里的 (\d+) 次两成员发送/, 'the sends it counts')
    const [su, suPct] = figs(trimmedProse, /有 (\d+) 次（(\d+)%）紧接着/, 'the trimmed phone’s own send')
    const [paired, pairedPct] = figs(trimmedProse, /有 (\d+) 次（(\d+)%）出现在下一次/, 'the next pairing')
    const [neither, neitherPct] = figs(trimmedProse, /还有 (\d+) 次（(\d+)%）两样都不是/, 'neither of those')

    // the same classification tests/course/quoted-timestamps.test.ts makes, derived here from
    // the prose's own figures instead of from literals
    const apData = txs(bySpace, (r) => r.node === 'ap' && r.frame.kind === 'data')
    const twoMember = apData.filter((r) => r.frame.muParts?.length === 2)
    expect(twoMember.length).toBe(sends)
    let own = 0
    let next = 0
    let none = 0
    for (const mu of twoMember) {
      const members = new Set(mu.frame.muParts!.map((p) => p.dst))
      const trimmed = PHONES.find((p) => !members.has(p))!
      const i = apData.indexOf(mu)
      const after = apData[i + 1]
      if (after && after.frame.muParts === undefined && after.frame.dst === trimmed) { own++; continue }
      const nextMu = apData.slice(i + 1).find((r) => r.frame.muParts !== undefined)
      if (nextMu && nextMu.frame.muParts!.some((p) => p.dst === trimmed)) next++
      else none++
    }
    expect(own, 'the trimmed phone’s own send, right after').toBe(su)
    expect(next, 'swept into the next pairing').toBe(paired)
    expect(none, 'neither of those').toBe(neither)
    // 「还有」 says the three are the whole of it
    expect(own + next + none, 'the three fates are exhaustive').toBe(sends)
    // and each percentage is that count of that total, to the decimals it prints
    for (const [n, p] of [[own, suPct], [next, pairedPct], [none, neitherPct]] as const) {
      expect(Math.round((n / sends) * 100), `${n} of ${sends}`).toBe(p)
    }
  })

  it('the caption and `observe`: two parts, the whole 160 MHz each, two streams each', () => {
    const caption = (mumimo.picture!.find((x) => (x as { kind?: string }).kind === 'diagram') as
      { caption: string }).caption
    const [capWidth] = figs(caption, /各占整条 (\d+) MHz/, 'the width the caption gives each part')
    const parts = counted(caption, new RegExp(`路由器同时瞄着手机 2 和手机 3，(${ZH})份`),
      'the parts the caption counts')
    const capStreams = counted(caption, new RegExp(`它也要(${ZH})条流`), 'the streams the trimmed phone wanted')
    const capAntennas = counted(caption, new RegExp(`而(${ZH})根天线已经被占满`), 'the antennas it would need')

    const first = spaceSends[0]
    expect(first.frame.muParts!.length).toBe(parts)
    expect(first.frame.widthMhz, 'the width of the send the figure is of').toBe(capWidth)
    expect(new Set(first.frame.muParts!.map((p) => p.nss))).toEqual(new Set([capStreams]))
    expect(capAntennas).toBe(ap.caps.nss)
    expect(parts * capStreams).toBe(capAntennas)

    const text = mumimo.observe!.join('\n')
    const [obsWidth] = figs(text, /都占着整条 (\d+) MHz/, '`observe` on the width of a part')
    const obsParts = counted(text, new RegExp(`只有(${ZH})份，每一份`), '`observe` on the parts')
    const obsStreams = counted(text, new RegExp(`各用自己的(${ZH})条流`), '`observe` on the streams')
    const never = counted(text, new RegExp(`这个块都长不过(${ZH})份`), '`observe` on what it never exceeds')
    expect(obsWidth).toBe(capWidth)
    expect(obsParts).toBe(parts)
    expect(obsStreams).toBe(capStreams)
    expect(Math.max(...spaceSends.map((r) => r.frame.muParts!.length))).toBe(never)
    expect(new Set(spaceSends.map((r) => r.frame.widthMhz))).toEqual(new Set([obsWidth]))
  })

  it('the quiz: six streams against four antennas, which is half again as many', () => {
    const streams = counted(quizText, new RegExp(`流数加起来是(${ZH})条`), 'the streams the quiz adds up')
    const phones = counted(quizText, new RegExp(`同时服务三部(${ZH})流手机`), 'the streams each phone has')
    expect(streams).toBe(3 * phones)
    expect(phones).toBe(sc.nodes.find((n) => n.id === 'sta-1')!.caps.nss)
    // 「比路由器拥有的多出一半」: a ratio, and it is the router's own antenna count it is over
    expect(quizText).toContain('多出一半')
    expect((streams - ap.caps.nss!) / ap.caps.nss!, 'how much more than the router has').toBe(0.5)
    // 「两部手机就用满了全部四条」
    const used = counted(quizText, new RegExp(`(${ZH})部手机就用满了全部四条`), 'the phones that fill it')
    expect(used * phones).toBe(ap.caps.nss)
    // the explanation states each phone's streams a second time, in its own words
    const again = counted(quizText, new RegExp(`每部手机协商到(${ZH})条流`),
      'the quiz’s explanation on each phone’s streams')
    expect(again).toBe(phones)
  })

  it('`limits` quotes the whole-channel claim, and `sources` the same group cap as the steps', () => {
    // 「所以「每份都占着整条信道、各用自己的两条流」在时间轴上是真的，在射频上是乐观的」:
    // the sentence that concedes the power split quotes the figure it is conceding about
    const streams = counted(limitText, new RegExp(`各用自己的(${ZH})条流`),
      '`limits` on the streams it calls optimistic')
    for (const r of spaceSends) {
      for (const p of r.frame.muParts!) expect(p.nss, `a member of the send at ${r.t}`).toBe(streams)
    }
    // 「“一组最多四个成员”与 1,000 字节的门槛都是引擎自己的规定」 — `sources` states the cap too
    const most = counted(mumimo.sources!.join('\n'), new RegExp(`一组最多(${ZH})个成员`),
      '`sources` on the group cap')
    expect(mac, `the MAC no longer cuts a group to ${most}`).toContain(`slice(0, ${most})`)
  })

  it('`tryThis`: a group stops at four members, and by space it never passes two', () => {
    const text = mumimo.tryThis!.join('\n')
    const most = counted(text, new RegExp(`一组最多(${ZH})个成员`), 'the members a group stops at')
    const never = counted(text, new RegExp(`都长不过(${ZH})份`), 'what a send by space never passes')
    expect(mac, `the MAC no longer cuts a group to ${most}`).toContain(`slice(0, ${most})`)
    expect(Math.max(...spaceSends.map((r) => r.frame.muParts!.length))).toBe(never)
    // 「天线数是一道硬坎，队列长短改变不了它」 — it is the antennas, not the queues
    expect(never * sc.nodes.find((n) => n.id === 'sta-1')!.caps.nss!).toBe(ap.caps.nss)
    expect(mac, 'the trim rule is no longer the antenna sum').toContain('streams <= this.cfg.ownNss()')
  })

  it('`limits`: halving the power is 3 dB, and the cap is one line of arithmetic', () => {
    const members = counted(limitText, new RegExp(`(${ZH})个成员各拿一半`),
      '`limits` on how many members share the power')
    const [loss] = figs(limitText, /各拿一半就是各少 ([\d.]+) dB/,
      '`limits` on what each member loses')
    // the only way this figure can be wrong: it is ten times the log of that many shares
    const dp = String(loss).includes('.') ? String(loss).split('.')[1].length : 0
    expect(Number((10 * Math.log10(members)).toFixed(dp)), `splitting power ${members} ways`).toBe(loss)
    expect(members).toBe(Math.max(...spaceSends.map((r) => r.frame.muParts!.length)))
    // 「一组最多四个成员也是引擎写下的数」
    const most = counted(limitText, new RegExp(`一组最多(${ZH})个成员`), '`limits` on the group cap')
    expect(mac).toContain(`slice(0, ${most})`)
    // 「组内流数之和不超过接入点自己的天线数」是引擎唯一的裁剪规则
    expect(mac).toContain('streams <= this.cfg.ownNss()')
    // and every send by space obeys exactly that, with nothing else trimming it
    for (const r of spaceSends) {
      expect(r.frame.muParts!.reduce((s, p) => s + (p.nss ?? 1), 0), `the send at ${r.t}`)
        .toBeLessThanOrEqual(ap.caps.nss!)
    }
  })

  it('`limits` and `sources` name only code this repository has, and the same two clauses', () => {
    const texts = `${limitText}\n${mumimo.sources!.join('\n')}`
    const named = [...texts.matchAll(/\b([a-z][a-z0-9]*\.ts)\b/g)].map((x) => x[1])
    const src = [...new Set(named)].map((f) => {
      const p = ['src/engine', 'src/model', 'src/course'].map((d) => resolve(ROOT, `${d}/${f}`)).find(existsSync)
      expect(p, `${f} is not a file of this repository`).toBeDefined()
      return readFileSync(p!, 'utf8')
    }).join('\n')
    const UNITS = new Set(['dB', 'dBm'])
    const syms = [...texts.matchAll(/\b([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)\b/g)]
      .map((x) => x[1]).filter((s) => !UNITS.has(s))
    for (const sym of syms) {
      expect(src.includes(sym), `\`${sym}\` is named here, and by none of the files named with it`).toBe(true)
    }
    expect(named.length, 'the files `limits` and `sources` cite').toBe(3)
    expect(syms.length, 'the identifiers they name').toBe(3)
    // 「1,000 字节的门槛都是引擎自己的规定」: `sources` quotes the same threshold the steps do
    const [a] = figs(texts, /([\d,]+) 字节的门槛/, '`sources` on the threshold')
    const [b] = figs(steps[1], /至少 ([\d,]+) 字节/, 'the steps on the threshold')
    expect(a).toBe(b)
  })
})
