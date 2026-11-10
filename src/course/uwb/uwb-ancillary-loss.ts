/**
 * UWB Tier 5 · M24 测距辅助信息 · A lost frame is noticed WHEN the next frame arrives.
 *
 * The second half of `uwb-ancillary` (split 2026-10-11): what the Frames Remaining count in every
 * frame buys when one frame does not arrive. The scene is the first half's, value for value
 * (`sameSceneAs: 'uwb-ancillary'` in the shape suite).
 *
 * **Standard-first shape (2026-11-10).** ① is what §10.35 specifies about the count — what Frames
 * Remaining conveys, that the upper layer may use it for retransmissions, and that Figure 10-271 has
 * no total and no frame index — and the two other granularities of "not received" (§10.34 RMNR,
 * §10.36 MMRCM). ② says that how a receiver detects a gap, and what deadline it measures against,
 * are this simulator's choices; that nothing acts on a detected gap; and that a static scene in this
 * engine loses every frame or none, so the lost-frame figures come from a run that moves the sender
 * for one slot (tests/course/uwb-ancillary-loss.test.ts makes that run and compares each figure).
 */
import { J, txOf, type Lesson } from '../lessonKit'
import {
  FRAMES, MS, NS, SENDER_ID, SLOTS, TAG_ID, VALIDITY, WINDOW_ROUNDS_PER_BLOCK, ms, uwbAncillaryWindowScenario,
  uwbAncillaryOffScenario, uwbAncillaryScenario,
} from './uwb-ancillary'

const firstFragment = txOf((r) => r.frame.kind === 'uwbAncillary')
const lastFragment = txOf((r) =>
  r.frame.kind === 'uwbAncillary' && r.frame.uwb?.raict?.framesRemaining === 0)
const messageComplete = (r: { type: string }): boolean =>
  r.type === 'UWB_ANCILLARY' && (r as { complete?: boolean }).complete === true

/** The countdown of one whole message: FRAMES − 1 … 0. */
const COUNT = Array.from({ length: FRAMES }, (_v, i) => FRAMES - 1 - i)
/** The countdown with one reading removed, as the receiver sees it when that frame is lost. */
const without = (k: number): string => COUNT.filter((c) => c !== k).join('、')

/** Arrival of each frame of block 0 at the tag, in milliseconds as the log prints them (two decimals);
 * tests/course/uwb-ancillary-loss.test.ts compares these with the run. */
export const ARRIVALS_MS: readonly string[] = ['12.19', '14.19', '16.19', '18.19']
/** The end of block 0's ancillary round, in milliseconds. */
export const ROUND_END_MS = '20.00'

export const uwbAncillaryLoss: Lesson = {
  id: 'uwb-ancillary-loss',
  module: 24,
  title: '缺失的那一帧由下一帧发现',
  why: `RAICT 信息单元的剩余帧数（Frames Remaining）字段给出完成当前这条消息还剩几帧（§10.35.2.1），每一帧都带它。标准只定义了这个字段，并说明上层可以用它管理重传（retry）；接收端怎样据此发现缺帧、以什么时刻作为这条消息的截止时刻，标准都没有规定。本仿真器的接收端只把这一次读数与上一次相减，差值大于一时，中间缺少的那几个数就指出了没有到达的帧；截止时刻取辅助信息轮的末尾。于是丢失中间那一帧时，缺口在下一帧到达的同一时刻被发现，比截止时刻早 ${ms(NS.lead)} ms——两个时隙减去一帧的空口时间（airtime），与设备位置无关；丢失最后一帧时，倒数停在一，要到截止时刻才知道；丢失第一帧时，这个办法指不出缺帧，因为图 10-271 里既没有总帧数，也没有这一帧在消息里的序号（sequence number），消息读到零仍判定为收齐。标准里「没有收到」还有另外两种粒度：测距消息未收到（RMNR）是逐轮、由响应方在自己的时隙里发出的；多消息收妥确认是控制器请求、接收方回复的。剩余帧数不是报告，发现缺帧与收到下一帧是同一时刻。`,
  outcomes: [
    '说出标准对剩余帧数规定了什么、没有规定什么',
    '说明本仿真器的接收端在哪一时刻发现缺失的那一帧，比截止时刻早多少，以及丢失最后一帧、第一帧时为什么不同',
    '区分三种「没有收到」的粒度：逐轮、整个有效期窗口、一条消息之内',
  ],
  needs: ['uwb-ancillary'],
  terms: [
    { term: 'Frames Remaining', plain: 'RAICT 信息单元中的一个字节：完成这条消息还剩几帧，最后一帧为 0' },
    { term: 'RAICT IE (Ranging Ancillary Information Message Counter and Type IE)', plain: '每一帧都携带的信息单元，剩余帧数这个字节就包含在其中' },
  ],
  standard: [
    { heading: '剩余帧数给出什么（§10.35.2.1）', text: 'Request 置 0 时，剩余帧数字段告诉接收辅助信息的响应方：完成当前这条消息还剩几帧。按这一定义，一条消息的最后一帧写 0。' },
    { heading: '上层用它做什么（§10.35.1）', text: '上层可以用 RAICT 信息单元的字段把一条信息分装在多条消息里发送，并用它们管理重传；消息编号字段用来区分多条消息。接收端怎样发现缺帧、一条消息有没有截止时刻，标准没有规定。' },
    { heading: '没有总帧数，也没有帧序号（图 10-271）', text: 'RAICT 的内容字段只有 Request 位、消息编号存在位、可选的消息编号与可选的剩余帧数，既没有这条消息的总帧数，也没有这一帧在消息里的序号。正文提到 Request 置 0 时传递「当前数据帧（data frame）的序号」，但图 10-271 里没有这个字段。' },
    { kind: 'table', heading: '标准里三种「没有收到」', head: ['机制', '谁发出', '粒度', '回答的问题'], rows: [
      ['测距消息未收到（RMNR 信息单元，§10.34）', '没有收到起始消息的响应方，在自己的时隙里发出', '逐轮', '本轮的起始消息我没有收到'],
      ['多消息收妥确认（RMMRC 信息单元，§10.36）', '控制器用 ARC 信息单元的 MMRCR 字段请求，接收方回复', '整个有效期窗口', '你发出的那几条消息我收到了哪几条'],
      ['剩余帧数（RAICT 信息单元，§10.35）', '发送辅助信息的发起方在每一帧中都带', '一条消息之内', '这条消息还剩几帧'],
    ] },
    { heading: '第三种不是报告', text: '前两种是报告：一方汇总自己的接收情况，在专门的时隙里发回。剩余帧数不是：没有哪一方为它额外发送一帧，发起方只是在本来就要发送的每一帧里写入这个字段。' },
  ],
  implementation: [
    { topic: '接收端怎样发现缺帧', standard: '标准未规定', sim: '把这一次读到的剩余帧数与上一次相减：差为 1 表示没有丢帧；差大于 1 时，中间缺少的那几个数就是没有到达的帧，在这一次接收的同一时刻写一条记录。不用定时器，也不对照时隙表。', kind: 'choice' },
    { topic: '截止时刻', standard: '标准未规定', sim: '取辅助信息轮的末尾。到那时倒数还没有读到 0，就写一条不带时隙号的记录，列出没有收到的剩余帧数。', kind: 'choice' },
    { topic: '收齐的判据', standard: '剩余帧数为 0 表示这条消息已经发完（§10.35.2.1）', sim: '读到 0 即记为收齐；之前的每一条记录都标为未收齐。', kind: 'faithful' },
    { topic: '丢失第一帧', standard: '没有总帧数、没有帧序号（图 10-271）', sim: '第一次读数之前的缺口没有可以相减的对象，不写缺帧记录；读到 0 仍记为收齐。这是字段本身的性质。', kind: 'faithful' },
    { topic: '发现缺帧之后', standard: '上层可以用这些字段管理重传（§10.35.1）', sim: '未实现：没有补发，也不向发送方请求那一帧；缺帧记录只出现在日志里。', kind: 'absent' },
    { topic: '丢帧本身', standard: '标准不规定接收机的判决', sim: '本仿真器的接收判决只比较功率，没有逐帧的衰落起伏，所以静止的场景要么每一帧都收到，要么一帧也收不到；面板上的四个场景一帧也不丢。下面三种丢帧情形是在同一场景的一次运行中途，把发送方移开一个时隙的时间测得的。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '剩余帧数逐帧递减',
      jump: 2,
      steps: [
        '载入本课场景并播放，跳到接收端判定收齐的那条记录。',
        '向前逐条查看同一轮的辅助信息记录：剩余帧数、缺少的帧与是否收齐。',
      ],
      blocks: [
        { kind: 'table', heading: `块 0：${TAG_ID} 收到的 ${FRAMES} 帧`, head: ['到达时刻', '时隙', '剩余帧数', '缺少', '收齐'], rows: COUNT.map((c, i) => [
          `${ARRIVALS_MS[i]} ms`, String(SLOTS.firstSlot + i), String(c), '—', c === 0 ? '是' : '否',
        ]) },
      ],
      expect: `剩余帧数依次为 ${COUNT.join('、')}，每两帧相隔一个 ${MS.slot} ms 的时隙；写 0 的那一帧到达时记录标为收齐，之前三条都是未收齐。整块没有一次超时。`,
      meaning: '收齐的判据是读到 0，照标准的定义（①）；逐次相减是本仿真器接收端的方法（②），在这次运行里差值始终为 1，所以没有缺帧记录。',
    },
    {
      heading: '丢失一帧：三种结果',
      jump: 1,
      steps: [
        `面板上的场景不丢帧（②）；下表是在同一场景里，把 ${SENDER_ID} 移开一个时隙的时间测得的。`,
        `在本课场景里跳到剩余帧数为 0 的那一帧，读出它与前一帧的到达时刻，以及这一轮结束的时刻（${ROUND_END_MS} ms）。`,
      ],
      blocks: [
        { kind: 'steps', heading: '本仿真器的接收端怎样发现缺帧：逐步说明', items: [
          '收到一帧，从它的 RAICT 信息单元读出剩余帧数。',
          '与这条消息上一次读到的数相减。差为 1，中间没有丢帧；差大于 1，中间缺少的那几个数就是没有到达的帧，在这一次接收的同一时刻写一条记录。',
          '读到 0 即记为收齐。',
          '到辅助信息轮结束时还没有读到 0，就写一条不带时隙号的记录，列出没有收到的剩余帧数。',
        ] },
        { kind: 'formula', heading: '提前量', text: `提前量 = 2 × ${MS.slot} ms − ${ms(NS.frame)} ms（一帧的空口时间）= ${ms(NS.lead)} ms`, note: '丢失中间那一帧时，发现缺口的那一帧之后这条消息还剩两个时隙；式子里没有任何设备的位置。' },
        { kind: 'table', heading: '丢失哪一帧，何时发现', head: ['丢失的帧', '接收端读到的剩余帧数', '何时发现', '比截止时刻早'], rows: [
          [`中间一帧（本应写 ${FRAMES - 2}）`, without(FRAMES - 2), `第 ${SLOTS.firstSlot + 2} 个时隙那一帧到达的同一时刻，记录「缺少 ${FRAMES - 2}」`, `${ms(NS.lead)} ms`],
          ['最后一帧（本应写 0）', without(0), '辅助信息轮结束时，记录「缺少 0」', '0'],
          [`第一帧（本应写 ${FRAMES - 1}）`, without(FRAMES - 1), '不发现；读到 0 仍判定为收齐', '—'],
        ] },
      ],
      expect: `丢失中间那一帧时，缺口在第 ${SLOTS.firstSlot + 2} 个时隙那一帧到达的同一纳秒被记录，比这一轮结束早 ${ms(NS.lead)} ms，与上面的式子在两位小数上一致；丢失最后一帧时，要到这一轮结束才有记录；丢失第一帧时，没有任何记录指出缺帧。三种情形都没有超时。`,
      meaning: '字段只给剩余帧数，没有总帧数和帧序号（①），所以第一帧的丢失指不出来；发现的方法和截止时刻是本仿真器的取法（②）。',
    },
    {
      heading: '这一轮没有消息，不等于消息未收齐',
      variant: 1,
      steps: [
        `载入「一条控制消息管 ${VALIDITY} 轮」变体，逐轮查看辅助信息记录（每块 ${WINDOW_ROUNDS_PER_BLOCK} 轮）。`,
      ],
      expect: `每块的第 0 到第 ${VALIDITY - 1} 轮是测距轮（ranging round），没有一帧辅助信息，也没有一条未收齐的记录；第 ${VALIDITY} 轮是辅助信息轮，有 ${FRAMES} 条记录，剩余帧数从 ${FRAMES - 1} 递减到 0。`,
      meaning: '接收端只在收到辅助信息帧时才读剩余帧数（②）；一轮里没有消息，与一条消息没有收齐是两回事。',
    },
    {
      heading: '测距结果不受影响',
      more: [2],
      steps: [
        '依次载入本课场景与「关闭辅助信息交换」，比较两次运行的测距记录。',
      ],
      expect: `两次运行各有 28 条测距记录，距离、块号与时刻逐条相同；关闭之后没有辅助信息轮，标签（tag）每块只用 ${SLOTS.ranging} 个时隙。`,
      meaning: `辅助信息帧在单独的辅助信息轮里，不带任何时间量，不进入测距的算式（②）；这条消息由 ${SENDER_ID} 发出，与它在测距轮里的应答无关。`,
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.35.2.1 与图 10-271（RAICT 信息单元：剩余帧数的含义；没有总帧数与帧序号字段；正文提到的帧序号与消息类型在图里没有对应字段）、§10.35.1（上层用这些字段分帧发送与管理重传）、§10.34.1（RMNR 信息单元）、§10.36.1（多消息收妥确认，ARC 信息单元的 MMRCR 字段）。本课不依赖任何草案。',
    `本仿真器的取值与取法：接收端逐次相减发现缺帧；截止时刻取辅助信息轮的末尾；发现缺帧之后不采取任何动作；接收判决只比较功率。场景与 @uwb-ancillary 完全相同。${MS.slot} ms 的测距时隙与 ${MS.block} ms 的测距块是本仿真器的缺省值。丢帧的三种结果在同一场景的运行中途把发送方移开一个时隙测得，不在面板的四个场景里。`,
  ],
  limits: [],
  scenario: () => uwbAncillaryScenario(),
  variants: [
    { label: `竞争式排程：窗口宽 ${SLOTS.contendWindow} 个时隙，起点抽出来`, scenario: () => uwbAncillaryScenario({ schedule: 'contention' }) },
    { label: `一条控制消息管 ${VALIDITY} 轮：辅助信息另有一轮`, scenario: () => uwbAncillaryWindowScenario() },
    { label: '关闭辅助信息交换', scenario: () => uwbAncillaryOffScenario() },
  ],
  jumps: [
    J(`第一帧辅助信息：剩余帧数 ${FRAMES - 1}`, firstFragment),
    J('写入 0 的那一帧：这条消息的最后一帧', lastFragment),
    J('接收端判定收齐的那条记录', messageComplete),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '本仿真器的接收端为什么不用超时就能发现缺失的中间那一帧？',
      options: [
        '它为每一帧都设了一个定时器',
        '每一帧都带剩余帧数，它把这一次读数与上一次相减，跳过的数就是没有到达的帧——判断在收到下一帧的同一时刻完成',
        '发送方在最后一帧里报告一共发了几帧',
      ],
      answer: 1,
      explain: `逐次相减是本仿真器的取法，标准没有规定发现方法。测得的发现时刻比截止时刻早 ${ms(NS.lead)} ms。`,
    },
    {
      q: '丢失的是写 0 的最后一帧，接收端何时知道？',
      options: [
        '与丢失中间那一帧时一样快',
        '到截止时刻才知道：后面没有下一帧，没有哪一次接收能发现这个缺口',
        '永远不会知道',
      ],
      answer: 1,
      explain: `倒数停在 1 之后就没有下一次读数了。本仿真器的截止时刻是辅助信息轮的末尾，比丢失中间那一帧时晚 ${ms(NS.lead)} ms 发现。`,
    },
    {
      q: '丢失的是第一帧时，为什么指不出缺的是哪一帧？',
      options: [
        '因为第一帧里不带剩余帧数',
        '因为图 10-271 里既没有总帧数也没有帧序号，第一次读数之前的缺口没有可以相减的对象',
        '因为第一帧丢失后整条消息都被丢弃',
      ],
      answer: 1,
      explain: '这是字段本身的性质。消息读到 0 仍判定为收齐。',
    },
  ],
}

/** Re-exported so the lesson's own test file can name the sender without reaching past this half. */
export { SENDER_ID }
