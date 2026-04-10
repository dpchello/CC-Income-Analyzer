import { createContext, useContext, useState, useEffect } from 'react'

// 'dark' | 'light' | 'system'
const ThemeContext = createContext({ theme: 'system', setTheme: () => {} })

function resolveSystemTheme() {
  const hour = new Date().getHours()
  // Light between 7 AM and 7 PM, dark otherwise
  return hour >= 7 && hour < 19 ? 'light' : 'dark'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('harvest-theme') || 'system'
  })

  useEffect(() => {
    localStorage.setItem('harvest-theme', theme)
    const resolved = theme === 'system' ? resolveSystemTheme() : theme
    const root = document.documentElement
    if (resolved === 'light') {
      root.classList.add('light')
      root.classList.remove('dark')
    } else {
      root.classList.add('dark')
      root.classList.remove('light')
    }
  }, [theme])

  // Re-evaluate system theme every minute in case the hour crosses 7am/7pm
  useEffect(() => {
    if (theme !== 'system') return
    const interval = setInterval(() => {
      const resolved = resolveSystemTheme()
      const root = document.documentElement
      if (resolved === 'light') {
        root.classList.add('light')
        root.classList.remove('dark')
      } else {
        root.classList.add('dark')
        root.classList.remove('light')
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
