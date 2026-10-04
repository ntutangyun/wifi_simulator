# 引擎已建成、课程里没有：七种 EDCA 作弊、云端往返时延、`gaming` 档

2026-10-05。三件东西在引擎里是完整的、在编辑器里可点、有测试，而**整个课程从未加载过它们一次**。
已发布标准 IEEE Std 802.11-2024（§9.2.5.2、§9.4.2.27、§9.4.2.250、§10.2.3.2、§10.23.2.2、
§10.23.2.4、§10.23.2.9、§26.2.7、Table 9-194、Table 10-1）。WAN 那一侧的取值**不在 IEEE 语料里**，
所以它只能标 `model`，而本规格逐个说出是谁选的。

**这份规格的结论是两课，不是三课也不是一课。** 理由在 §5，而它不是口味：
`gaming` 档与 `gameAccel` 在**没有服务器**时量不出任何读者看得见的后果
（`gameAccel` 改的是接入类别，而接入类别的后果在 `edca` 那一课已经教过了）；
而云端往返时延在**没有一条延迟敏感的流**时没有可读的仪表。
**两者互为量具，所以它们是一课。** 七种作弊自成另一课，它有自己的题目与一份现成的报告。

**第二个结论是坏消息，它是量出来的：七种作弊里有三种在某些完全合法的场景上逐字节空转，
而其中一种（`txopHog`）在一个「三人开黑」式场景里只改变 `TXOP_START.untilNs` 这一个字段、
不改变任何一个后果。** 见 §7，那是本规格最硬的一节。

**第三个结论是对下达给我的 brief 的更正：那五句「假话」不是五句，而且假的不是 brief 说的那一半。**
见 §10。

§1 机理 · §2 建什么 · §3 读者会看到什么 · §4 fixture · §5 课程落点 · §6 要改的既有 `limits` ·
§7 允许但空转 · §8 验收 · §9 明确不做 · §10 判断与对 brief 的更正。

---

## 0. 这三件是怎么被重量的（量具先写，数在后面）

brief 里那三行「0 命中」是从另一个 agent 的报告转述的，按本会话的规矩那是未核事实。
**我自己重量了一遍，量具如下，而结论比 brief 说的更强。**

**量具 A（普查）**：`npx vite-node --root <worktree>` 跑一个 scratchpad 脚本，遍历
`src/course/lessons.ts` 的 `LESSONS`，对每一门课构造 `l.scenario()` 与
`l.variants?.[*].scenario()`，逐个场景数 `servers.length > 0`、`nodes[*].tamper`、
`nodes[*].profiles.includes('gaming')`、`nodes[*].gameAccel`。再对
`src/model/households.ts` 的 `HOUSEHOLDS` 做同一次计数。

| 量 | 值 |
| --- | --- |
| 课数 | **82**（wifi 46、amp 4、uwb 32） |
| 场景数（含全部 variants） | **226**（wifi 106、amp 12、uwb 108） |
| 其中 Wi-Fi + AMP | **118** |
| `tests/fixtures/lesson-hashes.json` 的条目数 | **233** = 226 + 7 个编辑器家庭 |
| 226 个课程场景里 `servers` 非空的 | **0** |
| 226 个里带 `gaming` 档节点的 | **0** |
| 226 个里带 `tamper` 的 | **0** |
| 226 个里带 `gameAccel` 的 | **0** |
| 7 个编辑器家庭里带 `servers` 的 | **7** |
| 7 个家庭里带 `gaming` 档节点的 | **7** |
| 7 个家庭里带 `tamper` / `gameAccel` 的 | **0 / 0** |

**所以 brief 的「50 个场景」是错的：50 是 Wi-Fi + AMP 的课数（46 + 4），
场景数（含 variants）是 118，全课程 226。** 三个「0 命中」本身全部成立，
而且是在 226 个场景上成立，不是 50 个。

**另有一条 brief 没说的：`tamper` 与 `gameAccel` 在七个编辑器家庭里也是 0。**
于是这两件东西今天唯一被执行到的地方是编辑器的交互、`tests/engine/tamper.test.ts`
与 `scripts/tamper-report.ts`（它在运行时才把预设贴上去）。
**而 `gaming` 档与 `servers` 在家庭预设里是用着的——它们不是「仓库里没人用」，是「课程里没人用」。**

**量具 B（档位计数）**：`grep -ro "'<profile>'" src/course/ | wc -l`。

| 档 | 命中 |
| --- | --- |
| `saturated` | 55 |
| `idle` | 43 |
| `video` | 17 |
| `backup` | 6 |
| `voice` | 5 |
| `p2pvideo` | 2 |
| `browsing` | 2 |
| `iot` | 1 |
| **`gaming`** | **0** |

**九个档里只有一个是 0，brief 这一条逐字成立。**

**量具 C（空转对比）**：同一个场景构造两次，一次原样一次加开关，各跑同一时长，
把整条记录数组 `JSON.stringify` 之后取 sha1 前 12 位比较；不相等时再逐记录 diff，
报出「差了哪些类型、差的是哪些字段」。本规格里凡写 **逐字节相同**，指的就是这个哈希相等。

**量具 D（应用层时延）**：`src/model/view.ts` 的 `initViewState` + `applyRecord`，
读 `stats.appRtt`（引擎自己的应用往返累计）与 `stats.txLatency`（MAC 入队到确认）。
`appRtt` 的样本来源是每 250 ms 一次的 64 B ping 回声（`traffic.ts` 的 `schedulePing`
与 `PING_PERIOD_NS`）——**也就是一款游戏的 ping 计数器量的那个数**，这不是我挑的仪表，
是引擎注释自己说的。5 s 一轮得 19–20 个样本。

**所有场景除注明外都是**：`sc(oneRoom(), …)`（`seed: 7`、`rtsThresholdBytes: 3000`、
`snapshotIntervalMs: 10`）、AP 在 (5, 1)、站点在 y = 5 一排、`caps.features =
{ edca: true, txop: true, ampdu: true }`、`generation: 'eht'`。

---

## 1. 机理（从代码读出来的，不是从字段名猜的）

### 1.1 七种作弊：七个预设，三个消费点，而消费点决定了哪一种会空转

`src/model/scenario.ts:82–113`：`TamperCfg` 七个可选字段，`TAMPER_KINDS` 七个名字，
`TAMPER_PRESETS` 把名字映到字段，`tamperKindOf()` 反查。七个预设逐字如下：

| 名字 | 预设 | 它违反的条 |
| --- | --- | --- |
| `escalate` | `{ allAsAc: 3 }` | §10.2.3.2 / Table 10-1 的 UP→AC 映射 |
| `aifs` | `{ aifsn: 1 }` | **§10.23.2.4**：「AIFSN[AC] shall be greater than or equal to 2 for non-AP STAs」；1 是 AP 的下限 |
| `cw` | `{ cwMin: 0, cwMax: 0 }` | §10.23.2.4 的「0 到 CW[AC] 之间均匀抽取」 |
| `noDouble` | `{ noDoubling: true }` | **§10.23.2.2**：`CW[AC] shall be set to the lesser of CWmax[AC] and 2^QSRC[AC] × (CWmin[AC] + 1) − 1` |
| `txopHog` | `{ txopLimitUs: 8000 }` | **§10.23.2.9**：一个 TXOP 的时长不得超过 TXOP limit（非零时） |
| `navInflate` | `{ navInflateUs: 3000 }` | **§9.2.5.2**：EDCA 下单次/多次保护的 Duration 设定 |
| `greedy` | 上面五项合体（`allAsAc` + `aifsn` + `cw` + `txopLimitUs`） | 以上全部 |

**消费点只有三个，而这三个各自带着一个闸门——那就是空转的根源：**

1. **`src/engine/mac.ts:107–121` `effectiveParams(base, t)`** 把 `aifsn` / `cwMin` / `cwMax` /
   `noDoubling` / `txopLimitUs` 折进那张 `AcParams` 表。它在 `mac.ts:236` 被调用，
   而参数表是 `cfg.edca ? EDCA_PARAMS : [DCF_PARAMS]`——**`edca: false` 时只有一组参数**。
2. **`src/engine/simulation.ts:350`**：
   `const ac = atNode !== ap.id && sta?.tamper?.allAsAc !== undefined ? sta.tamper.allAsAc : msdu.ac`。
   注释写得很准：「a tampered driver may re-mark its own (uplink) frames; it cannot touch the AP's」。
3. **`src/engine/mac.ts:785`**：`return durationNs + (this.cfg.tamper?.navInflateUs ?? 0) * 1000`。

**三个闸门：**

- **`mac.ts:428`**：`const aifs = this.cfg.edca ? aifsNs(e.params.aifsn, this.T) : this.T.difsNs`。
  **`edca: false` 时被篡改的 `aifsn` 一个字都读不到**——走的是 DIFS。
- **`mac.ts:355` `efIndex(ac)`** 在 `!edca` 时把任何 `ac` 折到 0，
  且 `ENQUEUE` 记录的 `ac` 字段在 `!edca` 时写 `undefined`（`mac.ts:366`）。
  **于是 `allAsAc: 3` 在 DCF 站点上无处落地。**
- **`mac.ts:630 / 653 / 789`**：TXOP 要同时满足 `this.cfg.txop && this.cfg.edca &&
  e.params.txopLimitNs > 0`。**`edca: false` 时根本没有 TXOP，`txopLimitUs: 8000` 无人读。**

还有一个闸门在场景层：**`simulation.ts:290`**：`tamper: n.kind === 'sta' ? n.tamper : undefined`。
**贴在 AP 上的 `tamper` 被显式丢掉。** schema 不拒，编辑器不给点（`FloorPlanEditor.tsx:801`
只对 `kind === 'sta'` 渲染那个下拉框），但从 JSON 导入是进得来的。

### 1.2 云端服务器：一层真的应用层，而它被一行关着

`src/model/scenario.ts:570–620`：

```
ServerKind = 'video' | 'web' | 'call' | 'game'
ServerCfg  = { id, kind, name, rttMs, jitterMs, processMs }
DEFAULT_SERVERS = [ YouTube video 20/2/1, Google web 12/2/5, Call server call 40/5/1, Game server game 25/3/2 ]
serverKindFor(profile): video→video，browsing/backup/iot→web，voice→call，gaming→game，p2pvideo/saturated/idle→null
serverFor(sc, n, profile): 显式绑定 → 该 kind 的第一台 → null
```

`simulation.ts:373–379` 把它折成 `ServerLink{ wanNs: rttMs × 500 000, jitterNs, processNs }`，
**每方向 `rttMs/2`**，交给 `TrafficSource`。`traffic.ts` 那一侧：

- `emitDl()`（第 208 行）：**没有服务器时帧直接进 AP 的队列；有服务器时先发一条 `WAN_TX`，
  一个 WAN 跨越之后才进队列。**
- `onUplinkDelivered()`（第 237 行）：上行**被确认之后**才发 `WAN_RX`，
  再等 `processNs` 才由服务器作答。
- `schedulePing()`（第 259 行）：每 250 ms（±10 %）一个 64 B 包；它的回声就是 `appRtt` 的样本。
- `scheduleVoice()`（第 287 行）：`if (!this.server) this.emitDl(200)`——
  **有通话服务器时下行是对每一个「已送达」上行包的回声**，不再是独立的 20 ms 时钟。
- `scheduleBrowsing()`（第 348 行）：无服务器时页面在请求后固定 30 ms 到；
  **有服务器时页面由 `onUplinkDelivered → sendPage` 触发。**

**这最后两条是一条真的反馈路径，而且它正是 §6 要改那几句 `limits` 的根据：
上行丢了，回答就不来。** 它不是速率自适应（请求的节奏仍是自己的时钟），
但「下行取决于上行是否送达」这件事在引擎里是成立的。

**关它的那一行是 `src/course/wifiScenes.ts:63–65`：**

```ts
// Lessons are about the Wi-Fi MAC: no cloud servers, so no WAN delay and
// every quoted timestamp stays where it is.
servers: [],
```

`sc()` 是**全课程唯一**的场景构造器：`lessonKit.ts` 把它再导出，
UWB 与 AMP 的场景辅助函数也建在它上面。**所以这一行关掉的不是 Wi-Fi 课程，是三条赛道的 226 个场景。**
而它那句理由（「every quoted timestamp stays where it is」）是对的、必须保留——
见 §4 与 `tests/course/quoted-timestamps.test.ts`。

### 1.3 `gaming` 档与 `gameAccel`：一个布尔，一次接入类别的改写，和一个到不了的分支

`src/model/scenario.ts:70` 的 `PROFILE_IDS` 含 `'gaming'`。
`traffic.ts:313–326` 的 `scheduleGaming()` / `scheduleGameServer()` 用的是一次实测：
`WZRY_UL_GAPS`（九档间隔直方图，均值 30 ms ≈ 33 fps）、`WZRY_UL_SIZES`（89/91/100/131 B）、
下行 65 ± 3 ms 的 133–203 B 状态帧，约五分之一的 tick 另带一个 52–76 B 小包。
注释写明来源：2026-09-09 用 USB 包镜像抓的一局王者荣耀，十分钟。

`NodeCfg.gameAccel`（`scenario.ts:140`，注释写明「AP only」），
`simulation.ts:379` 读的是 `ap.gameAccel === true`，然后：

```ts
// traffic.ts:150
get ac(): number {
  if (this.profile === 'gaming') return this.gameAccel ? 2 : 1 // AC_VI if the router marks it, else AC_BE
  return acForProfile(this.profile)
}
```

**这里有一处必须写进规格的死分支：`acForProfile('gaming')` 返回 2（`traffic.ts:79`，
注释「AC_VI (where WMM-aware routers and consoles put game traffic)」），
而上面那个 getter 在 `gaming` 上直接返回、从不落到它身上。
`acForProfile` 全仓库只有这一个调用方（`traffic.ts:152`）。
于是 `case 'gaming': return 2` 这一支在今天的引擎里到不了。**
引擎真正的答案是：**游戏流量默认是 AC_BE，除非路由器的游戏模式打开。**

**这件事要改课文而不只是改代码**：`src/course/tier2/edca.ts:125` 的 `limits` 说
「一帧属于哪一类，在这里由站点的业务档位一次固定下来（traffic.ts 的 acForProfile）」——
对其余八个档成立，**对 `gaming` 不成立**，它由 AP 的一个布尔决定。见 §6.5。

---

## 2. 建什么（每处标出处）

**引擎零改动。** 三件东西的实现、schema、编辑器 UI、i18n 全部在位。要建的只有课程侧，
加上 §6 的既有文案修正与 §2.4 的两处引用更正。

### 2.1 两个新场景构造器，放在 `src/course/wifiScenes.ts` · `model`

照 `selectivityScenario()` 已经立的规矩：**新场景自己 `extra` 里显式写 `servers`，
`sc()` 的 `servers: []` 缺省一个字不动。**

```
/** 三台手机在开黑，一台笔记本在饱和上传；可选路由器游戏模式。 */
export function cloudGameScenario(opts: { accel?: boolean; overseas?: boolean }): Scenario

/** 三台站点都在饱和上传，sta-1 可带一种作弊预设。 */
export function tamperScenario(cheat?: TamperKind): Scenario
```

**为什么作弊那一课的基线场景必须是饱和、而不是开黑：**
§7.2 量出来，`txopHog` 在一个只打游戏的场景里**一个后果都不改**
（游戏上行包 89–131 B、平均每 30 ms 一个，队列里永远没有第二帧可以霸占）。
**开黑场景仍然要作为 variant 留着——因为那个空转本身是这一课要教的东西**，而不是基线。

### 2.2 两门新课，各自一个文件 · 见 §5

`src/course/tier2/wan-rtt.ts`、`src/course/tier2/edca-tamper.ts`，
加进 `src/course/lessons.ts` 的 `AUTHORED` 与 `src/course/curriculum.ts` 的 `COURSE_ORDER`。

### 2.3 常数出处，逐个 · 这一节是本规格的「caps are computed」

| 常数 | 值 | 标 | 谁选的 |
| --- | --- | --- | --- |
| AC_BK/BE/VI/VO 的 AIFSN | 7 / 3 / 2 / 2 | `standard §9.4.2.27` Table 9-194 | 标准正文（p1069），引擎 `phy.ts:302` 逐值相符 |
| 四类 CWmin / CWmax | 15/1023、15/1023、7/15、3/7 | `standard §9.4.2.27` Table 9-194 | 由 aCWmin = 15 按表里的式子算出：VI 是 (15+1)/2−1 = 7，VO 是 (15+1)/4−1 = 3 |
| 四类 TXOP limit | 2.528 / 2.528 / 4.096 / 2.080 ms | `standard §9.4.2.27` Table 9-194（Clause 17/18/19/21/27 PHY 那一列） | 标准正文 |
| 非 AP 站点的 AIFSN 下限 2 | 2 | `standard §10.23.2.4` | 正文逐字：「shall be greater than or equal to 2 for non-AP STAs」；AP 的下限是 1 |
| AIFSN 子字段最小值 2 | 2 | `standard §9.4.2.27`（p1068） | 正文逐字：「The minimum value of the AIFSN subfield is 2.」 |
| CW 的更新式 | `min(CWmax, 2^QSRC × (CWmin+1) − 1)` | `standard §10.23.2.2` | 标准正文 |
| AIFS 的式子 | `AIFSN × aSlotTime + aSIFSTime` | `standard §10.23.2.4` | 标准正文 |
| 16 µs / 9 µs | SIFS / 时隙 | `standard §17.4.4` | 引擎 `phy.ts` 的 `OFDM_5G`，与既有 `edca.ts` 的引用一致 |
| `txopHog` 的 8 000 µs | 8 ms | **`model`** | 是这个仓库挑的一个「明显越界」值：AC_VI 的上限是 4.096 ms，8 ms 恰好是它的约两倍。写进课文时必须说这是挑的数，不是标准里的某个数 |
| `navInflate` 的 3 000 µs | 3 ms | **`model`** | 同上。量出来它刚好把 `cts:ap` 那条 NAV 从 2 383 µs 顶到 5 383 µs（§3.3），即 **+3 000 µs 整**——这个「整」是可断言的 |
| `DEFAULT_SERVERS` 的 20/12/40/25 ms 与 2/2/5/3/1 | — | **`model`** | `docs/superpowers/specs/2026-09-08-cloud-servers-households-design.md` 第 28–29、70–71 行定下的，当时的状态是「approved in chat」。后来 `traffic.ts:93` 的注释记下一次实测：腾讯服务器中位 RTT 49 ms、散布约 20 ms，**落在 25 ms 的国内预设与 80 ms 的海外预设之间**，所以两个预设都没动 |
| 王者荣耀的包长与间隔直方图 | 见 §1.3 | **`model`**（实测） | 2026-09-09 USB 包镜像，十分钟一局，记忆条目 `wzry-phone-capture` |
| 64 B ping / 250 ms | — | **`model`** | `traffic.ts:61–63`，理由写在注释里：「what a game's ping counter measures」 |
| `gaming` → AC_BE（未加速）/ AC_VI（加速） | 1 / 2 | **`model`**，而**映射本身**标 `standard §10.2.3.2` Table 10-1 | 「游戏流量没有 DSCP 标记所以落到尽力而为」是本仓库的建模选择（`i18n.ts:854` 把它写给用户了）；而「用户优先级怎么折成接入类别」是 Table 10-1 |
| TCP 的拥塞窗口、语音的抖动缓冲 | — | **`out-of-scope`** | **这两样的取值在 IEEE 语料里查不到，它们在 RFC 里。** 所以这一侧只能标 `model` 或 `out-of-scope`，而本规格选 `out-of-scope`：不是「有机理缺一个数」，是「不在这个标准的范围里」 |

### 2.4 两处引用更正，顺这一刀改 · 它们是这一刀自己要引的条

**（一）`src/course/tier2/edca.ts:131` 的 `sources` 把条号写错了。**
现在：「Table 9-194（EDCA 参数集元素，§9.4.2.28）」。
**§9.4.2.28 是 TSPEC element。** EDCA Parameter Set element 是 **§9.4.2.27**
（语料 TOC：9.4.2.26 BSS Load element p1066、**9.4.2.27 EDCA Parameter Set element p1067**、
9.4.2.28 TSPEC element p1070；Table 9-194 印在 p1069，正落在 §9.4.2.27 里）。
同一句里的 §10.23.2.4 与 §17.4.4 是对的（AIFS 式子就在 §10.23.2.4，我核了正文）。

**（二）`src/engine/traffic.ts:73` 的注释把条号写错了。**
现在：「(§10.2.4.2 UP→AC mapping spirit)」。
**§10.2.4 是 Mesh coordination function (MCF)，没有 §10.2.4.2 讲 UP→AC。**
Table 10-1「UP-to-AC mappings」印在 p1877，落在 **§10.2.3.2 HCF contention based channel
access (EDCA)** 里。

**这两处都在这一刀自己要引的条上，所以归这一刀改；它们不是顺手做的无关清理。**

---

## 3. 读者会看到什么（每个数带量具）

### 3.1 云端往返：三列并排，而第二列是这一课的全部

**量具**：`oneRoom()`，AP (5, 1)，一台 `gaming` 手机 (3, 5)，可选两台 `saturated`
笔记本 (8, 6) / (9, 3)，`sc()` 种子 7，`servers` 按行给，跑 **5 000 ms**，
读 `stats.appRtt`（19–20 个 ping 回声样本）与 `stats.txLatency`。

| 配置 | 应用往返 均值 | 应用往返 最大 | MAC 入队→确认 均值 | 同 最大 |
| --- | --- | --- | --- | --- |
| 无服务器，安静 | **（量不出来）** | — | 0.108 ms | 0.348 ms |
| 无服务器，+2 台饱和上传 | **（量不出来）** | — | 6.586 ms | 81.561 ms |
| 游戏服务器 25/3/2，安静 | **28.688 ms** | 29.964 ms | **0.106 ms** | 0.106 ms |
| 游戏服务器，+2 台饱和上传 | **41.613 ms** | 111.713 ms | **6.538 ms** | 76.214 ms |
| 同上 + 路由器游戏模式 | **34.395 ms** | 43.270 ms | **2.506 ms** | 10.351 ms |
| 海外服务器 80/20/2，安静 | 93.783 ms | 99.714 ms | 0.106 ms | 0.106 ms |
| 海外服务器，+2 台饱和上传 | 109.872 ms | 138.865 ms | 7.788 ms | 84.999 ms |

**这一课的那一句，就是第三行与第四列的比：安静时 28.688 ms 里属于空口的是 0.106 ms，
千分之四。** 读者以为的「Wi-Fi 慢」在这一行里一分都不是 Wi-Fi 的。
25 + 2 = 27 ms 是 WAN 与服务器，另外约 1.5 ms 是抖动的一半的期望
（`jitterMs: 3`，每方向从 `[0, 1.5]` 均匀抽），**28.688 与 28.5 的算术预期对得上，
这是一个可以在课文里现场验算的数。**

**而第四行是空口第一次出现：6.538 ms 的排队，把 28.7 推到 41.6。**
**第五行是那个布尔：路由器把游戏流量标进 AC_VI 之后，排队从 6.538 降到 2.506 ms，
应用往返从 41.613 降到 34.395 ms——而最大值从 111.7 降到 43.3，尾巴收得比均值狠得多。**

**前两行的「量不出来」不是排版缺失，它是这一课的第二个论点：**
今天的 `servers: []` 下 `stats.appRtt.n === 0`——**引擎没有任何办法回答「用户等了多久」**，
它只能回答「这一帧在 MAC 里等了多久」。那两列 0.108 / 6.586 ms 与有服务器时的
0.106 / 6.538 几乎一样，**于是「打开服务器」并不是把空口那一侧改掉，
它是在同一个空口之上补了一个分母。**

### 3.2 七种作弊：四级阶梯加一个封顶组——**不是七级严格单调**

**量具**：`oneRoom()`，AP (5, 1)，三台 `saturated` 站点 (3, 5) / (5, 5) / (7, 5)，
`servers = DEFAULT_SERVERS`，跑 **2 000 ms**，份额 = 该站点的 `stats.txOk` ÷ 三台之和。
sta-1 是作弊者。**五个种子（7、11、23、37、42）各跑一遍**——
理由见 §10.3：这张表的第一版只有种子 7，而它骗了我一次。

种子 7 的那一轮（课文要引的那一轮）：

| 配置 | 作弊者的份额 | 守规 A 的 `txOk` | 守规 B 的 `txOk` | 该轮 `COLLISION` |
| --- | --- | --- | --- | --- |
| 基线 | **31.4 %** | 7 343 | 5 967 | 126 |
| `noDouble` | **41.9 %** | 6 555 | 3 757 | 151 |
| `aifs` | **51.7 %** | 5 578 | 3 472 | 119 |
| `txopHog` | **63.6 %** | 3 951 | 3 489 | 65 |
| `escalate` | **95.6 %** | 679 | 195 | 83 |
| `navInflate` | **99.4 %** | 25 | 100 | 1 |
| `cw` | **99.9 %** | 25 | 0 | 20 |
| `greedy` | **100.0 %** | **0** | **0** | 1 |

**五个种子一起看，可断言的是四级，不是七级：**

| 级 | 五个种子的份额 | 跨种子区间 |
| --- | --- | --- |
| 基线 | 31.4 / 33.8 / 34.1 / 32.5 / 29.4 % | 29.4–34.1 % |
| `noDouble` | 41.9 / 39.6 / 41.1 / 39.1 / 35.3 % | **35.3–41.9 %** |
| `aifs` | 51.7 / 45.5 / 56.5 / 44.5 / 46.3 % | **44.5–56.5 %** |
| `txopHog` | 63.6 / 63.2 / 64.5 / 63.4 / 57.7 % | **57.7–64.5 %** |
| `escalate` | 95.6 / 96.0 / 96.6 / 93.4 / 93.1 % | **93.1–96.6 %** |
| **封顶组** `navInflate` / `cw` / `greedy` | 全部落在 98.6–100.0 % | **98.6–100.0 %** |

**前四级在每一个种子上都严格递增，而且每一级之间的同种子间距都不小于 8 个百分点。**
**而封顶那三种的相互次序随种子翻转**：种子 7 与 11 是 `navInflate < cw < greedy`，
种子 23 是 `cw 99.9 < navInflate 100.0`，种子 37 与 42 则 `cw` 与 `greedy` 并列 100.0。
**它们三个都把守规站点压到几乎一帧不发，于是「谁更狠」这个问题在这个场景上没有答案——
份额已经撞到天花板了。**

**所以 `src/model/scenario.ts:103` 那句注释（「from the subtle to the brazen」）
量出来只对前五种成立；后三种是同一级。** 课文与断言都只许说四级加一组（§8.2 第 6 条）。
**这条修正是这一刀最接近出事的一处**：第一版规格把它写成「七个数严格递增」，
而那只是种子 7 的巧合。

**三件要在课文里说出来的：**

- **`greedy` 下守规站点在 2 s 里一帧也没发出去。** 不是份额小，是 0。
  这正好接上 `edca-cost` 那条 `limits` 的那句「要问『后台流量会不会被饿死』，这个场景答不了」。
- **`noDouble` 是最弱的那一种，而它反而把碰撞推高了**（126 → 151）：
  一个不肯把窗口翻倍的站点，在碰撞之后立刻又用同样小的窗口回来抢，
  **于是它买到的那 10 个百分点是用全场多出的 25 次碰撞换的。**
- **`navInflate` 与 `greedy` 把碰撞打到 1 次。** 一个把邻居全部压住的站点不需要碰撞——
  **「没有碰撞」在这一课里不是健康，是一种症状。**

### 3.3 `navInflate` 的机理：作弊者让 AP 替它说话（而我的第一个量具是错的）

**量具**：`hallwayHouse()`，AP (5, 4)，两台 `saturated` 站点 (2, 4) / (8, 4)
（互相听不见，两道砖墙），种子 7，跑 **300 ms**，按 `(node, source)` 分组数 `NAV_SET`
并取每组的最长 NAV。

| | 基线 | `navInflate` |
| --- | --- | --- |
| `sta-2 ← cts:ap` 条数 | 58 | **116** |
| `sta-2 ← cts:ap` 最长 NAV | 2 383 µs | **5 383 µs** |
| `sta-1 ← cts:ap` 条数 | 60 | 1 |
| `sta-? ← data:sta-1` 条数 | **0** | **0** |

**5 383 − 2 383 = 3 000 µs，一微秒不差。而没有任何一条 NAV 的来源是作弊者的数据帧。**
因为这是一个隐藏节点场景：帧长过了 RTS 门限，走的是 RTS/CTS，
**而 AP 的 CTS 把 RTS 里那个被膨胀的 Duration 照抄了出去。**
于是守规站点被压住 5.383 ms，压它的那一帧来自 AP——**作弊者让 AP 替它说话。**

**这一节里我自己的第一个量具是错的，必须记下来：**
我第一版用「`NAV_SET.source` 里含 `sta-1`」去数，在这个场景上得到 0，
于是差点报出「隐藏节点几何下 `navInflate` 空转」。而同一轮的时间线明明在变
（作弊者的 `TX_START` 从 127 涨到 233）。**一个「0」和一个「在变」同时出现，
说明读的是错的那一栏**——NAV 的来源字段写的是 `cts:ap`，不是 `data:sta-1`。
这是本会话第 N 次「惊讶的测量通常是量错了」，而它正好发生在这份规格最关键的一格上。

### 3.4 `gameAccel`：它不是装饰，而且在安静的房间里也能看见

**量具**：量具 C（哈希 + 逐记录 diff），`oneRoom()`，跑 2 000 ms。

| 对照 | 结果 |
| --- | --- |
| 一台 `gaming` 手机 + AP，安静 | 记录数 **3 932 → 3 568**；`ENQUEUE.ac` 从 **1 全变 2**（90 条）；`RX_OK` 两边都是 180 |
| 三台 `gaming` + 两台饱和 + 一台视频 | 记录数 295 227 → 316 479；`RX_OK` **34 552 → 36 631** |
| 同上 + `servers` | 记录数 302 121 → 312 475；`RX_OK` 33 744 → **35 378**；`COLLISION` 125 → 96；`INTERNAL_COLLISION` 这一类**整个消失** |
| 三台 `gaming` + 一台饱和（§3.1 第四/五行同一组） | 应用往返 41.613 → 34.395 ms；排队 6.538 → 2.506 ms |

**「安静的房间里也能看见」这一条要紧**：一台手机独占空口时 `RX_OK` 两边都是 180，
**后果一个都没变，而记录流少了 364 条**——因为 AC_VI 的 cwMin 是 7 而 AC_BE 是 15，
退避记录少了。**所以一个「开关打开后记录流变了」的证明必须说清变的是哪一类记录：
这一格里变的只是退避的抽签，不是哪一帧收到了。** 真正可读的后果在有竞争的那三行。

还有一条顺带的：加速打开之后 **`INTERNAL_COLLISION` 这一类记录整个消失**。
游戏流从 AC_BE 搬到 AC_VI 之后，它不再和同一台设备上的其他尽力而为流抢同一条队列——
**这是一条「谁和谁在抢」的证据，而它只在记录类型的层面看得见。**

---

## 4. fixture 的决定

**`tests/fixtures/lesson-hashes.json` 只许增行，而这一次「只增行」是结构性保证，不是小心。**

`tests/engine/lesson-hashes.test.ts` 用 `expect(hashes).toEqual(recorded)`，
键是 `l.id` 与 `${l.id}#${i}`，再加 7 个 `household:*`。于是：

1. **两门新课与它们的 variants 是纯新键**，老键一个都不碰。
2. **既有场景一个字节都不动**，因为 `sc()` 的 `servers: []` 缺省不变、
   新场景在自己的 `extra` 里显式写 `servers`，而 `tamper` / `gameAccel` 只出现在新场景的节点上。
3. **绝对不许给既有场景加 `servers`。** 量过了：同一个场景加上 `DEFAULT_SERVERS`
   之后 `RX_OK` 从 34 552 变成 33 744（下行帧被 WAN 推后，整条时间线跟着挪）。
   而 `tests/course/quoted-timestamps.test.ts` 逐纳秒钉着
   `backoff` 的 248 000 / 293 000、`nav` 的 498 000 / 790 000 / 824 000、
   `hidden` 的 2 325 000 / 2 387 000、`anomaly` 的 749 000。
   **`wifiScenes.ts:63` 那句注释说的就是这件事，它是对的，必须留着（措辞要改，见 §6.6）。**

**唯一允许跑 `UPDATE_HASHES=1` 的那一步：**
两门课的文件、场景构造器、`COURSE_ORDER` 与 `AUTHORED` 全部落地、
`npx vitest run tests/course` 全绿之后，**跑一次**

```
UPDATE_HASHES=1 npx vitest run tests/engine/lesson-hashes.test.ts
```

然后**读 `git diff` 并确认它只有新增行**。出现任何一行修改（`-` 后面跟着同一个键）
就是动了既有场景，**停下来，不许提交**。

UWB 那份 `tests/fixtures/uwb-record-hashes.json` 这一刀碰不到，不许跑它的 `UPDATE_HASHES`。

---

## 5. 课程落点：两课，不是三课

### 5.1 为什么不是三课

**`gaming` 档单独撑不住一课，而且它会和 `edca` 重复。**
`gameAccel` 唯一做的事是把游戏流的接入类别从 1 改成 2，
而「AC_VI 等得短、抽得少，所以它先上空口」正是 `edca` 与 `edca-cost` 两课的全部内容。
一门只讲 `gameAccel` 的课，`numbers` 里能印的就是 §3.4 第一行——
**而那一行量出来「后果一个都没变」。**

**而把它并进云端那一课，它立刻有了一个读者看得见的数**：
41.613 → 34.395 ms（§3.1 第四、五行）。**路由器那个勾是这一课唯一一个读者能在自己家里按的按钮，
而它要有意义，必须有一个应用层的分母去量。** 反过来也成立：
云端往返那一课要是没有一条延迟敏感的流，`appRtt` 的样本只剩 ping，课文就只能印 WAN 的常数。
**两者互为量具。**

### 5.2 为什么不是一课

`lessonMinutes = 正文字数/220 + 2×observe + 4×tryThis`，取 5 的整数，上限 30。
合成一课要同时教：应用层往返的分解、接入类别的改写、七种参数偏离、以及「协议靠什么约束参与者」。
按 2026-09-25 的 pacing 规格，**一门跑过 30 分钟的课是一门在教两个题目的课，答案是拆开**。
而且两者的「不做」清单方向相反：云端那一课的 `out-of-scope` 是 TCP 与抖动缓冲，
作弊那一课的是检测与管理帧。**合成一课的 `limits` 会是两列互不相关的东西。**

### 5.3 两门课的落点、预算与工作标题

既有课的剩余字数（量具 B 的同一个脚本，`headroom = ⌊(30 + 2.5 − raw) × 220⌋`，
即「再加多少个汉字会把 `lessonMinutes` 顶过 30」）：

| 课 | 现在的分钟 | 还剩多少字 |
| --- | --- | --- |
| `ru-diversity` | 30 | **480** |
| `selectivity` | 30 | **762** |
| `capstone` | 25 | 1 356 |
| `rate-cost` | 20 | 2 875 |
| `edca-cost` | 15 | 3 602 |
| `queues` | 15 | 3 653 |
| `edca` | 15 | 3 417 |
| `retries-queues` | 15 | 3 944 |

**`ru-diversity` 与 `selectivity` 这条路是关着的，brief 这一条成立**（480 与 762 字，
一段都塞不下）。**而「挂进既有课」这条路对这两件东西整体上是关着的，理由不是字数：**
`edca-cost` 还剩 3 602 字，够塞；但塞进去就要给它加 `servers`，
而那会动它自己 `limits` 里逐字印着的 1.49 ms 与 10.23 ms，以及 `watch` 里的
0.088 ms / 23 ms / 55 ms / 23.1912 ms。**既有课的时间线是不能动的（§4），所以新场景只能配新课。**

---

**第一课 · `wan-rtt`**

| | |
| --- | --- |
| 文件 | `src/course/tier2/wan-rtt.ts` |
| 模块 | **M11 · tier 1 ·「真实应用」**（今天只有 `capstone` 一门） |
| `COURSE_ORDER` 位置 | `capstone` **之前**：结业课要读者给一个家庭网络排序，而「这段时延里有多少是空口的」是那道题的前提 |
| 工作标题 | **「云端往返——那段时延里属于空口的只有千分之四」** |
| `needs` | `['edca', 'edca-cost', 'queues']` |
| 目标分钟 | **25**（正文 2 200–2 900 字，3 个 observe、2 个 tryThis → 固定 14 min，raw 落在 24.0–27.2） |
| 场景 | `cloudGameScenario({})`：AP + 三台 `gaming` + 一台 `saturated`，`servers = DEFAULT_SERVERS` |
| variants | ① 游戏模式打开（`gameAccel`）② 海外服务器 80/20/2 ③ **无服务器**（同一个房间，`servers: []`——读者亲眼看到 `appRtt` 那一栏空掉） |
| 一句话结论 | **安静的房间里，28.7 ms 的游戏往返有 0.106 ms 是空口的；空口要到有人同时上传时才第一次出现，而路由器那个勾买回来的是 4 ms。** |

**第二课 · `edca-tamper`**

| | |
| --- | --- |
| 文件 | `src/course/tier2/edca-tamper.ts` |
| 模块 | **M7 · tier 1 ·「QoS 与效率」** |
| `COURSE_ORDER` 位置 | `edca-cost` **之后**、`ampdu` 之前：`edca` 给出四组参数，`edca-cost` 给出「谁付了多少」，这一课问「如果那四组参数由站点自己填会怎样」 |
| 工作标题 | **「篡改驱动——七种偏离，和其中三种什么都不做的那些场合」** |
| `needs` | `['edca', 'edca-cost', 'collisions-cw', 'txop']` |
| 目标分钟 | **30**（正文 3 500–4 000 字，3 个 observe、2 个 tryThis → 固定 14 min，raw 落在 29.9–32.2；**上限紧，正文超过 4 070 字就顶破 30**） |
| 场景 | `tamperScenario()`：三台 `saturated` 站点，sta-1 不作弊 |
| variants | 七个预设各一个，**加一个「开黑场景 + `txopHog`」**——那个变体的全部内容就是 §7.2 的空转 |
| 一句话结论 | **七种偏离在一个饱和的房间里把作弊者的份额从约三成推到几乎十成，而它们只分成四级加一个封顶组——而同样七种里有三种在合法的别处逐字节什么都不做；协议约束参与者靠的不是参数本身，是参数落在谁手里。** |

**两课共用的素材已经有了：`docs/reports/edca-tamper-report.zh.html`（81 574 B，六节）。**
它第 3 节是一张七种作弊的总表，带「AP 单独是否足够检测」这一栏（足够 / 需协助 / 足够（统计）），
第 1 节已经自己发现了 `txopHog` 对只打游戏的作弊者「轨迹完全相同，三个种子逐一相同」，
第 6 节定了一条噪声门限（跨配置差异要达到 1.0 ms 或基线的 2 %）。
**这份报告确实把这一课的骨架写好了，brief 这一条成立——但它的路径不对，见 §10.2。**
注意报告的数是 8 s × 3 种子、跑在七个家庭预设上的，**课文不能直接引用它们**：
一门课的场景是另一个场景。报告给的是**结构**（哪一种留下什么证据、谁能单独看见），
数要在课文自己的场景上重新量。

---

## 6. 要改的既有文案，逐条

### 6.1 `src/course/tier1/retries-queues.ts:134` · `out-of-scope` · **这一句的一半是假的**

现在：

> 一次失败的代价在这里只有空口时间与窗口翻倍，**因为引擎之上什么都没有**：业务源直接生成
> MSDU，没有 TCP 的重传与拥塞窗口，也没有语音的抖动缓冲。……要问「用户感受到了什么」，
> 这个模型答不了。

**假的是「引擎之上什么都没有」这个绝对句。** 引擎之上有一层：
`ServerCfg{rttMs, jitterMs, processMs}`、`WAN_TX` / `WAN_RX` 两类记录、`stats.appRtt`
这个应用往返累计，以及「上行没送达则回答不来」那条路径（§1.2）。
**真的那一半是后面那两个分句：引擎至今没有拥塞窗口，也没有抖动缓冲，一个都没有。**

之后有资格说的（并带 `until: 'wan-rtt'`）：

> 一次失败的代价在这里只有空口时间与窗口翻倍，**因为这一课的场景之上什么都没有**：
> 它的 `servers` 是空的，于是业务源直接生成 MSDU，连一次应用往返都量不出来。
> 引擎本身有一层云端——「云端往返」那一课把它打开，那里 28.7 ms 的往返只有 0.106 ms 属于空口。
> **而即便打开它，仍然没有的是 TCP 的重传与拥塞窗口，也没有语音的抖动缓冲**：
> 服务器会因为上行没送达而不回答，却不会因为时延变长而降速。
> 要问「用户感受到了什么」，打开那一层之后答得出一半：等了多久答得出，退不退让答不出。

### 6.2 `src/course/tier2/edca-cost.ts:73` · `out-of-scope` · **同一个绝对句，同样是假的**

现在：

> 「谁付了多少」那张表只算到排队时延与抽签次数，**因为引擎之上什么都没有**：语音是每 20 ms
> 一帧 200 字节的固定时钟，没有抖动缓冲，也没有丢帧之后的编解码补偿。……

**同一个绝对句，同样假。** 而这里还多一处要改：
「语音是每 20 ms 一帧 200 字节的固定时钟」——**有通话服务器时不是固定时钟**：
`traffic.ts:287` 的 `if (!this.server) this.emitDl(200)` 说明下行是对每一个已送达上行包的回声。
上行仍是 20 ms 的时钟，下行不是。

之后（带 `until: 'wan-rtt'`）：

> 「谁付了多少」那张表只算到排队时延与抽签次数，**因为这一课的场景之上什么都没有**：
> 它的 `servers` 是空的，于是语音上下行都按每 20 ms 一帧 200 字节的本地时钟走。
> 场景里放一台通话服务器，下行就变成对每一个已送达上行包的回声，往返才有个分母
> （「云端往返」那一课）。**仍然没有的是抖动缓冲与丢帧之后的编解码补偿**，
> 所以 1.49 ms 与 10.23 ms 只是 MAC 层的排队时间，不是通话质量。

### 6.3 `src/course/tier1/queues.ts:115` · `out-of-scope` · **绝对句要收窄**

现在：「**业务源没有任何反馈回路**：饱和上传在每次出队时立刻补上一帧……真实的 TCP 会因为丢包与时延自己降速。」

**「没有任何反馈回路」在有服务器时不成立**：网页那一课的页面要等上行请求被确认才由
`onUplinkDelivered → sendPage` 发出，通话的回声同理。
**这不是速率自适应的反馈——请求的节奏仍是自己的时钟——但它是一条反馈路径，
而「没有任何」是一个绝对句。**

之后（带 `until: 'wan-rtt'`）：

> 业务源的**节奏**没有反馈回路：饱和上传在每次出队时立刻补上一帧（`traffic.ts` 的 `refill`），
> 视频按自己的时钟每 747 µs 加 0–200 µs 抖动产生一个 1400 字节的帧，不管队列里已经堆了什么。
> 场景里放一台服务器之后出现的是另一种反馈：**回答要等请求被确认才来**，
> 上行丢了下行就不来。真实的 TCP 要的是第三种——它会因为丢包与时延**自己降速**，
> 而这一种引擎没有。所以「把缓冲区改大，一帧也不会多送到」这条结论在本模型里是绝对的，
> 在真实网络里只是大致成立。

### 6.4 `src/course/tier2/rate-cost.ts:79` · `unmodelled` · **绝对句要收窄**

现在：「这笔开销只算到空口这一层，**因为引擎里没有任何东西会因为多等而慢下来**：……」

**同样是绝对句，同样被服务器那条路径推翻一半。** 这一课的场景是饱和上传，
对它而言「不会慢下来」逐字成立；**但那句话说的是「引擎里」，不是「这个场景里」。**

之后（带 `until: 'wan-rtt'`）：

> 这笔开销只算到空口这一层，**因为这一课的两条流都不会因为多等而慢下来**：
> 饱和档位维持一个恒定 20 帧在手的窗口，每出队一帧就补一帧（`traffic.ts` 的 `refill`），
> 时延翻倍它也照发。引擎里确实有一种会等的流——有服务器时，回答要等请求被确认才来——
> 但那是「等答复」，不是「降速」。真实的上传跑在 TCP 上，往返一变长它自己就退让，……

### 6.5 `src/course/tier2/edca.ts:125–126, 131` · 三处 · **一处事实、一处 `until`、一处条号**

- **第 125 行（`unmodelled`）**：「一帧属于哪一类，在这里由站点的业务档位一次固定下来
  （traffic.ts 的 acForProfile）」。**对九个档里的八个成立，对 `gaming` 不成立**：
  `TrafficSource.ac` 在 `gaming` 上直接返回、从不调用 `acForProfile`，
  类别由 **AP 的 `gameAccel`** 决定（§1.3）。要补一句，并带 `until: 'wan-rtt'`。
- **第 126 行（`unmodelled`）**：「……这里只能靠篡改驱动那一项配置来模拟」——
  **它点名了 `tamper` 而今天没有任何一课演示它**。加 `until: 'edca-tamper'`。
  这是本刀里唯一一条「加 `until` 而不改正文」的。
- **第 131 行（`sources`）**：§9.4.2.28 → **§9.4.2.27**（§2.4）。

### 6.6 `src/course/wifiScenes.ts:63–65` · 注释 · **它会在新场景落地的那一刻变成假的**

现在：「Lessons are about the Wi-Fi MAC: no cloud servers, so no WAN delay and every quoted
timestamp stays where it is.」

**第一句在新课落地之后就不再是关于「lessons」的真话了**，而第二句的那个理由必须留着、
而且要说清它是一条**禁令**，不只是一个事实。改成（英文，照这个文件的语言）：

> `sc()`'s default is NO cloud server, and every lesson written before 2026-10-05 relies on it:
> `tests/course/quoted-timestamps.test.ts` pins timestamps to the nanosecond, and a `servers`
> entry delays every downlink frame by one WAN crossing, which moves the whole timeline
> (measured: `RX_OK` 34 552 → 33 744 on the same scene). **A scene that wants servers states
> them in its own `extra` and is a NEW scene — never retrofit `servers` onto a shipped one.**

### 6.7 `src/engine/traffic.ts:73` · 注释 · 条号

§10.2.4.2 → **§10.2.3.2 / Table 10-1**（§2.4）。

### 6.8 不改的那几条，以及为什么

- **`capstone.ts:183`**（「既因为没有策略引擎，也因为没有拥塞控制」）：**两句都还是真的。**
  这一刀不给引擎策略引擎，也不给拥塞控制。不动。
- **`queues.ts:112`**（「或者干脆不丢，而是让上层自己降速」）：说的是真实设备，真话。不动。
- **`edca-cost.ts:74`**（「要问『后台流量会不会被饿死』，这个场景答不了」）：
  说的是外来干扰，不是作弊。**诱惑在于 `greedy` 下守规站点确实是 0 帧（§3.2），
  但那是同一个 BSS 里的饿死，不是邻居网络造成的，所以不加 `until`。**
  要是加了，就是把两件不同的事当成一件——这正是本仓库反复出现的那种错。
- **`retries-queues.ts:133`**（「编辑器的『时变链路（衰落）』一节可以把电平的起伏打开，
  本课的三个场景都没有打开」）：这是这一刀要照抄的句式——
  **「引擎有、这一课没打开」这种写法是对的**，而 §6.1–§6.4 那四句的毛病正是它们写成了「引擎没有」。

**所以 brief 说的「五句假话」，核出来是四条 `limits`（§6.1–§6.4）加一条注释（§6.6），
而且假的只是那个绝对句，不是 TCP 与抖动缓冲那两个分句。** 详见 §10.3。

---

## 7. 允许但空转：逐种作弊、`gameAccel`、以及服务器

本仓库反复出现的失效形状是「一个合法的配置可证明什么也不做」
（先例：`docs/superpowers/specs/2026-10-03-selectivity-design.md` §6 与 §8、
`2026-10-04-ru-diversity-design.md` §8）。
**而这三件东西恰恰最容易中招，因为它们就是「引擎里有个开关没人用过」。
所以第一个问题不是「它建成了吗」，是「打开它之后结果真的变了吗」。**

### 7.1 逐种作弊的空转结论（量具 C，2 000 ms，四个场景）

**四个对照场景**：
① 一台 `gaming` 手机 + AP，安静，有服务器；
② 一台 `voice` 站点独占空口，有服务器（`escalate` 那一格另在
「一台 `voice` + 一台饱和笔记本」上复核过，同样逐字节相同）；
③ 三台 `saturated`，`edca: true`；
④ 三台 `saturated`，**`edca: false`**（`generation: 'nonht'`，合法的传统 DCF 场景）。

| 作弊 | ① 安静开黑 | ② 语音作弊者 | ③ 三台饱和 EDCA | ④ 三台饱和 传统 DCF | 结论 |
| --- | --- | --- | --- | --- | --- |
| `escalate` | 变 | **逐字节相同** | 变 | **逐字节相同** | **两处空转**。②：作弊者的流本来就是 AC_VO，标成 AC_VO 等于没标。④：`efIndex(ac)` 在 `!edca` 时把任何 `ac` 折到 0 |
| `aifs` | 变 | 变 | 变 | **逐字节相同** | **一处空转**，而且是结构性的：`mac.ts:428` 在 `!edca` 时走 DIFS，被篡改的 `aifsn` 一个字读不到 |
| `cw` | 变 | 变 | 变 | 变 | **四个场景全部有效**。它改的是 `BACKOFF_DRAW`，而退避在每一种接入方式下都要抽 |
| `noDouble` | **逐字节相同** | **逐字节相同** | 变 | 变 | **两处空转，而且是结构性的**：那两个场景里 `COLLISION` + `ACK_TIMEOUT` + `RETRY` 合计为 0，窗口本来就不会翻倍，于是「不翻倍」等于不做任何事。在 2 000 / 10 000 / 30 000 ms × 种子 7 / 23 共十二个对照上全部相同（§10.3 第 2 点） |
| `txopHog` | **见 §7.2（只改一个字段）** | 变 | 变 | **逐字节相同** | **一处逐字节空转（④：`!edca` 时没有 TXOP）加一处「印一个数、什么都不跟着变」（①）** |
| `navInflate` | 变 | 变 | 变 | 变 | **四个场景全部有效**，而机理随几何而变（§3.3：隐藏节点下它通过 AP 的 CTS 生效） |
| `greedy` | 变 | 变 | 变 | 变（**而它的哈希与 `cw` 完全相同**） | **有效，但在 ④ 上它的五个字段里四个空转**：`allAsAc` / `aifsn` / `txopLimitUs` 全被闸门挡掉，剩下的只有 `cwMin/cwMax` |

**④ 那一格的最后一条是本节最硬的一个数：在一个合法的传统 DCF 场景里，
`greedy`（五个字段）与 `cw`（一个字段）的记录流哈希完全相同。**
一个读者在编辑器里把一台 802.11g 站点设成「贪婪」，拿到的是「窗口坍缩」，一模一样。

### 7.2 `txopHog` 在开黑场景上：记录数相同，87 条记录差了，差的只有一个字段

**量具**：场景 ①（一台 `gaming` 手机 + AP + 游戏服务器，2 000 ms），
逐记录比较并统计「差了哪些类型、哪些字段」。

```
记录数：     5 630  →  5 630
差异记录：   {"TXOP_START": 87}
差异字段：   TXOP_START.untilNs
```

**87 条 `TXOP_START` 把 2 528 000 ns 改写成 8 000 000 ns，而其余 5 543 条记录逐字节相同。**
在 §3.1 那个三人开黑 + 一台上传的场景上同样成立：
`COLLISION` 125 比 125、作弊者的应用往返 35.59 比 35.59 ms、排队 2.74 比 2.74 ms、
最大 13.21 比 13.21 ms、守规者 35.12 比 35.12 ms、笔记本 `txOk` 31 760 比 31 760。
**一个数字都没动。**

**这是「允许但空转」最干净的形状：一个数被印出来，而什么都不跟着它变。**
原因在物理里而不在代码里：游戏上行包 89–131 B、平均每 30 ms 一个，
队列里永远没有第二帧，于是一个 8 ms 的 TXOP 宣告之后立刻被 `onTxopEnd` 收掉。
**而 `docs/reports/edca-tamper-report.zh.html` 第 1 节已经独立发现过同一件事
（「轨迹完全相同，三个种子逐一相同」）——两个来源、两套场景、同一个结论。**

**这一格是那门课的一个 variant，不是一个被藏起来的缺陷。**
课文要说的是：**一条「霸占信道」的作弊，在一台只打游戏的手机上没有信道可霸占。**

### 7.3 `gameAccel`：一个「加速」开关最可能是装饰——而它不是，除了两种场合

brief 要求特别查这一条。查完了，**它不是装饰**（§3.4：`ENQUEUE.ac` 1 → 2，
三人开黑下 `RX_OK` 33 744 → 35 378、`COLLISION` 125 → 96、应用往返 41.6 → 34.4 ms，
`INTERNAL_COLLISION` 整类消失）。**两种场合它逐字节空转：**

| 组合 | 结果 | 为什么 |
| --- | --- | --- |
| `gameAccel: true` **而场景里没有任何 `gaming` 档节点** | **逐字节相同**（两台 `browsing` + 饱和 + 视频，2 000 ms，246 243 条两边一致） | `TrafficSource.ac` 只在 `profile === 'gaming'` 时读它 |
| `gameAccel: true` **贴在一台站点上而不是 AP 上** | **逐字节相同**（三人开黑 + 饱和，72 012 条两边一致） | `simulation.ts:379` 读的是 `ap.gameAccel === true` |

**两种都是 schema 收得下、编辑器收不下的配置**：`FloorPlanEditor.tsx:794` 只对
`kind === 'ap'` 渲染那个勾。**所以 UI 把这两扇门关了，schema 没关。**

### 7.4 服务器那一侧的空转

| 组合 | 结果 | 为什么 |
| --- | --- | --- |
| `servers` 里只有一台 `call` 服务器，而场景里没有 `voice` 流 | **与 `servers: []` 逐字节相同** | `serverFor()` 按 `serverKindFor(profile)` 找，找不到就是 `null` |
| `servers` 里一台 `rttMs: 0, jitterMs: 0, processMs: 0` 的服务器 | **与 `servers: []` 不同** | 零时延也仍然发 `WAN_TX` / `WAN_RX`，而且 `gaming` 的下行路径从「本地 tick」换成「服务器路径」，形状本来就不一样 |
| `tamper` 贴在 AP 上 | **逐字节相同** | `simulation.ts:290` 显式丢掉 |

**「零时延的服务器不等于没有服务器」这一条要写进课文**：
它是读者最可能做的那个实验（「我把 RTT 调成 0 看看」），
而他拿到的不是基线——他拿到的是「一台在隔壁房间的服务器」。

### 7.5 本刀要加的 schema 拒绝，和刻意不加的

**建议加（`superRefine`，中文消息，照既有几条的写法）：**

| 组合 | 为什么拒 |
| --- | --- |
| `gameAccel` 出现在 `kind !== 'ap'` 的节点上 | 逐字节空转（§7.3），而 UI 本来就不给点。拒了比静默忽略好 |
| `tamper` 出现在 `kind !== 'sta'` 的节点上 | 同上，而且 `simulation.ts:290` 今天就是静默丢掉 |
| `tamper` 出现在 `caps.features.edca !== true` 的站点上，且该预设只含 `aifsn` / `allAsAc` / `txopLimitUs` | ④ 那一格：这三项在传统 DCF 上逐字读不到。**注意不能一刀拒掉所有 `tamper` + `!edca`：`cw`、`noDouble`、`navInflate` 在 DCF 上是有效的，拒掉它们会删掉真东西** |

**刻意不加的：**

- **`gameAccel: true` 而场景里没有 `gaming` 流。** 这在编辑器里是一个合理的中间状态
  （先勾路由器的设置，再给手机加流）。**拒了会让编辑器不好用，所以它只能靠测试钉住（§8）。**
- **`noDouble` 在一个不会碰撞的场景上。** schema 看不出一个场景会不会碰撞。
  **这一条只能靠测试，而且要把它断言成它现在的样子：逐字节相同。**
- **`txopHog` 在一个队列永远只有一帧的场景上。** 同上，而且它是那门课的一个 variant。

---

## 8. 验收

**每一条都要能跑、要有量具、要在失败时告诉人该改什么。**

### 8.1 空转的那几格，断言它们现在的样子（新建 `tests/engine/tamper-inert.test.ts`）

照 `tests/engine/selectivity-inert.test.ts` 的形状。**每一条都断言「相同」或「只差这一个字段」，
而不是断言「有效果」——一个被高估或被低估的量要被断言成它现在的样子。**

1. `escalate` 在一台只跑 `voice` 的作弊者上：**整条记录流的哈希相等**。
2. `escalate` / `aifs` / `txopHog` 在 `edca: false` 的站点上：**三个哈希各自与基线相等**。
3. `greedy` 与 `cw` 在 `edca: false` 的同一场景上：**两个哈希相等**。
4. `noDouble` 在一台安静的 `gaming` 站点与一台安静的 `voice` 站点上：
   **哈希相等，且同一轮里 `COLLISION` + `ACK_TIMEOUT` + `RETRY` 合计为 0。**
   两条一起断言：后者是前者成立的原因（§10.3 第 2 点）。
   已在 2 000 / 10 000 / 30 000 ms × 种子 7 / 23 共十二个对照上验过，全部相同。
5. `txopHog` 在同一台安静的 `gaming` 站点上：**记录数相等，差异记录的 `type` 集合
   恰好 `{'TXOP_START'}`，差异字段集合恰好 `{'TXOP_START.untilNs'}`，差异条数 > 0。**
   （「差异条数 > 0」不能漏：少了它，这条断言在「什么都没变」时也会绿。）
6. `gameAccel: true` 而场景里没有 `gaming` 流：**哈希相等**。
7. `gameAccel: true` 贴在站点上：**哈希相等**。
8. `tamper` 贴在 AP 上：**哈希相等**。
9. `servers` 只含一台 `call` 服务器而无 `voice` 流：**与 `servers: []` 哈希相等**。
10. **反向的那一条，必须有**：`servers` 含一台 `rttMs: 0` 的游戏服务器：
    **与 `servers: []` 哈希不等**，且该轮 `WAN_TX` 条数 > 0。

### 8.2 两门课各自的断言（新建 `tests/course/wan-rtt.test.ts`、`tests/course/edca-tamper.test.ts`）

每个文件以 `lessonShapeSuite(lesson)`（`tests/course/kit.ts`）开头，然后：

**`wan-rtt`：**

1. `stats.appRtt.n` 在主场景上 ≥ 15，**在「无服务器」那个 variant 上恰好 `0`**。
   后者是这一课第二个论点的全部依据。
2. 主场景安静那一格：`appRtt` 均值落在课文印的区间内，`txLatency` 均值 < 0.2 ms，
   **且 `appRtt 均值 / txLatency 均值 > 100`**——那个「千分之四」要被断言成一个比，不是两个数。
3. 加上两台饱和上传之后：`txLatency` 均值 **严格大于** 安静那一格的 20 倍，
   `appRtt` 均值严格大于安静那一格。
4. 游戏模式那个 variant：`ENQUEUE` 里游戏流的 `ac` **全部是 2**，不加速时**全部是 1**；
   且 `txLatency` 均值严格小于不加速那一格。
5. 海外服务器那个 variant：`appRtt` 均值严格大于主场景，
   **且两者之差落在 `(80 − 25) ± 5` ms 内**——这一条把 `rttMs` 从一个配置值变成一个可验算的数。

**`edca-tamper`：**

6. **四级阶梯，逐级断言，而封顶那三种只断言成一组。**
   份额 = `stats.txOk` ÷ 三台之和，取自各 variant 自己的一轮：

   ```
   基线 < noDouble < aifs < txopHog < escalate            （四个严格不等号）
   escalate < min(navInflate, cw, greedy)                  （一个严格不等号）
   navInflate、cw、greedy 三者各自 ≥ 98 %                  （一组，不排序）
   ```

   **绝对不许断言 `navInflate < cw < greedy`**：那三个的相互次序随种子翻转（§3.2），
   断言它就是把一个巧合钉成规律。
   **这一条是这一课全部结论的依据；前四个不等号要是有一个不成立，这一课不许发。**
6a. **而这一课的断言必须跑不止一个种子。** 把 §8.2 第 6 条写成一个对
   `[7, 11, 23, 37, 42]` 的循环（场景构造器接一个 `seed`，variants 只用 7）。
   课程场景本身仍是单种子（`lessonMinutes` 与 fixture 都要求确定性），
   **但测试不受这个限制，而那四个不等号是一条跨种子的结论，就得跨种子地验。**
7. 基线那一轮，三台份额两两之差 < 10 个百分点（「本来是公平的」要被钉住，
   否则后面那条阶梯可能是几何造成的）。
8. `greedy` 那一轮：两台守规站点的 `stats.txOk` **都是 0**。
9. `navInflate` 那一轮（在隐藏节点那个 variant 上）：
   `NAV_SET` 中 `source === 'cts:ap'` 的最长 NAV **减去基线同一量 = 3 000 000 ns 整**。
   **这一条同时钉住那个 `model` 常数与它的传播路径。**
10. `noDouble` 那一轮：`COLLISION` 条数**严格大于**基线。
    （§3.2 那句「它买到的 10 个百分点是用全场多出的碰撞换的」只能靠这一条。）
11. 「开黑 + `txopHog`」那个 variant：
    **它与「开黑、不作弊」那个 variant 的 `COLLISION` 条数、三台的 `txOk`、
    `appRtt` 均值全部逐值相等**，而 `TXOP_START.untilNs` 的集合不同。

### 8.3 既有课的回归

12. `npx vitest run tests/course tests/engine tests/model` 全绿。
13. **`git diff tests/fixtures/lesson-hashes.json` 只有新增行**（§4）。
14. `tests/course/quoted-timestamps.test.ts` 不改一个字且全绿——
    这是「既有场景一个字节没动」的那条独立证据。
15. `tests/course/limits.test.ts` 的「every `until` points at a real lesson」全绿：
    §6 加的四个 `until: 'wan-rtt'` 与一个 `until: 'edca-tamper'` 都要有落点。
16. `tests/course/wording.test.ts` 与 `tests/course/readability.test.ts` 全绿。
    **两条文案测试没有豁免名单，`MIGRATING` 今天是空的，所以新课一落地就被整条合同评判。**

### 8.4 文案的几个雷，提前点名

`tests/course/wording.test.ts` 的禁词表里，**一门讲作弊的课会一头撞上至少十个**：
`输家`、`赢家`、`偷`、`占便宜`、`无辜`、`怪罪`、`嫌疑人`、`老老实实`、`可乘之机`、
`惩罚`（只放过 `backoff` 那个考题干扰项的原句）、`命中`（只放过 `查表命中`）、
`撑不住`、`大声`、`发言权`。
**而一门讲云端时延的课会撞上买卖语域那一整排**：`账`、`账单`、`买单`、`省钱`、`更贵`、`值钱`。

另外两条：

- **「首次出现规则是位置性的」**：`src/course/readability.ts` 的 `ZH_TERMS` 里
  **`接入类别`（access category, AC）** 与 **`参数集`（parameter set）** 都在册，
  所以这两个词在各自课文里第一次出现的那一处必须带括号英文名。
- **`往返` 与 `抖动` 不在 `ZH_TERMS` 里，而且不要把它们加进去**：
  课程里 `往返` 已有 58 处、`抖动` 21 处，加进 `ZH_TERMS` 会要求回填这 79 处，
  那是另一刀，而且不是这一刀欠的。

---

## 9. 明确不做

### 9.1 范围决定（「一刀的量，和之后那一刀」）

- **作弊的检测。** 报告第 3 节那一栏（AP 单独足够 / 需合规终端协助 / 足够但要统计样本）
  是一门独立的课，而它需要的东西引擎没有：**引擎不发任何管理帧**
  （`capstone.ts:181` 已经把这一条写成 `unmodelled`：没有信标、没有探测、没有关联），
  于是「AP 广播一套 EDCA 参数、站点应当遵守」这件事在引擎里从头到尾不存在——
  **作弊者偏离的是一套从未被广播过的参数。** 这一句必须进 `edca-tamper` 的 `limits`，
  而「怎么抓」要等管理帧那一刀。
- **MU EDCA（§9.4.2.250 元素、§26.2.7 的操作）。** 它是「AP 在 TB PPDU 之后临时给站点
  换一套更严的参数」，而引擎没有 MU EDCA 计时器。它看起来是这一刀的续集，
  **而它跟 `tamper` 共用的只有条号。**
- **准入控制与 ACM 位。** `edca.ts:127` 已经把它写成 `unmodelled`。
  一个没被准入的语音流被打回 AC_BE，正好是 `escalate` 的反向——但那是准入那一刀。
- **TCP 的拥塞窗口与语音的抖动缓冲。** `out-of-scope`，理由在 §2.3 最后一行：
  **它们的取值在 RFC 里，不在 IEEE 语料里**，而这个仓库的规矩是条号可以抄、正文不许抄，
  所以一个没有条号可引的机理只能标 `out-of-scope`，不能标 `model` 然后编一个数。
- **AP 的下行队列也被游戏模式改写。** 量过了：`gameAccel` 对上下行同时生效
  （`emitDl` 与 `emitUl` 都带 `ac: this.ac`），所以不需要单独做。
  写在这里是因为 `tests/engine/tamper.test.ts` 里有一句注释
  「gaming is AC_BE at the AP (game acceleration off)」容易被读成「只管上行」。
- **`acForProfile` 那个死分支的删除。** §1.3 查出 `case 'gaming': return 2` 到不了。
  **这一刀不删它**，因为删掉它要动引擎，而这一刀的全部价值在于引擎零改动。
  **但 `edca.ts:125` 那句关于 `acForProfile` 的课文要改（§6.5）**——
  一句错的课文比一支到不了的代码更要紧。

### 9.2 举证不足（「正文没说」）

**只有两条，而且都不拦这一刀：**

- **`txopHog` 的 8 ms 与 `navInflate` 的 3 ms。** 标准给了 TXOP limit 的默认值
  （Table 9-194）与 Duration 的设定规则（§9.2.5.2），**但没有给「一个作弊者会越界多少」**——
  那不是标准会写的东西。所以这两个数标 `model`，而课文必须说它们是这个仓库挑的、
  挑的理由是「明显越界」（8 ms ≈ AC_VI 上限的两倍），**不是某个实测的违规设备。**
- **四台默认服务器的 RTT。** §2.3 已经记下它们的来历（2026-09-08 的设计决定，
  后来被一次王者荣耀实测从侧面证实落在合理区间）。
  **这一条与上一条要分开记：上一条是「标准不会给这个数」，这一条是「有一次实测、但只校准了一台」。**
  混成一句是本仓库在别的规格里犯过的错。

---

## 10. 判断，以及对 brief 的更正

### 10.1 推荐：两课

**`wan-rtt` 先做，`edca-tamper` 后做。** 两个理由：

1. **`wan-rtt` 有一个不得不做的理由，而 `edca-tamper` 没有。**
   §6.1–§6.4 那四句 `limits` 今天就是假的——它们说「引擎之上什么都没有」，
   而引擎之上有一层。**一句已发布的假话比一个没教的功能更急。**
   而且那四句只有在 `wan-rtt` 存在之后才有 `until` 可以指。
2. **`edca-tamper` 是三件里最大的一件，而且它的上限紧。**
   30 分钟顶格、正文不许超过约 4 070 字、七个 variant 要各自有断言、
   还要逐种给出空转结论。它应当在一个干净的分支上单独做。

**`gaming` 档不单独成课**，它作为 `wan-rtt` 的主场景与一个 variant 出现。
**这不是把它降级**：§3.1 那张表的第四、五行——41.613 → 34.395 ms——
是整个 Wi-Fi 课程里第一个**应用层**的数，而它只有在 `gaming` 档上量得出来。

### 10.2 brief 里查出的错，逐条

**（一）「50 个 Wi-Fi/AMP 课程场景（含全部 variants）」——错。**
50 是 Wi-Fi + AMP 的**课数**（wifi 46 + amp 4）。**场景数含 variants 是 118**，
全课程 226，`lesson-hashes.json` 233 条（226 + 7 个家庭）。
三个「0 命中」成立，而且是在 226 个场景上成立。

**（二）「已经有一份中文报告（`.superpowers/sdd/edca-tamper-report.md` 一带）」——路径不存在。**
`.superpowers/sdd/` 下没有任何 tamper 条目。报告在
**`docs/reports/edca-tamper-report.zh.html`**（81 574 B，六节）
加 **`docs/reports/edca-tamper-data.json`**（32 个 pooled 轮次），
生成脚本是 `scripts/tamper-report.ts`（`--dump`）与 `scripts/tamper-report-html.ts`。
**而 brief 猜对的那一半：这份报告确实把这一课的骨架写好了**，
它第 3 节的七种作弊总表加检测责任分工，就是那门课的 `numbers` 与 `deeper`。
（我一度怀疑那条生成链已经漂移——committed JSON 的字段与 `NodeResult` 对不上——
**查下去发现是我看错了类型**：渲染器读的是 `PooledNode`，它有 `game` / `otherApps` /
`gameBySeed`，与 JSON 一致，`npx tsc --noEmit` 也是干净的。**那条链是完好的，
这一条我自己报错过一次，在这里更正。**）

**（三）「五门课的 `limits` 写着『引擎之上什么都没有，没有 TCP 的重传与拥塞窗口，
也没有语音的抖动缓冲』——那五句话是假的」——三处错。**

- **不是五处，「引擎之上什么都没有」只出现在两处**：
  `tier1/retries-queues.ts:134` 与 `tier2/edca-cost.ts:73`。
- **brief 引的那个完整句子只出现在一处**（`retries-queues.ts:134`）；
  `edca-cost.ts:73` 有那个绝对句，但接的是编解码补偿，不是 TCP。
- **「那五句话是假的」是错的，而且错在方向上**：
  **TCP 的重传与拥塞窗口、语音的抖动缓冲，引擎到今天一个都没有——那两个分句是真的。**
  假的只是绝对句本身。**诚实的清单是四条 `limits`
  （`retries-queues:134`、`edca-cost:73`、`queues:115`、`rate-cost:79`）加一条注释
  （`wifiScenes.ts:63`），而改法是把绝对句收窄到这一课的场景，不是删掉 TCP 那一句。**

**（四）「EDCA 参数的取值查得到（§9.4.2.27 EDCA Parameter Set element、§9.4.2.250 MU EDCA、
§26.4.3）」——前两个对，第三个错。**
**§26.4.3 是 Negotiation of block ack bitmap lengths**，和 EDCA 没有关系。
MU EDCA 的**操作**在 **§26.2.7「EDCA operation using MU EDCA parameters」**（p3986），
元素在 §9.4.2.250（p1464）。§9.4.2.27 对（p1067），而且 **Table 9-194 就印在它里面（p1069）**。

**（五）「`tamper` 在整个 `src/course/` 零命中，50 个场景 0 命中」——成立，而且更强。**
`grep -rn tamper src/course/` 零行；226 个场景 0 命中；**七个编辑器家庭预设也 0 命中**，
这一条 brief 没说。`gameAccel` 同样在家庭里 0 命中。
而 `gaming` 与 `servers` 在七个家庭里全部在用——**所以这三件不是「仓库里没人用」，
是「课程里没人用」，而 `tamper` 与 `gameAccel` 是「只有编辑器交互与两个脚本在用」。**

**（六）「七种作弊全部建成、编辑器里可点」——成立，补一个条件。**
`FloorPlanEditor.tsx:801` 的作弊下拉框只对 `kind === 'sta'` 渲染，
`:794` 的游戏模式勾只对 `kind === 'ap'` 渲染。
**所以 §7.3 与 §7.4 里那两个「贴错了节点」的空转组合，只能从 JSON 导入进来，UI 走不到。**

**（七）「`gaming` 是九个流量档里唯一一个没有任何课用过的」——逐字成立**
（0 对 55/43/17/6/5/2/2/1）。

**（八）「`src/course/wifiScenes.ts:65` 一句 `servers: []` 把它对整个 Wi-Fi 课程关掉」——
成立，而且比 brief 说的更广。** `sc()` 是全课程唯一的场景构造器，
`lessonKit.ts` 把它再导出，UWB 与 AMP 的辅助函数也建在它上面。
**那一行关掉的是三条赛道的 226 个场景，不只是 Wi-Fi 课程。**

**（九）brief 没要求、但顺这一刀查出来的两处引用错**（§2.4）：
`src/course/tier2/edca.ts:131` 的 §9.4.2.28 应为 §9.4.2.27；
`src/engine/traffic.ts:73` 的 §10.2.4.2 应为 §10.2.3.2 / Table 10-1。

### 10.3 这一刀最该被怀疑的地方——而它已经骗了我一次

**这一节原来写的是一条警告：§3.2 那张阶梯表只在种子 7 上验过，
而「七个数严格递增」可能是那个种子的巧合，实现时要先重跑三到五个种子。
然后我照自己写的话去重跑了，而它确实是巧合。**

五个种子（7、11、23、37、42）跑下来：

- **前四级在每一个种子上都严格递增**，同种子间距不小于 8 个百分点。这一半站住了。
- **而后三种（`navInflate`、`cw`、`greedy`）全部落在 98.6–100.0 %，相互次序随种子翻转**：
  种子 7 与 11 是 `navInflate < cw < greedy`，种子 23 是 `cw 99.9 < navInflate 100.0`，
  种子 37 与 42 则 `cw` 与 `greedy` 并列 100.0。

**所以「七种作弊严格单调」是假的，真的是「四级加一个封顶组」。**
§3.2、§5.3 的一句话结论、§8.2 第 6 条都已按这个结果改过；
**`src/model/scenario.ts:103` 那句「from the subtle to the brazen」量出来只对前五种成立。**

**这件事值得记在这里，因为它正是本会话反复出现的那个形状**：一个漂亮的、
恰好支持结论的排序，来自一次运行。`capstone.ts:184` 早就把这条规矩写成了 `limits`
（「引擎是确定性的，同一个场景每次给出同一串数，所以表里没有任何误差范围」），
而 `docs/reports/edca-tamper-report.zh.html` 第 6 节为同一个问题定了门限
（三个种子、1.0 ms 或基线的 2 %）。**一门课跑不起多个种子——但一个测试跑得起，
而规格里印的每一个比较都必须跑过。**

**仍然悬着的两处，实现时要先量：**

1. **§3.1 那张应用往返表同样是单种子的。** 28.688 / 41.613 / 34.395 ms 这三个数
   之间的**方向**由机理保证（WAN 常数 + 排队），所以我不担心它翻转；
   但课文印的是数本身，所以 §8.2 第 2–5 条那几个断言要写成区间或比值，
   不是等于某个三位小数。
2. **§7.1 那张空转矩阵原本只在 2 000 ms 上验过，`noDouble` 那两格看起来最像
   「跑得更久就会变」——我把它重量了，而它是结构性的，不是短轮的巧合。**
   量具：同样两个场景（一台 `gaming` / 一台 `voice` 独占空口），
   种子 7 与 23，跑 **2 000 / 10 000 / 30 000 ms**，十二个对照**全部逐字节相同**；
   而每一轮里 `COLLISION` + `ACK_TIMEOUT` + `RETRY` 的条数合计是 **0**。
   **一台独占空口、链路电平不随时间变化的站点既不碰撞也不丢确认，
   于是窗口在任何时长上都不会翻倍，「不翻倍」在任何时长上都等于不做任何事。**
   `escalate` 在 `voice` 作弊者上同样在 2 000 与 30 000 ms 上都逐字节相同。
   **这两格因此可以放心断言；而测试里仍要把那个「0 次碰撞」一起断言出来**——
   它是这条空转成立的**原因**，少了它，哪天场景里多一台设备、这条断言变红时，
   没人知道该改场景还是改结论。
