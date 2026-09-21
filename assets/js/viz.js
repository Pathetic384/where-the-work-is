/* viz.js - the drawing engine.
 *
 * One idea holds the whole site up: a chart is a list of KEYED marks. A beat of
 * the story hands the Scene a new list, the Scene matches marks by key, and
 * tweens each one from where it is to where it should be. Marks that appear are
 * faded in, marks that vanish are faded out.
 *
 * That is why chapter 04 can turn into chapter 05 by sliding the same eighteen
 * dots to a new axis instead of wiping the screen and drawing again.
 */
(function (global) {
  'use strict';

  // ------------------------------------------------------------------ easing
  var ease = {
    linear: function (t) { return t; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },          // cubic out
    inOut: function (t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    back: function (t) {
      var c = 1.70158, c3 = c + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    }
  };

  var reduceMotion = global.matchMedia
    ? global.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  // A single rAF loop drives every tween on the page.
  var running = [];
  var ticking = false;

  function frame(now) {
    ticking = false;
    for (var i = running.length - 1; i >= 0; i--) {
      var t = running[i];
      if (t.start === null) t.start = now;
      var p = t.dur <= 0 ? 1 : Math.min(1, (now - t.start - t.delay) / t.dur);
      if (now - t.start >= t.delay) t.step(t.easing(Math.max(0, p)));
      if (p >= 1) {
        running.splice(i, 1);
        if (t.done) t.done();
      }
    }
    if (running.length) pump();
  }

  function pump() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }

  function tween(opts) {
    var t = {
      start: null,
      dur: reduceMotion ? 0 : (opts.dur == null ? 700 : opts.dur),
      delay: reduceMotion ? 0 : (opts.delay || 0),
      easing: opts.ease || ease.out,
      step: opts.step,
      done: opts.done
    };
    running.push(t);
    pump();
    return t;
  }

  function stopAll() { running.length = 0; }

  /* Run every pending tween straight to its end state, synchronously. The
     animation loop is driven by requestAnimationFrame, which a browser stops
     entirely for a hidden tab, so without this a chart rendered while hidden
     would keep its entry pose forever. Also what the test harness uses to
     measure a finished chart without waiting for frames. */
  function flush() {
    var pending = running.slice();
    running.length = 0;
    pending.forEach(function (t) {
      try { t.step(1); if (t.done) t.done(); } catch (e) { /* keep flushing */ }
    });
  }

  // ------------------------------------------------------------------ scales
  function scaleLinear(d0, d1, r0, r1) {
    var span = (d1 - d0) || 1;
    function s(v) { return r0 + (v - d0) / span * (r1 - r0); }
    s.invert = function (p) { return d0 + (p - r0) / ((r1 - r0) || 1) * span; };
    s.domain = [d0, d1];
    s.range = [r0, r1];
    return s;
  }

  function scaleSqrt(d1, rMax) {
    // Area-proportional: a bubble twice the value gets twice the ink, not twice
    // the width. Anything else overstates the big industries.
    return function (v) { return Math.sqrt(Math.max(0, v) / (d1 || 1)) * rMax; };
  }

  function niceTicks(lo, hi, want) {
    want = want || 5;
    var span = hi - lo;
    if (span <= 0) return [lo];
    var raw = span / want;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) {
      out.push(Math.round(v / step) * step);
    }
    return out;
  }

  function extent(arr, get) {
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < arr.length; i++) {
      var v = get ? get(arr[i], i) : arr[i];
      if (v == null || isNaN(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  }

  // ------------------------------------------------------------------ format
  function fmt(v, nd) {
    if (v == null || isNaN(v)) return 'n/a';
    nd = nd == null ? 0 : nd;
    var s = Math.abs(v).toFixed(nd);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '-' : '') + parts.join('.');
  }
  function signed(v, nd) {
    return (v > 0 ? '+' : '') + fmt(v, nd == null ? 1 : nd) + '%';
  }
  function money(v, nd) { return '$' + fmt(v, nd == null ? 1 : nd) + 'k'; }

  // ------------------------------------------------------------------ colour
  function parseHex(h) {
    h = (h || '').trim();
    if (h.charAt(0) !== '#') return null;
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
  }
  function mixHex(a, b, t) {
    var ca = parseHex(a), cb = parseHex(b);
    if (!ca || !cb) return t < 0.5 ? a : b;
    var o = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(ca[i] + (cb[i] - ca[i]) * t).toString(16);
      o += v.length < 2 ? '0' + v : v;
    }
    return o;
  }

  // ------------------------------------------------------------------ marks
  // Attributes the engine knows how to interpolate.
  var NUM = {
    x: 1, y: 1, width: 1, height: 1, cx: 1, cy: 1, r: 1, rx: 1, ry: 1,
    x1: 1, y1: 1, x2: 1, y2: 1, opacity: 1, 'stroke-width': 1, 'font-size': 1,
    'stroke-dashoffset': 1, 'fill-opacity': 1, 'stroke-opacity': 1
  };
  var COLOUR = { fill: 1, stroke: 1 };
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(type) { return document.createElementNS(SVG_NS, type); }

  function pathFromPoints(pts, curve) {
    if (!pts || !pts.length) return '';
    var d = 'M' + pts[0][0].toFixed(2) + ' ' + pts[0][1].toFixed(2);
    if (!curve) {
      for (var i = 1; i < pts.length; i++) {
        d += 'L' + pts[i][0].toFixed(2) + ' ' + pts[i][1].toFixed(2);
      }
      return d;
    }
    // Light Catmull-Rom smoothing. Useful for 19-point time series, never for
    // anything where an intermediate value could be misread as data.
    for (var j = 0; j < pts.length - 1; j++) {
      var p0 = pts[j - 1] || pts[j], p1 = pts[j], p2 = pts[j + 1], p3 = pts[j + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += 'C' + c1x.toFixed(2) + ' ' + c1y.toFixed(2) + ',' + c2x.toFixed(2) + ' ' +
        c2y.toFixed(2) + ',' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2);
    }
    return d;
  }

  // ------------------------------------------------------------------ Scene
  function Scene(host) {
    this.host = host;
    this.svg = el('svg');
    this.svg.setAttribute('class', 'scene');
    this.layers = {};
    ['area', 'grid', 'mark', 'label', 'front'].forEach(function (name) {
      var g = el('g');
      g.setAttribute('class', 'layer-' + name);
      this.svg.appendChild(g);
      this.layers[name] = g;
    }, this);
    host.appendChild(this.svg);
    this.marks = {};       // key -> {node, attrs, text}
    this.w = 0;
    this.h = 0;
    this.measure();
  }

  Scene.prototype.measure = function () {
    var r = this.host.getBoundingClientRect();
    this.w = Math.max(240, Math.round(r.width));
    this.h = Math.max(200, Math.round(r.height));
    this.svg.setAttribute('viewBox', '0 0 ' + this.w + ' ' + this.h);
    this.svg.setAttribute('width', this.w);
    this.svg.setAttribute('height', this.h);
    return this;
  };

  Scene.prototype.clear = function () {
    for (var k in this.marks) {
      if (this.marks[k].node.parentNode) {
        this.marks[k].node.parentNode.removeChild(this.marks[k].node);
      }
    }
    this.marks = {};
  };

  /* render(marks, opts)
   * marks: [{key, type, layer, class, text, points, curve, ...svgAttrs}]
   * opts:  {dur, stagger, enter:{...attrs to start from}}
   */
  Scene.prototype.render = function (list, opts) {
    opts = opts || {};
    var dur = opts.dur == null ? 700 : opts.dur;
    var stagger = opts.stagger || 0;
    var seen = {};
    var self = this;

    list.forEach(function (spec, i) {
      if (!spec || !spec.key) return;
      seen[spec.key] = 1;
      var rec = self.marks[spec.key];
      var isNew = !rec;

      if (isNew) {
        var node = el(spec.type);
        node.setAttribute('class', spec['class'] || '');
        (self.layers[spec.layer || 'mark']).appendChild(node);
        rec = self.marks[spec.key] = { node: node, attrs: {}, type: spec.type };
        // Enter from the beat's entry pose, or just from transparent.
        var from = spec.enter || opts.enter || {};
        var seed = {};
        for (var a in spec) {
          if (a === 'key' || a === 'type' || a === 'layer' || a === 'class' ||
              a === 'text' || a === 'points' || a === 'curve' || a === 'enter' ||
              a === 'on' || a === 'data') continue;
          seed[a] = (from[a] != null) ? from[a] : spec[a];
        }
        seed.opacity = (from.opacity != null) ? from.opacity : 0;
        if (spec.points) rec.points = (from.points || spec.points).map(function (p) { return p.slice(); });
        rec.attrs = seed;
        self._paint(rec, seed, spec);
        if (spec.on) {
          Object.keys(spec.on).forEach(function (evt) { node.addEventListener(evt, spec.on[evt]); });
          node.style.cursor = 'pointer';
        }
      } else if (spec.on) {
        // handlers are re-bound each render so they close over fresh state
        if (rec.on) Object.keys(rec.on).forEach(function (e) { rec.node.removeEventListener(e, rec.on[e]); });
        Object.keys(spec.on).forEach(function (e) { rec.node.addEventListener(e, spec.on[e]); });
        rec.on = spec.on;
      }
      if (spec['class'] != null) rec.node.setAttribute('class', spec['class']);

      self._to(rec, spec, dur, stagger * i);
    });

    // exit
    Object.keys(this.marks).forEach(function (k) {
      if (seen[k]) return;
      var rec = self.marks[k];
      delete self.marks[k];
      tween({
        dur: dur * 0.5,
        step: function (t) { rec.node.setAttribute('opacity', (rec.attrs.opacity || 1) * (1 - t)); },
        done: function () { if (rec.node.parentNode) rec.node.parentNode.removeChild(rec.node); }
      });
    });
    return this;
  };

  Scene.prototype._to = function (rec, spec, dur, delay) {
    var from = {}, to = {}, any = false;
    for (var a in spec) {
      if (a === 'key' || a === 'type' || a === 'layer' || a === 'class' ||
          a === 'text' || a === 'points' || a === 'curve' || a === 'enter' ||
          a === 'on' || a === 'data') continue;
      var cur = rec.attrs[a];
      if (cur !== spec[a]) { from[a] = cur; to[a] = spec[a]; any = true; }
    }
    if (spec.opacity == null && rec.attrs.opacity !== 1) {
      from.opacity = rec.attrs.opacity; to.opacity = 1; any = true;
    }
    var fromPts = rec.points, toPts = spec.points;
    var pointsChanged = !!toPts && (!fromPts || fromPts.length !== toPts.length ||
      toPts.some(function (p, i) { return p[0] !== fromPts[i][0] || p[1] !== fromPts[i][1]; }));

    // Text that is a number counts; text that is a word snaps at the midpoint.
    var textFrom = rec.text, textTo = spec.text;
    var countFrom = null, countTo = null, countFmt = null;
    if (textTo != null && textFrom != null && textFrom !== textTo && spec.count) {
      countFrom = spec.countFrom != null ? spec.countFrom : rec.countValue;
      countTo = spec.count;
      countFmt = spec.countFmt || function (v) { return fmt(v, 0); };
    }

    if (!any && !pointsChanged && textFrom === textTo) return;

    var self = this;
    if (!fromPts && toPts) rec.points = toPts.map(function (p) { return p.slice(); });
    var basePts = rec.points;

    tween({
      dur: dur,
      delay: delay,
      ease: spec.ease === 'inOut' ? ease.inOut : ease.out,
      step: function (t) {
        var now = {};
        for (var a in to) {
          if (COLOUR[a]) {
            now[a] = mixHex(from[a] == null ? to[a] : from[a], to[a], t);
          } else if (NUM[a] && typeof to[a] === 'number') {
            var f = (typeof from[a] === 'number') ? from[a] : to[a];
            now[a] = f + (to[a] - f) * t;
          } else {
            now[a] = t < 0.5 && from[a] != null ? from[a] : to[a];
          }
        }
        if (pointsChanged) {
          var pts = [];
          var n = toPts.length;
          for (var i = 0; i < n; i++) {
            var src = basePts[i] || basePts[basePts.length - 1] || toPts[i];
            pts.push([src[0] + (toPts[i][0] - src[0]) * t, src[1] + (toPts[i][1] - src[1]) * t]);
          }
          rec.points = pts;
          now.d = pathFromPoints(pts, spec.curve);
        }
        if (countTo != null) {
          var v = (countFrom == null ? countTo : countFrom) +
            (countTo - (countFrom == null ? countTo : countFrom)) * t;
          rec.countValue = v;
          rec.node.textContent = countFmt(v);
        } else if (textTo != null && textFrom !== textTo) {
          rec.node.textContent = (t < 0.5 && textFrom != null) ? textFrom : textTo;
        }
        self._paint(rec, now, spec, true);
      },
      done: function () {
        if (countTo != null) { rec.countValue = countTo; rec.node.textContent = countFmt(countTo); }
        rec.text = textTo;
        for (var a in to) rec.attrs[a] = to[a];
        if (pointsChanged) rec.points = toPts.map(function (p) { return p.slice(); });
      }
    });
  };

  Scene.prototype._paint = function (rec, attrs, spec, partial) {
    var n = rec.node;
    for (var a in attrs) {
      if (attrs[a] == null) continue;
      n.setAttribute(a, typeof attrs[a] === 'number' ? +attrs[a].toFixed(2) : attrs[a]);
      if (!partial) rec.attrs[a] = attrs[a];
    }
    if (!partial) {
      if (spec.points) n.setAttribute('d', pathFromPoints(rec.points, spec.curve));
      if (spec.text != null) { n.textContent = spec.text; rec.text = spec.text; }
      if (spec.count != null) rec.countValue = spec.countFrom != null ? spec.countFrom : spec.count;
    }
  };

  // ------------------------------------------------------------------ export
  global.VIZ = {
    ease: ease,
    tween: tween,
    stopAll: stopAll,
    flush: flush,
    reduceMotion: reduceMotion,
    scaleLinear: scaleLinear,
    scaleSqrt: scaleSqrt,
    niceTicks: niceTicks,
    extent: extent,
    fmt: fmt,
    signed: signed,
    money: money,
    mixHex: mixHex,
    pathFromPoints: pathFromPoints,
    Scene: Scene
  };
})(window);
