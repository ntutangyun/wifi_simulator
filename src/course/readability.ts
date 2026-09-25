/**
 * The lesson contract's text helpers, as pure functions.
 *
 * What is left here after 2026-09-25 is deliberately small. The suite used to
 * hold a large body of rules about how a sentence READS — word budgets,
 * paragraph length, acronym density, first-use naming shapes, bilingual parity
 * — and the user's ruling retired them: the tests are for the software, not for
 * the prose (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md,
 * "What the tests are for").
 *
 * Three things survive, because each one is either a walk over lesson DATA or
 * the user's own requirement:
 *  - `lessonStrings` / `paragraphTexts` / `cellTexts`: the walks that say what
 *    text a lesson holds. Every per-lesson test pins its claims through them.
 *  - `zhChars` and `mainPathChars`: the reading-time estimate behind
 *    `lessonMinutes`, which is the only length control the course has left.
 *  - `ZH_TERMS` and its matcher: every official term carries its standard
 *    English name, and its abbreviation where the standard has one, at its
 *    first use in a lesson. That is the reader's own requirement.
 */
import { diagramTexts, isDiagramSpec } from './diagram'
import type { Block, Lesson } from './lessonKit'

/** CJK ideographs — the characters a Chinese lesson is measured in. */
const CJK = /[㐀-䶿一-鿿]/g

/** Chinese in a string: what a table cell read as language looks like. */
const HAS_CJK = /[㐀-䶿一-鿿]/

/** Chinese characters; Latin letters, digits and punctuation do not count. */
export function zhChars(text: string): number {
  return text.match(CJK)?.length ?? 0
}

/**
 * The running prose of a set of blocks, in reading order. A heading and the
 * items of a list or a set of steps are prose like any other.
 *
 * Two things are left out, and for the same reason: a table cell and a formula
 * body are where the exact values live, so `cellTexts` reads the cells
 * separately.
 */
export function paragraphTexts(blocks: Block[]): string[] {
  const out: string[] = []
  for (const b of blocks) {
    if (b.heading) out.push(b.heading)
    switch (b.kind ?? 'p') {
      case 'p':
      case 'watch':
        out.push((b as Extract<Block, { kind?: 'p' }>).text)
        break
      case 'list':
      case 'steps':
        out.push(...(b as Extract<Block, { kind: 'list' }>).items)
        break
      case 'formula': {
        const note = (b as Extract<Block, { kind: 'formula' }>).note
        if (note) out.push(note)
        break
      }
      case 'widget': {
        const caption = (b as Extract<Block, { kind: 'widget' }>).caption
        if (caption) out.push(caption)
        break
      }
      case 'diagram': {
        // Every label inside the figure, then its caption — the order a reader
        // meets them. A diagram's labels are prose: the terminology rule reads
        // this walk, so a term first named inside a picture has to carry its
        // English name exactly as a term first named in a sentence does.
        const d = b as Extract<Block, { kind: 'diagram' }>
        out.push(...diagramTexts(d.spec))
        if (d.caption) out.push(d.caption)
        break
      }
      default:
        // `table`: `cellTexts` reads the cells.
        break
    }
  }
  return out
}

/**
 * The table cells a learner reads as language: the ones with Chinese in them. A
 * cell holding only a value, a symbol or a log name is a glance rather than a
 * sentence, and carries no term to name.
 *
 * The terminology rule reads these, because 确认帧 in a table cell is the
 * reader's first meeting with the term just as much as one in a paragraph.
 */
export function cellTexts(blocks: Block[]): string[] {
  const out: string[] = []
  for (const b of blocks) {
    if (b.kind !== 'table') continue
    for (const c of [...b.head, ...b.rows.flat()]) if (HAS_CJK.test(c)) out.push(c)
  }
  return out
}

/**
 * Keys of a lesson object that hold a string which is not prose a learner
 * reads: a block's discriminant, a widget's name and its preset controls, and a
 * `Term`'s own word (the standard's own spelling, not a translation).
 */
const NOT_PROSE = new Set(['scenario', 'find', 'kind', 'widget', 'params', 'term'])

/**
 * Every string a learner can read in a lesson: the one walk that all the
 * per-lesson tests and the contract test share, so a field added to the
 * contract is covered everywhere the moment it is added here.
 *
 * Walked: `why`, `outcomes`, `terms` (each term's `plain` line), `picture`,
 * `numbers`, `deeper`, `sources`, `observe`, `tryThis` and `quiz`, including
 * table cells, formula bodies and quiz options. `scenario` and `find` are
 * skipped: they are functions of the engine, not text.
 *
 * `title`, `variants[].label` and `jumps[].label` are deliberately outside it —
 * they are the chrome around a lesson rather than the lesson — so a caller that
 * wants them appends them to the result itself.
 *
 * It takes a `Partial<Lesson>` so a caller can ask for one field at a time.
 */
export function lessonStrings(l: Partial<Lesson>): string[] {
  const out: string[] = []
  const walk = (x: unknown): void => {
    if (x == null || typeof x === 'function') return
    if (typeof x === 'string') { out.push(x); return }
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (typeof x !== 'object') return
    const o = x as Record<string, unknown>
    for (const [k, v] of Object.entries(o)) {
      if (NOT_PROSE.has(k)) continue
      // A diagram's figure is read by `diagramTexts` rather than walked: the
      // generic walk cannot tell a label from a node id or a link's two ends,
      // and only the labels are text a learner reads.
      if (k === 'spec' && isDiagramSpec(v)) out.push(...diagramTexts(v))
      else walk(v)
    }
  }
  walk({
    why: l.why, outcomes: l.outcomes, terms: l.terms, picture: l.picture, numbers: l.numbers,
    deeper: l.deeper, sources: l.sources, observe: l.observe, tryThis: l.tryThis, quiz: l.quiz,
  })
  return out
}

/**
 * Chinese characters across everything a learner reads on a lesson's main path:
 * what `lessonMinutes` estimates reading time from.
 *
 * `deeper` and `sources` are deliberately absent — the stated minutes are the
 * minutes of the main path, not of the depth behind the collapsed sections —
 * and a lesson still in the old flat shape is counted through `body`.
 */
export function mainPathChars(l: Partial<Lesson>): number {
  const texts = lessonStrings({
    why: l.why, outcomes: l.outcomes, terms: l.terms, picture: l.picture, numbers: l.numbers,
    observe: l.observe, tryThis: l.tryThis, quiz: l.quiz,
  }).concat(lessonStrings({ picture: l.body }))
  return texts.reduce((n, s) => n + zhChars(s), 0)
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')

/* ------------------------------------------------------------------------- *
 * Every official term carries its English name in the Chinese
 * (.superpowers/sdd/2026-09-23-mechanism-before-metaphor/zh-term-inventory.md)
 * ------------------------------------------------------------------------- */

/**
 * A glossary row: the Chinese name as the course must write it, the standard
 * English name, the standard abbreviation where one exists, and the
 * alternative renderings the course must NOT use.
 *
 * `zh` is absent for the terms the standard never gives a Chinese name and the
 * course only ever prints as an acronym (`MSDU`, `RMARKER`, `L-SIG`): there the
 * shape is the acronym outside the bracket and its English expansion inside.
 */
export interface ZhTerm {
  /** The Chinese name; absent for an acronym-only term. */
  zh?: string
  /** The standard English name, or the expansion of an acronym-only term. */
  en: string
  /** The standard abbreviation, where the standard has one. */
  abbr?: string
  /**
   * Renderings of the same term the course uses somewhere and must stop using
   * — section 3 of the inventory, made machine-checkable. Only the twelve
   * inconsistencies that document found are listed: an `aka` invented here
   * would be a naming decision dressed up as a lint.
   */
  aka?: readonly string[]
  /**
   * The track whose lessons this row is graded in, when the same Chinese word
   * means something else in the other track. Only three rows need it, and each
   * was a false positive the first corpus run found:
   *  - 时隙 is the Wi-Fi `slot time`; in the UWB track it is the **ranging**
   *    slot (its own row), and demanding `（slot time）` there taught the wrong
   *    term in 15 lessons;
   *  - 标签 is the UWB `tag`; in the Wi-Fi track it is a sticky label in an
   *    analogy (frame-anatomy) and the label above a node in the UI (ifs);
   *  - 重叠 is the UWB band `overlap`; in the Wi-Fi track it is what two
   *    colliding frames do to each other (backoff, bianchi).
   * A row without a track is graded in every lesson.
   */
  track?: 'wifi' | 'uwb'
}

/**
 * The official IEEE 802.11 / 802.15.4 terms of the course, from sections
 * 2.1–2.5 of the inventory. `zh` is the TARGET rendering, which for a
 * kind-(c) term (one the course prints only as a bare acronym) is the Chinese
 * name the fix wave has to write; until it is written the row is reported by
 * the abbreviation arm, or by the corpus-wide coverage test, and both are the
 * fix wave's work order rather than a bug in this table.
 *
 * Deliberately NOT here:
 *  - section 2.6 (see {@link ZH_TERMS_EXCLUDED});
 *  - `LLC`, `EMLSR`, `RD`: named only in `deeper`, which this rule does not
 *    read, so a row for them could never be graded;
 *  - `Coffs`: the simulator's own field name for the standard's ranging
 *    tracking offset, so it is a naming note, not a term to bracket;
 *  - the standard's message names (`Poll` / `Response` / `Final` / `Report`,
 *    `NB Poll` …), `SP0…SP3`, `ARC IE` / `RDM IE`, `Address 2` / `3` and
 *    `SA` / `DA`: each is a list the course already prints in the standard's
 *    own spelling, so there is no English name missing from it.
 */
export const ZH_TERMS: readonly ZhTerm[] = [
  // --- 2.1 PHY and link budget ---
  { zh: '接收信号强度指示', en: 'received signal strength indicator', abbr: 'RSSI' },
  { zh: '信噪比', en: 'signal-to-noise ratio', abbr: 'SNR' },
  { zh: '信干噪比', en: 'signal-to-interference-plus-noise ratio', abbr: 'SINR' },
  { zh: '噪声地板', en: 'noise floor', aka: ['底噪', '器声地板'] },
  { zh: '路径损耗', en: 'path loss' },
  { zh: '发射功率', en: 'transmit power' },
  { zh: '灵敏度', en: 'sensitivity' },
  { zh: '调制与编码方式', en: 'modulation and coding scheme', abbr: 'MCS' },
  { zh: '正交频分复用', en: 'orthogonal frequency-division multiplexing', abbr: 'OFDM' },
  { zh: '子载波', en: 'sub-carrier' },
  { zh: '符号', en: 'symbol' },
  { zh: '空闲信道评估', en: 'clear channel assessment', abbr: 'CCA' },
  { zh: '能量检测', en: 'energy detection', abbr: 'ED' },
  { zh: '前导检测', en: 'preamble detection' },
  { zh: '调制', en: 'modulation' },
  { zh: '编码率', en: 'coding rate' },
  { en: 'binary phase-shift keying', abbr: 'BPSK' },
  { en: 'quadrature phase-shift keying', abbr: 'QPSK' },
  { en: 'quadrature amplitude modulation', abbr: 'QAM' },
  { zh: '前导码', en: 'preamble', aka: ['前导'] },
  { en: 'legacy short training field', abbr: 'L-STF' },
  { en: 'legacy long training field', abbr: 'L-LTF' },
  { en: 'legacy signal field', abbr: 'L-SIG' },
  { en: 'universal signal field', abbr: 'U-SIG' },
  { zh: '服务字段', en: 'SERVICE field' },
  { zh: '尾比特', en: 'tail bits' },
  { zh: '填充', en: 'padding' },
  { zh: '空口时间', en: 'airtime' },
  { zh: '信道带宽', en: 'channel width' },
  { zh: '空间流', en: 'spatial stream' },
  { zh: '天线', en: 'antenna' },
  { zh: '波束成形', en: 'beamforming' },
  { zh: '探测', en: 'channel sounding' },
  { zh: '强制速率', en: 'mandatory rate' },
  { zh: '控制回应速率', en: 'control response rate' },

  // --- 2.2 roles, frames, addressing ---
  { zh: '站点', en: 'station', abbr: 'STA' },
  { zh: '接入点', en: 'access point', abbr: 'AP' },
  { zh: '媒体访问控制', en: 'medium access control', abbr: 'MAC' },
  { zh: '物理层', en: 'physical layer', abbr: 'PHY' },
  { zh: '基本服务集', en: 'basic service set', abbr: 'BSS' },
  { zh: '基本服务集标识', en: 'basic service set identifier', abbr: 'BSSID' },
  { zh: '服务集标识', en: 'service set identifier', abbr: 'SSID' },
  { zh: '分发系统', en: 'distribution system', abbr: 'DS' },
  { zh: '管理帧', en: 'management frame' },
  { zh: '控制帧', en: 'control frame' },
  { zh: '数据帧', en: 'data frame' },
  { zh: '信标', en: 'Beacon' },
  { en: 'MAC service data unit', abbr: 'MSDU' },
  { en: 'MAC protocol data unit', abbr: 'MPDU' },
  { en: 'PHY protocol data unit', abbr: 'PPDU' },
  { zh: '载荷', en: 'payload', aka: ['净荷'] },
  { zh: '帧头', en: 'MAC header' },
  { zh: '帧控制', en: 'Frame Control' },
  { zh: '持续时间', en: 'Duration/ID' },
  { zh: '地址 1', en: 'Address 1' },
  { zh: '接收端地址', en: 'receiver address', abbr: 'RA' },
  { zh: '发送端地址', en: 'transmitter address', abbr: 'TA' },
  { zh: '序列控制', en: 'Sequence Control' },
  { zh: '分片号', en: 'Fragment Number' },
  { zh: '重发比特', en: 'Retry bit', aka: ['重传标志', '重复标志'] },
  { zh: '帧体', en: 'Frame Body' },
  { zh: '帧校验序列', en: 'frame check sequence', abbr: 'FCS' },
  { zh: '循环冗余校验', en: 'cyclic redundancy check', abbr: 'CRC' },
  { zh: '服务质量', en: 'quality of service', abbr: 'QoS' },
  { zh: '业务标识', en: 'traffic identifier', abbr: 'TID' },
  { zh: '接入类别', en: 'access category', abbr: 'AC' },
  { zh: '确认帧', en: 'acknowledgement', abbr: 'ACK' },
  { zh: '确认策略', en: 'Ack Policy' },

  // --- 2.3 channel access ---
  { zh: '时隙', en: 'slot time', track: 'wifi' },
  { zh: '短帧间间隔', en: 'short interframe space', abbr: 'SIFS' },
  // §10.3.2.3.5: the DCF interframe space. "distributed interframe space" is
  // the gloss the course carried and the one error this table fixes outright.
  { zh: '分布式帧间间隔', en: 'DCF interframe space', abbr: 'DIFS' },
  { zh: '扩展帧间间隔', en: 'extended interframe space', abbr: 'EIFS' },
  { zh: '仲裁帧间间隔', en: 'arbitration interframe space', abbr: 'AIFS' },
  { zh: '仲裁帧间间隔数', en: 'arbitration interframe space number', abbr: 'AIFSN' },
  { zh: '基本接入', en: 'basic access' },
  { zh: '介质', en: 'medium' },
  { zh: '载波侦听', en: 'carrier sense' },
  { zh: '虚拟载波侦听', en: 'virtual carrier sense' },
  { zh: '网络分配向量', en: 'network allocation vector', abbr: 'NAV' },
  { zh: '退避', en: 'backoff' },
  { zh: '竞争窗口', en: 'contention window', abbr: 'CW' },
  { zh: '最小竞争窗口', en: 'minimum contention window', abbr: 'CWmin', aka: ['最小窗口'] },
  { zh: '最大竞争窗口', en: 'maximum contention window', abbr: 'CWmax', aka: ['最大窗口'] },
  { zh: 'ACK 超时', en: 'ACK timeout' },
  { zh: '信号检测时延', en: 'aRxPHYStartDelay' },
  { zh: '隐藏节点', en: 'hidden station' },
  { zh: '请求发送', en: 'request to send', abbr: 'RTS' },
  { zh: '允许发送', en: 'clear to send', abbr: 'CTS' },
  { zh: 'RTS 门限', en: 'RTS threshold' },
  { zh: '分布式协调功能', en: 'distributed coordination function', abbr: 'DCF' },
  { zh: '增强型分布式信道接入', en: 'enhanced distributed channel access', abbr: 'EDCA' },
  { zh: '内部碰撞', en: 'internal collision' },
  { zh: '重传', en: 'retry' },
  { zh: '重传上限', en: 'retry limit' },
  { zh: '生存期', en: 'MSDU lifetime' },
  { zh: '队列', en: 'queue' },
  { zh: '碰撞避免', en: 'collision avoidance' },

  // --- 2.4 efficiency, aggregation, multi-user, multi-link ---
  { zh: '聚合 MPDU', en: 'aggregate MPDU', abbr: 'A-MPDU' },
  { zh: '子帧', en: 'subframe' },
  { zh: '定界符', en: 'MPDU delimiter' },
  { zh: '块确认', en: 'block acknowledgement', abbr: 'BlockAck' },
  { zh: '位图', en: 'bitmap' },
  { zh: '传输机会', en: 'transmit opportunity', abbr: 'TXOP' },
  { zh: 'TXOP 上限', en: 'TXOP limit' },
  // 保护 (protection) is NOT a row: the course writes it as the ordinary verb
  // ("它保护的是什么", "光听信道保护不了一次交互"), so a substring rule reports four
  // sentences that are not naming a term at all. The three protection modes
  // below carry the §9.2.5.2 names, which is where the term is actually taught.

  { zh: '单次保护', en: 'single protection' },
  { zh: '边界保护', en: 'boundary protection' },
  { zh: '多重保护', en: 'multiple protection' },
  { en: 'contention-free end', abbr: 'CF-End' },
  { en: 'CTS to self', abbr: 'CTS-to-self' },
  { zh: '正交频分多址', en: 'orthogonal frequency-division multiple access', abbr: 'OFDMA' },
  { zh: '资源单元', en: 'resource unit', abbr: 'RU' },
  { zh: '多用户', en: 'multi-user', abbr: 'MU' },
  { zh: '多用户 PPDU', en: 'multi-user PPDU', abbr: 'MU PPDU' },
  { zh: '每用户分配表', en: 'per-user info field' },
  { zh: '上行', en: 'uplink', abbr: 'UL' },
  { zh: '下行', en: 'downlink', abbr: 'DL' },
  { zh: '触发帧', en: 'Trigger frame' },
  { zh: '基于触发的 PPDU', en: 'trigger-based PPDU', abbr: 'TB PPDU' },
  { zh: '多站点块确认', en: 'multi-STA BlockAck' },
  { zh: '多用户 MIMO', en: 'multi-user MIMO', abbr: 'MU-MIMO' },
  { zh: '链路', en: 'link' },
  { zh: '多链路操作', en: 'multi-link operation', abbr: 'MLO' },
  { zh: '多链路设备', en: 'multi-link device', abbr: 'MLD' },
  { zh: '序号', en: 'sequence number' },

  // --- 2.5 UWB / 802.15.4 and 802.15.4ab ---
  { zh: '超宽带', en: 'ultra-wideband', abbr: 'UWB' },
  { zh: '锚点', en: 'anchor' },
  { zh: '标签', en: 'tag', track: 'uwb' },
  { en: 'ranging marker', abbr: 'RMARKER' },
  { en: 'ranging counter time unit', abbr: 'RCTU' },
  { zh: '码片', en: 'chip' },
  { zh: '同步字段', en: 'SYNC field', abbr: 'SYNC' },
  { zh: '帧起始定界符', en: 'start-of-frame delimiter', abbr: 'SFD' },
  { zh: '加扰时间戳序列', en: 'scrambled timestamp sequence', abbr: 'STS' },
  { zh: '物理头', en: 'PHY header', abbr: 'PHR' },
  { en: 'PHY service data unit', abbr: 'PSDU' },
  { zh: '前导符号', en: 'preamble symbol' },
  { zh: '密钥', en: 'key' },
  { zh: '晶振', en: 'crystal', aka: ['晶体'] },
  { zh: '百万分之几', en: 'parts per million', abbr: 'ppm' },
  { zh: '时钟偏差', en: 'clock offset' },
  { zh: '单边双向测距', en: 'single-sided two-way ranging', abbr: 'SS-TWR' },
  { zh: '双边双向测距', en: 'double-sided two-way ranging', abbr: 'DS-TWR' },
  { zh: '测距测量信息', en: 'ranging measurement information', abbr: 'RMI' },
  { zh: '回复时延', en: 'reply time' },
  { zh: '测距块', en: 'ranging block' },
  { zh: '测距轮', en: 'ranging round' },
  { zh: '测距时隙', en: 'ranging slot' },
  { en: 'ranging slot time unit', abbr: 'RSTU' },
  { zh: '首径', en: 'first path' },
  { zh: '非视距', en: 'non-line-of-sight', abbr: 'NLOS' },
  { zh: '品质因数', en: 'figure of merit', abbr: 'FoM', aka: ['品质因子', '品质字节'] },
  { zh: '信干比', en: 'signal-to-interference ratio', abbr: 'SIR' },
  { zh: '重叠', en: 'overlap', track: 'uwb' },
  { zh: '应答窗口', en: 'response window' },
  { en: 'ranging contention phase structure IE', abbr: 'RCPS' },
  { en: 'ranging contention MAC attempts IE', abbr: 'RCMA' },
  { zh: '到达时间差', en: 'time difference of arrival', abbr: 'TDoA' },
  { zh: '下行形态', en: 'downlink TDoA', abbr: 'DL-TDoA' },
  { zh: '双曲线', en: 'hyperbola' },
  { zh: '时钟修正', en: 'clock correction' },
  { zh: '锚点基线', en: 'anchor baseline' },
  { zh: '参考锚点', en: 'reference anchor' },
  { zh: '闪发', en: 'blink' },
  { zh: '上行形态', en: 'uplink TDoA', abbr: 'UL-TDoA' },
  { zh: '同步误差', en: 'sync error' },
  { zh: '公共时基', en: 'common time base' },
  { zh: '到达角', en: 'angle of arrival', abbr: 'AoA' },
  { zh: '相位差', en: 'phase difference' },
  { zh: '视场', en: 'field of view' },
  { zh: '多毫秒', en: 'multi-millisecond', abbr: 'MMS' },
  { zh: '片段', en: 'fragment' },
  { zh: '测距序列片段', en: 'ranging sequence fragment', abbr: 'RSF' },
  { zh: '合成增益', en: 'combining gain' },
  { zh: '时钟比值', en: 'clock ratio' },
  { zh: '参数集', en: 'parameter set' },
  { zh: '窄带', en: 'narrowband', abbr: 'NB' },
  { zh: '先听后发', en: 'listen before talk', abbr: 'LBT' },
  { zh: '允许列表', en: 'allow list' },
  { zh: '跳变', en: 'channel hopping' },
  { zh: '能量检测门限', en: 'energy detection threshold' },
  { zh: '占空比', en: 'duty cycle' },
]

/**
 * The words the course writes in Chinese that are NOT official IEEE terms, and
 * which the rule must therefore never demand an English name for — section 2.6
 * of the inventory. They are here as data, with the reason each is excluded, so
 * that nobody adds one to {@link ZH_TERMS} in good faith: a rule that demands
 * `（margin）` after 余量 produces noise, and noise trains authors to ignore the
 * rule. A test asserts the two lists stay disjoint.
 *
 * Four classes, and the class is the reason:
 *  - **model choice** — the simulator's own quantity or counter, which `sources`
 *    already declares as a model choice;
 *  - **literature** — a name from a paper (Bianchi, Heusse, Kamerman), not from
 *    a standard;
 *  - **statistics / engineering** — ordinary measurement or RF vocabulary that
 *    IEEE 802.11 does not define;
 *  - **regulatory** — an ETSI or FCC figure, which is a limit, not a term.
 */
export const ZH_TERMS_EXCLUDED: readonly { zh: string; why: string }[] = [
  { zh: '速率余量', why: "model choice: the simulator's 3 dB, declared in `sources`" },
  { zh: '空口占比', why: "model choice: the simulator's own counter" },
  { zh: '性能异常', why: 'literature: Heusse et al., INFOCOM 2003' },
  { zh: '速率控制', why: 'model choice: the standard leaves rate selection to the implementer' },
  { zh: '自动速率回退', why: 'literature: Kamerman & Monteban 1997, not anything IEEE defines' },
  { zh: '上限', why: "model choice: the simulator's word for the highest rung a link carries" },
  { zh: '尝试', why: "model choice: the simulator's counting unit" },
  { zh: '跌落', why: "model choice: the simulator's word for an excursion" },
  { zh: '饱和', why: "literature: Bianchi's assumption" },
  { zh: '发送概率', why: "literature: Bianchi's unknown τ" },
  { zh: '碰撞概率', why: "literature: Bianchi's unknown p" },
  { zh: '捕获', why: 'engineering: receiver behaviour, "not standard-mandated" per `sources`' },
  { zh: '捕获效应', why: 'engineering: receiver behaviour, not a term any standard defines' },
  { zh: '残差', why: 'statistics: least-squares' },
  { zh: '估计量', why: 'statistics: measurement vocabulary' },
  { zh: '链路预算', why: 'engineering: RF, not 802.11' },
  { zh: '余量', why: 'model choice: three different simulator quantities under one word (inventory §3.10)' },
  { zh: '队头阻塞', why: 'engineering: computer science' },
  { zh: '突发', why: "model choice: the course's word for the frames of one TXOP" },
  { zh: '瓶颈', why: 'engineering: ordinary engineering vocabulary' },
  { zh: '空过', why: "model choice: the model's own feedback loop" },
  { zh: '中继攻击', why: 'literature: security, and already bracketed' },
  { zh: '三边定位', why: 'engineering: GNSS vocabulary; `sources` says the standard is silent' },
  { zh: '器件噪声系数', why: 'engineering: RF' },
  { zh: '占空比限值', why: 'regulatory: ETSI EN 303 687 / FCC −41.3 dBm/MHz, a limit rather than a term' },
]

/**
 * Phrases in which a term's characters spell an ordinary Chinese word instead
 * of the term, and which are therefore masked out before the search. Both so far are
 * uwb-capstone's: 偏差的符号 and 块的符号 are the SIGN of an error, not an OFDM
 * 符号 (symbol). Kept as a list rather than as a reworded lesson so that the rule
 * reports no site an author would have to "fix" by writing 符号（symbol） into a
 * sentence about plus and minus.
 */
const ZH_HOMONYMS: readonly string[] = [
  // 符号 is an OFDM/UWB symbol in this course, except where it is the SIGN of a
  // number; beside 反 it is always a sign that flipped.
  '偏差的符号', '块的符号', '核对符号', '符号相反', '符号反',
  // 队列 is the MAC queue, except in the simulator's own event queue.
  '事件队列',
]

const NUL = String.fromCharCode(0)
const blankOut = (n: number): string => NUL.repeat(n)

/** Every rendering the glossary knows about: the canonical names, the abbreviations, the `aka`. */
const termNames = (all: readonly ZhTerm[]): string[] =>
  [...new Set(all.flatMap((t) => [t.zh, t.abbr, ...(t.aka ?? [])]))].filter((s): s is string => Boolean(s))

/**
 * The same text with every bracketed span blanked to NULs of the same length,
 * so indices still line up. Used when looking for a BARE abbreviation: `DCF`
 * inside 分布式帧间间隔（DCF interframe space, DIFS）is a gloss, not a use, and
 * without this the gloss of one term reports the next term as unnamed.
 */
const maskBrackets = (text: string): string =>
  // Only a bracket that holds an English GLOSS — a lower-case word of three
  // letters or more — is masked. A bracket holding just an acronym, 一张短清单
  // （RCPS）, is the bare use this rule exists to report, and masking those too
  // hid RCPS and RCMA from the rule altogether.
  // A bracket holding a UI path — （检视器 → BSS 总览） — is masked too: that is a
  // label the reader copies off the screen, like the log names LOG_NAMES already
  // exempt, not a sentence naming a term.
  text.replace(/[（(][^）)]*[）)]/g, (m) => (/[a-z]{3,}|→/.test(m) ? blankOut(m.length) : m))

const hasCjk = (s: string): boolean => new RegExp(CJK.source).test(s)

/**
 * Where a name is first used, or -1. Two things make this different from a
 * naive `indexOf`:
 *
 *  - **no `\b`.** A word boundary between two ideographs matches nothing, so a
 *    CJK name is matched literally. `namedInPlace` documents the same trap; it
 *    is the mutation that made two earlier rules in this suite grade nothing.
 *  - **longer names first.** 符号 is inside 前导符号, 时隙 inside 测距时隙,
 *    `MPDU` inside `A-MPDU` and `PPDU` inside `MU PPDU`. Every glossary name
 *    strictly containing this one is blanked before the search, so the longer
 *    term's own correct use is never reported as the shorter term's bare one.
 */
function firstUseIndex(text: string, needle: string, all: readonly ZhTerm[]): number {
  // The excluded words mask too: 链路预算 is section 2.6's RF-engineering term
  // and contains 链路, so without it the rule demanded `（link）` inside a phrase
  // it is not allowed to touch at all.
  const longer = [...termNames(all), ...ZH_TERMS_EXCLUDED.map((x) => x.zh), ...ZH_HOMONYMS]
    .filter((n) => n.length > needle.length && n.includes(needle))
  let hay = text
  for (const n of longer) if (hay.includes(n)) hay = hay.split(n).join(blankOut(n.length))
  if (hasCjk(needle)) return hay.indexOf(needle)
  // A Latin abbreviation, case-sensitively and as a whole token. A hyphen is
  // allowed to touch it (`16-QAM`, `O-QPSK`) because the masking above is what
  // separates a compound acronym from its parts. Bracketed spans are blanked:
  // the `DCF` of another term's gloss is not a bare use of DCF.
  const m = new RegExp(`(?<![A-Za-z0-9_])${escapeRe(needle)}(?![A-Za-z0-9_])`).exec(maskBrackets(hay))
  return m ? m.index : -1
}

/** The bracket the rule wants to see: `（preamble）`, `（arbitration interframe space, AIFS）`. */
const wantedBracket = (t: ZhTerm): string => (t.abbr ? `（${t.en}, ${t.abbr}）` : `（${t.en}）`)

/**
 * Whether some bracket opening at, or within 40 characters after, the named
 * span carries the term's English name — and its abbreviation when it has one.
 *
 * An abbreviation ALONE satisfies it, when that is the whole bracket:
 * 确认帧（ACK）and 超宽带（UWB）are the shape the reader asked for, and the
 * inventory marks them done. 分发系统（分发系统，DS）is not: its bracket holds
 * Chinese, so it is neither the English name nor the bare abbreviation.
 */
function bracketCarriesEnglish(text: string, start: number, end: number, t: ZhTerm, needAbbr: boolean): boolean {
  for (const m of text.matchAll(/[（(]([^）)]{0,200})[）)]/g)) {
    const at = m.index ?? -1
    if (at < start || at > end + 40) continue
    const inside = m[1] ?? ''
    if (t.abbr && inside.trim() === t.abbr) return true
    if (inside.toLowerCase().includes(t.en.toLowerCase()) && (!needAbbr || inside.includes(t.abbr!))) return true
  }
  return false
}

/**
 * Why a term fails, or null when it passes or was not graded at all. The
 * message is the failure list the fix wave works down, so it names the term
 * and the bracket it is missing.
 *
 * Two arms, in the reader's order:
 *  - the Chinese name leads, and the bracket must follow it;
 *  - the bare abbreviation appears FIRST, which for a term that has a Chinese
 *    name means the name never led (kind (c) of the inventory), and for an
 *    acronym-only term means the expansion must be in the bracket.
 */
export function zhTermFailure(text: string, t: ZhTerm, all: readonly ZhTerm[] = ZH_TERMS): string | null {
  const zhAt = t.zh ? firstUseIndex(text, t.zh, all) : -1
  const abbrAt = t.abbr ? firstUseIndex(text, t.abbr, all) : -1
  if (zhAt >= 0 && (abbrAt < 0 || zhAt <= abbrAt)) {
    return bracketCarriesEnglish(text, zhAt, zhAt + t.zh!.length, t, Boolean(t.abbr))
      ? null
      : `${t.zh} first used without ${wantedBracket(t)}`
  }
  if (abbrAt >= 0) {
    if (t.zh) return `${t.abbr} used with no Chinese name leading, ${t.zh}${wantedBracket(t)}`
    // The acronym leads and the bracket holds the expansion — MSDU（MAC service
    // data unit） — so the bracket is not asked for the acronym as well.
    return bracketCarriesEnglish(text, abbrAt, abbrAt + t.abbr!.length, t, false)
      ? null
      : `${t.abbr} used without （${t.en}）`
  }
  return null
}

/**
 * Whether `text` carries `t`'s English at the FIRST occurrence of its Chinese
 * name (or, for an acronym-only term, of its acronym). Returns **null** when
 * neither appears, so the caller can count how many terms were actually graded
 * — the coverage floor of section 6.4, which is what turns a matcher that has
 * stopped matching from a silent pass into a loud failure.
 */
export function bracketedAtFirstZhUse(text: string, t: ZhTerm, all: readonly ZhTerm[] = ZH_TERMS): boolean | null {
  const graded = (t.zh ? firstUseIndex(text, t.zh, all) : -1) >= 0
    || (t.abbr ? firstUseIndex(text, t.abbr, all) : -1) >= 0
  if (!graded) return null
  return zhTermFailure(text, t, all) === null
}

/**
 * The alternative renderings of `t` that appear in `text`: section 3 of the
 * inventory as an assertion. 前导 is reported even though 前导码 contains it,
 * because every glossary name that CONTAINS the alternative — the canonical
 * name itself, 前导符号, 前导检测 — is masked out before the search.
 */
export function zhAkaViolations(text: string, t: ZhTerm, all: readonly ZhTerm[] = ZH_TERMS): string[] {
  return (t.aka ?? [])
    .filter((a) => firstUseIndex(text, a, all) >= 0)
    .map((a) => `${a} is an alternative rendering of ${t.zh}`)
}
