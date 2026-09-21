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
        alt: { en: 'mono-static modeled; bistatic a future slice', zh: '单站式已建模；双站式留待后续切片' },
        def: {
          en: 'A tag that answers by reflecting an illuminator\'s own carrier instead of generating one, 6 dB down for the switch (AMP_BS_LOSS_DB, TGbp 11-24/0537r0). Mono-static — the AP itself illuminates and listens — is modeled in this slice; bistatic (a separate energizer) is a later one.',
          zh: '标签不产生自己的载波，而是反射照射源的载波来应答，反射损耗 6 dB（AMP_BS_LOSS_DB，TGbp 11-24/0537r0）。单站式——由 AP 自己照射并聆听——已在本切片建模；双站式（由独立的 Energizer 照射）留待后续切片。',
        },
      },
      {
        term: 'Mono-static',
        alt: { en: 'one radio, both jobs', zh: '一部电台身兼两职' },
        def: {
          en: 'The Wi-Fi AP is the RFID reader: it radiates the excitation carrier and listens for its own signal coming back modulated. One radio doing both jobs means its own transmitted power is what sets its own receive floor (self-leakage, below) — turning the excitation up buys no extra reach.',
          zh: 'Wi-Fi AP 本身就是 RFID 阅读器：它辐射激励载波，同时聆听自己的信号被调制后反射回来。一部电台身兼两职，意味着它自己发射的功率决定了自己接收的底噪（见下方“自泄漏”）——把激励功率调高并不能换来更远的距离。',
        },
      },
      {
        term: 'WUP-Excitation',
        alt: { en: 'wake-up carrier, ≥ 1 ms', zh: '唤醒载波，≥ 1 ms' },
        def: {
          en: 'The carrier at the front of the first downlink PPDU of a TXOP, `wupMs` (default 1 ms, the framework\'s own minimum, SFD PM-72/PM-73). A tag needs the whole millisecond above −20 dBm (AMP_BS_ACTIVATION_DBM) to charge up and boot — 30.9 cm of reach at the model default 10 dBm charge power, 97.8 cm at 20 dBm. A tag beyond that reach never boots: no lane, no record.',
          zh: '一个 TXOP 第一个下行 PPDU 前端的载波，即 `wupMs`（默认 1 ms，框架自身的下限，SFD PM-72/PM-73）。标签需要在 −20 dBm（AMP_BS_ACTIVATION_DBM）以上持续整整这一毫秒才能充能并启动——默认 10 dBm 充能功率时可达 30.9 cm，20 dBm 时可达 97.8 cm。超出这个距离的标签永远不会启动：没有泳道，也没有记录。',
        },
      },
      {
        term: 'BST-Excitation',
        alt: { en: 'reply carrier, after every command', zh: '应答载波，跟在每条命令之后' },
        def: {
          en: 'The carrier the reader keeps radiating after a command\'s AMP-Data so a tag has something to reflect: at least 1.2·T1 + 1.1·T4 for an immediate reply, 1.1·T3 + 1 µs + 1.1·T4 for a delayed one (Write, T3 = 2 ms) — SFD PM-74, PM-75, PM-86…PM-88.',
          zh: '阅读器在一条命令的 AMP-Data 之后继续辐射的载波，好让标签有信号可反射：立即应答至少需要 1.2·T1 + 1.1·T4，延迟应答（Write，T3 = 2 ms）需要 1.1·T3 + 1 µs + 1.1·T4——SFD PM-74、PM-75、PM-86…PM-88。',
        },
      },
      {
        term: 'EPC Gen2',
        alt: { en: 'ISO/IEC 18000-63, tunnelled', zh: 'ISO/IEC 18000-63，隧道封装' },
        def: {
          en: 'The tag-inventory protocol the SFD tunnels inside AMP RFID frames (MM-10, MM-29, FM-44): Query, QueryRep, ACK, Read, Write and the slot-counter algorithm below. No DL Ack follows a backscatter reply — the next command is the acknowledgement.',
          zh: 'SFD 在 AMP RFID 帧内隧道封装的标签盘点协议（MM-10、MM-29、FM-44）：Query、QueryRep、ACK、Read、Write，以及下面的时隙计数器算法。反向散射应答之后没有下行 Ack——下一条命令本身就是确认。',
        },
      },
      {
        term: 'Q / slot counter',
        alt: { en: 'Query(Q), [0, 2^Q − 1]', zh: 'Query(Q)，取值 [0, 2^Q − 1]' },
        def: {
          en: 'Query(Q) tells every powered tag to draw a counter uniformly from [0, 2^Q − 1] (Gen2); a tag whose counter reads 0 answers, every other tag decrements it on QueryRep. Q is a scenario knob (default 2, four slots) — the draft\'s own Q-adaptation (QueryAdjust) is not modelled.',
          zh: 'Query(Q) 要求每个已启动的标签从 [0, 2^Q − 1] 中均匀抽取一个计数器（Gen2）；计数器为 0 的标签应答，其余标签在每次 QueryRep 时递减。Q 是场景中的一个旋钮（默认 2，四个时隙）——草案自身的 Q 自适应（QueryAdjust）未建模。',
        },
      },
      {
        term: 'RN16',
        alt: { en: '16-bit random number, 112 µs at 250 kb/s', zh: '16 位随机数，250 kb/s 下 112 µs' },
        def: {
          en: 'The random number a tag backscatters when its slot counter reaches 0 — 112 µs of airtime at 250 kb/s (48 µs sync + 64 µs data). The reader\'s ACK(RN16) only reaches the tag whose reflection it echoes back, which is what tells Gen2\'s collision from its silence.',
          zh: '标签的时隙计数器归零时反向散射的随机数——250 kb/s 下占用 112 µs 空口时间（48 µs 同步 + 64 µs 数据）。阅读器的 ACK(RN16) 只有它反射的那个 RN16 对应的标签才会认领，这正是 Gen2 用来区分“碰撞”与“沉默”的办法。',
        },
      },
      {
        term: 'EPC',
        alt: { en: '96-bit code, 24 hex characters', zh: '96 位编码，24 个十六进制字符' },
        def: {
          en: 'The Electronic Product Code a tag reports after its ACK — 24 hex characters in the scenario (`AmpTagCfg.epc`), derived from the node id when left blank.',
          zh: '标签在收到 ACK 后报告的电子产品编码——在场景中是 24 个十六进制字符（`AmpTagCfg.epc`），留空时由节点 id 派生。',
        },
      },
      {
        term: 'Reader dynamic range',
        alt: { en: '50 dB, after digital cancellation', zh: '50 dB，数字对消之后' },
        def: {
          en: 'AMP_BS_READER_DR_DB, 50 dB (TGbp 11-25/0307r0): how far the reader\'s own leaked excitation can sit above the weakest reflection it can still decode. The reader\'s noise floor is leakDbm − 50 dB, so turning the excitation up raises the floor exactly as much as it raises the reply — reach does not move; only isolation or dynamic range would.',
          zh: 'AMP_BS_READER_DR_DB，50 dB（TGbp 11-25/0307r0）：阅读器自身泄漏的激励信号，最多能比它仍可解出的最弱反射高出多少。阅读器的底噪即 leakDbm − 50 dB，因此把激励功率调高，底噪也同样升高——距离并不会因此变远；只有隔离度或动态范围才能做到。',
        },
      },
      {
        term: 'Self-leakage',
        alt: { en: '20 dB TX-to-RX isolation', zh: '20 dB 收发隔离度' },
        def: {
          en: 'The reader\'s own transmitted excitation reaching its own receiver, 20 dB down (AMP_BS_ISOLATION_DB — a 2×2 Wi-Fi radio in 1TX+1RX mode, TGbp 11-25/0058r1): monoLeakDbm = excitationDbm − 20. The mono-static reader\'s fundamental problem — hearing a whisper over its own shout.',
          zh: '阅读器自己发射的激励信号泄漏进自己的接收机，衰减 20 dB（AMP_BS_ISOLATION_DB——一部工作在 1 发 1 收模式下的 2×2 Wi-Fi 设备，TGbp 11-25/0058r1）：monoLeakDbm = excitationDbm − 20。这正是单站式阅读器最根本的难题——要在自己的喊声里听清一声耳语。',
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
      {
        term: '6 GHz channel (Wi-Fi 6E)',
        alt: { en: 'Scenario.sixGhzCenterMhz, default 5 985 MHz = channel 7', zh: 'Scenario.sixGhzCenterMhz，默认 5 985 MHz，即第 7 信道' },
        def: {
          en: 'The centre frequency of the plan\'s 6 GHz Wi-Fi link. 802.11ax numbers a 6 GHz channel as (centre − 5 950) / 5, so the model default of 5 985 MHz is channel 7 — clear of UWB channel 5 (6 240–6 739.2 MHz). A channel picked inside that band, such as channel 71 at 6 305 MHz, overlaps it instead.',
          zh: '本方案 6 GHz Wi-Fi 链路的中心频率。802.11ax 的信道编号为（中心频率 − 5 950）/ 5，因此模型默认的 5 985 MHz 就是第 7 信道——与 UWB 信道 5（6 240–6 739.2 MHz）没有重叠。若把信道选在该频段之内，例如 6 305 MHz 的第 71 信道，就会与之重叠。',
        },
      },
      {
        term: 'In-band interference',
        alt: { en: 'the other technology\'s power inside your band', zh: '落在自己频段内的另一制式功率' },
        def: {
          en: 'What the Spectrum mediator delivers when a Wi-Fi 6 GHz channel and a UWB channel overlap: the overlapping slice of the foreign emission\'s power, carried to the receiver by the foreign transmitter\'s own path-loss law. A UWB channel with no overlap (channel 9, or channel 5 against a non-overlapping Wi-Fi channel) sees none of it, ever.',
          zh: '当 6 GHz Wi-Fi 信道与 UWB 信道发生重叠时，Spectrum 中介所传递的量：对方发射功率中落在重叠频段内的那一部分，并按对方发射机自身的路径损耗规律传播到接收机。没有重叠的 UWB 信道（信道 9，或与不重叠的 Wi-Fi 信道搭配的信道 5）永远不会看到这部分功率。',
        },
      },
      {
        term: 'SIR',
        alt: { en: 'signal-to-interference ratio, −12 dB minimum (model)', zh: '信干比，最低 −12 dB（模型取值）' },
        def: {
          en: 'A UWB receiver\'s correlation gain lets it decode a wanted frame under in-band Wi-Fi power down to rssi − foreignDbm = −12 dB (UWB_SIR_MIN_DB, model); below that the reception fails and is logged as UWB_INTERFERED, "lost to Wi-Fi". The standard itself fixes only the receiver\'s maximum input, −45 dBm/MHz (§16.4.10), not an SIR floor.',
          zh: 'UWB 接收机凭借相关增益，即使有带内 Wi-Fi 功率也能解调，直到 rssi − foreignDbm 降到 −12 dB（UWB_SIR_MIN_DB，模型取值）为止；低于这个门限接收就会失败，记为 UWB_INTERFERED，即 "lost to Wi-Fi"。标准本身只规定了接收机的最大输入功率 −45 dBm/MHz（§16.4.10），并未规定信干比门限。',
        },
      },
      {
        term: 'Noise rise',
        alt: { en: 'what Wi-Fi sees from a UWB frame past ~40 cm — never CCA', zh: '距离超过约 40 cm 时 Wi-Fi 从 UWB 帧中看到的现象——绝不会触发 CCA' },
        def: {
          en: 'A UWB frame reaching a Wi-Fi receiver is spread so thinly (−14 dBm over 499.2 MHz) that past about 40 cm its in-band power falls below the −62 dBm energy-detect floor: at any realistic spacing it never crosses a CCA threshold, only adding a small amount of extra power into that receiver\'s SINR while the frame is on the air, exactly like a rise in the noise floor.',
          zh: 'UWB 帧传到 Wi-Fi 接收机时功率被摊得极薄（−14 dBm 分摊在 499.2 MHz 上），距离超过约 40 cm 后其带内功率就会落到 −62 dBm 能量检测门限之下：在任何实际间距下都不会超过 CCA 门限，只会在自己发射期间，给接收机的 SINR 叠加一点点额外功率，如同噪底轻微抬升。',
        },
      },
      {
        term: 'Contention-based ranging',
        alt: { en: 'contention-based ranging — schedule mode 0, §10.32.2', zh: '竞争式测距——调度模式 0，§10.32.2' },
        def: {
          en: 'The Poll opens a shared response phase instead of assigning a slot to each anchor by name: every anchor draws one of the RCPS IE\'s 8 slots uniformly (model default) and retries up to the RCMA IE\'s 3 attempts (model default) before sitting a round out. SS-TWR only in this simulator — DS-TWR\'s report would need a second contended window.',
          zh: 'Poll 不再逐一为每个锚点指定时隙，而是打开一个共享响应阶段：每个锚点在 RCPS IE 通告的 8 个时隙（模型默认）中均匀抽取一个，最多重试 RCMA IE 通告的 3 次（模型默认），此后空过一轮。本仿真中仅限 SS-TWR——DS-TWR 的报告帧还需要另开一个竞争窗口。',
        },
      },
      {
        term: 'RCPS IE',
        alt: { en: 'ranging contention phase structure IE, §10.32.9.5', zh: '竞争阶段结构信息元，§10.32.9.5' },
        def: {
          en: 'Rides in a contention round\'s Poll (§10.32.9.5): the response-phase window every anchor draws its slot from, first slot 1, last slot 8 by the model default. Header plus two octets — that content sizing is a model choice, not something the standard lays out byte by byte.',
          zh: '随竞争轮次的 Poll 发送（§10.32.9.5）：给出每个锚点据以抽取时隙的响应窗口，模型默认首时隙 1、末时隙 8。信元头之外仅两字节——具体字节大小是模型选择，标准并未逐字节规定该字段。',
        },
      },
      {
        term: 'RCMA IE',
        alt: { en: 'ranging contention maximum attempts IE, §10.32.9.6', zh: '竞争最大尝试次数信息元，§10.32.9.6' },
        def: {
          en: 'Rides in the same Poll (§10.32.9.6): the retry budget, 3 attempts by the model default — how many rounds in a row an anchor may go unheard before it sits one out. Header plus one octet, again a model sizing choice.',
          zh: '与 RCPS IE 一同随 Poll 发送（§10.32.9.6）：重试预算，模型默认 3 次——锚点最多可连续这么多轮未被测到，此后才空过一轮。信元头之外仅一字节，字节大小同样是模型选择。',
        },
      },
      {
        term: 'TDoA',
        alt: { en: 'time difference of arrival — one-way ranging, standard §10.29.1.2.5', zh: '到达时间差——单向测距，标准 §10.29.1.2.5' },
        def: {
          en: 'The standard\'s one-way alternative to a round trip (§10.29.1.2.5): a device times the difference between two arrivals instead of measuring a distance, and the fix comes from hyperbolic rather than spherical least squares. This simulator runs it in two directions, DL-TDoA and UL-TDoA.',
          zh: '标准中往返测距之外的单向替代方式（§10.29.1.2.5）：设备测的是两次到达时刻之差，而不是一个距离，解算位置时用双曲线最小二乘而不是球面最小二乘。本仿真沿两个方向运行它：DL-TDoA 与 UL-TDoA。',
        },
      },
      {
        term: 'DL-TDoA',
        alt: { en: 'downlink TDoA — the anchors run the round, model FiRa-style content', zh: '下行 TDoA——锚点跑完整轮，内容为模型的 FiRa 风格取值' },
        def: {
          en: 'Anchor 0 sends the Poll and the Final, anchors 1…N−1 Respond in between — the anchors\' round, not the tag\'s — and every message carries the sender\'s own TX counter plus the RX counters it holds for the rest (FiRa-style, model). A tag never transmits: it times every arrival on its own clock and differences each responder against anchor 0. Any number of tags can listen to the one round, so `tags ≤ roundsPerBlock` no longer applies.',
          zh: '锚点 0 发送 Poll 和 Final，锚点 1…N−1 依次在中间 Respond——这是锚点的轮，不是标签的轮——每一帧都携带发送方自己的发送计数器读数，以及它为其余各方保存的接收计数器读数（FiRa 风格，模型取值）。标签从不发射：它只用自己的时钟给每次到达打时间戳，再把各应答锚点与锚点 0 的到达时刻作差。任意数量的标签都能监听同一轮，因此 `tags ≤ roundsPerBlock` 的限制不再适用。',
        },
      },
      {
        term: 'UL-TDoA',
        alt: { en: 'uplink TDoA — one blink per tag, model "wired sync"', zh: '上行 TDoA——每个标签一次闪发，模型“有线同步”' },
        def: {
          en: 'The tag sends one blink and nothing else; anchors sharing one common timebase ("wired sync", model — each anchor carries a fixed residual calibration error, `syncErrorNs`) timestamp it, and the reference anchor computes the differences and the fix itself. One slot per tag, so a block holds blockRstu / slotRstu of them.',
          zh: '标签只发一次闪发帧，别无其他；共享同一公共时基的锚点（模型的“有线同步”——每个锚点都带有一份固定的残余校准误差 `syncErrorNs`）为其打上时间戳，再由参考锚点自行算出差值和定位结果。每个标签占一个时隙，因此一个块能容纳 blockRstu / slotRstu 个标签。',
        },
      },
      {
        term: 'Blink',
        alt: { en: 'one 14-octet frame, model', zh: '一帧 14 字节，模型取值' },
        def: {
          en: 'UL-TDoA\'s only frame: MHR 9 + a 3-octet blink IE + FCS 2 = 14 octets (`UWB_BLINK_BYTES`, model — the standard names a blink-style IE, §10.29.8, but not its byte layout here). It carries no time at all; the anchors take the arrival instant on their own clocks.',
          zh: 'UL-TDoA 中唯一的帧：MHR 9 字节 + 3 字节闪发信元 + FCS 2 字节 = 14 字节（`UWB_BLINK_BYTES`，模型取值——标准提到了闪发类信元，§10.29.8，但并未在此规定其字节布局）。它完全不携带时间信息；到达时刻由各锚点自行在本机时钟上记录。',
        },
      },
      {
        term: 'Hyperbolic positioning',
        alt: { en: 'solveTdoa — Gauss–Newton on range differences, ≥ 3 needed', zh: 'solveTdoa——基于测距差值的高斯-牛顿法，至少需要 3 个' },
        def: {
          en: 'The TDoA counterpart of trilateration: residual (‖p − aᵢ‖ − ‖p − a_ref‖) − c·Δtᵢ, needing at least 3 differences (4 anchors) rather than 3 ranges, because the tag\'s own clock offset has already cancelled out of a difference. Its GDOP comes from the difference rows, not the range rows, so it is not on the same scale as trilateration\'s GDOP — √(2/3) at a square\'s centre, not 1.0.',
          zh: '三边定位在 TDoA 一侧的对应版本：残差为（‖p − aᵢ‖ − ‖p − a_ref‖）− c·Δtᵢ，至少需要 3 个差值（4 个锚点）而不是 3 个距离，因为标签自身的时钟偏差在作差时已经抵消。它的 GDOP 由差值行而非距离行算出，与三边定位的 GDOP 并不在同一量纲上——正方形中心处是 √(2/3)，而不是 1.0。',
        },
      },
      {
        term: 'Clock-rate correction',
        alt: { en: 'tdoaClockCorrection — DL-TDoA only, on by default', zh: 'tdoaClockCorrection——仅 DL-TDoA，默认开启' },
        def: {
          en: 'A listening tag\'s differences span a whole round, so its own crystal does not cancel the way it does in TWR: it measures its own Poll-to-Final interval against the true one the anchors report and rescales its raw differences by that ratio. Off, the error is 20 ppm of the gap between the Poll and the response being timed: up to 6 ms in the five-slot round the lessons run, so 36 m, and 96 m for the last of nine anchors, whose response comes 16 ms after the Poll. On, what is left is the responders\' own clock-offset estimate noise — decimetres.',
          zh: '听测标签的差值跨越了整整一轮，因此它自身晶振的误差不会像 TWR 那样自行相消：它需要用自己测得的“轮询→终结帧”间隔，去对照锚点报出的真实间隔，再按这个比例重新缩放原始差值。关闭时，误差为 20 ppm 乘以从轮询帧到被计时的那一帧之间的间隔：本系列课程那种五时隙轮次里最长 6 ms，即 36 米；若有九个锚点，最后一个应答帧在轮询帧后 16 ms，则是 96 米。打开后，剩下的只是各应答锚点自身的时钟偏差估计噪声——分米级。',
        },
      },
      {
        term: 'AoA',
        alt: { en: 'angle of arrival — a ranging result, standard §10.29.1.1', zh: '到达角——测距结果之一，标准 §10.29.1.1' },
        def: {
          en: 'A bearing from a single anchor, alongside its range (§10.29.1.1 lists angle of arrival among the results a ranging measurement can produce): with two antennas λ/2 apart on the anchor\'s boresight, the phase difference between them (PDoA) inverts to an azimuth whose 1-σ is aoaSigmaDeg — 2.7° at boresight, 5.5° at 60°, clamped at 45° near the ±90° edge of the field of view, where the array goes blind to angle. With DS-TWR, one anchor now holds a range and a bearing and fixes the tag alone.',
          zh: '与距离一同由单个锚点给出的方位角（§10.29.1.1 把到达角列为测距测量可产生的结果之一）：锚点视轴上相距 λ/2 的两根天线之间的相位差（PDoA）反解成方位角，其 1-σ 为 aoaSigmaDeg——正前方 2.7°，60° 处 5.5°，在视场 ±90° 边缘（阵列对角度失去分辨力之处）被限幅在 45°。配合 DS-TWR，一个锚点同时握有距离和方位角，便能单独定出标签的位置。',
        },
      },
      {
        term: 'PDoA',
        alt: { en: 'phase difference of arrival — the model behind AoA, FiRa-style', zh: '到达相位差——AoA 背后的模型，FiRa 风格' },
        def: {
          en: 'The phase difference between an anchor\'s two antennas on a frame from the tag: φ = 2π·(d/λ)·sin θ, where d = λ/2 is the antenna spacing (1.9 cm on channel 9) and θ is the azimuth off boresight. AOA_SIGMA_PHI_RAD = 0.15 rad of receiver phase noise is what makes the inverted bearing noisy, worse the further θ sits from boresight.',
          zh: '锚点两根天线在收到标签一帧时的相位差：φ = 2π·(d/λ)·sin θ，其中 d = λ/2 为天线间距（信道 9 上为 1.9 cm），θ 为偏离视轴的方位角。AOA_SIGMA_PHI_RAD = 0.15 rad 的接收机相位噪声，正是反解出的方位角带有噪声的原因，且 θ 离视轴越远就越差。',
        },
      },
      {
        term: 'Boresight / yaw',
        alt: { en: 'UwbNodeCfg.yawDeg — an anchor\'s antenna-array facing, default 0°', zh: 'UwbNodeCfg.yawDeg——锚点天线阵列的朝向，默认 0°' },
        def: {
          en: 'The direction an anchor\'s two-antenna array faces, in degrees counter-clockwise from +x (0° faces +x, 90° faces +y). Every AoA bearing is reported relative to it, and it is the only defence against the front/back mirror (sin(180° − θ) = sin θ): pointing it at the room keeps every real tag in the front half of the field of view.',
          zh: '锚点双天线阵列所朝的方向，以 +x 轴为 0°、逆时针为正（90° 即指向 +y）。每一个 AoA 方位角都是相对它给出的，也是抵御前后镜像（sin(180° − θ) = sin θ）的唯一手段：把它对准房间，就能让每个真实标签都落在视场的正前方一侧。',
        },
      },
      {
        term: 'Cross-range error',
        alt: { en: 'the AoA fix\'s error across the bearing, horizM·aoaSigmaDeg(θ)', zh: 'AoA 定位中垂直于方位角方向的误差，horizM·aoaSigmaDeg(θ)' },
        def: {
          en: 'The single-anchor AoA fix has two very different axes: along the ray, the range\'s few centimetres of timestamp-noise error; across it, the bearing\'s angle error turned into distance — horizM · aoaSigmaDeg(θ) in radians, worse the farther out and the further off boresight. It dominates past a few centimetres, so the fix\'s error ellipse is long and thin, turned a quarter turn from the ray.',
          zh: '单锚点 AoA 定位的两个轴差异极大：沿射线方向是距离测量中几厘米的时间戳噪声误差；垂直于射线方向则是方位角误差换算出的距离——horizM · aoaSigmaDeg(θ)（以弧度计），距离越远、偏离视轴越多就越差。一旦超过几厘米这一项便占主导，因此定位的误差椭圆又长又扁，且与射线方向相差九十度。',
        },
      },
    ],
  },
  {
    id: 'uwb-mms',
    title: {
      en: 'P802.15.4ab: narrowband-assisted MMS ranging (draft)',
      zh: 'P802.15.4ab：窄带辅助的多毫秒测距（草案）',
    },
    items: [
      {
        term: 'MMS',
        alt: { en: 'multi-millisecond packet — 4ab draft 15-23/0100r2 §2.3.2', zh: '多毫秒数据包——4ab 草案 15-23/0100r2 §2.3.2' },
        def: {
          en: 'One ranging “packet” sent as a train of short fragments a millisecond apart instead of a single burst, so each fragment may spend a whole millisecond’s energy allowance inside its own much shorter length and the receiver may add the fragments up. A train is X ranging sequence fragments then Y integrity fragments, with Z idle milliseconds between them; the session mode is `mms`. Draft material throughout — the balloted D5.0 may differ.',
          zh: '一次测距“数据包”不再是一次突发，而是一列相隔一毫秒发出的短片段：每个片段都能把整整一毫秒的能量额度花在自己那段短得多的长度里，接收机再把这些片段叠加起来。一列序列是 X 个测距序列片段接 Y 个完整性片段，中间空出 Z 个毫秒；对应的会话模式是 `mms`。全部内容均来自草案——已进入投票的 D5.0 可能有所不同。',
        },
      },
      {
        term: 'RSF',
        alt: { en: 'ranging sequence fragment — it carries the RMARKER', zh: '测距序列片段——RMARKER 打在它上面' },
        def: {
          en: 'The fragment a range is timed on: N_MSR repetitions of one MMRS symbol, N_MSR·4·(128 + 2·gap) chips at 499.2 Mchip/s (4ab draft 15-23/0100r2 §2.3.2). It carries no preamble, no SFD, no PHR and no data, so its RMARKER is the peak of its very first pulse — there is no 73.269 µs SHR offset to subtract. The session default (N_MSR 40, gap 64) is 82.05 µs; the mandatory sets run from 62.18 µs to 91.28 µs.',
          zh: '测距时刻就打在这种片段上：它是一个 MMRS 符号重复 N_MSR 次，在 499.2 Mchip/s 下共 N_MSR·4·(128 + 2·间隔) 个码片（4ab 草案 15-23/0100r2 §2.3.2）。它没有前导、没有 SFD、没有 PHR，也没有数据，因此它的 RMARKER 就是第一个脉冲的峰值——不必再减去 73.269 µs 的 SHR 偏移。会话默认值（N_MSR 40、间隔 64）为 82.05 µs；各必选参数集则从 62.18 µs 到 91.28 µs。',
        },
      },
      {
        term: 'RIF',
        alt: { en: 'ranging integrity fragment — one STS segment', zh: '测距完整性片段——一段 STS' },
        def: {
          en: 'The other fragment kind: one scrambled timestamp segment of `stsLen` × 512 chips (STS: standard §16.2.9; the units 4ab draft 15-23/0100r2 §2.3.2), so the default 64 units are 65.64 µs. An RIF train is judged for detection exactly like an RSF train, but it decides only the range’s integrity flag — Y = 0 turns it off, and X = 0 moves the ranging timestamp onto the first RIF instead.',
          zh: '另一种片段：一段加扰时间戳序列，长度为 `stsLen` × 512 个码片（STS 见标准 §16.2.9，单位见 4ab 草案 15-23/0100r2 §2.3.2），因此默认的 64 个单位即 65.64 µs。完整性序列的检出判据与测距序列完全相同，但它只决定测距结果的完整性标志——Y = 0 即关闭，而 X = 0 时测距时间戳会改落到第一个 RIF 上。',
        },
      },
      {
        term: 'MMRS',
        alt: { en: 'the symbol an RSF repeats — 4ab draft 15-23/0100r2 §2.3.2', zh: 'RSF 反复重复的那个符号——4ab 草案 15-23/0100r2 §2.3.2' },
        def: {
          en: 'A length-128 complementary-set sequence split [A, G, B, G], where G is a gap of 0…64 zeros, spread by L = 4 — so one symbol is 4·(128 + 2·gap) chips. The gap is what the mandatory sets vary (25 to 64): more zeros make a longer fragment, and because the millisecond’s energy is spread over that length, a quieter one.',
          zh: '一段长度为 128 的互补序列，按 [A, G, B, G] 切分，其中 G 是 0…64 个零的间隔，整体再按 L = 4 扩频——因此一个符号为 4·(128 + 2·间隔) 个码片。必选参数集变动的正是这个间隔（25 到 64）：零越多，片段越长；又因为一毫秒的能量要摊在这段长度上，片段也就越“轻”。',
        },
      },
      {
        term: 'N_MSR',
        alt: { en: 'MMRS repetitions per RSF — 32, 40, 48, 64, 128 or 256', zh: '每个 RSF 内 MMRS 的重复次数——32、40、48、64、128 或 256' },
        def: {
          en: 'How many MMRS symbols one RSF repeats (4ab draft 15-23/0100r2 §2.3.2). It is the fragment’s length knob and therefore its correlation-gain knob; the mandatory sets use 40 and 32 for the RSF-only trains and 64 for the mixed ones. The editor offers it as a select, because the schema takes only those six values.',
          zh: '一个 RSF 里重复多少个 MMRS 符号（4ab 草案 15-23/0100r2 §2.3.2）。它既是片段长度的旋钮，也就是相关增益的旋钮；必选参数集里，纯 RSF 序列用 40 和 32，混合序列用 64。编辑器把它做成下拉框，因为校验规则只接受这六个取值。',
        },
      },
      {
        term: 'NBA-UWB',
        alt: { en: 'narrowband-assisted UWB — the second radio', zh: '窄带辅助 UWB——第二套电台' },
        def: {
          en: 'The 802.15.4ab architecture this mode implements: the UWB fragments only measure, while a narrowband O-QPSK radio at 250 kb/s carries the control exchange, the acquisition the bare fragments no longer provide, and the measurement report (standard Clause 12 for the PHY; the configuration 4ab draft 15-23/0100r2 §2.3.1). It transmits at 10 dBm and hears down to −100 dBm (both model).',
          zh: '本模式实现的正是 802.15.4ab 的这套架构：UWB 片段只负责测量，而一套 250 kb/s 的 O-QPSK 窄带电台承担控制交互、承担这些“素”片段不再提供的捕获，以及测量报告的传递（物理层见标准 Clause 12，具体配置见 4ab 草案 15-23/0100r2 §2.3.1）。它以 10 dBm 发射，灵敏度到 −100 dBm（两者皆为模型取值）。',
        },
      },
      {
        term: 'NB control channel',
        alt: { en: '250 channels 2.5 MHz apart, in UNII-3 and UNII-5', zh: 'UNII-3 与 UNII-5 中间隔 2.5 MHz 的 250 个信道' },
        def: {
          en: 'The narrowband plan: 50 channels in UNII-3 (5725–5850 MHz) and 200 in UNII-5 (5925–6425 MHz), numbered 0…249, the first centred at 5726.25 MHz and channel 50 at 5926.25 MHz (4ab draft 15-22/0381r5 §1.4.1 gives the counts and the band edges; the centre formula itself is reconstructed from them — model). A session carries an allow list and each ranging block picks one entry of it; the draft hops with AES-128-CTR over the block index (§1.5.3), where this engine uses its own string hash (model).',
          zh: '窄带信道规划：UNII-3（5725–5850 MHz）内 50 个、UNII-5（5925–6425 MHz）内 200 个，编号 0…249，0 号中心为 5726.25 MHz、50 号为 5926.25 MHz（4ab 草案 15-22/0381r5 §1.4.1 给出了数量与频段边界；中心频率公式本身是据此反推的——模型取值）。会话带着一份白名单，每个测距块从中挑一项；草案用对块序号做 AES-128-CTR 来跳信道（§1.5.3），本引擎则用自己的字符串哈希顶替（模型取值）。',
        },
      },
      {
        term: 'LBT / frame-based equipment',
        alt: { en: 'listen before talk — 4ab draft 15-22/0381r5 §1.4.2', zh: '先听后说——4ab 草案 15-22/0381r5 §1.4.2' },
        def: {
          en: 'The rule the narrowband radio brings with it for sharing 6 GHz: assess the channel for at least 9 µs against −75 dBm/MHz of energy and transmit within 16 µs if it is clear (the draft cites the ETSI EN 303 687 frame-based-equipment rules). Over a 2.5 MHz channel that threshold is −71.02 dBm (model reading). Busy costs the whole block: the device sends nothing more on narrowband until the next one, and logs UWB_NB_LBT. Mandatory in UNII-5, optional in UNII-3, which is what the `auto` setting follows.',
          zh: '窄带电台为共享 6 GHz 而带来的规则：发送前对信道至少评估 9 µs，门限为 −75 dBm/MHz 的能量，若判为空闲则须在 16 µs 内发出（草案援引 ETSI EN 303 687 的“基于帧的设备”规则）。摊到 2.5 MHz 的整个信道上，这个门限即 −71.02 dBm（模型读法）。判忙的代价是整整一个测距块：该设备在下一个块之前不再发送任何窄带帧，并记录 UWB_NB_LBT。UNII-5 必须执行、UNII-3 可选，这正是 `auto` 一档的依据。',
        },
      },
      {
        term: 'Millisecond energy budget',
        alt: { en: '37 nJ per millisecond — regulation, via 4ab draft 15-22/0205r0', zh: '每毫秒 37 nJ——法规，经 4ab 草案 15-22/0205r0 转引' },
        def: {
          en: 'Why MMS exists at all. The UWB limit is a mean EIRP of −41.3 dBm/MHz averaged over 1 ms, which over 499.2 MHz is −14.3 dBm and so about 37 nJ a millisecond (FCC Part 15.519 / ETSI EN 302 065). A 4z Poll spends roughly 7.5 nJ of its millisecond and then stops; a fragment spends the full 37 nJ inside its own much shorter length — −3.46 dBm for the default 82.05 µs RSF (model). Of the total gain a train shows, that burst power is one part and 10·log10(X) of combining is the other, and the lesson says so plainly.',
          zh: 'MMS 之所以存在的根本原因。UWB 的限制是平均 EIRP −41.3 dBm/MHz（在 1 ms 上取平均），折合到 499.2 MHz 即 −14.3 dBm，也就是每毫秒约 37 nJ（FCC Part 15.519 / ETSI EN 302 065）。一帧 4z 轮询只花掉这一毫秒里约 7.5 nJ 就结束了；而一个片段把整整 37 nJ 花在自己那段短得多的长度里——默认 82.05 µs 的 RSF 即 −3.46 dBm（模型取值）。一列序列显示出的总增益里，这种突发功率是其中一份，10·log10(X) 的相干合并是另一份，课程会把这一点讲明白。',
        },
      },
      {
        term: 'Coherent combining',
        alt: { en: '10·log10(X) dB from X fragments — model', zh: 'X 个片段换来 10·log10(X) dB——模型取值' },
        def: {
          en: 'What the receiver does with a train: primed by the narrowband exchange, it accumulates blind and, at the train’s end, counts the fragments it heard. The train is detected when rxDbm + 10·log10(heard) clears −93 dBm, so no single fragment has to be audible on its own. The largest train the model allows is 16 fragments, i.e. 12.04 dB — which is also the channel’s delivery floor, since a fragment quieter than −93 − 12.04 dB cannot be rescued by any train and need not be carried at all.',
          zh: '接收机对一列序列所做的事：它已由窄带交互“预热”，于是盲累加，等序列结束时再清点听到了多少个片段。当 rxDbm + 10·log10(听到的个数) 越过 −93 dBm 时，该序列即判为检出，因此任何单个片段都不必自己就能被听见。本模型允许的最长序列是 16 个片段，即 12.04 dB——这同时也是信道的投递地板：比 −93 − 12.04 dB 还弱的片段，任何序列都救不回来，也就根本不必投递。',
        },
      },
      {
        term: 'Train-derived clock ratio',
        alt: { en: 'the train as a millisecond-long ruler — model', zh: '把片段序列当作一把毫秒长的尺子——模型取值' },
        def: {
          en: 'Two fragments of one train are an exact whole number of the transmitter’s milliseconds apart, so a receiver that heard both measures that span on its own counter and reads the clock ratio straight off it, with σ = √2·σ_ts / span — 0.0202 ppm over the default train’s 7 ms. What that leaves in a corrected single-sided range is ½·T_reply·σ: 1.5 mm at a 0.5 ms reply, against 1.5 cm from the narrowband carrier estimate alone and 1.5 m uncorrected. It is why MMS needs no double-sided round, and it is also what the RMARKER is walked back with when a train’s leading fragments were lost: the milliseconds walked back are the transmitter’s, and an undrifted one would cost 3.0 m of range per lost fragment at 20 ppm. A device that heard one fragment only falls back to the carrier-offset draw, and to its own nominal millisecond.',
          zh: '同一序列中的两个片段，按发送方的时钟恰好相隔整数个毫秒，因此同时听到两者的接收机只要用自己的计数器量出这段跨度，就直接读出了时钟比率，其 σ = √2·σ_ts / 跨度——默认序列跨度 7 ms，对应 0.0202 ppm。它在修正后的单边测距里留下的是 ½·T_reply·σ：回复时间 0.5 ms 时为 1.5 mm，而仅凭窄带载波频偏估计是 1.5 cm，完全不修正则是 1.5 m。这正是 MMS 不需要双边测距轮次的原因；当序列的前导片段丢失时，RMARKER 也靠它往回推：回推的毫秒属于发送方，若按未修正的毫秒回推，在 20 ppm 下每丢一个前导片段就是 3.0 m 的测距误差。只听到一个片段的设备则退回到载波频偏抽取，并只能用自己的标称毫秒。',
        },
      },
    ],
  },
]
