/*
 * ファーストビューの演出
 *  - iPhone：アプリの色で、子どもが描いたような星のキャラクター（止まった絵）
 *  - iPad  ：まっさらな画面に、実際のペンで星空を描く → UFO → ユニコーン → ようせい の順にシールを貼る
 *            シールは描画エリアの中だけで動く
 * 座標はすべてアプリの pt（iPad の描画エリア幅 ≒ 924pt、iPhone ≒ 402pt）
 */
(function () {
  "use strict";

  var PE = window.PenEngine, ST = window.OekakiStickers;
  if (!PE || !ST) return;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // スクリーンショット内の「白い描画エリア」の位置（画像に対する割合。実測値）
  var SCREENS = {
    ipad:   { ptW: 924, ja: { l: .1109, r: .8891, t: .1478, b: .8605 }, en: { l: .1109, r: .8900, t: .1424, b: .8518 } },
    iphone: { ptW: 402, ja: { l: .0670, r: .9397, t: .2156, b: .7956 }, en: { l: .0624, r: .9376, t: .2144, b: .7978 } }
  };

  // アプリのパレットの色
  var C = {
    black: "#000000", gray: "#8E8E93", white: "#FFFFFF", brown: "#8B5A2B", peach: "#FFD6B0", pink: "#FFA6C9",
    red: "#FF3B30", orange: "#FF9500", yellow: "#FFD60A", lime: "#A6E22E", green: "#34C759", dgreen: "#1E7B3C",
    sky: "#7DD3F5", blue: "#007AFF", navy: "#283593", purple: "#AF52DE", lavender: "#C9A7EB"
  };

  function lang() { return document.documentElement.getAttribute("data-lang") === "en" ? "en" : "ja"; }

  /* ---------- 共通：画面(canvas)の準備 ---------- */
  function Screen(el, kind) {
    this.el = el; this.kind = kind;
    this.canvas = el.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.layer = el.querySelector(".screen-stickers");
  }
  Screen.prototype.layout = function () {
    var r = SCREENS[this.kind][lang()];
    var s = this.el.style;
    s.left = r.l * 100 + "%"; s.top = r.t * 100 + "%";
    s.width = (r.r - r.l) * 100 + "%"; s.height = (r.b - r.t) * 100 + "%";
    var box = this.el.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.wPx = box.width; this.hPx = box.height;
    this.u = box.width / SCREENS[this.kind].ptW;            // 1pt = 何px
    this.W = SCREENS[this.kind].ptW; this.H = box.height / this.u;
    this.canvas.width = Math.max(1, Math.round(box.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(box.height * this.dpr));
    this.scale = this.dpr * this.u;
  };
  Screen.prototype.begin = function () {
    var c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
  };
  // item = { st: stroke, clip: [多角形の点] }
  Screen.prototype.draw = function (item, n) {
    var c = this.ctx;
    if (item.clip) {
      c.save();
      c.beginPath();
      item.clip.forEach(function (p, i) { i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); });
      c.closePath();
      c.clip();
      PE.drawStroke(c, item.st, n, this.scale);
      c.restore();
    } else {
      PE.drawStroke(c, item.st, n, this.scale);
    }
  };

  function stroke(tool, color, width, pts, clip) {
    return { st: { tool: tool, color: color, width: width, pts: pts }, clip: clip };
  }
  function rectPoly(cx, cy, w, h, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(function (p) {
      return { x: cx + p[0] * c - p[1] * s, y: cy + p[0] * s + p[1] * c };
    });
  }
  function scalePoly(poly, cx, cy, k) {
    return poly.map(function (p) { return { x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }; });
  }
  function bbox(poly) {
    var b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    poly.forEach(function (p) { b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y); b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y); });
    return b;
  }
  // 多角形の中をぐしゃぐしゃ塗り
  function fill(poly, color, width, gap, rnd, overflow) {
    var b = bbox(poly);
    var pts = PE.wobble(PE.zigzag(b.x0 - 4, b.y0 + gap / 2, b.x1 + 4, b.y1, gap, 6, gap * 0.6), 1.5, rnd);
    var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    return stroke("pen", color, width, pts, scalePoly(poly, cx, cy, overflow || 1.03));
  }
  // 手描きの線：角の位置を少しずらし、辺をゆるくふくらませ、細かくふるえさせる
  function handLine(poly, closed, rnd, amp) {
    amp = amp == null ? 1 : amp;
    var many = poly.length > 16;                              // 丸い形（点が多い）は角をずらさない
    var jit = many ? 0 : 7 * amp;
    var v = poly.map(function (p) { return { x: p.x + (rnd() - 0.5) * jit, y: p.y + (rnd() - 0.5) * jit }; });
    if (closed) v = v.concat([v[0]]);
    var pts = [];
    for (var i = 1; i < v.length; i++) {
      var a = v[i - 1], b = v[i];
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      var bow = many ? 0 : (rnd() - 0.5) * len * 0.14 * amp;  // 辺のふくらみ
      var mx = (a.x + b.x) / 2 - dy / len * bow, my = (a.y + b.y) / 2 + dx / len * bow;
      var k = Math.max(3, Math.round(len / 3.5));
      for (var j = (i === 1 ? 0 : 1); j <= k; j++) {
        var t = j / k;
        pts.push({ x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mx + t * t * b.x,
                   y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * my + t * t * b.y });
      }
    }
    // 細かいふるえ（2種類の周期を重ねる）
    var p1 = rnd() * 9, p2 = rnd() * 9;
    pts = pts.map(function (p, i) {
      return { x: p.x + (Math.sin(i * 0.31 + p1) * 1.3 + Math.sin(i * 0.9 + p2) * 0.6) * amp,
               y: p.y + (Math.cos(i * 0.27 + p2) * 1.3 + Math.sin(i * 1.1 + p1) * 0.6) * amp };
    });
    return pts;
  }
  function outline(poly, color, width, rnd, amp) {
    var pts = handLine(poly, true, rnd, amp == null ? 1 : amp);
    // 描きはじめを少しずらして、終わりは少し描きすぎる（子どもっぽく）
    var s = Math.floor(rnd() * pts.length * 0.3);
    pts = pts.slice(s).concat(pts.slice(0, s + 4 + Math.floor(rnd() * 5)));
    return stroke("pen", color, width, pts);
  }
  // ぐるぐる塗りの丸（目・ほっぺ）
  function spiral(cx, cy, rx, ry, color, width, turns, rnd) {
    var pts = [], n = 60 * turns, ph = rnd ? rnd() * 6 : 0;
    for (var i = 0; i <= n; i++) {
      var k = 1 - i / n, a = i / 60 * Math.PI * 2;
      var j = 1 + Math.sin(a * 3 + ph) * 0.08;               // まんまるにしない
      pts.push({ x: cx + Math.cos(a) * rx * k * j, y: cy + Math.sin(a) * ry * k * j });
    }
    return stroke("pen", color, width, pts);
  }

  /* ---------- iPhone：子どもが描いた星のキャラクター ---------- */
  function buildPhone(S) {
    var rnd = PE.seeded(3), W = S.W, H = S.H;
    var cx = W / 2, cy = H * 0.56, R = Math.min(W * 0.36, H * 0.3), r = R * 0.5;
    var items = [];

    // にじ（6色）
    var rc = [C.red, C.orange, C.yellow, C.green, C.blue, C.purple];
    rc.forEach(function (col, i) {
      var rad = R * 1.62 - i * 8.5, pts = [], ph = rnd() * 6;
      var a0 = Math.PI * (1.06 + rnd() * 0.04), a1 = Math.PI * (1.9 + rnd() * 0.05);
      for (var a = a0; a <= a1; a += 0.03) {
        var rr = rad + Math.sin(a * 5 + ph) * 3 + Math.sin(a * 13 + ph) * 1.2; // 線ごとにゆれ方を変える
        pts.push({ x: cx + Math.cos(a) * rr, y: cy - R * 0.05 + Math.sin(a) * rr });
      }
      items.push(stroke("pen", col, 9, PE.wobble(pts, 1.6, rnd)));
    });

    // まわりの小さな星
    [[0.14, 0.12, C.pink], [0.86, 0.1, C.sky], [0.1, 0.9, C.green], [0.9, 0.88, C.orange], [0.84, 0.32, C.yellow]].forEach(function (s, i) {
      var v = PE.starVerts(W * s[0], H * s[1], 15, 7, i * 0.3);
      items.push(fill(v, s[2], 8, 6, rnd, 1.0));
      items.push(outline(v, s[2], 4, rnd, 0.6));
    });

    // 星のからだ
    var star = PE.starVerts(cx, cy, R, r, -0.06);
    items.push(fill(star, C.yellow, 14, 10, rnd, 1.05));
    items.push(outline(star, C.orange, 9, rnd, 1.3));

    // 左手：青いクレヨン
    var cr = rectPoly(cx - R * 0.98, cy + R * 0.02, 34, R * 1.0, -0.38);
    items.push(fill(cr, C.blue, 10, 8, rnd, 1.02));
    var tip = [cr[0], cr[1], { x: (cr[0].x + cr[1].x) / 2 + Math.sin(-0.38) * 0 + 10 * Math.sin(0.38) * -1, y: (cr[0].y + cr[1].y) / 2 - 30 }];
    items.push(fill(tip, C.sky, 8, 6, rnd, 1.0));
    items.push(outline(tip, C.navy, 5, rnd, 1));
    items.push(outline(cr, C.navy, 5, rnd, 1));

    // 右手：むらさきの筆
    var br = rectPoly(cx + R * 0.98, cy - R * 0.02, 18, R * 1.0, 0.42);
    items.push(fill(br, C.lavender, 9, 7, rnd, 1.02));
    items.push(outline(br, C.purple, 5, rnd, 1));
    var topMid = { x: (br[0].x + br[1].x) / 2, y: (br[0].y + br[1].y) / 2 };
    var dir = { x: Math.sin(0.42), y: -Math.cos(0.42) };
    var fer = rectPoly(topMid.x + dir.x * 8, topMid.y + dir.y * 8, 20, 16, 0.42);
    items.push(fill(fer, C.gray, 8, 6, rnd, 1.0));
    var tipC = { x: topMid.x + dir.x * 36, y: topMid.y + dir.y * 36 };
    var tipPts = PE.ellipse(0, 0, 13, 22, 3, 1).map(function (p) {
      return { x: tipC.x + p.x * Math.cos(0.42) - p.y * Math.sin(0.42), y: tipC.y + p.x * Math.sin(0.42) + p.y * Math.cos(0.42) };
    });
    items.push(fill(tipPts, C.purple, 9, 7, rnd, 1.0));

    // 手（クレヨンと筆をにぎる）
    [[cx - R * 0.92, cy + R * 0.1], [cx + R * 0.92, cy + R * 0.06]].forEach(function (h) {
      var hand = PE.ellipse(h[0], h[1], 17, 17, 3, 1);
      items.push(fill(hand, C.yellow, 10, 7, rnd, 1.0));
      items.push(outline(hand, C.orange, 6, rnd, 0.8));
    });

    // かお
    var ey = cy - R * 0.06, ex = R * 0.26;
    items.push(spiral(cx - ex - 1, ey + 1, 10, 13, C.black, 8, 2.2, rnd));
    items.push(spiral(cx + ex + 1, ey - 1, 11, 12, C.black, 8, 2.2, rnd));
    items.push(stroke("pen", C.white, 6, [{ x: cx - ex + 2, y: ey - 4 }]));
    items.push(stroke("pen", C.white, 6, [{ x: cx + ex + 4, y: ey - 6 }]));
    items.push(spiral(cx - R * 0.5, cy + R * 0.15, 13, 9, C.pink, 8, 1.6, rnd));
    items.push(spiral(cx + R * 0.49, cy + R * 0.12, 12, 9, C.pink, 8, 1.6, rnd));
    var mouth = [];
    for (var a = 0; a <= Math.PI; a += 0.12) mouth.push({ x: cx + Math.cos(a) * R * 0.2, y: cy + R * 0.14 + Math.sin(a) * R * 0.18 });
    items.push(fill(mouth, C.red, 8, 6, rnd, 1.0));
    items.push(outline(mouth, C.black, 5, rnd, 0.6));

    return items;
  }

  /* ---------- iPad：星空を描いて、シールを貼る ---------- */
  function buildPad(S) {
    var rnd = PE.seeded(11), W = S.W, H = S.H, list = [];
    function add(item, start, dur) { list.push({ item: item, start: start, dur: dur }); }

    // 1. 夜空：アプリの「はいけい」ボタンで紺色にパッと変える（renderPad で塗る）

    // 2. 丘（みどり。ペンで手塗り）
    var hill = [], rows = 0;
    function hillTop(x) { return H * 0.80 - Math.sin(Math.min(Math.max(x / W, 0), 1) * Math.PI) * H * 0.07 + Math.sin(x / W * 9) * 6; }
    for (var y = H * 0.72; y <= H + 14; y += 18, rows++) {
      var xs = [];
      for (var x = -14; x <= W + 14; x += 8) if (hillTop(x) <= y) xs.push(x);
      if (!xs.length) continue;
      var a = xs[0], b = xs[xs.length - 1];
      if (rows % 2) { var t = a; a = b; b = t; }
      var k = Math.max(2, Math.round(Math.abs(b - a) / 8));
      for (var j = 0; j <= k; j++) hill.push({ x: a + (b - a) * j / k, y: y });
    }
    add(stroke("pen", C.green, 30, PE.wobble(hill, 2.5, rnd)), 1.1, 1.1);

    // 3. 三日月（ネオンの黄色）
    var mx = W * 0.84, my = H * 0.2, mr = H * 0.1, moon = [];
    for (var m = 0.32; m <= 1.68; m += 0.04) moon.push({ x: mx + Math.cos(m * Math.PI) * mr, y: my + Math.sin(m * Math.PI) * mr });
    var e = moon[moon.length - 1], s0 = moon[0];
    for (var q = 1; q <= 14; q++) {
      var tt = q / 14, cxq = mx - mr * 0.25, cyq = my;
      moon.push({
        x: (1 - tt) * (1 - tt) * e.x + 2 * (1 - tt) * tt * cxq + tt * tt * s0.x,
        y: (1 - tt) * (1 - tt) * e.y + 2 * (1 - tt) * tt * cyq + tt * tt * s0.y
      });
    }
    add(stroke("neon", C.yellow, 8, PE.wobble(PE.resample(moon, 4, false), 1.2, rnd)), 2.4, 0.9);

    // 4. 星（キラキラペンとネオンペン）
    var stars = [
      [0.12, 0.2, 44, "glitter", C.yellow], [0.33, 0.12, 30, "neon", C.pink], [0.57, 0.22, 48, "glitter", C.yellow],
      [0.69, 0.09, 26, "neon", C.sky], [0.24, 0.47, 30, "glitter", C.lavender], [0.9, 0.55, 32, "glitter", C.yellow]
    ];
    stars.forEach(function (s, i) {
      var v = PE.starVerts(W * s[0], H * s[1], s[2], s[2] * 0.45, (rnd() - 0.5) * 0.4);
      var pts = PE.wobble(PE.resample(v, 3.5, true), 1.2, rnd);
      add(stroke(s[3], s[4], s[3] === "glitter" ? 7 : 6, pts), 3.5 + i * 0.42, 0.38);
    });

    // 5. シール（貼った瞬間からアプリと同じ動き）
    var stickers = [
      { type: "ufo", at: 6.7, x: 0.40, y: 0.38, scale: 1.9 },
      { type: "unicorn", at: 8.7, x: 0.50, y: 0.6, scale: 1.9 },
      { type: "fairy", at: 10.7, x: 0.70, y: 0.42, scale: 1.7 }
    ];
    return { bg: { at: 0.5, color: C.navy }, strokes: list, stickers: stickers, end: 19.5 };
  }

  /* ---------- 組み立て ---------- */
  var phoneEl = document.querySelector('[data-screen="iphone"]');
  var padEl = document.querySelector('[data-screen="ipad"]');
  if (!phoneEl || !padEl) return;
  var phone = new Screen(phoneEl, "iphone");
  var pad = new Screen(padEl, "ipad");
  var phoneItems, scene, live = [];

  function renderPhone() {
    phone.begin();
    phoneItems.forEach(function (it) { phone.draw(it); });
  }

  function setupPad() {
    scene = buildPad(pad);
    pad.layer.innerHTML = "";
    live = scene.stickers.map(function (s) {
      var wrap = document.createElement("div");
      wrap.className = "stamp";
      wrap.style.left = s.x * pad.wPx + "px";
      wrap.style.top = s.y * pad.hPx + "px";
      pad.layer.appendChild(wrap);
      var ring = document.createElement("span");
      ring.className = "tap-ring";
      wrap.appendChild(ring);
      var st = ST.create(wrap, s.type, { u: pad.u * s.scale, move: pad.u });
      return { cfg: s, wrap: wrap, ring: ring, sticker: st };
    });
  }

  function build() {
    phone.layout(); pad.layout();
    phoneItems = buildPhone(phone);
    renderPhone();
    setupPad();
  }

  var FADE = 0.8, LOOP = 0;
  function renderPad(t) {
    LOOP = scene.end + FADE;
    var tt = reduceMotion ? scene.end - 2 : t % LOOP;
    var alpha = tt > scene.end ? 1 - (tt - scene.end) / FADE : 1;
    pad.begin();
    // はいけい：ボタンを押したようにパッと色が変わる
    if (tt >= scene.bg.at) {
      pad.ctx.globalAlpha = alpha * Math.min((tt - scene.bg.at) / 0.15, 1);
      pad.ctx.fillStyle = scene.bg.color;
      pad.ctx.fillRect(0, 0, pad.W, pad.H + 1);
    }
    pad.ctx.globalAlpha = alpha;
    scene.strokes.forEach(function (s) {
      if (tt < s.start) return;
      var p = Math.min((tt - s.start) / s.dur, 1);
      var eased = p < 1 ? 1 - Math.pow(1 - p, 1.4) : 1;
      pad.draw(s.item, Math.max(1, Math.round(s.item.st.pts.length * eased)));
    });
    pad.ctx.globalAlpha = 1;
    pad.layer.style.opacity = alpha;

    live.forEach(function (l) {
      var age = tt - l.cfg.at;
      if (age < 0) { l.wrap.style.display = "none"; return; }
      l.wrap.style.display = "";
      // ポンッと貼られる
      var k = Math.min(age / 0.35, 1);
      var pop = k < 1 ? 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2) : 1;
      l.wrap.style.transform = "scale(" + Math.max(0, pop) + ")";
      var rk = Math.min(age / 0.6, 1);
      l.ring.style.opacity = 1 - rk;
      l.ring.style.transform = "translate(-50%,-50%) scale(" + (0.3 + rk * 1.4) + ")";
      l.sticker.update(age);
    });
  }

  build();

  var start = performance.now(), visible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(padEl);
  }
  var timer;
  function rebuild() { clearTimeout(timer); timer = setTimeout(build, 120); }
  window.addEventListener("resize", rebuild);
  // 言語を切り替えたら、スクリーンショットが替わるので位置を合わせ直す
  new MutationObserver(function () { build(); start = performance.now(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-lang"] });
  // 画像の読み込み後にも合わせ直す
  document.querySelectorAll(".devices img").forEach(function (img) { if (!img.complete) img.addEventListener("load", rebuild); });

  if (reduceMotion) { renderPad(0); return; }
  (function frame(now) {
    if (visible) renderPad((now - start) / 1000);
    requestAnimationFrame(frame);
  })(performance.now());
})();
