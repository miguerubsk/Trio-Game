import { useSyncExternalStore } from 'react';

/** La mesa de escritorio. Debe coincidir con la media query de styles.css. */
const WIDE = '(min-width: 1100px) and (min-height: 700px)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(WIDE);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

const isWide = (): boolean => window.matchMedia?.(WIDE).matches ?? false;

/** Si la pantalla da para la mesa de escritorio. */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, isWide, () => false);
}
