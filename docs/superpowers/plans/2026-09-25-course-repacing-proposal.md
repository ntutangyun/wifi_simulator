# Re-pacing the course: 47 lessons become 75

The course goes from **47 lessons to 75**. Twenty of the 47 stay as one lesson,
27 split into two, and one lesson is new — `cca`, for a rule the course states
in three places and shows in none. Every split reuses the first half's scene, so
**no recorded hash value changes**: the 121 fixture lines this adds are copies of
hashes that already exist. Nothing is rewritten from scratch; the work is
cutting, dividing and drawing.

The sizes tell the story. Today every lesson is 1,391–2,587 Chinese characters
and every one is estimated at 15–25 minutes: 47 lessons written to a ceiling,
all landing in the same narrow band. After this, a lesson is 600–1,300
characters, one procedure, one or two things to watch, and 10–15 minutes.

## 1. What a lesson becomes

- **One topic, one procedure, one scene.** If a lesson states two rules the
  engine follows, it is two lessons. If it carries two `steps` blocks, that is
  the tell.
- **600–1,300 characters on the main path.** Not a budget — an observation
  about what one topic needs. `lessonMinutes` then lands at 10–15 minutes with
  one or two `observe` lines and one or two experiments.
- **A split half must have something to watch.** Two proposed halves failed this
  test and were changed: the CCA material and the roles/naming material had
  prose and a quiz but no scene. See §7.
- **A procedure never leaves its scene.** Where a `steps` block spans both
  halves, each half gets the part of the procedure its own scene demonstrates,
  end to end — never a procedure whose steps 4–6 are in another lesson.
- **Diagrams replace prose, not decorate it.** 54 of the 75 lessons get one; 21
  get none.

## 2. The split table

Length is the target for the main path (`why` + `picture` + `numbers`), in
Chinese characters. "Whole" means the lesson stays one lesson; it still loses
padding and usually gains a diagram.

### Tier 1 · M1 信号与链路 (from `radio-primer`, `decode-thresholds`)

| now | carries | becomes | id | the one topic | length |
|---|---|---|---|---|---|
| `radio-primer` 1391 | RSSI/path loss/walls · noise floor · SINR · dB arithmetic | 2 | `radio-primer` | 发射功率减去路径损耗与每一堵墙，得到到达电平（RSSI） | 800 |
| | | | `noise-floor` | 这段带宽上的噪声地板，以及邻居叠上来之后的 SINR | 800 |
| `decode-thresholds` 2125 | three questions (detect / CCA / decode) · sensitivity + 3 dB margin · the 14-rung ladder · the rate-picking algorithm | 2 (+`cca`, M4) | `decode-thresholds` | 一帧什么时候解得出来：每一级的所需信干噪比与 3 dB 余量 | 900 |
| | | | `mcs-ladder` | 十四级阶梯：调制、编码率，以及选级算法 | 1100 |

`radio-primer` keeps both jumps, both observe lines, both experiments and the
four position variants. `noise-floor` takes the noise formula, the bandwidth
table, the mW addition, the `linkBudget` widget (its payoff is the SINR step)
and both quiz questions; its watch reads SNR off the same four variants — **not a
new 80/160 MHz variant**, which would cost a new hash.

### Tier 1 · M2 一张网里的角色 (from `roles-stack`)

| now | carries | becomes | id | the one topic | length |
|---|---|---|---|---|---|
| `roles-stack` 1893 | AP/STA roles · BSS/BSSID/SSID · everything via the AP · MSDU/MPDU/PPDU wrapping · MAC–PHY primitives · IBSS/TDLS survey | 2 | `roles-stack` | 一个接入点加入它的设备就是一张网：BSS、BSSID 与你挑的那个 SSID | 700 |
| | | | `relay-hops` | 手机发给手机也要经过接入点：两跳，几乎两倍的时延 | 900 |

The four-layer wrapping table and the 信封 paragraph **leave this lesson** — they
pre-teach `frame-anatomy`'s own opening. `roles-stack` takes over the two
currently unused jumps (第一个上行数据帧 / 第一个下行数据帧) as its scene:
every station's frame is addressed to the AP. `relay-hops` keeps the five-step
relay timeline, the one-hop-vs-two-hop table, both experiments and both observe
lines. Note: another agent is editing `roles-stack` right now; if that pilot
lands a stack diagram there, the diagram moves with the layering into
`frame-anatomy`.

### Tier 1 · M3 帧与空口时间 (from `frame-anatomy`, `frame-anatomy-bytes`, `airtime`)

| now | carries | becomes | id | the one topic | length |
|---|---|---|---|---|---|
| `frame-anatomy` 2418 | three-layer naming · frame control · three addresses · duration · sequence · FCS · QoS/TID · build-a-frame | 2 | `frame-anatomy` | 帧头逐个字段：这是什么、谁必须接住、还要多久、这是第几个 | 1200 |
| | | | `frame-qos-fcs` | 业务类别标记（QoS 控制、TID）与末尾的帧校验（FCS） | 900 |
| `frame-anatomy-bytes` 2308 | the three legacy preamble fields · per-generation preambles · bytes→µs · small frames · one preamble per burst · reservation durations | 2 | `frame-anatomy-bytes` | 每一帧前面那段前导码，以及从字节数到微秒的算法 | 1100 |
| | | | `small-frames` | 小帧的成本，以及许多帧为什么共用一个前导码 | 900 |
| `airtime` 2007 | why a frame can't start bare · symbols scale, preamble doesn't · the ACK is paid too · the whole exchange | **whole** | `airtime` | 一次交互占住信道多久，其中多少不是你的载荷 | 1200 |

`frame-anatomy` keeps jumps 0 and 2 (legacy frame, first retry), quiz 1 and 3,
and gains the MSDU/MPDU/PPDU opening from `roles-stack`. `frame-qos-fcs` keeps
jump 1 (QoS frame), both experiments (EDCA off; the old laptop to Wi-Fi 5) and
quiz 2. `frame-anatomy-bytes` becomes the sole owner of the bytes→microseconds
procedure; `airtime` keeps only steps 5–6 (the ACK's own rate, the SIFS) and
cites the earlier result. **`airtime` stays whole and I will defend it:** once the
duplicated derivation is gone, what is left — the channel is time, the ACK is
compulsory, 88.0 of 169.6 µs is not payload — is one small topic with one scene,
and every observe line and quiz already serves it.

### Tier 1 · M4 等待与退避 (from `ifs`, `backoff`, `nav`)

| now | carries | becomes | id | the one topic | length |
|---|---|---|---|---|---|
| `ifs` 2126 | SIFS · DIFS · EIFS (never fires in this scene) | **whole**, EIFS out | `ifs` | 两种等待：续完一次交互的 SIFS，和讨要新机会的 DIFS | 1000 |
| — | (new) | 1 | `cca` | 空闲判断：前导检测的 −82 dBm 与能量检测的 −62 dBm，中间那二十分贝 | 900 |
| `backoff` 2116 | the draw · counting idle slots · freezing · collision · ACK timeout deadline · CW doubling | 2 | `backoff` | 抽一个数，只在空闲时隙里倒数，别人一发就冻住 | 1000 |
| | | | `collisions-cw` | 沉默就是失败：45 µs 的期限，以及把窗口翻倍 | 1000 |
| `nav` 1966 | Duration promises · virtual carrier sense · a freeze whose length is unknown | **whole** | `nav` | 一个字段装上一只倒计时：虚拟载波侦听 | 1300 |

`ifs` loses the EIFS row, paragraph, term and **quiz question**: no station in
its scene ever waits an EIFS, the lesson says so, and the quiz therefore tests a
rule the reader never sees. All of it moves to `edca-cost`, whose scene has the
jump (上传站点的第一次 EIFS) already. What stays is a one-line forward pointer.

`cca` is the one lesson with no parent. The three-questions table, the
preamble-detection threshold and the twenty decibels are stated in
`decode-thresholds` today with nothing to watch. `cca` **loads `backoff`'s
scene** (`sameSceneAs: 'backoff'`): there a station really does freeze on a
neighbour's frame, which is a busy CCA, and the same twenty decibels are why the
two stations in `hidden` never freeze at all. It costs one fixture line and a
new jump predicate over an existing record type.

`backoff` keeps jump 2 (freeze) and the slot-counting experiment;
`collisions-cw` keeps jumps 0, 1 and 3, the deadline table, the doubling table
and 864 帧/47 次碰撞.

### Tier 1 · M5 听不见的邻居与损失 (from `hidden`, `anomaly`, `retries-queues`)

| now | carries | becomes | id | the one topic | length |
|---|---|---|---|---|---|
| `hidden` 2174 | the corridor house · why listening fails · RTS/CTS · the threshold · cost and benefit | 2 | `hidden` | 两台站点听不见彼此，于是"先听"救不了它们 | 900 |
| | | | `rts-cts` | 让接入点大声替你预约：RTS/CTS 与门限 | 1100 |
| `anomaly` 1983 | equal turns · unequal turn length · the clock is what is shared · nobody is cheating | **whole** | `anomaly` | 轮次是公平的，空口时间不是：一台慢站点拖住所有人 | 1300 |
| `retries-queues` 2135 | no answer · each attempt costs more · retry limit · the queue · lifetime · queue full | 2 | `retries-queues` | 一帧的七次尝试，以及第七次之后的放弃 | 1000 |
| | | | `queues` | 队列、生存期与门口丢帧：三种放弃各在什么时候发生 | 1100 |

`hidden` keeps the base scene and jump 0; `rts-cts` keeps the protected variant,
the six-step procedure, the 718 µs worked table and the on/off comparison. Both
carry the same variant list (the kit requires it).

`retries-queues` keeps jumps 0–2, the seven-attempt table and the two-counters
depth; `queues` keeps jumps 3–5, both variants, the three-drop-reason table, the
three-setting comparison, the head-of-line depth and both experiments — except
the RTS-threshold experiment, which drags `hidden`'s mechanism into the middle of
a queue lesson and belongs in the project.

**`anomaly` stays whole**, at 1,300 characters: equal turns and unequal airtime
are one claim read two ways. But its capture-effect depth (为什么赢的是更强的前导码,
with its own dB table) is a *different* mechanism with nothing to watch here —
no jump anchors it. It moves to `rate-vs-model`, which already explains capture
and has the scene for it.

### Tier 1 · M6 在纸上预测 DCF (from `bianchi`, `bianchi-vs-sim`)

| now | carries | becomes | id | the one topic | length |
|---|---|---|---|---|---|
| `bianchi` 2267 | saturation · the two equations and their fixed point · pricing a slot · throughput | 2 | `bianchi` | 两个方程，一对只能一起成立的数：τ 和 p | 1100 |
| | | | `bianchi-throughput` | 给平均一个信道时隙标价，于是概率变成比特 | 1000 |
| `bianchi-vs-sim` 2367 | how the two columns are made · the arc agrees · close in it does not · the smaller causes · the residual | 2 | `bianchi-vs-sim` | 圆弧上：两列数字怎么做出来，差在哪儿，以及如实报出残差 | 1200 |
| | | | `rate-vs-model` | 挪到近处，崩掉的是速率而不是竞争 | 1100 |

`bianchi` keeps steps 1–4 and the p column; `bianchi-throughput` takes steps
5–7, the T_s/T_c formula and the measured 4.421 Mb/s, and **must take jump 0
(第一个数据帧) as its own watch** — a successful exchange on screen is the
2,158 µs it is pricing. Without that anchor this is a bad split; with it, it is
still the one I am least sure of (§9).

`bianchi-vs-sim` keeps the arc variants, the six-step method, the three smaller
differences (the slot clock, the restart moments, the cost of a collision) and
the residual; `rate-vs-model` keeps the close-in base scene, the alibi table,
capture, the CARA pointer, and the capture material arriving from `anomaly`.

### Tier 1 · M7 第一阶段项目

`tier1-project` and `tier1-project-review` **both stay whole** — 2,341 and 2,325
characters of brief and marking, already split along the only seam that matters
(predict, then read). Splitting further would separate a prediction from its
check, which is the exercise. Two cuts: `tier1-project`'s depth teaches a
wider-channel scenario that no variant can load (either make it a fourth variant
— a new hash — or delete it; I would delete it), and `tier1-project-review`'s
prose for the estimator, the deafness and the rate residual is already carried
quantitatively by its 差距出在哪里 table.

### Tier 2 · M8 QoS 与效率 (from `edca`, `ampdu`, `txop`, `txop-protect`)

| now | carries | becomes | id | the one topic | length |
|---|---|---|---|---|---|
| `edca` 2539 | four categories · AIFS and CW knobs · the head start per round · no preemption · who is last | 2 | `edca` | 四条队列，两个旋钮：AIFSN 与竞争窗口如何分出胜负 | 1300 |
| | | | `edca-cost` | 抢先接入值多少，谁替它买单——以及唯一摊上 EIFS 的那台站点 | 1000 |
| `ampdu` 2047 | fixed price vs variable · one preamble, many frames · one BlockAck · one bad subframe | **whole** | `ampdu` | 竞争一次发一批：把固定开销摊到十四帧上 | 1300 |
| `txop` 2111 | winning buys a rental · the limit clock · usually the queue ends it · why this is fair | **whole** | `txop` | 赢一次就占住发言权，直到队列空了或钟走完 | 1300 |
| `txop-protect` 2390 | protecting a burst · announcing the whole round · CF-End · three policies · CTS-to-self | 2 | `txop-protect` | 一句 RTS 加一句 CTS，把整串帧都预约下来 | 1200 |
| | | | `protect-policies` | 三种预告方式与 CF-End：把没用完的时间还回去 | 1100 |

**`ampdu` and `txop` stay whole.** Each is one mechanism with one measurable
payoff; `ampdu`'s BlockAck half would be a lesson with one jump and one observe
line, which is the bad split the user warned about. Both lose an aside instead:
`ampdu` the ADDBA handshake ("你在时间轴上看不到它"), `txop` the
Duration-telegraphing paragraph that `txop-protect` teaches properly.

### Tier 2 · M9 容量旋钮与速率控制 (from `width`, `streams`, `rate`, `rate-fallback`)

| now | carries | becomes | id | the one topic | length |
|---|---|---|---|---|---|
| `width` 2260 | more lanes · the preamble floor · noise scales with width · the inversion · neighbours | **whole** | `width` | 加宽信道换来更短的帧，代价是噪声——直到 160 MHz 反而更慢 | 1400 |
| `streams` 1814 | streams multiply bits per symbol · both ends must agree · free of noise · diminishing | **whole** | `streams` | 多一条空间流，每个符号多一份比特，而且不用多收噪声 | 1300 |
| `rate` 2053 | two ways to be wrong · the ceiling the signal imposes · only ACK or silence | **whole**, rule out | `rate` | 上限由信号定，而发送端只知道"答了"或"没答" | 1000 |
| `rate-fallback` 1869 | the ARF rule · what an excursion looks like · where failures come from · who pays | 2 | `rate-fallback` | ARF：两次失败降一级，十次成功升一级 | 1000 |
| | | | `rate-cost` | 跌落的账单：20.2% 的帧吃掉 29.7% 的空口时间，邻居也在付 | 1000 |

**`width` stays whole** and keeps its four variants: the inversion is not a
second topic, it is this topic's payoff, and its worked 80/160 MHz table is the
proof. It loses 还有邻居, a paragraph with no numbers and no scene.
**`streams` stays whole** — it is the leanest lesson in the course already.
**`rate` stays whole but gives up its `steps` block:** it re-teaches the exact
ARF rule (two failures down, ten successes up) that `rate-fallback` then teaches
in full with better support. `rate` keeps the ceiling and the epistemic limit;
the loop belongs to `rate-fallback`.

### Tier 2 · M10 被调度的 Wi-Fi 6/7 (from `ofdma-dl`, `ofdma-ul`, `mumimo`, `mlo`)

| now | carries | becomes | id | the one topic | length |
|---|---|---|---|---|---|
| `ofdma-dl` 2146 | slicing sub-carriers · the AP alone decides · what slicing buys and does not | **whole** | `ofdma-dl` | 一次发送切成几片，一帧点着两台电视的名字 | 1300 |
| `ofdma-ul` 2379 | why uplink is hard · the five things a trigger frame fixes · the TB PPDU · the round's cost · one third of the traffic | 2 | `ofdma-ul` | 触发帧钉死五件事：谁答、在哪儿答、答多长、答多响、什么时候答 | 1100 |
| | | | `tb-round` | 一次触发回合的账，以及为什么它是邀请而不是命令 | 1000 |
| `mumimo` 2320 | space instead of frequency · sounding · antennas cap the group · who wins | 2 | `mumimo` | 按空间划分：同一块频谱用两遍，组的大小由天线数封顶 | 1100 |
| | | | `mumimo-choose` | 按频率还是按空间：路由器这一轮怎么选 | 1100 |
| `mlo` 2483 | two radios, one queue · what is shared · what the second link buys · what it does not · EMLSR | 2 | `mlo` | 一条共享的帧队列，两台各自竞争的电台 | 1200 |
| | | | `mlo-gain` | 第二条链路买到的是一个空频段，而不是空口时间 | 1000 |

`ofdma-dl` stays whole; it is already close to the target shape. `ofdma-ul`
carries **two `steps` blocks** today (触发帧把哪些事定死了, and the seven-step
round), which is why I split it — with a caveat in §9. `mlo` is the worst
repetition case in the Wi-Fi track: three tables, each followed by a paragraph
that restates it. Half of that prose goes.

### Tier 2 · M11 环境能量物联网 (AMP) — paused

`amp-intro`, `amp-ppdu`, `amp-slots`, `amp-coexist` are untouched by this
proposal. AMP stays paused; two of them are still in `MIGRATING`.

### Tier 2 · M12 真实应用

`capstone` **stays whole.** Its question — 哪一个单项改动，对这个家庭的改善最大 —
cannot be answered from any single mechanism, and the seven-device scene is the
point. Two fixes: trim one of the two paragraphs that re-narrate the comparison
table, and either add a third experiment for the tablet/OFDMA change or drop
that column, because it is in the table and the quiz but has no experiment.

### UWB M13 飞行时间 · M14 两只钟

| now | carries | becomes | id | the one topic | length |
|---|---|---|---|---|---|
| `uwb-intro` 1555 | why time not RSSI · one SS-TWR round · unsynchronised clocks cancel · cm-level noise | **whole** | `uwb-intro` | 四个计数读数，两次相减，一次折半，得到米 | 1200 |
| `uwb-frame` 2095 | SYNC/SFD/RMARKER/STS/PHR/PSDU · where the timestamp is latched · slots (teaser) | **whole** | `uwb-frame` | 一帧测距帧的各段，以及时间戳打在 RMARKER 那一刻 | 1400 |
| `uwb-sts` 2260 | the relay attack · what the attacker steals · STS as the fix · what the simulator does instead | **whole** | `uwb-sts` | 在取时间的位置放一段猜不出来的脉冲，转发攻击就作废 | 1500 |
| `uwb-sstwr` 2298 | the reply-time ramp from crystal rate error · Coffs correction · residual | **whole** | `uwb-sstwr` | 等得越久误差越大，而载波锁定顺带量出了对面那只钟 | 1500 |
| `uwb-dstwr` 2293 | a third message · both halves wrong · why the clocks cancel · the cost in slots | **whole** | `uwb-dstwr` | 两次往返相乘再相减，两只钟在算式两边抵消 | 1400 |

**Five UWB lessons in a row stay whole, and this is deliberate.** Each is one
argument whose halves do not stand alone: a ramp without its correction leaves
the reader with a defect and no fix; a relay attack without STS is the same;
`uwb-frame`'s field walk and its RMARKER procedure are one question ("where is
the time taken, and why there"). They shed padding instead — see §6 — and
`uwb-intro` loses its whole `deeper` section, which pre-plays `uwb-sstwr`.

### UWB M15 会话网格 · M16 定位

| now | carries | becomes | id | the one topic | length |
|---|---|---|---|---|---|
| `uwb-blocks` 2380 | block/round/slot · the schedule flies with the first frame · radio-on vs allocated · slot length floor | 2 | `uwb-blocks` | 块、轮、时隙：发送之前时间就分完了，没人竞争 | 1200 |
| | | | `uwb-slot-budget` | 时隙该多长：下限、余量，以及射频真正开着的那点时间 | 1100 |
| `uwb-position` 2234 | four circles · least squares · the fourth is the check · two unknowns · one round one point | **whole** | `uwb-position` | 四个距离交不到一点，于是解一个最小二乘 | 1400 |
| `uwb-geometry` 2198 | GDOP and the ellipse · the wall on one path · what the ellipse will not tell you · FoM | 2 | `uwb-geometry` | 锚点站在哪里决定同一台射频给出多好的答案：GDOP 与椭圆 | 1200 |
| | | | `uwb-nlos` | 一条说谎的距离：GDOP 和椭圆一动不动，只有残差和品质因数知道 | 1100 |

`uwb-blocks` today has the odd shape of a lesson whose quizzes and both
experiments belong to its second topic; the split fixes that. `uwb-blocks` keeps
all five jumps and both observe lines and needs one new quiz; `uwb-slot-budget`
keeps the 0.5 ms variant, both experiments, both quizzes, and gets the
minimum-slot rule written as its `steps` block (it is engine-enforced — the
editor snaps 285 RSTU to 300 — and is prose today).

`uwb-geometry` keeps the 三个锚点 variant, the GDOP procedure and quiz 3;
`uwb-nlos` keeps the 砖墙 variant, quiz 1 and 2, the NLOS-toggle experiment, and
becomes the single home of the FoM byte (explained twice today).

### UWB M17 共存 · M18 竞争式测距 · M19 单向测距 · M20 角度

| now | carries | becomes | id | the one topic | length |
|---|---|---|---|---|---|
| `uwb-coexist` 2462 | overlap and the asymmetry · what each side hears · a spare anchor absorbs it · three remedies | 2 | `uwb-coexist` | 一次 Wi-Fi 猝发怎么杀掉一帧测距帧，而反方向什么也没发生 | 1200 |
| | | | `uwb-coexist-fixes` | 三个办法：拉开距离、部分重叠、搬到 9 号信道——以及备用锚点 | 1200 |
| `uwb-contention` 2525 | no roll call · draws · two answers in one slot · sit-out · window width trade-off | 2 | `uwb-contention` | 没被点名也能作答：抽一个时隙，撞了就没人告诉你 | 1200 |
| | | | `uwb-window-width` | 窗口宽度的取舍：碰撞少了，等待长了，误差也大了 | 1100 |
| `uwb-dl-tdoa` 2482 | anchors open the round · differences not distances · hyperbolas · the badge's own clock · cost does not grow | 2 | `uwb-dl-tdoa` | 只听不发的标签量的是时间差，落在一条双曲线上 | 1200 |
| | | | `uwb-dl-tdoa-clock` | 拿参考锚点报出的那段跨度去校自己的钟 | 1100 |
| `uwb-ul-tdoa` 2587 | the blink · the infrastructure solves · the anchors' common time base · bias not noise · blink vs listen | 2 | `uwb-ul-tdoa` | 标签只发一帧闪发，位置由基础设施算出来 | 1200 |
| | | | `uwb-sync-error` | 锚点之间的校准偏差是偏差，不是噪声——平均不掉 | 1000 |
| `uwb-aoa` 2250 | phase difference to bearing · off-axis cost · range + bearing = a fix · height · behind the anchor | 2 | `uwb-aoa` | 两根相距半波长的天线，一个相位差，一个方位角 | 1100 |
| | | | `uwb-aoa-fix` | 一个锚点定一个点：圆与射线相交，以及它看不见的那一半 | 1100 |

Both coexistence lessons and both TDoA lessons split along the same seam
(diagnose, then fix / concept, then the one correction it needs), which is a good
sign: the seam is real, not imposed.

### UWB M21 多毫秒片段 · M22 窄带控制面 · M23 综合

| now | carries | becomes | id | the one topic | length |
|---|---|---|---|---|---|
| `uwb-mms` 2494 | the room a frame cannot cross · the 1 ms average limit · fragments · combining · **the round anatomy (duplicate)** · the wall bias | 2 | `uwb-mms` | 一个帧过不去的房间：把能量摊到许多毫秒的片段上 | 1200 |
| | | | `uwb-mms-bias` | 够得着不等于测得准：穿墙的首径给每次测距加了 1.199 m | 900 |
| `uwb-mms-numbers` 2244 | the per-ms energy budget · dB combining · the 3 dB cliff · **the 14 ms ruler** · honest gain accounting | 2 | `uwb-mms-numbers` | 那 19.57 dB：能量额度、合成增益与余量 | 1300 |
| | | | `uwb-mms-ruler` | 一串片段同时是一把尺子：从跨度量出时钟比值 | 900 |
| `uwb-nba` 2265 | two radios, two jobs · the three narrowband messages · why not on the wideband radio · the 26 ms grid · **the coexistence teaser** | 2 | `uwb-nba` | 小射频说话，大射频计时：Poll、Response、Report | 1200 |
| | | | `uwb-nba-grid` | 两部射频跑在同一张格子上：52 个时隙，说话不是零头 | 1100 |
| `uwb-nba-coexist` 2385 | LBT and the threshold · a busy verdict costs a whole block · hopping · the reverse direction | 2 | `uwb-nba-coexist` | 先听后发：一次判忙赔掉整个测距块 | 1200 |
| | | | `uwb-nba-channels` | 跳变是在平均，不是在躲开——而 Wi-Fi 替它付了 44.58 Mb/s | 1100 |
| `uwb-capstone` 2556 | one house, three decisions, one systematic bias | **whole** | `uwb-capstone` | 在这套房子里把手机定位出来：三个决定，一份可批改的报告 | 1500 |

The biggest single redundancy in the course is here: **`uwb-mms` and `uwb-nba`
both teach the whole Poll → Response → fragments → Report round**, with
near-identical `steps` blocks and worked tables over the same scenario.
`uwb-nba` becomes the sole owner; `uwb-mms` keeps one forward-referencing
sentence. That is what makes room for `uwb-mms`'s own topic to breathe.
`uwb-capstone` **stays whole** for the same reason as `capstone`.

## 3. The new reading order

`COURSE_ORDER` tolerates ids with no authored lesson (`orderLessons` skips
them), so this list can land in one commit before any lesson is written.

```ts
export const COURSE_ORDER: string[] = [
  // Tier 1 — M1 信号与链路
  'radio-primer', 'noise-floor', 'decode-thresholds', 'mcs-ladder',
  // Tier 1 — M2 一张网里的角色
  'roles-stack', 'relay-hops',
  // Tier 1 — M3 帧与空口时间
  'frame-anatomy', 'frame-qos-fcs', 'frame-anatomy-bytes', 'small-frames', 'airtime',
  // Tier 1 — M4 等待与退避
  'ifs', 'cca', 'backoff', 'collisions-cw', 'nav',
  // Tier 1 — M5 听不见的邻居与损失
  'hidden', 'rts-cts', 'anomaly', 'retries-queues', 'queues',
  // Tier 1 — M6 在纸上预测 DCF
  'bianchi', 'bianchi-throughput', 'bianchi-vs-sim', 'rate-vs-model',
  // Tier 1 — M7 第一阶段项目
  'tier1-project', 'tier1-project-review',
  // Tier 2 — M8 QoS 与效率
  'edca', 'edca-cost', 'ampdu', 'txop', 'txop-protect', 'protect-policies',
  // Tier 2 — M9 容量旋钮与速率控制
  'width', 'streams', 'rate', 'rate-fallback', 'rate-cost',
  // Tier 2 — M10 被调度的 Wi-Fi 6/7
  'ofdma-dl', 'ofdma-ul', 'tb-round', 'mumimo', 'mumimo-choose', 'mlo', 'mlo-gain',
  // Tier 2 — M11 环境能量物联网（802.11bp）— paused
  'amp-intro', 'amp-ppdu', 'amp-slots', 'amp-coexist',
  // Tier 2 — M12 真实应用
  'capstone',
  // UWB Tier 1 — M13 飞行时间
  'uwb-intro', 'uwb-frame', 'uwb-sts',
  // UWB Tier 1 — M14 两只钟
  'uwb-sstwr', 'uwb-dstwr',
  // UWB Tier 1 — M15 会话网格
  'uwb-blocks', 'uwb-slot-budget',
  // UWB Tier 1 — M16 定位
  'uwb-position', 'uwb-geometry', 'uwb-nlos',
  // UWB Tier 2 — M17 共存
  'uwb-coexist', 'uwb-coexist-fixes',
  // UWB Tier 2 — M18 竞争式测距
  'uwb-contention', 'uwb-window-width',
  // UWB Tier 2 — M19 单向测距
  'uwb-dl-tdoa', 'uwb-dl-tdoa-clock', 'uwb-ul-tdoa', 'uwb-sync-error',
  // UWB Tier 2 — M20 角度
  'uwb-aoa', 'uwb-aoa-fix',
  // UWB Tier 3 — M21 多毫秒片段
  'uwb-mms', 'uwb-mms-numbers', 'uwb-mms-ruler', 'uwb-mms-bias',
  // UWB Tier 3 — M22 窄带控制面
  'uwb-nba', 'uwb-nba-grid', 'uwb-nba-coexist', 'uwb-nba-channels',
  // UWB Tier 3 — M23 测距综合实践
  'uwb-capstone',
]
```

### Where a new module is needed

Today's 网络与帧 would hold 11 lessons and 信道接入（DCF） would hold 15. A
module is a sitting's worth of reading, four to six lessons; past that the
sidebar stops being a map. So two modules become six:

- 网络与帧 → **M1 信号与链路** (4) · **M2 一张网里的角色** (2) · **M3 帧与空口时间** (5)
- 信道接入（DCF） → **M4 等待与退避** (5) · **M5 听不见的邻居与损失** (5) ·
  **M6 在纸上预测 DCF** (4) · **M7 第一阶段项目** (2)

On the UWB side, 飞行时间 (7 after splits) becomes **M13 飞行时间** (3) and
**M14 两只钟** (2), with 会话与定位 becoming **M15 会话网格** (2) and
**M16 定位** (3); 其他测距模式 (8) becomes **M18 竞争式测距** (2), **M19 单向测距**
(4) and **M20 角度** (2); 窄带辅助的多毫秒 UWB (8) becomes **M21 多毫秒片段** (4)
and **M22 窄带控制面** (4). Every other module keeps its shape.

Tier 1 now holds 28 lessons across seven modules. That is a lot for one tier
heading, and it is correct: it is the foundation, and it is where a beginner
reads slowest.

## 4. Diagrams, lesson by lesson

Five kinds: **topology**, **stack**, **timing**, **sequence**, **fields** — the
five `DiagramSpec` variants that landed in `src/course/diagram.ts` while this
was being written. Each one below is a `{ kind: 'diagram', spec }` block on the
main path, and each one's figures must be the run's own figures, pinned like any
other claim. Twenty-one lessons get none — where a table, a formula or the
running simulator already shows it better than a picture would.

| lesson | diagram | what it shows |
|---|---|---|
| `radio-primer` | topology | 平面图：四个位置、每堵墙的材质，每一段扣掉多少 dB |
| `noise-floor` | none | 公式加一张带宽表已经说清 |
| `decode-thresholds` | none | 三个问题是一张表 |
| `mcs-ladder` | none | `mcsLadder` 小部件就是那把阶梯 |
| `roles-stack` | topology | 一个 AP、四台 STA、一个 BSSID、一个 SSID 标签 |
| `relay-hops` | sequence | 手机 B → AP → 手机 A，带上那两个时刻 |
| `frame-anatomy` | fields + stack | 24/26 字节帧头逐字段；MSDU→MPDU→PPDU 的嵌套 |
| `frame-qos-fcs` | none | 复用上一课的字段图，只高亮那两个字节与尾部四字节 |
| `frame-anatomy-bytes` | timing | 各代际：固定前导码 + 随载荷伸缩的符号 |
| `small-frames` | sequence | RTS → CTS → 十四帧的突发 → BlockAck |
| `airtime` | timing | 一次交互按比例画：前导码 \| 载荷 \| SIFS \| ACK |
| `ifs` | timing | 同一个帧尾出发的 SIFS 与 DIFS |
| `cca` | timing | 邻居的一帧，以及 −82/−62 dBm 两条线落在哪里 |
| `backoff` | timing | 计数器只在空闲时隙走，别人一发就停 |
| `collisions-cw` | timing | 两帧重叠、45 µs 期限到期、窗口翻倍 |
| `nav` | timing | 一帧、它的 Duration 箭头、旁听者脚下那条紫条 |
| `hidden` | topology | 走廊房子：谁听得见谁，两堵墙 |
| `rts-cts` | sequence | 三条泳道：提问、回答、数据、确认，以及远端的预约 |
| `anomaly` | timing | 两条泳道，轮数相同，色块长度不同 |
| `retries-queues` | timing | 同一帧的七次尝试，间隔越来越远 |
| `queues` | none | 三张表已经说清 |
| `bianchi` | none | 两个方程就是这一课 |
| `bianchi-throughput` | timing | 三种时隙：空的、成功的、撞车的，各值多少 |
| `bianchi-vs-sim` | none | 并排两列数字 |
| `rate-vs-model` | none | 不在场证明是一张三列表 |
| `tier1-project` | topology | 题面那户人家的平面图 |
| `tier1-project-review` | none | |
| `edca` | timing | 四类各自的 AIFS，从同一个帧尾起算 |
| `edca-cost` | none | 三台站点一张表 |
| `ampdu` | fields | 一个子帧：定界符 \| 帧头 \| 载荷 \| FCS \| 填充 |
| `txop` | timing | 一串突发对着 TXOP 上限那只钟 |
| `txop-protect` | sequence | 提问、回答、整串，以及隐藏那台站点的预约条 |
| `protect-policies` | timing | 三种说法各自罩住多长 |
| `width` | timing | 同一帧在四种带宽下：前导码不动，数据段变短 |
| `streams` | stack | 发端天线、流、收端天线，以及取较小者 |
| `rate` | none | |
| `rate-fallback` | timing | 一次跌落与爬回，色块随级别变长变短 |
| `rate-cost` | none | 两张表 |
| `ofdma-dl` | fields | 一个 MU PPDU：前导码 \| 每用户分配表 \| 各 RU 的载荷 |
| `ofdma-ul` | sequence | 触发帧 → 两个同时开始的回答 → 一帧多站点确认 |
| `tb-round` | none | 回合表已经逐项列出 |
| `mumimo` | topology | 四天线路由器同时指向两部手机 |
| `mumimo-choose` | none | 对照表就是这一课 |
| `mlo` | stack | 上面一条 MLD 队列，下面两台各自竞争的电台 |
| `mlo-gain` | none | 三张表，删掉复述它们的段落 |
| `capstone` | topology | 三个房间、七台设备 |
| `uwb-intro` | timing | 两只钟上的四个计数读数 |
| `uwb-frame` | fields | SYNC \| SFD \| RMARKER \| STS \| PHR \| PSDU，带时长 |
| `uwb-sts` | sequence | 诚实的一轮，和中间那个盒子提早转发的一轮 |
| `uwb-sstwr` | timing | Tround 与 Treply 画在两只钟上，四个时隙上的斜坡 |
| `uwb-dstwr` | sequence | Poll、四个 Response、Final、四份 Report |
| `uwb-blocks` | timing | 块 → 轮 → 时隙的三层嵌套 |
| `uwb-slot-budget` | timing | 2 ms 与 0.5 ms 两种时隙；分到手 vs 射频真开着 |
| `uwb-position` | topology | 四个圆环交不到一点，十字落在哪里 |
| `uwb-geometry` | topology | 四角与三锚点两种布局，以及各自的椭圆 |
| `uwb-nlos` | topology | 挡住一条路径的那段砖墙，定位朝哪边滑 |
| `uwb-coexist` | topology | 手机、路由器、笔记本、四角锚点，各自的电平 |
| `uwb-coexist-fixes` | fields | 频谱占用：UWB 5/9 号信道对上 6 GHz 的两条 Wi-Fi 信道 |
| `uwb-contention` | sequence | 一轮里六次抽取：谁抽到几号，哪两个撞在一起 |
| `uwb-window-width` | none | 三种窗口一张表 |
| `uwb-dl-tdoa` | topology | 两两锚点给出的三条双曲线 |
| `uwb-dl-tdoa-clock` | timing | 锚点那段跨度与胸牌那段跨度并排 |
| `uwb-ul-tdoa` | sequence | 一帧闪发 → 四个到达时间戳 → 参考锚点解算 |
| `uwb-sync-error` | none | 走一遍旋钮的那张表 |
| `uwb-aoa` | topology | 斜着来的波前先后碰到两根天线 |
| `uwb-aoa-fix` | topology | 圆与射线相交、被拉长的椭圆、锚点背后的镜像 |
| `uwb-mms` | timing | 每半毫秒一个片段，单独都在门限以下，累加越过 |
| `uwb-mms-numbers` | none | 六行算术就是这一课 |
| `uwb-mms-ruler` | timing | 第 i 与第 j 个片段之间那 14 ms |
| `uwb-mms-bias` | topology | 两道砖墙，被推迟的首径 |
| `uwb-nba` | sequence | 两条泳道：窄带的三条消息与宽带的那串片段 |
| `uwb-nba-grid` | timing | 52 × 500 µs 的格子，两部射频各自的窗口 |
| `uwb-nba-coexist` | timing | 一次 LBT 采样、门限、被判死的那个块 |
| `uwb-nba-channels` | fields | 允许列表那四条信道对上路由器的 80 MHz |
| `uwb-capstone` | topology | 两个房间一条走廊，三个锚点的三种摆法 |

## 5. What to cut

### 5.1 The same thing taught twice (delete the later or the earlier, as named)

1. **bytes → microseconds**, in full, twice: `frame-anatomy-bytes`
   「从字节到微秒，一步一步算」 and `airtime`「这个时长是怎么算出来的，一步一步」.
   Keep it in `frame-anatomy-bytes`; `airtime` keeps only the ACK's rate and the
   SIFS and cites the result.
2. **MSDU/MPDU/PPDU**: `roles-stack`「一层套一层的信封」+「同一份载荷，四层包装」
   pre-teaches `frame-anatomy`'s own opening. Delete from `roles-stack`.
3. **The ARF rule**: `rate`'s「这个回路，引擎是怎么跑的」is the same two-fails-down,
   ten-successes-up rule `rate-fallback` owns. Delete from `rate`.
4. **Duration telegraphing a burst**: `txop`'s「告诉整个房间要躲多久」duplicates
   `txop-protect`'s procedure. Delete from `txop`.
5. **CW doubling and the IFS ladder**: `edca`'s depth re-teaches both from
   `backoff` and `ifs`. Delete「窗口为什么是翻倍而不是加一」and「等待的整把梯子」.
6. **The management-frame disclaimer** appears near-verbatim in `roles-stack`
   (「这个房间里看不到的几种情况」) and `frame-anatomy`(「这个房间里从不出现的帧」).
   Keep one, in `frame-anatomy`.
7. **The MMS round anatomy**: `uwb-mms` and `uwb-nba` both walk Poll → Response
   → fragments → Report with near-identical `steps` and worked tables. Delete
   from `uwb-mms`; leave one sentence pointing forward.
8. **Crystal offset**: `uwb-intro`'s depth (「一次无事可修的修正」,
   「换成真实的晶振要付多少代价」) pre-plays all of `uwb-sstwr`. Delete.
9. **The FoM byte** is explained in `uwb-sstwr`'s depth and again in
   `uwb-geometry`. Keep it only in `uwb-nlos`, where it is load-bearing.
10. **The slot/round teaser** in `uwb-frame`(「两个时隙，一轮测距」) and the **STS
    teaser**(「一段谁也伪造不了的序列」) pre-teach `uwb-blocks` and `uwb-sts`. Cut
    each to one line.
11. **The 3 dB cliff** in `uwb-mms-numbers` is stated by the
    「同一个房间里的三种序列」table and again in the depth's two log lines. Keep
    the table.

### 5.2 Metaphors doing no work

Delete: 「两个正在说话的人」/「走到屋子另一头，声音就轻了」(`radio-primer`) —
keep the voice image once, in `why`, and drop its restatements in
`decode-thresholds`(「连珠炮似的说」,「许多个窄嗓门一起说」) and
`airtime`(「一条信道，一个说话人」,「耳朵震聋了」); 「一层套一层的信封」;
「一台电台，四间候车室」and 「两个旋钮，没有裁判」(`edca`); 「抢跑」, used eight
times in `edca` — twice is enough and the standard's own phrase (更短的 AIFS)
does the work; 「短租」(`txop`, four times); 「多开车道，不是换快车」(`width`'s
title, then restated in its first paragraph — keep neither in both places);
「白送的那个倍数」(`streams`); 「信号扣下来的那个盖子」and
「一个靠传闻运转的回路」(`rate`); the door metaphor in `mlo`
(「从一扇门变成两扇门」,「第二扇门买到了什么」,「那扇安静的门」,
「当所有人都有两扇门」— the stack diagram replaces it); 「光线昏暗」(`capstone`);
the dice running through `backoff` as its structure (「先掷骰子，再倒着数」,
「当两颗骰子点数相同」,「再拿同一颗骰子重来是愚蠢的」) and 「沉默就是判决」;
「那句承诺」/「耳朵告诉不了你的事」(`nav`, the promise image four times);
「两股信号…同归于尽」(`hidden`); the shared clock in `anomaly`
(「被分掉的其实是时钟」, four uses) and its whole 「没有谁在耍赖」section, which
is moralising with no mechanism in it; 「简单得近乎寒碜」and
「我听见有东西碎了」(`ifs`); 「一个会改主意的发送方」(`bianchi-vs-sim`);
「一声吼，一声耳语」(`uwb-coexist`); 「等得越久，谎话越大」(`uwb-sstwr`);
「帧的开头是一份礼物」(`uwb-sts`); 「被剥得只剩骨头」(`uwb-mms`);
the pricing frame in `uwb-geometry`(「定价」,「几何开出的价码」, four uses).

Keep, with the standard name in brackets as the rule requires: 「发出的是嗒，不是嗡」
(`uwb-intro` — it names pulses/chips), 「点名」(`uwb-contention` — it maps onto a
real mechanism), 「一把十四毫秒长的尺子」(`uwb-mms-ruler` — the train really is
the ruler), 「固定价 + 浮动价」(`ampdu` — it is quantified two lines later).

### 5.3 A picture and its numbers saying the same thing

- `mlo`: three tables, each followed by a paragraph that restates it
  (「不是更快的那台电台，是更空的那个频段」,「邻居也跟着占了便宜」,
  「当所有人都有两扇门」). Keep one; the other two become a clause.
- `edca`:「把抢跑量出来」re-derives the 45 µs the table above it prints.
- `airtime`:「这笔税，用一个数说清」and「这个房间有多忙？」restate the exchange
  table's own totals.
- `txop`:「这里的每一串突发是被什么结束的」restates「多数时候拦住你的不是上限」
  using the table between them.
- `rate-fallback`:「这些跌落花掉了多少时间」and「这笔税，一句话说清」print the
  same 530.3/318.1/212.2 ms back to back.
- `frame-anatomy`: the paragraph under「按方向看，哪个地址是谁」walks the table
  cell by cell.
- `anomaly`: 209/154 turns, 248/795 µs and the shares are printed **three
  times** — the intro prose, the summary table, and the step-by-step table. Keep
  one table and the diagram.
- `ifs`:「一把梯子，三级台阶」re-lists the three rows of the table under it, and
  「完整的一轮，按顺序」repeats what「这在本轮仿真里换来了什么」just said.
- `tier1-project-review`: the prose for the estimator, the one-way deafness and
  the rate residual all restate the 差距出在哪里 table.
- `uwb-sstwr`: the depth's「剩余误差有多大」and「手机减掉的那个数」restate the
  worked table directly above them.
- `uwb-position`: the log-format table and the worked procedure table print the
  same round's numbers twice — merge into one table with both columns.
- `uwb-ul-tdoa`: bias-versus-noise is made three times (prose, sweep table,
  depth). Once, plus the table.
- `uwb-contention`:「一格一格爬上去的误差」restates the per-slot error table.

### 5.4 Prose a diagram now says better

`ifs`'s「一把梯子，三级台阶」list; `frame-anatomy`'s
「头两个字节…」/「谁必须接住它」/「还要多久…」openings (the fields diagram carries
the walk, the table the exact widths); `frame-anatomy-bytes`'s two
per-generation tables; `hidden`'s「两个房间，一条走廊」; `roles-stack`'s
「一个接入点，一张网」+「你真正挑的是那个名字」; `uwb-frame`'s
「整帧的顺序」six-item list; `uwb-blocks`'s「三重嵌套的节拍」table;
`uwb-nba`'s three passes over the same 26 ms round (table, formula, steps);
`uwb-coexist`'s prose description of who stands where; `uwb-aoa`'s two
paragraphs about the ellipse before the table repeats it a third time.

### 5.5 Asides for things the simulator does not do

Cut or reduce to one sentence: `ofdma-ul`'s「几个回答为什么必须强弱相近」(power
control is not modelled); `ampdu`'s「必须先存在的那份约定」(ADDBA — "你在时间轴上
看不到它"); `txop`'s「把发言权借回去」(reverse-direction TXOP, never shown);
`streams`'s MU-MIMO preview (「在这张桌子上看不见」); `rate`'s multi-user
reporting aside; `uwb-mms`'s「本场景没有发的那些完整性片段」(328 characters on
fragments this session never sends); `uwb-nba-coexist`'s 250-channel regulatory
survey; `width`'s「还有邻居」(a real point with no numbers and no scene here);
`retries-queues`'s block-ack footnote; `nav`'s depth note about what the lane
label means (that is how to read the UI, not how the network works);
`tier1-project`'s wider-channel depth, which teaches a scenario no variant can
load.

### 5.6 Do not cut these

They read like asides and they are corrections that were made once:

- `mlo`'s **EMLSR** paragraph. It exists so the lesson is not read as describing
  all multi-link behaviour.
- `ofdma-ul`'s「设备保住了什么」. Scheduled uplink is **no longer CSMA** for the
  devices being triggered; that sentence is the correction.
- `ofdma-dl` and `mumimo` on one transmission serving one receiver until
  Wi-Fi 6.
- The spelling **Wi-Fi 5 (802.11ac)**, and **DIFS = DCF interframe space**
  (§10.3.2.3.5), not "distributed".
- `uwb-sts`'s one honest paragraph about what the simulator does instead of
  holding a key — keep one of the two, not neither.

## 6. Mechanical consequences

**New files.** 28 new lesson files and 28 new test files. No lesson file is
deleted; no id is renamed (a rename would move fixture keys, a test file and
every `needs` edge pointing at it, for no reader benefit).

**Scenes and hashes.** Every split is scene-preserving by construction: a new
half's `scenario()` and `variants` are its parent's, so it gets
`lessonShapeSuite(lesson, { sameSceneAs: '<parent>' })` and the kit's equality
check holds. `cca` is the only new lesson without a parent split, and it too
loads an existing scene (`backoff`'s). Consequences:

- **No recorded hash value changes.** `UPDATE_HASHES=1` produces the same values
  it produces today, plus copies under the new ids.
- **121 fixture lines to add**: 79 keys in `tests/fixtures/lesson-hashes.json`
  (146 → 225) and 42 in `tests/fixtures/uwb-record-hashes.json` (62 → 104). A
  UWB lesson appears in both files, which is why its lines count twice.
- Per new lesson the count is `1 + parent's variant count`, because **variants
  cannot be divided between halves** — the kit asserts the two variant lists are
  equal, scenario for scenario. Both halves therefore carry all four
  `radio-primer` positions, all four `uwb-coexist` channel plans, and so on. The
  five-variant parents drive the total: `noise-floor` and `mcs-ladder` add five
  lines each, `uwb-coexist-fixes`, `uwb-mms-bias`, `uwb-mms-ruler`,
  `uwb-nba-grid` and `uwb-nba-channels` add five each in **both** files.
- **No new variant anywhere.** Twice it is tempting — a bandwidth comparison for
  `noise-floor`, a CCA_BUSY scene for `cca` — and both times the answer is a new
  jump predicate over the existing run, because a new variant is a new hash value
  and breaks `sameSceneAs`.

**New jump predicates** (`lessonKit.ts`): one for `cca` (a `CCA_BUSY` or
`BACKOFF_FREEZE` record in `backoff`'s run), and `roles-stack` starts using the
two jumps it already declares but never calls out. Everything else reuses
existing predicates; a jump list may be reordered per half, and the `watch`
blocks' `jump` indices must follow.

**`needs` edges.** The rule: a second half needs its first half. Beyond that,
these existing edges move to the half that now owns the material:

| lesson | needs today | needs after |
|---|---|---|
| `airtime` | radio-primer, decode-thresholds, frame-anatomy, frame-anatomy-bytes | mcs-ladder, frame-anatomy-bytes, small-frames |
| `ifs` | airtime | airtime |
| `hidden` | backoff, nav | collisions-cw, nav, cca |
| `anomaly` | airtime, backoff | airtime, collisions-cw |
| `retries-queues` | airtime, backoff | airtime, collisions-cw |
| `bianchi` | backoff, retries-queues | collisions-cw, queues |
| `bianchi-vs-sim` | bianchi, anomaly | bianchi-throughput, anomaly |
| `edca` | ifs, backoff, retries-queues | ifs, backoff, collisions-cw |
| `ampdu` | airtime, frame-anatomy, retries-queues | small-frames, frame-qos-fcs, retries-queues |
| `txop-protect` | nav, hidden, txop | nav, rts-cts, txop |
| `width` | decode-thresholds, airtime | mcs-ladder, noise-floor, airtime |
| `rate` | decode-thresholds, retries-queues, bianchi-vs-sim, width | mcs-ladder, retries-queues, rate-vs-model, width |
| `rate-fallback` | rate, anomaly | rate, anomaly |
| `mlo` | retries-queues, txop-protect, width | retries-queues, protect-policies, width |
| `capstone` | …, ofdma-dl, ofdma-ul, mumimo, mlo | …, ofdma-dl, tb-round, mumimo-choose, mlo-gain |
| `uwb-intro` | radio-primer, frame-anatomy | radio-primer, frame-anatomy |
| `uwb-sts`, `uwb-sstwr` | uwb-frame | uwb-frame |
| `uwb-coexist` | uwb-blocks, uwb-geometry | uwb-blocks, uwb-geometry, noise-floor |
| `uwb-mms` | uwb-blocks, uwb-dstwr, uwb-geometry | uwb-blocks, uwb-dstwr, uwb-nlos |
| `uwb-capstone` | uwb-position, uwb-aoa, uwb-mms, uwb-coexist | uwb-position, uwb-aoa-fix, uwb-mms-numbers, uwb-coexist-fixes |

**Pins.** No pin is deleted; pins move with the sentence they guard. The larger
moves, by count of `it(...)` blocks in the parent's test file:

| parent | pins today | move to the new half |
|---|---|---|
| `decode-thresholds` | 19 | ~13 → `mcs-ladder` (the six rungs, the modulation names, the widget, steps 1–5, the position table) |
| `retries-queues` | 32 | ~15 → `queues` (the three-variant table, the drop reasons, the waiting times) |
| `uwb-blocks` | 32 | ~13 → `uwb-slot-budget` (the minimum-slot rule, the 0.5 ms variant, the radio-on figures) |
| `uwb-coexist` | 35 | ~15 → `uwb-coexist-fixes` (the channel table, the in-band EIRP, the 40 cm crossing, the saturated run) |
| `uwb-contention` | 35 | ~15 → `uwb-window-width` (the birthday formula, the three-window table, the per-slot error) |
| `uwb-dl-tdoa` | 38 | ~16 → `uwb-dl-tdoa-clock` (the ratio, the correction table, the no-correction variant) |
| `uwb-ul-tdoa` | 33 | ~12 → `uwb-sync-error` (the sync sweep, the drawn biases, the ellipse) |
| `uwb-aoa` | 29 | ~12 → `uwb-aoa-fix` (the height correction, the two clamps, behind the anchor) |
| `uwb-mms` + `uwb-mms-numbers` | 31 + 24 | ~10 → `uwb-mms-ruler`, ~8 → `uwb-mms-bias`; the round-anatomy pins move to `uwb-nba` with the prose |
| `uwb-nba` | 26 | ~10 → `uwb-nba-grid`; it also **gains** the round-anatomy pins from `uwb-mms` |
| `uwb-nba-coexist` | 34 | ~15 → `uwb-nba-channels` (the four placements, the reverse direction, the 44.58 Mb/s) |
| `edca` | 14 | ~5 → `edca-cost`, plus the EIFS pin arriving from `ifs` |
| `mlo` | 26 | ~10 → `mlo-gain` (the three tables) |
| `bianchi` | 24 | ~9 → `bianchi-throughput` (T_s/T_c, the mean slot, the payload) |
| `hidden` | 22 | ~9 → `rts-cts` (the protected variant, the worked 718 µs round) |
| `backoff` | 16 | ~7 → `collisions-cw` (the deadline, the doubling, the collision times) |
| `anomaly` | 14 | ~3 → `rate-vs-model` with the capture material (the dB table, the 4 dB a preamble needs, the t = 0 start) |
| `ifs` | 11 | 1 → `edca-cost` with EIFS |
| `txop-protect` | 11 | ~5 → `protect-policies` (the three-policy tables) |
| `rate` / `rate-fallback` | 14 / 18 | `rate`'s ARF pins go to `rate-fallback`; ~7 of `rate-fallback`'s go to `rate-cost` |

Two cross-lesson files are grouped by lesson id and must follow the prose:
`tests/course/lesson-claims.test.ts` (40 `it`s, `describe('lesson N · <id>')`)
and `tests/course/quoted-timestamps.test.ts` (11). Because the scenarios do not
change, every assertion still passes as written; what moves is which group it
sits in.

**Shared files each batch touches** (serialise these, or let one controller own
them):

- `src/course/curriculum.ts` — `MODULES` (17 entries → 23) and `COURSE_ORDER`.
  **`trackOf` hardcodes `l.module === 7` for the AMP track**; with `MODULES`
  renumbered that must become a named index or a field on the module.
- `src/course/lessons.ts` — 28 imports and 28 array entries.
- `tests/fixtures/*.json` — the 121 lines.
- `tests/course/readability.test.ts` — `MIGRATING` is unaffected (new lessons
  are born in the new shape), but the file is shared.

**Terms.** The contract allows at most six terms a lesson, four for a track's
first lesson. Splitting relieves the pressure that produced five- and six-term
lessons: `RSSI`/`SNR` stay in `radio-primer` and `SINR`/`noise floor` go to
`noise-floor`; `MCS`/`OFDM` to `mcs-ladder`, `sensitivity`/`rate margin` to
`decode-thresholds`, `CCA`/`energy detect`/`preamble detection` to `cca`;
`MSDU`/`MPDU`/`PPDU`/`FCS`/`CRC` stay in `frame-anatomy` and `QOS`/`TID` go to
`frame-qos-fcs`.

**What does not change.** The engine, the scenes, the recorded hashes, the
widgets, `CoursePanel`'s rendering (it already drops modules with no visible
lesson), and every claim pinned against a run.

## 7. Splits I rejected, and material that had to move

The user's rule — a split that leaves a half with nothing to observe is a bad
split — killed two otherwise tidy cuts:

1. **CCA as the second half of `decode-thresholds`.** It would have had prose, a
   table and one quiz question, and nothing in that scene to watch: the four
   variants never produce a busy CCA. Instead `cca` becomes its own lesson on
   `backoff`'s scene, where a station visibly freezes on a neighbour's frame.
2. **`ampdu` split at 「一个回答管住全部」.** The BlockAck half would own one
   jump and one observe line. It stays whole.
3. **`ifs` split at EIFS.** EIFS has nothing to watch in that scene at all, so
   it is not a half — it is material that belongs where the record exists
   (`edca-cost`).

For the same reason `roles-stack`'s roles half is only viable because the lesson
already declares two jumps it never uses; if it did not, the roles material
would have stayed with the relay.

The same test also moves three passages that are not splits at all, because
they teach a mechanism the lesson they sit in cannot show:

- `anomaly`'s capture-effect depth → `rate-vs-model`.
- `decode-thresholds`'s CCA thresholds → the new `cca`.
- `ifs`'s EIFS → `edca-cost`.

And it deletes one: `tier1-project`'s wider-channel aside, which no variant can
load.

## 8. Recommended order of work

Two things must land before any lesson is touched:

**Step 0 (controller, alone).** The diagram block and its five renderers, with
the pilot on `roles-stack`. This is the brief's step 2 and it landed while this
proposal was being written (`src/course/diagram.ts`, `tests/course/diagram.test.ts`,
and edits to `CoursePanel.tsx`, `lessonKit.ts` and `roles-stack.ts`). Batch 1
starts from that commit, not before it.

**Step 1 (controller, alone, one commit).** `MODULES`, `COURSE_ORDER` with all
75 ids, and the `trackOf` fix. `orderLessons` skips ids with no authored lesson,
so the whole order can land first and each batch then lights up its part of the
sidebar.

Then ten batches. Within a batch, one agent per **parent lesson**: it owns that
lesson's file, its new siblings' files, and their test files — no two agents
share a file. The controller lands each batch's `lessons.ts` imports and fixture
lines at the end of the batch.

| batch | parents | new lessons | can run beside |
|---|---|---|---|
| 1 | radio-primer, decode-thresholds | noise-floor, mcs-ladder | 7 |
| 2 | roles-stack, frame-anatomy, frame-anatomy-bytes, airtime | relay-hops, frame-qos-fcs, small-frames | 7 |
| 3 | ifs, backoff, nav | cca, collisions-cw | 8 |
| 4 | hidden, anomaly, retries-queues | rts-cts, queues | 8 |
| 5 | bianchi, bianchi-vs-sim, tier1-project(+review) | bianchi-throughput, rate-vs-model | 9 |
| 6 | edca, ampdu, txop, txop-protect | edca-cost, protect-policies | 9 |
| 7 | uwb-intro, uwb-frame, uwb-sts, uwb-sstwr, uwb-dstwr | — (trims only) | 1, 2 |
| 8 | uwb-blocks, uwb-position, uwb-geometry | uwb-slot-budget, uwb-nlos | 3, 4 |
| 9 | uwb-coexist, uwb-contention, uwb-dl-tdoa, uwb-ul-tdoa, uwb-aoa | uwb-coexist-fixes, uwb-window-width, uwb-dl-tdoa-clock, uwb-sync-error, uwb-aoa-fix | 5, 6 |
| 10 | width, streams, rate, rate-fallback, ofdma-dl, ofdma-ul, mumimo, mlo, capstone | rate-cost, tb-round, mumimo-choose, mlo-gain | 11 |
| 11 | uwb-mms, uwb-mms-numbers, uwb-nba, uwb-nba-coexist, uwb-capstone | uwb-mms-ruler, uwb-mms-bias, uwb-nba-grid, uwb-nba-channels | 10 |

Ordering constraints that matter:

- **Batch 2 before 10.** The bytes→microseconds de-duplication decides what
  `airtime` cites, and `width`/`streams` build on it.
- **Batch 1 before 2 and before 10.** `mcs-ladder` is the `needs` target for
  `airtime`, `width` and `rate`.
- **Batch 3 before 4 and 6.** `cca` and `collisions-cw` are `needs` targets for
  `hidden`, `anomaly`, `retries-queues` and `edca`.
- **Batch 11 last on the UWB side.** It removes the round anatomy from
  `uwb-mms` and gives it to `uwb-nba`; doing that while another agent edits
  either file is how a duplicate survives.
- Wi-Fi and UWB batches share no lesson file, so the pairs in the last column
  can run at the same time; the fixtures and `lessons.ts` are the only
  contention, and the controller owns both.

## 9. The three splits I am least sure about

1. **`bianchi` → `bianchi` + `bianchi-throughput`.** The fixed point and the
   price of a slot are one method, and the seven-step calculator has to be cut
   in two to do it. The first half ends on a probability the reader cannot yet
   use for anything, and the reader I sent through the lesson argued it should
   stay whole precisely because the second half has no watch of its own — its
   jumps are generic. My fix is to give it jump 0 (a clean successful exchange
   is the T_s it prices). If you do not find that convincing, leave `bianchi`
   whole at ~1,900 characters with two procedures — the longest lesson in
   Tier 1, and the only one I would accept at that length.
2. **`ofdma-ul` → `ofdma-ul` + `tb-round`.** I split it because it carries two
   `steps` blocks; the reader I sent through it judged it one topic and
   recommended trimming instead. The second half may read as arithmetic with a
   thin idea. If it does, fold `tb-round` back and cut the power-control aside
   and the 邀请不是命令 recap instead.
3. **`uwb-aoa` → `uwb-aoa` + `uwb-aoa-fix`.** The second half's own content is
   the height correction, the elongated ellipse and the mirror behind the
   anchor. It has three variants to watch, so it passes the watchability test,
   but it is the closest call on substance: the ambiguity might be better as a
   closing section of one lesson.

Runners-up, in case any of the three above is rejected on principle:
`mumimo` → `mumimo` + `mumimo-choose` (the comparison may be the topic), and
`uwb-nba` → `uwb-nba` + `uwb-nba-grid` (the grid may be part of the same story
once `uwb-mms` stops telling it).

## 8. Rulings on the open calls (controller, 2026-09-25)

The proposal names three splits it is unsure of. Two are rejected and one
stands, so the course goes from 47 lessons to **73**, not 75.

- **`bianchi` stays whole.** The fixed point and the price of a slot are one
  method, and the proposal's own reader said so. The tell is that the second
  half would have had no scene of its own and needed a jump borrowed from the
  first — a split that has to manufacture something to watch is a split the
  material is resisting. It loses padding and gains a diagram like the rest.
- **`ofdma-ul` stays whole.** Two `steps` blocks is a tell, not a proof. The
  reader judged it one topic: the trigger frame and the round it schedules are
  the same idea seen twice, and the second half would have been arithmetic with
  a thin idea on top.
- **`uwb-aoa` splits.** It passes the test the other two failed — the second
  half has three variants to watch — and the height correction, the elongated
  ellipse and the mirror behind the anchor are a different subject from what two
  antennas give you.

Two more, decided rather than asked:

- **`trackOf` must stop keying on a module index.** It reads `l.module === 7`
  for the AMP track, and `MODULES` goes from 17 entries to 23. A lesson's track
  becomes explicit data rather than an index coincidence; this lands in the
  first batch, before any module moves.
- **The duplications in §5.1 are cut as named.** Ten of them, and the largest —
  `uwb-mms` and `uwb-nba` teaching the same round twice — is worth the whole
  exercise on its own. A reader who meets the same procedure twice concludes
  they misunderstood it the first time.

## 9. Two more rulings (controller, after R0)

- **The four empty modules are deleted**, so `MODULES` goes 13 → 23 rather than
  17 → 27, and a module's index is `M − 1`. 链路生命周期、安全与节能,
  邻居网络与空间复用, 信号、调制与编码 and Wi-Fi 8 与研究方法 carry no lesson
  and nothing reads them; `CoursePanel` already drops an empty module. An entry
  that exists only as an intention makes every index after it a statement about
  the course that is not true. When the first PHY lesson is written, its module
  arrives with it.
- **A module index is never pinned as a literal again.** R0 found the same
  defect it had just fixed in `trackOf`, in test form: 50 `expect(l.module)
  .toBe(N)`, 7 `MODULES[<literal>].tier`, and 8 `COURSE_ORDER` adjacency pins.
  Renumbering them would reload the gun. A test that cares which module a
  lesson is in asserts the module's **title**; one that cares about the tier
  reads `MODULES[<lesson>.module].tier`, the relational form the next line
  already uses; adjacency pins assert that one id precedes another, not that it
  sits at a given offset.

R0's recount also corrects §6: the fixtures gain **74 + 42 = 116** lines, not
121. The difference is exactly the two splits §8 rejected, which is the kind of
arithmetic agreement that makes the rest of the count believable.

## 10. Two things the batches had to work out for themselves

Both found by batch I; recorded here so the remaining batches are told rather
than made to rediscover them.

- **Which number a lesson is held to.** §2's "now" column is `mainPathChars`,
  but its "length" target is defined as `why` + `picture` + `numbers`. Those
  are different measures, and read the plan's own way two UWB lessons were
  already at or under target before anyone touched them. **The target is
  `mainPathChars`** — the number `lesson-dump` prints — because that is what
  the minutes estimate is computed from and what a reader actually reads.
- **A figure constrains where it can sit.** A diagram's labels are graded prose
  and they come *before* its caption in reading order, so a caption frequently
  has to carry a term's first-use bracket, and the figure cannot be placed
  above the paragraph that introduces what it names. Plan the figure's position
  and its caption together; batch I had to move one below the paragraph naming
  the fields it draws.

A third, from the same batch and worth keeping in mind generally: a caption
usually does more work than the paragraph it replaces, so a lesson that gains
a figure does not always get shorter. That is fine. The figure is there because
it teaches better, not because it saves characters.

## 11. §2's length column is an estimate, not a target (controller)

Two batches have now reported the same thing independently, and they are
right: §2's "length" numbers cannot be reached for a lesson the plan keeps
whole. `uwb-dstwr` is marked whole, §5 names **no cut in it at all**, §4 adds a
figure, and the target is 1400 against a present 2293. After the figure, the
seven-step procedure, the eleven-row worked example, three tables, a formula,
five terms, three observations, two experiments and three quiz questions, the
free prose left is about 650 characters. The only lever that reaches 1400 is a
third split, which §2 itself rejects.

**The ruling: §2's length column is an estimate made before the procedure rule
and before diagrams existed. It is not a number to hit.** What binds is §1 —
one topic, one procedure, one scene; the 30-minute ceiling; and never
compressing a mechanism to reach a figure. A batch that has made every cut §5
names and is still above the estimate has finished, and should say so rather
than cut into a procedure.

Two related facts, also from the batches, worth knowing before anyone compares
a sum against a parent:

- **A split pays its overhead twice.** `uwb-blocks`' two halves total 3100
  characters against the parent's 2380, and about 560 of that is structural:
  two `why`s, two sets of outcomes, two glossaries, a term re-bracketed for a
  reader arriving cold, and two captions doing the work of the prose they
  replaced. The course gets longer in total. That is the intended trade — a
  reader meets one idea at a time — not a regression.
- **A caption usually does more work than the paragraph it replaces**, so a
  lesson that gains a figure does not reliably get shorter.
