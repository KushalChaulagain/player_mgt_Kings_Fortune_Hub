import type { Metadata } from 'next'
import './globals.css'
import logo from '@/public/logo.png'

export const metadata: Metadata = {
  title: 'Kings Fortune Hub - Player Management',
  description: 'Intuitive database interface for sweepstakes gaming platform player management',
  icons: {
    icon: [{ url: logo.src, type: 'image/png' }],
    apple: [{ url: logo.src, type: 'image/png' }],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Newsreader:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
