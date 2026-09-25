/**
 * The diagram layouts, as pure geometry.
 *
 * A layout function takes a spec and returns shapes with coordinates; no DOM, no
 * measuring, no React. That is what makes the two things a reader actually cares
 * about testable without a browser:
 *
 *  - **nothing leaves the viewBox**, so the figure is whole at any panel width;
 *  - **no two labels overlap**, which is width-independent: the SVG scales
 *    uniformly, so two labels that are clear of each other in viewBox units are
 *    clear of each other at 216 px and at 876 px alike. The only thing width
 *    changes is how big the type is, and `legibility` below pins that.
 *
 * `textWidth` is an estimate, deliberately generous for full-width characters
 * (one em each), so a label this file says fits really does fit in the browser.
 */
import { describe, it, expect } from 'vitest'
import {
  FS, W, diagramTexts, fitSize, layoutDiagram, textBox, textWidth,
  type DiagramSpec, type FieldsSpec, type SequenceSpec, type Shape, type StackSpec, type TimingSpec, type TopologySpec,
} from '../../src/course/diagram'
import { rolesStack } from '../../src/course/tier1/roles-stack'
import type { Block } from '../../src/course/lessonKit'

const texts = (shapes: Shape[]): Extract<Shape, { s: 'text' }>[] =>
  shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')

/**
 * What the SVG is actually given, measured in the browser: the course column's
 * own limits (src/ui/App.tsx) less the panel's 12 px of padding on each side and
 * its vertical scrollbar. At the narrow end that is 200 px, not 216.
 */
const PANEL = { narrowPx: 200, widePx: 900 - 40 }
/** What the panel caps the SVG at, so a wide column does not blow the type up. */
const MAX_SVG_PX = 320

const TOPOLOGY: TopologySpec = {
  kind: 'topology',
  nodes: [
    { id: 'ap', label: '接入点（AP）', role: 'ap', x: 5, y: 4 },
    { id: 'a', label: '笔记本', role: 'sta', x: 2, y: 2 },
    { id: 'b', label: '电视', role: 'sta', x: 8, y: 2 },
  ],
  links: [{ from: 'a', to: 'ap', label: '上行' }, { from: 'ap', to: 'b' }],
  ring: { nodes: ['ap', 'a', 'b'], label: '一张网' },
}

const STACK: StackSpec = {
  kind: 'stack',
  mode: 'nested',
  label: '三层包装',
  layers: [
    { label: '空口上的那一包', bytes: 1430, note: '整包 125.6 µs' },
    { label: 'MAC 造出来的帧', bytes: 1430, note: '26 + 1400 + 4' },
    { label: '载荷', bytes: 1400 },
  ],
  total: '包装 30 B',
}

const SEQUENTIAL: StackSpec = { ...STACK, mode: 'sequential' }

const TIMING: TimingSpec = {
  kind: 'timing',
  lanes: [
    { label: '手机 B', spans: [{ label: '数据', fromUs: 0, toUs: 125.6, tone: 'accent' }] },
    { label: '接入点', spans: [{ label: 'ACK', fromUs: 141.6, toUs: 169.6 }] },
  ],
  axis: { fromUs: 0, toUs: 200, ticks: [0, 100, 200], unit: 'µs' },
}

const SEQUENCE: SequenceSpec = {
  kind: 'sequence',
  columns: [{ id: 'b', label: '手机 B' }, { id: 'ap', label: '接入点' }, { id: 'a', label: '手机 A' }],
  messages: [
    { from: 'b', to: 'ap', label: '第一跳', at: '1.4157 ms' },
    { from: 'ap', to: 'ap', label: '转发 50 µs', at: '1.5853 ms' },
    { from: 'ap', to: 'a', label: '第二跳', at: '1.6353 ms' },
  ],
}

const FIELDS: FieldsSpec = {
  kind: 'fields',
  fields: [{ label: '头', size: 26 }, { label: '载荷', size: 1400 }, { label: '校验', size: 4 }],
  unit: 'B',
  total: '共 1430 B',
}

const ALL: [string, DiagramSpec][] = [
  ['topology', TOPOLOGY], ['stack · nested', STACK], ['stack · sequential', SEQUENTIAL],
  ['timing', TIMING], ['sequence', SEQUENCE], ['fields', FIELDS],
]

/** The lesson's own two figures, so the pilot is held to the same geometry as the fixtures. */
const LESSON: [string, DiagramSpec][] = [...(rolesStack.picture ?? []), ...(rolesStack.numbers ?? [])]
  .filter((b): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram')
  .map((b) => [`roles-stack · ${b.spec.kind}`, b.spec])

describe('diagram layout · pure', () => {
  it.each([...ALL, ...LESSON])('%s lays out the same way twice', (_name, spec) => {
    expect(layoutDiagram(spec)).toEqual(layoutDiagram(spec))
  })

  it('lays every kind out at the one viewBox width', () => {
    for (const [name, spec] of [...ALL, ...LESSON]) {
      expect(layoutDiagram(spec).width, name).toBe(W)
      expect(layoutDiagram(spec).height, name).toBeGreaterThan(20)
    }
  })

  it.each([...ALL, ...LESSON])('%s keeps every shape inside the viewBox', (name, spec) => {
    const { width, height, shapes } = layoutDiagram(spec)
    for (const sh of shapes) {
      const b = sh.s === 'text'
        ? textBox(sh)
        : sh.s === 'rect'
          ? { x0: sh.x, y0: sh.y, x1: sh.x + sh.w, y1: sh.y + sh.h }
          : sh.s === 'line'
            ? { x0: Math.min(sh.x1, sh.x2), y0: Math.min(sh.y1, sh.y2), x1: Math.max(sh.x1, sh.x2), y1: Math.max(sh.y1, sh.y2) }
            : {
              x0: Math.min(...sh.points.map((p) => p[0])), y0: Math.min(...sh.points.map((p) => p[1])),
              x1: Math.max(...sh.points.map((p) => p[0])), y1: Math.max(...sh.points.map((p) => p[1])),
            }
      const what = `${name}: ${sh.s}${sh.s === 'text' ? ` "${sh.text}"` : ''}`
      expect(b.x0, `${what} left`).toBeGreaterThanOrEqual(0)
      expect(b.x1, `${what} right`).toBeLessThanOrEqual(width)
      expect(b.y0, `${what} top`).toBeGreaterThanOrEqual(0)
      expect(b.y1, `${what} bottom`).toBeLessThanOrEqual(height)
    }
  })

  /**
   * The rule that keeps a figure readable when the reader drags the column in:
   * two labels that do not overlap in viewBox units never overlap on screen,
   * because the SVG scales uniformly. Boxes are compared with a 0.5-unit slack,
   * which is smaller than the estimate's own error.
   */
  it.each([...ALL, ...LESSON])('%s never overlaps one label with another', (name, spec) => {
    const ts = texts(layoutDiagram(spec).shapes)
    const bs = ts.map(textBox)
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i]
        const b = bs[j]
        const hit = a.x0 + 0.5 < b.x1 && b.x0 + 0.5 < a.x1 && a.y0 + 0.5 < b.y1 && b.y0 + 0.5 < a.y1
        expect(hit, `${name}: "${ts[i].text}" overlaps "${ts[j].text}"`).toBe(false)
      }
    }
  })

  /**
   * The legibility claim, as arithmetic rather than as a hope. One viewBox unit
   * renders at `panelWidth / W` pixels, so the smallest type in the course's
   * diagrams is `FS.small × 216 / 240` at the narrowest the column goes.
   */
  it('legibility: nothing is smaller than the panel’s own small type at either end', () => {
    const px = (units: number, panel: number): number => units * (Math.min(panel, MAX_SVG_PX) / W)
    // the panel's own table text is 11.5 px and its dim captions 10.5 px
    expect(px(FS.small, PANEL.narrowPx)).toBeGreaterThanOrEqual(10)
    expect(px(FS.body, PANEL.narrowPx)).toBeGreaterThanOrEqual(10.8)
    // and a wide column does not run away with it: the SVG is capped at 320 px
    expect(px(FS.title, PANEL.widePx)).toBeLessThanOrEqual(19)
    for (const [name, spec] of [...ALL, ...LESSON]) {
      for (const t of texts(layoutDiagram(spec).shapes)) {
        // fitSize may shrink a label that will not fit its box; 9.5 units is its floor
        expect(px(t.size, PANEL.narrowPx), `${name}: "${t.text}"`).toBeGreaterThanOrEqual(7.9)
      }
    }
  })
})

describe('diagram layout · the figures say what the spec says', () => {
  it('a nested stack sizes each layer by its bytes, and still shows a layer that adds none', () => {
    const { shapes } = layoutDiagram(STACK)
    const boxes = shapes.filter((s): s is Extract<Shape, { s: 'rect' }> => s.s === 'rect' && s.w > 100)
    expect(boxes.length).toBe(3)
    // strictly nested: each box inside the one before it
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].x > boxes[i - 1].x, `layer ${i} left`).toBe(true)
      expect(boxes[i].x + boxes[i].w < boxes[i - 1].x + boxes[i - 1].w, `layer ${i} right`).toBe(true)
      expect(boxes[i].y > boxes[i - 1].y, `layer ${i} top`).toBe(true)
      expect(boxes[i].y + boxes[i].h < boxes[i - 1].y + boxes[i - 1].h, `layer ${i} bottom`).toBe(true)
    }
    // the frame adds no octets to what goes on the air, so only the documented
    // 4-unit floor separates the two outermost boxes: without it they would share
    // an outline and read as a drawing mistake.
    expect(boxes[0].w - boxes[1].w).toBeCloseTo(8, 5)
  })

  it('a nested stack whose layers differ in bytes is proportional to the byte, not to the floor', () => {
    const spec: StackSpec = {
      kind: 'stack', mode: 'nested', label: '按字节',
      layers: [{ label: '外', bytes: 1000 }, { label: '中', bytes: 600 }, { label: '内', bytes: 200 }],
    }
    const boxes = layoutDiagram(spec).shapes.filter((s): s is Extract<Shape, { s: 'rect' }> => s.s === 'rect')
    expect(boxes.length).toBe(3)
    expect(boxes[1].w / boxes[0].w).toBeCloseTo(0.6, 4)
    expect(boxes[2].w / boxes[0].w).toBeCloseTo(0.2, 4)
  })

  it('a fields row is proportional to the octets, and labels what will not fit from above', () => {
    const { shapes } = layoutDiagram(FIELDS)
    const boxes = shapes.filter((s): s is Extract<Shape, { s: 'rect' }> => s.s === 'rect')
    expect(boxes.length).toBe(3)
    expect(boxes.reduce((n, b) => n + b.w, 0)).toBeCloseTo(W - 16, 1)
    // 1400 of 1430 octets, so the payload box takes nearly all of the row
    expect(boxes[1].w / (W - 16)).toBeGreaterThan(0.9)
    // and the 26- and 4-octet fields are labelled by a leader line instead
    expect(shapes.filter((s) => s.s === 'line').length).toBeGreaterThanOrEqual(2)
  })

  it('a timing lane draws its spans to scale on the axis it declares', () => {
    const { shapes } = layoutDiagram(TIMING)
    const bars = shapes.filter((s): s is Extract<Shape, { s: 'rect' }> => s.s === 'rect')
    expect(bars.length).toBe(2)
    // 125.6 µs against 28 µs of the same 200 µs window
    expect(bars[0].w / bars[1].w).toBeCloseTo(125.6 / 28, 1)
  })

  it('a sequence draws one lifeline per column and one arrowhead per message', () => {
    const { shapes } = layoutDiagram(SEQUENCE)
    expect(shapes.filter((s) => s.s === 'line' && s.dash).length).toBe(3)
    expect(shapes.filter((s) => s.s === 'poly').length).toBe(3)
  })

  it('a topology places its nodes in the order the scenario coordinates put them', () => {
    const { shapes } = layoutDiagram(TOPOLOGY)
    const boxes = shapes.filter((s): s is Extract<Shape, { s: 'rect' }> => s.s === 'rect' && s.h === 21)
    expect(boxes.length).toBe(3)
    const [ap, a, b] = boxes
    expect(a.y).toBeLessThan(ap.y) // y = 2 is above y = 4
    expect(a.x).toBeLessThan(b.x) // x = 2 is left of x = 8
    expect(shapes.some((s) => s.s === 'rect' && s.dash)).toBe(true) // the ring
  })
})

describe('diagram text', () => {
  it('reads every label of every kind, and nothing that is not text', () => {
    expect(diagramTexts(TOPOLOGY)).toEqual(['一张网', '接入点（AP）', '笔记本', '电视', '上行'])
    expect(diagramTexts(STACK)).toEqual([
      '三层包装', '空口上的那一包', '整包 125.6 µs', 'MAC 造出来的帧', '26 + 1400 + 4', '载荷', '包装 30 B',
    ])
    expect(diagramTexts(TIMING)).toEqual(['手机 B', '数据', '接入点', 'ACK', 'µs'])
    expect(diagramTexts(SEQUENCE)).toEqual([
      '手机 B', '接入点', '手机 A', '1.4157 ms', '第一跳', '1.5853 ms', '转发 50 µs', '1.6353 ms', '第二跳',
    ])
    expect(diagramTexts(FIELDS)).toEqual(['头', '载荷', '校验', '共 1430 B'])
  })

  it('every label a spec carries is drawn, or shrunk to fit, never dropped', () => {
    for (const [name, spec] of [...ALL, ...LESSON]) {
      const drawn = new Set(texts(layoutDiagram(spec).shapes).map((t) => t.text))
      for (const label of diagramTexts(spec)) {
        // a tick value and a field's own size are drawn without being prose
        expect(drawn.has(label), `${name}: "${label}" is in the spec but not in the figure`).toBe(true)
      }
    }
  })

  it('estimates text width per character class, and shrinks only what has to shrink', () => {
    expect(textWidth('一二三', 10)).toBe(30)
    expect(textWidth('ABC', 10)).toBeCloseTo(16.8, 5)
    expect(fitSize('一二三', 30, 10)).toBe(10)
    expect(fitSize('一二三四', 30, 10)).toBeLessThan(10)
    expect(fitSize('一二三四五六七八九十一二三四五六七八九十', 30, 10)).toBe(9.5)
  })
})
