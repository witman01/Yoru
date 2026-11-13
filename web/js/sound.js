// Real instruments, recorded: a koto performance and a shakuhachi honkyoku
// piece, played one after the other with soft fades. Credits in index.html.
const TRACKS = [
  { src: 'audio/koto-performance.ogg', volume: 0.5 },
  { src: 'audio/shika-no-tone-shakuhachi.ogg', volume: 0.65 },
];

let on = false;
let index = 0;
let audio = null;
let fadeTimer = null;

function fade(el, to, ms, done) {
  clearInterval(fadeTimer);
  const from = el.volume;
  const start = performance.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - start) / ms);
    el.volume = from + (to - from) * k;
    if (k >= 1) {
      clearInterval(fadeTimer);
      done?.();
    }
  }, 50);
}

function play(i) {
  const track = TRACKS[i % TRACKS.length];
  audio = new Audio(track.src);
  audio.volume = 0;
  audio.addEventListener('ended', () => {
    if (!on) return;
    // A breath of silence between pieces.
    setTimeout(() => on && play(++index), 2500);
  });
  audio.play().then(() => fade(audio, track.volume, 2500));
}

export async function startSound() {
  on = true;
  if (audio && !audio.ended) {
    await audio.play();
    fade(audio, TRACKS[index % TRACKS.length].volume, 1500);
  } else {
    play(index);
  }
}

export function stopSound() {
  on = false;
  if (audio) fade(audio, 0, 800, () => audio.pause());
}

export const soundOn = () => on;
