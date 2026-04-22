window.ARC = (() => {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────
  let _ctx = null, _sfxG = null, _musicG = null;
  let _musicEngine = null, _currentMusicName = null;
  let _sfxEnabled   = localStorage.getItem('arcade_sfx')   !== 'false';
  let _musicEnabled = localStorage.getItem('arcade_music') !== 'false';
  let _noiseBuffers = {};
  let _snakeFoodCount = 0;
  let _lastHornTime   = -999;

  // ── Context ───────────────────────────────────────────────────────────────
  function _initCtx() {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _sfxG   = _ctx.createGain();
    _musicG = _ctx.createGain();
    _sfxG.connect(_ctx.destination);
    _musicG.connect(_ctx.destination);
    _sfxG.gain.value   = _sfxEnabled   ? 0.6  : 0;
    _musicG.gain.value = _musicEnabled ? 0.25 : 0;
    _preloadNoise();
  }

  window.addEventListener('pointerdown', () => {
    if (!_ctx) _initCtx();
    else if (_ctx.state === 'suspended') _ctx.resume();
  }, { passive: true });

  function _ensure() {
    if (!_ctx) _initCtx();
    if (_ctx.state === 'suspended') _ctx.resume();
  }

  // ── Noise buffers (pre-rendered at init) ──────────────────────────────────
  function _preloadNoise() {
    [0.1, 0.15, 0.2, 0.3, 0.4, 0.5].forEach(s => {
      const n = Math.floor(_ctx.sampleRate * s);
      const b = _ctx.createBuffer(1, n, _ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      _noiseBuffers[String(s)] = b;
    });
  }

  function _getNoise(s) {
    const k = String(s);
    if (_noiseBuffers[k]) return _noiseBuffers[k];
    const n = Math.floor(_ctx.sampleRate * s);
    const b = _ctx.createBuffer(1, n, _ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return (_noiseBuffers[k] = b);
  }

  // ── Synthesis primitives ──────────────────────────────────────────────────
  // Linear frequency ramp oscillator
  function _osc(type, f0, f1, dur, peak, delay) {
    const t = _ctx.currentTime + (delay || 0);
    const o = _ctx.createOscillator();
    const g = _ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.linearRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.003);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(_sfxG);
    o.start(t); o.stop(t + dur + 0.02);
    o.onended = () => o.disconnect();
  }

  // Exponential frequency ramp (pew-style laser)
  function _expOsc(type, f0, f1, dur, peak, delay) {
    const t = _ctx.currentTime + (delay || 0);
    const o = _ctx.createOscillator();
    const g = _ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.003);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(_sfxG);
    o.start(t); o.stop(t + dur + 0.02);
    o.onended = () => o.disconnect();
  }

  // Filtered white-noise burst
  function _noise(s, filterType, filterFreq, filterQ, dur, peak, delay) {
    const t = _ctx.currentTime + (delay || 0);
    const src = _ctx.createBufferSource();
    const flt = _ctx.createBiquadFilter();
    const g   = _ctx.createGain();
    src.buffer = _getNoise(s);
    flt.type = filterType;
    flt.frequency.value = filterFreq;
    if (filterQ) flt.Q.value = filterQ;
    g.gain.setValueAtTime(peak, t);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(flt); flt.connect(g); g.connect(_sfxG);
    src.start(t); src.stop(t + dur + 0.02);
    src.onended = () => src.disconnect();
  }

  // Guard: returns a 0-arg wrapper that checks sfxEnabled then calls fn
  function _guard(fn) {
    return () => { if (!_sfxEnabled) return; _ensure(); fn(); };
  }

  // ── Sound Effects ─────────────────────────────────────────────────────────
  const sfx = {

    // ── Pong ──────────────────────────────────────────────────────────────
    pong: {
      paddleHit:   _guard(() => _osc('square',   220, 180,  0.07, 0.4)),
      wallBounce:  _guard(() => _osc('square',   440, 380,  0.05, 0.3)),
      playerScore: _guard(() => [330,440,550].forEach((f,i) => _osc('sine', f, f, 0.06, 0.35, i*0.06))),
      aiScore:     _guard(() => [330,220,110].forEach((f,i) => _osc('sine', f, f, 0.08, 0.30, i*0.08))),
      win:         _guard(() => [440,550,660,880].forEach((f,i) => _osc('sine', f, f, i===3?0.4:0.1, 0.4, i*0.1))),
      lose:        _guard(() => _osc('sawtooth', 220,  80,  0.5,  0.3)),
    },

    // ── Breakout ──────────────────────────────────────────────────────────
    breakout: {
      launch:    _guard(() => _osc('sine',     200, 600, 0.15, 0.3)),
      paddleHit: _guard(() => _osc('square',   280, 220, 0.05, 0.35)),
      brickHit(row) {
        if (!_sfxEnabled) return; _ensure();
        // row 0 (top) = 760Hz, row 7 (bottom) = 200Hz
        const f = 200 + (7 - (row || 0)) * 80;
        _osc('triangle', f, f * 0.85, 0.09, 0.3);
      },
      wallBounce:    _guard(() => _osc('square',   440, 380, 0.05, 0.3)),
      lifeLost:      _guard(() => _osc('sawtooth', 440, 110, 0.4,  0.35)),
      levelComplete: _guard(() => [261,329,392,523].forEach((f,i) => _osc('sine', f, f, 0.08, 0.35, i*0.08))),
      win:  _guard(() => [440,550,660,880].forEach((f,i) => _osc('sine', f, f, i===3?0.4:0.1, 0.4, i*0.1))),
      lose: _guard(() => _osc('sawtooth', 220, 80, 0.5, 0.3)),
    },

    // ── Snake ─────────────────────────────────────────────────────────────
    snake: {
      eatFood() {
        if (!_sfxEnabled) return; _ensure();
        const f = Math.min(300 + _snakeFoodCount * 40, 1200);
        _snakeFoodCount++;
        _osc('sine', f, f, 0.12, 0.4);
      },
      death:     _guard(() => [440,330,220].forEach(f => _osc('triangle', f, 55, 0.5, 0.25))),
      dirChange: _guard(() => _osc('square', 880, 880, 0.02, 0.08)),
    },

    // ── Frogger ───────────────────────────────────────────────────────────
    frogger: {
      hop:        _guard(() => _osc('sine', 300, 450, 0.08, 0.25)),
      carDeath:   _guard(() => _noise(0.3, 'lowpass',  800,  1.5, 0.35, 0.5)),
      waterDeath: _guard(() => _noise(0.4, 'bandpass', 2000, 2.0, 0.4,  0.4)),
      trainWarning() {
        if (!_sfxEnabled) return; _ensure();
        const now = _ctx.currentTime;
        if (now - _lastHornTime < 0.4) return;
        _lastHornTime = now;
        _osc('sawtooth', 233, 233, 0.18, 0.4);
      },
      trainHit: _guard(() => {
        _noise(0.5, 'lowpass', 400, 1, 0.6, 0.6);
        _osc('sawtooth', 200, 60, 0.4, 0.4);
      }),
      gameOver: _guard(() => _osc('sawtooth', 220, 80, 0.5, 0.3)),
    },

    // ── Space Raiders ─────────────────────────────────────────────────────
    invaders: {
      laser: _guard(() => _expOsc('square', 880, 220, 0.12, 0.3)),
      asteroidHit(size) {
        if (!_sfxEnabled) return; _ensure();
        if      (size === 'large')  _osc('sawtooth', 120,  60,  0.25, 0.45);
        else if (size === 'medium') _osc('sawtooth', 200,  100, 0.15, 0.35);
        else                        _osc('triangle', 350,  200, 0.08, 0.25);
      },
      shipHit: _guard(() => {
        _osc('sine',   660, 660, 0.3, 0.3);
        _osc('square', 440, 440, 0.3, 0.3);
      }),
      levelUp:  _guard(() => [440,554,659,880].forEach((f,i) => _osc('sine', f, f, 0.07, 0.4, i*0.07))),
      gameOver: _guard(() => _osc('sawtooth', 220, 80, 0.5, 0.3)),
    },

    // ── Ape Climb ─────────────────────────────────────────────────────────
    apeclimb: {
      jump:  _guard(() => _osc('square',   300, 500, 0.1,  0.25)),
      land:  _guard(() => _osc('triangle',  80,  40, 0.08, 0.35)),
      barrelHitDeath: _guard(() => {
        _noise(0.2, 'lowpass', 600, 1, 0.2, 0.5);
        _osc('sawtooth', 180, 60, 0.4, 0.4);
      }),
      dodgeScore:   _guard(() => _osc('sine', 880, 880, 0.06, 0.25)),
      malletPickup: _guard(() => [440,660,880].forEach((f,i) => _osc('sine', f, f, 0.06, 0.35, i*0.06))),
      malletSwing:  _guard(() => _noise(0.15, 'highpass', 3000, 1, 0.2, 0.3)),
      barrelDestroy: _guard(() => {
        _osc('sawtooth', 200, 80, 0.12, 0.4);
        _noise(0.1, 'lowpass', 1000, 1, 0.1, 0.3);
      }),
      win: _guard(() => [440,550,660,880,660,880,1100].forEach((f,i) =>
        _osc('sine', f, f, i===6?0.4:0.09, 0.4, i*0.09)
      )),
    },
  };

  // ── Music sequences ───────────────────────────────────────────────────────
  // Each note: { f: Hz, d: seconds }. f=0 = rest.
  const _SEQS = {
    lobby: (() => {
      const e = 60/140/2, q = e*2;
      return [
        {f:523,d:e},{f:659,d:e},{f:784,d:e},{f:1047,d:q},
        {f:0,d:e},  {f:784,d:e},{f:659,d:e},{f:523,d:q},
        {f:440,d:e},{f:523,d:e},{f:659,d:e},{f:784,d:q},
        {f:0,d:q},  {f:523,d:q},
        {f:659,d:e},{f:523,d:e},{f:392,d:e},{f:523,d:e},
        {f:659,d:q},{f:784,d:e},{f:659,d:e},
        {f:523,d:q},{f:392,d:e},{f:261,d:e},
        {f:0,d:q},  {f:0,d:q},
      ];
    })(),
    pong: (() => {
      const q = 60/100, h = q*2;
      return [
        {f:220,d:q},{f:0,d:q},{f:330,d:q},{f:0,d:q},
        {f:220,d:q},{f:0,d:h},{f:330,d:q},
        {f:293,d:q},{f:0,d:q},{f:220,d:q},{f:0,d:q},
        {f:0,d:h},  {f:220,d:h},
      ];
    })(),
    breakout: (() => {
      const e = 60/160/2, q = e*2;
      return [
        {f:523,d:e},{f:659,d:e},{f:784,d:e},{f:659,d:e},
        {f:523,d:e},{f:392,d:e},{f:329,d:e},{f:261,d:e},
        {f:261,d:e},{f:329,d:e},{f:392,d:e},{f:523,d:e},
        {f:659,d:e},{f:784,d:e},{f:880,d:e},{f:784,d:e},
        {f:659,d:e},{f:523,d:e},{f:659,d:e},{f:784,d:e},
        {f:523,d:q},{f:0,d:e},  {f:523,d:e},
        {f:659,d:e},{f:784,d:e},{f:659,d:e},{f:523,d:e},
        {f:392,d:q},{f:0,d:q},
      ];
    })(),
    snake: (() => {
      const q = 60/120, h = q*2;
      return [
        {f:220,d:q},{f:246,d:q},{f:261,d:q},{f:293,d:q},
        {f:329,d:q},{f:349,d:q},{f:392,d:h},
        {f:0,d:q},  {f:392,d:q},{f:349,d:q},{f:329,d:q},
        {f:293,d:q},{f:261,d:q},{f:246,d:h},
        {f:220,d:h},{f:0,d:h},
      ];
    })(),
    frogger: (() => {
      const e = 60/130/2, q = e*2;
      return [
        {f:392,d:e},{f:587,d:e},{f:493,d:e},{f:392,d:e},
        {f:659,d:e},{f:587,d:e},{f:493,d:e},{f:392,d:e},
        {f:440,d:e},{f:659,d:e},{f:587,d:e},{f:440,d:e},
        {f:392,d:e},{f:493,d:e},{f:587,d:e},{f:784,d:e},
        {f:784,d:e},{f:659,d:e},{f:587,d:e},{f:493,d:e},
        {f:392,d:q},{f:0,d:e},  {f:392,d:e},
        {f:493,d:e},{f:587,d:e},{f:493,d:e},{f:392,d:e},
        {f:0,d:q},  {f:0,d:q},
      ];
    })(),
    invaders: (() => {
      const e = 60/150/2, q = e*2;
      return [
        {f:329,d:e},{f:392,d:e},{f:440,d:e},{f:493,d:e},
        {f:587,d:e},{f:493,d:e},{f:440,d:e},{f:392,d:e},
        {f:329,d:q},{f:0,d:e},  {f:329,d:e},
        {f:440,d:e},{f:493,d:e},{f:587,d:e},{f:659,d:e},
        {f:587,d:e},{f:493,d:e},{f:440,d:e},{f:329,d:e},
        {f:293,d:q},{f:0,d:e},  {f:329,d:e},
        {f:392,d:e},{f:329,d:e},{f:293,d:e},{f:261,d:e},
        {f:246,d:q},{f:0,d:q},
      ];
    })(),
    apeclimb: (() => {
      const q = 60/120, e = q/2, h = q*2;
      return [
        {f:261,d:q},{f:392,d:q},{f:329,d:q},{f:523,d:q},
        {f:392,d:q},{f:329,d:q},{f:261,d:h},
        {f:0,d:q},  {f:196,d:q},{f:261,d:q},{f:329,d:q},
        {f:392,d:h},{f:0,d:h},
        {f:523,d:q},{f:392,d:q},{f:329,d:q},{f:261,d:q},
        {f:392,d:q},{f:261,d:h},{f:0,d:q},
      ];
    })(),
  };

  function _playNote(note, time, type) {
    if (note.f === 0) return;
    const o = _ctx.createOscillator();
    const g = _ctx.createGain();
    o.type = type;
    o.frequency.value = note.f;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.8, time + 0.005);
    g.gain.linearRampToValueAtTime(0, time + note.d * 0.85);
    o.connect(g); g.connect(_musicG);
    o.start(time); o.stop(time + note.d + 0.02);
    o.onended = () => o.disconnect();
  }

  function _startEngine(name) {
    const seq = _SEQS[name];
    if (!seq) return null;
    const type = (name === 'breakout' || name === 'apeclimb') ? 'triangle' : 'square';
    const eng = { _step: 0, _nextTime: _ctx.currentTime + 0.05, _stopped: false, _id: null };
    function tick() {
      if (eng._stopped) return;
      while (eng._nextTime < _ctx.currentTime + 0.25) {
        _playNote(seq[eng._step], eng._nextTime, type);
        eng._nextTime += seq[eng._step].d;
        eng._step = (eng._step + 1) % seq.length;
      }
      eng._id = setTimeout(tick, 50);
    }
    eng.stop = () => { eng._stopped = true; clearTimeout(eng._id); };
    tick();
    return eng;
  }

  // ── Music API ─────────────────────────────────────────────────────────────
  const music = {
    play(name) {
      _currentMusicName = name;
      if (_musicEngine) { _musicEngine.stop(); _musicEngine = null; }
      if (!_musicEnabled) return;
      _ensure();
      _musicEngine = _startEngine(name);
    },
    stop() {
      _currentMusicName = null;
      if (_musicEngine) { _musicEngine.stop(); _musicEngine = null; }
    },
  };

  // ── Toggle helpers ────────────────────────────────────────────────────────
  function setSfx(val) {
    _sfxEnabled = val;
    localStorage.setItem('arcade_sfx', String(val));
    if (_ctx && _sfxG) _sfxG.gain.setTargetAtTime(val ? 0.6 : 0, _ctx.currentTime, 0.05);
  }

  function setMusic(val) {
    _musicEnabled = val;
    localStorage.setItem('arcade_music', String(val));
    if (!val) {
      if (_ctx && _musicG) _musicG.gain.setTargetAtTime(0, _ctx.currentTime, 0.05);
      if (_musicEngine) { _musicEngine.stop(); _musicEngine = null; }
    } else {
      _ensure();
      _musicG.gain.setTargetAtTime(0.25, _ctx.currentTime, 0.05);
      if (_currentMusicName && !_musicEngine) _musicEngine = _startEngine(_currentMusicName);
    }
  }

  function resetFoodPitch() { _snakeFoodCount = 0; }

  // ── Button injection ──────────────────────────────────────────────────────
  function _injectButtons() {
    const s = document.createElement('style');
    s.textContent = `
      #arc-btns{position:fixed;bottom:12px;right:12px;display:flex;gap:6px;z-index:9999;}
      .arc-btn{background:#000814;border:1px solid #1e3a5f;color:#1e3a5f;
        font:bold 10px "Courier New",monospace;padding:5px 8px;cursor:pointer;
        letter-spacing:.05em;text-transform:uppercase;border-radius:3px;
        transition:border-color .15s,color .15s,box-shadow .15s;user-select:none;}
      .arc-btn.active{border-color:#00f5ff;color:#00f5ff;box-shadow:0 0 8px rgba(0,245,255,.4);}
      .arc-btn:hover{border-color:#ffe600;color:#ffe600;box-shadow:0 0 8px rgba(255,230,0,.3);}
    `;
    document.head.appendChild(s);

    const wrap = document.createElement('div');
    wrap.id = 'arc-btns';

    function mkBtn(label, isActive, toggle) {
      const b = document.createElement('button');
      b.className = 'arc-btn' + (isActive ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        toggle();
        b.classList.toggle('active', label === 'SFX' ? _sfxEnabled : _musicEnabled);
      });
      return b;
    }

    wrap.appendChild(mkBtn('SFX', _sfxEnabled, () => setSfx(!_sfxEnabled)));
    wrap.appendChild(mkBtn('MUS', _musicEnabled, () => setMusic(!_musicEnabled)));
    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _injectButtons);
  else _injectButtons();

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    sfx,
    music,
    setSfx,
    setMusic,
    sfxEnabled:   () => _sfxEnabled,
    musicEnabled: () => _musicEnabled,
    resetFoodPitch,
  };
})();
