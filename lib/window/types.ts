export interface TitlebarMenuItem {
  name: string
  action?: string
  actionParams?: (string | number | object)[]
  actionCallback?: () => void
  shortcut?: string
  items?: TitlebarMenuItem[]
}

export interface TitlebarMenu {
  name: string
  items: TitlebarMenuItem[]
}

// Potentially add TitlebarProps here if it's closely related and benefits from centralizing window-related types
// For now, keeping it in WindowContext.tsx as it's directly used there as props for the context provider. 