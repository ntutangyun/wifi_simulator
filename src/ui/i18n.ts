/** Minimal i18n: typed string tables + a lang field in the UI store. */
import type { FeatureFlag, LinkId } from '../model/caps'
import type { FrameDesc, FrameKind } from '../model/frames'
import type { Generation } from '../model/types'
import type { ProfileId } from '../model/scenario'
import type { RxFailReason } from '../model/records'
import type { AddrRole, FcBitKey, FieldKey, PpduSegmentKey } from '../model/frameFields'

export type Lang = 'en' | 'zh'

/** How a multi-user PPDU is split — absent for frames that are always OFDMA-flavored (triggers, UL TB, M-BA). */
export type MuKind = FrameDesc['muKind']

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
    tools: { select: string; room: string; door: string; window: string; ap: string; sta: string; tag: string; anchor: string; uwbTag: string; fit: string }
    /** Why the AP tool, the Wi-Fi device tools and 🎲 Spawn are disabled. */
    apExists: string; needApFirst: string
    scenario: string; save: string; load: string; export_: string; import_: string
    spawn: string; rts: string; rtsHint: string; seed: string; seedHint: string
    objects: string; properties: string; guide: string
    nodesHeader: string; rooms: string; walls: string; noRooms: string
    node: string; name: string; wifi: string; link: string; linkHint: string; bands: Record<LinkId, string>
    preset: string; presetPick: string; presetHint: string; brands: Record<'huawei' | 'xiaomi' | 'honor' | 'apple', string>; mloCapableNote: string
    servers: string; addServer: string; serverName: string; serverKind: string; serverRtt: string; serverRttHint: string; deleteServer: string
    streamServer: string; households: string; householdsPick: string
    gameAccel: string; gameAccelHint: string
    p2pTarget: string; p2pTargetHint: string;
    tamper: string; tamperHint: string; tamperKinds: Record<'none' | 'custom' | 'escalate' | 'aifs' | 'cw' | 'noDouble' | 'txopHog' | 'navInflate' | 'greedy', string>
    serverJitter: string; serverJitterHint: string; serverProcess: string; serverProcessHint: string
    traffic: string; txPower: string; height: string
    txopProt: string; txopProtHint: string
    txopProtNames: Record<'single' | 'boundary' | 'multiple', string>
    deleteNode: string; deleteRoom: string; apNoDelete: string; delete_: string
    wall: string; material: string; materialHint: string; removeOpenings: string
    room: string; openings: string
    emptyHint: string
    saved: string; loaded: string; imported: string; nothingSaved: string
    scaleBarHint: string
    amp: string; ampEnable: string; ampInterval: string; ampIntervalHint: string
    ampSlots: string; ampSlotsHint: string; ampAcwe: string; ampAcweHint: string
    ampDl: string; ampDlHint: string; ampUl: string; ampUlHint: string
    ampProt: Record<'ctsSelf' | 'none', string>; ampProtLabel: string
    ampRead: Record<'inline' | 'twoPhase', string>; ampReadLabel: string
    ampNeedsEht: string
    ampSens: string; ampSensHint: string
    /** UWB ranging: the per-node fields (uwb/ui/UwbNodeFields.tsx). */
    uwbNode: string; uwbRole: string; uwbRoles: Record<'anchor' | 'tag', string>
    uwbPpm: string; uwbPpmHint: string; uwbPpmDrawn: string; uwbPpmRange: string
    /** UWB ranging: the session section (uwb/ui/UwbSessionFields.tsx). */
    uwbSession: string; uwbCounts: (anchors: number, tags: number) => string
    uwbNoNodes: string; uwbRemoveSession: string; uwbRemoveSessionHint: string; uwbSessionInUse: string
    uwbMethod: string; uwbMethodHint: string; uwbMethods: Record<'ss' | 'ds', string>
    uwbBlock: string; uwbBlockHint: string; uwbSlot: string; uwbSlotHint: string
    uwbChannel: string; uwbChannelHint: string
    uwbTsNoise: string; uwbTsNoiseHint: string; uwbCfoNoise: string; uwbCfoNoiseHint: string
    uwbNlos: string; uwbNlosHint: string
    /** "slots per round N · rounds per block M" under the session fields. */
    uwbPlan: (slots: number, rounds: number) => string
  }
  inspector: {
    waiting: string; bssTotals: string; throughput: string; delivered: string
    collisions: string; retries: string; node: string; ok: string; rty: string; airtime: string; lat: string; latHint: string
    width: string; nss: string
    linkName: Record<LinkId, string>
    acHeader: { ac: string; bo: string; cw: string; queue: string }
    acHint: string; boHint: string; cwHint: string; queueHint: string
    backoffCounter: string; cw: string; ssrcSlrc: string; ssrcHint: string
    nav: string; navHint: string; navIdle: string; left: string
    ifs: string; ifsHint: string; cca: string; ccaHint: string; busy: string; idle: string
    txop: string; txopHint: string
    transmitting: string; receiving: string; queue: string; old: string; more: string; inFlight: string
    stats: string; framesDelivered: string; retriesDrops: string; collisionsL: string
    airtimeShare: string; rxThroughput: string
    txLatency: string; txLatencyHint: string; rxLatency: string; rxLatencyHint: string
    appRtt: string; appRttHint: string; relayLatency: string; relayLatencyHint: string; servers: string; serverCols: { server: string; kind: string; rtt: string; up: string; down: string }
    ampTag: string; aboc: string; abocHint: string; slot: string; slotHint: string
    ampCounts: string; ampCountsHint: string; ampRound: string; ampRoundHint: string; satOut: string
    ampPhase: Record<'random' | 'scheduled', string>
  }
  /** UWB ranging inspector (uwb/ui/UwbInspector.tsx). */
  uwb: {
    anchor: string; tag: string; role: string
    blockRound: string; slot: string; timeouts: string
    ranges: string; peer: string; measured: string; trueDist: string; error: string; fom: string; rounds: string
    /** The Figure of Merit byte as a phrase: "97 % within 0.5 ns" (standard §10.29.1.7). */
    fomWithin: (pct: number, intervalNs: number) => string
    noFom: string
    position: string; estimate: string; gdop: string; ellipse: string; noPosition: string
  }
  log: { empty: string }
  profiles: Record<ProfileId, string>
  /** One-word app names for the 3D label under a station's name. */
  appShort: Record<ProfileId, string>
  serverKinds: Record<'video' | 'web' | 'call' | 'game', string>
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
    muHint: (kind: MuKind) => string
    muTo: string; muSize: string; muRate: string
    ruNote: (kind: MuKind) => string
    fields: {
      title: string; hint: string
      mpdu: (typeName: 'Control' | 'Data' | 'Ranging', subtype: string, bytes: number) => string
      forUser: (dst: string) => string
      subframes: (n: number) => string
      firstShown: string
      subframeRow: (i: number, delim: number, mpdu: number, pad: number) => string
      name: Record<FieldKey, string>
      bit: Record<FcBitKey, string>
      role: Record<AddrRole, string>
      broadcast: string
      ppdu: string; ppduHint: string
      segment: Record<PpduSegmentKey, string>
      symbols: (n: number, symUs: number) => string
      /** UWB: where inside the PPDU the ranging timestamp is taken. */
      rmarker: (us: string) => string
    }
  }
  widgets: {
    txPower: string; distance: string; walls: string; width: string; mode: string
    wallName: Record<'drywall' | 'brick' | 'glass', string>
    pathLoss: string; wallLoss: string; rssi: string; noise: string; snr: string
    bestMcs: string; required: string; margin: (db: number) => string
    ladderSnr: string; mcs: string; rate: string; reqSinr: string; sens: string
    usable: (n: number) => string
  }
  tooltips: {
    transmitting: string; dlMu: (n: number, kind: MuKind) => string; ampdu: (n: number, dst: string) => string
    data: (dst: string) => string; ack: (dst: string) => string; ba: (dst: string) => string
    mba: string; trigger: string; rts: (dst: string) => string; cts: (dst: string) => string; cfend: string
    nonHt: string; sifsNote: string; retryNote: string; ruNote: (kind: MuKind) => string
    receiving: (kind: string, from: string) => string
    rxCorrupted: (reason: RxFailReason, interferers: string) => string
    backoffTitle: string; backoffL1: string; backoffL2: string
    deferTitle: (ifs: string) => string; eifsNote: string; deferNote: string
    ifsChain: (kinds: string) => string
    navTitle: string; navNote: string; sifsWait: string
    ampTrigger: string; ampAck: (dst: string) => string; ampResp: (slot: number) => string
    ampWait: string; ampWaitNote: string
    uwbPoll: (anchors: number) => string; uwbResp: (slot: number) => string
    uwbFinal: string; uwbReport: (dst: string) => string
    uwbRate: (mbps: number) => string
    uwbWait: string; uwbWaitNote: string
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
      { color: '#fb7185', label: 'CF-End', hint: 'TXOP truncation: the holder releases a reservation it no longer needs; the AP repeats a station’s CF-End.' },
      { color: '#f59e0b', label: 'backoff', hint: 'Random backoff countdown: −1 per idle 9 µs slot; frozen while the medium is busy.' },
      { color: '#6d5a1b', label: 'defer', hint: 'Waiting for DIFS/AIFS/EIFS quiet time, or for the medium to go idle.' },
      { color: '#06b6d4', label: 'exchange wait', hint: 'Mid-exchange pause: a SIFS turnaround or waiting for the response (ACK/CTS) — not contending.' },
      { color: '#9333ea', label: 'NAV', hint: 'Virtual carrier sense: reserved by an overheard Duration field.' },
      { color: '#8b5cf6', label: 'RX', hint: 'Receiving a frame.' },
      { color: '#ef4444', label: 'RX failed', hint: 'Hatched: a reception that did not decode, which costs the receiver an EIFS. Red when a collision garbled it — a receiver locks onto one preamble, so overlapping frames show as one failed reception. Purple when the signal was simply too weak, typically a bystander overhearing a fast frame.' },
      { color: '#ef4444', label: 'collision', hint: 'Two or more overlapping transmissions corrupted a reception.' },
      { color: '#2dd4bf', label: 'AMP DL', hint: 'AMP Trigger or AMP Ack: a 2.4 GHz OOK PPDU behind a legacy preamble, addressed to ambient-power tags.' },
      { color: '#a78bfa', label: 'AMP UL', hint: 'A tag’s OOK response inside the slot it drew; no preamble Wi-Fi radios can see.' },
      { color: '#115e59', label: 'slot wait', hint: 'A tag armed for a later slot, counting the AP’s Acks.' },
      { color: '#f59e0b', label: 'UWB tag', hint: 'A ranging tag’s own frames — the Poll that opens a round and the Final that closes a DS-TWR one.' },
      { color: '#fbbf24', label: 'UWB anchor', hint: 'An anchor’s answer in its ranging slot: the Response, and under DS-TWR the measurement report.' },
    ],
    editor: {
      tools: { select: '☝ select', room: '▭ room', door: '🚪 door', window: '🪟 window', ap: '📡 AP', sta: '📱 STA', tag: '🏷 AMP tag', anchor: '📍 UWB anchor', uwbTag: '📱 UWB tag', fit: '⌂ fit' },
      apExists: 'the plan already has its AP — Wi-Fi allows exactly one',
      needApFirst: 'place an AP first: a station or an AMP tag needs one (only a plan of nothing but UWB devices may go without)',
      scenario: 'Scenario', save: '💾 Save', load: '📂 Load', export_: '⬇ Export', import_: '⬆ Import',
      spawn: '🎲 Spawn STAs', rts: 'RTS', rtsHint: 'dot11RTSThreshold: frames larger than this use RTS/CTS protection',
      seed: 'Seed', seedHint: 'random seed — identical seed reproduces the exact same run',
      objects: '🗂 OBJECTS', properties: '⚙ PROPERTIES', guide: '📖 EDITOR REFERENCE',
      nodesHeader: 'Nodes (order = timeline lanes)', rooms: 'Rooms', walls: 'Walls', noRooms: 'none — draw one with ▭',
      node: 'Node', name: 'Name', wifi: 'Wi-Fi', link: 'Link',
      linkHint: 'operating band; 802.11g and Wi-Fi 6/7 can use 2.4 GHz, Wi-Fi 6E/7 can use 6 GHz (MLO devices use 5 + 6 GHz)',
      bands: { '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz' },
      preset: 'Phone', presetPick: 'pick a model…', presetHint: 'Real phones, China-market configuration: sets name, Wi-Fi generation, features and typical traffic. Everything stays editable.',
      brands: { huawei: 'Huawei', xiaomi: 'Xiaomi / Redmi', honor: 'Honor', apple: 'Apple' },
      mloCapableNote: 'China unit: 6 GHz is off, and this simulator only models MLO across 5 + 6 GHz. Tick MLO above to model the global variant.',
      servers: 'Cloud servers', addServer: '+ server', serverName: 'Name', serverKind: 'Kind', serverRtt: 'WAN RTT',
      serverRttHint: 'round trip between the AP and this server across the internet; each direction takes half',
      deleteServer: '🗑 Delete server', streamServer: 'server', households: '🏠 Households', householdsPick: 'load a household…',
      serverJitter: 'WAN jitter', serverJitterHint: 'each packet’s round trip is drawn between RTT and RTT + jitter (half of it per direction)',
      serverProcess: 'Processing', serverProcessHint: 'time the server takes to answer a request or echo a ping',
      p2pTarget: 'to', p2pTargetHint: 'the phone this video is for; the AP forwards every frame it receives',
      tamper: '⚠ Tampered driver', tamperHint: 'This station ignores the EDCA parameters the AP broadcast. Pick a cheat to see what it buys the cheater and costs everyone else.',
      tamperKinds: {
        none: 'compliant', custom: 'custom',
        escalate: 'priority escalation — every frame sent as AC_VO',
        aifs: 'AIFS floor — AIFSN 1 for every class',
        cw: 'CW collapse — no random backoff (CW 0)',
        noDouble: 'no doubling — CW never grows after a collision',
        txopHog: 'TXOP hog — holds the medium 8 ms per access',
        navInflate: 'NAV inflation — Duration field padded by 3 ms',
        greedy: 'greedy — all of the above (the classic cheat)',
      },
      gameAccel: '🎮 Game acceleration', gameAccelHint: 'Router gaming mode: game flows are marked into AC_VI. Off, game packets carry no DSCP mark and contend as best effort (AC_BE) like everything else.',
      traffic: 'Traffic', txPower: 'Tx power', height: 'Height',
      txopProt: 'TXOP protection',
      txopProtHint: 'How this node announces a burst of several exchanges it holds: per-exchange Duration (single); an RTS/CTS reserving the medium to the end of the TXOP, given back early with CF-End (boundary); or that plus every data frame carrying the TXOP remainder (multiple).',
      txopProtNames: { single: 'single (per exchange)', boundary: 'boundary (RTS/CTS for the burst + CF-End)', multiple: 'multiple (every frame carries the remainder)' },
      deleteNode: '🗑 Delete node', deleteRoom: '🗑 Delete room', delete_: 'delete',
      apNoDelete: 'the AP can only be deleted once no station and no AMP tag is left — a plan of nothing but UWB devices needs no BSS',
      wall: 'Wall', material: 'Material', materialHint: 'RF attenuation: drywall 5 dB · brick 12 dB · glass 3 dB per crossing',
      removeOpenings: 'Remove openings', room: 'Room', openings: 'opening(s)',
      emptyHint: 'Nothing selected. Click a node, wall or room on the canvas (or in Objects above) to edit its properties here. Scenario save/load and settings live in the menu bar at the top of the canvas.',
      saved: 'saved', loaded: 'loaded', imported: 'imported', nothingSaved: 'nothing saved',
      scaleBarHint: 'grid 1 m (bold 5 m) · wheel zoom · middle/right-drag pan',
      amp: 'AMP polling (802.11bp)', ampEnable: 'poll ambient-power tags',
      ampInterval: 'poll every', ampIntervalHint: 'how often the AP contends (AC_BK) for an AMP round',
      ampSlots: 'slots (N)', ampSlotsHint: 'how many uplink slots the trigger opens each round',
      ampAcwe: 'ACWE', ampAcweHint: 'ACW = 2^ACWE − 1: the range a tag draws its slot counter from',
      ampDl: 'DL rate', ampDlHint: 'data rate of the AMP Trigger and AMP Ack PPDUs',
      ampUl: 'UL rate', ampUlHint: 'data rate the trigger dictates for a tag\'s uplink response',
      ampProt: { ctsSelf: 'CTS-to-self before the round', none: 'no protection' }, ampProtLabel: 'protection',
      ampRead: { inline: 'reading in the random-access response', twoPhase: 'id first, then a scheduled read' }, ampReadLabel: 'read mode',
      ampNeedsEht: 'AMP polling needs a Wi-Fi 7 AP (the AMP DL PPDU carries U-SIG)',
      ampSens: 'DL sensitivity', ampSensHint: 'weakest AMP DL PPDU this tag’s envelope detector can decode (model default −72 dBm)',
      uwbNode: 'UWB ranging (802.15.4-2024)', uwbRole: 'Role', uwbRoles: { anchor: 'anchor (fixed, answers)', tag: 'tag (ranges and solves its position)' },
      uwbPpm: 'Crystal offset', uwbPpmHint: 'error of this device’s ranging clock in parts per million; the standard allows ±20 ppm. Leave it blank to have the run draw one from the seed.',
      uwbPpmDrawn: 'drawn from the seed', uwbPpmRange: '±100 ppm; real crystals stay within ±20',
      uwbSession: 'UWB session', uwbCounts: (a, t) => `${a} anchor${a === 1 ? '' : 's'} · ${t} tag${t === 1 ? '' : 's'}`,
      uwbNoNodes: 'no ranging device uses this session',
      uwbRemoveSession: '🗑 Remove session', uwbRemoveSessionHint: 'drop scenario.uwb — an imported file may carry a session no device takes part in',
      uwbSessionInUse: 'the session cannot be removed while a UWB device is in the plan; delete the devices first',
      uwbMethod: 'Method', uwbMethodHint: 'SS-TWR: one poll and one response per anchor — half the frames, but the clock offset between the two devices leaks straight into the range. DS-TWR adds a final and a report, which cancels it.',
      uwbMethods: { ss: 'SS-TWR (single-sided)', ds: 'DS-TWR (double-sided)' },
      uwbBlock: 'Block', uwbBlockHint: 'the ranging block repeats forever; every tag owns one round inside it, so the block sets how often a tag gets a fresh position',
      uwbSlot: 'Slot', uwbSlotHint: 'one ranging slot holds one frame; it has to be long enough for the round’s longest frame (the DS-TWR Final, which grows with the anchor count) plus its flight time',
      uwbChannel: 'Channel', uwbChannelHint: 'channel 5 is 6489.6 MHz, channel 9 is 7987.2 MHz. Only the 1 m free-space term differs (48.7 dB against 50.5 dB), so channel 9 costs a constant 1.8 dB at every distance.',
      uwbTsNoise: 'Timestamp noise', uwbTsNoiseHint: 'one-sigma error of a receive timestamp; 100 ps of timing is 3 cm of flight and, after the TWR formula, 2.1 cm of range',
      uwbCfoNoise: 'Clock-estimate noise', uwbCfoNoiseHint: 'one-sigma error left over after the receiver estimates the carrier frequency offset; it is what SS-TWR cannot cancel',
      uwbNlos: 'NLOS wall delay', uwbNlosHint: 'add the extra delay of every wall a ray crosses (drywall 0.5 ns, brick 2 ns, glass 0.2 ns). A wall makes a range read long, never short.',
      uwbPlan: (slots, rounds) => `slots per round ${slots} · rounds per block ${rounds}`,
    },
    inspector: {
      waiting: 'waiting for simulation…', bssTotals: 'BSS totals — click a node or lane for detail',
      throughput: 'throughput', delivered: 'delivered', collisions: 'collision events', retries: 'retries',
      node: 'node', ok: 'ok', rty: 'rty', airtime: 'airtime',
      lat: 'latency', latHint: 'mean delivery latency of the frames this node sends: queue arrival → acknowledged',
      width: 'Channel width', nss: 'Spatial streams',
      linkName: { '2g': '2.4 GHz link', '5g': '5 GHz link', '6g': '6 GHz link' },
      acHeader: { ac: 'AC', bo: 'bo', cw: 'CW', queue: 'queue' },
      acHint: 'EDCA access category (BK=background, BE=best effort, VI=video, VO=voice)',
      boHint: 'current backoff slot counter', cwHint: 'contention window: backoff drawn uniform from [0, CW]',
      queueHint: "frames in this AC's queue — a frame being sent still counts until its ACK removes it",
      backoffCounter: 'backoff counter', cw: 'CW', ssrcSlrc: 'QSRC',
      ssrcHint: 'Retry counter of the access category that last failed (802.11-2020). Each failure doubles CW and a success resets it; separately, every frame counts its own retries and is dropped after 7.',
      nav: 'NAV', navHint: 'Network Allocation Vector: virtual carrier sense from overheard Duration fields',
      navIdle: 'idle', left: 'left',
      ifs: 'IFS', ifsHint: 'interframe space in progress: DIFS/AIFS (contention) or EIFS (after a corrupted frame)',
      cca: 'CCA', ccaHint: 'physical carrier sense: energy ≥ −62 dBm or decodable preamble ≥ −82 dBm',
      busy: 'busy', idle: 'idle',
      txop: 'TXOP', txopHint: "transmit opportunity: SIFS-chained exchanges without re-contending, up to the AC's limit",
      transmitting: 'transmitting', receiving: 'receiving', queue: 'queue', old: 'old', more: 'more',
      inFlight: 'in flight',
      stats: 'stats', framesDelivered: 'frames delivered', retriesDrops: 'retries / drops', collisionsL: 'collisions',
      airtimeShare: 'airtime share', rxThroughput: 'rx throughput',
      txLatency: 'tx latency', txLatencyHint: 'mean / max time from a frame entering this node’s queue to its ACK or BlockAck — queueing, AIFS, backoff and every retry included; dropped frames are not timed',
      rxLatency: 'rx latency', rxLatencyHint: 'mean / max delivery latency of the frames sent to this node, timed at the sender’s queue',
      appRtt: 'RTT (ping)', appRttHint: 'mean / max round trip of this station’s pings to its cloud server, sent four times a second on the stream’s access category and echoed at once: Wi-Fi up, WAN, Wi-Fi down — what a game’s ping counter shows',
      relayLatency: 'phone-to-phone', relayLatencyHint: 'mean / max latency of video frames another phone sends to this one: sender’s queue → AP → this phone, two Wi-Fi hops plus AP forwarding',
      servers: 'cloud servers', serverCols: { server: 'server', kind: 'kind', rtt: 'WAN RTT', up: 'up', down: 'down' },
      ampTag: 'AMP tag', aboc: 'ABOC',
      abocHint: 'AMP backoff counter drawn uniformly in [0, ACW] on each random-access trigger; ABOC < N picks slot ABOC + 1',
      slot: 'slot', slotHint: 'the uplink slot this tag will use in the current round',
      ampCounts: 'sent / acked / lost',
      ampCountsHint: 'responses transmitted, acknowledged by the following AMP Ack, and lost (collision, weak signal or a missed cue)',
      ampRound: 'AMP round', ampRoundHint: 'the polling round in progress on this link and who has answered so far',
      ampPhase: { random: 'random access', scheduled: 'scheduled' },
      satOut: 'sat out / heard',
    },
    uwb: {
      anchor: 'anchor', tag: 'tag', role: 'role',
      blockRound: 'block / round', slot: 'ranging slot', timeouts: 'silent slots',
      ranges: 'ranges measured', peer: 'peer', measured: 'measured', trueDist: 'true', error: 'error',
      fom: 'confidence', rounds: 'rounds',
      fomWithin: (pct, ns) => `${pct} % within ${ns} ns`, noFom: 'no FoM',
      position: 'position', estimate: 'estimate', gdop: 'GDOP', ellipse: 'error ellipse (1-σ)',
      noPosition: 'no fix yet — a tag needs ranges to three anchors in one block',
    },
    log: { empty: 'no events in window' },
    profiles: {
      video: 'video streaming (DL, AC_VI)', voice: 'voice call (2-way, AC_VO)', gaming: 'online gaming (王者荣耀 as measured: ~33 fps up, 15 Hz down)', p2pvideo: 'video to another phone (via the AP, AC_VI)', backup: 'cloud backup (UL, AC_BK)',
      browsing: 'web browsing (AC_BE)', iot: 'IoT sensor (AC_BK)', saturated: 'saturated upload (AC_BE)', idle: 'idle',
    },
    appShort: { video: 'video', voice: 'call', gaming: 'game', p2pvideo: 'share', backup: 'backup', browsing: 'web', iot: 'sensor', saturated: 'upload', idle: '' },
    serverKinds: { video: 'video (streaming)', web: 'web / cloud', call: 'call', game: 'game' },
    generations: {
      nonht: '802.11a (legacy)', vht: 'Wi-Fi 5 (VHT)', he: 'Wi-Fi 6 (HE)', eht: 'Wi-Fi 7 (EHT)',
    },
    features: {
      edca: 'EDCA (QoS access categories)', ampdu: 'A-MPDU aggregation + BlockAck', txop: 'TXOP bursting',
      ofdma: 'OFDMA (MU scheduling)', mumimo: 'MU-MIMO (multi-user by space)', mlo: 'Multi-Link Operation', qam4k: '4096-QAM (MCS 12/13)',
    },
    frameDetail: {
      title: '📨 Frame details',
      close: 'back to node view',
      clickedRx: (lane) => `You clicked the receiving side — lane “${lane}” is hearing this frame while the sender transmits it.`,
      kindName: {
        data: 'Data frame', ack: 'ACK — acknowledgement', rts: 'RTS — request to send',
        cts: 'CTS — clear to send', ba: 'BlockAck — block acknowledgement',
        trigger: 'Trigger frame', mba: 'Multi-STA BlockAck', cfend: 'CF-End — contention-free end',
        ampTrigger: 'AMP Trigger', ampAck: 'AMP Ack', ampResp: 'AMP response',
        uwbPoll: 'UWB Poll', uwbResp: 'UWB Response', uwbFinal: 'UWB Final', uwbReport: 'UWB measurement report',
      },
      whatIs: {
        cfend: 'A TXOP holder giving time back. Its RTS/CTS had reserved the channel until the end of the TXOP; the burst finished early, so this frame tells everyone who decodes it to drop that reservation now. When a station sent it, the AP repeats it one SIFS later so the far side of the cell hears the release too.',
        data: 'The payload carrier — the frame that actually moves your bytes (video, web page, backup…) through the air. Everything else on this timeline exists to get frames like this one through safely.',
        ack: 'A tiny receipt. A Wi-Fi radio cannot listen while it transmits, so it never knows by itself whether a frame survived — the receiver must confirm every delivery with this short “got it, intact”. No ACK back means the sender assumes a loss and retries.',
        rts: 'A short “may I speak?” sent before a long data frame. If it collides, only these few bytes are lost instead of the whole data frame — and its Duration field silences even stations too far away to hear the data sender (hidden nodes).',
        cts: '“Yes, go ahead” — the answer to an RTS. It repeats the reservation from the receiver’s side, so stations near the receiver also learn to stay quiet.',
        ba: 'One receipt for a whole batch: instead of ACKing every frame of an A-MPDU aggregate separately, the receiver returns a bitmap saying which sub-frames arrived. Only the missing ones get re-sent.',
        trigger: 'The AP acting as a conductor (Wi-Fi 6 OFDMA): it splits the channel into frequency slices (resource units) and invites several stations to transmit at the same moment, each in its own slice.',
        mba: 'One receipt for several stations at once: after a simultaneous OFDMA uplink, the AP confirms everyone’s data in this single Multi-STA BlockAck.',
        ampTrigger: 'The AP’s P802.11bp draft trigger for an ambient-power round: a slow on-off-keyed PPDU that opens N uplink slots and states how tags pick one — at random or in a scheduled order. Battery-free tags have no ordinary Wi-Fi receiver, so this trigger is what lets a round begin at all.',
        ampAck: 'The AP’s Ack for one AMP uplink slot: a normal, AP-powered OOK PPDU, unlike the tag’s own transmission on harvested power that it closes. Under the P802.11bp draft, tags with no clock of their own count these Acks to know when their slot has opened, so each one also cues the next.',
        ampResp: 'An Active Tx tag’s answer in its AMP uplink slot, sent on a carrier the tag makes itself, on power harvested from the AP’s signal rather than from a battery. The P802.11bp draft keeps it minimal — an id and, when the trigger asked for one, a sensor reading — so the harvested energy is enough to finish the transmission.',
        uwbPoll: 'The tag opens a ranging round: a broadcast UWB frame that names the anchors and the order of their slots. Its transmit time, read off the tag’s own ranging counter, is the first of the timestamps every distance is computed from.',
        uwbResp: 'One anchor’s answer in its own ranging slot. With SS-TWR it also carries the reply time the anchor measured, which is what lets the tag subtract the anchor’s processing delay from the round trip.',
        uwbFinal: 'The tag’s closing frame of a DS-TWR round: it broadcasts the round-trip and reply times the tag measured, so each anchor can combine them with its own pair and cancel both clocks’ drift.',
        uwbReport: 'An anchor’s measurement report: the two times only it could measure. Together with the Final’s numbers they complete the four-timestamp DS-TWR equation for that anchor.',
      },
      next: {
        cfend: 'Every station that decodes it resets its NAV and, after one DIFS/AIFS of quiet, may contend again. Stations that could not hear it keep waiting until the reservation they heard runs out.',
        data: 'If it arrives intact, the receiver answers after exactly one SIFS (16 µs — the shortest gap in Wi-Fi, too short for anyone else to butt in) with an ACK or BlockAck. If nothing comes back, the sender times out, doubles its contention window and retries.',
        ack: 'The exchange is complete. Stations silenced by the Duration field release their NAV timers, wait one DIFS/AIFS of quiet, and resume their backoff countdowns — the race for the channel restarts.',
        rts: 'The addressed station replies with a CTS one SIFS later. If no CTS arrives, only this short frame was wasted and the sender retries cheaply.',
        cts: 'The data frame follows one SIFS later, transmitted inside the quiet window the RTS/CTS pair just reserved.',
        ba: 'The sender re-queues whatever the bitmap marked missing; everything confirmed is done. Then normal contention resumes.',
        trigger: 'One SIFS later every invited station transmits simultaneously, each in its resource unit, for exactly the duration it was granted; the AP then confirms all of them with a Multi-STA BlockAck.',
        mba: 'The uplink OFDMA round is closed; each station re-queues anything unconfirmed, and normal contention resumes.',
        ampTrigger: 'A tag that chose a slot answers there with its AMP response; the AP acknowledges every slot in turn, whether or not a tag actually used it. This slotted answer-then-Ack rhythm is how the P802.11bp draft resolves contention without giving tags any carrier-sense capability.',
        ampAck: 'The round moves on to the next slot cued by this very Ack, or closes once every slot has been answered and acknowledged. Under the P802.11bp draft a tag has no clock of its own, so it learns when to transmit purely by counting these Acks from the trigger.',
        ampResp: 'One SIFS later the AP sends an Ack for this slot, whether or not a tag actually answered in it — silence is just another outcome. The P802.11bp draft repeats this for every slot the trigger opened, then either the round ends or the AP starts a new one.',
        uwbPoll: 'Each anchor answers in the ranging slot the Poll assigned it, one after another. A slot that passes in silence is a timeout: that anchor simply contributes no range this round.',
        uwbResp: 'Under SS-TWR the tag already has everything it needs and computes the distance straight away. Under DS-TWR it waits for every anchor, then sends its Final.',
        uwbFinal: 'Every anchor that heard it replies with its measurement report, each in its own slot; the tag then has four timestamps per anchor and turns them into distances.',
        uwbReport: 'The tag completes the DS-TWR calculation for this anchor. Once enough anchors have reported, it solves its own position and the round ends; the next one starts at the next ranging block.',
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
      muHint: (kind) => kind === 'mumimo'
        ? 'MU-MIMO sends every station at the same time on the same frequency, at full width; each row below is one station’s spatial stream, separated by space rather than by frequency slice.'
        : 'OFDMA splits the channel into smaller frequency slices (resource units); each row below is one station’s slice, all transmitted simultaneously.',
      muTo: 'station', muSize: 'bytes', muRate: 'rate',
      ruNote: (kind) => kind === 'mumimo'
        ? 'Spatially multiplexed: sent at the same time, same frequency and full width as the other frames of its group without interfering — they occupy different spatial streams.'
        : 'RU-orthogonal: sent at the same time as the other frames of its group without interfering — they occupy different frequency slices.',
      fields: {
        title: 'Fields on the air', hint: 'the MAC header field by field, and how the PPDU spends its airtime',
        mpdu: (ty, sub, b) => `${sub} (${ty}) · ${b} B`,
        forUser: (dst) => `PSDU for ${dst}`,
        subframes: (n) => `A-MPDU: ${n} subframes`,
        firstShown: 'fields of the first MPDU:',
        subframeRow: (i, d, m, p) => `#${i + 1}: delimiter ${d} + MPDU ${m}${p ? ` + pad ${p}` : ''} B`,
        name: {
          fc: 'Frame Control', duration: 'Duration', addr1: 'Address 1', addr2: 'Address 2', addr3: 'Address 3',
          seqCtl: 'Sequence Control', qos: 'QoS Control', body: 'Frame Body (MSDU)', baControl: 'BA Control',
          baInfo: 'BA Information', commonInfo: 'Common Info', userInfo: 'User Info List', fcs: 'FCS',
          ampId: 'ID (16-bit AMP identifier)', ampTdc: 'Type Dependent Control', ampStaList: 'STA ID list',
          seqNo: 'Sequence Number', dstPan: 'Destination PAN ID',
          dstAddr16: 'Destination Address (16-bit)', srcAddr16: 'Source Address (16-bit)',
          ieArc: 'ARC IE · Advanced Ranging Control', ieRdm: 'RDM IE · Ranging Device Management',
          ieRrmc: 'RRMC IE · Ranging Round Management Control',
          ieRrti: 'RRTI IE · Ranging Reply Time Instantaneous',
          ieRmi: 'RMI IE · Ranging Measurement Information',
        },
        bit: {
          protocolVersion: 'Protocol Version', type: 'Type', subtype: 'Subtype', toDs: 'To DS', fromDs: 'From DS',
          moreFrag: 'More Fragments', retry: 'Retry', pwrMgt: 'Power Management', moreData: 'More Data',
          protected: 'Protected Frame', htc: '+HTC',
        },
        role: { RA: 'receiver', TA: 'transmitter', DA: 'destination', SA: 'source', BSSID: 'BSSID' },
        broadcast: 'broadcast',
        ppdu: 'PPDU layout', ppduHint: 'preamble and PHY header first, then the data symbols carrying the PSDU',
        segment: {
          legacyPreamble: 'STF + LTF', signal: 'SIGNAL', preamble: 'preamble', muSig: 'SIG-B / EHT-SIG',
          data: 'data', padding: 'padding / PE',
          usig: 'RL-SIG + U-SIG (12 µs)', ampSync: 'AMP-Sync (OOK chips)', ampSig: 'AMP-SIG (2 octets)',
          ampData: 'AMP-Data (Manchester OOK)', signalExt: 'signal extension (6 µs)',
          sync: 'SYNC (64 preamble symbols)', sfd: 'SFD (start-of-frame delimiter)', stsGap: 'STS gap',
          sts: 'STS (scrambled timestamp sequence)', phr: 'PHR (PHY header)', psdu: 'PSDU (ranging payload)',
        },
        symbols: (n, u) => `${n} symbols × ${u} µs`,
        rmarker: (us) => `RMARKER at ${us} µs — every ranging timestamp is read here, not at the start of the frame`,
      },
    },
    widgets: {
      txPower: 'TX power', distance: 'distance', walls: 'walls in the way', width: 'channel width', mode: 'PHY',
      wallName: { drywall: 'drywall', brick: 'brick', glass: 'glass' },
      pathLoss: 'path loss', wallLoss: 'walls', rssi: 'received (RSSI)', noise: 'noise floor', snr: 'SNR',
      bestMcs: 'highest usable MCS', required: 'needs', margin: (db) => `required SINR + ${db} dB margin`,
      ladderSnr: 'your SNR', mcs: 'MCS', rate: 'Mbps (20 MHz, 1 SS)', reqSinr: 'required SINR', sens: 'sensitivity',
      usable: (n) => `${n} MCS usable (with the rate margin)`,
    },
    tooltips: {
      transmitting: 'transmitting',
      dlMu: (n, kind) => kind === 'mumimo'
        ? `DL MU-MIMO PPDU → ${n} stations (same frequency, split by space)`
        : `DL MU PPDU → ${n} stations (OFDMA)`,
      ampdu: (n, dst) => `A-MPDU (${n} MPDUs) → ${dst}`,
      data: (dst) => `Data frame → ${dst}`,
      ack: (dst) => `ACK → ${dst}`,
      ba: (dst) => `BlockAck → ${dst}`,
      mba: 'Multi-STA BlockAck (OFDMA)',
      trigger: 'Trigger frame — schedules UL OFDMA',
      rts: (dst) => `RTS → ${dst} (reserves the medium)`,
      cts: (dst) => `CTS → ${dst}`,
      cfend: 'CF-End (releases the TXOP reservation)',
      nonHt: 'non-HT',
      sifsNote: 'sent a SIFS (16 µs) after the frame — responses never contend',
      retryNote: 'retransmission (Retry bit set)',
      ruNote: (kind) => kind === 'mumimo'
        ? 'MU-MIMO: simultaneous, same frequency, different spatial streams'
        : 'RU-orthogonal: simultaneous with other same-group frames',
      receiving: (kind, from) => `receiving ${kind} from ${from}`,
      rxCorrupted: (reason, interferers) =>
        reason === 'collision' ? `corrupted — collided with ${interferers}` :
        reason === 'undetected' ? (interferers
          ? `not detected — preamble buried under ${interferers} (SINR below 4 dB)`
          : 'not detected — preamble too weak against the noise (SINR below 4 dB)') :
        reason === 'capture' ? 'abandoned — re-synced to a stronger preamble' :
        reason === 'txDuringRx' ? 'abandoned — this radio started transmitting' :
        'corrupted — signal too weak against noise/interference',
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
      ampTrigger: 'AMP Trigger — the AP opens uplink slots for ambient-power tags',
      ampAck: (dst) => `AMP Ack → ${dst} — closes a slot and cues the next one`,
      ampResp: (slot) => `AMP response in slot ${slot}`,
      ampWait: 'waiting for its slot',
      ampWaitNote: 'A tag has no carrier sense: it counts the AP’s Acks and transmits one AMP SIFS (10 µs) after the Ack that opens its slot.',
      uwbPoll: (n) => `UWB Poll — the tag opens a ranging round over ${n} anchors`,
      uwbResp: (slot) => `UWB Response in ranging slot ${slot}`,
      uwbFinal: 'UWB Final — the tag broadcasts the times it measured (DS-TWR)',
      uwbReport: (dst) => `UWB measurement report → ${dst}`,
      uwbRate: (mbps) => `${mbps} Mbps BPRF · HRP UWB (SP1 PPDU)`,
      uwbWait: 'holding a ranging slot',
      uwbWaitNote: 'A UWB device never contends: the round’s schedule already says whose slot this is, so the receiver simply stays armed until the slot’s deadline.',
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
      { color: '#fb7185', label: 'CF-End', hint: 'TXOP 截断：持有者释放不再需要的预约；终端发出的 CF-End 由 AP 重复一遍。' },
      { color: '#f59e0b', label: '退避', hint: '随机退避倒数：每个空闲 9 µs 时隙减 1；介质忙时冻结。' },
      { color: '#6d5a1b', label: '等待', hint: '等待 DIFS/AIFS/EIFS 静默期，或等待介质变为空闲。' },
      { color: '#06b6d4', label: '交换等待', hint: '帧交换过程中的停顿：SIFS 周转或等待响应（ACK/CTS）——并非在竞争信道。' },
      { color: '#9333ea', label: 'NAV', hint: '虚拟载波侦听：被侦听到的 Duration 字段预约了介质。' },
      { color: '#8b5cf6', label: '接收', hint: '正在接收帧。' },
      { color: '#ef4444', label: '接收失败', hint: '打斜线：未能解码的接收，之后接收方要等一个 EIFS。红色表示被碰撞损坏——接收机只会锁定一个前导码，重叠的帧表现为一次失败的接收；紫色表示信号本身太弱，通常是旁听者听不懂一个高速率的帧。' },
      { color: '#ef4444', label: '碰撞', hint: '两个以上的传输重叠，导致接收失败。' },
      { color: '#2dd4bf', label: 'AMP 下行', hint: 'AMP 触发帧或 AMP 确认帧：2.4 GHz 上带传统前导码的 OOK PPDU，发给环境能量标签。' },
      { color: '#a78bfa', label: 'AMP 上行', hint: '标签在其抽中的时隙内发出的 OOK 应答；没有 Wi-Fi 电台能看到的前导码。' },
      { color: '#115e59', label: '等候时隙', hint: '一枚标签正等待稍后的时隙，数着 AP 发出的 Ack。' },
      { color: '#f59e0b', label: 'UWB 标签', hint: '测距标签自己发出的帧——开启一轮的轮询帧，以及 DS-TWR 下收尾的终结帧。' },
      { color: '#fbbf24', label: 'UWB 锚点', hint: '锚点在自己测距时隙内的回答：响应帧，以及 DS-TWR 下的测量报告帧。' },
    ],
    editor: {
      tools: { select: '☝ 选择', room: '▭ 房间', door: '🚪 门', window: '🪟 窗', ap: '📡 AP', sta: '📱 终端', tag: '🏷 AMP 标签', anchor: '📍 UWB 锚点', uwbTag: '📱 UWB 标签', fit: '⌂ 复位' },
      apExists: '场景中已经有 AP 了——Wi-Fi 有且仅允许一个',
      needApFirst: '请先放置一个 AP：终端和 AMP 标签都需要 AP（只有纯 UWB 场景才可以没有）',
      scenario: '场景', save: '💾 保存', load: '📂 载入', export_: '⬇ 导出', import_: '⬆ 导入',
      spawn: '🎲 随机生成终端', rts: 'RTS', rtsHint: 'dot11RTSThreshold：大于该门限的帧启用 RTS/CTS 保护',
      seed: '种子', seedHint: '随机种子 — 相同种子可完全复现同一次仿真',
      objects: '🗂 对象列表', properties: '⚙ 属性', guide: '📖 编辑器说明',
      nodesHeader: '节点（顺序 = 时间轴泳道）', rooms: '房间', walls: '墙体', noRooms: '暂无 — 用 ▭ 绘制一个',
      node: '节点', name: '名称', wifi: 'Wi-Fi', link: '频段',
      linkHint: '工作频段；802.11g 与 Wi-Fi 6/7 可用 2.4 GHz，Wi-Fi 6E/7 可用 6 GHz（MLO 设备使用 5 + 6 GHz）',
      bands: { '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz' },
      preset: '手机', presetPick: '选择机型…', presetHint: '真实机型（国行配置）：设置名称、Wi-Fi 代际、功能与典型业务，之后仍可随意修改。',
      brands: { huawei: '华为', xiaomi: '小米 / Redmi', honor: '荣耀', apple: '苹果' },
      mloCapableNote: '国行：6 GHz 关闭，而本模拟器只模拟 5 + 6 GHz 的 MLO。勾选上方 MLO 可模拟国际版。',
      servers: '云服务器', addServer: '+ 服务器', serverName: '名称', serverKind: '类型', serverRtt: '广域网 RTT',
      serverRttHint: 'AP 与该服务器之间经互联网的往返时延；每个方向各占一半',
      deleteServer: '🗑 删除服务器', streamServer: '服务器', households: '🏠 家庭场景', householdsPick: '载入一个家庭场景…',
      serverJitter: '广域网抖动', serverJitterHint: '每个报文的往返时延在 RTT 与 RTT + 抖动之间随机（每个方向各一半）',
      serverProcess: '处理时间', serverProcessHint: '服务器响应请求或回显 ping 所需的时间',
      p2pTarget: '发给', p2pTargetHint: '接收这路视频的手机；AP 收到每一帧后转发给它',
      tamper: '⚠ 篡改驱动', tamperHint: '该终端无视 AP 广播的 EDCA 参数。选择一种作弊方式，看看它给作弊者带来什么、让其他人付出什么。',
      tamperKinds: {
        none: '合规', custom: '自定义',
        escalate: '优先级提升——所有帧都按 AC_VO 发送',
        aifs: 'AIFS 压底——所有类别 AIFSN 取 1',
        cw: '竞争窗口坍缩——不做随机退避（CW 0）',
        noDouble: '不加倍——碰撞后 CW 从不增大',
        txopHog: 'TXOP 霸占——每次接入占用信道 8 ms',
        navInflate: 'NAV 虚报——Duration 字段多报 3 ms',
        greedy: '贪婪——以上全部（经典作弊）',
      },
      gameAccel: '🎮 游戏加速', gameAccelHint: '路由器游戏模式：把游戏流量标记进 AC_VI。关闭时游戏报文没有 DSCP 标记，和其他流量一样按尽力而为（AC_BE）竞争。',
      traffic: '业务', txPower: '发射功率', height: '高度',
      txopProt: 'TXOP 保护',
      txopProtHint: '本节点持有多次交换的突发时如何预告：逐次交换的 Duration（单次）；用 RTS/CTS 把介质预约到 TXOP 结束、提前结束时以 CF-End 归还（边界）；或在此基础上让每个数据帧也携带 TXOP 剩余时间（多重）。',
      txopProtNames: { single: '单次（逐次交换）', boundary: '边界（RTS/CTS 预约整个突发 + CF-End）', multiple: '多重（每帧携带剩余时间）' },
      deleteNode: '🗑 删除节点', deleteRoom: '🗑 删除房间', delete_: '删除',
      apNoDelete: '只有当场景中不再有终端和 AMP 标签时才能删除 AP——纯 UWB 场景不需要 BSS',
      wall: '墙体', material: '材质', materialHint: '射频衰减：石膏板 5 dB · 砖墙 12 dB · 玻璃 3 dB（每次穿越）',
      removeOpenings: '移除门窗开口', room: '房间', openings: '个开口',
      emptyHint: '未选中任何对象。点击画布上（或上方对象列表中）的节点、墙体或房间即可在此编辑其属性。场景的保存/载入与设置位于画布顶部的菜单栏。',
      saved: '已保存', loaded: '已载入', imported: '已导入', nothingSaved: '尚无存档',
      scaleBarHint: '网格 1 米（粗线 5 米）· 滚轮缩放 · 中键/右键拖动平移',
      amp: 'AMP 轮询（802.11bp）', ampEnable: '轮询环境功率标签',
      ampInterval: '轮询间隔', ampIntervalHint: 'AP 为一轮 AMP 竞争（AC_BK）信道的频度',
      ampSlots: '时隙数 (N)', ampSlotsHint: '触发帧每轮打开的上行时隙数量',
      ampAcwe: 'ACWE', ampAcweHint: 'ACW = 2^ACWE − 1：标签抽取时隙计数器的取值范围',
      ampDl: '下行速率', ampDlHint: 'AMP 触发帧与 AMP 确认帧使用的数据速率',
      ampUl: '上行速率', ampUlHint: '触发帧为标签的上行应答指定的数据速率',
      ampProt: { ctsSelf: '轮询前先发 CTS-to-self', none: '不做保护' }, ampProtLabel: '保护',
      ampRead: { inline: '在随机接入应答中直接读取', twoPhase: '先读 id，再做一次预约读取' }, ampReadLabel: '读取方式',
      ampNeedsEht: 'AMP 轮询需要 Wi-Fi 7 的 AP（AMP 下行 PPDU 携带 U-SIG）',
      ampSens: '下行灵敏度', ampSensHint: '该标签包络检波器能解出的最弱 AMP 下行 PPDU（模型默认 −72 dBm）',
      uwbNode: 'UWB 测距（802.15.4-2024）', uwbRole: '角色', uwbRoles: { anchor: '锚点（位置固定，负责应答）', tag: '标签（测距并解算自身位置）' },
      uwbPpm: '晶振偏差', uwbPpmHint: '该设备测距时钟的频率偏差，单位 ppm；标准允许 ±20 ppm。留空则由本次仿真按随机种子抽取。',
      uwbPpmDrawn: '由种子抽取', uwbPpmRange: '±100 ppm；真实晶振通常在 ±20 以内',
      uwbSession: 'UWB 测距会话', uwbCounts: (a, t) => `${a} 个锚点 · ${t} 个标签`,
      uwbNoNodes: '当前没有任何测距设备使用该会话',
      uwbRemoveSession: '🗑 删除测距会话', uwbRemoveSessionHint: '删除 scenario.uwb——导入的文件里可能带着一个没有任何设备参与的会话',
      uwbSessionInUse: '场景中还有 UWB 设备时不能删除该会话；请先删除这些设备',
      uwbMethod: '测距方式', uwbMethodHint: 'SS-TWR（单边双向测距）：每个锚点只需一次轮询与一次响应，帧数减半，但两台设备之间的时钟偏差会原样进入测距结果。DS-TWR 增加终结帧与报告帧，可将其抵消。',
      uwbMethods: { ss: 'SS-TWR（单边双向）', ds: 'DS-TWR（双边双向）' },
      uwbBlock: '测距块', uwbBlockHint: '测距块循环往复；每个标签在块内独占一个轮次，因此块长决定了标签多久刷新一次位置',
      uwbSlot: '测距时隙', uwbSlotHint: '一个测距时隙只装一帧；它必须容得下该轮次中最长的一帧（DS-TWR 的终结帧，长度随锚点数增长）以及其飞行时间',
      uwbChannel: '信道', uwbChannelHint: '信道 5 为 6489.6 MHz，信道 9 为 7987.2 MHz。两者只有 1 米处的自由空间损耗不同（48.7 dB 对 50.5 dB），因此信道 9 在任何距离上都恒定多损耗约 1.8 dB。',
      uwbTsNoise: '时间戳噪声', uwbTsNoiseHint: '接收时间戳误差的 1-σ 值；100 ps 的计时误差折合 3 cm 的飞行距离，经双向测距公式折算后是 2.1 cm 的测距误差',
      uwbCfoNoise: '时钟估计噪声', uwbCfoNoiseHint: '接收机估计载波频偏后残留误差的 1-σ 值；这正是 SS-TWR 无法抵消的那一部分',
      uwbNlos: 'NLOS 穿墙时延', uwbNlosHint: '把射线穿过的每一堵墙的附加时延计入飞行时间（石膏板 0.5 ns、砖墙 2 ns、玻璃 0.2 ns）。墙只会让测距结果偏大，不会偏小。',
      uwbPlan: (slots, rounds) => `每轮 ${slots} 个时隙 · 每块 ${rounds} 轮`,
    },
    inspector: {
      waiting: '等待仿真…', bssTotals: 'BSS 总览 — 点击节点或泳道查看详情',
      throughput: '吞吐量', delivered: '已交付', collisions: '碰撞次数', retries: '重传次数',
      node: '节点', ok: '成功', rty: '重传', airtime: '空口占比',
      lat: '时延', latHint: '该节点所发帧的平均交付时延：进入队列 → 被确认',
      width: '信道带宽', nss: '空间流',
      linkName: { '2g': '2.4 GHz 链路', '5g': '5 GHz 链路', '6g': '6 GHz 链路' },
      acHeader: { ac: 'AC', bo: '退避', cw: 'CW', queue: '队列' },
      acHint: 'EDCA 接入类别（BK=后台，BE=尽力而为，VI=视频，VO=语音）',
      boHint: '当前退避时隙计数', cwHint: '竞争窗口：退避值从 [0, CW] 均匀抽取',
      queueHint: '该接入类别队列中的帧数——正在发送的帧在收到 ACK 之前仍计入队列',
      backoffCounter: '退避计数器', cw: 'CW', ssrcSlrc: 'QSRC',
      ssrcHint: '最近一次失败的接入类别的重传计数器（802.11-2020）。每次失败使 CW 翻倍，成功后清零；另外每个帧单独计数重传次数，重传 7 次后丢弃。',
      nav: 'NAV', navHint: '网络分配矢量：来自侦听到的 Duration 字段的虚拟载波侦听',
      navIdle: '空闲', left: '剩余',
      ifs: 'IFS', ifsHint: '正在进行的帧间间隔：DIFS/AIFS（竞争）或 EIFS（收到损坏帧之后）',
      cca: 'CCA', ccaHint: '物理载波侦听：能量 ≥ −62 dBm 或可解码前导 ≥ −82 dBm',
      busy: '忙', idle: '空闲',
      txop: 'TXOP', txopHint: '传输机会：无需重新竞争、以 SIFS 相连的连续帧交换，上限为该 AC 的 TXOP 限值',
      transmitting: '发送中', receiving: '接收中', queue: '队列', old: '前', more: '更多',
      inFlight: '已发出',
      stats: '统计', framesDelivered: '成功交付帧数', retriesDrops: '重传 / 丢弃', collisionsL: '碰撞',
      airtimeShare: '空口占比', rxThroughput: '接收吞吐量',
      txLatency: '发送时延', txLatencyHint: '帧进入本节点队列到收到 ACK/BlockAck 的平均 / 最大时间——包含排队、AIFS、退避与全部重传；被丢弃的帧不计',
      rxLatency: '接收时延', rxLatencyHint: '发往本节点的帧的平均 / 最大交付时延，从发送方的队列开始计时',
      appRtt: 'RTT（ping）', appRttHint: '本终端向云服务器发送的 ping 的平均 / 最大往返时延：每秒 4 次、走该业务的接入类别、服务器即时回显——Wi-Fi 上行、广域网、Wi-Fi 下行，即游戏里显示的 ping 值',
      relayLatency: '手机互传', relayLatencyHint: '另一部手机发给本机的视频帧的平均 / 最大时延：发送方队列 → AP → 本机，两跳 Wi-Fi 加 AP 转发',
      servers: '云服务器', serverCols: { server: '服务器', kind: '类型', rtt: '广域网 RTT', up: '上行', down: '下行' },
      ampTag: 'AMP 标签', aboc: 'ABOC',
      abocHint: 'AMP 退避计数器：每次随机接入触发时从 [0, ACW] 均匀抽取；ABOC < N 则选中时隙 ABOC + 1',
      slot: '时隙', slotHint: '该标签在本轮将使用的上行时隙',
      ampCounts: '发送 / 已确认 / 丢失',
      ampCountsHint: '已发送的应答数、被随后的 AMP Ack 确认的数量，以及丢失的数量（碰撞、信号弱或错过时机）',
      ampRound: 'AMP 轮次', ampRoundHint: '该链路上正在进行的轮询轮次，以及目前已应答的标签',
      ampPhase: { random: '随机接入', scheduled: '调度' },
      satOut: '弃权 / 已听到',
    },
    uwb: {
      anchor: '锚点', tag: '标签', role: '角色',
      blockRound: '测距块 / 轮次', slot: '测距时隙', timeouts: '超时时隙',
      ranges: '测距结果', peer: '对端', measured: '实测', trueDist: '真值', error: '误差',
      fom: '置信度', rounds: '轮次',
      fomWithin: (pct, ns) => `${pct} % 的误差落在 ${ns} ns 内`, noFom: '无 FoM',
      position: '位置解算', estimate: '估计值', gdop: '几何精度因子 GDOP', ellipse: '误差椭圆（1-σ）',
      noPosition: '尚无定位结果——标签需要在同一测距块内拿到三个锚点的距离',
    },
    log: { empty: '窗口内无事件' },
    profiles: {
      video: '视频流（下行，AC_VI）', voice: '语音通话（双向，AC_VO）', gaming: '在线游戏（实测王者荣耀：上行约 33 帧/s，下行 15 Hz）', p2pvideo: '向另一部手机传视频（经 AP，AC_VI）', backup: '云备份（上行，AC_BK）',
      browsing: '网页浏览（AC_BE）', iot: '物联网传感器（AC_BK）', saturated: '饱和上传（AC_BE）', idle: '空闲',
    },
    appShort: { video: '视频', voice: '通话', gaming: '游戏', p2pvideo: '投送', backup: '备份', browsing: '网页', iot: '传感', saturated: '上传', idle: '' },
    serverKinds: { video: '视频（流媒体）', web: '网页 / 云', call: '通话', game: '游戏' },
    generations: {
      nonht: '802.11a（传统）', vht: 'Wi-Fi 5 (VHT)', he: 'Wi-Fi 6 (HE)', eht: 'Wi-Fi 7 (EHT)',
    },
    features: {
      edca: 'EDCA（QoS 接入类别）', ampdu: 'A-MPDU 聚合 + BlockAck', txop: 'TXOP 突发',
      ofdma: 'OFDMA（多用户调度）', mumimo: 'MU-MIMO（空分多用户）', mlo: '多链路操作 (MLO)', qam4k: '4096-QAM (MCS 12/13)',
    },
    frameDetail: {
      title: '📨 帧详情',
      close: '返回节点视图',
      clickedRx: (lane) => `你点击的是接收方——泳道「${lane}」正在收听这帧，同一时刻发送方正在发出它。`,
      kindName: {
        data: '数据帧', ack: 'ACK — 确认帧', rts: 'RTS — 请求发送',
        cts: 'CTS — 允许发送', ba: 'BlockAck — 块确认',
        trigger: 'Trigger — 触发帧', mba: '多站点 BlockAck', cfend: 'CF-End — 提前结束',
        ampTrigger: 'AMP 触发帧', ampAck: 'AMP 确认帧', ampResp: 'AMP 应答帧',
        uwbPoll: 'UWB 轮询帧', uwbResp: 'UWB 响应帧', uwbFinal: 'UWB 终结帧', uwbReport: 'UWB 测量报告帧',
      },
      whatIs: {
        cfend: 'TXOP 持有者把时间还回去。它的 RTS/CTS 已把信道预约到 TXOP 结束，但突发提前发完了，于是用这一帧告诉所有解出它的站点：现在就可以撤销那段预约。若发送者是终端，AP 会在一个 SIFS 后重复一遍，让小区另一侧也听到释放。',
        data: '真正运载数据的帧——你的视频、网页、备份等字节就装在里面通过空口传输。时间轴上的其它一切，都是为了让这样的帧安全送达。',
        ack: '一张小小的回执。Wi-Fi 电台发送时无法同时收听，自己永远不知道帧有没有送到——必须由接收方用这条简短的「收到，完好」来确认。收不到 ACK，发送方就认定丢失并重传。',
        rts: '在长数据帧之前先发的一句「我能讲话吗？」。它很短，即使碰撞也只损失这几个字节；而且它的 Duration 字段能让离数据发送方太远、听不到它的站点（隐藏节点）也保持安静。',
        cts: '「可以，请讲」——对 RTS 的回答。它从接收方一侧把预约再广播一遍，让接收方附近的站点也知道要保持安静。',
        ba: '整批数据的一张回执：接收方不再逐帧回 ACK，而是返回一张位图，标明 A-MPDU 聚合中哪些子帧收到了。只有缺失的子帧才需要重发。',
        trigger: 'AP 扮演指挥家（Wi-Fi 6 OFDMA）：把信道切成若干频率子块（资源单元 RU），邀请多个终端在同一时刻各自在自己的子块里发送。',
        mba: '发给多个站点的一张合并回执：一轮同时进行的 OFDMA 上行结束后，AP 用这一帧统一确认所有终端的数据。',
        ampTrigger: 'AP 按 P802.11bp 草案发送的环境能量触发帧：以慢速通断键控（OOK）PPDU 划出 N 个上行时隙，并规定标签如何从中选定一个——随机竞争还是按预定顺序。无电池的标签没有普通 Wi-Fi 接收机，正是这一帧才让一轮能够开始。',
        ampAck: 'AP 对某个 AMP 上行时隙的确认帧：同样由 AP 正常供电发出的 OOK PPDU，用来关闭它所确认的、由标签以收集到的能量主动发射作答的那个时隙。按照 P802.11bp 草案，没有自己时钟的标签靠数这些确认帧来判断时隙何时打开，因此每一帧同时也在提示下一个时隙。',
        ampResp: '标签在自己 AMP 上行时隙里的应答，用从 AP 载波上收集到的能量发送，而不是电池供电。按照 P802.11bp 草案，这一帧尽量精简——只有 ID，以及触发帧要求时才附带的一次传感器读数——这样收集到的能量刚好够发完。',
        uwbPoll: '标签用它开启一轮测距：一帧广播的 UWB 帧，列出参与的锚点及其时隙顺序。它的发送时刻由标签自己的测距计数器读出，是后续所有距离计算的第一个时间戳。',
        uwbResp: '某一个锚点在它自己的测距时隙里的回答。在 SS-TWR 下，它还会带上锚点测得的回复时间，标签靠它才能从往返时间里减去锚点的处理时延。',
        uwbFinal: '标签在 DS-TWR 一轮末尾发出的帧：广播它测得的往返时间和回复时间，让每个锚点能把它们与自己的一对时间合并，把两边时钟的偏差一起抵消掉。',
        uwbReport: '锚点的测量报告：其中是只有它自己能测到的那两个时间。它们和终结帧里的数字合在一起，恰好凑齐该锚点的 DS-TWR 四时间戳等式。',
      },
      next: {
        cfend: '所有解出它的站点都会清零 NAV，安静一个 DIFS/AIFS 后即可重新竞争。听不到它的站点则要一直等到自己听到的那段预约自然结束。',
        data: '若完好到达，接收方会在恰好一个 SIFS（16 µs——Wi-Fi 里最短的间隔，短到没人能插队）之后回 ACK 或 BlockAck。若无回音，发送方超时后把竞争窗口翻倍并重传。',
        ack: '这次帧交换到此完成。被 Duration 字段压制的站点解除 NAV 计时器，等待一个 DIFS/AIFS 的安静期后继续退避倒数——信道争夺重新开始。',
        rts: '被叫站点会在一个 SIFS 后回复 CTS。若 CTS 没来，损失的只是这短短一帧，发送方可以低成本重试。',
        cts: '数据帧将在一个 SIFS 后发出，在 RTS/CTS 刚刚预约好的安静窗口内传输。',
        ba: '位图中标记缺失的子帧被发送方重新入队；确认过的就算送达。之后信道竞争恢复。',
        trigger: '一个 SIFS 之后，所有被邀请的终端同时发送，各自在自己的 RU 内、严格按分配的时长进行；随后 AP 用多站点 BlockAck 统一确认。',
        mba: '这轮上行 OFDMA 到此结束；各终端把未被确认的数据重新入队，正常竞争恢复。',
        ampTrigger: '选中某个时隙的标签会在该时隙内用 AMP 应答帧作答；AP 依次确认每一个时隙，无论该时隙是否真的有标签应答。P802.11bp 草案正是靠这种「先应答、后确认」的节奏来化解竞争——标签根本不具备载波侦听能力。',
        ampAck: '轮次会被这一帧本身提示进入下一个时隙，或者在所有时隙都被应答并确认后结束。按照 P802.11bp 草案，标签没有自己的时钟，只能靠数这些确认帧来判断该在什么时候发送。',
        ampResp: '一个 SIFS 之后，AP 会为这个时隙发送一个确认帧，无论该时隙里是否真的有标签应答——沉默也是一种结果。P802.11bp 草案对触发帧打开的每个时隙都重复这一过程，之后要么结束这一轮，要么由 AP 开启新一轮。',
        uwbPoll: '各个锚点按轮询帧分配的测距时隙依次作答。某个时隙如果一直沉默，就是一次超时：该锚点这一轮不贡献距离。',
        uwbResp: '在 SS-TWR 下，标签此时已经拿齐所需的一切，可以直接算出距离。在 DS-TWR 下，它会等所有锚点答完，再发出终结帧。',
        uwbFinal: '每个听到它的锚点都会在自己的时隙里回一帧测量报告；标签随即就每个锚点都集齐了四个时间戳，可以换算成距离。',
        uwbReport: '标签就该锚点完成 DS-TWR 计算。当足够多的锚点都报告完毕，它就解出自己的位置，这一轮结束；下一轮在下一个测距块开始。',
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
      muHint: (kind) => kind === 'mumimo'
        ? 'MU-MIMO 让所有终端在同一时刻、相同频率、以完整带宽发送；下表每一行是一个终端的空间流——靠空间而不是频率子块来区分。'
        : 'OFDMA 把信道切成更小的频率子块（资源单元 RU）；下表每一行是一个终端的子块，全部同时传输。',
      muTo: '终端', muSize: '字节', muRate: '速率',
      ruNote: (kind) => kind === 'mumimo'
        ? '空分复用：与同组其它帧在同一时刻、相同频率、以完整带宽发送而互不干扰——它们占用不同的空间流。'
        : 'RU 正交：与同组其它帧同时发送而互不干扰——它们占用不同的频率子块。',
      fields: {
        title: '空口字段', hint: '逐字段的 MAC 头，以及 PPDU 如何分配它的空口时间',
        mpdu: (ty, sub, b) => `${sub}（${ty === 'Data' ? '数据帧' : ty === 'Ranging' ? '测距帧' : '控制帧'}）· ${b} B`,
        forUser: (dst) => `发往 ${dst} 的 PSDU`,
        subframes: (n) => `A-MPDU：${n} 个子帧`,
        firstShown: '第一个 MPDU 的字段：',
        subframeRow: (i, d, m, p) => `#${i + 1}：定界符 ${d} + MPDU ${m}${p ? ` + 填充 ${p}` : ''} B`,
        name: {
          fc: '帧控制（Frame Control）', duration: '持续时间（Duration）', addr1: '地址 1', addr2: '地址 2', addr3: '地址 3',
          seqCtl: '序列控制', qos: 'QoS 控制', body: '帧体（MSDU）', baControl: 'BA 控制',
          baInfo: 'BA 信息', commonInfo: '公共信息', userInfo: '用户信息列表', fcs: 'FCS 校验',
          ampId: 'ID（16 位 AMP 标识符）', ampTdc: '类型相关控制（TDC）', ampStaList: '终端 ID 列表',
          seqNo: '序列号', dstPan: '目的 PAN ID',
          dstAddr16: '目的地址（16 位）', srcAddr16: '源地址（16 位）',
          ieArc: 'ARC 信息元·高级测距控制', ieRdm: 'RDM 信息元·测距设备管理',
          ieRrmc: 'RRMC 信息元·测距轮次管理控制',
          ieRrti: 'RRTI 信息元·测距回复时间',
          ieRmi: 'RMI 信息元·测距测量信息',
        },
        bit: {
          protocolVersion: '协议版本', type: '类型', subtype: '子类型', toDs: 'To DS', fromDs: 'From DS',
          moreFrag: '更多分片', retry: '重传', pwrMgt: '电源管理', moreData: '更多数据',
          protected: '加密', htc: '+HTC',
        },
        role: { RA: '接收端', TA: '发送端', DA: '目的地址', SA: '源地址', BSSID: 'BSSID' },
        broadcast: '广播',
        ppdu: 'PPDU 结构', ppduHint: '先是前导码和 PHY 头，然后是承载 PSDU 的数据符号',
        segment: {
          legacyPreamble: 'STF + LTF', signal: 'SIGNAL', preamble: '前导码', muSig: 'SIG-B / EHT-SIG',
          data: '数据', padding: '填充 / PE',
          usig: 'RL-SIG + U-SIG（12 µs）', ampSync: 'AMP-Sync（OOK 码片）', ampSig: 'AMP-SIG（2 字节）',
          ampData: 'AMP-Data（曼彻斯特 OOK）', signalExt: '信号扩展（6 µs）',
          sync: 'SYNC（64 个前导符号）', sfd: 'SFD（帧起始定界符）', stsGap: 'STS 间隔',
          sts: 'STS（加扰时间戳序列）', phr: 'PHR（PHY 帧头）', psdu: 'PSDU（测距负载）',
        },
        symbols: (n, u) => `${n} 个符号 × ${u} µs`,
        rmarker: (us) => `RMARKER 位于 ${us} µs——所有测距时间戳都在这一点读取，而不是帧的起点`,
      },
    },
    widgets: {
      txPower: '发射功率', distance: '距离', walls: '中间的墙', width: '信道带宽', mode: 'PHY',
      wallName: { drywall: '石膏板', brick: '砖墙', glass: '玻璃' },
      pathLoss: '路径损耗', wallLoss: '穿墙损耗', rssi: '接收功率（RSSI）', noise: '底噪', snr: '信噪比 SNR',
      bestMcs: '可用的最高 MCS', required: '需要', margin: (db) => `所需 SINR + ${db} dB 余量`,
      ladderSnr: '你的 SNR', mcs: 'MCS', rate: 'Mbps（20 MHz，单流）', reqSinr: '所需 SINR', sens: '灵敏度',
      usable: (n) => `可用 ${n} 个 MCS（含速率余量）`,
    },
    tooltips: {
      transmitting: '发送中',
      dlMu: (n, kind) => kind === 'mumimo'
        ? `下行 MU-MIMO PPDU → ${n} 个终端（同频率，空间分割）`
        : `下行 MU PPDU → ${n} 个终端（OFDMA）`,
      ampdu: (n, dst) => `A-MPDU 聚合（${n} 个 MPDU）→ ${dst}`,
      data: (dst) => `数据帧 → ${dst}`,
      ack: (dst) => `ACK 确认 → ${dst}`,
      ba: (dst) => `BlockAck 块确认 → ${dst}`,
      mba: '多站点 BlockAck（OFDMA）',
      trigger: '触发帧 — 调度上行 OFDMA',
      rts: (dst) => `RTS → ${dst}（预约介质）`,
      cts: (dst) => `CTS → ${dst}`,
      cfend: 'CF-End（提前释放 TXOP 预约）',
      nonHt: '非 HT',
      sifsNote: '在帧结束后一个 SIFS（16 µs）发出 — 响应帧从不参与竞争',
      retryNote: '重传（Retry 位已置 1）',
      ruNote: (kind) => kind === 'mumimo'
        ? 'MU-MIMO：与同组同时传输，相同频率，不同空间流'
        : 'RU 正交：与同组的其他帧同时传输',
      receiving: (kind, from) => `正在接收来自 ${from} 的 ${kind}`,
      rxCorrupted: (reason, interferers) =>
        reason === 'collision' ? `已损坏——与 ${interferers} 发生碰撞` :
        reason === 'undetected' ? (interferers
          ? `未检测到——前导码被 ${interferers} 淹没（SINR 低于 4 dB）`
          : '未检测到——前导码相对噪声太弱（SINR 低于 4 dB）') :
        reason === 'capture' ? '已放弃——重新同步到更强的前导码' :
        reason === 'txDuringRx' ? '已放弃——本机开始发送' :
        '已损坏——信号相对噪声/干扰太弱',
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
      ampTrigger: 'AMP 触发帧 — AP 为环境能量标签开放上行时隙',
      ampAck: (dst) => `AMP 确认 → ${dst} — 关闭一个时隙并开启下一个`,
      ampResp: (slot) => `时隙 ${slot} 内的 AMP 应答`,
      ampWait: '等待自己的时隙',
      ampWaitNote: '标签没有载波侦听：它靠数 AP 发出的 Ack 来计时，并在打开自己时隙的那个 Ack 之后一个 AMP SIFS（10 µs）发送。',
      uwbPoll: (n) => `UWB 轮询帧——标签对 ${n} 个锚点开启一轮测距`,
      uwbResp: (slot) => `测距时隙 ${slot} 内的 UWB 响应帧`,
      uwbFinal: 'UWB 终结帧——标签广播它测得的时间（DS-TWR）',
      uwbReport: (dst) => `UWB 测量报告 → ${dst}`,
      uwbRate: (mbps) => `${mbps} Mbps BPRF · HRP UWB（SP1 PPDU）`,
      uwbWait: '持有一个测距时隙',
      uwbWaitNote: 'UWB 设备从不参与竞争：本轮的调度表已经规定了这个时隙属于谁，接收机只需保持开启到时隙截止。',
    },
  },
}

import { useUi } from './store'

/** Current-language string table (re-renders on language change). */
export function useStrings(): Strings {
  return STRINGS[useUi((s) => s.lang)]
}
