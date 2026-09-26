# 把 4ab 草案里五样没建模的东西补上

2026-09-26。2026-09-26 的标准核对
([standard-basis](2026-09-26-uwb-standard-basis.md) §2.6)列出五样草案有、
仿真器没有的东西。本规格把它们建模。

## 1. 它们不是五个开关,是一条链

| # | 功能 | 依赖 |
| --- | --- | --- |
| A | UWB 驱动配置(UWBD-MMS, Config 1) | 无 |
| B | RSF 带 SFD(`phyUwbMmsRsfSfd`) | A——只有 UWB 驱动才有包首 SYNC+SFD 可丢 |
| C | 非交织子轮(§10.39.7) | 无(但与 A 正交) |
| D | 固定回复时间(`macMmsFixedReplyTime`) | C——草案自述其前提是 MMS 包末尾的精确到达时间估计,"这在非交织模式才可能" |
| E | 反序(Reversed MMS order) | C |

因此实现顺序是 A → B,C → D、E。

## 2. 草案给的确切定义

全部取自 TG4ab 2025–2026 年的意见决议文件,它们逐页逐行引用草案正文。
仓库不抄草案原文,只取字段名、数值与规则。

### A. 两种配置(15-25/0194r0)

- **Config 2, NBA-MMS**:控制与报告走 250 kb/s O-QPSK 窄带电台。今天建的就是这个。
- **Config 1, UWBD-MMS**:控制走 HRP UWB PHY 自己。包的形状是
  `SP0 (BASIC_PACKET)` → `SYNC+SFD` → `RSF/RIF …`。
- `macMmsRcpPollNSlots` 与 `macMmsRcpRespNSlots` 同时为 0 时,**控制阶段长度为零**;
  取 1–15 时 **SP0 在用**。
- SOR Management PHY Configuration 字段:取值 1–8 指 Config 2,14–15 指 Config 1。
- 链路预算:用 SP0 时,是那帧更长、峰值功率更低的包的 SYNC/SFD 决定链路预算;
  不用 SP0 时,是更短、峰值功率更高的 SYNC+SFD 片段决定。提案给的对比(典型 91 长码):
  短包 SP0 比 SYNC+SFD 长 4 倍 / 脉冲多 4.3 倍 → **6.3 dB**;长包 3.3 / 3.4 倍 →
  **5.3 dB**;同为 PSR 64 时 2.3 / 2.4 倍 → **3.8 dB**。结论一句:
  "SP0 will significantly (~4 dB) limit the UWBD-MMS SYNC performance"。
- 包首 SYNC+SFD 片段的长度**由 RSF 片段长度决定**(15-26/0167r0 讲的也是这件事:
  RSF Fragment Length 用来选 SYNC PSR)。

### B. RSF 带 SFD(15-25/0066r1)

- 字段在 *Ranging PHY Configuration*(Figure 52)里,PIB 属性 `phyUwbMmsRsfSfd`。
- 默认 0 = 每个 RSF 之后没有 SFD;1 = 每个 RSF 之后都有。
- **仅当** Sequence Code Index 取 9–32 且 RSF 片段长度为 32 或 64 时可取 1。
- 取 1 时,`RSF+SFD` 片段与同一个包里在它之前的 `SYNC+SFD` 片段**完全相同**。
- 它要解决的问题,提案原话:包首那个片段若没收到(比如被干扰),
  "there is no successful signal acquisition, and the whole ranging round fails"。

### C. 非交织子轮(§10.39.7;15-25/0292r1、15-25/0331r1)

- 每个非交织子轮 = 控制阶段(时长为 `macMmsRcpPollNSlots` 或 `macMmsRcpRespNSlots`)
  + 测距阶段(`macMmsRpDuration`)。
- 发起方**不等**应答方的 compact 帧就发 MMS 包。应答方收到之后才开始自己的子轮。
- 子轮 1 长度 = `macMmsRcpPollNSlots + macMmsRpDuration`。
- 代价,由一条(后被撤回的)意见说出来:测距时间更长、受信道相干时间限制。

### D. 固定回复时间(15-25/0224r2、15-25/0556r2、15-25/0681r1)

- 同一个一字节字段 *MMS Number of Fragments Configuration*(Figure 65/72):
  bits 0–2 Number of RSF、3–5 Number of RIF、**bit 6 MMS Fixed Reply Time**、
  **bit 7 Reversed MMS order**。
- `macMmsFixedReplyTimeEnable`:Boolean,默认 **FALSE**。
- `macMmsFixedReplyTime`:Integer,范围 **300–612000 RSTU**,默认 **600 RSTU**。
- 语义:应答方自**收到第一个片段**(MmsRangingRxOnTime)起偏移该值发送自己的 MMS 包,
  而不是从进入测距阶段起算。
- 好处:回复时间不必再塞进报告 compact 帧,省能量。代价:测距精度取决于回复时间
  本身有多准。

### E. 反序(15-25/0556r2)

- 为 TRUE 时,测距阶段里**应答方先发** MMS 包,发起方自进入测距阶段起偏移
  **600 RSTU** 再发自己的。

## 3. 数据模型

`MmsPhy` 增五个字段,**每一个的默认值都复现今天的行为**,因此
`tests/fixtures/lesson-hashes.json` 与 `tests/fixtures/uwb-record-hashes.json`
逐字节不变,新功能只新增条目。

```ts
export interface MmsPhy {
  // …既有六个字段不变…
  /** Config 2 (narrowband-assisted) or Config 1 (UWB-driven). 4ab draft 15-25/0194r0 */
  control: 'nba' | 'uwbd'          // 默认 'nba'
  /** §10.39.7: each side's whole train goes contiguously. */
  nonInterleaved: boolean          // 默认 false
  /** macMmsFixedReplyTime in RSTU, null when the responder replies at the phase start. */
  fixedReplyRstu: number | null    // 默认 null;取值时限 300–612000
  /** The responder transmits first; the initiator follows 600 RSTU into the phase. */
  reversedOrder: boolean           // 默认 false
  /** phyUwbMmsRsfSfd: an SFD after every RSF, so any RSF can open the packet. */
  rsfSfd: boolean                  // 默认 false
}
```

场景 schema(`src/model/scenario.ts`)同步加字段并加**跨字段校验**,
每一条都直接对应草案的限制:

1. `rsfSfd` 为真时必须 `control === 'uwbd'`,且 `nMsr` ∈ {32, 64}。
2. `fixedReplyRstu` 非空时必须 `nonInterleaved === true`,且取值落在 300–612000。
3. `reversedOrder` 为真时必须 `nonInterleaved === true`。
4. `control === 'uwbd'` 时不使用窄带信道列表与先听后发——两者在该配置下无意义。

校验拒绝的组合一律配一条说明为什么的消息,和现有 `nbChannels` 的处理一致。

## 4. 时隙布局:`mmsLayout` 长出第二种形态

今天的交织形态一字不改,是 `nonInterleaved === false` 的分支。

**非交织形态**(`nonInterleaved === true`),按 §10.39.7:

```
子轮 1: [控制 macMmsRcpPollNSlots] [测距阶段 rpSlots —— 发起方整列片段]
子轮 2: [控制 macMmsRcpRespNSlots] [测距阶段 rpSlots —— 应答方整列片段]
[报告阶段 —— 与今天相同]
```

- 每个子轮的控制阶段是一个窄带窗口,即既有的 `NB_WINDOW_SLOTS = 2`
  (草案的 RcpPollSlot 与 RcpResponseSlot 都是 2),所以子轮 = `2 + rpSlots`。
- 测距阶段的时隙数不再乘 `(responders + 1)`:一个子轮里只有一方在发,
  所以 `rpSlots` 回到 `max(MMS_RP_MIN_SLOTS, X 或 rifStartMs(...) + 1)`。
- **一对多 + 非交织**:每个应答方一个子轮,共 `1 + responders` 个子轮。
  这是非交织"测距时间更长"那条代价在本模型里的具体形态,也正好是课程要展示的东西。
- `fixedReplyRstu` 非空时,应答方子轮的起点不是子轮边界,而是
  「它收到发起方第一个片段的时刻 + fixedReplyRstu」。这让起点变成**运行期才知道的量**,
  而不是布局期的常数——所以它不进 `mmsLayout`,而由设备在收到第一个片段时自行排程
  (见 §5.3)。
- `reversedOrder` 为真时,两个子轮交换次序,发起方的子轮起点为
  「进入测距阶段 + 600 RSTU」。

## 5. 新的物理:捕获

这是本切片里唯一**改变结果**的部分,其余都是排程。

### 5.1 今天的模型

NBA-MMS 里,窄带 POLL/RESP 交互给两端"预热"(`device.mms.ts`:
"and only then is either end primed"),此后接收机盲累加整列片段,由
`trainDetected(rxDbm, heard)` 判定:`rxDbm + 10·log10(heard) ≥ −93 dBm`。
不存在"捕获失败"这回事,因为窄带已经把时基交给接收机了。

### 5.2 UWB 驱动下的模型

没有窄带,时基只能来自包内。于是引入**捕获**这一步,排在累加之前:

- 控制阶段非零(`pollNSlots ≥ 1`)时,捕获靠 **SP0** 帧;
  控制阶段为零时,捕获靠包首的 **SYNC+SFD 片段**。
- 捕获按单个片段判定,**不允许累加**——这正是它与测距累加的区别所在:
  一个片段自己必须够得着。
- 门限用引擎既有的 `UWB_RX_SENS_DBM`(−93 dBm):**单个片段自己**的 `rxDbm` 必须
  不低于它。对比一下测距累加用的是 `rxDbm + 10·log10(heard) ≥ −93`,差别正在这里。
- 用 SP0 捕获时门限再差 **4 dB**,即 −89 dBm。提案给的三个对比是 6.3 / 5.3 / 3.8 dB
  (取决于码长与 PSR),其结论句写的是 "SP0 will significantly (~4 dB) limit the
  UWBD-MMS SYNC performance"。三个精确值进课程的表,引擎取 4 dB 并标注 model。
  方向别弄反:SP0 更长、峰值功率更低,所以它**更难**捕获;不用 SP0 时那个更短、
  峰值更高的 SYNC+SFD 片段链路预算更好。
- **捕获失败 ⇒ 整轮失败**:没有时基,后面的片段一个都用不上,该轮不产生测距结果。

### 5.3 RSF 带 SFD 如何救回来

`rsfSfd` 为真时,每个 RSF 尾部带一个 SFD,于是**任何一个 RSF 都能充当 SHR**。
捕获判定从"包首那一个片段"变成"任意一个被听到的片段",整轮不再因为首片段丢失而全废。
代价是每个 RSF 变长(多出 SFD 的码片),因而每轮的空口时间变长、能量预算更紧。

这条因果链——为什么草案要加这个字段——就是 B 这门课要讲的东西,
而且它可以在仿真里直接看出来:同一个场景开关 `rsfSfd`,看首片段被干扰时测距结果的有无。

## 6. 编辑器与指南

- `UwbSessionFields.tsx` 加控件:控制面(两选一)、非交织(勾选)、固定回复时间
  (数字,带范围提示)、反序(勾选)、RSF 带 SFD(勾选)。
  按 §3 的跨字段规则置灰并给出红字说明,和现有 `nbChannels` 一致。
- `EditorGuide.tsx` 每个新控件一条说明。
- `Guide.tsx` 第 12 节补两段:两种配置的差别、非交织与它的代价。
- `glossary.ts` 新增条目:UWBD-MMS、SP0、SYNC+SFD 片段、RSF+SFD、
  非交织子轮、固定回复时间、反序。每条按既有规则带出处标记。
- `CONTRIBUTIONS` 注册新引用的文稿:15-25/0194r0、15-25/0066r1、15-25/0224r2、
  15-25/0292r1、15-25/0331r1、15-25/0556r2。

## 7. 课程

三课,插在 UWB 三阶段「窄带控制面」之后、综合实践之前。按既有课程契约:
一课一主题、一条流程、一个场景,30 分钟上限,图示优先于比喻。

1. **`uwb-uwbd`「不靠那部窄带电台」** — 两种配置的差别;为什么去掉窄带就必须自己捕获;
   SP0 与 SYNC+SFD 的取舍(更长更稳 vs 更短更高功率)。图:两种包结构对照(`fields`)。
2. **`uwb-acquisition`「首片段丢了,整轮就废」** — 捕获与累加是两回事;
   首片段丢失的后果;`rsfSfd` 如何把它救回来,以及它要付的空口时间。
   图:同一列片段两种命运(`timing`)。
3. **`uwb-subrounds`「轮流发,还是穿插发」** — 非交织子轮;它换来什么(固定回复时间
   可用、报告里不必带 Treply)、付出什么(时长翻倍、受相干时间限制)。
   图:交织与非交织的时隙对照(`timing`)。

反序不单独成课:它是非交织的一个选项,放进第 3 课的深度部分。

## 8. 测试与 fixture

- **既有场景逐字节不变**:所有新字段默认值复现今天的行为。改动落地后
  `lesson-hashes.json` 与 `uwb-record-hashes.json` 必须**零 diff**——这是硬门槛,
  先于任何新 fixture 验证。
- 新场景只**新增** fixture 行。
- 测试重心放在逻辑:布局算术(交织 vs 非交织的时隙数)、跨字段校验的每一条拒绝、
  捕获判定的门限行为(恰好够/恰好不够)、`rsfSfd` 对首片段丢失的救回。
- 不为显示文案新增测试;课程的既有契约测试(术语、流程块、图示)自然覆盖新课。

## 9. 明确不做

- **SOR Management PHY Configuration 的字段编码**(1–8 / 14–15)。本引擎不逐位编码
  管理帧,建模的是行为。编码值记在词汇表里,不进代码。
- **信道相干时间**。非交织的这条代价是真的,但本引擎没有时变信道,写进课程正文
  作为"本仿真器看不到的代价",不假装建模。
- **SP0 帧的 PSDU 内容**。只建模它的时长与它对链路预算的影响。
- **Sequence Code Index**。草案允许 `rsfSfd` 的条件有两条:码序号 9–32,**且**
  RSF 片段长度为 32 或 64。本引擎没有码序号这个量(`MmsPhy` 里没有,别处也没有),
  所以校验只能检查后一条。这是一个**已知的不完整**,不是疏忽:词汇表与课程要写明
  草案的完整条件,代码注释要写明只检查了其中一半以及为什么。若哪天引擎引入码序号,
  这条校验要补上。
- **市场分裂**那条意见是政策判断,不进任何地方。另外注意:提出删除 §10.39.7 的那条
  意见(15-25/0331r1 CID #234)**已被提出者撤回**,所以它列的那些缺点不能写成
  「草案承认的缺点」,只能写成「曾有人提出的代价」。
