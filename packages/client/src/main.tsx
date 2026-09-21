import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { connect } from './net/client';
import { wakeSoundOnFirstGesture } from './sound/player';
// Fredoka va dentro de la app: el juego no pide nada a servidores de terceros.
import '@fontsource-variable/fredoka/wght.css';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Falta el contenedor #app');

connect();
wakeSoundOnFirstGesture();
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
