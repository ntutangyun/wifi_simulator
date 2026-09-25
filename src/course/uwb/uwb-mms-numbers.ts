/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · Fragments, budgets and the 12 dB.
 *
 * The second half of the old `uwb-mms`: the arithmetic under the picture next
 * door. One millisecond's energy allowance and what a fragment spends of it;
 * what X fragments add up to; the three decibels between four fragments and
 * eight, which in this room are the difference between a fix every block and
 * nothing at all; the fourteen-millisecond ruler a train is, which measures the two
 * crystals against each other well enough that single-sided ranging needs no
 * second round trip; and the honest share of the 19.57 dB a train beats a 4z
 * Poll by in this room — 9.03 of it, the rest being a transmitter that never
 * spends its budget.
 *
 * It loads exactly the scene `uwb-mms` loads — the same builder, the same three
 * variants — so the split adds no new scenario and the recorded hashes of
 * `uwb-mms-numbers` are `uwb-mms`'s, value for value.
 *
 * Every number quoted below is pinned in tests/course/uwb-mms-numbers.test.ts.
 */
import { J, firstNbReport, firstUwbRange, firstUwbRsf, firstUwbTrain, type Lesson } from '../lessonKit'
import { uwbMmsScenario } from './uwb-mms'

export const uwbMmsNumbers: Lesson = {
  id: 'uwb-mms-numbers',
  module: 15,
  title: '片段、预算，和那 12 dB',
  why: '多毫秒测距（multi-millisecond, MMS）里，一串片段（fragment）要么越过了接收机的门限，要么没有，而决定这件事的，是一笔在信封背面就能算完的算术。这一课就来算它：一毫秒的能量值多少，一个片段花掉其中多少，一串片段加起来是多少——以及这份改善里，有多少真正属于那个新想法，又有多少只是因为老式发射机浪费惯了。',
  outcomes: [
    '算出一串片段加起来是多少，以及它有没有越过接收机门限',
    '说清为什么把一串片段砍掉一半，整个房间就一次测距也没有了',
    '把增益里属于“想法”的那部分，与属于发射功率（transmit power）的那部分分开',
  ],
  needs: ['uwb-mms'],
  terms: [
    { term: 'combining gain', plain: '接收机把一串片段加起来之后，整串比其中一个片段响了多少' },
    { term: 'clock ratio', plain: '一台设备的晶振相对另一台跑得有多快，用百万分之几表示' },
    { term: 'parameter set', plain: '一组起好名字的现成取值：片段多长、一串多少个，两端用一个名字就能说定' },
  ],
  picture: [
    { heading: '是额度，不是天花板', text: '发射机头上的那条规矩，是在每一毫秒上取的平均，所以它是一份能量额度，而不是一条功率红线。这一毫秒之内怎么花，由你决定。把它倒进一小段突发里，这段突发就更响；摊在一帧长帧上，这帧就更轻。能量一样多，响度却不同。' },
    { kind: 'watch', jump: 1, heading: '看那笔加法被算出来', text: '载入仿真，跳到对第一串片段的判定。那一行把整笔加法念了出来：收到几个片段、每个多响、合成增益（combining gain）加了多少、余下多少作为余量，以及——只有余量为正时才有的——那个时钟比值（clock ratio）。' },
    { heading: '用分贝相加', text: '等功率的片段，按等量相加的规矩累加：数量翻倍，累加量也翻倍，换成分贝就是多三个。四个片段比一个高六分贝，八个高九分贝，十六个高十二分贝。而余量，不过是把接收机自己的门限从这个和里减掉以后剩下的东西；余量为正，就算检出。' },
    { heading: '能用与报废之间的三个分贝', text: '把一串砍成一半，房间里别的什么都没变。每个片段和先前一样响，而且一个不落地都收到了；变小的只有那个和，正好小三个分贝，于是它落到了门限之下。三个原本每块都测距的锚点（anchor），如今一次也测不出，每一轮都以超时收场。' },
    { heading: '一把十四毫秒长的尺子', text: '这一串片段同时也是一把尺子。它的各个片段在发送方的时钟上每隔一个轮次间隔发出——在这一轮里是四个时隙、两毫秒——于是用自己的计数器量这段跨度，就是在直接比较两块晶振（crystal）：这就是时钟比值，量在整串上，不是量在一帧上。也正因为如此，这里的单边交互可以不做第二次往返。' },
    { heading: '对增益要诚实', text: '在这里把一串片段和一帧普通的测距帧放在一起比，片段这一串赢得很多——但赢的并不全是那个新想法。其中一部分，是因为片段更短，同样的能量因此更响。更大的一部分，是那台普通发射机压根没把额度花掉。真正由“许多毫秒”买来的，只有合成增益。' },
  ],
  numbers: [
    { kind: 'table', heading: '一个片段是什么，花掉多少', head: [
      '项', '取值',
    ], rows: [
      ['一毫秒的能量', '37 nJ'],
      ['一帧普通 poll', '36 octets, 203.782 µs, 8.11 nJ'],
      ['一个片段', '40 × 4 × (128 + 2 × 64) = 40 960 chips, 82.051 µs, −3.46 dBm'],
      ['同一件事，在 rsf-1 里', '62.179 µs, −2.25 dBm, +1.20 dB'],
      ['接收机需要的门限', '−93 dBm'],
    ] },
    { kind: 'formula', heading: '一串加起来是多少', text: 'gain = 10·log10(X)      margin = rx + gain − (−93 dBm)', note: '这个房间里每个片段单独到达时都低于门限，所以整份余量都是这一串挣来的。' },
    { kind: 'table', heading: '同一个房间里的三种序列', head: [
      '序列', '每个片段',
      '增益', '余量', '结果',
    ], rows: [
      ['4 × 82.051 µs', '−100.26 / −100.07 dBm', '+6.02 dB', '−1.24 / −1.05 dB',
        '丢失'],
      ['8 × 82.051 µs', '−100.26 / −100.07 dBm', '+9.03 dB', '+1.77 / +1.96 dB',
        '检出'],
      ['16 × 62.179 µs', '−99.05 / −98.86 dBm', '+12.04 dB', '+5.99 / +6.18 dB',
        '检出'],
    ] },
    { text: '把前两行对着读：同样的片段、同样的电平、都收到了，而判定在 3.01 dB 的算术上翻了面——代价是整段运行的 21 次测距全部落空。' },
    { kind: 'formula', heading: '把那把尺子换成数字', text: 'ratio = 实测跨度 / ((j − i) × gap)      σ_ratio = √2 · σ_ts / ((j − i) × gap)', note: '这一轮的间隔是 2 ms，所以从一串的第一个片段到第八个是 14 ms；100 ps 的时间戳在这段跨度上给出 σ_ratio = 0.0101 百万分之几（ppm）——而这里的晶振是设定的、不是抽样的，所以有真值可以对照着查。' },
    { kind: 'table', heading: '这个比值，作用在 0.5 ms 的回复上', head: [
      '修正方式', '留下多少',
    ], rows: [
      ['第 0 轮量得，真值为 40 / 20 / 10 ppm',
        '39.985, 19.996, 9.984 ppm'],
      ['不修正，相差 40 ppm', '3.00 m'],
      ['晶振偏到极限', '1.5 m'],
      ['4z 的载波估计', '1.5 cm'],
      ['这一串的 0.0101 ppm', '0.76 mm'],
      ['两个接收时间戳给任何测距垫出的底，取 21 次', '2.10 cm'],
    ] },
    { text: '最后一行才是重点：光是两个接收时间戳就值 2.1 cm，所以这一串留下的那点时钟零头根本看不见。' },
    { kind: 'table', heading: '那 19.57 dB 从哪来', head: [
      '组成', '大小',
    ], rows: [
      ['八个片段的合成', '9.03 dB'],
      ['片段更短', '3.95 dB'],
      ['从没花完的预算', '6.59 dB'],
      ['poll 与整串到达时', '−110.80 dBm, −91.23 dBm'],
    ] },
    { text: '其中两项谈的是发射机，不是想法：合起来 10.54 dB，而老式的突发发射机本可保持 −7.41 dBm，一样合规。诚实的说法是那 9.03 dB。' },
    { kind: 'steps', heading: '整笔加法，一项一项地算', items: [
      '先算 E，一毫秒的能量。上限写成“每兆赫多少平均功率”；把它乘上信道的带宽，再持续一毫秒，得到的就是一份能量——发射机爱怎么花就怎么花。',
      '再算 t，一个片段的长度。一个符号（symbol）是扩频因子乘以“序列长度加上两侧的间隔”；把这个符号按参数集（parameter set）规定的遍数重复，再除以码片（chip）速率。',
      '再算 P，一个片段值多少。片段把整个 E 花在 t 这么短的一段里，于是 P = 10·log10(E / t)：片段越短，它就越响。',
      '再算 rx，到达时的电平。从 P 里依次扣掉：一米处的损耗、按引擎自己的路径损耗（path loss）指数算出的距离项，以及射线每穿一道墙的固定收费。',
      '再算 G，合成增益。接收机把听到的 X 个片段加起来，而等量相加给出 G = 10·log10(X)——整笔加法里，只有这一项是“许多毫秒”买来的。',
      '最后算余量，并给出判定。把接收机的灵敏度（sensitivity）S 从这个和里减掉：余量 = rx + G − S。不小于零就算检出；小于零，这一串就丢了，什么也量不出来。',
    ] },
    { kind: 'table', heading: '同样这六行，落在本场景上', head: [
      '符号', '本场景',
    ], rows: [
      ['E，一毫秒', '−41.3 dBm/MHz × 499.2 MHz = −14.3 dBm → 37 nJ'],
      ['t，一个片段的长度', '40 × 4 × (128 + 2 × 64) = 40 960 chips → 82.051 µs'],
      ['P，一个片段', '10·log10(37 / 82.051) = −3.46 dBm'],
      ['rx，到达时', '−3.46 − (50.50 + 22.30 + 24) = −100.26 dBm'],
      ['G，八个与四个', '+9.03 dB · +6.02 dB'],
      ['余量，S = −93 dBm', '+1.77 dB · −1.24 dB'],
    ] },
  ],
  deeper: [
    { heading: '更大的参数集要付什么', text: '参数集 rsf-1 是十七个强制参数集之一：X = 16，重复次数仍是 40，但间隔是 33 个零而不是 64，于是片段从 82.051 µs 缩到 62.179 µs，同样一毫秒的能量装进去就响了 1.20 dB。十二个分贝的合成再加这 1.20，把余量从 +1.8 dB 抬到 +6.0。代价也有：测距阶段从 20 个时隙涨到 32 个，一轮成对测距从 14 ms 涨到 20 ms，于是三轮要占掉块里的 60 ms，而不是 42 ms。而本场景自己那一串，根本不在这十七个之列：X = 8、重复 40 次、间隔 64 个零，对不上任何一个有名字的参数集——它是测距周期自带的那组默认值。' },
    { heading: '同一行字，两串片段', text: '判定那一行本身就是整笔加法，所以两次运行只差其中一项。八个片段时：“anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.997 ppm · responders: anchor-1, anchor-2, anchor-3”。四个片段时：“anchor-1 RSF train ← tag-1: 4/4 heard, -100.3 dBm + 6.0 dB = margin -1.2 dB → lost”。电平一样、收得一样全，只差三个分贝——而后一行连比值都没有，因为一串从未被检出的片段，也就从未被测量过。' },
    { heading: '为什么普通射频是彻底失败，而不是稍差一点', text: '在同一个房间里跑普通的单边双向测距，1.3 秒内一次测距也没有：42 次超时，一半是锚点在等一帧它们从没听见的 poll，另一半是标签把响应时隙等空。那帧 poll 到达时是 −110.80 dBm，比接收机低了将近十八个分贝，而那个模式里没有任何东西会累加。一台射频要么检出一帧，要么检不出；没有可供叠加的“半分”。' },
    { heading: '为什么比值量在整串上，而不是量在一帧上', text: 'σ_ratio 随跨度变大而变小：两个带 100 ps 噪声的时间戳，相隔 14 ms 取得，给出 0.0101 ppm；而同样两个时间戳若取在一个 82 µs 的片段两端，大约是 1.7 ppm——比它想测的那块晶振还差。一串片段恰好长在帧短的地方，所以一个为“够得着”而生的模式，顺带也成了最会测时钟的那个。' },
  ],
  sources: [
    '本课只有一个数字来自法规：按毫秒平均的 −41.3 dBm/MHz 平均等效全向辐射功率，正是它把这件事变成一份预算。单位、块与时隙则出自 IEEE Std 802.15.4-2024。',
    '多毫秒分组、它的片段以及那些参数集，都来自 P802.15.4ab：它处于 Sponsor 投票再循环阶段，版本为 D5.0。该草案仅对会员开放，所以这里改写自 TG4ab 的四篇提案文稿：15-22/0381r5（测距周期）、15-23/0100r2（片段与窄带 PHY）、15-23/0502r3（参数集）与 15-22/0205r0（能量预算）。已投票的草案可能与此不同。',
    '其余都是仿真器的模型取值：片段功率由那份毫秒预算算出、10·log10(X) 的合成规则、−93 dBm 的接收机、这个房间的路径损耗与每道砖墙 2.0 ns 的额外时延，以及代入 σ_ratio 的 100 ps 时间戳噪声。而晶振允许的 ±20 ppm 是标准的，见 §16.4.9。',
  ],
  scenario: () => uwbMmsScenario('base'),
  variants: [
    { label: '四个片段', scenario: () => uwbMmsScenario('four') },
    { label: '参数集 rsf-1', scenario: () => uwbMmsScenario('rsf1') },
    { label: '拿 4z 作对照', scenario: () => uwbMmsScenario('twr') },
    { label: '一次只问一个锚点', scenario: () => uwbMmsScenario('pairwise') },
  ],
  jumps: [
    J('第一串片段里的第一个', firstUwbRsf),
    J('对端如何判定这一串片段', firstUwbTrain),
    J('收尾的那帧窄带 REPORT', firstNbReport),
    J('两者共同得出的那次测距', firstUwbRange),
  ],
  observe: [
    '判定那一行把整笔加法念了出来：一共几个、收到几个、其中一个多响、增益多少、余量多少、结论如何——而余量为正之后，还会带上时钟比值，两端报出的符号正好相反。',
    '测距那一行印出两个距离，而别的模式只印一个：修正后的距离，以及若从未量过时钟比值时它本会是的那个原始距离。在这个房间里，两者之间差着好几米。',
  ],
  tryThis: [
    '载入“四个片段”。空口上什么也没变——每一串仍被完整收到，电平也照旧——但那个和如今差了一个分贝，每一对都在等报告中超时，整段运行一次测距、一次定位也没有。',
    '再载入“参数集 rsf-1”：片段数量翻倍，每个更短、因而略响一点，余量宽了好几个分贝。到时间线上看代价——测距阶段、一整轮，以及块里那三轮，全都变长了。',
  ],
  quiz: [
    {
      q: '四个片段时什么也测不出来，八个时全都测得出来。空口上究竟变了什么？',
      options: [
        '四个时片段更轻',
        '什么也没变——同样的片段、同样的电平，而且全都收到了。不同的只是加起来是多少：6.02 dB 对 9.03 dB',
        '四个时接收机根本没就绪',
      ],
      answer: 1,
      explain: '每个片段花的是它自己那一毫秒的额度，所以它的功率与后面还有几个无关。',
    },
    {
      q: '在这里，八个片段的一串比一帧普通 poll 好 19.57 dB。其中有多少属于“多毫秒”这个想法？',
      options: [
        '全部',
        '9.03 dB；另外 10.54 dB 是发射功率——片段更短，加上一台在 37 nJ 里只花掉 8.11 nJ 的发射机',
        '12.04 dB，表里最大的那个合成增益',
      ],
      answer: 1,
      explain: '只有合成增益来自“花掉八个毫秒而不是一个”；其余比较的是两台发射机。',
    },
    {
      q: '单边测距通常要么再做一次往返，要么靠一块很好的晶振。这里为什么两样都不要？',
      options: [
        '窄带（NB）射频把偏差估得更准',
        '片段在发送方时钟上相隔一个轮次间隔，本轮是两毫秒，于是整串用 14 ms 的跨度比较了两块晶振',
        '报告里带着响应方的晶振偏差',
      ],
      answer: 1,
      explain: '这段跨度在半毫秒的回复上只留下 0.76 mm——远小于两个接收时间戳本身就要花掉的 2.1 cm。',
    },
  ],
}
