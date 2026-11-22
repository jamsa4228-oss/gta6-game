// Synthesized sound for SOLMAR BAY: no audio files, everything is WebAudio.
// Engine hum, police sirens, gunshots, punches, pickup jingles and UI clicks.
// Every call is safe when audio is unavailable (headless, muted, no gesture yet):
// it just does nothing instead of throwing.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engine = null;
  let siren = null;

  /** Create (or resume) the context. Call from a user gesture; returns false when unavailable. */
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, seconds, type, gainValue, when = 0) {
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t = ctx.currentTime + when;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(gainValue, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + seconds + 0.05);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function burst(seconds, filterFreq, gainValue) {
    if (!ctx) return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(seconds);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(gainValue, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(t);
      source.stop(t + seconds + 0.05);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    ensure,
    /** The engine loop: call every frame with speed 0..1 and whether the player is driving. */
    setEngine(speedNorm, driving) {
      if (!ctx) return;
      try {
        if (!engine) {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          const sub = ctx.createOscillator();
          sub.type = 'sine';
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 900;
          const gain = ctx.createGain();
          gain.gain.value = 0;
          osc.connect(filter);
          sub.connect(filter);
          filter.connect(gain);
          gain.connect(master);
          osc.start();
          sub.start();
          engine = { osc, sub, gain };
        }
        const t = ctx.currentTime;
        const target = driving ? 0.05 + speedNorm * 0.07 : 0;
        engine.gain.gain.setTargetAtTime(target, t, 0.08);
        engine.osc.frequency.setTargetAtTime(55 + speedNorm * 150, t, 0.08);
        engine.sub.frequency.setTargetAtTime(28 + speedNorm * 70, t, 0.08);
      } catch {
        // Sound is garnish: never let it break the game.
      }
    },
    /** The two-tone police siren: on while the player is wanted. */
    siren(on) {
      if (!ctx) return;
      try {
        if (on && !siren) {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = 750;
          const lfo = ctx.createOscillator();
          lfo.type = 'square';
          lfo.frequency.value = 0.55;
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = 220;
          lfo.connect(lfoGain);
          lfoGain.connect(osc.frequency);
          const gain = ctx.createGain();
          gain.gain.value = 0.035;
          osc.connect(gain);
          gain.connect(master);
          osc.start();
          lfo.start();
          siren = { osc, lfo, gain };
        } else if (!on && siren) {
          const old = siren;
          siren = null;
          old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
          window.setTimeout(() => {
            try {
              old.osc.stop();
              old.lfo.stop();
            } catch {
              // Already stopped.
            }
          }, 300);
        }
      } catch {
        // Sound is garnish: never let it break the game.
      }
    },
    shot() {
      if (!ctx) return;
      burst(0.14, 1600, 0.5);
      blip(95, 0.1, 'sine', 0.4);
    },
    thud() {
      if (!ctx) return;
      burst(0.12, 320, 0.4);
    },
    jingle() {
      if (!ctx) return;
      blip(523, 0.16, 'sine', 0.25, 0);
      blip(659, 0.16, 'sine', 0.25, 0.09);
      blip(784, 0.24, 'sine', 0.25, 0.18);
    },
    click() {
      if (!ctx) return;
      blip(880, 0.06, 'square', 0.12);
    },
  };
}
