import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import PwaManager from './components/PwaManager.jsx'
import { applyTheme, getInitialTheme } from './theme.js'
import './styles.css'

applyTheme(getInitialTheme())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <>
      <App />
      <PwaManager />
    </>
  </React.StrictMode>
)
