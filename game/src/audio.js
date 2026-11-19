// Every sound is synthesized with WebAudio: no audio files, no network.
// One shared noise buffer, one master gain, short envelopes per effect, plus
// a looping engine hum and a two-tone police siren.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let unlocked = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;

  function ensure() {
    if (ctx) return true;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
    const length = Math.floor(ctx.sampleRate * 0.5);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
  }

  function noise(when, duration, filterType, frequency, gainValue, quality = 1) {
    if (!ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = quality;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(when);
    source.stop(when + duration + 0.05);
  }

  function tone(when, duration, type, fromFreq, toFreq, gainValue) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, when);
    if (toFreq !== fromFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, when + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  return {
    unlock,
    get ready() { return unlocked; },
    shot() {
      if (!ctx) return;
      const t = ctx.currentTime;
      noise(t, 0.14, 'lowpass', 1800, 0.9);
      tone(t, 0.08, 'square', 220, 60, 0.25);
    },
    dryFire() {
      if (!ctx) return;
      tone(ctx.currentTime, 0.05, 'square', 900, 700, 0.12);
    },
    reload() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone(t, 0.05, 'square', 500, 500, 0.12);
      tone(t + 0.12, 0.05, 'square', 700, 700, 0.12);
    },
    pickup() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone(t, 0.09, 'sine', 660, 660, 0.3);
      tone(t + 0.09, 0.14, 'sine', 990, 990, 0.3);
    },
    missionComplete() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.11, 0.22, 'triangle', f, f, 0.3));
    },
    crash() {
      if (!ctx) return;
      const t = ctx.currentTime;
      noise(t, 0.3, 'lowpass', 500, 0.8);
      tone(t, 0.2, 'sine', 120, 40, 0.4);
    },
    thud() {
      if (!ctx) return;
      tone(ctx.currentTime, 0.12, 'sine', 140, 50, 0.35);
    },
    denied() {
      if (!ctx) return;
      tone(ctx.currentTime, 0.12, 'square', 220, 180, 0.15);
    },
    // Engine hum: a sawtooth whose pitch follows speed. Call every frame.
    engine(speedNorm, driving) {
      if (!ctx) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const target = driving ? 0.05 + Math.abs(speedNorm) * 0.11 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + Math.abs(speedNorm) * 130, ctx.currentTime, 0.08);
    },
    // Police siren: two-tone wail while wanted > 0.
    siren(on) {
      if (!ctx) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'sine';
        sirenOsc.frequency.value = 750;
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.06;
        sirenLfo = ctx.createOscillator();
        sirenLfo.type = 'square';
        sirenLfo.frequency.value = 0.7;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 220;
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        sirenLfo.start();
      } else if (!on && sirenOsc) {
        try { sirenOsc.stop(); sirenLfo.stop(); } catch (e) { /* already stopped */ }
        sirenOsc = null;
        sirenLfo = null;
        sirenGain = null;
      }
    },
    step() {
      if (!ctx) return;
      noise(ctx.currentTime, 0.05, 'lowpass', 900, 0.12);
    },
  };
}
