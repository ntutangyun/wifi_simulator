/**
 * Wi-Fi Tier 2 · M8 · Real applications · The closing brief of the Wi-Fi track.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). It is a
 * brief, not a walkthrough: one flat, seven devices, one question — what single
 * change most improves this household — and three candidate changes the learner
 * runs, prices and defends, with a rubric and a write-up template to hand the
 * answer in against.
 *
 * Mechanism before metaphor (2026-09-23): the `steps` block is the method the
 * learner carries out — baseline, the four figures and the lane each is read
 * from, one editor edit at a time, the comparison, the ranking and the hand-in
 * — and the four-way table is its worked example, every row naming the lane and
 * the counter its figures come from.
 *
 * The three candidates are edits the learner makes in the editor, not lesson
 * `variants`: the scene is one inline builder that takes no parameters, and the
 * recorded timeline hash in tests/fixtures/lesson-hashes.json is the
 * controller's. The scenario is therefore byte-identical to what it was.
 *
 * Every number quoted below is pinned in tests/course/capstone.test.ts; the
 * five-second figures it shares with tests/course/lesson-claims.test.ts
 * ("lesson 14 · capstone") are the same run measured the same way.
 */
import { type Lesson, brick, drywallDoor, node, sc, firstMuDl, firstTrigger, first6g, firstCollision, J } from '../lessonKit'

export const capstone: Lesson = {
  id: 'capstone',
  module: 8,
  title: '结业课——热闹的一家人',
  why: '在此之前的每一课，都是在一个专为展示它而搭的场景里，给你看一个机制。而真实的家里是所有机制一起上演，光线昏暗，还要问你一个没有任何单独一课能回答的问题：这个网络用起来慢——你会改什么？最难的不是测量，而是在一堆看上去都可以怪罪的东西里，挑出真正决定别人能拿到多少的那一个。',
  outcomes: [
    '按照他们共享的那一样资源，给一个混杂家庭里的设备排序',
    '用仿真结果、而不是用直觉，给三个候选改动分别标价',
    '说出你会否决哪个改动，以及是哪一个测量让你否决它的',
    '交出一份写明了“它没有测什么”的报告',
  ],
  needs: ['edca', 'txop', 'width', 'rate', 'anomaly', 'tier1-project', 'ofdma-dl', 'ofdma-ul', 'mumimo', 'mlo'],
  terms: [
    { term: 'bottleneck', plain: '不管你把别的修得多好，都由它来决定其他人能拿到多少的那一台设备或那一个选择' },
    { term: 'offered load', plain: '一台设备“想发多少”，区别于它最后“真正发出去了多少”' },
  ],
  picture: [
    { heading: '这套房子，以及屋里都有谁', text: '三个房间，彼此之间隔着砖墙，每道内墙上开一扇门。客厅里一个接入点（AP）。一台 Wi-Fi 7 笔记本正用两台电台做备份，一台 Wi-Fi 6 电视和一台投影仪都在推流，一部手机在通话，一台老些的 Wi-Fi 5 平板在上网，还有一个隔一阵子醒一次的 IoT 传感器。所有事情同时发生——晚上本来就是这样。' },
    { kind: 'watch', jump: 2, heading: '先看，再想', text: '载入仿真，跳到第一次碰撞。先别做别的：打开检视器，把七台设备按空口占比排个序，并把这个排名写下来。下面每一条论证都要拿这份排名来对照，而多数读者第一次都猜错。' },
    { heading: '你要回答的那个问题', text: '只有一个问题，而且必须用数字来回答：哪一个单项改动，对这个家庭的改善最大？不是哪台设备最旧，不是哪台最慢，也不是哪台你最想换掉。空口是全家共享的同一份资源，一个改动值多少，取决于它腾出了多少。' },
    { kind: 'list', heading: '你可以做的三个改动', items: [
      '把笔记本的备份停掉，或者挪到半夜再做——最粗暴的那个答案。',
      '把笔记本的 MLO 关掉，让它的备份退回一个频段。',
      '给平板换一台开着 OFDMA 的 Wi-Fi 6 电台——屋里有人拿来上网的最旧那台，虽然它并不是屋里最旧的。',
    ] },
    { heading: '中间那个陷阱', text: '最慢的那台电台是最显眼的嫌疑人，而在这里它是无辜的。传感器说话确实慢，但它几乎不说话：整段仿真里只有寥寥几个很小的帧。一台设备要成为瓶颈，前提是它在花掉那份共享资源；而花掉它，意思是占着空口——是“想发多少”乘以“每帧要占多久”，不是包装盒上的年份。' },
    { heading: '什么才算一个答案', text: '三样东西，而第三样是大家最容易漏掉的。一个改动，以及它让哪个数字动了多少。一个你否决掉的改动，以及是哪个测量让你否决它的。还有一句话，说清这个场景没有建模什么——一个不肯讲清自己边界的答案，会被人信到它并不配的地方去。' },
  ],
  numbers: [
    { kind: 'table', heading: '同样的五秒钟，四种走法', head: [
      '数字，以及从哪里读',
      '原样', '停掉备份',
      '关掉第二台电台', '平板换 Wi-Fi 6',
    ], rows: [
      ['备份送达量（兆字节）——泳道 ap 与 ap#6g 的已送达字节',
        '78.0', '0', '37.7', '78.1'],
      ['视频等待——泳道 sta-2 的平均接收等待',
        '2.26 ms', '0.21 ms', '2.22 ms', '2.18 ms'],
      ['平板等待——泳道 sta-4 的平均接收等待',
        '39.06 ms', '0.50 ms', '25.93 ms', '34.31 ms'],
      ['语音等待——泳道 sta-3 的平均发送等待',
        '1.90 ms', '0.83 ms', '1.95 ms', '1.82 ms'],
    ] },
    { heading: '这里没有一样是关于吞吐量的', text: '四个场景里，电视拿到的都是大约 8.3 兆字节，平板拿到的都是不多不少 88,200 字节：没有哪个改动改变了它们收到的东西。变的是——其中一行变了两个数量级——一帧要等多久才轮到自己。共享的资源是时间，而其中绝大部分被一台设备花掉了。' },
    { kind: 'table', heading: '好答案里有什么', head: [
      '判断', '好答案长什么样',
    ], rows: [
      ['瓶颈是谁', '点名那个备份，而不是传感器：笔记本占了 5 GHz 的 58.7%、6 GHz 的 90.6%，而传感器五秒里只发三帧。'],
      ['停掉备份', '报出其他所有等待都掉到一毫秒以下——同时也报出备份自己从此一个字节也送不出去。把交换的是什么说清楚。'],
      ['第二台电台', '老老实实给它标价：它让备份自己的送达量翻倍，而视频的等待原地不动。它帮的是自己的主人，不是它离开的那个频段。'],
      ['那台平板', '看出这次升级几乎没什么动静：接入点从来没把平板和别人编在一组，它的等待只降了大约八分之一。'],
      ['没有测到的东西', '直说：没有人走动，没有门被打开，整段仿真只有五秒。而一个晚上不是五秒。'],
    ] },
    { kind: 'steps', heading: '这套做法，一步一步', items: [
      '先取基线，什么都别动。按原样载入场景，让五秒跑完，打开检视器，把七台设备按空口占比排序。笔记本的两条泳道是 58.7% 和 90.6%，其余没有一台到得了百分之二。把这个排名写下来。',
      '定下四个要贯穿每个方案的数字：备份的送达量、视频与平板的等待、语音的等待。上面那张表写明了每一个各从哪条泳道读。',
      '一次只改一样，在编辑器里改，然后重新加载。这三个方案都不是能从菜单里载入的变体——每一个都是你自己改上去、再改回来的编辑：把笔记本的流量设成空闲；或者取消笔记本的 MLO；或者给平板换一台开着 OFDMA 的 Wi-Fi 6 电台。',
      '每次重新加载后，再把这四个数字读一遍，写在基线旁边。三个方案按列对列地比：一个改动值多少，既看它让什么动了，也同样看它让什么没动。',
      '按“腾出了多少等待”给方案排序，而不是按“哪台设备看起来最惨”。传感器是屋里最旧的那台电台，而它根本不在候选名单上：五秒里它只发三帧。',
      '交四句话：瓶颈是谁、哪个数字说明的；你会选哪个方案、它让什么动了；你否决了哪个方案、是哪个测量否决的；以及这个场景没有建模什么——没有人走动，没有门被打开，整段仿真只有五秒。',
    ] },
  ],
  deeper: [
    { heading: '为什么平板比电视惨得多', text: '电视和投影仪是一直在被推流的，所以接入点几乎每一次发送都有东西给它们，它们也就顺带被编进了接入点组成的多用户组里。平板则是隔一阵子要一个网页，而且待在两堵墙之后的远角上，用的是屋里承载着人上网的最旧那台电台：它从来没被编进组，它的帧又长，每一帧都得自己去和一个满负荷的上传者争一次发送机会。它那 39.06 ms 不是链路慢，而是一条足够快的链路前面排了一条很慢的队。' },
    { heading: '真正的答案下一步会做什么', text: '这套房子里没有任何东西去调度那个备份。真实的部署不会把它停掉，而是会给它一份更小的份额：给上传限速，或者把它的流量放进优先级更低的接入类别，让其他每一条队列都排在它前面。这两样都只是一行配置，谁也不用换新电台。这一课没有把它们做成按钮，原因是本仿真器没有策略引擎，而不是因为它们不对；事实上，它们才是对的那个答案。' },
  ],
  sources: [
    '墙体、材质以及穿墙损耗来自本仿真器自己的传播模型；砖墙与石膏板的衰减是按常见实测数据标定的模型取值，并非 IEEE Std 802.11-2024 规定的数值。',
    '场景里用到的每一个机制都有各自的条款：接入类别及其参数 §10.23.2，发送机会 §10.23.2.8，聚合 §10.12，下行多用户见第 27 章，多链路操作见 IEEE Std 802.11be-2024 第 35 章。',
    '流量模型——一个备份、两路视频、一通语音、一次浏览会话和一个传感器——是本仿真器自带的产生器，不是标准的流量模型；它们的包长与间隔都是模型取值，所以这些五秒钟的数字属于这个场景，而不属于某个真实家庭。',
  ],
  scenario: () => sc({
    rooms: [
      { x: 0, y: 0, w: 5, h: 8, name: 'Living room' },
      { x: 5, y: 0, w: 5, h: 4, name: 'Study' },
      { x: 5, y: 4, w: 5, h: 4, name: 'Bedroom' },
    ],
    walls: [
      brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0),
      drywallDoor(5, 0, 5, 8, 1.5),
      drywallDoor(5, 4, 10, 4, 2.5),
    ],
  }, [
    node('ap', 'AP (Wi-Fi 7)', 'ap', 2.5, 4, 'eht', 'idle'),
    node('sta-1', 'Laptop MLO', 'sta', 7.5, 2, 'eht', 'saturated'),
    node('sta-2', 'TV (Wi-Fi 6)', 'sta', 1.5, 6.5, 'he', 'video'),
    node('sta-3', 'Phone (voice)', 'sta', 3.5, 2, 'he', 'voice'),
    node('sta-4', 'Tablet (Wi-Fi 5)', 'sta', 7.5, 6.5, 'vht', 'browsing'),
    node('sta-5', 'Sensor (legacy)', 'sta', 9.3, 7.3, 'nonht', 'iot'),
    node('sta-6', 'Projector (Wi-Fi 6)', 'sta', 6, 1, 'he', 'video'),
  ]),
  jumps: [
    J('第一个 MU PPDU', firstMuDl),
    J('第一个触发帧', firstTrigger),
    J('第一次碰撞', firstCollision),
    J('第一个 6 GHz 数据帧', first6g),
  ],
  observe: [
    '在检视器里把七台设备按空口占比排序。笔记本占了 5 GHz 的 58.7%、6 GHz 的 90.6%，屋里其他任何一台都到不了百分之二。这个排名和你猜的一样吗？',
    '找到这样一个时刻：手机的语音队列抢在一条等得更久的尽力而为队列前面拿到了发送机会。那就是接入类别的规则，在一屏时间轴里就看得见。',
    '传感器是屋里最慢的那台电台，而它五秒里一共发了三帧——总共 384 字节。在怪罪最慢的那台设备之前，先看看究竟是谁占着空口。',
  ],
  tryThis: [
    '在编辑器里把笔记本的备份改成空闲，然后重新加载。其他所有等待都塌到一毫秒以下：视频从 2.26 ms 到 0.21，语音通话从 1.90 到 0.83，平板的网页从 39.06 到 0.50。而备份自己从此一个字节也送不出去。',
    '把它改回来，改成把笔记本的 MLO 关掉——也就是撤掉它的第二台电台。它自己的送达量减半，78.0 兆字节变成 37.7，而视频流的等待和原来相差不到几个百分点，2.22 ms 对 2.26。那台电台买到的是它主人的吞吐量，不是邻居的解脱。',
  ],
  quiz: [
    {
      q: '对这个家庭而言，收益最大的单项改动是……',
      options: [
        '提高接入点的发射功率',
        '替换慢速的传统传感器',
        '管住笔记本的备份——错峰、限速，或者把它的优先级调低',
      ],
      answer: 2,
      explain: '大家共享的是空口时间，不是字节，也不是电台的新旧，所以问题是谁占着它。传感器是屋里最慢的电台，五秒里只发三个短帧，挪动它测不出任何变化。备份占着大部分空口，把它停掉，其他所有等待都掉到一毫秒以下。',
    },
    {
      q: '你给平板换了一台更新的电台。会发生什么？',
      options: [
        '接入点开始把它和电视编成一组，它的网页很快就到了',
        '几乎什么也没发生：它依然从没被编进组，等待只从 39.06 ms 降到 34.31',
        '笔记本的备份会慢下来给它让路',
      ],
      answer: 1,
      explain: '更新的电台只是让平板自己的帧变短；它并不会让平板更早轮到，而接入点在组队的那一刻手里也没有给它的东西。换掉看起来最惨的那台设备，是“花最多的钱、改变最少的东西”的典型做法。',
    },
  ],
}
