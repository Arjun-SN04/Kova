import { useId } from 'react'
import { Link } from 'react-router-dom'

// Brand mark: same design as public/favicon.svg
export const LogoMark = ({ className = 'size-8' }) => {
  const id = useId()
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <path
        d="M10.5 8.5h11a3.5 3.5 0 0 1 3.5 3.5v6a3.5 3.5 0 0 1-3.5 3.5H16l-4.5 3.5v-3.5h-1A3.5 3.5 0 0 1 7 18v-6a3.5 3.5 0 0 1 3.5-3.5z"
        fill="#fff"
      />
      {/* Dots do a small "typing" wave on load and while hovered (see .logo-dot in index.css) */}
      <g className="logo-bubble">
        <circle className="logo-dot" cx="12.5" cy="15" r="1.4" fill="#6d28d9" />
        <circle className="logo-dot" cx="16" cy="15" r="1.4" fill="#6d28d9" />
        <circle className="logo-dot" cx="19.5" cy="15" r="1.4" fill="#6d28d9" />
      </g>
    </svg>
  )
}

const Logo = ({ to = '/home', dark = false, className = '' }) => (
  <Link to={to} className={`group inline-flex items-center gap-2.5 ${className}`} aria-label="Kova home">
    <LogoMark className="size-8 transition-transform duration-200 group-hover:scale-105" />
    <span className={`text-[17px] font-semibold tracking-tight ${dark ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
      Kova
    </span>
  </Link>
)

export default Logo
