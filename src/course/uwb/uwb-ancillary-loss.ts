/**
 * UWB Tier 2 · M24 测距辅助信息 · A lost frame is noticed WHEN the next frame arrives.
 *
 * The second half of `uwb-ancillary`, split out 2026-10-11 under
 * `docs/superpowers/specs/2026-10-11-no-room-design.md` §2.1 and §5. The first half is about how
 * one message is CARRIED — segmented across frames, how long a frame is, and the role inversion
 * §10.35.1 defines. This half is about what happens when one of those frames does not arrive, and
 * it is a separate topic by the only test that matters: its three `numbers` contrasts (a middle
 * frame, the last frame, the first frame) are a self-contained comparison that reads without a
 * single figure from the other half, and the other half answers its own two outcomes without a
 * sentence from this one.
 *
 * **The one sentence this lesson exists for is about WHEN, not about what.** A lost frame is
 * noticed *when the next frame arrives*, not inferred from a timeout, because Frames Remaining
 * counts down in **every** frame: a receiver that reads 3 and then 1 knows the frame that would
 * have said 2 never came. Measured on this lesson's own scene
 * (tests/course/uwb-ancillary-loss.test.ts, which moves the sender for the span of one slot the
 * way tests/uwb/ancillary-round.test.ts does): `missing: [2]` at `t = 14 183 291`, the same
 * nanosecond as the receiver's own `RX_OK` for the next frame, against the message's own deadline
 * at `t = 18 000 000` — **3.82 ms early**.
 *
 * **The contrast is what makes it a claim about timing**, and the lesson carries it: lose the LAST
 * frame and there is no next one, so the countdown stops and the only record comes from the
 * deadline — the same loss, 3.82 ms later. **And the limit the mechanism itself has**: lose the
 * FIRST frame and it names nothing at all, because the RAICT IE carries no total and no frame
 * index. That is a property of §10.35.2.1, not a shortcoming of this engine.
 *
 * **Three granularities of "something was lost"**, which a reader will otherwise merge into one
 * (design §4.3). RMNR (§10.34) is sent by the responder unprompted, per round. The receipt bitmap
 * (§10.36) is requested by the controller, per validity window. Frames Remaining (§10.35) is
 * **not a report at all** — the sender states the count in every frame, so the receiver waits for
 * nothing. The third row is the new one and the difference is its point.
 *
 * **The scene is the first half's, value for value** (`sameSceneAs: 'uwb-ancillary'` in the shape
 * suite), so the recorded timeline hashes of this id are a copy of that one's and the split costs
 * the reader no new fixture run. The lost-frame measurement is **not** one of those scenes and
 * `limits` says so: this engine's reception is a deterministic power comparison, so a static scene
 * loses every frame or none.
 *
 * Every number is computed, never typed: `MS`, `NS`, `SLOTS` and `ms` are the first half's own
 * exports, each of them a call to `uwb/phy.ts` or `uwb/session.ts`, and
 * tests/course/uwb-ancillary-loss.test.ts re-measures each figure against whole blocks.
 *
 * `npx tsx scripts/lesson-dump.ts uwb-ancillary-loss` prints it with its length. Measure the same
 * way before adding a sentence, by IMPORTING `CHARS_PER_MINUTE`/`OBSERVE_MINUTES`/`TRY_MINUTES`
 * from `curriculum.ts` rather than retyping them.
 */
import { J, txOf, type Lesson } from '../lessonKit'
import {
  FRAMES, MS, NS, SENDER_ID, SLOTS, VALIDITY, WINDOW_BLOCKS, ms,
  uwbAncillaryOffScenario, uwbAncillaryScenario,
} from './uwb-ancillary'

/** The first frame of the message: Frames Remaining `FRAMES − 1`, in the first appended slot. */
const firstFragment = txOf((r) => r.frame.kind === 'uwbAncillary')
/** The frame that says zero: the last one, after which the receiver has the whole message. */
const lastFragment = txOf((r) =>
  r.frame.kind === 'uwbAncillary' && r.frame.uwb?.raict?.framesRemaining === 0)
/** The record the receiver writes when the countdown reaches zero: the message, complete. */
const messageComplete = (r: { type: string }): boolean =>
  r.type === 'UWB_ANCILLARY' && (r as { complete?: boolean }).complete === true

export const uwbAncillaryLoss: Lesson = {
  id: 'uwb-ancillary-loss',
  module: 24,
  title: '缺失的那一帧由下一帧发现',
  why: '上一课把一条辅助信息分装成几帧，而每一帧都写明这条消息还剩几帧。这种做法带来的是一个时刻，而不是一个数——接收端读到的数从 3 跳到 1，它立即就知道本应写入 2 的那一帧没有到达，不必等待任何超时。标准只定义了这个字段，并说明上层可以用它安排补发；接收端具体怎样用它发现缺帧，标准没有规定。本课的接收端采用最直接的做法（本课的假设）：不设定时器，也不与时隙表对照，只把这一次读数与上一次相减，差值大于一时，中间缺少的那几个数就指明了未到达的是哪几帧。丢失中间那一帧时，缺口在下一帧到达的那一次接收中就被识别出来，比这条消息的截止时刻（本课把它定为这条消息所在那一轮的末尾）提前将近两个时隙；这个提前量只由时隙长度和帧长算出，与设备的位置无关。丢失写入零的最后一帧时，倒数停在一，此后再没有读数，接收端只能等到截止时刻才知道，同样一次丢失，发现时间推迟了同样的时长。丢失第一帧时，这个办法无法指出缺的是哪一帧：这个信息单元里没有总帧数字段，也没有标明这是第几帧的字段，第一次读数之前的缺口没有可以相减的对象，而这条消息仍然被判定为收齐，因为按字段的定义，读到零就表示这条消息已经发完。测距结果在打开这个交换前后完全相同。最后，「丢失」在标准中有三种粒度：测距消息未收到是逐轮、由响应方自行发出的报告，收妥位图（bitmap）是控制器在控制消息里请求、覆盖整个有效期窗口的报告，剩余帧数则根本不是报告，而是发送端在每一帧中额外写入的一个字节，所以发现缺帧与收到下一帧是同一个时刻。',
  outcomes: [
    '说明缺失的那一帧在哪一时刻被发现，以及这一时刻比这条消息的截止时刻提前多少',
    '区分三种「丢失」的粒度：逐轮、整个有效期窗口、一条消息之内',
  ],
  needs: ['uwb-ancillary'],
  terms: [
    { term: 'Frames Remaining', plain: 'RAICT 信息单元中的一个字节：这条消息还剩几帧未发送，最后一帧写入 0' },
    { term: 'RAICT IE (Ranging Ancillary Information Message Counter and Type IE)', plain: '每一帧都携带的信息单元，剩余帧数这个字节就包含在其中' },
  ],
  picture: [
    {
      heading: '缺失的那一帧由下一帧发现',
      text: '剩余帧数在每一帧中都写入一次，所以它既说明这一帧的位置，也说明后面还有多少帧。标准定义的只是这个字段：它告诉接收方还剩几帧才能完成这条消息，上层可以用它来安排补发。至于接收端如何据此发现缺口，标准没有规定。本课的接收端不需要定时器，也不需要与时隙表对照——它识别一个缺口，只需把这一次读到的数与上一次相减。',
    },
    {
      kind: 'steps', heading: '本课的接收端识别缺口的步骤（本课的做法，标准没有规定这套步骤）',
      items: [
        '收到一帧，从它的信息单元里读出剩余帧数。',
        '与上一次读到的数相减。差为 1，说明中间没有丢帧；差大于 1，中间缺少的那几个数就指明了未到达的是哪几帧。',
        '这个判断就在这一次接收里完成，不需要定时器，也不需要和时隙表对照。',
        '读到 0 即为收齐（按字段的定义，0 表示这条消息已经发完）。而倒数停在 1、此后又没有下一帧时，这一步永远不会发生。',
      ],
    },
    {
      kind: 'watch', jump: 0,
      heading: '在仿真中逐帧查看这一列数',
      text: `载入仿真并播放，跳到第一帧辅助信息，再逐帧点开信息单元那一列：剩余帧数依次为 ${FRAMES - 1}、${FRAMES - 2}、1、0。整块中没有发生一次超时，所以这一列就是接收端判断是否缺帧的全部依据。写入 0 的那一帧到达之后，这条消息才记为收齐。`,
    },
    {
      kind: 'table', heading: '三种「丢失」，粒度各不相同',
      head: ['类型', '发出方', '粒度', '回答的问题'],
      rows: [
        ['测距消息未收到交互（§10.34）', '由响应方自行决定发送', '逐轮', '本轮的启动消息我没收到'],
        ['收妥位图（bitmap，§10.36）', '控制器在控制消息里请求，接收方回复', '整个有效期窗口', '你发出的那几条消息我收到了哪几条'],
        ['剩余帧数（§10.35）', '发送端在每一帧中都携带', '一条消息之内', '这条消息还有几帧未到达'],
      ],
    },
    {
      heading: '第三行不是一种报告',
      text: '前两行都是报告：一方汇总自己的接收情况，在专门的时隙中发回，所以另一方要等到那个时隙。第三行不是——没有哪一方为它额外发送一帧，发送端只是在本来就要发送的每一帧中多写入一个字节。于是接收端不必等待任何约定的时刻，发现缺帧与收到那一帧发生在同一时刻。三者放在一起，「丢失」在标准中就有了三个层次，而不是同一件事的三种说法。',
    },
  ],
  numbers: [
    {
      heading: '先给出用于对照的时间基准',
      text: `一个测距时隙（ranging slot）${MS.slot} ms，一个测距块（ranging block）${MS.block} ms。测距那一轮占 ${SLOTS.ranging} 个时隙，这条消息再占 ${SLOTS.window} 个（把消息的时隙接在测距时隙之后是本课的排法；标准只说辅助信息在一轮测距之中、占用其中的测距时隙交换），于是包含这个交换的块是 ${SLOTS.block} 个时隙、${SLOTS.block * MS.slot} ms。标准没有为这条消息规定截止时刻；本课把它定为这条消息所在那一轮的末尾——下文中每一个「提前多少」「推迟多少」，都是相对这一时刻而言。`,
    },
    {
      kind: 'table', heading: `丢失中间那一帧：三个时刻`,
      head: ['时刻', '事件'],
      rows: [
        [`第 ${SLOTS.ranging + 1} 个时隙`, `本应写入 ${FRAMES - 2} 的那一帧已发出，但接收端没有收到`],
        [`第 ${SLOTS.ranging + 2} 个时隙的那一次接收`, `记录中写入「缺少 ${FRAMES - 2} 号」——恰好发生在这一次接收中`],
        ['这一轮的末尾', `这条消息的截止时刻，比上面那一刻晚 ${ms(NS.lead)} ms`],
      ],
    },
    {
      heading: `提前 ${ms(NS.lead)} ms，而且这个数可以计算出来`,
      text: `这条消息还剩两个时隙，也就是 ${2 * MS.slot} ms，减去发现缺口的那一帧本身占用的 ${ms(NS.frame)} ms 空口时间（airtime），就是 ${ms(NS.lead)} ms。式子里没有任何一台设备的位置，所以这个提前量是时隙长度和帧长的性质，不是这个大厅的性质。而它的对照对象是接收端掌握的唯一另一个时间基准：这条消息的截止时刻——如果没有剩余帧数这个字段，接收端就只能等到那一时刻。`,
    },
    {
      heading: '丢失最后一帧时，只能依靠截止时刻',
      text: `同一条消息，这次丢失写入 0 的那一帧：倒数停在 1，而此后没有下一帧，所以没有任何一次接收能发现这次丢失。接收端要到截止时刻才知道缺了一帧，而这个结论并非来自任何一次接收。同样一次丢失，要晚 ${ms(NS.lead)} ms 才被发现。有了这个对照，上面那一条才成为一个关于时刻的结论。`,
    },
    {
      heading: '丢失第一帧时，无法指出缺的是哪一帧',
      text: `还有一种情形，这个办法完全无法发现：丢失的是第一帧。接收端第一次读到的是 ${FRAMES - 2}，而它没有可以相减的上一次读数，也就无从知道 ${FRAMES - 1} 曾经发出过。原因在于字段本身：按 §10.35.2.1 给出的内容字段格式，RAICT 信息单元里只有请求位、一个可选的消息编号和剩余帧数，既没有总帧数，也没有这一帧在消息里的序数。所以它能指出两次读数之间的缺口，却无法指出第一次读数之前的缺口——而这条消息仍然会被判定为收齐，因为收齐的判据是读到 0。这是 §10.35.2.1 这个字段的性质，而不是本课遗漏了什么。`,
    },
    {
      heading: '测距结果没有任何变化',
      text: `打开这个交换前后，测距结果完全相同——距离、块号、时刻，没有一个数值改变。原因是辅助信息那几帧不带任何时间量：接收端不为它记时间戳，它也就不进测距的任何一个算式；增加的时隙排在一轮之后，不插入轮中。`,
    },
  ],
  deeper: [
    {
      heading: '那次丢帧是如何测量的',
      text: '本课给出的那两个时刻并非来自本课的四个场景，原因在模型上：本课的收发判决只比较功率，没有逐帧的衰落起伏（真实信道有），所以同一个静止场景里要么每一帧都收到、要么一帧也收不到——在静止场景中无法复现「只丢中间那一帧」。那次测量的做法是：在一次运行中途把发送端移开，持续一个时隙的时间。辅助信息帧排在一轮的末尾、测距相位之后，所以这次移动不会影响任何一帧测距帧——这样「只有这一帧丢失」才是确定的事实，而不是一种期望。而课文那个提前量是由时隙长度和帧长直接算出来的，与那次运行只差一次飞行时间（本课大厅里是 22 ns），两者在毫秒的两位小数上一致。',
    },
  ],
  limits: [
    {
      kind: 'unmodelled',
      text: '本仿真器无法构造出「只丢一帧」的场景。收发判决只比较功率，没有真实信道里逐帧的起伏，所以同一个静止的大厅里要么每一帧都收到、要么一帧也收不到；本课那三种结果是在一次运行中途把发送端移开一个时隙的时间测得的。后果是读者无法在面板上观察到丢帧，面板上运行的四个场景一帧也不丢，三种丢帧情形的对照只能依靠课文、那个算式和那次测量。',
    },
    {
      kind: 'unmodelled',
      text: '接收端记录那个缺口之后不采取任何动作。条款没有规定收到这条记录的一方该如何处置，而本仿真器也没有建任何处置：没有补发、没有向发送端请求那一帧，也没有上层接收这条记录，它只出现在日志中。后果是本课能回答「何时知道」，却回答不了「知道之后如何处理」——而在真实系统中这两件事密不可分。',
    },
  ],
  sources: [
    `IEEE Std 802.15.4-2024 §10.35.2.1 连同 Figure 10-271 给出 RAICT 信息单元的内容字段，本课用到的是其中的 Frames Remaining：它只报还剩几帧，既不带总帧数，也不带这一帧的序数，所以「丢失第一帧时无法指出缺的是哪一帧」是这个字段的性质，不是本课的取舍。课文那张三行的表里，另外两行是 §10.34 的测距消息未收到交互与 §10.36 的多消息收妥确认；「整个有效期窗口」那一格的依据是 §10.32.9.1 的 ARC 信息单元里那个有效轮次字段。本课完全不依赖任何草案。`,
    `本课的场景与上一课完全相同（同一个 22 × 8 m 大厅、同样的器材与种子、同样三个变体），所以两课在面板上运行出的是同一条时间线。${MS.slot} ms 的测距时隙与 ${MS.block} ms 的测距块来自 FiRa 的缺省配置，不是标准正文；帧长、空口时间与时隙数沿用上一课的取值。「丢失一帧」那次测量不在这四个场景中，方法见上面那一节。`,
  ],
  scenario: () => uwbAncillaryScenario(),
  variants: [
    { label: `竞争式排程：窗口宽 ${SLOTS.contendWindow} 个时隙，起点抽出来`, scenario: () => uwbAncillaryScenario({ schedule: 'contention' }) },
    { label: `一条控制消息管 ${VALIDITY} 个块：只有窗口的头一块发`, scenario: () => uwbAncillaryScenario({ rcmValidityRounds: VALIDITY }) },
    { label: '关闭辅助信息交换', scenario: () => uwbAncillaryOffScenario() },
  ],
  jumps: [
    J(`第一帧辅助信息：剩余帧数 ${FRAMES - 1}`, firstFragment),
    J('写入 0 的那一帧：这条消息的最后一帧', lastFragment),
    J('接收端判定收齐的那条记录', messageComplete),
  ],
  observe: [
    `四帧的剩余帧数依次是 ${FRAMES - 1}、${FRAMES - 2}、1、0。写入 0 的那一帧到达之后，接收端将这条消息记为收齐；在此之前每一条记录都标为「未收齐」。而整块中没有发生一次超时——是否缺帧不通过超时判断。`,
  ],
  tryThis: [
    `载入「一条控制消息管 ${VALIDITY} 个块」变体，逐块查看辅助信息帧：第 ${WINDOW_BLOCKS[0]} 块有 ${FRAMES} 帧、剩余帧数从 ${FRAMES - 1} 递减到 0，第 1、2、3 块一帧也没有，到第 ${WINDOW_BLOCKS[1]} 块又有 ${FRAMES} 帧。要关注的是第 1 块：那里不但没有帧，接收端连一条「未收齐」的记录也没有——「这一块没有消息」和「这一块的消息未收齐」是两件事，而只有后者才是本课所说的丢失。`,
  ],
  quiz: [
    {
      q: '为什么说缺失的那一帧不是靠超时推断出来的？',
      options: [
        '因为接收端为每一帧都设了一个定时器，哪个定时器超时就说明哪一帧缺失',
        '因为剩余帧数在每一帧中都写入一次，所以读到的数跳过了几个，跳过的就是未到达的那几帧——这个判断在收到下一帧的同一时刻就完成了',
        '因为发送端在最后一帧中报告总共发送了几帧，接收端用它减去自己收到的帧数',
      ],
      answer: 1,
      explain: `接收端不需要定时器，它只是把这一次读到的数与上一次相减。在本课那次测量中，这一时刻比截止时刻提前 ${ms(NS.lead)} ms。`,
    },
    {
      q: '丢失的是写入 0 的那一帧，接收端何时知道？',
      options: [
        '与丢失中间那一帧时一样快，因为倒数本来就是逐帧进行的',
        '到这条消息的截止时刻才知道：后面没有下一帧，没有任何一次接收能发现这个缺口',
        '永远不会知道，因为写入 0 的那一帧才是收齐的判据',
      ],
      answer: 1,
      explain: `倒数停在 1 之后就没有下一次读数了，所以这次缺失只能在截止时刻才被发现，比丢失中间那一帧时晚 ${ms(NS.lead)} ms。`,
    },
    {
      q: '丢失的是第一帧时，这个办法为什么无法指出缺的是哪一帧？',
      options: [
        '因为第一帧中不含剩余帧数字段，对应的存在位置 0',
        '因为 RAICT 里只有剩余帧数可用来判断缺帧，既没有总帧数也没有这一帧的序数，所以第一次读数之前的缺口没有可以相减的对象',
        '因为第一帧丢失之后整条消息都会被丢弃',
      ],
      answer: 1,
      explain: '它能指出两次读数之间的缺口，却无法指出第一次读数之前的缺口。而这条消息仍然会被判定为收齐，因为收齐的判据是读到 0。',
    },
  ],
}

/** Re-exported so the lesson's own test file can name the sender without reaching past this half. */
export { SENDER_ID }
