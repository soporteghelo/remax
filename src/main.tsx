import { createRoot } from 'react-dom/client';
import App from './App';
// Orden: estilos heredados de los módulos → tokens del sistema de diseño →
// estructura persistente. Lo último gana ante declaraciones en conflicto.
import './styles.css';
import './password.css';
import './design-system.css';
import './shell.css';
import './admin-compact.css';
import './detail-compact.css';
import './edit-compact.css';
import './sync-control.css';
import './desktop-layout.css';
import './crm.css';
import './reschedule.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('No se pudo registrar el service worker de la PWA.', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <App />,
);
