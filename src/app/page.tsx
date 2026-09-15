import { PlayerRegistrationForm } from '@/components/PlayerRegistrationForm'
import Image from 'next/image'
import logo from '@/public/logo.png'

export default function Home() {
  return (
    <main className="min-h-dvh bg-[#0B0B0B]">
      {/* Header */}
      <header className="border-b border-[#2A2A2A] bg-[#161616]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center gap-4">
          <Image
            src={logo}
            alt="Kings Fortune Hub Logo"
            width={56}
            height={56}
            priority
            className="h-14 w-14 shrink-0 object-contain drop-shadow-[0_0_12px_rgba(212,175,55,0.35)]"
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#D4AF37]">
              Kings Fortune Hub
            </h1>
            <p className="text-sm text-[#888] mt-0.5">
              Player Account Management
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <PlayerRegistrationForm />
      </div>

      {/* Footer */}
      <footer className="border-t border-[#2A2A2A] mt-24">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <p className="text-sm text-[#666] text-center">
            Database interface for 12 sweepstakes gaming platforms
          </p>
        </div>
      </footer>
    </main>
  )
}
