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
      {
        term: '2.4 GHz link',
        alt: { en: 'ERP-OFDM band (802.11g, Wi-Fi 6/7)', zh: '2.4 GHz 频段（802.11g、Wi-Fi 6/7）' },
        def: {
          en: 'The band 802.11b/g came from. Its OFDM PHY (clause 18, ERP) uses aSIFSTime 10 µs and a 9 µs short slot, so DIFS is 28 µs and AckTimeout 39 µs. Signals lose 6.5 dB less over the same distance than at 5 GHz; the simulator only allows 20 or 40 MHz here.',
          zh: '802.11b/g 所在的频段。其 OFDM PHY（第 18 条，ERP）使用 aSIFSTime 10 µs 和 9 µs 短时隙，因此 DIFS 为 28 µs、AckTimeout 为 39 µs。同样距离上信号比 5 GHz 少损耗 6.5 dB；模拟器在此只允许 20 或 40 MHz。',
        },
      },
      {
        term: 'aSignalExtension',
        alt: { en: 'signal extension, 6 µs', zh: '信号扩展，6 µs' },
        def: {
          en: 'On 2.4 GHz every OFDM PPDU is followed by 6 µs of silence that counts as part of its TXTIME (§10.3.8), so that ERP receivers finish decoding before the SIFS response and the Duration/NAV arithmetic still adds up. Every 2.4 GHz frame in the timeline is 6 µs longer than the same frame at 5 GHz.',
          zh: '在 2.4 GHz，每个 OFDM PPDU 后面跟着 6 µs 的静默，计入其 TXTIME（§10.3.8），使 ERP 接收机能在 SIFS 响应之前完成解码，Duration/NAV 的时间计算也才对得上。时间线上每个 2.4 GHz 帧都比 5 GHz 上的同一帧长 6 µs。',
        },
      },
      {
        term: 'ERP',
        alt: { en: 'extended rate PHY (802.11g)', zh: '扩展速率 PHY（802.11g）' },
        def: {
          en: 'The 2.4 GHz OFDM PHY of 802.11g: the same 6–54 Mb/s rates as 802.11a, with 802.11b compatibility rules (signal extension, 10 µs SIFS). The simulator’s “802.11a (legacy)” generation runs as ERP-OFDM when its link is 2.4 GHz.',
          zh: '802.11g 的 2.4 GHz OFDM PHY：与 802.11a 相同的 6–54 Mb/s 速率，外加 802.11b 兼容规则（信号扩展、10 µs SIFS）。模拟器的“802.11a（传统）”一代在链路为 2.4 GHz 时即按 ERP-OFDM 运行。',
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
        term: 'TXOP protection',
        alt: { en: 'single / multiple protection, §9.2.5.2', zh: '单次 / 多重保护，§9.2.5.2' },
        def: {
          en: 'How a TXOP holder announces its burst. Single: each frame\'s Duration covers its own response. Multiple: an RTS/CTS at the TXOP boundary reserves the medium to the end of the TXOP (optionally every data frame carries the remainder), and CF-End gives unused time back.',
          zh: 'TXOP 持有者如何预告自己的突发。单次：每个帧的 Duration 只覆盖自己的响应。多重：TXOP 起始处的 RTS/CTS 把介质预约到 TXOP 结束（可选地每个数据帧也携带剩余时间），CF-End 归还没用完的时间。',
        },
      },
      {
        term: 'CF-End',
        alt: { en: 'contention-free end, 20 bytes', zh: 'TXOP 截断帧，20 字节' },
        def: {
          en: 'Sent by a TXOP holder whose burst ended before its announced reservation. Every station that decodes it resets its NAV; the AP repeats a station\'s CF-End so the far side of the cell hears the release (§10.23.2.9).',
          zh: 'TXOP 持有者的突发早于预约结束时发出。所有解出它的站点清零 NAV；终端发出的 CF-End 由 AP 重复一遍，让小区另一侧也听到释放（§10.23.2.9）。',
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
        term: 'TB PPDU',
        alt: { en: 'trigger-based PPDU', zh: '基于触发的 PPDU' },
        def: {
          en: 'The uplink PPDU a station may send only in answer to a Trigger. The Trigger fixes its RU, MCS, length (padded so every station ends together), transmit power and start time; the sender chooses none of them.',
          zh: '终端只能在应答触发帧时发送的上行 PPDU。触发帧规定了它的 RU、MCS、长度（填充到所有终端同时结束）、发射功率与开始时刻；发送者自己什么都不决定。',
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
  {
    id: 'amp',
    title: { en: 'Ambient power (802.11bp)', zh: '环境能量（802.11bp）' },
    items: [
      {
        term: 'AMP',
        alt: { en: 'ambient power (IEEE P802.11bp, a draft)', zh: '环境能量（IEEE P802.11bp，草案中）' },
        def: {
          en: 'A battery-free class of 802.11 station: no carrier sense, no contention — it transmits only inside a slot an AP\'s trigger has just opened. This simulator models the Active Tx variant, which makes its own carrier; backscatter tags are a later slice.',
          zh: '一类无电池的 802.11 终端：没有载波侦听，不参与竞争——只在 AP 触发帧刚打开的时隙内发送。本仿真器建模的是 Active Tx（主动发射）变体，标签自己产生载波；反向散射标签留待后续切片。',
        },
      },
      {
        term: 'AMP AP',
        alt: { en: 'AP running the AMP polling function', zh: '运行 AMP 轮询功能的 AP' },
        def: {
          en: 'An ordinary AP that also polls AMP tags, using its AC_BK contention entity. The simulator requires a Wi-Fi 7 (EHT) AP, because the AMP downlink PPDU carries a U-SIG field.',
          zh: '同时轮询 AMP 标签的普通 AP，使用它的 AC_BK 竞争实体。仿真器要求它是 Wi-Fi 7（EHT）AP，因为 AMP 下行 PPDU 携带 U-SIG 字段。',
        },
      },
      {
        term: 'Active Tx non-AP AMP STA',
        alt: { en: 'the tag', zh: '标签' },
        def: {
          en: 'The tag this slice models (SFD AM-2): no carrier sense, no NAV, a 16-bit AMP identifier, and a transmitter of its own that answers only inside the slot a trigger assigns it. Downlink sensitivity defaults to −72 dBm (model).',
          zh: '本切片建模的标签（SFD AM-2）：没有载波侦听，没有 NAV，拥有一个 16 位 AMP 标识符和自己的发射机——只在触发帧分配的时隙内应答。下行灵敏度默认 −72 dBm（模型取值）。',
        },
      },
      {
        term: 'AMP Trigger',
        alt: { en: 'downlink triggering frame', zh: '下行触发帧' },
        def: {
          en: 'The AP\'s poll: opens N uplink slots (default 4), states the ACWE tags draw from, the slot duration and the UL rate — either for random access, or a scheduled list of tag IDs.',
          zh: 'AP 的轮询帧：打开 N 个上行时隙（默认 4 个），规定标签抽取所用的 ACWE、时隙时长与上行速率——可用于随机接入，也可携带一份预定的标签 ID 列表。',
        },
      },
      {
        term: 'AMP Ack',
        alt: { en: 'downlink slot acknowledgment', zh: '下行时隙确认帧' },
        def: {
          en: 'Sent by the AP one AMP SIFS after every slot, naming the tag it heard or the AP\'s own id when the slot was empty or collided. Tags have no clock of their own, so counting these Acks is how each finds its slot.',
          zh: 'AP 在每个时隙结束后一个 AMP SIFS 发出，点名该时隙收到的标签；若时隙为空或发生碰撞，则填 AP 自己的标识。标签没有自己的时钟，靠数这些 Ack 来找到自己的时隙。',
        },
      },
      {
        term: 'ABOC',
        alt: { en: 'AMP backoff counter', zh: 'AMP 退避计数器' },
        def: {
          en: 'Drawn uniformly from [0, ACW] on every random-access trigger a tag decodes. ABOC < N picks slot ABOC + 1; otherwise the tag sits that round out.',
          zh: '标签每次解出随机接入触发帧时，从 [0, ACW] 均匀抽取。ABOC < N 时选中第 ABOC + 1 个时隙；否则本轮空转。',
        },
      },
      {
        term: 'ACW',
        alt: { en: 'AMP contention window = 2^ACWE − 1', zh: 'AMP 竞争窗口 = 2^ACWE − 1' },
        def: {
          en: 'The range ABOC is drawn from. Default ACWE 2 gives ACW 3 (four possible draws), matching the default 4 slots, so no tag sits a round out.',
          zh: 'ABOC 抽取的取值范围。默认 ACWE 为 2，得到 ACW = 3（共四种取值），与默认 4 个时隙相配，因此不会有标签空转。',
        },
      },
      {
        term: 'AMP SIFS',
        alt: { en: '10 µs', zh: '10 µs' },
        def: {
          en: 'The gap between every step of a round — trigger to slot 1, Ack to the next slot. Equal to the 2.4 GHz aSIFSTime (SFD PM-96), so every gap in an AMP round is the same length.',
          zh: '一轮之中每一步之间的间隔——触发帧到时隙 1、Ack 到下一个时隙皆是如此。等于 2.4 GHz 的 aSIFSTime（SFD PM-96），因此一轮里所有间隔长度相同。',
        },
      },
      {
        term: 'AMP-Sync / AMP-SIG',
        alt: { en: 'PHY sync + signalling fields', zh: 'PHY 同步与信令字段' },
        def: {
          en: 'AMP-Sync: an 80 µs chip sequence (32 + 8 chips at 2 µs) letting a tag\'s envelope detector find chip boundaries. AMP-SIG: the 2-octet field after it, Manchester-OOK at the DL rate — 64 µs at 250 kb/s, 16 µs at 1 Mb/s.',
          zh: 'AMP-Sync：80 µs 的码片序列（32+8 个码片，每片 2 µs），供标签的包络检波器定位码片边界。AMP-SIG：紧随其后的 2 字节字段，以曼彻斯特 OOK 按下行速率发送——250 kb/s 时 64 µs，1 Mb/s 时 16 µs。',
        },
      },
      {
        term: 'Manchester OOK',
        alt: { en: 'on-off keying, DL 250/1000 kb/s, UL adds 4000 kb/s', zh: '通断键控，下行 250/1000 kb/s，上行另加 4000 kb/s' },
        def: {
          en: 'The AMP data modulation. Uplink chip durations: 1 µs at 250 kb/s, 0.25 µs at 1 Mb/s, 0.125 µs at 4 Mb/s (its 48-chip AMP-Sync is 48/12/6 µs). Downlink runs at 250 or 1000 kb/s only.',
          zh: 'AMP 数据调制方式。上行码片时长：250 kb/s 时 1 µs，1 Mb/s 时 0.25 µs，4 Mb/s 时 0.125 µs（48 码片的 AMP-Sync 相应为 48/12/6 µs）。下行仅有 250 与 1000 kb/s 两档。',
        },
      },
      {
        term: 'Backscatter',
        alt: { en: 'future slice — mono-/bistatic', zh: '未来切片——单站式/双站式' },
        def: {
          en: 'A tag that answers by reflecting an illuminator\'s carrier instead of generating its own — mono-static from the AP itself, bistatic from a separate energizer. Not modeled in this slice.',
          zh: '标签不产生自己的载波，而是反射照射源的载波来应答——单站式由 AP 自身照射，双站式由独立的 Energizer 照射。本切片尚未建模。',
        },
      },
      {
        term: 'Energizer',
        alt: { en: 'future slice — RF power source', zh: '未来切片——射频供能源' },
        def: {
          en: 'A dedicated transmitter that illuminates tags for bistatic backscatter and wireless power transfer. Not modeled in this slice.',
          zh: '专为标签提供双站式反向散射照射与无线能量传输的独立发射装置。本切片尚未建模。',
        },
      },
    ],
  },
  {
    id: 'uwb',
    title: { en: 'UWB ranging (802.15.4-2024)', zh: 'UWB 测距（802.15.4-2024）' },
    items: [
      {
        term: 'UWB',
        alt: { en: 'ultra-wideband', zh: '超宽带' },
        def: {
          en: 'A second radio beside Wi-Fi whose job is distance, not throughput: half a gigahertz of bandwidth makes a pulse edge sharp enough to time to picoseconds, and 1 ps is 0.3 mm of flight. Channel 5 (6489.6 MHz) or channel 9 (7987.2 MHz, the default).',
          zh: 'Wi-Fi 之外的第二套射频，任务是测距而不是传数据：将近半个 GHz 的带宽让脉冲前沿足够陡峭，可以把到达时刻标定到皮秒量级，而 1 ps 只对应 0.3 mm 的飞行距离。可用信道 5（6489.6 MHz）或信道 9（7987.2 MHz，默认）。',
        },
      },
      {
        term: 'HRP UWB PHY',
        alt: { en: 'high rate pulse repetition frequency PHY, 499.2 Mchip/s', zh: '高重复频率脉冲物理层，499.2 Mchip/s' },
        def: {
          en: 'The 802.15.4 PHY this simulator models (clause 16): chip 2.003205 ns, BPRF set 3 — SYNC 64 symbols, SFD 8 symbols, PHR at 850 kb/s, PSDU at 6.8 Mb/s. LRP UWB is out of scope.',
          zh: '本仿真器建模的 802.15.4 物理层（第 16 章）：码片 2.003205 ns，采用 BPRF 第 3 组配置——SYNC 64 个符号、SFD 8 个符号、PHR 850 kb/s、PSDU 6.8 Mb/s。LRP UWB 不在范围内。',
        },
      },
      {
        term: 'RMARKER',
        alt: { en: 'ranging marker — 73.269 µs into the PPDU', zh: '测距标记点——位于 PPDU 起点后 73.269 µs' },
        def: {
          en: 'The instant a ranging measurement refers to: the first chip after the SFD, at the antenna (§10.29.1.1). 36 576 chips into the PPDU. Every timestamp the engine records is an RMARKER reading, transmitted or received.',
          zh: '一次测距所指的时刻：SFD 之后第一个码片出现在天线口的瞬间（§10.29.1.1），即 PPDU 起点之后 36 576 个码片。引擎记录的每个时间戳，都是一次发送或接收的 RMARKER 读数。',
        },
      },
      {
        term: 'Ranging counter / RCTU',
        alt: { en: 'ranging counter time unit = 15.650 ps', zh: '测距计数时间单位 = 15.650 ps' },
        def: {
          en: 'The free-running clock every ranging device timestamps with, counting in units of one 128th of a chip (§10.29.1.4). 40 bits wide here, so every difference is taken modulo 2⁴⁰. One RCTU is 4.7 mm of flight.',
          zh: '每台测距设备用于打时间戳的自由运行时钟，计数单位为 1/128 个码片（§10.29.1.4）。本仿真中为 40 位，因此所有差值都按 2⁴⁰ 取模。1 个 RCTU 相当于 4.7 mm 的飞行距离。',
        },
      },
      {
        term: 'RSTU',
        alt: { en: 'ranging scheduling time unit = 416 chips = 833.333 ns', zh: '测距调度时间单位 = 416 码片 = 833.333 ns' },
        def: {
          en: 'The unit the schedule is written in (§10.29.1.5, Table 10-145) — slots and blocks are configured in RSTU, not in nanoseconds. The defaults are slot 2 400 RSTU (2 ms) and block 240 000 RSTU (200 ms).',
          zh: '编写调度时所用的单位（§10.29.1.5，表 10-145）——时隙与块都以 RSTU 配置，而不是纳秒。默认时隙 2 400 RSTU（2 ms），默认块 240 000 RSTU（200 ms）。',
        },
      },
      {
        term: 'STS',
        alt: { en: 'scrambled timestamp sequence', zh: '加扰时间戳序列' },
        def: {
          en: 'A pseudo-random chip sequence inside the PPDU that only the two ranging peers can predict, so an attacker cannot manufacture an earlier leading edge. Here one BPRF segment: 512-chip gap + 64 × 512 active chips + 512-chip gap = 33 792 chips (67.692 µs). Key management is out of scope.',
          zh: 'PPDU 中一段只有测距双方能预知的伪随机码片序列，攻击者因此无法伪造更早的前沿。本仿真取 BPRF 的一个 STS 段：512 码片间隔 + 64 × 512 有效码片 + 512 码片间隔 = 33 792 码片（67.692 µs）。密钥管理不在范围内。',
        },
      },
      {
        term: 'SP1',
        alt: { en: 'STS packet configuration 1', zh: 'STS 分组配置 1' },
        def: {
          en: 'The PPDU layout used throughout: SYNC, SFD, STS, PHR, PSDU (Figure 16-3, configuration 1) — the STS sits between the SFD and the PHR, so the frame still carries data as well as a protected timestamp.',
          zh: '本仿真通篇使用的 PPDU 结构：SYNC、SFD、STS、PHR、PSDU（图 16-3 的配置 1）——STS 位于 SFD 与 PHR 之间，因此该帧既能受保护地打时间戳，也照样能承载数据。',
        },
      },
      {
        term: 'SS-TWR',
        alt: { en: 'single-sided two-way ranging', zh: '单边双向测距' },
        def: {
          en: 'One round trip (§10.29.1.2.2): tof = (Tround − Treply)/2, from the tag\'s Poll and the anchor\'s Response (the reply time travels in an RRTI IE). Cheap, but a 20 ppm clock difference over a 2 ms reply is 20 ns ≈ 6 m unless the measured carrier-frequency offset corrects it.',
          zh: '只有一次往返（§10.29.1.2.2）：tof =（Tround − Treply）/2，由标签的 Poll 与锚点的 Response 得出（回复时间由 RRTI IE 携带）。开销小，但两端时钟相差 20 ppm、回复时间 2 ms 时误差达 20 ns ≈ 6 m，除非用测得的载波频偏加以修正。',
        },
      },
      {
        term: 'DS-TWR',
        alt: { en: 'double-sided two-way ranging, three messages', zh: '双边双向测距（三消息式）' },
        def: {
          en: 'Poll, Response, Final (§10.29.1.2.4): tof = (Tround1·Tround2 − Treply1·Treply2) / (Tround1 + Tround2 + Treply1 + Treply2). Each clock appears in both a round-trip and a reply time, so the rate errors divide out — picoseconds of clock error, for twice the airtime. The default method.',
          zh: 'Poll、Response、Final 三帧（§10.29.1.2.4）：tof =（Tround1·Tround2 − Treply1·Treply2）/（Tround1 + Tround2 + Treply1 + Treply2）。每个时钟都同时出现在一个往返时间和一个回复时间中，频率误差因而相消——时钟误差降到皮秒级，代价是一倍空口时间。本仿真的默认方式。',
        },
      },
      {
        term: 'Ranging block',
        alt: { en: '200 ms (240 000 RSTU), FiRa default', zh: '200 ms（240 000 RSTU），FiRa 默认值' },
        def: {
          en: 'The repeating period of a session (§10.32.2). Every tag gets one round inside each block and its radio is off for the rest — the block is the duty cycle, and therefore the battery life.',
          zh: '一次测距会话的重复周期（§10.32.2）。每个标签在每个块内分到一轮，其余时间射频关闭——块长即占空比，也就决定了电池寿命。',
        },
      },
      {
        term: 'Ranging round',
        alt: { en: 'one tag\'s exchange with every anchor', zh: '一个标签与全部锚点的一次交互' },
        def: {
          en: 'A block is cut into rounds, one per tag (round index = tag index here; round hopping is out of scope). SS-TWR takes N + 1 slots for N anchors, DS-TWR takes 2N + 2.',
          zh: '一个块被切成若干轮，每个标签占一轮（本仿真中轮序号 = 标签序号；跳轮不在范围内）。N 个锚点时，SS-TWR 占 N + 1 个时隙，DS-TWR 占 2N + 2 个。',
        },
      },
      {
        term: 'Ranging slot',
        alt: { en: '2 ms (2 400 RSTU), FiRa default', zh: '2 ms（2 400 RSTU），FiRa 默认值' },
        def: {
          en: 'The smallest unit of the schedule: exactly one device transmits in it, starting at the slot boundary. It must hold the round\'s longest frame plus 200 ns of flight guard (60 m), which the scenario schema checks.',
          zh: '调度的最小单位：一个时隙内只有一台设备发送，且在时隙边界起发。时隙必须容得下本轮最长的那一帧加上 200 ns 的飞行保护（60 m），场景校验会检查这一点。',
        },
      },
      {
        term: 'Controller / controlee',
        alt: { en: 'who owns the schedule', zh: '谁掌握调度' },
        def: {
          en: 'The controller defines the block, round and slot structure and hands it out; controlees follow it. Here the tag is controller and the anchors are controlees — the phone-and-anchors deployment.',
          zh: '控制方（controller）定义块、轮、时隙的结构并下发，受控方（controlee）照此执行。本仿真中标签是控制方，锚点是受控方——即“手机 + 固定锚点”的部署方式。',
        },
      },
      {
        term: 'Initiator / responder',
        alt: { en: 'who starts the exchange', zh: '谁发起交互' },
        def: {
          en: 'The initiator sends the Poll that opens a round; responders answer in the slots they were given. A separate axis from controller/controlee — here the tag happens to be both controller and initiator.',
          zh: '发起方（initiator）发出开启一轮的 Poll，响应方（responder）在分配到的时隙中应答。这一对角色与控制/受控是两个独立维度——本仿真中标签恰好既是控制方又是发起方。',
        },
      },
      {
        term: 'ARC IE',
        alt: { en: 'advanced ranging control IE, 10 octets', zh: '高级测距控制信元，10 字节' },
        def: {
          en: 'Rides in the Poll and carries the schedule the round is running under (§10.32.9.1): control, block index, round index, slot index. It is how a device that just joined learns where in the block it is.',
          zh: '随 Poll 发送，携带本轮所依据的调度信息（§10.32.9.1）：控制字段、块序号、轮序号、时隙序号。刚加入的设备正是靠它得知自己处在块中的哪个位置。',
        },
      },
      {
        term: 'RDM IE',
        alt: { en: 'ranging device management IE, 3 + 3N octets', zh: '测距设备管理信元，3 + 3N 字节' },
        def: {
          en: 'Also in the Poll (§10.32.9.8): one entry per anchor — its short address and the slot it is to answer in. This is the assignment that makes the round contention-free.',
          zh: '同样位于 Poll 中（§10.32.9.8）：每个锚点一条表项，给出其短地址以及应当应答的时隙。正是这份分配让整轮交互无需竞争。',
        },
      },
      {
        term: 'RRTI IE',
        alt: { en: 'ranging reply time instantaneous IE, 6 octets', zh: '瞬时测距回复时间信元，6 字节' },
        def: {
          en: 'Carries one reply time, 4 octets, in RCTU (§10.29.8.1). In SS-TWR the anchor puts its Treply here so the tag can finish the arithmetic; in DS-TWR the tag\'s Final carries one per anchor.',
          zh: '携带一个以 RCTU 为单位、4 字节长的回复时间（§10.29.8.1）。SS-TWR 中锚点把自己的 Treply 放在这里，供标签完成计算；DS-TWR 中标签的 Final 为每个锚点各带一个。',
        },
      },
      {
        term: 'RMI IE',
        alt: { en: 'ranging measurement information IE', zh: '测距测量信息信元' },
        def: {
          en: 'The measurement report (§10.29.8.4). In the tag\'s Final it lists each anchor\'s round-trip time (3 + 6N octets); in an anchor\'s measurement report it is the 13-octet form carrying Treply1 and Tround2 back to the tag.',
          zh: '测量报告信元（§10.29.8.4）。在标签的 Final 中，它逐个列出各锚点的往返时间（3 + 6N 字节）；在锚点的测量报告帧中，它是 13 字节的形式，把 Treply1 与 Tround2 回传给标签。',
        },
      },
      {
        term: 'FoM',
        alt: { en: 'figure of merit — 0x16 LOS, 0x7B NLOS', zh: '质量因子——视距 0x16，非视距 0x7B' },
        def: {
          en: 'One byte per receive timestamp saying how much to trust it (§10.29.1.7): confidence level, interval and scaling. Line of sight reports 0x16 = "97 % within 0.5 ns"; a path through any wall reports 0x7B = "75 % within 12 ns". An all-zero byte means "not available". Reported, not used by the solver.',
          zh: '每个接收时间戳附带的一个字节，说明它有多可信（§10.29.1.7）：置信水平、区间与比例因子。视距路径报 0x16 =“97 % 落在 0.5 ns 内”；穿墙路径报 0x7B =“75 % 落在 12 ns 内”。全零字节表示“不可用”。它只上报，不参与解算。',
        },
      },
      {
        term: 'NLOS',
        alt: { en: 'non-line-of-sight — 0.2 / 0.5 / 2.0 ns per wall', zh: '非视距——每面墙 0.2 / 0.5 / 2.0 ns' },
        def: {
          en: 'A blocked direct path arrives late, so the range reads long. Model excess delay per wall crossed: glass 0.2 ns, drywall 0.5 ns, brick 2.0 ns (0.06 / 0.15 / 0.60 m). It is a bias, not noise — averaging never removes it, which is why a blocked anchor drags the whole fix.',
          zh: '直射路径被遮挡时信号到得更晚，测出的距离因而偏大。模型取每穿一面墙的附加时延：玻璃 0.2 ns、石膏板 0.5 ns、砖 2.0 ns（分别为 0.06 / 0.15 / 0.60 m）。这是偏差而非噪声——再多次平均也消不掉，所以一个被遮挡的锚点会把整个定位结果拉偏。',
        },
      },
      {
        term: 'GDOP',
        alt: { en: 'geometric dilution of precision = √trace((JᵀJ)⁻¹)', zh: '几何精度因子 = √trace((JᵀJ)⁻¹)' },
        def: {
          en: 'How much the anchor geometry multiplies range error into position error. A tag at the centre of a square of anchors has GDOP 1.0; anchors that nearly line up push it up without any measurement getting worse.',
          zh: '锚点几何把测距误差放大成定位误差的倍数。标签位于正方形锚点阵中心时 GDOP 为 1.0；锚点接近共线时，即使每次测距都没变差，GDOP 也会显著上升。',
        },
      },
      {
        term: 'Error ellipse',
        alt: { en: '1-σ, from Σ = σ_r²·(JᵀJ)⁻¹, drawn at 10×', zh: '1-σ 误差椭圆，由 Σ = σ_r²·(JᵀJ)⁻¹ 得出，按 10× 绘制' },
        def: {
          en: 'The solver\'s confidence region: semi-axes √λ₁, √λ₂ of the covariance and the major-axis angle. Its shape is the anchor geometry, its size is σ_r = c·σ_ts/√2 ≈ 2.1 cm at 100 ps. Too small to see beside a 3.5 m ring, so the scene draws it at 10× — the inspector shows the true axes.',
          zh: '解算器给出的置信区域：协方差矩阵特征值的平方根 √λ₁、√λ₂ 为两个半轴，另有长轴方向角。形状由锚点几何决定，大小由 σ_r = c·σ_ts/√2 决定，100 ps 时约 2.1 cm。它在 3.5 m 的圆环旁小得看不见，所以场景中按 10× 放大绘制——检视面板显示的才是真实半轴。',
        },
      },
      {
        term: 'Range ring',
        alt: { en: 'one measured distance, on the floor', zh: '地面上的一个测距圆环' },
        def: {
          en: 'A range has no direction, so the honest picture of one is a circle of that radius around the anchor that measured it. Rings that cross in one place are what a fix is made of; each fades out over one ranging block, so only fresh measurements are drawn.',
          zh: '测距只有距离没有方向，所以如实的画法是以测出它的锚点为圆心、以该距离为半径的圆。多个圆环交于一点，就构成一次定位；每个圆环在一个测距块的时间内渐隐，因此画面上只有新鲜的测量结果。',
        },
      },
      {
        term: 'Anchor / tag',
        alt: { en: 'known position / unknown position', zh: '位置已知 / 位置待求' },
        def: {
          en: 'Anchors are fixed, their coordinates known to every tag out of band; tags are what is being located. Up to 9 anchors per round (beyond that the Final would exceed the 127-octet PSDU limit), and a 2-D fix needs at least 3 answering.',
          zh: '锚点固定不动，其坐标通过带外方式为所有标签所知；标签才是待定位的对象。每轮最多 9 个锚点（再多，Final 帧就会超过 127 字节的 PSDU 上限），而解算一个二维位置至少需要 3 个锚点应答。',
        },
      },
    ],
  },
]
