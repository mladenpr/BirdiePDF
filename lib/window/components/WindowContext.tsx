import { createContext, useContext, useEffect, useState, Dispatch, SetStateAction } from 'react'
import { Titlebar } from './Titlebar'
import type { TitlebarMenu } from '../types'
import { TitlebarContextProvider } from './TitlebarContext'

interface WindowContextProps {
  titlebar: TitlebarProps
  readonly window: WindowInitProps
  isFullScreen: boolean
  setIsFullScreen: Dispatch<SetStateAction<boolean>>
}

interface WindowInitProps {
  width: number
  height: number
  maximizable: boolean
  minimizable: boolean
  platform: string
}

interface WindowContextProviderProps {
  children: React.ReactNode
  titlebar?: TitlebarProps
}

export interface TitlebarProps {
  title: string
  titleCentered?: boolean
  icon?: string
  menuItems?: TitlebarMenu[]
}

const WindowContext = createContext<WindowContextProps | undefined>(undefined)

export const WindowContextProvider = ({ children, titlebar }: WindowContextProviderProps) => {
  const [initProps, setInitProps] = useState<WindowInitProps | undefined>()
  const [isFullScreen, setIsFullScreen] = useState(false)

  const defaultTitlebar: TitlebarProps = {
    title: 'Electron React App',
    icon: 'appIcon.png',
    titleCentered: false,
    menuItems: [],
  }

  // Merge default titlebar props with user defined props
  titlebar = { ...defaultTitlebar, ...titlebar }

  useEffect(() => {
    // Load window init props
    window.api.invoke('init-window').then((value: WindowInitProps) => setInitProps(value))

    // Add class to parent element
    const parent = document.querySelector('.window-content')?.parentElement
    if (parent) {
      parent.classList.add('window-frame')
    }
  }, [])

  if (!initProps) {
    return null
  }

  return (
    <WindowContext.Provider value={{ titlebar, window: initProps, isFullScreen, setIsFullScreen }}>
      {!isFullScreen && (
        <TitlebarContextProvider>
          <Titlebar />
        </TitlebarContextProvider>
      )}
      <WindowContent>{children}</WindowContent>
    </WindowContext.Provider>
  )
}

const WindowContent = ({ children }: { children: React.ReactNode }) => {
  return <div className="window-content">{children}</div>
}

export const useWindowContext = () => {
  const context = useContext(WindowContext)
  if (context === undefined) {
    throw new Error('useWindowContext must be used within a WindowContextProvider')
  }
  if (!context.window) {
    console.warn("useWindowContext called before window initProps are available.")
  }
  return context
}
