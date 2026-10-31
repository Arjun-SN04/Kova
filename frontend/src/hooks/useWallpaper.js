import useConversation from '../Zustand/UserConversation'
import { useTheme } from '../context/ThemeProvider'
import { wallpaperStyle } from '../utils/wallpapers'

// The background style for a chat: its own wallpaper, else my default, else null (doodle)
const useWallpaper = (chatId) => {
  const { dark } = useTheme()
  const wallpapers = useConversation((s) => s.wallpapers)
  const spec = (chatId && wallpapers.chats?.[String(chatId)]) || wallpapers.global
  return wallpaperStyle(spec, dark)
}

export default useWallpaper
