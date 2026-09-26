# 把简化标注铺到全部课程

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan batch-by-batch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 剩下 62 课都写上 `limits`,清空 `NOT_YET`,把字段改成必填。

**Architecture:** 契约与渲染已在 `7774e5e` 落地,M1 四课是试点。本计划只是铺开。

**Spec:** `docs/superpowers/specs/2026-09-21-course-readability-design.md` 的延伸;
契约见 `src/course/lessonKit.ts` 的 `Limit`,规则见 `tests/course/limits.test.ts`。

## Global Constraints

### 最重要的一条:每一条都要对着引擎核过

**不要照着课文的印象写。** 试点里我自己写的一条当天就是错的:`mcs-ladder` 说
"选级只看信噪比这一个输入",而 `src/engine/rate.ts` **一直**有损失反馈——
信噪比查表给的是上限,连续两次失败降一档,连续十次成功涨回来。这门课把引擎
**已经做了的事**记在了"真实世界"那一栏,而且是记在 `limits` 里,
那个字段存在的全部意义就是防止这种事。

所以每写一条,先去读相关的引擎代码确认它是真的。报告里要说**你核了哪些文件**。

### 四个分类,不许写通用套话

| kind | 含义 |
| --- | --- |
| `threshold` | 用硬门限代替了真实的渐变曲线 |
| `unmodelled` | 某种物理现象或机制根本没建模 |
| `model-value` | 某个常数是本仿真器自己选的,标准没规定 |
| `out-of-scope` | 这个模型在某类场景下根本不适用,不该拿去问 |

"本仿真器有简化"这种句子一条都不要。每条要说**具体放弃了什么**,以及真实设备
是怎样的。`until` 指向后面解除它的那一课时才写,课 id 会被校验。

### 其余

- 中文,全角标点(,:)。半角是脚本引入的缺陷,之前修过两次。
- 每条 2–4 句。太短说明没想清楚,太长读者不会读。
- 一课 2–5 条。比这多说明该拆,比这少说明没找全。
- **不改课文正文、不改场景、不动 fixture。** `git diff --stat tests/fixtures/`
  必须为空,**绝不运行 `UPDATE_HASHES=1`**。
- 提交信息以下列两行结尾:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`

### 每批的收尾动作

把本批的课 id 从 `tests/course/limits.test.ts` 的 `NOT_YET` 里删掉,
然后跑 `npx vitest run tests/course/limits.test.ts` —— 那条
"names exactly the graded lessons that still have no limits" 断言会告诉你
删对了没有。**串行执行:批次之间不能并行,因为都要改这一个清单。**

---

### Batch A: Tier 1 的帧、空口时间与信道接入(15 课)

`roles-stack`、`relay-hops`、`frame-anatomy`、`frame-qos-fcs`、
`frame-anatomy-bytes`、`small-frames`、`airtime`、`ifs`、`cca`、`backoff`、
`collisions-cw`、`nav`、`hidden`、`rts-cts`、`anomaly`

**要核的引擎文件**:`src/engine/phy.ts`(空口时间、门限)、`src/engine/mac.ts` 或
同名的信道接入实现、`src/engine/channel.ts`(载波侦听、捕获、NAV)。

**已知该说而多半没说的**(核过再写,别照抄):FCS 引擎并不真算、
退避的随机数来自种子流、捕获有一个固定的 margin、NAV 是理想的(不丢失、不过期错)。

- [ ] 写 15 课的 `limits`
- [ ] 从 `NOT_YET` 划掉这 15 个 id
- [ ] `npx vitest run` 全绿 + fixture 零 diff
- [ ] 提交

---

### Batch B: Tier 1 其余与 Tier 2 的 QoS(13 课)

`retries-queues`、`queues`、`bianchi`、`bianchi-vs-sim`、`rate-vs-model`、
`tier1-project`、`tier1-project-review`、`edca`、`edca-cost`、`ampdu`、`txop`、
`txop-protect`、`protect-policies`

**要核的引擎文件**:队列与重传的实现、`src/engine/edca.ts` 或等价物、
聚合与 TXOP 的实现。

**注意**:`bianchi` 与 `bianchi-vs-sim` 讲的是解析模型与仿真的差距,
它们的 `limits` 要说的是**这个仿真器**的简化,不是 Bianchi 模型的假设——
两者很容易混,写的时候分清楚。

`rate-vs-model` 是 `mcs-ladder` 那条 `until` 指向的课,读一下那条再写它的。

- [ ] 同上四步

---

### Batch C: Tier 2 的容量旋钮、调度与综合(12 课)

`width`、`streams`、`rate`、`rate-fallback`、`rate-cost`、`ofdma-dl`、
`ofdma-ul`、`mumimo`、`mumimo-choose`、`mlo`、`mlo-gain`、`capstone`

**要核的引擎文件**:`src/engine/rate.ts`(损失反馈那一层,见上文)、
带宽与空间流的处理、OFDMA/MU-MIMO 的调度实现、MLO 的实现。

**`rate-fallback` 值得多花一点时间**:衰落刚刚落地,这门课终于有真话可说了——
它教的降速机制在默认场景里仍然看不见(没有东西让链路变差),但打开衰落就能看见。
这一条用 `out-of-scope`,并说明怎么看见它。

- [ ] 同上四步

---

### Batch D: UWB 第一半(11 课)

`uwb-intro`、`uwb-frame`、`uwb-sts`、`uwb-sstwr`、`uwb-dstwr`、`uwb-blocks`、
`uwb-slot-budget`、`uwb-position`、`uwb-geometry`、`uwb-coexist`、`uwb-contention`

**要核的引擎文件**:`src/uwb/` 下的 `channel.ts`、`phy.ts`、`device.ts`、
`ranging.ts`。

**已知该说的**:UWB 侧**没有衰落**(Wi-Fi 侧有了,UWB 侧仍然没有——
这是 2026-09-27 那一刀明确的范围决定);时间戳噪声是模型取值;
最小二乘解算器对每个距离一视同仁。

- [ ] 同上四步

---

### Batch E: UWB 第二半(11 课)

`uwb-dl-tdoa`、`uwb-ul-tdoa`、`uwb-aoa`、`uwb-mms`、`uwb-mms-numbers`、
`uwb-nba`、`uwb-nba-coexist`、`uwb-uwbd`、`uwb-acquisition`、`uwb-subrounds`、
`uwb-capstone`

**要核的引擎文件**:`src/uwb/mms.ts`、`device.mms.ts`、`nb.ts`、`scene.ts`。

**注意**:这十一课里有四课依据的是**未批准的草案**,它们的 `limits` 要和
`sources` 分工清楚——`sources` 说数字来自哪份文稿,`limits` 说模型在哪里
不是真实的无线电。别把"这是草案"写成一条 limit,那是 `sources` 的事。

`uwb-acquisition`、`uwb-uwbd`、`uwb-subrounds` 已经在课文里写了几条限制
(`rsfSfd` 不改变 RSF 长度、码序号 9–32 校验不了),把它们提到 `limits` 里。

- [ ] 同上四步

---

### Batch F: 收尾 —— 字段改必填,加上 README 与词汇表

- [ ] `NOT_YET` 此时应为空。把 `Lesson.limits` 从 `limits?:` 改成必填,
      删掉 `limits.test.ts` 里那个 `NOT_YET` 机制与它的两条自指测试,
      改成一条"每门受评课程都有 limits"。
- [ ] README 加一段说明衰落:默认关闭、两层、平坦、以及不建模的东西。
- [ ] 词汇表加三条:衰落(fading)、相干时间(coherence time)、
      莱斯 K 因子(Rician K factor)。按既有规则带出处标记。
- [ ] `npx vitest run` 全绿 + fixture 零 diff
- [ ] 提交
