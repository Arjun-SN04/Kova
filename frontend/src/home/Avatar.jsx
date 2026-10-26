import { useState } from 'react'
import { LuLayers, LuMegaphone, LuSparkles, LuUsers } from 'react-icons/lu'

// Profile photo (or initials on a soft colour picked from the name) plus optional online dot.
const PALETTE = [
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
]

const SIZES = {
  xs: 'size-7 text-[10px]',
  sm: 'size-9 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-20 text-2xl',
}

const DOTS = { xs: 'size-2.5', sm: 'size-3', md: 'size-3', lg: 'size-4' }

const initialsOf = (name = '') =>
  name.split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'

const colorOf = (name = '') => PALETTE[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % PALETTE.length]

const Avatar = ({ name, src, size = 'md', online = false }) => {
  const [failedSrc, setFailedSrc] = useState(null)
  const showPhoto = src && failedSrc !== src
  return (
  <div className="relative shrink-0">
    {showPhoto ? (
      <img
        src={src}
        alt={name || ''}
        loading="lazy"
        onError={() => setFailedSrc(src)}
        className={`${SIZES[size]} rounded-full bg-slate-100 object-cover dark:bg-slate-800`}
      />
    ) : (
      <div className={`flex items-center justify-center rounded-full font-semibold ${SIZES[size]} ${colorOf(name)}`}>
        {initialsOf(name)}
      </div>
    )}
    {online && (
      <span className={`absolute bottom-0 right-0 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950 ${DOTS[size]}`} />
    )}
  </div>
  )
}

const ICON_SIZES = { xs: 'size-3.5', sm: 'size-4', md: 'size-5', lg: 'size-8' }

// Picture for a group (people icon), an announcements group (megaphone) or a
// community (stacked squares, in a rounded square so it stands out from groups).
export const GroupAvatar = ({ name, src = null, size = 'md', announcement = false, community = false }) => {
  const Icon = community ? LuLayers : announcement ? LuMegaphone : LuUsers
  if (src) {
    return <img src={src} alt={name} className={`shrink-0 object-cover ring-1 ring-slate-800/10 dark:ring-white/10 ${community ? 'rounded-xl' : 'rounded-full'} ${SIZES[size]}`} />
  }
  return (
    <div className={`flex shrink-0 items-center justify-center ${community ? 'rounded-xl' : 'rounded-full'} ${SIZES[size]} ${colorOf(name)}`}>
      <Icon className={ICON_SIZES[size]} />
    </div>
  )
}

// Nexa's picture
export const AiAvatar = ({ size = 'md', className = '' }) => {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className={`flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white ${SIZES[size]} ${className}`}>
        <LuSparkles className={ICON_SIZES[size]} />
      </div>
    )
  }
  return (
    <img
      src="/images/nexa-avatar.jpg"
      alt="Nexa AI"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full object-cover ring-1 ring-slate-800/10 shadow-xs dark:ring-white/10 ${SIZES[size]} ${className}`}
    />
  )
}

export default Avatar
