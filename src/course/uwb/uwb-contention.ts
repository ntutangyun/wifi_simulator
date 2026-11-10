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
  module: 19,
  title: '控制器不知道有哪些设备在场',
  why: '到目前为止，每一轮测距都是调度式的：轮询帧逐一指定每个锚点（anchor）及其应答时隙，于是从不发生碰撞——因为没有任何设备需要自行选择时隙。但这种方式成立的前提，是控制器已有一份在场设备的名单。而一部刚进入陌生仓库的手机，并没有这份名单。另一种模式里，轮询帧不指定任何应答方，只开设一段应答窗口（response window），收到它的锚点各自随机抽取一个时隙作答。两个锚点抽中同一个时隙时，在这个房间里没有一路电平占优，两路应答都无法解出；锚点越多、窗口越窄，发生碰撞的就越多。没有任何机制会通知应答失败的锚点，模型在每轮结束时代为完成这一反馈：未被接收就减少一次尝试机会，机会用完就整整一轮不发送，称为空过（sit-out）。窗口加宽，碰撞减少、定位增多，但一轮也变长；而且抽到第几个时隙就要等待多久，单边测距的误差随等待的时隙数逐个增大——最宽窗口的定位次数几乎是最窄时的四倍，误差也是三倍多。只要控制器有了名单，调度式测距每轮所有锚点都能应答、每轮都给出定位；竞争式抽取的用途，是与尚未登记的设备建立联系。',
  outcomes: [
    '说清一个不指定应答方的轮询帧为什么会引起碰撞，以及大致会有多少',
    '从日志里读出一次抽取、一次碰撞，以及一台设备整轮不发送的那一次（空过）',
    '在“更宽的应答窗口（response window）”与“它带来的测距误差”之间做权衡',
  ],
  needs: ['uwb-coexist'],
  terms: [
    { term: 'response window', plain: '轮询帧开设的一组时隙，任何设备都可以在其中作答，轮询帧不指定任何应答方' },
    { term: 'RCPS', plain: '轮询帧中的一个信息元素，用来通告这个窗口，以及它有多少个时隙' },
    { term: 'RCMA', plain: '另一个信息元素，规定一台设备最多可以连续尝试几次' },
    { term: 'sit-out', plain: '一台设备整整一轮不发送，因为它的尝试次数用完了' },
  ],
  picture: [
    { heading: '调度式应答要先有名单', text: '超宽带（UWB）第一阶段里的每一轮都是调度式的：轮询帧逐一指定每个锚点及其时隙，于是不会发生碰撞——因为没有设备需要自行选择。但这一切都建立在“控制器已经知道有哪些设备在场”之上——而很多时候，它并不知道。' },
    { heading: '于是轮询帧不指定应答方', text: '取而代之的是开设一组不属于任何特定设备的时隙，这就是应答窗口。轮询帧里有一个信息元素——RCPS（ranging contention phase structure IE）——写明这里一共有几个时隙。每一台解出这个轮询帧的设备都从中随机选取一个，在该时隙作答；控制器则通过接收到的应答，得知有哪些设备在场。' },
    { kind: 'watch', jump: 1, heading: '观察六个锚点各自抽取时隙', text: '载入仿真、按下播放，然后跳到第一个抽到时隙的锚点。六个锚点在同一时刻、根据同一个轮询帧各抽取一次，日志连续输出六行。读一读这些时隙号，看看有没有两个相同。' },
    { heading: '同一个时隙里的两路应答，都解不出来', text: '两个锚点在同一个时隙里作答，两路信号就在手机的接收机处相叠：若其中一路的到达电平明显高于另一路，接收机就只解出较强的那一路，较弱的那一路丢失——这就是捕获效应（capture effect）；两路电平相近时则双双失败。而在这个房间里，每个锚点离手机的距离相同、发射功率（transmit power）也相同，于是没有一路电平占优。每一个被两台设备同时选中的时隙，都会损失两路应答。' },
    { heading: '没有任何机制通知应答失败的锚点', text: '在这种模式里，测量在手机那一侧就结束了，没有任何信息返回锚点，所以应答失败的锚点永远不会被告知。模型改为在轮次边界上完成这一反馈：手机没有测到的锚点，下一轮再尝试一次。它能尝试几次，由轮询帧里的另一个信息元素——RCMA（ranging contention MAC attempts IE）——规定；次数用完，它就整整一轮不发送，这就是空过。' },
    { kind: 'watch', jump: 3, heading: '观察一个锚点空过这一轮', text: '跳到第一个用完尝试次数的锚点。它连续三轮都抽取了时隙，却一次也未被接收；到第四轮，它不再发送。那一轮它的泳道上没有任何记录——没有抽取，没有应答，也没有失败。' },
    { heading: '抽到第几个时隙，就要等待多久', text: '这里有一项容易被忽略的代价。锚点是在自己抽到的那个时隙里作答的，抽到第几号时隙，手机就要等待相应的时长——而等待越久，两个晶振（crystal）之间累积的漂移也越大。调度式的轮次里，这段等待由日程表规定；而在这里它是一次均匀随机抽取，窗口越宽，可能等到的时隙号越大。' },
    { heading: '何时应改回调度式应答', text: '所以，窗口越宽，碰撞越少而测距精度越差；窗口越窄则相反。而只要控制器有了名单，调度式在应答、定位和时延上都更好；唯一不占优的是测距误差——六个锚点按日程排满，排在后面的要多等几个时隙，误差比最窄的窗口略大，仍比更宽的两档窗口小。竞争式抽取不是让一批已知锚点测得更快的手段，而是用来和尚未登记的设备建立联系。' },
  ],
  numbers: [
    { kind: 'formula', heading: '把生日换成时隙的生日问题', text: 'P(独占自己的时隙) = (1 − 1/S)^(N−1)      期望应答数 = N·(1 − 1/S)^(N−1)\nN = 6 个锚点：      S = 4 → 1.42      S = 8 → 3.08      S = 16 → 4.35', note: '每个锚点都独立抽取，所以只有当其余五个都没有抽中你这个时隙时，你的应答才能被成功接收；再将这个概率乘以六，就是手机期望接收到的应答数。' },
    { kind: 'table', heading: '三十轮，三种窗口', head: [
      '应答时隙', '轮次时长', '公式',
      '实测', '碰撞时隙', '空过', '定位',
    ], rows: [
      ['4', '10 ms', '1.42', '1.57', '46', '23', '7 / 30'],
      ['8', '18 ms', '3.08', '2.63', '43', '11', '15 / 30'],
      ['16', '34 ms', '4.35', '4.13', '26', '1', '27 / 30'],
      ['调度式，6 个锚点', '14 ms', '6.00', '6.00', '0', '0', '30 / 30'],
    ] },
    { kind: 'table', heading: '为什么实测不等于公式', head: [
      '应答时隙', '每轮竞争者',
      '按这个人数的期望', '三十轮的应答总数',
    ], rows: [
      ['4', '5.23', '1.54', '47 against 46.1 · 0.2 σ'],
      ['8', '5.63', '3.02', '79 against 90.7 · 1.8 σ'],
      ['16', '5.97', '4.33', '124 against 129.9 · 1.0 σ'],
    ] },
    { text: '公式假定每一轮都有六个竞争者，而空过意味着永远不到六个。竞争者变少，在四个时隙时会使期望值升高——从 1.42 升到 1.69；在更宽的窗口里则会使期望值降低。三行各自偏离的方向，恰好就是这样来的。' },
    { kind: 'table', heading: '第 0 轮：六次抽取，两次测距', head: [
      '锚点', '抽到', '结果',
    ], rows: [
      ['anchor-1', 'slot 4', '丢失，与 anchor-4 发生碰撞'],
      ['anchor-2', 'slot 7', '丢失，与 anchor-6 发生碰撞'],
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
      ['调度式，6 个锚点', '由日程表规定', '20.4 cm'],
    ] },
    { text: '单边测距会留下一项剩余误差：应答每多等一毫秒，就是 3.0 cm，于是每个时隙 6.0 cm。' },
    { kind: 'steps', heading: '未被指定时隙的设备如何取得发送机会：逐步说明', items: [
      '手机的轮询帧开启这一轮，并通告两个取自会话的数：应答窗口里有 8 个时隙，一个应答者可以尝试 3 次。',
      '解出轮询帧的锚点，先看自己还剩几次尝试。一次不剩，就不抽取时隙：记录“本轮空过”，并把尝试预算恢复为三次。',
      '否则它抽取一个时隙：从第 1 号到第 S 号里均匀随机取一个。抽到的位置从窗口的第一个时隙到最后一个都有可能，机会均等。',
      '轮询帧自己占的那个开头时隙，永远不在其中。锚点记录抽到的时隙以及这是第几次尝试，随后在该时隙作答。',
      '手机逐个时隙接收，不指定任何对端，所以空的时隙只是没有信号：不会为它写入超时记录。',
      '同一个时隙里的两个回答在手机处相叠。接收机只有在较强的一路领先 6 dB 时才解出它（6 dB 是本课取的门限）；而这里每个锚点都在 3.50 m 处、功率相同，于是两路皆失。碰撞记录一个时隙一条，不是每丢一路一条。',
      '这一轮结束时，每个抽过时隙的锚点都会得知手机有没有测到自己——由模型在轮次边界上告知，空中不发送任何东西。被接收：尝试预算恢复为三次；未被接收：减少一次尝试。',
      '而抽到的时隙就是应答时延：抽到第 k 个时隙，就要等 k 个 2 ms 的时隙，这在单边测距里折合成每个时隙 6.0 cm 的测距误差。',
    ] },
    { kind: 'table', heading: 'anchor-2 的前四轮', head: [
      '轮次', '它抽到', '结果',
    ], rows: [
      ['0', '第 7 号时隙，第 1 次尝试', '与 anchor-6 发生碰撞，丢失'],
      ['1', '第 5 号时隙，第 2 次尝试', '发生碰撞，丢失'],
      ['2', '第 3 号时隙，第 3 次尝试', '发生碰撞，丢失'],
      ['3', '不抽时隙，第 0 次尝试', '空过，尝试预算恢复为三次'],
    ] },
  ],
  deeper: [
    { heading: '时延', text: '时延方面，调度式同样占优。基准场景要等六轮，才有某一轮集齐三次测距，所以它的第一次定位出现在 1.218 s；而调度式从第一轮起每轮都有定位，而且每轮还短 4 ms。' },
    { heading: '三十轮的实际结果', text: '基准场景在三十轮里得到 79 次应答（理论上最多 180 次）与 15 次定位，这十五次里有六次只用上三个锚点，而第一次要等到第 6 个块、1.218 s 才出现。同样六个锚点改用调度式，则是 180 次应答、30 次定位。四个时隙时，七次定位全都只用到最少的三个锚点。窗口从 8 个时隙翻倍到 16 个，实测那一列每轮只多得到 1.50 个应答（2.63 → 4.13，三十轮 79 → 124 条），公式那一列给的是 1.27（3.08 → 4.35）；无论按哪一列，代价都是每轮多占用 16 ms。三个总数都落在所列公式的 4σ 二项包络之内，而没有一个等于公式给出的那个数。' },
    { heading: '逐时隙增大的误差', text: '基准场景直接展示了这项剩余误差。八个应答时隙上的分时隙测距误差 RMS 依次是 7.3、14.9、16.2、23.5、28.2、32.0、22.8 与 47.1 cm——大约每个时隙增加 6 cm，近似线性增长；各时隙的样本不多，因此存在起伏。整段运行合起来是 26.8 cm，而四个时隙是 14.6 cm、十六个时隙是 51.4 cm：51.4 除以 14.6，正好三点五倍。' },
    { heading: '为什么一条超时也没有', text: '这三个场景里大多数应答时隙都是空的，可一条超时记录也没有。超时记录必须写明是哪个对端没有应答，而竞争时隙里不存在这样一个对端——手机把它向所有设备开放。空时隙是抽取的正常结果，不是故障。锚点漏收轮询帧时，仍然会产生超时。而被共用的时隙确实会记一条：“uwb-1 contention collision in slot 4”——一个时隙一条，不是每丢一路应答记一条。' },
    { heading: '这样的距离上，不会发生捕获效应', text: '两帧相叠时，只要较强的一路领先 6 dB，接收机就解出它。而这里每个锚点离手机都是 3.50 m，发的都是同样的 −14 dBm，于是两路碰撞的应答到达电平只差千分之几分贝。三个场景九十轮里，没有任何一次测距是在一个同时记录了碰撞的时隙里解出来的。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '那条反馈回路并不经过空口：轮次结束时每个锚点直接得知「手机有没有测到自己」，不占用任何时隙、不会丢失、也不会晚一轮才到。真实的单边测距里应答者确实无从得知自己是否被接收——这正是标准 §10.32.1 那条 NOTE 的处境——它只能依靠定时器与上层策略推断。所以本课那条「未被接收就再尝试一次」的规则，比任何真实实现都灵敏。' },
    { kind: 'model-value', text: '抽取与预算这两件事都是模型：在窗口里均匀抽一个时隙是本课的取法，8 个时隙与 3 次尝试是本课取的默认值。标准只说响应阶段是共享的，没有规定应答者如何选择时隙，也没有规定选取失败之后如何处理。于是本课那道生日问题的曲线衡量的是「均匀抽取」这一种策略，而真实实现完全可以按信号强度错开、按地址散列、或者按上一轮的结果退避。' },
    { kind: 'threshold', text: '碰撞的裁决是一条 6 dB 的硬门限，这个数是本课取的：领先 6 dB 的那一路整帧解出，否则两路皆失，中间没有任何过渡。本课特意把六个锚点摆在等距等功率处，使这条门限不起作用，于是「两台设备选中同一个时隙就损失两路应答」在这里是确定的。真实接收端的成败是一条概率曲线：领先 5 dB 未必一定失败，领先 7 dB 也未必一定成功。' },
    { kind: 'out-of-scope', text: '本课的重试预算是每个锚点一份，不是每对（锚点，标签）一份。本课只有一部手机，所以看不出来；场上多几部手机时，锚点在 A 的轮次里遭遇的一次失败会让它在 B 的轮次里空过，而这不是任何标准里的行为。所以本课的结论只对单标签成立，多标签的竞争不应使用这个模型来分析。' },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.32.2 定义了基于竞争的测距轮次——调度模式 0——它的轮询帧不再为每个应答者逐一指派时隙，而是开出一段共享的应答阶段。',
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
    J('开设窗口的那个轮询帧', firstUwbPoll),
    J('第一个抽到时隙的锚点', firstUwbContend),
    J('第一个被两个锚点同时选中的时隙', firstUwbContendCollision),
    J('第一个用完尝试次数的锚点', firstUwbSitOut),
    J('六轮之后才出现的第一次定位', firstUwbPosition),
  ],
  observe: [
    '六次抽取在同一时刻输出：“anchor-1 contends: slot 4 (attempt 1)”，另外五条也是这个样子。有两对抽中了同一个时隙。碰撞记录写的是时隙，不是其中丢失的应答；检视面板上的“碰撞时隙数”那一行，统计的也是同一个量。',
    '跟踪 anchor-2。它连续三轮都抽取了时隙，却一次也未被接收；到第四轮，日志输出 “anchor-2 sits out this round”，不抽取任何时隙。那一整轮里，它检视面板上的那一行都写着“竞争抽取 · 本轮空过”。',
  ],
  tryThis: [
    '载入“16 个应答时隙”。碰撞时隙变少，定位几乎翻倍——但一轮延长到 34 ms，测距误差也几乎翻倍，因为平均一路应答现在要等八点五个时隙，而不是四点五个。再载入“4 个应答时隙”，观察定位次数如何下降。',
    '在编辑器里把基准场景的“调度”改成“时间调度”并重新载入。应答没有一次丢失，每一轮都解出定位，“响应时隙数”和“尝试次数”两个输入框变灰。请注意唯一变差的那个数：把测距误差与 4 个时隙那一次比较。',
  ],
  quiz: [
    {
      q: '在 4 个应答时隙下，六个锚点每轮给出 1.57 次测距，而公式预测 1.42。为什么实测高于它？',
      options: [
        '两路发生碰撞的应答中，较强的一路被解了出来',
        '空过使参与竞争的锚点不足六个，而在四个时隙下，竞争者越少，独占到的时隙反而越多',
        '手机把发生碰撞的时隙重新轮询了一遍',
      ],
      answer: 1,
      explain: '竞争者只有四个时，期望是 1.69 而不是 1.42；按每一轮实测的竞争者数逐轮代入，平均是 1.54，而实测是 1.57。在更宽的窗口里，竞争者减少的效果方向相反。',
    },
    {
      q: '同一个房间、同样六个锚点、同样的射频：为什么 16 个时隙窗口下的测距误差是 4 个时隙窗口的三点五倍？',
      options: [
        '抽到的时隙就是应答时延，而单边测距每个时隙留下 6.0 cm 的 1σ',
        '时隙越多碰撞越多，而碰撞过的时间戳仍会被使用',
        '更宽的窗口分散了发射功率，于是信噪比（SNR）下降',
      ],
      answer: 0,
      explain: '抽到第 k 个时隙就意味着要等 k 个 2 ms 的时隙，于是每个时隙 6.0 cm 的 1σ。更宽的窗口碰撞是更少而不是更多，而每一帧的功率也从未变过。',
    },
  ],
}
