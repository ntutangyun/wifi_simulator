/**
 * Tier 2 · M8 · Ambient power IoT (802.11bp) · Slotted random access.
 *
 * Six ambient-power tags on a ring 2 m from the router — same distance, same
 * RSSI, so no collision is ever resolved by capture — share four uplink slots
 * every 20 ms. ABOC, ACW, sit-outs, collisions, and a small analytic model of
 * the slot checked against thirty measured rounds. Every number quoted below is
 * pinned in tests/course/amp-slots.test.ts.
 *
 * Migrated to the zero-to-hero contract 2026-10-02 (the readability programme's
 * last AMP hole): why/outcomes/needs/terms/picture/numbers/sources/limits in
 * place of the old flat `body`, every official term bracketed with its English
 * name at first Chinese use, and a `steps` block for the draw-to-result
 * procedure. Every fact, number and the scenario/variants/jumps are unchanged
 * from the pre-migration version, so the recorded timeline hashes in
 * tests/fixtures/lesson-hashes.json did not move.
 */
import type { Scenario } from '../../model/scenario'
import { J, ampAp, firstAmpLost, firstAmpSatOut, firstCollision, firstScheduledTrigger, oneRoom, sc, tag, txOf, type Lesson } from '../lessonKit'

/** Seven positions on a 2 m ring around the router; the base lab uses the first six. */
const RING = [0, 1, 2, 3, 4, 5, 0.5].map((k) => {
  const a = (k * Math.PI) / 3
  return { x: +(5 + 2 * Math.cos(a)).toFixed(3), y: +(4 + 2 * Math.sin(a)).toFixed(3) }
})

/** The lab: one polling router and `tags` tags evenly spread on the ring. */
export function ampSlotsScenario(o: { acwe: number; readMode: 'inline' | 'twoPhase'; tags?: number }): Scenario {
  return sc(oneRoom(), [
    ampAp('ap', 'Router', 5, 4, { pollIntervalMs: 20, slots: 4, acwe: o.acwe, readMode: o.readMode }),
    ...RING.slice(0, o.tags ?? 6).map((p, i) => tag(`tag-${i + 1}`, `Tag ${i + 1}`, p.x, p.y)),
  ])
}

export const ampSlots: Lesson = {
  id: 'amp-slots',
  module: 10,
  title: '时隙化随机接入：ABOC、ACW 与碰撞',
  why: '第一课只有两个标签分享四个时隙，偶尔才发生一次碰撞。但路由器一次只开放固定数目的时隙，想要应答的标签却可能比时隙还多：这里是六个标签、四个时隙。规则很简单：触发帧（Trigger frame）里带着一个窗口指数，标签据此算出窗口，在窗口内均匀随机抽取一个数，落在第几个时隙就在该时隙应答，落在时隙之外则本轮轮空；碰撞之后没有窗口翻倍，也不保留任何历史状态，下一轮从同一个范围重新抽取。六个标签到达路由器的功率几乎一样，没有哪一路强到能被单独解出，所以同一时隙里只要不止一个标签，就全部丢失；标签自己无法区分是发生了碰撞还是信号太弱，它只收到一帧没有标明自己的确认。因为每次抽取彼此独立，一个时隙空着、成功、碰撞的概率可以直接用组合算出，不必像分布式协调功能（distributed coordination function, DCF）那样自洽求解，三十轮的实测结果与它只相差几个百分点。窗口要按标签数调整：窗口太窄，可达的时隙大多以碰撞告终，靠后的时隙又根本无法选中，整段时间只送达寥寥几个读数；放宽到有一半的抽取结果落在时隙之外时，碰撞减少，送达的读数反而最多——轮空的标签不占用空口时间（airtime），只损失自己这一轮。这正是窗口写在触发帧里、每轮重新广播的原因。把应答拆成两个阶段，先用短时隙只报告身份、再按名单发送读数，发送读数的阶段不会再发生碰撞；但读数这么短时，多出的一帧触发帧和每个标签多出的一帧确认所占的空口时间超过了短时隙节省的时间，送达的读数一样多，总的空口时间反而增加。',
  outcomes: [
    '说清标签怎样用 ACWE 算出窗口、抽取 ABOC，再换算成要使用的时隙',
    '解释碰撞发生时接入点（access point, AP）和标签各自能看到什么、看不到什么',
    '用一个不必自洽求解的小模型，预测空、成功与碰撞三种结果各占多少',
    '根据读数到达率的变化，判断该把 ACWE 往哪个方向调',
  ],
  needs: ['amp-intro', 'amp-ppdu'],
  terms: [
    { term: 'ACWE', plain: '触发帧里携带的一个数，标签据此算出自己的抽取范围有多宽' },
    { term: 'ACW', plain: '由 ACWE 算出的那个范围：标签在 0 到 ACW 之间随机抽取一个数' },
    { term: 'capture effect', plain: '接收机保持与先锁定的那个前导码同步，只有新信号明显更强时才改为与新信号同步；六个标签功率几乎相等时，这件事从不发生' },
    { term: 'two-phase', plain: '先用短时隙询问身份，再按名单中的位置发送读数，完全不随机抽取，也就不可能发生碰撞' },
  ],
  picture: [
    { heading: '场景：六个标签，四个时隙', text: '六个标签均匀分布在距路由器 2 m 的圆环上。这种几何布置是有意为之的：每个标签收到路由器的下行（downlink, DL）都是 −30.7 dBm，到达接入点（access point, AP）的上行（uplink, UL）都是 −50.7 dBm——下行余量 41.3 dB，上行余量 43.3 dB——六者之间的差异不到百分之一分贝。捕获效应（capture effect）——接收机保持与它先锁定的那个前导码（preamble）同步，只有遇到明显更强的前导码时才改为与后者同步——要求某一路信号比其他路高出 5 dB，而且这个差距必须落在上行回应仅有的那 48 µs AMP-Sync 之内。这里没有任何一路具备这个余量，因此每一次碰撞都会使参与碰撞的回应全部丢失。' },
    { kind: 'watch', jump: 0, heading: '查看第一次碰撞', text: '载入仿真，跳到时隙里的第一次碰撞：三个标签在同一个时隙里同时发送，AP 一帧都解不出。' },
    { heading: 'ABOC 与窗口', text: '标签没有载波侦听（carrier sense），它唯一能做的决定就是“在第几个时隙回应”。触发帧（Trigger frame）里带着一个窗口指数 ACWE，标签据此算出窗口宽度 ACW = 2^ACWE − 1，在 0 到 ACW 之间均匀随机抽取一个 AMP 退避计数器（backoff counter, ABOC），然后在第 ABOC + 1 个时隙发送。若抽到的数超出了本轮提供的时隙数，它这一轮就轮空，不发送任何内容。' },
    { kind: 'formula', text: 'ACW = 2^ACWE − 1     slot = ABOC + 1（当 ABOC < N），否则轮空', note: 'ACWE 1 → ACW 1，ACWE 2 → ACW 3，ACWE 3 → ACW 7。基础场景用 ACWE 2、N = 4 个时隙，因此每次抽取都对应一个实际存在的时隙。六个标签每轮都能解出触发帧，所以每轮开头都有六次抽取——三十轮共 180 次。' },
    { text: '协议的全部内容就是这些。碰撞之后没有窗口翻倍，没有重传（retry）计数器，没有任何历史状态：下一帧触发帧到来时，从同一个区间重新抽取一次。标签甚至无法区分是发生了碰撞还是信号太弱——它收到的只是一帧没有标明自己的 Ack。' },
    { kind: 'watch', jump: 2, text: '跳到第一次回应丢失。看一看路由器在那个时隙末尾发出的是什么，其中标明的是谁。' },
    { kind: 'steps', heading: '一次抽取，从触发帧到结果', items: [
      '标签解出触发帧，读到窗口指数 ACWE 和本轮的时隙数。',
      '标签算出窗口宽度 ACW = 2^ACWE − 1，在 0 到 ACW 之间均匀随机抽取一个数，记作 ABOC。',
      '若 ABOC 小于时隙数，标签在第 ABOC + 1 个时隙发送；否则这一轮保持沉默。',
      '时隙结束后路由器发一帧 Ack：收到则标明这个标签，没有收到或解不出则标明路由器自己。',
      '标签依靠这帧 Ack 得知结果，也依靠它计数到下一个时隙的边界——下一帧触发帧到来时，整个过程从头重复一遍，不保留任何历史状态。',
    ] },
  ],
  numbers: [
    { text: '路由器把轮询间隔从 100 ms 缩短到 20 ms，于是三十轮正好占满 600 ms——下文每个数字都是在这段时间内测得的。轮本身与最初那一课相同：50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs。改变的是它所占的比例：占每 20 ms 的 20.95 %，而不是每 100 ms 的 4.19 %。' },
    { kind: 'table', heading: '第一轮，逐时隙展开', head: [
      '时隙', '开始', '抽到它的标签', '结果',
    ], rows: [
      ['1', '688 µs', 'Tag 2（ABOC 0）', '1556 µs 被确认'],
      ['2', '1566 µs', 'Tag 1（ABOC 1）', '2434 µs 被确认'],
      ['3', '2444 µs', 'Tag 3、5、6（都是 ABOC 2）', '碰撞；Ack 标明的是路由器自己'],
      ['4', '3322 µs', 'Tag 4（ABOC 3）', '4190 µs 被确认'],
    ] },
    { text: '三个标签都抽到了 2，于是在 2444 µs 同时开始发送。它们到达 AP 的功率彼此相差不到百分之一分贝，因此连前导码都没能被捕获：AP 记录下三条原因为 preambleSinr 的 RX_MISS——一条 RX_FAIL 都没有——以及 2972 µs（时隙结束的那一刻）的一条 COLLISION。整个运行过程中，任何节点上都没有出现原因为 capture 的 RX_FAIL。' },
    { text: '2982 µs 那帧 Ack 和平常一样是 330 µs 的 PPDU（PHY protocol data unit），但它的 ID 字段里填的是路由器自己的标识。三个标签都在 3312 µs 收到它，把这一轮记为丢失。三十轮下来，120 帧 Ack 里 46 帧标明了某个标签，74 帧标明的是路由器自己。' },
    { heading: '一个简化的 Bianchi 模型', text: '第二模块里我们建立过分布式协调功能（distributed coordination function, DCF）的 Bianchi 模型：先求出终端的发送概率，再推出某个时隙空闲、成功或碰撞的概率。时隙化的 AMP 接入是同一个思路，只是去掉了最难的部分。没有退避冻结、没有窗口翻倍、没有碰撞历史，因此不需要任何自洽求解——发送概率由触发帧直接交给标签，剩下的就是组合计算。' },
    { kind: 'formula', text: 'q = 1/(ACW + 1)        p = min(N, ACW + 1)/(ACW + 1)\nP(空) = (1 − q)^M     P(成功) = M·q·(1 − q)^(M−1)     P(碰撞) = 1 − P(空) − P(成功)', note: 'q 是单个标签落在某个“可达时隙”的概率；p 是它这一轮发送的概率，于是 1 − p 就是轮空率。只有前 min(N, ACW + 1) 个时隙可达——其后的时隙按构造必然为空，不计入下表比例。' },
    { kind: 'table', heading: '模型 / 三十轮实测（M = 6，N = 4）', head: [
      'ACWE', '可达时隙',
      '空', '成功', '碰撞',
    ], rows: [
      ['1 (ACW 1)', '2 of 4', '1.6 % / 0.0 %', '9.4 % / 11.7 %', '89.1 % / 88.3 %'],
      ['2 (ACW 3)', '4 of 4', '17.8 % / 16.7 %', '35.6 % / 38.3 %', '46.6 % / 45.0 %'],
      ['3 (ACW 7)', '4 of 4', '44.9 % / 42.5 %', '38.5 % / 43.3 %', '16.7 % / 14.2 %'],
    ] },
    { text: '每行只有 120 个时隙，实测比例与公式的偏差却都不超过 0.05，也就是五个百分点；全表最大的一处偏差是 ACWE 3 的“成功”一列，4.87 个百分点（四舍五入后的表格单元格相差 4.8）。轮空率也与模型一致：1 − p 预测 ACWE 3 下有一半抽取会轮空，实测 180 次中轮空 91 次，50.6 %。ACWE 1 与 2 下公式给出 p = 1，实测也确实一次轮空都没有。' },
    { heading: '如何选择 ACW', text: 'ACW 太小，标签就集中在少数几个时隙上；ACW 太大，它们又被分散到时隙列表之外。ACWE 1 是极端的一端：ACW + 1 = 2 小于本轮提供的四个时隙，于是时隙 3、4 从构造上就不可达。60 个这样的时隙全是空的，它们占用的 1756 µs——整轮的 41.9 %——每轮都被浪费。可达时隙里 88.3 % 以碰撞告终，整整 600 ms 只送达 7 个读数（每轮 0.23 个），六个标签里有两个一次都没被确认过。' },
    { text: 'ACWE 3 是另一端，宽松得多：一半的抽取结果为轮空，三十轮里只有 17 次碰撞，送达 52 个读数——每轮 1.73 个。轮空和碰撞不是一回事：轮空的标签不占用空口时间（airtime），损失的只是自己这一轮。ACWE 2 落在中间，46 个读数、每轮 1.53 个，送达读数最少的标签也送达了 4 个，而 ACWE 3 下是 6 个。六个标签争用四个时隙时，AP 应该把 ACWE 调高——这正是这个值写在触发帧里、每轮重新广播，而不是固化在标签里的原因。' },
    { heading: '为什么 Ack 是标签的定时基准', text: 'AMP Ack 并不携带标签可以依赖的时隙编号：标签按到达顺序对 Ack 计数，数到第 slot − 1 帧就开始发送。因此漏收一帧 Ack 的后果不止于这一帧，而是丢失一整轮——标签少计一帧，就会晚一个时隙发送，而 AP 只接收当前时隙里的回应，直接忽略它。本场景里这从未发生：余量高达几十分贝，180 次回应全部落在抽取所指定的时隙里。这就是以 Ack 作为时隙的定时基准、而不依赖标签根本不具备的时钟所要付出的代价。' },
    { heading: '两阶段：用短时隙竞争，用长时隙发送读数', text: '两阶段变体把这两件事分开进行。随机阶段只询问身份，回应是 7 个字节而不是 15 个，时隙是 272 µs 而不是 528 µs。随机阶段中被路由器收到的标签，随后由第二帧“调度型”触发帧逐一指定，并在名单位置决定的时隙里发送读数——不随机抽取，也就不可能发生碰撞。第一轮里随机阶段收到了 Tag 2、Tag 1 和 Tag 4，调度触发帧按这个顺序列出它们：19 个字节、810 µs，比广播触发帧长六个字节——这是因为名单里每个标签都要占 2 个字节的 ID，而且 6 字节的触发帧帧体（Frame Body）本身也是模型取值，并非草案值。' },
    { kind: 'formula', text: '随机阶段 = 50 + 10 + 618 + 4 × (10 + 272 + 10 + 330) = 3166 µs\n调度阶段 =      10 + 810 + 3 × (10 + 528 + 10 + 330) = 3454 µs   →  6620 µs', note: '内联模式下同样的三个读数只用了 4190 µs，两阶段多用 2430 µs。它的 CTS-to-self（CTS to self）要预留 7512 µs——按“四个标签全部被收到”的最坏情况计算；三十轮里有 4 轮一个标签也没有收到，也就没有调度阶段。' },
    { text: '三十轮下来两种模式送达的读数一样多，都是 46 个：内联模式的 PPDU 共占用 154 730 µs，两阶段占用 167 130 µs，多 8.0 %。较短的竞争时隙确实节省了空口时间，但在这样的帧长下，多出来的一帧触发帧和每个标签多出来的一帧 Ack 开销更大。两阶段更有利的场合，是读数本身很长的时候。' },
    { kind: 'list', heading: '在哪里查看', items: [
      '日志里：“ABOC 1 of [0, 3] → slot 2”、“ABOC 5 of [0, 7] → sits out”、“slot 3: not acknowledged”。',
      '触发帧 6 个字节的帧体：“Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading”，两阶段下则是“…… 4 slots × 272 µs · id only”。',
    ] },
  ],
  sources: [
    'IEEE P802.11bp 仍是草案：D0.5 于 2026 年 5 月发布，D1.0 将于 2026 年 9 月进入 letter ballot。本课拆解的上行接入来自提案草案文本 11-26/1889r4 第 39.4 节，触发过程见 11-26/1519r5。',
    'AMP Ack 不携带标签可以依赖的时隙编号、标签只能按到达顺序对 Ack 计数这条规则，见规范框架 11-24/1613r20 的 MM-46 与提案草案文本 11-26/1889r4 第 39.4 节。',
    '“两阶段”调度触发帧里每个标签 2 字节的 ID 宽度，以及 6 字节的触发帧帧体，都是本仿真器的模型取值，草案本身未固定这两个宽度，仍标着 TBD。',
    '捕获效应所用的 5 dB 余量与它的时间窗口，是本仿真器的模型取值，借自 ns-3 的默认值；标准与草案都没有规定第二个前导码出现时接收机该怎么办。',
  ],
  limits: [
    { kind: 'unmodelled', text: '仿真器的传播模型完全确定，不含任何快衰落或逐包的功率抖动（propagation.ts 不含任何随机项）：六个标签因此永远精确地等距、等功率，碰撞的几路信号彼此相差不到百分之一分贝，捕获效应需要的 5 dB 差距永远不会出现。真实房间里即使标签位置分毫不差，电磁波的小尺度衰落也会使到达功率逐包起伏几分贝，时而会有一路高出 5 dB 而被捕获、仍被正确接收；本课三个变体与两阶段运行中，没有一次原因为 capture 的 RX_FAIL。' },
    { kind: 'model-value', text: '捕获效应的 5 dB 余量与它的时间窗口（channel.ts 的 CAPTURE_MARGIN_DB 与 captureWindowNs）是本仿真器的模型取值，借自 ns-3 的默认值。标准与草案都没有规定第二个前导码出现时接收机该怎么办——真实芯片的门限与窗口因实现而异。' },
    { kind: 'model-value', text: '两阶段调度触发帧里每个标签 2 字节的 ID（amp.ts 的 AMP_STA_ID_BYTES）与 6 字节的触发帧帧体（AMP_TRIGGER_BODY_BYTES）都是本仿真器自行选定的宽度，草案里这两处仍标着 TBD。换一个实现，调度触发帧可能使用不同的字节数，810 µs 这个数字也会随之改变。' },
    { kind: 'unmodelled', text: 'AP 的 ACWE 在一整次运行里是固定的场景参数（scenario.ts 的 AmpApCfg.acwe），引擎不会按观测到的碰撞率自动调高或调低它——本课三个 ACWE 值全靠人工在三个变体里分别设定。真实接入点的实现很可能会做这种自适应，根据轮空率与碰撞率动态调整窗口，而不是像这里这样一次运行从头到尾都不变。' },
  ],
  scenario: () => ampSlotsScenario({ acwe: 2, readMode: 'inline' }),
  variants: [
    { label: 'ACWE 1（ACW 1）', scenario: () => ampSlotsScenario({ acwe: 1, readMode: 'inline' }) },
    { label: 'ACWE 3（ACW 7）', scenario: () => ampSlotsScenario({ acwe: 3, readMode: 'inline' }) },
    { label: '两阶段：先报身份，再送读数', scenario: () => ampSlotsScenario({ acwe: 2, readMode: 'twoPhase' }) },
  ],
  jumps: [
    J('时隙里的第一次碰撞', firstCollision),
    J('第一帧标明路由器自己的 Ack', txOf((r) => r.frame.kind === 'ampAck' && r.frame.dst === r.frame.src)),
    J('第一次回应丢失', firstAmpLost),
    J('第一次轮空（ACWE 3 变体）', firstAmpSatOut),
    J('第一帧调度型触发帧（两阶段变体）', firstScheduledTrigger),
  ],
  observe: [
    '跳到时隙里的第一次碰撞：三帧回应在 2444 µs 同时开始、在 2972 µs 结束，COLLISION 就记录在这一时刻。打开 2982 µs 那帧 Ack——它的 ID 字段填的是路由器的标识。再看 AP 记录了什么：三条 RX_MISS，一条 RX_FAIL 也没有，因为功率相等时根本没有前导码被捕获。',
    '选中 Tag 3，单步执行五轮。它的 ABOC 每轮都在变化，不保留上一轮的任何状态；三十轮里四个取值它都抽到过。标签状态里没有“碰撞后会翻倍的竞争窗口（contention window, CW）”：取值范围来自触发帧，每轮完全相同。',
    '载入 ACWE 3 变体，跳到 678 µs 的第一次轮空：Tag 3 从 [0, 7] 抽到 5，整轮保持沉默、不发送任何内容。42.5 % 的时隙是空的——碰撞率降到 14.2 %，代价正是这些空时隙。',
  ],
  tryThis: [
    '依次载入 ACWE 1 与 ACWE 3 两个变体，或在编辑器的 AMP 轮询设置里自己改 ACWE，看送达的读数如何变化：ACWE 1 每轮 0.23 个，ACWE 2 每轮 1.53 个，ACWE 3 每轮 1.73 个。ACWE 1 下时隙 3 和 4 始终为空。然后用公式推算：如果只有两个标签而不是六个，你会选哪个 ACWE？',
    '用编辑器在同样 2 m 的距离上再加第七个标签，然后重新载入。送达率从每轮 1.53 个读数降到 1.03 个，碰撞时隙占比从 45.0 % 升到 59.2 %——模型预测 55.5 %。',
  ],
  quiz: [
    {
      q: 'ACWE 1、本轮提供四个时隙时，为什么时隙 3 和 4 始终为空？',
      options: [
        'AP 收到足够多的标签后提前结束这一轮',
        'ACW + 1 = 2，抽到的只能是 0 或 1，因此只可能指向时隙 1 或 2',
        '标签距离太远，靠后的时隙里收不到它们',
      ],
      answer: 1,
      explain: 'ABOC 是从 0 到 ACW = 1 之间抽取的，待发时隙只可能是 1 或 2。那两个不可达的时隙仍然要占用 1756 µs，占每轮的 41.9 %。',
    },
    {
      q: '三个标签在同一个时隙里发送，到达功率也相同。AP 会记录下什么？',
      options: [
        '什么也没解出：三条 RX_MISS 加一条 COLLISION，随后的 Ack 标明路由器',
        '一条原因为 capture 的 RX_FAIL——它锁定了三者中最强的一路',
        '接收第一帧回应，另外两帧当作重复帧丢弃',
      ],
      answer: 0,
      explain: '捕获要求某一路比其他路高出 5 dB，而且要落在上行回应仅有的那 48 µs AMP-Sync 之内。等半径圆环上没有任何一路具备这个余量，于是没有前导码被捕获，整个运行里也不会出现原因为 capture 的 RX_FAIL。',
    },
    {
      q: 'Bianchi 的 DCF 模型必须自洽求解 τ。为什么 AMP 的时隙模型可以直接与实测结果比较？',
      options: [
        '因为终端数更少，近似更准',
        '因为标签的取值范围来自触发帧，从不依赖碰撞历史，所以 q = 1/(ACW + 1) 事先就知道',
        '因为碰撞之后 AP 会代替标签重传',
      ],
      answer: 1,
      explain: 'Bianchi 必须求解 τ，因为终端的窗口会随碰撞次数翻倍。AMP 标签没有窗口翻倍、没有冻结、没有历史：触发帧每轮都重新广播 ACW，于是发送概率是已知输入，而不是待解的未知数。',
    },
  ],
}
