/**
 * Wi-Fi Tier 1 · M4 · 等待与退避 · NAV, the reservation a header carries.
 *
 * Re-paced on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M4): the
 * proposal keeps this lesson **whole** — one field, one timer, one procedure —
 * at about 1,300 characters, the longest allowance in the module. What changed
 * is what came off it:
 *
 *  - the promise image, which ran through the lesson four times
 *    (「耳朵告诉不了你的事」,「每一帧开头的那句承诺」,「耳朵守的是帧，承诺守的
 *    是间隙和回答」,「那句预告」): §5.2. The field has a name, and the name is
 *    Duration.
 *  - `deeper`'s 「为什么标签写的是一回事，色块代表的是另一回事」: §5.5 — that is
 *    how to read the UI, not how the network works.
 *  - the three-row 「把一段长长的冻结拆开」table, now the timing figure: the
 *    table's whole content was three lengths and their sum, which is what a
 *    figure drawn to scale says better (§5.4).
 *  - one `observe` line and one `tryThis`, each of which repeated another.
 *
 * Every number quoted below is pinned in tests/course/nav.test.ts. The scenario
 * builder is unchanged, so the recorded timeline hash stays identical.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstNav, J } from '../lessonKit'

/**
 * One long freeze, to scale, and the reservation sitting in the middle of it.
 * Every figure is a record of this lesson's base run: BACKOFF_FREEZE for Talker
 * A at 498 with value 3, B's TX_END at 746, the NAV_SET at 746 running to 790,
 * the IFS_START from 790 to 824, and the acknowledgement on the air from 762 to
 * 790.
 *
 * It replaces the three-row table that used to print 248 + 44 + 34 = 326: the
 * table's content was three lengths and a sum, and three lengths side by side
 * are what shows that the middle one is the only one the ear cannot account
 * for. The middle span is left unlabelled on purpose — 44 µs is already the
 * `Duration` lane's own label directly above it, and a second label there
 * cannot fit a 20-unit span without being pushed off the viewBox.
 * `nav.test.ts` reads each figure back out of this spec.
 */
export function navTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '空口', spans: [
        { fromUs: 498, toUs: 746, label: 'B 的数据帧' },
        { fromUs: 762, toUs: 790, label: 'ACK' },
      ] },
      { label: 'Duration', spans: [{ fromUs: 746, toUs: 790, label: '44 µs', tone: 'accent' }] },
      { label: 'A 在熬的', spans: [
        { fromUs: 498, toUs: 746, label: '听得见的忙' },
        { fromUs: 746, toUs: 790, tone: 'muted' },
        { fromUs: 790, toUs: 824, label: 'DIFS' },
      ] },
    ],
    axis: { fromUs: 470, toUs: 840, ticks: [500, 600, 700, 800], unit: 'µs' },
  }
}

export const nav: Lesson = {
  id: 'nav',
  module: 3,
  title: 'NAV——用一个字段预约信道',
  why: '光靠听，站点（station, STA）只知道空口此刻忙不忙。可一场对话里是有缝的——回答回来之前那一小段停顿；而回答本身，还可能来自一台远得根本听不见的设备。只相信自己耳朵的站点，这两处都会一头撞进去。于是每一帧都在帧头（MAC header）里写明本次交互还要多久，听到的人则改为在心里挂一个倒计时。',
  outcomes: [
    '说清站点往自己的计时器里装的是什么、从哪些帧里装',
    '解释为什么光听信道保护不了一次交互',
    '从数据帧（data frame）上读出那份预约，并拿它保护的那个回答来核对',
  ],
  needs: ['backoff'],
  terms: [
    { term: 'Duration', plain: '帧头靠前的一个字段：这一帧之后，本次交互还需要多久' },
    { term: 'NAV', plain: '网络分配向量：站点自己挂着的倒计时，它还在走就当信道是忙的' },
    { term: 'virtual carrier sense', plain: '把信道当作忙，依据的是别人写下的数，不是你听得见的东西' },
  ],
  picture: [
    { heading: '光听信道，漏掉的是什么', text: '侦听只回答一个问题：此刻空口上有没有能量？帧还在发的时候这就够了，可帧发完之后那段停顿里就不够——那时空口确实是空的，交互却还没完。而当下一帧将由房间另一头、你压根听不见的设备发出时，它同样不够。' },
    { heading: '每一帧开头都带着一个数', text: '所以每一帧靠前的位置都带着一个小字段——持续时间（Duration/ID）——说明这一帧结束之后，本次交互还需要多少时间。凡是解出这一帧的人，都会拿这个数起一个倒计时，也就是网络分配向量（network allocation vector, NAV），包括那些根本不是收件人的站点。只要倒计时还在走，站点的行为就完全等同于“信道忙”。' },
    { kind: 'watch', jump: 0, heading: '看一次计时器被装上', text: '载入仿真，跳到第一次预约被装上的地方。那是旁听者，它在对一帧与自己毫无关系的数据帧作出反应：帧一结束，它的倒计时就起跑。' },
    { heading: '因为被告知，所以算忙', text: '这就是虚拟载波侦听（virtual carrier sense），这条规则里与射频毫无关系的那一半。真正的侦听保护的是还在空中的那一帧；帧头里那个数保护的，是它之后的停顿和回答——恰恰是耳朵盖不住的部分。' },
    { heading: '只算剩下的部分', text: '注意这个数没把什么算进去：它自己所在的那一帧。这本来也没必要——那一帧还在空中时，所有人的耳朵本来就报“忙”。所以数据帧写的只是那段停顿加上那个确认帧（acknowledgement, ACK）；同一次交互里越靠后的帧，写下的剩余时长就越短。' },
    { heading: '冻住了，却不知道要冻多久', text: '一个正数着自己那份等待的站点，在有帧开始时就地停住，而那一刻它根本不知道这次打断会持续多久。它从帧头里得知这一帧有多长；只有当整帧都被解了出来，它才可以相信那个数，并装上自己的倒计时。这段等待的大部分时间，它都不知道等待何时结束——而等预约到期，它还要再走一个分布式帧间间隔（DCF interframe space, DIFS）才轮得到自己。' },
  ],
  numbers: [
    { kind: 'table', heading: '44 µs 是怎么来的', head: [
      '组成', '时长', '出处',
    ], rows: [
      ['回答之前的停顿', '16 µs', '§17.4.4'],
      ['回答本身：14 个字节，按控制回应规则定的 24 Mb/s', '28 µs', '§17.4.3'],
      ['数据帧写下的量', '44 µs', '§9.2.4.2'],
      ['回答写下的量', '0 µs', '交互到此结束'],
    ] },
    { heading: '每一次都是同一个数', text: '本轮仿真里 576 个数据帧写下的都是同一个 44 µs，而旁听者的倒计时恰好在回答结束的那一纳秒到期——513 次无一例外。' },
    {
      kind: 'diagram', heading: '把一段长长的冻结拆开',
      spec: navTiming(),
      caption: 'A 在 498 µs 冻结，当时它只知道信道忙。三段加起来 326 µs，而它的耳朵只管得住第一段 248 µs：中间那 44 µs 空口是安静的，只是已经被 B 预订走了；最后 34 µs 才是真正的空闲。824 µs 走完之后，A 的退避（backoff）计数从 3 继续——那是空口变忙时它还欠着的空闲时隙（slot time）数。',
    },
    { kind: 'steps', heading: '从帧头里的一个字段，到一台冻住的站点', items: [
      '发送方在发出去之前先算清楚：这一帧结束之后还剩些什么——一段停顿加上回答的空口时间（airtime），这里是 16 + 28 = 44 µs——再把这个数写进帧头的 Duration 字段。',
      '结束一次交互的那一帧，写下的是“后面没有了”。确认帧带的就是 0 µs；而写着零的 Duration，谁的计时器也装不上。',
      '一台把这一帧整个解了出来、再发现收件人是别人的站点，会算出一个时刻：这一帧结束的那一刻，加上它写下的 Duration。',
      '只有当这个时刻比它手里已经挂着的那个倒计时更晚时，它才采用。一帧可以把一份预约往后推，却永远不能把它往回拉。',
      '装上这个倒计时之后发生的事，和侦听到能量时一模一样：正在走的退避计数在当前那个值上冻住，正在走的那段间隙作废，这次尝试被记上“推迟过”。',
      '从这一刻起，直到它装上的那个时刻为止，站点对介质（medium）的判定一律是“忙”，不管耳朵报的是什么。忙 = 侦听为忙，或者倒计时尚未到期——两者成立一个就够了。',
      '到了那个时刻，倒计时解除。如果这时侦听报的是空闲，站点就开始走它那段间隙，并从冻住的那个值恢复接入。预约还有两种提前解除的办法，留到后面的课。',
    ] },
  ],
  deeper: [
    { heading: '站点手里从来没有时刻表', text: '326 µs 这个总数，最早要到 746 µs 才算得出来，而那时等待本身已经过去了 248 µs，约四分之三。就算算出来了，这个数也是有条件的：最后那 34 µs 里若又有一帧开始，它只会继续变长。站点手里没有任何时刻表，只有一个不断修正的信念——“我最早可能在 ___ 恢复”——每来一个事件就重算一次；穿过这团迷雾时，它随身带着的只有一个数字：冻结住的那个计数。' },
  ],
  sources: [
    'IEEE Std 802.11-2024 的 §10.3.2.4 给出 NAV 的更新规则：站点正确收到一帧不是发给自己的帧时，把 NAV 设为“当前值”与“帧结束时刻加 Duration”中较晚的那个。',
    'Duration 字段本身，以及“它是从当前帧结束起算、以微秒为单位的一段时间”这一含义，见 §9.2.4.2。',
    '248 µs 的帧、28 µs 的确认帧，以及图里引用的每一个时刻，都是本仿真器的场景，靠随机种子即可复现，并非取自标准正文。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Talker A', 'sta', 3.5, 5, 'nonht', 'saturated'),
    node('sta-2', 'Talker B', 'sta', 6.5, 5, 'nonht', 'saturated'),
    node('sta-3', 'Listener', 'sta', 5, 6.5, 'nonht', 'browsing'),
  ]),
  jumps: [
    J('第一次设置 NAV', firstNav),
  ],
  observe: [
    '泳道下方那些细细的紫条就是倒计时。它们恰好在回答结束的那一瞬间到期——旁听者的 513 条里随便挑一条核对都一样。',
    '在一帧与它的回答之间的间隙里暂停：空口一片安静，旁听者自己的侦听也报空闲——可它依然不发。',
  ],
  tryThis: [
    '用微秒按钮把 A 从 498 µs 走到 824 µs，每走到一处就说出：它此刻熬的是三段等待里的哪一段。',
  ],
  quiz: [
    {
      q: '站点往自己的倒计时里装的到底是什么？',
      options: [
        '它测到的信号强度',
        '任何它正确解出、而且不是发给自己的帧里的 Duration',
        '一个随机的等待时间',
      ],
      answer: 1,
      explain: '这一帧必须先被整个解出来——接收端根本没读出来的数毫无价值。至于是不是收件人，并不要求。',
    },
    {
      q: '数据帧写下的那个数，为什么不把这一帧自己算进去？',
      options: [
        '因为发送方不知道自己这一帧有多长',
        '因为这一帧还在空中时，普通的侦听本来就报“忙”',
        '因为那个字段太小，装不下这个数',
      ],
      answer: 1,
      explain: '这个字段存在的意义，正是去盖住侦听盖不住的部分：那段安静的停顿，以及一个可能来自你听不见之处的回答。',
    },
  ],
}
