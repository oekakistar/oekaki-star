/*
 * ペンの描き方（アプリ DrawingEngine.swift の StrokeRenderer をCanvasに移植）
 *  - pen    ：丸い線
 *  - neon   ：外側の強い発光(×3.5, blur12) + 中間発光(×2, blur4) + 白い芯(×0.45)
 *  - glitter：線 + 2点ごとに白/ピンク/水色の粒 + 3点ごとに同色の粒 + 5点ごとにキラキラ記号
 *
 * 座標はすべてアプリの「pt」。ctx 側で pt→px の拡大をしておき、その倍率を scale に渡す。
 */
(function () {
  "use strict";

  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
  }

  // 決まった乱数（毎回同じ見た目になるように）
  function seeded(seed) {
    var s = seed % 2147483647; if (s <= 0) s += 2147483646;
    var f = function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    f.range = function (a, b) { return a + (b - a) * f(); };
    return f;
  }

  // アプリの CGFloat.random と同じ範囲で、キラキラ用の値を先に決めておく
  function makeDeco(pts, rnd) {
    return pts.map(function () {
      return {
        a: [rnd.range(4, 14), rnd.range(-8, 8), rnd.range(-8, 8)],
        b: [rnd.range(3, 12), rnd.range(-10, 10), rnd.range(-10, 10)],
        s: [rnd.range(8, 18), rnd.range(-10, 10), rnd.range(-10, 10)]
      };
    });
  }

  function path(ctx, pts, n, dx) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x + (dx || 0), pts[0].y);
    for (var i = 1; i < n; i++) ctx.lineTo(pts[i].x + (dx || 0), pts[i].y);
    if (n === 1) ctx.lineTo(pts[0].x + (dx || 0) + 0.01, pts[0].y);
  }

  function plain(ctx, pts, n, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    path(ctx, pts, n);
    ctx.stroke();
  }

  // ぼかした線（Safariでも動くよう shadow で描く。shadow は拡大の影響を受けないので scale を掛ける）
  function blurStroke(ctx, pts, n, color, width, blur, scale) {
    var OFF = 10000;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * 2 * scale;
    ctx.shadowOffsetX = OFF * scale;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = width;
    path(ctx, pts, n, -OFF);
    ctx.stroke();
    ctx.restore();
  }

  function sparkle(ctx, x, y, s) {
    var r = s / 2, k = r * 0.28;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + k, y - k, x + r, y);
    ctx.quadraticCurveTo(x + k, y + k, x, y + r);
    ctx.quadraticCurveTo(x - k, y + k, x - r, y);
    ctx.quadraticCurveTo(x - k, y - k, x, y - r);
    ctx.fill();
  }
  function star(ctx, x, y, s) {
    var R = s / 2, r = R * 0.45;
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }
  function diamond(ctx, x, y, s) {
    var r = s / 2;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.7, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.7, y);
    ctx.closePath(); ctx.fill();
  }
  function dot(ctx, x, y, s) { ctx.beginPath(); ctx.arc(x, y, s / 2, 0, Math.PI * 2); ctx.fill(); }

  var TINTS = ["rgba(255,255,255,0.8)", "rgba(255,204,230,0.8)", "rgba(204,242,255,0.8)"];

  /* stroke = { tool, color, width, pts, deco }  n = 何点目まで描くか */
  function drawStroke(ctx, st, n, scale) {
    var pts = st.pts, w = st.width || 8;
    n = Math.min(n == null ? pts.length : n, pts.length);
    if (n < 1) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (st.tool === "pen") plain(ctx, pts, n, st.color, w);

    if (st.tool === "neon") {
      blurStroke(ctx, pts, n, rgba(st.color, 0.35), w * 3.5, 12, scale || 1);
      blurStroke(ctx, pts, n, rgba(st.color, 0.7), w * 2, 4, scale || 1);
      plain(ctx, pts, n, "#ffffff", Math.max(2, w * 0.45));
    }

    if (st.tool === "glitter") {
      plain(ctx, pts, n, st.color, w);
      var deco = st.deco || (st.deco = makeDeco(pts, seeded(pts.length * 31 + 7)));
      for (var i = 0; i < n; i++) {
        var p = pts[i], d = deco[i];
        if (i % 2 === 0) { ctx.fillStyle = TINTS[i % 3]; dot(ctx, p.x + d.a[1], p.y + d.a[2], d.a[0]); }
        if (i % 3 === 0) { ctx.fillStyle = rgba(st.color, 0.8); dot(ctx, p.x + d.b[1], p.y + d.b[2], d.b[0]); }
        if (i % 5 === 0) {
          ctx.fillStyle = "#ffffff";
          var x = p.x + d.s[1], y = p.y + d.s[2], s = d.s[0];
          if (i % 20 === 0) diamond(ctx, x, y, s);
          else if (i % 10 === 0) star(ctx, x, y, s);
          else if (i % 4 === 0) dot(ctx, x, y, s * 0.6);
          else sparkle(ctx, x, y, s * 1.3);
        }
      }
    }
  }

  /* ---- 手描きっぽい線を作るための道具 ---- */

  // 頂点を step 間隔の点列にする
  function resample(verts, step, closed) {
    var v = closed ? verts.concat([verts[0]]) : verts;
    var out = [{ x: v[0].x, y: v[0].y }];
    for (var i = 1; i < v.length; i++) {
      var a = v[i - 1], b = v[i];
      var len = Math.hypot(b.x - a.x, b.y - a.y);
      var k = Math.max(1, Math.round(len / step));
      for (var j = 1; j <= k; j++) out.push({ x: a.x + (b.x - a.x) * j / k, y: a.y + (b.y - a.y) * j / k });
    }
    return out;
  }

  // ゆらぎを足して、子どもが描いたような線にする
  function wobble(pts, amp, rnd) {
    var p1 = rnd() * 10, p2 = rnd() * 10, f1 = 0.08 + rnd() * 0.05, f2 = 0.21 + rnd() * 0.08;
    return pts.map(function (p, i) {
      return {
        x: p.x + (Math.sin(i * f1 + p1) * 0.7 + Math.sin(i * f2 + p2) * 0.3) * amp,
        y: p.y + (Math.cos(i * f1 * 1.1 + p2) * 0.7 + Math.sin(i * f2 * 0.9 + p1) * 0.3) * amp
      };
    });
  }

  function ellipse(cx, cy, rx, ry, step, turns, start) {
    var pts = [], t0 = start || 0, total = (turns || 1) * Math.PI * 2;
    var n = Math.max(12, Math.round(total * Math.max(rx, ry) / step));
    for (var i = 0; i <= n; i++) {
      var a = t0 + total * i / n;
      pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
    return pts;
  }

  function starVerts(cx, cy, R, r, rot) {
    var v = [];
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + (rot || 0) + i * Math.PI / 5, rr = i % 2 ? r : R;
      v.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    return v;
  }

  // 塗りつぶし用のジグザグ（ぐしゃぐしゃ塗り）
  function zigzag(x0, y0, x1, y1, gap, step, slant) {
    var pts = [], row = 0;
    for (var y = y0; y <= y1 + 0.01; y += gap, row++) {
      var ltr = row % 2 === 0;
      var xa = ltr ? x0 : x1, xb = ltr ? x1 : x0;
      var k = Math.max(2, Math.round(Math.abs(xb - xa) / step));
      for (var j = 0; j <= k; j++) {
        var x = xa + (xb - xa) * j / k;
        pts.push({ x: x, y: y + (slant || 0) * (j / k - 0.5) });
      }
    }
    return pts;
  }

  window.PenEngine = {
    drawStroke: drawStroke, makeDeco: makeDeco, seeded: seeded, rgba: rgba,
    resample: resample, wobble: wobble, ellipse: ellipse, starVerts: starVerts, zigzag: zigzag
  };
})();
