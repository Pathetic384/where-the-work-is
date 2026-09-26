/* sfx.js - the sound of the thing, synthesised.
 *
 * Every sound here is oscillators, a noise buffer and gain envelopes: zero bytes
 * of audio to download, so the site still runs from file:// with nothing to
 * fetch. The recorded narration is the only audio file the site plays.
 *
 * The signal path, built once on the first gesture:
 *
 *   voice ─┬───────────────────────────┐
 *          └─ send ─ convolver (room) ─┤
 *                                      bus (duck) ─ limiter ─ master (mute) ─ out
 *
 *   bus     drops to 30% while the narration is on, so no chart ever talks
 *           over the voice.
 *   master  is the mute. It ramps over 50 ms, never jumps, so it cannot click.
 *
 * Rules that are easy to break:
 *
 * 1. NOTHING PLAYS ON AN IDLE SCREEN. Every sound is caused by the reader: a
 *    hover, a tap, a step, a chart they asked for drawing itself. An unattended
 *    tab on a second monitor must stay silent; the user asked for that.
 * 2. Nothing is scheduled before the first gesture. A context created before
 *    then starts suspended, and everything queued on it would burst out at the
 *    first click. So until `unlocked`, every call is a silent no-op.
 * 3. QUIET. A note that is noticeable on its own is too loud. Peaks sit around
 *    0.02 to 0.07 and the limiter only exists to catch pile-ups.
 * 4. Muted means no nodes at all, not silent nodes: every entry point returns
 *    before building anything, so a muted page costs nothing.
 */
(function (g) {
  'use strict';

  var A = null;                // AudioContext; false once we know there is none
  var master = null, bus = null, send = null, noiseBuf = null;
  var sub = null, subSend = null;  // the story's sub-audio bus and its own room
  var on = true, unlocked = false, ducked = false;
  var live = 0;                // voices in flight, a ceiling against pile-ups
  var MAX_LIVE = 160;
  var DUCK = 0.3;              // "drop by 70%"
  var last = {};               // throttle clocks, per key

  try { on = localStorage.getItem('wtwi.sfx') !== '0'; } catch (e) { /* private mode */ }

  // ------------------------------------------------------------ the graph
  function build() {
    var C = g.AudioContext || g.webkitAudioContext;
    if (!C) { A = false; return; }
    try { A = new C(); } catch (e) { A = false; return; }

    master = A.createGain();
    master.gain.value = on ? 1 : 0;
    master.connect(A.destination);

    // a gentle safety net, not a sound: it only acts when many notes stack
    var lim = A.createDynamicsCompressor();
    lim.threshold.value = -14; lim.knee.value = 8; lim.ratio.value = 6;
    lim.attack.value = 0.004; lim.release.value = 0.2;
    lim.connect(master);

    bus = A.createGain();
    bus.gain.value = ducked ? DUCK : 1;
    bus.connect(lim);

    // A small room, generated rather than loaded: 1.8 s of decaying stereo
    // noise is all an impulse response for a soft hall needs to be.
    var verb = A.createConvolver();
    var len = Math.floor(A.sampleRate * 1.8);
    var ir = A.createBuffer(2, len, A.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = ir.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    var wet = A.createGain();
    wet.gain.value = 0.55;
    verb.connect(wet); wet.connect(bus);
    send = verb;

    // The sub-audio bus: ambient bed, foley and punctuation under the voice.
    // It has its own room so its reverb ducks WITH it, not with the UI bus.
    sub = A.createGain();
    sub.gain.value = 0;
    sub.connect(lim);
    subSend = A.createConvolver();
    subSend.buffer = ir;
    var subWet = A.createGain();
    subWet.gain.value = 0.6;
    subSend.connect(subWet); subWet.connect(sub);

    noiseBuf = A.createBuffer(1, A.sampleRate, A.sampleRate);
    var nd = noiseBuf.getChannelData(0);
    for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
  }

  function ctx() {
    /* Hidden tab: no sound, and do not wake a context we just suspended. An
       Auto-advancing beat in a background tab would otherwise play to nobody. */
    if (!on || !unlocked || document.hidden) return false;
    if (A === null) build();
    if (!A) return false;
    if (A.state === 'suspended') { try { A.resume(); } catch (e) { /* gesture needed */ } }
    return A.state === 'closed' ? false : A;
  }

  function throttle(key, ms) {
    var now = performance.now();
    if (last[key] && now - last[key] < ms) return false;
    last[key] = now;
    return true;
  }

  // ------------------------------------------------------------ primitives
  /* Route a voice: dry to the bus, optionally some to the room, and optionally
     panned. Returns the node the voice should connect into. The voice counts as
     live until its source actually ends (onended), not until a guessed time, so
     quick stepping never fills the ceiling with notes that already finished. */
  function out(src, t, o) {
    var head = A.createGain();
    var tail = head;
    if (o.pan && A.createStereoPanner) {
      var p = A.createStereoPanner();
      p.pan.setValueAtTime(Math.max(-1, Math.min(1, o.pan)), t);
      head.connect(p); tail = p;
    }
    var toSub = o.bus === 'sub';
    tail.connect(toSub ? sub : bus);
    if (o.wet) {
      var s = A.createGain(); s.gain.value = o.wet;
      tail.connect(s); s.connect(toSub ? subSend : send);
    }
    live++;
    src.onended = function () { live--; try { head.disconnect(); } catch (e) { /* gone */ } };
    return head;
  }

  /* One enveloped oscillator. o: {f, type, t, a (attack), peak, rel, slide
     (pitch factor over the note), from (start pitch factor), lp:{f, q},
     pan, wet}. */
  function osc(o) {
    if (live > MAX_LIVE) return;
    var t = o.t, a = o.a || 0.006, rel = o.rel || 0.2, stop = t + a + rel;
    var node = A.createOscillator();
    node.type = o.type || 'sine';
    node.frequency.setValueAtTime(o.f * (o.from || 1), t);
    if (o.from && o.from !== 1) node.frequency.exponentialRampToValueAtTime(o.f, t + Math.min(0.08, a + 0.05));
    if (o.slide && o.slide !== 1) node.frequency.exponentialRampToValueAtTime(o.f * o.slide, stop);
    if (o.detune) node.detune.value = o.detune;
    var gn = A.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(o.peak, t + a);
    gn.gain.exponentialRampToValueAtTime(0.0001, stop);
    var head = out(node, t, o);
    if (o.lp) {
      var f = A.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lp.f, t);
      if (o.lp.to) f.frequency.exponentialRampToValueAtTime(o.lp.to, t + (o.lp.over || a));
      f.Q.value = o.lp.q || 0.7;
      node.connect(f); f.connect(gn);
    } else {
      node.connect(gn);
    }
    gn.connect(head);
    node.start(t); node.stop(stop + 0.05);
  }

  /* A burst of filtered noise: the grain of a click, a page, a mallet strike. */
  function noise(o) {
    if (live > MAX_LIVE) return;
    var t = o.t, dur = o.dur || 0.03, stop = t + dur;
    var src = A.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;               // the buffer is 1 s; a longer texture wraps
    var bp = A.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(o.f, t);
    if (o.to) bp.frequency.exponentialRampToValueAtTime(o.to, stop);
    bp.Q.value = o.q || 1.2;
    var gn = A.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(o.peak, t + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0001, stop);
    src.connect(bp); bp.connect(gn); gn.connect(out(src, t, o));
    src.start(t, Math.random() * 0.5); src.stop(stop + 0.02);
  }

  // ------------------------------------------------------------ pitch
  /* Major pentatonic: no two notes of it clash, so any cascade of data points,
     in any order, stays a melody rather than a cluster. */
  var PENTA = [0, 2, 4, 7, 9];
  function penta(x, root, steps) {
    var k = Math.round(Math.max(0, Math.min(1, x)) * (steps - 1));
    var semi = Math.floor(k / 5) * 12 + PENTA[k % 5];
    return root * Math.pow(2, semi / 12);
  }
  function norm(v, lo, hi) { return hi > lo ? (v - lo) / (hi - lo) : 0.5; }

  // Pay and headcount ranges, read once from the site's own data.
  var R = null;
  function ranges() {
    if (R) return R;
    var rows = ((g.STORY && g.STORY.divisions) || []).filter(function (d) { return !d.hidden; });
    function ext(k, fb) {
      var v = rows.map(function (d) { return d[k]; }).filter(isFinite);
      return v.length ? [Math.min.apply(null, v), Math.max.apply(null, v)] : fb;
    }
    R = { pay: ext('wage', [30, 175]), jobs: ext('jobs', [100, 2000]) };
    return R;
  }

  // ------------------------------------------------------------ sounds
  function mallet(f, t, peak, pan) {
    // marimba-ish: a fundamental that rings, a 4th partial that dies fast,
    // and a breath of noise for the strike
    osc({ f: f, t: t, a: 0.003, peak: peak, rel: 0.34, pan: pan, wet: 0.18 });
    osc({ f: f * 4, t: t, a: 0.002, peak: peak * 0.28, rel: 0.06, pan: pan });
    noise({ f: Math.min(6000, f * 5), q: 2, t: t, dur: 0.012, peak: peak * 0.35, pan: pan });
  }


  // ============================================================ sub-audio
  /* The documentary layer under the narration, on its own bus (`sub`):

       bed          a soft pad that runs while a chapter is open and changes
                    chord with the beat's mood, all in D so it never fights the
                    chimes and mallets above it
       foley        a short texture for the industry a beat is about
       punctuation  a whoosh on each step, a thump and shimmer when numbers or
                    photographs land, a swell into D major on the answer

     Mix: the narration is an <audio> element at full volume, deliberately NOT
     routed through Web Audio (from file:// that would make it cross-origin and
     silent). The sub bus sits at 35% between readings and glides down to 18%
     while the voice is actually speaking.

     🚨 Nothing plays on an idle screen still holds: the bed breathes out after
     40 s with no narration and no step, and comes back on the next one. */
  var SUB_PAUSE = 0.35, SUB_SPEAK = 0.18, BED_LEVEL = 0.11, IDLE_MS = 40000;
  var subOpen = false, speaking = false, bed = null, bedMoodNow = 'neutral', idleT = 0;

  var BED_CHORDS = {
    neutral: [146.83, 220.00, 329.63, 369.99],   // D add9, open voicing
    growth:  [146.83, 220.00, 277.18, 369.99],   // D major 7: warm, lifting
    tension: [146.83, 220.00, 329.63, 349.23],   // D minor add9: the F natural
    answer:  [146.83, 220.00, 293.66, 369.99]    // D major: home
  };

  function subLevel(tc) {
    if (!A || !sub) return;
    var target = subOpen ? (speaking ? SUB_SPEAK : SUB_PAUSE) : 0;
    var now = A.currentTime;
    sub.gain.cancelScheduledValues(now);
    sub.gain.setValueAtTime(sub.gain.value, now);
    sub.gain.setTargetAtTime(target, now, tc || (speaking ? 0.08 : 0.5));
  }

  function bedStart() {
    var a = ctx(); if (!a || bed) return;
    var t = a.currentTime;
    var g0 = a.createGain();
    g0.gain.setValueAtTime(0.0001, t);
    g0.gain.setTargetAtTime(BED_LEVEL, t, 0.9);
    var lp = a.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.6;
    // a very slow breath on the filter, so the pad is never quite static
    var lfo = a.createOscillator(), lfoG = a.createGain();
    lfo.frequency.value = 0.06; lfoG.gain.value = 160;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    var wet = a.createGain(); wet.gain.value = 0.5;
    g0.connect(lp); lp.connect(sub); lp.connect(wet); wet.connect(subSend);
    var voices = BED_CHORDS[bedMoodNow].map(function (f, i) {
      var o1 = a.createOscillator(), o2 = a.createOscillator(), vg = a.createGain();
      o1.type = 'sine'; o2.type = 'triangle';
      o1.frequency.value = f; o2.frequency.value = f; o2.detune.value = i % 2 ? 6 : -6;
      vg.gain.value = i === 0 ? 0.34 : 0.24;
      o1.connect(vg); o2.connect(vg); vg.connect(g0);
      o1.start(t); o2.start(t);
      return [o1, o2];
    });
    lfo.start(t);
    bed = { g: g0, lp: lp, lfo: lfo, voices: voices };
  }

  function bedStop(fast) {
    if (!bed || !A) { bed = null; return; }
    var b = bed, now = A.currentTime, tc = fast ? 0.05 : 0.8;
    bed = null;
    b.g.gain.cancelScheduledValues(now);
    b.g.gain.setValueAtTime(b.g.gain.value, now);
    b.g.gain.setTargetAtTime(0.0001, now, tc);
    var end = now + tc * 6;
    b.voices.forEach(function (v) { v[0].stop(end); v[1].stop(end); });
    b.lfo.stop(end);
    setTimeout(function () { try { b.g.disconnect(); b.lp.disconnect(); } catch (e) { /* gone */ } },
      (tc * 6 + 0.2) * 1000);
  }

  function touch() {
    clearTimeout(idleT);
    if (!subOpen) return;
    idleT = setTimeout(function () { if (!speaking) bedStop(); }, IDLE_MS);
  }

  function bedMood(mood, swell) {
    if (!subOpen) return;
    if (!BED_CHORDS[mood]) mood = 'neutral';
    bedMoodNow = mood;
    touch();
    if (!bed) { bedStart(); if (!bed) return; }
    var now = A.currentTime;
    BED_CHORDS[mood].forEach(function (f, i) {
      bed.voices[i][0].frequency.setTargetAtTime(f, now, 0.5);
      bed.voices[i][1].frequency.setTargetAtTime(f, now, 0.5);
    });
    if (swell) {
      // the answer: open the filter and lift the pad, then settle back
      bed.g.gain.cancelScheduledValues(now);
      bed.g.gain.setValueAtTime(bed.g.gain.value, now);
      bed.g.gain.setTargetAtTime(BED_LEVEL * 2.1, now, 0.35);
      bed.g.gain.setTargetAtTime(BED_LEVEL, now + 2.4, 1.2);
      bed.lp.frequency.cancelScheduledValues(now);
      bed.lp.frequency.setTargetAtTime(1500, now, 0.4);
      bed.lp.frequency.setTargetAtTime(620, now + 2.4, 1.2);
    }
  }

  function sOsc(o) { o.bus = 'sub'; osc(o); }
  function sNoise(o) { o.bus = 'sub'; noise(o); }

  // one texture per family; every one is a few seconds at most, then silence
  var FOLEY = {
    // mining, construction, manufacturing, utilities, transport: a struck,
    // inharmonic metal clink over an earthy low rumble
    heavy: function (t) {
      [[1, 0.1, 1.4], [2.76, 0.06, 0.8], [5.4, 0.035, 0.4], [8.93, 0.02, 0.22]].forEach(function (p) {
        sOsc({ f: 196 * p[0], t: t, a: 0.002, peak: p[1], rel: p[2], lp: { f: 3200 }, wet: 0.35 });
      });
      sNoise({ f: 90, q: 0.8, t: t, dur: 1.3, peak: 0.16 });
    },
    // health care: a soft lub-dub and one gentle monitor tone
    care: function (t) {
      sOsc({ f: 58, from: 1.6, t: t, a: 0.01, peak: 0.28, rel: 0.2 });
      sOsc({ f: 52, from: 1.5, t: t + 0.26, a: 0.01, peak: 0.2, rel: 0.22 });
      sOsc({ f: 1046.5, t: t + 0.75, a: 0.01, peak: 0.045, rel: 0.16, lp: { f: 2400 }, wet: 0.4 });
    },
    // IT, professional, media: a scatter of data ticks and small chirps
    digital: function (t) {
      [0, 0.07, 0.11, 0.2, 0.26, 0.37, 0.43, 0.55].forEach(function (d, i) {
        sNoise({ f: 3200 + (i % 3) * 1400, q: 6, t: t + d, dur: 0.006, peak: 0.08 });
      });
      [1760, 2349.32, 2637.02].forEach(function (f, i) {
        sOsc({ f: f, t: t + 0.12 + i * 0.16, a: 0.002, peak: 0.028, rel: 0.05, type: 'square', lp: { f: 3800 } });
      });
    },
    // pay, prices, inflation: a coin shimmer and a breath of paper
    money: function (t) {
      [2093, 2637, 3322, 4186].forEach(function (f, i) {
        sOsc({ f: f * (1 + i * 0.013), t: t + i * 0.035, a: 0.002, peak: 0.03, rel: 0.5 + i * 0.1, wet: 0.5 });
      });
      [0, 0.05, 0.11, 0.18].forEach(function (d) {
        sNoise({ f: 2600, q: 0.7, t: t + d, dur: 0.06, peak: 0.035 });
      });
    }
  };

  var SFX = {
    /* An industry bubble. Pay sets the note (log scale, quantised to the
       pentatonic, so Mining is the top of the scale and the $30k industries
       sit at the bottom); headcount sets the body: bigger workforces get a sub
       octave, a darker, more resonant filter and a longer ring.
       opts: {delay, hover, pan, key} */
    playBubble: function (pay, jobs, opts) {
      opts = opts || {};
      if (opts.hover && !throttle('hov:' + (opts.key || pay), 220)) return;
      if (opts.hover && !throttle('hov', 60)) return;
      var a = ctx(); if (!a) return;
      var r = ranges();
      var x = norm(Math.log(pay), Math.log(r.pay[0]), Math.log(r.pay[1]));
      var s = Math.sqrt(Math.max(0, norm(jobs, r.jobs[0], r.jobs[1])));
      var f = penta(x, 220, 12);                 // A3 up two octaves and a bit
      var t = a.currentTime + (opts.delay || 0);
      var loud = opts.hover ? 0.028 : (opts.enter ? 0.04 : 0.065);
      var rel = 0.16 + 0.75 * s;
      var lp = { f: f * (7 - 4.5 * s), q: 1 + 7 * s };
      osc({ f: f, from: 0.82, t: t, a: 0.008, peak: loud, rel: rel, lp: lp, pan: opts.pan, wet: 0.2 + 0.25 * s });
      osc({ f: f * 2, t: t, a: 0.004, peak: loud * 0.22, rel: rel * 0.4, type: 'triangle', lp: lp, pan: opts.pan });
      if (s > 0.4) osc({ f: f / 2, t: t, a: 0.02, peak: loud * 0.7 * s, rel: rel * 1.1, pan: opts.pan, wet: 0.3 });
    },

    /* A line drawing itself: one voice whose pitch rides the data, point to
       point, for exactly as long as the line takes to draw. `values` are in
       any unit; up is up. opts: {dur, delay, pan, lo, hi} */
    traceLine: function (values, opts) {
      opts = opts || {};
      var a = ctx(); if (!a || !values || values.length < 2) return;
      if (live > MAX_LIVE) return;
      var lo = opts.lo != null ? opts.lo : Math.min.apply(null, values);
      var hi = opts.hi != null ? opts.hi : Math.max.apply(null, values);
      var dur = Math.max(0.25, opts.dur || 0.8);
      var t = a.currentTime + (opts.delay || 0);
      // smooth the polyline into a glide: 64 steps of cosine interpolation
      var N = 64, curve = new Float32Array(N);
      for (var i = 0; i < N; i++) {
        var p = i / (N - 1) * (values.length - 1), k = Math.floor(p), fr = p - k;
        var v0 = values[k], v1 = values[Math.min(k + 1, values.length - 1)];
        var m = (1 - Math.cos(fr * Math.PI)) / 2;
        var x = norm(v0 + (v1 - v0) * m, lo, hi);
        curve[i] = 196 * Math.pow(2, x * 1.6);   // G3 up to about D5
      }
      var stop = t + dur + 0.35;
      var o = A.createOscillator(), o2 = A.createOscillator();
      o.type = 'triangle'; o2.type = 'sine';
      o.frequency.setValueCurveAtTime(curve, t, dur);
      var up = new Float32Array(N);
      for (var j = 0; j < N; j++) up[j] = curve[j] * 2;
      o2.frequency.setValueCurveAtTime(up, t, dur);
      var f = A.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500; f.Q.value = 0.8;
      var gn = A.createGain(), g2 = A.createGain();
      g2.gain.value = 0.22;
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(0.03, t + 0.09);
      gn.gain.setValueAtTime(0.03, t + dur);
      gn.gain.exponentialRampToValueAtTime(0.0001, stop);
      o.connect(f); o2.connect(g2); g2.connect(f); f.connect(gn);
      gn.connect(out(o, t, { pan: opts.pan, wet: 0.3 }));
      o.start(t); o2.start(t); o.stop(stop + 0.05); o2.stop(stop + 0.05);
    },

    /* Bars or dots landing: a soft mallet per point, pitched by its value on
       the pentatonic. items: [{v (0..1), delay (s), pan}] */
    cascade: function (items) {
      var a = ctx(); if (!a || !items || !items.length) return;
      var t0 = a.currentTime;
      var peak = items.length > 10 ? 0.02 : 0.028;
      items.forEach(function (it) {
        mallet(penta(it.v, 293.66, 11), t0 + (it.delay || 0), peak, it.pan);
      });
    },

    /* The emotional register of a beat.
         growth   a bright, warm chime rising
         tension  a low beating pulse, two notes a quarter-tone apart
         answer   a clean major chord that lingers   */
    storyBeat: function (type, delay) {
      var a = ctx(); if (!a) return;
      var t = a.currentTime + (delay || 0);
      if (type === 'growth') {
        [587.33, 739.99, 880, 1318.51].forEach(function (f, i) {
          var ti = t + i * 0.075;
          osc({ f: f, t: ti, a: 0.004, peak: 0.03, rel: 1.1, wet: 0.5 });
          osc({ f: f * 2, t: ti, a: 0.003, peak: 0.008, rel: 0.4, wet: 0.5 });
          osc({ f: f * 3, t: ti, a: 0.003, peak: 0.004, rel: 0.2 });
        });
      } else if (type === 'tension') {
        // 73.4 Hz against 76.0 Hz beats at about 2.6 Hz: a slow unease you feel
        // more than hear, with a muffled minor second on top
        [[73.42, 0], [75.98, 0], [146.83, 0.1], [155.56, 0.1]].forEach(function (p, i) {
          osc({ f: p[0], t: t + p[1], a: 0.35, peak: i < 2 ? 0.07 : 0.014, rel: 1.5,
                type: i < 2 ? 'sine' : 'triangle', lp: { f: 380, q: 1.2 }, wet: 0.25 });
        });
      } else if (type === 'answer') {
        // D major with an added ninth, strummed low to high, left to ring.
        // In D, like the bed underneath it: in G, its G rubbed against the pad's F sharp.
        [73.42, 146.83, 185, 220, 293.66, 329.63, 440].forEach(function (f, i) {
          var ti = t + i * 0.045;
          osc({ f: f, t: ti, a: 0.012, peak: i ? 0.022 : 0.03, rel: 2.6,
                lp: { f: 2600, q: 0.5 }, pan: (i / 6 - 0.5) * 0.6, wet: 0.55 });
          if (i > 2) osc({ f: f * 2, t: ti, a: 0.006, peak: 0.005, rel: 1.2, wet: 0.5 });
        });
      }
    },

    /* Turning a page. Forward is a crisp paper flick and a wooden knock that
       rises; back is the same gesture, lower and falling. */
    turn: function (dir) {
      if (!throttle('turn', 70)) return;
      var a = ctx(); if (!a) return;
      var t = a.currentTime, fwd = dir >= 0;
      noise({ f: fwd ? 2200 : 1300, to: fwd ? 4200 : 900, q: 0.9, t: t, dur: 0.05, peak: 0.022, pan: fwd ? 0.2 : -0.2 });
      osc({ f: fwd ? 880 : 587.33, slide: fwd ? 1.12 : 0.9, t: t + 0.01, a: 0.002, peak: 0.03, rel: 0.05, type: 'triangle' });
      osc({ f: fwd ? 1760 : 1174.66, t: t + 0.01, a: 0.001, peak: 0.008, rel: 0.02 });
    },

    /* Entering a chapter: a warm pad swells open (detuned saws through a filter
       that opens as it rises) and lets go on its own. */
    open: function () {
      var a = ctx(); if (!a) return;
      var t = a.currentTime;
      [[146.83, -7], [146.83, 7], [220, -5], [293.66, 4], [369.99, -3]].forEach(function (p, i) {
        osc({ f: p[0], detune: p[1], t: t + i * 0.02, a: 0.55, peak: i < 2 ? 0.016 : 0.011, rel: 1.6,
              type: 'sawtooth', lp: { f: 260, to: 1500, over: 0.7, q: 0.9 }, wet: 0.5,
              pan: (i % 2 ? 0.35 : -0.35) });
      });
    },

    /* Leaving a chapter: a suspended chord that resolves home. */
    close: function () {
      var a = ctx(); if (!a) return;
      var t = a.currentTime;
      [293.66, 392, 440].forEach(function (f, i) {             // Dsus4
        osc({ f: f, t: t + i * 0.03, a: 0.01, peak: 0.02, rel: 0.4, wet: 0.4 });
      });
      [146.83, 293.66, 369.99, 440].forEach(function (f, i) {   // D major
        osc({ f: f, t: t + 0.32 + i * 0.03, a: 0.02, peak: i ? 0.02 : 0.026, rel: 1.8,
              lp: { f: 2000, q: 0.5 }, wet: 0.55 });
      });
    },

    /* Interface grain. kind: 'toggle' (a segmented control), 'hover' (a card
       under the pointer), 'type' (search; `arg` is how many results remain, and
       fewer results tick higher, so narrowing a search sounds like closing in). */
    ui: function (kind, arg) {
      if (!throttle('ui:' + kind, kind === 'hover' ? 90 : 45)) return;
      var a = ctx(); if (!a) return;
      var t = a.currentTime;
      if (kind === 'toggle') {
        noise({ f: 3200, q: 3, t: t, dur: 0.014, peak: 0.02 });
        osc({ f: 1318.51, t: t, a: 0.001, peak: 0.016, rel: 0.035, type: 'triangle' });
      } else if (kind === 'hover') {
        osc({ f: 2349.32, t: t, a: 0.001, peak: 0.006, rel: 0.025 });
      } else if (kind === 'type') {
        var n = Math.max(0, Math.min(40, arg == null ? 20 : arg));
        noise({ f: 2600 + (40 - n) * 45, q: 4, t: t, dur: 0.01, peak: 0.012 });
        osc({ f: 1046.5 * Math.pow(2, (40 - n) / 40), t: t, a: 0.001, peak: 0.008, rel: 0.03 });
      }
    },

    /* The generic confirmation, kept for callers that only need "yes". */
    tap: function () { SFX.ui('toggle'); },

    /* Narration on: every synthesised sound drops by 70%, gliding rather than
       stepping so the drop itself is not heard. */
    duck: function (v) {
      ducked = !!v;
      if (!A || !bus) return;
      var now = A.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(ducked ? DUCK : 1, now + 0.25);
    },

    enabled: function () { return on; },


    /* ---- sub-audio: the story layer under the narration ---- */
    bedOpen: function (mood) {
      subOpen = true;
      if (!ctx()) return;
      subLevel(0.6);
      bedMood(mood || 'neutral');
    },
    bedMood: function (mood, swell) { if (ctx()) bedMood(mood, swell); },
    bedClose: function () {
      subOpen = false; speaking = false;
      clearTimeout(idleT);
      bedStop();
      subLevel(0.8);
    },
    /* kind: 'heavy' | 'care' | 'digital' | 'money' */
    foley: function (kind, delay) {
      var a = ctx(); if (!a || !subOpen || !FOLEY[kind]) return;
      FOLEY[kind](a.currentTime + (delay || 0));
    },
    /* A step between beats: air through a sweeping band, and a warm wooden
       knock, rising for forward and falling for back. */
    whoosh: function (dir) {
      var a = ctx(); if (!a || !subOpen) return;
      if (!throttle('whoosh', 90)) return;
      var t = a.currentTime, fwd = dir >= 0;
      sNoise({ f: fwd ? 350 : 2200, to: fwd ? 2200 : 350, q: 0.8, t: t, dur: 0.42, peak: 0.16,
               pan: fwd ? 0.25 : -0.25, wet: 0.3 });
      sOsc({ f: fwd ? 196 : 146.83, slide: fwd ? 1.15 : 0.88, t: t + 0.02, a: 0.003, peak: 0.12,
             rel: 0.07, type: 'triangle', lp: { f: 900 } });
    },
    /* Numbers or photographs landing: a sub-bass thump with a high shimmer,
       or, when the beat is about money, the coin shimmer instead. */
    punctuate: function (delay, money) {
      var a = ctx(); if (!a || !subOpen) return;
      var t = a.currentTime + (delay || 0);
      sOsc({ f: 42, from: 1.9, t: t, a: 0.004, peak: 0.3, rel: 0.34 });
      if (money) { FOLEY.money(t + 0.02); return; }
      sOsc({ f: 3520, t: t + 0.02, a: 0.004, peak: 0.018, rel: 0.6, wet: 0.6 });
      sOsc({ f: 4698.6, t: t + 0.05, a: 0.004, peak: 0.012, rel: 0.5, wet: 0.6 });
    },
    /* The sidechain: called whenever the narration starts or stops. */
    voice: function (active) {
      speaking = !!active;
      touch();
      if (speaking && subOpen && !bed && ctx()) bedStart();
      subLevel();
    },

    /* The one mute switch, and the one place `.nav-sfx` is kept in step. */
    set: function (v) {
      on = !!v;
      try { localStorage.setItem('wtwi.sfx', on ? '1' : '0'); } catch (e) { /* private mode */ }
      Array.prototype.forEach.call(document.querySelectorAll('.nav-sfx'), function (b) {
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (!A || !master) { if (on && ctx() && subOpen) { subLevel(0.3); bedMood(bedMoodNow); } return; }
      var now = A.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(on ? 1 : 0, now + 0.05);
      if (!on) bedStop(true);
      else if (ctx() && subOpen) { subLevel(0.3); bedMood(bedMoodNow); }
    },

    // for tests: how many voices are sounding, and whether the graph exists
    _state: function () {
      return { ctx: A ? A.state : String(A), unlocked: unlocked, on: on, ducked: ducked,
               live: live, bus: bus ? bus.gain.value : null, master: master ? master.gain.value : null,
               sub: sub ? sub.gain.value : null, subOpen: subOpen, speaking: speaking,
               bed: bed ? bedMoodNow : null };
    }
  };

  /* A backgrounded tab makes no sound at all. Suspending the context is the
     one reliable way: already-scheduled envelopes would otherwise still play. */
  document.addEventListener('visibilitychange', function () {
    if (!A) return;
    try { document.hidden ? A.suspend() : (on && A.resume()); } catch (e) { /* closed */ }
  });

  /* The first gesture anywhere unlocks audio, and builds and resumes the graph
     inside that gesture, which is the only moment every browser allows it. */
  function unlock() {
    unlocked = true;
    if (on) ctx();
    if (A && A.state === 'running') {
      ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { g.removeEventListener(ev, unlock, true); });
    }
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) {
    g.addEventListener(ev, unlock, true);
  });

  g.SFX = SFX;
})(window);
