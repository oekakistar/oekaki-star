/*
 * 動画まわり
 *  - 「動画で見る」：見えているあいだだけ再生。言語を切り替えると日本語版／英語版の動画に入れかえる
 *  - 「動くシール図鑑」：ボタンでシールを選ぶと、アプリと同じ動きの動画を再生
 *  動画はすべて音なし。動きを減らす設定の人には自動再生しない
 */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function lang() { return document.documentElement.getAttribute("data-lang") === "en" ? "en" : "ja"; }

  // 画面に見えているあいだだけ再生する
  function whenVisible(el, onShow, onHide) {
    if (!("IntersectionObserver" in window)) { onShow(); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) onShow(); else onHide(); });
    }, { threshold: 0.35 }).observe(el);
  }

  /* ---------- 動画で見る ---------- */
  var promo = document.getElementById("promo");
  if (promo) {
    var toggle = document.getElementById("promo-toggle");
    var visible = false, userPaused = reduceMotion, loadedLang = null;

    var setLang = function () {
      var l = lang();
      if (loadedLang === l) return;
      var wasPlaying = !promo.paused;
      promo.poster = promo.getAttribute("data-poster-" + l);
      if (loadedLang !== null || visible) {
        promo.src = promo.getAttribute("data-src-" + l);
        loadedLang = l;
        if (wasPlaying || (visible && !userPaused)) play();
      }
    };
    var play = function () {
      if (loadedLang === null) { promo.src = promo.getAttribute("data-src-" + lang()); loadedLang = lang(); }
      var p = promo.play(); if (p && p.catch) p.catch(function () {});
    };
    var syncButton = function () {
      var playing = !promo.paused;
      toggle.classList.toggle("is-playing", playing);
      toggle.setAttribute("aria-label", playing ? (lang() === "ja" ? "一時停止" : "Pause") : (lang() === "ja" ? "再生" : "Play"));
    };

    promo.poster = promo.getAttribute("data-poster-" + lang());
    promo.addEventListener("play", syncButton);
    promo.addEventListener("pause", syncButton);
    toggle.addEventListener("click", function () {
      if (promo.paused) { userPaused = false; play(); } else { userPaused = true; promo.pause(); }
    });
    whenVisible(promo, function () { visible = true; if (!userPaused) play(); },
                       function () { visible = false; if (!promo.paused) promo.pause(); });
    document.querySelectorAll(".lang-switch button").forEach(function (b) {
      b.addEventListener("click", function () { setTimeout(function () { setLang(); syncButton(); }, 0); });
    });
    syncButton();
  }

  /* ---------- 動くシール図鑑 ---------- */
  var zukan = document.getElementById("zukan");
  if (zukan) {
    var video = zukan.querySelector(".zukan-stage video");
    var nameJa = zukan.querySelector(".zukan-name .ja"), nameEn = zukan.querySelector(".zukan-name .en");
    var moveJa = zukan.querySelector(".zukan-move .ja"), moveEn = zukan.querySelector(".zukan-move .en");
    var badge = zukan.querySelector(".zukan-caption .zbadge");
    var buttons = zukan.querySelectorAll(".zukan-pick button");
    var shown = false, current = null;

    var select = function (btn, autoplay) {
      buttons.forEach(function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
      current = btn;
      nameJa.textContent = btn.getAttribute("data-ja");
      nameEn.textContent = btn.getAttribute("data-en");
      moveJa.textContent = btn.getAttribute("data-move-ja");
      moveEn.textContent = btn.getAttribute("data-move-en");
      var free = btn.hasAttribute("data-free");
      badge.className = "zbadge " + (free ? "free" : "prem");
      badge.innerHTML = free ? '<span class="ja">無料</span><span class="en">Free</span>'
                             : '<span class="ja">プレミアム</span><span class="en">Premium</span>';
      if (shown) {
        video.src = "video/stickers/" + btn.getAttribute("data-clip") + ".mp4";
        if (autoplay) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
      }
    };

    buttons.forEach(function (b) { b.addEventListener("click", function () { select(b, true); }); });
    select(buttons[0], false);

    whenVisible(zukan.querySelector(".zukan-stage"), function () {
      if (!shown) {
        shown = true; select(current, !reduceMotion);
        // 流れるシール一覧は横に隠れている画像も先に読み込んでおく（流れてきたときに空にならないように）
        document.querySelectorAll(".marquee img").forEach(function (im) { im.loading = "eager"; });
        return;
      }
      if (!reduceMotion) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
    }, function () { if (shown && !video.paused) video.pause(); });

    // 動きを減らす設定のときは、動画を止めたまま再生ボタンを出す
    if (reduceMotion) video.setAttribute("controls", "");
  }
})();
