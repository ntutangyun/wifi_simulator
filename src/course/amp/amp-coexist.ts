/**
 * Tier 2 · M8 · Ambient power IoT (802.11bp) · AMP and Wi-Fi share 2.4 GHz.
 *
 * Standard-first since 2026-11-11 (the shape `@uwb-contention` set): ① what the PAR, the TGbp
 * documents and IEEE Std 802.11-2024 fix about an AMP round sharing a 2.4 GHz channel — AC_BK,
 * AIFS, the CTS-to-self and its NAV, the TXOP limit, energy detection, and that the draft asks for
 * protection only for bistatic backscatter; ② what this simulator does about each, including the
 * CTS-to-self it adds by choice and the TXOP limit it does not apply; ③ three guided runs.
 *
 * The router polls two tags on AC_BK while a camera uploads flat out on AC_BE in the same 2.4 GHz
 * channel and a phone streams video on 5 GHz. Scene, variants and jumps are unchanged, so the
 * recorded timeline hashes did not move. Every figure quoted below is read back out of this file
 * and compared with a run in tests/course/amp-coexist.test.ts.
 */
import type { NodeCfg, Scenario } from '../../model/scenario'
import { J, ampAp, firstAmpLost, longApartment, node, sc, tag, txOf, type Lesson } from '../lessonKit'

/** The camera: an 802.11ax station on the 2.4 GHz link, uploading as hard as the channel allows. */
function camera(x: number, y: number): NodeCfg {
  return { ...node('cam', 'Camera', 'sta', x, y, 'he', 'saturated'), linkId: '2g' }
}

/**
 * The flat: a polling router with a 2.4 GHz and a 5 GHz radio, two tags and a
 * camera on 2.4 GHz, a phone on 5 GHz. `polling: false` is the same flat with
 * the AMP function and the tags removed — the Wi-Fi-only baseline.
 */
export function ampCoexistScenario(o: {
  protection?: 'ctsSelf' | 'none'
  pollIntervalMs?: number
  polling?: boolean
  cam?: { x: number; y: number }
} = {}): Scenario {
  const feats = { edca: true, txop: true, ampdu: true }
  const router = o.polling === false
    ? node('ap', 'Router', 'ap', 3, 4, 'eht', 'idle', feats)
    : ampAp('ap', 'Router', 3, 4, { protection: o.protection ?? 'ctsSelf', pollIntervalMs: o.pollIntervalMs ?? 100 }, feats)
  return sc(longApartment(), [
    router,
    camera(o.cam?.x ?? 6, o.cam?.y ?? 4),
    node('phone', 'Phone', 'sta', 12, 4, 'eht', 'video'),
    ...(o.polling === false ? [] : [tag('tag-1', 'Window tag', 2, 2), tag('tag-2', 'Plant tag', 4, 6)]),
  ])
}

export const ampCoexist: Lesson = {
  id: 'amp-coexist',
  module: 10,
  title: 'AMP 与 Wi-Fi 共享 2.4 GHz',
  why: 'P802.11bp 的 PAR 规定，2.4 GHz 的 AMP 通信使用 AC_BK，所以接入点（access point, AP）的轮询和其他发送一样经增强型分布式信道接入（enhanced distributed channel access, EDCA）竞争，而且使用四个接入类别（access category, AC）中最低的一个：它在开始退避（backoff）之前要等的仲裁帧间间隔（arbitration interframe space, AIFS）是 73 µs，AC_BE 只等 37 µs。标签的上行（uplink, UL）PPDU（PHY protocol data unit）没有 Wi-Fi 前导码（preamble），Wi-Fi 设备解不出，只能靠能量检测（energy detection, ED）察觉；草案只对双基地反向散射要求先发保护帧，对自行发射的标签没有要求。本仿真器在每一轮之前发一帧 CTS-to-self（CTS to self），这是它自己的选择：能解出这一帧的设备按 Duration 设网络分配向量（network allocation vector, NAV），恰好同时在发送的设备收不到它。另外，它让整轮不受 AC_BK 的传输机会（TXOP）限制。在这间公寓里，摄像头漏收了二十帧 CTS-to-self 中的三帧，这三轮里它的请求发送（request to send, RTS）落进了时隙；标签的信号到达摄像头时低于 −62 dBm 的能量检测门限（energy detection threshold），摄像头的载波侦听（carrier sense）察觉不到。去掉 CTS-to-self，读数的确认率从 67.5 % 降到 12.5 %，摄像头的吞吐也从 99.62 Mb/s 降到 93.96 Mb/s。保护开启时，一轮实际发送的帧只占 3.044 % 的空口时间（airtime），摄像头却损失 5.14 % 的吞吐；轮询频率提高到五倍，损失到 33.04 %。5 GHz 上的手机在四种配置下送达的帧数完全相同。',
  outcomes: [
    '说出 PAR 与 802.11 对 AMP 轮取得信道的规定：AC_BK、AIFS、TXOP 限制',
    '解释 CTS-to-self 为什么只能通告、不能强制，并指出它在本课是本仿真器的选择',
    '读出保护这一轮要付出多少吞吐，不加保护又要付出多少',
    '判断轮询频率的变化怎样影响摄像头与标签',
  ],
  needs: ['amp-slots'],
  terms: [
    { term: 'AC_BK', plain: '四个接入类别里最低的一个；P802.11bp 的 PAR 规定 2.4 GHz 的 AMP 通信使用它' },
    { term: 'AC_BE', plain: '缺省的接入类别；本课里摄像头的上传使用它，优先于 AC_BK' },
    { term: 'CTS-to-self', plain: '接收地址等于发送者自己的允许发送帧，用来让能解出它的设备按 Duration 避让' },
    { term: 'AIFS', plain: '仲裁帧间间隔：每个接入类别在退避之前要等的时间，优先级越低越长' },
  ],
  standard: [
    { heading: '接入类别（PAR，见 11-26/1582r3）', text: 'P802.11bp 的项目授权书规定：2.4 GHz 的数据通信至少有一种模式，把 AMP 通信的接入类别设为 AC_BK。共存评估文件 11-26/1582r3 引述了这一条。' },
    { heading: '仲裁帧间间隔（IEEE Std 802.11-2024 §10.23.2.4，表 9-194，表 18-5）', text: '每个接入类别有一个仲裁帧间间隔数（arbitration interframe space number, AIFSN），它在退避之前要等 AIFS[AC] = AIFSN[AC] × aSlotTime + aSIFSTime。缺省参数下 AC_BK 的 AIFSN 为 7，AC_BE 为 3。2.4 GHz 的短时隙为 9 µs，aSIFSTime 为 10 µs。' },
    { heading: 'TXOP 限制（§10.23.2.9，表 9-194）', text: 'TXOP 持有者必须保证一次传输机会不超过 TXOP 限制；保护用的 CTS-to-self 计入这次传输机会。第 17—19 章物理层（physical layer, PHY）下，AC_BK 与 AC_BE 的缺省 TXOP 限制都是 2.528 ms。' },
    { heading: 'CTS-to-self 与 NAV（§9.3.1.3，§9.2.5.2，§10.3.2.4，§10.3.2.15）', text: 'CTS-to-self 是接收地址等于发送者自己地址的允许发送（clear to send, CTS）帧，用来向其他设备分发 NAV。作为交换序列第一帧时，它的 Duration 覆盖其后要发送的帧，再加一个短帧间间隔（short interframe space, SIFS）。收到这一帧、且不是它的接收者的站点（station, STA）按 Duration 更新自己的 NAV；没有收到的站点不更新。' },
    { heading: 'RTS 之后（§10.3.2.9）', text: '发出 RTS 后，站点等待 CTSTimeout。这段时间里没有开始接收任何帧，就判定 RTS 失败；开始接收了，就等这一帧收完：收到写给自己的 CTS 才算成功，收到其他任何帧都判定失败。两种失败都使它重新退避。' },
    { heading: '能量检测（§17.3.10.6）', text: '20 MHz 信道上，接收电平高于最低灵敏度（sensitivity）20 dB，即 −62 dBm 时，接收机必须判信道忙，不论能否解出。' },
    { heading: '草案对保护的规定（规范框架 FM-48；11-26/1519r5 §39.3.2.3）', text: '规范框架只对双基地反向散射要求：征求上行之前，帧交换序列必须以 40 MHz 非 HT 复制的 RTS/CTS 或 CTS-to-self 开始（动议 #250）。草案文本 39.3.2.3 节把这一条写进了双基地的触发过程。对自行发射的标签，草案没有类似的要求。' },
    { heading: '上行 PPDU（规范框架 PM-8）', text: '自行发射终端的上行 AMP PPDU 只有 AMP-Sync 与数据两个字段，带宽小于 20 MHz（动议 #11），没有 Wi-Fi 前导码。' },
    { kind: 'steps', heading: '一帧 CTS-to-self 怎样让其他设备避让，按 802.11', items: [
      '接入点以 AC_BK 赢得竞争，先发 CTS-to-self，Duration 覆盖其后的整个交换再加一个 SIFS（§9.2.5.2）。',
      '收到它的站点按 Duration 设 NAV，在 NAV 到期之前不发送（§10.3.2.4）。',
      '这一刻自己也在发送的站点收不到它，不设 NAV。',
      '这样的站点之后照常竞争；只要信道上的能量低于 −62 dBm、又没有可解的帧，它就认为信道空闲（§17.3.10.6）。',
    ] },
  ],
  implementation: [
    { topic: '接入类别', standard: 'AC_BK（PAR）', sim: '轮询走 AC_BK，AIFS = 10 + 7 × 9 = 73 µs；摄像头的上传走 AC_BE，AIFS = 10 + 3 × 9 = 37 µs。', kind: 'faithful' },
    { topic: '轮前的保护', standard: '草案只对双基地反向散射要求（FM-48）', sim: '每一轮先发一帧 CTS-to-self，14 个字节、6 Mb/s、50 µs，Duration 覆盖整轮再加一个 SIFS；变体「不加保护」把它关掉。', kind: 'choice' },
    { topic: '一轮的长度', standard: '不得超过 TXOP 限制，AC_BK 缺省 2.528 ms（§10.23.2.9）', sim: '整轮从 CTS-to-self 起长 4190 µs，不受 TXOP 限制约束。', kind: 'differs' },
    { topic: 'NAV', standard: '收到 CTS-to-self 的站点按 Duration 更新 NAV（§10.3.2.4）', sim: '照此实现；正在发送的站点收不到这一帧，也就不设 NAV。', kind: 'faithful' },
    { topic: 'RTS 失败', standard: 'CTSTimeout 内没开始接收，或收到的不是写给自己的 CTS，都判失败（§10.3.2.9）', sim: '照此实现：在时隙里发出的 RTS 等不到 CTS，超时判失败；超时窗口内开始接收的是一帧 AMP 帧（例如一轮开头的触发帧（Trigger frame））时，等它收完即判失败。两种情况都使竞争窗口（contention window, CW）加倍。', kind: 'faithful' },
    { topic: '轮询期间的接入点', standard: '草案没有规定', sim: '接入点在一轮之内只处理标签的作答，不回应其他设备的 RTS。', kind: 'choice' },
    { topic: '能量检测', standard: '20 MHz 信道上 −62 dBm（§17.3.10.6）', sim: '把整个信道上的能量与 −62 dBm 比较；本课 2.4 GHz 信道宽 20 MHz，整个信道就是主 20 MHz 信道。', kind: 'faithful' },
    { topic: '一次接收的判决', standard: '标准不规定接收机怎样判决', sim: '取整个接收过程中干扰最强的那一刻判断信干噪比（signal-to-interference-plus-noise ratio, SINR）是否达到门限，任何一刻不够就判整帧失败。', kind: 'choice' },
    { topic: '传播', standard: '标准不规定信道模型', sim: '传播模型确定，不含快衰落；同一个随机种子每次重跑，摄像头都在同样的三轮里漏收 CTS-to-self。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '轮询为什么推迟',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一帧 CTS-to-self，再在日志里找每一轮之前的「AIFS wait until … [AC_BK]」。',
        '运行满两秒，比较每一轮 CTS-to-self 的发出时刻与轮询时钟的预定时刻。',
      ],
      blocks: [
        { kind: 'formula', heading: '两个接入类别的 AIFS', text: 'AIFS[AC_BK] = 10 + 7 × 9 = 73 µs        AIFS[AC_BE] = 10 + 3 × 9 = 37 µs', note: '每一段空闲之后，轮询比摄像头晚 36 µs 才开始退避。' },
      ],
      expect: '两秒里轮询时钟要求 20 轮，也发出了 20 轮；CTS-to-self 平均比预定时刻晚 5.64 ms，最晚晚 14.58 ms。只有一轮准时：t = 0 的第一轮（路由器的 CTS-to-self 与摄像头的 RTS 同在 0 µs 开始）。',
      meaning: 'AC_BK 与 AIFS 照 PAR 与 802.11（①）；轮询间隔只是本仿真器请求传输机会的时刻，不是时间表（②）。',
    },
    {
      heading: '保护帧漏收的三轮',
      jump: 2,
      steps: [
        '跳到摄像头第一帧没有得到回应的 RTS，看它开始的时刻落在哪一轮。',
        '统计两秒里摄像头设 NAV 的次数、落进时隙的摄像头帧，以及四十次作答的结果。',
      ],
      expect: '摄像头在 20 轮里有 17 轮按 Duration 设了 4140 µs 的 NAV；漏收的三轮里，它的 RTS 都与 CTS-to-self 在同一时刻开始。整个运行里有 10 帧摄像头的帧落在时隙内，全是 RTS，都在这三轮里，10 帧都以 CTS 超时告终；这三轮开头与 CTS-to-self 同时发出的 3 帧 RTS，则因超时窗口内开始收到 AMP 触发帧，在触发帧收完时判失败。40 次作答有 27 次被确认（67.5 %）；丢失的 13 次里，8 次是两个标签选中同一个时隙（共 4 次），5 次是与摄像头的帧相撞。',
      meaning: '发送中的站点收不到 CTS-to-self，也就不设 NAV（①）；标签的信号低于能量检测门限，摄像头的载波侦听察觉不到（①）。',
    },
    {
      heading: '四种配置的代价',
      more: [0, 1, 2],
      steps: [
        '依次载入本课场景、「不加保护」「每 20 ms 轮询一次」与「只有 Wi-Fi：没有标签，也没有轮询」，各运行两秒。',
        '对照下表读出每种配置下被确认的读数、落进时隙的摄像头帧，以及摄像头与手机的吞吐。',
      ],
      blocks: [
        { kind: 'table', heading: '两秒，四种配置', head: ['配置', '读数被确认', '落在时隙内的摄像头帧', '摄像头', '5 GHz 手机'], rows: [
          ['只有 Wi-Fi（没有标签）', '—', '—', '105.02 Mb/s', '13.24 Mb/s'],
          ['轮询 + CTS-to-self', '27 / 40 (67.5 %)', '10', '99.62 Mb/s', '13.24 Mb/s'],
          ['轮询 + 无保护', '5 / 40 (12.5 %)', '77', '93.96 Mb/s', '13.24 Mb/s'],
          ['CTS-to-self，每 20 ms 轮询', '140 / 200 (70.0 %)', '40', '70.32 Mb/s', '13.24 Mb/s'],
        ] },
      ],
      expect: '有保护时，每轮 4190 µs 里实际有帧在空口的只有 3044 µs，占信道的 3.044 %，摄像头却损失 5.14 % 的吞吐。去掉保护，摄像头无人回应的 RTS 从 10 次增加到 79 次，路由器记下的 collision 从 5 次增加到 27 次。每 20 ms 轮询一次时，摄像头比只有 Wi-Fi 时低 33.04 %。四种配置下手机都送达 2365 帧。',
      meaning: 'CTS-to-self 是本仿真器的选择（②），关掉它对标签和摄像头都更糟；5 GHz 与 2.4 GHz 是两条信道，接入点在每一条上各自竞争。',
    },
  ],
  sources: [
    'IEEE P802.11bp 草案：PAR 对 AC_BK 的规定，引自共存评估文件 11-26/1582r3；规范框架 11-24/1613r20 的 FM-48（动议 #250）与 PM-8（#11）；草案文本 11-26/1519r5 §39.3.2.3。',
    'IEEE Std 802.11-2024：§9.3.1.3（CTS 帧）、§9.2.5.2（Duration 的设定）、§10.3.2.4（NAV 的设置）、§10.3.2.9（RTS 之后）、§10.3.2.15（NAV 的分发）、§10.23.2.4（AIFS）、§10.23.2.9 与表 9-194（缺省 EDCA 参数与 TXOP 限制）、表 18-5（2.4 GHz 的时隙与 SIFS）、§17.3.10.6（−62 dBm 的能量检测）。',
    '本仿真器的取值与取法：每轮之前的 CTS-to-self、AMP 轮不受 TXOP 限制、轮询期间不回应其他设备、按干扰最强的一刻判决、不含快衰落的传播模型。',
  ],
  limits: [],
  scenario: () => ampCoexistScenario(),
  variants: [
    { label: '不加保护', scenario: () => ampCoexistScenario({ protection: 'none' }) },
    { label: '每 20 ms 轮询一次', scenario: () => ampCoexistScenario({ pollIntervalMs: 20 }) },
    { label: '只有 Wi-Fi：没有标签，也没有轮询', scenario: () => ampCoexistScenario({ polling: false }) },
  ],
  jumps: [
    J('第一帧 CTS-to-self', txOf((r) => r.frame.kind === 'cts' && r.frame.dst === r.frame.src)),
    J('摄像头第一次据此设置 NAV', (r) => r.type === 'NAV_SET' && r.node === 'cam#2g' && r.source === 'cts:ap'),
    J('第一帧路由器没有回应的摄像头 RTS', (r) => r.type === 'CTS_TIMEOUT' && r.node === 'cam#2g'),
    J('第一帧路由器无法确认的标签回应', firstAmpLost),
    J('第一帧 5 GHz 视频', txOf((r) => r.node === 'ap' && r.frame.kind === 'data')),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '为什么 AMP 的轮平均比轮询时钟的预定时刻晚几毫秒才发出？',
      options: [
        '构造触发帧（Trigger frame）本身就要几毫秒',
        '它按 PAR 走 AC_BK，AIFS 是 73 µs，而摄像头的 AC_BE 是 37 µs；信道忙时它和其他发送一样要竞争',
        '路由器故意推迟，好让标签收集能量',
      ],
      answer: 1,
      explain: 'AIFS[AC] = AIFSN[AC] × aSlotTime + aSIFSTime：AC_BK 为 10 + 7 × 9 = 73 µs，AC_BE 为 10 + 3 × 9 = 37 µs。',
    },
    {
      q: '二十轮前面都发了 CTS-to-self，摄像头却只设了十七次 NAV。为什么？',
      options: [
        '它的 NAV 仍停留在上一轮',
        '那三次摄像头恰好在同一时刻开始发送自己的 RTS，正在发送的站点收不到帧',
        '摄像头解不出 6 Mb/s 的帧',
      ],
      answer: 1,
      explain: '只有收到 CTS-to-self 的站点才按 Duration 设 NAV（§10.3.2.4）；保护帧本身也要竞争，可能正好被它想让避让的站点错过。',
    },
    {
      q: '按草案，自行发射的标签被轮询之前，接入点必须先发保护帧吗？',
      options: [
        '必须，规范框架要求每次征求上行都先发 CTS-to-self',
        '不必：规范框架只对双基地反向散射有这个要求；本课的 CTS-to-self 是本仿真器的选择',
        '必须，而且要用 40 MHz 非 HT 复制的 RTS/CTS',
      ],
      answer: 1,
      explain: 'FM-48（动议 #250）的开头就是「只对双基地反向散射」。',
    },
  ],
}
