import React from 'react'
import useConversation from '../Zustand/UserConversation'
import WallpaperPicker from '../components/WallpaperPicker'

// Opens the wallpaper picker for a chat from anywhere (chat menu, chat info)
const WallpaperPickerHost = () => {
  const { wallpaperPicker, setWallpaperPicker } = useConversation()
  if (!wallpaperPicker) return null
  return <WallpaperPicker chatId={wallpaperPicker.chatId} chatName={wallpaperPicker.name} onClose={() => setWallpaperPicker(null)} />
}

export default WallpaperPickerHost
