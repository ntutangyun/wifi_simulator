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
import docMetaJson from './docMeta.json'
import lessonMetaJson from './lessonMeta.json'

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
  /**
   * The IEEE mentor documents this row cites, revisionless (`15-22/0381`), in order of first
   * appearance — **the row's own evidence, read as a date**.
   *
   * A document number carries its year, and `docMeta.json` turns it into the day it was first
   * disclosed, so the time axis of the picture is computed from the same cells a reader checks.
   * A row that cites nothing has no date, which is the normal case for a published clause: the
   * published rows argue from clause numbers, not from contributions.
   */
  dcns: string[]
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

/**
 * An IEEE mentor document number, with the revision suffix dropped.
 *
 * `15-26/0408r1` and `15-26/0408r0` are the same contribution at two moments, and `docMeta.json`
 * is keyed without the suffix for exactly that reason: a row that cites r0 still gets a date when
 * the corpus has only r1. The year in the middle is the document's own, which is why a date read
 * this way cannot silently drift from the citation beside it.
 */
const DCN_RX = /\b(1[15]-\d\d\/\d{4})(?:r\d+)?/g

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
      dcns: [...new Set([...cells.join(' ').matchAll(DCN_RX)].map((m) => m[1]!))],
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
  family: 'core' | 'draft' | 'derived' | 'absent'
  /**
   * **What this feature needs in order to exist, with the reason written down.**
   *
   * One rule decides every edge: *B needs A when B cannot be defined or measured without A.* Not
   * 「a reader meets A first」 — that is the course's own `needs` field, a different graph with a
   * different shape (`@uwb-aoa` is taught after `@uwb-dstwr`, while angle of arrival needs no
   * two-way ranging at all). The first spine drawn here mixed the two, and the reasons are what
   * keeps them apart: an edge nobody can write a reason for is a teaching order, and goes.
   */
  needs: { id: string; why: string }[]
  match: (r: FeatureRow) => boolean
}

const sec = (r: FeatureRow, n: string): boolean => r.section.startsWith(n)
const has = (r: FeatureRow, re: RegExp): boolean => re.test(r.feature)

const UWB_SPINE: GroupSpec[] = [
  { id: 'units', title: '单位与计数器', note: 'RCTU、RSTU、测距计数器 §10.29.1.3–.5',
    family: 'core', needs: [],
    match: (r) => sec(r, '一') && has(r, /计数器|时间单位|调度时间单位/) },
  { id: 'hrp', title: 'HRP 物理层：只建时长', note: 'PPDU 分段、PHR、参数集、±20 ppm §16',
    family: 'core', needs: [],
    match: (r) => sec(r, '九') && has(r, /PPDU|PHR|参数集|晶振|STS）字段|加扰时间戳序列/)
      && !has(r, /HPRF|脉冲|DRBG|SRMARKER/) },
  { id: 'band', title: '信道与频段', note: '信道 5／9、带内功率、最大输入 §11.1、§16.4.10',
    family: 'core', needs: [],
    match: (r) => has(r, /工作频率范围|具备测距能力的 PHY|最大输入电平/) },
  { id: 'ies', title: '测距 IE', note: '只有字节宽度与字段清单，没有比特布局 §10.29.7／.8',
    family: 'core',
    needs: [{ id: 'hrp', why: '一个信息单元是 PSDU 里的几个字节，而 PSDU 的长度与空口时间由它定' }],
    match: (r) => sec(r, '三') },
  { id: 'twr', title: '双向测距的数学', note: 'SS／DS-TWR、时钟偏移修正、品质因数、基本交互',
    family: 'core',
    needs: [
      { id: 'units', why: '一次测量就是两个计数器读数相减，RCTU 是减出来的那个差的单位' },
      { id: 'hrp', why: 'RMARKER 是帧里一个确定的码片，没有 PPDU 的分段就没有那个时刻' },
    ],
    match: (r) => sec(r, '一') && has(r, /SS-TWR|DS-TWR|跟踪偏移|品质因数|基本测距交互/) },
  { id: 'shapes', title: '五种回复时间形态', note: '嵌入／延后／固定，SS 与 DS §10.29.6',
    family: 'core',
    needs: [
      { id: 'twr', why: '「回复时间」只有在一次双向测距里才存在，五种形态是它的五种去处' },
      { id: 'ies', why: '嵌入与延后两种把它装在 RRTI／RMI 里，固定那一种的代价正是不装' },
    ],
    match: (r) => sec(r, '二') },
  { id: 'grid', title: '块／轮／时隙', note: '时间调度与竞争两种模式、按时隙开收 §10.32.2／.3',
    family: 'core',
    needs: [{ id: 'units', why: '块与时隙都按 RSTU 的整数倍计，时隙边界是用它算出来的' }],
    match: (r) => sec(r, '五') && has(r, /块、轮与时隙|测距模式|接收使能/) },
  { id: 'multiie', title: '多节点测距 IE', note: 'ARC／RCPS／RCMA／RDM 建了宽度；RIU／RR／RBU／RCR 没建',
    family: 'core',
    needs: [
      { id: 'ies', why: '它们也是信息单元，长度与字段清单按同一套算' },
      { id: 'grid', why: '这几个单元装的正是块号、轮号与时隙号——没有网格就没有号可装' },
    ],
    match: (r) => sec(r, '六') && !has(r, /SRRR IE/) },
  { id: 'one2many', title: '一对多', note: '广播 Poll 点名，逐锚点作答 §10.32.4／.5',
    family: 'core',
    needs: [
      { id: 'twr', why: '每个锚点与标签之间仍然是一次双向测距，只是问话合成了一帧' },
      { id: 'grid', why: '「各答各的」靠的是每个锚点有自己的时隙' },
      { id: 'multiie', why: 'RDM IE 就是那张「谁在第几个时隙」的名单' },
    ],
    match: (r) => sec(r, '五') && has(r, /一对多/) },
  { id: 'm2m', title: '多对多', note: '一帧对前后两方分别是答与问 §10.32.6／.7',
    family: 'core',
    needs: [
      { id: 'twr', why: '一帧同时是答与问，而两边各自算的仍是同一条双向测距的算术' },
      { id: 'grid', why: '参与者 i 在第 i 个时隙发——身份与次序都来自网格' },
    ],
    match: (r) => sec(r, '五') && has(r, /多对多/) },
  { id: 'sp3', title: 'SP3 分组测距', note: '没有 PHR 没有载荷，身份来自时隙 §10.32.8＋SRRR IE',
    family: 'core',
    needs: [
      { id: 'hrp', why: 'SP3 是一种 PPDU 形状：SHR 加 STS，没有 PHR 也没有 PSDU' },
      { id: 'grid', why: '这种包一个字段也带不了，所以发的人是谁只能由时隙回答' },
      { id: 'multiie', why: '请求它的 SRRR IE 挂在控制消息上，一个响应方一条' },
    ],
    match: (r) => has(r, /SP3 分组下的测距|SRRR IE/) },
  { id: 'recover', title: '测距之外的消息处理', note: '未收到 §10.34、辅助信息 §10.35、收妥确认 §10.36',
    family: 'core',
    needs: [
      { id: 'one2many', why: '三节说的都是控制器与响应方之间、测距以外的话：谁没听到启动消息、谁要另外带一条消息、谁收妥了哪几条——没有这对角色，这些话没有说话的人' },
      { id: 'multiie', why: '三节各自挂在 ARC 控制字与自己的信息单元上（RMNR／RAICT／RMMRC）' },
    ],
    match: (r) => sec(r, '八') },
  { id: 'security', title: '安全：整块缺席', note: '§10.31、§10.33、STS 的 DRBG——引擎不持密钥',
    family: 'absent',
    needs: [{ id: 'hrp', why: 'STS 字段的位置与长度在 PPDU 里，缺的是填进去的那串码片' }],
    match: (r) => sec(r, '七') || has(r, /DRBG|SRMARKER/) },
  { id: 'prims', title: '原语、PIB 与描述符', note: '没有分层服务接口：场景直接构造设备',
    family: 'absent',
    needs: [{ id: 'grid', why: '这些原语管的是一次测距会话的启停与参数，而会话就是那张网格' }],
    match: (r) => sec(r, '四') && has(r, /原语|MAC 常量与 PIB|Descriptor/) },
  { id: 'phy-absent', title: 'HPRF 与脉冲形状', note: 'HPRF、CoU、CS、LCP——没有波形层，带宽代替了脉冲',
    family: 'absent',
    needs: [{ id: 'hrp', why: '它们是同一层的另外几种选择：换调制、换脉冲，PPDU 的骨架不变' }],
    match: (r) => sec(r, '九') && has(r, /HPRF|脉冲/) },
  { id: 'lrp', title: 'LRP 物理层：整章缺席', note: '§19 全章——第一刀就定了只建 HRP',
    family: 'absent', needs: [], match: (r) => sec(r, '十、') },
  { id: 'setup', title: '建立、拆除与超帧', note: '§10.29.2／.3、§10.30——会话从不需要被建立起来',
    family: 'absent',
    needs: [{ id: 'grid', why: '要建立与拆除的那个东西就是会话，而本引擎的会话是一张算好的网格' }],
    match: (r) => has(r, /交互前的准备|超帧结构下的 ERDEV/) },
  { id: 'mms-phy', title: 'MMS 包格式', note: '片段的长度与位置、能量预算、检出 §16.2.11',
    family: 'draft',
    needs: [
      { id: 'hrp', why: '片段仍是 HRP 的码片与符号，变的是把一个包拆成一串' },
      { id: 'units', why: '「每毫秒」这个预算与片段的位置都按码片与 RSTU 算' },
    ],
    match: (r) => sec(r, '十一')
      && has(r, /包格式|片段数与长度|MMRS|能量预算|累加与检出|RSF 带 SFD|片段间隔/) },
  { id: 'mms-mac', title: 'MMS 测距与子轮', note: '§10.39：建的是单边双向加时钟比率修正那一种',
    family: 'draft',
    needs: [
      { id: 'mms-phy', why: '一轮 MMS 测距量的就是那串片段的首脉冲' },
      { id: 'twr', why: '它仍是单边双向那一套算术，加一次时钟比率修正' },
      { id: 'grid', why: '子轮、测距阶段与报告阶段都排在块与时隙上' },
    ],
    match: (r) => sec(r, '十一')
      && !has(r, /包格式|片段数与长度|MMRS|能量预算|累加与检出|RSF 带 SFD|片段间隔/) },
  { id: 'nb', title: '窄带控制面', note: '§10.39.4.2、250 个 2.5 MHz 信道、按块跳频',
    family: 'draft',
    needs: [{ id: 'mms-mac', why: '这部窄带电台只搬控制消息，而它要控制的那一轮就是 MMS 测距' }],
    match: (r) => sec(r, '十二') && has(r, /窄带辅助|信道规划|按块跳频|SP0/) },
  { id: 'coex', title: '共存：LBT、SSBD、频域延后', note: '§10.39.8.3、§10.45、提案 §10.47',
    family: 'draft',
    needs: [
      { id: 'nb', why: '先听后说与跳到下一个信道，判的都是那部窄带电台要不要发' },
      { id: 'band', why: '「听得见别人」是一次带内功率的比较，而带宽与重叠在这一组里' },
    ],
    match: (r) => sec(r, '十二') && has(r, /先听后说|发射功率控制|共存|频谱感知|频域延后/) },
  { id: 'sensing', title: '感知', note: '§10.40：只有双站、静止点目标，报告 IE 未建',
    family: 'draft',
    needs: [
      { id: 'hrp', why: '回波量的是同一发帧的首脉冲，时标仍取在 RMARKER 上' },
      { id: 'band', why: '散射体回来的那一路强不强，是一次链路预算' },
    ],
    match: (r) => sec(r, '十三') },
  { id: 'rest4ab', title: '4ab 的其余整块', note: '复合帧、超块、发现、协商、唤醒、卸载、RSS、LE UWB',
    family: 'absent', needs: [], match: (r) => sec(r, '十四') },
  { id: 'position', title: '由距离解位置', note: '等权高斯—牛顿，不按品质因数加权；标准不给解算',
    family: 'derived',
    needs: [
      { id: 'twr', why: '解算吃的是距离，而距离是双向测距交出来的' },
      { id: 'one2many', why: '一次解算要同一轮里的三条以上距离，那正是一对多给的' },
    ],
    match: (r) => has(r, /由多个距离解位置/) },
  { id: 'tdoa', title: 'DL／UL-TDoA', note: 'FiRa 形状的模型；四个到达时刻怎么汇总，本模型没说',
    family: 'derived',
    needs: [
      { id: 'units', why: '它量的是两个到达时刻之差，单位与计数器是同一套' },
      { id: 'grid', why: '谁在什么时候发，靠的是排好的时隙——标签不回话，没有网格就没有次序' },
      { id: 'hrp', why: '到达时刻取在 RMARKER 上，和双向测距同一个瞬间' },
    ],
    match: (r) => has(r, /TDoA/) },
  { id: 'aoa', title: 'AoA／PDoA', note: '纯几何：锚点并没有两路接收',
    family: 'derived',
    needs: [{ id: 'hrp', why: '相位差读在同一帧的同一瞬间上——它要的是一帧，不是一次往返' }],
    match: (r) => has(r, /到达角/) },
  { id: 'fading-uwb', title: 'UWB 侧的衰落', note: '范围决定：信道模型出自 802.15.4a 的报告',
    family: 'derived',
    needs: [{ id: 'band', why: '衰落要改的就是这条链路预算里的那一项' }],
    match: (r) => has(r, /UWB 侧的衰落/) },
]

const WIFI_SPINE: GroupSpec[] = [
  { id: 'phy-timing', title: '物理层时序', note: '第 17 章 OFDM 与第 18 章 ERP：前导码、符号、空口时间',
    family: 'core', needs: [], match: (r) => sec(r, '五') },
  { id: 'phy-params', title: 'HT／VHT／HE／EHT 参数', note: '每一代的前导码、保护间隔、速率表 §19／§21／§27／be §36',
    family: 'core',
    needs: [{ id: 'phy-timing', why: '每一代改的是前导码与符号这两个尺寸，算空口时间的那条式子不变' }],
    match: (r) => sec(r, '六') },
  { id: 'propagation', title: '传播、衰落与频率选择性', note: '标准不规定的那一半：路径损耗、阴影、瑞利、逐格信噪比',
    family: 'derived', needs: [], match: (r) => sec(r, '八') },
  { id: 'traffic', title: '业务、队列与云端', note: '标准之外：业务模型、队列、广域往返',
    family: 'derived', needs: [], match: (r) => sec(r, '九') },
  { id: 'dcf', title: 'DCF 信道接入', note: '帧间间隔、退避、NAV、重传与丢弃 §10.3',
    family: 'core',
    needs: [
      { id: 'phy-timing', why: '短帧间间隔与时隙是物理层给的两个常数，整条退避都按它们数' },
      { id: 'traffic', why: '队列里有帧，才有「谁先发」这个问题——本引擎的帧全从队列来' },
    ],
    match: (r) => sec(r, '一') },
  { id: 'rates', title: '多速率与控制响应', note: '速率选择、控制回应速率、基本速率集 §10.6',
    family: 'core',
    needs: [
      { id: 'phy-params', why: '可选的档就是那一代速率表里的行' },
      { id: 'propagation', why: '挑档读的是这条链路的到达电平，而电平出自传播那一侧' },
    ],
    match: (r) => sec(r, '四') },
  { id: 'edca', title: 'HCF／EDCA', note: '四类的三个常数、内部碰撞、TXOP §10.23',
    family: 'core',
    needs: [
      { id: 'dcf', why: '一类就是一套自己的 DCF 参数：静默更短、窗口更窄' },
      { id: 'traffic', why: '「四类」分的是队列，而每台设备的四条队列在这一组里' },
    ],
    match: (r) => sec(r, '二') },
  { id: 'agg', title: '聚合与确认', note: 'A-MPDU／A-MSDU、块确认、重传 §10.11／§10.12／§10.25',
    family: 'core',
    needs: [
      { id: 'dcf', why: '一批帧要先赢得一次发送机会，聚合省下的正是后面几次竞争' },
      { id: 'rates', why: '一批能装多长，是「这一档上多少微秒」算出来的' },
    ],
    match: (r) => sec(r, '三') },
  { id: 'mu', title: '下行与上行的多用户', note: 'OFDMA、MU-MIMO、触发帧 §26.5、be §35',
    family: 'core',
    needs: [
      { id: 'phy-params', why: '多用户是 HE／EHT 的 PPDU 形态：资源单元与触发帧都在那一层' },
      { id: 'agg', why: '每个成员那一份仍是一批聚合帧，回答仍是块确认' },
    ],
    match: (r) => sec(r, '七') },
  { id: 'tamper', title: '作弊目录', note: '七种改坏驱动的办法，以及 AP 能不能看出来 §9.4.2.27',
    family: 'core',
    needs: [{ id: 'edca', why: '七种作弊改的都是 EDCA 那三个常数或它们的用法' }],
    match: (r) => sec(r, '十、') },
  { id: 'amp', title: 'AMP（P802.11bp）', note: '环境供电标签：触发、时隙、反向散射——引擎建了而课没讲的那些',
    family: 'draft',
    needs: [
      { id: 'phy-timing', why: '它跑在同一片空口上，帧长仍按同一套前导码与符号算' },
      { id: 'dcf', why: '一轮点名要先占住信道（CTS-to-self），占的是 DCF 的那条规矩' },
    ],
    match: (r) => sec(r, '十一') },
  { id: 'wifi-absent', title: '决定不建的', note: '读者会合理期待、而本仓库明确不建的那一批',
    family: 'absent', needs: [], match: (r) => sec(r, '十二') },
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
  /**
   * The longest dependency chain ending here, and it is **computed, not chosen**.
   *
   * Since 2026-10-15 it no longer decides the column — time does (see `era`). It still decides
   * the order inside a band, so the dependency spine reads left to right within one year, and it
   * is still what `feature-graph.test.ts` holds the spine's acyclicity against.
   */
  depth: number
  /**
   * **When this feature was first put on the table**, as the day the earliest contribution its
   * rows cite was first disclosed — or `null` for a feature whose rows argue from a published
   * clause instead of from a document number.
   */
  since: string | null
  /** The most recent dated contribution its rows cite: how fresh the argument is. */
  until: string | null
  /** The band: `BASELINE`, or the four-digit year of `since`. */
  era: string
  /**
   * The companies whose names are on those contributions, commonest first.
   *
   * **What this is**: author affiliations printed on the documents this group's rows cite.
   * **What it is not**: a claim about who invented anything, or a list of everyone who spoke.
   * Procedural documents are excluded (`PROCEDURAL`), because an agenda's author is the task
   * group's own chair and counting them would make the chair the biggest contributor to every
   * feature in the draft — which is exactly what the first cut of this showed.
   */
  orgs: OrgRef[]
  /** Every mentor document its rows cite, earliest first. */
  docs: DocRef[]
}

/** One company, and how many of this group's cited documents carry its name. */
export interface OrgRef { name: string; docs: number }

/** One cited mentor document, as `docMeta.json` holds it. */
export interface DocRef {
  dcn: string
  date: string
  kind: string
  title: string
  orgs: string[]
}

/**
 * `src/course/docMeta.json`, generated by `scripts/doc-meta.ts` from the mentor mirrors that live
 * outside this repository. Three fields per document and nothing else: the day it was first
 * disclosed, what kind of document it is, and the companies named on it.
 *
 * It is committed rather than fetched because the mirrors are hundreds of megabytes of
 * third-party documents and this repository carries no standards text — and because the picture
 * needs the dates in the browser. `npx vite-node scripts/doc-meta.ts --check` fails when the
 * committed file and the mirror disagree.
 */
const DOC_META = docMetaJson.docs as Record<string, Omit<DocRef, 'dcn'>>
export const DOC_META_AT: string = docMetaJson.generated
export const DOC_CORPORA = docMetaJson.corpora as
  { name: string; catalog: string; generated: string; docs: number }[]
/** Cited document numbers that no mirror on the generating machine held. Empty, or the test says so. */
export const DOC_META_MISSING = docMetaJson.missing as string[]

/**
 * `src/course/lessonMeta.json`, generated by `scripts/lesson-meta.ts` from this repository's own
 * git history: the day each lesson file was added. It is the engine side of the time axis — the
 * only date in the picture this repository is itself answerable for.
 */
const LESSON_META = lessonMetaJson.lessons as Record<string, { file: string; added: string; touched: string }>
export const LESSON_META_AT: string = lessonMetaJson.generated

/**
 * Document kinds that get a **date but no company**: the task group's own paperwork.
 *
 * An agenda, a set of minutes, a closing report and the consolidated comment spreadsheet are
 * written by the chair, the secretary or the technical editor on the group's behalf. They are
 * first-rate evidence of *when* something was discussed — half the dates in §十二 of the UWB
 * table come from minutes — and no evidence at all of *who* proposed it.
 *
 * `minutes` is a kind `scripts/doc-meta.ts` assigns from the title, because the mirror's own
 * rules file 「TG4ab July Plenary Mins」 as a contribution. Eight documents, one secretary, and
 * before this line their employer was the top company on almost every feature here.
 */
const PROCEDURAL = new Set(['agenda', 'closing-report', 'minutes', 'process', 'motion-dock',
  'timeline', 'comments-sheet'])

/**
 * One dated thing that happened to a feature. Three kinds, and they answer different questions:
 *
 * - `published` — the feature's rows argue from a published clause. It has no date in these
 *   corpora (see `BASELINE`), so it sits in the one row above time.
 * - `doc` — an IEEE mentor document a row cites, dated by `docMeta.json`.
 * - `lesson` — **what this repository did**: the day the lesson that teaches the feature was
 *   added, from git (`lessonMeta.json`). The task group argued about ranging for five years; the
 *   lesson about it was written in an afternoon, and the picture should let you see both.
 */
export interface TimeEvent {
  kind: 'published' | 'doc' | 'lesson'
  /** ISO day, or `''` for the published marker, which is the one thing with no date. */
  date: string
  /** `15-22/0381`, `@uwb-mms`, or the published clause marker. */
  label: string
  detail: string
  orgs: string[]
  /** For a document: its kind as `docMeta.json` holds it (`proposal`, `cr`, `minutes`, …). */
  docKind?: string
  /** Index into `Matrix.rows`. */
  row: number
}

/** One row of the matrix: the row above time, or a quarter of a year. */
export interface MatrixRow {
  key: string
  /** `null` for the published row — the UI names that one, because it is not a date. */
  year: number | null
  quarter: number | null
  /**
   * How many events of this track landed in this quarter.
   *
   * **Zero is information and the row stays**, because a gap in the argument is part of the
   * history — but it is drawn as a thin lane rather than a full row, so that eight idle quarters
   * cannot push the busy ones off the screen.
   */
  events: number
}

/** One column: a feature, its events in time order, and where its lane starts and ends. */
export interface MatrixColumn {
  group: FeatureGroup
  events: TimeEvent[]
  /** First and last row the lane touches; `-1` when the feature has no event at all. */
  firstRow: number
  lastRow: number
}

export interface GraphEdge { from: string; to: string; why: string }

export interface Graph {
  track: Track
  rows: FeatureRow[]
  groups: FeatureGroup[]
  edges: GraphEdge[]
  /**
   * **The picture: one column per feature, one row per quarter.**
   *
   * Columns are ordered by the row their first event lands in, so left to right is the order
   * features entered the record — the published spine first, then the draft features in the order
   * they were tabled, then the ones this engine modelled with no clause to point at. Down a
   * column is that feature's own history.
   */
  columns: MatrixColumn[]
  matrixRows: MatrixRow[]
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

/**
 * The row above every quarter: features whose rows argue from a published clause.
 *
 * **They share one row because nothing in this repository can date them apart.** The contributions
 * that produced IEEE Std 802.15.4-2024's ranging clauses predate the TG4ab corpus (which starts in
 * 2021), and the standard's own introduction gives its history one revision at a time — 2003,
 * 2006, 2011, 2015, 2020, 2024, the last rolling in four amendments of which 「enhanced ranging」
 * is the one that matters here — and never clause by clause. A row of per-clause amendment years
 * would therefore be my invention, so the picture says 「published」 and leaves the year out.
 */
export const BASELINE = 'baseline'

/**
 * The column group for features **no document in these corpora dates at all**.
 *
 * Positioning, the UWB fading model, DL/UL-TDoA, AoA/PDoA, the Wi-Fi propagation and traffic
 * models: the tables file them as 「无法判定」 or 「标准不规定」, and they cite no document because
 * no clause exists. They are the engine's own models, so the only date they have is the day this
 * repository built them — which is what puts their lane at the bottom of the picture rather than
 * in the published row with the standard.
 */
export const UNDATED = 'undated'

/**
 * Whether a row's citations may date a feature.
 *
 * **A published row's citations usually cannot.** §九 of the UWB table argues about the HRP PHY of
 * IEEE Std 802.15.4-2024 and cites a 2026 PICS contribution for its clause numbers; letting that
 * date the published PHY would put the 2007 radio in 2026, the one reading this picture must never
 * allow. (The document still appears as an event on that feature's lane — being an event is not
 * being a birthday.)
 *
 * **Unless the cell itself says 草案.** The Wi-Fi table has no draft value in its status
 * vocabulary — its five values are 「已发布 · X」, 「标准不规定」 and 「标准里查不到」 — so it files
 * P802.11bp, a draft, under 「已发布 · 其他修正案（P802.11bp 草案，11-26/1519r5、11-26/1889r4）」
 * and says 草案 in the qualifier. Reading the word is what keeps AMP out of the published row it
 * does not belong in. The gap in that vocabulary is the table's to fix; this rule is how the
 * picture stays true until it does.
 */
const datesFrom = (r: FeatureRow): boolean =>
  r.statusKind !== 'published' || r.status.includes('草案')

/** `2026Q3`. The row key for a date, and the only place the bucket size is decided. */
export const quarterOf = (date: string): string =>
  `${date.slice(0, 4)}Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`

const FAMILY_ORDER: GroupSpec['family'][] = ['core', 'draft', 'derived', 'absent']

/** The whole picture for one track. Pure: same documents, same matrix. */
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
  /**
   * The longest dependency chain ending at a group. A cycle would make this unbounded, so the
   * walk carries its own path and stops on one — `feature-graph.test.ts` then fails on the cycle
   * rather than the renderer hanging.
   */
  const byId = new Map(spec.map((g) => [g.id, g]))
  const depthOf = (id: string, seen: Set<string>): number => {
    const g = byId.get(id)
    if (g === undefined || seen.has(id)) return 0
    const next = new Set([...seen, id])
    return Math.max(0, ...g.needs.map((n) => depthOf(n.id, next) + 1))
  }

  const groups: FeatureGroup[] = spec.map((g) => {
    const rs = byGroup.get(g.id)!
    const cited = [...new Set(rs.filter(datesFrom).flatMap((r) => r.dcns))]
    const docs: DocRef[] = cited
      .flatMap((dcn) => (DOC_META[dcn] === undefined ? [] : [{ dcn, ...DOC_META[dcn]! }]))
      .sort((a, b) => a.date.localeCompare(b.date) || a.dcn.localeCompare(b.dcn))
    const byOrg = new Map<string, number>()
    for (const d of docs) {
      if (PROCEDURAL.has(d.kind)) continue
      for (const o of d.orgs) byOrg.set(o, (byOrg.get(o) ?? 0) + 1)
    }
    const since = docs[0]?.date ?? null
    return {
      ...g, rows: rs, docs,
      lessons: [...new Set(rs.flatMap((r) => r.lessons))],
      open: rs.filter((r) => r.statusKind === 'contested' || r.statusKind === 'unsettled').length,
      depth: depthOf(g.id, new Set()),
      since,
      until: docs.length > 0 ? docs[docs.length - 1]!.date : null,
      era: since === null ? (rs.some((r) => r.statusKind === 'published') ? BASELINE : UNDATED)
        : since.slice(0, 4),
      orgs: [...byOrg.entries()]
        .map(([name, n]) => ({ name, docs: n }))
        .sort((a, b) => b.docs - a.docs || a.name.localeCompare(b.name)),
    }
  })

  /**
   * **Every event of every feature, before any of them has a row to sit in.**
   *
   * A document a published row cites is an event too — the 2026 PICS insert that names §16 is
   * the only mentor document that touches the published HRP PHY, and it is worth seeing. What it
   * must not do is DATE the feature, and it does not: `datesFrom` decides that, and the published
   * marker sits above time whatever the documents say.
   */
  const eventsOf = (g: FeatureGroup): Omit<TimeEvent, 'row'>[] => {
    const out: Omit<TimeEvent, 'row'>[] = []
    if (g.rows.some((r) => r.statusKind === 'published')) {
      out.push({ kind: 'published', date: '', label: BASELINE, detail: '', orgs: [] })
    }
    const seen = new Set<string>()
    for (const r of g.rows) {
      for (const dcn of r.dcns) {
        const meta = DOC_META[dcn]
        if (meta === undefined || seen.has(dcn)) continue
        seen.add(dcn)
        out.push({ kind: 'doc', date: meta.date, label: dcn, detail: meta.title,
          orgs: meta.orgs, docKind: meta.kind })
      }
    }
    for (const id of g.lessons) {
      const meta = LESSON_META[id]
      if (meta === undefined) continue
      out.push({ kind: 'lesson', date: meta.added, label: `@${id}`, detail: meta.file, orgs: [] })
    }
    return out
  }

  const raw = new Map(groups.map((g) => [g.id, eventsOf(g)]))
  const quarters = [...new Set([...raw.values()].flat()
    .filter((e) => e.date !== '').map((e) => quarterOf(e.date)))].sort()
  /** Quarters run end to end: a quarter nobody wrote in is a row, not a gap. */
  const span: string[] = []
  if (quarters.length > 0) {
    const first = quarters[0]!
    const last = quarters[quarters.length - 1]!
    for (let y = Number(first.slice(0, 4)), q = Number(first.slice(5));
      y < Number(last.slice(0, 4)) || (y === Number(last.slice(0, 4)) && q <= Number(last.slice(5)));
      q === 4 ? (y += 1, q = 1) : (q += 1)) span.push(`${y}Q${q}`)
  }
  const hasBaseline = [...raw.values()].flat().some((e) => e.kind === 'published')
  const perRow = new Map<string, number>()
  for (const e of [...raw.values()].flat()) {
    const key = e.kind === 'published' ? BASELINE : quarterOf(e.date)
    perRow.set(key, (perRow.get(key) ?? 0) + 1)
  }
  const matrixRows: MatrixRow[] = [
    ...(hasBaseline
      ? [{ key: BASELINE, year: null, quarter: null, events: perRow.get(BASELINE) ?? 0 }] : []),
    ...span.map((k) => ({
      key: k, year: Number(k.slice(0, 4)), quarter: Number(k.slice(5)),
      events: perRow.get(k) ?? 0,
    })),
  ]
  const rowOf = new Map(matrixRows.map((r, i) => [r.key, i]))

  const columns: MatrixColumn[] = groups.map((g) => {
    const events: TimeEvent[] = raw.get(g.id)!
      .map((e) => ({ ...e, row: rowOf.get(e.kind === 'published' ? BASELINE : quarterOf(e.date))! }))
      .sort((a, b) => a.row - b.row || a.date.localeCompare(b.date) || a.label.localeCompare(b.label))
    return {
      group: g,
      events,
      firstRow: events.length === 0 ? -1 : events[0]!.row,
      lastRow: events.length === 0 ? -1 : events[events.length - 1]!.row,
    }
  }).sort((a, b) =>
    a.firstRow - b.firstRow
    || a.group.depth - b.group.depth
    || FAMILY_ORDER.indexOf(a.group.family) - FAMILY_ORDER.indexOf(b.group.family)
    || a.group.id.localeCompare(b.group.id))

  const edges: GraphEdge[] = groups.flatMap((g) =>
    g.needs.map((n) => ({ from: n.id, to: g.id, why: n.why })))

  const statusOrder = [...new Set(rows.map((r) => r.status))]
  const cited = new Set(groups.flatMap((g) => g.lessons))
  return {
    track, rows, groups, edges, columns, matrixRows,
    orphanLessons: lessonIds.filter((id) => !cited.has(id)),
    statusCounts: statusOrder.map((s) => [s, rows.filter((r) => r.status === s).length]),
    engineCounts: ENGINE.map((e) => [e, rows.filter((r) => r.engine === e).length]),
    misplaced,
  }
}

