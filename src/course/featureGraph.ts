/**
 * **The two coverage tables, as a graph.**
 *
 * `docs/wifi-feature-coverage.md` (123 rows) and `docs/uwb-feature-coverage.md` (109 rows) each
 * answer, row by row: what does the standard say, what does the draft propose, what did this
 * engine build, and which lesson teaches it. They are the repository's own account of its scope
 * — and they are long. This module turns them into something a reader can see at once: a layered
 * dependency spine, each box carrying its rows and the colour of what is built.
 *
 * **Both documents are imported with `?raw` and parsed here at build time.** That is the whole
 * design: a graph that held its own copy of 232 rows would be a second site for every figure in
 * them, and this repository has spent a month proving what happens to second sites
 * (`docs/course-figure-pinning.md`). Edit a row in the document and this picture changes with it;
 * there is nothing to keep in step.
 *
 * **What this file DOES author is the spine** — which group a row belongs to, and which group
 * needs which. That is a judgement about the subject, not a copy of the data, and it is the only
 * thing here that can be wrong on its own. `tests/course/feature-graph.test.ts` holds it to three
 * rules: every row lands in exactly one group, no group is empty, and every lesson of the track
 * is claimed by some group — the last one because on 2026-10-14 the UWB table turned out never to
 * mention two lessons that had shipped nine days earlier (that document's §17, entry 5).
 */
import uwbDoc from '../../docs/uwb-feature-coverage.md?raw'
import wifiDoc from '../../docs/wifi-feature-coverage.md?raw'

export type Track = 'wifi' | 'uwb'

/** What the engine did with a feature. Both documents use these three words and only these. */
export type EngineState = '已建模' | '部分建模' | '未建模'

/** One data row of a coverage table, with the section it sits under. */
export interface FeatureRow {
  feature: string
  /** The second column verbatim: the two documents have different vocabularies. */
  status: string
  /** The second column reduced to the handful of kinds a colour can carry. */
  statusKind: StatusKind
  engine: EngineState
  evidence: string
  section: string
  /** `@lesson-id` citations in the evidence cell, in order of first appearance. */
  lessons: string[]
}

/**
 * The colours the second column reduces to.
 *
 * The UWB table's vocabulary is a closed five-value set about the 4ab draft's progress; the Wi-Fi
 * table's is about which published document a row leans on, with 「标准不规定」 for the parts no
 * standard covers. They meet in three kinds: something published, something still moving, and
 * something no document settles.
 */
export type StatusKind = 'published' | 'draft' | 'contested' | 'unsettled' | 'none'

const STATUS_KIND: [RegExp, StatusKind][] = [
  [/^已发布/, 'published'],
  [/^已进草案/, 'draft'],
  [/^仍在争论/, 'contested'],
  [/^(无法判定|标准里查不到)/, 'unsettled'],
  [/^(标准不规定|仅为提案)/, 'none'],
]

const ENGINE: EngineState[] = ['已建模', '部分建模', '未建模']

/**
 * Split a Markdown table row into cells, honouring `\|` inside a cell.
 *
 * This is the same rule as `tests/course/coverage.ts#splitCells`, and the two are held together by
 * `feature-graph.test.ts` asserting that this parser and `dataRows` find the same number of rows
 * in both documents. They cannot be one function: that one reads the file system, and this one
 * runs in the browser.
 */
function splitCells(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '\\' && line[i + 1] === '|') { cur += '|'; i += 1; continue }
    if (line[i] === '|') { cells.push(cur); cur = ''; continue }
    cur += line[i]
  }
  cells.push(cur)
  if (cells.length > 1 && cells[0] === '') cells.shift()
  if (cells.length > 1 && cells[cells.length - 1] === '') cells.pop()
  return cells
}

const kindOf = (status: string): StatusKind | null =>
  STATUS_KIND.find(([re]) => re.test(status))?.[1] ?? null

/**
 * The leading word of a verdict cell.
 *
 * **Neither column is a bare closed vocabulary**, and the Wi-Fi document says so in its totals
 * section: a cell may qualify its verdict (「已建模（而且是一处简化）」, 「已建模（并且被 schema
 * 拒掉）」) or spell out a mixed source (「分格单位出自标准 + 每格的起伏标准不规定」), and the
 * document files such a row under its prefix with both halves written out. `prefixOf` is the same
 * rule `tests/course/wifi-coverage.test.ts` counts with — and reading the cell whole is exactly
 * how this parser first lost those two rows, and with them two rows of the picture.
 */
const prefixOf = (cell: string): string => cell.split('（')[0]!.split(' +')[0]!.trim()

/** Every four-column data row of a coverage document, paired with its `## ` section. */
export function parseCoverage(doc: string): FeatureRow[] {
  const out: FeatureRow[] = []
  let section = ''
  for (const line of doc.split('\n')) {
    if (line.startsWith('## ')) { section = line.slice(3).trim(); continue }
    if (!line.trimStart().startsWith('|')) continue
    const cells = splitCells(line.trim()).map((c) => c.trim())
    if (cells.length !== 4) continue
    const [feature, status, engine, evidence] = cells as [string, string, string, string]
    const statusKind = kindOf(prefixOf(status))
    const engineKind = prefixOf(engine) as EngineState
    if (statusKind === null || !ENGINE.includes(engineKind)) continue
    out.push({
      feature, status, statusKind, engine: engineKind, evidence, section,
      lessons: [...new Set([...evidence.matchAll(/`@([a-z0-9-]+)`/g)].map((m) => m[1]!))],
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// the spine
// ---------------------------------------------------------------------------

/**
 * `family` is what the box IS, and it decides the border colour:
 *
 * - `core` — the published standard's own spine.
 * - `draft` — a proposal (4ab for UWB, an amendment still landing for Wi-Fi).
 * - `derived` — the engine has it and no clause defines it (positioning, fading, traffic).
 * - `absent` — a whole block this repository decided not to build. Listed, never hidden.
 */
export interface GroupSpec {
  id: string
  title: string
  note: string
  layer: number
  family: 'core' | 'draft' | 'derived' | 'absent'
  needs: string[]
  match: (r: FeatureRow) => boolean
}

const sec = (r: FeatureRow, n: string): boolean => r.section.startsWith(n)
const has = (r: FeatureRow, re: RegExp): boolean => re.test(r.feature)

const UWB_SPINE: GroupSpec[] = [
  { id: 'units', title: '单位与计数器', note: 'RCTU、RSTU、测距计数器 §10.29.1.3–.5',
    layer: 0, family: 'core', needs: [],
    match: (r) => sec(r, '一') && has(r, /计数器|时间单位|调度时间单位/) },
  { id: 'hrp', title: 'HRP 物理层：只建时长', note: 'PPDU 分段、PHR、参数集、±20 ppm §16',
    layer: 0, family: 'core', needs: [],
    match: (r) => sec(r, '九') && has(r, /PPDU|PHR|参数集|晶振|STS）字段|加扰时间戳序列/)
      && !has(r, /HPRF|脉冲|DRBG|SRMARKER/) },
  { id: 'band', title: '信道与频段', note: '信道 5／9、带内功率、最大输入 §11.1、§16.4.10',
    layer: 0, family: 'core', needs: [],
    match: (r) => has(r, /工作频率范围|具备测距能力的 PHY|最大输入电平/) },
  { id: 'twr', title: '双向测距的数学', note: 'SS／DS-TWR、时钟偏移修正、品质因数、基本交互',
    layer: 1, family: 'core', needs: ['units', 'hrp'],
    match: (r) => sec(r, '一') && has(r, /SS-TWR|DS-TWR|跟踪偏移|品质因数|基本测距交互/) },
  { id: 'shapes', title: '五种回复时间形态', note: '嵌入／延后／固定，SS 与 DS §10.29.6',
    layer: 2, family: 'core', needs: ['twr'], match: (r) => sec(r, '二') },
  { id: 'ies', title: '测距 IE', note: '只有字节宽度与字段清单，没有比特布局 §10.29.7／.8',
    layer: 2, family: 'core', needs: ['twr'], match: (r) => sec(r, '三') },
  { id: 'grid', title: '块／轮／时隙', note: '时间调度与竞争两种模式、按时隙开收 §10.32.2／.3',
    layer: 3, family: 'core', needs: ['shapes'],
    match: (r) => sec(r, '五') && has(r, /块、轮与时隙|测距模式|接收使能/) },
  { id: 'one2many', title: '一对多', note: '广播 Poll 点名，逐锚点作答 §10.32.4／.5',
    layer: 4, family: 'core', needs: ['grid'], match: (r) => sec(r, '五') && has(r, /一对多/) },
  { id: 'm2m', title: '多对多', note: '一帧对前后两方分别是答与问 §10.32.6／.7',
    layer: 4, family: 'core', needs: ['grid'], match: (r) => sec(r, '五') && has(r, /多对多/) },
  { id: 'sp3', title: 'SP3 分组测距', note: '没有 PHR 没有载荷，身份来自时隙 §10.32.8＋SRRR IE',
    layer: 4, family: 'core', needs: ['grid', 'ies'],
    match: (r) => has(r, /SP3 分组下的测距|SRRR IE/) },
  { id: 'multiie', title: '多节点测距 IE', note: 'ARC／RCPS／RCMA／RDM 建了宽度；RIU／RR／RBU／RCR 没建',
    layer: 4, family: 'core', needs: ['grid'],
    match: (r) => sec(r, '六') && !has(r, /SRRR IE/) },
  { id: 'recover', title: '出错之后：三节全建', note: '未收到 §10.34、辅助信息 §10.35、收妥确认 §10.36',
    layer: 5, family: 'core', needs: ['multiie', 'one2many'], match: (r) => sec(r, '八') },
  { id: 'security', title: '安全：整块缺席', note: '§10.31、§10.33、STS 的 DRBG——引擎不持密钥',
    layer: 3, family: 'absent', needs: [],
    match: (r) => sec(r, '七') || has(r, /DRBG|SRMARKER/) },
  { id: 'prims', title: '原语、PIB 与描述符', note: '没有分层服务接口：场景直接构造设备',
    layer: 3, family: 'absent', needs: [],
    match: (r) => sec(r, '四') && has(r, /原语|MAC 常量与 PIB|Descriptor/) },
  { id: 'phy-absent', title: 'HPRF 与脉冲形状', note: 'HPRF、CoU、CS、LCP——没有波形层，带宽代替了脉冲',
    layer: 3, family: 'absent', needs: [], match: (r) => sec(r, '九') && has(r, /HPRF|脉冲/) },
  { id: 'lrp', title: 'LRP 物理层：整章缺席', note: '§19 全章——第一刀就定了只建 HRP',
    layer: 3, family: 'absent', needs: [], match: (r) => sec(r, '十、') },
  { id: 'setup', title: '建立、拆除与超帧', note: '§10.29.2／.3、§10.30——会话从不需要被建立起来',
    layer: 3, family: 'absent', needs: [],
    match: (r) => has(r, /交互前的准备|超帧结构下的 ERDEV/) },
  { id: 'mms-phy', title: 'MMS 包格式', note: '片段的长度与位置、能量预算、检出 §16.2.11',
    layer: 5, family: 'draft', needs: ['hrp'],
    match: (r) => sec(r, '十一')
      && has(r, /包格式|片段数与长度|MMRS|能量预算|累加与检出|RSF 带 SFD|片段间隔/) },
  { id: 'mms-mac', title: 'MMS 测距与子轮', note: '§10.39：建的是单边双向加时钟比率修正那一种',
    layer: 6, family: 'draft', needs: ['mms-phy', 'grid'],
    match: (r) => sec(r, '十一')
      && !has(r, /包格式|片段数与长度|MMRS|能量预算|累加与检出|RSF 带 SFD|片段间隔/) },
  { id: 'nb', title: '窄带控制面', note: '§10.39.4.2、250 个 2.5 MHz 信道、按块跳频',
    layer: 6, family: 'draft', needs: ['mms-mac'],
    match: (r) => sec(r, '十二') && has(r, /窄带辅助|信道规划|按块跳频|SP0/) },
  { id: 'coex', title: '共存：LBT、SSBD、频域延后', note: '§10.39.8.3、§10.45、提案 §10.47',
    layer: 7, family: 'draft', needs: ['nb', 'band'],
    match: (r) => sec(r, '十二') && has(r, /先听后说|发射功率控制|共存|频谱感知|频域延后/) },
  { id: 'sensing', title: '感知', note: '§10.40：只有双站、静止点目标，报告 IE 未建',
    layer: 6, family: 'draft', needs: ['band', 'twr'], match: (r) => sec(r, '十三') },
  { id: 'rest4ab', title: '4ab 的其余整块', note: '复合帧、超块、发现、协商、唤醒、卸载、RSS、LE UWB',
    layer: 6, family: 'absent', needs: [], match: (r) => sec(r, '十四') },
  { id: 'position', title: '由距离解位置', note: '等权高斯—牛顿，不按品质因数加权；标准不给解算',
    layer: 6, family: 'derived', needs: ['one2many', 'm2m'],
    match: (r) => has(r, /由多个距离解位置/) },
  { id: 'tdoa', title: 'DL／UL-TDoA', note: 'FiRa 形状的模型；四个到达时刻怎么汇总，本模型没说',
    layer: 6, family: 'derived', needs: ['grid', 'units'], match: (r) => has(r, /TDoA/) },
  { id: 'aoa', title: 'AoA／PDoA', note: '纯几何：锚点并没有两路接收',
    layer: 6, family: 'derived', needs: ['twr'], match: (r) => has(r, /到达角/) },
  { id: 'fading-uwb', title: 'UWB 侧的衰落', note: '范围决定：信道模型出自 802.15.4a 的报告',
    layer: 6, family: 'derived', needs: ['band'], match: (r) => has(r, /UWB 侧的衰落/) },
]

const WIFI_SPINE: GroupSpec[] = [
  { id: 'phy-timing', title: '物理层时序', note: '第 17 章 OFDM 与第 18 章 ERP：前导码、符号、空口时间',
    layer: 0, family: 'core', needs: [], match: (r) => sec(r, '五') },
  { id: 'phy-params', title: 'HT／VHT／HE／EHT 参数', note: '每一代的前导码、保护间隔、速率表 §19／§21／§27／be §36',
    layer: 0, family: 'core', needs: [], match: (r) => sec(r, '六') },
  { id: 'propagation', title: '传播、衰落与频率选择性', note: '标准不规定的那一半：路径损耗、阴影、瑞利、逐格信噪比',
    layer: 0, family: 'derived', needs: [], match: (r) => sec(r, '八') },
  { id: 'dcf', title: 'DCF 信道接入', note: '帧间间隔、退避、NAV、重传与丢弃 §10.3',
    layer: 1, family: 'core', needs: ['phy-timing'], match: (r) => sec(r, '一') },
  { id: 'rates', title: '多速率与控制响应', note: '速率选择、控制回应速率、基本速率集 §10.6',
    layer: 1, family: 'core', needs: ['phy-params'], match: (r) => sec(r, '四') },
  { id: 'edca', title: 'HCF／EDCA', note: '四类的三个常数、内部碰撞、TXOP §10.23',
    layer: 2, family: 'core', needs: ['dcf'], match: (r) => sec(r, '二') },
  { id: 'agg', title: '聚合与确认', note: 'A-MPDU／A-MSDU、块确认、重传 §10.11／§10.12／§10.25',
    layer: 2, family: 'core', needs: ['dcf', 'rates'], match: (r) => sec(r, '三') },
  { id: 'mu', title: '下行与上行的多用户', note: 'OFDMA、MU-MIMO、触发帧 §26.5、be §35',
    layer: 3, family: 'core', needs: ['agg', 'phy-params'], match: (r) => sec(r, '七') },
  { id: 'tamper', title: '作弊目录', note: '七种改坏驱动的办法，以及 AP 能不能看出来 §9.4.2.27',
    layer: 3, family: 'core', needs: ['edca'], match: (r) => sec(r, '十、') },
  { id: 'traffic', title: '业务、队列与云端', note: '标准之外：业务模型、队列、广域往返',
    layer: 2, family: 'derived', needs: ['dcf'], match: (r) => sec(r, '九') },
  { id: 'amp', title: 'AMP（P802.11bp）', note: '环境供电标签：触发、时隙、反向散射——引擎建了而课没讲的那些',
    layer: 2, family: 'draft', needs: ['phy-timing'], match: (r) => sec(r, '十一') },
  { id: 'wifi-absent', title: '决定不建的', note: '读者会合理期待、而本仓库明确不建的那一批',
    layer: 2, family: 'absent', needs: [], match: (r) => sec(r, '十二') },
]

export const SPINE: Record<Track, GroupSpec[]> = { wifi: WIFI_SPINE, uwb: UWB_SPINE }
export const DOCS: Record<Track, string> = { wifi: wifiDoc, uwb: uwbDoc }
export const DOC_PATH: Record<Track, string> = {
  wifi: 'docs/wifi-feature-coverage.md', uwb: 'docs/uwb-feature-coverage.md',
}

// ---------------------------------------------------------------------------
// building the graph
// ---------------------------------------------------------------------------

export interface FeatureGroup extends GroupSpec {
  rows: FeatureRow[]
  lessons: string[]
  /** Rows whose status is still moving — the ones a reader watching the process wants first. */
  open: number
}

export interface GraphBox { group: FeatureGroup; x: number; y: number }
export interface GraphEdge { from: string; to: string; d: string }

export interface Graph {
  track: Track
  rows: FeatureRow[]
  groups: FeatureGroup[]
  boxes: GraphBox[]
  edges: GraphEdge[]
  width: number
  height: number
  statusCounts: [string, number][]
  engineCounts: [EngineState, number][]
  /** Rows that matched no group, or matched more than one. Empty, or the test fails. */
  misplaced: { feature: string; groups: string[] }[]
  /**
   * Lessons of this track that no row of the coverage table cites.
   *
   * **On the UWB side this is a defect and the test keeps it empty** — that table enumerates its
   * subject, so a lesson it never mentions means the engine has run ahead of it (which is what
   * happened for nine days in October 2026). **On the Wi-Fi side it is a fact about the table**,
   * which says in its own scope section that it does not enumerate the standard: a project
   * lesson, a model-against-simulator comparison or the contribution lesson has no feature row to
   * be cited from. Either way the reader of this graph gets told, instead of the list quietly
   * being the difference between two numbers.
   */
  orphanLessons: string[]
}

export const BOX_W = 196
export const BOX_H = 100
const COL_W = 236
const ROW_H = 132
const PAD_X = 24
const PAD_Y = 24

const FAMILY_ORDER: GroupSpec['family'][] = ['core', 'draft', 'derived', 'absent']

/** The whole picture for one track, laid out. Pure: same input, same pixels. */
export function graphFor(track: Track, lessonIds: readonly string[] = []): Graph {
  const rows = parseCoverage(DOCS[track])
  const spec = SPINE[track]
  const misplaced: Graph['misplaced'] = []
  const byGroup = new Map<string, FeatureRow[]>(spec.map((g) => [g.id, []]))
  for (const r of rows) {
    const hits = spec.filter((g) => g.match(r))
    if (hits.length !== 1) { misplaced.push({ feature: r.feature, groups: hits.map((h) => h.id) }); continue }
    byGroup.get(hits[0]!.id)!.push(r)
  }
  const groups: FeatureGroup[] = spec.map((g) => {
    const rs = byGroup.get(g.id)!
    return {
      ...g, rows: rs,
      lessons: [...new Set(rs.flatMap((r) => r.lessons))],
      open: rs.filter((r) => r.statusKind === 'contested' || r.statusKind === 'unsettled').length,
    }
  })

  const byLayer = new Map<number, FeatureGroup[]>()
  for (const g of groups) byLayer.set(g.layer, [...(byLayer.get(g.layer) ?? []), g])
  const boxes: GraphBox[] = []
  for (const [layer, gs] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...gs].sort((a, b) =>
      FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) || a.id.localeCompare(b.id))
    for (const [i, g] of sorted.entries()) {
      boxes.push({ group: g, x: PAD_X + layer * COL_W, y: PAD_Y + i * ROW_H })
    }
  }
  const at = (id: string): GraphBox => boxes.find((b) => b.group.id === id)!
  const edges: GraphEdge[] = groups.flatMap((g) => g.needs.map((n) => {
    const a = at(n)
    const b = at(g.id)
    const x1 = a.x + BOX_W
    const y1 = a.y + BOX_H / 2
    const x2 = b.x
    const y2 = b.y + BOX_H / 2
    const mx = (x1 + x2) / 2
    return { from: n, to: g.id, d: `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}` }
  }))

  const statusOrder = [...new Set(rows.map((r) => r.status))]
  const cited = new Set(groups.flatMap((g) => g.lessons))
  return {
    track, rows, groups, boxes, edges,
    orphanLessons: lessonIds.filter((id) => !cited.has(id)),
    width: PAD_X * 2 + (Math.max(...groups.map((g) => g.layer)) + 1) * COL_W,
    height: PAD_Y * 2 + Math.max(...[...byLayer.values()].map((gs) => gs.length)) * ROW_H,
    statusCounts: statusOrder.map((s) => [s, rows.filter((r) => r.status === s).length]),
    engineCounts: ENGINE.map((e) => [e, rows.filter((r) => r.engine === e).length]),
    misplaced,
  }
}

/** A CJK-aware wrap: the box counts pixels, and `slice` counts characters. */
export function wrapCjk(s: string, per: number, lines: number): string[] {
  const out: string[] = []
  let cur = ''
  let w = 0
  for (const ch of s) {
    const cw = /[　-鿿＀-￯]/.test(ch) ? 1 : 0.55
    if (w + cw > per) { out.push(cur); cur = ''; w = 0 }
    if (out.length === lines) break
    cur += ch
    w += cw
  }
  if (cur !== '' && out.length < lines) out.push(cur)
  if (out.join('').length < s.length && out.length > 0) {
    out[out.length - 1] = `${out[out.length - 1]!.slice(0, -1)}…`
  }
  return out
}
