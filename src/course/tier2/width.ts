import { type Lesson, N, firstData, firstAck, J } from '../lessonKit'
import { widthScenario } from '../wifiScenes'

export const width: Lesson = {
  id: 'width',
  module: 3,
  title: { en: 'Channel width — twice the tones, half the time', zh: '信道带宽——子载波翻倍，时间减半' },
  body: [
    { text: {
      en: 'Every lesson so far has been about sharing the air. This module is about how much one frame gets out of it. A 20 MHz channel is not one carrier: it is 234 narrow data subcarriers, each holding a few bits per symbol. Double the channel and you get at least double the tones — 234 at 20 MHz, 468 at 40, 980 at 80, 1960 at 160, 3920 at 320. The step to 80 MHz gives a little more than double, because the guard band at the channel edges is paid once, not once per 20 MHz. More tones, more bits in every symbol, fewer symbols for the same frame.',
      zh: '到目前为止的每一课讲的都是如何分享空口。这一模块讲的是一帧能从空口里拿到多少。20 MHz 的信道并不是一根载波，而是 234 根很窄的数据子载波，每根在每个符号里装几个比特。带宽翻一倍，子载波至少也翻一倍——20 MHz 是 234 根，40 MHz 468 根，80 MHz 980 根，160 MHz 1960 根，320 MHz 3920 根。其中到 80 MHz 那一步还多给了一点，因为信道两端的保护带只付一次，不是每 20 MHz 付一次。子载波越多，每个符号装的比特越多，同一帧需要的符号就越少。',
    } },
    { kind: 'formula', text: {
      en: 'symbols = ⌈(16 + 8·bytes + 6) / (N_DBPS × tone ratio × streams)⌉',
      zh: '符号数 = ⌈(16 + 8·字节数 + 6) / (N_DBPS × 子载波倍数 × 空间流数)⌉',
    }, note: {
      en: 'Only the data part shrinks. In front of it sits a preamble the receivers must sync on — a fixed 48 µs for a Wi-Fi 7 PPDU, at any width — and a symbol cannot be cut in half: a leftover fraction always rounds up to a whole 13.6 µs symbol.',
      zh: '缩短的只有数据部分。它前面还有一段供各电台同步的前导码——Wi-Fi 7 的 PPDU 固定 48 µs，任何带宽下都一样——而且符号不能切一半：除不尽时总要向上取整到完整的 13.6 µs 符号。',
    } },
    { kind: 'table', heading: {
      en: 'One 1500-byte frame (1530 octets on the air), Wi-Fi 7, one stream',
      zh: '同一个 1500 字节的帧（空口上 1530 字节），Wi-Fi 7，单流',
    }, head: [
      { en: 'Width', zh: '带宽' }, { en: 'Data tones', zh: '数据子载波' },
      { en: 'MCS', zh: 'MCS' }, { en: 'Airtime', zh: '空口时间' },
    ], rows: [
      [N('20 MHz'), N('234'), N('13'), N('129.6 µs')],
      [N('40 MHz'), N('468'), N('13'), N('88.8 µs')],
      [N('80 MHz'), N('980'), N('13'), N('75.2 µs')],
      [N('160 MHz'), N('1960'), N('13'), N('61.6 µs')],
    ] },
    { heading: { en: 'What width costs', zh: '带宽的代价' }, text: {
      en: 'A wider channel is a wider door, and noise comes through it too. Each doubling takes in twice the noise power — 3 dB — so every modulation needs 3 dB more signal to survive at 40 MHz than at 20 MHz, 6 dB at 80, about 9 dB at 160. Note what that bill is and is not: it is noise, and only noise. The SINR a modulation needs against another station’s transmission does not change with width at all — a wide channel costs range, never margin against an interferer. On this desk the noise bill is affordable: at 160 MHz the laptop still holds MCS 13, but only just, with 48.7 dB of signal against noise where the top modulation asks for 48.0. Beside the router that is small change. In the far corner of the flat it is the whole link.',
      zh: '信道越宽，门开得越大，噪声也一起进来。带宽每翻一倍，收进来的噪声功率也翻一倍——3 dB——所以同一种调制在 40 MHz 上要比 20 MHz 多 3 dB 信号才活得下来，80 MHz 多 6 dB，160 MHz 多约 9 dB。但要看清这笔账是什么、不是什么：它付的是噪声，而且只是噪声。面对另一台终端的干扰时，一种调制所需的 SINR 并不随带宽变化——宽信道损失的是覆盖，而不是对抗干扰的余量。在这张桌子上，噪声这笔账还付得起：160 MHz 下笔记本仍然用着 MCS 13，但已经很勉强——信噪比 48.7 dB，而最高那一档调制要 48.0 dB。在路由器旁边，这点代价不值一提；在房子另一头的角落里，它就是整条链路。',
    } },
    { heading: { en: 'When wider is slower', zh: '更宽反而更慢的时候' }, text: {
      en: 'That bill can grow larger than the goods. Move the same laptop just under eight metres out, into the living room, and every width still delivers — no retries, no drops — but the airtimes read 415.2 µs at 20 MHz, 238.4 at 40, 170.4 at 80, and then back up to 224.8 at 160. The extra 3 dB a 160 MHz channel asks for over an 80 MHz one costs two modulation steps at that spot — MCS 2 down to MCS 0, because the sensitivity ladder has a 2 dB rung in it, so a 3 dB step skips straight over MCS 1 — and exactly double the tones cannot pay back a threefold cut in bits per symbol. Against 40 MHz the widest channel still wins, just barely: 224.8 µs against 238.4. It is 80 MHz it cannot beat. And it is a close-run thing in both directions: the window in which this inversion happens at all is about one decibel wide, and this spot sits near the middle of it.',
      zh: '这张账单有时会大过货品本身。把同一台笔记本挪到将近八米之外的客厅里，四种带宽仍然都送得到——没有重传，也没有丢帧——但空口时间是这样的：20 MHz 415.2 µs，40 MHz 238.4 µs，80 MHz 170.4 µs，到 160 MHz 反而涨回 224.8 µs。160 MHz 相对 80 MHz 要多付的那 3 dB，在那个位置要用两级调制去换：MCS 2 直接掉到 MCS 0——因为灵敏度阶梯上有一档只有 2 dB 的窄阶，3 dB 的一步就把 MCS 1 整档跳过去了——而每符号比特数掉到三分之一，子载波恰好翻倍的增益补不回来。跟 40 MHz 比，最宽的信道仍然险胜：224.8 µs 对 238.4 µs。它赢不了的是 80 MHz。而且两边都十分惊险：能出现这种倒挂的信号区间只有约一分贝宽，而这个位置恰好落在它的中间附近。',
    } },
    { kind: 'list', heading: { en: 'In the simulation', zh: '在仿真里看' }, items: [
      { en: 'Load opens the widest case, 160 MHz. The four width buttons step it down and back up; the laptop and the router never move.', zh: '“载入”打开的是最宽的一档，160 MHz。上面四个按钮逐档切换带宽，笔记本和路由器始终不动。' },
      { en: 'Click a blue data block: the airtime line in the frame inspector is where the width shows up.', zh: '点开一个蓝色数据块：带宽的效果体现在帧检视器的“空口时间”一行。' },
      { en: 'The rate line is not. It names the MCS and what that MCS carries on one 20 MHz stream, so on this desk it reads 172.1 Mbps at all four widths while the frame halves in length — the width is in the airtime, never in the rate line. Move the laptop out until a width costs it a modulation step and the rate line moves too.', zh: '“速率”一行则不是。它给出的是 MCS 以及该 MCS 在单条 20 MHz 流上的速率，所以在这张桌子上四种带宽都显示 172.1 Mbps，而帧长却在成倍缩短——带宽体现在空口时间里，从不体现在速率那一行。把笔记本挪远到带宽真的让它掉一档调制时，速率一行才会跟着动。' },
    ] },
  ],
  scenario: () => widthScenario(160, 1),
  variants: [
    { label: N('20 MHz'), scenario: () => widthScenario(20, 1) },
    { label: N('40 MHz'), scenario: () => widthScenario(40, 1) },
    { label: N('80 MHz'), scenario: () => widthScenario(80, 1) },
    { label: N('160 MHz'), scenario: () => widthScenario(160, 1) },
  ],
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK', '第一个 ACK', firstAck),
  ],
  observe: [
    { en: 'Step 20 → 40 → 80 → 160 MHz and watch one data block: 129.6 µs, 88.8, 75.2, 61.6. Doubling the width never halves the frame — the 48 µs preamble inside every one of them scales with nothing.', zh: '按 20 → 40 → 80 → 160 MHz 逐档切换，盯住一个数据块：129.6 µs、88.8、75.2、61.6。带宽翻倍从来不会让整帧减半——每一帧里那 48 µs 的前导码不随任何东西缩短。' },
    { en: 'Subtract the fixed 48 µs preamble from each and you get 81.6, 40.8, 27.2 and 13.6 µs of data — 6, 3, 2 and 1 symbols. That is the whole mechanism.', zh: '每个数字都减掉固定的 48 µs 前导码，剩下 81.6、40.8、27.2、13.6 µs 的数据——正好是 6、3、2、1 个符号。机制就这么简单。' },
    { en: 'At 160 MHz the preamble is 48 µs of the 61.6: more than three quarters of the frame is now the part that never got shorter.', zh: '在 160 MHz 上，61.6 µs 里有 48 µs 是前导码：整帧四分之三以上，是那段从来没有变短的部分。' },
    { en: 'The white ACK is identical in all four variants — control frames go out at a low, robust rate, and width buys them nothing.', zh: '四个变体里白色的 ACK 完全一样——控制帧用低速稳健的速率发送，带宽对它毫无帮助。' },
  ],
  tryThis: [
    { en: 'Open in editor — the lesson opens at 160 MHz — and walk the laptop out of the study. Seven and a half squares right of the router and two down, half way into the living room, it still delivers everything, 224.8 µs a frame; the paragraph above is what that same spot costs at the narrower widths. Keep going into the far corner and not one ACK comes back: 160 MHz needs about 9 dB more than 20 MHz, and that corner does not have it, so every frame becomes a retry and then a drop. Step the width down there and the link comes back — 80 MHz delivers at 401.6 µs a frame, 20 MHz at 524.0, and 40 MHz, stuck one rung lower on the modulation ladder, is the slowest of the three at 768.8.', zh: '点“在编辑器中打开”——这一课打开的是 160 MHz——然后把笔记本一步步挪出书房。挪到路由器右边七格半、下面两格的位置，大约在客厅正中，它仍然一帧不落地送达，每帧 224.8 µs；上面那段讲的就是同一个位置在更窄带宽下的代价。继续挪到最远的角落，就一个 ACK 也回不来了：160 MHz 比 20 MHz 多要约 9 dB，那个角落给不起，于是每一帧都变成重传，最后被丢弃。在那里把带宽逐档调窄，链路就回来了——80 MHz 每帧 401.6 µs，20 MHz 524.0 µs，而 40 MHz 恰好卡在调制阶梯低一档上，成了三者中最慢的 768.8 µs。' },
    { en: 'With the laptop still in that corner, switch it to 802.11a (legacy) in the editor. A legacy radio has no wide mode, so the link falls back to 20 MHz — and the ACKs come back, at 704 µs a frame: 18 Mb/s, five and a half times the airtime the same frame took on the desk.', zh: '让笔记本留在那个角落，在编辑器里把它改成 802.11a（传统模式）。传统电台没有宽信道模式，链路只能退回 20 MHz——ACK 就回来了，每帧 704 µs：18 Mb/s，是同一个帧在桌上所用空口时间的五倍半。' },
  ],
  quiz: [
    {
      q: { en: 'At 20 MHz this frame takes 129.6 µs. At 160 MHz, with eight times the tones, it takes 61.6 µs. Why not an eighth of the time?', zh: '这个帧在 20 MHz 上要 129.6 µs；到了 160 MHz，子载波是八倍，却仍要 61.6 µs。为什么不是八分之一？' },
      options: [
        { en: 'The ACK grows as the data frame shrinks', zh: '数据帧变短，ACK 就会变长' },
        { en: 'A fixed 48 µs preamble sits in front of the data, and the data itself cannot be shorter than one whole symbol', zh: '数据前面有固定的 48 µs 前导码，而数据本身最短也不能少于一个完整符号' },
        { en: 'Wide channels are transmitted at lower power', zh: '宽信道的发射功率更低' },
      ],
      answer: 1,
      explain: { en: 'Only the data part scales: 81.6 µs of symbols at 20 MHz becomes a single 13.6 µs symbol at 160 MHz. The 48 µs preamble does not move, and it is now more than three quarters of the frame.', zh: '按比例缩短的只有数据部分：20 MHz 上的 81.6 µs 符号，到 160 MHz 只剩一个 13.6 µs 的符号。48 µs 的前导码纹丝不动，此时已占了整帧四分之三以上。' },
    },
    {
      q: { en: 'Your phone is at the edge of range. Does moving it from a 160 MHz channel to a 40 MHz one make it faster or slower?', zh: '手机在覆盖边缘。把它从 160 MHz 换到 40 MHz，是更快还是更慢？' },
      options: [
        { en: 'Slower — a quarter of the tones is a quarter of the speed', zh: '更慢——子载波只剩四分之一，速度也只剩四分之一' },
        { en: 'Usually faster: once the signal is marginal, 6 dB of sensitivity is worth more than the tones it gives up', zh: '通常更快：信号已经勉强时，6 dB 的灵敏度比让出去的那些子载波更值钱' },
        { en: 'No difference — width does not affect range', zh: '没区别——带宽不影响覆盖' },
      ],
      answer: 1,
      explain: { en: 'Two doublings of width cost 6 dB of noise. From the far corner of this lesson’s flat the 160 MHz variant delivers nothing at all — every frame retries and is dropped — while 20, 40 and 80 MHz still get frames through. Which of those three is quickest there is a second question: 80 MHz at 401.6 µs, 20 at 524.0, 40 at 768.8.', zh: '带宽翻两倍要多付 6 dB 的噪声。在这一课户型的最远角落，160 MHz 一帧也送不到——每帧都重传到被丢弃——而 20、40、80 MHz 依然能把帧送出去。这三者里谁更快是另一个问题：80 MHz 401.6 µs，20 MHz 524.0 µs，40 MHz 768.8 µs。' },
    },
  ],
}
