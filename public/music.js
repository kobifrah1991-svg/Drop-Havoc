// 0.16.55 Menu music, made live with Web Audio (no audio files, nothing to license): a dark action loop in A minor,
// 96 BPM - pulsing bass, a soft pad on Am-F-C-G, a muted hi-hat and a short lead hook every other bar.
// Plays only in the menus; fades out when a match starts. Off with the "Music" setting.
const BPM = 96, STEP = 60 / BPM / 2; // eighth notes
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G (MIDI)
const BASS = [45, 41, 36, 43];
const HOOK = [76, 74, 72, 71, 72, 69, null, null];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createMusic(getCtx, getNoise) {
  let out = null, timer = null, nextT = 0, step = 0, playing = false;
  function voice(ac, type, freq, t, dur, vol, cutoff) {
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.04, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function hat(ac, t, vol) {
    const nb = getNoise(); if (!nb) return;
    const s = ac.createBufferSource(); s.buffer = nb; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5, 0.06);
  }
  function kick(ac, t) {
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
  }
  function schedule() {
    const ac = getCtx(); if (!ac || !playing) return;
    while (nextT < ac.currentTime + 0.25) {
      const bar = Math.floor(step / 8) % 4, s8 = step % 8, t = nextT;
      if (s8 === 0) for (const n of CHORDS[bar]) { voice(ac, 'sawtooth', hz(n), t, STEP * 8, 0.035, 900); voice(ac, 'sawtooth', hz(n) * 1.004, t, STEP * 8, 0.03, 700); }
      voice(ac, 'triangle', hz(BASS[bar]), t, STEP * 0.9, s8 % 2 ? 0.12 : 0.2, 500);
      if (s8 === 0 || s8 === 4) kick(ac, t);
      hat(ac, t, s8 % 2 ? 0.05 : 0.025);
      const hookBar = Math.floor(step / 8) % 8 >= 4;
      if (hookBar && HOOK[s8] != null) voice(ac, 'square', hz(HOOK[s8]), t, STEP * 0.8, 0.03, 2400);
      nextT += STEP; step++;
    }
  }
  return {
    start() {
      const ac = getCtx(); if (!ac || playing) return;
      out = ac.createGain(); out.gain.setValueAtTime(0.0001, ac.currentTime); out.gain.exponentialRampToValueAtTime(0.55, ac.currentTime + 1.5); out.connect(ac.destination);
      playing = true; nextT = ac.currentTime + 0.1; step = 0; timer = setInterval(schedule, 60); schedule();
    },
    stop() {
      const ac = getCtx(); if (!playing) return; playing = false; clearInterval(timer);
      const o = out; if (ac && o) { o.gain.cancelScheduledValues(ac.currentTime); o.gain.setValueAtTime(Math.max(0.0001, o.gain.value), ac.currentTime); o.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.8); setTimeout(() => { try { o.disconnect(); } catch { /* gone */ } }, 1000); }
    },
    get playing() { return playing; },
  };
}
