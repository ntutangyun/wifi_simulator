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
   * **What this feature is, and what it is for — two or three sentences, in the map's own words.**
   *
   * Everything else in this picture is read off the two coverage documents and the corpus; this
   * is not, and the panel labels it so. It exists because the table answers 「what did we build」
   * row by row and never answers 「what is this」: a reader who does not already know what a
   * sub-round or a wake-up radio IS cannot use a single cell of it. The rule for writing one is
   * the repository's rule for every other sentence about a standard — paraphrase the idea, never
   * copy the text, and keep the clause numbers for the cells that cite them.
   */
  intro: string
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
    intro: '测距量的是时间，而时间要有刻度。标准给了两把：RCTU（ranging '
      + 'counter time unit，测距计数器时间单位）用来读一帧到达的那个瞬间，'
      + '细；RSTU（ranging slot time unit，测距时隙时间单位）'
      + '用来排时隙与块，粗。两把尺怎么换算、计数器多宽、多久回绕一次，是后面每一个数的地基。',
    family: 'core', needs: [],
    match: (r) => sec(r, '一') && has(r, /计数器|时间单位|调度时间单位/) },
  { id: 'hrp', title: 'HRP 物理层：只建时长', note: 'PPDU 分段、PHR、参数集、±20 ppm §16',
    intro: 'HRP（high pulse repetition frequency，'
      + '高脉冲重复频率）UWB 物理层是 802.15.4 拿来测距的那套波形：'
      + '同步头、可选的 STS（scrambled timestamp sequence，'
      + '加扰时间戳序列）、PHR 与数据段。本引擎只取它的**时长**——一帧占多少码片、'
      + '多少微秒——因为测距量的是时刻，而时刻落在同步头与 STS 上，不落在比特上。',
    family: 'core', needs: [],
    match: (r) => sec(r, '九') && has(r, /PPDU|PHR|参数集|晶振|STS）字段|加扰时间戳序列/)
      && !has(r, /HPRF|脉冲|DRBG|SRMARKER/) },
  { id: 'band', title: '信道与频段', note: '信道 5／9、带内功率、最大输入 §11.1、§16.4.10',
    intro: 'UWB 占的是 6–9 GHz 上几百兆赫宽的信道，本引擎只建信道 5 '
      + '与信道 9。这一组定的是「听不听得见」的物理前提：中心频率、带宽、带内功率怎么比，'
      + '以及接收机最多能被灌多强。共存、链路预算与衰落都站在它上面。',
    family: 'core', needs: [],
    match: (r) => has(r, /工作频率范围|具备测距能力的 PHY|最大输入电平/) },
  { id: 'ies', title: '测距 IE', note: '只有字节宽度与字段清单，没有比特布局 §10.29.7／.8',
    intro: '一次测距要交换的参数——谁答、答多久、用哪套配置——装在 IE（information '
      + 'element，信息单元）里，挂在普通帧的载荷上。本引擎建的是它们的**字节宽度与字段清单**：'
      + 'PSDU 多长就决定了这一帧在空中多久；至于每个字段在第几个比特，模型用不上，'
      + '也没有抄。',
    family: 'core',
    needs: [{ id: 'hrp', why: '一个信息单元是 PSDU 里的几个字节，而 PSDU 的长度与空口时间由它定' }],
    match: (r) => sec(r, '三') },
  { id: 'twr', title: '双向测距的数学', note: 'SS／DS-TWR、时钟偏移修正、品质因数、基本交互',
    intro: '双向测距（two-way ranging, TWR）拿往返时间换距离：SS-TWR（单边）'
      + '一问一答，DS-TWR（双边）再加一回合，把两边晶振的频差也消掉。这一组是整张图的算术核心——它要的只是两个计数器读数之差，'
      + '和一个双方都认的时刻标记（RMARKER）。',
    family: 'core',
    needs: [
      { id: 'units', why: '一次测量就是两个计数器读数相减，RCTU 是减出来的那个差的单位' },
      { id: 'hrp', why: 'RMARKER 是帧里一个确定的码片，没有 PPDU 的分段就没有那个时刻' },
    ],
    match: (r) => sec(r, '一') && has(r, /SS-TWR|DS-TWR|跟踪偏移|品质因数|基本测距交互/) },
  { id: 'shapes', title: '五种回复时间形态', note: '嵌入／延后／固定，SS 与 DS §10.29.6',
    intro: '响应方从收到问话到发出回答，中间那段叫回复时间。它可以写进回答里一起发（嵌入）'
      + '、事后另发一帧报告（延后），或者双方事先约定一个值（固定）——代价分别是帧更长、'
      + '交互更多、以及少了灵活性。SS 与 DS 各有几种形态，合起来是标准列出的五种。',
    family: 'core',
    needs: [
      { id: 'twr', why: '「回复时间」只有在一次双向测距里才存在，五种形态是它的五种去处' },
      { id: 'ies', why: '嵌入与延后两种把它装在 RRTI／RMI 里，固定那一种的代价正是不装' },
    ],
    match: (r) => sec(r, '二') },
  { id: 'grid', title: '块／轮／时隙', note: '时间调度与竞争两种模式、按时隙开收 §10.32.2／.3',
    intro: '测距不是随来随发：时间被切成块（block），块里是轮（round），轮里是时隙（slot）'
      + '，每台设备只在属于自己的时隙里开收发。这张网格是所有多节点玩法的前提——身份、'
      + '次序、以及「谁该在什么时候醒着」都从它来。',
    family: 'core',
    needs: [{ id: 'units', why: '块与时隙都按 RSTU 的整数倍计，时隙边界是用它算出来的' }],
    match: (r) => sec(r, '五') && has(r, /块、轮与时隙|测距模式|接收使能/) },
  { id: 'multiie', title: '多节点测距 IE', note: 'ARC／RCPS／RCMA／RDM 建了宽度；RIU／RR／RBU／RCR 没建',
    intro: '一对多与多对多要多一套信息单元：这一轮有几个响应方、谁排第几个时隙、控制消息怎么编址。'
      + '本引擎建了其中几个的宽度（ARC／RCPS／RCMA／RDM），另外几个一个字节也没有——差别写在每一行里。',
    family: 'core',
    needs: [
      { id: 'ies', why: '它们也是信息单元，长度与字段清单按同一套算' },
      { id: 'grid', why: '这几个单元装的正是块号、轮号与时隙号——没有网格就没有号可装' },
    ],
    match: (r) => sec(r, '六') && !has(r, /SRRR IE/) },
  { id: 'one2many', title: '一对多', note: '广播 Poll 点名，逐锚点作答 §10.32.4／.5',
    intro: '一台控制器广播一次 Poll 把一串锚点一次点名，锚点各自在自己的时隙里作答。'
      + '它省的是问话：N 个锚点本来要 N 次问答，现在一问 N 答。定位解算要的三条以上距离，'
      + '正是这样一轮里拿到的。',
    family: 'core',
    needs: [
      { id: 'twr', why: '每个锚点与标签之间仍然是一次双向测距，只是问话合成了一帧' },
      { id: 'grid', why: '「各答各的」靠的是每个锚点有自己的时隙' },
      { id: 'multiie', why: 'RDM IE 就是那张「谁在第几个时隙」的名单' },
    ],
    match: (r) => sec(r, '五') && has(r, /一对多/) },
  { id: 'm2m', title: '多对多', note: '一帧对前后两方分别是答与问 §10.32.6／.7',
    intro: '多对多里每台设备既问也答：同一帧对前一个时隙的发送者是回答，对后一个是提问。'
      + '一轮之内所有参与者两两之间都有了距离，代价是每个人都得听完整轮。',
    family: 'core',
    needs: [
      { id: 'twr', why: '一帧同时是答与问，而两边各自算的仍是同一条双向测距的算术' },
      { id: 'grid', why: '参与者 i 在第 i 个时隙发——身份与次序都来自网格' },
    ],
    match: (r) => sec(r, '五') && has(r, /多对多/) },
  { id: 'sp3', title: 'SP3 分组测距', note: '没有 PHR 没有载荷，身份来自时隙 §10.32.8＋SRRR IE',
    intro: 'SP3（STS packet configuration 3）是一种只有同步头与 '
      + 'STS、没有 PHR 也没有载荷的包：它一个字段也带不了，所以「这是谁发的」'
      + '只能由它落在哪个时隙回答。好处是短——同样一轮里能塞下更多次测量。',
    family: 'core',
    needs: [
      { id: 'hrp', why: 'SP3 是一种 PPDU 形状：SHR 加 STS，没有 PHR 也没有 PSDU' },
      { id: 'grid', why: '这种包一个字段也带不了，所以发的人是谁只能由时隙回答' },
      { id: 'multiie', why: '请求它的 SRRR IE 挂在控制消息上，一个响应方一条' },
    ],
    match: (r) => has(r, /SP3 分组下的测距|SRRR IE/) },
  { id: 'recover', title: '测距之外的消息处理', note: '未收到 §10.34、辅助信息 §10.35、收妥确认 §10.36',
    intro: '一轮测距周围还有几句话要说：谁没收到启动消息、谁要另外捎一条信息、谁确认收妥了哪几条。'
      + '这三节管的就是控制器与响应方之间、测距以外的往来，它们挂在控制字与各自的信息单元上。',
    family: 'core',
    needs: [
      { id: 'one2many', why: '三节说的都是控制器与响应方之间、测距以外的话：谁没听到启动消息、谁要另外带一条消息、谁收妥了哪几条——没有这对角色，这些话没有说话的人' },
      { id: 'multiie', why: '三节各自挂在 ARC 控制字与自己的信息单元上（RMNR／RAICT／RMMRC）' },
    ],
    match: (r) => sec(r, '八') },
  { id: 'security', title: '安全：整块缺席', note: '§10.31、§10.33、STS 的 DRBG——引擎不持密钥',
    intro: '这几节管帧的加密与完整性，以及 STS 那串码片怎么由 DRBG（deterministic '
      + 'random bit generator，确定性随机比特生成器）生成——STS '
      + '的全部意义正在于攻击者猜不到它，于是伪造不出一个更早的到达时刻。本引擎不持密钥、'
      + '不做密码学，这一整块列出来是为了说清它缺席。',
    family: 'absent',
    needs: [{ id: 'hrp', why: 'STS 字段的位置与长度在 PPDU 里，缺的是填进去的那串码片' }],
    match: (r) => sec(r, '七') || has(r, /DRBG|SRMARKER/) },
  { id: 'prims', title: '原语、PIB 与描述符', note: '没有分层服务接口：场景直接构造设备',
    intro: '标准用「原语」描述上层怎么启停一次测距会话，用 PIB（PAN information '
      + 'base）描述设备上那一堆可配置的量。本引擎没有分层服务接口：场景直接构造设备、'
      + '直接给参数，所以这一组整块没有对应物。',
    family: 'absent',
    needs: [{ id: 'grid', why: '这些原语管的是一次测距会话的启停与参数，而会话就是那张网格' }],
    match: (r) => sec(r, '四') && has(r, /原语|MAC 常量与 PIB|Descriptor/) },
  { id: 'phy-absent', title: 'HPRF 与脉冲形状', note: 'HPRF、CoU、CS、LCP——没有波形层，带宽代替了脉冲',
    intro: '同一层物理层还有另外几种选择：更高的脉冲重复频率（HPRF）、几种不同的脉冲成形与编码。'
      + '它们换的是波形，PPDU 的骨架不变。本引擎没有波形层——带宽代替了脉冲——所以这几行整块未建。',
    family: 'absent',
    needs: [{ id: 'hrp', why: '它们是同一层的另外几种选择：换调制、换脉冲，PPDU 的骨架不变' }],
    match: (r) => sec(r, '九') && has(r, /HPRF|脉冲/) },
  { id: 'lrp', title: 'LRP 物理层：整章缺席', note: '§19 全章——第一刀就定了只建 HRP',
    intro: 'LRP（low pulse repetition frequency，低脉冲重复频率）'
      + '是 802.15.4 的另一套 UWB 物理层，有自己的一整章。本仓库第一刀就定了只建 '
      + 'HRP，所以这一章整章缺席；列出来，是为了让读者知道它存在。',
    family: 'absent', needs: [], match: (r) => sec(r, '十、') },
  { id: 'setup', title: '建立、拆除与超帧', note: '§10.29.2／.3、§10.30——会话从不需要被建立起来',
    intro: '标准里一次测距会话要先被建立、用完要被拆除，旧的超帧结构还规定了信标与竞争期的位置。'
      + '本引擎的会话是一张预先算好的网格——它从不需要被建立起来，所以这几节没有对应物。',
    family: 'absent',
    needs: [{ id: 'grid', why: '要建立与拆除的那个东西就是会话，而本引擎的会话是一张算好的网格' }],
    match: (r) => has(r, /交互前的准备|超帧结构下的 ERDEV/) },
  { id: 'mms-phy', title: 'MMS 包格式', note: '片段的长度与位置、能量预算、检出 §16.2.11',
    intro: '多毫秒（multi-millisecond, MMS）操作把一次测距的能量摊到好几毫秒里：'
      + '不发一整帧，改发一串短片段，让对端把它们加起来。这一组是它物理层的那一半——片段多长、'
      + '隔多远、每毫秒准发多少能量、接收机怎么把一串片段累加到能检出。',
    family: 'draft',
    needs: [
      { id: 'hrp', why: '片段仍是 HRP 的码片与符号，变的是把一个包拆成一串' },
      { id: 'units', why: '「每毫秒」这个预算与片段的位置都按码片与 RSTU 算' },
    ],
    match: (r) => sec(r, '十一')
      && has(r, /包格式|片段数与长度|MMRS|能量预算|累加与检出|RSF 带 SFD|片段间隔/) },
  { id: 'mms-mac', title: 'MMS 测距与子轮', note: '§10.39：建的是单边双向加时钟比率修正那一种',
    intro: 'MMS 的 MAC 那一半：一轮测距怎么切成子轮，哪些子轮走片段、哪些走控制与报告，'
      + '两端怎么在一次单边往返之外再做一次时钟比率修正。它是 4ab 草案里本仓库唯一跟到底的那条线，'
      + '也是整张图上争论最密集的一列——几个子轮形态至今还在反复表决。',
    family: 'draft',
    needs: [
      { id: 'mms-phy', why: '一轮 MMS 测距量的就是那串片段的首脉冲' },
      { id: 'twr', why: '它仍是单边双向那一套算术，加一次时钟比率修正' },
      { id: 'grid', why: '子轮、测距阶段与报告阶段都排在块与时隙上' },
    ],
    match: (r) => sec(r, '十一')
      && !has(r, /包格式|片段数与长度|MMRS|能量预算|累加与检出|RSF 带 SFD|片段间隔/) },
  { id: 'nb', title: '窄带控制面', note: '§10.39.4.2、250 个 2.5 MHz 信道、按块跳频',
    intro: '4ab 给 UWB 配了一部窄带电台：2.5 MHz 一格、两百多个信道，'
      + '专门搬控制消息——谁该测、什么时候测、测完报给谁。UWB 那一面只管测距，'
      + '于是省电也省空口。按块跳频是它躲开同一段上别人的办法。',
    family: 'draft',
    needs: [{ id: 'mms-mac', why: '这部窄带电台只搬控制消息，而它要控制的那一轮就是 MMS 测距' }],
    match: (r) => sec(r, '十二') && has(r, /窄带辅助|信道规划|按块跳频|SP0/) },
  { id: 'coex', title: '共存：LBT、SSBD、频域延后', note: '§10.39.8.3、§10.45、提案 §10.47',
    intro: '那部窄带电台跑在 6 GHz，而那一段上坐着 Wi-Fi。这一组是它的礼貌规矩：'
      + '先听后说（listen before talk, LBT）、发射功率控制、'
      + '频谱感知，以及「这一格忙就延后或换一格」。规矩越硬，测距越难按时发出去——这一列的争论全围着这个取舍。',
    family: 'draft',
    needs: [
      { id: 'nb', why: '先听后说与跳到下一个信道，判的都是那部窄带电台要不要发' },
      { id: 'band', why: '「听得见别人」是一次带内功率的比较，而带宽与重叠在这一组里' },
    ],
    match: (r) => sec(r, '十二') && has(r, /先听后说|发射功率控制|共存|频谱感知|频域延后/) },
  { id: 'sensing', title: '感知', note: '§10.40：只有双站、静止点目标，报告 IE 未建',
    intro: '同一部 UWB 电台不只能测自己离对方多远，也能听回波：目标在哪、动没动。'
      + '本引擎只建了最简单的一种——双站、静止的点目标，报告用的信息单元没建。',
    family: 'draft',
    needs: [
      { id: 'hrp', why: '回波量的是同一发帧的首脉冲，时标仍取在 RMARKER 上' },
      { id: 'band', why: '散射体回来的那一路强不强，是一次链路预算' },
    ],
    match: (r) => sec(r, '十三') },
  /**
   * **§十四 is a section of the document, not a feature** — and for one picture it was a column.
   *
   * That section exists to tell a reader how much of the 4ab draft this repository decided not to
   * follow, so it files twelve rows under one heading: the compact frame, hyper block mode,
   * discovery and association, PHY parameter negotiation, the wake-up radio, data offload to the
   * narrowband radio, the ranging support service, the LE UWB PHY with its extended channel bands,
   * and streaming. Reading that as ONE feature made the widest claim on the screen: that these
   * twelve rows are one thing with one history, and that nothing in the draft needs any of them.
   *
   * They are eight features with eight histories (discovery and parameter negotiation ride
   * together: §10.41 and §10.42 are the same handshake before a session), and the dates prove it
   * — the streaming row argues from the 2021 PAR while the compact frame's own security was
   * still being voted on in 2026.
   * Splitting them is what lets the picture say so; the engine's verdict on every one of them is
   * still 未建模, and the bars say that without help.
   */
  { id: 'compact', title: '复合帧', note: '§10.38 压缩帧布局、它的优化之争、以及 §9.2.12／.13 的复合帧安全',
    intro: '复合帧（compact frame）是 4ab 为短交互设计的压缩帧布局：'
      + '把常规的帧头与信息单元压到最小，省下的每个字节都是空口时间。它自己还带一套安全：'
      + '密钥描述符与帧计数器由测距的时隙、轮、块导出。',
    family: 'absent',
    needs: [
      { id: 'hrp', why: '复合帧压缩掉的正是 MHR＋IE＋FCS 那套布局，而一帧有多少码片、在空中占多久仍由 HRP 的 PPDU 决定' },
      { id: 'security', why: '这一组里的复合帧安全那一行，密钥描述符与帧计数器出自 §10.31 那套安全框架——而本引擎不持密钥' },
    ],
    match: (r) => sec(r, '十四') && has(r, /复合帧/) },
  { id: 'hyperblock', title: '超块模式', note: '§10.32.3.5 块之上再一层，连 Scheduling／Enhanced Ranging Round／Hyper Block Structure 三个 IE',
    intro: '超块（hyper block）是在块之上再加一层周期：一串块合成一个大周期，'
      + '块序号按新规则算，另配三个信息单元描述这层结构。它为的是长周期、低占空比的场景——设备可以整块整块地睡过去。',
    family: 'absent',
    needs: [{ id: 'grid', why: '超块是块之上多出来的一层——块序号要按 §10.32.3.5 重算，没有块与时隙就没有可数的东西' }],
    match: (r) => sec(r, '十四') && has(r, /超块模式/) },
  { id: 'assoc', title: '发现、关联与参数协商', note: '§10.41 基于块的发现与关联、§10.42 HRP 参数与动态数据模式协商',
    intro: '测距开始之前，两边先得找到对方、谈好参数：基于块的发现与关联给出「怎么找到一个控制器并加入」'
      + '，参数协商给出「这一段用哪套物理层参数、要不要动态数据模式」。本引擎的会话是算好的，'
      + '没有这一段握手。',
    family: 'absent',
    needs: [
      { id: 'setup', why: '要被发现、被关联的那个东西就是一次会话，而本引擎的会话从不需要被建立起来' },
      { id: 'hrp', why: '协商出来的是 HRP 的参数集与动态数据模式——没有那一层，就没有可谈的参数' },
    ],
    match: (r) => sec(r, '十四') && has(r, /设备发现与关联|参数协商/) },
  { id: 'wur', title: '唤醒无线电', note: '§10.43 与它自己的物理层 §16.9：唤醒符号 1.025 ms',
    intro: '唤醒无线电（wake-up radio, WUR）是设备上的第二个、极省电的接收机：'
      + '主收发器睡着，它醒着等一个唤醒包，唤醒符号长到毫秒量级就是为了让它用极低的功耗也解得出来。'
      + '本引擎不建功耗，也只有一个接收机。',
    family: 'absent', needs: [],
    match: (r) => sec(r, '十四') && has(r, /唤醒无线电/) },
  { id: 'offload', title: 'UWB 数据卸载到窄带', note: '§10.44 与 Narrowband Allocation IE §10.44.3.1',
    intro: '测距之外真要传点数据的时候，4ab 允许把它交给那部窄带电台，并用一个信息单元分配带宽与时机。'
      + '本引擎的窄带只跑控制消息，不跑数据。',
    family: 'absent',
    needs: [{ id: 'nb', why: '要卸载到的那部电台就是窄带控制面那一部，§10.44 分配的也是它那张信道表上的带宽' }],
    match: (r) => sec(r, '十四') && has(r, /数据卸载/) },
  { id: 'rss', title: '测距支持服务', note: '§10.46——语料库只给了 PICS 里的一行 MLF9.46',
    intro: '测距支持服务（ranging support service, RSS）'
      + '是草案里的一节，让一台设备替别人准备或辅助一次测距。本仓库的语料库里它只出现过 '
      + 'PICS 中的一行——连它靠什么成立都读不出来，所以这一列除了「它在草案里」'
      + '不敢多说一句。',
    family: 'absent', needs: [],
    match: (r) => sec(r, '十四') && has(r, /测距支持服务/) },
  { id: 'leuwb', title: '低能量 UWB 物理层', note: 'LE UWB PHY（SYNC／SFD 恒为 OOK），连 §16.4.1.2 两侧的扩展信道频段',
    intro: '低能量 UWB（LE UWB）是 4ab 新加的一套极简物理层：同步与定界恒用 '
      + 'OOK（on-off keying，通断键控）且不编码，为的是让最便宜的标签也收发得起。'
      + '它和 HRP 一起共享新开的扩展信道频段。',
    family: 'absent',
    needs: [{ id: 'band', why: '扩展信道频段要扩的就是信道 5／9 那张表，而 LE UWB 那一侧也在同一条表上开新段' }],
    match: (r) => sec(r, '十四') && has(r, /LE UWB|扩展信道频段/) },
  { id: 'stream', title: '流式传输', note: 'PAR 的目标（≥ 50 Mb/s 与低时延）——草案里有没有机制，语料库定不了',
    intro: '高速率（立项范围里写的目标是 ≥ 50 Mb/s）与低时延流式传输写在 '
      + '4ab 的 PAR 里。但在本仓库的语料库里，它们只以「范围陈述」的形式被反复照抄——草案里究竟有没有一套对应机制，'
      + '这些文稿定不了。',
    family: 'absent', needs: [],
    match: (r) => sec(r, '十四') && has(r, /流式传输/) },
  { id: 'position', title: '由距离解位置', note: '等权高斯—牛顿，不按品质因数加权；标准不给解算',
    intro: '拿到三条以上距离之后把坐标解出来，本引擎用的是等权高斯—牛顿迭代。这件事标准不管：'
      + '标准给测量，不给解算——所以这一列一条条款也引不出来，它是本引擎自己的模型。',
    family: 'derived',
    needs: [
      { id: 'twr', why: '解算吃的是距离，而距离是双向测距交出来的' },
      { id: 'one2many', why: '一次解算要同一轮里的三条以上距离，那正是一对多给的' },
    ],
    match: (r) => has(r, /由多个距离解位置/) },
  { id: 'tdoa', title: 'DL／UL-TDoA', note: 'FiRa 形状的模型；四个到达时刻怎么汇总，本模型没说',
    intro: 'TDoA（time difference of arrival，到达时间差）'
      + '不量往返，量的是同一个信号到达不同锚点的时刻之差：标签只发不收（上行）或只收不发（下行）'
      + '，于是省电、也容得下更多标签。本引擎照 FiRa 的形状建模——2024 '
      + '版标准的目录里没有一条以它为题的条款。',
    family: 'derived',
    needs: [
      { id: 'units', why: '它量的是两个到达时刻之差，单位与计数器是同一套' },
      { id: 'grid', why: '谁在什么时候发，靠的是排好的时隙——标签不回话，没有网格就没有次序' },
      { id: 'hrp', why: '到达时刻取在 RMARKER 上，和双向测距同一个瞬间' },
    ],
    match: (r) => has(r, /TDoA/) },
  { id: 'aoa', title: 'AoA／PDoA', note: '纯几何：锚点并没有两路接收',
    intro: '到达角（angle of arrival, AoA）靠一对天线收到同一帧的相位差（PDoA）'
      + '算方位。本引擎是纯几何：由真实方位角反算一对半波长天线会看到的相位，再加一次噪声——锚点并没有两路接收。',
    family: 'derived',
    needs: [{ id: 'hrp', why: '相位差读在同一帧的同一瞬间上——它要的是一帧，不是一次往返' }],
    match: (r) => has(r, /到达角/) },
  { id: 'fading-uwb', title: 'UWB 侧的衰落', note: '范围决定：信道模型出自 802.15.4a 的报告',
    intro: 'UWB 的信道模型出自 802.15.4a 的信道模型报告，不是标准正文——所以「标准怎么规定衰落」'
      + '这一问在这张表里无处可对。本仓库的衰落那一刀只动了 Wi-Fi 侧，UWB '
      + '链路的电平由几何与墙一次算定。',
    family: 'derived',
    needs: [{ id: 'band', why: '衰落要改的就是这条链路预算里的那一项' }],
    match: (r) => has(r, /UWB 侧的衰落/) },
]

const WIFI_SPINE: GroupSpec[] = [
  { id: 'phy-timing', title: '物理层时序', note: '第 17 章 OFDM 与第 18 章 ERP：前导码、符号、空口时间',
    intro: '一帧在空中占多久，是这整个仿真器最底下的那条算术：前导码几个符号、一个符号多少微秒、'
      + '载荷按哪个速率摊成多少符号。第 17 章的 OFDM 与第 18 章的 '
      + 'ERP 是这条式子最早的两个版本，后面每一代都只是换尺寸。',
    family: 'core', needs: [], match: (r) => sec(r, '五') },
  { id: 'phy-params', title: 'HT／VHT／HE／EHT 参数', note: '每一代的前导码、保护间隔、速率表 §19／§21／§27／be §36',
    intro: '从 11n 到 11be，每一代都在同一条式子里换参数：前导码多了哪几段、'
      + '保护间隔有几种、一个符号装得下多少比特。这一组就是那几张速率表与时序常数，'
      + '它们决定同样一包数据在不同代次下占多少空口时间。',
    family: 'core',
    needs: [{ id: 'phy-timing', why: '每一代改的是前导码与符号这两个尺寸，算空口时间的那条式子不变' }],
    match: (r) => sec(r, '六') },
  { id: 'propagation', title: '传播、衰落与频率选择性', note: '标准不规定的那一半：路径损耗、阴影、瑞利、逐格信噪比',
    intro: '信号从发射端到接收端要掉多少分贝，标准不规定——它只规定接收机至少要多灵敏。'
      + '所以路径损耗、阴影、瑞利衰落与逐格信噪比全是本引擎自己的模型；列在这里，'
      + '是为了让读者知道哪些数不是标准给的。',
    family: 'derived', needs: [], match: (r) => sec(r, '八') },
  { id: 'traffic', title: '业务、队列与云端', note: '标准之外：业务模型、队列、广域往返',
    intro: '包从哪来、排在哪、发完之后还要跨多远的广域网——这些都在标准之外，却决定了仿真里看到的时延长什么样。'
      + '这一组是本引擎的业务模型、队列与那段广域往返。',
    family: 'derived', needs: [], match: (r) => sec(r, '九') },
  { id: 'dcf', title: 'DCF 信道接入', note: '帧间间隔、退避、NAV、重传与丢弃 §10.3',
    intro: 'DCF（distributed coordination function，'
      + '分布式协调功能）是 Wi-Fi 最基础的那条规矩：先听，空了等一个帧间间隔，'
      + '再退避一个随机数；撞了就把窗口翻倍。NAV、重传与丢弃也在这一组——它是这个仿真器建得最全的一块。',
    family: 'core',
    needs: [
      { id: 'phy-timing', why: '短帧间间隔与时隙是物理层给的两个常数，整条退避都按它们数' },
      { id: 'traffic', why: '队列里有帧，才有「谁先发」这个问题——本引擎的帧全从队列来' },
    ],
    match: (r) => sec(r, '一') },
  { id: 'rates', title: '多速率与控制响应', note: '速率选择、控制回应速率、基本速率集 §10.6',
    intro: '同一个 BSS 里不同设备跑不同速率，而控制帧（ACK、CTS）必须让所有人都听得懂。'
      + '这一组是速率怎么选、控制回应用哪个速率、以及基本速率集为什么存在。',
    family: 'core',
    needs: [
      { id: 'phy-params', why: '可选的档就是那一代速率表里的行' },
      { id: 'propagation', why: '挑档读的是这条链路的到达电平，而电平出自传播那一侧' },
    ],
    match: (r) => sec(r, '四') },
  { id: 'edca', title: 'HCF／EDCA', note: '四类的三个常数、内部碰撞、TXOP §10.23',
    intro: 'EDCA（enhanced distributed channel access，'
      + '增强分布式信道接入）把流量分成四类，给每类不同的等待时间与退避窗口：语音等得最短，'
      + '背景等得最长。同一台设备里四类之间还会内部碰撞，而赢家拿到的是一段可以连发的 '
      + 'TXOP。',
    family: 'core',
    needs: [
      { id: 'dcf', why: '一类就是一套自己的 DCF 参数：静默更短、窗口更窄' },
      { id: 'traffic', why: '「四类」分的是队列，而每台设备的四条队列在这一组里' },
    ],
    match: (r) => sec(r, '二') },
  { id: 'agg', title: '聚合与确认', note: 'A-MPDU／A-MSDU、块确认、重传 §10.11／§10.12／§10.25',
    intro: '一帧只发一个包太亏：A-MSDU 把几个包拼成一个载荷，A-MPDU 把几个帧串成一串，'
      + '一次确认用一张位图回答「这一串里哪几个收到了」。吞吐的大头就在这里。',
    family: 'core',
    needs: [
      { id: 'dcf', why: '一批帧要先赢得一次发送机会，聚合省下的正是后面几次竞争' },
      { id: 'rates', why: '一批能装多长，是「这一档上多少微秒」算出来的' },
    ],
    match: (r) => sec(r, '三') },
  { id: 'mu', title: '下行与上行的多用户', note: 'OFDMA、MU-MIMO、触发帧 §26.5、be §35',
    intro: '多用户把一次发送分给几台设备：OFDMA 按频率切资源单元（RU），MU-MIMO '
      + '按空间流切。上行还要 AP 先发一个触发帧把大家叫齐——因为几台设备必须同时开口。',
    family: 'core',
    needs: [
      { id: 'phy-params', why: '多用户是 HE／EHT 的 PPDU 形态：资源单元与触发帧都在那一层' },
      { id: 'agg', why: '每个成员那一份仍是一批聚合帧，回答仍是块确认' },
    ],
    match: (r) => sec(r, '七') },
  { id: 'tamper', title: '作弊目录', note: '七种改坏驱动的办法，以及 AP 能不能看出来 §9.4.2.27',
    intro: '同一片空口上，把自己的驱动改坏能占到多少便宜？这一组列的是七种改法，以及 '
      + 'AP 从自己看得到的那些字段里，能不能看出来。',
    family: 'core',
    needs: [{ id: 'edca', why: '七种作弊改的都是 EDCA 那三个常数或它们的用法' }],
    match: (r) => sec(r, '十、') },
  { id: 'amp', title: 'AMP（P802.11bp）', note: '环境供电标签：触发、时隙、反向散射——引擎建了而课没讲的那些',
    intro: 'AMP（ambient power，环境供电）标签没有电池：它靠收来的能量醒一下，'
      + '再用反向散射把信息反射回去。P802.11bp 还是草案，这一组是引擎已经建了、'
      + '而课程还没讲到的那一批。',
    family: 'draft',
    needs: [
      { id: 'phy-timing', why: '它跑在同一片空口上，帧长仍按同一套前导码与符号算' },
      { id: 'dcf', why: '一轮点名要先占住信道（CTS-to-self），占的是 DCF 的那条规矩' },
    ],
    match: (r) => sec(r, '十一') },
  { id: 'wifi-absent', title: '决定不建的', note: '读者会合理期待、而本仓库明确不建的那一批',
    intro: '读者会合理期待、而本仓库明确不建的那一批。列出来比挑一个好听的说法强——每一行都写着为什么不建。',
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
  /** The same rows, each with the documents it cites — the panel's sub-feature sections. */
  rowDetails: RowDetail[]
  lessons: string[]
  /** The same lessons, dated and titled — `lessons` is the id, this is what a reader clicks. */
  lessonRefs: LessonRef[]
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

/**
 * One lesson of this repository that teaches part of a feature: what it is called, and the day
 * it was added (`lessonMeta.json`, read off git). **The only date in this picture that is this
 * repository's own**, which is why it is still here after the green blocks went: the panel prints
 * it beside a link that opens the lesson.
 */
export interface LessonRef { id: string; title: string; added: string; file: string }

/**
 * **One row of the coverage table, with the documents that row itself cites.**
 *
 * The column's timeline is the union of its rows, and a union answers 「when did anything happen
 * to this feature」. It cannot answer the question a reader actually arrives with — 「how did THIS
 * sub-feature get here」 — and on a column like MMS ranging, where ten rows share twenty-five
 * documents, the union is the only thing the old panel could show. This is the per-row cut: the
 * same `docMeta.json` entries, filtered to the citations in that one row's own cells.
 */
export interface RowDetail { row: FeatureRow; docs: DocRef[] }

/** One company, and how many of this group's cited documents carry its name. */
export interface OrgRef { name: string; docs: number }

/**
 * **What a document did, counted rather than quoted** (`scripts/doc-meta.ts#gistOf`).
 *
 * `clause` is the draft clause its text mentions most; `cids` how many distinct comment indices
 * it names; `acc`/`rev`/`rej` how often the words Accepted, Revised and Rejected occur in it.
 * **The last three are word counts, not a reading of its dispositions** — the map labels them as
 * counts for that reason. A document whose text the mirror never extracted has none of this, and
 * `docMeta.json` lists it under `noText`.
 */
export interface DocGist {
  clause?: string
  cids?: number
  acc?: number
  rev?: number
  rej?: number
}

/** One cited mentor document, as `docMeta.json` holds it. */
export interface DocRef {
  dcn: string
  date: string
  kind: string
  title: string
  orgs: string[]
  gist: DocGist
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
 * git history: the day each lesson file was added — the only date in this picture that this
 * repository is itself answerable for. It is no longer a row of the matrix (`TimeEvent` says
 * why); it is what the panel prints beside each lesson it links to.
 */
const LESSON_META = lessonMetaJson.lessons as
  Record<string, { file: string; added: string; touched: string; title: string }>
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
 * Whether a document of this kind may put a company's mark on the screen.
 *
 * The group's company list has excluded the procedural kinds since the day the minutes turned the
 * secretary's employer into the top contributor to almost every feature — but **each document
 * also draws its own marks**, in the matrix blocks and in both timelines, and those went on
 * showing the same name on an agenda. One rule, one place, both sides of the screen.
 */
export const creditsOrgs = (kind: string): boolean => !PROCEDURAL.has(kind)

/**
 * One dated thing that happened to a feature. Two kinds, and they answer different questions:
 *
 * - `published` — the feature's rows argue from a published clause. It has no date in these
 *   corpora (see `BASELINE`), so it sits in the one row above time.
 * - `doc` — an IEEE mentor document a row cites, dated by `docMeta.json`.
 *
 * **The lessons are not events here, and that is deliberate.** They were, for one picture: a
 * green block on the day this repository wrote the lesson. But every lesson of a track was added
 * within five weeks of every other, so the green blocks drew one bright stripe across the bottom
 * of the matrix that said nothing about the feature above it — and they were half the blocks on
 * the screen. The lessons are where they can be acted on instead: in the panel, as links that
 * open the lesson, with the day they were added beside them (`FeatureGroup.lessonRefs`).
 */
export interface TimeEvent {
  kind: 'published' | 'doc'
  /** ISO day, or `''` for the published marker, which is the one thing with no date. */
  date: string
  /** `15-22/0381`, or the published clause marker. */
  label: string
  detail: string
  orgs: string[]
  /** For a document: its kind as `docMeta.json` holds it (`proposal`, `cr`, `minutes`, …). */
  docKind?: string
  /** For a document: what it did, counted. Empty for the published marker. */
  gist?: DocGist
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
   * they were tabled, then (with no event at all, `UNDATED`) the ones this engine modelled with
   * no clause to point at. Down a column is that feature's own history.
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
 * no clause exists. They are the engine's own models, and **their columns are therefore empty**:
 * the one date they ever had was the day this repository wrote the lesson, and that is now in the
 * panel rather than in the grid. An empty column is the true statement about them — the picture
 * says 「no document in this corpus dates this at all」 and sends the reader to the panel for the
 * one date there is. They sort to the right end, not into the published row, because 「nothing
 * dates it」 and 「it was published before the corpus began」 are different claims.
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

/** Where a column sits left to right: the row of its first event, and «never» is last. */
const firstKey = (c: MatrixColumn): number => (c.firstRow < 0 ? Number.MAX_SAFE_INTEGER : c.firstRow)

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

  /** Document numbers → what `docMeta.json` knows about them, earliest first, unknown dropped. */
  const refsOf = (dcns: readonly string[]): DocRef[] => [...new Set(dcns)]
    .flatMap((dcn) => (DOC_META[dcn] === undefined ? [] : [{ dcn, ...DOC_META[dcn]! }]))
    .sort((a, b) => a.date.localeCompare(b.date) || a.dcn.localeCompare(b.dcn))

  const groups: FeatureGroup[] = spec.map((g) => {
    const rs = byGroup.get(g.id)!
    const cited = [...new Set(rs.filter(datesFrom).flatMap((r) => r.dcns))]
    const docs: DocRef[] = refsOf(cited)
    const byOrg = new Map<string, number>()
    for (const d of docs) {
      if (PROCEDURAL.has(d.kind)) continue
      for (const o of d.orgs) byOrg.set(o, (byOrg.get(o) ?? 0) + 1)
    }
    const since = docs[0]?.date ?? null
    const lessons = [...new Set(rs.flatMap((r) => r.lessons))]
    return {
      ...g, rows: rs, docs, lessons,
      rowDetails: rs.map((r) => ({ row: r, docs: refsOf(r.dcns) })),
      lessonRefs: lessons.flatMap((id) => {
        const m = LESSON_META[id]
        return m === undefined ? [] : [{ id, title: m.title, added: m.added, file: m.file }]
      }).sort((a, b) => a.added.localeCompare(b.added) || a.id.localeCompare(b.id)),
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
          orgs: meta.orgs, docKind: meta.kind, gist: meta.gist ?? {} })
      }
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
    // A feature with no dated event at all (`UNDATED`: the engine's own models) has `firstRow`
    // -1, and -1 is not «earliest» — it is «never», so it sorts to the right end of the picture.
    firstKey(a) - firstKey(b)
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

