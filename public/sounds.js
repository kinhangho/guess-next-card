// ── Procedural sound effects via Web Audio API ───────────────────────────────
// All sounds generated on-the-fly — no asset files, works fully offline.
const AUDIO = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Short papery card whoosh (white noise + bandpass sweep, 80ms)
  function cardFlip() {
    const c = getCtx(), t = c.currentTime;
    const len = Math.floor(c.sampleRate * 0.08);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const src = c.createBufferSource();
    src.buffer = buf;

    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(4000, t);
    filt.frequency.exponentialRampToValueAtTime(1000, t + 0.07);
    filt.Q.value = 1.5;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    src.connect(filt); filt.connect(gain); gain.connect(c.destination);
    src.start(t);
  }

  // Ascending triple ding — C5 → E5 → G5 (523 → 659 → 784 Hz)
  function correct() {
    const c = getCtx(), t = c.currentTime;
    [[523, 0], [659, 0.1], [784, 0.2]].forEach(([freq, delay]) => {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.22, t + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.22);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(t + delay); osc.stop(t + delay + 0.23);
    });
  }

  // Descending sawtooth buzzer — classic game-show wrong sound
  function wrong() {
    const c = getCtx(), t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(85, t + 0.35);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.setValueAtTime(0.28, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(t); osc.stop(t + 0.36);
  }

  // Two sharp rising stabs — dramatic "DUN DUN" challenge sting
  function challenge() {
    const c = getCtx(), t = c.currentTime;
    [[150, 520, 0], [200, 780, 0.14]].forEach(([f0, f1, delay]) => {
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f0, t + delay);
      osc.frequency.exponentialRampToValueAtTime(f1, t + delay + 0.09);
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.16, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.14);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(t + delay); osc.stop(t + delay + 0.15);
    });
  }

  return { cardFlip, correct, wrong, challenge };
})();
