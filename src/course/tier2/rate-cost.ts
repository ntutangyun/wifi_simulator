/**
 * Wi-Fi Tier 2 · M9 · 容量参数与速率控制 · The bill an excursion runs up.
 *
 * **Standard-first shape (2026-11-11).** ① what IEEE Std 802.11-2024 fixes that this bill is
 * made of: a PPDU's duration follows from its MCS (802.11be-2024 §36.4.3), a neighbour's backoff
 * does not decrement while the medium is busy (§10.23.2.4) and resumes only after an AIFS of idle
 * medium, and who uses which MCS is left open (§10.6.1). ② what the engine does with each —
 * including its simplified PPDU duration, its instant busy detection and its open-ended saturated
 * source. ③ three runs: one freeze, the bill, and the two edits that shrink it.
 *
 * It loads `rate-fallback`'s scene (which is `rate`'s) with no variant, so its line in
 * tests/fixtures/lesson-hashes.json is a copy. Every figure printed below is read back out of the
 * lesson text in tests/course/rate-cost.test.ts.
 */
import { type Lesson, firstData, firstFreeze, J } from '../lessonKit'
import { rateScenario } from '../wifiScenes'

export const rateCost: Lesson = {
  id: 'rate-cost',
  module: 8,
  title: '降档的代价——这段慢帧多占的空口时间由谁承担',
  why: 'IEEE 802.11-2024 规定了一帧在每一级调制与编码方式（modulation and coding scheme, MCS）上要发送多久，也规定了其他站点（station, STA）在介质（medium）忙时不递减退避（backoff）计数、要等介质重新空闲满仲裁帧间间隔（arbitration interframe space, AIFS）之后才继续；它不规定哪台设备该用哪一级。所以一台站点降到低一级时，同样的载荷（payload）要在空口上停留更久，而它多占的每一微秒，邻居的退避计数器都停在原值不动。本课场景里，远端站点以低于上限的级别发送的帧只占它三秒内帧数的五分之一，却占了将近三成的空口时间（airtime），比全部以上限发送多占两百毫秒以上，约为整段仿真的百分之七；这段时间没有多传送任何一个比特。代价没有更高，是因为多数跌落只降一级。近端邻居为远端的每一帧冻结的时间都比那一帧本身长一些，远端降得越低，冻结越久。造成这项代价的是竞争而不是距离：去掉近端站点的业务，代价降为零；把远端站点移近两米，代价降到一半以下，但不会降为零。',
  outcomes: [
    '说出标准规定了哪两件事使跌落的代价落到邻居头上',
    '测得以低于上限的级别发送的帧在帧数和空口时间中各占多少',
    '读出一个邻居的退避被一帧冻结多久，并说明这段多用的时间没有带来任何收益',
  ],
  needs: ['rate-fallback'],
  terms: [
    { term: 'airtime tax', plain: '同样的内容因以更低一级发送而多占用的空口时间；它没有多传送任何一个比特' },
    { term: 'backoff freeze', plain: '介质一变忙，其他站点的退避计数器就停在当前值；本课测量的是它停了多久' },
  ],
  standard: [
    { heading: '一帧要发送多久（IEEE Std 802.11be-2024 §36.4.3）', text: 'EHT PPDU（PHY protocol data unit）的发送时长 TXTIME 按式 36-110 计算：前导码（preamble）各字段的时长，加上数据符号（symbol）数乘以符号时长，再加上帧尾的 PE 字段。数据符号数由载荷长度与这一级 MCS 每个符号承载的比特数决定，所以同样长的载荷，级别越低，帧越长。' },
    { heading: '介质忙时退避不递减（§10.23.2.4）', text: '增强型分布式信道接入（enhanced distributed channel access, EDCA）的每个接入类别（access category, AC），只在介质空闲满 AIFS 之后的特定时隙（slot time）边界上做一次决定：计数非零就减一，为零且有帧就发起一次传输机会（transmit opportunity, TXOP）。介质忙时没有这样的时隙边界，计数保持原值；介质重新空闲满 AIFS 之后，才从原值继续。' },
    { heading: '一次交换在介质上占多久（§10.3.2.11）', text: '接收方在数据帧（data frame）结束后间隔一个短帧间间隔（short interframe space, SIFS）回复确认帧（acknowledgement, ACK），不检查介质是否空闲。所以邻居看到的忙碌时段是数据帧加上确认帧，之后还要再等一个 AIFS 才能继续递减。' },
    { heading: '谁用哪一级（§10.6.1）', text: '速率切换的算法不在标准范围之内。标准只规定每一级怎样发送，不规定哪台设备在什么时候用哪一级。' },
    { kind: 'steps', heading: '一帧怎样使邻居等待，按标准：逐步说明', items: [
      '远端站点以某一级 MCS 发送一帧，帧长由式 36-110 决定（802.11be-2024 §36.4.3）。',
      '近端站点检测到介质忙；在这之后的时隙边界上，它的退避计数不再递减（§10.23.2.4）。',
      '数据帧结束后一个 SIFS，接入点（access point, AP）回复确认帧（§10.3.2.11）。',
      '确认帧结束、介质空闲满 AIFS 之后，近端站点在下一个时隙边界继续递减，计数仍是冻结时的值。',
      '远端的帧越长，近端在第 2 步到第 4 步之间等待越久；被冻结的那些时隙不计入它的退避。',
    ] },
  ],
  implementation: [
    { topic: '介质忙时退避不递减', standard: '只在 AIFS 之后的空闲时隙边界上递减（§10.23.2.4）', sim: '照此处理：介质一变忙，计数就停在当前值并写一条冻结记录；介质重新空闲满 AIFS 之后从原值继续，写一条恢复记录。本课的冻结时长就是这两条记录的时间差，其中包含确认帧与随后的 AIFS。', kind: 'faithful' },
    { topic: '冻结从何时开始', standard: '信号开始后最多 4 µs 内报忙（§17.3.10.6）；时隙里包含检测时间与空中传播时间（§10.3.7）', sim: '一路发射开始的那一纳秒，能收到它的站点同时判忙；全场共用一个时钟，没有传播时延。所以同一级的帧使近端冻结的时长每次都完全相同。', kind: 'differs' },
    { topic: '一帧的空口时间', standard: 'TXTIME 按式 36-110 计算，前导码各字段随配置变化，帧尾有 PE 字段（802.11be-2024 §36.4.3）', sim: '简化为：前导码取代表值 48 µs，加上 13.6 µs 乘以数据符号数，符号数按 16 个服务比特、6 个尾比特（tail bits）与载荷比特计算，不计 PE 字段。1530 字节的帧在 MCS 2、1、0 上分别是 524.0、768.8、1,476.0 µs。', kind: 'differs' },
    { topic: '速率选择', standard: '不在标准范围之内（§10.6.1）', sim: '上一课的规则：连续两次失败降一级，连续十次成功升一级，不超过上限。', kind: 'choice' },
    { topic: '业务源', standard: '标准不规定上层业务的行为', sim: '两台站点的业务都是饱和（saturated）上传：队列（queue）始终保持 20 帧，每出队一帧就补充一帧，等待变长也不降低发送速度；没有 TCP，所以这项代价只在空口这一层计算。', kind: 'choice' },
    { topic: '生存期（MSDU lifetime）', standard: '每个 MSDU（MAC service data unit）有发送计时器，超过 dot11EDCATableMSDULifetime 即丢弃（§10.23.2.12.1），默认 500 TU', sim: '本课场景没有设置生存期，也没有队列深度上限，所以队列既不会满，也不会有帧因等待过久而被丢弃。', kind: 'differs' },
  ],
  labs: [
    {
      heading: '一次冻结有多长',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一次退避冻结：正在递减计数的那台站点停住了，因为另一台站点开始发送。',
        '在远端站点的泳道上分别找一帧 MCS 2、MCS 1 与 MCS 0 的帧，读出近端站点那段冻结从冻结记录到恢复记录有多长。',
      ],
      blocks: [
        { kind: 'table', heading: '近端站点的退避被远端站点的一帧冻结多久', head: ['那一帧的级别', '那一帧的空口时间', '退避被冻结'], rows: [
          ['MCS 2——上限', '524.0 µs', '615.0 µs'],
          ['MCS 1', '768.8 µs', '859.8 µs'],
          ['MCS 0——最低一级', '1,476.0 µs', '1,579.0 µs'],
        ] },
      ],
      expect: '每一级的冻结都比那一帧本身长：上限上 524.0 µs 的帧使近端冻结 615.0 µs，最低一级 1,476.0 µs 的帧使它冻结 1,579.0 µs，每帧多等 964.0 µs。同一级的每一次冻结长度完全相同；近端站点自己三秒内 4,010 帧没有一次失败，级别始终是 MCS 11。',
      meaning: '冻结覆盖整段交换再加一个 AIFS，计数从原值继续（①，§10.23.2.4，§10.3.2.11；② 照此）。每次都完全相同，是因为本仿真器判忙没有时延、也没有传播时延（②）。',
    },
    {
      heading: '跌落的代价',
      steps: [
        '载入本课场景，运行三秒。',
        '统计远端站点以低于上限的级别发送的帧：帧数、实际占用的空口时间，以及它们若都以上限发送需要多久。',
      ],
      blocks: [
        { kind: 'table', heading: '远端站点的三秒：跌落中的帧及其代价', head: ['项目', '数值'], rows: [
          ['以低于上限的级别发送的帧数', '607'],
          ['占它三秒内发出的帧数', '20.2%'],
          ['占它三秒内的空口时间', '29.7%'],
          ['这些帧实际占用的空口时间', '530.3 ms'],
          ['同样这些帧若以上限发送', '318.1 ms'],
          ['因此多占用', '212.2 ms'],
          ['占整段三秒仿真', '7.1%'],
          ['本次最短的一次：最低一级上的十帧', '14.8 ms，而在上限上只需 5.2 ms'],
        ] },
      ],
      expect: '607 帧只占帧数的 20.2%，却占了空口时间的 29.7%，多占 212.2 ms，约为三秒的 7.1%。每一帧都是 1530 字节，载荷完全相同。这 607 帧里 517 帧在 MCS 1 上，每帧多 47%；只有 90 帧降到最低一级，每帧多 182%，所以合计只是以上限发送的 1.67 倍，而不是将近三倍。',
      meaning: '帧长随级别变化是标准的规定（①）；降到哪一级、降多久是本仿真器速率选择的结果（②）。这段多占的时间没有带来任何收益，这就是速率异常（性能异常）的又一次出现；这个概念出自 Heusse 等人 2003 年的论文，不是标准里的概念。',
    },
    {
      heading: '去掉竞争，或把远端站点移近',
      steps: [
        '点击「在编辑器中打开」，把近端站点的业务从饱和改为空闲，运行三秒，统计远端站点的帧。',
        '再把近端站点改回饱和，把远端站点向接入点直线移近两米，运行三秒，重新计算多占用的空口时间。',
      ],
      expect: '近端站点空闲时，远端站点三秒发出 4,395 帧，每一帧都以上限发送，多占用的时间为 0。远端站点移近两米后，上限升到 MCS 3，三秒发出的帧从 3,003 增加到 3,712，多占用的时间从 212.2 ms 降到 96.9 ms，占仿真的 3.2%。',
      meaning: '远端站点的失败全部来自与近端站点的碰撞，而本仿真器的速率选择只看成败（②），所以去掉竞争，代价就消失；距离只决定上限有多高，只要还有竞争，代价就不会降为零。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.23.2.4（EDCA 的退避只在 AIFS 之后的空闲时隙边界递减）、§10.3.2.11（确认帧在 SIFS 之后发送，不检查介质）、§10.6.1（速率切换的算法不在标准范围之内）、§17.3.10.6（4 µs 内报忙）、§10.3.7（时隙的组成）、§10.23.2.12.1 与 dot11EDCATableMSDULifetime（MSDU 生存期，默认 500 TU）；IEEE Std 802.11be-2024：§36.4.3 式 36-110（EHT PPDU 的 TXTIME）。',
    '速率异常（performance anomaly）出自 Heusse 等人 2003 年的 INFOCOM 论文，标准没有这个概念。',
    '本仿真器的取值与取法：48 µs 的代表性前导码与不含 PE 字段的帧长公式、判忙没有时延、没有传播时延、饱和业务源、不设生存期。本课表里的冻结时长是本仿真器冻结记录与恢复记录的时间差；「多 47%」「多 182%」是三个帧长之比。',
  ],
  limits: [],
  scenario: () => rateScenario(),
  jumps: [
    J('第一个数据帧', firstData),
    J('第一次退避冻结', firstFreeze),
    J('第一次 ACK 超时', (r) => r.type === 'ACK_TIMEOUT'),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '远端站点以最低一级发送一帧，使近端站点的退避计数器冻结了多久？',
      options: [
        '1,476.0 µs——就是那一帧的空口时间',
        '1,579.0 µs——从冻结那一刻，到确认帧结束、介质空闲满 AIFS 之后计数继续递减',
        '完全没有冻结：退避只受自己的计数器控制',
      ],
      answer: 1,
      explain: '介质忙时退避不递减，要等确认帧结束、介质重新空闲满 AIFS 之后才继续（§10.23.2.4），所以冻结比那一帧本身长一些。对于以上限发送的那些帧，同一个邻居只需等待 615.0 µs。',
    },
    {
      q: '跌落中的帧只占远端站点帧数的 20.2%，为什么占用了 29.7% 的空口时间？',
      options: [
        '因为它们更容易发生碰撞，要重发好几次',
        '因为同样的载荷在更低一级上要更长：517 帧每帧多 47%，90 帧每帧多 182%',
        '因为它们排队更靠后，等待更久',
      ],
      answer: 1,
      explain: '空口时间取决于级别，而不取决于失败次数：每一帧的载荷都没有变化。这 607 帧合计占用 530.3 ms，而它们若都以上限发送只需 318.1 ms。',
    },
    {
      q: '哪一项是标准的规定，而不是本仿真器的取法？',
      options: [
        '远端站点连续两次失败就降一级',
        '介质忙时，邻居的退避计数不递减，空闲满 AIFS 之后从原值继续',
        '队列始终保持 20 帧',
      ],
      answer: 1,
      explain: '§10.23.2.4 规定了退避只在 AIFS 之后的空闲时隙边界递减。降级规则与饱和业务源都是本仿真器的取法，标准不规定速率选择，也不规定上层业务。',
    },
  ],
}
