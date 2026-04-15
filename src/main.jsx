import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'  // ← Must import App, not AutoInsuranceLanding
import './index.css'
import './styles/animations.css'
import { logWebVitals } from './lib/performance'
import { ThemeProvider } from './contexts/ThemeContext'

// Initialize performance monitoring
if (typeof window !== 'undefined') {
  logWebVitals();
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)