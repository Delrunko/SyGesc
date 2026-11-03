import { useState } from 'react'
import { applyTheme, getInitialTheme } from '../theme.js'

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme)

  const basculer = () => {
    const suivant = theme === 'dark' ? 'light' : 'dark'
    applyTheme(suivant)
    setTheme(suivant)
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={basculer}
      aria-label={theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre'}
      aria-pressed={theme === 'dark'}
      title={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
    >
      {theme === 'dark' ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
        </svg>
      )}
      <span>{theme === 'dark' ? 'Clair' : 'Sombre'}</span>
    </button>
  )
}
