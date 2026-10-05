# Wi-Fi 特性覆盖表：引擎建了什么，课教了没有

这张表回答一个问题：**Wi-Fi 那 49 门课，把这个引擎真的会做的事教完了吗。**

它和 `docs/uwb-feature-coverage.md` 是一对，但问的不是同一件事。UWB 那张表的难点在**第二列**：
P802.15.4ab 的草案正文是会员限定的，所以「草案里有没有这件事」每一格都要举证。
Wi-Fi 这一侧没有这个难题——IEEE Std 802.11-2024 与 IEEE Std 802.11be-2024 的全文都在语料库里
（`D:/ai_patent_experiments/.claude/skills/wifi_patent_skill/references/ieee_standards/text/`，
`80211-2024.json` 5956 页 / 约 1699 万字符，另有 `80211be-2024.json`、`80211bf-2025.json`、
`80211bh-2024.json`、`80211bk-2025.json`），**所以标准怎么说，查就有。**

**Wi-Fi 这一侧的难点在第三列与第四列之间**：引擎比课程大，而大出来的那一块从来没有人数过。
这张表就是去数它。

**排期在 `docs/wifi-course-backlog.md`**，和 UWB 那一对一样分成两份：
这里只回答「有什么、在哪、教了没有」，「该不该做、花多少、批不批」在那一份里。

---

## 怎么读这张表

**第一列 特性**：名字，加上它在 IEEE Std 802.11-2024 里的条号（802.11be-2024 的条号写明
「be」）。条号取自语料库的目录（`toc/80211-2024.json`，6467 行；34 个一级条款，§15–§34 是各个
物理层，§10 是 MAC 功能描述的 70 个小节）。**工作从引擎出发，不从标准目录出发**——
见下面「这张表的范围」。

**第二列 标准依据**，只取五个值：

| 值 | 含义 |
| --- | --- |
| 已发布 · 802.11-2024 | 在 2024 版正文里。不需要再举证。 |
| 已发布 · be-2024 | 在 IEEE Std 802.11be-2024 里（EHT，第 35/36 章）。 |
| 已发布 · 其他修正案 | 在 802.11bf-2025 / bh-2024 / bk-2025 里，各自注明。 |
| 标准不规定 | 标准留给实现，或者标准连这个量都没有。**单元格里必须说清是哪一种**，并说出这个数是谁选的。 |
| 标准里查不到 | 检索过而找不到。**单元格里要说清查了什么。** |

**第三列 本仿真器**：已建模 / 部分建模 / 未建模。**这一列读的是代码，不是课文。**
写「部分建模」的行，第四列必须有一句说清哪一部分。

**第四列 位置与证据**，三条纪律，缺一条这一行就不算写完：

1. **已建模或部分建模的行**，给出引擎符号，**再给出课程编号**（`@airtime` 这样）；
   **一门课也没有的，必须原样写「引擎建了，无课」。**
   这一条是 UWB 那张表没有的——它的第四列只说「符号 + 课号」，于是一个
   「建了而没课」的格子在那套体例里**无处可写**，只会被写成一个有符号的「已建模」。
   这张表存在的理由就是那种格子，所以它得有自己的词。
2. **未建模的行**，必须写明它是**范围决定**还是**未偿的债**。
   这条纪律是 UWB 那份文档第 36 行自己立的，**而那份文档自己违反过一次**
   （§10.47 频域延后那一行，两者都没写，2026-10-05 才补）。
   **这张表写完之后逐行自检过一遍**，核法见下。
3. **「标准不规定」的行**要说出那个数是谁选的。仓库的 `model` 标注约定就是为这件事立的。

**引用写法**（与 UWB 那张表同形，便于以后做同一个测试）：

- 引擎符号写作 `` `engine/phy.ts#EIFS_NS` ``——路径相对 `src/`，`#` 后是该文件的**模块级导出名**。
  **私有方法不用这个写法**（例如 `engine/mac.ts` 的私有方法 `buildMuParts`），
  因为 W0 那个测试只检查得到导出名——写成 `#` 形会让它看起来被检查过而其实没有。
- 课程编号写作 `` `@airtime` ``，就是 `COURSE_ORDER` 里的那个 id。

**全表 107 处 `#` 形引用（去重 95 个符号）与 55 个课号由 `tests/course/wifi-coverage.test.ts`
逐个核对**，而且上面这三个数本身也由它核对——它不自带数字，它把这一行写出来的数和它量到的数比。
下面这段脚本是它的前身，留着当重跑的配方（2026-10-05 跑过，零失败），**但它只是配方，判据在那个测试里**：

```bash
PYTHONIOENCODING=utf-8 python - <<'PY'
import re,os,sys
t=open('docs/wifi-feature-coverage.md',encoding='utf-8').read()
bad=[]
for p,s in sorted(set(re.findall(r'`([a-zA-Z][\w./]*\.ts)#(\w+)`',t))):
    f=os.path.join('src',p)
    if not os.path.exists(f): bad.append((p,s,'NO FILE')); continue
    if not re.search(r'export\s+(const|function|class|interface|type|enum)\s+'+re.escape(s)+r'\b',
                     open(f,encoding='utf-8').read()): bad.append((p,s,'NOT EXPORTED'))
order=open('src/course/curriculum.ts',encoding='utf-8').read()
for i in sorted(set(re.findall(r'`@([a-z0-9-]+)`',t))):
    if "'"+i+"'" not in order: bad.append((i,'','NOT A LESSON'))
sys.stdout.write('bad %d\n'%len(bad)+''.join('  !! %s#%s %s\n'%b for b in bad))
PY
```

**第四列纪律的自检**是 `tests/course/wifi-coverage.test.ts` 里的一个函数，不是一次通读——
通读是 UWB 那份文档漏掉 §10.47 那一行的原因。下面「总数」那一节里的脚本是它的前身。
那个测试还反过来验过自己：往表里种一行缺裁定的、种一个改过名的符号、种一个不存在的课号，三样都被抓到。

---

## 这张表的范围：不枚举整部标准

802.11-2024 有 34 个一级条款，其中 **§15、§16、§20、§22、§23、§24、§25、§28、§29、§30、§31、
§32、§33、§34 这十四章的物理层或 MAC 本仓库一个字都没建**（DSSS、HR/DSSS、DMG、TVHT、S1G、
CDMG、CMMG、EDMG、WUR、NGV、LC、增强广播）。**把它们逐节列出来没有意义**，
所以这张表是**从引擎这一侧起手的**：

1. 列出 `src/engine/`、`src/model/` 里 Wi-Fi 那部分**真的建了**的东西（`src/uwb/` 不在内；
   AMP 那一块在内，因为它挂在 Wi-Fi 的第二阶段下）；
2. 对每一条问「哪一门课教它」——**凡引擎建了而没有一门课教的，就是这张表真正的产出**；
3. 标准里**没建**的，只列**读者会合理期待、而我们决定不建**的那些，每条一句理由，
   都收在「十二、读者会合理期待而我们决定不建的」一节里。

这正是 2026-10-05「引擎已建成、课程里没有」那一刀的方法
（`docs/superpowers/specs/2026-10-05-built-but-untaught-design.md`）。
那一刀找出三件（七种 EDCA 作弊预设、一层真的云端应用层、`gaming` 档与 `gameAccel`），
落成两门新课。**这张表是把那一次的一次性普查变成一份可重跑的清单。**

---

## 总数（2026-10-05 写作时）

全表 **120 行**（第一到第十二节的四列数据行；第十四到十七节的表是汇总，不计入）。

| 标准依据（按前缀归并） | 行数 |
| --- | --- |
| 已发布 · 802.11-2024 | 76 |
| 已发布 · be-2024 | 12 |
| 已发布 · 其他修正案 | 5 |
| 标准不规定 | 24 |
| 标准里查不到 | 3 |

三行是**混合**的（例如「分格单位出自标准，每格的起伏标准不规定」），按前缀归到「已发布」里，
单元格里把两半分开写了。

| 本仿真器 | 行数 |
| --- | --- |
| 已建模 | 77 |
| 部分建模 | 10 |
| 未建模 | 33 |

| 第四列的裁定 | 行数 |
| --- | --- |
| 带 `@课号` | 94 |
| **整行写着「引擎建了，无课」** | **4** |
| 范围决定 | 18 |
| 未偿的债 | 16 |

两张表对不上的地方都是故意的，各有一句话解释：
94 + 4 = 98 大于「已建模 + 部分建模」的 87，有两个原因：有几行**未建模**的也带着课号
（那门课教了这件事不存在，`@frame-anatomy` 对分片就是这样）；而 2.4 GHz 站点那一行
**同时**带课号与「引擎建了，无课」——`@amp-coexist` 的摄像头真的载过这条链路，
而那一课不教它，所以两样都是真的（见「十四」第 1 条）；
18 + 16 = 34 大于「未建模」的 33，因为信标那一行**同时**写了两个裁定——
按今天的实情是范围决定，按原计划是未偿的债，而把它压成一个会丢掉一半。

**重跑这几张计数表**（`grep -c` 会把「怎么读这张表」里的取值说明也数进去，所以用脚本按单元格数）：

```bash
cd <worktree>
PYTHONIOENCODING=utf-8 python - <<'PY'
import collections, sys
rows=[]
for i,l in enumerate(open('docs/wifi-feature-coverage.md',encoding='utf-8'),1):
    if not l.startswith('| '): continue
    c=[x.strip() for x in l.strip().strip('|').split('|')]
    if len(c)==4 and c[2].startswith(('已建模','部分建模','未建模')): rows.append((i,c))
o=['rows %d'%len(rows)]
for k,v in sorted(collections.Counter(r[1][1].split('（')[0].split(' +')[0] for r in rows).items()): o.append(' col2 %s %d'%(k,v))
for k,v in sorted(collections.Counter(r[1][2].split('（')[0] for r in rows).items()): o.append(' col3 %s %d'%(k,v))
o.append(' @id %d  nocourse %d  scope %d  debt %d'%tuple(
  sum(1 for r in rows if s in r[1][3]) for s in ['`@','引擎建了，无课','范围决定','未偿的债']))
# the two disciplines, as assertions rather than as a read-through
for i,c in rows:
    bad = (c[2].startswith('未建模') and '范围决定' not in c[3] and '未偿的债' not in c[3]) or \
          (not c[2].startswith('未建模') and '`@' not in c[3] and '引擎建了，无课' not in c[3])
    if bad: o.append(' !! line %d %s'%(i,c[0][:40]))
sys.stdout.write('\n'.join(o)+'\n')
PY
```

**2026-10-05 跑出来没有一条 `!!`。** 这就是第四列那两条纪律的自检结果——
UWB 那份文档漏掉的那一行（§10.47），在这里是一条会打印出来的失败。

**这张表现在有测试钉住它了（切片 W0，2026-10-05）。**
写作当天它没有，而那是它自己点出来的第一条缺陷：当时只有一段核查脚本，**而脚本不是测试**——
脚本是「有人想起来跑」才被检查，那和一句注释的保证是同一个保证。
现在 `tests/course/wifi-coverage.test.ts` 检查这张表点到名的每个引擎符号与每个课号**还存在**、
第四列那两条纪律**没有一行违反**、而且这份文档自述的十五个数（行数、三个引用数、十二张计数）
**都和量出来的一致**。它和 `tests/course/uwb-coverage.test.ts` 共用
`tests/course/coverage.ts` 里的引用语法与导出解析器——这张表当初选同一套引用写法就是为了这个。

---

## 这张表会怎样撒谎

那条「没有测试」已经不在了（切片 W0）。剩下三种，测试一种也抓不到：

1. **「已建模」这一格会被人从底下换掉而符号名不变。** 和 UWB 那张表完全同一种腐烂。
2. **「有课教」会退化成「有课提过」。** 这张表第四列的课号是**量出来的**——
   见下面每一节自己的核法——但「一门课提到某个常数」与「一门课教那个机理」不是一回事。
   凡两者有差距的行，单元格里都写出来了（例如 2.4 GHz 那几行）。
3. **「引擎建了，无课」会因为新开一门课而过期，而没人回头改这里。**
   这是第 2 条的反面，同一个缺口。

所以这张表的保质期是：**引擎的下一次改动，或课程的下一门新课。**

---

## 一、信道接入：DCF（§10.3）

**本节课号的核法**：`grep -rlE '<关键词>' src/course/tier1/*.ts src/course/tier2/*.ts`，
再打开那一门确认它教的是机理而不是顺带提到。

| 特性 | 标准依据 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| SIFS / 时隙 / DIFS（§10.3.2.3.5、§17.4.4） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#SIFS_NS` = 16 000、`engine/phy.ts#SLOT_NS` = 9 000、`engine/phy.ts#DIFS_NS` = 34 000，整条链路的时序封在 `engine/phy.ts#OFDM_5G` 里。`@ifs` |
| EIFS（§10.3.2.3.7） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#EIFS_NS` = 94 000 = SIFS + DIFS + 6 Mb/s 一个 Ack；记录是 `IFS_START.kind === 'EIFS'`。`@anomaly`、`@collisions-cw` |
| 退避与竞争窗口（§10.3.2.3.3、§10.23.2.2） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#CW_MIN` = 15、`engine/phy.ts#CW_MAX` = 1023；记录 `BACKOFF_DRAW` / `BACKOFF_DEC` / `CW_CHANGE`。`@backoff`、`@collisions-cw` |
| 退避在介质忙时冻结、空闲后续数（§10.23.2.4） | 已发布 · 802.11-2024 | 已建模 | `engine/mac.ts` 的 `onCcaBusy` 取消 tick 并按原值重挂；记录 `BACKOFF_FREEZE` / `BACKOFF_RESUME`。`@backoff`、`@nav` |
| EDCA 的第一个退避时隙边界在 AIFS 末尾（§10.23.2.4，标准对齐 A5） | 已发布 · 802.11-2024 | 已建模 | EDCA 与传统 DCF 在此处分开：EDCA 在 IFS 结束时先减一次。`@edca` |
| 空闲信道评估：能量检测与前导码检测两条门限（§17.3.10.6） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#CCA_ED_DBM` = −62、`engine/phy.ts#CCA_PD_DBM` = −82；记录 `CCA_BUSY.cause` 分 `'energy'` / `'preamble'`。`@cca` |
| 前导码能不能被检出，用一个信噪比门限（§17.3.10.6 只给电平，不给信噪比） | 标准不规定 | 已建模 | `engine/channel.ts#PREAMBLE_DETECT_SINR_DB` = 4，**本仿真器选的**；记录 `RX_MISS.reason === 'preambleSinr'`。`@decode-thresholds`、`@hidden` |
| 虚拟载波侦听与 NAV（§10.3.2.4、Duration 字段 §9.2.4.2） | 已发布 · 802.11-2024 | 已建模 | 记录 `NAV_SET` / `NAV_CLEAR` 带 `source`，`engine/mac.ts` 另记「是谁设的 NAV」（标准对齐 A10）。`@nav` |
| RTS/CTS 与 dot11RTSThreshold（§10.3.2.9、§10.27） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#RTS_BYTES` = 20、`engine/phy.ts#CTS_BYTES` = 14、`model/scenario.ts` 的 `rtsThresholdBytes`。`@rts-cts`、`@hidden` |
| RTS 之后的 NAV 复位定时（§10.3.2.4，标准对齐 A15） | 已发布 · 802.11-2024 | 已建模 | 2·SIFS + CTS 时长 + `engine/phy.ts#RX_START_DELAY_NS`（20 µs）+ 2 个时隙。`@rts-cts` |
| 响应超时：AckTimeout / CTSTimeout（§10.3.2.9） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#ACK_TIMEOUT_NS` = 45 000 = SIFS + 时隙 + aRxPHYStartDelay；记录 `ACK_TIMEOUT` / `CTS_TIMEOUT`。`@collisions-cw`、`@rts-cts` |
| 超时之后下一个 IFS 从超时末尾起算（标准对齐 A6） | 已发布 · 802.11-2024 | 已建模 | `@collisions-cw` |
| 重传计数与 dot11ShortRetryLimit = 7（2020 版之后的单计数器模型） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#SHORT_RETRY_LIMIT` = 7，每个 MSDU 自己记；记录 `RETRY`、`DROP.reason === 'retryLimit'`。**2016 版的 SRC/LRC 双计数器已删**（标准对齐 A3）。`@retries-queues` |
| 序列号跨重传保持、重复检测（§10.3.2.14） | 已发布 · 802.11-2024 | 已建模 | MSDU 第一次发送时取号，重传复用，模 4096（标准对齐 A2）。`@small-frames`（序号字段）、`@frame-anatomy`（重复帧） |
| 捕获效应：先到的帧在信噪比够时解得出（§17.3.10 的接收过程，正文不给捕获规则） | 标准不规定 | 已建模 | `engine/channel.ts` 的 `Channel`：逐次发送累加干扰，按 `engine/phy.ts#reqSinrDb` 判决。**「两帧重叠就都丢」是本仿真器明确不采用的那个简化。** `@decode-thresholds`、`@collisions-cw` |
| 分片与重组（§10.4、§10.5） | 已发布 · 802.11-2024 | 未建模 | **范围决定。** 一个 MSDU 永远是一个 MPDU；分片的收益（短帧更不容易被干扰打断）在这个引擎里由 A-MPDU 的粒度代替，而分片阈值会多出一整条与聚合相互作用的路径。**已记进课程**，而且记得比这一行准：`@frame-anatomy` 有一条 `unmodelled` 说帧控制里六个比特恒为 0（协议版本、更多分片、电源管理、更多数据、受保护帧、+HTC），**于是分片、省电、加密与 HT 控制这四件事在整个课程里都不可能出现**——一条 `limits` 同时交代四个缺口，`model/frameFields.ts` 作证。`@frame-anatomy` |
| No Ack（§10.26） | 已发布 · 802.11-2024 | 未建模 | **范围决定。** 每一次数据发送都要一个 Ack 或 BA；没有 QoS 的「不要确认」这一档。 |
| 反向传输协议 RDP（§10.29） | 已发布 · 802.11-2024 | 未建模 | **范围决定。** TXOP 持有者不会把剩下的时间让给对端。 |

## 二、HCF / EDCA（§10.23）

| 特性 | 标准依据 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 四个接入类别与 AIFS[AC]（§10.23.2.3、Table 9-194 的缺省值） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#EDCA_PARAMS`：AIFSN 7/3/2/2、CWmin 15/15/7/3、CWmax 1023/1023/15/7；`engine/phy.ts#aifsNs`。`@edca` |
| TXOP 限额（Table 9-194） | 已发布 · 802.11-2024 | 已建模 | `txopLimitNs` 2 528 000 / 2 528 000 / 4 096 000 / 2 080 000；BK 与 BE 照标准取 2.528 ms，**不取 ns-3 的 0**。记录 `TXOP_START.untilNs` / `TXOP_END`。`@txop` |
| 传统 DCF 作为单伪类别（§10.3） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#DCF_PARAMS`：AIFSN 2 ⇒ DIFS，TXOP 限额 0。`@ifs`、`@edca` |
| 内部碰撞（§10.23.2.12.1） | 已发布 · 802.11-2024 | 已建模 | 落败的 EDCAF 记一次重传并翻倍 CW（标准对齐 A7）；记录 `INTERNAL_COLLISION`。**256 个课程场景里只有 9 个真的跑出过它**，而 `@edca` 对它的解释有一句是错的——见「十三」第 1 条。`@edca`、`@mumimo` |
| QSRC 驱动 CW（§10.23.2.2） | 已发布 · 802.11-2024 | 已建模 | 记录 `CW_CHANGE.qsrc`、`RETRY.qsrc`。`@collisions-cw`、`@retries-queues` |
| 发送之后的退避（§10.23.2.2） | 已发布 · 802.11-2024 | 已建模 | `@backoff` |
| 把业务映射到接入类别（§10.2.3.2、Table 10-1） | 已发布 · 802.11-2024 | 已建模 | `engine/traffic.ts#acForProfile`，九个业务档各自落到一个 AC。`@edca` |
| 路由器的「游戏加速」把游戏流打进 AC_VI（标准不规定，这是厂商行为） | 标准不规定 | 已建模 | `model/scenario.ts` 的 `NodeCfg.gameAccel`，**只读接入点自己的那个布尔**；贴到别的节点上被 `driverRefusalsFor` 拒掉。`@wan-rtt` |
| MU EDCA 参数（§26.2.7） | 已发布 · 802.11-2024 | 未建模 | **未偿的债**，标准对齐程序的 F 项。被触发过的站点现在不换一套更保守的 EDCA 参数，所以「接入点靠 MU EDCA 把站点赶去走触发接入」这条机理量不出来。 |
| 混合协调功能的受控信道接入 HCCA（§10.23.3） | 已发布 · 802.11-2024 | 未建模 | **范围决定。** 商用设备不实现它。 |

## 三、聚合与确认（§10.11、§10.12、§10.25）

| 特性 | 标准依据 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| A-MPDU 与分隔符（§10.12、§9.8） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#AMPDU_DELIMITER_BYTES` = 4、`engine/phy.ts#QOS_HDR_BYTES` = 26、`engine/phy.ts#MAX_AMPDU_MPDUS` = 64。**填充只加在子帧之间、不加在最后一个之后**（标准对齐 A17）。`@ampdu`、`@small-frames` |
| 压缩 BlockAck（§9.3.1.9、§10.25） | 已发布 · 802.11-2024 | 部分建模 | 帧长有：`engine/phy.ts#BA_BYTES` = 32（`model/frameFields.ts` 把它拆成 SSC + 位图两格）。**没建的是位图本身**：`engine/mac.ts` 是整 PPDU 解码模型，一次交换要么全成功要么全失败，没有逐子帧失败这回事（代码注释自己说「no per-subframe bitmap to partially fail on」）。`@ampdu` |
| BA 协商（ADDBA/DELBA，§10.25.2） | 已发布 · 802.11-2024 | 未建模 | **未偿的债**，标准对齐程序的 C 项（「BA agreements, bitmap and partial retransmission」）。没有协商，所以也没有「协商下的重传不计数」这条规则。 |
| 部分重传与重排序（§10.25.3） | 已发布 · 802.11-2024 | 未建模 | **未偿的债**，同上一行，同一个 C 项。 |
| 多站 BlockAck（§9.3.1.9 的 Multi-STA 变体） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#multiStaBaBytes` = 32 + 8·(n−1)。`@ofdma-dl` |
| A-MSDU（§10.11） | 已发布 · 802.11-2024 | 未建模 | **未偿的债**，标准对齐程序的 C 项点名要它（`grep -ri 'amsdu\|A-MSDU' src/engine src/model` 零命中）。它和 A-MPDU 的取舍（一个 FCS 省掉 n−1 份帧头，代价是一丢全丢）是这个引擎量得出来的，所以它够得上一门课。 |
| PPDU 时长上限（§10.13） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#MAX_PPDU_NS` = 5 484 000（aPPDUMaxTime）。`@ampdu` |
| TXOP 内的聚合时间预算（标准对齐 A12/A13） | 已发布 · 802.11-2024 | 已建模 | 第一帧按 `txopLimit −（RTS+SIFS+CTS+SIFS）− SIFS − 响应时长` 来裁；**200 µs 的下限已删**。`@txop`、`@txop-protect` |
| CF-End 把没用完的 TXOP 还回去（§9.3.1.? 的 CF-End 帧、§10.23.2.9） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#CF_END_BYTES` = 20，24 Mb/s 发出；`engine/mac.ts` 收到时清 NAV。`@protect-policies` |
| 突发保护的三种策略 | 标准不规定 | 已建模 | `model/scenario.ts#TXOP_PROTECTIONS` = `single` / `boundary` / `multiple`，**三个名字是本仿真器起的**，标准只给机制不给策略。`@txop-protect`、`@protect-policies` |

## 四、多速率与控制响应（§10.6）

| 特性 | 标准依据 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 强制速率集（§17.3.10、Table 17-21） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#MANDATORY_MBPS` = [6, 12, 24]。`@bianchi` |
| 控制响应速率规则（§10.6.6） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#ctrlRespRateFor` / `engine/phy.ts#ctrlRespRateForMode` 走 non-HT 参考速率表 `engine/phy.ts#NONHT_REF_MBPS`，**不是**那一级的 20 MHz/1SS 数据速率（标准对齐 A16）。`@bianchi`、`@rts-cts` |
| 第 17 章 OFDM 八级速率与它们的灵敏度（Table 17-21） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#RATES`：6…54 Mb/s，灵敏度 −82…−65 dBm。`@mcs-ladder` |
| 从灵敏度反推所需信噪比（Table 17-21 减去标准自己的噪声假设） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#sinrThreshDb`、`engine/phy.ts#reqSinrDb`：灵敏度 − kTB(20 MHz) − 标准那 10 dB 噪声系数。`@decode-thresholds` |
| 选一级速率时留的实现余量 | 标准不规定 | 已建模 | `engine/phy.ts#RATE_MARGIN_DB` = 3，**本仿真器选的**；`engine/phy.ts#mcsForRssi` 用它。`@mcs-ladder` |
| 接收机噪声系数 | 标准不规定（标准只在灵敏度推导里隐含 10 dB） | 已建模 | `engine/phy.ts#NOISE_FIGURE_DB` = 7 用于算噪声地板，而反推门限时用标准那 10 dB——**两个数故意不同**。`@noise-floor` |
| 噪声随带宽上升（10·log₁₀(W/20)） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#noiseDbm(widthMhz, nfDb)`。`@noise-floor`、`@width` |
| 速率自适应的闭环 | 标准不规定（§10.31 链路自适应只给上报，不给算法） | 部分建模 | 建的是一种：`engine/rate.ts#RateControl`，连续 2 次失败降一级（`engine/rate.ts#FAILURES_TO_STEP_DOWN`），10 次成功升一级，上限是传播模型给的那一级，所以永不脱离物理。**没建的是算法族**（Ideal / Minstrel-HT / Thompson）——那是标准对齐程序的 G 项。`@rate`、`@rate-fallback`、`@rate-cost` |
| 降档只沿 MCS 一个轴，不砍流 | 标准不规定 | 已建模（而且是一处简化） | `engine/rate.ts` 只动 MCS；真实速率表是（MCS, 流数）二维格子。已写进 `@streams` 的 `limits`。`@rate-fallback` |
| 链路自适应上报（§10.31、HT Control 的 MFB） | 已发布 · 802.11-2024 | 未建模 | **范围决定。** 速率决策在发送端本地做，空口上不传任何反馈字段。 |

## 五、物理层时序：第 17 章 OFDM 与第 18 章 ERP

**这一节是这张表最要紧的一节**，因为 2.4 GHz 的 ERP 时序**整套建好了、有专门的测试
（`tests/engine/link-2g.test.ts`）、编辑器里可点**，而**没有一门 Wi-Fi 课把一台站点放到这条链路上**。

**但「2.4 GHz 完全没教」是过头的说法，要先把它改准**：AMP 那两门课顺手教了三个数——
`@amp-coexist` 的 AIFS 公式块给出 2.4 GHz 的 SIFS 10 µs 与时隙 9 µs 并算了 AC_BK 的 73 µs，
`@amp-ppdu` 的字段表与公式给出那 6 µs 的信号扩展并说明它「本频段自带」。
**所以这一整块是「从标签那一侧教过，从 Wi-Fi 站点那一侧没教过」**，
而剩下没教的部分恰好是一台 Wi-Fi 站点会感觉到的那几个：DIFS、AckTimeout、EIFS、带宽上限、
频段损耗差。这个区分是这一节每一行第四列的依据，不要在引用时压扁它。

核法：`npx vite-node --root <worktree>` 跑一个脚本，遍历 `LESSONS` 的 `scenario()` 与
`variants[*].scenario()`（共 **256** 个场景），对每个场景算 `linkPlanFor(sc.nodes).links`。
**结果（2026-10-05 重测，切片 W5）：`'2g'` 出现在 17 个场景里，分属全部五门 AMP 课；
而其中带一台 Wi-Fi 站点（`kind: 'sta'`）的只有 4 个，全是 `@amp-coexist` 的那四个场景，
那台站点就是它当干扰源用的摄像头（Wi-Fi 6）。**
**写作当天这两句写成了「`'2g'` 只出现在 1 个场景里」，两个数都不对**：它把「带 Wi-Fi 站点的
场景数」当成了「出现 `'2g'` 的场景数」，而前者也是 4 不是 1（基础场景加三个变体）。
下面那一行第四列原样继承了这个错，一并改了。

| 特性 | 标准依据 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 第 17 章 OFDM 的 PPDU 时长公式（式 17-29、§17.4.3） | 已发布 · 802.11-2024 | 已建模 | `engine/phy.ts#txTimeNs`：20 µs 前导 + 4 µs SIGNAL + 4 µs/符号，符号数 `ceil((16+8L+6)/N_DBPS)`。`@airtime`、`@frame-anatomy-bytes` |
| 第 18 章 ERP-OFDM 的帧间时序（§18.4.4、§10.3.8） | 已发布 · 802.11-2024 | 部分建模 | `engine/phy.ts#ERP_2G`：SIFS 10 µs、短时隙 9 µs、DIFS 28 µs、AckTimeout 39 µs、EIFS 88 µs、信号扩展 6 µs。**教到的只有 SIFS 10 µs 与时隙 9 µs**（`@amp-coexist` 的 AIFS 公式块）**与那 6 µs 信号扩展**（`@amp-ppdu` 的字段表与公式）。**DIFS 28 µs、AckTimeout 39 µs、EIFS 88 µs 一门课也没有**（`grep -rn '39 µs' src/course/` 零命中）。`@amp-coexist`、`@amp-ppdu` |
| 2.4 GHz 的信号扩展进入 PPDU 时长（§18.3.2.4） | 已发布 · 802.11-2024 | 已建模 | `engine/simulation.ts#timingFor` 给 `'2g'` 发 `ERP_2G`，`signalExtNs` 计入每一帧。`@amp-ppdu` |
| 一台 Wi-Fi 站点运行在 2.4 GHz 上（`linkId: '2g'`） | 已发布 · 802.11-2024 | 已建模 | `model/caps.ts#nodeLinks`、`model/caps.ts#linkPlanFor`，编辑器 `FloorPlanEditor.tsx` 有下拉框。**引擎建了，无课**——256 个课程场景里有 4 个把 `sta` 放到 `'2g'` 上，全是 `@amp-coexist` 的那台摄像头，**而那一课把它当干扰源教，从不当一条 2.4 GHz Wi-Fi 链路教**（DIFS、AckTimeout、EIFS、带宽上限、频段损耗差那几个数一个也没讲）。这是「有课提过 ≠ 有课教」的一格，所以这一行**同时**带课号与那六个字；计数表下面有一句说明。`@amp-coexist` |
| 2.4 GHz 的带宽上限 40 MHz | 已发布 · 802.11-2024 | 已建模 | `model/caps.ts#widthOf` 里 `link === '2g' ? 40 : 320`。**引擎建了，无课**。 |
| 频段之间的路径损耗差 | 标准不规定 | 已建模 | `engine/simulation.ts#LINK_EXTRA_LOSS_DB`：2.4 GHz **−6.5 dB**、5 GHz 0、6 GHz **+1.2 dB**，**三个数都是本仿真器选的**。**三个数都被课程点到过名，而没有一个在主路径上**：6 GHz 的 +1.2 dB 在 `@radio-primer` 的 `deeper` 与 `sources` 里，2.4 GHz 的 −6.5 dB 在 `@mlo-gain` 的 `limits` 里（那条 `unmodelled` 还说明了它为什么是个常数而真实频段差随距离与墙变）。`@radio-primer`、`@mlo-gain` |
| 第 15 章 DSSS 与第 16 章 HR/DSSS | 已发布 · 802.11-2024 | 未建模 | **范围决定。** 1/2/5.5/11 Mb/s 与它们的扩频波形不在这个引擎的粒度上；它带来的真正后果（混合 BSS 的保护机制）另记一行。 |
| ERP 保护机制（§10.27 的非 ERP 保护、CTS-to-self） | 已发布 · 802.11-2024 | 未建模 | **未偿的债**，标准对齐程序的 D 项。引擎有 CTS-to-self 的材料（AMP 那一侧的 `protection: 'ctsSelf'`），但没有「房间里有一台旧设备，于是全场都要先发保护帧」这条规则。 |
| 第 17 章那 400 ns 的短保护间隔（§19.3.5、Table 19-27 的 NOTE） | 已发布 · 802.11-2024 | 未建模 | **范围决定**，而且理由写在代码里：`engine/phy.ts#PHY_MODES.nonht` 的注释引 §19.3.5 与 Table 19-27 的 NOTE——收发两侧都是可选，而 HE/EHT 那三个保护间隔是强制的，**这一刀只建强制的那一套**。 |

## 六、HT / VHT / HE / EHT 的物理层参数（§19、§21、§27、be §36）

| 特性 | 标准依据 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 四个世代与它们的前导码（§21.3.8、§27.3.9、be §36.3.10） | 已发布 · be-2024 | 部分建模 | `engine/phy.ts#PHY_MODES` 的 `preambleNs`：20 / 40 / 44 / 48 µs。**44 与 48 是 Table 27-13 / 36-18 逐项相加后向上取整**（43.2 与 47.2），所以是「≈」不是「=」，代码注释自己说明了；**包扩展（packet extension）没建**。`@frame-anatomy-bytes`、`@airtime` |
| MU PPDU 多出来的 SIG-B / EHT-SIG（§27.3.9、be §36.3.10） | 已发布 · be-2024 | 已建模 | `engine/phy.ts#PHY_MODES.he/eht` 的 `muExtraPreambleNs` = 4 000。`@ofdma-dl` |
| 数据字段的 DFT 周期与一个符号的长度（Table 27-13 / Table 36-18） | 已发布 · be-2024 | 已建模 | `engine/phy.ts#TDFT_EHT_NS` = 12 800、`engine/phy.ts#symNsFor`；基础档下恰等于 `PHY_MODES[*].symNs` = 13 600。`@airtime` |
| 数据字段的三个保护间隔（§27.1.1 / be §36.1.1，TXVECTOR 的 GI_TYPE） | 已发布 · be-2024 | 部分建模 | `engine/phy.ts#TGI_NS` = { base: 800, double: 1 600, quad: 3 200 }，而 `model/scenario.ts#GuardIntervalCfg` **只收 `double` 与 `quad`**：`base` 被 schema 明确拒掉，因为它逐字节等于不写这一节。**`'quad'` 有课（`@airtime` 的一个变体）；`'double'` 一个课程场景也没有**——`grep` 全部 256 个场景，`guardInterval.gi === 'double'` 零命中。所以这一行是「半个合法取值没课」。`@airtime` |
| 4x LTF 跟着四倍保护间隔一起变长（§26.7.5 / be §35.7.5） | 已发布 · be-2024 | 已建模 | `engine/phy.ts#TLTF_2X_NS` = 6 400、`engine/phy.ts#TLTF_4X_NS` = 12 800、`engine/phy.ts#ltfExtraNs` = 8 800 ns；**引擎永不发出「3.2 µs 保护间隔配 2x LTF」这一组**。`@airtime` |
| 空间流越多 LTF 越长（§19.3.9.4.6 HT-LTF definition、be §36.3.12.10 EHT-LTF，Table 36-43 给 1/2/4/4） | 已发布 · be-2024 | 未建模 | **未偿的债**，标准对齐程序的 F 项（「per-stream LTFs」）。`engine/phy.ts#preambleNsFor` 根本没有流数这个参数，于是四流的前导码和一流一样长。**但这个 departure 已经在课上了**：`@streams` 的主路径两处说它（「流数越多它就越长」与「无论跑几条流，前导码都按同样的方式发出去，所以它从不变短」），`sources` 还引了 Table 36-43 的 1、2、4、4。**所以这一行是债，不是洞**——课文诚实，引擎欠着。`@streams` |
| 每个带宽的数据子载波数（Table 27-? / Table 36-?） | 已发布 · be-2024 | 已建模 | `engine/phy.ts#toneRatio` 背后两张表：HE/EHT 20→234、40→468、80→980、160→1960、320→3920；VHT 20→52…160→468。**所以 80 MHz 比四个 20 MHz 多**，保护带不重复。`@width` |
| 每一级 MCS 的每符号比特数与灵敏度（Table 27-86 / Table 36-76） | 已发布 · be-2024 | 已建模 | `engine/phy.ts#PHY_MODES` 的 `ndbps` / `sensDbm`：HE 12 级、EHT 14 级（4096-QAM 的 MCS 12/13 灵敏度 −49 / −46 dBm）。`@mcs-ladder`、`@rate` |
| 4096-QAM 作为一项能力开关（be §36） | 已发布 · be-2024 | 已建模 | `model/caps.ts` 的 `qam4k` 特性位，`GEN_FEATURES.eht` 独有；`model/presets.ts` 给苹果那几台**关掉**它，理由写在预设注释里（苹果公布的 2400 Mb/s 对应 MCS 11）。`@mcs-ladder`、`@streams` |
| 带宽 20/40/80/160/320 与世代上限（§21、§27、be §36） | 已发布 · be-2024 | 已建模 | `model/caps.ts#MAX_WIDTH`：nonht 20、vht 160、he 160、eht 320；`model/caps.ts#negotiatedWidth` 取两端较窄。**40 MHz 与 320 MHz 各只有一两门课碰到**（40：`@width`、`@selectivity`；320：只有 `@selectivity`）。`@width` |
| 空间流 1…4（§19.3.? 的 N_SS） | 已发布 · 802.11-2024 | 已建模 | `model/caps.ts#Nss`、`model/caps.ts#negotiatedNss` 取两端较小。**3 流在 256 个课程场景里一次也没出现过**（只有 1、2、4）——这一条小，但它就是「合法而没人演示」。`@streams` |
| 混合 HE/EHT 的下行 MU PPDU 里 EHT 成员降到 MCS ≤ 11（§26.5） | 已发布 · 802.11-2024 | 已建模 | 标准对齐 A1：全员都是 EHT 才发 `eht` 格式，否则发 `he` 并把 EHT 成员的 MCS 夹到 11。`@ofdma-dl` |
| LDPC（§10.15）与 STBC（§10.16） | 已发布 · 802.11-2024 | 未建模 | **范围决定。** 这个引擎的解调判决是一个门限，没有编码增益这一维；`grep -ri 'ldpc\|stbc' src/engine src/model` 零命中。 |
| 信噪比到误包率的曲线（标准只给灵敏度，不给曲线） | 标准里查不到 | 未建模 | **未偿的债**，而且是标准对齐程序 B 项与第三阶段（今天叫「频段与物理层保真度」）共有的那一条：`engine/phy.ts#reqSinrDb` 是一个**硬门限**，不是 PER 曲线。零到一百的课程设计（`2026-09-18-zero-to-hero-curriculum-design.md` 的 Tier 3）写明这条要「from our own generated link-level tables」——也就是我们自己生成，标准里没有。**查了什么**：802.11-2024 全文检索 `channel model` 只 4 页，唯一写成模型的是 §19.3.12.1 的波束成形信道式 (19-62)，逐子载波给出；`delay spread` 只 3 页，全是保护间隔那同一句话（这一条的查证在 `docs/superpowers/specs/2026-10-03-multipath-design.md` §1.2）。 |

## 七、下行与上行的多用户（§26.5、be §35）

| 特性 | 标准依据 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 下行 OFDMA（§26.5.1） | 已发布 · 802.11-2024 | 部分建模 | 建的是「一次发送分给几台设备、各占一份带宽」：`engine/mac.ts` 的私有方法 `buildMuParts`（`mumimo` 为 false 的那一支，成员那一份是 `ruFraction = 1/n`）。**没建的是真正的离散资源单元表与打孔**——成员那一份是一个分数而不是一个 RU 索引。`@ofdma-dl`、`@ru-diversity` |
| 触发帧与触发式上行（§26.5.2、§9.3.1.22） | 已发布 · 802.11-2024 | 部分建模 | `engine/phy.ts#triggerBytes` = 28 + 6n；§10.3.2.9 的响应超时建了（触发末尾 + 45 µs）。**没建的是 BSRP/BSR 与上行功控**：接入点读的是 `model/scenario.ts` 里那个站点侧的积压替身，不是空口上报的缓冲状态。`@ofdma-ul` |
| 被触发之后恢复 EDCA 时不动 CW、不动退避计数 | 已发布 · 802.11-2024 | 已建模 | 标准对齐 A9。`@ofdma-ul` |
| 触发帧要过 NAV 与载波侦听（§10.3.2.9、§26.2.?） | 已发布 · 802.11-2024 | 已建模 | 标准对齐 A10：第三方设的 NAV 不会被触发帧清掉，站点此时沉默。`@ofdma-ul` |
| 下行 MU 的部分成功（标准对齐 A8） | 已发布 · 802.11-2024 | 已建模 | 只要有一个成员确认，这次交换就算成功：CW 复位、TXOP 可以继续；没确认的成员各自走重传。`@ofdma-dl` |
| MU-MIMO 分组（§26.5.3） | 已发布 · 802.11-2024 | 部分建模 | `engine/mac.ts` 的私有方法 `buildMuParts`（`mumimo` 为 true 的那一支）加 `fitsStreams`：成员数按接入点的流数装得下为止，装不下就逐个砍。**没建的是探测代价**（NDP sounding，§26.7）与 VHT MU-MIMO。`@mumimo`、`@mumimo-choose` |
| 探测 PPDU 与 NDP 探测（§10.30、§10.35、§26.7） | 已发布 · 802.11-2024 | 未建模 | **未偿的债**，标准对齐程序的 F 项。MU-MIMO 在这里是免费的，而真实设备每一轮要付一次探测的空口时间——这正是 `@mumimo-choose` 那个「按频率还是按空间」的选择在现实里真正的天平。 |
| 发射波束成形（§10.33）、天线选择（§10.34） | 已发布 · 802.11-2024 | 未建模 | **范围决定。** 引擎里一对节点之间只有一个电平数（`engine/propagation.ts#buildLinkTable`），没有信道矩阵，也就没有可成形的东西。已写进 `@streams` 的 `limits`。 |
| 多链路操作（be §35.3） | 已发布 · be-2024 | 部分建模 | 建的是同时收发的那一种：5 GHz + 6 GHz 两台电台，一条队列（`model/caps.ts#nodeLinks` 对有 `mlo` 的设备返回 `['5g','6g']`，`model/caps.ts#virtualId` 给每条链路一个 MAC 实例）。**没建的是 EMLSR / NSTR 与 TID-到-链路映射**。`@mlo`、`@mlo-gain` |
| EMLSR（单电台在两条链路上侦听，be §35.3.17） | 已发布 · be-2024 | 未建模 | **未偿的债**，标准对齐程序的 F 项。手机真正在做的就是这一种，而引擎建的是同时收发那一种——已写进 `@mlo` 的 `limits`（标准对齐 A18）。 |
| 6 GHz 的信道编号与中心频率（§27 的 6 GHz 信道化） | 已发布 · 802.11-2024 | 已建模 | `model/scenario.ts#sixGhzChannelNo`（(中心 − 5950)/5）、`model/scenario.ts#DEFAULT_SIX_GHZ_CENTER_MHZ` = 5985（信道 7，80 MHz）、`model/scenario.ts#SIX_GHZ_GATE_MIN_WIDTH_MHZ` = 160。**引擎建了，无课**——`Scenario.sixGhzCenterMhz` 在 Wi-Fi 侧 256 个场景里零命中，只有五门 UWB 课设它（当共存干扰源用）。 |

## 八、传播、衰落与频率选择性（标准不规定的那一半）

| 特性 | 标准依据 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 室内对数距离路径损耗 | 标准不规定 | 已建模 | `engine/propagation.ts#PL0_DB` = 46.7（5.2 GHz 一米自由空间）、`engine/propagation.ts#PL_EXP` = 3.0，**两个数都是本仿真器选的**。`@radio-primer` |
| 逐墙衰减与门窗开口 | 标准不规定 | 已建模 | `engine/propagation.ts#WALL_LOSS_DB`：石膏板 5、砖 12、玻璃 3 dB，**三个数都是本仿真器选的**；`engine/propagation.ts#wallsCrossed` 让开口豁免整堵墙。三个数在 `@radio-primer` 的一条 `model-value` 与 `sources` 里都点了名，**而玻璃墙在 256 个课程场景里一次也没出现过**（54 门 Wi-Fi/AMP 课全部用砖墙，石膏板只有 `@capstone` 一门）；读者唯一能动它的地方是 `@noise-floor` 的链路预算挂件里那个缺省为 0 的滑块。`@radio-primer`、`@noise-floor` |
| 对数正态阴影与它的相干时间 | 标准不规定 | 已建模 | `engine/fading.ts#FADING_DEFAULTS`：σ 4 dB、相干时间 100 ms，**都是本仿真器选的**（注释说明室内测量常见 3–8 dB，这里取中间一个数而不是声称某次测量）。`@fading` |
| 小尺度衰落：Rayleigh 与 Rician | 标准不规定 | 已建模 | `engine/fading.ts#smallScaleDb`、`engine/fading.ts#RICIAN_K_DEFAULT_DB` = 6（`model`）。**缺省是 Rayleigh**，因为它是悲观那一侧。`@fading`、`@rate-fallback` |
| 频率选择性：按 26 音调资源单元分格 | 已发布 · 802.11-2024（分格单位） + 标准不规定（每格的起伏） | 已建模 | `engine/selectivity.ts#RU26_TONES` = 26、`engine/selectivity.ts#RU26_PER_20MHZ` = 9、`engine/selectivity.ts#DF_EHT_KHZ` = 78.125；`engine/selectivity.ts#selEffSinrDb` 按容量合成一个等效信噪比。记录 `WIFI_SEL`。`@selectivity`、`@ru-diversity` |
| 频率选择性只在 HE/EHT **链路**上成立 | 已发布 · 802.11-2024 | 已建模 | `model/scenario.ts#selectivityRefusals`：26 音调是第 27/36 章的单位，只在 78.125 kHz 子载波间隔下成立，所以「旧路由器 + 新笔记本」这样的配对被拒而不是悄悄什么都不做。**这是 `docs/inert-config-contract.md` 的样板之一。** `@selectivity` |
| 时延扩展与符号间干扰 | 标准里查不到 | 未建模 | **范围决定**，而且理由是算出来的：`docs/superpowers/specs/2026-10-03-multipath-design.md` §1.1 量出判决门槛是 c × GI = 239.83 m（0.8 µs 档），**而这个编辑器画得出的任何房间都给不出 240 米的额外路程**。所以 Wi-Fi 侧的回波永远落在保护间隔之内，永远不改变解调判决。**查了什么**：802.11-2024 全文 `frequency selectiv*` 0 处、`coherence bandwidth` 0 处。 |
| Wi-Fi 侧的散射体与感知 | 已发布 · 其他修正案（802.11bf-2025 §9.4.1.81、§11.55） | 未建模 | **范围决定**，`docs/superpowers/specs/2026-09-29-sensing-design.md` §9 原话：Wi-Fi 侧不加散射体。`engine/scatter.ts` 是 UWB 那一侧的（`@uwb-sensing`）。 |
| 跨技术频谱耦合（Wi-Fi 6 GHz ↔ UWB） | 标准里查不到 | 已建模 | `engine/spectrum.ts#Spectrum`、`engine/spectrum.ts#wifiToUwbPathLossDb`、`engine/spectrum.ts#bandOverlapMhz`；门控时把带宽放宽到至少 160 MHz 以免假阴性。**查了什么**：两部标准都不规定另一方的干扰模型。`@uwb-coexist`（UWB 侧）；**Wi-Fi 侧无课**。 |

## 九、业务、队列与云端（标准之外）

| 特性 | 标准依据 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 发送队列的深度上限与 MSDU 生存期 | 已发布 · 802.11-2024（dot11MaxTransmitMSDULifetime 的概念） + 标准不规定（取值） | 已建模 | `engine/queues.ts#DEFAULT_QUEUE_LIMIT` = 500、`engine/queues.ts#DEFAULT_MSDU_LIFETIME_NS` = 500 ms（**两个数本仿真器选的**）；记录 `DROP.reason` 分 `'queueFull'` / `'lifetime'`。`@queues`、`@retries-queues` |
| 九个业务档 | 标准不规定 | 已建模 | `model/scenario.ts#PROFILE_IDS`：video / voice / gaming / p2pvideo / backup / browsing / iot / saturated / idle。**九个档现在全部至少被一门课加载过**——`gaming` 那一个 2026-10-05 才补上（`@wan-rtt`、`@edca-tamper`）。`@edca`、`@roles-stack` |
| 站点到站点经接入点转发 | 已发布 · 802.11-2024（§10.2 的 DS） | 已建模 | `model/scenario.ts` 的 `NodeCfg.p2pTarget` 配 `p2pvideo` 档。`@relay-hops`、`@roles-stack` |
| 云端服务器：单向时延、抖动、处理时间 | 标准不规定（完全在 802.11 之外） | 已建模 | `model/scenario.ts#DEFAULT_SERVERS` 四个端点（RTT 20 / 12 / 40 / 25 ms，**都是本仿真器选的**）；记录 `WAN_TX` / `WAN_RX`，视图里是 `stats.appRtt`。`@wan-rtt` |
| 四种服务器端点各自的取值 | 标准不规定 | 部分建模 | 机理只有一套（固定单向时延 + 均匀抖动 + 处理时间），四个 kind 只是四组数。**只有 `game` 被课程加载过**：`video` / `web` / `call` 在 256 个场景里零命中（七个编辑器家庭预设里有）。`@wan-rtt` |
| 每 250 ms 一次的 ping 回声，用来量应用往返 | 标准不规定 | 已建模 | `engine/traffic.ts` 的 `schedulePing` / `PING_PERIOD_NS`——**这就是一款游戏的 ping 计数器量的那个数**。`@wan-rtt` |

## 十、作弊目录（§9.4.2.27 的 EDCA 参数集与相关条款）

| 特性 | 标准依据 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 七种偏离广播 EDCA 参数的篡改驱动 | 已发布 · 802.11-2024 | 已建模 | `model/scenario.ts#TAMPER_KINDS` = escalate / aifs / cw / noDouble / txopHog / navInflate / greedy，预设在 `model/scenario.ts#TAMPER_PRESETS`；`engine/mac.ts#effectiveParams` 把它们叠到基准参数上。**七种全部有课**（`@edca-tamper` 的七个变体）。`@edca-tamper` |
| 其中三种在某些合法链路上一个字段也读不到 | 已发布 · 802.11-2024 | 已建模（并且被 schema 拒掉） | `model/scenario.ts#driverRefusalsFor`：传统 DCF 链路上 `aifsn` / `allAsAc` / `txopLimitUs` 读不到，而 `cwMin`/`cwMax`、`noDoubling`、`navInflateUs` 照样有效。**判据是「读不到」而不是「效果小」**（`docs/inert-config-contract.md` 第三步）。`@edca-tamper` |
| 《篡改驱动》那份中文报告 | 标准不规定 | 已建模 | `scripts/tamper-report.ts` → `docs/reports/`。`@edca-tamper` |
| 路线图里另外八种作弊（NAV 失聪、CCA 失聪、不做发后退避、无限重传、伪造 CTS-to-self 时长、超功率、无视 MU EDCA、拒绝走触发式上行） | 已发布 · 802.11-2024 | 未建模 | **未偿的债**，`docs/superpowers/specs/2026-09-10-wifi7-coverage-roadmap.md` 的「模块 7」原样列着它们。最后三种要等 MU EDCA 与 EMLSR 先建出来。 |

## 十一、AMP（P802.11bp）那一块里建了而没课的

AMP 的五门课挂在 Wi-Fi 第二阶段的 M10 下，所以它在这张表里。
**这一节曾是本次普查里最大的一处空洞，而它此前没有被任何文档记下过。**
**2026-10-05（切片 W5）补上了第五门课 `@amp-backscatter`**，于是这一节七行里的四行换了裁定。

核法：遍历全部课程场景，查 `nodes[*].ampTag?.mode === 'backscatter'` 与
`nodes[*].ampAp?.backscatter`；再把每个场景跑 5 000 ms，统计记录类型。
**写作当天两个计数都是 0，五种反向散射记录类型在 251 个场景上一条也没有出现过。**
**重跑（256 个场景，W5 之后）：两个计数都是 5，就是那一课的基础场景与它的四个变体；
五种记录类型在这 5 个场景上一共 7 943 条（`AMP_BS_BOOT` 2 710、`AMP_BS_REPLY` 1 933、
`AMP_RFID` 1 483、`AMP_BS_COUNTER` 1 300、`AMP_INVENTORY` 517），别的 251 个场景仍然是 0。**
这五种记录现在也都走过 `model/view.ts#applyRecord` 与 `ui/format.ts#fmtRecord`，
由 `tests/course/amp-backscatter.test.ts` 逐种钉住——那是 W5 的前置检查，而它过了。

| 特性 | 标准依据 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 主动发射（Active Tx）标签的轮询轮：触发、随机接入相位、调度相位 | 已发布 · 其他修正案（P802.11bp 草案，11-26/1519r5、11-26/1889r4） | 已建模 | `engine/ampAp.ts`、`engine/ampSta.ts`；记录 `AMP_ROUND` / `AMP_SLOT` / `AMP_ABOC` / `AMP_RESULT`。`@amp-intro`、`@amp-ppdu`、`@amp-slots` |
| AMP 的轮固定在 AC_BK 上与 Wi-Fi 竞争 | 已发布 · 其他修正案（PAR） | 已建模 | `@amp-coexist` |
| **反向散射标签（没有发射机，靠反射读写器的激励）** | 标准不规定（EPC Gen2 不是 IEEE 文档） | 已建模 | `model/scenario.ts#AmpTagMode` 的 `'backscatter'`、`model/scenario.ts#DEFAULT_AMP_BS`、`engine/ampBs.ts`（282 行）、`engine/ampBsSta.ts`（248 行）、`engine/ampReader.ts`（348 行）。`@amp-backscatter` |
| EPC Gen2 的清点轮：Q 个时隙取 2^Q、Select/Query/QueryRep、碰撞与空槽 | 标准不规定（EPC Gen2） | 已建模 | 记录 `AMP_RFID`（带 `Gen2Cmd`）、`AMP_BS_COUNTER`、`AMP_BS_REPLY`、`AMP_INVENTORY`（`slotsOffered` / `read` / `collisions` / `empties` / `complete`）。`@amp-backscatter`（那一课的一秒钟：40 个槽、23 读到、9 读不出、8 空） |
| 标签的上电门限与唤醒前导 | 标准不规定（11-25/0307r0 的 PEX_C/PEX_B） | 已建模 | `DEFAULT_AMP_BS`：`chargeDbm` 10、`bsDbm` 0、`wupMs` 1；记录 `AMP_BS_BOOT`（`powered` / `incidentDbm`）。`@amp-backscatter`（上电距离 0.309 m 对读得到的 0.328 m，两条线差不到 2 cm） |
| 清点成功之后跟一次 Read / 一次 Write | 标准不规定（EPC Gen2） | 已建模 | `DEFAULT_AMP_BS` 的 `read: true` / `write: false`（注释：一次 Write 要 3 ms 空口）。`@amp-backscatter`，**而它同时钉住了一条「允许但空转」**：`write: true` 在缺省的 `txopMs: 4` 下逐条记录与 `write: false` 完全相同（一帧 Write 的 PPDU 2 964 µs，排不进 4 ms），改到 `txopMs: 10` 就排进去了，所以按 `docs/inert-config-contract.md` 第二、三步**钉住而不是拒掉** |
| 两层标签共用一个读写器时轮流 | 标准不规定 | 已建模 | `engine/mac.ts` 的 `AmpTiers` 与 `pollsTaken`。**引擎建了，无课。** |
| 读写器的两种读法 `readMode: 'inline' \| 'twoPhase'` | 已发布 · 其他修正案（P802.11bp 草案） | 已建模 | `model/scenario.ts#AmpApCfg` 的 `readMode`。`@amp-slots`（用到了这个字段） |

## 十二、读者会合理期待、而我们决定不建的

**这一节只列读者会问的**，每条一句理由。它不是标准目录的影子。

| 特性 | 标准依据 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 信标、TIM/DTIM、扫描（§11.1） | 已发布 · 802.11-2024 | 未建模 | **范围决定（现在）/ 未偿的债（按原计划）。** 零到一百的设计把它排在 Tier 2 的 M5 与 S5 这一刀上，所以它是**未偿的债**；`grep -ri 'beacon' src/engine src/model` 零命中，一个站点一开始就「已经连上了」。这一条与下面四条是标准对齐程序的 **E** 项。 |
| 认证与关联（§11.3） | 已发布 · 802.11-2024 | 未建模 | **未偿的债**，E 项。同上。 |
| 安全：WPA2/WPA3-SAE、四次握手、PMF（§12） | 已发布 · 802.11-2024 | 未建模 | **范围决定。** 这个引擎建的是「谁在什么时候发了多长的包」，不是比特、不是密钥——和 UWB 侧不建 STS 的理由完全相同。它改变的空口量只有帧长（CCMP 的 16 字节开销），而那一个数可以在课文里直接说。已记进 `@frame-anatomy` 的那条「六个比特恒为 0」的 `unmodelled`，连同一句读者该知道的话：真实住宅里几乎每一帧都是受保护的。`@frame-anatomy` |
| 漫游 802.11k/v/r（§11.11、§13） | 已发布 · 802.11-2024 | 未建模 | **范围决定。** 一个场景只能有一个接入点——`model/scenario.ts` 的 `ScenarioSchema.superRefine` 明确拒绝两个（「场景必须正好有一个 AP」）。没有第二个 BSS 就没有可漫游的去处。 |
| 省电：PS-Poll、U-APSD（§11.2） | 已发布 · 802.11-2024 | 未建模 | **未偿的债**，E 项。路线图原话：一部轻载的手机在真实家庭里最大的时延来源就是省电，而它的缺席正是「轻载家庭」那个场景除了 WAN 时延什么也看不到的原因。已记进 `@frame-anatomy` 的那条「六个比特恒为 0」的 `unmodelled`（电源管理与更多数据这两位）。`@frame-anatomy` |
| 目标唤醒时间 TWT 与受限 TWT（§10.46、§26.8） | 已发布 · 802.11-2024 | 未建模 | **未偿的债**，E 项。受限 TWT 是 Wi-Fi 7 自己给游戏开的低时延答案，而 `@wan-rtt` 现在量出的那条「空口只占千分之四」正是它要改的那个数。 |
| 第二个 BSS、BSS 颜色、空间复用、OBSS-PD（§26.10） | 已发布 · 802.11-2024 | 未建模 | **未偿的债**。路线图原话：单 BSS 是这个引擎最大的结构性简化，而在一间公寓里邻居的接入点才是主导干扰源。schema 层面是一条硬拒绝（上面那一行），所以这一刀要先改 schema。 |
| 每 20 MHz 的 CCA 与主/辅信道（§26.?） | 已发布 · 802.11-2024 | 未建模 | **未偿的债**，与上一行同一刀。现在 CCA 是整条链路一个判决。 |
| 空口公平（airtime fairness） | 标准不规定（厂商特性） | 未建模 | **未偿的债**。它是唯一一个能部分抵挡贪心站点的商用特性，而 `@edca-tamper` 刚刚量出七种作弊的后果——「厂商拿什么挡」是这门课的自然下一问。 |
| 802.11bn（Wi-Fi 8） | 已发布 · 其他修正案（尚未发布；语料库里有 TGbn 的 2761 份文稿） | 未建模 | **范围决定（现在）。** 它是零到一百设计里 Tier 4 的第一项，而**它的前提是成立的**：`D:/ai_patent_experiments/.claude/skills/wifi_patent_skill/references/wifi8_tgbn/` 下 `text/` 与 `toc/` 各 2761 个文件，另有 `catalog.json`、`inverted_index.json`、`key_documents.json` 与七张抽出的表。详见「十五、第三阶段与第四阶段」。 |
| 802.11bk（范围测量）、802.11bh（标识符） | 已发布 · 其他修正案（bk-2025、bh-2024，两者语料库里都有全文） | 未建模 | **范围决定。** 802.11 的测距与 UWB 的测距是同一个题目的两种做法，而本仓库的测距那一条线整个长在 UWB 上（33 门课）。在 Wi-Fi 侧再建一遍，换来的是一个对照，不是一个新机理——而那个对照可以用课文说。 |
| 第 15/16/20/22/23/24/25/28/29/30/31/32/33/34 章的各个物理层与 MAC | 已发布 · 802.11-2024 | 未建模 | **范围决定。** DSSS、HR/DSSS、DMG、TVHT、S1G、CDMG、CMMG、EDMG、WUR、NGV、LC、增强广播。读者在家庭 Wi-Fi 里一个也遇不到；其中 DSSS 唯一有后果的那一半（混合 BSS 的保护）已在第五节单列一行。 |
| MLME / MAC 服务原语与 PIB 属性（§6、§11） | 已发布 · 802.11-2024 | 未建模 | **范围决定。** 和 UWB 侧完全相同的理由：这个仿真器没有分层的服务接口，场景直接构造设备。 |
| 网格（§14、§10.24、§10.37） | 已发布 · 802.11-2024 | 未建模 | **范围决定。** 一个 BSS，一个接入点。 |

## 十三、与仓库现有说法的冲突

写这张表时查出七处。第 1、2、5、6 条是仓库自己的说法与实情不符，
第 3 条是**我第一稿写错而被自己的核查抓回来的**（留着，因为它是这类工作最容易犯的错），
第 4、7 条是对下达给我的 brief 的更正。

**1. `@edca` 那句「内部碰撞一次也没触发」的理由是错的，而且那个「没触发」只在读者看的那个时间窗里成立。**

`src/course/tier2/edca.ts:108` 的主路径上写着：「本场景里每台站点只跑一类流量，所以这一步一次也没触发。」

量出来的是：`@edca` 的基础场景在 **362.643 ms** 跑出一条 `INTERNAL_COLLISION`，
节点是 **`ap`**，胜者 AC 3（VO）、败者 AC 1（BE）。
`tests/course/edca.test.ts` 的 `RUN_NS` 是 300 ms，所以**那句话在读者实际看到的那一轮里是真的**——
但它给出的**理由**是假的：真正的理由是**时间窗**，而主角是**接入点**。
接入点自己不跑业务档（它是 `['idle']`），但它要替三台站点各自的下行腿排队，
于是它手里同时有 VO、BE、BK 三条队列——而那正是内部碰撞需要的全部条件。

重跑：

```bash
# 建一个 scratchpad 脚本，构造 LESSONS 里 'edca' 的 scenario()，
# 跑 1000 ms，筛 type === 'INTERNAL_COLLISION'，打印 t / node / winnerAc / loserAc
npx vite-node --root <worktree> <scratchpad>/ic.ts
```

**这不是一句话的笔误，是「站点」与「接入点」这个区分丢了。** 修法有两种：
把句子改成说时间窗与接入点，或者把运行时长拉到 400 ms 以上让读者真的看见一条。
**后者更好**，因为内部碰撞是这门课讲的东西，而现在它讲完了却给不出一条记录。
记成 `docs/wifi-course-backlog.md` 的切片 W1。

**2. `tests/course/readability.test.ts` 里那个主路径字数是旧的：写着 188 317，实测 188 798。**

那条断言本身是一个区间（> 170 000 且 < 190 000），所以**没有变红**，
但它 docblock 里的「188 317 on 2026-10-05」已经被 `b22dec2`（第 35 课补机理）推走了 481 字。
**而这正是那个注释自己预言过的事**——它上一次就是因为停在 179 872 没人重测而被发现的，
当时它写「the next module to land will reach it」。
**同一个注释在同一天内第二次过期**，所以这不是偶然，是这条断言的形状不对：
一个带着手写数字的区间，必然比它描述的那个数先老。
记成切片 W0 的一部分（判据换成什么，见 backlog）。

重跑：

```bash
npx vite-node --root <worktree> <scratchpad>/census.ts
# 实测 2026-10-05：188 798 字，距 190 000 还剩 1 202；分钟数合计 1 825（与断言相等）
```

**3.（这一条是我自己第一稿写错的，留着，因为它是这张表最容易犯的那种错。）**

第一稿在这里写：「`@streams` 的 `limits` 漏了『前导码不随流数变长』这一条」，
理由是 `engine/phy.ts#preambleNsFor` 没有流数这个参数（这半句是对的）。

**那条结论是错的。** 去 `grep -n '前导码' src/course/tier2/streams.ts` 就看得到三处：
主路径上一处说标准那一侧（「前导码（preamble）里有专为此而发的已知图样，流数越多它就越长」），
另一处说引擎这一侧（「无论跑几条流，前导码都按同样的方式发出去，所以它从不变短」），
`sources` 里还引了 IEEE Std 802.11be-2024 §36.3.12.10 与 Table 36-43 的 1、2、4、4。
**这个 departure 在主路径上、带着出处，比写进 `limits` 更好。**

**我是怎么错的**：我读的是 `limits` 那四条，看它们说的是发射功率、信道矩阵与降档策略，
就断定前导码这一条「没记」。**我查的是一个字段，不是一门课。**
这正是「怀疑量它的那把尺子」那一条——而这次的尺子是「我查了哪里」，
和 UWB 那份文档第 17 节第 4 条犯的是同一个错，形状一模一样。

**后果**：那一行在本表第六节现在写成「债，不是洞」；切片 W1 相应地**少一条任务**。

**4. 对 brief 的更正（一）：「全仓库没有任何地方写过第三、第四阶段该装什么」——这条不成立。**

`docs/superpowers/specs/2026-09-18-zero-to-hero-curriculum-design.md` 里有两节标题就是
**「Tier 3 — PHY (the layer underneath)」** 与 **「Tier 4 — Researcher」**，
各列七条与六条，**而且还有一张交付路线图把它们排成 S7 与 S8 两刀**。
brief 说「`docs/` 下只有四份文档，Wi-Fi 侧一份覆盖表都没有」——
**「没有覆盖表」是对的**（这份就是补它），**「没有人写过这两个阶段该装什么」是错的**。
找法：`grep -n '阶段\|Tier 3\|Tier 4' docs/superpowers/specs/2026-09-18-zero-to-hero-curriculum-design.md`。

这条更正改变结论：下面第十五节不是在凭空设计两个阶段，**是在审一份已经存在的清单**。

**5. `src/course/curriculum.ts` 指名的那个测试文件不存在。**

`COURSE_ORDER` 上面那段 docblock 写着：

> `tests/course/curriculum.test.ts` parses these very lines out of this file and checks all three
> against the lessons.

**`ls tests/course/ | grep curric` 零命中。** 那份检查确实存在，但它在
**`tests/course/lessons.test.ts:589-602`**（`/^\/\/ M(\d+) · tier (\d+) · (.+)$/`）。

这不是「检查没做」，是**注释指错了门**，而那段注释恰好是 2026-10-04 为了
「让这个分组注释变成可核对的」而写的——**一段讲「不要留下没人能核的注释」的注释，
自己留下了一个核不到的文件名。**
**2026-10-05 已改（切片 W0）**：那段注释现在指 `tests/course/lessons.test.ts`，
并且点的是那个 suite 的名字而不是行号——行号和这张表里的符号名一样会腐烂。

**6. 标准对齐 A 规格的 A1 项点名的两个函数今天不存在。**

`docs/superpowers/specs/2026-09-17-standard-alignment-a-correctness-design.md` 的 A1 写
「`buildOfdmaParts` and `buildMumimoParts` label the PPDU `he` once any member is HE」。
`grep -n 'buildOfdmaParts\|buildMumimoParts' src/engine/mac.ts` **零命中**：
今天只有一个私有方法 `buildMuParts(ei, dsts, mumimo, durCap, ac)`，用一个布尔参数分两支。

**行为在**（A1 的修正本身是生效的），**名字不在**。
这正是一份休眠规格会怎样腐烂——而它也说明了为什么覆盖表的 `#` 形引用值得被测试钉住：
**我第一稿就是照 A 那份规格抄的这两个名字，而它们已经假了不知道多久。**
**2026-10-05 已改（切片 W0）**：A1 现在写出今天那个私有方法的名字与签名，并说明只有名字动过、
行为没动。**它仍然不能写成 `#` 形**，因为私有方法那个测试查不到——所以 A1 自己带着那句指路。

**7. 对 brief 的更正（二）：基线不是 `b22dec2`，是 `67dabf8`。**

`git log --oneline -1` 给 `67dabf8`（「那个 WMI 查询不是『太慢没返回』」，一笔文档提交），
`b22dec2` 是它的父提交。两者的差异是 `docs/` 下一个文件，不动 `src/` 也不动 `tests/`，
**所以这张表里每一个数都不受影响**；记在这里只是因为「基线是哪一笔」这件事以后会被引用。

## 十四、「引擎建了，无课」的九条，汇总

这是这张表真正的产出。按「建出来有多大一块」排，不按条号。

**从十三条降到九条：切片 W5（2026-10-05）那一门 `@amp-backscatter` 一次收掉了四条**
（原第 1–4 条，反向散射标签本身、EPC Gen2 清点轮、上电门限、清点之后的 Read/Write），
**而第 5 条没收掉**——那一课只放反向散射标签，`ampTiers` 的两层轮流一个场景也没演示。
下面的编号重排过，所以引用这一节时要连日期一起引。

**九条，而不是上面计数表里那 4 行**，差别要说清：
**整行写着「引擎建了，无课」的有 4 行**（第 1、2、4、6 条）；
另外五条**藏在一个「部分建模」或「已建模」的行里**——
第 3 条在那一行 ERP 时序里（SIFS 教了、DIFS 没教，所以整行是「部分建模」）、
第 5 条只在 `@mlo-gain` 的 `limits` 里被点名（不是主路径）、
第 7–9 条是三个**合法取值**，它们所在的那一行有课，而那个取值没有。
**把它们并进去是对的，但要知道它们在表格里找不到那六个字。**
第 1 条是第三种情形，也要说清：那一行**既带课号又带那六个字**，因为
`@amp-coexist` 的摄像头真的把一台站点放在了 `'2g'` 上，而那一课不教这条链路。

| # | 它是什么 | 引擎 | 这张表的哪一节 |
| --- | --- | --- | --- |
| 1 | 一台 Wi-Fi 站点运行在 2.4 GHz 上（只有 `@amp-coexist` 的摄像头载过，而那一课不教它） | `model/caps.ts#nodeLinks`，编辑器下拉框 | 五 |
| 2 | 两层标签共用一个读写器时轮流 | `engine/mac.ts#AmpTiers` | 十一 |
| 3 | 2.4 GHz 的 DIFS 28 µs / AckTimeout 39 µs / EIFS 88 µs | `engine/phy.ts#ERP_2G` | 五 |
| 4 | 2.4 GHz 的 40 MHz 带宽上限 | `model/caps.ts#widthOf` | 五 |
| 5 | 频段之间的 −6.5 / 0 / +1.2 dB 之差（只在 `@mlo-gain` 的 `limits` 里被点名） | `engine/simulation.ts#LINK_EXTRA_LOSS_DB` | 五 |
| 6 | 6 GHz 的信道编号与中心频率 | `model/scenario.ts#sixGhzChannelNo` | 七 |
| 7 | 保护间隔的 `'double'` 档（合法取值，零个课程场景） | `engine/phy.ts#TGI_NS.double` | 六 |
| 8 | 3 条空间流（合法取值，零个课程场景） | `model/caps.ts#Nss` | 六 |
| 9 | 玻璃墙（合法材质，零个课程场景） | `engine/propagation.ts#WALL_LOSS_DB.glass` | 八 |

**第 7、8、9 条是三条「允许但空转」的变体**，形状和 `docs/inert-config-contract.md`
讲的那一类很像但**不是同一件事**：它们在引擎里**不空转**（打开它们记录流会变），
只是**课程从不打开它们**。那份契约管的是 schema 收得下而引擎读不到的配置；
这三条要么该有一门课点它，要么该在某门课的 `limits` 里被点名说「本课不动它」。
**两者混为一谈会让人去写一条拒绝，而拒绝在这里是错的答案。**

## 十五、第三阶段与第四阶段：该装什么，还是该退役

`src/course/curriculum.ts:79-86` 的 `TIERS` 声明了四个 Wi-Fi 阶段，而第三、第四阶段
**零模块、零课**。面板不显示没有课的阶段（`trackHeadings` 拿到的就是已经筛过的列表），
所以读者今天看不见这两个标签——它们是两张写了名字的空抽屉。

**先回答 brief 正面提的那个问题：第三阶段的料被第二阶段吃掉了吗？**

**部分吃掉了，而且是设计自己安排的。** 零到一百的那份设计把 Tier 3 的最后一条写成
**「➕ Why width and streams work (revisiting M4)」**——`revisiting`。
也就是说它从一开始就打算让 `width` / `streams` 先在第二阶段当「容量旋钮」教一遍，
到第三阶段再回头讲机理。所以 `@width`、`@streams` 落在 M8 下**不是侵占**。

但有三条确实被吃掉了，而且吃得很干净：

| Tier 3 原定的条目 | 今天在哪 | 还剩什么 |
| --- | --- | --- |
| 🔧 Signals, bands and channels | `@radio-primer`、`@noise-floor`（M0，第一阶段）、`@width`（M8） | **bands 与 channels 没剩**：2.4 GHz 那条链路、6 GHz 的信道编号（本表第 5、7 节，无课项第 6–10 条，**引擎已建**），以及主/辅 20 MHz 与每 20 MHz 的 CCA（第十二节，**引擎未建**） |
| 🔧 OFDM, symbols and guard intervals | `@airtime`、`@frame-anatomy-bytes`（M2，**第一阶段**）；保护间隔 2026-10-05 落在 `@airtime` 的一个变体里 | 只剩 `'double'` 那一档没演示（无课项第 11 条） |
| 🔧 Multipath, fading, MIMO | `@fading`、`@selectivity`、`@ru-diversity`、`@streams`（全在 M8） | **multipath 不剩，而且是算出来不可能**（本表第 8 节那一行：240 米） |
| 🔧 Modulation and constellations | 没有 | **引擎里没有星座这个量**：`reqSinrDb` 是一张灵敏度表。要建就是画图讲解，不是仿真——按 backlog 的第一条判据，它进不了排期表 |
| 🔧 Coding, MCS and SNR→PER（自己生成链路级表） | 没有 | **这是整个 Tier 3 唯一一块真正的引擎工作**，而且它会把每一门课的数重新标定一遍 |
| 🔧 2.4 GHz PHYs (DSSS/ERP), protection and coexistence | ERP 时序建好了、半教（第 5 节）；DSSS 没建；保护机制没建 | **这一条是今天最划算的那一刀**：引擎已经有了，缺的只是课 |
| ➕ Why width and streams work (revisiting M4) | `@width`、`@streams` 教的是现象 | 机理（为什么子载波多了速率就高、为什么流分得开）在课文里是靠 `limits` 挡住的 |

**结论一（第三阶段）：不该退役，但它该改名，而且它今天只剩两件事。**

把「第三阶段 · 底层 PHY」原封不动留着是不诚实的——它名下七条里有四条已经在前两个阶段教完了。
而清空它也是不诚实的，因为剩下的那两件是**真的，而且分量完全不同**：

- **一件便宜而且现在就能做**：2.4 GHz 这条链路（ERP 时序 + 频段路径损耗 + 40 MHz 上限 +
  混合 BSS 的保护），引擎已建，缺的只是课。它是 `linkId: '2g'` 那个无课项，也是标准对齐程序的 D 项。
- **一件昂贵而且会重标定整个课程**：SNR→PER 曲线取代硬门限。它是引擎工作，不是课程工作，
  而它一旦落地，**每一门引用过数字的课都要重跑**（`tests/course/quoted-timestamps.test.ts`
  那一类断言全部要重新 baseline）。

**所以建议是：把「第三阶段 · 底层 PHY」改成「第三阶段 · 频段与物理层保真度」，
名下只立这两个模块**，并且在 `TIERS` 的那一行上写清楚「width / streams / fading / 保护间隔
在第二阶段已经按容量旋钮教过，这里讲它们为什么成立」——
那正是原设计 `revisiting` 两个字的意思，而它从来没被写进代码。

**改名部分 2026-10-05 由用户批准并落地（切片 W0）**：`TIERS[2]` 的标签现在是
「第三阶段 · 频段与物理层保真度」，`curriculum.ts` 那一行上方的注释写明了上面这件事，
并引了原设计第 111 行那个 `➕ Why width and streams work (revisiting M4)` 作证——
**那四门课落在 M8 下是设计安排，不是有人把第三阶段的料搬走了。**
实测确认阶段标签不进 `mainPathChars`：改名前后全课程主路径都是 188 798 字。
**「名下只立这两个模块」那半句没有落地**，因为下一刀是 W5（反向散射，属已存在的 M10），
不碰 `TIERS` 也不新开模块。第四阶段「研究」的标签**没有动**——它名下那两条该怎么归并没有批。

**结论二（第四阶段）：不该退役，但它名下六条里有两条已经交付、而且是交在别的地方。**

| Tier 4 原定的条目 | 状态 |
| --- | --- |
| 🔧 Wi-Fi 8（802.11bn），从本地 TGbn 语料库划范围 | **前提成立**：语料库 2761 份文稿（`wifi8_tgbn/text/` 与 `toc/` 各 2761 个文件）。**没建，没课。** |
| ➕ Experiment design and statistics | **没有** |
| 🔧 Validating a simulator against analytic models, ns-3 and measurements | **已交付一半，而且交在第一阶段**：`@bianchi`、`@bianchi-vs-sim`、`@rate-vs-model` 三门课就是「解析模型对上实跑」，它们在 M5 / tier 0。ns-3 与实测那两侧没有。 |
| ➕ Reading the standard and the task-group process | **已交付，交在 UWB 轨**：`BASES` 的 `draft` 标志、`CONTRIBUTIONS` 那 22 个文稿号与它们的一句话、以及「UWB 第三阶段 · 下一步的草案」底下九门课，做的就是这件事。Wi-Fi 侧没有对应物（802.11-2024 是已发布标准，没有草案过程可读）。 |
| ➕ From problem to contribution or patent | **没有** |
| Tier 4 项目 | **没有** |

所以第四阶段的真实剩余是：**Wi-Fi 8，加上三条不需要引擎支持的方法课**
（实验设计与统计、从问题到贡献、以及一个结业项目）。
**而「读标准与工作组过程」这一条应该正式移到 UWB 轨名下**，不要在 Wi-Fi 第四阶段再排一遍：
已发布标准没有工作组过程可以读，硬排就会变成一门讲 UWB 的 Wi-Fi 课。

**结论三（这是最要紧的一条）：这两个标签今天的真正问题不是「装什么」，是「它们没有预算」。**

见本表最后一节与 backlog 的「汉字上限」那一章：主路径字数只剩 1 202 字，
**开第三阶段的第一门课就会撞上 190 000 的区间上界**，而抬上界要人批。
所以「第三、第四阶段该装什么」这个问题的答案，必须先过「拿什么装」这一关。

## 十六、标准对齐程序 A–G 的实际状态

`docs/superpowers/specs/2026-09-17-standard-alignment-a-correctness-design.md` 立的顺序是
**A** 正确性 → **B** PHY 保真 → **C** MAC 数据路径（「starts by splitting `mac.ts`」）→
**D** 传统 PHY 与频段 → **E** 管理与省电 → **F** HE/EHT 进阶 → **G** 速率控制家族。

**查法**：`ls docs/superpowers/specs/` 共 36 份规格（写作时记成 37，重数是 36）；
`grep -rn 'sub-project' docs src --include=*.md --include=*.ts` 的命中只有三处，
全部指回 A 那份规格或「sub-project zero」（core/technology 拆分）。
**B 到 G 一份规格也没有，一次提交也没有以它们的名字落地。**

| 子项目 | 规格 | 实际状态 |
| --- | --- | --- |
| **A** 正确性（A1–A19） | 有 | **已完成**，19 项全部在引擎里（本表第一、二、三、七节逐项引了 A1–A17） |
| **B** PHY 保真 | 没有 | **五项里四项已交付，但是交在另一个程序的名下。** A 的「Out of scope for B」原文列的是「width penalty on the noise floor, noise figure, PER tables, preamble SNR detection, CCA after own TX」。其中带宽噪声惩罚（`noiseDbm(W)`）、噪声系数（`NOISE_FIGURE_DB` = 7）、前导码信噪比检测（`PREAMBLE_DETECT_SINR_DB` = 4）都在，而且**是零到一百那份设计的 S1 这一刀交的**——S1 的交付清单里逐字写着这几项。**没交的是 PER 表**（本表第六节最后一行），而「CCA after own TX」查不到对应标识符（`grep -rn 'own TX\|ownTx' src/engine` 零命中），**存疑**。 |
| **C** MAC 数据路径 | 没有 | **没开始。** 它的开场动作是拆 `mac.ts`，而 `mac.ts` 今天 1758 行，一行没拆。清单里只有「queue limits and lifetime」落地了（又是 S1 交的）；BA 协商、位图与部分重传、A-MSDU、PIFS 恢复全部没有（本表第三节四行「未偿的债」）。 |
| **D** 传统 PHY 与频段 | 没有 | **建了一半，教了四分之一。** 2.4 GHz 的 ERP 时序、频段损耗差、40 MHz 上限全部建好并有专门测试，**而且那是为 AMP 那一刀建的**（AMP 标签只活在 2.4 GHz 上）；DSSS 与混合 BSS 的保护没建。课程这一侧：SIFS/时隙/信号扩展被两门 AMP 课教了，别的没有。**它是这张表里投入产出比最高的那一刀。** |
| **E** 管理与省电 | 没有 | **没开始。** 信标、关联、安全、漫游、省电、TWT 一个也没有（本表第十二节六行）。 |
| **F** HE/EHT 进阶 | 没有 | **零碎地推进了，没有一次是以 F 的名义。** 「real RU sizes」= UWB backlog 的切片 4d，**已立案且建议不批**；26 音调的分格单位已经为频率选择性建了（`engine/selectivity.ts`）。per-stream LTF、触发式 MU 确认、VHT MU-MIMO、MU EDCA、intra-BSS NAV 全部没有。 |
| **G** 速率控制家族 | 没有 | **没开始。** `engine/rate.ts` 96 行，一种算法。 |

**所以 A–G 与「第三阶段 · 底层 PHY」是什么关系？**

**是同一片地的两个坐标系，而且这两个坐标系已经在实践中合并了,只是没人宣布。**
把两边对起来：

| A–G | 零到一百的阶段/刀 | 谁实际交的 |
| --- | --- | --- |
| A | （没有对应的阶段，它是纯修正） | A 自己 |
| B | S1 的「MAC-relevant PHY fidelity」+ Tier 3 的 SNR→PER 那一条 | **S1 交了四分之四减 PER 表** |
| C | S2（Block Ack、A-MSDU） | 没人 |
| D | Tier 3 的「2.4 GHz PHYs (DSSS/ERP)」+ S7 | **AMP 那一刀顺手建了引擎的一半** |
| E | Tier 2 的 M5 + S5 | 没人 |
| F | Tier 2 的 M7 + S4 | 零碎 |
| G | Tier 2 的 M4 的「Rate adaptation II」+ S2 | 没人 |

**两件事因此成立：**

1. **A–G 这套编号今天没有在用。** 2026-09-18 之后的每一刀都用零到一百那套阶段/切片编号，
   而且**用得更细**（UWB 那边已经走到 3d / 4e / 5b）。A–G 的真正价值不是排期，
   是它那份**「Out of scope for B / C / F」的清单**——那是今天唯一一处把「这件事没建」
   写成条目的地方，而这张覆盖表的「未偿的债」有六行是从那三份清单抄来的。
2. **所以不要复活 A–G 的编号。** 该做的是把那三份 out-of-scope 清单的内容吸收进这张表
   （已做）与 backlog（见那份文件的切片编号），然后在 A 那份规格的开头加一行
   说明它的 B–G 已经并入零到一百的程序。**那一行要人批，而且它改的是一份已完成规格的措辞。**
   **2026-10-05 已落地（切片 W0）**：那一行在 A 那份规格的开头，指回本节，
   并且明说它只记录现状、不复活编号、也不退役那三份 out-of-scope 清单。

## 十七、汉字上限那一件事（结论在 backlog，证据在这里）

**这一节原来的标题前提已经没有了。** 写作当天全课程主路径汉字有一条
`> 170 000 且 < 190 000` 的上限，余量 1 202 字，而「装不下一门新课」是那条上限说的。
**切片 W0（2026-10-05）把它换掉了**：逐课主路径改成区间 (700, 4 400)，总和那条降为
`> 100 000 且 < 300 000` 的健全区间，而**那个手写的总字数被删掉了**。
所以这一节现在记的不是上限，是四个会随每一门新课变的数，连同它们各自的断言。

| 量 | 实测（2026-10-05，切片 W5 之后） | 断言在哪 | 余量 |
| --- | --- | --- | --- |
| 全课程主路径汉字 | **191 289** | `tests/course/readability.test.ts`：逐课 (700, 4 400)，总和 > 100 000 且 < 300 000 | 逐课最紧的是 `@ru-diversity` 4 030（距上沿 370） |
| 分钟数合计 | **1 850** | 同文件，**等式** | 0 |
| `limits` 债务棘轮 | 292 | 同文件，≤ 292 | **0** |
| 课数 | 87（Wi-Fi 49、AMP 5、UWB 33） | 同文件，`toBe(87)`，**精确** | — |
| 模块数 | 30 | 同文件，`toBe(30)`，**精确**（W5 属已存在的 M10，所以这个数没动） | — |
| 场景数（含 variants） | **256** | `tests/fixtures/lesson-hashes.json` 共 **263** 条 = 256 + 7 个编辑器家庭 | — |

**一门新课的典型主路径是 2 000–3 000 字**（全课程 87 门的均值 2 199 = 191 289 / 87；
最近五门新课：`amp-backscatter` 2 491、`uwb-ancillary-request` 2 990、`wan-rtt` 2 053、
`edca-tamper` 3 246、`ru-diversity` 4 030）。**所以逐课那个区间的中间三分之一正好是一门新课。**

另有两条紧在眼前，和上限无关但和分钟数那条等式有关——**它们是 `lessonMinutes` 的五分钟档位**：

| 课 | raw 分钟 | 到下一档还剩 | 后果 |
| --- | --- | --- | --- |
| `@rate` | 22.50 | **1 字** | 加一个字它就从 20 跳到 25，分钟数合计那条等式（今天是 1 850）变红 |
| `@uwb-reply-time` | 27.48 | 4 字 | 同上 |
| `@uwb-m2m` | 27.48 | 5 字 | 同上 |
| `@ofdma-ul` | 22.46 | 9 字 | 同上 |
| `@rts-cts` | 12.45 | 11 字 | 同上 |
| `@streams` | 27.39 | **25 字** | 同上（brief 说的是 46 字，实测 25——算法是 `(5·(k+0.5) − raw) × 220`，`k = round(raw/5)`） |

**而「超过 30 分钟」这件事要分清**：`lessonMinutes` 四舍五入到 5，没有任何夹紧；
`MAX_MINUTES = 30` 只被 `readability.test.ts` 的 `fits one sitting` 读。
所以 raw 超过 30 不会立刻变红——要 raw ≥ 32.5 才会取整到 35 而失败。
今天 raw 过 30 的恰好两门：

| 课 | raw | 取整 | 到 35 还剩 |
| --- | --- | --- | --- |
| `@uwb-ancillary` | **31.12** | 30 | 303 字 |
| `@ru-diversity` | **30.32** | 30 | 479 字 |

`curriculum.ts` 的 `lessonMinutes` 注释写明正确答案是**拆课**，不是放宽上限。
**这两门都记进 backlog 的切片 W2。**

重跑这一整节：

```bash
npx vite-node --root <worktree> <scratchpad>/census.ts   # 字数、分钟、每课逐行
npx vite-node --root <worktree> <scratchpad>/buckets.ts   # 每课到下一个五分钟档的字数余量
```
