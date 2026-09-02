/** Minimal i18n: typed string tables + a lang field in the UI store. */
import type { FeatureFlag } from '../model/caps'
import type { FrameKind } from '../model/frames'
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
  guideWindow: {
    title: string; terms: string; overview: string; search: string
    empty: string; close: string; dragHint: string
  }
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
  frameDetail: {
    title: string
    close: string
    /** Shown when the user clicked the receiver's lane rather than the sender's. */
    clickedRx: (lane: string) => string
    kindName: Record<FrameKind, string>
    /** Beginner-level "what is this frame and why does it exist". */
    whatIs: Record<FrameKind, string>
    /** Beginner-level "what happens right after this frame". */
    next: Record<FrameKind, string>
    nextTitle: string
    from: string; to: string; everyone: string
    when: string; whenHint: string
    airtime: string; airtimeHint: string
    size: string; sizeHint: string
    rate: string; rateHintMcs: string; rateHintLegacy: string
    ac: string; acNames: string[]; acHint: string
    duration: string; durationHint: string
    seq: string; seqHint: string
    retry: string; retryHint: string
    ampduTitle: (n: number) => string
    ampduHint: string
    muTitle: (n: number) => string
    muHint: string
    muTo: string; muSize: string; muRate: string
    ruNote: string
  }
  tooltips: {
    transmitting: string; dlMu: (n: number) => string; ampdu: (n: number, dst: string) => string
    data: (dst: string) => string; ack: (dst: string) => string; ba: (dst: string) => string
    mba: string; trigger: string; rts: (dst: string) => string; cts: (dst: string) => string
    nonHt: string; sifsNote: string; retryNote: string; ruNote: string
    receiving: (kind: string, from: string) => string
    backoffTitle: string; backoffL1: string; backoffL2: string
    deferTitle: (ifs: string) => string; eifsNote: string; deferNote: string
    ifsChain: (kinds: string) => string
    navTitle: string; navNote: string; sifsWait: string
  }
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    header: { subtitle: 'IEEE 802.11 DCF/EDCA · µs timescale', edit: '✎ Edit', simulate: '▶ Simulate', course: '📚 Course' },
    panel: { inspector: '🔍 Inspector', log: '📜 Log', guide: '📖 Guide' },
    guideWindow: {
      title: '📖 Wi-Fi reference', terms: 'Terms', overview: 'Overview',
      search: 'search terms…', empty: 'no term matches',
      close: 'close (Esc)', dragHint: 'drag to move',
    },
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
    strip: { windowHint: 'wheel = move time · Ctrl+wheel = zoom · click a frame for details', legendCollision: 'collision' },
    legend: [
      { color: '#3b82f6', label: 'DL data', hint: 'Data PPDU from the AP (downlink). Length = real airtime.' },
      { color: '#22c55e', label: 'UL data', hint: 'Data PPDU from a station (uplink).' },
      { color: '#e5e7eb', label: 'ACK', hint: 'Acknowledgement, sent one SIFS (16 µs) after a received frame.' },
      { color: '#d8b4fe', label: 'BA', hint: 'BlockAck: one frame acknowledging a whole A-MPDU aggregate.' },
      { color: '#facc15', label: 'Trigger', hint: 'Wi-Fi 6 Trigger frame: the AP schedules simultaneous uplink OFDMA transmissions.' },
      { color: '#f97316', label: 'RTS/CTS', hint: 'Medium reservation handshake used above the RTS threshold (hidden-node protection).' },
      { color: '#f59e0b', label: 'backoff', hint: 'Random backoff countdown: −1 per idle 9 µs slot; frozen while the medium is busy.' },
      { color: '#6d5a1b', label: 'defer', hint: 'Waiting for DIFS/AIFS/EIFS quiet time, or for the medium to go idle.' },
      { color: '#06b6d4', label: 'exchange wait', hint: 'Mid-exchange pause: a SIFS turnaround or waiting for the response (ACK/CTS) — not contending.' },
      { color: '#9333ea', label: 'NAV', hint: 'Virtual carrier sense: reserved by an overheard Duration field.' },
      { color: '#8b5cf6', label: 'RX', hint: 'Receiving a frame.' },
      { color: '#ef4444', label: 'collision', hint: 'Two or more overlapping transmissions corrupted a reception.' },
    ],
    editor: {
      tools: { select: '☝ select', room: '▭ room', door: '🚪 door', window: '🪟 window', sta: '📱 STA', fit: '⌂ fit' },
      scenario: 'Scenario', save: '💾 Save', load: '📂 Load', export_: '⬇ Export', import_: '⬆ Import',
      spawn: '🎲 Spawn STAs', rts: 'RTS', rtsHint: 'dot11RTSThreshold: frames larger than this use RTS/CTS protection',
      seed: 'Seed', seedHint: 'random seed — identical seed reproduces the exact same run',
      objects: '🗂 OBJECTS', properties: '⚙ PROPERTIES', guide: '📖 EDITOR REFERENCE',
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
    frameDetail: {
      title: '📨 Frame details',
      close: 'back to node view',
      clickedRx: (lane) => `You clicked the receiving side — lane “${lane}” is hearing this frame while the sender transmits it.`,
      kindName: {
        data: 'Data frame', ack: 'ACK — acknowledgement', rts: 'RTS — request to send',
        cts: 'CTS — clear to send', ba: 'BlockAck — block acknowledgement',
        trigger: 'Trigger frame', mba: 'Multi-STA BlockAck',
      },
      whatIs: {
        data: 'The payload carrier — the frame that actually moves your bytes (video, web page, backup…) through the air. Everything else on this timeline exists to get frames like this one through safely.',
        ack: 'A tiny receipt. A Wi-Fi radio cannot listen while it transmits, so it never knows by itself whether a frame survived — the receiver must confirm every delivery with this short “got it, intact”. No ACK back means the sender assumes a loss and retries.',
        rts: 'A short “may I speak?” sent before a long data frame. If it collides, only these few bytes are lost instead of the whole data frame — and its Duration field silences even stations too far away to hear the data sender (hidden nodes).',
        cts: '“Yes, go ahead” — the answer to an RTS. It repeats the reservation from the receiver’s side, so stations near the receiver also learn to stay quiet.',
        ba: 'One receipt for a whole batch: instead of ACKing every frame of an A-MPDU aggregate separately, the receiver returns a bitmap saying which sub-frames arrived. Only the missing ones get re-sent.',
        trigger: 'The AP acting as a conductor (Wi-Fi 6 OFDMA): it splits the channel into frequency slices (resource units) and invites several stations to transmit at the same moment, each in its own slice.',
        mba: 'One receipt for several stations at once: after a simultaneous OFDMA uplink, the AP confirms everyone’s data in this single Multi-STA BlockAck.',
      },
      next: {
        data: 'If it arrives intact, the receiver answers after exactly one SIFS (16 µs — the shortest gap in Wi-Fi, too short for anyone else to butt in) with an ACK or BlockAck. If nothing comes back, the sender times out, doubles its contention window and retries.',
        ack: 'The exchange is complete. Stations silenced by the Duration field release their NAV timers, wait one DIFS/AIFS of quiet, and resume their backoff countdowns — the race for the channel restarts.',
        rts: 'The addressed station replies with a CTS one SIFS later. If no CTS arrives, only this short frame was wasted and the sender retries cheaply.',
        cts: 'The data frame follows one SIFS later, transmitted inside the quiet window the RTS/CTS pair just reserved.',
        ba: 'The sender re-queues whatever the bitmap marked missing; everything confirmed is done. Then normal contention resumes.',
        trigger: 'One SIFS later every invited station transmits simultaneously, each in its resource unit, for exactly the duration it was granted; the AP then confirms all of them with a Multi-STA BlockAck.',
        mba: 'The uplink OFDMA round is closed; each station re-queues anything unconfirmed, and normal contention resumes.',
      },
      nextTitle: 'What happens next',
      from: 'from', to: 'to', everyone: 'several stations (multi-user)',
      when: 'starts at', whenHint: 'simulation time when the first bit hits the air',
      airtime: 'airtime',
      airtimeHint: 'how long the frame occupies the channel: a fixed PHY preamble first (radios sync on it), then bytes ÷ data rate. While it lasts, no one else can be heard.',
      size: 'size',
      sizeHint: 'octets on the air: MAC header + payload + a 4-byte FCS checksum the receiver uses to detect corruption',
      rate: 'data rate',
      rateHintMcs: 'MCS = modulation & coding scheme, the “gear” the link runs in. A higher MCS packs more bits into each symbol but needs a cleaner signal.',
      rateHintLegacy: 'control and legacy frames use a low, robust rate that every station — even the oldest — can decode.',
      ac: 'priority (AC)',
      acNames: ['background (AC_BK)', 'best effort (AC_BE)', 'video (AC_VI)', 'voice (AC_VO)'],
      acHint: 'EDCA access category: higher-priority traffic waits shorter gaps and draws smaller backoffs, so voice usually beats a backup to the channel.',
      duration: 'Duration field',
      durationHint: 'the header announces how much longer this whole exchange will take; every station that overhears it sets its NAV timer and stays silent that long — a reservation made by announcement.',
      seq: 'sequence number',
      seqHint: 'a per-destination counter, so if an ACK is lost and the frame arrives twice, the receiver can spot the duplicate.',
      retry: 'retransmission',
      retryHint: 'the Retry bit is set: an earlier attempt of this very frame got no acknowledgement (collision or noise), so it is being sent again.',
      ampduTitle: (n) => `A-MPDU aggregate — ${n} frames in one burst`,
      ampduHint: 'many data frames glued into a single transmission: the preamble and the contention wait are paid once instead of once per frame. The whole batch is confirmed by one BlockAck.',
      muTitle: (n) => `multi-user payload — ${n} stations at once`,
      muHint: 'OFDMA splits the channel into smaller frequency slices (resource units); each row below is one station’s slice, all transmitted simultaneously.',
      muTo: 'station', muSize: 'bytes', muRate: 'rate',
      ruNote: 'RU-orthogonal: sent at the same time as the other frames of its group without interfering — they occupy different frequency slices.',
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
      ifsChain: (kinds) => `this block: ${kinds}`,
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
    guideWindow: {
      title: '📖 Wi-Fi 速查手册', terms: '术语', overview: '概览',
      search: '搜索术语…', empty: '没有匹配的术语',
      close: '关闭（Esc）', dragHint: '可拖动',
    },
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
    strip: { windowHint: '滚轮移动时间 · Ctrl+滚轮缩放 · 点击帧查看详情', legendCollision: '碰撞' },
    legend: [
      { color: '#3b82f6', label: '下行数据', hint: 'AP 发出的数据 PPDU（下行）。长度即真实占用空口时间。' },
      { color: '#22c55e', label: '上行数据', hint: '终端（STA）发出的数据 PPDU（上行）。' },
      { color: '#e5e7eb', label: 'ACK', hint: '确认帧：在收到帧之后恰好一个 SIFS（16 µs）发出。' },
      { color: '#d8b4fe', label: 'BA', hint: 'BlockAck 块确认：一帧确认整个 A-MPDU 聚合。' },
      { color: '#facc15', label: 'Trigger', hint: 'Wi-Fi 6 触发帧：AP 调度多个终端同时进行上行 OFDMA 传输。' },
      { color: '#f97316', label: 'RTS/CTS', hint: '超过 RTS 门限时使用的介质预约握手（防隐藏节点）。' },
      { color: '#f59e0b', label: '退避', hint: '随机退避倒数：每个空闲 9 µs 时隙减 1；介质忙时冻结。' },
      { color: '#6d5a1b', label: '等待', hint: '等待 DIFS/AIFS/EIFS 静默期，或等待介质变为空闲。' },
      { color: '#06b6d4', label: '交换等待', hint: '帧交换过程中的停顿：SIFS 周转或等待响应（ACK/CTS）——并非在竞争信道。' },
      { color: '#9333ea', label: 'NAV', hint: '虚拟载波侦听：被侦听到的 Duration 字段预约了介质。' },
      { color: '#8b5cf6', label: '接收', hint: '正在接收帧。' },
      { color: '#ef4444', label: '碰撞', hint: '两个以上的传输重叠，导致接收失败。' },
    ],
    editor: {
      tools: { select: '☝ 选择', room: '▭ 房间', door: '🚪 门', window: '🪟 窗', sta: '📱 终端', fit: '⌂ 复位' },
      scenario: '场景', save: '💾 保存', load: '📂 载入', export_: '⬇ 导出', import_: '⬆ 导入',
      spawn: '🎲 随机生成终端', rts: 'RTS', rtsHint: 'dot11RTSThreshold：大于该门限的帧启用 RTS/CTS 保护',
      seed: '种子', seedHint: '随机种子 — 相同种子可完全复现同一次仿真',
      objects: '🗂 对象列表', properties: '⚙ 属性', guide: '📖 编辑器说明',
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
    frameDetail: {
      title: '📨 帧详情',
      close: '返回节点视图',
      clickedRx: (lane) => `你点击的是接收方——泳道「${lane}」正在收听这帧，同一时刻发送方正在发出它。`,
      kindName: {
        data: '数据帧', ack: 'ACK — 确认帧', rts: 'RTS — 请求发送',
        cts: 'CTS — 允许发送', ba: 'BlockAck — 块确认',
        trigger: 'Trigger — 触发帧', mba: '多站点 BlockAck',
      },
      whatIs: {
        data: '真正运载数据的帧——你的视频、网页、备份等字节就装在里面通过空口传输。时间轴上的其它一切，都是为了让这样的帧安全送达。',
        ack: '一张小小的回执。Wi-Fi 电台发送时无法同时收听，自己永远不知道帧有没有送到——必须由接收方用这条简短的「收到，完好」来确认。收不到 ACK，发送方就认定丢失并重传。',
        rts: '在长数据帧之前先发的一句「我能讲话吗？」。它很短，即使碰撞也只损失这几个字节；而且它的 Duration 字段能让离数据发送方太远、听不到它的站点（隐藏节点）也保持安静。',
        cts: '「可以，请讲」——对 RTS 的回答。它从接收方一侧把预约再广播一遍，让接收方附近的站点也知道要保持安静。',
        ba: '整批数据的一张回执：接收方不再逐帧回 ACK，而是返回一张位图，标明 A-MPDU 聚合中哪些子帧收到了。只有缺失的子帧才需要重发。',
        trigger: 'AP 扮演指挥家（Wi-Fi 6 OFDMA）：把信道切成若干频率子块（资源单元 RU），邀请多个终端在同一时刻各自在自己的子块里发送。',
        mba: '发给多个站点的一张合并回执：一轮同时进行的 OFDMA 上行结束后，AP 用这一帧统一确认所有终端的数据。',
      },
      next: {
        data: '若完好到达，接收方会在恰好一个 SIFS（16 µs——Wi-Fi 里最短的间隔，短到没人能插队）之后回 ACK 或 BlockAck。若无回音，发送方超时后把竞争窗口翻倍并重传。',
        ack: '这次帧交换到此完成。被 Duration 字段压制的站点解除 NAV 计时器，等待一个 DIFS/AIFS 的安静期后继续退避倒数——信道争夺重新开始。',
        rts: '被叫站点会在一个 SIFS 后回复 CTS。若 CTS 没来，损失的只是这短短一帧，发送方可以低成本重试。',
        cts: '数据帧将在一个 SIFS 后发出，在 RTS/CTS 刚刚预约好的安静窗口内传输。',
        ba: '位图中标记缺失的子帧被发送方重新入队；确认过的就算送达。之后信道竞争恢复。',
        trigger: '一个 SIFS 之后，所有被邀请的终端同时发送，各自在自己的 RU 内、严格按分配的时长进行；随后 AP 用多站点 BlockAck 统一确认。',
        mba: '这轮上行 OFDMA 到此结束；各终端把未被确认的数据重新入队，正常竞争恢复。',
      },
      nextTitle: '接下来会发生什么',
      from: '发送方', to: '接收方', everyone: '多个终端（多用户）',
      when: '开始时刻', whenHint: '第一个比特进入空口的仿真时刻',
      airtime: '空口时间',
      airtimeHint: '这帧占用信道的时长：先是固定的 PHY 前导码（供各电台同步），然后是 字节数 ÷ 速率。在此期间其他任何人的信号都无法被正确接收。',
      size: '大小',
      sizeHint: '空口上的总字节数：MAC 头 + 载荷 + 4 字节 FCS 校验和（接收方用它检测损坏）',
      rate: '速率',
      rateHintMcs: 'MCS = 调制编码方案，相当于链路的「档位」。MCS 越高，每个符号装的比特越多，但要求信号越干净。',
      rateHintLegacy: '控制帧和传统帧使用低速、稳健的速率，保证任何站点——哪怕最老的——都能解码。',
      ac: '优先级（AC）',
      acNames: ['后台 (AC_BK)', '尽力而为 (AC_BE)', '视频 (AC_VI)', '语音 (AC_VO)'],
      acHint: 'EDCA 接入类别：优先级越高，等待的间隔越短、抽取的退避越小，所以语音通常抢得过云备份。',
      duration: 'Duration 字段',
      durationHint: '帧头里预告了整个交换还要持续多久；所有侦听到它的站点会据此设置 NAV 计时器并在这段时间内保持安静——一种「广播即预约」的机制。',
      seq: '序列号',
      seqHint: '按目的地递增的计数器：若 ACK 丢失导致同一帧被发两次，接收方靠它识别重复。',
      retry: '重传',
      retryHint: 'Retry 位已置 1：这一帧之前发过一次但没有收到确认（碰撞或噪声），现在正在重发。',
      ampduTitle: (n) => `A-MPDU 聚合 — 一次突发携带 ${n} 帧`,
      ampduHint: '把许多数据帧拼进同一次发送：前导码和竞争等待只需付一次，而不是每帧一次。整批数据由一个 BlockAck 统一确认。',
      muTitle: (n) => `多用户载荷 — ${n} 个终端同时`,
      muHint: 'OFDMA 把信道切成更小的频率子块（资源单元 RU）；下表每一行是一个终端的子块，全部同时传输。',
      muTo: '终端', muSize: '字节', muRate: '速率',
      ruNote: 'RU 正交：与同组其它帧同时发送而互不干扰——它们占用不同的频率子块。',
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
      ifsChain: (kinds) => `本块依次经过：${kinds}`,
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
