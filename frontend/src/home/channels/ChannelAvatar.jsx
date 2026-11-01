import React from 'react'
import { LuRadioTower } from 'react-icons/lu'

// A channel's picture, or a tower icon on a colour picked from the name
const COLORS = ['from-indigo-500 to-violet-600', 'from-sky-500 to-indigo-600', 'from-emerald-500 to-teal-600', 'from-rose-500 to-pink-600', 'from-amber-500 to-orange-600']
const SIZES = { sm: 'size-9', md: 'size-11', lg: 'size-20' }
const ICONS = { sm: 'size-4', md: 'size-5', lg: 'size-8' }

const ChannelAvatar = ({ channel, size = 'md' }) => {
  if (channel?.avatar?.url) return <img src={channel.avatar.url} alt="" className={`${SIZES[size]} shrink-0 rounded-2xl object-cover`} />
  const color = COLORS[[...(channel?.name || '')].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length]
  return (
    <span className={`flex ${SIZES[size]} shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-white`}>
      <LuRadioTower className={ICONS[size]} />
    </span>
  )
}

export default ChannelAvatar
