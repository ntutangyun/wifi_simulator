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
import { J, anchor, firstUwbContend, firstUwbContendCollision, firstUwbPoll, firstUwbPosition, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'

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
  why: '到目前为止，每一轮测距都是按时间调度的：控制器知道有哪些设备，逐一为每个应答方指定时隙，于是从不发生碰撞。IEEE 802.15.4-2024 还定义了另一种调度方式——基于竞争的测距（contention-based ranging）：控制器不必知道在场的是谁、有几个，控制消息只划出一段竞争阶段（contention phase）的时隙范围，应答方在其中竞争。标准为此只规定了三件事：竞争阶段的时隙范围怎样通告，一个应答方在一条控制消息管辖的轮次里最多尝试应答几次（这个数不能超过控制消息的有效轮数），以及竞争会发生碰撞、错误的结果由上层筛除。应答方怎样选时隙、失败之后怎么办，标准都没有规定，也没有任何机制告诉应答方它的应答有没有被收到。本仿真器把应答方称为锚点（anchor），让每个锚点在竞争阶段里均匀随机地选一个时隙；两个锚点选中同一个时隙、电平又相近时，两路应答都无法解出。竞争阶段越宽，碰撞越少、测到的距离越多，但一轮也越长，而且单边测距里等得越久误差越大；控制器已经知道有哪些设备时，按时间调度更好，竞争的用途是与尚未登记的设备建立联系。',
  outcomes: [
    '说出标准对基于竞争的测距规定了什么、没有规定什么',
    '分清本仿真器的哪些做法照标准、哪些是它自己的取法',
    '从日志里读出一次抽取与一次碰撞，并解释竞争阶段宽窄的代价',
  ],
  needs: ['uwb-coexist'],
  terms: [
    { term: 'contention-based ranging', plain: '基于竞争的测距：调度模式 0，控制消息不为每个应答方指定时隙，只划出一段可以竞争的时隙' },
    { term: 'RCPS', plain: '测距竞争阶段结构信息单元（ranging contention phase structure IE）：逐个给出各个阶段的起止时隙号' },
    { term: 'RCMA', plain: '测距竞争最大尝试次数信息单元（ranging contention maximum attempts IE）：一个应答方最多尝试应答几次' },
  ],
  standard: [
    { heading: '两种调度方式（§10.32.1，表 10-166）', text: '多节点测距有两种调度方式，由 ARC 信息单元的 Schedule Mode 字段给出。值为 1 是按时间调度：控制器知道所有受控设备，用 RDM 信息单元指定每个设备的角色与时隙。值为 0 是基于竞争的测距：控制器可能不知道受控设备的数目和身份，设备之间相互竞争。' },
    { heading: '竞争阶段怎样通告（§10.32.2，§10.32.9.5）', text: 'RCPS（ranging contention phase structure IE）信息单元给出测距轮（ranging round）里各个阶段的起止时隙号，并标明每个阶段是发起方、应答方还是测量报告的阶段；RCPS 没有指定的时隙，设备也可以竞争使用。' },
    { heading: '最多尝试几次（§10.32.1，§10.32.9.6）', text: '为了让竞争的设备之间相对公平，一条控制消息管辖的那组测距轮里，一个设备最多尝试应答几次，这个次数就是它的上限，由控制器的上层决定，可以用 RCMA（ranging contention maximum attempts IE）信息单元随控制消息发送。这个值不得超过 ARC 信息单元的 RCM Validity Rounds，即这条控制消息管辖的连续轮数。' },
    { kind: 'steps', heading: '一组基于竞争的测距轮，按标准：逐步说明', items: [
      '控制器发出测距控制消息（ranging control message, RCM），其中 ARC 信息单元的 Schedule Mode 为 0（§10.32.9.1）。',
      '控制消息带 RCPS 信息单元，给出各个阶段的起止时隙；可以带 RCMA 信息单元，给出最大尝试次数（§10.32.9.5、§10.32.9.6）。',
      '发起方发出测距启动消息，开始一轮测距；控制器与发起方是同一台设备时，两条消息可以合在一帧里（§10.32.2）。',
      '应答方在竞争阶段的时隙里应答。选哪一个时隙，标准不规定。',
      '两个应答方选中同一个时隙时可能发生碰撞；没有任何消息告诉应答方结果，错误的结果由上层筛除（§10.32.1 NOTE）。',
      '这条控制消息管辖的轮次里，一个应答方的应答次数不超过 RCMA 给出的上限；下一条控制消息开始新的一组轮次（§10.32.9.6）。',
    ] },
    { heading: '没有反馈（§10.32.1 NOTE）', text: '基于竞争的测距里，应答方之间可能发生碰撞，由上层负责筛除不准确或错误的测距结果。标准没有规定应答方怎样在竞争阶段里选时隙，也没有任何消息告诉应答方它的应答有没有被收到。' },
  ],
  implementation: [
    { topic: '调度模式 0', standard: 'ARC 信息单元的 Schedule Mode 为 0（§10.32.9.1）', sim: '轮询帧带 ARC、RR、RCPS、RCMA、RRMC 五个信息单元，不带 RDM，不为任何锚点指定时隙；ARC 的 Schedule Mode 为 0，RR 带块号与轮号。', kind: 'faithful' },
    { topic: 'RCPS 的内容', standard: '阶段表：表长一个字节，每个阶段两个字节，含阶段指示（§10.32.9.5）', sim: '照此写：表长 1，一个阶段——阶段指示 1（应答方竞争），起止时隙 1 到 S；共三个字节。锚点按自己解出的那条控制消息里的 RCPS 选时隙，没有解出控制消息的锚点这一轮不应答。', kind: 'faithful' },
    { topic: '应答方怎样选时隙', standard: '标准未规定', sim: '每个锚点在竞争阶段里均匀随机地选一个时隙；轮询帧所在的第 0 号时隙不在其中。', kind: 'choice' },
    { topic: '竞争阶段的时隙数', standard: '由控制器决定，标准未给出取值', sim: '基准场景 8 个，两个变体分别为 4 个与 16 个；每个时隙 2 ms。', kind: 'value' },
    { topic: '尝试次数上限', standard: '一条控制消息管辖的轮次里最多尝试几次，不超过有效轮数；没有反馈（§10.32.9.6，§10.32.1）', sim: '照此计数：上限取锚点自己解出的那条控制消息里 RCMA 的值，每来一条新的控制消息就重新计数，成功与否都不影响。本课的场景每轮都发一条新的控制消息（有效轮数为 1），所以上限只能是 1：每个锚点每轮应答一次。编辑器拒绝上限大于有效轮数的设置。', kind: 'faithful' },
    { topic: '两路应答相叠', standard: '标准不规定接收机的判决', sim: '较强的一路领先 6 dB 以上才被解出，否则两路都丢失；6 dB 是本仿真器取的硬门限。本课六个锚点离手机一样远、功率相同，所以选中同一个时隙的两路总是都丢失。', kind: 'value' },
    { topic: '空着的时隙', standard: '标准未规定记录方式', sim: '竞争阶段里没人应答的时隙不写超时记录；一个时隙里发生碰撞，只写一条碰撞记录。', kind: 'choice' },
    { topic: '单边测距的残余误差', standard: '标准不规定时钟偏差（clock offset）的估计方法', sim: '估计残差取百万分之几（parts per million, ppm）中的 0.2，即 0.2 ppm：应答每多等一毫秒误差 3.0 cm，即每个时隙 6.0 cm。', kind: 'value' },
    { topic: '定位', standard: '标准不定义定位', sim: '一轮里测到三个及以上的距离才解一次位置。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '六个锚点各选一个时隙',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一个选时隙的锚点。',
        '读出同一时刻输出的六条抽取记录，看有没有两个锚点选中同一个时隙。',
      ],
      blocks: [
        { kind: 'table', heading: '第 0 轮：六次抽取，两次测距', head: ['锚点', '选中的时隙', '结果'], rows: [
          ['anchor-1', 'slot 4', '丢失，与 anchor-4 发生碰撞'],
          ['anchor-2', 'slot 7', '丢失，与 anchor-6 发生碰撞'],
          ['anchor-3', 'slot 1', '测到'],
          ['anchor-4', 'slot 4', '丢失'],
          ['anchor-5', 'slot 8', '测到'],
          ['anchor-6', 'slot 7', '丢失'],
        ] },
      ],
      expect: '六条记录都是第 1 次尝试；有两对锚点分别选中了 slot 4 与 slot 7，这一轮只测到 anchor-3 与 anchor-5 两个距离。',
      meaning: '选时隙的方式是本仿真器的取法（②）；标准只划出竞争阶段（①）。两个距离不够定位，这一轮没有位置。',
    },
    {
      heading: '一次碰撞在日志里是什么样',
      jump: 2,
      steps: [
        '跳到第一个被两个锚点同时选中的时隙。',
        '看手机一侧的记录：这个时隙只写了一条碰撞记录，没有超时记录，也没有任何帧发回锚点。',
      ],
      expect: '第 4 号时隙一条碰撞记录，两路应答都没有被解出；两个锚点都收不到任何结果。',
      meaning: '这正是标准说的「可能发生碰撞、由上层筛除」（①）：锚点不知道自己失败了，下一轮照常再选一次。',
    },
    {
      heading: '竞争阶段的宽窄',
      more: [0, 1],
      steps: [
        '依次载入本课场景、「4 个应答时隙」与「16 个应答时隙」，各运行三十轮（约 5.9 s）。',
        '对照下表读出每轮测到的距离数、碰撞的时隙数与定位次数。',
      ],
      blocks: [
        { kind: 'formula', heading: '只按选时隙方式推算', text: 'P(独占自己的时隙) = (1 − 1/S)^(N−1)      期望应答数 = N·(1 − 1/S)^(N−1)\nN = 6 个锚点：      S = 4 → 1.42      S = 8 → 3.08      S = 16 → 4.35', note: '这条公式只建立在本仿真器的选时隙方式上：每个锚点独立、均匀地选。' },
        { kind: 'table', heading: '三十轮，三种竞争阶段', head: ['应答时隙', '轮次时长', '公式', '实测', '碰撞时隙', '定位'], rows: [
          ['4', '10 ms', '1.42', '1.33', '55', '2 / 30'],
          ['8', '18 ms', '3.08', '2.73', '45', '14 / 30'],
          ['16', '34 ms', '4.35', '4.27', '24', '28 / 30'],
          ['按时间调度，6 个锚点', '14 ms', '6.00', '6.00', '0', '30 / 30'],
        ] },
      ],
      expect: '竞争阶段越宽，每轮测到的距离越接近六个，定位也越多；三行实测都落在公式附近。',
      meaning: '每个锚点每轮都应答一次、互不知道结果，所以这就是公式描述的那个实验本身（②）。',
    },
    {
      heading: '宽竞争阶段的代价',
      variant: 1,
      more: [0],
      steps: [
        '载入「16 个应答时隙」，看选中大号时隙的锚点要等多久才应答。',
        '对照下表读出三种竞争阶段的测距误差。',
      ],
      blocks: [
        { kind: 'table', heading: '竞争阶段越宽，单边测距误差越大', head: ['应答时隙', '平均等待', '测距误差（均方根）'], rows: [
          ['4', '2.5 个时隙', '16.6 cm'],
          ['8', '4.5 个时隙', '29.1 cm'],
          ['16', '8.5 个时隙', '49.2 cm'],
          ['按时间调度，6 个锚点', '由日程表规定', '20.4 cm'],
        ] },
      ],
      expect: '16 个时隙的误差约是 4 个时隙的三倍；按时间调度比 4 个时隙略差，比更宽的两档好。',
      meaning: '误差来自本仿真器取的 0.2 ppm 时钟估计残差（②），等待越久累积越多；这是单边测距的性质，不是竞争本身。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.32.1 与表 10-166（两种调度方式）、§10.32.2 与 §10.32.9.5（RCPS 信息单元）、§10.32.9.6（RCMA 信息单元，上限不超过 RCM Validity Rounds）、§10.32.1 的 NOTE（竞争可能碰撞，错误结果由上层筛除）、§10.32.9.1（ARC 信息单元）。',
    '本仿真器的取值与取法：8／4／16 个竞争时隙、每个时隙 2 ms、均匀随机选时隙、两路应答相叠时 6 dB 的判决门限、0.2 ppm 的时钟估计残差、三个及以上的距离才定位。',
  ],
  limits: [],
  scenario: () => uwbContentionScenario('base'),
  variants: [
    { label: '4 个应答时隙', scenario: () => uwbContentionScenario('slots4') },
    { label: '16 个应答时隙', scenario: () => uwbContentionScenario('slots16') },
  ],
  jumps: [
    J('开设竞争阶段的那个轮询帧', firstUwbPoll),
    J('第一个选时隙的锚点', firstUwbContend),
    J('第一个被两个锚点同时选中的时隙', firstUwbContendCollision),
    J('第一次定位', firstUwbPosition),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '一个锚点在竞争阶段里的应答与另一个锚点碰撞了。按标准，它会怎样得知？',
      options: [
        '手机在下一个时隙发一帧确认，点出被收到的锚点',
        '它无从得知：标准没有任何机制告诉应答方它的应答有没有被收到，错误的结果由上层筛除',
        '控制消息里的 RCMA 信息单元会告诉它还剩几次机会',
      ],
      answer: 1,
      explain: '§10.32.1 的 NOTE 只说竞争可能发生碰撞、由上层筛除错误结果；RCMA 只是一个上限，不带任何关于成败的信息。',
    },
    {
      q: '本课的场景每轮都发一条新的控制消息。RCMA 的上限最大能设成几？',
      options: [
        '1：上限不得超过控制消息的有效轮数，而这里有效轮数是 1',
        '3：这是本仿真器的默认值',
        '没有限制，由上层任意决定',
      ],
      answer: 0,
      explain: '§10.32.9.6 要求这个值不超过 RCM Validity Rounds；每轮一条控制消息，有效轮数就是 1。',
    },
    {
      q: '哪一项是本仿真器自己的取法，而不是标准的规定？',
      options: [
        'RCPS 信息单元通告竞争阶段的时隙范围',
        '锚点在竞争阶段里均匀随机地选一个时隙',
        '一个应答方的尝试次数有上限',
      ],
      answer: 1,
      explain: '标准没有规定应答方怎样选时隙；均匀随机是本仿真器的取法，上面那条公式也只对这种取法成立。',
    },
    {
      q: '为什么竞争阶段加宽到 16 个时隙后，测到的距离多了，误差却大了？',
      options: [
        '碰撞变多了',
        '平均要等更多个时隙才应答，单边测距里时钟估计的残差随等待时间累积',
        '16 个时隙时锚点改用了另一种测距方法',
      ],
      answer: 1,
      explain: '本课按 0.2 ppm 的残差计算，每多等一个 2 ms 的时隙误差多 6.0 cm；平均等待从 2.5 个时隙增加到 8.5 个时隙。',
    },
  ],
}
