/* film.js - "The 5-minute story": the Assignment 5 story artifact.
 *
 * The rest of the site is an overview for anyone. This is a short explainer
 * film for anyone too, cut like a documentary: act title cards, footage with
 * the narration running over it, then the chart that proves the point. Two
 * personas from the Journal 3 storyboard appear where their needs make a
 * finding concrete, and nowhere else:
 *   Mia, 22   finishing an engineering degree, no one depends on her. She
 *             needs a FIRST DOOR.
 *   Alex, 34  coordinates projects in medical and other health care services,
 *             a mortgage, two children. He needs a RAISE without leaving
 *             health care: private hospitals, the best-paid part of it.
 *
 * Rules it keeps:
 *   1. Every figure is interpolated from window.STORY, exactly like chapters.js,
 *      so the film can never disagree with the site.
 *   2. Every chart IS a site chart: a chapter's builder and beat state, drawn in
 *      its own Scene, so chapters 03 and 04's dots morph here too.
 *   3. It plays itself and advances on the READING (each recorded mp3 ending),
 *      never on a guessed timer, and is held under five minutes:
 *      `FILM.duration()` adds up the clips, the tails and the title cards.
 *   4. Footage is never silent: a scene's `roll` has its own voice-over line
 *      (key film-NN-r), and each clip is cut long enough for its line
 *      (fetch_story_clips.py), so it plays at its own speed. Footage sits at the START or the END of a scene,
 *      never in the middle, so the picture never goes slide, video, slide.
 */
(function (global) {
  'use strict';

  var V = global.VIZ, CH = global.CHARTS, D = global.STORY;
  var MIA = '#3987e5', ALEX = '#d95926';
  var STING = 1.6;                      // seconds an act title card holds
  var HOLD = 0.6;                       // breath after a slide's narration
  var TAIL = 0.5;                       // footage runs this long past its voice
  var CLIP_SEC = 8.0;                   // fallback until a clip's own length is known
  var BYTES_PER_SEC = 6000;             // edge-tts: CBR 48 kbit/s mono mp3
  var ACTS = { I: 'The question', II: 'Where the pay is', III: 'Where the jobs are',
               IV: 'Both at once', V: 'What to do' };

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  // ------------------------------------------------------------ the script
  function script() {
    var H = D.economy.headline;
    var by = {}, sb = {};
    D.divisions.forEach(function (d) { by[d.code] = d; });
    D.subdivisions.forEach(function (s) { sb[s.code] = s; });
    var vis = D.divisions.filter(function (d) { return !d.hidden; });
    var millions = (H.jobsLast / 1000).toFixed(1);
    var oneIn = Math.round(H.jobsLast / by.B.jobs);
    var Q = by.Q, Hh = by.H;
    var bw = D.benchmarks.wage, bj = D.benchmarks.jobs5y;
    var m = function (v) { return V.money(v, 1); };
    var p1 = function (v) { return V.fmt(Math.abs(v), 1) + '%'; };
    // every comparison of sizes is also said as a share or a multiple
    var share = function (jobs) { return V.fmt(jobs / H.jobsLast * 100, 1) + '%'; };
    var times = function (a, b) {
      var r = a / b;
      return r > 1.9 && r < 2.1 ? 'twice' : r > 0.4 && r < 0.6 ? 'about half' : V.fmt(r, 1) + ' times';
    };
    // what the VOICE says: whole dollars, rounded shares, words for multiples
    var k$ = function (v) { return '$' + Math.round(v) + 'k'; };
    var pct = function (jobs) { return jobs / H.jobsLast * 100; };
    var aboutPct = function (p) { return p < 2 ? 'under 2%' : 'about ' + Math.round(p) + '%'; };
    var oneInN = function (p) { return 'about one in ' + Math.round(100 / p); };
    var timesW = function (a, b) {
      var r = a / b;
      return r < 0.6 && r > 0.4 ? 'about half' : r < 1.9 ? 'about ' + V.fmt(r, 1) + ' times' : r < 2.1 ? 'twice' :
        r < 2.45 ? 'more than twice' : r < 2.65 ? 'two and a half times' : 'about ' + Math.round(r) + ' times';
    };
    var fracW = function (p) {
      var o = [[25, 'a quarter'], [33.3, 'a third'], [50, 'half'], [66.7, 'two thirds'], [75, 'three quarters']];
      return o.sort(function (a, c) { return Math.abs(a[0] - p) - Math.abs(c[0] - p); })[0][1];
    };
    var media = global.FILM_MEDIA || {};
    var photo = function (k) { return media[k] ? media[k].src : null; };
    var clip = function (k) { return media.clips && media.clips[k] ? media.clips[k].src : null; };
    var low = function (s) { return s.name.replace(/ \(.*\)$/, '').replace(/ pick-up and delivery services$/, '').toLowerCase(); };
    var kids = function (div) { return D.subdivisions.filter(function (s) { return s.division === div; }); };
    var top = function (rows, k) { return rows.slice().sort(function (a, c) { return c[k] - a[k]; }); };

    /* Mia, 22: graduating in electrical engineering; she will work as an
       engineer, the open question is where. Her instinct: mining, the top
       salary. Alex, 34: coordinates projects in medical and other health care
       services ($52.5k), told to wait for health care's boom to lift his pay.
       Neither changes career: Mia picks among engineering job types, Alex
       moves to the best-paid job type of his own industry, private hospitals
       ($74.8k). Every name is a job type in the data, nothing is inferred.
       Hospitals hire more slowly than average, so the film says plainly that
       Alex's pick is OUTSIDE the corner: he needs pay, not a door.

       The funnel, wide to narrow: pay alone -> hiring alone -> both, by
       industry -> three industries for three needs -> both, by job type ->
       the corner's strongest options, by pay, speed and size -> the two that
       FIT our people (said plainly: fit, not rank) -> what each does -> the
       rules for anyone. */
    var corner = by.B.jobs + by.D.jobs;
    // three industries, three needs (like chapter 11's board)
    var payTop = top(vis, 'wage')[0], waysTop = top(vis, 'jobs')[0];
    var rank = function (k) { var o = {}; top(vis, k).forEach(function (d, i) { o[d.code] = i; }); return o; };
    var rw = rank('wage'), rj = rank('jobs5y'), rs = rank('jobs');
    var score = function (d) { return rw[d.code] + rj[d.code] + rs[d.code]; };
    var nice = function (d) { return d.short === 'Professional' ? 'Professional services' : d.short; };
    var spoke = function (d) { return nice(d).replace(/ & /g, ' and ').toLowerCase(); };
    var listOf = function (rows) { return spoke(rows[0]) + ', ' + spoke(rows[1]) + ', and ' + spoke(rows[2]); };
    var jobsOf = function (rows) { return rows.reduce(function (a, d) { return a + d.jobs; }, 0); };
    // the top three for each need; balance = best combined rank of pay, hiring and size
    var pay3 = top(vis, 'wage').slice(0, 3), ways3 = top(vis, 'jobs').slice(0, 3);
    var bal3 = vis.slice().sort(function (a, c) { return score(a) - score(c) || c.jobs - a.jobs; }).slice(0, 3);
    var floorK = Math.floor(Math.min.apply(null, pay3.map(function (d) { return d.wage; })) / 10) * 10;
    var usedPhoto = {};
    var col = function (when, tag, rows, v, val, note) {
      // the top industry's photograph, unless a column to its left already shows it
      var pic = rows.map(function (d) { return d.photo; }).filter(function (ph) { return ph && !usedPhoto[ph]; })[0] || rows[0].photo;
      usedPhoto[pic] = 1;
      return { when: when, tag: tag, photo: pic, note: note,
               rows: rows.map(function (d) { return { icon: d.icon, name: nice(d), v: v(d), val: val(d) }; }) };
    };

    // one level down: job types well paid AND hiring faster than average
    var jtCorner = D.subdivisions.filter(function (s) { return s.wage > bw && s.jobs5y > bj; });
    var jtJobs = jtCorner.reduce(function (a, s) { return a + s.jobs; }, 0);
    var big = jtCorner.filter(function (s) { return s.jobs >= 50; });
    var byPay = top(big, 'wage'), byHire = top(big, 'jobs5y'), bySize = top(big, 'jobs');
    var nameOf = { E31: 'Heavy and civil engineering', D26: 'Electricity supply', B08: 'Metal ore mining',
                   M69: 'Professional services', P80: 'Private schools', E30: 'Building construction',
                   Q84: 'Private hospitals', Q85: 'Medical and other health care' };
    var shortOf = function (s) { return nameOf[s.code] || s.name.replace(/ \(private\)$/, ''); };
    var said = function (s) { return shortOf(s).toLowerCase(); };
    // the two picks, by FIT: Mia's electrical degree (a corner job type); Alex stays in
    // health care and moves from where he is to its best-paid job type (outside the corner)
    var MIA_PICK = sb.D26, ALEX_FROM = sb.Q85, ALEX_PICK = top(kids('Q'), 'wage')[0];
    var list = [];
    [byPay[0], byPay[1], byHire[0], byHire[1], bySize[0], bySize[1], MIA_PICK].forEach(function (s) {
      if (list.indexOf(s) < 0) list.push(s);
    });
    var tagsOf = function (s) {
      var t = [];
      if (s === byPay[0]) t.push('Best paid');
      if (s === byHire[0]) t.push('Fastest hiring');
      if (s === bySize[0]) t.push('Biggest');
      return t;
    };
    var shortlist = top(list, 'wage').map(function (s) {
      return { name: shortOf(s), photo: s.photo, pay: m(s.wage), hire: V.signed(s.jobs5y, 1), share: share(s.jobs),
               v: { wage: s.wage, hire: s.jobs5y, jobs: s.jobs },
               best: { wage: s === byPay[0], hire: s === byHire[0], jobs: s === bySize[0] }, tags: tagsOf(s),
               who: s === MIA_PICK ? 'mia' : s === ALEX_PICK ? 'alex' : null };
    });

    // the widest pay spread inside one industry (rule two)
    var spread = null;
    vis.forEach(function (d) {
      var k = kids(d.code);
      if (k.length < 2) return;
      var lo = Math.min.apply(null, k.map(function (s) { return s.wage; }));
      var hi = Math.max.apply(null, k.map(function (s) { return s.wage; }));
      if (!spread || hi / lo > spread.hi / spread.lo) {
        spread = { d: d, lo: lo, hi: hi,
                   loS: k.filter(function (s) { return s.wage === lo; })[0], hiS: k.filter(function (s) { return s.wage === hi; })[0] };
      }
    });
    // rule three: waiting (the industry that grew most) against moving
    var grew = top(vis, 'ivaGrowth')[0];

    return [
      // ---------------------------------------------------- I: the question
      { act: 'I', kind: 'hook', mood: 'neutral', big: millions + 'M', bg: photo('city'),
        head: 'Where should you join them?',
        roll: { at: 'pre', panes: [{ clip: clip('city'), label: 'Australia, ' + D.meta.baseYear }],
                say: 'Every working day, ' + millions + ' million people go to work across Australia.' },
        say: 'Choosing where is one of the biggest decisions you will make here. We will answer it with two questions: does the work pay, and is it hiring?' },

      { act: 'I', kind: 'cast', bg: photo('campus'), bgClips: [clip('students'), clip('hospital2')], mood: 'neutral',
        head: 'Two people, two different needs.',
        say: 'Two people will test the usual advice. Mia, twenty-two, is graduating in electrical engineering; her instinct says mining, because it pays the most. Alex, thirty-four, coordinates projects in medical and other health care, and has two children. He is told to wait: health care is booming, so the raise will come.' },

      // ---------------------------------------------------- II: where the pay is
      { act: 'II', kind: 'chart', chapter: 'pay', beat: 1, mood: 'neutral', foley: 'heavy',
        head: 'Mining pays the most.',
        say: 'Start with pay, where Mia\'s instinct points. Mining wins at ' + k$(by.B.wage) + ' a year, ' + timesW(by.B.wage, bw) + ' the ' + k$(bw) + ' average.',
        roll: { at: 'post', panes: [{ clip: clip('mining'), label: 'Mining, ' + m(by.B.wage) + ', ' + share(by.B.jobs) + ' of all jobs' }],
                say: 'But mining employs only about ' + Math.round(by.B.jobs / 10) * 10 + ' thousand people: ' + aboutPct(pct(by.B.jobs)) + ' of all workers.' } },

      // ---------------------------------------------------- III: where the jobs are
      { act: 'III', kind: 'chart', chapter: 'jobs', beat: 1, mood: 'growth',
        head: 'Growth creates jobs.',
        say: 'Now hiring. Across ' + vis.length + ' industries over eighteen years, when an industry grows, it hires: the dots climb together.' },

      { act: 'III', kind: 'chart', chapter: 'wages', beat: 1, mood: 'tension',
        head: 'But growth does not create raises.',
        say: 'Keep the same dots and ask about pay, after inflation. The line goes flat.',
        roll: { at: 'post', panes: [{ clip: clip('hospital'), label: nice(grew) + ': output ' + V.signed(grew.ivaGrowth, 1) + ', real pay ' + V.signed(grew.wageGrowth, 1) }],
                say: 'That is Alex\'s trap: ' + grew.short.toLowerCase() + '\'s output grew the most, to ' + timesW(1 + grew.ivaGrowth / 100, 1) + ' its old size, yet its real pay rose under ' + Math.ceil(grew.wageGrowth) + '%, ' + timesW(grew.wageGrowth, H.wageRealGrowth) + ' the average.' } },

      { act: 'III', kind: 'chart', chapter: 'where', beat: 1, mood: 'neutral',
        head: 'Growth went into hiring, not pay.',
        say: 'Why? ' + fracW(H.jobsShareOfGrowth).replace(/^a /, 'A ').replace(/^t/, 'T').replace(/^h/, 'H') + ' of the growth came from hiring more people, only ' + fracW(H.productivityShareOfGrowth) + ' from each person producing more, and pay follows the second part. So ask both questions at once.' },

      // ---------------------------------------------------- IV: both at once, wide to narrow
      { act: 'IV', kind: 'chart', chapter: 'map', beat: 2, mood: 'tension',
        head: 'Well paid AND hiring: ' + share(corner) + ' of jobs.',
        say: 'Put both on one map. Among whole industries, only mining and utilities are well paid and hiring fast, and together they hold just ' + aboutPct(pct(corner)) + ' of all jobs.',
        roll: { at: 'post', panes: [
                  { photo: ALEX_FROM.photo, label: 'Health care, ' + m(Q.wage) },
                  { clip: clip('cafe'), label: 'Hospitality, ' + m(Hh.wage) }],
                say: 'Health care and hospitality hire the most, but both pay below the average wage.' } },

      { act: 'IV', kind: 'board', mood: 'neutral',
        head: 'Three needs, three different top threes.',
        cols: [
          col('For pay', 'Pays the most', pay3, function (d) { return d.wage; }, function (d) { return m(d.wage); },
              'Together ' + share(jobsOf(pay3)) + ' of all jobs'),
          col('For ways in', 'Most ways in', ways3, function (d) { return d.jobs; }, function (d) { return share(d.jobs) + ' of jobs'; },
              'Together ' + share(jobsOf(ways3)) + ' of all jobs'),
          col('For a balance', 'Best balance', bal3, function (d) { return 3 * vis.length - score(d); }, function (d) { return m(d.wage) + ', ' + share(d.jobs); },
              'Best combined rank for pay, hiring and size')
        ],
        say: 'For pay: ' + listOf(pay3) + ', all above $' + floorK + 'k, but together just ' + aboutPct(pct(jobsOf(pay3))) + ' of jobs. For ways in: ' + listOf(ways3) + ', with more than ' + fracW(pct(jobsOf(ways3))) + ' of all jobs between them. For a balance of pay, hiring and size: ' + listOf(bal3) + '.' },

      { act: 'IV', kind: 'chart', builder: 'jobTypeMap', state: { stage: 'corner' }, mood: 'growth',
        head: 'One level down, the corner fills up.',
        say: 'Inside those industries are ' + D.subdivisions.length + ' job types. Here the well-paid, fast-hiring corner holds ' + jtCorner.length + ' of them and almost ' + Math.round(jtJobs / 1000) + ' million jobs, ' + oneInN(pct(jtJobs)) + ' workers.' },

      { act: 'IV', kind: 'shortlist', mood: 'neutral', rows: shortlist,
        head: 'The strongest options in the corner.',
        say: shortOf(byPay[0]) + ' pays the most, about ' + k$(byPay[0].wage) + '. ' + shortOf(byHire[0]) + ' hires fastest, up almost ' + fracW(byHire[0].jobs5y) + ' in five years, ' + timesW(byHire[0].jobs5y, bj) + ' the average. ' + shortOf(bySize[0]) + ' is the biggest, ' + oneInN(pct(bySize[0].jobs)) + ' jobs. For Mia, fit decides: her electrical degree points to ' + said(MIA_PICK) + '. Alex\'s answer is not in this corner at all.' },

      { act: 'IV', kind: 'chart', builder: 'jobTypeMap', mood: 'growth',
        state: { stage: 'focus', focus: [MIA_PICK.code], note: ALEX_PICK.code, names: nameOf },
        head: 'Their two picks, on the map.',
        say: 'Mia\'s pick sits high in the corner. Alex\'s sits lower: ' + said(ALEX_PICK) + ' hire more slowly than average, but pay the most in health care. Alex already has a job; he needs the pay, not a door.',
        roll: { at: 'post', panes: [
                  { photo: ALEX_PICK.photo, label: shortOf(ALEX_PICK) + ', ' + m(ALEX_PICK.wage) },
                  { clip: clip('power'), label: shortOf(MIA_PICK) + ', ' + m(MIA_PICK.wage) }],
                say: 'Mia\'s job type pays ' + timesW(MIA_PICK.wage, bw) + ' the national average. Alex\'s pays ' + timesW(ALEX_PICK.wage, ALEX_FROM.wage) + ' the average where he works now.' } },

      // ---------------------------------------------------- V: what to do
      { act: 'V', kind: 'decide', bg: MIA_PICK.photo, mood: 'growth',
        head: 'Mia finds a door. Alex moves up.',
        people: [
          { who: 'mia', need: 'A first door', quote: 'Not the biggest salary. A door that is open.',
            job: shortOf(MIA_PICK), fig: m(MIA_PICK.wage) + ', hiring ' + V.signed(MIA_PICK.jobs5y, 1) },
          { who: 'alex', need: 'A raise, not a restart', quote: 'Same industry, a better-paid job type.',
            job: shortOf(ALEX_PICK), fig: m(ALEX_PICK.wage) + ', up from ' + m(ALEX_FROM.wage) }
        ],
        say: 'So, Mia picks ' + said(MIA_PICK) + ' over ' + said(byPay[0]) + ': it uses her degree and is hiring faster. Alex stops waiting: he takes his project skills to ' + said(ALEX_PICK) + ', still in health care, where the average job pays about ' + k$(ALEX_PICK.wage) + ', against ' + k$(ALEX_FROM.wage) + ' where he works now.',
        roll: { at: 'post', panes: [{ clip: clip('crane'), label: '' }],
                say: 'Same data. Different needs. Different decisions.' } },

      { act: 'V', kind: 'rules', mood: 'answer',
        head: 'Three rules for anyone.',
        rules: [
          { when: 'First,', t: 'Ask both questions: does it pay, and is it hiring?',
            d: 'Mining pays ' + times(by.B.wage, bw) + ' the average, ' + m(by.B.wage) + ' a year, but holds only ' + share(by.B.jobs) + ' of all jobs. A top salary is no use if nobody is hiring.' },
          { when: 'Second,', t: 'Judge the job type, not the industry.',
            d: 'Inside ' + spread.d.short.toLowerCase() + ' alone, average pay runs from ' + m(spread.lo) + ' in ' + low(spread.loS) + ' to ' + m(spread.hi) + ' in ' + low(spread.hiS) + ', ' + times(spread.hi, spread.lo) + ' as much. The industry average hides both.' },
          { when: 'Third,', t: 'For a raise, move to a better-paid job type.',
            d: 'Industry growth rarely lifts your pay: ' + grew.short.toLowerCase() + '\'s output grew ' + p1(grew.ivaGrowth) + ' in eighteen years, its real pay only ' + p1(grew.wageGrowth) + '. A move does: inside it, ' + said(ALEX_PICK) + ' pay ' + m(ALEX_PICK.wage) + ', ' + low(ALEX_FROM) + ' ' + m(ALEX_FROM.wage) + '.' }
        ],
        say: 'For anyone else, three rules. First, ask both questions: does it pay, and is it hiring? Mining pays ' + timesW(by.B.wage, bw) + ' the average, but holds ' + aboutPct(pct(by.B.jobs)) + ' of jobs. Second, judge the job type, not the industry: inside ' + spread.d.short.toLowerCase() + ' alone, pay runs from about ' + k$(spread.lo) + ' to ' + k$(spread.hi) + '. Third, for a raise, move to a better-paid job type instead of waiting: ' + grew.short.toLowerCase() + ' grew the most, yet its real pay barely moved, while inside it, ' + said(ALEX_PICK) + ' pay ' + timesW(ALEX_PICK.wage, ALEX_FROM.wage) + ' as much as ' + said(ALEX_FROM) + '.' },

      { act: 'V', kind: 'end', bg: photo('office'), mood: 'answer',
        head: 'Now look up your own.',
        say: 'Your answer depends on what you need. Look up your own job type, and judge any advice by both numbers: does it pay, and is it hiring?' }
    ];
  }

  // ------------------------------------------------------------ pictures
  function avatar(color, letter, size) {
    size = size || 132;
    return '<svg class="fa" viewBox="0 0 120 120" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<circle cx="60" cy="60" r="57" fill="none" stroke="' + color + '" stroke-width="3"/>' +
      '<circle cx="60" cy="60" r="52" fill="' + color + '" fill-opacity="0.16"/>' +
      '<circle cx="60" cy="46" r="18" fill="' + color + '"/>' +
      '<path d="M24 98c4-19 19-30 36-30s32 11 36 30" fill="' + color + '"/>' +
      '<text x="60" y="52" text-anchor="middle" font-size="16" font-weight="700" fill="#0a0c10">' + letter + '</text>' +
      '</svg>';
  }
  // Mia and Alex are played by two stock clips (magnific.com free videos), so
  // the people have faces; the face crops are stills from the same clips
  function face(w, size) {
    return '<img class="fa f-face" src="' + w.face + '" alt="" width="' + size + '" height="' + size + '" style="--c:' + w.color + '">';
  }
  var WHO = {
    mia: { name: 'Mia', color: MIA, letter: 'M', role: '22, graduating in electrical engineering',
           face: 'assets/img_story/mia_face.jpg', clip: 'assets/clips/mia.mp4', pos: '34% 45%',
           need: 'Needs a first door', traits: ['Wants a job that uses her degree', 'Instinct: mining pays most'] },
    alex: { name: 'Alex', color: ALEX, letter: 'A', role: '34, project coordinator, medical and other health care',
            face: 'assets/img_story/alex_face.jpg', clip: 'assets/clips/alex.mp4', pos: '41% 50%',
            need: 'Needs a raise, not a restart', traits: ['Mortgage, two children', 'Told: wait, health care is booming'] }
  };

  function card(s) {
    if (s.kind === 'hook') {
      return '<div class="f-hook"><div class="f-big" data-count="' + esc(s.big) + '">' + esc(s.big) + '</div>' +
        '<div class="f-sub">people at work, ' + D.meta.baseYear + '</div></div>';
    }
    if (s.kind === 'cast') {
      return '<div class="f-cast">' + ['mia', 'alex'].map(function (k, i) {
        var w = WHO[k];
        // the face first, the facts below it; the clip starts when the voice reaches the person
        return '<div class="f-castcard f-person2" data-when="' + w.name + ',' + '" style="--c:' + w.color + ';--d:' + (0.15 + i * 0.35) + 's">' +
          '<figure class="f-castv"><video muted playsinline preload="auto" src="' + w.clip + '" style="object-position:' + w.pos + '"></video></figure>' +
          '<div class="f-castmeta"><div class="f-name">' + w.name + '</div><div class="f-role">' + esc(w.role) + '</div>' +
          '<div class="f-need">' + esc(w.need) + '</div>' +
          '<ul class="f-traits">' + w.traits.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div></div>';
      }).join('') + '</div>';
    }
    if (s.kind === 'board') {
      // three columns, a photograph and a top three each; a column lights as the voice reaches it
      return '<div class="f-cols">' + s.cols.map(function (c) {
        var max = Math.max.apply(null, c.rows.map(function (r) { return r.v; }));
        return '<div class="f-col" data-when="' + esc(c.when) + '"><figure class="f-colph"><img src="' + c.photo + '" alt=""><span>' + esc(c.tag) + '</span></figure>' +
          '<ol>' + c.rows.map(function (r) {
            return '<li><span class="f-ci" aria-hidden="true">' + r.icon + '</span><span class="f-cn">' + esc(r.name) + '</span>' +
              '<span class="f-cb"><i style="width:' + (r.v / max * 100).toFixed(1) + '%"></i></span><b>' + esc(r.val) + '</b></li>';
          }).join('') + '</ol><p>' + esc(c.note) + '</p></div>';
      }).join('') + '</div>';
    }
    if (s.kind === 'shortlist') {
      // one card per job type: its photograph, three bars on shared scales, the winner of each bolded
      var mx = { wage: 0, hire: 0, jobs: 0 };
      s.rows.forEach(function (r) { ['wage', 'hire', 'jobs'].forEach(function (k) { mx[k] = Math.max(mx[k], r.v[k]); }); });
      return '<div class="f-jcards">' + s.rows.map(function (r) {
        var w = r.who && WHO[r.who];
        var met = function (k, label, val) {
          return '<div class="f-jm' + (r.best[k] ? ' best' : '') + '"><span>' + label + '</span><span class="f-jb"><i style="width:' +
            Math.max(4, r.v[k] / mx[k] * 100).toFixed(1) + '%"></i></span><b>' + esc(val) + '</b></div>';
        };
        return '<div class="f-jc' + (w ? ' f-pick' : '') + '" ' + (w ? 'data-when="fit decides" style="--c:' + w.color + '"' : 'data-dim-when="fit decides"') + '>' +
          '<figure><img src="' + r.photo + '" alt="">' +
          '<span class="f-jtags">' + r.tags.map(function (t) { return '<span class="f-jt">' + esc(t) + '</span>'; }).join('') + '</span>' +
          (w ? '<span class="f-forwho">' + w.name + '</span>' : '') + '</figure>' +
          '<div class="f-jn">' + esc(r.name) + '</div>' + met('wage', 'Pay', r.pay) + met('hire', 'Hiring', r.hire) + met('jobs', 'Jobs', r.share) + '</div>';
      }).join('') + '</div>';
    }
    if (s.kind === 'rules') {
      return '<ol class="f-rules">' + s.rules.map(function (r, i) {
        return '<li class="f-rule" data-when="' + esc(r.when) + '"><b>' + (i + 1) + '</b><div><strong>' + esc(r.t) +
          '</strong><span>' + esc(r.d) + '</span></div></li>';
      }).join('') + '</ol>';
    }
    if (s.kind === 'decide') {
      return '<div class="f-cast">' + s.people.map(function (p, i) {
        var w = WHO[p.who];
        return '<div class="f-castcard f-decide" style="--c:' + w.color + ';--d:' + (0.15 + i * 0.35) + 's">' + face(w, 72) +
          '<div><div class="f-name">' + w.name + '</div><div class="f-need">' + esc(p.need) + '</div>' +
          '<p class="f-dec">"' + esc(p.quote) + '"</p>' +
          '<div class="f-job"><b>' + esc(p.job) + '</b><span>' + esc(p.fig) + '</span></div></div></div>';
      }).join('') + '</div>';
    }
    if (s.kind === 'end') {
      return '<div class="f-end"><div class="f-actions">' +
        '<button type="button" class="f-go" data-go="#explore">Look up your own job type</button>' +
        '<button type="button" class="f-go2" data-go="#chapters">Explore the full story</button>' +
        '<button type="button" class="f-go2" data-replay>Watch again</button></div>' +
        '<p class="f-credits">' + credits() + '</p></div>';
    }
    return '';
  }

  function credits() {
    var m = global.FILM_MEDIA || {};
    var one = function (c) {
      // a Commons title may carry a long dash; the page never prints one
      return esc(c.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/\s*[\u2013\u2014]\s*/g, ', ')) +
        ', ' + esc(c.author) + ', ' + esc(c.licence);
    };
    var photos = Object.keys(m).filter(function (k) { return k !== 'clips' && !/_still$/.test(k); })
      .map(function (k) { return one(m[k]); });
    var clips = Object.keys(m.clips || {}).map(function (k) { return one(m.clips[k]); });
    return 'Data: ABS 8155.0, 2006-07 to 2024-25, in 2024-25 dollars. From Wikimedia Commons, photographs: ' +
      photos.join('; ') + '. Video: ' + clips.join('; ') +
      '. Mia and Alex are composite personas from the Journal 3 empathy map, played by two free stock clips from magnific.com.';
  }

  // ------------------------------------------------------------ parts
  /* A scene plays as a short list of parts: an act title card when the act
     changes, the footage (before or after the slide), and the slide. Each
     voiced part has its own mp3. */
  function key(i) { return 'film-' + String(i).padStart(2, '0'); }
  function hasRoll(s) { return !!(s.roll && s.roll.panes.some(function (p) { return p.clip || p.photo; })); }
  function partsOf(i) {
    var s = F.scenes[i], out = [];
    if (i === 0 || F.scenes[i - 1].act !== s.act) out.push({ type: 'sting' });
    var roll = hasRoll(s) ? { type: 'roll', key: key(i) + '-r', say: s.roll.say } : null;
    if (roll && s.roll.at === 'pre') out.push(roll);
    out.push({ type: 'slide', key: key(i), say: s.say });
    if (roll && s.roll.at !== 'pre') out.push(roll);
    return out;
  }
  function voice(k, say) {
    var n = global.NARRATION && global.NARRATION[k];
    return n ? { src: 'assets/audio/' + n.file, sec: n.bytes / BYTES_PER_SEC } : { src: null, sec: spoken(say).length / 14 };
  }
  // what comes after a voiced part before the next one starts
  function tailOf(p, nextP) { return p.type === 'roll' ? TAIL : nextP && nextP.type === 'roll' ? 0.15 : HOLD; }
  function partSec(p, nextP) { return p.type === 'sting' ? STING : voice(p.key, p.say).sec + tailOf(p, nextP); }
  function sceneSec(i) {
    var ps = partsOf(i), t = 0;
    ps.forEach(function (p, j) { t += partSec(p, ps[j + 1]); });
    return t;
  }
  function duration() {
    ensure();
    var t = 0;
    for (var i = 0; i < F.scenes.length; i++) t += sceneSec(i);
    return t;
  }
  function clock(t) {
    t = Math.max(0, Math.round(t));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }

  // a pausable one-shot timer: tails, title cards and the no-audio fallback
  function later(fn, ms, base) {
    clearT();
    F.t = { fn: fn, total: ms, left: ms, base: base || 0, at: performance.now(), id: 0 };
    if (F.playing) F.t.id = setTimeout(fire, ms);
  }
  function fire() { var t = F.t; F.t = null; if (t) t.fn(); }
  function holdT() {
    if (!F.t || !F.t.id) return;
    clearTimeout(F.t.id); F.t.id = 0;
    F.t.left = Math.max(0, F.t.left - (performance.now() - F.t.at));
  }
  function runT() {
    if (!F.t || F.t.id) return;
    F.t.at = performance.now();
    F.t.id = setTimeout(fire, F.t.left);
  }
  function clearT() { if (F.t) clearTimeout(F.t.id); F.t = null; }

  // ------------------------------------------------------------ footage
  function preload(s) {
    F.pre = F.pre || {};
    if (!hasRoll(s)) return;
    s.roll.panes.forEach(function (p) {
      if (p.clip && !F.pre[p.clip]) {
        var v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = p.clip;
        v.setAttribute('playsinline', '');
        F.pre[p.clip] = v;
      }
    });
  }
  /* Footage comes in as a new layer wiped across the frame, so footage after
     footage dissolves cleanly and a slide underneath is never seen half-built.
     Each clip is cut to cover its voice-over, so it plays at normal speed. */
  function rollOn(s, sec) {
    preload(s);
    var layer = document.createElement('div');
    var panes = s.roll.panes.filter(function (p) { return p.clip || p.photo; });
    layer.className = 'fc-layer' + (panes.length > 1 ? ' two' : '');
    layer.style.setProperty('--dur', sec.toFixed(2) + 's');
    panes.forEach(function (p) {
      var fig = document.createElement('figure');
      fig.className = 'fc-pane';
      var media;
      if (p.clip) {
        media = F.pre[p.clip];
        try { media.currentTime = 0; } catch (e) { /* not loaded yet */ }
        var len = isFinite(media.duration) && media.duration > 0 ? media.duration : CLIP_SEC;
        media.playbackRate = len >= sec ? 1 : Math.max(0.85, len / sec);
      } else {
        media = document.createElement('img');
        media.src = p.photo; media.alt = '';
      }
      fig.appendChild(media);
      if (p.label) {
        var lab = document.createElement('figcaption');
        lab.textContent = p.label;
        fig.appendChild(lab);
      }
      layer.appendChild(fig);
    });
    var old = Array.prototype.slice.call(F.cutEl.children);
    F.cutEl.appendChild(layer);
    F.cutEl.classList.add('on');
    F.el.classList.add('cutting');
    void layer.offsetWidth;
    layer.classList.add('in');
    setTimeout(function () { old.forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); }); }, 900);
    playVideos();
    if (global.SFX) global.SFX.whoosh(1);
  }
  function playVideos() {
    if (V.reduceMotion) return;                        // a still frame, the voice still reads
    Array.prototype.forEach.call(F.cutEl.querySelectorAll('.fc-layer:last-child video'), function (v) {
      v.muted = true; var pr = v.play(); if (pr) pr.catch(function () {});
    });
  }
  function pauseVideos() {
    Array.prototype.forEach.call(F.cutEl.querySelectorAll('video'), function (v) { v.pause(); });
  }
  function rollOff() {
    if (!F.cutEl.classList.contains('on')) return;
    F.cutEl.classList.remove('on');
    F.el.classList.remove('cutting');
    setTimeout(function () {
      if (F.cutEl.classList.contains('on')) return;
      pauseVideos();
      F.cutEl.innerHTML = '';
    }, 800);
  }

  /* Footage behind a card slide, muted and played once, under the same shading as
     a photograph. A slide can split the frame between two clips (bgClips).
     Separate elements from the B-roll ones, so a roll fading out never loses
     its picture to the slide that follows it. */
  function setBgVideo(clips) {
    var key = clips.join('|');
    if (F.bgv.getAttribute('data-k') === key) return;
    F.bgv.setAttribute('data-k', key);
    F.bgv.innerHTML = '';
    F.bgv.className = 'film-bgv' + (clips.length > 1 ? ' two' : '');
    clips.forEach(function (src) {
      var v = document.createElement('video');
      v.muted = true; v.loop = false; v.playsInline = true; v.preload = 'auto';   // once: a loop shows the same shot twice
      v.setAttribute('playsinline', ''); v.src = src;
      F.bgv.appendChild(v);
    });
    playBg();
  }
  function playBg() {
    if (V.reduceMotion || !F.playing) return;
    Array.prototype.forEach.call(F.el.querySelectorAll('.film-bgv video, .film-card .on video'), function (v) {
      if (v.ended) return;
      var pr = v.play(); if (pr) pr.catch(function () {});
    });
  }
  function pauseBg() {
    Array.prototype.forEach.call(F.el.querySelectorAll('.film-bgv video, .film-card video'), function (v) { v.pause(); });
  }

  function sting(act) {
    var el = F.stingEl;
    el.innerHTML = '<div class="fs-in"><span class="fs-num">' + act + '</span><span class="fs-rule"></span>' +
      '<span class="fs-t">' + esc(ACTS[act]) + '</span></div>';
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    if (global.SFX) global.SFX.whoosh(1);
  }

  // ------------------------------------------------------------ the player
  var F = { built: false, open: false, playing: false, i: 0, j: -1, parts: [], scenes: null,
            chapters: null, audio: null, chart: null, gen: 0, t: null,
            present: false, notes: false, step: 0, phrases: [] };

  function ensure() {
    if (F.scenes) return;
    F.scenes = script();
    F.chapters = global.CHAPTERS.build(D);
  }

  function build() {
    if (F.built) return;
    F.built = true;
    ensure();
    var el = $('#film');
    F.el = el;
    F.host = $('.film-chart', el);
    F.cutEl = $('.film-cut', el);
    var dock = document.createElement('div');
    dock.className = 'film-dock';
    dock.setAttribute('aria-hidden', 'true');
    dock.innerHTML = ['mia', 'alex'].map(function (k) {
      return '<span class="fd" data-name="' + WHO[k].name + '" style="--c:' + WHO[k].color + '"><img src="' + WHO[k].face + '" alt=""><b>' + WHO[k].name + '</b></span>';
    }).join('');
    $('.film-bot', el).insertBefore(dock, $('.film-next', el));
    F.bgv = document.createElement('div');
    F.bgv.className = 'film-bgv';
    $('.film-bg', el).appendChild(F.bgv);
    F.stingEl = document.createElement('div');
    F.stingEl.className = 'film-sting';
    F.stingEl.setAttribute('aria-hidden', 'true');
    el.insertBefore(F.stingEl, $('.film-top', el));
    F.scene = new V.Scene(F.host);
    F.audio = new Audio();
    F.audio.preload = 'auto';
    F.audio.addEventListener('playing', function () { if (global.SFX) global.SFX.voice(true); });
    F.audio.addEventListener('pause', function () { if (global.SFX) global.SFX.voice(false); });
    F.audio.addEventListener('timeupdate', caption);
    var segs = $('.film-segs', el);
    segs.innerHTML = F.scenes.map(function (s, i) {
      return '<button type="button" class="fseg" aria-label="Scene ' + (i + 1) + '" style="flex:' + sceneSec(i).toFixed(1) + '"><i></i></button>';
    }).join('');
    Array.prototype.forEach.call(segs.children, function (b, i) {
      b.addEventListener('click', function () { show(i, true); });
    });
    $('.film-close', el).addEventListener('click', close);
    $('.film-play', el).addEventListener('click', function () { F.playing ? pause() : resume(); });
    $('.film-prev', el).addEventListener('click', function () { if (F.present) back(); else show(Math.max(0, F.i - 1), true); });
    $('.film-next', el).addEventListener('click', function () { if (F.present) advance(); else if (F.i < F.scenes.length - 1) show(F.i + 1, true); });
    var hint = document.createElement('span');
    hint.className = 'present-hint';
    hint.textContent = 'Click or \u2192 to advance \u00b7 \u2190 back \u00b7 N notes';
    $('.film-top', el).insertBefore(hint, $('.film-time', el));
    el.addEventListener('click', function (e) {
      var go = e.target.closest('[data-go]');
      if (go) { close(); var t = $(go.getAttribute('data-go')); if (t) t.scrollIntoView({ behavior: 'smooth' }); return; }
      if (e.target.closest('[data-replay]')) { show(0, true); return; }
      // presenting: a click anywhere on the picture is the next step; controls keep their own job
      if (F.present && !e.target.closest('button, a, .film-bot, .film-top')) advance();
    });
    document.addEventListener('keydown', function (e) {
      if (!F.open) return;
      if (e.key === 'Escape') { close(); return; }
      if (F.present) {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'Enter') { e.preventDefault(); advance(); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') { e.preventDefault(); back(); }
        else if (e.key === 'n' || e.key === 'N') { F.notes = !F.notes; F.el.classList.toggle('notes', F.notes); showNotes(); }
        return;
      }
      if (e.key === ' ') { e.preventDefault(); F.playing ? pause() : resume(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (F.i < F.scenes.length - 1) show(F.i + 1, true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(Math.max(0, F.i - 1), true); }
    });
    if (global.ResizeObserver) {
      var rt;
      new ResizeObserver(function () {
        if (!F.open || !F.framed) return;
        clearTimeout(rt);
        rt = setTimeout(function () { drawChart(F.scenes[F.i], false); }, 140);
      }).observe(F.host);
    }
  }

  /* present = the same scenes as slides for a speaker: no voice, no music, no
     timers. Every click is one step: an act card, a footage shot, a slide, and
     inside a slide each highlight the film would have lit with the voice (the
     three rules, the three columns, Mia then Alex, the two picks). */
  function open(present) {
    build();
    F.open = true;
    F.present = present === true;
    F.el.classList.toggle('present', F.present);
    F.el.classList.toggle('notes', F.present && F.notes);
    F.el.classList.add('on');
    F.el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('locked');
    if (global.SFX) { global.SFX.open(); if (!F.present) global.SFX.bedOpen('neutral'); }
    F.el.classList.remove('ended');
    setPlaying(true);
    // 10 Hz, not the media element's ~4 Hz timeupdate: a highlight a quarter
    // second late reads as lagging behind the voice
    F.tick = setInterval(function () { caption(); progress(); }, 100);
    show(0, false);
    $('.film-close', F.el).focus({ preventScroll: true });
  }

  function close() {
    if (!F.open) return;
    F.open = false;
    F.gen++;
    clearT();
    clearInterval(F.tick);
    F.audio.pause();
    pauseVideos();
    F.cutEl.classList.remove('on'); F.cutEl.innerHTML = '';
    F.bgv.innerHTML = ''; F.bgv.removeAttribute('data-k');
    F.el.classList.remove('on', 'cutting', 'ended', 'present', 'notes');
    var tip = F.host.querySelector('.tip');
    if (tip) tip.classList.remove('on');
    F.stingEl.classList.remove('on');
    F.el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('locked');
    if (global.SFX) { global.SFX.voice(false); global.SFX.bedClose(); global.SFX.close(); }
    F.scene.clear(); F.chart = null;
  }

  function setPlaying(on) {
    F.playing = on;
    F.el.classList.toggle('paused', !on);
    var b = $('.film-play', F.el);
    if (b) b.setAttribute('aria-label', on ? 'Pause' : 'Play');
  }

  function pause() {
    setPlaying(false);
    holdT();
    F.audio.pause();
    pauseVideos();
    pauseBg();
  }
  function resume() {
    setPlaying(true);
    F.el.classList.remove('ended');
    if (F.j >= F.parts.length) { show(0, true); return; }
    if (F.parts[F.j] && F.parts[F.j].type === 'roll') playVideos();
    playBg();
    if (F.t) { runT(); return; }
    if (F.audio.src && !F.audio.ended && F.audio.currentTime > 0) F.audio.play().catch(function () {});
    else runPart(F.j, F.gen);
  }

  function drawChart(s, first) {
    if (s.kind !== 'chart') { F.scene.clear(); F.chart = null; F.host.hidden = true; return; }
    F.host.hidden = false;
    var form, state;
    if (s.builder) { form = s.builder; state = s.state; }
    else {
      var c = F.chapters.filter(function (x) { return x.id === s.chapter; })[0];
      form = c.chart; state = c.beats[s.beat].state;
    }
    if (F.chart !== form) F.scene.clear();
    F.chart = form;
    F.scene.measure();
    if (F.present && !F.tips && global.TIPS) F.tips = global.TIPS(F.host);
    var marks = CH.builders[form]({ w: F.scene.w, h: F.scene.h, data: D, beat: state || {},
                                    tipHandlers: F.present ? F.tips : null });
    F.scene.render(marks, { dur: first ? 900 : 700, stagger: first ? 12 : 0 });
  }

  // put a scene's slide on screen: headline, background, card, chart
  function frame(s) {
    var el = F.el;
    F.framed = true;
    el.setAttribute('data-kind', s.kind);
    var h = $('.film-head h2', el);
    h.textContent = s.head;
    h.classList.remove('in'); void h.offsetWidth; h.classList.add('in');
    var bg = $('.film-bg', el), img = $('.film-bg img', el);
    var clips = (s.bgClips || (s.bgClip ? [s.bgClip] : [])).filter(Boolean);
    setBgVideo(clips);
    bg.classList.toggle('vid', clips.length > 0);
    if (s.bg && img.getAttribute('src') !== s.bg) img.src = s.bg;
    bg.classList.toggle('on', !!(s.bg || clips.length));
    bg.classList.remove('kb'); void bg.offsetWidth; bg.classList.add('kb');
    var cd = $('.film-card', el);
    cd.innerHTML = card(s);
    cd.classList.remove('in'); void cd.offsetWidth; cd.classList.add('in');
    drawChart(s, true);
    var count = $('.f-big', cd);
    if (count) countUp(count);
    if (global.SFX && s.foley) global.SFX.foley(s.foley, 0.35);
  }

  function show(i, user, atEnd) {
    var s = F.scenes[i];
    F.gen++;
    var prev = F.i;
    F.i = i;
    clearT();
    F.audio.pause();
    F.el.classList.remove('ended');
    if (user && !F.playing) setPlaying(true);
    if (user) { rollOff(); F.stingEl.classList.remove('on'); }
    F.parts = partsOf(i);
    F.el.classList.toggle('nodock', i < 2);              // the dock appears once both are introduced
    F.el.style.setProperty('--who', '#3987e5');
    $('.film-act', F.el).textContent = 'Act ' + s.act + ' · ' + ACTS[s.act];
    preload(s);
    if (global.SFX) {
      if (i !== prev && user) global.SFX.whoosh(i > prev ? 1 : -1);
      global.SFX.bedMood(s.mood || 'neutral', s.mood === 'answer');
    }
    runPart(atEnd ? F.parts.length - 1 : 0, F.gen, atEnd);
  }

  function runPart(j, gen, built) {
    if (gen !== F.gen) return;
    F.j = j;
    var s = F.scenes[F.i], p = F.parts[j];
    if (!p) { nextScene(gen); return; }
    if (F.present) { presentPart(s, p, built); return; }
    var after = function () { if (gen === F.gen) runPart(j + 1, gen); };
    setCaption('');
    if (p.type === 'sting') {
      sting(s.act);
      // the frame under the card is cleared, so the card lifts onto the new scene
      $('.film-head h2', F.el).textContent = '';
      $('.film-card', F.el).innerHTML = '';
      later(function () { F.stingEl.classList.remove('on'); after(); }, STING * 1000);
      if (F.parts[j + 1] && F.parts[j + 1].type === 'slide') rollOff();
      progress();
      return;
    }
    var v = voice(p.key, p.say);
    var tail = tailOf(p, F.parts[j + 1]);
    // the subtitle goes in BEFORE the slide is drawn: it changes the height
    // left for the chart, and a chart measured first is drawn too tall
    F.capParts = sentences(p.say);
    F.capW = F.capParts.map(function (t) { return spoken(t).length; });
    F.capT = capTimes(p, v);
    F.capIdx = -1;
    if (v.src) F.audio.src = v.src;              // resets the element, so caption() reads 0
    caption();
    if (p.type === 'roll') {
      rollOn(s, v.sec + tail);
    } else {
      frame(s);
      rollOff();
    }
    if (v.src) {
      F.audio.onended = function () { if (gen === F.gen) later(after, tail * 1000, v.sec); };
      F.audio.onerror = function () { if (gen === F.gen) later(after, (v.sec + tail) * 1000); };
      if (F.playing) F.audio.play().catch(function () {});
    } else {
      F.audio.removeAttribute('src');
      later(after, (v.sec + tail) * 1000);
    }
  }

  // ------------------------------------------------------------ presenting
  function presentPart(s, p, built) {
    F.capParts = [];                                  // no voice, so no timed subtitles
    F.cur = p;
    var tp = F.host.querySelector('.tip');
    if (tp) tp.classList.remove('on');
    if (p.type === 'sting') {
      sting(s.act);                                   // and it stays until the next click
      $('.film-head h2', F.el).textContent = '';
      $('.film-card', F.el).innerHTML = '';
      F.phrases = []; F.step = 0;
    } else {
      F.stingEl.classList.remove('on');
      if (p.type === 'roll') rollOn(s, CLIP_SEC);
      else { frame(s); rollOff(); }
      F.phrases = p.type === 'slide' ? stepsOf() : [];
      F.step = built ? F.phrases.length : 0;
    }
    applySteps();
    showNotes();
    // the dock lights whoever this part is about
    Array.prototype.forEach.call(F.el.querySelectorAll('.fd'), function (d) {
      d.classList.toggle('on', !!p.say && p.say.indexOf(d.getAttribute('data-name')) >= 0);
    });
    progress();
  }
  // the highlight phrases of the slide on screen, in reading order
  function stepsOf() {
    var ph = [];
    Array.prototype.forEach.call(F.el.querySelectorAll('.film-card [data-when], .film-card [data-dim-when]'), function (r) {
      var w = r.getAttribute('data-when') || r.getAttribute('data-dim-when');
      if (ph.indexOf(w) < 0) ph.push(w);
    });
    return ph;
  }
  function applySteps() {
    Array.prototype.forEach.call(F.el.querySelectorAll('.film-card [data-when], .film-card [data-dim-when]'), function (r) {
      var w = r.getAttribute('data-when') || r.getAttribute('data-dim-when');
      light(r, F.phrases.indexOf(w) < F.step);
    });
  }
  function light(r, lit) {
    r.classList.toggle(r.hasAttribute('data-when') ? 'on' : 'off', lit);
    var v = lit && F.playing && !V.reduceMotion && r.querySelector('video');
    if (v && v.paused && !v.ended) { var pr = v.play(); if (pr) pr.catch(function () {}); }
  }
  function showNotes() {
    if (F.present) setCaption(F.notes && F.cur && F.cur.say ? F.cur.say : '');
  }
  function advance() {
    if (F.step < F.phrases.length) { F.step++; applySteps(); if (global.SFX) global.SFX.ui('toggle'); return; }
    if (F.j < F.parts.length - 1) { if (global.SFX) global.SFX.whoosh(1); runPart(F.j + 1, F.gen); return; }
    if (F.i < F.scenes.length - 1) show(F.i + 1, true);
  }
  function back() {
    if (F.step > 0) { F.step--; applySteps(); return; }
    if (F.j > 0) { runPart(F.j - 1, F.gen, true); return; }
    if (F.i > 0) show(F.i - 1, true, true);
  }

  function nextScene(gen) {
    if (gen !== F.gen) return;
    if (global.SFX) global.SFX.voice(false);
    if (F.i >= F.scenes.length - 1) {
      F.j = F.parts.length;
      setPlaying(false);
      F.el.classList.add('ended');
      progress();
      return;
    }
    show(F.i + 1, false);
  }

  /* Split on a full stop followed by a space and a capital, so "13.5 million"
     and "$172.4k" stay whole (a plain [.!?] split cut the first subtitle to
     "13."), then fold a fragment under 24 characters into the next sentence so
     "Meet Mia." does not flash up on its own. */
  function sentences(t) {
    var out = [], re = /[.!?]["']?\s+(?=[A-Z"'])/g, last = 0, m;
    while ((m = re.exec(t))) { out.push(t.slice(last, m.index + m[0].length)); last = re.lastIndex; }
    out.push(t.slice(last));
    var merged = [];
    out.forEach(function (p) {
      if (merged.length && merged[merged.length - 1].trim().length < 24) merged[merged.length - 1] += p;
      else merged.push(p);
    });
    return merged;
  }

  function setCaption(t) { $('.film-cap', F.el).textContent = t; }

  /* When each subtitle starts, from the sentence marks build_narration.py
     takes from the voice itself: exact at a sentence start, interpolated
     inside one. null (no marks) falls back to sharing time by characters. */
  function capTimes(p, v) {
    var n = global.NARRATION && global.NARRATION[p.key];
    if (!n || !n.marks || !n.marks.length) return null;
    var full = spoken(p.say), pos = 0;
    var pts = n.marks.concat([[v.sec, full.length]]);
    return F.capParts.map(function (part) {
      var head = spoken(part).trim().slice(0, 12), at = full.indexOf(head, pos);
      if (at < 0) at = pos;
      pos = at + 1;
      var i = 1;
      while (i < pts.length - 1 && pts[i][1] <= at) i++;
      var a = pts[i - 1], b = pts[i];
      return b[1] > a[1] ? a[0] + (b[0] - a[0]) * Math.max(0, at - a[1]) / (b[1] - a[1]) : a[0];
    });
  }

  /* Captions follow the reading, sentence by sentence, by share of SPOKEN
     characters ("$136.1k" is read as "136.1 thousand dollars"). A rules card
     lights each rule as the voice reaches it. */
  function caption() {
    var parts = F.capParts || [];
    if (!parts.length) return;
    var k = 0;
    // right after a src change the element can still report the OLD clip's
    // position; until the new one has data, treat it as the start
    var d = F.audio.duration, t = F.audio.readyState >= 2 ? F.audio.currentTime : 0;
    if (F.capT && t > 0) {
      while (k < parts.length - 1 && F.capT[k + 1] <= t + 0.25) k++;     // a beat early: the eye leads the ear
    } else if (d && isFinite(d) && t > 0) {
      var w = F.capW, total = w.reduce(function (a, b) { return a + b; }, 0), at = t / d * total, run = 0;
      for (k = 0; k < parts.length; k++) { run += w[k]; if (run >= at) break; }
      k = Math.min(k, parts.length - 1);
    }
    if (k !== F.capIdx) {
      F.capIdx = k;
      setCaption(parts[k].trim());
      Array.prototype.forEach.call(F.el.querySelectorAll('.film-card [data-when], .film-card [data-dim-when]'), function (r) {
        var phrase = r.getAttribute('data-when') || r.getAttribute('data-dim-when'), at = -1;
        parts.forEach(function (p, n) { if (at < 0 && p.indexOf(phrase) >= 0) at = n; });
        var lit = at >= 0 && k >= at;
        r.classList.toggle(r.hasAttribute('data-when') ? 'on' : 'off', lit);
        var v = lit && F.playing && !V.reduceMotion && r.querySelector('video');
        if (v && v.paused && !v.ended) { var pr = v.play(); if (pr) pr.catch(function () {}); }
      });
      // the persona dock: a face lights while the voice is talking about that person
      Array.prototype.forEach.call(F.el.querySelectorAll('.fd'), function (d) {
        d.classList.toggle('on', parts[k].indexOf(d.getAttribute('data-name')) >= 0);
      });
    }
  }

  function progress() {
    if (!F.el || !F.scenes) return;
    var done = 0;
    for (var i = 0; i < F.i; i++) done += sceneSec(i);
    var cur = 0, ps = F.parts;
    for (var j = 0; j < Math.min(F.j, ps.length); j++) cur += partSec(ps[j], ps[j + 1]);
    if (F.j < ps.length) {
      if (F.t) cur += F.t.base + (F.t.total - (F.t.id ? Math.max(0, F.t.left - (performance.now() - F.t.at)) : F.t.left)) / 1000;
      else cur += F.audio.currentTime || 0;
    }
    if (F.present) {
      $('.film-time', F.el).textContent = 'Scene ' + (F.i + 1) + ' / ' + F.scenes.length;
      Array.prototype.forEach.call($('.film-segs', F.el).children, function (b, n) {
        var f = n < F.i ? 1 : n > F.i ? 0 : (F.j + 1) / F.parts.length;
        b.firstChild.style.width = (f * 100).toFixed(1) + '%';
        b.classList.toggle('now', n === F.i);
      });
      return;
    }
    $('.film-time', F.el).textContent = clock(done + cur) + ' / ' + clock(duration());
    Array.prototype.forEach.call($('.film-segs', F.el).children, function (b, n) {
      var f = n < F.i ? 1 : n > F.i ? 0 : Math.min(1, cur / (sceneSec(n) || 1));
      b.firstChild.style.width = (f * 100).toFixed(1) + '%';
      b.classList.toggle('now', n === F.i);
    });
  }

  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    if (V.reduceMotion || !isFinite(target)) return;
    V.tween({ dur: 1600, ease: V.ease && V.ease.out, step: function (t) { el.textContent = (target * t).toFixed(1) + 'M'; } });
  }

  /* How names are SPOKEN, for the recording only (subtitles keep the real
     spelling). edge-tts reads "Mia" as the letters M-I-A: measured, "Meet Mia."
     runs 0.28 s longer than "Meet Anna.", the length of spelling it out, while
     "Meeya" reads at a normal name's length. */
  var PRONOUNCE = [[/\bMia\b/g, 'Meeya']];
  function say(t) {
    PRONOUNCE.forEach(function (r) { t = t.replace(r[0], r[1]); });
    return t;
  }
  function spoken(t) { return say(global.SPEAKABLE ? global.SPEAKABLE(t) : t); }

  // narration capture for scripts/narration.json (see build_narration.py)
  function lines() {
    ensure();
    var out = [];
    F.scenes.forEach(function (s, i) {
      out.push({ key: key(i), text: spoken(s.say) });
      if (hasRoll(s)) out.push({ key: key(i) + '-r', text: spoken(s.roll.say) });
    });
    return out;
  }

  function boot() {
    var len = duration();
    Array.prototype.forEach.call(document.querySelectorAll('[data-present-open]'), function (b) {
      b.addEventListener('click', function () { open(true); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-film-open]'), function (b) {
      b.addEventListener('click', function () { open(false); });
      var t = b.querySelector('.film-len');
      if (t) t.textContent = clock(len);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.FILM = { open: open, close: close, lines: lines, duration: duration,
                  present: function () { open(true); }, advance: advance, back: back,
                  scenes: function () { ensure(); return F.scenes; } };
})(window);
