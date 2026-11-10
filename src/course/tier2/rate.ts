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
  title: '速率控制——决定用多高的速率发送',
  why: '发送端必须先决定用多高的速率，然后才能发送，而无论选得过高还是过低都有代价。选得太高，接收端解不出这一帧，数据无法送达；选得太低，帧虽然都能送达，但每一帧占用空口的时间远长于实际需要，而这段时间里其他设备都只能等待。没有任何一方会告诉发送端哪一级才对，它只能从收到的答复中自行推断。正确的那一级，是这条链路（link）的信号仍可支持的最高一级，也就是它的上限；决定上限的是距离和墙，不是发送端：接收电平减去噪声地板（noise floor）得出信噪比（signal-to-noise ratio, SNR），从最低一级向上逐级比较，保留最后一个在额外多留几个分贝之后仍满足要求的级，而两端未共同启用的能力还会进一步压低它。隔着砖墙的远端站点（STA）上限很低，它的帧大多以上限发送，也有一部分降到低一至两级；每降一级，每帧的空口时间（airtime）增加约一半，降到最低一级时接近三倍；整段仿真中它从未超过上限。距接入点（AP）一米的近端站点，信号足以支持最高一级，但由于两端都没有启用最高的两级，每一帧都使用能力允许的最高一级，始终不变。发送端每发一帧只得到一项信息：收到了确认帧（acknowledgement, ACK），或者没有收到；信号太弱与邻居同时开始发送，在它看来完全相同，所以它的选择始终建立在并不完全准确的证据上。',
  outcomes: [
    '说出为什么“固定一档速率”无论偏高还是偏低都是错误的选择',
    '在时间轴上读出一条链路（link）的上限，并说明它由什么决定',
    '说出发送端从一帧中唯一能得到的信息，以及它始终无法得知的信息',
    '手工计算一遍上限：哪些量参与计算，哪些量根本不参与',
  ],
  needs: ['mcs-ladder', 'retries-queues', 'rate-vs-model', 'width'],
  terms: [
    { term: 'ceiling', plain: '这条链路的信号实际可支持的最高一级；决定它的是距离和墙，不是发送端' },
    { term: 'attempt', plain: '发送一帧的一次操作；它算成功还是失败，取决于是否收到答复' },
  ],
  picture: [
    { heading: '错的两种方式', text: '选择这条链路无法支持的级别，接收端就解不出这一帧：帧发送了，空口时间（airtime）消耗了，数据却没有送达。选择远低于链路能力的级别，每一帧都能送达——但每一帧占用信道的时间是实际需要的好几倍，而在这段时间里，房间里其他电台都不能发送。正确的那一级，是这条链路仍可支持的最高一级；而人员走动、门的开关，都会使这一级发生变化。' },
    { heading: '这条链路的上限', text: '本场景中有两台站点（STA）以满负荷向同一个接入点（AP）上传：一台在接入点旁边的桌上，一台在房间另一端、隔着一堵砖墙的角落里。一条链路的信号实际可支持的最高一级，就是它的上限；远端那台无论如何都无法超过它，因为那个角落的信号无法支持更高阶的调制与编码方式（modulation and coding scheme, MCS）。决定这个上限的，是距离和那堵墙。上限以下的级别选择，才是发送端逐帧自行做出的决定。' },
    { kind: 'watch', jump: 0, heading: '在时间轴上观察', text: '载入仿真，跳到第一个数据帧（data frame），然后沿远端站点的泳道向后观察几秒：它的方块长度不断变化，而近端站点的方块长度始终不变。房间里没有任何物体移动，变化的只是一台发送端的选择。' },
    { heading: '发送端唯一得到的信息', text: '发送端无法观测接收端的信号，它掌握的只有返回的答复。发送一帧的一次操作就是一次尝试；它只有两种结果：要么收到确认帧（acknowledgement, ACK），要么 ACK 超时（ACK timeout）。仅这一项信息——有答复，或没有答复——就是速率控制的全部输入。它无法区分一帧是因为信号太弱而失败，还是因为“邻居在同一个时隙（slot time）同时开始发送”而失败；从发送端的角度看，两者完全相同。所以它的选择始终建立在并不完全准确的证据上——它如何根据这一项信息上调或下调级别，是下一课的内容。' },
  ],
  numbers: [
    { kind: 'table', heading: '远端站点的帧：三个级别，同样的 1,530 字节，20 MHz，单流', head: [
      '级别', '速率一行',
      '空口时间', '占它帧数的比例',
    ], rows: [
      ['MCS 2——它的上限', '25.8 Mb/s', '524.0 µs', '79.8%'],
      ['MCS 1', '17.2 Mb/s', '768.8 µs', '17.2%'],
      ['MCS 0——最低一级', '8.6 Mb/s', '1,476.0 µs', '3.0%'],
    ] },
    { heading: '降一级的代价', text: '每降一级，同样长的一段信号所承载的比特数就减半或接近减半，所以同样的内容，在最低一级要占用将近上限三倍的空口时间。' },
    { heading: '无需做选择的那台站点', text: '距接入点一米的近端站点，三秒内发送了 4,010 帧，每一帧都使用 MCS 11，而且每一帧都收到了答复。停在这一级并不是因为信号不足——58.7 dB 足以支持最高一级——而是因为两端协商的能力只到这一级：本场景中两端都没有启用最高的两级，上限因此被限制在这两级之下。' },
    { kind: 'steps', heading: '上限的计算方法：每一帧都重新计算一次', items: [
      '取这条链路此刻的接收信号强度指示（received signal strength indicator, RSSI）：它由距离和那堵墙决定，发送端只能读取，不能改变。',
      '取两端协商的带宽，算出这个带宽下的噪声地板（noise floor）；信噪比（signal-to-noise ratio, SNR）就是 RSSI 减去它。这一幕里两端都是 20 MHz，噪声地板 −93.99 dBm。',
      '查看两端协商了哪些能力：如果两端没有共同启用 4096-QAM（quadrature amplitude modulation），上限先被限制为 MCS 11——这一步只取决于能力，与信号无关。',
      '从最低一级向上逐级检查，保留最后一个满足“该级所需信干噪比（signal-to-interference-plus-noise ratio, SINR）+ 3 dB 速率余量 ≤ SNR”的级，且不超过上一步得出的能力上限。这就是这条链路此刻的上限。',
      '把上限交给速率控制：当前级别只要高于上限，就立即被降到上限——然后这一帧以当前级别发送。上限以下如何调整，是下一课的内容。',
    ] },
    { kind: 'table', heading: '远端那条链路，按步骤计算一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['远端链路的 RSSI', '−75.46 dBm'],
      ['减去 20 MHz 的噪声地板', '−93.99 dBm'],
      ['= SNR', '18.53 dB'],
      ['能力上限：两端都未启用 4096-QAM', 'MCS 11'],
      ['MCS 2 的要求，含余量', '13.99 + 3 = 16.99 ✓'],
      ['MCS 3 的要求，含余量', '16.99 + 3 = 19.99 ✗'],
      ['于是上限是', 'MCS 2'],
    ] },
  ],
  deeper: [
    { heading: '多用户帧同样会上报结果', text: '上报给速率控制的是每一次交换，不只是单用户交换：一个下行多用户 PPDU 会为每个成员各上报一次成功或失败，所以一个只在多用户 PPDU 中使用的级别同样会自适应调整。' },
  ],
  limits: [
    { kind: 'threshold', text: '「可支持」在这里是非此即彼的：接收端把整帧期间最差的那个信噪比与该级要求比较一次，满足则整帧无误，差 0.01 dB 就整帧丢弃（channel.ts 的 resolveLock）。真实链路给出的是一条平滑的误包率曲线，门限附近有几成帧成功、几成失败，而速率控制正是依靠这段过渡带工作的——它有意让链路工作在误包率为百分之几的那一级。本仿真器里「可支持」与「无法支持」之间没有任何过渡带，所以上限是一个精确到小数点后两位的数。' },
    { kind: 'model-value', text: '步骤第四条中的 3 dB 速率余量是本仿真器选定的一个数（phy.ts 的 RATE_MARGIN_DB），标准中完全没有提及；每一级所需信噪比则是用第 36 章的最小灵敏度减去按 10 dB 噪声系数计算的噪声地板反推得到的，而噪声地板本身按 7 dB 计算。改变这个余量，远端那条链路的上限就随之改变：本课那张「按步骤计算一遍」的表，最后一行取决于这个取值。' },
    { kind: 'unmodelled', text: '上限依据的是这条链路的平均电平，而不是这一帧实际到达的电平：mcsForPeer 取的是静态链路表中的值（simulation.ts），即使场景启用了衰落也是如此。这是有意的设计——发送端在帧尚不存在时选级，不可能知道这一帧会经历的衰落——但结果是本仿真器里上限只随几何位置与墙变化。真实设备会根据最近收到的帧估计信噪比，使上限随之变化，而不是把这件事完全交给失败计数。' },
    { kind: 'out-of-scope', text: '「每一次交换都会上报结果」这句话对触发式上行并不成立：一次触发交换中返回的 TB PPDU 既不上报成功也不上报失败，引擎在这条路径上从不调用 onTxOutcome（mac.ts 的 sendMba 一侧）；只有单用户交换和下行多用户 PPDU 会上报（resolveDlMu 的逐成员循环）。所以在那一课的场景里，级别完全由信号上限决定，本课所讲的这个回路根本不起作用。' },
  ],
  sources: [
    '一条链路能支持哪一级，用的是本仿真器自己的 `mcsForRssi`：把接收功率与 IEEE Std 802.11-2024 第 36 章的各级最小输入灵敏度相比，再加一个固定余量。这个余量是模型取值，标准并没有规定它。',
    '三个空口时间来自 §17.4.3 的 TXTIME 公式，代入的是本仿真器为这类 PPDU 选定的代表性前导与符号长度；“速率一行”是该级别在这个带宽、单流下的调制编码速率。',
    '“发送端只知道有没有收到答复”，正是标准的设计：§10.3.2.9 把确认帧定为成功与否的唯一指示，并没有为它定义任何关于接收信号质量的反馈。',
  ],
  scenario: () => rateScenario(),
  jumps: [
    J('第一个数据帧', firstData),
    J('第一次 ACK 超时', (r) => r.type === 'ACK_TIMEOUT'),
    J('第一次重传', firstRetry),
  ],
  observe: [
    '随着仿真推进，远端站点的方块时长时短：在上限 MCS 2 上是 524.0 µs，降一级是 768.8 µs，到最低一级是 1,476.0 µs。这个选择明显在变化，并不固定。',
    '运行完整个三秒，远端站点一次也没有以高于 MCS 2 的级别发送。上限是它到达之后就不再上升的边界，而不是一个偶尔会被超过的目标。',
    '距接入点一米的近端站点则始终不变：三秒 4,010 帧，全部使用 MCS 11，它的泳道上没有一次 ACK 超时。',
  ],
  tryThis: [
    '点击“在编辑器中打开”，把远端站点向接入点移近半米。结果没有任何变化：它没有越过任何门限，整段仿真逐帧完全相同地重现。移近两米才有效果：上限从 MCS 2 提高到 MCS 3，三秒内交付的帧数从 3,003 增加到 3,712。',
    '把它移回原处，再改为向接入点移近五米。这一次最低一级一次也不出现——信号如此充裕，发送端根本没有理由降到那一级。',
  ],
  quiz: [
    {
      q: '一帧发出去了，没有答复回来。发送端对“为什么”知道些什么？',
      options: [
        '它知道信号无法支持自己选的那一级',
        '它只知道没有收到答复——信号太弱与“邻居在同一个时隙同时开始发送”，在它看来完全相同',
        '接入点会在下一个信标（Beacon）里告诉它原因',
      ],
      answer: 1,
      explain: '速率控制唯一的输入，就是“收到 ACK”还是“ACK 超时”。其中没有任何信息能区分这一帧因哪一种原因失败——所以竞争造成的连续失败，也会像墙造成的信号衰减一样使级别下降。',
    },
    {
      q: '远端站点连续成功了二十次。它能升到 MCS 2 以上吗？',
      options: [
        '不能：MCS 2 是那个角落的信号决定的上限，再多的连续成功也无法提高它',
        '能，只要累积足够多的成功次数',
        '只有在近端站点停止上传时才可以',
      ],
      answer: 0,
      explain: '上限由距离和那堵砖墙决定，发送端只能在上限以下的级别中选择。在整段三秒的仿真中，远端站点一次也没有以高于 MCS 2 的级别发送。',
    },
  ],
}
