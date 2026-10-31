// Chat wallpapers: presets (each with a light and a dark look) and the style for a chosen one.
// A choice ("spec") is { kind: 'preset', id, dim } or { kind: 'image', url, publicId, dim }.
// null = the default doodle background (.chat-bg in index.css).

const DOODLE_PATHS = "<path d='M20 24h26a7 7 0 0 1 7 7v12a7 7 0 0 1-7 7H32l-8 7v-7h-4a7 7 0 0 1-7-7V31a7 7 0 0 1 7-7z'/><circle cx='27' cy='37' r='1.2'/><circle cx='33' cy='37' r='1.2'/><circle cx='39' cy='37' r='1.2'/><circle cx='132' cy='36' r='9'/><path d='M104 116l7 7 14-14'/><path d='M146 134h18M155 125v18'/><path d='M30 146c5-5 10-5 15 0s10 5 15 0'/><path d='M120 74h22a6 6 0 0 1 6 6v9a6 6 0 0 1-6 6h-14l-7 6v-6h-1a6 6 0 0 1-6-6v-9a6 6 0 0 1 6-6z'/><path d='M70 92l4-8 4 8 8 1-6 6 1.5 8-7.5-4-7.5 4 1.5-8-6-6z'/>"
const doodle = (stroke, opacity) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'><g fill='none' stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'>${DOODLE_PATHS}</g></svg>`)}")`

// Every look sets size / repeat / position, so nothing is left over from the default doodle tile
const pattern = (bg, stroke) => ({ backgroundColor: bg, backgroundImage: doodle(stroke, 0.12), backgroundSize: '180px 180px', backgroundRepeat: 'repeat', backgroundPosition: '0 0' })
const color = (bg) => ({ backgroundColor: bg, backgroundImage: 'none', backgroundSize: 'auto', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' })
const gradient = (g) => ({ backgroundColor: 'transparent', backgroundImage: g, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' })
// Simple geometric textures (pure CSS)
const dots = (bg, dot) => ({ backgroundColor: bg, backgroundImage: `radial-gradient(${dot} 1.3px, transparent 1.4px)`, backgroundSize: '18px 18px', backgroundRepeat: 'repeat', backgroundPosition: '0 0' })
const grid = (bg, line) => ({ backgroundColor: bg, backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`, backgroundSize: '26px 26px, 26px 26px', backgroundRepeat: 'repeat, repeat', backgroundPosition: '0 0, 0 0' })
const lines = (bg, line) => ({ backgroundColor: bg, backgroundImage: `repeating-linear-gradient(45deg, ${line} 0 1px, transparent 1px 14px)`, backgroundSize: 'auto', backgroundRepeat: 'repeat', backgroundPosition: '0 0' })
const hatch = (bg, line) => ({ backgroundColor: bg, backgroundImage: `repeating-linear-gradient(45deg, ${line} 0 1px, transparent 1px 16px), repeating-linear-gradient(-45deg, ${line} 0 1px, transparent 1px 16px)`, backgroundSize: 'auto, auto', backgroundRepeat: 'repeat, repeat', backgroundPosition: '0 0, 0 0' })
const photo = (file) => ({ backgroundColor: '#111', backgroundImage: `url(/images/wallpapers/${file}.jpg)`, backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' })

export const WALLPAPER_GROUPS = ['Patterns', 'Textures', 'Colours', 'Gradients', 'Photos']

export const PRESETS = [
  { id: 'doodle-mint', name: 'Mint doodle', group: 'Patterns', light: pattern('#e3f2ea', '#2f7a57'), dark: pattern('#0f1a15', '#5fbf92') },
  { id: 'doodle-sky', name: 'Sky doodle', group: 'Patterns', light: pattern('#e2eef9', '#2c6aa6'), dark: pattern('#0e1622', '#6aa7e0') },
  { id: 'doodle-rose', name: 'Rose doodle', group: 'Patterns', light: pattern('#f8e6ec', '#a8436a'), dark: pattern('#1b1116', '#d77fa2') },
  { id: 'doodle-sand', name: 'Sand doodle', group: 'Patterns', light: pattern('#f4ecdf', '#8a6a3c'), dark: pattern('#19150f', '#c9a46b') },
  { id: 'doodle-lilac', name: 'Lilac doodle', group: 'Patterns', light: pattern('#ece6f8', '#6b4fb8'), dark: pattern('#15111f', '#a58ae6') },
  { id: 'doodle-ink', name: 'Ink doodle', group: 'Patterns', light: pattern('#eceef1', '#334155'), dark: pattern('#0e0f11', '#8b93a1') },

  { id: 'dots', name: 'Dots', group: 'Textures', light: dots('#eef0f4', 'rgba(51,65,85,0.18)'), dark: dots('#111317', 'rgba(203,213,225,0.12)') },
  { id: 'dots-blue', name: 'Blue dots', group: 'Textures', light: dots('#e3edf9', 'rgba(37,99,235,0.22)'), dark: dots('#0d1522', 'rgba(96,165,250,0.18)') },
  { id: 'grid', name: 'Grid', group: 'Textures', light: grid('#f1f3f6', 'rgba(51,65,85,0.07)'), dark: grid('#111317', 'rgba(203,213,225,0.06)') },
  { id: 'grid-green', name: 'Green grid', group: 'Textures', light: grid('#e7f3ec', 'rgba(22,101,52,0.09)'), dark: grid('#0e1712', 'rgba(74,222,128,0.07)') },
  { id: 'lines', name: 'Lines', group: 'Textures', light: lines('#eff1f5', 'rgba(51,65,85,0.08)'), dark: lines('#111317', 'rgba(203,213,225,0.06)') },
  { id: 'hatch', name: 'Cross-hatch', group: 'Textures', light: hatch('#f3eee6', 'rgba(120,90,50,0.08)'), dark: hatch('#16130f', 'rgba(214,180,130,0.06)') },

  { id: 'mist', name: 'Mist', group: 'Colours', light: color('#eceff3'), dark: color('#15171b') },
  { id: 'sage', name: 'Sage', group: 'Colours', light: color('#dfe9e1'), dark: color('#111a14') },
  { id: 'blush', name: 'Blush', group: 'Colours', light: color('#f4e4e7'), dark: color('#1c1417') },
  { id: 'lavender', name: 'Lavender', group: 'Colours', light: color('#e8e4f5'), dark: color('#16131f') },
  { id: 'sky', name: 'Sky', group: 'Colours', light: color('#dcecf8'), dark: color('#0e1721') },
  { id: 'sand', name: 'Sand', group: 'Colours', light: color('#f1e9dc'), dark: color('#1a1611') },
  { id: 'mint', name: 'Mint', group: 'Colours', light: color('#dff3ec'), dark: color('#0d1915') },
  { id: 'peach-solid', name: 'Apricot', group: 'Colours', light: color('#fbe5d6'), dark: color('#1f1610') },
  { id: 'butter', name: 'Butter', group: 'Colours', light: color('#f8f1d4'), dark: color('#1b1810') },
  { id: 'graphite', name: 'Graphite', group: 'Colours', light: color('#dcdfe4'), dark: color('#0b0c0e') },

  { id: 'sunrise', name: 'Sunrise', group: 'Gradients', light: gradient('linear-gradient(160deg, #fde7d9 0%, #f9d5e5 50%, #e4dcf7 100%)'), dark: gradient('linear-gradient(160deg, #2a1a17 0%, #261421 50%, #19162b 100%)') },
  { id: 'lagoon', name: 'Lagoon', group: 'Gradients', light: gradient('linear-gradient(160deg, #d8f3ee 0%, #d6e8fb 100%)'), dark: gradient('linear-gradient(160deg, #0d211f 0%, #0f1a2c 100%)') },
  { id: 'meadow', name: 'Meadow', group: 'Gradients', light: gradient('linear-gradient(160deg, #eef6d8 0%, #d3eedc 100%)'), dark: gradient('linear-gradient(160deg, #1a1f10 0%, #0f2016 100%)') },
  { id: 'dusk', name: 'Dusk', group: 'Gradients', light: gradient('linear-gradient(160deg, #e3e0fb 0%, #f6dcef 100%)'), dark: gradient('linear-gradient(160deg, #18163a 0%, #2a1630 100%)') },
  { id: 'peach', name: 'Peach', group: 'Gradients', light: gradient('linear-gradient(160deg, #fff1dc 0%, #ffdcd2 100%)'), dark: gradient('linear-gradient(160deg, #241b10 0%, #2a1612 100%)') },
  { id: 'aurora-glow', name: 'Aurora', group: 'Gradients', light: gradient('linear-gradient(160deg, #d9f5ea 0%, #dfe3fb 55%, #f1dcf5 100%)'), dark: gradient('linear-gradient(160deg, #0b2420 0%, #13183a 55%, #2a1233 100%)') },
  { id: 'sunset', name: 'Sunset', group: 'Gradients', light: gradient('linear-gradient(180deg, #ffe6c7 0%, #ffd1d1 55%, #e7d4f4 100%)'), dark: gradient('linear-gradient(180deg, #2b1a0e 0%, #2b1216 55%, #1c1328 100%)') },
  { id: 'deep-sea', name: 'Deep sea', group: 'Gradients', light: gradient('linear-gradient(180deg, #dff1fb 0%, #cfe0f7 100%)'), dark: gradient('linear-gradient(180deg, #0b1e2c 0%, #070d1a 100%)') },
  { id: 'candy', name: 'Candy', group: 'Gradients', light: gradient('linear-gradient(135deg, #fde2f3 0%, #e2e9ff 100%)'), dark: gradient('linear-gradient(135deg, #2a1024 0%, #121a35 100%)') },
  { id: 'forest-mist', name: 'Forest mist', group: 'Gradients', light: gradient('linear-gradient(180deg, #e6f0e8 0%, #d2e4dc 100%)'), dark: gradient('linear-gradient(180deg, #0f1a14 0%, #0a1311 100%)') },
  { id: 'slate', name: 'Slate', group: 'Gradients', light: gradient('linear-gradient(160deg, #eef0f4 0%, #d9dee7 100%)'), dark: gradient('linear-gradient(160deg, #16181d 0%, #0d0e11 100%)') },

  { id: 'mountains', name: 'Mountains', group: 'Photos', photo: 'mountains' },
  { id: 'ocean', name: 'Ocean', group: 'Photos', photo: 'ocean' },
  { id: 'leaves', name: 'Leaf', group: 'Photos', photo: 'leaves' },
  { id: 'violet', name: 'Violet haze', group: 'Photos', photo: 'violet' },
  { id: 'stars', name: 'Night sky', group: 'Photos', photo: 'stars' },
  { id: 'city', name: 'City night', group: 'Photos', photo: 'city' },
  { id: 'canyon', name: 'Canyon', group: 'Photos', photo: 'canyon' },
  { id: 'clouds', name: 'Clouds', group: 'Photos', photo: 'clouds' },
  { id: 'beach', name: 'Beach', group: 'Photos', photo: 'beach' },
  { id: 'lake', name: 'Lake', group: 'Photos', photo: 'lake' },
  { id: 'forest', name: 'Forest', group: 'Photos', photo: 'forest' },
  { id: 'aurora', name: 'Northern lights', group: 'Photos', photo: 'aurora' },
  { id: 'blossom', name: 'Blossom', group: 'Photos', photo: 'blossom' },
  { id: 'lavender-field', name: 'Lavender', group: 'Photos', photo: 'lavender' },
  { id: 'alpine', name: 'Alpine', group: 'Photos', photo: 'alpine' },
  { id: 'rain', name: 'Raindrops', group: 'Photos', photo: 'rain' },
  { id: 'cactus', name: 'Cactus', group: 'Photos', photo: 'cactus' },
  { id: 'carbon', name: 'Carbon', group: 'Photos', photo: 'carbon' },
]
export const presetById = (id) => PRESETS.find((p) => p.id === id)

// A sensible starting dim: photos are a bit busy behind messages
export const defaultDim = (spec) => (spec?.kind === 'image' || presetById(spec?.id)?.photo ? 0.15 : 0)

// The CSS for a wallpaper (null = use the default .chat-bg look)
export const wallpaperStyle = (spec, dark, { thumb = false } = {}) => {
  if (!spec) return null
  let base
  if (spec.kind === 'image') base = { backgroundColor: '#111', backgroundImage: `url("${spec.url}")`, backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }
  else {
    const p = presetById(spec.id)
    if (!p) return null
    base = p.photo ? photo(thumb ? `thumb-${p.photo}` : p.photo) : (dark ? p.dark : p.light)
  }
  const isPhoto = spec.kind === 'image' || !!presetById(spec.id)?.photo
  // Darken photos a little more in dark mode so bubbles stay easy to read
  const dim = Math.min(0.85, (spec.dim || 0) + (dark && isPhoto ? 0.2 : 0))
  if (!dim) return base
  const veil = `linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim}))`
  if (!base.backgroundImage || base.backgroundImage === 'none') return { ...base, backgroundImage: veil, backgroundSize: '100% 100%' }
  return { ...base, backgroundImage: `${veil}, ${base.backgroundImage}`, backgroundSize: `100% 100%, ${base.backgroundSize}`, backgroundRepeat: `no-repeat, ${base.backgroundRepeat}`, backgroundPosition: `center, ${base.backgroundPosition}` }
}

export const wallpaperName = (spec) => (!spec ? 'Default' : spec.kind === 'image' ? 'Your photo' : presetById(spec.id)?.name || 'Default')
