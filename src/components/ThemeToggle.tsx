'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from '@phosphor-icons/react/dist/ssr'

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const theme = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldBeDark = theme === 'dark' || (!theme && prefersDark)
    
    setIsDark(shouldBeDark)
    if (shouldBeDark) {
      document.documentElement.classList.add('dark')
    }
  }, [])

  const toggleTheme = () => {
    const newIsDark = !isDark
    setIsDark(newIsDark)
    
    if (newIsDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  if (!mounted) {
    return (
      <div className="w-10 h-10 rounded-md border border-border dark:border-[#2A2A2A]" />
    )
  }

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-md border border-border dark:border-[#2A2A2A] bg-surface dark:bg-[#1A1A1A] hover:bg-canvas dark:hover:bg-[#2A2A2A] transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-charcoal dark:focus:ring-[#E5E5E5] focus:ring-offset-2"
      aria-label="Toggle theme"
    >
      {isDark ? (
        <Sun weight="bold" className="w-5 h-5 text-[#E5E5E5]" />
      ) : (
        <Moon weight="bold" className="w-5 h-5 text-charcoal" />
      )}
    </button>
  )
}
