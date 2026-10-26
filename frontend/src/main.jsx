import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import AuthProvider from './context/AuthProvider.jsx'
import SocketProvider from './context/SocketProvider.jsx'
import ThemeProvider from './context/ThemeProvider.jsx'
import CallProvider from './context/CallProvider.jsx'
import GroupCallProvider from './context/GroupCallProvider.jsx'
import axios from 'axios'
import { registerServiceWorker } from './utils/push'

// Tell the server the user's time zone (Nexa uses it for times like "tomorrow 9am")
try { axios.defaults.headers.common['X-Time-Zone'] = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { /* ignore */ }

// Push notifications (the service worker shows them even when Kova is closed)
registerServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <SocketProvider>
            <CallProvider>
              <GroupCallProvider>
                <App />
              </GroupCallProvider>
            </CallProvider>
          </SocketProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
