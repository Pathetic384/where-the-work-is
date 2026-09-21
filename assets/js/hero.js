/* hero.js - the opening bubble field.
 *
 * Every industry in the country as a circle you can tap. Area is how many people
 * work there. Colour is pay, on a diverging scale anchored at the national
 * average: blue above it, red below it, muted grey at the line itself.
 *
 * Two things here are hard won and easy to undo:
 *
 * 1. NOTHING WITH TEXT IN IT IS EVER SCALED. Scaling a group that contains a
 *    glyph forces the browser to re-rasterise that glyph on every frame, and
 *    with eighteen emoji on screen that is what made the entrance stutter. The
 *    circles scale; the labels only fade.
 *
 * 2. The packing spreads to the shape of the stage. Gravity is anisotropic, so
 *    on a wide laptop screen the field fills the width instead of huddling into
 *    a circular blob with empty margins either side.
 */
(function (global) {
  'use strict';

  var V = global.VIZ;
  var SVG = 'http://www.w3.org/2000/svg';

  /* Diverging, low pay to high pay, national average at the middle step. The
     extremes are the lightest and the midpoint the most muted, which is the
     right shape for a dark background.
     ⚠️ These are the SOFTENED steps. The first version glared: its ends ran to
     9.3:1 against the surface and eighteen of them filling the screen was too
     much. Every step here still clears 3:1 (min 3.27), so the ends came down to
     7.9 and 7.3 rather than the fills going translucent, which is what the
     obvious fix would have been and would have dropped the whole ramp under the
     floor. Re-check contrast before touching any of these. */
  var RAMP = ['#dd8682', '#d96360', '#bd5a57', '#855c60',
              '#5b6472',
              '#3d69a0', '#2a70c6', '#3a7fd4', '#75a8e2'];

  /* The same nine steps, pre-compensated for an 88% fill.
     Dropping a fill to 42% made the circles pretty and made the pay scale
     illegible, because a translucent colour over a near-black page is simply a
     darker colour. The way to have both is to solve for it: each entry here is
     RAMP[i] pushed up so that `fill * 0.88 + surface * 0.12` lands back EXACTLY
     on RAMP[i]. The circle is genuinely translucent, the grain and the ambient
     wash read through it, and the colour a viewer sees is the validated step at
     its full contrast (min 3.28:1).
     ⚠️ These are derived, not chosen. Change RAMP or BUBBLE_ALPHA and these have
     to be recomputed, or the ramp on screen stops matching its own legend. */
  var RAMP_FILL = ['#fa9792', '#f56f6b', '#d56561', '#96676b',
                   '#667080',
                   '#4476b4', '#2e7edf', '#418fef', '#84bdff'];
  var BUBBLE_ALPHA = 0.88;
  var MID = 4;

  function el(t, attrs) {
    var n = document.createElementNS(SVG, t);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  // the families the page actually renders with; see charts.js
  var FONT_STACK = '"Segoe UI Variable Text", "SF Pro Text", -apple-system, "Segoe UI", Inter, Roboto, Arial, sans-serif';
  var ruler = null;
  function textWidth(text, size) {
    if (ruler === null) {
      try { ruler = document.createElement('canvas').getContext('2d'); }
      catch (e) { ruler = false; }
    }
    if (!ruler) return String(text).length * size * 0.58;
    ruler.font = '700 ' + size + 'px ' + FONT_STACK;
    return ruler.measureText(String(text)).width;
  }

  // mix a hex toward white (amt > 0) or black (amt < 0)
  function shade(hex, amt) {
    var h = hex.replace('#', '');
    var t = amt > 0 ? 255 : 0, p = Math.abs(amt);
    var out = '#';
    for (var i = 0; i < 3; i++) {
      var c = parseInt(h.substr(i * 2, 2), 16);
      var v = Math.round(c + (t - c) * p).toString(16);
      out += v.length < 2 ? '0' + v : v;
    }
    return out;
  }

  /* Rank within its own side of the average, so both arms get used. Fifteen of
     the eighteen sit between $30k and $90k while Mining sits at $172k, so
     spacing by raw value would put almost everything on one step. */
  function payStep(code, wage, below, above) {
    if (wage < below.mid) {
      var i = below.order.indexOf(code);
      var f = below.order.length > 1 ? i / (below.order.length - 1) : 0;
      return Math.round(f * MID);
    }
    var j = above.order.indexOf(code);
    var g = above.order.length > 1 ? j / (above.order.length - 1) : 1;
    return MID + Math.round(g * (RAMP.length - 1 - MID));
  }

  // The rendered colour. careerMap and the legend both use this.
  function payColour(code, wage, below, above) {
    return RAMP[payStep(code, wage, below, above)];
  }

  function payScale(rows, avg) {
    return {
      below: {
        mid: avg,
        order: rows.filter(function (d) { return d.wage < avg; })
          .sort(function (a, b) { return a.wage - b.wage; })
          .map(function (d) { return d.code; })
      },
      above: {
        order: rows.filter(function (d) { return d.wage >= avg; })
          .sort(function (a, b) { return a.wage - b.wage; })
          .map(function (d) { return d.code; })
      }
    };
  }

  function pack(nodes, w, h, pad) {
    var cx = w / 2, cy = h / 2;
    var spread = Math.min(w, h) * 0.46;
    var ratio = w / Math.min(w, h);
    nodes.forEach(function (n, i) {
      var a = i * 2.399963229728653;
      var rr = Math.sqrt((i + 0.5) / nodes.length) * spread;
      n.x = cx + Math.cos(a) * rr * ratio;
      n.y = cy + Math.sin(a) * rr * (h / Math.min(w, h));
    });
    // Pull hard along the short axis and weakly along the long one, so the
    // cluster ends up the shape of the stage rather than a circle in the middle.
    var gxs = Math.min(1, h / w);
    var gys = Math.min(1, w / h);
    var ITER = 520;
    for (var it = 0; it < ITER; it++) {
      for (var pass = 0; pass < 3; pass++) {
        for (var i = 0; i < nodes.length; i++) {
          for (var j = i + 1; j < nodes.length; j++) {
            var a = nodes[i], b = nodes[j];
            var dx = b.x - a.x, dy = b.y - a.y;
            var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
            var min = a.r + b.r + pad;
            if (d < min) {
              var push = (min - d) / d * 0.5;
              dx *= push; dy *= push;
              a.x -= dx; a.y -= dy;
              b.x += dx; b.y += dy;
            }
          }
        }
      }
      var g = 0.024 * (1 - it / ITER);
      for (var k = 0; k < nodes.length; k++) {
        var n = nodes[k];
        n.x += (cx - n.x) * g * gxs;
        n.y += (cy - n.y) * g * gys;
        n.x = Math.max(n.r + 1, Math.min(w - n.r - 1, n.x));
        n.y = Math.max(n.r + 1, Math.min(h - n.r - 1, n.y));
      }
    }
  }

  // 0 for the smallest industry, 1 for the largest. Bubble notes are pitched
  // off this the way real ones are: big and low, small and high.
  function sizeFrac(nodes, n) {
    var lo = nodes[nodes.length - 1].r, hi = nodes[0].r;
    return hi > lo ? (n.r - lo) / (hi - lo) : 0.5;
  }

  function worstOverlap(nodes, pad) {
    var worst = 0;
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var a = nodes[i], b = nodes[j];
        var d = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
        worst = Math.max(worst, a.r + b.r + pad - d);
      }
    }
    return worst;
  }

  /* Pack, and if anything still overlaps, shrink every circle by the same factor
     and pack again. Scaling all radii together keeps area proportional to
     employment, which is the one thing that must not bend. */
  function packUntilClear(nodes, w, h, pad) {
    for (var attempt = 0; attempt < 10; attempt++) {
      pack(nodes, w, h, pad);
      if (worstOverlap(nodes, pad) <= 0.6) return;
      nodes.forEach(function (n) { n.r *= 0.96; });
    }
  }

  function Hero(host, data, onOpen) {
    this.host = host;
    this.data = data;
    this.onOpen = onOpen;
    this.nodes = [];
    this.selected = null;
    this.svg = el('svg', { 'class': 'hero-svg' });
    host.appendChild(this.svg);
    this.build();
    var self = this;
    // A click on empty space inside the field closes whatever is open.
    this.svg.addEventListener('click', function (e) {
      if (!e.target.closest('.bub') && self.selected) self.select(self.selected);
    });
    if (global.ResizeObserver) {
      var rt;
      new ResizeObserver(function () {
        clearTimeout(rt);
        rt = setTimeout(function () { self.build(); }, 140);
      }).observe(host);
    }
  }

  Hero.prototype.build = function () {
    var self = this;
    var rect = this.host.getBoundingClientRect();
    var w = Math.max(260, Math.round(rect.width));
    var h = Math.max(220, Math.round(rect.height));
    if (w === this.w && h === this.h) return;
    var firstTime = !this.built;
    this.built = true;
    this.w = w; this.h = h;

    this.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    this.svg.setAttribute('width', w);
    this.svg.setAttribute('height', h);
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);

    var rows = this.data.divisions.filter(function (d) { return !d.hidden; });
    var totalJobs = rows.reduce(function (s, d) { return s + d.jobs; }, 0);
    var jobsList = rows.map(function (d) { return d.jobs; });
    var minJobs = Math.min.apply(null, jobsList);
    var maxJobs = Math.max.apply(null, jobsList);
    var sc = payScale(rows, this.data.economy.headline.wageRealLast);

    /* Two demands on the scale, and the bigger one wins: fill a good share of
       the stage, and make even the smallest industry big enough to carry its
       own name. Public admin has 108k jobs against Health care's 1,907k, so
       without the second rule the small ones end up as unlabelled dots. */
    var small = w < 560;
    var cover = small ? 0.46 : 0.58;
    var targetMin = small ? 21 : 30;
    var k = Math.max(
      Math.sqrt(cover * w * h / (Math.PI * totalJobs)),
      targetMin / Math.sqrt(minJobs)
    );
    var cap = Math.min(w, h) * (small ? 0.23 : 0.26);
    if (k * Math.sqrt(maxJobs) > cap) k = cap / Math.sqrt(maxJobs);

    this.nodes = rows.map(function (d) {
      return { d: d, r: k * Math.sqrt(d.jobs) };
    }).sort(function (a, b) { return b.r - a.r; });

    packUntilClear(this.nodes, w, h, small ? 5 : 8);

    var defs = el('defs');
    this.svg.appendChild(defs);

    this.nodes.forEach(function (n, i) {
      var step = payStep(n.d.code, n.d.wage, sc.below, sc.above);
      var fill = RAMP_FILL[step];     // pre-compensated, for the translucent body
      var seen = RAMP[step];          // what it renders as, for the rim
      n.fill = seen;

      // A lit sphere rather than a flat disc: light from the top left, the body
      // of the colour in the middle, a touch of shadow at the bottom.
      var gid = 'bg' + n.d.code;
      /* Glass, not paint. The fill sits at 42% so the background reads through
         it, which is what makes a field of eighteen of these calm instead of
         eighteen solid discs shouting at once.

         🚨 That costs the fill its contrast: blended over the surface it lands
         around 1.5 to 2.3:1, well under the 3:1 a data mark needs. The mark is
         still legible because the ENCODING moved to the rim, which is drawn at
         full opacity in a lightened step of the same colour and measures 4.9:1
         at worst, and every circle also carries its name in white. Lower the
         rim, or drop the labels, and this stops being defensible. */
      var grad = el('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0.35', y2: '1' });
      grad.appendChild(el('stop', { offset: '0%', 'stop-color': shade(fill, 0.18) }));
      grad.appendChild(el('stop', { offset: '55%', 'stop-color': fill }));
      grad.appendChild(el('stop', { offset: '100%', 'stop-color': shade(fill, -0.14) }));
      defs.appendChild(grad);

      var g = el('g', { 'class': 'bub', tabindex: '0', role: 'button' });
      g.setAttribute('transform', 'translate(' + n.x.toFixed(1) + ',' + n.y.toFixed(1) + ')');
      g.setAttribute('aria-label', n.d.short + ', ' + V.fmt(n.d.jobs, 0) +
        ' thousand jobs, ' + V.money(n.d.wage, 0) + ' average pay');

      var drift = el('g', { 'class': 'bub-float' });
      var pop = el('g', { 'class': 'bub-pop' });
      var lab = el('g', { 'class': 'bub-lab' });

      if (!V.reduceMotion) {
        drift.style.animationDuration = (13 + (i % 5) * 2.8) + 's';
        drift.style.animationDelay = (-i * 1.4) + 's';
        drift.style.setProperty('--fx',
          (((i % 3) - 1) * Math.min(5, 2 + n.r * 0.02)).toFixed(1) + 'px');
        drift.style.setProperty('--fy',
          (((i % 4) - 1.5) * Math.min(4, 1.6 + n.r * 0.015)).toFixed(1) + 'px');
        var d0 = firstTime ? i * 0.035 : 0;
        pop.style.animationDelay = d0 + 's';
        lab.style.animationDelay = (d0 + 0.22) + 's';
        /* On a cold load this is silent, and that is correct: no browser starts
           an AudioContext before the reader has touched the page. It sounds on
           a resize or a return to the top, once something has been clicked. */
        if (global.SFX) global.SFX.bubble(sizeFrac(self.nodes, n), d0 + 0.04);
      }

      /* A soft halo so each circle sits on the background rather than on top of
         it. Done with a fading gradient, never filter: blur(): a filter forces a
         full re-render of the element on every frame it is scaled, and with
         eighteen of them that alone brought the entrance to its knees. */
      var hid = 'ha' + n.d.code;
      var halo = el('radialGradient', { id: hid });
      halo.appendChild(el('stop', { offset: '62%', 'stop-color': seen, 'stop-opacity': '0.12' }));
      halo.appendChild(el('stop', { offset: '100%', 'stop-color': seen, 'stop-opacity': '0' }));
      defs.appendChild(halo);
      pop.appendChild(el('circle', {
        r: n.r * 1.3, fill: 'url(#' + hid + ')', 'class': 'bub-halo'
      }));
      var circle = el('circle', {
        r: n.r, fill: 'url(#' + gid + ')', 'fill-opacity': BUBBLE_ALPHA,
        stroke: shade(seen, 0.3), 'stroke-width': 1.5, 'stroke-opacity': 0.8,
        'class': 'bub-c'
      });
      pop.appendChild(circle);
      n.ring = circle;

      var named = n.r >= 26;
      if (n.r >= 14) {
        var ic = el('text', {
          'class': 'bub-i', y: named ? -n.r * 0.16 : 5, 'text-anchor': 'middle',
          'font-size': Math.max(13, Math.min(56, n.r * (named ? 0.52 : 0.8)))
        });
        ic.textContent = n.d.icon;
        lab.appendChild(ic);
      }
      if (named) {
        var fsz = Math.max(10.5, Math.min(19, n.r * 0.2));
        /* A long name on a circle near the edge would hang off the stage and be
           clipped, so nudge it inward by exactly as much as it overhangs. The
           circle stays where the packing put it; only the word moves. */
        var tw = textWidth(n.d.short, fsz);
        var dx = 0;
        if (n.x - tw / 2 < 4) dx = 4 - (n.x - tw / 2);
        else if (n.x + tw / 2 > w - 4) dx = (w - 4) - (n.x + tw / 2);
        var lb = el('text', {
          'class': 'bub-t', x: dx.toFixed(1), y: Math.max(14, n.r * 0.32),
          'text-anchor': 'middle', 'font-size': fsz
        });
        lb.textContent = n.d.short;
        lab.appendChild(lb);
      }

      drift.appendChild(pop);
      drift.appendChild(lab);       // sibling of pop: fades, never scales
      g.appendChild(drift);
      n.g = g;
      g.addEventListener('click', function () { self.select(n.d.code); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.select(n.d.code); }
      });
      self.svg.appendChild(g);
    });

    if (this.selected) this.paintSelected();
  };

  Hero.prototype.select = function (code) {
    if (global.SFX) global.SFX.tap();
    this.selected = this.selected === code ? null : code;
    this.paintSelected();
    if (this.onOpen) this.onOpen(this.selected);
  };

  Hero.prototype.close = function () {
    if (!this.selected) return;
    this.selected = null;
    this.paintSelected();
    if (this.onOpen) this.onOpen(null);
  };

  Hero.prototype.paintSelected = function () {
    var sel = this.selected;
    this.nodes.forEach(function (n) {
      n.g.classList.toggle('dim', !!sel && n.d.code !== sel);
      n.g.classList.toggle('sel', sel === n.d.code);
    });
  };

  global.HERO = {
    Hero: Hero, RAMP: RAMP, MID: MID,
    payColour: payColour, payStep: payStep, payScale: payScale
  };
})(window);
