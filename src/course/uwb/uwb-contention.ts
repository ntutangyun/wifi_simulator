/**
 * UWB Tier 2 · M14 · Other ranging modes · When the controller does not know who is there.
 *
 * Every UWB round so far has been a roll call: the poll named each anchor and
 * the slot it had to answer in, and nothing could collide because nothing
 * chose. This lesson withdraws the list. The poll announces a window of S
 * response slots and nobody's name, each anchor that decodes it draws a slot
 * uniformly, and the tag finds out who is in the room by hearing them —
 * IEEE Std 802.15.4-2024's schedule mode 0.
 *
 * Six anchors ring the tag at exactly 3.50 m, so no answer can ever capture
 * another and a collision is always two answers lost. The lesson prices what
 * that costs: responses against the birthday-problem formula, collisions,
 * retries, sit-outs, the round's length — and the one cost that is easy to
 * miss, that the slot an anchor drew *is* its reply time, so a wider window
 * buys fewer collisions and worse ranges.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the draw in
 * plain words first, the formula and the three measured windows after it, the
 * per-slot error ramp and the absent timeouts in `deeper`, the clauses and the
 * model's own defaults in `sources`. Every number quoted below is pinned in
 * tests/course/uwb-contention.test.ts; `npx tsx scripts/lesson-dump.ts
 * uwb-contention` prints it with its length.
 */
import type { Scenario } from '../../model/scenario'
import { J, anchor, firstUwbContend, firstUwbContendCollision, firstUwbPoll, firstUwbPosition, firstUwbSitOut, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'

/** The scene the lesson runs: the 8-slot base window, or one of its two variants. */
export type UwbContentionVariant = 'base' | 'slots4' | 'slots16'

/** Anchors on the ring: the `N` of the analytic model. */
export const CONTENTION_ANCHORS = 6
/** Every anchor is exactly this far from the tag, in metres. */
export const RING_RADIUS_M = 3.5
/** Ring centre — and the tag's place. The anchors share the tag's height, so the radius *is* the range. */
export const RING_CENTER = { x: 5, y: 4, z: 2.2 }
/** Response slots the poll advertises in each of the three scenes (the RCPS window). */
export const CONTENTION_SLOTS: Record<UwbContentionVariant, number> = { base: 8, slots4: 4, slots16: 16 }

/** Ring coordinates rounded to the micrometre, so every true range is 3.500000 m and the editor shows tidy numbers. */
const r6 = (v: number): number => Math.round(v * 1e6) / 1e6

/**
 * Six anchors every 60° on a 3.5 m ring, starting due east, around one tag at
 * the centre of the 10 × 8 m lab. Anchors and tag all sit at z = 2.2, so the
 * ring radius is the whole 3-D range: all six true distances are 3.50 m and all
 * six answers reach the tag at the same level. That equality is the point — it
 * is what puts the medium's 6 dB capture rule out of reach here, so every
 * shared slot loses both answers and a collision is really a collision.
 *
 * SS-TWR, because a contention round has room for exactly one anchor-originated
 * frame; NLOS off and the crystals drawn, so the only error term that moves is
 * the one the draw itself controls. `contentionSlots` is the only thing the two
 * variants change.
 */
export function uwbContentionScenario(variant: UwbContentionVariant = 'base'): Scenario {
  const anchors = Array.from({ length: CONTENTION_ANCHORS }, (_, i) => {
    const rad = (i * 360 / CONTENTION_ANCHORS) * Math.PI / 180
    return anchor(
      `anchor-${i + 1}`, `Anchor ${i + 1}`,
      r6(RING_CENTER.x + RING_RADIUS_M * Math.cos(rad)),
      r6(RING_CENTER.y + RING_RADIUS_M * Math.sin(rad)),
      RING_CENTER.z,
    )
  })
  const tag = uwbTag('uwb-1', 'Phone', RING_CENTER.x, RING_CENTER.y, RING_CENTER.z)
  return uwbSc(oneRoom(), [...anchors, tag], {
    method: 'ss', nlos: false, schedule: 'contention', contentionSlots: CONTENTION_SLOTS[variant],
  })
}

export const uwbContention: Lesson = {
  id: 'uwb-contention',
  module: 17,
  title: '控制器不知道有谁在场',
  why: '到目前为止，每一轮测距都是一次点名：轮询帧点出每个锚点（anchor）的名字和它该作答的时隙，于是从来不会发生碰撞——因为从来没有谁需要挑选。可这一套成立的前提，是控制器手里有一份“谁在场”的名单。而一部刚走进陌生仓库的手机，根本没有名单。这一课讲的是另一种模式：轮询帧谁的名字也不点，只开出一段窗口，让听见它的人自己抽一个时隙。',
  outcomes: [
    '说清一个不点名的轮询帧为什么会引起碰撞，以及大致会有多少',
    '从日志里读出一次抽取、一次碰撞，以及一台设备整轮不出声的那一次（空过）',
    '在“更宽的应答窗口（response window）”与“它换来的测距误差”之间做权衡',
  ],
  needs: ['uwb-coexist'],
  terms: [
    { term: 'response window', plain: '轮询帧开出的一串时隙，谁都可以在里面作答，而它一个名字也不点' },
    { term: 'RCPS', plain: '轮询帧里那张小清单，用来通告这个窗口，以及它有多少个时隙' },
    { term: 'RCMA', plain: '另一张清单，规定一台设备最多可以连着尝试几次' },
    { term: 'sit-out', plain: '一台设备整整一轮不出声，因为它的尝试次数用完了' },
  ],
  picture: [
    { heading: '点名要先有名单', text: '超宽带（UWB）第一阶段里的每一轮都是点名：轮询帧点出每个锚点和它的时隙，于是没有东西会碰撞——因为没有东西需要挑选。可这一切都建立在“控制器已经知道场上有谁”之上——而很多时候，它并不知道。' },
    { heading: '于是轮询帧谁也不点', text: '取而代之的是开出一串不属于任何特定设备的时隙，这就是应答窗口。轮询帧里有一张短清单——RCPS（ranging contention phase structure IE）——写明这里一共有几个时隙。每一台解出这个轮询帧的设备都从中随机挑一个，在那里作答；控制器则靠听见他们，来知道场上有谁。' },
    { kind: 'watch', jump: 1, heading: '看六个锚点各抽一个', text: '载入仿真、按下播放，然后跳到第一个抽到时隙的锚点。六个锚点在同一刻、根据同一个轮询帧各抽一次，日志一口气打出六行。读一读这些时隙号，看看有没有两个撞在一起。' },
    { heading: '同一个时隙里的两路应答，双双阵亡', text: '两个锚点在同一个时隙里作答，碰上的是介质（medium）那条寻常的规则：若一路明显比另一路响，就解出较响的那一路，否则两路皆失。而在这个房间里，每个锚点离手机的距离相同、发射功率（transmit power）也相同，于是谁也压不过谁。每一个被共用的时隙，都要赔上两路应答。' },
    { heading: '没有谁会去通知失败者', text: '在这种模式里，测量在手机那一侧就结束了，没有任何东西回到锚点，所以应答死掉的锚点永远不会被告知。模型改为在轮次边界上把这个回路闭上：手机没有测到的锚点，下一轮回来再试一次。它能试几次，由轮询帧里的另一张清单——RCMA（ranging contention MAC attempts IE）——说了算；次数用完，它就整整一轮不出声，这就是空过。' },
    { kind: 'watch', jump: 3, heading: '看一个锚点放弃', text: '跳到第一个用完尝试次数的锚点。连着三轮它都抽了时隙，却一次也没被听见；到第四轮，它干脆不作声了。那一轮它的泳道上什么也没有——没有抽取，没有应答，也没有失败。' },
    { heading: '抽到第几个时隙，就等多久', text: '这里有一笔容易被忽略的账。锚点是在自己抽到的那个时隙里作答的，抽到第几号时隙，手机就得等多久——而等得越久，两只晶振（crystal）漂开得也越多。点名式的轮次里，这段等待由日程表钉死；而在这里它是一次掷骰子，窗口越宽，骰子的面数越多。' },
    { heading: '什么时候该回到点名', text: '所以，窗口越宽，碰撞越少而距离越差；窗口越窄则反过来。而无论哪一边，只要控制器手里有了名单，点名在本课衡量的每一个维度上都赢。抽签抢时隙不是让一批已知锚点跑得更快的手段，而是用来跟你还没见过的设备搭上话。' },
  ],
  numbers: [
    { kind: 'formula', heading: '把生日换成时隙的生日问题', text: 'P(独占自己的时隙) = (1 − 1/S)^(N−1)      期望应答数 = N·(1 − 1/S)^(N−1)\nN = 6 个锚点：      S = 4 → 1.42      S = 8 → 3.08      S = 16 → 4.35', note: '每个锚点都独立地抽，所以只有当其余五个都没落在你这个时隙上，你的回答才活得下来；再拿这个概率乘以六，就是手机期望听到的应答数。' },
    { kind: 'table', heading: '三十轮，三种窗口', head: [
      '应答时隙', '轮次时长', '公式',
      '实测', '碰撞时隙', '空过', '定位',
    ], rows: [
      ['4', '10 ms', '1.42', '1.57', '46', '23', '7 / 30'],
      ['8', '18 ms', '3.08', '2.63', '43', '11', '15 / 30'],
      ['16', '34 ms', '4.35', '4.13', '26', '1', '27 / 30'],
      ['点名，6 个锚点', '14 ms', '6.00', '6.00', '0', '0', '30 / 30'],
    ] },
    { kind: 'table', heading: '为什么实测不等于公式', head: [
      '应答时隙', '每轮竞争者',
      '按这个人数的期望', '三十轮的应答总数',
    ], rows: [
      ['4', '5.23', '1.54', '47 against 46.1 · 0.2 σ'],
      ['8', '5.63', '3.02', '79 against 90.7 · 1.8 σ'],
      ['16', '5.97', '4.33', '124 against 129.9 · 1.0 σ'],
    ] },
    { text: '公式假定每一轮都有六个竞争者，而空过意味着永远不到六个。场上变稀，在四个时隙时是帮忙的——它把期望从 1.42 抬到 1.69；在更宽的窗口里则是帮倒忙。三行各自偏离的方向，恰好就是这样来的。' },
    { kind: 'table', heading: '第 0 轮：六次抽取，两次测距', head: [
      '锚点', '抽到', '结果',
    ], rows: [
      ['anchor-1', 'slot 4', '丢失，与 anchor-4 撞在一起'],
      ['anchor-2', 'slot 7', '丢失，与 anchor-6 撞在一起'],
      ['anchor-3', 'slot 1', '测到'],
      ['anchor-4', 'slot 4', '丢失'],
      ['anchor-5', 'slot 8', '测到'],
      ['anchor-6', 'slot 7', '丢失'],
    ] },
    { kind: 'table', heading: '窗口加宽的代价', head: [
      '应答时隙', '平均等待', '典型测距误差',
    ], rows: [
      ['4', '2.5 slots', '14.6 cm'],
      ['8', '4.5 slots', '26.8 cm'],
      ['16', '8.5 slots', '51.4 cm'],
      ['点名，6 个锚点', '由日程表定死', '20.4 cm'],
    ] },
    { text: '单边测距会留下一项剩余误差：应答每多等一毫秒，就是 3.0 cm，于是每个时隙 6.0 cm。' },
    { kind: 'steps', heading: '没被点名也能拿到发言权，一步一步', items: [
      '手机的轮询帧开启这一轮，并通告两个取自会话的数：应答窗口里有 8 个时隙，一个应答者可以尝试 3 次。',
      '解出轮询帧的锚点，先看自己还剩几次尝试。一次不剩，就一个时隙也不抽：打印出“本轮空过”，并把预算重新填满到三次。',
      '否则它抽一个时隙：1 加上一个小于 S 的均匀整数。抽到的位置从窗口的第一个时隙到最后一个都有可能，机会均等。',
      '轮询帧自己占的那个开头时隙，永远不在其中。锚点把抽到的时隙和这是第几次尝试打印出来，随后就在那里作答。',
      '手机逐个时隙听过去，不指名任何对端，所以空的时隙就只是安静：不会为它写下超时记录。',
      '同一个时隙里的两个回答在手机处相叠。介质只有在较强的一路领先 6 dB 时才放它过去；而这里每个锚点都在 3.50 m 处、功率相同，于是两路皆失。碰撞记录一个时隙一条，不是每丢一路一条。',
      '这一轮结束时，每个抽过时隙的锚点都会得知手机有没有测到自己——由模型在轮次边界上告知，空中不发送任何东西。被听见：预算恢复成三次；没被听见：少掉一次尝试。',
      '而抽到的时隙就是应答时延：抽到第 k 个时隙，就要等 k 个 2 ms 的时隙，这在单边测距里折合成每个时隙 6.0 cm 的测距误差。',
    ] },
    { kind: 'table', heading: 'anchor-2 的头四轮', head: [
      '轮次', '它抽到', '结果',
    ], rows: [
      ['0', '第 7 号时隙，第 1 次尝试', '与 anchor-6 撞在一起，丢失'],
      ['1', '第 5 号时隙，第 2 次尝试', '撞在一起，丢失'],
      ['2', '第 3 号时隙，第 3 次尝试', '撞在一起，丢失'],
      ['3', '不抽时隙，第 0 次尝试', '空过，预算恢复成三次'],
    ] },
  ],
  deeper: [
    { heading: '时延', text: '时延也站在同一边。基准场景要等六轮，才有某一轮凑齐三次测距，所以它的第一次定位落在 1.218 s；而点名从第一轮起就每轮都有，而且每轮还短 4 ms。' },
    { heading: '三十轮到底交出了什么', text: '基准场景在三十轮里交出 79 次应答（满打满算本可有 180 次）与 15 次定位，这十五次里有六次只用上三个锚点，而第一次要等到第 6 个块、1.218 s 才出现。同样六个锚点改用点名，则是 180 次应答、30 次定位。四个时隙时，七次定位全都只勉强用上三个锚点。窗口从 8 个时隙翻倍到 16 个，每轮只多换来 1.27 个应答，却要多付 16 ms。三个总数都落在所印公式的 4σ 二项包络之内，而没有一个等于公式印出来的那个数。' },
    { heading: '一格一格爬上去的误差', text: '基准场景把这项剩余误差直接摆了出来。八个应答时隙上的分时隙测距误差 RMS 依次是 7.3、14.9、16.2、23.5、28.2、32.0、22.8 与 47.1 cm——大约每格 6 cm 的一道斜坡，各格里样本不多，所以带着起伏。整段运行合起来是 26.8 cm，而四个时隙是 14.6 cm、十六个时隙是 51.4 cm：51.4 除以 14.6，正好三点五倍。' },
    { heading: '为什么一条超时也没有', text: '这三个场景里大多数应答时隙都是空的，可一条超时记录也没有。超时记录必须写明是哪个对端没有应答，而竞争时隙里不存在这样一个对端——手机是把它向所有人开放的。空时隙是抽取的正常结果，不是故障。锚点漏掉轮询帧时，照样还是会超时的。而被共用的时隙确实会记一条：“uwb-1 contention collision in slot 4”——一个时隙一条，不是每丢一路应答记一条。' },
    { heading: '这样的距离上，不会有捕获', text: '两帧相叠时，只要较强的一路领先 6 dB，介质就放它过去。而这里每个锚点离手机都是 3.50 m，发的都是同样的 −14 dBm，于是两路相撞的应答到达时只差千分之几个分贝。三个场景九十轮里，没有任何一次测距是在一个同时记录了碰撞的时隙里解出来的。' },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.32.2 定义了基于竞争的测距轮次——调度模式 0——它的轮询帧不再为每个应答者点名指派时隙，而是开出一段共享的应答阶段。',
    '§10.32.9.5 是 RCPS IE，用来通告这个窗口；§10.32.9.6 是 RCMA IE，规定应答者可以尝试的次数。',
    '§10.32.1 的 NOTE 把“筛掉错误结果”留给上层，这正是标准里没有任何机制告诉应答者“你的回答丢了”的原因。',
    '其余都是模型：8 个时隙与 3 次尝试这两个默认值、均匀抽取、6 dB 的捕获余量，以及那个让锚点在一轮结束时得知手机有没有测到自己的反馈回路。',
  ],
  scenario: () => uwbContentionScenario('base'),
  variants: [
    { label: '4 个应答时隙', scenario: () => uwbContentionScenario('slots4') },
    { label: '16 个应答时隙', scenario: () => uwbContentionScenario('slots16') },
  ],
  jumps: [
    J('开出窗口的那个轮询帧', firstUwbPoll),
    J('第一个抽到时隙的锚点', firstUwbContend),
    J('第一个被两个锚点同时选中的时隙', firstUwbContendCollision),
    J('第一个用完尝试次数的锚点', firstUwbSitOut),
    J('六轮之后才出现的第一次定位', firstUwbPosition),
  ],
  observe: [
    '六次抽取在同一刻打印出来：“anchor-1 contends: slot 4 (attempt 1)”，另外五条也是这个样子。有两对撞在了同一个时隙上。碰撞记录写的是时隙，不是在里面丢掉的应答；检视面板上的“碰撞时隙数”那一行，数的也是同一样东西。',
    '跟住 anchor-2。它连着三轮都抽了时隙，却一次也没被听见；到第四轮，日志打出 “anchor-2 sits out this round”，一个时隙也不抽。那一整轮里，它检视面板上的那一行都写着“竞争抽取 · 本轮空过”。',
  ],
  tryThis: [
    '载入“16 个应答时隙”。碰撞时隙变少，定位几乎翻倍——但一轮长到 34 ms，测距误差也几乎翻倍，因为平均一路应答现在要等八点五个时隙，而不是四点五个。再载入“4 个应答时隙”，看定位怎么塌下去。',
    '在编辑器里把基准场景的“调度”改成“时间调度”并重新载入。应答一次不落，每一轮都解出定位，“响应时隙数”和“尝试次数”两个输入框变灰。请注意唯一变差的那个数：把测距误差与 4 个时隙那一次比一比。',
  ],
  quiz: [
    {
      q: '在 4 个应答时隙下，六个锚点每轮给出 1.57 次测距，而公式预测 1.42。为什么实测高于它？',
      options: [
        '两路相撞的应答中，较强的一路挤了过去',
        '空过使参与竞争的锚点不足六个，而在四个时隙下，场上越稀，赢下的时隙反而越多',
        '手机把发生碰撞的时隙重新轮询了一遍',
      ],
      answer: 1,
      explain: '竞争者只有四个时，期望是 1.69 而不是 1.42；把实测的 5.23 代回去得到 1.54，而实测是 1.57。在更宽的窗口里，同样的“变稀”把结果推向另一边。',
    },
    {
      q: '同一个房间、同样六个锚点、同样的射频：为什么 16 个时隙窗口下的测距误差是 4 个时隙窗口的三点五倍？',
      options: [
        '抽到的时隙就是应答时延，而单边测距每个时隙留下 6.0 cm 的 1σ',
        '时隙越多碰撞越多，而碰撞过的时间戳照样会被使用',
        '更宽的窗口把发射功率摊薄了，于是信噪比（SNR）下降',
      ],
      answer: 0,
      explain: '抽到第 k 个时隙就意味着要等 k 个 2 ms 的时隙，于是每个时隙 6.0 cm 的 1σ。更宽的窗口碰撞是更少而不是更多，而每一帧的功率也从未变过。',
    },
  ],
}
