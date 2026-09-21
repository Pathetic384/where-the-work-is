/* charts.js - one builder per chart form.
 *
 * A builder is a pure function: (ctx) -> [marks]. It never touches the DOM. The
 * Scene in viz.js decides what to animate by matching the keys, so keys are
 * chosen for MEANING, not position: a dot is "dot:Q" in every chapter, which is
 * how the same eighteen industries slide from one question to the next.
 *
 * Colour rule, inherited from the project's matplotlib charts and re-stepped for
 * a dark surface: three categorical hues maximum, blue -> orange -> aqua, with a
 * blue/red diverging pair for +/- charts. Never a fourth hue.
 */
(function (global) {
  'use strict';
  var V = global.VIZ;

  var C = {
    blue: '#3987e5',
    orange: '#d95926',
    aqua: '#199e70',
    red: '#e66767',
    ink: '#f2f3f5',
    ink2: '#a3abb8',
    muted: '#6f7885',
    dim: '#5f6877',      // de-emphasised data marks, 3.4:1 on the surface
    grid: '#1a1f26',
    axis: '#2b313a',
    surface: '#0a0c0f'
  };

  // ------------------------------------------------------------------ layout
  function box(ctx, m) {
    var sm = ctx.w < 640;
    var mar = {
      t: m && m.t != null ? m.t : 24,
      r: m && m.r != null ? m.r : (sm ? 16 : 28),
      b: m && m.b != null ? m.b : 44,
      l: m && m.l != null ? m.l : (sm ? 44 : 60)
    };
    return {
      sm: sm,
      x0: mar.l, x1: ctx.w - mar.r,
      y0: mar.t, y1: ctx.h - mar.b,
      iw: ctx.w - mar.l - mar.r,
      ih: ctx.h - mar.t - mar.b
    };
  }

  function txt(key, x, y, text, opt) {
    opt = opt || {};
    return {
      key: key, type: 'text', layer: opt.layer || 'label',
      x: x, y: y, text: text,
      fill: opt.fill || C.ink2,
      'font-size': opt.size || 12,
      'class': 'tx' + (opt.weight ? ' w' + opt.weight : '') + (opt.cls ? ' ' + opt.cls : ''),
      'text-anchor': opt.anchor || 'start',
      opacity: opt.opacity == null ? 1 : opt.opacity,
      count: opt.count, countFrom: opt.countFrom, countFmt: opt.countFmt
    };
  }

  /* An industry emoji, used wherever a mark needs to be recognised before it is
     read. It is decoration on top of an encoding that already works without it,
     never the encoding itself: every icon sits beside or inside a mark that is
     also labelled in text. */
  function icon(key, x, y, glyph, size, opt) {
    opt = opt || {};
    return {
      key: key, type: 'text', layer: opt.layer || 'label',
      x: x, y: y, text: glyph,
      'font-size': size,
      'class': 'tx ico',
      'text-anchor': opt.anchor || 'middle',
      opacity: opt.opacity == null ? 1 : opt.opacity
    };
  }

  function gridline(key, x1, y1, x2, y2, opt) {
    opt = opt || {};
    return {
      key: key, type: 'line', layer: opt.layer || 'grid',
      x1: x1, y1: y1, x2: x2, y2: y2,
      stroke: opt.stroke || C.grid,
      'stroke-width': opt.width || 1,
      'stroke-dasharray': opt.dash || null,
      opacity: opt.opacity == null ? 1 : opt.opacity
    };
  }

  /* A y-axis of value gridlines plus their labels. Keyed by tick value, so when
     the domain changes the shared ticks glide instead of blinking. */
  function yAxis(prefix, b, scale, ticks, fmtFn, opt) {
    opt = opt || {};
    var out = [];
    ticks.forEach(function (t) {
      var y = scale(t);
      out.push(gridline(prefix + ':g:' + t, b.x0, y, b.x1, y, {
        stroke: (opt.zero && t === 0) ? C.axis : C.grid,
        width: (opt.zero && t === 0) ? 1.5 : 1
      }));
      out.push(txt(prefix + ':t:' + t, b.x0 - 8, y + 4, fmtFn(t), {
        anchor: 'end', size: b.sm ? 10 : 11, fill: C.muted
      }));
    });
    return out;
  }

  function xAxis(prefix, b, scale, ticks, fmtFn, opt) {
    opt = opt || {};
    var out = [];
    ticks.forEach(function (t) {
      var x = scale(t);
      if (opt.lines) {
        out.push(gridline(prefix + ':xg:' + t, x, b.y0, x, b.y1, {
          stroke: (opt.zero && t === 0) ? C.axis : C.grid,
          width: (opt.zero && t === 0) ? 1.5 : 1
        }));
      }
      out.push(txt(prefix + ':xt:' + t, x, b.y1 + 20, fmtFn(t), {
        anchor: 'middle', size: b.sm ? 10 : 11, fill: C.muted
      }));
    });
    return out;
  }

  /* Measuring, not guessing. The career map decides which names it can fit by
     comparing label boxes, and a character-count estimate was wrong often enough
     to let two names overlap. This is a private 2D context used purely as a
     ruler: it draws nothing and is not part of the page. */
  var FONT_STACK = '"Segoe UI Variable Text", "SF Pro Text", -apple-system, "Segoe UI", Inter, Roboto, Arial, sans-serif';
  var ruler = null;
  function textWidth(text, size, bold) {
    if (!ruler) {
      try {
        ruler = document.createElement('canvas').getContext('2d');
      } catch (e) { ruler = false; }
    }
    if (!ruler) return String(text).length * size * 0.62;   // no canvas: be generous
    // must name the families the page actually renders with, or the fitting drifts
    ruler.font = (bold ? '600 ' : '') + size + 'px ' + FONT_STACK;
    return ruler.measureText(String(text)).width;
  }

  function fitLine(pts) {
    var n = pts.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
    pts.forEach(function (p) { sx += p[0]; sy += p[1]; sxy += p[0] * p[1]; sxx += p[0] * p[0]; });
    var den = n * sxx - sx * sx;
    if (!den) return null;
    var slope = (n * sxy - sx * sy) / den;
    return { slope: slope, intercept: (sy - slope * sx) / n };
  }

  // ==================================================================
  // 01 - pay ranking. Horizontal bars, sorted, with the economy average
  //      as a reference line.
  // ==================================================================
  function rankingBars(ctx) {
    var s = ctx.beat, D = ctx.data;
    var rows = D.divisions.filter(function (d) { return !d.hidden; })
      .slice().sort(function (a, b) { return b[s.field || 'wage'] - a[s.field || 'wage']; });
    var b = box(ctx, { l: ctx.w < 640 ? 96 : 150, r: 64, t: 28, b: 28 });
    var field = s.field || 'wage';
    var hi = V.extent(rows, function (d) { return d[field]; })[1];
    var x = V.scaleLinear(0, hi * 1.02, b.x0, b.x1);
    var step = b.ih / rows.length;
    var bh = Math.min(22, step * 0.62);
    var fs = Math.max(8, Math.min(b.sm ? 10 : 12, step - 2));
    var showValues = step >= 13;
    var out = [];
    var hlSet = {};
    (s.highlight || []).forEach(function (c) { hlSet[c] = 1; });
    var anyHl = (s.highlight || []).length > 0;

    rows.forEach(function (d, i) {
      var y = b.y0 + i * step + (step - bh) / 2;
      var on = !anyHl || hlSet[d.code];
      var col = !anyHl ? C.blue : (hlSet[d.code] ? (s.colours && s.colours[d.code] || C.blue) : C.dim);
      out.push({
        key: 'bar:' + d.code, type: 'rect', layer: 'mark',
        x: b.x0, y: y, width: Math.max(2, x(d[field]) - b.x0), height: bh,
        rx: 4, fill: col, opacity: on ? 1 : 0.55,
        enter: { width: 0 },
        data: d,
        on: ctx.tipHandlers && ctx.tipHandlers(d)
      });
      out.push(txt('nm:' + d.code, b.x0 - 10, y + bh / 2 + 4, d.short, {
        anchor: 'end', size: fs,
        fill: on ? C.ink : C.muted, weight: on ? 6 : null
      }));
      if (bh >= 12) {
        out.push(icon('ic:' + d.code, b.x0 + 14, y + bh / 2 + fs * 0.36,
          d.icon, Math.min(fs + 2, bh - 2), { opacity: on ? 1 : 0.45 }));
      }
      if (showValues) out.push(txt('vl:' + d.code, x(d[field]) + 8, y + bh / 2 + 4,
        s.valueFmt ? s.valueFmt(d[field]) : V.money(d[field], 1), {
          anchor: 'start', size: fs,
          fill: on ? C.ink : C.muted, weight: on ? 6 : null,
          count: d[field], countFrom: 0,
          countFmt: s.valueFmt || function (v) { return V.money(v, 1); }
        }));
    });

    if (s.reference != null) {
      var rx = x(s.reference);
      out.push(gridline('ref', rx, b.y0 - 2, rx, b.y1 + 2, {
        layer: 'front', stroke: C.orange, width: 2, dash: '5 4'
      }));
      out.push(txt('reflab', rx, b.y0 - 11, s.referenceLabel || 'average', {
        anchor: 'middle', size: 11, fill: C.orange, weight: 6, layer: 'front'
      }));
    }
    return out;
  }

  // ==================================================================
  // 02 - nominal vs real pay. Two lines, ONE axis: both are dollars per
  //      worker per year, so they are directly comparable. The vertical
  //      gap between them is exactly the inflation that was lost.
  // ==================================================================
  function wageLines(ctx) {
    var s = ctx.beat, D = ctx.data, yrs = D.meta.years;
    var b = box(ctx, { l: 58, r: ctx.w < 640 ? 20 : 150, t: 28, b: 44 });
    var nom = D.economy.wageNominal, real = D.economy.wageReal;
    var x = V.scaleLinear(0, yrs.length - 1, b.x0, b.x1);
    var y = V.scaleLinear(0, 80, b.y1, b.y0);
    var out = [];
    var ticks = [0, 20, 40, 60, 80];
    out = out.concat(yAxis('w', b, y, ticks, function (t) { return '$' + t + 'k'; }));
    var xt = [0, 6, 12, 18].filter(function (i) { return i < yrs.length; });
    out = out.concat(xAxis('w', b, x, xt, function (i) { return yrs[i]; }));

    var upto = s.upto == null ? yrs.length - 1 : s.upto;
    function pts(arr) {
      var p = [];
      for (var i = 0; i <= upto; i++) p.push([x(i), y(arr[i])]);
      return p;
    }

    if (s.showNominal !== false) {
      out.push({
        key: 'line:nom', type: 'path', layer: 'mark',
        points: pts(nom), curve: true, fill: 'none',
        stroke: s.focus === 'real' ? C.dim : C.blue, 'stroke-width': 2.5,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      });
      out.push({
        key: 'dot:nom', type: 'circle', layer: 'front',
        cx: x(upto), cy: y(nom[upto]), r: 5,
        fill: s.focus === 'real' ? C.dim : C.blue,
        stroke: C.surface, 'stroke-width': 2
      });
    }
    if (s.showReal) {
      out.push({
        key: 'line:real', type: 'path', layer: 'mark',
        points: pts(real), curve: true, fill: 'none',
        stroke: C.orange, 'stroke-width': 2.5,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        enter: { points: pts(nom) }   // the real line PEELS OFF the nominal one
      });
      out.push({
        key: 'dot:real', type: 'circle', layer: 'front',
        cx: x(upto), cy: y(real[upto]), r: 5, fill: C.orange,
        stroke: C.surface, 'stroke-width': 2
      });
    }

    // The gap at the start year is the whole point of the chapter.
    if (s.showGap) {
      out.push(gridline('gap', x(0), y(nom[0]), x(0), y(real[0]), {
        layer: 'front', stroke: C.ink2, width: 1.5, dash: '3 3'
      }));
      out.push(txt('gaplab', x(0) + 10, (y(nom[0]) + y(real[0])) / 2 + 4,
        'inflation', { size: 11, fill: C.ink2, weight: 6, layer: 'front' }));
    }

    // Two series always carry a legend. Wide enough, it sits at the end of each
    // line where the eye already is; narrow, it becomes a swatch row up top,
    // because end-of-line labels have nowhere to go.
    var nomCol = s.focus === 'real' ? C.dim : C.blue;
    if (!b.sm) {
      if (s.showNominal !== false) {
        out.push(txt('lg:nom', x(upto) + 12, y(nom[upto]) + 4, 'What the payslip said',
          { size: 12, fill: s.focus === 'real' ? C.muted : C.blue, weight: 6 }));
      }
      if (s.showReal) {
        out.push(txt('lg:real', x(upto) + 12, y(real[upto]) - 12, 'What it really bought',
          { size: 12, fill: C.orange, weight: 6 }));
      }
    } else {
      var lx = b.x0;
      if (s.showNominal !== false) {
        out.push({
          key: 'sw:nom', type: 'rect', layer: 'label', x: lx, y: b.y0 - 22,
          width: 12, height: 3, rx: 1.5, fill: nomCol
        });
        out.push(txt('lg:nom', lx + 17, b.y0 - 17, 'payslip',
          { size: 10, fill: s.focus === 'real' ? C.muted : C.blue, weight: 6 }));
        lx += 78;
      }
      if (s.showReal) {
        out.push({
          key: 'sw:real', type: 'rect', layer: 'label', x: lx, y: b.y0 - 22,
          width: 12, height: 3, rx: 1.5, fill: C.orange
        });
        out.push(txt('lg:real', lx + 17, b.y0 - 17, 'what it bought',
          { size: 10, fill: C.orange, weight: 6 }));
      }
    }
    /* Hover columns — one per year, invisible, so the tooltip can show what
       both lines say at any point along the axis. Sits ON TOP so the pointer
       finds it whether or not there is a mark to hit. */
    for (var i = 0; i <= upto; i++) {
      var xi = x(i);
      var half = (b.iw / Math.max(1, yrs.length - 1)) / 2;
      out.push({
        key: 'hz:' + i, type: 'rect', layer: 'front',
        x: xi - half, y: b.y0, width: half * 2, height: b.ih,
        fill: '#000', 'fill-opacity': 0,
        on: ctx.tipHandlers && ctx.tipHandlers({
          name: yrs[i],
          _rows: [
            ['Payslip (nominal)', V.money(nom[i], 1)],
            ['What it bought (real)', V.money(real[i], 1)]
          ]
        })
      });
    }
    return out;
  }

  // ==================================================================
  // 03 / 04 - the scatter that answers the research question. Identical
  //      dots, identical keys; only the y measure changes between the two
  //      chapters, so the dots migrate rather than being redrawn.
  // ==================================================================
  function growthScatter(ctx) {
    var s = ctx.beat, D = ctx.data;
    var rows = D.divisions.filter(function (d) { return !d.hidden; });
    var b = box(ctx, { l: 58, r: 24, t: 24, b: 52 });
    var yf = s.yField || 'jobsGrowth';
    var xe = V.extent(rows, function (d) { return d.ivaGrowth; });
    var ye = V.extent(rows, function (d) { return d[yf]; });
    var xpad = (xe[1] - xe[0]) * 0.1, ypad = (ye[1] - ye[0]) * 0.14;
    var x = V.scaleLinear(xe[0] - xpad, xe[1] + xpad, b.x0, b.x1);
    var y = V.scaleLinear(ye[0] - ypad, ye[1] + ypad, b.y1, b.y0);
    var out = [];
    var nT = b.sm ? 3 : 5;
    out = out.concat(yAxis('sc', b, y, V.niceTicks(y.domain[0], y.domain[1], nT),
      function (t) { return V.signed(t, 0); }, { zero: true }));
    out = out.concat(xAxis('sc', b, x, V.niceTicks(x.domain[0], x.domain[1], nT),
      function (t) { return V.signed(t, 0); }, { lines: true, zero: true }));

    out.push(txt('sc:xlab', (b.x0 + b.x1) / 2, ctx.h - 8,
      'Industry output growth, real, 2006-07 to 2024-25',
      { anchor: 'middle', size: b.sm ? 10 : 12, fill: C.muted }));
    out.push(txt('sc:ylab', 14, b.y0 - 10, s.yLabel || 'Jobs growth',
      { size: b.sm ? 10 : 12, fill: C.muted, weight: 6 }));

    if (s.trend) {
      var fit = fitLine(rows.map(function (d) { return [d.ivaGrowth, d[yf]]; }));
      if (fit) {
        var lo = x.domain[0], hi = x.domain[1];
        out.push({
          key: 'trend', type: 'line', layer: 'mark',
          x1: x(lo), y1: y(fit.intercept + fit.slope * lo),
          x2: x(hi), y2: y(fit.intercept + fit.slope * hi),
          stroke: s.trendColour || C.aqua, 'stroke-width': 2,
          'stroke-dasharray': '6 5', opacity: 0.9
        });
      }
    }

    var hlSet = {};
    (s.highlight || []).forEach(function (c) { hlSet[c] = 1; });
    var anyHl = (s.highlight || []).length > 0;

    rows.forEach(function (d) {
      var on = !anyHl || hlSet[d.code];
      var rr = b.sm ? (on ? 11 : 9) : (on ? 14 : 11);
      out.push({
        key: 'dot:' + d.code, type: 'circle', layer: 'mark',
        cx: x(d.ivaGrowth), cy: y(d[yf]),
        r: rr,
        fill: on ? (s.colours && s.colours[d.code] || C.blue) : C.dim,
        stroke: C.surface, 'stroke-width': 2,
        opacity: on ? 1 : 0.75,
        ease: 'inOut',
        on: ctx.tipHandlers && ctx.tipHandlers(d)
      });
      out.push(icon('di:' + d.code, x(d.ivaGrowth), y(d[yf]) + rr * 0.38,
        d.icon, rr * 1.05, { layer: 'label', opacity: on ? 1 : 0.5 }));
      var lab = (s.labels || []).indexOf(d.code) >= 0;
      if (lab) {
        // A centred label on a dot near the edge would hang off the plot, so
        // anchor it inward once it gets within half a label of the frame.
        var half = d.short.length * (b.sm ? 2.9 : 3.5);
        var lx = x(d.ivaGrowth), anchor = 'middle';
        if (lx + half > b.x1) { lx = b.x1; anchor = 'end'; }
        else if (lx - half < b.x0) { lx = b.x0; anchor = 'start'; }
        out.push(txt('dl:' + d.code, lx, y(d[yf]) - 14, d.short, {
          anchor: anchor, size: b.sm ? 10 : 12, fill: C.ink, weight: 6
        }));
      }
    });
    return out;
  }

  // ==================================================================
  // 05 - where the growth went. One bar splits into the two things that
  //      can make an economy bigger: more workers, or more value each.
  // ==================================================================
  function decomposition(ctx) {
    var s = ctx.beat, D = ctx.data, H = D.economy.headline;
    var b = box(ctx, { l: 24, r: 24, t: 20, b: 24 });
    var out = [];
    var narrow = ctx.w < 700;
    var jobsPart = H.jobsShareOfGrowth / 100;
    var full = b.iw;

    /* Beat 1 has one bar and nothing else, which left it stranded at the top of
       an empty frame. So when there is no breakdown to show, the whole block is
       centred and the bar is given room: a taller bar, the total spelled out
       underneath it, and the two possible explanations waiting as outlined
       slots. Those slots are the shapes the bar splits into on the next beat,
       so the empty space is doing work instead of just being empty. */
    var barH = s.rows ? (narrow ? 44 : 56) : (narrow ? 64 : 92);
    var slotH = narrow ? 52 : 64;
    var blockH = s.rows
      ? barH + 96
      : barH + 34 + (s.split ? 0 : slotH + 26) + 60;
    var barY = s.rows ? b.y0 + 40 : b.y0 + Math.max(10, (b.ih - blockH) / 2) + 34;

    out.push(txt('dc:cap', b.x0, barY - 16,
      narrow ? 'Real output growth, whole economy'
             : 'Real output growth of the whole economy, ' +
               D.meta.firstYear + ' to ' + D.meta.baseYear,
      { size: 12, fill: C.muted }));

    if (!s.split) {
      out.push({
        key: 'seg:jobs', type: 'rect', layer: 'mark',
        x: b.x0, y: barY, width: full, height: barH, rx: 6,
        fill: C.blue, enter: { width: 0 }
      });
      out.push(txt('seg:jobs:l', b.x0 + full / 2, barY + barH / 2 + 4,
        V.signed(H.ivaRealGrowth, 1),
        { anchor: 'middle', size: narrow ? 24 : 34, fill: '#ffffff', weight: 7 }));
      out.push(txt('seg:jobs:s', b.x0 + full / 2, barY + barH / 2 + (narrow ? 20 : 26),
        'total real growth, ' + D.meta.firstYear + ' to ' + D.meta.baseYear,
        { anchor: 'middle', size: narrow ? 10 : 12, fill: 'rgba(255,255,255,0.72)' }));

      // the two ways an economy can get bigger, still empty
      var slotY = barY + barH + 34;
      var halfW = (full - 14) / 2;
      [['slotA', b.x0, 'More people working', C.blue],
       ['slotB', b.x0 + halfW + 14, 'More value per person', C.orange]].forEach(function (sl) {
        out.push({
          key: sl[0], type: 'rect', layer: 'mark',
          x: sl[1], y: slotY, width: halfW, height: slotH, rx: 6,
          fill: 'none', stroke: C.axis, 'stroke-width': 1.5,
          'stroke-dasharray': '6 5'
        });
        out.push(txt(sl[0] + ':t', sl[1] + halfW / 2, slotY + slotH / 2 + 5, sl[2],
          { anchor: 'middle', size: narrow ? 11 : 13, fill: C.muted }));
      });
      out.push(txt('dc:q', b.x0 + full / 2, slotY + slotH + 30,
        'Which one was it?',
        { anchor: 'middle', size: narrow ? 12 : 15, fill: C.ink2, weight: 6 }));
      return out;
    }

    var wJobs = full * jobsPart - 1;           // 2px surface gap between fills
    var wProd = full * (1 - jobsPart) - 1;
    out.push({
      key: 'seg:jobs', type: 'rect', layer: 'mark',
      x: b.x0, y: barY, width: wJobs, height: barH, rx: 6, fill: C.blue
    });
    out.push({
      key: 'seg:prod', type: 'rect', layer: 'mark',
      x: b.x0 + full * jobsPart + 1, y: barY, width: wProd, height: barH, rx: 6,
      fill: C.orange, enter: { x: b.x0 + full, width: 0 }
    });
    out.push(txt('seg:jobs:l', b.x0 + wJobs / 2, barY + barH / 2 + 8,
      H.jobsShareOfGrowth + '%',
      { anchor: 'middle', size: narrow ? 20 : 26, fill: '#ffffff', weight: 7 }));
    out.push(txt('seg:prod:l', b.x0 + full * jobsPart + 1 + wProd / 2, barY + barH / 2 + 8,
      H.productivityShareOfGrowth + '%',
      { anchor: 'middle', size: narrow ? 20 : 26, fill: '#ffffff', weight: 7 }));

    /* Two captions, and under each of them the actual figure that produced
       the percentage. Without it, 74% and 26% read as decoration; with it, a
       reader can see they are shares of the +60.5% total above, and that the
       productivity half is 13.1 points inside a 60.5 point bar. */
    out.push(txt('slotA:t', b.x0, barY + barH + 22,
      'came from hiring more people',
      { size: narrow ? 11 : 13, fill: C.blue, weight: 6 }));
    out.push(txt('slotA:v', b.x0, barY + barH + (narrow ? 38 : 40),
      '+' + H.jobsGrowth + '% more workers, of the ' + H.ivaRealGrowth + '% total',
      { size: narrow ? 10 : 11, fill: C.muted }));
    out.push(txt('slotB:t', narrow ? b.x0 : b.x0 + full, barY + barH + (narrow ? 58 : 22),
      'came from each person producing more',
      { anchor: narrow ? 'start' : 'end', size: narrow ? 11 : 13, fill: C.orange, weight: 6 }));
    out.push(txt('slotB:v', narrow ? b.x0 : b.x0 + full, barY + barH + (narrow ? 74 : 40),
      '+' + H.productivityGrowth + '% more per worker, and wages track this half',
      { anchor: narrow ? 'start' : 'end', size: narrow ? 10 : 11, fill: C.muted }));

    if (!s.rows) {
      out.push(txt('dc:q', b.x0 + full / 2, barY + barH + (narrow ? 96 : 78),
        ctx.w < 520 ? 'Pay follows the orange half.'
                    : 'Pay follows the orange half, and the orange half barely moved.',
        { anchor: 'middle', size: ctx.w < 520 ? 11 : 15, fill: C.ink2, weight: 6 }));
      return out;
    }

    // Per-industry split, same two hues, sorted by how jobs-led they are.
    var rows = D.divisions.filter(function (d) { return !d.hidden && d.driver !== 'Shrinking'; })
      .slice().sort(function (a, c) { return c.jobsContribution - a.jobsContribution; });
    var top = barY + barH + (narrow ? 96 : 78);
    var avail = b.y1 - top;
    var step = avail / rows.length;
    // Seventeen rows need room. Below about 15px each the names collide, and a
    // collided chart is worse than no chart.
    if (step < 15) {
      out.push(txt('dc:note', b.x0, top + 18,
        'Nearly every industry split the same way.',
        { size: 11, fill: C.ink2 }));
      out.push(txt('dc:note2', b.x0, top + 38,
        'Wider screen for the full breakdown.',
        { size: 10, fill: C.muted }));
      return out;
    }
    var rh = Math.min(13, step * 0.66);
    var lw = ctx.w < 640 ? 100 : 156;
    var rowW = b.iw - lw - 52;
    rows.forEach(function (d, i) {
      var yy = top + i * step;
      var frac = Math.max(0, Math.min(1, d.jobsContribution / 100));
      out.push(txt('rw:n:' + d.code, b.x0 + lw - 8, yy + rh / 2 + 4,
        d.icon + '  ' + d.short,
        { anchor: 'end', size: ctx.w < 640 ? 9 : 11, fill: C.ink2 }));
      out.push({
        key: 'rw:j:' + d.code, type: 'rect', layer: 'mark',
        x: b.x0 + lw, y: yy, width: Math.max(1, rowW * frac - 1), height: rh,
        rx: 3, fill: C.blue, enter: { width: 0 },
        on: ctx.tipHandlers && ctx.tipHandlers({
          name: d.short,
          _rows: [
            ['Growth from hiring', Math.round(d.jobsContribution) + '%'],
            ['From more per person', Math.round(100 - d.jobsContribution) + '%'],
            ['Real output growth', V.signed(d.ivaGrowth, 1) + '%']
          ]
        })
      });
      out.push({
        key: 'rw:p:' + d.code, type: 'rect', layer: 'mark',
        x: b.x0 + lw + rowW * frac + 1, y: yy,
        width: Math.max(1, rowW * (1 - frac) - 1), height: rh,
        rx: 3, fill: C.orange, enter: { width: 0 }
      });
      out.push(txt('rw:v:' + d.code, b.x0 + lw + rowW + 8, yy + rh / 2 + 4,
        d.jobsContribution < 0 ? 'jobs fell' : Math.round(d.jobsContribution) + '%',
        { size: ctx.w < 640 ? 9 : 11, fill: C.muted }));
    });
    return out;
  }

  // ==================================================================
  // 06 - the career map. Pay against recent hiring, bubble area = how many
  //      people already work there.
  // ==================================================================
  function careerMap(ctx) {
    var s = ctx.beat, D = ctx.data;
    var rows = D.divisions.filter(function (d) { return !d.hidden; });
    // Same diverging pay scale as the opening bubble field, so a reader who met
    // an industry there recognises it here. It doubles the x axis on purpose:
    // redundant encoding is what makes eighteen circles readable at a glance.
    var payScale = global.HERO
      ? global.HERO.payScale(rows, D.economy.headline.wageRealLast) : null;
    function payFill(d) {
      return payScale
        ? global.HERO.payColour(d.code, d.wage, payScale.below, payScale.above)
        : C.blue;
    }
    var placed = [];
    function reserve(cx, cy, text, size, anchor) {
      // .quad renders uppercase and letter-spaced, neither of which the ruler
      // knows about, so add for both.
      var w = textWidth(String(text).toUpperCase(), size, false) + text.length * 1.1;
      var x0 = anchor === 'end' ? cx - w : (anchor === 'middle' ? cx - w / 2 : cx);
      placed.push({ x: x0, y: cy - size, w: w, h: size + 4 });
    }
    function freeSpot(cx, cy, r, text, size) {
      var w = textWidth(text, size, true) + 8, h = size + 5;
      var tries = [cy + (r >= 26 ? r * 0.42 : r + size + 2), cy - r - 6, cy + r + size + 14];
      for (var t = 0; t < tries.length; t++) {
        var box = { x: cx - w / 2, y: tries[t] - h, w: w, h: h };
        if (box.x < b.x0 - 4 || box.x + box.w > b.x1 + 4) continue;
        var clash = false;
        for (var i = 0; i < placed.length; i++) {
          var p = placed[i];
          if (Math.min(box.x + box.w, p.x + p.w) - Math.max(box.x, p.x) > -2 &&
              Math.min(box.y + box.h, p.y + p.h) - Math.max(box.y, p.y) > -2) { clash = true; break; }
        }
        if (!clash) { placed.push(box); return tries[t]; }
      }
      return null;
    }
    var b = box(ctx, { l: 58, r: 24, t: 28, b: 52 });
    var xe = V.extent(rows, function (d) { return d.wage; });
    var ye = V.extent(rows, function (d) { return d.jobs5y; });
    var x = V.scaleLinear(xe[0] - 14, xe[1] + 14, b.x0, b.x1);
    var y = V.scaleLinear(ye[0] - 8, ye[1] + 8, b.y1, b.y0);
    var rMax = ctx.w < 640 ? 26 : 40;
    var rs = V.scaleSqrt(V.extent(rows, function (d) { return d.jobs; })[1], rMax);
    var out = [];
    var nTicks = b.sm ? 3 : 5;
    out = out.concat(yAxis('cm', b, y, V.niceTicks(y.domain[0], y.domain[1], nTicks),
      function (t) { return V.signed(t, 0); }, { zero: true }));
    out = out.concat(xAxis('cm', b, x, V.niceTicks(x.domain[0], x.domain[1], nTicks),
      function (t) { return '$' + Math.round(t) + 'k'; }));
    out.push(txt('cm:xlab', (b.x0 + b.x1) / 2, ctx.h - 8,
      'Average pay, 2024-25, after inflation',
      { anchor: 'middle', size: b.sm ? 10 : 12, fill: C.muted }));
    out.push(txt('cm:ylab', 14, b.y0 - 12, 'Jobs growth, last 5 years',
      { size: b.sm ? 10 : 12, fill: C.muted, weight: 6 }));

    if (s.quadrants) {
      var bx = x(D.benchmarks.wage), by = y(D.benchmarks.jobs5y);
      out.push(gridline('q:v', bx, b.y0, bx, b.y1, { stroke: C.axis, width: 1.5, dash: '5 4' }));
      out.push(gridline('q:h', b.x0, by, b.x1, by, { stroke: C.axis, width: 1.5, dash: '5 4' }));
      var pad = 10;
      var quads = b.sm
        ? [['q:tl', b.x0 + pad, b.y0 + 16, 'hiring fast', 'start'],
           ['q:bl', b.x0 + pad, b.y1 - 8, 'hiring slowly', 'start']]
        : [['q:tl', b.x0 + pad, b.y0 + 16, 'Hiring, lower pay', 'start'],
           ['q:tr', b.x1 - pad, b.y0 + 16, 'Hiring, higher pay', 'end'],
           ['q:bl', b.x0 + pad, b.y1 - 8, 'Slow, lower pay', 'start'],
           ['q:br', b.x1 - pad, b.y1 - 8, 'Slow, higher pay', 'end']];
      var qs = b.sm ? 10 : 11;
      quads.forEach(function (q) {
        out.push(txt(q[0], q[1], q[2], q[3],
          { size: qs, fill: C.muted, anchor: q[4], cls: 'quad' }));
        reserve(q[1], q[2], q[3], qs, q[4]);
      });
    }

    var hlSet = {};
    (s.highlight || []).forEach(function (c) { hlSet[c] = 1; });
    var anyHl = (s.highlight || []).length > 0;

    rows.slice().sort(function (a, c) { return c.jobs - a.jobs; }).forEach(function (d) {
      var on = !anyHl || hlSet[d.code];
      out.push({
        key: 'dot:' + d.code, type: 'circle', layer: 'mark',
        cx: x(d.wage), cy: y(d.jobs5y), r: rs(d.jobs),
        fill: on ? (s.colours && s.colours[d.code] || payFill(d)) : C.dim,
        'fill-opacity': on ? 0.5 : 0.18,
        stroke: on ? (s.colours && s.colours[d.code] || payFill(d)) : C.dim,
        'stroke-width': 2, ease: 'inOut',
        on: ctx.tipHandlers && ctx.tipHandlers(d)
      });
      // The industry symbol sits inside its bubble, above the name when there is
      // room for both. It is recognition, not encoding: position and size still
      // carry every number on this chart.
      var br = rs(d.jobs);
      if (br >= 13) {
        out.push(icon('bi:' + d.code, x(d.wage),
          y(d.jobs5y) + (br >= 26 ? -br * 0.16 : br * 0.34),
          d.icon, Math.max(12, Math.min(26, br * 0.6)),
          { layer: 'label', opacity: on ? 1 : 0.5 }));
      }
      // Try to label everything. A greedy pass takes the biggest circles first
      // and skips any name that cannot be placed without hitting one already
      // down, so the chart is as labelled as it can be and never overlapping.
      var lsize = b.sm ? 9.5 : 11.5;
      var ly = freeSpot(x(d.wage), y(d.jobs5y), br, d.short, lsize);
      if (ly != null && (!anyHl || hlSet[d.code] || !b.sm)) {
        out.push(txt('dl:' + d.code, x(d.wage), ly, d.short, {
          anchor: 'middle', size: lsize, weight: 6,
          fill: on ? C.ink : C.ink2, cls: 'halo'
        }));
      }
    });
    return out;
  }

  // ==================================================================
  // 07 - states. Bars against the national benchmark.
  // ==================================================================
  function stateChart(ctx) {
    var s = ctx.beat, D = ctx.data;
    var field = s.field || 'wage';
    var rows = D.states.slice().sort(function (a, c) { return c[field] - a[field]; });
    var b = box(ctx, { l: 54, r: 24, t: 36, b: 40 });
    var hi = V.extent(rows, function (d) { return d[field]; })[1];
    var lo = field === 'wage' ? 0 : Math.min(0, V.extent(rows, function (d) { return d[field]; })[0]);
    var step = b.iw / rows.length;
    var bw = Math.min(64, step * 0.6);
    var y = V.scaleLinear(lo, hi * 1.12, b.y1, b.y0);
    var out = [];
    var roomForValues = step >= 52;
    out = out.concat(yAxis('st', b, y, V.niceTicks(lo, hi * 1.12, b.sm ? 3 : 4),
      s.tickFmt || function (t) { return '$' + Math.round(t) + 'k'; }));

    var bench = D.stateBenchmark[field];
    if (bench != null && s.benchmark) {
      out.push(gridline('st:bench', b.x0, y(bench), b.x1, y(bench),
        { layer: 'front', stroke: C.orange, width: 2, dash: '5 4' }));
      out.push(txt('st:benchlab', b.x1, y(bench) - 8, 'Australia ' +
        (s.tickFmt ? s.tickFmt(bench) : V.money(bench, 1)),
        { anchor: 'end', size: 11, fill: C.orange, weight: 6, layer: 'front' }));
    }

    rows.forEach(function (d, i) {
      var cx = b.x0 + step * i + step / 2;
      var on = !s.highlight || s.highlight.indexOf(d.code) >= 0;
      out.push({
        key: 'sbar:' + d.code, type: 'rect', layer: 'mark',
        x: cx - bw / 2, y: y(d[field]), width: bw, height: Math.max(2, b.y1 - y(d[field])),
        rx: 4, fill: on ? C.blue : C.dim, enter: { y: b.y1, height: 0 },
        on: ctx.tipHandlers && ctx.tipHandlers({
          short: d.name, jobs: d.jobs, wage: d.wage,
          jobsGrowth: d.jobsGrowth, wageGrowth: d.wageGrowth,
          blurb: 'Biggest employers: ' + d.top.map(function (t) { return t.short; }).join(', ')
        })
      });
      out.push(txt('slab:' + d.code, cx, b.y1 + 20, d.code,
        { anchor: 'middle', size: Math.max(8, Math.min(12, step * 0.42)),
          fill: on ? C.ink : C.muted, weight: 6 }));
      if (roomForValues) {
        out.push(txt('sval:' + d.code, cx, y(d[field]) - 9,
          s.tickFmt ? s.tickFmt(d[field]) : V.money(d[field], 1),
          { anchor: 'middle', size: 11, fill: on ? C.ink2 : C.muted }));
      }
    });
    return out;
  }

  // ==================================================================
  // 08 - the COVID shock. Two years, diverging blue/red around zero.
  // ==================================================================
  function covidChart(ctx) {
    var s = ctx.beat, D = ctx.data;
    var rows = D.covid.slice().sort(function (a, c) { return a.y1 - c.y1; });
    var withIcons = ctx.w >= 700;
    var b = box(ctx, { l: ctx.w < 500 ? 96 : (withIcons ? 176 : 132),
                       r: 56, t: 34, b: 30 });
    var all = [];
    rows.forEach(function (d) { all.push(d.y1); if (s.year2) all.push(d.y2); });
    var e = V.extent(all);
    var m = Math.max(Math.abs(e[0]), Math.abs(e[1])) * 1.15;
    var x = V.scaleLinear(-m, m, b.x0, b.x1);
    var step = b.ih / rows.length;
    var bh = Math.min(20, step * 0.6);
    var out = [];
    out.push(gridline('cv:zero', x(0), b.y0 - 6, x(0), b.y1 + 4, { stroke: C.axis, width: 1.5 }));
    out.push(txt('cv:title', x(0), b.y0 - 16,
      s.year2 ? 'the year after' : 'the first COVID year, to June 2020',
      { anchor: 'middle', size: 12, fill: C.muted }));

    rows.forEach(function (d, i) {
      var v = s.year2 ? d.y2 : d.y1;
      var yy = b.y0 + i * step + (step - bh) / 2;
      var on = !s.highlight || s.highlight.indexOf(d.code) >= 0;
      var col = v < 0 ? C.red : C.blue;
      out.push({
        key: 'cv:' + d.code, type: 'rect', layer: 'mark',
        x: v < 0 ? x(v) : x(0), y: yy,
        width: Math.max(2, Math.abs(x(v) - x(0))), height: bh, rx: 3,
        fill: on ? col : C.dim, opacity: on ? 1 : 0.5, ease: 'inOut',
        enter: { x: x(0), width: 0 },
        on: ctx.tipHandlers && ctx.tipHandlers({
          name: d.short,
          _rows: [
            ['First COVID year', V.signed(d.y1, 1) + '%'],
            ['The year after', V.signed(d.y2, 1) + '%']
          ]
        })
      });
      out.push(txt('cvn:' + d.code, b.x0 - 10, yy + bh / 2 + 4,
        (withIcons ? d.icon + '  ' : '') + d.short,
        { anchor: 'end', size: b.sm ? 9 : 11, fill: on ? C.ink2 : C.muted }));
      if (ctx.w >= 480) {
        out.push(txt('cvv:' + d.code, (v < 0 ? x(v) - 8 : x(v) + 8), yy + bh / 2 + 4,
          V.signed(v, 1), {
            anchor: v < 0 ? 'end' : 'start', size: b.sm ? 9 : 11,
            fill: on ? C.ink : C.muted
          }));
      }
    });
    return out;
  }


  // ==================================================================
  // 09 - what happens next, if the last ten years simply repeat. Current
  //      jobs as a solid bar, the projected change as an outlined
  //      extension, so the known and the assumed never look alike.
  // ==================================================================
  function projectionBars(ctx) {
    var s = ctx.beat, D = ctx.data, PJ = D.projection;
    var rows = PJ.rows.slice().sort(function (a, c) { return c.then - a.then; });
    var b = box(ctx, { l: ctx.w < 640 ? 104 : 168, r: 64, t: 30, b: 28 });
    var hi = Math.max.apply(null, rows.map(function (d) { return Math.max(d.now, d.then); }));
    var x = V.scaleLinear(0, hi * 1.02, b.x0, b.x1);
    var step = b.ih / rows.length;
    var bh = Math.min(18, step * 0.6);
    var fs = Math.max(8, Math.min(ctx.w < 640 ? 10 : 11.5, step - 3));
    var out = [];
    var hlSet = {};
    (s.highlight || []).forEach(function (c) { hlSet[c] = 1; });
    var anyHl = (s.highlight || []).length > 0;

    out.push(txt('pj:cap', b.x0, b.y0 - 12,
      s.projected
        ? (ctx.w < 620 ? 'Now, and if the trend repeats'
                       : 'Jobs now, and where the last ten years would take them by ' + PJ.horizonYear)
        : 'Jobs today, ' + D.meta.baseYear,
      { size: 12, fill: C.muted }));

    rows.forEach(function (d, i) {
      var y = b.y0 + i * step + (step - bh) / 2;
      var on = !anyHl || hlSet[d.code];
      var grew = d.added >= 0;
      out.push({
        key: 'pj:now:' + d.code, type: 'rect', layer: 'mark',
        x: b.x0, y: y, width: Math.max(2, x(d.now) - b.x0), height: bh, rx: 3,
        fill: on ? C.blue : C.dim, opacity: on ? 1 : 0.5, enter: { width: 0 },
        on: ctx.tipHandlers && ctx.tipHandlers({
          name: d.short,
          _rows: [
            ['Jobs, ' + D.meta.baseYear, V.fmt(d.now, 0) + 'k'],
            ['Projected ' + PJ.horizonYear, V.fmt(d.then, 0) + 'k'],
            ['Change on this arithmetic', V.signed(d.added, 0) + 'k, ' + V.signed(d.growthPct, 1) + '%']
          ]
        })
      });
      if (step >= 11) {
        out.push(txt('pj:n:' + d.code, b.x0 - 10, y + bh / 2 + 4,
          (ctx.w >= 700 ? d.icon + '  ' : '') + d.short,
          { anchor: 'end', size: fs, fill: on ? C.ink : C.muted, weight: on ? 6 : null }));
      }

      if (s.projected) {
        // The projected part is outlined, not filled: it has not happened.
        var x0 = grew ? x(d.now) : x(d.then);
        var w = Math.abs(x(d.then) - x(d.now));
        out.push({
          key: 'pj:add:' + d.code, type: 'rect', layer: 'mark',
          x: x0, y: y, width: Math.max(1.5, w), height: bh, rx: 3,
          fill: 'none',
          stroke: on ? (grew ? C.aqua : C.red) : C.dim,
          'stroke-width': 1.5, 'stroke-dasharray': '4 3',
          opacity: on ? 1 : 0.4,
          enter: { x: x(d.now), width: 0 }
        });
        out.push(txt('pj:v:' + d.code, x(Math.max(d.now, d.then)) + 8, y + bh / 2 + 4,
          (grew ? '+' : '') + V.fmt(d.added, 0) + 'k',
          { size: fs, fill: on ? (grew ? C.aqua : C.red) : C.muted, weight: on ? 6 : null }));
      } else {
        out.push(txt('pj:v:' + d.code, x(d.now) + 8, y + bh / 2 + 4,
          V.fmt(d.now, 0) + 'k', { size: fs, fill: on ? C.ink2 : C.muted }));
      }
    });
    return out;
  }

  // ==================================================================
  // 10 - job types. The same bar form as chapter 01, but the rows are
  //      subdivisions and the field changes per beat, so a reader can see
  //      how wide the spread inside one industry actually is. Rows arrive
  //      from the beat, so the prose and the picture quote the same ones.
  // ==================================================================
  function subRanking(ctx) {
    var s = ctx.beat, rows = s.rows || [];
    if (!rows.length) return [];
    var b = box(ctx, { l: ctx.w < 640 ? 108 : 210, r: 66, t: 26, b: 26 });
    /* Two modes. A plain ranking grows rightwards from the left edge. A
       DIVERGING one (growth and decline in the same column) puts a zero line
       where the data says it goes and grows both ways from it.
       ⚠️ Rows always arrive sorted with the LONGEST bar first. Sorting a
       diverging set by magnitude-of-decline while the scale is set by a +273%
       gain leaves the top of the chart a column of stubs and a screen of empty
       space, which is what the reader hit. */
    var vals = rows.map(function (r) { return r.value; });
    var lo = Math.min.apply(null, vals), hiV = Math.max.apply(null, vals);
    var diverging = !!s.diverging && lo < 0;
    var x, zero;
    if (diverging) {
      var pad = (hiV - lo) * 0.04 || 1;
      x = V.scaleLinear(lo - pad, hiV + pad, b.x0, b.x1);
      zero = x(0);
    } else {
      var hi = Math.max.apply(null, vals.map(Math.abs));
      x = V.scaleLinear(0, hi * 1.04 || 1, b.x0, b.x1);
      zero = b.x0;
    }
    var step = b.ih / rows.length;
    var bh = Math.min(20, step * 0.6);
    var fs = Math.max(8, Math.min(b.sm ? 9.5 : 11.5, step - 3));
    var out = [];

    rows.forEach(function (r, i) {
      var y = b.y0 + i * step + (step - bh) / 2;
      var tone = C[r.tone] || C.blue;
      var v = diverging ? x(r.value) : x(Math.abs(r.value));
      var bx = Math.min(zero, v), bw = Math.max(2, Math.abs(v - zero));
      out.push({
        key: 'sb:' + r.code, type: 'rect', layer: 'mark',
        x: bx, y: y, width: bw, height: bh,
        rx: 4, fill: tone, opacity: r.dim ? 0.45 : 1,
        enter: { width: 0, x: zero },
        on: ctx.tipHandlers && ctx.tipHandlers({
          name: r.label,
          _rows: [[s.tipLabel || 'This measure', r.text]]
        })
      });
      out.push(txt('sn:' + r.code, b.x0 - 10, y + bh / 2 + 4,
        clip(r.label, fs, b.x0 - 30), {
          anchor: 'end', size: fs, fill: r.dim ? C.muted : C.ink, weight: r.dim ? null : 6
        }));
      if (bh >= 11) {
        out.push(icon('si:' + r.code, bx + 13, y + bh / 2 + fs * 0.36,
          r.icon, Math.min(fs + 2, bh - 2), { opacity: r.dim ? 0.45 : 1 }));
      }
      /* The value sits just past the bar on the side AWAY from the row names:
         to the right of a positive bar, and to the right of the zero line for a
         negative one, where that row is empty. Putting it at the far left end of
         a negative bar walks it straight into the name gutter. */
      out.push(txt('sv:' + r.code, (r.value < 0 ? zero : v) + 8, y + bh / 2 + 4, r.text, {
        anchor: 'start', size: fs,
        fill: r.dim ? C.muted : C.ink, weight: r.dim ? null : 6
      }));
    });

    if (diverging) {
      out.push(gridline('szero', zero, b.y0 - 2, zero, b.y1 + 2,
        { stroke: C.axis, width: 1 }));
    }

    if (s.reference != null) {
      var rx = x(s.reference);
      out.push(gridline('sref', rx, b.y0 - 2, rx, b.y1 + 2,
        { layer: 'front', stroke: C.orange, width: 2, dash: '5 4' }));
      out.push(txt('sreflab', rx, b.y0 - 10, s.referenceLabel || 'average', {
        anchor: 'middle', size: 11, fill: C.orange, weight: 6, layer: 'front'
      }));
    }
    return out;
  }

  // ==================================================================
  // 11 - the advice board. Not a chart: a table of "if you want X, look at
  //      these" with two or three names on each row, built up one row at a
  //      time so the voice can take them in turn.
  //
  //      🚨 The rows that are SHOWN are centred in the frame, not pinned to
  //      the top. A single row stranded at the top of an empty box looks
  //      unfinished; centring means the block grows outward and the earlier
  //      rows slide up as the later ones arrive, which is the movement the
  //      beat is describing.
  // ==================================================================
  function clip(text, size, maxw, bold) {
    if (textWidth(text, size, bold) <= maxw) return text;
    var t = text;
    while (t.length > 1 && textWidth(t + '\u2026', size, bold) > maxw) t = t.slice(0, -1);
    return t + '\u2026';
  }

  function adviceBoard(ctx) {
    var s = ctx.beat, rows = s.rows || [];
    if (!rows.length) return [];
    var narrow = ctx.w < 760;
    var b = box(ctx, { l: 8, r: 8, t: 10, b: 10 });
    var step = Math.min(b.ih / rows.length, 96);
    var upto = s.upto == null ? rows.length : s.upto;
    var top = b.y0 + (b.ih - Math.max(1, upto) * step) / 2;
    var pad = narrow ? 12 : 18;
    var out = [];

    rows.forEach(function (r, i) {
      var shown = i < upto;
      var lit = shown && (s.focus == null || s.focus === i);
      var tone = C[r.tone] || C.blue;
      // hidden rows wait just below the block, so they rise into place
      var y = shown ? top + i * step : top + upto * step;
      var h = Math.max(10, step - 8);
      var cy = y + 4 + h / 2;

      out.push({
        key: 'ab:' + i, type: 'rect', layer: 'mark',
        x: b.x0, y: y + 4, width: b.iw, height: h, rx: 12,
        fill: lit ? '#141a23' : C.grid,
        opacity: shown ? 1 : 0, enter: { opacity: 0 }
      });
      out.push({
        key: 'as:' + i, type: 'rect', layer: 'mark',
        x: b.x0, y: y + 4, width: 4, height: h, rx: 2,
        fill: tone, opacity: shown ? (lit ? 1 : 0.4) : 0, enter: { opacity: 0 }
      });

      var gx = b.x0 + pad + 6;
      var right = b.x1 - pad;
      var gs = narrow ? 11.5 : 12.5;
      var ps = narrow ? 12.5 : 14;

      out.push(txt('ag:' + i, gx, cy - (narrow ? 10 : 12),
        clip(r.goal, gs, right - gx), {
          size: gs, fill: lit ? C.ink2 : C.muted, opacity: shown ? 1 : 0
        }));

      /* The picks run along one line and are measured, not estimated: a pick
         that will not fit is dropped rather than overlapping the next one. */
      var cx = gx;
      var lineY = cy + (narrow ? 12 : 13);
      (r.picks || []).forEach(function (p, j) {
        var label = p.name + '  ' + p.value;
        var w = 19 + textWidth(label, ps, true);
        if (cx + w > right) return;
        out.push(icon('ai:' + i + ':' + j, cx + 7, lineY, p.icon, ps + 1,
          { opacity: shown ? (lit ? 1 : 0.5) : 0 }));
        out.push(txt('an:' + i + ':' + j, cx + 19, lineY, p.name, {
          size: ps, weight: 6, fill: lit ? C.ink : C.muted, opacity: shown ? 1 : 0
        }));
        var nw = textWidth(p.name, ps, true);
        out.push(txt('av:' + i + ':' + j, cx + 19 + nw + 8, lineY, p.value, {
          size: ps, weight: 6, fill: lit ? tone : C.muted, opacity: shown ? 1 : 0
        }));
        cx += w + (narrow ? 14 : 22);
      });
    });
    return out;
  }

  // ==================================================================
  // shared: a small line for the explorer panels
  // ==================================================================
  function sparkPath(vals, w, h, pad) {
    pad = pad || 4;
    var e = V.extent(vals);
    var span = (e[1] - e[0]) || 1;
    var pts = vals.map(function (v, i) {
      return [pad + i / (vals.length - 1) * (w - pad * 2),
        h - pad - (v - e[0]) / span * (h - pad * 2)];
    });
    return { d: V.pathFromPoints(pts, true), pts: pts, lo: e[0], hi: e[1] };
  }

  global.CHARTS = {
    C: C,
    box: box,
    txt: txt,
    gridline: gridline,
    sparkPath: sparkPath,
    builders: {
      rankingBars: rankingBars,
      wageLines: wageLines,
      growthScatter: growthScatter,
      decomposition: decomposition,
      careerMap: careerMap,
      stateChart: stateChart,
      covidChart: covidChart,
      projectionBars: projectionBars,
      subRanking: subRanking,
      adviceBoard: adviceBoard
    }
  };
})(window);
