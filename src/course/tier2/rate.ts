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
 * The scenario builder is unchanged, so the recorded timeline hash in
 * tests/fixtures/lesson-hashes.json stays byte-identical. Every number quoted
 * below is pinned in tests/course/rate.test.ts.
 */
import { type Lesson, N, firstData, firstRetry, J } from '../lessonKit'
import { rateScenario } from '../wifiScenes'

export const rate: Lesson = {
  id: 'rate',
  module: 3,
  title: { en: 'Rate control — picking how fast to talk', zh: '速率控制——决定说多快' },
  why: {
    en: 'A sender has to choose how fast to talk before it says anything, and both wrong answers hurt. Too fast, and the frame arrives as a smear and nothing gets through. Too slow, and every frame lands, but each one lies on the air far longer than it had to, while everybody else waits. Nobody tells the sender which speed is right. It has to work that out from the answers coming back.',
    zh: '发送端必须先决定说多快，然后才开口，而两边的错答案都要付代价。说得太快，帧到了对面只是一团糊，什么也过不去；说得太慢，帧倒是都送到了，可每一帧在空口上趴的时间远比它需要的长，而这段时间里所有人都在等。没有谁会告诉发送端哪一档才对，它只能从回来的答复里自己琢磨。',
  },
  outcomes: [
    { en: 'say why one fixed speed is the wrong answer in both directions', zh: '说出为什么“固定一档速率”在两个方向上都是错答案' },
    { en: 'read off the timeline the highest rung a link can hold, and say what set it', zh: '在时间轴上读出一条链路的上限，并说清是什么定下了它' },
    { en: 'name the one thing a sender learns from a frame — and the thing it never learns', zh: '说出发送端从一帧里唯一能知道的东西，以及它永远不会知道的东西' },
    { en: 'step the loop by hand: what it counts, and what moves the rung either way', zh: '用手把这个回路走一遍：它在数什么，以及什么会把级别往两边挪' },
  ],
  needs: ['decode-thresholds', 'retries-queues', 'bianchi-vs-sim', 'width'],
  terms: [
    { term: 'ceiling', plain: {
      en: 'the highest rung this link’s signal can actually carry; distance and walls set it, not the sender',
      zh: '这条链路的信号真正撑得住的最高一级；定下它的是距离和墙，不是发送端',
    } },
    { term: 'attempt', plain: {
      en: 'one sending of a frame, which ends as a success or a failure depending on whether the answer comes back',
      zh: '把一帧发出去这一次动作；它算成功还是失败，取决于答复有没有回来',
    } },
  ],
  picture: [
    { heading: { en: 'Two ways to be wrong', zh: '错的两种方式' }, text: {
      en: 'Pick a rung too high for the link and the receiver hears a smear: the frame was sent, the air was spent, and nothing arrived. Pick one far too low and every frame lands — but each one lies on the channel several times longer than it needed to, and while it does, nobody else in the room may talk. The right rung is the highest one this link can still carry, and it moves as people walk about and doors close.',
      zh: '选一级这条链路撑不住的，接收端听到的就是一团糊：帧发出去了，空口时间花掉了，什么也没到。选一级远低于链路能力的，帧倒是帧帧都到——可每一帧占住信道的时间是它本来需要的好几倍，而在这段时间里，屋里其他人谁也不能开口。对的那一级，是这条链路还撑得住的最高一级；而人走来走去、门开门关，这一级还会变。',
    } },
    { heading: { en: 'The lid the signal puts on', zh: '信号扣下来的那个盖子' }, text: {
      en: 'On this scene two stations (STA) upload flat out to the same access point (AP): one on the desk beside it, one in the far corner behind a brick wall. The highest rung a link’s own signal will carry is the ceiling, and the far station cannot get above it however it tries: that corner will not carry a denser MCS. Distance and the wall decided that. Everything below the ceiling is the sender’s own decision, made frame by frame.',
      zh: '这一幕里有两台站点（STA）在向同一个接入点（AP）满速上传：一台在它旁边的桌上，一台在另一头、隔着一堵砖墙的角落里。一条链路的信号真正撑得住的最高一级，就是它的上限；远端那台再怎么试也越不过去，因为那个角落的信号撑不住更密的 MCS。定下这个上限的，是距离和那堵墙。上限以下的一切，才是发送端自己一帧一帧做的决定。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Go and look', zh: '去看一眼' }, text: {
      en: 'Load the simulation and jump to the first data frame. Then follow the far station’s lane for a few seconds: its blocks keep changing length, while the near station’s never do. Nothing in the flat moved — only one sender’s choice did.',
      zh: '载入仿真，跳到第一个数据帧，然后顺着远端站点那条泳道往后看几秒：它的方块长度一直在变，而近端站点的从头到尾一个样。屋里什么都没挪动，变的只是一台发送端的选择。',
    } },
    { heading: { en: 'The only news a sender gets', zh: '发送端唯一收到的消息' }, text: {
      en: 'A sender cannot see the signal at the far end. All it has is what came back. One sending of a frame is an attempt, and it ends one of two ways: the ACK arrives, or the ACK timeout does. That single scrap of news — answered, not answered — is the whole input to rate control. It cannot tell a frame killed by a weak signal from one killed because a neighbour started talking in the same slot; from here the two look exactly alike.',
      zh: '发送端看不见对面那头的信号，它手里只有回来的那点东西。把一帧发出去这一次动作，就是一次尝试；它只有两种结局：要么 ACK 到了，要么 ACK 超时到了。就这一丁点消息——答了，没答——就是速率控制的全部输入。它分不清一帧是被弱信号打死的，还是被“邻居在同一个时隙开了口”打死的；站在它这个位置上，两者长得一模一样。',
    } },
    { heading: { en: 'A loop run on rumours', zh: '一个靠传闻运转的回路' }, text: {
      en: 'So the choice is made on evidence that is always a little wrong. A run of bad luck at contention reads the same as a wall, and the sender steps down; a quiet patch reads as a better link, and it steps back up. The procedure below is the whole of that loop. What a long stretch of slow frames costs everyone else in the room is the next lesson.',
      zh: '于是这个选择永远是基于有点失真的证据做出的。竞争里连着倒霉几次，读起来和“多了一堵墙”一模一样，发送端就降一级；安静一阵子，读起来就像链路变好了，它又升回去。下面那套步骤，就是这个回路的全部。而一长段慢帧要让屋里其他人付出什么，是下一课的事。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: {
      en: 'The far station’s frames, three rungs, the same 1,530 bytes, 20 MHz and one stream',
      zh: '远端站点的帧：三个级别，同样的 1,530 字节，20 MHz，单流',
    }, head: [
      { en: 'Rung', zh: '级别' }, { en: 'Rate line', zh: '速率一行' },
      { en: 'Airtime', zh: '空口时间' }, { en: 'Share of its frames', zh: '占它帧数的比例' },
    ], rows: [
      [{ en: 'MCS 2 — its ceiling', zh: 'MCS 2——它的上限' }, N('25.8 Mb/s'), N('524.0 µs'), N('79.8%')],
      [N('MCS 1'), N('17.2 Mb/s'), N('768.8 µs'), N('17.2%')],
      [{ en: 'MCS 0 — the bottom rung', zh: 'MCS 0——最底一级' }, N('8.6 Mb/s'), N('1,476.0 µs'), N('3.0%')],
    ] },
    { heading: { en: 'What one step down costs', zh: '降一级要付什么' }, text: {
      en: 'Each step down halves, or nearly halves, the bits every chunk of signal carries, so the same payload takes almost three times the air at the bottom rung as at the ceiling. The ceiling itself never moves: across three seconds the far station does not send above MCS 2 once.',
      zh: '每降一级，每一块信号能装的比特数就减半或接近减半，所以同样的内容，在最底一级要花掉将近上限三倍的空口时间。而上限本身从不移动：整整三秒里，远端站点一次也没有发到 MCS 2 以上。',
    } },
    { heading: { en: 'The station that never has to choose', zh: '那台根本不用做选择的站点' }, text: {
      en: 'A metre from the access point, the near station sends 4,010 frames in three seconds, all at MCS 11, and not one goes unanswered. That rung is not where its signal runs out — 58.7 dB would carry the top rung — but where the two ends’ agreed capabilities stop: neither of them offered the two densest rungs on this scene, so the ceiling is capped below them.',
      zh: '离接入点一米远的近端站点，三秒里发了 4,010 帧，帧帧都在 MCS 11 上，而且没有一帧等不到答复。停在这一级并不是因为信号不够——58.7 dB 足以撑住最高一级——而是因为两端谈定的能力到此为止：这一幕里谁也没有开出最密的那两级，上限就被压在它们下面。',
    } },
    { kind: 'steps', heading: { en: 'The loop, as the engine runs it', zh: '这个回路，引擎是怎么跑的' }, items: [
      { en: 'Before every frame the sender works out this link’s ceiling again: the top rung the RSSI allows at the width in use, with the 3 dB rate margin, and never above what the two ends agreed they can both do.',
        zh: '每发一帧之前，发送端都重新算一次这条链路的上限：在当前带宽下、按 RSSI、含 3 dB 速率余量，能撑住的最高一级；而且绝不超过两端谈定的共同能力。' },
      { en: 'It keeps one working rung per peer. If that working rung sits above the ceiling — the first frame ever, or a link that has just got worse — it is pulled down to the ceiling. The frame goes out at the working rung.',
        zh: '它为每个对端保留一个“当前级别”。如果这个当前级别高于上限——第一帧，或者链路刚刚变差——就把它拉到上限。这一帧就用当前级别发出去。' },
      { en: 'The attempt ends in exactly one outcome, answered or not, and the sender keeps two counters for it: successes in a row, and failures in a row. Either outcome zeroes the other counter.',
        zh: '这次尝试只会有一个结局：答了，或没答。发送端为它记两个计数：连续成功次数，和连续失败次数。出现哪一种，就把另一种清零。' },
      { en: 'At two failures in a row the working rung drops by one — never below the bottom rung — and the failure count starts again at zero. So four failures in a row cost two rungs, not one.',
        zh: '连续失败到两次，当前级别就降一级——最低降到最底一级为止——失败计数随即归零重新开始。所以连着失败四次，掉的是两级，不是一级。' },
      { en: 'At ten successes in a row it climbs by one — never above the ceiling — and the success count starts again at zero. One stray failure part-way up throws that count away, and the climb starts over.',
        zh: '连续成功到十次，当前级别就升一级——最高升到上限为止——成功计数随即归零重新开始。爬到一半丢了一帧，这个计数就作废，只能从头再爬。' },
    ] },
    { kind: 'table', heading: {
      en: 'The far link, and its first trip below the ceiling, value by value',
      zh: '远端那条链路，以及它第一次跌破上限，一格一格看',
    }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'RSSI of the far link', zh: '远端链路的 RSSI' }, N('−75.46 dBm')],
      [{ en: 'less the noise floor, 20 MHz', zh: '减去 20 MHz 的噪声地板' }, N('−93.99 dBm')],
      [{ en: '= SNR', zh: '= SNR' }, N('18.53 dB')],
      [{ en: 'MCS 2 asks, margin included', zh: 'MCS 2 的要求，含余量' }, N('13.99 + 3 = 16.99 ✓')],
      [{ en: 'MCS 3 asks, margin included', zh: 'MCS 3 的要求，含余量' }, N('16.99 + 3 = 19.99 ✗')],
      [{ en: 'so the ceiling is', zh: '于是上限是' }, N('MCS 2')],
      [{ en: 'attempt 192, no answer: failures', zh: '第 192 次尝试，没有答复：失败计数' }, N('1')],
      [{ en: 'attempt 193, no answer: failures', zh: '第 193 次尝试，没有答复：失败计数' }, N('2')],
      [{ en: 'so attempt 194 goes out at', zh: '于是第 194 次尝试用的是' }, N('MCS 1 · 768.8 µs')],
      [{ en: 'answered frames needed to get back', zh: '要爬回去需要几帧被答复' }, N('10')],
    ] },
  ],
  deeper: [
    { heading: { en: 'Multi-user frames report an outcome too', zh: '多用户帧同样会上报结果' }, text: {
      en: 'The loop is fed by every exchange, not only single-user ones: a downlink multi-user PPDU reports one outcome per member, success or failure, exactly as an ordinary frame would. In the OFDMA variant of the MU-MIMO lesson the access point sends 169 multi-user PPDUs carrying 492 parts addressed to phones, and rate control hears about each of them: 620 outcome reports for those phones in all — 128 from single-user frames and 492 from multi-user parts, 597 successes and 23 failures. A rung used only inside multi-user PPDUs therefore adapts exactly as a single-user one does.',
      zh: '喂给这个回路的是每一次交换，不只是单用户的：一个下行多用户 PPDU 会为每个成员各上报一次成功或失败，和普通帧一模一样。在 MU-MIMO 那一课的 OFDMA 变体里，接入点发出 169 个多用户 PPDU，其中 492 份是发给手机的，而速率控制对每一份都收到了上报：这些手机一共产生 620 次结果上报——128 次来自单用户帧，492 次来自多用户部分，其中 597 次成功、23 次失败。所以一个只在多用户 PPDU 里用到的级别，也会像单用户的那样自适应。',
    } },
  ],
  sources: [
    { en: 'Which rung a link can carry is the simulator’s own `mcsForRssi`: the received power against the per-rung minimum input sensitivities of Clause 36 of IEEE Std 802.11-2024, plus a fixed margin. The margin is a model choice, not a number the standard states.',
      zh: '一条链路能撑住哪一级，用的是本仿真器自己的 `mcsForRssi`：把接收功率与 IEEE Std 802.11-2024 第 36 章的各级最小输入灵敏度相比，再加一个固定余量。这个余量是模型取值，标准并没有规定它。' },
    { en: 'The three airtimes are the TXTIME formula of §17.4.3 over the simulator’s representative preamble and symbol for such a PPDU; the rate line is the modulation and coding rate of that rung at this width and one stream.',
      zh: '三个空口时间来自 §17.4.3 的 TXTIME 公式，代入的是本仿真器为这类 PPDU 选定的代表性前导与符号长度；“速率一行”是该级别在这个带宽、单流下的调制编码速率。' },
    { en: 'That a sender learns only "answered or not" is the standard’s own design: §10.3.2.9 makes the acknowledgement the sole indication of success, and no feedback of the received signal quality is defined for it.',
      zh: '“发送端只知道答了还是没答”，本就是标准的设计：§10.3.2.9 把确认帧定为成功与否的唯一指示，并没有为它定义任何关于接收信号质量的反馈。' },
  ],
  scenario: () => rateScenario(),
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK timeout', '第一次 ACK 超时', (r) => r.type === 'ACK_TIMEOUT'),
    J('first retry', '第一次重传', firstRetry),
  ],
  observe: [
    { en: 'The far station’s blocks change length as the run goes on: 524.0 µs at its MCS 2 ceiling, 768.8 one step down, 1,476.0 at the bottom rung. The choice is visibly moving, not fixed.', zh: '远端站点的方块随着仿真推进在变长变短：在上限 MCS 2 上是 524.0 µs，降一级是 768.8 µs，到最底一级是 1,476.0 µs。这个选择肉眼可见地在动，不是固定的。' },
    { en: 'Scroll the whole three seconds and the far station never once sends above MCS 2. The ceiling is a lid it bumps into, not a target it sometimes overshoots.', zh: '把整整三秒拉完，远端站点一次也没有发到 MCS 2 以上。上限是它撞上去的一个盖子，而不是一个偶尔会冲过头的目标。' },
    { en: 'The near station, a metre from the access point, never moves at all: 4,010 frames in three seconds, every one at MCS 11, and no ACK timeout anywhere on its lane.', zh: '离接入点一米的近端站点则纹丝不动：三秒 4,010 帧，全部在 MCS 11 上，它那条泳道上一次 ACK 超时也没有。' },
  ],
  tryThis: [
    { en: 'Open in the editor and move the far station half a metre towards the access point. Nothing happens: it crosses no threshold, and the run comes back frame for frame identical. Move it two metres and the ceiling rises from MCS 2 to MCS 3 — 3,712 frames in the three seconds instead of 3,003.', zh: '点“在编辑器中打开”，把远端站点朝接入点挪半米。什么也不会发生：它跨不过任何门限，整段仿真一帧不差地重来一遍。挪两米才管用：上限从 MCS 2 抬到 MCS 3，三秒里交付的帧数从 3,003 变成 3,712。' },
    { en: 'Put it back, then drag it five metres closer instead. The bottom rung now never occurs at all — with that much signal in hand, the sender has no reason to go anywhere near it.', zh: '把它挪回去，再改成朝接入点挪五米。这回最底一级一次都不出现了——手里有这么多信号，发送端根本没有理由靠近它。' },
  ],
  quiz: [
    {
      q: { en: 'A frame goes out and no answer comes back. What does the sender know about why?', zh: '一帧发出去了，没有答复回来。发送端对“为什么”知道些什么？' },
      options: [
        { en: 'That the signal was too weak for the rung it chose', zh: '它知道信号撑不住自己选的那一级' },
        { en: 'Only that no answer came — a weak signal and a neighbour starting in the same slot look identical from there', zh: '它只知道没有答复——弱信号和“邻居在同一个时隙开口”，在它那里长得一模一样' },
        { en: 'The access point names the reason in its next beacon', zh: '接入点会在下一个信标里告诉它原因' },
      ],
      answer: 1,
      explain: { en: 'The only input rate control has is whether the ACK arrived or the ACK timeout did. Nothing in that says which of the two killed the frame, which is why a run of bad luck at contention can drag the rung down exactly as a wall would.', zh: '速率控制唯一的输入，就是“ACK 回来了”还是“ACK 超时到了”。这里面没有任何东西能区分是哪一种原因打死了这一帧——所以竞争中的一串坏运气，能像一堵墙那样把级别拖下去。' },
    },
    {
      q: { en: 'The far station succeeds twenty times in a row. Can it move above MCS 2?', zh: '远端站点连着成功了二十次。它能升到 MCS 2 以上吗？' },
      options: [
        { en: 'No: MCS 2 is the ceiling the signal in that corner sets, and no run of successes lifts it', zh: '不能：MCS 2 是那个角落的信号定下的上限，再长的连胜也抬不动它' },
        { en: 'Yes, once it has enough successes banked', zh: '能，只要攒够足够多的成功次数' },
        { en: 'Only if the near station stops uploading', zh: '只有在近端站点停止上传时才可以' },
      ],
      answer: 0,
      explain: { en: 'Distance and the brick wall fix the ceiling; the sender only ever chooses among the rungs below it. Across three seconds of this run the far station does not send above MCS 2 once.', zh: '上限由距离和那堵砖墙钉死，发送端只能在上限以下的那些级别里挑。整段三秒的仿真里，远端站点一次也没有发到 MCS 2 以上。' },
    },
  ],
}
