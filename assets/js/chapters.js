/* chapters.js - the story itself.
 *
 * A chapter is a question people actually ask about the Australian job market.
 * A beat is one step of the answer, and it carries TWO pieces of writing:
 *
 *   text - what appears on screen. One short line, the point and nothing else.
 *   say  - what the voice reads. The full explanation, with the numbers in it.
 *
 * The split is deliberate: the screen stays quiet so the chart can be looked at,
 * and the detail arrives through the ear instead of competing for the eye. Every
 * beat must have both; `say` falling back to `text` would silently gut the
 * narration. The chart never changes form inside a chapter, it only changes
 * state, which is what makes the movement readable.
 *
 * The narration is written in the second person, for any reader weighing up a
 * course, a career or a move. Mia and Alex, the two readers this project was
 * designed around, sit behind the writing rather than in front of it.
 *
 * Every number below is read out of window.STORY, which is generated from the
 * ABS files by scripts/build_site_data.py. No figure is typed in by hand.
 */
(function (global) {
  'use strict';

  function build(D) {
    var H = D.economy.headline;
    var C = global.CHARTS.C;
    var V = global.VIZ;
    var by = {};
    D.divisions.forEach(function (d) { by[d.code] = d; });
    var flip = (D.nominalTrap.flip[0] || {});

    function pct(v) { return V.signed(v, 1); }

    // For sentences that already carry the direction (lost, shrank, shed), so
    // the prose never ends up saying "lost -14.2%".
    function mag(v) { return V.fmt(Math.abs(v), 1) + '%'; }

    // Per-year rate of an 18-interval change, compounded. Dividing by 18 would
    // overstate it, which matters when the whole point is how small it is.
    function perYear(totalPct) {
      return (Math.pow(1 + totalPct / 100, 1 / (D.meta.nYears - 1)) - 1) * 100;
    }

    var stateWages = D.states.map(function (s) { return s.wage; });
    var stateSpread = Math.round((Math.max.apply(null, stateWages) /
                                  Math.min.apply(null, stateWages) - 1) * 100);
    var industrySpread = Math.round((by.B.wage / by.A.wage - 1) * 100);
    var waWage = D.states.filter(function (s) { return s.code === 'WA'; })[0].wage;
    var agri = D.covid.filter(function (c) { return c.code === 'A'; })[0];
    var PJ = D.projection;

    /* Chapters 10 and 11 both work off picks made HERE rather than in the
       chart, so the prose and the picture can never quote different rows. */
    var vis = D.divisions.filter(function (d) { return !d.hidden; });
    function topBy(list, f, n) {
      return list.slice().sort(function (a, b) { return b[f] - a[f]; }).slice(0, n || 1);
    }
    function bottomBy(list, f, n) {
      return list.slice().sort(function (a, b) { return a[f] - b[f]; }).slice(0, n || 1);
    }

    /* ABS names a subdivision for a filing cabinet, not for a sentence:
       "Computer system design and related services". Strip the parenthetical
       and the trailing "services" and it reads like a job again. */
    function shortSub(n) {
      return String(n)
        .replace(/\s*\(.*?\)\s*/g, ' ')
        .replace(/\band related services\b/i, '')
        .replace(/\bservices\b/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    var subs = D.subdivisions;
    function subRow(x, field, fmt, tone) {
      return {
        code: x.code, label: shortSub(x.name), icon: x.icon,
        value: x[field], text: fmt(x[field]), tone: tone || 'blue'
      };
    }
    function money(v) { return V.money(v, 1); }

    /* The division whose job types are furthest apart in pay, measured as a
       RATIO rather than a gap: a gap just finds the best-paid industry again,
       while the ratio finds the one where the division average tells you least
       about the job you would actually be doing. */
    var byDiv = {};
    subs.forEach(function (x) { (byDiv[x.division] = byDiv[x.division] || []).push(x); });
    var spreadCode = null, spreadRatio = 0;
    Object.keys(byDiv).forEach(function (k) {
      var list = byDiv[k];
      if (list.length < 4) return;
      var hi = topBy(list, 'wage')[0], lo = bottomBy(list, 'wage')[0];
      if (lo.wage > 0 && hi.wage / lo.wage > spreadRatio) {
        spreadRatio = hi.wage / lo.wage;
        spreadCode = k;
      }
    });
    var spreadSubs = byDiv[spreadCode].slice().sort(function (a, b) { return b.wage - a.wage; });
    var spreadDiv = by[spreadCode];
    var spreadHi = spreadSubs[0], spreadLo = spreadSubs[spreadSubs.length - 1];

    /* Every job type, not the top eight: the chart pane scrolls in this
       chapter, so a reader can go and find their own instead of being shown a
       shortlist. `scrollRows` on the beat is what makes the pane taller than
       itself. */
    var payAllSubs = topBy(subs, 'wage', subs.length);
    var bigSubs = topBy(subs, 'jobs', subs.length);
    var fastSubs = topBy(subs.filter(function (x) { return x.jobs >= 30; }), 'jobs5y', subs.length);
    // 🚨 Descending, so the longest bar is the top row. Sorted the other way
    // the scale is set by a +273% gain at the bottom and the top is stubs.
    var growthSubs = topBy(subs, 'jobsGrowth', subs.length);
    var deadSubs = bottomBy(subs, 'jobsGrowth', 6);

    /* Chapter 11's board. Two or three names per row, not one: a single pick
       reads as a recommendation, and three reads as what it is, the top of a
       ranking with the catch attached. */
    function picks(list, fmt) {
      return list.map(function (d) {
        return { name: d.short || shortSub(d.name), icon: d.icon, value: fmt(d) };
      });
    }
    var payTop = topBy(vis, 'wage', 3);
    var jobsTop = topBy(vis, 'jobs', 3);
    var hiringTop = topBy(vis.filter(function (d) { return d.jobs >= 300; }), 'jobs5y', 3);
    var skilledTop = topBy(subs.filter(function (x) { return x.jobs >= 150; }), 'wage', 3);
    var realUp = topBy(vis, 'wageGrowth', 3);
    var realFlat = bottomBy(vis, 'wageGrowth', 3);
    var slowest = bottomBy(vis, 'ivaGrowth', 3);

    var ADVICE = [
      {
        goal: 'If pay is the only thing that matters', tone: 'blue', portrait: payTop[0].code,
        picks: picks(payTop, function (d) { return money(d.wage); })
      },
      {
        goal: 'If you want the most ways in', tone: 'blue', portrait: jobsTop[0].code,
        picks: picks(jobsTop, function (d) { return V.fmt(d.jobs, 0) + 'k'; })
      },
      {
        goal: 'If you need work soon', tone: 'aqua', portrait: hiringTop[0].code,
        picks: picks(hiringTop, function (d) { return pct(d.jobs5y); })
      },
      {
        goal: 'If you are arriving with a skill', tone: 'blue', portrait: skilledTop[0].division,
        picks: picks(skilledTop, function (d) { return money(d.wage); })
      },
      {
        goal: 'If you want pay that actually rose', tone: 'aqua', portrait: realUp[0].code,
        picks: picks(realUp, function (d) { return pct(d.wageGrowth) + ' real'; })
      },
      {
        goal: 'Where real pay has barely moved in eighteen years', tone: 'orange',
        portrait: realFlat[0].code,
        picks: picks(realFlat, function (d) { return pct(d.wageGrowth); })
      },
      {
        goal: 'And the industries that grew least', tone: 'orange', portrait: slowest[0].code,
        picks: picks(slowest, function (d) { return pct(d.ivaGrowth) + ' real'; })
      }
    ];

    return [
      // ============================================================== 01
      {
        id: 'pay',
        num: '01',
        persona: 'If pay is your first question',
        question: 'Which industry actually pays the most?',
        teaser: 'The obvious place to start, and the one that sends most people down the wrong path.',
        answer: 'Mining, by a distance. But a pay ranking is a photograph, not a forecast.',
        chart: 'rankingBars',
        beats: [
          {
            text: 'Every industry, ranked by what one worker took home.',
            say: 'Almost everyone starts here. Before anything else, you want to know who pays best. So here is every industry the ABS measures, ranked by what an average worker took home in ' + D.meta.baseYear + '.',
            state: {}
          },
          {
            text: 'Mining leads at ' + V.money(by.B.wage, 1) + ', five times the lowest.',
            say: 'Mining sits on top at ' + V.money(by.B.wage, 1) + ' a year. That is more than five times what the lowest-paid industry offers, and it is not close. The orange line is the average across the whole economy, ' + V.money(H.wageRealLast, 1) + '.',
            state: { highlight: ['B'], reference: H.wageRealLast, referenceLabel: 'economy average ' + V.money(H.wageRealLast, 1) },
            stats: [
              { label: 'Mining', value: V.money(by.B.wage, 1), note: 'highest paid' },
              { label: 'Economy average', value: V.money(H.wageRealLast, 1) }
            ]
          },
          {
            text: 'The bottom is where most first jobs are.',
            say: 'At the other end sit the industries where most people actually begin. Hospitality pays ' + V.money(by.H.wage, 1) + '. Retail pays ' + V.money(by.G.wage, 1) + '. They also have the most vacancies, the fewest entry requirements and the most flexible hours, which is exactly why so many first jobs are there.',
            state: {
              highlight: ['H', 'G', 'A'],
              colours: { H: C.orange, G: C.orange, A: C.orange },
              reference: H.wageRealLast, referenceLabel: 'economy average'
            },
            stats: [
              { label: 'Hospitality', value: V.money(by.H.wage, 1), note: V.fmt(by.H.jobs, 0) + 'k jobs' },
              { label: 'Retail', value: V.money(by.G.wage, 1), note: V.fmt(by.G.jobs, 0) + 'k jobs' }
            ]
          },
          {
            text: 'But this is one year. It cannot tell you what happens next.',
            say: 'Here is the problem with this chart, and it is the reason the rest of this site exists. It shows one year. It cannot tell you whether Mining is still hiring, whether those wages are rising or falling, or whether ' + V.money(by.B.wage, 1) + ' buys what it used to. For any of that, we need to add time.',
            state: { reference: H.wageRealLast, referenceLabel: 'economy average' },
            pivot: true
          }
        ]
      },

      // ============================================================== 02
      {
        id: 'inflation',
        bed: 'tension',          // default chord for the sub-audio bed
        num: '02',
        persona: 'If you have read that wages are rising',
        question: 'Wages rose 85%. Why does nobody feel richer?',
        teaser: 'The most misleading number in Australian labour statistics, and how to undo it.',
        answer: 'Because ' + pct(H.cpiGrowth) + ' of it was inflation. Real pay rose ' + mag(H.wageRealGrowth) + ' in eighteen years.',
        chart: 'wageLines',
        beats: [
          {
            text: 'Pay rose ' + mag(H.wageNominalGrowth) + ' in eighteen years.',
            say: 'You have probably read that Australian wages have risen sharply. They have. The average worker earned ' + V.money(H.wageNominalFirst, 1) + ' in ' + D.meta.firstYear + ' and ' + V.money(H.wageNominalLast, 1) + ' in ' + D.meta.baseYear + '. That is ' + pct(H.wageNominalGrowth) + ' in eighteen years.',
            state: { showNominal: true, showReal: false },
            stats: [{ label: 'Pay on the payslip', value: pct(H.wageNominalGrowth), note: D.meta.firstYear + ' to ' + D.meta.baseYear }]
          },
          {
            text: 'Prices rose ' + mag(H.cpiGrowth) + ' too. Orange is what the pay actually bought.',
            say: 'Here is the catch. Prices went up too. A weekly shop that cost $100 back then costs about $' + Math.round(100 * (1 + H.cpiGrowth / 100)) + ' today. So the blue line is counting dollars, not what those dollars buy. The orange line asks the more useful question: if you took each year of pay to the shops at today prices, how much would it actually get you?',
            state: { showNominal: true, showReal: true, showGap: true },
            stats: [
              { label: 'Prices', value: pct(H.cpiGrowth), note: 'CPI, same period' },
              { label: 'Pay, in current money', value: pct(H.wageRealGrowth), accent: 'orange' }
            ]
          },
          {
            text: 'The lines meet at today, because today is the yardstick.',
            say: 'The two lines touch at the right hand edge, and that is the key to reading this chart. Everything is being measured in ' + D.meta.baseYear + ' money, so in ' + D.meta.baseYear + ' itself the payslip and the shopping basket are the same number, and the gap has to be zero. Every year to the left, the gap is how much of that year the blue line was flattering. In ' + D.meta.firstYear + ' the gap is enormous: ' + V.money(H.wageNominalFirst, 1) + ' on the payslip, but worth ' + V.money(H.wageRealFirst, 1) + ' in what you could buy.',
            state: { showNominal: true, showReal: true, showGap: true, focus: 'real' },
            stats: [
              { label: 'Real pay rise', value: pct(H.wageRealGrowth), accent: 'orange' },
              { label: 'Per year, compounded', value: '+' + perYear(H.wageRealGrowth).toFixed(2) + '%' }
            ]
          },
          {
            text: 'The real gain was ' + mag(H.wageRealGrowth) + ', not ' + mag(H.wageNominalGrowth) + '.',
            say: 'So the real rise is the orange line alone: ' + V.money(H.wageRealFirst, 1) + ' to ' + V.money(H.wageRealLast, 1) + ', about ' + V.money(H.wageRealLast - H.wageRealFirst, 1) + ' a year better off after eighteen years. And this is not a technicality, it changes who counts as a winner. Count raw dollars and every industry looks successful: even the worst raise on the board is ' + pct(D.nominalTrap.wageNominalMin) + '. Take inflation out and the real range is ' + pct(D.nominalTrap.wageRealMin) + ' to ' + pct(D.nominalTrap.wageRealMax) + ', and ' + flip.short + ' goes from looking like ' + pct(flip.nominal) + ' growth to having actually shrunk by ' + mag(flip.real) + '. Everything from here on has inflation taken out.',
            state: { showNominal: true, showReal: true, showGap: true, focus: 'real' },
            stats: [
              { label: flip.short + ', as published', value: pct(flip.nominal), note: 'looks like growth' },
              { label: flip.short + ', after inflation', value: pct(flip.real), accent: 'red', note: 'it shrank' }
            ],
            pivot: true
          }
        ]
      },

      // ============================================================== 03
      {
        id: 'jobs',
        bed: 'growth',          // default chord for the sub-audio bed
        num: '03',
        persona: 'The first half of the question',
        question: 'If an industry grows, does it hire?',
        teaser: 'The half of the question that behaves exactly the way you would expect.',
        answer: 'Yes, clearly. Rank correlation ' + D.corr.ivaJobs.spearman.toFixed(2) + ' across ' + D.corr.n + ' industries, which is strong.',
        chart: 'growthScatter',
        beats: [
          {
            text: 'Each dot is an industry. Growth across, jobs up.',
            say: 'Here is the question underneath everything else. Each dot is one industry, marked with its own symbol. The further right a dot sits, the more that industry grew over eighteen years. The higher up it sits, the more people it took on. Hover or tap any dot to see which one it is.',
            state: { yField: 'jobsGrowth', yLabel: 'Jobs growth' }
          },
          {
            mood: 'growth',
            text: 'They climb together. Growth really does turn into jobs.',
            say: 'Look at the shape they make. The dots climb from the bottom left to the top right: the further right an industry sits, the higher up it tends to be. That rising line is what it looks like when two things move together. If growing had nothing to do with hiring, the dots would be a shapeless cloud and the dashed line through them would be flat.',
            state: { yField: 'jobsGrowth', yLabel: 'Jobs growth', trend: true },
            stats: [
              { label: 'How closely they move together', value: D.corr.ivaJobs.spearman.toFixed(2), accent: 'aqua', note: '0 would mean no link at all, 1 a perfect one. This is strong.' }
            ]
          },
          {
            mood: 'growth',
            text: 'Health care grew most and hired most. Manufacturing did neither.',
            say: 'The two extremes make the point on their own. Private health care and social assistance grew ' + mag(by.Q.ivaGrowth) + ' and added ' + mag(by.Q.jobsGrowth) + ' more workers, far more than anything else on the board. Manufacturing shrank by ' + mag(by.C.ivaGrowth) + ' and shed ' + mag(by.C.jobsGrowth) + ' of its workforce.',
            state: {
              yField: 'jobsGrowth', yLabel: 'Jobs growth', trend: true,
              highlight: ['Q', 'C'], labels: ['Q', 'C'],
              colours: { Q: C.aqua, C: C.red }
            },
            stats: [
              { label: 'Health care', value: pct(by.Q.jobsGrowth), accent: 'aqua', note: 'jobs, 18 years' },
              { label: 'Manufacturing', value: pct(by.C.jobsGrowth), accent: 'red', note: 'jobs, 18 years' }
            ]
          },
          {
            text: 'So the first half of the answer is yes.',
            say: 'So the first half of the answer is yes. Industry growth really does turn into jobs. Which makes the second half, the half that decides what lands in your bank account, look like a formality.',
            state: { yField: 'jobsGrowth', yLabel: 'Jobs growth', trend: true },
            pivot: true
          }
        ]
      },

      // ============================================================== 04
      {
        id: 'wages',
        bed: 'tension',          // default chord for the sub-audio bed
        num: '04',
        persona: 'The half that decides your pay packet',
        question: 'Does that growth reach your pay?',
        teaser: 'Watch the same eighteen industries answer a second question. They scatter.',
        answer: 'No. Correlation ' + D.corr.ivaWage.spearman.toFixed(2) + ', which is no relationship at all.',
        chart: 'growthScatter',
        beats: [
          {
            text: 'Same dots. Up now means real pay per worker.',
            say: 'The same eighteen dots, and left to right still means the same thing: how much the industry grew. Only up and down has changed. It now means how much better off one worker ended up, after inflation. Watch where the dots move to.',
            state: { yField: 'wageGrowth', yLabel: 'Real pay growth per worker' }
          },
          {
            mood: 'tension',
            text: 'The line goes flat. Growth says nothing about pay.',
            say: 'The neat diagonal is gone. The dots are scattered with no shape to them and the dashed line is flat. That is what no link looks like: knowing how fast an industry grew tells you nothing at all about whether the people working in it got a raise.',
            state: { yField: 'wageGrowth', yLabel: 'Real pay growth per worker', trend: true, trendColour: C.red },
            stats: [
              { label: 'How closely they move together', value: D.corr.ivaWage.spearman.toFixed(2), accent: 'red', note: 'Effectively zero. The chapter before this one was 0.77.' }
            ]
          },
          {
            mood: 'tension',
            text: 'Agriculture shrank and paid best. Health care boomed and did not.',
            say: 'The exceptions prove it. Health care grew faster than anything else in the country and gave its workers ' + mag(by.Q.wageGrowth) + '. Agriculture lost ' + mag(by.A.jobsGrowth) + ' of its workforce and handed the survivors ' + mag(by.A.wageGrowth) + ', the largest real pay rise of any industry. Shrinking paid better than booming.',
            state: {
              yField: 'wageGrowth', yLabel: 'Real pay growth per worker', trend: true, trendColour: C.red,
              highlight: ['Q', 'A'], labels: ['Q', 'A'],
              colours: { Q: C.aqua, A: C.orange }
            },
            stats: [
              { label: 'Health care pay', value: pct(by.Q.wageGrowth), note: 'fastest growing industry' },
              { label: 'Agriculture pay', value: pct(by.A.wageGrowth), accent: 'orange', note: 'shrinking industry' }
            ]
          },
          {
            text: 'Growth buys jobs, not raises.',
            say: 'This is the finding, and it is the opposite of what most people assume, including us when we started. Growth buys jobs. It does not buy raises. Which leaves an obvious question: where did the money go instead?',
            state: { yField: 'wageGrowth', yLabel: 'Real pay growth per worker', trend: true, trendColour: C.red },
            pivot: true
          }
        ]
      },

      // ============================================================== 05
      {
        id: 'where',
        num: '05',
        persona: 'Why both of those answers can be true',
        question: 'So where did all the growth go?',
        teaser: 'An economy can only grow in two ways. Australia leaned hard on one of them.',
        answer: H.jobsShareOfGrowth + '% of eighteen years of growth went into hiring more people, not paying them more.',
        chart: 'decomposition',
        beats: [
          {
            text: 'The economy grew ' + mag(H.ivaRealGrowth) + '. Only two ways that can happen.',
            say: 'Australia produced ' + mag(H.ivaRealGrowth) + ' more in ' + D.meta.baseYear + ' than in ' + D.meta.firstYear + ', with inflation taken out. There are only two ways any country manages that: put more people to work, or get more out of each person already working. The two empty boxes are those two explanations. Your pay depends almost entirely on the second one.',
            state: { split: false },
            stats: [{ label: 'Real growth, whole economy', value: pct(H.ivaRealGrowth) }]
          },
          {
            text: H.jobsShareOfGrowth + '% was hiring. ' + H.productivityShareOfGrowth + '% was each person producing more.',
            say: 'Almost all of it was the first kind. Employment rose ' + mag(H.jobsGrowth) + '. Output per worker rose only ' + mag(H.productivityGrowth) + '. So ' + H.jobsShareOfGrowth + '% of the growth came from adding people, and just ' + H.productivityShareOfGrowth + '% from each person becoming more productive.',
            state: { split: true },
            stats: [
              { label: 'More people', value: pct(H.jobsGrowth), accent: 'blue' },
              { label: 'More per person', value: pct(H.productivityGrowth), accent: 'orange' }
            ]
          },
          {
            mood: 'tension',
            text: 'Pay follows the second one, and the second one barely moved.',
            say: 'That is the missing link between the last two chapters. Pay tracks what one worker produces, not how many workers there are. An economy that grows by hiring shows that growth in the jobs column and skips the wages column entirely, which is exactly what the two scatter plots showed.',
            state: { split: true, rows: true }
          },
          {
            text: 'Workers kept their share. There was just less to share.',
            say: 'One thing this is not: workers being squeezed out of their share. The share of new value reaching workers as pay went from ' + H.labourShareFirst + '% to ' + H.labourShareLast + '%, slightly up, and it rose in thirteen of eighteen industries. The split did not move against workers. There was simply not much more per person to split.',
            state: { split: true, rows: true },
            stats: [
              { label: 'Share of value going to workers', value: H.labourShareFirst + '% to ' + H.labourShareLast + '%', note: 'up slightly, not down' }
            ],
            pivot: true
          }
        ]
      },

      // ============================================================== 06
      {
        id: 'map',
        num: '06',
        persona: 'If you are weighing pay against opportunity',
        question: 'Where are the jobs you could actually get?',
        teaser: 'Pay on one axis, hiring on the other, and the size of each industry as the circle.',
        answer: 'The well-paid corner is nearly empty. The hiring corner holds millions of jobs at below-average pay.',
        chart: 'careerMap',
        beats: [
          {
            text: 'Pay across, hiring up, circle size is how many work there.',
            say: 'Put both questions on one picture. Left to right is what the industry pays today. Bottom to top is how fast it has been hiring over the last five years. The size of each circle is how many people already work there, so a big circle means plenty of existing jobs to aim at.',
            state: {}
          },
          {
            text: 'Split at the national average and four corners appear.',
            say: 'Split it at the national average on both measures, ' + V.money(D.benchmarks.wage, 1) + ' and ' + pct(D.benchmarks.jobs5y) + ' five-year jobs growth, and four very different corners appear.',
            state: { quadrants: true }
          },
          {
            mood: 'tension',
            text: 'Good pay and hiring is nearly empty: ' + V.fmt(by.B.jobs + by.D.jobs, 0) + 'k jobs.',
            say: 'The corner everyone wants, good pay and active hiring, is almost empty. Mining and utilities are in it, and between them they employ about ' + V.fmt(by.B.jobs + by.D.jobs, 0) + ' thousand people in the entire country. The circles are small because the opportunity is small.',
            state: {
              quadrants: true, highlight: ['B', 'D'],
              colours: { B: C.aqua, D: C.aqua }
            },
            stats: [
              { label: 'Mining and utilities', value: V.fmt(by.B.jobs + by.D.jobs, 0) + 'k jobs', accent: 'aqua' },
              { label: 'Health care alone', value: V.fmt(by.Q.jobs, 0) + 'k jobs' }
            ]
          },
          {
            mood: 'tension',
            text: 'The hiring is in the lower-paid corner, and it is millions of jobs.',
            say: 'The hiring is over here instead: health care, hospitality, education, arts, other services. These are the big circles, they are taking people on fastest, and every one of them pays below the national average. This is the trade the data actually offers someone starting out.',
            state: {
              quadrants: true, highlight: ['Q', 'H', 'P', 'R', 'S', 'O'],
              colours: { Q: C.orange, H: C.orange, P: C.orange, R: C.orange, S: C.orange, O: C.orange }
            },
            stats: [
              { label: 'Jobs in the hiring corner', value: V.fmt(by.Q.jobs + by.H.jobs + by.P.jobs + by.R.jobs + by.S.jobs + by.O.jobs, 0) + 'k', accent: 'orange' }
            ]
          },
          {
            text: 'Neither axis on its own is the answer.',
            say: 'Neither axis is the answer on its own. High pay is not high opportunity, and high growth is not high pay. What this map gives you is the shape of the trade-off, so you can choose knowing what you are choosing.',
            state: { quadrants: true },
            pivot: true
          }
        ]
      },

      // ============================================================== 07
      {
        id: 'where-to-live',
        num: '07',
        persona: 'If you can choose where to live',
        question: 'Does it matter which state you land in?',
        teaser: 'It does, but far less than the industry you pick.',
        answer: 'Western Australia pays most, but the gap between states is far smaller than the gap between industries.',
        chart: 'stateChart',
        beats: [
          {
            text: 'Average pay by state, against the national figure.',
            say: 'If you are free to choose where to live, this is the first thing to look at. Average pay by state, inflation adjusted, against the national figure of ' + V.money(D.stateBenchmark.wage, 1) + '.',
            state: { field: 'wage', benchmark: true }
          },
          {
            text: 'WA leads on mining. But states differ far less than industries.',
            say: 'Western Australia leads at ' + V.money(waWage, 1) + ', and the reason is mining, which is concentrated there. But top to bottom the states differ by about ' + stateSpread + '%, against roughly ' + industrySpread + '% between the top and bottom industries. Which work you do matters far more than which city you do it in.',
            state: { field: 'wage', benchmark: true, highlight: ['WA'] },
            stats: [
              { label: 'Spread between states', value: 'about ' + stateSpread + '%' },
              { label: 'Spread between industries', value: 'about ' + industrySpread + '%', accent: 'orange' }
            ]
          },
          {
            text: 'Switch to hiring and the ranking changes.',
            say: 'Now switch to hiring. Over the eighteen years covered, these are the states that grew their workforce fastest. It is not the same ranking, and that is the useful part: the best-paying state is not the fastest-growing one.',
            state: {
              field: 'jobsGrowth', benchmark: true,
              tickFmt: function (t) { return V.signed(t, 0); }
            }
          },
          {
            text: 'Only three measures exist by state. This shows where, not why.',
            say: 'One honest caveat. The ABS publishes only three measures by state: employment, wages and income. There is no value added by state, so none of the growth analysis in chapters 03 to 05 can be repeated here. This chart describes where people work, not why.',
            state: {
              field: 'jobsGrowth', benchmark: true,
              tickFmt: function (t) { return V.signed(t, 0); }
            },
            pivot: true
          }
        ]
      },

      // ============================================================== 08
      {
        id: 'shock',
        bed: 'tension',          // default chord for the sub-audio bed
        num: '08',
        persona: 'If you want to know how fragile a job is',
        question: 'What happens when a shock hits?',
        teaser: 'COVID, measured in jobs, industry by industry.',
        answer: 'Employment fell ' + mag(D.covidTotal.y1) + ' then rebounded ' + mag(D.covidTotal.y2) + '. One industry never rebounded.',
        chart: 'covidChart',
        beats: [
          {
            mood: 'tension',
            text: 'Jobs fell ' + mag(D.covidTotal.y1) + ' in the first COVID year.',
            say: 'Employment here is counted on 30 June each year, which puts one measurement right in the middle of the first lockdowns. Across the economy, jobs fell ' + mag(D.covidTotal.y1) + ' in that year.',
            state: { year2: false },
            stats: [{ label: 'Whole economy, to June 2020', value: pct(D.covidTotal.y1), accent: 'red' }]
          },
          {
            text: 'Arts, hospitality and admin took the worst of it.',
            say: 'The damage was not spread evenly. Arts and recreation, hospitality and administrative services took the worst of it, because that work cannot be done from a spare room. Anything needing a crowd, a venue or a visitor simply stopped.',
            state: { year2: false, highlight: ['R', 'H', 'N', 'J'] }
          },
          {
            mood: 'growth',
            text: 'The year after, the economy added ' + mag(D.covidTotal.y2) + '.',
            say: 'The following year the same industries rebounded hardest and the economy added ' + mag(D.covidTotal.y2) + '. For most of the board, COVID was a deep hole followed by a fast climb out of it. That is worth knowing on its own: a bad year is not the same thing as a bad industry.',
            state: { year2: true },
            stats: [{ label: 'The following year', value: pct(D.covidTotal.y2), accent: 'blue' }]
          },
          {
            text: 'Agriculture fell in both years. That is decline, not a pandemic.',
            say: 'With one exception. Agriculture fell in both years, and it had been falling well before 2020. That is not a pandemic, it is a long structural decline, and it is the clearest example on this site of why you should never read a single year as a trend.',
            state: { year2: true, highlight: ['A'] },
            stats: [
              { label: 'Agriculture, year one', value: pct(agri.y1), accent: 'red' },
              { label: 'Agriculture, year two', value: pct(agri.y2), accent: 'red' }
            ],
            pivot: true
          }
        ]
      },

      // ============================================================== 09
      {
        id: 'next',
        bed: 'growth',          // default chord for the sub-audio bed
        num: '09',
        persona: 'If you are choosing for the next ten years',
        question: 'And what happens next?',
        teaser: 'The one chapter that is arithmetic rather than history. Read the caveat.',
        answer: 'If the last ten years simply repeat, the economy adds ' +
          V.fmt(PJ.total.added, 0) + ' thousand jobs by ' + PJ.horizonYear +
          ', and ' + Math.round(PJ.rows[0].added / PJ.total.added * 100) +
          '% of them are in one industry.',
        chart: 'projectionBars',
        beats: [
          {
            text: 'Jobs today, before any guessing.',
            say: 'Everything so far has been history. This chapter is the only guess, and it is a deliberately dumb one: take the rate each industry has actually grown at over the last ten years, and run it ten more. Here is the starting point, jobs in ' + D.meta.baseYear + '.',
            state: { projected: false }
          },
          {
            mood: 'growth',
            text: 'Run the last ten years on: ' + V.fmt(PJ.total.then, 0) + 'k jobs by ' + PJ.horizonYear + '.',
            say: 'Now extend each bar at its own recent pace. The dashed part has not happened: it is what the last decade would give you if nothing changed. On those terms the economy reaches ' + V.fmt(PJ.total.then, 0) + ' thousand jobs by ' + PJ.horizonYear + ', about ' + V.fmt(PJ.total.added, 0) + ' thousand more than today.',
            state: { projected: true },
            stats: [
              { label: 'Jobs today', value: V.fmt(PJ.total.now, 0) + 'k' },
              { label: 'On this arithmetic, ' + PJ.horizonYear, value: V.fmt(PJ.total.then, 0) + 'k', accent: 'aqua', note: V.signed(PJ.total.growthPct, 1) + ', or ' + PJ.total.cagr + '% a year' }
            ]
          },
          {
            mood: 'growth',
            text: PJ.rows[0].short + ' alone takes ' + Math.round(PJ.rows[0].added / PJ.total.added * 100) + '% of the growth.',
            say: 'The shape of it matters more than the total. ' + PJ.rows[0].short + ' alone accounts for ' + Math.round(PJ.rows[0].added / PJ.total.added * 100) + '% of every job added, and the top three together for ' + Math.round((PJ.rows[0].added + PJ.rows[1].added + PJ.rows[2].added) / PJ.total.added * 100) + '%. The same industries that led chapters 03 and 06 lead this one, which is exactly what you would expect and exactly why it is not a forecast.',
            state: {
              projected: true,
              highlight: [PJ.rows[0].code, PJ.rows[1].code, PJ.rows[2].code]
            },
            stats: [
              { label: PJ.rows[0].short, value: '+' + V.fmt(PJ.rows[0].added, 0) + 'k', accent: 'aqua' },
              { label: PJ.rows[1].short, value: '+' + V.fmt(PJ.rows[1].added, 0) + 'k' },
              { label: PJ.rows[2].short, value: '+' + V.fmt(PJ.rows[2].added, 0) + 'k' }
            ]
          },
          {
            mood: 'tension',
            text: PJ.rows[PJ.rows.length - 1].short + ' keeps shrinking.',
            say: 'And one industry keeps going the other way. ' + PJ.rows[PJ.rows.length - 1].short + ' has been shrinking for long enough that the same arithmetic takes another ' + V.fmt(Math.abs(PJ.rows[PJ.rows.length - 1].added), 0) + ' thousand jobs out of it. This is the one projection with a long run of history behind it rather than a good decade: it is already ' + mag(by[PJ.rows[PJ.rows.length - 1].code].jobsGrowth) + ' smaller than it was in ' + D.meta.firstYear + ', and chapter 08 showed it falling straight through COVID as well.',
            state: {
              projected: true,
              highlight: [PJ.rows[PJ.rows.length - 1].code]
            },
            stats: [
              { label: PJ.rows[PJ.rows.length - 1].short, value: V.fmt(PJ.rows[PJ.rows.length - 1].added, 0) + 'k', accent: 'red', note: 'on the same arithmetic' }
            ]
          },
          {
            text: 'This is arithmetic, not a forecast.',
            say: 'Now the caveat, and it is the important part. This is a ruler laid on a chart, not a forecast. It assumes no new technology, no change to migration, no recession and no policy. Chapter 08 showed a single bad year moving some industries by seven percent, and nobody saw that one coming either. Use this for the direction of travel and the rough shape, never for the number.',
            state: { projected: true },
            pivot: true
          }
        ]
      },

      // ============================================================== 10
      {
        id: 'jobtypes',
        num: '10',
        persona: 'If you have picked an industry already',
        question: 'What do the jobs inside an industry look like?',
        teaser: 'An industry average hides jobs that pay three times each other. This is the level you actually apply at.',
        answer: 'You do not apply to an industry, you apply to a job type. Inside ' +
          spreadDiv.short + ' alone the pay runs from ' + V.money(spreadLo.wage, 1) +
          ' to ' + V.money(spreadHi.wage, 1) + '.',
        chart: 'subRanking',
        beats: [
          {
            text: 'One industry, ' + spreadSubs.length + ' very different jobs.',
            say: 'Everything so far has been whole industries. But nobody applies to an industry, they apply to a job. Here is ' + spreadDiv.short + ', broken into the ' + spreadSubs.length + ' job types the ABS measures inside it. The industry average is ' + V.money(spreadDiv.wage, 1) + ', the orange line. Look how little that average tells you.',
            state: {
              rows: spreadSubs.map(function (x) { return subRow(x, 'wage', money); }),
              reference: spreadDiv.wage,
              referenceLabel: spreadDiv.short + ' average ' + V.money(spreadDiv.wage, 1)
            },
            portrait: spreadCode,
            stats: [
              { label: shortSub(spreadHi.name), value: V.money(spreadHi.wage, 1) },
              { label: shortSub(spreadLo.name), value: V.money(spreadLo.wage, 1), accent: 'orange' }
            ]
          },
          {
            text: 'All ' + subs.length + ' job types, by pay. Scroll to find yours.',
            say: 'Now every job type in the country, ranked by pay. The list is long on purpose: scroll it, or drag it, and find the one you are actually thinking about. ' + shortSub(payAllSubs[0].name) + ' pays ' + V.money(payAllSubs[0].wage, 1) + ' at the top and ' + shortSub(payAllSubs[payAllSubs.length - 1].name) + ' ' + V.money(payAllSubs[payAllSubs.length - 1].wage, 1) + ' at the bottom. The orange line is the national average of ' + V.money(H.wageRealLast, 1) + '.',
            state: {
              rows: payAllSubs.map(function (x) { return subRow(x, 'wage', money); }),
              reference: H.wageRealLast, referenceLabel: 'national average ' + V.money(H.wageRealLast, 1),
              scrollRows: payAllSubs.length
            },
            portrait: payAllSubs[0].division,
            stats: [
              { label: shortSub(payAllSubs[0].name), value: V.money(payAllSubs[0].wage, 1), note: 'best paid of ' + subs.length },
              { label: shortSub(payAllSubs[payAllSubs.length - 1].name), value: V.money(payAllSubs[payAllSubs.length - 1].wage, 1), accent: 'orange', note: 'lowest paid' }
            ]
          },
          {
            text: 'The same list, ordered by how many people are in it.',
            say: 'Pay and headcount are different questions, and the answers barely overlap. Here is the same list reordered by how many people are actually in each job. ' + shortSub(bigSubs[0].name) + ' alone holds ' + V.fmt(bigSubs[0].jobs, 0) + ' thousand people at ' + V.money(bigSubs[0].wage, 1) + '. None of the five best-paid job types appear anywhere near the top of this one.',
            state: {
              rows: bigSubs.map(function (x) {
                return subRow(x, 'jobs', function (v) { return V.fmt(v, 0) + 'k'; }, 'aqua');
              }),
              scrollRows: bigSubs.length
            },
            portrait: bigSubs[0].division,
            stats: [
              { label: shortSub(bigSubs[0].name), value: V.fmt(bigSubs[0].jobs, 0) + 'k', note: V.money(bigSubs[0].wage, 1) },
              { label: shortSub(bigSubs[1].name), value: V.fmt(bigSubs[1].jobs, 0) + 'k', note: V.money(bigSubs[1].wage, 1) }
            ]
          },
          {
            text: 'Ordered by who has been hiring.',
            say: 'If what you need is a job rather than a career, this is the ordering that matters: how much each job type grew in the five years to ' + D.meta.baseYear + '. ' + shortSub(fastSubs[0].name) + ' added ' + mag(fastSubs[0].jobs5y) + ', and ' + shortSub(fastSubs[1].name) + ' ' + mag(fastSubs[1].jobs5y) + '. Scroll down to where your own job sits. A fast five years is not a promise, but it does tell you who is advertising.',
            state: {
              rows: fastSubs.map(function (x) {
                return subRow(x, 'jobs5y', function (v) { return pct(v); }, 'aqua');
              }),
              scrollRows: fastSubs.length
            },
            portrait: fastSubs[0].division,
            stats: [
              { label: shortSub(fastSubs[0].name), value: pct(fastSubs[0].jobs5y), accent: 'aqua', note: V.fmt(fastSubs[0].jobs, 0) + 'k jobs' },
              { label: shortSub(fastSubs[1].name), value: pct(fastSubs[1].jobs5y), note: V.fmt(fastSubs[1].jobs, 0) + 'k jobs' }
            ]
          },
          {
            text: 'Eighteen years: who grew, and who emptied out.',
            say: 'And now the whole eighteen years in one column, from the job types that grew most at the top to the ones that emptied out at the bottom. ' + shortSub(growthSubs[0].name) + ' is up ' + mag(growthSubs[0].jobsGrowth) + '. Scroll to the bottom and ' + shortSub(deadSubs[0].name) + ' has lost ' + mag(deadSubs[0].jobsGrowth) + ' of its jobs, and ' + shortSub(deadSubs[1].name) + ' ' + mag(deadSubs[1].jobsGrowth) + '. Those are not industries in trouble so much as particular jobs that were automated or moved offshore, which is exactly why the job type is the level worth looking at.',
            state: {
              rows: growthSubs.map(function (x) {
                return subRow(x, 'jobsGrowth', function (v) { return pct(v); },
                  x.jobsGrowth >= 0 ? 'aqua' : 'red');
              }),
              diverging: true,
              scrollRows: growthSubs.length
            },
            portraits: [growthSubs[0].division, deadSubs[0].division],
            stats: [
              { label: shortSub(growthSubs[0].name), value: pct(growthSubs[0].jobsGrowth), accent: 'aqua', note: D.meta.firstYear + ' to ' + D.meta.baseYear },
              { label: shortSub(deadSubs[0].name), value: pct(deadSubs[0].jobsGrowth), accent: 'red' }
            ],
            pivot: true
          }
        ]
      },

      // ============================================================== 11
      {
        id: 'advice',
        num: '11',
        persona: 'If you only read one chapter',
        question: 'So what should you actually do?',
        teaser: 'Ten chapters of evidence turned into seven decisions, each with something to actually do.',
        answer: 'Choose the job type, not the industry. Go where the hiring is if you need work ' +
          'now and where the pay is if you can wait. And expect to get a raise by moving, not by ' +
          'waiting for your industry to grow.',
        chart: 'adviceBoard',
        beats: [
          {
            text: 'Want the biggest pay packet? Be ready to move.',
            say: 'Everything before this was evidence. This is what to do about it. Seven rows, one for each thing people usually want out of a career, and each one ends with something to actually do. Start with the most common wish, the biggest pay packet. ' + payTop[0].short + ' at ' + money(payTop[0].wage) + ', then ' + payTop[1].short + ' at ' + money(payTop[1].wage) + ' and ' + payTop[2].short + ' at ' + money(payTop[2].wage) + '. Now the catch. Between them these three hold only ' + V.fmt(payTop[0].jobs + payTop[1].jobs + payTop[2].jobs, 0) + ' thousand jobs, against ' + V.fmt(jobsTop[0].jobs + jobsTop[1].jobs + jobsTop[2].jobs, 0) + ' thousand in the three on the next row, and most of that work is not in the capital cities. So if you are choosing on pay alone, accept what comes with it: be prepared to relocate, and do not build a plan around one of these unless you are.',
            state: { rows: ADVICE, upto: 1, focus: 0 },
            portraits: payTop.map(function (d) { return d.code; }),
            stats: [
              { label: payTop[0].short, value: money(payTop[0].wage), note: V.fmt(payTop[0].jobs, 0) + 'k jobs only' },
              { label: 'All three together', value: V.fmt(payTop[0].jobs + payTop[1].jobs + payTop[2].jobs, 0) + 'k', note: 'about one worker in twenty-four' }
            ]
          },
          {
            text: 'Need options? Apply here, then aim inside.',
            say: 'If what you need is options rather than the highest wage, go where the jobs are. ' + jobsTop[0].short + ' holds ' + V.fmt(jobsTop[0].jobs, 0) + ' thousand jobs, ' + jobsTop[1].short + ' ' + V.fmt(jobsTop[1].jobs, 0) + ' thousand and ' + jobsTop[2].short + ' ' + V.fmt(jobsTop[2].jobs, 0) + ' thousand. Between them that is most of the working country. Two of the three pay under the ' + money(H.wageRealLast) + ' average, ' + jobsTop[0].short + ' at ' + money(jobsTop[0].wage) + ' and ' + jobsTop[1].short + ' at ' + money(jobsTop[1].wage) + '. So do this: get in on the wide door, then treat that wage as a floor rather than a ceiling. Inside each of these industries there are job types paying nearly twice the industry average, and chapter 10 is the list. Pick the one you are aiming at before you start, not after.',
            state: { rows: ADVICE, upto: 2, focus: 1 },
            portraits: jobsTop.map(function (d) { return d.code; }),
            stats: [
              { label: jobsTop[0].short, value: V.fmt(jobsTop[0].jobs, 0) + 'k', note: money(jobsTop[0].wage) + ', below average' },
              { label: jobsTop[2].short, value: V.fmt(jobsTop[2].jobs, 0) + 'k', note: money(jobsTop[2].wage) + ', above average' }
            ]
          },
          {
            text: 'Need work this month? Apply here, and set a leaving date.',
            say: 'If the problem is immediate, income this month rather than a career, look at who has been hiring. Over the five years to ' + D.meta.baseYear + ', ' + hiringTop[0].short + ' grew ' + mag(hiringTop[0].jobs5y) + ', ' + hiringTop[1].short + ' ' + mag(hiringTop[1].jobs5y) + ' and ' + hiringTop[2].short + ' ' + mag(hiringTop[2].jobs5y) + '. These are the easiest doors in the country to walk through, and ' + hiringTop[1].short + ' pays ' + money(hiringTop[1].wage) + ', the lowest of any industry. So do two things. Send the applications here, and put a date in the calendar for leaving. The next two rows show what happens to people who do not.',
            state: { rows: ADVICE, upto: 3, focus: 2 },
            portraits: hiringTop.map(function (d) { return d.code; }),
            stats: [
              { label: hiringTop[0].short, value: pct(hiringTop[0].jobs5y), accent: 'aqua', note: money(hiringTop[0].wage) },
              { label: hiringTop[1].short, value: pct(hiringTop[1].jobs5y), note: money(hiringTop[1].wage) + ', lowest paid' }
            ]
          },
          {
            foley: 'digital',   // professional qualifications: the sub-audio texture
            text: 'Have a qualification? Search by job title, never by industry.',
            say: 'By a qualification I mean something you already hold and can have recognised here: a degree, a trade certificate, or a licence, the kind of thing that gets assessed for a skilled visa or accepted by an Australian employer. If that is you, the advice is specific. Do not search by industry, search by job type, because the industry average will mislead you by tens of thousands of dollars. The three best paid job types with a real labour market behind them are ' + shortSub(skilledTop[0].name) + ' at ' + money(skilledTop[0].wage) + ', ' + shortSub(skilledTop[1].name) + ' at ' + money(skilledTop[1].wage) + ' and ' + shortSub(skilledTop[2].name) + ' at ' + money(skilledTop[2].wage) + '. So before you commit to a move, check that your qualification maps to one of those titles rather than to the industry it sits in. Chapter 10 has the full list, and you can scroll it.',
            state: { rows: ADVICE, upto: 4, focus: 3 },
            portraits: skilledTop.map(function (d) { return d.division; }),
            stats: [
              { label: shortSub(skilledTop[0].name), value: money(skilledTop[0].wage), note: V.fmt(skilledTop[0].jobs, 0) + 'k jobs, ' + pct(skilledTop[0].jobs5y) + ' in 5y' },
              { label: 'Its industry average', value: money(by[skilledTop[0].division].wage), note: 'which is what a search by industry would have told you' }
            ]
          },
          {
            mood: 'tension',
            text: 'A rising average is a warning, not an invitation.',
            say: 'Now the row that changes how you read the whole site. The industries where pay genuinely rose after inflation are ' + realUp[0].short + ', up ' + mag(realUp[0].wageGrowth) + ', ' + realUp[1].short + ' at ' + mag(realUp[1].wageGrowth) + ' and ' + realUp[2].short + ' at ' + mag(realUp[2].wageGrowth) + ', against ' + mag(H.wageRealGrowth) + ' for the average worker. But look at what they have in common. ' + realUp[0].short + ' shed ' + mag(realUp[0].jobsGrowth) + ' of its jobs and ' + realUp[2].short + ' barely grew at all. The average went up because the people went down, and the ones left are more specialised. So read a rising average as a warning rather than an invitation: it means a higher bar to get in, not a raise waiting for you. If you want one of these, go and get the specific qualification first.',
            state: { rows: ADVICE, upto: 5, focus: 4 },
            portraits: realUp.map(function (d) { return d.code; }),
            stats: [
              { label: realUp[0].short + ', real pay', value: pct(realUp[0].wageGrowth), accent: 'aqua' },
              { label: 'Its jobs, same years', value: pct(realUp[0].jobsGrowth), accent: 'red', note: 'fewer people, each paid more' }
            ]
          },
          {
            text: 'In these, the wage you start on is the wage you keep.',
            say: 'The other end of the same column, and the most practical row here. In ' + realFlat[0].short + ' real pay has risen ' + mag(realFlat[0].wageGrowth) + ' in eighteen years, in ' + realFlat[1].short + ' ' + mag(realFlat[1].wageGrowth) + ', and in ' + realFlat[2].short + ', the best-paid industry in the country, ' + mag(realFlat[2].wageGrowth) + '. In real money that is frozen. So if you start in one of these, plan the exit on day one: the wage you accept in your first year is roughly the wage you will still have in your tenth. Pick the certificate or licence that moves you into a better-paid job type in a neighbouring industry, and treat the first job as the thing that pays for it. Waiting for the industry to pay you more is the one plan the data says does not work.',
            state: { rows: ADVICE, upto: 6, focus: 5 },
            portraits: realFlat.map(function (d) { return d.code; }),
            stats: [
              { label: realFlat[0].short, value: pct(realFlat[0].wageGrowth), accent: 'orange', note: 'real, in eighteen years' },
              { label: realFlat[2].short, value: pct(realFlat[2].wageGrowth), accent: 'orange', note: 'and it pays the most of all' }
            ]
          },
          {
            text: 'Do not spend three years qualifying into a shrinking industry.',
            say: 'One warning to finish. The three slowest-growing industries over the whole period are ' + slowest[0].short + ' at ' + pct(slowest[0].ivaGrowth) + ' in real terms, ' + slowest[1].short + ' at ' + pct(slowest[1].ivaGrowth) + ' and ' + slowest[2].short + ' at ' + pct(slowest[2].ivaGrowth) + '. ' + slowest[0].short + ' is the only one genuinely smaller than it was in ' + D.meta.firstYear + ', and in the raw dollars on the page it still looks like growth, which is exactly the trap chapter 02 was about. So the advice is not to avoid them outright. It is this: do not spend three years qualifying into one of these on the strength of the industry name. Go to chapter 10, find the specific job type, and check that the job type is still growing even where the industry is not. Several of them are.',
            state: { rows: ADVICE, upto: 7, focus: 6 },
            portraits: slowest.map(function (d) { return d.code; }),
            stats: [
              { label: slowest[0].short, value: pct(slowest[0].ivaGrowth), accent: 'red', note: 'real, ' + D.meta.firstYear + ' to ' + D.meta.baseYear },
              { label: 'Its jobs', value: pct(slowest[0].jobsGrowth), accent: 'red' }
            ]
          },
          {
            text: 'Three rules. Job type, timing, and how raises actually happen.',
            say: 'And here is the rule underneath all seven rows. Across the eighteen industries growth and hiring move together almost perfectly, but growth and real pay have no relationship at all. A growing industry is a reliable promise of work and an unreliable promise of a raise. So, three things to take away. First, choose the job type, not the industry: that is where the difference between forty thousand and a hundred and forty thousand lives. Second, if you need work now go where the hiring is, and if you can wait, go where the pay is and get the qualification that opens it. Third, expect to get your raise by changing employer or changing job type, because eighteen years of this data say that waiting for your industry to grow will not do it for you.',
            state: { rows: ADVICE, upto: 7, focus: null },
            stats: [
              { label: 'Growth and jobs', value: '+' + D.corr.ivaJobs.spearman, note: 'move together' },
              { label: 'Growth and real pay', value: String(D.corr.ivaWage.spearman), accent: 'orange', note: 'no link at all' }
            ],
            pivot: true
          }
        ]
      }
    ];
  }

  global.CHAPTERS = { build: build };
})(window);
