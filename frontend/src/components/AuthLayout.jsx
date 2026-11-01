import { motion } from 'motion/react'
import { LuArrowLeft } from 'react-icons/lu'
import { Button, Logo } from './ui'
import useThemeClass from '../hooks/useThemeClass'

const EASE = [0.22, 1, 0.36, 1]

// Sign in / sign up layout: form on the left, framed photo panel on the right.
const AuthLayout = ({ title, subtitle, image, imageAlt, quote, floating, footer, children }) => {
  useThemeClass()
  return (
  <div className="min-h-dvh bg-white dark:bg-zinc-950 lg:grid lg:grid-cols-[1fr_1.05fr] lg:p-3">
    {/* Form side */}
    <main className="relative flex min-h-dvh flex-col lg:min-h-0">

      <header className="relative flex items-center justify-between px-4 py-4 sm:px-10 sm:py-6">
        <Logo />
        <Button variant="secondary" size="sm" to="/home" leftIcon={LuArrowLeft} className="rounded-full px-3 sm:px-3.5 text-xs sm:text-sm">
          Home
        </Button>
      </header>

      <div className="relative flex flex-1 items-center justify-center px-4 pb-12 pt-2 sm:px-10 sm:pb-16 sm:pt-4">
        <motion.div
          className="w-full max-w-[420px]"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">{title}</h1>
          <p className="mt-2.5 sm:mt-3 text-sm sm:text-[15px] text-slate-500 dark:text-slate-400">{subtitle}</p>
          <div className="mt-8 sm:mt-10">{children}</div>
          {footer && <p className="mt-8 sm:mt-10 text-center text-sm text-slate-500 dark:text-slate-400">{footer}</p>}
        </motion.div>
      </div>
    </main>

    {/* Photo side */}
    <aside className="relative hidden overflow-hidden rounded-[1.75rem] lg:block">
      <motion.img
        src={image}
        alt={imageAlt}
        initial={{ scale: 1.08 }}
        animate={{ scale: 1 }}
        transition={{ duration: 1.4, ease: EASE }}
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 bg-linear-to-t from-slate-950/90 via-slate-950/25 to-indigo-950/30" />

      <div className="absolute inset-0 p-10">{floating}</div>

      <motion.div
        className="absolute inset-x-0 bottom-0 p-10 xl:p-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3, ease: EASE }}
      >
        {quote}
      </motion.div>
    </aside>
  </div>
  )
}

// Small glass card that floats in and bobs gently.
export const FloatCard = ({ className = '', delay = 0, children }) => (
  <motion.div
    className={`absolute ${className}`}
    initial={{ opacity: 0, y: 20, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.7, delay, ease: EASE }}
  >
    <div className="float-bob" style={{ animationDelay: `${delay}s` }}>
      {children}
    </div>
  </motion.div>
)

export default AuthLayout
