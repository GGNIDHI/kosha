import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Dismiss the splash screen after React finishes its first render
function dismissSplash() {
  const splash = document.getElementById('splash');
  if (splash) {
    // Give the loading bar animation time to finish (1.6s), then fade out
    setTimeout(() => {
      splash.classList.add('hidden');
      // Remove from DOM after transition
      splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    }, 1700);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Call after render is committed
dismissSplash();
