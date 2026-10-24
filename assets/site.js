/* Gandkari Detector site driver.
 * One clock (gsap.ticker). One suspension spring fed by scroll velocity, speed breakers, taps
 * and a slow engine-idle input. The bobblehead and the bump graph both read that spring. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.add("js");
  if (reduce) root.classList.add("reduce");

  /* Sound toggle works with or without GSAP. Off by default, remembered per visitor. */
  /* PLACEHOLDER (owner): clips played on the web. Files live in assets/sfx/; swap names freely. */
  var clips = ["accha_ji", "technologia", "rom_rom_bhaiyo", "challo"];
  var base = (document.querySelector("script[src*='site.js']").getAttribute("src") || "").replace(/site\.js.*$/, "");
  var soundOn = false;
  var lastClip = 0;
  try { soundOn = localStorage.getItem("gd-sound") === "1"; } catch (e) { soundOn = false; }
  var soundBtn = document.querySelector("[data-sound]");
  function syncSound() {
    if (!soundBtn) return;
    soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    soundBtn.querySelector("[data-sound-label]").textContent = soundOn ? "Sound on" : "Sound off";
  }
  function play(strength) {
    if (!soundOn || strength < 0.5) return;
    var now = performance.now();
    if (now - lastClip < 1400) return;
    lastClip = now;
    var a = new Audio(base + "sfx/" + clips[Math.floor(Math.random() * clips.length)] + ".mp3");
    a.volume = 0.7;
    a.play().catch(function () { /* autoplay blocked: ignore */ });
  }
  if (soundBtn) {
    syncSound();
    soundBtn.addEventListener("click", function () {
      soundOn = !soundOn;
      try { localStorage.setItem("gd-sound", soundOn ? "1" : "0"); } catch (e) { /* storage blocked */ }
      syncSound();
      if (soundOn) { lastClip = 0; play(1); }
      if (window.posthog) window.posthog.capture("site_sound_toggled", { on: soundOn });
    });
  }

  document.querySelectorAll("[data-download]").forEach(function (a) {
    a.addEventListener("click", function () {
      if (window.posthog) window.posthog.capture("apk_download_clicked", { from: a.getAttribute("data-download") });
    });
  });

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;

  /* Reduced motion or no GSAP: static page, level rows still play sound when asked. */
  if (reduce || !gsap) {
    document.querySelectorAll("[data-level]").forEach(function (b) {
      b.addEventListener("click", function () { play(Number(b.getAttribute("data-level")) / 4); });
    });
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  /* Smooth scroll on the shared ticker. */
  var lenis = null;
  if (window.Lenis) {
    lenis = new window.Lenis({ autoRaf: false, lerp: 0.12 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* Suspension: angle (deg) and dip (px) with a damped spring. */
  var s = { a: 0, va: 0, y: 0, vy: 0 };
  var K = 120, D = 7.5;
  var lastScroll = window.scrollY;
  var vel = 0;
  var head = document.querySelector("[data-bobble]");
  var setRot = head ? gsap.quickSetter(head, "rotation", "deg") : null;
  var setY = head ? gsap.quickSetter(head, "y", "px") : null;
  if (head) gsap.set(head, { transformOrigin: "50% 100%" });

  function kick(strength) {
    var dir = Math.random() < 0.5 ? -1 : 1;
    s.va += dir * (90 + 260 * strength);
    s.vy += 180 + 420 * strength;
    play(strength);
  }
  window.gdKick = kick;

  /* Bump graph: rolling 30 s style trace of the spring. */
  var graphs = Array.prototype.slice.call(document.querySelectorAll("[data-graph]"));
  var N = 90;
  var samples = [];
  for (var i = 0; i < N; i++) samples.push(0);
  var sampleT = 0;

  var heroVisible = true;
  if (head) {
    ScrollTrigger.create({
      trigger: head, start: "top bottom", end: "bottom top",
      onToggle: function (self) { heroVisible = self.isActive; }
    });
  }

  gsap.ticker.add(function (time, dt) {
    var step = Math.min(dt, 50) / 1000;
    var y = lenis ? lenis.scroll : window.scrollY;
    var v = (y - lastScroll) / Math.max(step, 0.001);
    lastScroll = y;
    vel += (v - vel) * 0.15;

    /* Idle: engine at a red light. Scroll speed leans the head forward. */
    var idle = Math.sin(time * 2.1) * 1.6 + Math.sin(time * 5.3) * 0.5;
    var lean = gsap.utils.clamp(-10, 10, vel * 0.006);
    var targetA = idle + lean;

    s.va += (-K * (s.a - targetA) - D * s.va) * step;
    s.a += s.va * step;
    s.vy += (-K * s.y - D * s.vy) * step;
    s.y += s.vy * step;

    if (heroVisible && setRot) {
      setRot(gsap.utils.clamp(-24, 24, s.a));
      setY(gsap.utils.clamp(-6, 22, s.y));
    }

    sampleT += step;
    if (sampleT > 1 / 30) {
      sampleT = 0;
      samples.shift();
      samples.push(gsap.utils.clamp(-1, 1, (s.a - idle) / 22 + s.y / 40));
      for (var g = 0; g < graphs.length; g++) {
        var pts = "";
        for (var j = 0; j < N; j++) pts += (j * (300 / (N - 1))).toFixed(1) + "," + (32 - samples[j] * 30).toFixed(1) + " ";
        graphs[g].setAttribute("points", pts);
      }
    }
  });

  /* Speed breakers jolt the head as they cross the middle of the screen. */
  document.querySelectorAll(".breaker").forEach(function (b) {
    ScrollTrigger.create({
      trigger: b, start: "top 55%",
      onEnter: function () { kick(0.75); },
      onEnterBack: function () { kick(0.5); }
    });
  });

  /* Level rows: tap to feel each level. */
  document.querySelectorAll("[data-level]").forEach(function (b) {
    var lv = Number(b.getAttribute("data-level"));
    b.addEventListener("click", function () { kick(lv / 4); });
    b.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") kick(lv / 8); });
    var cup = b.querySelector(".cup svg");
    if (cup) {
      b.addEventListener("click", function () {
        gsap.fromTo(cup, { y: 0, rotation: 0 }, { y: -6 * lv, rotation: lv * 8, duration: 0.18, ease: "power2.out", yoyo: true, repeat: 1 });
      });
    }
  });

  /* The bobblehead itself takes a tap. */
  if (head) head.addEventListener("click", function () { kick(0.9); });

  /* Settle in like a suspension: drop, overshoot, rest. */
  gsap.utils.toArray("[data-settle]").forEach(function (el) {
    gsap.fromTo(el, { opacity: 0, y: 36 }, {
      opacity: 1, y: 0, duration: 0.9, ease: "back.out(1.6)",
      scrollTrigger: { trigger: el, start: "top 88%", once: true }
    });
  });

  /* Hero intro: lines drop onto the road, then the first jolt. */
  var lines = document.querySelectorAll("[data-intro] .line");
  if (lines.length) {
    gsap.from(lines, { yPercent: 40, opacity: 0, duration: 0.9, ease: "back.out(1.4)", stagger: 0.07, delay: 0.1 });
    gsap.delayedCall(0.6, function () { kick(0.6); });
  }

  /* Chapter colour: the Atlas section turns the road into map paper. */
  document.querySelectorAll("[data-paper]").forEach(function (sec) {
    ScrollTrigger.create({
      trigger: sec, start: "top 55%", end: "bottom 45%",
      onToggle: function (self) { root.classList.toggle("on-paper", self.isActive); }
    });
  });

  /* Web fonts change line breaks; re-measure once they and images are in. */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  window.addEventListener("load", function () { ScrollTrigger.refresh(); });

  /* Header steps aside going down, returns going up. */
  var bar = document.querySelector(".bar");
  if (bar) {
    ScrollTrigger.create({
      start: 120, end: "max",
      onUpdate: function (self) { bar.classList.toggle("away", self.direction === 1); },
      onLeaveBack: function () { bar.classList.remove("away"); }
    });
  }
})();
