// SOLMAR BAY — synthesized WebAudio: engine, siren, gunshots, pickups, waves.
// No audio files: everything is oscillators and filtered noise.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;

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
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);

      // Engine: two detuned saws through a lowpass, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 82;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();

      // Siren: square wave alternating between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();

      // Waves: looped noise through a lowpass, quiet bed under everything.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const waveSrc = ctx.createBufferSource();
      waveSrc.buffer = buf;
      waveSrc.loop = true;
      const waveFilter = ctx.createBiquadFilter();
      waveFilter.type = 'lowpass';
      waveFilter.frequency.value = 320;
      const waveGain = ctx.createGain();
      waveGain.gain.value = 0.045;
      waveSrc.connect(waveFilter);
      waveFilter.connect(waveGain);
      waveGain.connect(master);
      waveSrc.start();
      return true;
    } catch (err) {
      ctx = null;
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || !master) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + dur + 0.02);
    } catch (err) {
      /* ignore */
    }
  }

  function noiseBurst(dur, vol, freq) {
    if (!ctx || !master) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq || 1800;
      const g = ctx.createGain();
      g.gain.value = vol || 0.4;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
    } catch (err) {
      /* ignore */
    }
  }

  return {
    ensure,
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    engine(speed01, throttle) {
      if (!ctx || !engineOsc) return;
      const t = ctx.currentTime;
      const f = 55 + speed01 * 160 + throttle * 25;
      engineOsc.frequency.setTargetAtTime(f, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(f * 1.5 + 3, t, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06 + throttle * 0.03, t, 0.1);
    },
    engineOff() {
      if (ctx && engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    },
    siren(on, dt) {
      if (!ctx || !sirenOsc) return;
      if (!on) {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      sirenTimer += dt || 0.016;
      if (sirenTimer > 0.42) {
        sirenTimer = 0;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 700, ctx.currentTime, 0.05);
      }
      sirenGain.gain.setTargetAtTime(0.04, ctx.currentTime, 0.1);
    },
    gunshot() {
      noiseBurst(0.16, 0.5, 2400);
      blip(160, 0.1, 'square', 0.15, 60);
    },
    punch() {
      noiseBurst(0.08, 0.25, 900);
    },
    pickup() {
      blip(880, 0.09, 'sine', 0.22);
      setTimeout(() => blip(1318, 0.12, 'sine', 0.22), 90);
    },
    click() {
      blip(660, 0.05, 'square', 0.12);
    },
    mission() {
      blip(523, 0.12, 'sine', 0.2);
      setTimeout(() => blip(784, 0.18, 'sine', 0.2), 120);
    },
    fail() {
      blip(320, 0.25, 'sawtooth', 0.15, 160);
    },
  };
}
