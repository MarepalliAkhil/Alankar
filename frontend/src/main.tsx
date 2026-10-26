import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './design/index.css';
import { applyTokens } from './design/tokens';

applyTokens();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
