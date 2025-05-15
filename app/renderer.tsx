import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './components/App'
import appIcon from '@/resources/build/icon.png'
import { WindowContextProvider, menuItems } from '@/lib/window'
import '@/lib/window/window.css'

ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
  <React.StrictMode>
    <WindowContextProvider titlebar={{ title: 'Electron React App', icon: appIcon, menuItems }}>
      <App />
    </WindowContextProvider>
  </React.StrictMode>
)

// Ensure Electron zoom is reset to 100% on every load (fixes 'small but correct px size' issue)
if (window.api?.invoke) {
  window.api.invoke('web-actual-size').then(() => {
    console.log('Zoom level reset to 100%');
  });
}
