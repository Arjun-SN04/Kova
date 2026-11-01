import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// A small OpenStreetMap map with a pulsing dot (and accuracy circle) at lat/lng.
// interactive=false: a still picture inside a chat bubble.
const dot = (live) => L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<span style="position:relative;display:block;width:22px;height:22px">
    ${live ? '<span style="position:absolute;inset:-6px;border-radius:9999px;background:rgba(99,102,241,.35);animation:kova-ping 1.6s ease-out infinite"></span>' : ''}
    <span style="position:absolute;inset:0;border-radius:9999px;background:#4f46e5;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>
  </span>`,
})

const MapView = ({ lat, lng, accuracy = 0, live = false, interactive = false, zoom = 15, className = 'h-40 w-full' }) => {
  const el = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const circle = useRef(null)

  useEffect(() => {
    map.current = L.map(el.current, {
      zoomControl: interactive, attributionControl: true, dragging: interactive, scrollWheelZoom: interactive,
      doubleClickZoom: interactive, touchZoom: interactive, boxZoom: interactive, keyboard: interactive,
    }).setView([lat, lng], zoom)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current)
    marker.current = L.marker([lat, lng], { icon: dot(live), interactive: false }).addTo(map.current)
    if (accuracy > 15 && accuracy < 5000) circle.current = L.circle([lat, lng], { radius: accuracy, color: '#6366f1', weight: 1, fillOpacity: 0.1, interactive: false }).addTo(map.current)
    return () => { map.current?.remove(); map.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Live updates move the dot
  useEffect(() => {
    if (!map.current) return
    marker.current?.setLatLng([lat, lng]).setIcon(dot(live))
    circle.current?.setLatLng([lat, lng]).setRadius(accuracy || 0)
    map.current.panTo([lat, lng], { animate: true })
  }, [lat, lng, accuracy, live])

  return <div ref={el} className={`${className} z-0 overflow-hidden`} />
}

export default MapView
