/**
 * The lesson diagrams: five declarative specs, and one pure layout function per
 * kind that turns a spec into primitive shapes with coordinates.
 *
 * Why it is split this way
 * ------------------------
 * A diagram in this course is DATA, derived from the run wherever the figures
 * exist (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md): a
 * lesson declares a spec whose numbers come from the engine, a test pins those
 * numbers against a recorded run, and the picture therefore cannot drift from
 * the simulator. Layout is a pure function of the spec — no DOM, no measuring,
 * no React — so the geometry is testable: `tests/course/diagram.test.ts` checks
 * that nothing leaves the viewBox, that no two labels overlap, and that the
 * boxes really are proportional to the bytes they claim.
 *
 * `CoursePanel` only paints what these functions return. It never computes a
 * coordinate and never picks a colour: a shape names a {@link Paint} role and
 * the panel maps that role to one of the app's CSS variables, so a diagram
 * follows the theme instead of hard-coding black or white.
 *
 * The coordinate space
 * --------------------
 * Everything is laid out in a {@link W}-unit-wide viewBox and rendered with
 * `width: 100%`, so one viewBox unit is `panelContentWidth / W` pixels. The
 * course column is draggable between 240 and 900 px (`COURSE_COL_LIMITS` in
 * src/ui/App.tsx), which after the panel's 12 px padding and its scrollbar
 * leaves about 200 px at the narrow end, and the render caps the SVG at 320 px
 * so a wide panel does not blow the text up. With W = 240 the narrow end
 * therefore renders at 0.83 ×, and the smallest type in this file,
 * {@link FS.small} = 12 units, lands at 10 px — beside the 10.5 px the panel's
 * own dim captions already use. That was measured in the browser at both ends,
 * not assumed, and it is the whole reason the sizes are named constants rather
 * than literals.
 *
 * Text metrics are estimated ({@link textWidth}) rather than measured, because
 * layout must run without a DOM. The estimate is deliberately generous for
 * full-width characters (one em each), so a label that the test says fits its
 * box really does fit it in the browser.
 */

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/**
 * A colour, named by what it means rather than by what it is. The panel maps
 * each one to a CSS variable (`var(--panel)`, `var(--border)`, …), so a diagram
 * is readable in whatever theme the app is wearing.
 */
export type Paint = 'none' | 'panel' | 'panel2' | 'border' | 'text' | 'dim' | 'accent'

export type Anchor = 'start' | 'middle' | 'end'

/** The only shapes a layout may emit; the panel can paint exactly these four. */
export type Shape =
  | { s: 'rect'; x: number; y: number; w: number; h: number; fill: Paint; stroke: Paint; r?: number; dash?: boolean; opacity?: number }
  | { s: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: Paint; dash?: boolean }
  | { s: 'poly'; points: readonly (readonly [number, number])[]; fill: Paint; stroke: Paint }
  | { s: 'text'; x: number; y: number; text: string; fill: Paint; anchor: Anchor; size: number; bold?: boolean }

/** A laid-out diagram: the viewBox, and the shapes inside it. */
export interface DiagramLayout {
  width: number
  height: number
  shapes: Shape[]
}

/** The viewBox width every diagram is laid out in. See the header note. */
export const W = 240

/** The margin kept clear on every side. */
const PAD = 8

/** Font sizes in viewBox units; `small` is the floor the legibility note relies on. */
export const FS = { title: 14, body: 13, small: 12 } as const

/** The size {@link fitSize} will not shrink below; a label this small is a bug in the spec. */
const MIN_SIZE = 9.5

const FULL_WIDTH = /[⺀-鿿　-〿＀-￯]/

/**
 * How wide `text` is at `size`, in viewBox units. A CJK ideograph or full-width
 * bracket is one em; a Latin letter or digit is 0.56 em, which is a shade wide
 * for the panel's sans-serif and therefore safe.
 */
export function textWidth(text: string, size: number): number {
  let w = 0
  for (const ch of text) {
    if (FULL_WIDTH.test(ch)) w += size
    else if (/[A-Za-z0-9]/.test(ch)) w += size * 0.56
    else if (ch === ' ') w += size * 0.3
    else w += size * 0.36
  }
  return w
}

/** The largest size at or below `base` at which `text` fits `maxW`, never under {@link MIN_SIZE}. */
export function fitSize(text: string, maxW: number, base: number): number {
  const w = textWidth(text, base)
  if (w <= maxW || w === 0) return base
  return Math.max(MIN_SIZE, Math.round((base * maxW) / w * 10) / 10)
}

/** An axis-aligned box, as the overlap tests and the label packers speak of one. */
export interface Box { x0: number; y0: number; x1: number; y1: number }

/** The box a text shape occupies, from its anchor, its size and {@link textWidth}. */
export function textBox(t: Extract<Shape, { s: 'text' }>): Box {
  const w = textWidth(t.text, t.size)
  const x0 = t.anchor === 'start' ? t.x : t.anchor === 'end' ? t.x - w : t.x - w / 2
  // Roughly the cap height above the baseline and the descender below it.
  return { x0, y0: t.y - t.size * 0.82, x1: x0 + w, y1: t.y + t.size * 0.24 }
}

const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

const pad = (b: Box, by: number): Box => ({ x0: b.x0 - by, y0: b.y0 - by, x1: b.x1 + by, y1: b.y1 + by })

const box = (x: number, y: number, w: number, h: number): Box => ({ x0: x, y0: y, x1: x + w, y1: y + h })

const round = (n: number): number => Math.round(n * 100) / 100

const rect = (
  x: number, y: number, w: number, h: number,
  fill: Paint, stroke: Paint, extra: { r?: number; dash?: boolean; opacity?: number } = {},
): Shape => ({ s: 'rect', x: round(x), y: round(y), w: round(w), h: round(h), fill, stroke, ...extra })

const text = (
  x: number, y: number, s: string, size: number, anchor: Anchor = 'start',
  fill: Paint = 'text', bold = false,
): Extract<Shape, { s: 'text' }> => ({ s: 'text', x: round(x), y: round(y), text: s, fill, anchor, size, bold })

const line = (x1: number, y1: number, x2: number, y2: number, stroke: Paint, dash = false): Shape =>
  ({ s: 'line', x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2), stroke, dash })

/** Half the width of an arrowhead, and how far back from the tip it starts. */
const HEAD = { len: 5.5, half: 2.8 }

/** A line ending in a solid head at (x2, y2); the head is a polygon the panel just fills. */
function arrow(out: Shape[], x1: number, y1: number, x2: number, y2: number, stroke: Paint, dash = false): void {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const bx = x2 - ux * HEAD.len
  const by = y2 - uy * HEAD.len
  out.push(line(x1, y1, bx, by, stroke, dash))
  out.push({
    s: 'poly',
    points: [
      [round(x2), round(y2)],
      [round(bx - uy * HEAD.half), round(by + ux * HEAD.half)],
      [round(bx + uy * HEAD.half), round(by - ux * HEAD.half)],
    ],
    fill: stroke,
    stroke: 'none',
  })
}

/**
 * A label with the panel's own background painted behind it, so it stays legible
 * where it crosses a link or a lifeline.
 */
function maskedText(out: Shape[], t: Extract<Shape, { s: 'text' }>): void {
  const b = pad(textBox(t), 1.5)
  out.push(rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 'panel', 'none'))
  out.push(t)
}

// ---------------------------------------------------------------------------
// the five specs
// ---------------------------------------------------------------------------

/** How prominent one line or link is: ordinary, the thing the figure is about, or ruled out. */
export type Tone = 'plain' | 'accent' | 'muted'

export interface TopologyNode {
  /** The scenario node id, so a test can compare the figure with the scene. */
  id: string
  label: string
  role: 'ap' | 'sta'
  /** Scenario coordinates, in metres; only their relative positions are used. */
  x: number
  y: number
}

export interface TopologyLink {
  from: string
  to: string
  label?: string
  /** `muted` draws it dashed: a path the run shows does not work. */
  tone?: Tone
  /** A head at each end rather than one at `to`. */
  both?: boolean
}

/** Who talks to whom: nodes at their scenario positions, the links between them, one grouping ring. */
export interface TopologySpec {
  kind: 'topology'
  nodes: TopologyNode[]
  links: TopologyLink[]
  /** A dashed frame drawn round the named nodes, carrying its own label. */
  ring?: { nodes: string[]; label: string }
}

export interface StackLayer {
  label: string
  /** Real bytes: what sizes the box. */
  bytes: number
  /** The exact figures this layer adds, printed under its label. */
  note?: string
}

/**
 * What wraps what. `nested` draws each layer inside the one before it — a
 * payload inside a frame inside what goes on the air; `sequential` puts them
 * side by side. Either way a box's width is its share of the bytes.
 */
export interface StackSpec {
  kind: 'stack'
  mode: 'nested' | 'sequential'
  /** The overall label: what the whole picture is one of. */
  label: string
  /** Outermost first for `nested`, left to right for `sequential`. */
  layers: StackLayer[]
  /** A closing figure under the boxes: the airtime, the overhead, the total. */
  total?: string
}

export interface TimingSpan {
  label?: string
  fromUs: number
  toUs: number
  tone?: Tone
}

export interface TimingLane {
  label: string
  spans: TimingSpan[]
}

/** A time axis with lanes of labelled spans, drawn to scale; the gaps are the spans' absence. */
export interface TimingSpec {
  kind: 'timing'
  lanes: TimingLane[]
  axis: { fromUs: number; toUs: number; ticks: number[]; unit?: string }
}

export interface SequenceMessage {
  from: string
  /** The same id as `from` draws a message a column sends to itself. */
  to: string
  label: string
  /** The instant it happens, printed in the left gutter exactly as the prose writes it. */
  at?: string
  tone?: Tone
}

/** An exchange: a column per party, an arrow per message, in the order they happen. */
export interface SequenceSpec {
  kind: 'sequence'
  columns: { id: string; label: string }[]
  messages: SequenceMessage[]
}

export interface Field {
  label: string
  /** Bytes, or microseconds — whichever `unit` says; what sizes the box. */
  size: number
}

/** One row of boxes proportional to bytes or microseconds, with the total. */
export interface FieldsSpec {
  kind: 'fields'
  fields: Field[]
  unit: 'B' | 'µs'
  /** The sum, printed under the row. */
  total: string
}

export type DiagramSpec = TopologySpec | StackSpec | TimingSpec | SequenceSpec | FieldsSpec

// ---------------------------------------------------------------------------
// every string a reader sees
// ---------------------------------------------------------------------------

const KINDS = new Set(['topology', 'stack', 'timing', 'sequence', 'fields'])

/**
 * Whether a value is one of the five specs. `lessonStrings` asks, because its
 * generic walk over a lesson would otherwise read a node's id and a link's ends
 * as text a learner reads; {@link diagramTexts} is what knows the difference.
 */
export function isDiagramSpec(v: unknown): v is DiagramSpec {
  return typeof v === 'object' && v !== null && KINDS.has((v as { kind?: unknown }).kind as string)
}

/**
 * Every label in a spec, in reading order. `paragraphTexts` splices this into a
 * lesson's prose, which is what makes the terminology rule grade a diagram's
 * labels exactly as it grades a sentence: a term named for the first time inside
 * a diagram has to carry its English name like any other first use.
 *
 * Ids, tones and numbers are not text a reader reads, so they are absent.
 */
export function diagramTexts(spec: DiagramSpec): string[] {
  switch (spec.kind) {
    case 'topology':
      return [
        ...(spec.ring ? [spec.ring.label] : []),
        ...spec.nodes.map((n) => n.label),
        ...spec.links.flatMap((l) => (l.label ? [l.label] : [])),
      ]
    case 'stack':
      return [
        spec.label,
        ...spec.layers.flatMap((l) => (l.note ? [l.label, l.note] : [l.label])),
        ...(spec.total ? [spec.total] : []),
      ]
    case 'timing':
      return [
        ...spec.lanes.flatMap((l) => [l.label, ...l.spans.flatMap((s) => (s.label ? [s.label] : []))]),
        ...(spec.axis.unit ? [spec.axis.unit] : []),
      ]
    case 'sequence':
      return [
        ...spec.columns.map((c) => c.label),
        ...spec.messages.flatMap((m) => (m.at ? [m.at, m.label] : [m.label])),
      ]
    case 'fields':
      return [...spec.fields.map((f) => f.label), spec.total]
  }
}

// ---------------------------------------------------------------------------
// topology
// ---------------------------------------------------------------------------

const NODE = { h: 21, padX: 7, minW: 40 }
/** The vertical room the node field gets; the scenario's y range is mapped onto it. */
const TOPO_FIELD_H = 96
/** How far the ring is drawn outside the nodes it groups, and the room its label needs above. */
const RING = { gap: 7, labelH: 15, r: 12 }

const toneStroke = (t: Tone | undefined): Paint => (t === 'accent' ? 'accent' : 'dim')

/** Where a ray from the centre of `b` towards (tx, ty) leaves the box. */
function exit(b: Box, tx: number, ty: number): [number, number] {
  const cx = (b.x0 + b.x1) / 2
  const cy = (b.y0 + b.y1) / 2
  const dx = tx - cx
  const dy = ty - cy
  const k = Math.min(
    Math.abs(dx) < 1e-6 ? Infinity : (b.x1 - cx) / Math.abs(dx),
    Math.abs(dy) < 1e-6 ? Infinity : (b.y1 - cy) / Math.abs(dy),
  )
  return [cx + dx * Math.min(k, 1), cy + dy * Math.min(k, 1)]
}

export function layoutTopology(sp: TopologySpec): DiagramLayout {
  const shapes: Shape[] = []
  const size = FS.body
  const widths = new Map(sp.nodes.map((n) => [n.id, Math.max(NODE.minW, textWidth(n.label, size) + NODE.padX * 2)]))
  const maxW = Math.max(...widths.values())
  const xs = sp.nodes.map((n) => n.x)
  const ys = sp.nodes.map((n) => n.y)
  const spanX = Math.max(...xs) - Math.min(...xs) || 1
  const spanY = Math.max(...ys) - Math.min(...ys) || 1
  const inset = sp.ring ? RING.gap + 2 : 0
  const left = PAD + inset + maxW / 2
  const right = W - PAD - inset - maxW / 2
  const top = PAD + (sp.ring ? RING.labelH + RING.gap : 0) + NODE.h / 2
  const place = (n: TopologyNode): Box => {
    const w = widths.get(n.id)!
    const cx = left + ((n.x - Math.min(...xs)) / spanX) * (right - left)
    const cy = top + ((n.y - Math.min(...ys)) / spanY) * TOPO_FIELD_H
    return box(cx - w / 2, cy - NODE.h / 2, w, NODE.h)
  }
  const at = new Map(sp.nodes.map((n) => [n.id, place(n)]))
  const height = top + TOPO_FIELD_H + NODE.h / 2 + (sp.ring ? RING.gap : 0) + PAD

  // the ring first, so every link and box is drawn over it
  if (sp.ring) {
    const inside = sp.ring.nodes.map((id) => at.get(id)!).filter(Boolean)
    const r = {
      x0: Math.min(...inside.map((b) => b.x0)) - RING.gap,
      y0: Math.min(...inside.map((b) => b.y0)) - RING.gap,
      x1: Math.max(...inside.map((b) => b.x1)) + RING.gap,
      y1: Math.max(...inside.map((b) => b.y1)) + RING.gap,
    }
    shapes.push(rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 'none', 'border', { r: RING.r, dash: true }))
    shapes.push(text(r.x0 + 2, r.y0 - 4, sp.ring.label, FS.small, 'start', 'dim'))
  }

  // links, then their labels at the first spot along the line that is free
  const taken: Box[] = [...at.values()]
  const labels: Extract<Shape, { s: 'text' }>[] = []
  for (const l of sp.links) {
    const a = at.get(l.from)
    const b = at.get(l.to)
    if (!a || !b) continue
    const ac = [(a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2] as const
    const bc = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2] as const
    const [x1, y1] = exit(a, bc[0], bc[1])
    const [x2, y2] = exit(b, ac[0], ac[1])
    const stroke = toneStroke(l.tone)
    const dash = l.tone === 'muted'
    if (l.tone === 'muted') shapes.push(line(x1, y1, x2, y2, stroke, dash))
    else {
      arrow(shapes, x1, y1, x2, y2, stroke, dash)
      if (l.both) arrow(shapes, x2, y2, x1, y1, stroke, dash)
    }
    if (!l.label) continue
    const fs = fitSize(l.label, W - 2 * PAD, FS.small)
    let best: Extract<Shape, { s: 'text' }> | null = null
    for (const t of [0.5, 0.34, 0.66, 0.22, 0.78]) {
      const cand = text(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t - 1, l.label, fs, 'middle', l.tone === 'muted' ? 'dim' : 'text')
      const b2 = pad(textBox(cand), 1.5)
      if (b2.x0 < PAD || b2.x1 > W - PAD) continue
      if (taken.some((o) => overlaps(o, b2))) continue
      best = cand
      break
    }
    const chosen = best ?? text(x1 + (x2 - x1) * 0.5, y1 + (y2 - y1) * 0.5 - 1, l.label, fs, 'middle', 'text')
    taken.push(pad(textBox(chosen), 1.5))
    labels.push(chosen)
  }
  for (const t of labels) maskedText(shapes, t)

  // the nodes last, so a link never crosses a box
  for (const n of sp.nodes) {
    const b = at.get(n.id)!
    shapes.push(rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 'panel2', n.role === 'ap' ? 'accent' : 'border', { r: 4 }))
    shapes.push(text((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 + size * 0.34, n.label, size, 'middle', 'text', n.role === 'ap'))
  }
  return { width: W, height: Math.round(height), shapes }
}

// ---------------------------------------------------------------------------
// stack
// ---------------------------------------------------------------------------

/** One layer's own rows: the label line, and the note line under it. */
const LAYER = { label: 16, note: 15, bottom: 7 }
/**
 * The smallest step a nested layer is inset by, even when it adds no bytes at
 * all. The horizontal inset is proportional to the bytes a layer adds — which
 * is the honest picture, and for a 26-byte header a thin one — but a layer that
 * adds time rather than bytes would otherwise share its child's outline and read
 * as a drawing mistake. The floor is what keeps the nesting visible; the layer's
 * own note carries the figures.
 */
const NEST_MIN_STEP = 4

export function layoutStack(sp: StackSpec): DiagramLayout {
  return sp.mode === 'nested' ? nestedStack(sp) : sequentialStack(sp)
}

function nestedStack(sp: StackSpec): DiagramLayout {
  const shapes: Shape[] = []
  let y = PAD
  shapes.push(text(PAD, y + FS.title * 0.85, sp.label, FS.title, 'start', 'text', true))
  y += FS.title + 6

  const outer = Math.max(...sp.layers.map((l) => l.bytes))
  const full = W - 2 * PAD
  const insets: number[] = []
  for (const [i, l] of sp.layers.entries()) {
    const prop = ((outer - l.bytes) / outer) * (full / 2)
    insets.push(i === 0 ? 0 : Math.max(prop, insets[i - 1] + NEST_MIN_STEP))
  }
  const rowH = (l: StackLayer): number => LAYER.label + (l.note ? LAYER.note : 0)
  const last = sp.layers.length - 1
  let height = rowH(sp.layers[last]) + 4
  for (let i = last - 1; i >= 0; i--) height += rowH(sp.layers[i]) + LAYER.bottom
  const top = y

  for (const [i, l] of sp.layers.entries()) {
    const x = PAD + insets[i]
    const w = full - insets[i] * 2
    // layer i opens rowH(p) below its parent's own label rows and closes
    // LAYER.bottom above its parent's floor, so every layer encloses the next.
    const yTop = top + sp.layers.slice(0, i).reduce((n, p) => n + rowH(p), 0)
    const h = height - (yTop - top) - i * LAYER.bottom
    shapes.push(rect(x, yTop, w, h, i === last ? 'panel2' : 'none', i === last ? 'accent' : 'border', { r: 4 }))
    const inner = w - 10
    const lfs = fitSize(l.label, inner, FS.body)
    shapes.push(text(x + 5, yTop + LAYER.label * 0.72, l.label, lfs, 'start', 'text', i === last))
    if (l.note) {
      const nfs = fitSize(l.note, inner, FS.small)
      shapes.push(text(x + 5, yTop + LAYER.label + LAYER.note * 0.66, l.note, nfs, 'start', 'dim'))
    }
  }
  y = top + height
  if (sp.total) {
    y += 4
    shapes.push(text(W - PAD, y + FS.small * 0.85, sp.total, fitSize(sp.total, W - 2 * PAD, FS.small), 'end', 'dim'))
    y += FS.small
  }
  return { width: W, height: Math.round(y + PAD), shapes }
}

function sequentialStack(sp: StackSpec): DiagramLayout {
  const shapes: Shape[] = []
  let y = PAD
  shapes.push(text(PAD, y + FS.title * 0.85, sp.label, FS.title, 'start', 'text', true))
  y += FS.title + 6
  y = boxRow(shapes, sp.layers.map((l) => ({ label: l.label, size: l.bytes, note: l.note })), y, ROW_H)
  if (sp.total) {
    y += 4
    shapes.push(text(W - PAD, y + FS.small * 0.85, sp.total, fitSize(sp.total, W - 2 * PAD, FS.small), 'end', 'dim'))
    y += FS.small
  }
  return { width: W, height: Math.round(y + PAD), shapes }
}

// ---------------------------------------------------------------------------
// one row of proportional boxes: `fields`, and `stack` in sequential mode
// ---------------------------------------------------------------------------

interface RowItem { label: string; size: number; note?: string }

/** How tall one row of callout labels above a box row is. */
const CALLOUT_H = 13
/** The narrowest a box may be drawn, however few bytes it holds. */
const MIN_BOX_W = 7
/** How tall a box in such a row is: two lines of {@link FS.small} with air between them. */
const ROW_H = 32

/**
 * A row of boxes at `y`, proportional to `size`, returning the y under it. A
 * label that fits its box is drawn inside; one that does not is drawn above, on
 * the first callout row where it does not collide, with a leader line down to
 * its box — which is what keeps a 26-byte field in a 1430-byte row labelled.
 */
function boxRow(shapes: Shape[], items: RowItem[], y: number, h: number): number {
  const full = W - 2 * PAD
  const total = items.reduce((n, it) => n + it.size, 0) || 1
  const raw = items.map((it) => Math.max(MIN_BOX_W, (it.size / total) * full))
  const scale = full / raw.reduce((a, b) => a + b, 0)
  const ws = raw.map((w) => w * scale)
  const xs: number[] = []
  let x = PAD
  for (const w of ws) { xs.push(x); x += w }

  // where each label goes, before anything is emitted, so the callout rows can be counted
  const inside: (number | null)[] = []
  const callouts: { i: number; row: number; fs: number; x: number }[] = []
  const rows: Box[][] = []
  items.forEach((it, i) => {
    const fs = fitSize(it.label, ws[i] - 6, FS.small)
    if (textWidth(it.label, FS.small) + 6 <= ws[i]) { inside.push(FS.small); return }
    inside.push(null)
    const lw = textWidth(it.label, FS.small)
    const lx = Math.min(xs[i] + ws[i] / 2 + 3, W - PAD - lw)
    const cand = text(lx, 0, it.label, FS.small, 'start')
    const b = pad(textBox(cand), 1.5)
    let row = 0
    while (rows[row]?.some((o) => o.x0 < b.x1 && b.x0 < o.x1)) row++
    rows[row] = [...(rows[row] ?? []), b]
    callouts.push({ i, row, fs: Math.min(fs, FS.small), x: lx })
  })
  const used = rows.length
  const top = y + used * CALLOUT_H

  for (const c of callouts) {
    const cx = xs[c.i] + ws[c.i] / 2
    const ly = y + (used - c.row) * CALLOUT_H
    shapes.push(line(cx, ly - 1, cx, top, 'border'))
    shapes.push(text(c.x, ly - 3, items[c.i].label, c.fs, 'start', 'dim'))
  }
  items.forEach((it, i) => {
    shapes.push(rect(xs[i], top, ws[i], h, 'panel2', 'border'))
    if (inside[i] !== null) {
      shapes.push(text(xs[i] + ws[i] / 2, top + h * 0.40, it.label, inside[i]!, 'middle', 'text'))
    }
    if (it.note) {
      const nfs = fitSize(it.note, ws[i] - 4, FS.small)
      if (textWidth(it.note, nfs) + 4 <= ws[i]) {
        shapes.push(text(xs[i] + ws[i] / 2, top + h * 0.84, it.note, nfs, 'middle', 'dim'))
      }
    }
  })
  return top + h
}

export function layoutFields(sp: FieldsSpec): DiagramLayout {
  const shapes: Shape[] = []
  const y = boxRow(
    shapes,
    sp.fields.map((f) => ({ label: f.label, size: f.size, note: `${f.size} ${sp.unit}` })),
    PAD, ROW_H,
  )
  const fs = fitSize(sp.total, W - 2 * PAD, FS.small)
  shapes.push(text(W - PAD, y + 4 + fs * 0.85, sp.total, fs, 'end', 'dim'))
  return { width: W, height: Math.round(y + 4 + fs + PAD), shapes }
}

// ---------------------------------------------------------------------------
// timing
// ---------------------------------------------------------------------------

const LANE = { h: 15, gap: 5, callout: 12 }
/** The widest the lane-label gutter may grow; past this the labels are shrunk instead. */
const GUTTER_MAX = 62
const AXIS = { h: 4, gap: 4 }

export function layoutTiming(sp: TimingSpec): DiagramLayout {
  const shapes: Shape[] = []
  const gutter = Math.min(GUTTER_MAX, Math.max(...sp.lanes.map((l) => textWidth(l.label, FS.small))) + 4)
  const x0 = PAD + gutter
  const x1 = W - PAD
  const { fromUs, toUs } = sp.axis
  const span = toUs - fromUs || 1
  const at = (us: number): number => x0 + ((us - fromUs) / span) * (x1 - x0)
  let y = PAD

  for (const lane of sp.lanes) {
    // labels that do not fit their span go on a callout row above it
    const placed: Box[] = []
    const callouts: { span: TimingSpan; b: Box }[] = []
    for (const s of lane.spans) {
      if (!s.label) continue
      const w = at(s.toUs) - at(s.fromUs)
      if (textWidth(s.label, FS.small) + 4 <= w) continue
      const cand = text(at(s.fromUs), y + LANE.callout - 3, s.label, FS.small, 'start', 'dim')
      const b = pad(textBox(cand), 1.5)
      const shifted = b.x1 > x1 ? { ...b, x0: b.x0 - (b.x1 - x1), x1 } : b
      const clear = placed.every((o) => !(o.x0 < shifted.x1 && shifted.x0 < o.x1))
      callouts.push({ span: s, b: clear ? shifted : { ...shifted, x0: Math.max(...placed.map((o) => o.x1)) + 3, x1: Math.max(...placed.map((o) => o.x1)) + 3 + (shifted.x1 - shifted.x0) } })
      placed.push(callouts[callouts.length - 1].b)
    }
    const rowTop = y + (callouts.length ? LANE.callout : 0)
    shapes.push(text(PAD, rowTop + LANE.h * 0.68, lane.label, fitSize(lane.label, gutter - 3, FS.small), 'start', 'dim'))
    shapes.push(line(x0, rowTop + LANE.h / 2, x1, rowTop + LANE.h / 2, 'border'))
    for (const s of lane.spans) {
      const sx = at(s.fromUs)
      const w = Math.max(1.5, at(s.toUs) - sx)
      const accent = s.tone === 'accent'
      shapes.push(rect(sx, rowTop, w, LANE.h, accent ? 'accent' : 'panel2', s.tone === 'muted' ? 'border' : accent ? 'accent' : 'dim',
        { r: 2, opacity: accent ? 0.35 : undefined }))
      if (!s.label) continue
      if (textWidth(s.label, FS.small) + 4 <= w) {
        shapes.push(text(sx + w / 2, rowTop + LANE.h * 0.68, s.label, FS.small, 'middle', 'text'))
      }
    }
    for (const c of callouts) {
      shapes.push(text(c.b.x0 + 1.5, y + LANE.callout - 3, c.span.label!, FS.small, 'start', 'dim'))
      const cx = at(c.span.fromUs)
      shapes.push(line(cx, y + LANE.callout - 1, cx, rowTop, 'border'))
    }
    y = rowTop + LANE.h + LANE.gap
  }

  // the axis: one line, one tick per value, the first and last pulled inside the box
  y += AXIS.gap
  shapes.push(line(x0, y, x1, y, 'dim'))
  for (const t of sp.axis.ticks) {
    const tx = at(t)
    shapes.push(line(tx, y, tx, y + AXIS.h, 'dim'))
    const label = String(t)
    const anchor: Anchor = tx - textWidth(label, FS.small) / 2 < PAD ? 'start' : tx + textWidth(label, FS.small) / 2 > W - PAD ? 'end' : 'middle'
    shapes.push(text(tx, y + AXIS.h + FS.small * 0.9, label, FS.small, anchor, 'dim'))
  }
  y += AXIS.h + FS.small * 1.1
  if (sp.axis.unit) {
    shapes.push(text(PAD, y + FS.small * 0.9, sp.axis.unit, FS.small, 'start', 'dim'))
    y += FS.small
  }
  return { width: W, height: Math.round(y + PAD), shapes }
}

// ---------------------------------------------------------------------------
// sequence
// ---------------------------------------------------------------------------

const SEQ = { head: 20, row: 25, top: 10, self: 13 }

export function layoutSequence(sp: SequenceSpec): DiagramLayout {
  const shapes: Shape[] = []
  const ats = sp.messages.map((m) => m.at).filter((a): a is string => Boolean(a))
  const gutter = ats.length ? Math.max(...ats.map((a) => textWidth(a, FS.small))) + 4 : 0
  const x0 = PAD + gutter
  const usable = W - PAD - x0
  const n = sp.columns.length
  const colW = usable / n
  const cx = sp.columns.map((_c, i) => x0 + colW * (i + 0.5))
  let y = PAD

  sp.columns.forEach((c, i) => {
    const fs = fitSize(c.label, colW - 4, FS.body)
    const w = Math.min(colW - 3, textWidth(c.label, fs) + 10)
    shapes.push(rect(cx[i] - w / 2, y, w, SEQ.head, 'panel2', 'border', { r: 4 }))
    shapes.push(text(cx[i], y + SEQ.head * 0.66, c.label, fs, 'middle', 'text', true))
  })
  const lifeTop = y + SEQ.head
  y = lifeTop + SEQ.top

  const rows: number[] = []
  for (const [i, m] of sp.messages.entries()) {
    const ry = y + i * SEQ.row
    rows.push(ry)
    const from = sp.columns.findIndex((c) => c.id === m.from)
    const to = sp.columns.findIndex((c) => c.id === m.to)
    if (from < 0 || to < 0) continue
    const stroke = toneStroke(m.tone)
    if (m.at) shapes.push(text(PAD, ry + FS.small * 0.3, m.at, fitSize(m.at, gutter - 3, FS.small), 'start', 'dim'))
    if (from === to) {
      const bx = cx[from]
      const w = Math.min(SEQ.self, (W - PAD - bx) - 2)
      shapes.push(line(bx, ry - 4, bx + w, ry - 4, stroke))
      shapes.push(line(bx + w, ry - 4, bx + w, ry + 4, stroke))
      arrow(shapes, bx + w, ry + 4, bx, ry + 4, stroke)
      const fs = fitSize(m.label, W - PAD - (bx + w + 3), FS.small)
      maskedText(shapes, text(bx + w + 3, ry + FS.small * 0.36, m.label, fs, 'start', 'text'))
      continue
    }
    const dir = to > from ? 1 : -1
    const ax = cx[from] + dir * 3
    const bx = cx[to] - dir * 3
    arrow(shapes, ax, ry, bx, ry, stroke, m.tone === 'muted')
    const mid = (ax + bx) / 2
    const fs = fitSize(m.label, Math.abs(bx - ax) - 4, FS.small)
    maskedText(shapes, text(mid, ry - 3.5, m.label, fs, 'middle', 'text'))
  }
  const bottom = (rows[rows.length - 1] ?? y) + SEQ.row * 0.5
  // the lifelines last, drawn behind nothing: they are painted first in the output
  const lines: Shape[] = sp.columns.map((_c, i) => line(cx[i], lifeTop, cx[i], bottom, 'border', true))
  return { width: W, height: Math.round(bottom + PAD), shapes: [...lines, ...shapes] }
}

// ---------------------------------------------------------------------------
// the dispatcher
// ---------------------------------------------------------------------------

/** A spec, laid out. Pure: the same spec always gives the same coordinates. */
export function layoutDiagram(spec: DiagramSpec): DiagramLayout {
  switch (spec.kind) {
    case 'topology': return layoutTopology(spec)
    case 'stack': return layoutStack(spec)
    case 'timing': return layoutTiming(spec)
    case 'sequence': return layoutSequence(spec)
    case 'fields': return layoutFields(spec)
  }
}
