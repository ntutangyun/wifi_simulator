# 切片 4e：`until` 承诺的是「会被解除」，而字段自己早就带着判据

2026-10-05。基线提交 `7ab9eb6`（UWB 侧 `uwb-blocks` 那一处同病已由另一刀落地）。
这份规格不动引擎、不动场景、不动任何数字——它只动**契约**：一个字段承诺了什么，
以及这件事今天由什么守着（答案：什么也没有）。

**结论三句话：**

1. **`until` 的语义不是机械可判的，但「这一处的 `until` 合不合法」是。**
   `LimitKind` 那四个值里，只有 `out-of-scope` 说的是**场景类**；另外三个
   （`unmodelled` / `model-value` / `threshold`）说的是**引擎**，而引擎在每一课里是同一个。
   **所以没有任何一课能解除一条 `unmodelled` 的限制**——判据不用新字段，它已经在字段上了。
2. **判据跑在今天的课程上，10 处里挑出 5 处**：其中 3 处是真发了落空的承诺，
   另外 2 处承诺是兑现了的、而它们的 `kind` 标错了。**所以这一刀是 5 处，不是 3 处。**
3. **推荐 (c)**：`until` 收窄成只许出现在 `out-of-scope` 上，另加一个**只存课程 id、不存文案**
   的 `seeAlso` 承担「讲得更深」。否掉 (a) 的理由是导航价值是真的，
   否掉 (b) 的理由是**那 5 处精确承诺的全部价值就在「会被解除」这四个字上**。

§1 现状逐处 · §2 判据（三个候选的实测，以及我给的那一条）· §3 三条路与代价 · §4 推荐
· §5 要改的文件与测试逐条 · §6 fixture · §7 允许但空转 · §8 明确不做 · §9 判断
· §10 对 brief 的更正

---

## §1 现状：10 处 `until`，指向 7 课

`Limit.until` 在界面上渲染成**「（这一条在《…》里会被解除）」**（`src/ui/i18n.ts:736`
的 `limitUntil`，经 `src/course/CoursePanel.tsx:576`），字段自己的注释写
*the lesson that lifts this simplification*（`src/course/lessonKit.ts:94-99`）。
**两处说的是同一件强话：那一课会把这个简化去掉。**

我重新 grep 过一遍（基线 `7ab9eb6`，`grep -rn "until: '" src/course/`，10 行），
行号与 brief 给的那张表逐行一致。按 `kind` 分：

| # | 位置 | `kind` | → 目标 | 真的解除了吗 |
| --- | --- | --- | --- | --- |
| 1 | `tier1/anomaly.ts:126` | `model-value` | `rate-vs-model` | **没有** |
| 2 | `tier1/anomaly.ts:127` | `unmodelled` | `rate-vs-model` | **没有** |
| 3 | `tier1/anomaly.ts:130` | `unmodelled` | `txop` | 解除了，**而 `kind` 标错** |
| 4 | `tier1/backoff.ts:103` | `out-of-scope` | `txop` | 解除了 |
| 5 | `tier1/ifs.ts:111` | `out-of-scope` | `edca` | 解除了 |
| 6 | `tier1/mcs-ladder.ts:95` | `unmodelled` | `rate-vs-model` | **一半解除、一半没有** |
| 7 | `tier2/streams.ts:125` | `out-of-scope` | `mumimo` | 解除了 |
| 8 | `tier2/width.ts:158` | `unmodelled` | `selectivity` | 解除了，**而 `kind` 标错**（复合） |
| 9 | `uwb/uwb-blocks.ts:172` | `out-of-scope` | `uwb-contention` | 解除了（`7ab9eb6` 刚拆过） |
| 10 | `uwb/uwb-intro.ts:172` | `out-of-scope` | `uwb-sstwr` | 解除了 |

**按 `kind` 数：`out-of-scope` 5 处、`unmodelled` 4 处、`model-value` 1 处、`threshold` 0 处。**
而「真的解除了」的那 5 处，**恰好就是 `out-of-scope` 那 5 处**。这不是巧合，§2 说为什么。

> **2026-10-05 更正：上面这一句是假的，而它与本规格自己的 §10.2 矛盾。**
> 落地前**真正兑现**的是 **7 处**——`out-of-scope` 那 5 处，**加上 `anomaly:130` 与
> `width:158` 这两处「承诺兑现了而 `kind` 标错」的。
> **所以判据 A 挑出的 5 处不是「落空的那 5 处」，而是「有东西要改的那 5 处」**
> （3 处承诺真落空 + 2 处 `kind` 真标错）。
> **「零误报」只在这个较弱也正确的意义上成立**，而落地的代码注释
> （`tests/course/limits.test.ts` 判据 A 的 docblock）从一开始就写对了。
>
> **记下来是因为这是同一个形状的第五次**：一处更正写在新的小节里，
> 而重述同一个说法的旧小节没有跟着改。**改规格时，拿那个说法去 grep 整份文件。**

### §1.1 两处确凿的落空（逐条读过两边课文）

**#1 `anomaly.ts:126`（`model-value`）→ `rate-vs-model`。**
源课说：「这里的速率控制只有两个计数：连续两次失败降一档，连续十次成功涨回来，
而信号强度查表给出的那一级是它永远不会越过的上限。」
目标课 `rate-vs-model` 自己的 `limits[0]`（也是 `model-value`）**原话重申**：
「降档规则本身是引擎的取值：同一个对端连续两次失败降一档，连续十次成功涨一档，
且永不越过信噪比查表给的上限（rate.ts 的 RateControl）。」
**实地量过**：两段文字的最长公共子串是 **17 个字**——「连续两次失败降一档，连续十次成功涨」。
目标课不但没去掉这个取值，它把这个取值当成自己的一条限制再声明了一次。

**#2 `anomaly.ts:127`（`unmodelled`）→ `rate-vs-model`。**
源课说：「它分不清碰撞与衰落……引擎没有建模的是缓解它的那些办法。」
目标课 `limits[1]`（`unmodelled`）：「**把碰撞当成衰落是本课的主角**，而引擎里
**没有任何机制去区分两者**……CARA 用一个 RTS 先探一探、RRAA 改用短窗口丢失率，
这两类修正本课只是提到，**引擎一个也没有实现**。」
**这一处是整个盘点里最要紧的一条证据**：它是语义上的原话重申，
**而字面上两段只共享 5 个字**（「改用短窗口」）。§2.1 用这个数字否掉「查同义说法」那条判据。

### §1.2 一处复合：`mcs-ladder.ts:95`（brief 把它和上面两处归成一类，这里不同意）

原文一句话里装了两件事：

- **(i) 场景类的那一半**：「本课这张查表只给出上限：引擎在它之下还有一层损失反馈……
  **本课四个变体一次失败也没有，所以这一层看不见。**」
  ——`rate-vs-model` 把这一层**打开了**：那一课碰撞 26.17 %，色块长度在 248 / 704 / 2064 µs
  之间跳，还有一张速率直方图。**源课说「在本课看不见」，目标课让它看得见，这就是解除**，
  形状与 #7（`streams` 说「本课只有一台站点，看不出来」→ `mumimo` 换一个房间）完全一样。
- **(ii) 引擎级的那一半**：「真实速率控制的输入还要更多：最近的成功率、信道忙闲，
  以及主动探测。」——`rate-vs-model` 的 `limits[0]` 明确说这些**一个也没实现**。
  **这一半任何一课都不解除。**

两段文字的最长公共子串是 10 个字（「降一档，连续十次成功」），落在 (ii) 那一边。
**所以这一处的修法不是删 `until`，是拆。** 先例就在本分支上：`7ab9eb6`
把 `uwb-blocks` 那条「三件事挂一个 `until`」拆成「兑现的那半留 `until`、
不兑现的那半不留、并且自己说明一课也不解除」。

### §1.3 两处标错了 `kind` 的真承诺

**#3 `anomaly.ts:130`，标成 `unmodelled`。**
原文：「本场景的站点不打业务标记，没有发送机会（TXOP），也不聚合，所以「一轮」就是一帧。」
`unmodelled` 的定义是 *a physical effect the engine does not model at all*
（`lessonKit.ts:83-84`）——**而引擎建了 TXOP 与聚合**，`txop` 那一课整课都在跑它。
真正的成因是**场景**：`anomaly` 的两台站点是 `nonht`（`GEN_FEATURES.nonht = []`，
`src/model/caps.ts:54`），`txop` 的两台是 `vht`（`edca`/`ampdu`/`txop` 三个标志都协商上）。
**同一个事实，`backoff.ts:103` 用几乎相同的话说了一遍，而它标的是 `out-of-scope`。**
两处对着看，`anomaly:130` 的 `kind` 就是写错了。

**#8 `width.ts:158`，标成 `unmodelled`，而且是复合。**
主干那一段（「带宽在这里只是一个倍数……整条信道的信号质量始终只有一个数」）是**场景类**的：
`selectivityScenario` 就是 `widthScenario` 加上 `fading` 与 `selectivity` 两节
（`src/course/wifiScenes.ts:118-131`），原文自己也写着
「场景打开衰落、再加上 selectivity 一节就补上了这一条（本课四档都没有加）」。
尾巴那一句（「仍然没有的是格间相关……本仿真器取独立」）才是真正 `unmodelled` 的，
而 `selectivity` 自己的 `limits[1]` 把它**又声明了一遍**（「格间相关长度没有取值」）。
**所以 #8 和 #6 是同一个形状**：拆开之后，主干留 `until`、尾巴不留。

### §1.4 今天由什么守着：什么也没有

`tests/course/limits.test.ts` 关于 `until` 只有两条：指向的课**存在**、且**不是自己**。
**「到底解不解除」从来没有测试在看。** 另有两处手写的「本处的尺」——
`tests/course/width.test.ts:454-470` 与 `tests/course/uwb-blocks.test.ts:95-148`——
它们确实在判这件事，但**是按站点手写的**，第 11 处 `until` 不会因此变绿或变红。

而**注释不是机制**：这个会话刚修过一条，`tests/course/ofdma-dl.test.ts` 原来断言
「其余每一处 `until` 都真的解除了那件事」，那是假的，而它绿了很久（`5facc9c`）。

**量一个覆盖率**：8 个 `until` 的源课里，只有 4 个的测试文件提到了自己的目标课
（`ifs`→`edca` 4 次、`width`→`selectivity` 14 次、`uwb-blocks`→`uwb-contention` 4 次、
`uwb-intro`→`uwb-sstwr` 3 次）；`anomaly` / `backoff` / `mcs-ladder` / `streams`
四个测试文件里**一次都没提**。**一半的承诺连一句话的凭据都没有。**

---

## §2 判据：这件事能不能机械判

要判的命题是：**「课文 B 真的解除了课文 A 的限制 L」**。
三个候选，我把能量的都量了。

### §2.1 候选一：目标课的 `limits` 里不出现与源课同义的说法 —— **测了，死了**

「同义」没法判，所以我量了它最可能的机械代理：**最长公共子串**。
写了一个只读脚本，把 `src/course` 下 82 门课的 319 条 limit 形状的条目抽出来
（其中 1 条其实是 `numbers` 里 `kind: 'formula'` 的 Block，形状与 `Limit` 一字不差——
**用正则做盘点的人会多数出一条，用 `LESSONS` 做盘点的人不会**），
对每一处 `until` 算源文本与目标课每一条 limit 文本的最长公共子串，取最大：

```
tier1/anomaly.ts    [model-value ] -> rate-vs-model    LCS= 17  "连续两次失败降一档，连续十次成功涨"
tier1/anomaly.ts    [unmodelled  ] -> rate-vs-model    LCS=  5  "改用短窗口"
tier1/anomaly.ts    [unmodelled  ] -> txop             LCS=  4  "TXOP"
tier1/backoff.ts    [out-of-scope] -> txop             LCS=  4  "TXOP"
tier1/ifs.ts        [out-of-scope] -> edca             LCS=  5  " AIFS"
tier1/mcs-ladder.ts [unmodelled  ] -> rate-vs-model    LCS= 10  "降一档，连续十次成功"
tier2/streams.ts    [out-of-scope] -> mumimo           LCS=  4  "的两条流"
tier2/width.ts      [unmodelled  ] -> selectivity      LCS= 24  "channel.ts 的 resolveLock"
uwb/uwb-blocks.ts   [out-of-scope] -> uwb-contention   LCS=  2  "本课"
uwb/uwb-intro.ts    [out-of-scope] -> uwb-sstwr        LCS=  5  "时间戳噪声"
```

**两头都错：**

- **最严重的那一处得分最低。** `anomaly:127` 是语义上的原话重申，LCS 只有 **5**。
- **最老实的那一处得分最高。** `width` → `selectivity` 是全课最干净的一次解除，LCS **24**——
  而那 24 个字是一个代码标识符（`channel.ts 的 resolveLock`），两课都引它是**正确**的。

任何能抓住 `anomaly:127`（5 字）的门限，都会同时挑错 10 处里的 7 处。
**这条判据不是难调，是方向错了：重申是语义事件，不是字符串事件。**

### §2.2 候选二：目标课必须有一个场景打开了源课说「没有」的那个东西 —— **brief 说它最硬，量完它最软**

**先说它为什么听起来对：**真正解除的那几处，解除方式确实都是「换一个场景」。
**但「换」在哪一个轴上，每一处都不一样。** 逐处核过：

| 承诺 | 打开它的那个轴 | 机械可读吗 |
| --- | --- | --- |
| `anomaly`/`backoff` → `txop` | 节点世代 `nonht` → `vht`（于是 `edca`/`ampdu`/`txop` 协商上） | 是，`caps.features` |
| `ifs` → `edca` | 业务档位 `saturated` → `voice`/`saturated`/`backup`（四条队列） | 半是，`profiles` |
| `streams` → `mumimo` | **站点数 1 → 4**（源课那条限制的主语就是「只有一台站点」） | 结构，不是标志 |
| `width` → `selectivity` | 顶层 `fading` + `selectivity` **两节** | 是，但不在节点上 |
| `uwb-intro` → `uwb-sstwr` | 逐节点 `ppm` 实参 0 → ±10 | 是，但在实参里 |
| `uwb-blocks` → `uwb-contention` | 会话旋钮（竞争窗口与名单） | 是，另一套字段 |

**七个承诺，六个轴，而 `Scenario` 里没有任何字段说「本条限制的旋钮是哪一个」。**

唯一能一行写出来的那个轴（协商上的特性标志之差）我也量了，**它两头都错**：

- **假阳性**：`selectivityScenario` 就是 `widthScenario(w, 1)` 外加两节，
  `feats = { edca: true, qam4k: true }` 两课**完全相同**（`wifiScenes.ts:80, 118`）。
  标志之差为空集 → **把全课最老实的那一处判成假的**。
- **假绿**：`streams` 的 `feats = { edca, qam4k }`，`mumimo` 的是
  `{ edca, ampdu, txop, ofdma, qam4k, mumimo }`（`wifiScenes.ts:274`），差集非空 → 判为真。
  **可差出来的是 `ampdu`/`txop`/`ofdma`，而源课那条限制一个字都没提它们**——
  它说的是「只有一台站点」。**这不是判据，是碰巧。一个靠自己没问的证据变绿的检查，
  比没有检查更坏。**
- **全盲**：两处 UWB 的节点一个特性标志都没有，差集恒为空。

而最朴素的版本——「目标课的场景和源课的不一样」——**在今天 10 处上全绿**
（`anomaly` 跑 `longApartment`，`rate-vs-model` 跑 `bianchiScenario(5, {near:true})`，
两者当然不一样）。**零鉴别力。**

**结论：这条判据要成立，必须让每条限制自己写出旋钮的路径表达式。
那是给 319 条限制引入一套新的 DSL，为了守 7 个承诺。否掉。**

### §2.3 候选三：在字段上写明它承诺的是哪一种 —— **对，而且不用新字段**

brief 的第三条近似是「在字段上写明它承诺的是解除还是深入，让测试按种类分别检查」。
**这是对的那一条，但它的实现不该是一个新的判别字段，因为判别信息已经在 `kind` 上了。**

`LimitKind` 恰好四个（`lessonKit.ts:80-88`），而它们**不是同一层的东西**：

- `threshold`、`unmodelled`、`model-value` 说的是**引擎**：
  「引擎用硬门限代替曲线」「引擎完全不建模这个效应」「这个常数是本仿真器自选的」。
- `out-of-scope` 说的是**场景类**：*a class of scenario the model is not valid for*。

**而每一课跑的是同一个引擎。** 一门课能换的只有场景（`scenario()` 与 `variants`）；
它换不了 `rate.ts` 里有没有探测帧，也换不了 `fading.ts` 有没有格间相关。
**所以：一条 `unmodelled` / `model-value` / `threshold` 的限制，
在这门课程里没有任何一课能解除它。** 一条带着这三种 `kind` 的 `until`，
**不是「可能落空」，是「必然落空」**——要么承诺是假的，要么 `kind` 是假的。两者都该红。

> 为什么不新加一个 `untilKind: 'lift' | 'depth'`：那会让同一个事实有两处来源，
> 而本仓库自己的话是「两个地方印同一个数，就是两个会漂的地方」
> （`tests/course/width.test.ts` 的注释）。`kind` 本来就该决定这件事。

### §2.4 我给的那一条（可以直接写成测试）

**判据 A（总量判据，零语义，10/10 有鉴别力）**

> **`until` 只许出现在 `kind: 'out-of-scope'` 的限制上。**
> 其余三种 `kind` 描述的是引擎，而引擎在每一课里是同一个，所以没有课能解除它们；
> 这类限制要指别的课，用 `seeAlso`。

跑在今天的课程上：**10 处里挑出 5 处**（#1 #2 #3 #6 #8），放过 5 处（#4 #5 #7 #9 #10）。
挑出来的 5 处里，3 处是真落空（#1 #2 和 #6 的后一半），2 处是 `kind` 标错（#3 #8）。
**没有一处是误报：被挑出来的每一处都确实有一个要改的东西**，
只是其中两处要改的是 `kind` 而不是 `until`。

判据 A 的失效模式我也说清楚：**它是必要条件，不是充分条件**。
一条 `out-of-scope` 的限制指向一门其实没打开那个场景类的课，判据 A 放过。
所以还要第二道：

**判据 B（把不可机械判的那一步变成不可跳过的一步）**

> **`until` 的站点清单在 `tests/course/limits.test.ts` 里冻成一张表**，
> 每行写 `[源课 id, 目标课 id, 限制文本里的一个特征子串, 打开它的那个轴]`。
> 测试断言：课程里 `until` 的站点集合**恰好等于**这张表；每行的特征子串确实在那条限制里；
> 那条限制的 `kind` 是 `out-of-scope`；第四列非空。

判据 B 不判真假——**它判「有没有人判过」**。
第 11 处 `until` 一加进来，这张表就红，作者必须把第四列那句话写出来、
并在 `tests/course/<源课>.test.ts` 里留下本处的尺（先例两处：`width.test.ts`、
`uwb-blocks.test.ts`）。这正是 §1.4 那半数无凭据的承诺今天能悄悄存在的原因。
**「不是机械可判」不是放手的理由，是把人判的那一刻钉死的理由。**

---

## §3 三条路，各自的代价

### (a) 把那几处的 `until` 去掉

- **得**：诚实，改动最小，不动 UI、不动类型、不动契约。
- **失**：**丢掉的是真的导航价值。**「这件事在《挪到近处》里讲得更深」对读者有用——
  `rate-vs-model` 整课就是那个两计数控制器把一个纸上预测打成五分之一的现场。
  删掉之后，`anomaly` 的读者没有任何线索知道该去哪儿。
- **还有一笔隐性代价**：它只修症状。`kind` 标错的 #3 #8 不在这条路的射程里，
  而**没有判据，第 11 处照旧**。

### (b) 把 `limitUntil` 的措辞放宽成「在《…》里讲得更深」

- **得**：**一行**。`src/ui/i18n.ts:736` 改一个字符串，没有第二个语种要跟
  （全仓库只有这一处 `limitUntil` 实现），类型不动，课程一个字不动，测试全绿。
- **失**：**这是把 5 个精确承诺降级去迁就 3 个不精确的。**
  `ifs` 那条说的是「34 µs 这个数只对不打业务标记的站点成立……那把梯子是后面一课的题目」——
  读者要知道的正是**那把梯子真的在后面**，不是「后面还会再聊聊等待时间」。
  `uwb-intro` 说「本课把两端的晶振都钉在 0 ppm」，而 `uwb-sstwr` 真的跑 ±10 ppm、
  真的给出 6.01 m 的原始偏差——「讲得更深」把一次兑现说成了一次预告。
- **而且它仍然不是机制**：措辞放宽之后，`until` 就什么也不承诺了，
  于是**没有任何东西可以测**。这是本仓库最熟的那种修法：把断言改成一句谁都反驳不了的话。

### (c) 新加一个字段，让 `until` 保持窄义

- **得**：两种承诺各有一个字段，**于是两种都可测**；`until` 窄到可以用 §2.4 的判据 A 守住；
  导航价值一处不丢。
- **失**：**要动三处**——`Limit` 类型（加 `seeAlso?: string`）、
  `src/ui/i18n.ts`（加一条 `limitSeeAlso` 文案与一条类型声明）、
  `src/course/CoursePanel.tsx`（多一个分支）。再加 5 处课程的字段改动。
- **真正的代价不是行数，是界面上多了一种括号**：读者现在要分辨
  「会被解除」与「讲得更深，但不解除」。这是一笔**值得付**的区分
  （§4 说为什么），但它确实是读者要多学的一件事。

---

## §4 推荐：(c)，而且把判据 A + B 一起落地

**选 (c)。一句话理由：`until` 的全部价值在「会被解除」这四个字上，
而那 5 处兑现了的承诺不该为 3 处落空的买单——后者要的是另一个字段，不是更软的措辞。**

界面上多一种括号这件事，我认为是净收益而不是净成本：
**「这一条讲得更深，但不解除」本身就是读者最该学会的那个区分。**
一个只写「里面会讲到」的课程，教的是去读；一个把「解除」与「深入」分开写的课程，
教的是**仿真器的边界和课程的进度是两件不同的事**。本仓库在 `uwb-blocks`
上刚刚为此付过一次代价（`7ab9eb6` 的注释：读者「跟着那个 `until` 去找两样不存在的东西，
然后以为自己漏看了什么」）。

**新字段只存课程 id，不存文案。** 句子住在 `i18n.ts` 里。
这不只是省事：`tests/course/wording.test.ts:49` 与 `tests/course/readability.test.ts:454,528`
是按字段名**逐个列举**走课程文本的（`...l.limits.map((x) => x.text)`），
**一个新字段的散文会从两张禁词表下面漏过去**。存 id 就没有这个洞。

**否掉 (a)**：它承认了问题却丢掉资产，而且碰不到 `kind` 标错的两处，也不留判据。
**否掉 (b)**：它把 5 个真承诺贬值去掩盖 3 个假承诺，**并且事后什么也测不了**——
一句谁都反驳不了的文案，就是本仓库刚刚修掉的那种注释的 UI 版本。

---

## §5 要改的文件与测试，逐条

### §5.1 类型与契约（1 个文件）

**`src/course/lessonKit.ts`**

- `Limit.until` 的注释改写，把窄义和理由都写进去：**只许出现在 `kind: 'out-of-scope'` 上**；
  其余三种 `kind` 描述的是引擎，而每一课跑同一个引擎，所以无课可解除；
  点名 `tests/course/limits.test.ts` 是守它的地方。
- 新增 `seeAlso?: string`：「那一课把这一条讲得更深，但不解除它。只存 id，
  句子在 `ui/i18n.ts`；任何 `kind` 都可以带，与 `until` 在同一条 limit 上互斥。」

### §5.2 界面文案（2 个文件）

**`src/ui/i18n.ts`**

- `limitUntil` 文案**不动**——这是选 (c) 的全部意义。
- 新增类型行 `limitSeeAlso: (lessonTitle: string) => string`（约第 89 行旁）
  与实现（约第 736 行旁）：**`(t) => \`（《${t}》把这一条讲得更深，但不解除它）\``**。

  **措辞是人工对着课程里已有的说法比过的**（UI 文案不走禁词表，
  `wording.test.ts` / `readability.test.ts` 只 walk 课程对象）：
  「解除」正是课程自己的词——`uwb-blocks` 的成员限制里写着「一课也不解除」，
  `limitKind['out-of-scope']` 的标签是「这个模型答不了：」。
  **不用「相关阅读」「延伸阅读」这类书面语**，课程全篇没有这个语域。
- 折叠屏核查：这个括号接在一条本来就很长的 limit 文本后面，在 11.5 px 下自然换行，
  宽度上不新增任何不可换行的长串（最长的不可断处是课程标题，而 `limitUntil`
  今天已经在渲染同一个标题）。**没有新的宽度风险。**

**`src/course/CoursePanel.tsx`**（第 576 行那个 `lim.until &&` 分支旁）

- 加一个并列分支渲染 `lim.seeAlso`，查标题的方式与 `until` 完全一样
  （`LESSONS.find(...)?.title ?? lim.seeAlso`）。
- 两个分支互斥由测试保证（§5.4），不在 UI 里兜底。

### §5.3 课程：5 处（逐处写明改什么）

| 位置 | 改法 |
| --- | --- |
| `tier1/anomaly.ts:126` | `until: 'rate-vs-model'` → `seeAlso: 'rate-vs-model'`。`kind` 不动（`model-value` 是对的：那两个计数确实是引擎取值）。 |
| `tier1/anomaly.ts:127` | `until` → `seeAlso`。`kind` 不动。 |
| `tier1/anomaly.ts:130` | **`kind: 'unmodelled'` → `'out-of-scope'`**，`until: 'txop'` 保留。依据：引擎建了 TXOP 与聚合，缺的是本场景的 `nonht` 站点；`backoff.ts:103` 说同一件事而标的就是 `out-of-scope`。 |
| `tier1/mcs-ladder.ts:95` | **拆成两条**（先例 `7ab9eb6`）：场景类的那半（「这张查表只给出上限……本课四个变体一次失败也没有，所以这一层看不见」）→ `kind: 'out-of-scope'` + `until: 'rate-vs-model'`；引擎级的那半（「真实速率控制的输入还要更多：最近的成功率、信道忙闲，以及主动探测」）→ `kind: 'unmodelled'` + `seeAlso: 'rate-vs-model'`，并像 `uwb-blocks` 那样自己说明这一半一课也不解除。**不新增一个字的新内容，只是把现有句子分到两条里。** |
| `tier2/width.ts:158` | **拆成两条**：主干（「带宽在这里只是一个倍数……场景打开衰落、再加上 selectivity 一节就补上了这一条」）→ `kind: 'out-of-scope'` + `until: 'selectivity'`；尾巴（「仍然没有的是格间相关……本仿真器取独立，正是分集偏多的那一边」）→ `kind: 'unmodelled'`，**不带任何指向**（`selectivity` 的 `limits[1]` 把它重申了一遍，这正是「不解除」从另一头看的样子）。 |

**一处要连带改的措辞**：#3 和 #8 换了 `kind`，界面前缀就从「没有建模：」变成
「这个模型答不了：」。#3 读得通（和 `backoff:103` 同一个前缀同一件事）。
**#8 读不通**——「这个模型答不了：带宽在这里只是一个倍数」是病句。
所以 `width` 主干那一条的开头要改成 `out-of-scope` 的句式，
照 `selectivity` 自己那条 `out-of-scope` 的写法（「……所以不要拿本课的场景去问……」）。
**这是这一刀唯一一处真的改课文语句的地方，而它不动任何一个数字。**

### §5.4 测试：逐条

**`tests/course/limits.test.ts`（主要改动）**

1. **判据 A**：`it('until only ever sits on an out-of-scope limit')` ——
   遍历 `LESSONS`，凡 `lim.until` 则 `expect(lim.kind).toBe('out-of-scope')`，
   失败信息里带上 `${l.id} / ${lim.kind}`。注释写清为什么
   （引擎在每一课里是同一个，所以引擎级的限制无课可解除）。
2. **`seeAlso` 的三条**：指向真实存在的课；不指向自己；**与 `until` 互斥**
   （`expect(lim.until && lim.seeAlso).toBeFalsy()`）。
   `until` 已有的两条保留不动。
3. **判据 B**：`UNTIL_SITES` 冻成一张表，共 **8 行**（落地后的站点集合：
   `anomaly→txop`、`backoff→txop`、`ifs→edca`、`mcs-ladder→rate-vs-model`、
   `streams→mumimo`、`width→selectivity`、`uwb-blocks→uwb-contention`、
   `uwb-intro→uwb-sstwr`），每行 `[源, 目标, 特征子串, 打开它的那个轴]`。
   断言：课程里 `(源, 目标)` 的集合**恰好等于**表；特征子串在那条限制的 `text` 里；
   那条限制 `kind === 'out-of-scope'`；第四列非空。
4. **`seeAlso` 的站点也冻一张表，落地后 3 行**：`anomaly` 两条、`mcs-ladder` 拆出来的那条。
   （`width` 尾巴那条「格间相关」**不带任何指向**，所以不进这张表，
   而 §5.4 的 `width.test.ts` 那一条专门钉它不带。）
   理由同上：承诺的增减必须是一次显式的编辑。
5. **顺序**（判据 C，见 §7）：每处 `until` 的目标在 `COURSE_ORDER` 里必须排在源之后。

**`tests/course/width.test.ts`**

- `const entry = width.limits.find((l) => l.until === 'selectivity')` 仍然成立（拆后主干带它）。
- `const text = width.limits.map(l => l.text).join('\n')` 把两条拼起来，
  所以 `'格间相关'`、`'听起来就该越糟'`、`${selBinWidthMhz()} MHz 一格`
  等现有断言**全部照旧通过**。
- **新增**：断言 `entry!.kind === 'out-of-scope'`，以及「格间相关」那条**不带** `until`/`seeAlso`。

**`tests/course/mcs-ladder.test.ts`**

- `const text = mcsLadderLesson.limits.map(l => l.text).join('\n')` 同理不受拆分影响。
- **新增**：两条各自的 `kind`/指向，以及「不解除」那半自己说明了这件事。

**`tests/course/anomaly.test.ts` / `backoff.test.ts` / `streams.test.ts`**（§1.4 量出的三处无凭据）

- 各加一个 `describe`，把本处的尺写下来：源课那条限制说本场景缺什么、
  目标课的场景打开了它（`anomaly`/`backoff`：`nonht` → `vht`，于是 `txop` 协商上；
  `streams`：1 台站点 → 4 台）。形状照 `width.test.ts` 与 `uwb-blocks.test.ts`。
- `anomaly.test.ts` 还要钉两条 `seeAlso`：**不是** `until`，并说明理由
  （`rate-vs-model` 的 `limits[0]`/`limits[1]` 原话重申）。

**`tests/course/ofdma-dl.test.ts`**

- 那段 2026-10-04 的更正注释现在描述的是修好之前的世界。改成落地后的事实，
  并把「`ru-diversity` 为什么连 `seeAlso` 都不要」说清楚
  （它是 `COURSE_ORDER` 里的下一个 id，而且 `needs` 里就有 `ofdma-dl`，导航价值为零）。
  `expect(lim.until).toBeUndefined()` 旁边补一条 `expect(lim.seeAlso).toBeUndefined()`。

**`docs/uwb-modellable-backlog.md`**

- 切片 4e 那一行与那一节改成「已完成」，并记下**那个判据**
  （`until` ⇒ `out-of-scope`），因为这张表就是下一个作者会读到的地方。

### §5.5 不需要改的（核过）

- **`tests/course/wording.test.ts` / `readability.test.ts`**：`seeAlso` 只存 id，
  两张禁词表不需要跟。**如果以后谁让它存散文，这两个 walker 必须同时加上**——
  §5.1 的注释要把这句话写进去。
- **`src/model/*`、`src/engine/*`**：一行都不动。
- **`src/course/curriculum.ts`**：课程集合与顺序不动。

---

## §6 fixture 的影响：零。核过

`tests/fixtures/` 只有两份，都是**按课程 id 与变体序号索引的时间线哈希**：
`lesson-hashes.json`（7042 B）与 `uwb-record-hashes.json`（3304 B），
形如 `"radio-primer": "ba2dfb4c"` / `"radio-primer#1": "f8ffc494"`。
它们的键来自 `lesson.scenario()` 与 `lesson.variants![i].scenario()`，值来自跑出来的记录流。

**这一刀改的全部东西——`Limit` 的 `kind`/`until`/`seeAlso` 字段、limit 文本的拆分、
`i18n` 字符串、`CoursePanel` 的一个分支、测试——没有一样进得了 `scenario()`。**
课程集合不变、变体数不变，所以键集不变；场景构造器一个字节不动，所以值不变。

- `grep -rl "until" tests/fixtures/` → **无命中**。
- 本仓库对这件事已有定式说法，可以照抄：`tests/course/frame-anatomy.test.ts:18`
  「The scenario builder is unchanged, so `lesson-hashes.json` keeps this lesson's recorded hash」。

**验收时 `git diff --stat tests/fixtures/` 必须是空的。若不是，这一刀改错了东西。**

---

## §7 允许但空转：一条，指名道姓

**判据 C（`until` 的目标必须排在源之后）在今天的课程上恒为真。** 我量了全部 10 处
（`COURSE_ORDER` 下标）：`mcs-ladder` 6 → `rate-vs-model` 36、`ifs` 20 → `edca` 43、
`backoff` 22 → `txop` 46、`anomaly` 29 → `txop` 46 与 36、`width` 51 → `selectivity` 52、
`streams` 53 → `mumimo` 62、`uwb-intro` 77 → `uwb-sstwr` 82、`uwb-blocks` 88 → `uwb-contention` 99。
**十处全部向前，所以这条检查今天挑不出任何东西，鉴别力为零。**

**仍然要加，而且要在注释里写明它今天是空转的。** 理由：文案
「这一条在《…》里**会被**解除」是一个**将来时**的承诺，而一个指向前面某课的 `until`
会把这句话变成假话，**今天没有任何东西拦得住它**。这条检查三行，
而它要防的那种错正是本仓库最常犯的那种（指向写错一个 id）。
**代价与收益都写在注释里，省得下一个人把它当成有牙的检查。**

另一条也要说清楚：**判据 A 是必要条件而非充分条件**
（§2.4）。它挑不出「`out-of-scope` 的限制指错了一门没打开那个场景类的课」。
判据 B 就是为这个缺口来的，而 B 判的是「有没有人判过」，不是「判得对不对」。
**这一点必须写在 `limits.test.ts` 的注释里，否则下一个作者会以为 A 保证了语义。**

---

## §8 明确不做

1. **不动 `limitUntil` 的文案。** 「会被解除」是这一刀要保住的那个东西。
2. **不给 `Limit` 加 `untilKind` 之类的判别字段。** 判别信息已经在 `kind` 上
   （§2.3），再加一个就是两个会漂的地方。
3. **不引入「限制 → 旋钮路径」的 DSL。** §2.2 量过：七个承诺六个轴，
   为了守 7 处给 319 条限制上一套新语法，不划算。
4. **不做基于文本相似度的「同义重申」检查。** §2.1 量过，两头都错。
5. **不碰 `uwb-blocks` 那一处。** `7ab9eb6` 已经按同一个道理修完，
   而它修完之后的状态**正好满足判据 A**（`out-of-scope` + 一个承诺）。
   这一刀只把它收进判据 B 的那张表里，一个字也不改。
6. **不动任何场景、任何数字、任何 fixture。** §6。
7. **不给 `ru-diversity` 补 `seeAlso`。** `ofdma-dl.test.ts` 已经写明导航价值为零
   （下一个 id，而且 `needs` 里就有它）。这一刀只更新那段注释的事实。
8. **不去给剩下那些没有任何指向的 `out-of-scope` 限制补 `until`。**
   判据 A 是单向的（`until` ⇒ `out-of-scope`），不是双向的。
   「哪些限制值得指一门课」是编辑判断，不是契约。

---

## §9 判断

**这一刀该做，按 (c) 做，而且判据比那三处的改法重要。**

落空的承诺是 3 处，但**真正的缺陷是：这个字段的语义从来没有被守过**，
而守它的办法一直就在字段旁边——`LimitKind` 那四个值里，
**只有一个说的是别的课文能改变的东西**。这件事今天没人看见，
是因为 `kind` 和 `until` 被当成了两件不相干的元数据，
于是 10 处里有 5 处的两个字段互相矛盾，而 5 处里有 2 处矛盾在 `kind` 那一边。

**这一刀之后，承诺的数量不是靠注释记着的，而是一张会红的表。**
这正是 `5facc9c` 那条绿了很久的假注释该换成的东西。

**我对 brief 的一处不同意见值得单独说**：它把 `mcs-ladder:95` 和 `anomaly` 那两条归成一类
（「三处不解除任何东西」）。按两边课文读，`mcs-ladder` 那一处是**复合**的，
而它的前半 `rate-vs-model` 真的解除了（那一课让「查表之下那一层」看得见）。
**把它整条删掉会丢掉一个真承诺**；正确的修法是拆，而本分支上个小时刚拆过一条同形状的。

---

## §10 对 brief 的更正（每条都自己核过）

1. **「三处不解除任何东西」——两处半。** `anomaly:126`、`anomaly:127` 确凿；
   `mcs-ladder:95` 是复合，前半（「本课四个变体一次失败也没有，所以这一层看不见」）
   被 `rate-vs-model` 解除了，后半（真实速率控制的其他输入）没有。见 §1.2。
2. **「其余 7 处精确的承诺」——精确的是 5 处，另外 2 处是蒙对的。**
   `anomaly:130` 与 `width:158` 承诺兑现了，但 `kind` 标成 `unmodelled`，
   而引擎**建了** TXOP／聚合、也**建了**逐格衰落（都在场景开关后面）。
   任何守语义的机制都必须同时挑出这两处——**所以这一刀是 5 处，不是 3 处。** 见 §1.3。
3. **「目标课必须有一个场景打开了源课说没有的那个东西（这一条看起来最硬）」
   ——量完是最软的那一条。** 七个承诺六个轴；唯一一行写得出的那个轴
   （协商上的特性标志之差）在 `width` → `selectivity` 上**假阳性**（两课 `feats` 完全相同），
   在 `streams` → `mumimo` 上**靠不相干的 `ampdu`/`txop`/`ofdma` 变绿**，
   在两处 UWB 上**全盲**。见 §2.2。
4. **「目标课的 `limits` 里不出现与源课那条同义的说法」——实测两头都错。**
   最严重的 `anomaly:127` 最长公共子串只有 5 字，最老实的 `width → selectivity` 有 24 字。
   见 §2.1。
5. **「`uwb-blocks` 那一处另一个 agent 正在处理」——已经处理完了。**
   提交 `7ab9eb6`（「那个 until 只兑现三件事里的一件」）已在本 worktree 的历史里，
   `src/course/uwb/uwb-blocks.ts` 与 `tests/course/uwb-blocks.test.ts` 工作区已干净。
   **它修完之后的状态正好满足我给的判据 A**，所以这一刀和它零冲突，也不需要给它留待办。
6. **「`LimitKind` 恰好四个」——对，但盘点有个坑。** `numbers` 里 `kind: 'formula'` 的
   Block 与 `Limit` 的字面形状一字不差，**用正则盘 `src/course` 会多数出一条**
   （我量到 319 条「limit 形状」的条目，其中 1 条是 formula Block）。
   **判据 A/B 必须遍历 `LESSONS`，不能遍历文件文本。** 见 §2.1。
7. **brief 没提、但会咬人的一条**：`wording.test.ts:49` 与 `readability.test.ts:454,528`
   是**按字段名逐个列举**走课程文本的，所以**一个新字段的散文会从两张禁词表下面整个漏过去**。
   这就是 `seeAlso` 只存 id 的理由之一。见 §4、§5.5。
8. **一条确认**：brief 那张 10 处的表、行号、目标课，以及
   「`tests/course/limits.test.ts` 只检查目标存在且不自指」，我重新 grep 与通读过，
   **逐条都对**（基线 `7ab9eb6`，10 行，7 个目标课）。
