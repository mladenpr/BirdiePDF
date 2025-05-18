import type { TitlebarMenu, TitlebarMenuItem } from './types';

export const menuItems: TitlebarMenu[] = [
  {
    name: 'File',
    items: [
      { name: 'New', action: 'file-new', shortcut: 'Ctrl+N' },
      { name: 'Save', action: 'file-save', shortcut: 'Ctrl+S' },
      { name: 'Save As', action: 'file-save-as', shortcut: 'Ctrl+Shift+S' },
    ],
  },
  {
    name: 'Edit',
    items: [
      { name: 'Undo', action: 'web-undo', shortcut: 'Ctrl+Z' },
      { name: 'Redo', action: 'web-redo', shortcut: 'Ctrl+Y' },
      { name: '---' },
      { name: 'Cut', action: 'web-cut', shortcut: 'Ctrl+X' },
      { name: 'Copy', action: 'web-copy', shortcut: 'Ctrl+C' },
      { name: 'Paste', action: 'web-paste', shortcut: 'Ctrl+V' },
      { name: '---' },
      { name: 'Find', action: 'edit-find', shortcut: 'Ctrl+F' },
    ],
  },
  {
    name: 'View',
    items: [
      { name: 'Zoom In', action: 'web-zoom-in', shortcut: 'Ctrl++' },
      { name: 'Zoom Out', action: 'web-zoom-out', shortcut: 'Ctrl+-' },
      { name: '---' },
      { name: 'Full Page', action: 'view-full-page' },
      { name: 'Full Width', action: 'view-full-width' },
      { name: '---' },
      { name: 'Full Screen', action: 'web-toggle-fullscreen', shortcut: 'F11' },
    ],
  },
  {
    name: 'Tools',
    items: [
      // Placeholder for future tools
    ],
  },
  {
    name: 'Help',
    items: [
      { name: 'Documentation', action: 'help-documentation' },
      { name: 'About BirdiePDF', action: 'help-about' },
    ],
  },
]
