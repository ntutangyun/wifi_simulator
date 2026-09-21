/**
 * AMP Tier 2 · M7 · Ambient power IoT (802.11bp) · A frame a tag can hear.
 *
 * The second half of the old `amp-intro`: the anatomy of an AMP PPDU, why a
 * downlink frame has a legacy Wi-Fi opening in front of on-off keying, why the
 * uplink has none, and where the airtime of a four-octet acknowledgement
 * actually goes. It loads exactly the scene `amp-intro` loads — same builder,
 * same variant — so the split adds no new scenario and the recorded timeline
 * hashes of `amp-ppdu` are `amp-intro`'s.
 *
 * Every number quoted below is pinned in tests/course/amp-ppdu.test.ts.
 *
 * CAUTION — word budget. The main path (`lessonWords`: why, outcomes, terms,
 * picture, numbers, observe, tryThis and quiz — never deeper, never sources)
 * is capped at 1300 English words and measures 1284: SIXTEEN words of headroom.
 * `lessonMinutes` is 15 of the permitted 20, so the word count bites first.
 */
import {
  J, N, firstAmpAckToTag, firstAmpTrigger, txOf,
  type Lesson,
} from '../lessonKit'
import { ampIntroScenario } from './amp-intro'

export const ampPpdu: Lesson = {
  id: 'amp-ppdu',
  module: 7,
  title: { en: 'A frame a tag can hear', zh: '一帧标签听得懂的帧' },
  why: {
    en: 'A Wi-Fi radio and a battery-free tag cannot understand each other’s signals. One speaks in finely shaped waveforms; the other can only tell loud from quiet. Yet they share the same air, and the router must talk to both in one breath. The frame that does this has two halves, and its length has very little to do with the data inside it.',
    zh: 'Wi-Fi 射频和无电池标签，谁也听不懂对方的信号。一个说的是精雕细琢的波形，另一个只分得出响和静。可它们共用同一片空气，而路由器必须一口气同时对两者说话。能做到这件事的帧分成两半，而它有多长，跟里面装了多少数据几乎没什么关系。',
  },
  outcomes: [
    { en: 'name the parts of a downlink AMP frame and say which half is for whom', zh: '说出一帧下行 AMP 帧由哪几段组成，并讲清哪一半是给谁听的' },
    { en: 'explain why a four-byte acknowledgement takes hundreds of microseconds', zh: '解释为什么四个字节的确认帧要花掉几百微秒' },
    { en: 'predict which frame shrinks most when the data rate rises', zh: '预测速率提高时，哪一种帧缩得最多' },
  ],
  needs: ['amp-intro'],
  terms: [
    { term: 'OOK', plain: {
      en: 'on–off keying: the transmitter is either on or off, one flash per bit',
      zh: '通断键控：发射机要么开、要么关，闪一下就是一个比特',
    } },
    { term: 'Manchester', plain: {
      en: 'each bit is a flash-then-dark or a dark-then-flash, so the rhythm is never lost',
      zh: '每个比特都发成“先亮后暗”或“先暗后亮”，接收端因此永远跟得上节拍',
    } },
    { term: 'preamble', plain: {
      en: 'the opening every Wi-Fi radio recognises — met in Tier 1, reminded here',
      zh: '一帧 Wi-Fi 的开头，所有 Wi-Fi 射频都认得——第一阶已经见过，这里只是提个醒',
    } },
    { term: 'AMP-Sync', plain: {
      en: 'a run of flashes opening the tag’s half, so it can find the beat',
      zh: '标签那一半开头的一串闪烁，让包络检波器能找准节拍',
    } },
    { term: 'AMP-SIG', plain: {
      en: 'two octets saying what frame follows and how long it is',
      zh: '两个字节，告诉标签后面是什么帧、有多长',
    } },
    { term: 'padding', plain: {
      en: 'filler at the end of a frame: it buys the receiver time, not capacity',
      zh: '帧尾的填充，不装任何内容，纯粹是为接收端争取时间',
    } },
  ],
  picture: [
    { heading: { en: 'Two listeners, one frame', zh: '一帧，两个听众' }, text: {
      en: 'Every frame the router sends here must reach two very different radios. A Wi-Fi station has to recognise it well enough to keep out of the way; a tag has to read what it says. Neither can decode the other’s signal, so the frame comes in two halves: an ordinary Wi-Fi opening, then a part written for a tag.',
      zh: '这一轮里路由器发出的每一帧，都得同时送达两种差别极大的射频。Wi-Fi 终端至少要认出它，好把路让开；标签则要真的读懂它说了什么。而这两者谁也解不了对方那种信号。于是这一帧被搭成前后两半：先是一段普通的 Wi-Fi 开头，然后才是专门写给标签的那一段。',
    } },
    { heading: { en: 'The half a Wi-Fi radio reads', zh: '给 Wi-Fi 射频读的那一半' }, text: {
      en: 'It opens with the preamble every Wi-Fi frame opens with: the known pattern a receiver locks onto, then the field stating how long the frame lasts. Any Wi-Fi radio in the room acquires it and keeps off the air that long, never learning what the rest was about. A tag makes nothing of this half; it waits it out.',
      zh: '这一帧的开头，就是每一帧 Wi-Fi 都有的那段前导——一段已知的图案，接收端靠它锁住信号，紧接着是说明“这一帧要持续多久”的那个字段。房间里任何一台 Wi-Fi 射频都能捕获它，然后老老实实避让这么久，却始终不知道后面那部分在讲什么。标签对这半段则完全无从下手，只能干等它过去。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Open one and look', zh: '打开一帧看看' }, text: {
      en: 'Load the simulation, jump to the first trigger and open it in the frame detail view. Read the strip left to right: the legacy opening a Wi-Fi radio reads, then AMP-Sync, AMP-SIG, the data octets, and the padding at the end.',
      zh: '载入仿真，跳到第一帧触发帧，再到帧细节视图里把它打开。把那条带子从左读到右：先是 Wi-Fi 射频读的那段传统开头，然后是 AMP-Sync、AMP-SIG、数据字节，最末尾是填充。',
    } },
    { heading: { en: 'Loud or quiet, and nothing in between', zh: '不是响就是静，没有中间地带' }, text: {
      en: 'The tag’s half is sent in OOK: the transmitter is either on or off, one flash per bit. An envelope detector can follow that much. To keep the tag in step the bits go out in Manchester form — each a flash-then-dark or a dark-then-flash, so every bit has an edge in the middle, however many zeros run together.',
      zh: '标签那一半用的是 OOK：发射机要么开要么关，闪一下就是一个比特。这点东西，包络检波器跟得上。为了让标签不跟丢，这些比特还按 Manchester 的方式发出——每个比特都是“先亮后暗”或“先暗后亮”，于是每一个比特中间都有一道边沿；哪怕连着来一长串零，标签的节拍也不会散。',
    } },
    { heading: { en: 'Why the frame is padded', zh: '为什么帧尾要填充' }, text: {
      en: 'The answer is due one gap after the trigger’s last symbol, and that gap is short. Inside it the tag must finish demodulating, check the frame is sound, decide whether the round concerns it, and start its transmitter. Padding buys that thinking time where it costs nothing but airtime — the tag is decoding while the padding still goes out.',
      zh: '作答必须在触发帧最后一个符号之后、隔一个间隔就发出，而那个间隔很短。就在这点时间里，标签要解调完、校验帧是否完好、判断这一轮跟自己有没有关系，还要把自己的发射机启动起来。帧尾的填充把这段“想事情”的时间加在只花空口时间的地方——填充还在往外发的时候，标签其实已经在解码了。',
    } },
    { heading: { en: 'Uplink: the mirror image', zh: '上行：整个反过来' }, text: {
      en: 'A tag’s answer is built the other way round: no Wi-Fi preamble at all — a tag could not produce one — just its own short AMP-Sync and then the octets. So a Wi-Fi station beside a tag can tell something is on the air, but never that it is a frame: there is nothing to lock onto.',
      zh: '标签的作答帧是反着搭的。它完全不带 Wi-Fi 前导——标签也造不出来——所以一上来就是它自己那段很短的 AMP-Sync，紧接着就是数据字节。这也正是为什么：站在标签旁边的 Wi-Fi 终端只能察觉“空中有东西”，却永远认不出那是一帧——里面没有任何一段是 Wi-Fi 射频懂得去锁的。',
    } },
    { heading: { en: 'Small frame, long airtime', zh: '帧很小，空口时间很长' }, text: {
      en: 'Put the halves together and a small AMP frame is mostly not its message. The opening, the sync, the field describing the data, the padding and the closing extension cost the same whatever the frame carries, and at these rates they dwarf a handful of octets. The acknowledgement is the extreme case: four octets, in a frame that takes longer on the air than an ordinary Wi-Fi frame saying far more.',
      zh: '把两半拼起来你就会发现：一帧小小的 AMP 帧，绝大部分并不是它要说的内容。开头、同步、描述数据的那个字段、填充，还有收尾的扩展，不管这一帧装了什么，它们花的时间都一样；而在这样的速率下，它们把区区几个字节远远压过去了。确认帧是最极端的例子：内容只有四个字节，外面那层壳占用的空口时间，却比一帧说得多得多的普通 Wi-Fi 还长。',
    } },
  ],
  numbers: [
    { kind: 'formula', heading: { en: 'What a trigger’s 618 µs is made of', zh: '触发帧的 618 µs 由什么组成' }, text: {
      en: 'AMP Trigger @ 250 kb/s = 32 + 80 + 64 + 416 + 20 + 6 = 618 µs',
      zh: 'AMP Trigger @ 250 kb/s = 32 + 80 + 64 + 416 + 20 + 6 = 618 µs',
    }, note: {
      en: '32 µs of legacy opening — the preamble, the legacy signal field and the U-SIG a Wi-Fi 7 router adds; 80 µs of AMP-Sync; two octets of AMP-SIG, 64 µs here and 16 µs at 1 Mb/s; the trigger’s 13 octets at 416 µs; 20 µs of padding; and the 6 µs extension every 2.4 GHz frame with a legacy preamble carries.',
      zh: '32 µs 是传统开头——前导本身、传统信号字段，加上 Wi-Fi 7 路由器附带的 U-SIG；80 µs 是 AMP-Sync；两个字节的 AMP-SIG 在 250 kb/s 下是 64 µs，1 Mb/s 下是 16 µs；触发帧的 13 个字节占 416 µs；填充 20 µs；最后 6 µs 是信号扩展，凡是带传统前导的 2.4 GHz 帧都要附上它。',
    } },
    { kind: 'table', heading: { en: 'The three AMP frames', zh: '三种 AMP 帧' }, head: [
      { en: 'Frame', zh: '帧' }, { en: 'Octets', zh: '字节' }, N('250 kb/s'), N('1 Mb/s'),
    ], rows: [
      [{ en: 'AMP Trigger (downlink)', zh: 'AMP Trigger（下行）' }, N('13'), N('618 µs'), N('258 µs')],
      [{ en: 'AMP Ack (downlink)', zh: 'AMP Ack（下行）' }, N('4'), N('330 µs'), N('186 µs')],
      [{ en: 'Answer with a reading (uplink)', zh: '带读数的作答（上行）' }, N('15'), N('528 µs'), N('132 µs')],
    ] },
    { text: {
      en: 'An answer that names only itself is 7 octets, used in a later lesson; this one carries the reading inline, so it is 15. Raise the rate four-fold and the answer takes a quarter of the air: 528 µs becomes 132 µs, having no fixed opening to dilute it. The trigger has one — 138 µs of opening, sync, padding and extension that no rate can touch — so it falls only from 618 µs to 258 µs.',
      zh: '只报自己身份的作答是 7 个字节，后面某一课会用到；这里的作答把读数直接带在里面，所以是 15 个字节。速率提高四倍，作答占用的空口时间就真的只剩四分之一：528 µs 变成 132 µs——因为它没有固定开头可以摊薄。触发帧却有：传统开头、同步、填充与扩展合计 138 µs，任凭速率怎么变都省不掉，所以它只能从 618 µs 降到 258 µs。',
    } },
    { kind: 'table', heading: { en: 'How much padding', zh: '填充有多少' }, head: [
      { en: 'Kind of downlink frame', zh: '下行帧的类型' }, { en: 'Padding', zh: '填充' }, { en: 'Where', zh: '出处' },
    ], rows: [
      [{ en: 'unprotected — every frame in this scene', zh: '非保护帧——本场景里的每一帧' }, N('20 µs'), N('11-26/1519r5 §39.3.2.2')],
      [{ en: 'protected, meaning encrypted', zh: '受保护帧，也就是加了密的帧' }, N('36 µs'), N('11-26/1519r5 §39.3.2.2')],
    ] },
    { heading: { en: 'Where an Ack’s 330 µs goes', zh: '一帧 Ack 的 330 µs 花在哪儿' }, text: {
      en: 'Four octets at 250 kb/s are 128 µs of the Ack’s 330 µs; the other 202 µs is opening, AMP-Sync, AMP-SIG, padding and extension — fixed cost, paid in full for four octets. The CTS the router uses to clear the air is fourteen octets of ordinary Wi-Fi in 50 µs: 44 µs at 6 Mb/s plus the band’s 6 µs. Three and a half times the content, under a sixth of the airtime.',
      zh: '四个字节在 250 kb/s 下是 128 µs，占 Ack 全长 330 µs 中的一部分。余下的 202 µs 是传统开头、AMP-Sync、AMP-SIG、填充和信号扩展——固定开销，为四个字节也得照付一遍。作个对比：路由器用来清场的那帧 CTS 是十四个字节的普通 Wi-Fi，只要 50 µs——6 Mb/s 下 44 µs，再加本频段的 6 µs 信号扩展。内容是三倍半，空口时间却不到六分之一。',
    } },
  ],
  sources: [
    { en: 'P802.11bp is a draft: D0.5 in May 2026, D1.0 to letter ballot in September 2026. The downlink and uplink AMP PPDU formats in this lesson follow the TGbp Specification Framework 11-24/1613r20 and the proposed draft text 11-26/1519r5.',
      zh: 'IEEE P802.11bp 仍是草案：D0.5 于 2026 年 5 月发布，D1.0 将于 2026 年 9 月进入 letter ballot。本课里下行与上行 AMP PPDU 的格式，依据的是 TGbp 规范框架 11-24/1613r20 与提案草案文本 11-26/1519r5。' },
    { en: 'The padding of 20 µs unprotected and 36 µs protected is 11-26/1519r5 §39.3.2.2, as the table above says.',
      zh: '非保护帧 20 µs、受保护帧 36 µs 的填充值出自 11-26/1519r5 §39.3.2.2，上表的“出处”列已经写明。' },
    { en: 'The two-octet AMP-SIG and several other AMP field widths are model choices, not standard values: the draft still leaves them TBD. So are the OOK SINR thresholds the two receivers use (8 dB down, 10 dB up at 250 kb/s).',
      zh: '两个字节的 AMP-SIG 以及若干别的 AMP 字段宽度都是模型取值，而不是标准值——草案里它们仍标着 TBD。收发两端使用的 OOK SINR 门限（下行 8 dB，250 kb/s 上行 10 dB）同样是模型取值。' },
    { en: 'The 32 µs legacy opening, the 6 µs signal extension and the 44 µs CTS at 6 Mb/s are ordinary 2.4 GHz Wi-Fi, not anything P802.11bp invents. The U-SIG inside that opening is why the router here is a Wi-Fi 7 device.',
      zh: '32 µs 的传统开头、6 µs 的信号扩展，以及 6 Mb/s 下 44 µs 的 CTS，都是 2.4 GHz Wi-Fi 原本就有的东西，并非 P802.11bp 的新发明。而那段开头里的 U-SIG，正是这里的路由器必须是 Wi-Fi 7 设备的原因。' },
  ],
  scenario: () => ampIntroScenario({ dlKbps: 250, ulKbps: 250 }),
  variants: [
    {
      label: { en: '1 Mb/s both ways', zh: '上下行都用 1 Mb/s' },
      scenario: () => ampIntroScenario({ dlKbps: 1000, ulKbps: 1000 }),
    },
  ],
  jumps: [
    J('first AMP Trigger', '第一帧 AMP Trigger', firstAmpTrigger),
    J('first Ack naming a tag', '第一帧点名标签的 AMP Ack', firstAmpAckToTag),
    J('first Ack for an empty slot', '第一帧“空时隙”的 AMP Ack', txOf((r) => r.frame.kind === 'ampAck' && r.frame.dst === r.frame.src)),
  ],
  observe: [
    { en: 'Open the Ack at 1226 µs in frame detail: its ID field is two octets and names the Door tag. Then the one at 2982 µs, closing an empty slot — same 330 µs, same four octets, but the ID field holds the router’s own id.', zh: '在帧细节里打开 1226 µs 那帧 Ack：ID 字段两个字节，点名的是 Door tag。再打开 2982 µs 那一帧，它收尾的是一个空时隙——同样 330 µs、同样四个字节，但 ID 字段里装的是路由器自己的标识。' },
    { en: 'Open the first trigger and read its strip left to right: 16, 4 and 12 µs of legacy opening, 80 µs of AMP-Sync, 64 µs of AMP-SIG, 416 µs of data, 20 µs of padding, 6 µs of extension. Its 6-octet body decodes into session, window, slots and slot width.', zh: '在帧细节里打开第一帧触发帧，把那条带子从左读到右：传统开头的 16、4、12 µs，然后 80 µs 的 AMP-Sync、64 µs 的 AMP-SIG、416 µs 的数据、20 µs 的填充，末尾还有 6 µs 的信号扩展。它 6 个字节的帧体会被逐字段解开：会话号、窗口、时隙数与时隙长度。' },
  ],
  tryThis: [
    { en: 'Load the 1 Mb/s variant and jump to the first trigger. It now ends at 318 µs, slot 1 opens at 328 µs, and the round is 1670 µs instead of 4190 µs — 1.67 % of each 100 ms, not 4.19 %. Work out why the saving is not four-fold, then check the CTS Duration: 1620 µs.', zh: '载入 1 Mb/s 变体，跳到第一帧触发帧。它现在在 318 µs 结束，时隙 1 在 328 µs 打开，整轮从 4190 µs 缩到 1670 µs——占每 100 ms 的比例从 4.19 % 降到 1.67 %。想一想为什么没能省到四分之一，再核对 CTS 的 Duration：1620 µs。' },
  ],
  quiz: [
    {
      q: { en: 'What is a trigger’s 20 µs padding field for?', zh: '触发帧末尾那 20 µs 的填充字段是做什么的？' },
      options: [
        { en: 'Padding out to an OFDM symbol boundary', zh: '把帧补齐到 OFDM 符号边界' },
        { en: 'Giving the tag time to demodulate, check and start transmitting inside one 10 µs gap', zh: '给标签留出时间，让它在一个 10 µs 的间隔内完成解调、校验并启动发射机' },
        { en: 'Letting Wi-Fi stations set a countdown', zh: '让 Wi-Fi 终端有时间设好自己的倒计时' },
      ],
      answer: 1,
      explain: { en: 'The answer is due 10 µs after the trigger’s last symbol; padding adds that thinking time where it costs only airtime.', zh: '作答必须在触发帧最后一个符号之后一个间隔——也就是 10 µs——发出。填充把这段处理时间加在只花空口时间的地方。' },
    },
    {
      q: { en: 'An AMP Ack carries four octets, yet lasts 330 µs at 250 kb/s. Where does the time go?', zh: 'AMP Ack 只有四个字节，在 250 kb/s 下却要 330 µs。时间花到哪里去了？' },
      options: [
        { en: 'Four octets really do take 330 µs at this rate', zh: '四个字节在 250 kb/s 下确实就要 330 µs' },
        { en: 'The four octets are 128 µs; the other 202 µs is opening, AMP-Sync, AMP-SIG, padding and extension', zh: '四个字节占 128 µs；其余 202 µs 是传统开头、AMP-Sync、AMP-SIG、填充和信号扩展' },
        { en: 'It is padded out to the slot it closes', zh: 'Ack 被补齐到了它所收尾的那个时隙的长度' },
      ],
      answer: 1,
      explain: { en: 'Fixed overhead dominates a tiny frame: four octets pay for the same wrapper a thirteen-octet trigger pays for.', zh: '对极小的帧来说，固定开销占了大头：四个字节的内容，要把整层外壳的账付清——而十三个字节的触发帧付的是同样一层壳。' },
    },
    {
      q: { en: 'Why can a Wi-Fi station only sense energy when a tag answers, never decode a frame?', zh: '标签作答时，为什么 Wi-Fi 终端只能感知到能量，却读不出一帧？' },
      options: [
        { en: 'The answer is too weak to reach it', zh: '作答太弱，根本传不到它那里' },
        { en: 'The uplink carries no Wi-Fi preamble, so there is nothing to lock onto', zh: '上行帧不带 Wi-Fi 前导，Wi-Fi 接收端没有任何东西可以拿来锁定' },
        { en: 'The router tells the station to ignore it', zh: '路由器事先要求终端无视这一帧' },
      ],
      answer: 1,
      explain: { en: 'A tag opens straight into its own AMP-Sync. Without a preamble a Wi-Fi receiver never starts decoding, however loud the signal.', zh: '标签一上来就是自己的 AMP-Sync，然后是数据字节。没有前导，Wi-Fi 接收端根本不会启动解码——信号再响也一样。' },
    },
  ],
}
