/**
 * `@radio-primer`, in the standard-first shape (2026-11-11).
 *
 * ① is what IEEE Std 802.11-2024 says about the received level (RSSI is relative, RCPI is in
 * dBm, transmit power is chosen under TPC, propagation is not specified); ② is this simulator's
 * link budget marked against it; ③ walks the flat. Every figure the labs and the quiz print is
 * read back out of the lesson's own text and compared with the engine — the link table the run
 * uses, `pathLossDb`, `WALL_LOSS_DB`, and the first data frame of each run — so editing a number
 * without the engine agreeing turns this red, and so does an engine change that moves one.
 *
 * The flat is still a figure built from the scenario; its geometry checks are the two
 * `tests/course/diagram.test.ts` makes of every figure.
 */
import { describe, it, expect } from 'vitest'
import { radioPrimer, radioPrimerTopology } from '../../src/course/tier1/radio-primer'
import { primerScenario, PRIMER_DISTANCES } from '../../src/course/tier1/radioLink'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { layoutDiagram, textBox, W, type Shape } from '../../src/course/diagram'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { PL0_DB, PL_EXP, WALL_LOSS_DB, buildLinkTable, pathLossDb, wallsCrossed } from '../../src/engine/propagation'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Long enough for the "first 100 ms" counts; the four M1 lessons share this memo. */
const RUN_NS = 100 * MS
const num = (s: string): number => Number(s.replace('−', '-').replace(/[^0-9.+-]/g, ''))

const lab = (heading: string): Lab => {
  const l = radioPrimer.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = radioPrimer.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => radioPrimer.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

const recsOf = (s: Scenario): TLRecord[] => [...new Simulation(s).runUntil(RUN_NS).records]
const firstData = (rs: TLRecord[]) => ofType(rs, 'TX_START').find((r) => r.node === 'sta-1' && r.frame.kind === 'data')!
const upDbm = (s: Scenario): number => buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!
const dnDbm = (s: Scenario): number => buildLinkTable(s.nodes, s.walls).get('ap')!.get('sta-1')!
const dbmCell = (v: number): string => `${v.toFixed(1).replace('-', '−')} dBm`
const glass = (): Scenario => {
  const s = primerScenario(9)
  return { ...s, walls: s.walls.map((w) => (w.x1 === 6 && w.x2 === 6 ? { ...w, material: 'glass' as const } : w)) }
}

lessonShapeSuite(radioPrimer, { runNs: RUN_NS })

describe('radio-primer · the lesson', () => {
  it('opens the course in the standard-first shape, and needs nothing', () => {
    expect(isStandardFirst(radioPrimer)).toBe(true)
    expect(COURSE_ORDER[0]).toBe('radio-primer')
    expect(MODULES[radioPrimer.module].title).toBe('信号与链路')
    expect(radioPrimer.needs).toEqual([])
    expect(radioPrimer.terms!.map((t) => t.term)).toEqual(['RSSI', 'RCPI', 'SNR'])
    expect(radioPrimer.limits).toEqual([])
    expect(radioPrimer.observe).toEqual([])
    expect(radioPrimer.tryThis).toEqual([])
  })

  it('walks the flat: 9 m to open, then 1, 5, 9 and 14 m on the centre line', () => {
    const dist = (s: Scenario) => {
      const ap = s.nodes.find((n) => n.id === 'ap')!.pos
      const sta = s.nodes.find((n) => n.id === 'sta-1')!.pos
      return Math.hypot(sta.x - ap.x, sta.y - ap.y, sta.z - ap.z)
    }
    expect(dist(radioPrimer.scenario())).toBeCloseTo(9, 12)
    expect(radioPrimer.variants!.map((v) => dist(v.scenario()))).toEqual(PRIMER_DISTANCES)
    for (const v of radioPrimer.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('cites each clause it teaches in ①, and keeps propagation out of the standard', () => {
    const std = stdText()
    for (const c of ['§17.2.3', '表 27-1', '§17.3.10.7', '§9.4.2.36', '§8.3.5.15', '§4.5.5.2', '§11.7.5', '§11.7.6', '§11.7.7', '§17.3.11']) {
      expect(std, c).toContain(c)
    }
    expect(std).toContain('0 到 255')
    expect(std).toContain('±5 dB')
    expect(std).toContain('−109.5 dBm')
    expect(std).toContain('0.5 dB')
    expect(std).toContain('不作规定')
    // ① holds no number of this simulator's propagation model
    for (const sim of ['46.7', '30·log10', '12 dB', '15 dBm']) expect(std, sim).not.toContain(sim)
  })

  it('marks at least one row that is not faithful, and names what is absent', () => {
    const kinds = radioPrimer.implementation!.map((r) => r.kind)
    expect(kinds).not.toContain('faithful')
    expect(implRow('到达电平的表示').kind).toBe('differs')
    expect(implRow('RCPI').kind).toBe('absent')
    expect(implRow('发射功率控制').kind).toBe('absent')
  })
})

describe('radio-primer · ② says what the engine does, and the engine does it', () => {
  it('the path loss is 46.7 dB at a metre and 9.0 dB per doubling (exponent 3.0)', () => {
    const sim = implRow('路径损耗').sim
    expect(PL0_DB).toBe(46.7)
    expect(PL_EXP).toBe(3)
    expect(sim).toContain(`${PL0_DB} + ${10 * PL_EXP}·log10(d / 1 m)`)
    expect(sim).toContain(`指数 ${PL_EXP.toFixed(1)}`)
    expect(sim).toContain(`增加 ${(pathLossDb(2) - pathLossDb(1)).toFixed(1)} dB`)
    // the two antennas 1 m above the floor, distance in three dimensions
    const s = primerScenario(9)
    expect(s.nodes.every((n) => n.pos.z === 1)).toBe(true)
  })

  it('the wall table is the engine’s', () => {
    expect(WALL_LOSS_DB).toEqual({ drywall: 5, brick: 12, glass: 3 })
    expect(implRow('墙体损耗').sim).toContain('石膏板 5 dB、砖墙 12 dB、玻璃 3 dB')
    // the why's 「一堵砖墙的 12 dB 相当于把距离增大到两倍半」
    expect((pathLossDb(2.5) - pathLossDb(1)).toFixed(0)).toBe(String(WALL_LOSS_DB.brick))
    expect(radioPrimer.why).toContain('两倍半')
  })

  it('the two transmit powers are fixed per node: laptop 15 dBm, router 20 dBm', () => {
    const s = radioPrimer.scenario()
    expect(s.nodes.find((n) => n.id === 'sta-1')!.txPowerDbm).toBe(15)
    expect(s.nodes.find((n) => n.id === 'ap')!.txPowerDbm).toBe(20)
    expect(implRow('发射功率').sim).toContain('笔记本 15 dBm，路由器 20 dBm')
  })

  it('the scene opens no fading section', () => {
    for (const s of [radioPrimer.scenario(), ...radioPrimer.variants!.map((v) => v.scenario())]) {
      expect(s.fading, 'fading').toBeUndefined()
    }
    expect(implRow('多径与衰落').sim).toContain('没有打开衰落')
  })
})

describe('radio-primer · ③ every figure the labs print is the run', () => {
  it('lab 1: the figure is the scenario, leg by leg', () => {
    const spec = radioPrimerTopology()
    const places = spec.nodes.filter((n) => n.id !== 'ap')
    expect(places.map((n) => n.label)).toEqual(['书桌', '书房', '客厅', '墙边'])
    places.forEach((n, i) => {
      expect(n.x, n.label).toBe(primerScenario(PRIMER_DISTANCES[i]).nodes.find((x) => x.id === 'sta-1')!.pos.x)
    })
    PRIMER_DISTANCES.forEach((d, i) => {
      const s = primerScenario(d)
      const crossed = wallsCrossed(s.nodes.find((n) => n.id === 'sta-1')!.pos, s.nodes.find((n) => n.id === 'ap')!.pos, s.walls)
      expect(crossed, `${d} m`).toEqual(d > 5.5 ? ['brick'] : [])
      expect(spec.links[i].label).toBe(crossed.length ? `${pathLossDb(d).toFixed(1)}+${WALL_LOSS_DB.brick}` : pathLossDb(d).toFixed(1))
    })
    const block = lab('四个位置的到达电平').blocks!.find((b) => b.kind === 'diagram')!
    expect('caption' in block && block.caption).toContain(`多出的 ${WALL_LOSS_DB.brick}`)
    const { width, shapes } = layoutDiagram(spec)
    expect(width).toBe(W)
    expect(shapes.filter((sh: Shape) => sh.s === 'text').every((sh) => textBox(sh as Extract<Shape, { s: 'text' }>).x1 <= W)).toBe(true)
  })

  it('lab 1: the four-place table, and the 100 ms counts', () => {
    const l = lab('四个位置的到达电平')
    const rows = tableOf(l, '同一台笔记本，四个位置').rows
    expect(rows).toHaveLength(4)
    PRIMER_DISTANCES.forEach((d, i) => {
      const s = radioPrimer.variants![i].scenario()
      const [, off, rssi, rate] = rows[i]
      expect(off).toBe(d > 5.5 ? `${pathLossDb(d).toFixed(1)} + ${WALL_LOSS_DB.brick}` : pathLossDb(d).toFixed(1))
      expect(rssi).toBe(dbmCell(upDbm(s)))
      const f = firstData(runOf(radioPrimer, i, RUN_NS))
      expect(f.frame.bytes).toBe(1530)
      expect(rate).toBe(`${f.frame.mbps.toFixed(1)} Mb/s`)
    })
    const drop = upDbm(radioPrimer.variants![0].scenario()) - upDbm(radioPrimer.variants![3].scenario())
    expect(l.expect).toContain(`相差 ${drop.toFixed(1)} dB`)
    expect(l.expect).toContain(`从 ${rows[0][2]} 降到 ${rows[3][2]}`)
    expect(l.expect).toContain(`从 ${rows[0][3]} 降到 ${rows[3][3]}`)
    const acked = (i: number) => ofType(runOf(radioPrimer, i, RUN_NS), 'TX_START').filter((r) => r.node === 'ap' && r.frame.kind === 'ack').length
    expect(l.expect).toContain(`书桌位置的 ${acked(0)} 帧`)
    expect(l.expect).toContain(`远端墙边只有 ${acked(3)} 帧`)
    // the why's 「速率降到原来的十分之一」 and 「四十多分贝」
    expect(Math.round(num(rows[0][3]) / num(rows[3][3]))).toBe(10)
    expect(Math.floor(drop / 10)).toBe(4)
  })

  it('lab 2: the living room, step by step, both directions', () => {
    const l = lab('逐步算出客厅的到达电平')
    const rows = tableOf(l, '客厅那台笔记本').rows
    const s = radioPrimer.scenario()
    expect(rows[0][1]).toBe(`${s.nodes.find((n) => n.id === 'sta-1')!.txPowerDbm} dBm`)
    expect(rows[1][1]).toBe(`${pathLossDb(9).toFixed(1)} dB`)
    expect(rows[2][1]).toBe(`一堵砖墙，${WALL_LOSS_DB.brick} dB`)
    expect(rows[3][1]).toBe(dbmCell(upDbm(s)))
    expect(l.expect).toContain(`15 − ${pathLossDb(9).toFixed(1)} − 12 = ${upDbm(s).toFixed(1).replace('-', '−')} dBm`)
    expect(l.expect).toContain(`路由器以 20 dBm 发送，到达笔记本的电平是 ${dbmCell(dnDbm(s))}`)
    const f = (l.blocks ?? []).find((b) => b.kind === 'formula') as Extract<Block, { kind: 'formula' }>
    expect(f.text).toContain(`(${PL0_DB} + ${10 * PL_EXP}·log10(d / 1 m))`)
    expect(l.meaning).toContain('5 dB')
  })

  it('lab 3: doubling the distance and changing the wall', () => {
    const l = lab('距离加倍与换一种墙')
    const rows = tableOf(l, '两次修改').rows
    const scenes: [string, Scenario][] = [
      ['7 m + 砖墙', primerScenario(7)], ['14 m + 砖墙', primerScenario(14)],
      ['9 m + 砖墙', primerScenario(9)], ['9 m + 玻璃', glass()],
    ]
    expect(rows.map((r) => r[0])).toEqual(scenes.map((x) => x[0]))
    // both the 7 m and the 14 m laptop sit behind the one brick wall and inside the flat
    for (const d of [7, 14]) {
      const s = primerScenario(d)
      expect(wallsCrossed(s.nodes.find((n) => n.id === 'sta-1')!.pos, s.nodes.find((n) => n.id === 'ap')!.pos, s.walls)).toEqual(['brick'])
    }
    scenes.forEach(([name, s], i) => {
      expect(rows[i][1], name).toBe(dbmCell(upDbm(s)))
      expect(rows[i][2], name).toBe(`${firstData(recsOf(s)).frame.mbps.toFixed(1)} Mb/s`)
    })
    const fall = upDbm(primerScenario(7)) - upDbm(primerScenario(14))
    const rise = upDbm(glass()) - upDbm(primerScenario(9))
    expect(l.expect).toContain(`电平下降 ${fall.toFixed(1)} dB`)
    expect(l.expect).toContain(`电平升高 ${rise.toFixed(1)} dB`)
    expect(l.expect).toContain(`速率从 ${rows[2][2]} 升到 ${rows[3][2]}`)
    expect(l.meaning).toContain(`${WALL_LOSS_DB.brick} − ${WALL_LOSS_DB.glass} = ${WALL_LOSS_DB.brick - WALL_LOSS_DB.glass} dB`)
  })
})

describe('radio-primer · the quiz is the run', () => {
  it('7 → 14 m is 9.0 dB, brick → glass is 9 dB, and RCPI is the one in dBm', () => {
    const [q1, q2, q3] = radioPrimer.quiz
    expect(q1.options[q1.answer]).toContain('RCPI')
    expect(q2.options[q2.answer]).toContain(`${(pathLossDb(2) - pathLossDb(1)).toFixed(1)} dB`)
    expect(q2.explain).toContain(`${dbmCell(upDbm(primerScenario(7))).replace(' dBm', '')} 变成 ${dbmCell(upDbm(primerScenario(14)))}`)
    expect(q3.explain).toContain(`${dbmCell(upDbm(primerScenario(9))).replace(' dBm', '')} 变成 ${dbmCell(upDbm(glass()))}`)
    expect(q3.options[q3.answer]).toContain(`升高 ${WALL_LOSS_DB.brick - WALL_LOSS_DB.glass} dB`)
  })
})
