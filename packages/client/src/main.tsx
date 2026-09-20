import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { connect } from './net/client';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Falta el contenedor #app');

connect();
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
