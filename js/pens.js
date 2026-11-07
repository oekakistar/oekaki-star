/*
 * 「3種類のたのしいペン」のデモ。ふつう → ネオン → キラキラ の順に描く。
 * 描き方は js/pen-engine.js（アプリと同じ仕組み）を使う。
 */
(function () {
  "use strict";

  var canvas = document.getElementById("pen-demo");
  if (!canvas || !window.PenEngine) return;
  var PE = window.PenEngine;
  var ctx = canvas.getContext("2d");
  var chips = document.querySelectorAll("[data-pen-chip]");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var PENS = [
    { tool: "pen", color: "#FF3B30" },
    { tool: "neon", color: "#007AFF" },
    { tool: "glitter", color: "#AF52DE" }
  ];
  var W = 0, H = 0, dpr = 1, strokes = [];

  // サラサラっとした「くるくる線」（トロコイド）
  function makePath(row, rows) {
    var pts = [];
    var h = H / rows, cy = h * row + h / 2;
    var r = Math.min(h * 0.28, 26);
    var left = W * 0.06, right = W * 0.94;
    var loops = Math.max(3, Math.round((right - left) / 70));
    var tMax = loops * Math.PI * 2, c = (right - left) / tMax;
    var steps = Math.round((right - left) / 2.6);
    for (var i = 0; i <= steps; i++) {
      var t = i / steps * tMax;
      pts.push({ x: left + c * t - r * 0.9 * Math.sin(t), y: cy + r * Math.cos(t) + Math.sin(t * 0.35 + row) * h * 0.08 });
    }
    return pts;
  }

  function build() {
    var rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var rnd = PE.seeded(7);
    strokes = PENS.map(function (p, i) {
      var pts = makePath(i, PENS.length);
      return { tool: p.tool, color: p.color, width: 8, pts: pts, deco: PE.makeDeco(pts, rnd) };
    });
  }

  var DRAW = 1.5, GAP = 0.35, HOLD = 2.6, FADE = 0.5;
  var TOTAL = PENS.length * (DRAW + GAP) + HOLD + FADE;

  function render(t) {
    ctx.clearRect(0, 0, W, H);
    var tt = t % TOTAL, fadeStart = TOTAL - FADE, active = -1;
    ctx.globalAlpha = tt > fadeStart ? 1 - (tt - fadeStart) / FADE : 1;
    for (var i = 0; i < strokes.length; i++) {
      var s0 = i * (DRAW + GAP);
      if (tt < s0) break;
      var p = Math.min((tt - s0) / DRAW, 1);
      var eased = 1 - Math.pow(1 - p, 1.6);
      PE.drawStroke(ctx, strokes[i], Math.max(2, Math.round(strokes[i].pts.length * eased)), dpr);
      if (tt < s0 + DRAW + GAP) active = i;
    }
    ctx.globalAlpha = 1;
    chips.forEach(function (c, i) { c.classList.toggle("on", i === active); });
  }

  build();
  var FINAL = PENS.length * (DRAW + GAP) + 0.1;
  if (reduceMotion) {
    render(FINAL);
    window.addEventListener("resize", function () { build(); render(FINAL); });
    return;
  }

  var visible = true, start = performance.now();
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) {
      var v = e[0].isIntersecting;
      if (v && !visible) start = performance.now(); // 見えたら最初から
      visible = v;
    }, { threshold: 0.3 }).observe(canvas);
  }
  var timer;
  window.addEventListener("resize", function () { clearTimeout(timer); timer = setTimeout(build, 120); });

  (function frame(now) {
    if (visible) render((now - start) / 1000);
    requestAnimationFrame(frame);
  })(performance.now());
})();
