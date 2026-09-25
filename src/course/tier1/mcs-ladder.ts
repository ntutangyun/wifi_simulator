/**
 * Wi-Fi Tier 1 · M1 · lesson 4: the fourteen rungs, and the algorithm that
 * picks one. The second half of the old `decode-thresholds`.
 *
 * Born of the 2026-09-25 re-pacing
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, batch A). It
 * loads `decode-thresholds`'s own scene — which is `radio-primer`'s — so the
 * recorded timeline hashes are that run under a third id and nothing new is
 * simulated.
 *
 * The rate-picking procedure came here WHOLE, all five steps, together with
 * everything that demonstrates it: the ladder widget, the six printed rungs,
 * the worked living-room column and the four-position table. That was the one
 * thing the split had to get right — half a procedure in one lesson and half in
 * another is the failure mode the plan names by name — and it is why the
 * requirement itself (a rung's SINR, the hard threshold) stayed in
 * `decode-thresholds` while everything about CHOOSING a rung came here.
 *
 * Deleted on the way: the 连珠炮/许多个窄嗓门 restatements of the voice image,
 * which `radio-primer` now carries exactly once (§5.2 of the plan).
 *
 * Every number quoted below is pinned in tests/course/mcs-ladder.test.ts.
 */
import { J, firstAck, firstData, type Lesson } from '../lessonKit'
import { primerScenario, primerVariants } from './radioLink'

export const mcsLadder: Lesson = {
  id: 'mcs-ladder',
  module: 0,
  title: '十四级阶梯，以及发送端怎么挑一级',
  why: '上一课说清了一帧什么时候解得出来：每一级都有一个要求，够了就过。那么“级”到底是什么？Wi-Fi 的速率不是连续的旋钮，而是十四级台阶，每一级改两件事：一个符号（symbol）里塞几个比特，以及留多少给纠错。这一课摊开这把阶梯，再走一遍挑级的算法。',
  outcomes: [
    '说出升一级到底改变了什么：调制（modulation）与编码率（coding rate）',
    '仅凭到达电平就读出一条链路（link）能撑住的最高一级',
    '跟着算法走一遍：从信噪比（SNR）算到具体的那一级',
  ],
  needs: ['decode-thresholds'],
  terms: [
    { term: 'MCS', plain: '调制与编码方式：这把阶梯上的某一级，发送端敢说多快' },
    { term: 'OFDM', plain: 'Wi-Fi 的发送方式：几百个很窄的子载波并排，每个同时带走这一帧的一小部分' },
  ],
  picture: [
    { heading: '说得快，就要求线路更好', text: '每升一级，都要求信号比其余一切多高出一截。选了这条链路撑不住的一级，什么也过不去；选得太低，这一帧又白白多占空口时间（airtime）。这一级，就是调制与编码方式（modulation and coding scheme, MCS）。' },
    { kind: 'watch', jump: 0, heading: '去看一眼', text: '载入仿真，跳到笔记本的第一个数据帧（data frame），先看清这一块有多长。然后依次切过四个变体：笔记本越走越远，级别一路往下掉，而同一份 1530 个字节在时间轴上被明显拉长。' },
    { heading: '升一级，改的是哪两件事', text: 'Wi-Fi 不是把一路高速数据硬塞进信道，而是切成几百个很窄的子载波（sub-carrier），每个上面同时发一路慢的数据——这就是正交频分复用（orthogonal frequency-division multiplexing, OFDM）。升一级，一是让每个子载波多驮几个比特，要分辨的电平更多、挨得更近，信号就得更干净；二是少留一点冗余给接收端去修补。' },
  ],
  numbers: [
    { kind: 'table', heading: '十四级中的六级，20 MHz、单流', head: [
      'MCS', '调制', '每子载波比特', 'Mb/s',
      '灵敏度', '所需',
    ], rows: [
      ['0', 'BPSK 1/2', '0.5', '8.6', '−82 dBm', '8.99 dB'],
      ['1', 'QPSK 1/2', '1', '17.2', '−79 dBm', '11.99 dB'],
      ['3', '16-QAM 1/2', '2', '34.4', '−74 dBm', '16.99 dB'],
      ['7', '64-QAM 5/6', '5', '86.0', '−64 dBm', '26.99 dB'],
      ['10', '1024-QAM 3/4', '7.5', '129.0', '−54 dBm', '36.99 dB'],
      ['13', '4096-QAM 5/6', '10', '172.1', '−46 dBm', '44.99 dB'],
    ] },
    { text: '调制的名字说的是发送端在多少个符号之间做选择：两个电平是 BPSK（binary phase-shift keying），四个是 QPSK（quadrature phase-shift keying），再往后是 QAM（quadrature amplitude modulation，一张信号电平的方格）家族的 16、64、1024 和 4096。后面那个分数是编码率：1/2 表示一半是消息、一半是冗余。' },
    { kind: 'widget', widget: 'mcsLadder', params: { mode: 'eht', snrDb: 21.5 },
      caption: '完整的速率阶梯，标记停在客厅那台笔记本的信噪比（SNR）上（向下取整到 21.5 dB）。点亮的级就是放得下的，余量已经算进去了。' },
    { kind: 'steps', heading: '选级的算法，一步一步', items: [
      '把到达电平减去当前信道带宽（channel width）下的噪声地板（noise floor），差就是 SNR。',
      '给每一级算出所需的信干噪比（SINR）：它的灵敏度（sensitivity）加 90.99 dB，也就是把标准表格假设的那份噪声减回去。',
      '从底下往上走，留住最后一个满足“所需 SINR + 3 dB ≤ SNR”的级——这 3 dB 就是上一课那份速率余量。',
      '就用这一级发。接收端拿全程最差的那个 SINR 去比所需 SINR——余量是发送端留的，解码时不算它。',
      '在 20 MHz 上，第 1 到 3 步可并成一次查表：灵敏度不高于到达电平的那个最高级。捷径成立，是因为本仿真器比标准表格的假设多听见 3 dB，恰好与余量相抵。',
    ] },
    { kind: 'table', heading: '客厅那台笔记本，照着步骤走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['这条链路的到达电平', '−72.3 dBm'],
      ['减去 20 MHz 的噪声地板', '−93.99 dBm'],
      ['= SNR', '21.7 dB'],
      ['第 3 级的要求，加上余量', '16.99 + 3 = 19.99 dB ✓'],
      ['第 7 级的要求，加上余量', '26.99 + 3 = 29.99 dB ✗'],
      ['于是这一帧发出去时用的是', 'MCS 3'],
    ] },
    { kind: 'table', heading: '同一个 1530 字节帧，按位置', head: [
      '它在哪儿', '到达电平', 'SNR', 'MCS', '所需 + 3 dB', '空口时间',
    ], rows: [
      ['书桌，1 m', '−31.7 dBm', '62.3 dB', '13', '47.99 dB', '129.6 µs'],
      ['书房，5 m', '−52.7 dBm', '41.3 dB', '10', '39.99 dB', '143.2 µs'],
      ['客厅，9 m + 砖墙', '−72.3 dBm', '21.7 dB', '3', '19.99 dB', '415.2 µs'],
      ['远端墙边，14 m + 砖墙', '−78.1 dBm', '15.9 dB', '1', '14.99 dB', '768.8 µs'],
    ] },
  ],
  deeper: [
    { heading: '编码率买到的是什么', text: '每个调制名字旁边的那个分数——1/2、3/4、5/6——是发出去的内容里真正属于消息的那一部分；其余是冗余，接收端靠它修补被噪声打坏的地方。所以一级其实是两个选择合在一起：方格里有多少个符号，以及随行带上多少修补。第 3 级与第 7 级用的就是名字里写着的 16-QAM 与 64-QAM，只是分数不同——2 比特对 5 比特，代价是要求高出 10 dB。' },
    { heading: '为什么 Wi-Fi 6 只有十二级', text: '把小部件切到 HE（Wi-Fi 6）模式，最上面两级就消失了：4096-QAM 是 Wi-Fi 7（802.11be）才加进来的。同一条链路在两代设备上会挑到不同的级，而挑级的算法一个字也没变。' },
  ],
  sources: [
    '最小输入灵敏度表：OFDM PHY 见 §17.3.10.2，HE 见 §27.3.19.4，EHT 有对应条款。每一级的调制与编码率见各 PHY 的 MCS 表；本课的 Mb/s 是 20 MHz、单空间流、0.8 µs 保护间隔下的数值。',
    '“挑哪一级”标准从不规定：速率控制留给实现者，所以这里的 3 dB 余量与“灵敏度不高于到达电平”的查表法，都是本仿真器的模型取值。',
  ],
  scenario: () => primerScenario(9),
  variants: primerVariants,
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [
    '读出四个变体里第一个数据帧的 MCS：13、10、3、1——上表那四个比值在阶梯上点亮的级。',
    '再读这一帧的空口时间：129.6、143.2、415.2、768.8 µs。往下走十二级，同样的 1530 个字节要多花近六倍的空口时间。',
  ],
  tryThis: [
    '在上面的阶梯里，把滑杆先调到 15.9 dB，再调到 62.3 dB：最高可用级从 MCS 1 变成 MCS 13——46 dB 换来十二级。再按下 HE（Wi-Fi 6）那个模式按钮，最快的两级就消失了。',
    '在编辑器里打开远端墙边变体，把笔记本的发射功率（transmit power）从 15 dBm 降到 12 dBm。到达电平刚好跌到原来那一级的灵敏度之下，于是降一级，时长从 768.8 µs 拉到 1476.0 µs：3 dB 几乎让空口时间翻倍。',
  ],
  quiz: [
    {
      q: '同样的 1530 字节帧，为什么在书桌旁只要 129.6 µs，到远端墙边却要 768.8 µs？',
      options: [
        '路由器在远处应答更慢',
        '远处那条链路只撑得住低的一级，每个子载波驮的比特更少，同样的字节要用更多符号',
        '砖墙让这一帧在路上耽搁了',
      ],
      answer: 1,
      explain: '路上没有什么东西被拖慢：这一帧走 MCS 1 而不是 MCS 13，因为比值只够到这一级。',
    },
    {
      q: '一条链路的到达电平是 −73 dBm，20 MHz。按第 5 步那条捷径，它能撑住哪一级？',
      options: [
        'MCS 3：灵敏度 −74 dBm，不高于 −73 dBm；下一级要 −70 dBm',
        'MCS 4：离 −70 dBm 只差 3 dB，余量正好补上',
        '说不出来：不知道地板就没法挑',
      ],
      answer: 0,
      explain: '捷径就是“灵敏度不高于到达电平的那个最高级”。第 3 级够，第 4 级不够；那 3 dB 已经含在这张表里，不能再补一次。',
    },
  ],
}
