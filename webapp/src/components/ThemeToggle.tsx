import { AnimatePresence, motion } from 'motion/react'
import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { getTheme, setTheme, type Theme } from '@/lib/theme'
import { Button } from './ui/Button'

const swap = { type: 'spring', duration: 0.3, bounce: 0 } as const

export function ThemeToggle() {
  const [theme, set] = useState<Theme>(getTheme)
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  return (
    <Button
      variant="ghost"
      className="size-9 px-0"
      aria-label={`Switch to ${next} theme`}
      onClick={() => {
        setTheme(next)
        set(next)
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={theme}
          initial={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
          transition={swap}
          className="grid place-items-center"
        >
          {theme === 'dark' ? <Moon size={16} strokeWidth={1.75} /> : <Sun size={16} strokeWidth={1.75} />}
        </motion.span>
      </AnimatePresence>
    </Button>
  )
}
