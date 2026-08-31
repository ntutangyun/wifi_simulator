/**
 * Quick-reference glossary: every term, abbreviation and constant the UI, the
 * timeline and the course use. Values are the ones the engine actually runs
 * (IEEE Std 802.11-2024 defaults for the OFDM PHY, 20 MHz, Nss 1).
 */
export interface Bi {
  en: string
  zh: string
}

export interface GlossaryItem {
  /** Headword — kept in its standard (English/abbreviated) form in both languages. */
  term: string
  /** Expansion / localized name shown next to the headword. */
  alt: Bi
  def: Bi
}

export interface GlossaryGroup {
  id: string
  title: Bi
  items: GlossaryItem[]
}

export const GLOSSARY: GlossaryGroup[] = [
  {
    id: 'access',
    title: { en: 'Channel access', zh: '信道接入' },
    items: [
      {
        term: 'CSMA/CA',
        alt: { en: 'carrier sense multiple access with collision avoidance', zh: '载波侦听多路访问 / 冲突避免' },
        def: {
          en: 'The rule every Wi-Fi radio follows: listen first, wait a quiet interframe gap, count down a random backoff, then transmit. There is no scheduler on the medium.',
          zh: '所有 Wi-Fi 设备遵循的规则：先听信道，等待一个静默的帧间间隔，再随机退避倒数，然后发送。介质上没有统一调度器。',
        },
      },
      {
        term: 'DCF',
        alt: { en: 'distributed coordination function', zh: '分布式协调功能' },
        def: {
          en: 'The baseline access method: one queue per station, DIFS + random backoff, DATA/ACK. What 802.11a devices use in this simulator.',
          zh: '基本接入方式：每站一个队列，DIFS + 随机退避，DATA/ACK。本仿真器中 802.11a 设备使用它。',
        },
      },
      {
        term: 'EDCA',
        alt: { en: 'enhanced distributed channel access', zh: '增强型分布式信道接入' },
        def: {
          en: 'QoS access (Wi-Fi 5+): four independent contenders per device, one per access category, each with its own AIFS, CW and TXOP limit.',
          zh: 'QoS 接入方式（Wi-Fi 5 起）：每台设备有四个独立竞争实体，每个接入类别一个，各自拥有 AIFS、CW 与 TXOP 限值。',
        },
      },
      {
        term: 'AC',
        alt: { en: 'access category — BK / BE / VI / VO', zh: '接入类别 — 后台 / 尽力而为 / 视频 / 语音' },
        def: {
          en: 'Traffic class deciding contention parameters. VO: AIFSN 2, CW 3–7. VI: AIFSN 2, CW 7–15. BE: AIFSN 3, CW 15–1023. BK: AIFSN 7, CW 15–1023.',
          zh: '决定竞争参数的业务类别。VO：AIFSN 2、CW 3–7；VI：AIFSN 2、CW 7–15；BE：AIFSN 3、CW 15–1023；BK：AIFSN 7、CW 15–1023。',
        },
      },
      {
        term: 'Backoff',
        alt: { en: 'random backoff counter', zh: '随机退避计数器' },
        def: {
          en: 'A counter drawn uniformly from [0, CW]; it decrements once per idle 9 µs slot and freezes while the medium is busy. The station transmits at 0.',
          zh: '从 [0, CW] 均匀抽取的计数器；每过一个 9 µs 空闲时隙减 1，介质忙时冻结。计数到 0 即发送。',
        },
      },
      {
        term: 'CW',
        alt: { en: 'contention window', zh: '竞争窗口' },
        def: {
          en: 'Upper bound of the backoff draw. Doubles on every failed attempt (15→31→…→1023) and resets to CWmin on success — binary exponential backoff.',
          zh: '退避抽取的上界。每次失败后翻倍（15→31→…→1023），成功后复位到 CWmin —— 即二进制指数退避。',
        },
      },
      {
        term: 'Slot',
        alt: { en: 'aSlotTime = 9 µs', zh: '时隙 aSlotTime = 9 µs' },
        def: {
          en: 'The quantum of contention: one backoff decrement, and the granularity at which two stations can pick the same instant and collide.',
          zh: '竞争的时间量子：一次退避减 1 的长度，也是两个终端可能选中同一时刻而碰撞的粒度。',
        },
      },
      {
        term: 'Internal collision',
        alt: { en: 'within one device', zh: '内部碰撞（设备内部）' },
        def: {
          en: 'Two ACs of the same device reach backoff 0 in the same slot. The higher AC transmits; the loser treats it as a failure and doubles its CW.',
          zh: '同一设备的两个 AC 在同一时隙退避到 0。高优先级 AC 发送，失败方视为一次失败并将 CW 翻倍。',
        },
      },
      {
        term: 'TXOP',
        alt: { en: 'transmit opportunity', zh: '传输机会' },
        def: {
          en: 'A bounded time slice won by one contention: VI 4.096 ms, BE/BK 2.528 ms, VO 2.08 ms. Inside it, frames are chained a SIFS apart with no re-contention.',
          zh: '一次竞争赢得的有上限时间段：VI 4.096 ms、BE/BK 2.528 ms、VO 2.08 ms。其内部各帧以 SIFS 相连，无需重新竞争。',
        },
      },
      {
        term: 'NAV',
        alt: { en: 'network allocation vector', zh: '网络分配矢量' },
        def: {
          en: 'Virtual carrier sense: a countdown loaded from the Duration field of any overheard frame. While NAV > 0 the medium counts as busy even if the air is silent.',
          zh: '虚拟载波侦听：由侦听到的任意帧的 Duration 字段装载的倒计时。NAV > 0 时，即使空口安静也视介质为忙。',
        },
      },
      {
        term: 'CCA',
        alt: { en: 'clear channel assessment', zh: '空闲信道评估' },
        def: {
          en: 'Physical carrier sense. Busy if a decodable preamble arrives ≥ −82 dBm, or total energy ≥ −62 dBm. The 20 dB gap creates hidden and exposed nodes.',
          zh: '物理载波侦听。收到 ≥ −82 dBm 的可解码前导，或总能量 ≥ −62 dBm 即判为忙。这 20 dB 的差距造就了隐藏节点与暴露节点。',
        },
      },
      {
        term: 'Hidden node',
        alt: { en: 'mutually inaudible senders', zh: '隐藏节点' },
        def: {
          en: 'Two stations that both reach the AP but cannot sense each other (a wall between them). They transmit over each other; only the AP sees the collision.',
          zh: '两个终端都能连上 AP，却互相侦听不到（中间有墙）。它们会互相覆盖发送，只有 AP 看得到这次碰撞。',
        },
      },
      {
        term: 'Exposed node',
        alt: { en: 'needlessly deferring sender', zh: '暴露节点' },
        def: {
          en: 'A station that defers because it senses a transmission which would not actually have interfered at the intended receiver — lost airtime, no benefit.',
          zh: '因侦听到某个传输而退让的终端，但那个传输其实不会干扰它的目标接收者——白白浪费空口时间。',
        },
      },
      {
        term: 'Capture effect',
        alt: { en: 'SINR-based survival', zh: '捕获效应' },
        def: {
          en: 'When two frames overlap, a receiver can still decode the stronger one if its SINR clears the threshold for its rate. Collisions are not always fatal.',
          zh: '两帧重叠时，若较强帧的 SINR 超过其速率所需门限，接收机仍能解出它。碰撞并不总是致命的。',
        },
      },
    ],
  },
  {
    id: 'ifs',
    title: { en: 'Interframe spaces & timers', zh: '帧间间隔与定时器' },
    items: [
      {
        term: 'SIFS',
        alt: { en: 'short IFS = 16 µs', zh: '短帧间间隔 = 16 µs' },
        def: {
          en: 'The gap inside an exchange. An ACK follows its data frame after exactly one SIFS, so no contender (who must wait at least DIFS) can cut in.',
          zh: '帧交换内部的间隔。ACK 恰好在数据帧后一个 SIFS 发出，因此任何竞争者（至少要等 DIFS）都无法插入。',
        },
      },
      {
        term: 'DIFS',
        alt: { en: 'DCF IFS = SIFS + 2 slots = 34 µs', zh: 'DCF 帧间间隔 = SIFS + 2 时隙 = 34 µs' },
        def: {
          en: 'The idle period a DCF station must observe before it may run its backoff and contend.',
          zh: 'DCF 终端在运行退避、参与竞争之前必须观察到的空闲时间。',
        },
      },
      {
        term: 'AIFS',
        alt: { en: 'arbitration IFS = SIFS + AIFSN × slot', zh: '仲裁帧间间隔 = SIFS + AIFSN × 时隙' },
        def: {
          en: 'The per-AC version of DIFS. AIFSN 2 (VO/VI) = 34 µs, 3 (BE) = 43 µs, 7 (BK) = 79 µs — priority expressed as waiting time.',
          zh: 'DIFS 的分接入类别版本。AIFSN 2（VO/VI）= 34 µs，3（BE）= 43 µs，7（BK）= 79 µs——用等待时间表达优先级。',
        },
      },
      {
        term: 'EIFS',
        alt: { en: 'extended IFS = 94 µs', zh: '扩展帧间间隔 = 94 µs' },
        def: {
          en: 'Used instead of DIFS after receiving a corrupted frame: the station must assume an ACK it could not decode is on the air, and stays out of the way.',
          zh: '收到损坏帧后用它替代 DIFS：终端必须假设空中正有一个它解不出的 ACK，因而继续让路。',
        },
      },
      {
        term: 'ACK timeout',
        alt: { en: 'SIFS + slot + RxStartDelay = 45 µs', zh: 'ACK 超时 = SIFS + 时隙 + 接收启动时延 = 45 µs' },
        def: {
          en: 'How long a sender waits for the ACK before declaring the attempt failed. CtsTimeout is identical. This delay is why collisions are detected late.',
          zh: '发送方在判定本次尝试失败前等待 ACK 的时长，CTS 超时与之相同。正因为有这段时延，碰撞总是被“事后”发现。',
        },
      },
    ],
  },
  {
    id: 'frames',
    title: { en: 'Frames & aggregation', zh: '帧与聚合' },
    items: [
      {
        term: 'MSDU / MPDU',
        alt: { en: 'payload / MAC frame', zh: '业务数据单元 / MAC 协议数据单元' },
        def: {
          en: 'An MSDU is the payload handed to the MAC; wrapping it in a 24-byte MAC header plus a 4-byte FCS makes an MPDU.',
          zh: 'MSDU 是交给 MAC 的净荷；加上 24 字节 MAC 头与 4 字节 FCS 后成为 MPDU。',
        },
      },
      {
        term: 'PSDU / PPDU',
        alt: { en: 'PHY payload / PHY frame on air', zh: 'PHY 净荷 / 空口上的 PHY 帧' },
        def: {
          en: 'The PSDU is what the PHY must carry (one MPDU or a whole A-MPDU); prefixing the preamble makes the PPDU — the blue/green block on the timeline.',
          zh: 'PSDU 是 PHY 需要承载的内容（一个 MPDU 或整个 A-MPDU）；加上前导即成 PPDU——时间轴上那些蓝色/绿色的块。',
        },
      },
      {
        term: 'Duration field',
        alt: { en: '2 bytes in every MAC header', zh: 'Duration 字段（每个 MAC 头中的 2 字节）' },
        def: {
          en: 'Announces how much longer the current exchange needs. Overhearers copy it into their NAV — the mechanism behind virtual carrier sense.',
          zh: '宣告当前帧交换还需要多久。侦听者把它装入自己的 NAV——这正是虚拟载波侦听的机制。',
        },
      },
      {
        term: 'ACK',
        alt: { en: 'acknowledgment, 14 bytes', zh: '确认帧，14 字节' },
        def: {
          en: 'Positive acknowledgment sent one SIFS after a correctly received frame. Its absence — not a detected collision — is what tells a sender it failed.',
          zh: '正确收到帧后一个 SIFS 发出的确认。发送方是靠“没等到 ACK”而不是靠检测碰撞来判断失败的。',
        },
      },
      {
        term: 'RTS / CTS',
        alt: { en: 'request / clear to send, 20 / 14 bytes', zh: '请求发送 / 允许发送，20 / 14 字节' },
        def: {
          en: 'A short handshake that reserves the medium by NAV before a long frame. Cures hidden nodes because the CTS is heard by the AP\'s whole neighbourhood.',
          zh: '在长帧之前用 NAV 预约介质的短握手。因为 CTS 能被 AP 周围所有人听到，所以能治好隐藏节点问题。',
        },
      },
      {
        term: 'RTS threshold',
        alt: { en: 'dot11RTSThreshold, in octets', zh: 'RTS 门限 dot11RTSThreshold（字节）' },
        def: {
          en: 'PSDUs larger than this are protected by RTS/CTS. Editor default 3000 B — effectively off for ordinary 1500 B frames.',
          zh: '大于该门限的 PSDU 会启用 RTS/CTS 保护。编辑器默认 3000 B——对常见的 1500 B 帧相当于关闭。',
        },
      },
      {
        term: 'A-MPDU',
        alt: { en: 'aggregated MPDU', zh: 'MPDU 聚合' },
        def: {
          en: 'Up to 64 MPDUs packed behind one preamble (4 ms cap). One contention and one preamble are amortised over many frames — the main efficiency win.',
          zh: '一个前导之后最多打包 64 个 MPDU（上限 4 ms）。一次竞争、一个前导摊薄到许多帧上——这是效率提升的主要来源。',
        },
      },
      {
        term: 'BlockAck',
        alt: { en: 'compressed block acknowledgment', zh: '块确认' },
        def: {
          en: 'A single frame whose bitmap acknowledges every MPDU of an A-MPDU individually, so only the lost ones are retransmitted.',
          zh: '用一个帧的位图逐个确认 A-MPDU 中的每个 MPDU，因此只需重传丢失的那些。',
        },
      },
      {
        term: 'Retry bit',
        alt: { en: 'retransmission flag', zh: '重传标志位' },
        def: {
          en: 'Set in the MAC header when a frame is being sent again, so the receiver can discard a duplicate whose ACK was the part that got lost.',
          zh: '帧被再次发送时在 MAC 头中置位，使接收方能丢弃重复帧——那种“数据收到了、丢的是 ACK”的情形。',
        },
      },
      {
        term: 'SSRC / SLRC',
        alt: { en: 'station short / long retry count', zh: '站点短 / 长重传计数' },
        def: {
          en: 'Per-station failure counters driving CW growth. Limits: 7 short (frames below the RTS threshold) and 4 long; past them the frame is dropped.',
          zh: '驱动 CW 增长的站点失败计数。上限为短重传 7 次（低于 RTS 门限的帧）与长重传 4 次；超过即丢弃该帧。',
        },
      },
    ],
  },
  {
    id: 'phy',
    title: { en: 'PHY & radio', zh: 'PHY 与射频' },
    items: [
      {
        term: 'Preamble',
        alt: { en: 'PHY header before the data', zh: '前导（数据之前的 PHY 头）' },
        def: {
          en: 'Fixed overhead paid by every PPDU regardless of payload: 20 µs non-HT, 40 µs VHT, 44 µs HE, 48 µs EHT. It is why tiny frames are so expensive.',
          zh: '每个 PPDU 无论净荷多少都要付出的固定开销：非 HT 20 µs、VHT 40 µs、HE 44 µs、EHT 48 µs。这正是小帧代价高昂的原因。',
        },
      },
      {
        term: 'MCS',
        alt: { en: 'modulation and coding scheme', zh: '调制与编码方案' },
        def: {
          en: 'The rate index. Higher MCS packs more bits per symbol but needs a stronger signal; the simulator picks the highest MCS whose sensitivity is met with 3 dB margin.',
          zh: '速率索引。MCS 越高每符号承载的比特越多，但要求信号更强；仿真器选择在 3 dB 余量下满足灵敏度的最高 MCS。',
        },
      },
      {
        term: 'N_DBPS',
        alt: { en: 'data bits per OFDM symbol', zh: '每个 OFDM 符号的数据比特数' },
        def: {
          en: 'What MCS really sets. Airtime = preamble + symbol time × ⌈(16 + 8·bytes + 6) / N_DBPS⌉ (Eq. 17-29). Symbols are 4 µs (a/VHT) or 13.6 µs (HE/EHT).',
          zh: 'MCS 实际决定的量。空口时间 = 前导 + 符号时长 × ⌈(16 + 8·字节数 + 6) / N_DBPS⌉（式 17-29）。符号时长为 4 µs（11a/VHT）或 13.6 µs（HE/EHT）。',
        },
      },
      {
        term: 'RSSI',
        alt: { en: 'received signal strength, dBm', zh: '接收信号强度（dBm）' },
        def: {
          en: 'Here: Tx power − (46.7 + 30·log₁₀ d) − wall losses. It decides both whether CCA sees the frame and which MCS the link can use.',
          zh: '本模型中 = 发射功率 − (46.7 + 30·log₁₀ d) − 墙体损耗。它同时决定 CCA 能否发现该帧，以及链路可用的 MCS。',
        },
      },
      {
        term: 'SINR',
        alt: { en: 'signal-to-interference-plus-noise ratio', zh: '信干噪比' },
        def: {
          en: 'Wanted signal against the sum of overlapping transmissions plus the −95 dBm noise floor. Below the threshold for the frame\'s rate, the reception fails.',
          zh: '有用信号与所有重叠传输之和加 −95 dBm 噪声底之比。低于该帧速率所需门限，接收即失败。',
        },
      },
      {
        term: 'Path loss',
        alt: { en: 'log-distance model, n = 3.0', zh: '路径损耗（对数距离模型，n = 3.0）' },
        def: {
          en: '46.7 dB at 1 m (5.2 GHz) then 30 dB per decade of distance. Wall crossings add drywall 5 dB, brick 12 dB, glass 3 dB; doors and windows are exempt.',
          zh: '1 米处 46.7 dB（5.2 GHz），此后每十倍距离增加 30 dB。每穿越一堵墙另加：石膏板 5 dB、砖墙 12 dB、玻璃 3 dB；门窗开口不计。',
        },
      },
    ],
  },
  {
    id: 'mu',
    title: { en: 'Multi-user & multi-link', zh: '多用户与多链路' },
    items: [
      {
        term: 'OFDMA',
        alt: { en: 'orthogonal frequency-division multiple access', zh: '正交频分多址' },
        def: {
          en: 'The channel is split into resource units so several stations share one PPDU instead of taking turns. Modeled as 1/n rate scaling per RU.',
          zh: '把信道划分为资源单元，让多个终端共享同一个 PPDU，而不是轮流发送。模型中按每个 RU 做 1/n 速率缩放。',
        },
      },
      {
        term: 'RU',
        alt: { en: 'resource unit', zh: '资源单元' },
        def: {
          en: 'One station\'s slice of the channel inside an OFDMA PPDU. A narrower RU means a lower rate but simultaneous, not serialized, access.',
          zh: 'OFDMA PPDU 中分给某个终端的那一份信道。RU 越窄速率越低，但接入是并行而非串行的。',
        },
      },
      {
        term: 'DL MU / UL MU',
        alt: { en: 'downlink / uplink multi-user', zh: '下行 / 上行多用户' },
        def: {
          en: 'DL MU: the AP sends to several STAs at once. UL MU: the AP sends a Trigger and the STAs answer simultaneously in their assigned RUs.',
          zh: '下行 MU：AP 同时发给多个终端。上行 MU：AP 发出触发帧，各终端在分配到的 RU 中同时应答。',
        },
      },
      {
        term: 'Trigger frame',
        alt: { en: 'uplink scheduling frame', zh: '触发帧' },
        def: {
          en: 'The AP\'s poll: it names which STA uses which RU and for how long, turning uplink access from contention into a schedule.',
          zh: 'AP 的轮询：指明哪个终端用哪个 RU、用多久，把上行接入从竞争变成了调度。',
        },
      },
      {
        term: 'Multi-STA BlockAck',
        alt: { en: 'one BA for many senders', zh: '多站点块确认' },
        def: {
          en: 'A single acknowledgment frame carrying separate bitmaps for every station that transmitted in an UL MU round.',
          zh: '一个确认帧中，为上行 MU 中发送过的每个终端各携带一份位图。',
        },
      },
      {
        term: 'MLO / MLD',
        alt: { en: 'multi-link operation / device', zh: '多链路操作 / 多链路设备' },
        def: {
          en: 'One logical device with a MAC per band over shared queues. Here: 5 GHz + 6 GHz in STR mode, drawn as two timeline lanes (id and id#6g).',
          zh: '一个逻辑设备在每个频段上各有一套 MAC，共用队列。本模型为 5 GHz + 6 GHz 的 STR 模式，在时间轴上画作两条泳道（id 与 id#6g）。',
        },
      },
      {
        term: 'STR',
        alt: { en: 'simultaneous transmit and receive', zh: '同时收发' },
        def: {
          en: 'The MLO mode where the two links are independent enough to run at the same time — the links contend separately and never block each other.',
          zh: '两条链路彼此独立、可同时工作的 MLO 模式——各自独立竞争，互不阻塞。',
        },
      },
    ],
  },
  {
    id: 'sim',
    title: { en: 'Simulator vocabulary', zh: '仿真器术语' },
    items: [
      {
        term: 'Frame exchange',
        alt: { en: 'DATA → SIFS → ACK', zh: '帧交换（数据帧 → SIFS → ACK）' },
        def: {
          en: 'One complete transaction on the medium, not one frame. The ⏮/⏭ transport buttons step whole exchanges.',
          zh: '介质上一次完整的事务，而不是单个帧。⏮/⏭ 播放控制按帧交换整体步进。',
        },
      },
      {
        term: 'Lane',
        alt: { en: 'timeline row', zh: '泳道（时间轴的一行）' },
        def: {
          en: 'One row per node per link in the timeline strip, showing TX / RX / backoff / defer / NAV. Order follows the node order in the editor.',
          zh: '时间轴中每个节点每条链路一行，显示发送/接收/退避/等待/NAV。顺序与编辑器中的节点顺序一致。',
        },
      },
      {
        term: 'Playhead',
        alt: { en: 'current time cursor', zh: '播放头' },
        def: {
          en: 'The white line and t = … readout. The engine simulates ahead into a buffer; the playhead only reads it, which is why stepping backwards is instant.',
          zh: '白色竖线与 t = … 读数。引擎向前仿真到缓冲区，播放头只是读取它——这就是可以瞬间回退的原因。',
        },
      },
      {
        term: 'Seed',
        alt: { en: 'RNG seed', zh: '随机种子' },
        def: {
          en: 'Seeds every random stream. Same scenario + same seed = a bit-identical run, so any observation can be reproduced exactly.',
          zh: '为所有随机流播种。相同场景 + 相同种子 = 完全一致的运行，因此任何观察都可精确复现。',
        },
      },
      {
        term: 'Airtime share',
        alt: { en: '% of wall-clock spent transmitting', zh: '空口占比' },
        def: {
          en: 'Per-node transmit time divided by elapsed time. The number to watch when comparing a legacy station against modern ones.',
          zh: '节点发送时间除以已过时间。对比传统终端与新制式终端时，主要就看这个数。',
        },
      },
    ],
  },
]
