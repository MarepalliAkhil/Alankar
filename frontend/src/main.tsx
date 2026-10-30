import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './design/index.css';
import { initialDisplay } from './design/display';
import { applyTokens } from './design/tokens';

applyTokens();
initialDisplay();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
