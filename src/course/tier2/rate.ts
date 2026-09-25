/**
 * Wi-Fi Tier 2 · M4 · Capacity knobs · Picking how fast to talk.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md) and split in
 * two (plan ruling 2): this half is why a fixed speed is wrong in both
 * directions, the ceiling the signal sets, and the one thing a sender actually
 * learns — an answer, or no answer. The loop that climbs and falls, and what an
 * excursion below the ceiling costs the room, is `rate-fallback`, which loads
 * this same scene.
 *
 * **Stays whole** in the 2026-09-25 re-pacing
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M9) — and
 * gives up the ARF rule (§5.1.3). The two-failures-down, ten-successes-up loop
 * and its worked excursion belong to `rate-fallback`, which teaches them in full
 * with better support; what is left here is the ceiling and the epistemic limit.
 * The `steps` block is therefore the procedure this lesson does own: how the
 * ceiling itself is computed before every frame (`mcsForPeer` in
 * src/engine/simulation.ts, then `mcsForRssi` in src/engine/phy.ts), which is
 * also what pins the near station to MCS 11. Also cut: 「一个靠传闻运转的回路」
 * and 「信号扣下来的那个盖子」(§5.2), and the multi-user reporting aside reduced
 * to one sentence (§5.5).
 *
 * The scenario builder is unchanged, so the recorded timeline hash in
 * tests/fixtures/lesson-hashes.json stays byte-identical. Every number quoted
 * below is pinned in tests/course/rate.test.ts.
 */
import { type Lesson, firstData, firstRetry, J } from '../lessonKit'
import { rateScenario } from '../wifiScenes'

export const rate: Lesson = {
  id: 'rate',
  module: 8,
  title: '速率控制——决定说多快',
  why: '发送端必须先决定说多快，然后才开口，而两边的错答案都要付代价。说得太快，帧到了对面只是一团糊，什么也过不去；说得太慢，帧倒是都送到了，可每一帧在空口上趴的时间远比它需要的长，而这段时间里所有人都在等。没有谁会告诉发送端哪一档才对，它只能从回来的答复里自己琢磨。',
  outcomes: [
    '说出为什么“固定一档速率”在两个方向上都是错答案',
    '在时间轴上读出一条链路（link）的上限，并说清是什么定下了它',
    '说出发送端从一帧里唯一能知道的东西，以及它永远不会知道的东西',
    '用手把上限算一遍：哪些量进去，哪些量根本进不去',
  ],
  needs: ['mcs-ladder', 'retries-queues', 'rate-vs-model', 'width'],
  terms: [
    { term: 'ceiling', plain: '这条链路的信号真正撑得住的最高一级；定下它的是距离和墙，不是发送端' },
    { term: 'attempt', plain: '把一帧发出去这一次动作；它算成功还是失败，取决于答复有没有回来' },
  ],
  picture: [
    { heading: '错的两种方式', text: '选一级这条链路撑不住的，接收端听到的就是一团糊：帧发出去了，空口时间（airtime）花掉了，什么也没到。选一级远低于链路能力的，帧倒是帧帧都到——可每一帧占住信道的时间是它本来需要的好几倍，而在这段时间里，屋里其他人谁也不能开口。对的那一级，是这条链路还撑得住的最高一级；而人走来走去、门开门关，这一级还会变。' },
    { heading: '这条链路的上限', text: '这一幕里有两台站点（STA）在向同一个接入点（AP）满速上传：一台在它旁边的桌上，一台在另一头、隔着一堵砖墙的角落里。一条链路的信号真正撑得住的最高一级，就是它的上限；远端那台再怎么试也越不过去，因为那个角落的信号撑不住更密的调制与编码方式（modulation and coding scheme, MCS）。定下这个上限的，是距离和那堵墙。上限以下的一切，才是发送端自己一帧一帧做的决定。' },
    { kind: 'watch', jump: 0, heading: '去看一眼', text: '载入仿真，跳到第一个数据帧（data frame），然后顺着远端站点那条泳道往后看几秒：它的方块长度一直在变，而近端站点的从头到尾一个样。屋里什么都没挪动，变的只是一台发送端的选择。' },
    { heading: '发送端唯一收到的消息', text: '发送端看不见对面那头的信号，它手里只有回来的那点东西。把一帧发出去这一次动作，就是一次尝试；它只有两种结局：要么确认帧（acknowledgement, ACK）到了，要么 ACK 超时（ACK timeout）到了。就这一丁点消息——答了，没答——就是速率控制的全部输入。它分不清一帧是被弱信号打死的，还是被“邻居在同一个时隙（slot time）开了口”打死的；站在它这个位置上，两者长得一模一样。所以它的选择永远建立在有点失真的证据上——它拿这一点消息怎么把级别往两边挪，是下一课的事。' },
  ],
  numbers: [
    { kind: 'table', heading: '远端站点的帧：三个级别，同样的 1,530 字节，20 MHz，单流', head: [
      '级别', '速率一行',
      '空口时间', '占它帧数的比例',
    ], rows: [
      ['MCS 2——它的上限', '25.8 Mb/s', '524.0 µs', '79.8%'],
      ['MCS 1', '17.2 Mb/s', '768.8 µs', '17.2%'],
      ['MCS 0——最底一级', '8.6 Mb/s', '1,476.0 µs', '3.0%'],
    ] },
    { heading: '降一级要付什么', text: '每降一级，每一块信号能装的比特数就减半或接近减半，所以同样的内容，在最底一级要花掉将近上限三倍的空口时间。' },
    { heading: '那台根本不用做选择的站点', text: '离接入点一米远的近端站点，三秒里发了 4,010 帧，帧帧都在 MCS 11 上，而且没有一帧等不到答复。停在这一级并不是因为信号不够——58.7 dB 足以撑住最高一级——而是因为两端谈定的能力到此为止：这一幕里谁也没有开出最密的那两级，上限就被压在它们下面。' },
    { kind: 'steps', heading: '上限是怎么算出来的，每一帧都重算一次', items: [
      '取这条链路此刻的接收信号强度指示（received signal strength indicator, RSSI）：它由距离和那堵墙决定，发送端只能读，不能改。',
      '取两端谈定的带宽，算出这个带宽下的噪声地板（noise floor）；信噪比（signal-to-noise ratio, SNR）就是 RSSI 减去它。这一幕里两端都是 20 MHz，噪声地板 −93.99 dBm。',
      '看两端谈定了哪些能力：如果没有一起开出 4096-QAM（quadrature amplitude modulation），上限先被压到 MCS 11——这一步只看能力，与信号一点关系都没有。',
      '从最底一级往上逐级检查，留住最后一个满足“该级所需信干噪比（signal-to-interference-plus-noise ratio, SINR）+ 3 dB 速率余量 ≤ SNR”的级，并且不越过上一步那个帽子。这就是这条链路此刻的上限。',
      '把上限交给速率控制：当前级别只要高于上限，就立刻被拉到上限——这一帧便用当前级别发出去。上限以下怎么挪，是下一课的事。',
    ] },
    { kind: 'table', heading: '远端那条链路，照着步骤走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['远端链路的 RSSI', '−75.46 dBm'],
      ['减去 20 MHz 的噪声地板', '−93.99 dBm'],
      ['= SNR', '18.53 dB'],
      ['能力上的帽子：两端都没开 4096-QAM', 'MCS 11'],
      ['MCS 2 的要求，含余量', '13.99 + 3 = 16.99 ✓'],
      ['MCS 3 的要求，含余量', '16.99 + 3 = 19.99 ✗'],
      ['于是上限是', 'MCS 2'],
    ] },
  ],
  deeper: [
    { heading: '多用户帧同样会上报结果', text: '喂给速率控制的是每一次交换，不只是单用户的：一个下行多用户 PPDU 会为每个成员各上报一次成功或失败，所以一个只在多用户 PPDU 里用到的级别也照样自适应。' },
  ],
  sources: [
    '一条链路能撑住哪一级，用的是本仿真器自己的 `mcsForRssi`：把接收功率与 IEEE Std 802.11-2024 第 36 章的各级最小输入灵敏度相比，再加一个固定余量。这个余量是模型取值，标准并没有规定它。',
    '三个空口时间来自 §17.4.3 的 TXTIME 公式，代入的是本仿真器为这类 PPDU 选定的代表性前导与符号长度；“速率一行”是该级别在这个带宽、单流下的调制编码速率。',
    '“发送端只知道答了还是没答”，本就是标准的设计：§10.3.2.9 把确认帧定为成功与否的唯一指示，并没有为它定义任何关于接收信号质量的反馈。',
  ],
  scenario: () => rateScenario(),
  jumps: [
    J('第一个数据帧', firstData),
    J('第一次 ACK 超时', (r) => r.type === 'ACK_TIMEOUT'),
    J('第一次重传', firstRetry),
  ],
  observe: [
    '远端站点的方块随着仿真推进在变长变短：在上限 MCS 2 上是 524.0 µs，降一级是 768.8 µs，到最底一级是 1,476.0 µs。这个选择肉眼可见地在动，不是固定的。',
    '把整整三秒拉完，远端站点一次也没有发到 MCS 2 以上。上限是它撞上去的一个盖子，而不是一个偶尔会冲过头的目标。',
    '离接入点一米的近端站点则纹丝不动：三秒 4,010 帧，全部在 MCS 11 上，它那条泳道上一次 ACK 超时也没有。',
  ],
  tryThis: [
    '点“在编辑器中打开”，把远端站点朝接入点挪半米。什么也不会发生：它跨不过任何门限，整段仿真一帧不差地重来一遍。挪两米才管用：上限从 MCS 2 抬到 MCS 3，三秒里交付的帧数从 3,003 变成 3,712。',
    '把它挪回去，再改成朝接入点挪五米。这回最底一级一次都不出现了——手里有这么多信号，发送端根本没有理由靠近它。',
  ],
  quiz: [
    {
      q: '一帧发出去了，没有答复回来。发送端对“为什么”知道些什么？',
      options: [
        '它知道信号撑不住自己选的那一级',
        '它只知道没有答复——弱信号和“邻居在同一个时隙开口”，在它那里长得一模一样',
        '接入点会在下一个信标（Beacon）里告诉它原因',
      ],
      answer: 1,
      explain: '速率控制唯一的输入，就是“ACK 回来了”还是“ACK 超时到了”。这里面没有任何东西能区分是哪一种原因打死了这一帧——所以竞争中的一串坏运气，能像一堵墙那样把级别拖下去。',
    },
    {
      q: '远端站点连着成功了二十次。它能升到 MCS 2 以上吗？',
      options: [
        '不能：MCS 2 是那个角落的信号定下的上限，再长的连胜也抬不动它',
        '能，只要攒够足够多的成功次数',
        '只有在近端站点停止上传时才可以',
      ],
      answer: 0,
      explain: '上限由距离和那堵砖墙钉死，发送端只能在上限以下的那些级别里挑。整段三秒的仿真里，远端站点一次也没有发到 MCS 2 以上。',
    },
  ],
}
