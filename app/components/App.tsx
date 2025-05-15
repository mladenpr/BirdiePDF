import '../styles/app.css'

const iconStyle = {
  width: 22,
  height: 22,
  display: 'block',
  stroke: '#222',
  fill: 'none',
  strokeWidth: 2,
}

export default function App() {
  // Placeholder values for page and zoom
  const page = 6
  const totalPages = 10
  const zoom = 100

  return (
    <div style={{ width: '100%', background: '#f8f9fa', display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Command Palette */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        padding: '10px 24px 10px 24px',
        borderBottom: '1px solid #e5e7eb',
        background: '#f8f9fa',
        minHeight: 48,
        fontFamily: 'inherit',
      }}>
        <CommandButton title="Open" onClick={async () => {
          const filePath = await window.api.invoke('dialog-open')
          if (filePath) {
            console.log('Selected file:', filePath)
            // TODO: Load and display the PDF
          }
        }}>
          <svg style={iconStyle} viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3v4M8 3v4M12 12v-4M12 12l-3-3M12 12l3-3"/></svg>
        </CommandButton>
        <CommandButton title="Save">
          <svg style={iconStyle} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M16 3v4H8V3"/><rect x="8" y="15" width="8" height="4" rx="1"/></svg>
        </CommandButton>
        <CommandButton title="Save As">
          <svg style={iconStyle} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 17v-6M9 14l3 3 3-3"/></svg>
        </CommandButton>
        <Divider />
        <CommandButton title="Previous Page">
          <svg style={iconStyle} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </CommandButton>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={page}
          readOnly
          style={{
            width: 40,
            textAlign: 'center',
            background: '#fff',
            border: '1px solid #e5e7eb',
            color: '#222',
            borderRadius: 8,
            fontSize: 16,
            margin: '0 6px',
            padding: '4px 0',
            outline: 'none',
            boxShadow: 'none',
            height: 32,
          }}
        />
        <span style={{ color: '#888', fontSize: 16, marginRight: 6 }}>/ {totalPages}</span>
        <CommandButton title="Next Page">
          <svg style={iconStyle} viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18"/></svg>
        </CommandButton>
        <Divider />
        <CommandButton title="Zoom Out">
          <svg style={iconStyle} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="9" y1="12" x2="15" y2="12"/></svg>
        </CommandButton>
        <span style={{ color: '#222', fontSize: 16, minWidth: 48, textAlign: 'center' }}>{zoom}%</span>
        <CommandButton title="Zoom In">
          <svg style={iconStyle} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="15"/></svg>
        </CommandButton>
      </div>
      {/* PDF Viewer placeholder */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 24, background: '#f8f9fa' }}>
        PDF Viewer Area
      </div>
    </div>
  )
}

function CommandButton({ children, title, onClick }: { children: React.ReactNode, title: string, onClick?: () => void }) {
  return (
    <button
      title={title}
      style={{
        background: 'none',
        border: 'none',
        borderRadius: 8,
        padding: '6px 10px',
        margin: '0 2px',
        minWidth: 32,
        minHeight: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background 0.15s',
        outline: 'none',
      }}
      onMouseOver={e => (e.currentTarget.style.background = '#ececec')}
      onMouseOut={e => (e.currentTarget.style.background = 'none')}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span style={{ height: 28, width: 1, background: '#e5e7eb', margin: '0 16px', display: 'inline-block', borderRadius: 1 }} />
}
