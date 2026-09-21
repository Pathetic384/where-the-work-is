/* sfx.js - the sound of the thing.
 *
 * Small sounds so the site is listened to as well as looked at: a bubble note
 * as each circle surfaces and as one is tapped, and a short figure each time a
 * chart draws itself, pitched to what the chart does (bars tick up, lines climb,
 * dots pop).
 *
 * 🚨 NOTHING PLAYS ON AN IDLE SCREEN. An earlier version had a random bubble
 * note every few seconds and an ambient pad under the opening screen; left open
 * on a second monitor that is just an annoyance, and the user said so. Every
 * sound is now tied to something the reader caused: a tap, a step, a chart
 * appearing. The context is also suspended while the tab is hidden.
 *
 * SYNTHESISED, NOT SAMPLED. Every sound here is a few oscillators and a gain
 * envelope, so the whole feature costs zero bytes of download, zero network
 * requests and nothing to ship. A folder of wav files would sound marginally
 * richer and would undo the one property this site has kept from the start: it
 * runs from file:// with nothing to fetch.
 *
 * Two rules that are easy to break:
 *
 * 1. A browser will not start an AudioContext until the reader has interacted
 *    with the page, and it is right not to. Nothing here forces it: the context
 *    is created on the first real gesture, and every call before that is a
 *    silent no-op rather than an error. The entrance bubbles on a cold load are
 *    therefore silent, which is correct, not a bug.
 * 2. Everything is QUIET. A data site that beeps at you is worse than a silent
 *    one, so every note here peaks around 0.03 gain and is over in a moment.
 *    If a
 *    sound is noticeable on its own it is too loud.
 */
(function (g) {
  'use strict';

  var A = null;              // AudioContext, false once we know there is none
  var master = null;
  var on = true;

  // which sound a chart form gets when it draws itself
  var REVEAL = {
    rankingBars: 'bars', stateChart: 'bars', covidChart: 'bars',
    wageLines: 'rise', decomposition: 'rise', projectionBars: 'rise',
    growthScatter: 'pop', careerMap: 'pop',
    adviceBoard: 'chord'
  };

  try { on = localStorage.getItem('wtwi.sfx') !== '0'; } catch (e) { /* private mode */ }

  function ctx() {
    /* Suspending on visibilitychange is not enough on its own: ctx() resumes a
       suspended context, so a beat auto-advancing in a background tab would
       wake it straight back up and play into an empty room. */
    if (document.hidden) return false;
    if (A === null) {
      var C = g.AudioContext || g.webkitAudioContext;
      if (!C) { A = false; return false; }
      try { A = new C(); } catch (e) { A = false; return false; }
      master = A.createGain();
      master.gain.value = on ? 1 : 0;
      master.connect(A.destination);
    }
    if (A && A.state === 'suspended') { try { A.resume(); } catch (e) { /* needs a gesture */ } }
    return A && A.state === 'running' ? A : false;
  }

  // A tone with a percussive envelope. `slide` is the factor the pitch moves by
  // over the life of the note, which is what turns a beep into a bloop.
  function tone(freq, dur, peak, type, slide, delay) {
    var a = ctx(); if (!a) return;
    var t = a.currentTime + (delay || 0);
    var o = a.createOscillator();
    var gn = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide && slide !== 1) {
      o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur * 0.8);
    }
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, dur * 0.2));
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  var SFX = {
    /* A bubble surfacing. `size` is 0 for the smallest industry and 1 for the
       largest, and it maps to pitch the way it does in water: the big ones are
       low and slow, the small ones high and quick. */
    bubble: function (size, delay) {
      var s = Math.max(0, Math.min(1, size || 0));
      tone(560 - 330 * s, 0.10 + 0.07 * s, 0.05 + 0.02 * (1 - s), 'sine', 1.9, delay);
    },
    tap: function () {
      tone(300, 0.16, 0.07, 'sine', 2.3);
      tone(880, 0.07, 0.025, 'triangle', 1.2, 0.02);
    },
    open: function () {
      tone(294, 0.20, 0.045, 'sine', 1.02);
      tone(440, 0.22, 0.035, 'sine', 1.02, 0.06);
      tone(587, 0.26, 0.025, 'sine', 1.02, 0.12);
    },
    close: function () {
      tone(440, 0.18, 0.035, 'sine', 1);
      tone(294, 0.24, 0.03, 'sine', 1, 0.05);
    },

    /* A chart drawing itself. This is now the ONLY thing that makes a sound
       without being clicked: an unattended tab must be silent, which is what
       killed the idle bubble notes and the ambient pad that used to run under
       the opening screen. */
    reveal: function (chart) {
      var k = REVEAL[chart] || 'rise';
      if (k === 'rise') {
        // lines climbing: three notes up a major triad
        [294, 392, 494].forEach(function (f, i) { tone(f, 0.5, 0.032, 'sine', 1.01, i * 0.07); });
      } else if (k === 'bars') {
        // bars growing out of the axis: four short ticks, rising
        [0, 1, 2, 3].forEach(function (i) { tone(210 + i * 44, 0.15, 0.026, 'triangle', 1.5, i * 0.055); });
      } else if (k === 'pop') {
        // dots landing: the bubble note again, a few of them
        [0, 1, 2].forEach(function (i) { tone(400 - i * 70, 0.12, 0.03, 'sine', 1.9, i * 0.08); });
      } else {
        // the closing board: a soft open chord
        [392, 523, 659].forEach(function (f, i) { tone(f, 0.62, 0.024, 'sine', 1.004, i * 0.09); });
      }
    },

    enabled: function () { return on; },
    set: function (v) {
      on = !!v;
      try { localStorage.setItem('wtwi.sfx', on ? '1' : '0'); } catch (e) { /* private mode */ }
      if (master) {
        master.gain.cancelScheduledValues(A.currentTime);
        master.gain.linearRampToValueAtTime(on ? 1 : 0, A.currentTime + 0.15);
      }
      if (on) ctx();
    }
  };

  /* A backgrounded tab makes no sound at all. Suspending the context is the
     one reliable way: a queued note with a scheduled envelope would otherwise
     still fire while the reader is in another window. */
  document.addEventListener('visibilitychange', function () {
    if (!A) return;
    try { document.hidden ? A.suspend() : (on && A.resume()); } catch (e) { /* closed */ }
  });

  // The first gesture is what lets any of this make a sound at all.
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    g.addEventListener(ev, function unlock() {
      if (on) ctx();
    }, { passive: true });
  });

  g.SFX = SFX;
})(window);
