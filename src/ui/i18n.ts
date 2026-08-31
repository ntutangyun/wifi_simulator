/** Minimal i18n: typed string tables + a lang field in the UI store. */
import type { FeatureFlag } from '../model/caps'
import type { Generation } from '../model/types'
import type { ProfileId } from '../model/scenario'

export type Lang = 'en' | 'zh'

export interface LegendItem {
  color: string
  label: string
  hint: string
}

export interface Strings {
  header: { subtitle: string; edit: string; simulate: string; course: string }
  panel: { inspector: string; log: string; guide: string }
  course: {
    title: string
    progressOf: (done: number, total: number) => string
    module: string
    minutes: (n: number) => string
    selectPrompt: string
    load: string
    reload: string
    variants: string
    jumps: string
    notFound: string
    observe: string
    tryThis: string
    quiz: string
    check: string
    correct: string
    incorrect: string
    markDone: string
    done: string
    next: string
    prev: string
    back: string
    openInEditor: string
    loadHint: string
  }
  transport: {
    play: string; pause: string; speed: string; simulating: string
    prevExch: string; nextExch: string; prevEv: string; nextEv: string
    minusSlot: string; plusSlot: string; minusUs: string; plusUs: string
    speeds: { us: number; label: string }[]
  }
  strip: { windowHint: string; legendCollision: string }
  legend: LegendItem[]
  editor: {
    tools: { select: string; room: string; door: string; window: string; sta: string; fit: string }
    scenario: string; save: string; load: string; export_: string; import_: string
    spawn: string; rts: string; rtsHint: string; seed: string; seedHint: string
    objects: string; properties: string; guide: string
    nodesHeader: string; rooms: string; walls: string; noRooms: string
    node: string; name: string; wifi: string; link: string; linkHint: string
    traffic: string; txPower: string; height: string
    deleteNode: string; deleteRoom: string; apNoDelete: string; delete_: string
    wall: string; material: string; materialHint: string; removeOpenings: string
    room: string; openings: string
    emptyHint: string
    saved: string; loaded: string; imported: string; nothingSaved: string
    scaleBarHint: string
  }
  inspector: {
    waiting: string; bssTotals: string; throughput: string; delivered: string
    collisions: string; retries: string; node: string; ok: string; rty: string; airtime: string
    link5: string; link6: string
    acHeader: { ac: string; bo: string; cw: string; queue: string }
    acHint: string; boHint: string; cwHint: string; queueHint: string
    backoffCounter: string; cw: string; ssrcSlrc: string; ssrcHint: string
    nav: string; navHint: string; navIdle: string; left: string
    ifs: string; ifsHint: string; cca: string; ccaHint: string; busy: string; idle: string
    txop: string; txopHint: string
    transmitting: string; receiving: string; queue: string; old: string; more: string
    stats: string; framesDelivered: string; retriesDrops: string; collisionsL: string
    airtimeShare: string; rxThroughput: string
  }
  log: { empty: string }
  profiles: Record<ProfileId, string>
  generations: Record<Generation, string>
  features: Record<FeatureFlag, string>
  tooltips: {
    transmitting: string; dlMu: (n: number) => string; ampdu: (n: number, dst: string) => string
    data: (dst: string) => string; ack: (dst: string) => string; ba: (dst: string) => string
    mba: string; trigger: string; rts: (dst: string) => string; cts: (dst: string) => string
    nonHt: string; sifsNote: string; retryNote: string; ruNote: string
    receiving: (kind: string, from: string) => string
    backoffTitle: string; backoffL1: string; backoffL2: string
    deferTitle: (ifs: string) => string; eifsNote: string; deferNote: string
    navTitle: string; navNote: string; sifsWait: string
  }
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    header: { subtitle: 'IEEE 802.11 DCF/EDCA · µs timescale', edit: '✎ Edit', simulate: '▶ Simulate', course: '📚 Course' },
    panel: { inspector: '🔍 Inspector', log: '📜 Log', guide: '📖 Guide' },
    course: {
      title: 'Wi-Fi MAC — a hands-on course',
      progressOf: (d, t) => `${d}/${t} lessons completed`,
      module: 'Module',
      minutes: (n) => `~${n} min`,
      selectPrompt: 'Pick a lesson on the left, load its simulation, and follow the text against the live timeline.',
      load: "▶ Load this lesson's simulation",
      reload: '↻ Restart simulation',
      variants: 'Scenario variants',
      jumps: 'Jump to',
      notFound: 'not in the simulated window yet — let it play a bit longer',
      observe: '👀 Observe',
      tryThis: '🧪 Experiments',
      quiz: '✅ Self-check',
      check: 'Check',
      correct: 'Correct!',
      incorrect: 'Not quite —',
      markDone: 'Mark lesson as done',
      done: 'Done ✓',
      next: 'Next lesson →',
      prev: '← Previous',
      back: '☰ All lessons',
      openInEditor: '✎ Open this scenario in the editor',
      loadHint: 'Loads a preset scenario (replaces the current one; your own is restored when you leave the course).',
    },
    transport: {
      play: '▶ play', pause: '❚❚ pause', speed: 'speed', simulating: '⏳ simulating…',
      prevExch: '⏮ exch', nextExch: 'exch ⏭', prevEv: '← ev', nextEv: 'ev →',
      minusSlot: '−slot', plusSlot: '+slot', minusUs: '−µs', plusUs: '+µs',
      speeds: [
        { us: 100, label: '×10 000 slower' },
        { us: 300, label: '×3 333 slower' },
        { us: 1000, label: '×1 000 slower' },
        { us: 3000, label: '×333 slower' },
        { us: 10_000, label: '×100 slower' },
        { us: 100_000, label: '×10 slower' },
        { us: 1_000_000, label: 'real time' },
      ],
    },
    strip: { windowHint: 'wheel zoom · drag scrub · hover blocks for details', legendCollision: 'collision' },
    legend: [
      { color: '#3b82f6', label: 'DL data', hint: 'Data PPDU from the AP (downlink). Length = real airtime.' },
      { color: '#22c55e', label: 'UL data', hint: 'Data PPDU from a station (uplink).' },
      { color: '#e5e7eb', label: 'ACK', hint: 'Acknowledgement, sent one SIFS (16 µs) after a received frame.' },
      { color: '#d8b4fe', label: 'BA', hint: 'BlockAck: one frame acknowledging a whole A-MPDU aggregate.' },
      { color: '#facc15', label: 'Trigger', hint: 'Wi-Fi 6 Trigger frame: the AP schedules simultaneous uplink OFDMA transmissions.' },
      { color: '#f97316', label: 'RTS/CTS', hint: 'Medium reservation handshake used above the RTS threshold (hidden-node protection).' },
      { color: '#f59e0b', label: 'backoff', hint: 'Random backoff countdown: −1 per idle 9 µs slot; frozen while the medium is busy.' },
      { color: '#6d5a1b', label: 'defer', hint: 'Waiting for DIFS/AIFS/EIFS quiet time, or for the medium to go idle.' },
      { color: '#9333ea', label: 'NAV', hint: 'Virtual carrier sense: reserved by an overheard Duration field.' },
      { color: '#8b5cf6', label: 'RX', hint: 'Receiving a frame.' },
      { color: '#ef4444', label: 'collision', hint: 'Two or more overlapping transmissions corrupted a reception.' },
    ],
    editor: {
      tools: { select: '☝ select', room: '▭ room', door: '🚪 door', window: '🪟 window', sta: '📱 STA', fit: '⌂ fit' },
      scenario: 'Scenario', save: '💾 Save', load: '📂 Load', export_: '⬇ Export', import_: '⬆ Import',
      spawn: '🎲 Spawn STAs', rts: 'RTS', rtsHint: 'dot11RTSThreshold: frames larger than this use RTS/CTS protection',
      seed: 'Seed', seedHint: 'random seed — identical seed reproduces the exact same run',
      objects: '🗂 OBJECTS', properties: '⚙ PROPERTIES', guide: '📖 GUIDE',
      nodesHeader: 'Nodes (order = timeline lanes)', rooms: 'Rooms', walls: 'Walls', noRooms: 'none — draw one with ▭',
      node: 'Node', name: 'Name', wifi: 'Wi-Fi', link: 'Link', linkHint: 'operating band for non-MLO Wi-Fi 6/7 devices',
      traffic: 'Traffic', txPower: 'Tx power', height: 'Height',
      deleteNode: '🗑 Delete node', deleteRoom: '🗑 Delete room', apNoDelete: 'the AP cannot be deleted', delete_: 'delete',
      wall: 'Wall', material: 'Material', materialHint: 'RF attenuation: drywall 5 dB · brick 12 dB · glass 3 dB per crossing',
      removeOpenings: 'Remove openings', room: 'Room', openings: 'opening(s)',
      emptyHint: 'Nothing selected. Click a node, wall or room on the canvas (or in Objects above) to edit its properties here. Scenario save/load and settings live in the menu bar at the top of the canvas.',
      saved: 'saved', loaded: 'loaded', imported: 'imported', nothingSaved: 'nothing saved',
      scaleBarHint: 'grid 1 m (bold 5 m) · wheel zoom · middle/right-drag pan',
    },
    inspector: {
      waiting: 'waiting for simulation…', bssTotals: 'BSS totals — click a node or lane for detail',
      throughput: 'throughput', delivered: 'delivered', collisions: 'collision events', retries: 'retries',
      node: 'node', ok: 'ok', rty: 'rty', airtime: 'airtime',
      link5: '5 GHz link', link6: '6 GHz link',
      acHeader: { ac: 'AC', bo: 'bo', cw: 'CW', queue: 'queue' },
      acHint: 'EDCA access category (BK=background, BE=best effort, VI=video, VO=voice)',
      boHint: 'current backoff slot counter', cwHint: 'contention window: backoff drawn uniform from [0, CW]',
      queueHint: "frames waiting in this AC's queue",
      backoffCounter: 'backoff counter', cw: 'CW', ssrcSlrc: 'SSRC / SLRC',
      ssrcHint: 'station short/long retry counts (§10.3.3)',
      nav: 'NAV', navHint: 'Network Allocation Vector: virtual carrier sense from overheard Duration fields',
      navIdle: 'idle', left: 'left',
      ifs: 'IFS', ifsHint: 'interframe space in progress: DIFS/AIFS (contention) or EIFS (after a corrupted frame)',
      cca: 'CCA', ccaHint: 'physical carrier sense: energy ≥ −62 dBm or decodable preamble ≥ −82 dBm',
      busy: 'busy', idle: 'idle',
      txop: 'TXOP', txopHint: "transmit opportunity: SIFS-chained exchanges without re-contending, up to the AC's limit",
      transmitting: 'transmitting', receiving: 'receiving', queue: 'queue', old: 'old', more: 'more',
      stats: 'stats', framesDelivered: 'frames delivered', retriesDrops: 'retries / drops', collisionsL: 'collisions',
      airtimeShare: 'airtime share', rxThroughput: 'rx throughput',
    },
    log: { empty: 'no events in window' },
    profiles: {
      video: 'video streaming (DL, AC_VI)', voice: 'voice call (2-way, AC_VO)', backup: 'cloud backup (UL, AC_BK)',
      browsing: 'web browsing (AC_BE)', iot: 'IoT sensor (AC_BK)', saturated: 'saturated upload (AC_BE)', idle: 'idle',
    },
    generations: {
      nonht: '802.11a (legacy)', vht: 'Wi-Fi 5 (VHT)', he: 'Wi-Fi 6 (HE)', eht: 'Wi-Fi 7 (EHT)',
    },
    features: {
      edca: 'EDCA (QoS access categories)', ampdu: 'A-MPDU aggregation + BlockAck', txop: 'TXOP bursting',
      ofdma: 'OFDMA (MU scheduling)', mlo: 'Multi-Link Operation', qam4k: '4096-QAM (MCS 12/13)',
    },
    tooltips: {
      transmitting: 'transmitting',
      dlMu: (n) => `DL MU PPDU → ${n} stations (OFDMA)`,
      ampdu: (n, dst) => `A-MPDU (${n} MPDUs) → ${dst}`,
      data: (dst) => `Data frame → ${dst}`,
      ack: (dst) => `ACK → ${dst}`,
      ba: (dst) => `BlockAck → ${dst}`,
      mba: 'Multi-STA BlockAck (OFDMA)',
      trigger: 'Trigger frame — schedules UL OFDMA',
      rts: (dst) => `RTS → ${dst} (reserves the medium)`,
      cts: (dst) => `CTS → ${dst}`,
      nonHt: 'non-HT',
      sifsNote: 'sent a SIFS (16 µs) after the frame — responses never contend',
      retryNote: 'retransmission (Retry bit set)',
      ruNote: 'RU-orthogonal: simultaneous with other same-group frames',
      receiving: (kind, from) => `receiving ${kind} from ${from}`,
      backoffTitle: 'random backoff countdown',
      backoffL1: 'counter −1 per idle 9 µs slot; frozen while the medium is busy (§10.3.3)',
      backoffL2: 'transmits when it reaches 0 — this is how stations avoid colliding',
      deferTitle: (ifs) => `deferring${ifs ? ` (${ifs})` : ''}`,
      eifsNote: 'EIFS: extra-long wait after a corrupted reception (§10.3.2.3.7)',
      deferNote: 'waiting for the medium to stay idle for one IFS before backoff can run',
      navTitle: 'NAV set',
      navNote: 'virtual carrier sense: an overheard Duration field reserved the medium (§10.3.2.4)',
      sifsWait: 'in-exchange wait (SIFS turnaround / response pending)',
    },
  },
  zh: {
    header: { subtitle: 'IEEE 802.11 DCF/EDCA · 微秒时间尺度', edit: '✎ 编辑', simulate: '▶ 仿真', course: '📚 课程' },
    panel: { inspector: '🔍 检视器', log: '📜 事件日志', guide: '📖 学习指南' },
    course: {
      title: 'Wi-Fi MAC 实战课程',
      progressOf: (d, t) => `已完成 ${d}/${t} 课`,
      module: '模块',
      minutes: (n) => `约 ${n} 分钟`,
      selectPrompt: '在左侧选择一课，载入其仿真场景，对照课文观察实时时间轴。',
      load: '▶ 载入本课仿真',
      reload: '↻ 重新开始仿真',
      variants: '场景变体',
      jumps: '跳转到',
      notFound: '当前仿真窗口内尚未出现——让仿真再运行一会儿',
      observe: '👀 观察要点',
      tryThis: '🧪 动手实验',
      quiz: '✅ 自测',
      check: '提交',
      correct: '回答正确！',
      incorrect: '不对——',
      markDone: '标记本课完成',
      done: '已完成 ✓',
      next: '下一课 →',
      prev: '← 上一课',
      back: '☰ 课程目录',
      openInEditor: '✎ 在编辑器中打开本课场景',
      loadHint: '载入预设场景（会替换当前场景；离开课程模式时会恢复你自己的场景）。',
    },
    transport: {
      play: '▶ 播放', pause: '❚❚ 暂停', speed: '速度', simulating: '⏳ 仿真中…',
      prevExch: '⏮ 帧交换', nextExch: '帧交换 ⏭', prevEv: '← 事件', nextEv: '事件 →',
      minusSlot: '−时隙', plusSlot: '+时隙', minusUs: '−µs', plusUs: '+µs',
      speeds: [
        { us: 100, label: '放慢 10 000 倍' },
        { us: 300, label: '放慢 3 333 倍' },
        { us: 1000, label: '放慢 1 000 倍' },
        { us: 3000, label: '放慢 333 倍' },
        { us: 10_000, label: '放慢 100 倍' },
        { us: 100_000, label: '放慢 10 倍' },
        { us: 1_000_000, label: '实时' },
      ],
    },
    strip: { windowHint: '滚轮缩放 · 拖动定位 · 悬停色块查看详情', legendCollision: '碰撞' },
    legend: [
      { color: '#3b82f6', label: '下行数据', hint: 'AP 发出的数据 PPDU（下行）。长度即真实占用空口时间。' },
      { color: '#22c55e', label: '上行数据', hint: '终端（STA）发出的数据 PPDU（上行）。' },
      { color: '#e5e7eb', label: 'ACK', hint: '确认帧：在收到帧之后恰好一个 SIFS（16 µs）发出。' },
      { color: '#d8b4fe', label: 'BA', hint: 'BlockAck 块确认：一帧确认整个 A-MPDU 聚合。' },
      { color: '#facc15', label: 'Trigger', hint: 'Wi-Fi 6 触发帧：AP 调度多个终端同时进行上行 OFDMA 传输。' },
      { color: '#f97316', label: 'RTS/CTS', hint: '超过 RTS 门限时使用的介质预约握手（防隐藏节点）。' },
      { color: '#f59e0b', label: '退避', hint: '随机退避倒数：每个空闲 9 µs 时隙减 1；介质忙时冻结。' },
      { color: '#6d5a1b', label: '等待', hint: '等待 DIFS/AIFS/EIFS 静默期，或等待介质变为空闲。' },
      { color: '#9333ea', label: 'NAV', hint: '虚拟载波侦听：被侦听到的 Duration 字段预约了介质。' },
      { color: '#8b5cf6', label: '接收', hint: '正在接收帧。' },
      { color: '#ef4444', label: '碰撞', hint: '两个以上的传输重叠，导致接收失败。' },
    ],
    editor: {
      tools: { select: '☝ 选择', room: '▭ 房间', door: '🚪 门', window: '🪟 窗', sta: '📱 终端', fit: '⌂ 复位' },
      scenario: '场景', save: '💾 保存', load: '📂 载入', export_: '⬇ 导出', import_: '⬆ 导入',
      spawn: '🎲 随机生成终端', rts: 'RTS', rtsHint: 'dot11RTSThreshold：大于该门限的帧启用 RTS/CTS 保护',
      seed: '种子', seedHint: '随机种子 — 相同种子可完全复现同一次仿真',
      objects: '🗂 对象列表', properties: '⚙ 属性', guide: '📖 学习指南',
      nodesHeader: '节点（顺序 = 时间轴泳道）', rooms: '房间', walls: '墙体', noRooms: '暂无 — 用 ▭ 绘制一个',
      node: '节点', name: '名称', wifi: 'Wi-Fi', link: '频段', linkHint: '非 MLO 的 Wi-Fi 6/7 设备的工作频段',
      traffic: '业务', txPower: '发射功率', height: '高度',
      deleteNode: '🗑 删除节点', deleteRoom: '🗑 删除房间', apNoDelete: 'AP 不能删除', delete_: '删除',
      wall: '墙体', material: '材质', materialHint: '射频衰减：石膏板 5 dB · 砖墙 12 dB · 玻璃 3 dB（每次穿越）',
      removeOpenings: '移除门窗开口', room: '房间', openings: '个开口',
      emptyHint: '未选中任何对象。点击画布上（或上方对象列表中）的节点、墙体或房间即可在此编辑其属性。场景的保存/载入与设置位于画布顶部的菜单栏。',
      saved: '已保存', loaded: '已载入', imported: '已导入', nothingSaved: '尚无存档',
      scaleBarHint: '网格 1 米（粗线 5 米）· 滚轮缩放 · 中键/右键拖动平移',
    },
    inspector: {
      waiting: '等待仿真…', bssTotals: 'BSS 总览 — 点击节点或泳道查看详情',
      throughput: '吞吐量', delivered: '已交付', collisions: '碰撞次数', retries: '重传次数',
      node: '节点', ok: '成功', rty: '重传', airtime: '空口占比',
      link5: '5 GHz 链路', link6: '6 GHz 链路',
      acHeader: { ac: 'AC', bo: '退避', cw: 'CW', queue: '队列' },
      acHint: 'EDCA 接入类别（BK=后台，BE=尽力而为，VI=视频，VO=语音）',
      boHint: '当前退避时隙计数', cwHint: '竞争窗口：退避值从 [0, CW] 均匀抽取',
      queueHint: '该接入类别队列中等待的帧数',
      backoffCounter: '退避计数器', cw: 'CW', ssrcSlrc: 'SSRC / SLRC',
      ssrcHint: '站点短/长重传计数（§10.3.3）',
      nav: 'NAV', navHint: '网络分配矢量：来自侦听到的 Duration 字段的虚拟载波侦听',
      navIdle: '空闲', left: '剩余',
      ifs: 'IFS', ifsHint: '正在进行的帧间间隔：DIFS/AIFS（竞争）或 EIFS（收到损坏帧之后）',
      cca: 'CCA', ccaHint: '物理载波侦听：能量 ≥ −62 dBm 或可解码前导 ≥ −82 dBm',
      busy: '忙', idle: '空闲',
      txop: 'TXOP', txopHint: '传输机会：无需重新竞争、以 SIFS 相连的连续帧交换，上限为该 AC 的 TXOP 限值',
      transmitting: '发送中', receiving: '接收中', queue: '队列', old: '前', more: '更多',
      stats: '统计', framesDelivered: '成功交付帧数', retriesDrops: '重传 / 丢弃', collisionsL: '碰撞',
      airtimeShare: '空口占比', rxThroughput: '接收吞吐量',
    },
    log: { empty: '窗口内无事件' },
    profiles: {
      video: '视频流（下行，AC_VI）', voice: '语音通话（双向，AC_VO）', backup: '云备份（上行，AC_BK）',
      browsing: '网页浏览（AC_BE）', iot: '物联网传感器（AC_BK）', saturated: '饱和上传（AC_BE）', idle: '空闲',
    },
    generations: {
      nonht: '802.11a（传统）', vht: 'Wi-Fi 5 (VHT)', he: 'Wi-Fi 6 (HE)', eht: 'Wi-Fi 7 (EHT)',
    },
    features: {
      edca: 'EDCA（QoS 接入类别）', ampdu: 'A-MPDU 聚合 + BlockAck', txop: 'TXOP 突发',
      ofdma: 'OFDMA（多用户调度）', mlo: '多链路操作 (MLO)', qam4k: '4096-QAM (MCS 12/13)',
    },
    tooltips: {
      transmitting: '发送中',
      dlMu: (n) => `下行 MU PPDU → ${n} 个终端（OFDMA）`,
      ampdu: (n, dst) => `A-MPDU 聚合（${n} 个 MPDU）→ ${dst}`,
      data: (dst) => `数据帧 → ${dst}`,
      ack: (dst) => `ACK 确认 → ${dst}`,
      ba: (dst) => `BlockAck 块确认 → ${dst}`,
      mba: '多站点 BlockAck（OFDMA）',
      trigger: '触发帧 — 调度上行 OFDMA',
      rts: (dst) => `RTS → ${dst}（预约介质）`,
      cts: (dst) => `CTS → ${dst}`,
      nonHt: '非 HT',
      sifsNote: '在帧结束后一个 SIFS（16 µs）发出 — 响应帧从不参与竞争',
      retryNote: '重传（Retry 位已置 1）',
      ruNote: 'RU 正交：与同组的其他帧同时传输',
      receiving: (kind, from) => `正在接收来自 ${from} 的 ${kind}`,
      backoffTitle: '随机退避倒数',
      backoffL1: '每个空闲 9 µs 时隙减 1；介质忙时冻结（§10.3.3）',
      backoffL2: '计数到 0 即发送 — 这就是站点避免碰撞的方式',
      deferTitle: (ifs) => `等待中${ifs ? `（${ifs}）` : ''}`,
      eifsNote: 'EIFS：收到损坏帧后的加长等待（§10.3.2.3.7）',
      deferNote: '等待介质保持一个 IFS 的空闲，之后退避才能继续',
      navTitle: 'NAV 已设置',
      navNote: '虚拟载波侦听：侦听到的 Duration 字段预约了介质（§10.3.2.4）',
      sifsWait: '交换过程中的等待（SIFS 周转 / 等待响应）',
    },
  },
}

import { useUi } from './store'

/** Current-language string table (re-renders on language change). */
export function useStrings(): Strings {
  return STRINGS[useUi((s) => s.lang)]
}
