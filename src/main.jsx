import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'  // ← Must import App, not AutoInsuranceLanding
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />  // ← Must render App here
  </React.StrictMode>,
)