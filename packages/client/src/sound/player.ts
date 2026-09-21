/*
 * Los sonidos se fabrican aquí mismo, con el sintetizador del navegador: ni un
 * fichero de audio, ni una descarga, ni una licencia de nadie. Un volteo es un
 * golpe de ruido filtrado (el roce del papel) y, un poco después, otro más
 * sordo y grave: la carta cayendo en la mesa. Lo demás son notas cortas.
 *
 * Para cambiar cómo suena, basta con mover los números de CUES.
 */

import { loadSound, saveSound } from '../net/storage';

export type Sound = 'flip' | 'back' | 'trio' | 'miss' | 'collect' | 'turn' | 'deal' | 'win' | 'join';

/** Cada volteo suena distinto: si no, se nota la máquina. */
const vary = (value: number, amount: number): number => value * (1 + (Math.random() * 2 - 1) * amount);

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = loadSound();

type Ctor = typeof AudioContext;

/** El contexto se crea con el primer gesto: los navegadores no dejan antes. */
function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null;
  const Available: Ctor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Available) return null;

  if (!context) {
    context = new Available();
    master = context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
    // Un segundo de ruido blanco, del que cada golpe toma un trozo.
    noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

/** Un golpe seco de ruido: el roce de la carta. */
function flick(at: number, freq: number, decay: number, gain: number, floor = 700): void {
  const ctx = context;
  if (!ctx || !noise || !master) return;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.playbackRate.value = vary(1, 0.2);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = freq;
  band.Q.value = 0.7;
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = floor;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  source.connect(band).connect(high).connect(env).connect(master);
  source.start(at, Math.random() * 0.5, decay + 0.05);
}

/** La carta al posarse: grave y corto. */
function thud(at: number, gain: number): void {
  const ctx = context;
  if (!ctx || !noise || !master) return;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = vary(420, 0.15);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
  source.connect(low).connect(env).connect(master);
  source.start(at, Math.random() * 0.5, 0.15);
}

/** Una nota, para lo que no es una carta: trío, fallo, tu turno, victoria. */
function tone(at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'triangle'): void {
  const ctx = context;
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(env).connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Un barrido de ruido: las cartas que se recogen o el brillo del final. */
function sweep(at: number, from: number, to: number, dur: number, gain: number): void {
  const ctx = context;
  if (!ctx || !noise || !master) return;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.2;
  band.frequency.setValueAtTime(from, at);
  band.frequency.exponentialRampToValueAtTime(to, at + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.03);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  source.connect(band).connect(env).connect(master);
  source.start(at, Math.random() * 0.5, dur + 0.05);
}

/** Qué suena en cada caso. `count` son cartas: volteos seguidos. */
const CUES: Record<Sound, (at: number, count: number) => void> = {
  // Voltear: el roce y, a media vuelta, la carta posándose.
  flip: (at) => {
    flick(at, vary(2400, 0.15), 0.08, 0.3);
    thud(at + 0.3, 0.16);
  },
  // Volver boca abajo: lo mismo, más sordo, y en el orden en que se voltearon.
  back: (at, count) => {
    for (let i = 0; i < count; i++) {
      const when = at + i * 0.09;
      flick(when, vary(1500, 0.15), 0.06, 0.2, 400);
      thud(when + 0.28, 0.12);
    }
  },
  trio: (at) => {
    [784, 988, 1319].forEach((freq, i) => tone(at + i * 0.07, freq, 0.24, 0.15));
  },
  miss: (at) => {
    thud(at, 0.16);
    tone(at, 262, 0.16, 0.1, 'sine');
    tone(at + 0.1, 196, 0.24, 0.09, 'sine');
  },
  collect: (at) => sweep(at, 2600, 700, 0.24, 0.18),
  turn: (at) => {
    tone(at, 659, 0.1, 0.1);
    tone(at + 0.09, 880, 0.18, 0.1);
  },
  // El reparto, al empezar: una carta detrás de otra.
  deal: (at, count) => {
    for (let i = 0; i < count; i++) flick(at + i * 0.06, vary(2200, 0.2), 0.055, 0.16);
  },
  win: (at) => {
    [523, 659, 784, 1047].forEach((freq, i) => tone(at + i * 0.09, freq, 0.32, 0.15));
    sweep(at + 0.12, 1200, 4200, 0.5, 0.07);
  },
  join: (at) => tone(at, 880, 0.12, 0.09),
};

/** El trío y el fallo esperan a que la carta se pose: primero cae, luego se sabe. */
const OFFSET: Record<Sound, number> = {
  flip: 0,
  back: 0,
  trio: 0.3,
  miss: 0.3,
  collect: 0,
  turn: 0,
  deal: 0,
  win: 0,
  join: 0,
};

/** Suena, si hay sonido. Nunca revienta: sin audio, no hace nada. */
export function play(sound: Sound, count = 1, delay = 0): void {
  const ctx = audio();
  if (!ctx) return;
  try {
    CUES[sound](ctx.currentTime + 0.01 + OFFSET[sound] + delay, count);
  } catch {
    // Un sonido que falla no puede estropear una partida.
  }
}

export const soundEnabled = (): boolean => enabled;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  saveSound(on);
  if (!on && master) master.gain.value = 0;
  if (on && master) master.gain.value = 0.5;
  if (on) play('join');
}

/**
 * El navegador no deja crear el audio hasta que alguien toca la pantalla, así
 * que se prepara con el primer gesto y no se vuelve a mirar.
 */
export function wakeSoundOnFirstGesture(): void {
  if (typeof window === 'undefined') return;
  const wake = () => {
    audio();
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
  };
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
}
