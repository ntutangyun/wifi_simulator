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
  title: '缺的那一帧是被下一帧发现的',
  why: '上一课把一条辅助信息分装进了几帧，而每一帧都写着这条消息还剩几帧。这一课只问：这个写法换来了什么。答案是一个时刻，不是一个数——接收端读到的数从 3 跳到 1，它当场就知道本该写 2 的那一帧没有来，不必等任何超时。而这件事要量出来才算说清，所以本课把同一条消息丢掉中间那一帧、丢掉最后一帧、丢掉第一帧各算一遍：三种丢法，三个不同的结局，其中一种这个办法连名字都说不出。最后再把「丢了」这个词拆开——标准里它有三个粒度。',
  outcomes: [
    '说出缺的那一帧是在哪一刻被发现的，以及它比这条消息的截止时刻早多少',
    '分开三种「丢了」的粒度：逐轮、整个有效期窗口、一条消息之内',
  ],
  needs: ['uwb-ancillary'],
  terms: [
    { term: 'Frames Remaining', plain: '那个信息单元里的一个字节：这条消息还剩几帧没发，最后一帧写 0' },
    { term: 'RAICT IE (Ranging Ancillary Information Message Counter and Type IE)', plain: '每一帧都带的那个信息单元，剩余帧数这个字节就在它里面' },
  ],
  picture: [
    {
      heading: '缺的那一帧是被下一帧发现的',
      text: '剩余帧数在每一帧里都写一遍，所以它既说明这一帧排在哪里，也说明后面还有多少。接收端手里没有定时器，也没有和时隙表对照过——它认出一个缺口，只靠把这一次读到的数和上一次相减。',
    },
    {
      kind: 'steps', heading: '接收端认出一个缺口的那几步',
      items: [
        '收到一帧，从它的信息单元里读出剩余帧数。',
        '和上一次读到的数相减。差是 1，中间没有丢；差超过 1，中间那几个数就是没来的那几帧的名字。',
        '把这个判断写进记录——就在这一次接收里完成，不启定时器，也不和时隙表对照。',
        '读到 0 就是收齐。而倒数停在 1、后面又没有下一帧时，这一步永远不会发生。',
      ],
    },
    {
      kind: 'watch', jump: 0,
      heading: '那一列数，在仿真里读一遍',
      text: `载入仿真并播放，跳到第一帧辅助信息，再逐帧点开信息单元那一列：剩余帧数依次写着 ${FRAMES - 1}、${FRAMES - 2}、1、0。整块里一次超时也没有，所以这一列就是接收端判断缺不缺帧的全部依据。写 0 的那一帧到达之后，这条消息才记为收齐。`,
    },
    {
      kind: 'table', heading: '三种「丢了」，粒度各不相同',
      head: ['哪一种', '谁发出', '粒度', '回答的问题'],
      rows: [
        ['测距消息未收到交互（§10.34）', '响应方自己决定发', '逐轮', '本轮的启动消息我没收到'],
        ['收妥位图（bitmap，§10.36）', '发起方在控制消息里请求', '整个有效期窗口', '你那几条开场消息我收到了哪几条'],
        ['剩余帧数（§10.35）', '发送端在每一帧里都带着', '一条消息之内', '这条消息还有几帧没来'],
      ],
    },
    {
      heading: '第三行不是一次回报',
      text: '前两行都是回报：一方把自己的经历整理好，在一个约定的时隙里发回去，所以另一方要等到那个时隙。第三行不是——没有谁为它多发一帧，发送端只是在本来就要发的每一帧里多写一个字节。于是接收端不必等任何约定的时刻，缺帧这件事和收到那一帧是同一个时刻的事。三者放在一起，「丢了」在标准里就有了三个层次，而不是同一件事的三种说法。',
    },
  ],
  numbers: [
    {
      heading: '先把那把对照的尺子摆出来',
      text: `一个测距时隙（ranging slot）${MS.slot} ms，一个测距块（ranging block）${MS.block} ms。测距那一轮 ${SLOTS.ranging} 个时隙，这条消息再占 ${SLOTS.window} 个，于是带着这个交换的块是 ${SLOTS.block} 个时隙、${SLOTS.block * MS.slot} ms。这条消息的截止时刻就是它那一轮的末尾——下面每一个「早多少」「晚多少」，比的都是这一刻。`,
    },
    {
      kind: 'table', heading: `丢掉中间那一帧：三个时刻`,
      head: ['哪一刻', '发生了什么'],
      rows: [
        [`第 ${SLOTS.ranging + 1} 个时隙`, `本该写 ${FRAMES - 2} 的那一帧发了出去，而接收端没有收到`],
        [`第 ${SLOTS.ranging + 2} 个时隙的那一次接收`, `记录里写下「缺的是 ${FRAMES - 2} 号」——就在这一次接收里，不早不晚`],
        ['这一轮的末尾', `这条消息的截止时刻，比上面那一刻晚 ${ms(NS.lead)} ms`],
      ],
    },
    {
      heading: `早 ${ms(NS.lead)} ms，而这个数是算得出来的`,
      text: `这条消息还剩两个时隙要走，也就是 ${2 * MS.slot} ms，减去发现它的那一帧自己在空口时间（airtime）上花掉的 ${ms(NS.frame)} ms，就是 ${ms(NS.lead)} ms。式子里没有任何一台设备的位置，所以这个提前量是时隙长度和帧长的性质，不是这个大厅的性质。而它的对照物是接收端手里唯一的另一把尺子：这条消息的截止时刻——没有剩余帧数这个字段，接收端就只能等到那一刻。`,
    },
    {
      heading: '丢掉最后一帧，这个办法就只剩那把尺子',
      text: `同一条消息，这次丢掉写 0 的那一帧：倒数停在 1，而后面没有下一帧了，所以没有任何一次接收能发现它。接收端这一侧唯一的记录出现在截止时刻，而且那条记录里没有时隙号——它不是一次接收。同一次丢失，晚了 ${ms(NS.lead)} ms 才知道。有了这个对照，上面那一条才是一个关于时刻的主张。`,
    },
    {
      heading: '丢掉第一帧，它连名字都说不出',
      text: `还有一种情形这个办法什么也说不出：丢掉的是第一帧。接收端第一次读到的是 ${FRAMES - 2}，而它手里没有可以相减的上一次读数，也就无从知道 ${FRAMES - 1} 曾经发出过。原因在字段本身：RAICT 只报还剩几帧，既不带总帧数，也不带这一帧的序数。所以它点得出两次读数之间的缺口，点不出第一次读数之前的缺口——而这条消息照旧会被判为收齐，因为收齐的判据是读到 0。这是 §10.35.2.1 这个字段的性质，不是本仿真器少建了什么。`,
    },
    {
      heading: '测距结果一个数也没动',
      text: `打开这个交换前后，测距结果逐字段相同——距离、块号、时刻，一个数都没变。原因是辅助信息那几帧不带任何时间量：接收端不为它记时间戳，也就不为它抽一次时间戳噪声，测距那一轮走的随机数流一点没动；多出来的时隙排在一轮之后，不插进轮里。`,
    },
  ],
  deeper: [
    {
      heading: '那次丢帧是怎么量出来的',
      text: '本课印的那两个时刻不出自本课那四个场景，而这不是省事省下来的：本仿真器的收发判决是一次确定的功率比较，没有逐帧的衰落起伏，所以同一个静止场景里要么每一帧都收到、要么一帧也收不到——「只丢中间那一帧」在静止场景里跑不出来。那次测量是在一段运行的中途把发送端挪开一个时隙的工夫做的（tests/course/uwb-ancillary-loss.test.ts，手法取自 tests/uwb/ancillary-round.test.ts）。辅助信息那几帧排在一轮的末尾、在测距相位之后，所以这一挪碰不到任何一帧测距帧——这才使「只有这一帧丢了」成为一个事实，而不是一个指望。而课文那个提前量是闭式算出来的，与那次运行只差一次飞行时间（本课大厅里是 22 ns），两者在毫秒的两位小数上一致。',
    },
  ],
  limits: [
    {
      kind: 'unmodelled',
      text: '「只丢了一帧」这一幕在本仿真器里摆不出一个场景来。收发判决是一次确定的功率比较，没有逐帧的起伏，所以同一个静止的大厅里要么每一帧都收到、要么一帧也收不到；本课那三个结局是把发送端在一段运行的中途挪开一个时隙的工夫量出来的（tests/course/uwb-ancillary-loss.test.ts）。后果是读者在面板上点不出丢帧那一幕，面板上跑的四个场景一帧也不丢，三种丢法的对照只能靠课文、那个算式和那份测量。',
    },
    {
      kind: 'unmodelled',
      text: '接收端记下那个缺口之后什么也不做。条款没有规定收到这条记录的一方该怎么处置，而本仿真器也没有建任何处置：没有补发、没有向发送端要那一帧、也没有一个上层来接这条记录（uwb/device.ancillary.ts 只是把它写进记录流）。后果是本课能回答「什么时候知道」，回答不了「知道了之后怎样」——而那两件事在真实系统里才是一件事。',
    },
  ],
  sources: [
    `IEEE Std 802.15.4-2024 §10.35.2.1 连同 Figure 10-271 给出 RAICT 信息单元的内容字段，本课用到的是其中的 Frames Remaining：它只报还剩几帧，既不带总帧数，也不带这一帧的序数，所以「丢掉第一帧说不出名字」是这个字段的性质，不是本仿真器的取舍。课文那张三行的表里，另外两行是 §10.34 的测距消息未收到交互与 §10.36 的多消息收妥确认；「整个有效期窗口」那一格读的是 §10.32.9.1 的 ARC 信息单元里那个有效轮次字段。本课完全不依赖任何草案。`,
    `本课的场景与上一课逐字段相同（同一个 22 × 8 m 大厅、同样的器材与种子、同样三个变体），所以两课的时间线哈希是同一次运行的两份记录，fixture 里那几个键是复制来的，不是重跑出来的。${MS.slot} ms 的测距时隙与 ${MS.block} ms 的测距块来自 FiRa 的缺省配置，不是标准正文；帧长与空口时间由 uwb/phy.ts 的 uwbAncillaryBytes 与 uwbPpduNs 算出，时隙数由 uwb/session.ts 的 roundPlan 与 ancillarySlots 算出，课文里一个字面量也没有写。「丢掉一帧」那次测量不在这四个场景里，手法见上面那一节与 tests/course/uwb-ancillary-loss.test.ts。`,
  ],
  scenario: () => uwbAncillaryScenario(),
  variants: [
    { label: `竞争式排程：窗口宽 ${SLOTS.contendWindow} 个时隙，起点抽出来`, scenario: () => uwbAncillaryScenario({ schedule: 'contention' }) },
    { label: `一条控制消息管 ${VALIDITY} 个块：只有窗口的头一块发`, scenario: () => uwbAncillaryScenario({ rcmValidityRounds: VALIDITY }) },
    { label: '把辅助信息交换关掉', scenario: () => uwbAncillaryOffScenario() },
  ],
  jumps: [
    J(`第一帧辅助信息：剩余帧数 ${FRAMES - 1}`, firstFragment),
    J('写 0 的那一帧：这条消息的最后一帧', lastFragment),
    J('接收端判定收齐的那一条记录', messageComplete),
  ],
  observe: [
    `四帧的剩余帧数依次是 ${FRAMES - 1}、${FRAMES - 2}、1、0。写 0 那一帧到达之后，接收端这一侧这条消息记为收齐；在那之前每一条记录都写着「还没齐」。而整块里一次超时也没有——缺不缺帧这件事不走超时。`,
  ],
  tryThis: [
    `载入「一条控制消息管 ${VALIDITY} 个块」变体，逐块看辅助信息那几帧：第 ${WINDOW_BLOCKS[0]} 块有 ${FRAMES} 帧、从 ${FRAMES - 1} 数到 0，第 1、2、3 块一帧也没有，到第 ${WINDOW_BLOCKS[1]} 块又来 ${FRAMES} 帧。要看的是第 1 块：那里不但没有帧，接收端这一侧连一条「还没齐」的记录也没有——「这一块没有消息」和「这一块的消息没收齐」是两件事，而只有后者才是本课说的丢。`,
  ],
  quiz: [
    {
      q: '为什么说缺的那一帧不是被超时猜出来的？',
      options: [
        '因为接收端为每一帧都设了一个定时器，哪个定时器响了就是哪一帧缺了',
        '因为剩余帧数在每一帧里都写一遍，所以读到的数少掉几个，中间那几帧就是没来的那几帧——这件事在收到下一帧的同一时刻就完成了',
        '因为发送端在最后一帧里报出总共发了几帧，接收端拿它和自己收到的帧数相减',
      ],
      answer: 1,
      explain: `接收端手里没有定时器，它只是把这一次读到的数和上一次相减。本课那次测量里，这一刻比截止时刻早 ${ms(NS.lead)} ms。`,
    },
    {
      q: '丢掉的是写 0 的那一帧，接收端什么时候知道？',
      options: [
        '和丢中间那一帧一样快，倒数本来就是逐帧的',
        '到这条消息的截止时刻才知道：后面没有下一帧，没有任何一次接收能发现这个缺口',
        '永远不知道，因为写 0 的那一帧才是收齐的判据',
      ],
      answer: 1,
      explain: `倒数停在 1 之后就没有下一次读数了，所以这一次缺失只能由截止时刻报出来，比丢中间那一帧晚 ${ms(NS.lead)} ms。`,
    },
    {
      q: '丢掉的是第一帧，这个办法为什么连它的名字都说不出？',
      options: [
        '因为第一帧里的剩余帧数字段不在，那一位是置 0 的',
        '因为 RAICT 只报还剩几帧，既不带总帧数也不带这一帧的序数，所以第一次读数之前的缺口没有可以相减的对象',
        '因为第一帧丢了之后整条消息都会被丢掉',
      ],
      answer: 1,
      explain: '它点得出两次读数之间的缺口，点不出第一次读数之前的缺口。而这条消息照旧会被判为收齐，因为收齐的判据是读到 0。',
    },
  ],
}

/** Re-exported so the lesson's own test file can name the sender without reaching past this half. */
export { SENDER_ID }
