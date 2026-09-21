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
 * The three candidates are edits the learner makes in the editor, not lesson
 * `variants`: the scene is one inline builder that takes no parameters, and the
 * recorded timeline hash in tests/fixtures/lesson-hashes.json is the
 * controller's. The scenario is therefore byte-identical to what it was.
 *
 * Every number quoted below is pinned in tests/course/capstone.test.ts; the
 * five-second figures it shares with tests/course/lesson-claims.test.ts
 * ("lesson 14 · capstone") are the same run measured the same way.
 */
import { type Lesson, N, brick, drywallDoor, node, sc, firstMuDl, firstTrigger, first6g, firstCollision, J } from '../lessonKit'

export const capstone: Lesson = {
  id: 'capstone',
  module: 8,
  title: { en: 'Capstone — the busy household', zh: '结业课——热闹的一家人' },
  why: {
    en: 'Every lesson so far has shown you one mechanism in a scene built to show it. A real home shows you all of them at once, badly lit, and asks a question none of them answers on its own: this network feels slow — what would you change? The hardest part is not the measurement. It is choosing which of the many things you could blame is actually the one deciding what everybody else gets.',
    zh: '在此之前的每一课，都是在一个专为展示它而搭的场景里，给你看一个机制。而真实的家里是所有机制一起上演，光线昏暗，还要问你一个没有任何单独一课能回答的问题：这个网络用起来慢——你会改什么？最难的不是测量，而是在一堆看上去都可以怪罪的东西里，挑出真正决定别人能拿到多少的那一个。',
  },
  outcomes: [
    { en: 'rank the devices of a mixed household by the one resource they share', zh: '按照他们共享的那一样资源，给一个混杂家庭里的设备排序' },
    { en: 'price three candidate changes against the run instead of against intuition', zh: '用仿真结果、而不是用直觉，给三个候选改动分别标价' },
    { en: 'name the change you would reject, and the measurement that made you reject it', zh: '说出你会否决哪个改动，以及是哪一个测量让你否决它的' },
    { en: 'hand in a write-up that states what it did not test', zh: '交出一份写明了"它没有测什么"的报告' },
  ],
  needs: ['edca', 'txop', 'width', 'rate', 'anomaly', 'tier1-project', 'ofdma-dl', 'ofdma-ul', 'mumimo', 'mlo'],
  terms: [
    { term: 'bottleneck', plain: {
      en: 'the one device or choice that decides what everybody else gets, whatever else you fix',
      zh: '不管你把别的修得多好，都由它来决定其他人能拿到多少的那一台设备或那一个选择',
    } },
    { term: 'offered load', plain: {
      en: 'how much a device is trying to send, as opposed to how much it actually gets through',
      zh: '一台设备"想发多少"，区别于它最后"真正发出去了多少"',
    } },
  ],
  picture: [
    { heading: { en: 'The flat, and who is in it', zh: '这套房子，以及屋里都有谁' }, text: {
      en: 'Three rooms with brick between them and a door in each inner wall. One access point in the living room. A Wi-Fi 7 laptop running a backup over two radios, a Wi-Fi 6 television and a projector both streaming, a phone on a voice call, an older Wi-Fi 5 tablet browsing, and an IoT sensor that wakes now and then. Everything at once, as an evening actually is.',
      zh: '三个房间，彼此之间隔着砖墙，每道内墙上开一扇门。客厅里一个接入点。一台 Wi-Fi 7 笔记本正用两台电台做备份，一台 Wi-Fi 6 电视和一台投影仪都在推流，一部手机在通话，一台老些的 Wi-Fi 5 平板在上网，还有一个隔一阵子醒一次的 IoT 传感器。所有事情同时发生——晚上本来就是这样。',
    } },
    { kind: 'watch', jump: 2, heading: { en: 'Look before you think', zh: '先看，再想' }, text: {
      en: 'Load the simulation and jump to the first collision. Do nothing else yet: open the inspector, rank all seven devices by airtime share, and write the ranking down. That list is the baseline every argument below is made against, and most readers guess it wrong.',
      zh: '载入仿真，跳到第一次碰撞。先别做别的：打开检视器，把七台设备按空口占比排个序，并把这个排名写下来。下面每一条论证都要拿这份排名来对照，而多数读者第一次都猜错。',
    } },
    { heading: { en: 'The question you are answering', zh: '你要回答的那个问题' }, text: {
      en: 'One question, and it has to be answered with a number: which single change would most improve this household? Not which device is oldest, not which one is slowest, and not which one you would enjoy replacing. The air is one resource shared by everybody in the flat, and a change is worth what it frees of that.',
      zh: '只有一个问题，而且必须用数字来回答：哪一个单项改动，对这个家庭的改善最大？不是哪台设备最旧，不是哪台最慢，也不是哪台你最想换掉。空口是全家共享的同一份资源，一个改动值多少，取决于它腾出了多少。',
    } },
    { kind: 'list', heading: { en: 'Three changes you could make', zh: '你可以做的三个改动' }, items: [
      { en: 'Stop the laptop’s backup, or move it to the middle of the night — the brute-force answer.', zh: '把笔记本的备份停掉，或者挪到半夜再做——最粗暴的那个答案。' },
      { en: 'Turn MLO off on the laptop, so its backup goes back to one band.', zh: '把笔记本的 MLO 关掉，让它的备份退回一个频段。' },
      { en: 'Give the tablet a Wi-Fi 6 radio with OFDMA on — the oldest radio anyone browses on, though not the oldest in the flat.', zh: '给平板换一台开着 OFDMA 的 Wi-Fi 6 电台——屋里有人拿来上网的最旧那台，虽然它并不是屋里最旧的。' },
    ] },
    { heading: { en: 'The trap in the middle', zh: '中间那个陷阱' }, text: {
      en: 'The slowest radio is the obvious suspect, and here it is innocent. The sensor speaks slowly, but it barely speaks: a handful of tiny frames across the whole run. A device is a bottleneck only if it spends the shared resource, and spending it means holding the air — offered load times the time each frame takes, not the age on the box.',
      zh: '最慢的那台电台是最显眼的嫌疑人，而在这里它是无辜的。传感器说话确实慢，但它几乎不说话：整段仿真里只有寥寥几个很小的帧。一台设备要成为瓶颈，前提是它在花掉那份共享资源；而花掉它，意思是占着空口——是"想发多少"乘以"每帧要占多久"，不是包装盒上的年份。',
    } },
    { heading: { en: 'What counts as an answer', zh: '什么才算一个答案' }, text: {
      en: 'Three things, and the third is the one people leave out. A change, with the number it moved. A change you rejected, with the measurement that made you reject it. And a sentence on what this scene does not model — an answer that never says where it stops gets believed further than it deserves.',
      zh: '三样东西，而第三样是大家最容易漏掉的。一个改动，以及它让哪个数字动了多少。一个你否决掉的改动，以及是哪个测量让你否决它的。还有一句话，说清这个场景没有建模什么——一个不肯讲清自己边界的答案，会被人信到它并不配的地方去。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: {
      en: 'The same five seconds, four ways',
      zh: '同样的五秒钟，四种走法',
    }, head: [
      { en: 'Scene', zh: '场景' }, { en: 'Backup delivered, megabytes', zh: '备份送达量（兆字节）' },
      { en: 'Video wait', zh: '视频等待' }, { en: 'Tablet wait', zh: '平板等待' }, { en: 'Voice wait', zh: '语音等待' },
    ], rows: [
      [{ en: 'As it stands', zh: '原样' }, N('78.0'), N('2.26 ms'), N('39.06 ms'), N('1.90 ms')],
      [{ en: 'Backup stopped', zh: '停掉备份' }, N('0'), N('0.21 ms'), N('0.50 ms'), N('0.83 ms')],
      [{ en: 'Second radio off', zh: '关掉第二台电台' }, N('37.7'), N('2.22 ms'), N('25.93 ms'), N('1.95 ms')],
      [{ en: 'Tablet given a Wi-Fi 6 radio', zh: '给平板换上 Wi-Fi 6 电台' }, N('78.1'), N('2.18 ms'), N('34.31 ms'), N('1.82 ms')],
    ] },
    { heading: { en: 'Nothing here is about throughput', zh: '这里没有一样是关于吞吐量的' }, text: {
      en: 'In all four scenes the television receives about 8.3 megabytes and the tablet exactly 88,200 bytes. No change alters what any of them receives. What moves — by two orders of magnitude, in one column — is how long a frame waits for its turn. The shared resource is time, and one device spends nearly all of it.',
      zh: '四个场景里，电视拿到的都是大约 8.3 兆字节，平板拿到的都是不多不少 88,200 字节。没有哪个改动改变了它们收到的东西。变的是——其中一列变了两个数量级——一帧要等多久才轮到自己。共享的资源是时间，而其中绝大部分被一台设备花掉了。',
    } },
    { kind: 'table', heading: { en: 'What a good answer contains', zh: '好答案里有什么' }, head: [
      { en: 'Decision', zh: '判断' }, { en: 'A good answer', zh: '好答案长什么样' },
    ], rows: [
      [{ en: 'The bottleneck', zh: '瓶颈是谁' }, { en: 'Names the backup, not the sensor: the laptop holds 58.7% of 5 GHz and 90.6% of 6 GHz, while the sensor sends three frames in five seconds.', zh: '点名那个备份，而不是传感器：笔记本占了 5 GHz 的 58.7%、6 GHz 的 90.6%，而传感器五秒里只发三帧。' }],
      [{ en: 'Stopping the backup', zh: '停掉备份' }, { en: 'Reports that every other wait falls under a millisecond — and that the backup itself then delivers nothing at all. Says what is being traded.', zh: '报出其他所有等待都掉到一毫秒以下——同时也报出备份自己从此一个字节也送不出去。把交换的是什么说清楚。' }],
      [{ en: 'The second radio', zh: '第二台电台' }, { en: 'Prices it honestly: it doubles the backup’s own delivery, and leaves the video wait where it was. It helped its owner, not the band it left.', zh: '老老实实给它标价：它让备份自己的送达量翻倍，而视频的等待原地不动。它帮的是自己的主人，不是它离开的那个频段。' }],
      [{ en: 'The tablet', zh: '那台平板' }, { en: 'Notices the upgrade barely registers: the access point never groups the tablet with the others, and its wait falls by about one part in eight.', zh: '看出这次升级几乎没什么动静：接入点从来没把平板和别人编在一组，它的等待只降了大约八分之一。' }],
      [{ en: 'What was not tested', zh: '没有测到的东西' }, { en: 'Says plainly that nobody walks about, no door opens and the run is five seconds long. An evening is not five seconds long.', zh: '直说：没有人走动，没有门被打开，整段仿真只有五秒。而一个晚上不是五秒。' }],
    ] },
    { kind: 'steps', heading: { en: 'The write-up', zh: '这份报告怎么写' }, items: [
      { en: 'One sentence: which device decides what everybody else gets, and the one number that says so.', zh: '一句话：是哪台设备在决定别人能拿到多少，以及说明这一点的那一个数字。' },
      { en: 'The change you would make, and the number you expected it to move, written before you ran it and before you look at the table above.', zh: '你打算做的改动，以及你预期它会让哪个数字怎么动——在你跑它之前、也在你看上面那张表之前，先写下来。' },
      { en: 'What it actually moved, from the run, including the numbers that did not move.', zh: '它实际上让什么动了，数据来自仿真——包括那些没动的数字。' },
      { en: 'One change you rejected, and the measurement that made you reject it.', zh: '一个你否决掉的改动，以及是哪个测量让你否决它的。' },
      { en: 'What this scene does not model, so nobody reads more into your answer than it holds.', zh: '这个场景没有建模什么，好让别人不会把你的答案读得比它本身更重。' },
    ] },
  ],
  deeper: [
    { heading: { en: 'Why the tablet is so much worse off than the television', zh: '为什么平板比电视惨得多' }, text: {
      en: 'The television and the projector are streamed to constantly, so the access point has something for them in almost every transmission and they ride along in the multi-user groups it forms. The tablet asks for a page now and then, from the far corner behind two walls, on the oldest radio that carries anyone’s browsing: it is never in a group, its frames are long, and each one has to win a turn of its own against a saturated uploader. Its 39.06 ms is not a slow link — it is a slow queue in front of a fast enough link.',
      zh: '电视和投影仪是一直在被推流的，所以接入点几乎每一次发送都有东西给它们，它们也就顺带被编进了接入点组成的多用户组里。平板则是隔一阵子要一个网页，而且待在两堵墙之后的远角上，用的是屋里承载着人上网的最旧那台电台：它从来没被编进组，它的帧又长，每一帧都得自己去和一个满负荷的上传者争一次发送机会。它那 39.06 ms 不是链路慢，而是一条足够快的链路前面排了一条很慢的队。',
    } },
    { heading: { en: 'What a real answer would do next', zh: '真正的答案下一步会做什么' }, text: {
      en: 'Nothing in this flat schedules the backup. A real deployment would not stop it — it would give it a smaller share: rate-limit the upload, or put its traffic in a lower access category so that every other queue takes its turn first. Both are one line of configuration and neither costs anybody a new radio. The reason this lesson does not offer them as buttons is that the simulator has no policy engine, not that they are the wrong answer; they are, in fact, the right one.',
      zh: '这套房子里没有任何东西去调度那个备份。真实的部署不会把它停掉，而是会给它一份更小的份额：给上传限速，或者把它的流量放进优先级更低的接入类别，让其他每一条队列都排在它前面。这两样都只是一行配置，谁也不用换新电台。这一课没有把它们做成按钮，原因是本仿真器没有策略引擎，而不是因为它们不对；事实上，它们才是对的那个答案。',
    } },
  ],
  sources: [
    { en: 'The walls, their materials and the path loss through them are the simulator’s own propagation model; the brick and drywall attenuations are model choices calibrated to typical measured figures, not values IEEE Std 802.11-2024 states.',
      zh: '墙体、材质以及穿墙损耗来自本仿真器自己的传播模型；砖墙与石膏板的衰减是按常见实测数据标定的模型取值，并非 IEEE Std 802.11-2024 规定的数值。' },
    { en: 'Every mechanism the scene exercises has its own clause: the access categories and their parameters §10.23.2, the transmit opportunity §10.23.2.8, aggregation §10.12, multi-user downlink Clause 27, and multi-link operation Clause 35 of IEEE Std 802.11be-2024.',
      zh: '场景里用到的每一个机制都有各自的条款：接入类别及其参数 §10.23.2，发送机会 §10.23.2.8，聚合 §10.12，下行多用户见第 27 章，多链路操作见 IEEE Std 802.11be-2024 第 35 章。' },
    { en: 'The traffic profiles — a backup, two video streams, a voice call, a browsing session and a sensor — are the simulator’s own generators, not a standard traffic model; their packet sizes and intervals are model choices, so the five-second figures are this scene’s, not a household’s.',
      zh: '流量模型——一个备份、两路视频、一通语音、一次浏览会话和一个传感器——是本仿真器自带的产生器，不是标准的流量模型；它们的包长与间隔都是模型取值，所以这些五秒钟的数字属于这个场景，而不属于某个真实家庭。' },
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
    J('first MU PPDU', '第一个 MU PPDU', firstMuDl),
    J('first Trigger', '第一个触发帧', firstTrigger),
    J('first collision', '第一次碰撞', firstCollision),
    J('first 6 GHz data', '第一个 6 GHz 数据帧', first6g),
  ],
  observe: [
    { en: 'Rank all seven devices by airtime share in the inspector. The laptop holds 58.7% of 5 GHz and 90.6% of 6 GHz; nothing else in the flat reaches two per cent. Does that ranking match your guess?', zh: '在检视器里把七台设备按空口占比排序。笔记本占了 5 GHz 的 58.7%、6 GHz 的 90.6%，屋里其他任何一台都到不了百分之二。这个排名和你猜的一样吗？' },
    { en: 'Find one moment where the phone’s voice queue takes its turn ahead of a best-effort queue that waited longer. That is the access-category rule, visible in one screenful of timeline.', zh: '找到这样一个时刻：手机的语音队列抢在一条等得更久的尽力而为队列前面拿到了发送机会。那就是接入类别的规则，在一屏时间轴里就看得见。' },
    { en: 'The sensor is the slowest radio in the house, and in five seconds it sends three frames — 384 bytes in all. Before blaming the slowest device, check who holds the air.', zh: '传感器是屋里最慢的那台电台，而它五秒里一共发了三帧——总共 384 字节。在怪罪最慢的那台设备之前，先看看究竟是谁占着空口。' },
  ],
  tryThis: [
    { en: 'Set the laptop’s backup to idle in the editor and reload. Every other wait collapses below a millisecond: the video from 2.26 ms to 0.21, the voice call from 1.90 to 0.83, the tablet’s pages from 39.06 to 0.50. The backup itself then delivers nothing.', zh: '在编辑器里把笔记本的备份改成空闲，然后重新加载。其他所有等待都塌到一毫秒以下：视频从 2.26 ms 到 0.21，语音通话从 1.90 到 0.83，平板的网页从 39.06 到 0.50。而备份自己从此一个字节也送不出去。' },
    { en: 'Put it back and turn MLO off on the laptop instead, which takes its second radio away. Its own delivery halves, 78.0 megabytes to 37.7, while the video streams wait within a few per cent of what they did, 2.22 ms against 2.26. That radio bought its owner throughput, not its neighbours relief.', zh: '把它改回来，改成把笔记本的 MLO 关掉——也就是撤掉它的第二台电台。它自己的送达量减半，78.0 兆字节变成 37.7，而视频流的等待和原来相差不到几个百分点，2.22 ms 对 2.26。那台电台买到的是它主人的吞吐量，不是邻居的解脱。' },
  ],
  quiz: [
    {
      q: { en: 'The single highest-leverage change for this household would be…', zh: '对这个家庭而言，收益最大的单项改动是……' },
      options: [
        { en: 'Raising the access point’s transmit power', zh: '提高接入点的发射功率' },
        { en: 'Replacing the slow legacy sensor', zh: '替换慢速的传统传感器' },
        { en: 'Taming the laptop’s backup — scheduling it, rate-limiting it, or giving it a lower priority', zh: '管住笔记本的备份——错峰、限速，或者把它的优先级调低' },
      ],
      answer: 2,
      explain: { en: 'Airtime, not bytes and not the age of a radio, is what everybody shares, so the question is who holds it. The sensor is the slowest radio here and sends three short frames in five seconds; moving it changes nothing measurable. The backup holds most of the air, and stopping it drops every other wait below a millisecond.', zh: '大家共享的是空口时间，不是字节，也不是电台的新旧，所以问题是谁占着它。传感器是屋里最慢的电台，五秒里只发三个短帧，挪动它测不出任何变化。备份占着大部分空口，把它停掉，其他所有等待都掉到一毫秒以下。' },
    },
    {
      q: { en: 'You give the tablet a newer radio. What happens?', zh: '你给平板换了一台更新的电台。会发生什么？' },
      options: [
        { en: 'The access point starts grouping it with the television, and its pages arrive promptly', zh: '接入点开始把它和电视编成一组，它的网页很快就到了' },
        { en: 'Almost nothing: it is still never grouped, and its wait falls only from 39.06 ms to 34.31', zh: '几乎什么也没发生：它依然从没被编进组，等待只从 39.06 ms 降到 34.31' },
        { en: 'The laptop’s backup slows down to make room for it', zh: '笔记本的备份会慢下来给它让路' },
      ],
      answer: 1,
      explain: { en: 'A newer radio shortens the tablet’s own frames; it does not give it a turn any sooner, and the access point has nothing queued for it when it forms a group. Replacing the device that looks worst is the most expensive way to change almost nothing.', zh: '更新的电台只是让平板自己的帧变短；它并不会让平板更早轮到，而接入点在组队的那一刻手里也没有给它的东西。换掉看起来最惨的那台设备，是"花最多的钱、改变最少的东西"的典型做法。' },
    },
  ],
}
