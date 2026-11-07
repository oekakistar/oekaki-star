/*
 * 動くシール（アプリ AnimatedStickerView の動きをWeb用に移植）
 *
 * <div class="stk" data-type="ufo" data-size="110" data-move="0.4" style="left:20%;top:30%"></div>
 *   data-type : ufo / frog / unicorn / rocket / gasDrive / owl / fairy / whale
 *   data-size : シールの基本サイズ(px)。アプリの 80pt に相当
 *   data-move : 移動量の倍率（アプリのpt × この値 = px）
 *   data-src  : gasDrive / unicorn で使う本体画像
 */
(function () {
  "use strict";

  var BASE = "img/stickers/";
  var sin = Math.sin, cos = Math.cos, abs = Math.abs, PI = Math.PI;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function mod(a, b) { return ((a % b) + b) % b; }

  /* ---- レイヤー：外側=位置+回転、内側img=拡大縮小（SwiftUI の scale→rotate→offset 順） ---- */
  function Layer(group, src, w, h) {
    var outer = document.createElement("div");
    outer.className = "stk-l";
    outer.style.width = w + "px";
    outer.style.height = h + "px";
    outer.style.marginLeft = (-w / 2) + "px";
    outer.style.marginTop = (-h / 2) + "px";
    // 軽いAVIFを優先し、対応していない端末はPNGを使う
    var pic = document.createElement("picture");
    var source = document.createElement("source");
    source.type = "image/avif";
    var img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    pic.appendChild(source);
    pic.appendChild(img);
    outer.appendChild(pic);
    group.appendChild(outer);
    this.outer = outer; this.img = img; this.source = source; this.w = w; this.h = h;
    this.setSrc(src);
  }
  Layer.prototype.setSrc = function (src) {
    this.source.srcset = BASE + src.replace(/\.png$/, ".avif");
    this.img.src = BASE + src;
    this.src = src;
  };
  Layer.prototype.set = function (o) {
    var x = o.x || 0, y = o.y || 0, r = o.rot || 0;
    var sx = o.sx == null ? 1 : o.sx, sy = o.sy == null ? 1 : o.sy;
    this.outer.style.transformOrigin = o.ro || "50% 50%";
    this.outer.style.transform = "translate(" + x + "px," + y + "px) rotate(" + r + "deg)";
    this.img.style.transformOrigin = o.so || "50% 50%";
    this.img.style.transform = "scale(" + sx + "," + sy + ")";
    this.outer.style.opacity = o.op == null ? 1 : o.op;
    this.outer.style.display = o.hide ? "none" : "";
    if (o.hue != null) this.img.style.filter = "hue-rotate(" + o.hue + "deg)";
    if (o.src && this.src !== o.src) this.setSrc(o.src);
  };

  function groupSet(g, x, y, rot, sx) {
    g.style.transform = "translate(" + x + "px," + y + "px) rotate(" + (rot || 0) + "deg) scale(" + (sx == null ? 1 : sx) + ",1)";
  }

  /* ---- 各シールの動き ---- */
  var TYPES = {

    // UFO：ピュンと移動 → 止まって下から光
    ufo: function (g, u, M) {
      var beam = new Layer(g, "ufo-2.png", 70 * u, 120 * u);
      var body = new Layer(g, "ufo-1.png", 80 * u, 80 * u);
      function off(seed) {
        return [sin(seed * 1.37) * 150 + cos(seed * 0.73) * 110,
                cos(seed * 1.11) * 135 + sin(seed * 0.51) * 75];
      }
      return function (t) {
        var dur = 1.6, movePart = 0.68;
        var cycle = Math.floor(t / dur), phase = t / dur - cycle;
        var stopped = phase > movePart;
        var p = Math.min(phase / movePart, 1);
        var sp = p * p * (3 - 2 * p);
        var a = off(cycle - 1), b = off(cycle);
        var x = a[0] + (b[0] - a[0]) * sp, y = a[1] + (b[1] - a[1]) * sp;
        var tilt = stopped ? sin(t * 14) * 3 : sin(t * 20) * 12;
        var beamScale = 0.78 + abs(sin(t * 10)) * 0.35;
        var beamOp = stopped ? 0.55 + abs(sin(t * 9)) * 0.35 : 0;
        beam.set({ y: 62 * u, sx: 0.9, sy: beamScale, so: "50% 0%", op: beamOp });
        body.set({ rot: tilt });
        groupSet(g, x * M, y * M);
      };
    },

    // カエル：ぴょ〜んと左右にジャンプ
    frog: function (g, u) {
      var img = new Layer(g, "frog.png", 80 * u, 80 * u);
      return function (t) {
        var jump = 1.15, pause = 0.65, cyc = (jump + pause) * 2;
        var c = mod(t, cyc);
        var leftPause = jump, rightJump = jump + pause, rightPause = rightJump + jump;
        var travel = 120 * u, height = 70 * u, half = travel / 2;
        var jL = c < leftPause, pL = c >= leftPause && c < rightJump, jR = c >= rightJump && c < rightPause;
        var facingRight = jR || c >= rightPause;
        var x, y = 0;
        if (jL) { var p = c / jump; x = half - travel * p; y = -height * sin(p * PI); }
        else if (pL) { x = -half; }
        else if (jR) { var q = (c - rightJump) / jump; x = -half + travel * q; y = -height * sin(q * PI); }
        else { x = half; }
        var jumping = jL || jR;
        var s = jumping ? 1.5 : 1;
        img.set({
          src: jumping ? "frog-jump.png" : "frog.png",
          x: x, y: y, rot: jumping ? sin(t * 5) * 6 : 0,
          sx: (facingRight ? -1 : 1) * s, sy: s
        });
      };
    },

    // ユニコーン：キラキラ星をまきながら走る
    unicorn: function (g, u, M, el) {
      var stars = [];
      var names = ["star2.png", "star3.png", "star4.png", "star5.png"];
      for (var i = 0; i < 10; i++) {
        var sz = (12 + (i % 4) * 5) * u;
        stars.push(new Layer(g, names[i % 4], sz, sz));
      }
      var body = new Layer(g, el.getAttribute("data-src") || "unicorn.png", 80 * u, 80 * u);
      function px(t) { return sin(t * 0.48) * 135 + cos(t * 0.19) * 58; }
      function py(t) { return cos(t * 0.56) * 76 + sin(t * 0.91) * 30; }
      return function (t) {
        var speed = cos(t * 0.48) * 0.48 * 135 - sin(t * 0.19) * 0.19 * 58;
        var right = speed > 0;
        var bounce = -abs(sin(t * 3.2)) * 6 * u;
        for (var i = 0; i < 10; i++) {
          var st = t - i * 0.22;
          var age = mod(st, 1.7) / 1.7;
          var sc = 1 - age * 0.72;
          stars[i].set({
            x: px(st) * M + sin(i * 2.3) * 28 * u,
            y: py(st) * M + cos(i * 1.7) * 22 * u,
            sx: sc, sy: sc, op: 1 - age,
            rot: t * 120 + i * 37, hue: i * 41
          });
        }
        body.set({
          x: px(t) * M, y: py(t) * M + bounce,
          rot: sin(t * 0.9) * 5, sx: right ? -1 : 1
        });
      };
    },

    // ロケット：炎をだして上へ
    rocket: function (g, u, M) {
      var flame = new Layer(g, "rocket-2.png", 34 * u, 46 * u);
      var body = new Layer(g, "rocket-1.png", 80 * u, 80 * u);
      return function (t) {
        var p = mod(t, 2.5) / 2.5;
        flame.set({
          y: 38 * u, sx: 0.9, sy: 0.75 + abs(sin(t * 2.8)) * 0.45, so: "50% 0%",
          op: 0.75 + abs(sin(t * 2.4)) * 0.25
        });
        body.set({ rot: sin(t * 1.8) * 7 });
        groupSet(g, sin(t * 0.7) * 36 * M, (78 - p * 250) * M);
      };
    },

    // のりもの：排気ガスをだして左右に走る
    gasDrive: function (g, u, M, el) {
      var gas = new Layer(g, "gas.png", 34 * u, 24 * u);
      var body = new Layer(g, el.getAttribute("data-src") || "firetruck.png", 80 * u, 80 * u);
      return function (t) {
        var right = cos(t * 0.55) > 0;
        var pulse = 0.75 + abs(sin(t * 3.2)) * 0.35;
        gas.set({
          x: right ? -42 * u : 42 * u, y: 13 * u,
          sx: right ? -pulse : pulse, sy: pulse,
          op: 0.35 + abs(sin(t * 2.4)) * 0.45
        });
        body.set({ sx: right ? -1 : 1 });
        groupSet(g, sin(t * 0.55) * 145 * M, 0);
      };
    },

    // フクロウ：はばたきながら飛ぶ
    owl: function (g, u, M) {
      var lw = new Layer(g, "owl-wing.png", 34 * u, 34 * u);
      var rw = new Layer(g, "owl-wing.png", 34 * u, 34 * u);
      var body = new Layer(g, "owl.png", 58 * u, 76 * u);
      return function (t) {
        var flap = sin(t * 9.5);
        var wy = abs(flap) * -6 * u;
        lw.set({ x: -28 * u, y: -2 * u + wy, sx: -1, rot: 18 + flap * 20, ro: "100% 50%" });
        rw.set({ x: 28 * u, y: -2 * u + wy, rot: -18 - flap * 20, ro: "0% 50%" });
        body.set({});
        groupSet(g,
          (sin(t * 0.38) * 126 + cos(t * 0.72) * 28) * M,
          (cos(t * 0.44) * 82 + sin(t * 0.97) * 26) * M,
          sin(t * 0.7) * 7);
      };
    },

    // ようせい：羽をパタパタさせて飛ぶ
    fairy: function (g, u, M) {
      var lw = new Layer(g, "fairy-wing.png", 48 * u, 42 * u);
      var rw = new Layer(g, "fairy-wing.png", 48 * u, 42 * u);
      var body = new Layer(g, "fairy.png", 52 * u, 78 * u);
      return function (t) {
        var wr = sin(t * 11) * 16;
        var ws = 0.70 + abs(sin(t * 11)) * 0.36;
        var lift = sin(t * 5.5) * 2;
        lw.set({ x: -18 * u, y: -4 * u + lift, sx: -1, sy: ws, so: "50% 100%", rot: -wr });
        rw.set({ x: 18 * u, y: -4 * u + lift, sx: 1, sy: ws, so: "50% 100%", rot: wr });
        body.set({});
        groupSet(g,
          (sin(t * 0.46) * 118 + cos(t * 0.31) * 42) * M,
          (cos(t * 0.58) * 74 + sin(t * 1.08) * 24) * M,
          sin(t * 0.85) * 9);
      };
    },

    // クジラ：泳ぎながら潮をふく
    whale: function (g, u, M) {
      var spout = new Layer(g, "whale-spout.png", 34 * u, 34 * u);
      var body = new Layer(g, "whale-body.png", 80 * u, 80 * u);
      return function (t) {
        var x = sin(t * 0.34) * 132 + (cos(t * 0.14) - 1) * 32;
        var y = (cos(t * 0.28) - 1) * 46 + sin(t * 0.53) * 16;
        var hs = cos(t * 0.34) * 132 * 0.34 - sin(t * 0.14) * 32 * 0.14;
        var vs = -sin(t * 0.28) * 46 * 0.28 + cos(t * 0.53) * 16 * 0.53;
        var right = hs > 0;
        var angle = Math.atan2(vs, abs(hs)) * 180 / PI;
        var sc = mod(t, 4.2);
        var sp = Math.min(sc / 1.15, 1);
        var fade = sc < 1.45 ? 1 : Math.max(0, 1 - (sc - 1.45) / 0.8);
        spout.set({
          hide: sc >= 2.25, x: 5 * u, y: -36 * u - sp * 12 * u,
          sx: 0.55 + sp * 0.45, sy: 0.18 + sp * 0.82, so: "50% 100%", op: fade
        });
        body.set({ rot: sin(t * 1.3) * 2.5 });
        groupSet(g, x * M, y * M, right ? -angle : angle, right ? -1 : 1);
      };
    }
  };

  /* ---- ほかのスクリプトから使う：OekakiStickers.create(親, 種類, {u, move, src}) ----
   *  u    : アプリの 1pt が何px か（シールの大きさ・部品の位置に使う）
   *  move : 移動量の 1pt が何px か
   *  戻り値の update(t) に「シールを貼ってからの秒数」を渡すと、その瞬間の姿になる */
  window.OekakiStickers = {
    create: function (host, type, o) {
      if (!TYPES[type]) return null;
      var el = document.createElement("div");
      el.className = "stk";
      if (o.src) el.setAttribute("data-src", o.src);
      var g = document.createElement("div");
      g.className = "stk-g";
      el.appendChild(g);
      host.appendChild(el);
      return { el: el, update: TYPES[type](g, o.u, o.move == null ? o.u : o.move, el) };
    }
  };

  /* ---- 起動（data-type を持つ .stk を自動で動かす） ---- */
  var running = [];
  document.querySelectorAll(".stk[data-type]").forEach(function (el, i) {
    var type = el.getAttribute("data-type");
    if (!TYPES[type]) return;
    // 置き場所(親)が狭い画面では、サイズと移動量を小さくする
    var host = el.parentElement;
    var ref = parseFloat(host.getAttribute("data-ref") || "560");
    var fit = Math.min(1, (host.clientWidth || ref) / ref);
    var size = parseFloat(el.getAttribute("data-size") || "100") * fit;
    var M = parseFloat(el.getAttribute("data-move") || "0.5") * fit;
    var u = size / 80;
    var g = document.createElement("div");
    g.className = "stk-g";
    el.appendChild(g);
    var update = TYPES[type](g, u, M, el);
    var item = { el: el, update: update, offset: parseFloat(el.getAttribute("data-delay") || (i * 0.7)), visible: true };
    running.push(item);
    update(item.offset + 0.9); // 静止状態でも自然な位置に
  });

  if (reduceMotion || !running.length) return;

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        running.forEach(function (r) { if (r.el.parentElement === e.target) r.visible = e.isIntersecting; });
      });
    }, { rootMargin: "100px" });
    var hosts = [];
    running.forEach(function (r) { if (hosts.indexOf(r.el.parentElement) < 0) hosts.push(r.el.parentElement); });
    hosts.forEach(function (h) { io.observe(h); });
  }

  var start = performance.now();
  function frame(now) {
    var t = (now - start) / 1000;
    for (var i = 0; i < running.length; i++) {
      var r = running[i];
      if (r.visible) r.update(t + r.offset);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
