'use client'

import { CheckCircle } from '@phosphor-icons/react/dist/ssr'
import { motion } from 'motion/react'
// haha
export function SuccessNotification() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{
        duration: 0.4,
        ease: [0.16, 1, 0.3, 1]
      }}
      className="fixed top-6 right-6 z-50 bg-pale-green dark:bg-[#4CAF50]/20 border border-pale-green-text dark:border-[#4CAF50] rounded-lg shadow-sm max-w-sm"
    >
      <div className="flex items-start gap-3 p-5">
        <CheckCircle weight="fill" className="w-5 h-5 text-pale-green-text dark:text-[#4CAF50] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-pale-green-text dark:text-[#4CAF50]">
            Player Registered Successfully
          </p>
          <p className="text-xs text-pale-green-text/80 dark:text-[#4CAF50]/80 mt-1">
            Account details have been saved to the database
          </p>
        </div>
      </div>
    </motion.div>
  )
}
