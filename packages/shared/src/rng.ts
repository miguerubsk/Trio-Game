/** Fuente de aleatoriedad inyectable: devuelve un número en [0, 1). */
export type Rng = () => number;

/**
 * Generador sembrado (mulberry32). Solo para tests y partidas reproducibles:
 * con 32 bits de semilla se podría reconstruir el reparto a partir de la propia
 * mano, así que el servidor debe inyectar un RNG criptográfico.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates: devuelve una copia barajada. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}
