/**
 * Wi-Fi Tier 1 · M1 · lesson 3: one question, asked once — when does a frame
 * decode? The answer is a hard threshold: the worst SINR of the whole frame
 * against the requirement of the rung it was sent at, with the sender's 3 dB
 * held back for the wobble.
 *
 * Re-paced on 2026-09-25 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md,
 * batch A). The lesson used to carry four things: the three questions, the
 * requirement, the fourteen-rung ladder and the rate-picking algorithm. The
 * ladder and the algorithm are now `mcs-ladder`, which loads this lesson's own
 * scene; the CCA thresholds — the −82/−62 dBm pair and the twenty decibels
 * between them — go to `cca` (M4), where a station is actually seen freezing on
 * a neighbour's frame. Nothing in these four variants ever produces a busy CCA,
 * which is why that material could not stay: it had a table and a quiz and
 * nothing to watch.
 *
 * What is left is one rule and one procedure. The requirement's derivation came
 * up out of `deeper` onto the main path — it is the lesson's whole subject now
 * — and the wide-channel corner case went the other way, out of `deeper` and
 * into `tryThis`, because it is the experiment that proves the threshold is
 * hard: at 160 MHz the far-wall link is heard perfectly and decodes nothing.
 *
 * Every number quoted below is pinned in tests/course/decode-thresholds.test.ts.
 */
import { J, firstAck, firstData, type Lesson } from '../lessonKit'
import { primerScenario, primerVariants } from './radioLink'

export const decodeThresholds: Lesson = {
  id: 'decode-thresholds',
  module: 0,
  title: '一帧什么时候解得出来',
  why: '信号能到，不等于这一帧能被听懂。发送端挑的那一级速率——调制与编码方式（modulation and coding scheme, MCS）——对信号比噪声高出多少提了一个要求；接收端收完整帧，拿全程最差的那个比值去对照它。这里没有“勉强听懂”：到了就整帧解出，差 0.1 dB 就整帧作废。',
  outcomes: [
    '说清一帧解得出来与解不出来之间那条线画在哪里',
    '从标准的灵敏度（sensitivity）表算出某一级所需的信干噪比（SINR）',
    '讲清发送端多留的那 3 dB 是谁的、什么时候用',
  ],
  needs: ['radio-primer'],
  terms: [
    { term: 'MCS', plain: '调制与编码方式：发送端挑的那一级速率；下一课摊开十四级' },
    { term: 'sensitivity', plain: '灵敏度：某一级还能被解出来的最弱到达功率，标准给每一级一个数' },
    { term: 'rate margin', plain: '速率余量：发送端在所选那一级的要求之上多留的 3 dB' },
  ],
  picture: [
    { heading: '一道硬门限', text: '接收端不会“听懂了一半”。它把整帧收完，取全程最差那一瞬间的信干噪比（SINR），和这一帧所用那一级的要求比一下：到了就记 RX_OK，随即回一个确认帧（ACK）；差一点就记 RX_FAIL，而发送端只看到一段等不到答复的沉默。' },
    { kind: 'watch', jump: 0, heading: '去看一眼', text: '载入仿真，跳到笔记本的第一个数据帧（data frame），再看它右边紧跟着的那一小块：那是路由器的确认帧。四个变体里，每一个数据帧后面都跟着这么一块——这条链路（link）一帧也没丢。' },
    { heading: '是三个问题，不是一个', text: '接收端对空中的一股能量要问三个问题：抓不抓得住它开头那段前导码（preamble）？空中是不是吵到我不该开口？整帧收完，解不解得出来？前两个合起来叫空闲信道评估（clear channel assessment, CCA），是后面讲信道接入时的事；这一课只管第三个。' },
  ],
  numbers: [
    { kind: 'table', heading: '三个问题', head: [
      '问题', '条件', '接下来会怎样',
    ], rows: [
      ['我抓到前导码了吗？',
       '接收信号强度指示（RSSI）≥ −82 dBm 且 SINR ≥ 4 dB',
       '前导检测（preamble detection）成功，开始接收；够响却不到 4 dB 则记 RX_MISS。'],
      ['空中是不是太吵？',
       '空中总功率 ≥ −62 dBm',
       '判忙，但没有可解的内容——对不是 Wi-Fi 的能量，这是仅剩的判据。'],
      ['我解得出来吗？',
       '整帧期间最差的 SINR ≥ 该 MCS 的要求',
       'RX_OK 并回确认帧；不够则 RX_FAIL，发送方等到超时。'],
    ] },
    { kind: 'formula', heading: '这个要求是从哪儿来的', text: '所需 SINR = 灵敏度 − kTB(20 MHz) − 10 dB = 灵敏度 + 90.99 dB', note: '标准给的不是比值，而是每一级的最小输入灵敏度；那张表假设了 10 dB 的噪声系数，所以把它假设的噪声减回去，剩下的才是这一帧真正需要的比值。第 0 级灵敏度 −82 dBm，所需 8.99 dB。' },
    { kind: 'steps', heading: '判一帧解不解得出来，一步一步', items: [
      '查出这一帧所用那一级的灵敏度：客厅那台笔记本发第 3 级，标准给 −74 dBm。',
      '加上 90.99 dB，得到所需 SINR：16.99 dB。它与信道带宽（channel width）无关——更宽的信道只靠抬高噪声地板（noise floor）来缩短覆盖。',
      '取整帧期间最差的那个 SINR 和它比。这条链路给出 21.66 dB，够了：RX_OK，路由器回确认帧。',
    ] },
    { kind: 'table', heading: '那 3 dB 在哪一边', head: [
      '这一次比较', '发送端挑级的时候', '接收端解码的时候',
    ], rows: [
      ['用的门槛', '所需 SINR + 3 dB = 19.99 dB', '所需 SINR = 16.99 dB'],
      ['这条链路给出的', '21.66 dB ✓', '21.66 dB ✓'],
      ['要是不够', '退到下一级，帧变长', '整帧作废，发送端只看到沉默'],
    ] },
  ],
  deeper: [
    { heading: '那张表里还藏着 5 dB', text: '标准的灵敏度表除了假设 10 dB 的噪声系数，还预先扣掉了 5 dB 的实现余量，用来覆盖相位噪声、信道估计误差之类。这 5 dB 留在要求之内没有减回去，因为接收机的这些损伤对干扰和对噪声一样起作用。另外，本仿真器自己的 7 dB 噪声系数比标准假设的 10 dB 好 3 dB——这个差值，正好等于发送端留的那 3 dB 速率余量，两者在 20 MHz 上相互抵消。',
    },
    { kind: 'list', heading: '简化之处，明说', items: [
      '解码是一道硬门限：达到要求就一定解得出，低于就一定失败。真实接收机是一条在几个 dB 内陡降的误码率曲线。',
      '没有衰落，也没有多径：到达电平只由几何位置和墙决定，同一个位置永远得到同一级。',
      '所有电台共用一个噪声系数；聚合帧也是整体成败。这两点都会在后面的阶段改变。',
    ] },
  ],
  sources: [
    '最小输入灵敏度表：OFDM PHY 见 §17.3.10.2，HE 见 §27.3.19.4，EHT 有对应条款；每一处都写明了 10% 误包率的条件，以及其背后 10 dB 噪声系数与 5 dB 实现余量的假设。',
    '−82 dBm 的前导检测门限与 −62 dBm 的能量检测门限，出自 §17.3.10.6 的空闲信道规则，并原样沿用到后来的各 PHY；这一对门限本身是后面「空闲判断」那一课的主题。',
    '4 dB 的前导检测比值与 3 dB 的速率余量都是本仿真器的模型取值，并非标准正文；把灵敏度表换算成所需 SINR 同样如此，真实接收机只是近似遵循。',
  ],
  scenario: () => primerScenario(9),
  variants: primerVariants,
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [
    '跳到客厅变体的第一个数据帧：它走第 3 级，所需 16.99 dB，而这条链路给出 21.66 dB。紧接着就是路由器的确认帧——这一帧解出来了。',
    '四个变体跑满 100 ms，没有重传（retry）、没有超时，也没有一次接收失败：四条链路都停在自己的上限上，可要求之上仍留着 3 dB 速率余量。',
  ],
  tryThis: [
    '在编辑器里打开远端墙边变体，把两端的信道带宽改成 80 MHz。地板抬到 −87.97 dBm，比值掉到 9.89 dB——低于第 0 级含余量的 11.99 dB，却高于它 8.99 dB 的裸要求——于是每一帧照样被确认。',
    '再改成 160 MHz：比值只剩 6.87 dB。前导码依然检测得到，接收照样开始、照样等待，可什么也解不出来——每次接收都以 RX_FAIL 收场。一条链路可以听得清清楚楚，却完全不能用。',
  ],
  quiz: [
    {
      q: '远端墙边那台笔记本换到 160 MHz 后，路由器一个确认帧也不回。为什么？',
      options: [
        '太弱了，前导码根本没被检测到',
        '前导码检测得到，接收也开始了，但整帧的比值低于这一级的要求，于是 RX_FAIL',
        '地板抬高之后接收端会自动关掉这条链路',
      ],
      answer: 1,
      explain: '到达电平 −78.08 dBm 高于 −82 dBm，6.87 dB 也高于开始接收要的 4 dB，接收正常开始。卡住的是第三个问题：6.87 低于 8.99 dB。',
    },
    {
      q: '发送端多留的那 3 dB，接收端解码时算不算？',
      options: [
        '算：接收端要所需比值再加 3 dB',
        '不算：接收端只拿最差的比值去比裸要求，3 dB 是发送端留给起伏的',
        '算一半：所需比值加 1.5 dB',
      ],
      answer: 1,
      explain: '80 MHz 那个实验就是证据：9.89 dB 低于含余量的 11.99 dB，却高于 8.99 dB 的裸要求，每一帧仍被确认。余量决定发送端敢挑哪一级，不决定这一帧解不解得出。',
    },
  ],
}
