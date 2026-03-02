/* =============================================
   CalmSphere — Full Application Logic
   ============================================= */
(() => {
  'use strict';

  // ---- Helpers ----
  const $ = id => document.getElementById(id);
  const all = sel => document.querySelectorAll(sel);

  // ---- Screens ----
  const screenIds = ['welcome', 'capture', 'insight', 'dashboard', 'bubbles', 'ocean', 'tree', 'sounds', 'breathe', 'smile', 'ambient'];
  const screens = {};
  screenIds.forEach(id => screens[id] = $(`screen-${id}`));

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  // ---- State ----
  let audioCtx = null;
  let oscList = [];
  let mediaStream = null;
  let detectedState = 'calm'; // calm | anxiety | burnout
  let captureData = { movement: 0, voice: 0 };

  // ============================================================
  //  AUDIO CONTEXT
  // ============================================================
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function stopAudio() {
    oscList.forEach(({ osc, gain }) => {
      try { gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + .4); setTimeout(() => { try { osc.stop() } catch (e) { } }, 500); } catch (e) { }
    });
    oscList = [];
  }

  // ============================================================
  //  MEDIA HELPERS
  // ============================================================
  function stopMedia() {
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  }

  // ============================================================
  //  COLOR THERAPY — Dynamic Theme
  // ============================================================
  function applyTheme(state) {
    document.body.classList.remove('theme-calm', 'theme-anxiety', 'theme-burnout');
    document.body.classList.add(`theme-${state}`);
  }

  // ============================================================
  //  1. WELCOME → CAPTURE
  // ============================================================
  $('btn-start').addEventListener('click', startCapture);

  async function startCapture() {
    showScreen('capture');
    $('cap-label').textContent = 'Reading your expression…';
    $('cam-overlay').classList.remove('mic-mode');
    $('ic-cam').classList.remove('hidden');
    $('ic-mic').classList.add('hidden');
    setRing(0);

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 }, audio: false });
      $('cam-video').srcObject = mediaStream;
    } catch (e) {
      captureData.movement = Math.random() * 50 + 10;
      await fakeProgress(5000, 0, 50);
      stopMedia();
      startMic();
      return;
    }

    const ctx = $('cam-canvas').getContext('2d', { willReadFrequently: true });
    let prev = null, totalD = 0, frames = 0;
    const t0 = Date.now(), dur = 5000;

    (function loop() {
      const el = Date.now() - t0;
      setRing(el / dur * 50);
      if (el >= dur) {
        captureData.movement = Math.min(100, (totalD / Math.max(frames, 1)) * 8);
        stopMedia(); $('cam-video').srcObject = null;
        startMic(); return;
      }
      ctx.drawImage($('cam-video'), 0, 0, 320, 240);
      const px = ctx.getImageData(0, 0, 320, 240).data;
      let b = 0, n = 0;
      for (let i = 0; i < px.length; i += 64) { b += (px[i] + px[i + 1] + px[i + 2]) / 3; n++; }
      const avg = b / n;
      if (prev !== null) { totalD += Math.abs(avg - prev); frames++; }
      prev = avg;
      requestAnimationFrame(loop);
    })();
  }

  // ---- Mic ----
  async function startMic() {
    $('cap-label').textContent = 'Listening to your voice…';
    $('cam-overlay').classList.add('mic-mode');
    $('ic-cam').classList.add('hidden');
    $('ic-mic').classList.remove('hidden');

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      captureData.voice = Math.random() * 50 + 10;
      await fakeProgress(5000, 50, 100);
      goInsight(); return;
    }

    const ac = ensureAudio();
    const src = ac.createMediaStreamSource(mediaStream);
    const an = ac.createAnalyser(); an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    let totalRMS = 0, hfE = 0, cnt = 0;
    const t0 = Date.now(), dur = 5000;

    (function loop() {
      const el = Date.now() - t0;
      setRing(50 + el / dur * 50);
      if (el >= dur) {
        const rms = totalRMS / Math.max(cnt, 1);
        const hf = hfE / Math.max(cnt, 1);
        captureData.voice = Math.min(100, rms * 1.5 + hf * .5);
        stopMedia(); goInsight(); return;
      }
      an.getByteFrequencyData(buf);
      let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      totalRMS += Math.sqrt(s / buf.length);
      let hs = 0; const hi = Math.floor(buf.length * .6);
      for (let i = hi; i < buf.length; i++) hs += buf[i];
      hfE += hs / (buf.length - hi);
      cnt++;
      requestAnimationFrame(loop);
    })();
  }

  function setRing(pct) {
    const c = 2 * Math.PI * 95;
    $('capture-ring').style.strokeDashoffset = c - (c * Math.min(pct, 100) / 100);
  }

  async function fakeProgress(ms, from, to) {
    const t0 = Date.now();
    return new Promise(r => {
      (function f() { const p = from + (Date.now() - t0) / ms * (to - from); setRing(Math.min(p, to)); if (Date.now() - t0 >= ms) { r(); return; } requestAnimationFrame(f); })();
    });
  }

  // ============================================================
  //  2. INSIGHT
  // ============================================================
  function goInsight() {
    showScreen('insight');
    const { movement, voice } = captureData;
    const score = movement * .4 + voice * .6;
    const pct = Math.min(Math.round(score), 100);

    if (score < 35) detectedState = 'calm';
    else if (score <= 65) detectedState = 'anxiety';
    else detectedState = 'burnout';

    applyTheme(detectedState);

    // Animate meter
    setTimeout(() => {
      const c = 2 * Math.PI * 88;
      $('meter-fill').style.strokeDashoffset = c - c * pct / 100;
      animateNumber($('meter-val'), 0, pct, 1200);
    }, 300);

    const msgs = {
      calm: { state: 'You\'re Feeling Calm 🌿', msg: 'Great news — you seem relaxed and present. Let\'s keep that energy going.' },
      anxiety: { state: 'Slight Anxiety Detected 💙', msg: 'You seem a little anxious. Let\'s help you reset with some calming tools.' },
      burnout: { state: 'Signs of Burnout 🧡', msg: 'You might be feeling overwhelmed. Let\'s slow down and recharge together.' },
    };
    $('insight-state').textContent = msgs[detectedState].state;
    $('insight-msg').textContent = msgs[detectedState].msg;
  }

  function animateNumber(el, from, to, dur) {
    const t0 = performance.now();
    (function f(now) {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round(from + (to - from) * p);
      if (p < 1) requestAnimationFrame(f);
    })(t0);
  }

  $('btn-dashboard').addEventListener('click', () => {
    const subs = { calm: 'Tools to maintain your peace', anxiety: 'Curated to ease your mind', burnout: 'Gentle activities to recharge' };
    $('dash-sub').textContent = subs[detectedState];
    showScreen('dashboard');
  });

  // ============================================================
  //  3. DASHBOARD → MODULES
  // ============================================================
  all('.dash-card').forEach(c => c.addEventListener('click', () => {
    const mod = c.dataset.module;
    showScreen(mod);
    moduleInit[mod]?.();
  }));

  all('.btn-back').forEach(b => b.addEventListener('click', () => {
    cleanup();
    showScreen(b.dataset.back);
  }));

  function cleanup() {
    stopAudio(); stopMedia();
    if (navigator.vibrate) navigator.vibrate(0);
    bubbleStop(); oceanStop(); treeStop(); breatheStop();
  }

  const moduleInit = { bubbles: bubbleStart, ocean: oceanStart, tree: treeStart, sounds: soundStart, breathe: breatheInit, smile: smileInit, ambient: ambientStart };

  // ============================================================
  //  MODULE: BUBBLE POP
  // ============================================================
  let bubbleRAF = null, bubbles = [], bubbleT0 = 0;

  function bubbleStart() {
    const cv = $('bubble-canvas'), cx = cv.getContext('2d');
    cv.width = cv.offsetWidth * 2; cv.height = cv.offsetHeight * 2;
    cx.scale(2, 2);
    const W = cv.offsetWidth, H = cv.offsetHeight;
    bubbles = []; bubbleT0 = Date.now();

    for (let i = 0; i < 12; i++) spawnBubble(W, H);

    function spawnBubble(w, h) {
      bubbles.push({
        x: Math.random() * w, y: h + Math.random() * 40, r: 18 + Math.random() * 22, vy: -(0.4 + Math.random() * 0.6), vx: (Math.random() - .5) * .4,
        hue: 160 + Math.random() * 60, alpha: 0.6 + Math.random() * 0.3, pop: false
      });
    }

    cv.onclick = cv.ontouchstart = function (e) {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const ex = (e.touches ? e.touches[0] : e).clientX - rect.left;
      const ey = (e.touches ? e.touches[0] : e).clientY - rect.top;
      for (let b of bubbles) {
        if (!b.pop && Math.hypot(b.x - ex, b.y - ey) < b.r + 8) {
          b.pop = true;
          playWaterPop();
          if (navigator.vibrate) navigator.vibrate(30);
        }
      }
    };

    (function loop() {
      const el = (Date.now() - bubbleT0) / 1000;
      const remain = Math.max(0, 30 - el);
      $('bubble-timer').textContent = `0:${String(Math.ceil(remain)).padStart(2, '0')}`;
      if (remain <= 0) { cx.clearRect(0, 0, W, H); $('bubble-timer').textContent = '✨ Done!'; return; }

      cx.clearRect(0, 0, W, H);
      bubbles = bubbles.filter(b => !b.pop || b.alpha > 0);
      if (bubbles.length < 10 && Math.random() < .05) spawnBubble(W, H);

      bubbles.forEach(b => {
        if (b.pop) { b.alpha -= 0.05; b.r += 2; }
        else { b.y += b.vy; b.x += b.vx + Math.sin(Date.now() / 800 + b.x) * .15; if (b.y < -b.r) { b.y = H + 20; b.x = Math.random() * W; } }
        cx.beginPath();
        cx.arc(b.x, b.y, Math.max(b.r, 0), 0, Math.PI * 2);
        cx.fillStyle = `hsla(${b.hue},65%,70%,${Math.max(b.alpha, 0)})`;
        cx.fill();
        cx.strokeStyle = `hsla(${b.hue},70%,80%,${Math.max(b.alpha * .5, 0)})`;
        cx.lineWidth = 1.5; cx.stroke();
      });
      bubbleRAF = requestAnimationFrame(loop);
    })();
  }

  function bubbleStop() { if (bubbleRAF) cancelAnimationFrame(bubbleRAF); bubbleRAF = null; bubbles = []; }

  function playWaterPop() {
    const ac = ensureAudio();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(600 + Math.random() * 400, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(100, ac.currentTime + .15);
    g.gain.setValueAtTime(.12, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .2);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + .25);
  }

  // ============================================================
  //  MODULE: OCEAN RHYTHM
  // ============================================================
  let oceanRAF = null, oceanPhase = 0, lastTap = 0, oceanScore = 0;

  function oceanStart() {
    const cv = $('ocean-canvas'), cx = cv.getContext('2d');
    cv.width = cv.offsetWidth * 2; cv.height = cv.offsetHeight * 2;
    cx.scale(2, 2);
    const W = cv.offsetWidth, H = cv.offsetHeight;
    oceanPhase = 0; oceanScore = 0;

    cv.onclick = cv.ontouchstart = function (e) {
      e.preventDefault();
      const now = Date.now();
      // Wave peaks every ~3 seconds
      const phase = (now / 3000 * Math.PI * 2) % (Math.PI * 2);
      const nearPeak = Math.abs(Math.sin(phase)) > 0.85;
      if (nearPeak) {
        oceanScore++;
        const fb = $('ocean-feedback');
        fb.classList.add('glow');
        fb.textContent = '🌊 Perfect!';
        setTimeout(() => fb.classList.remove('glow'), 600);
        if (navigator.vibrate) navigator.vibrate(50);
      }
      lastTap = now;
    };

    (function loop() {
      cx.clearRect(0, 0, W, H);
      const t = Date.now() / 1000;

      // Draw waves
      for (let layer = 0; layer < 4; layer++) {
        cx.beginPath();
        const baseY = H * 0.5 + layer * 18;
        const amp = 20 - layer * 3;
        const speed = 1.2 + layer * 0.3;
        const alpha = 0.2 - layer * 0.04;
        for (let x = 0; x <= W; x += 2) {
          const y = baseY + Math.sin(x * 0.015 + t * speed) * amp + Math.sin(x * 0.008 - t * 0.7) * amp * 0.5;
          x === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
        }
        cx.lineTo(W, H); cx.lineTo(0, H); cx.closePath();
        cx.fillStyle = `hsla(195,60%,55%,${alpha})`;
        cx.fill();
      }

      // Moon
      cx.beginPath(); cx.arc(W * .75, H * .18, 22, 0, Math.PI * 2);
      cx.fillStyle = 'rgba(255,255,220,0.15)'; cx.fill();

      $('ocean-timer').textContent = `Rhythm score: ${oceanScore}`;
      oceanRAF = requestAnimationFrame(loop);
    })();
  }

  function oceanStop() { if (oceanRAF) cancelAnimationFrame(oceanRAF); oceanRAF = null; }

  // ============================================================
  //  MODULE: GROW A TREE
  // ============================================================
  let treeRAF = null, treeGrowth = 0, treeHolding = false;

  function treeStart() {
    treeGrowth = 0; treeHolding = false;
    const cv = $('tree-canvas'), cx = cv.getContext('2d');
    cv.width = cv.offsetWidth * 2; cv.height = cv.offsetHeight * 2;
    cx.scale(2, 2);
    const W = cv.offsetWidth, H = cv.offsetHeight;

    const btn = $('btn-breathe-tree');
    btn.onmousedown = btn.ontouchstart = (e) => { e.preventDefault(); treeHolding = true; };
    btn.onmouseup = btn.ontouchend = btn.onmouseleave = () => { treeHolding = false; };

    (function loop() {
      if (treeHolding && treeGrowth < 100) treeGrowth = Math.min(100, treeGrowth + 0.18);
      const g = treeGrowth / 100;
      $('tree-progress').textContent = treeGrowth >= 100 ? '🌳 Fully Grown! Beautiful!' : `Growth: ${Math.round(treeGrowth)}%`;

      cx.clearRect(0, 0, W, H);

      // Ground
      cx.fillStyle = 'hsla(140,30%,22%,0.4)';
      cx.fillRect(0, H - 30, W, 30);

      // Trunk
      const trunkH = 40 + g * 80;
      const trunkW = 6 + g * 8;
      const bx = W / 2, by = H - 30;
      cx.fillStyle = `hsl(30,40%,${25 + g * 10}%)`;
      cx.fillRect(bx - trunkW / 2, by - trunkH, trunkW, trunkH);

      // Branches + leaves
      if (g > 0.15) {
        const leafR = 10 + g * 40;
        // Canopy
        const cx2 = bx, cy2 = by - trunkH;
        for (let i = 0; i < Math.ceil(g * 6); i++) {
          const angle = (i / 6) * Math.PI * 2 + Math.sin(Date.now() / 2000) * .1;
          const dist = leafR * (0.5 + Math.random() * 0.5) * g;
          const lx = cx2 + Math.cos(angle) * dist;
          const ly = cy2 - Math.abs(Math.sin(angle)) * dist - leafR * 0.3;
          const lr = 12 + g * 18;
          cx.beginPath(); cx.arc(lx, ly, lr, 0, Math.PI * 2);
          cx.fillStyle = `hsla(${120 + i * 15},55%,${40 + g * 15}%,${0.5 + g * 0.3})`;
          cx.fill();
        }
        // Top circle
        cx.beginPath(); cx.arc(cx2, cy2 - leafR * 0.6, leafR * 0.8, 0, Math.PI * 2);
        cx.fillStyle = `hsla(130,50%,45%,${0.4 + g * 0.3})`; cx.fill();
      }

      // Reward
      if (treeGrowth >= 100) {
        for (let i = 0; i < 5; i++) {
          const sx = W * 0.2 + Math.random() * W * 0.6, sy = Math.random() * H * 0.4;
          cx.fillStyle = `hsla(${50 + Math.random() * 30},90%,70%,${0.3 + Math.sin(Date.now() / 300 + i) * 0.3})`;
          cx.font = '16px serif'; cx.fillText('✨', sx, sy);
        }
      }

      treeRAF = requestAnimationFrame(loop);
    })();
  }

  function treeStop() { if (treeRAF) cancelAnimationFrame(treeRAF); treeRAF = null; treeGrowth = 0; treeHolding = false; }

  // ============================================================
  //  MODULE: SOUND THERAPY
  // ============================================================
  let soundPlaying = false;

  function soundStart() {
    soundPlaying = false;
    $('btn-sound-toggle').textContent = '▶ Play';
    const cfg = {
      anxiety: { icon: '🌧️', name: 'Rain + Slow Breathing', freqs: [180, 182], chord: [220, 277, 330], vol: .05 },
      burnout: { icon: '🐦', name: 'Forest Birds + Soft Flute', freqs: [320, 322], chord: [392, 494, 588], vol: .04 },
      calm: { icon: '🎵', name: 'Light Ambient', freqs: [174, 176], chord: [261, 329, 392], vol: .03 },
    };
    const c = cfg[detectedState] || cfg.calm;
    $('sound-icon').textContent = c.icon;
    $('sound-name').textContent = c.name;
    $('sound-sub').textContent = detectedState === 'anxiety' ? 'Rain to ease your anxious mind' : detectedState === 'burnout' ? 'Nature sounds to recharge you' : 'Gentle tones for your peaceful state';
  }

  $('btn-sound-toggle').addEventListener('click', () => {
    if (soundPlaying) {
      stopAudio(); soundPlaying = false;
      $('btn-sound-toggle').textContent = '▶ Play';
    } else {
      const ac = ensureAudio(); stopAudio();
      const cfg = {
        anxiety: { freqs: [180, 182], chord: [220, 277, 330], vol: .05 },
        burnout: { freqs: [320, 322], chord: [392, 494, 588], vol: .04 },
        calm: { freqs: [174, 176], chord: [261, 329, 392], vol: .03 },
      };
      const c = cfg[detectedState] || cfg.calm;
      c.freqs.forEach(f => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, ac.currentTime);
        g.gain.linearRampToValueAtTime(c.vol, ac.currentTime + 2);
        o.connect(g); g.connect(ac.destination); o.start();
        oscList.push({ osc: o, gain: g });
      });
      c.chord.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, ac.currentTime);
        g.gain.linearRampToValueAtTime(c.vol * .4, ac.currentTime + 2 + i * .5);
        o.connect(g); g.connect(ac.destination); o.start();
        oscList.push({ osc: o, gain: g });
      });

      // Voice affirmation via SpeechSynthesis
      if (detectedState !== 'calm' && 'speechSynthesis' in window) {
        setTimeout(() => {
          const msgs = [
            "You're safe. Slow down. Breathe with me.",
            "This moment will pass. You are strong.",
            "Let go of what you cannot control. Be present.",
          ];
          const utt = new SpeechSynthesisUtterance(msgs[Math.floor(Math.random() * msgs.length)]);
          utt.rate = 0.8; utt.pitch = 0.9; utt.volume = 0.7;
          speechSynthesis.speak(utt);
        }, 3000);
      }

      soundPlaying = true;
      $('btn-sound-toggle').textContent = '⏸ Pause';
    }
  });

  // ============================================================
  //  MODULE: HAPTIC BREATHING
  // ============================================================
  let breatheInt = null, breatheActive = false;

  function breatheInit() {
    breatheActive = false;
    $('breathe-txt').textContent = 'Ready';
    $('breathe-circle').className = 'breathe-circle';
    $('btn-breathe-start').textContent = 'Start Breathing';
  }

  $('btn-breathe-start').addEventListener('click', () => {
    if (breatheActive) { breatheStop(); breatheInit(); return; }
    breatheActive = true;
    $('btn-breathe-start').textContent = 'Stop';

    function cycle() {
      const circle = $('breathe-circle'), txt = $('breathe-txt'), phase = $('breathe-phase');
      // Inhale 4s
      txt.textContent = 'Inhale'; phase.textContent = 'Inhaling… 4s';
      circle.className = 'breathe-circle inhale';
      if (navigator.vibrate) navigator.vibrate([100, 200, 100, 200, 100, 200, 100, 200, 100, 200, 100, 200, 100, 200, 100]);

      setTimeout(() => {
        if (!breatheActive) return;
        txt.textContent = 'Hold'; phase.textContent = 'Holding… 7s';
        circle.className = 'breathe-circle hold';
        if (navigator.vibrate) navigator.vibrate(0);

        setTimeout(() => {
          if (!breatheActive) return;
          txt.textContent = 'Exhale'; phase.textContent = 'Exhaling… 8s';
          circle.className = 'breathe-circle exhale';

          setTimeout(() => {
            if (!breatheActive) return;
            circle.className = 'breathe-circle';
          }, 8000);
        }, 7000);
      }, 4000);
    }
    cycle();
    breatheInt = setInterval(cycle, 19500);
  });

  function breatheStop() { breatheActive = false; if (breatheInt) { clearInterval(breatheInt); breatheInt = null; } if (navigator.vibrate) navigator.vibrate(0); }

  // ============================================================
  //  MODULE: SMILE CHALLENGE
  // ============================================================
  let smileRAF = null, smileStream = null;

  function smileInit() {
    $('smile-title').textContent = 'Smile Challenge 😊';
    $('smile-sub').textContent = "Let's try a small smile…";
    $('btn-smile-start').textContent = 'Start Camera';
    $('btn-smile-start').disabled = false;
  }

  $('btn-smile-start').addEventListener('click', async () => {
    $('btn-smile-start').disabled = true;
    $('smile-sub').textContent = 'Looking for your smile…';

    try {
      smileStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } });
      $('smile-video').srcObject = smileStream;
    } catch (e) {
      $('smile-sub').textContent = 'Camera not available. But you smiled inside! 💛';
      setTimeout(() => fireConfetti(), 1000);
      return;
    }

    const ctx = $('smile-canvas').getContext('2d', { willReadFrequently: true });
    let baseline = null, smileDetected = false, highCount = 0;

    (function loop() {
      if (smileDetected) return;
      ctx.drawImage($('smile-video'), 0, 0, 320, 240);
      const px = ctx.getImageData(0, 0, 320, 240).data;
      let b = 0, n = 0;
      for (let i = 0; i < px.length; i += 48) { b += (px[i] + px[i + 1] + px[i + 2]) / 3; n++; }
      const avg = b / n;

      if (baseline === null) { baseline = avg; }
      else {
        // Smiling increases facial brightness (cheeks move up, more light reflection)
        const delta = avg - baseline;
        if (delta > 2.5) highCount++;
        else highCount = Math.max(0, highCount - 1);

        if (highCount > 15) {
          smileDetected = true;
          $('smile-title').textContent = 'You Did It! 🎉';
          $('smile-sub').textContent = 'Beautiful smile! You brightened the room.';
          if (navigator.vibrate) navigator.vibrate([100, 100, 200]);
          fireConfetti();
          setTimeout(() => { if (smileStream) { smileStream.getTracks().forEach(t => t.stop()); $('smile-video').srcObject = null; } }, 3000);
          return;
        }
      }
      smileRAF = requestAnimationFrame(loop);
    })();
  });

  function fireConfetti() {
    const cv = $('confetti-canvas'), cx = cv.getContext('2d');
    cv.width = window.innerWidth * 2; cv.height = window.innerHeight * 2;
    cx.scale(2, 2);
    const W = window.innerWidth, H = window.innerHeight;
    const pieces = [];
    for (let i = 0; i < 100; i++) {
      pieces.push({
        x: W / 2 + ((Math.random() - .5) * 200), y: H / 2, vx: (Math.random() - .5) * 12, vy: -3 - Math.random() * 10,
        r: 4 + Math.random() * 6, hue: Math.random() * 360, rot: Math.random() * 360, vr: (Math.random() - .5) * 10, alpha: 1
      });
    }
    let frame = 0;
    (function loop() {
      cx.clearRect(0, 0, W, H);
      pieces.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.rot += p.vr; p.alpha -= 0.008;
        if (p.alpha <= 0) return;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot * Math.PI / 180);
        cx.fillStyle = `hsla(${p.hue},80%,65%,${p.alpha})`;
        cx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        cx.restore();
      });
      frame++;
      if (frame < 150) requestAnimationFrame(loop);
      else cx.clearRect(0, 0, W, H);
    })();
  }

  // ============================================================
  //  MODULE: AMBIENT VISUALS
  // ============================================================
  let ambRAF = null, ambScene = 'stars';

  function ambientStart() {
    ambScene = 'stars';
    all('.amb-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.amb-btn[data-scene="stars"]').classList.add('active');
    runAmbient();
  }

  all('.amb-btn').forEach(b => b.addEventListener('click', () => {
    all('.amb-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    ambScene = b.dataset.scene;
  }));

  function runAmbient() {
    if (ambRAF) cancelAnimationFrame(ambRAF);
    const cv = $('ambient-canvas'), cx = cv.getContext('2d');
    cv.width = cv.offsetWidth * 2; cv.height = cv.offsetHeight * 2;
    cx.scale(2, 2);
    const W = cv.offsetWidth, H = cv.offsetHeight;

    // Pre-create particles
    const stars = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 0.5 + Math.random() * 2, s: 0.3 + Math.random() * 0.7, p: Math.random() * Math.PI * 2 }));
    const clouds = Array.from({ length: 8 }, (_, i) => ({ x: Math.random() * W, y: 30 + Math.random() * (H - 60), w: 60 + Math.random() * 80, h: 20 + Math.random() * 20, s: 0.15 + Math.random() * 0.15 }));
    const particles = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 2 + Math.random() * 4, vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3, hue: 200 + Math.random() * 100, p: Math.random() * Math.PI * 2 }));

    (function loop() {
      cx.clearRect(0, 0, W, H);
      const t = Date.now() / 1000;

      if (ambScene === 'stars') {
        // Dark sky
        cx.fillStyle = 'rgba(5,10,25,0.15)'; cx.fillRect(0, 0, W, H);
        stars.forEach(s => {
          const twinkle = 0.4 + Math.sin(t * s.s + s.p) * 0.6;
          cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          cx.fillStyle = `rgba(255,255,240,${twinkle * 0.8})`;
          cx.fill();
        });
      }
      else if (ambScene === 'clouds') {
        clouds.forEach(c => {
          c.x += c.s;
          if (c.x > W + c.w) c.x = -c.w;
          cx.beginPath();
          cx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
          cx.fillStyle = 'rgba(200,210,230,0.08)';
          cx.fill();
          cx.beginPath();
          cx.ellipse(c.x + c.w * 0.25, c.y - c.h * .3, c.w * .3, c.h * .4, 0, 0, Math.PI * 2);
          cx.fillStyle = 'rgba(200,210,230,0.06)';
          cx.fill();
        });
      }
      else if (ambScene === 'particles') {
        particles.forEach(p => {
          p.x += p.vx; p.y += p.vy; p.p += 0.02;
          if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
          if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
          const glow = 0.3 + Math.sin(p.p) * 0.4;
          cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          const grad = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          grad.addColorStop(0, `hsla(${p.hue},60%,70%,${glow})`);
          grad.addColorStop(1, `hsla(${p.hue},60%,70%,0)`);
          cx.fillStyle = grad; cx.fill();
        });
      }

      ambRAF = requestAnimationFrame(loop);
    })();
  }

  // ============================================================
  //  RESTART
  // ============================================================
  $('btn-restart')?.addEventListener('click', () => { cleanup(); showScreen('welcome'); });

})();
