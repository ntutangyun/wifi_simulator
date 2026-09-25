/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · what the second link is worth.
 *
 * The second half of `mlo`
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M10): the
 * first half is the mechanism, this one is the price tag. It was the worst
 * repetition case in the Wi-Fi track — three tables, each followed by a
 * paragraph restating it (§5.3) — so one of those paragraphs survives as prose
 * and the other two are a clause on their own table.
 *
 * §4 gives this lesson NO diagram: three tables, with the paragraphs that
 * restated them gone.
 *
 * It loads `mlo`'s own scene unchanged (`sameSceneAs`), and like it has no
 * variants, so the recorded timeline hash is the same run twice. Every number is
 * pinned in tests/course/mlo-gain.test.ts.
 */
import { type Lesson, oneRoom, node, sc, txOf, first6g, J } from '../lessonKit'
import { linkOfVirtual } from '../../model/caps'

export const mloGain: Lesson = {
  id: 'mlo-gain',
  module: 9,
  title: '第二条链路买到的是一个空频段',
  why: '第二台电台不会凭空造出空口时间（airtime）：它并不更快，也没有多出一份发送机会。它买到的是一个邻居还没进去的频段——而且只在邻居还没进去的这段时间里有效。这一课给这第二条链路（link）标价：它的主人多发了多少，被它留在原地的邻居又怎么样了，以及把同样两台电台也给邻居装上之后，还剩下多少。',
  outcomes: [
    '给第二条链路标价：它的主人多发了多少帧，发送前的等待短了多少',
    '说出把第二条链路关掉之后，邻居为什么反而更差',
    '说出第二个频段值钱的地方究竟在哪里，并在同一个房间里看它失效',
  ],
  needs: ['mlo'],
  terms: [
    { term: 'link', plain: '一个频段上的一台电台，有自己的信道，自己排自己的队' },
    { term: 'MLO', plain: '多链路操作：把一台设备的两条链路一起跑起来，由同一堆帧来喂' },
  ],
  picture: [
    { heading: '活儿流向空着的那个频段', text: '因为那堆等着发的帧是两条链路共享的，活儿就自然流向哪个频段空着。在这个房间里，邻居把 5 GHz 占满了，而 6 GHz 上除了笔记本和接入点（access point, AP）之外一个人也没有，于是笔记本的帧大部分都从 6 GHz 那条链路出去了。没有谁去调度，也没有谁去测量：帧只是去了先轮到它的那一边，而先轮到的，多半是那条没人跟它抢的链路。' },
    { kind: 'watch', jump: 1, heading: '去看一眼', text: '载入仿真，跳到第一个 6 GHz 数据帧（data frame），然后一直往后看。笔记本的方块在 5 GHz 那条泳道上越来越稀，在 6 GHz 那条上越堆越多；而它下面那台邻居只有一条泳道，一个频段，而这个频段是满的。' },
    { heading: '它没有买到的东西', text: '第二条链路并不会凭空造出空口时间。它只是让自己的主人够得着一个邻居还没进去的频段——而且只在邻居还没进去的这段时间里有效。把同样的两台电台也给邻居装上，那个安静的频段就被填满了：两台设备都把活儿摊到两个频段上，于是每一台拿到的，都比当初那台独苗多链路操作（multi-link operation, MLO）设备拿到的少。' },
  ],
  numbers: [
    { kind: 'table', heading: '最初 300 ms 里，笔记本的活儿去了哪边', head: [
      '泳道', '数据帧',
      '占用的空口时间', '占该频段时钟的比例（含回答）',
    ], rows: [
      ['5 GHz', '67', '53.9 ms', '18.3%'],
      ['6 GHz', '240', '249.6 ms', '84.2%'],
    ] },
    { heading: '不是更快的那台电台，是更空的那个频段', text: '两条链路跑的是同一级调制与编码方式（modulation and coding scheme, MCS）：MCS 13，172.1 Mb/s。第二台电台并不更快，它只是那个没有别人的频段。笔记本每五帧里有四帧从那边走，带走的空口时间差不多是留下那些帧的五倍。' },
    { kind: 'table', heading: '同样的 300 ms，把 MLO 关掉——两台站点（station, STA）最后发得一样多', head: [
      '测量对象', 'MLO 开', 'MLO 关',
    ], rows: [
      ['笔记本的数据帧', '307', '116'],
      ['笔记本发送前的平均等待（5 GHz / 6 GHz）', '1.29 / 1.54 ms', '3.25 ms'],
      ['邻居的数据帧', '185', '116'],
      ['邻居发送前的平均等待', '2.58 ms', '4.18 ms'],
    ] },
    { kind: 'table', heading: '把两台电台也给邻居装上——那种偏向就消失了', head: [
      '泳道', '笔记本的帧', '邻居的帧',
    ], rows: [
      ['5 GHz', '122', '132'],
      ['6 GHz', '136', '106'],
    ] },
    { kind: 'steps', heading: '给一条链路标价，该量哪几样', items: [
      '量它的主人：两条链路都开着的这段里，它发出多少帧、每帧发送前平均等了多久。上面第一张表就是这一步。',
      '把第二条链路关掉，同一个房间、同样长的一段重跑一遍，量同样两个数。两次之差才是这条链路买到的东西——单看一次跑，你分不清是链路的功劳还是这个房间本来就闲。',
      '别忘了量那台没有第二条链路的邻居，它是这笔账里最容易被漏掉的一方。这里它并没有因为对方让出 5 GHz 而得利：把一个重载上传的家伙挪开，本来是替所有人省的。',
      '最后把同样的两台电台也给邻居装上，看那个空着的频段被填满之后还剩下什么。',
      '于是标价的规矩出来了：一条链路值多少，取决于它通向的频段有多空，而不取决于那台电台有多快。',
    ] },
  ],
  deeper: [
    { heading: '为什么关掉之后两台设备发得一样多', text: '把第二条链路关掉，笔记本和邻居都落到 116 帧——一样多，而且几乎是各占一半。这不是巧合：两台都是重载上传，两台在同一条信道上用同一套规则竞争，长时间平均下来，公平就是这么来的。所以“笔记本占了便宜”这句话的真正意思是：它没有在这条公平的信道上占便宜，它只是把自己的大部分活儿搬到了另一条信道上去。',
    },
  ],
  sources: [
    '多链路操作与 MLD 的共享发送队列见 IEEE Std 802.11be-2024 第 35 章；本仿真器建模的是双电台同时收发那一种形态（§35.3），所以这里的每一个数字都是第二条链路所能给出的最好情况。',
    '笔记本的帧最终落在哪个频段，标准完全没有规定：本仿真器的做法是，哪条链路赢得空口，就把共享队列里的下一批帧交给它——这是模型取值，替代真实厂商各自的链路选择策略。',
    '这里的等待是每一帧从入队到开始发送的时间，按设备统计；6 GHz 那条泳道的等待略长于 5 GHz，是因为绝大多数帧都走了那条链路，而不是因为那条链路更慢。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP (MLO)', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Laptop (MLO)', 'sta', 6.5, 5, 'eht', 'saturated'),
    node('sta-2', 'Neighbor (5G only)', 'sta', 3.5, 5, 'he', 'saturated', { edca: true, ampdu: true, txop: true }),
  ]),
  jumps: [
    J('第一个 5 GHz 数据帧', txOf((r) => linkOfVirtual(r.node) === '5g' && r.frame.kind === 'data' && r.frame.src === 'sta-1')),
    J('第一个 6 GHz 数据帧', first6g),
  ],
  observe: [
    '最初 300 ms 里，5 GHz 上 67 个数据帧，6 GHz 上 240 个——每五帧里有四帧从那个空着的频段走。',
    '邻居只有 5 GHz，别无其他，而它占着这个频段 69.9% 的时钟。正是这个数让另一条链路显得那么值钱。',
  ],
  tryThis: [
    '关掉笔记本的 MLO 再重新加载。它退回单泳道：同样的 300 ms 里只有 116 个数据帧，而不是 307，发送前的平均等待涨到两倍以上。邻居并没有因此得利——它自己也从 185 帧掉到 116 帧。',
    '打开编辑器，把邻居也换成带 MLO 的 Wi-Fi 7 电台，然后重新加载。那个安静的频段不再安静：笔记本的活儿几乎平分，5 GHz 上 122 帧，6 GHz 上 136 帧，总量掉到 258。',
  ],
  quiz: [
    {
      q: '把笔记本的 MLO 关掉，只剩 5 GHz 那条链路。邻居会怎么样？',
      options: [
        '变好——笔记本让出了 6 GHz，5 GHz 上就它们两个了',
        '变差——笔记本现在要在 5 GHz 上一帧一帧地抢，邻居从 185 帧掉到 116 帧',
        '没有变化——两台设备本来就互不相干',
      ],
      answer: 1,
      explain: '第二条链路把一个重载上传的家伙从大家的路上挪开了。把它关掉不是把频段还给邻居，而是从邻居那里抢走空口时间。',
    },
    {
      q: '把两台电台也给邻居装上，笔记本会怎么样？',
      options: [
        '没事：它保住了领先，因为它先到了那个安静的频段',
        '它的活儿几乎平分，总量从 307 帧掉到 258——第二个频段值钱的地方只在于它空着',
        '接入点会拒绝给第二台设备开第二条链路',
      ],
      answer: 1,
      explain: '第二条链路买到的是进入一个更空频段的资格，不是更多的空口时间。邻居也进了那个频段之后，两台设备都摊在两个频段上，各自拿到的都比当初那台独苗 MLO 设备少。',
    },
  ],
}
