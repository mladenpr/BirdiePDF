import '../styles/app.css'
import { useState, useCallback, useRef, useEffect } from 'react'
import PDFViewer from '@/lib/components/PDFViewer'
import { useWindowContext } from '@/lib/window/components/WindowContext';

const iconStyle = {
  width: 22,
  height: 22,
  display: 'block',
  stroke: '#222',
  fill: 'none',
  strokeWidth: 2,
}

export default function App() {
  const [pdfFile, setPdfFile] = useState<Blob | null>(null)
  // State for page and zoom
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [viewMode, setViewMode] = useState<'default' | 'calculatingFitPage' | 'calculatingFitWidth'>('default')
  const { isFullScreen, setIsFullScreen } = useWindowContext();
  const [zoomInput, setZoomInput] = useState<string>(String(Math.round(zoom)))
  const [calculationTargetDimensions, setCalculationTargetDimensions] = useState<{ width: number; height: number } | null>(null);
  const currentFilePath = useRef<string | null>(null)
  const saveAsRef = useRef<() => Promise<void>>(async () => {})
  const pdfViewerContainerRef = useRef<HTMLDivElement | null>(null); // Ref for the PDF viewer container

  // Handler for page changes (used by input, prev/next buttons, and PDFViewer scroll detection)
  const handlePageChange = useCallback((newPage: number) => {
    setPage(prevPage => {
      const validPage = Math.max(1, Math.min(newPage, totalPages || 1));
      // Only update if the page actually changes to avoid potential loops
      if (validPage !== prevPage) {
        return validPage;
      }
      return prevPage;
    });
  }, [totalPages]);

  // Handler for PDF loaded
  const handlePdfLoaded = useCallback((pages: number) => {
    setTotalPages(pages)
    setPage(1) // Reset to first page when a new document is loaded
  }, [])

  // Handler for opening a file
  const handleOpenFile = useCallback(async () => {
    try {
      const filePath = await window.api.invoke('dialog-open')
      if (filePath) {
        console.log('Selected file path:', filePath);
        
        // Request file Buffer from main process
        const result = await window.api.invoke('read-pdf-file', filePath)
        if (result && !result.error) {
          console.log('File loaded successfully, buffer size:', result.byteLength);
          
          // Convert ArrayBuffer to Blob
          const blob = new Blob([result], { type: 'application/pdf' })
          console.log('Created blob:', blob.size, 'bytes', blob.type);
          
          setPdfFile(blob)
          setPage(1)
          currentFilePath.current = filePath
        } else {
          console.error('Failed to load PDF file:', result?.error);
          alert('Failed to load PDF file: ' + (result?.error || 'Unknown error'))
        }
      }
    } catch (error) {
      console.error('Error opening file:', error);
      alert(`Error opening file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  // Handler for Save As
  const handleSaveAs = useCallback(async () => {
    if (!pdfFile) {
      alert('No PDF file is currently open')
      return
    }
    
    try {
      // Convert Blob to ArrayBuffer
      const arrayBuffer = await pdfFile.arrayBuffer()
      
      // Call the dialog-save-as IPC handler
      const result = await window.api.invoke('dialog-save-as', arrayBuffer)
      
      if (result && result.success) {
        console.log('File saved successfully to:', result.filePath)
        currentFilePath.current = result.filePath
      } else if (result && result.error) {
        alert(`Failed to save file: ${result.error}`)
      }
    } catch (error) {
      alert(`Error saving file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [pdfFile])

  // Update saveAsRef when handleSaveAs changes
  useEffect(() => {
    saveAsRef.current = handleSaveAs
  }, [handleSaveAs])

  useEffect(() => {
    setZoomInput(String(Math.round(zoom)));
  }, [zoom]);
  
  // Handler for saving the current file
  const handleSave = useCallback(async () => {
    if (!pdfFile) {
      alert('No PDF file is currently open')
      return
    }
    
    try {
      // Convert Blob to ArrayBuffer
      const arrayBuffer = await pdfFile.arrayBuffer()
      
      if (currentFilePath.current) {
        // Save to existing file path
        const result = await window.api.invoke('save-pdf-file', {
          filePath: currentFilePath.current,
          data: arrayBuffer
        })
        
        if (result && result.success) {
          console.log('File saved successfully')
        } else if (result && result.error) {
          alert(`Failed to save file: ${result.error}`)
        }
      } else {
        // No current file path, use Save As dialog
        await saveAsRef.current()
      }
    } catch (error) {
      alert(`Error saving file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [pdfFile])

  // Toggle fullscreen
  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
      pdfViewerContainerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`)
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, [pdfViewerContainerRef]);

  // Effect to handle fullscreen changes (e.g. ESC key, or API call)
  useEffect(() => {
    const handleFullScreenChange = () => {
      const currentlyFullScreen = !!document.fullscreenElement;
      setIsFullScreen(currentlyFullScreen);
      if (currentlyFullScreen) {
        // Entered fullscreen
        requestAnimationFrame(() => {
          if (pdfViewerContainerRef.current) {
            const { clientWidth, clientHeight } = pdfViewerContainerRef.current;
            console.log("App.tsx: Fullscreen detected, container target size:", clientWidth, clientHeight);
            setCalculationTargetDimensions({ width: clientWidth, height: clientHeight });
            setViewMode('calculatingFitPage');
          }
        });
      } else {
        // Exited fullscreen
        setCalculationTargetDimensions(null); // Clear target dimensions
        setViewMode('calculatingFitWidth'); // Adjust to fit width in normal view
      }
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
    };
  }, [setViewMode]);

  // Effect for keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      // Prevent actions if an input or textarea element is focused
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        handlePageChange(page - 1);
      } else if (event.key === 'ArrowRight') {
        handlePageChange(page + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [page, handlePageChange]);

  // Simplified handleWheelZoom, as viewMode change is now handled by explicit button clicks leading to onOptimalScaleCalculated
  const handleWheelZoom = useCallback((event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      const zoomSensitivity = 1;
      const zoomChange = -event.deltaY * zoomSensitivity;
      setZoom(prevZoom => {
        const newZoom = Math.max(10, Math.min(prevZoom + zoomChange, 400));
        // If a manual zoom happens, ensure we are in default view mode
        // This might be redundant if buttons correctly set to default after action, but good for robustness
        if (viewMode !== 'default') {
          setViewMode('default');
        }
        return newZoom;
      });
    }
  }, [setZoom, viewMode, setViewMode]);

  // Effect to attach wheel listener with passive: false
  useEffect(() => {
    const container = pdfViewerContainerRef.current;
    if (container) {
      // The type of handleWheelZoom needs to match EventListener, which expects a generic Event, 
      // but we know it's a WheelEvent. We cast it or ensure handleWheelZoom can handle Event.
      // For simplicity in this step, assuming handleWheelZoom is compatible or we cast inside.
      const wheelListener = (event: Event) => handleWheelZoom(event as WheelEvent);

      // Cast options to 'any' to resolve the TypeScript linter error regarding 'passive'
      container.addEventListener('wheel', wheelListener, { passive: false } as any);
      return () => {
        container.removeEventListener('wheel', wheelListener, { passive: false } as any);
      };
    }
  }, [handleWheelZoom]); // Re-attach if handleWheelZoom changes (due to its own deps)

  const handleOptimalScaleCalculated = useCallback((scale: number) => {
    console.log('App.tsx: Optimal scale received from PDFViewer:', scale);
    setZoom(scale * 100);
    // Only switch out of calculating mode if we are IN calculating mode.
    if (viewMode === 'calculatingFitPage' || viewMode === 'calculatingFitWidth') {
        console.log('App.tsx: Setting viewMode to default.');
        setViewMode('default');
    } else {
        console.log('App.tsx: Already in default mode or mode changed, just updating zoom.');
    }
  }, [setZoom, setViewMode, viewMode]);

  // Handler for "Fit Page" button
  const handleFitPageClick = useCallback(() => {
    setCalculationTargetDimensions(null); // Not using explicit dimensions here, PDFViewer uses its own
    setViewMode('calculatingFitPage');
  }, [setViewMode]);

  // Handler for "Full Width" button
  const handleFitWidthClick = useCallback(() => {
    setCalculationTargetDimensions(null); // Not using explicit dimensions here
    setViewMode('calculatingFitWidth');
  }, [setViewMode]);

  const handleZoomInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setZoomInput(event.target.value);
  };

  const applyZoomInput = () => {
    const newZoomValue = parseFloat(zoomInput);
    if (!isNaN(newZoomValue) && newZoomValue >= 25 && newZoomValue <= 400) {
      setZoom(newZoomValue);
    } else {
      setZoomInput(String(Math.round(zoom))); // Revert to current valid zoom
    }
  };

  const handleZoomInputBlur = () => {
    applyZoomInput();
  };

  const handleZoomInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      applyZoomInput();
      event.currentTarget.blur(); // Remove focus from input
    } else if (event.key === 'Escape') {
      setZoomInput(String(Math.round(zoom))); // Revert on Escape
      event.currentTarget.blur();
    }
  };

  return (
    <div style={{ width: '100%', background: '#f8f9fa', display: 'flex', flexDirection: 'column', flex: 1, height: '100vh', overflow: 'hidden' }}>
      {/* Command Palette - Render only if not in fullscreen */}
      { !isFullScreen && (
        <div style={{
          position: 'sticky', // Make it sticky
          top: 0, // Stick to the top
          zIndex: 10, // Ensure it stays on top of other content
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          padding: '10px 24px 10px 24px',
          borderBottom: '1px solid #e5e7eb',
          background: '#f8f9fa',
          minHeight: 48,
          fontFamily: 'inherit',
        }}>
          <CommandButton title="Open" onClick={handleOpenFile}>
            <svg style={iconStyle} viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3v4M8 3v4M12 12v-4M12 12l-3-3M12 12l3-3"/></svg>
          </CommandButton>
          <CommandButton title="Save" onClick={handleSave}>
            <svg style={iconStyle} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M16 3v4H8V3"/><rect x="8" y="15" width="8" height="4" rx="1"/></svg>
          </CommandButton>
          <CommandButton title="Save As" onClick={handleSaveAs}>
            <svg style={iconStyle} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 17v-6M9 14l3 3 3-3"/></svg>
          </CommandButton>
          <Divider />
          <CommandButton title="Previous Page" onClick={() => handlePageChange(page - 1)}>
            <svg style={iconStyle} viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          </CommandButton>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={page}
            onChange={(e) => handlePageChange(parseInt(e.target.value) || 1)}
            style={{
              width: 60,
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
          <CommandButton title="Next Page" onClick={() => handlePageChange(page + 1)}>
            <svg style={iconStyle} viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18"/></svg>
          </CommandButton>
          <Divider />
          <CommandButton title="Zoom Out" onClick={() => setZoom(prev => Math.max(25, prev - 25))}>
            <svg style={iconStyle} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="9" y1="12" x2="15" y2="12"/></svg>
          </CommandButton>
          <input
            type="text"
            value={zoomInput}
            onChange={handleZoomInputChange}
            onBlur={handleZoomInputBlur}
            onKeyDown={handleZoomInputKeyDown}
            style={{
              width: 45, // Adjusted width for 3 digits + potentially a bit more
              textAlign: 'center',
              background: '#fff',
              border: '1px solid #e5e7eb',
              color: '#222',
              borderRadius: 8,
              fontSize: 16,
              margin: '0 0 0 6px', // Margin adjusted to accommodate % sign
              padding: '4px 0',
              outline: 'none',
              boxShadow: 'none',
              height: 32,
            }}
          />
          <span style={{ color: '#222', fontSize: 16, margin: '0 6px 0 2px' }}>%</span>
          <CommandButton title="Zoom In" onClick={() => setZoom(prev => Math.min(400, prev + 25))}>
            <svg style={iconStyle} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="15"/></svg>
          </CommandButton>
          <Divider />
          <CommandButton 
            title="Fit Page" 
            onClick={handleFitPageClick}
          >
            <svg style={iconStyle} viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="1"/>
              <polyline points="4 12 4 4 12 4" />
              <polyline points="20 12 20 20 12 20" />
            </svg>
          </CommandButton>
          <CommandButton 
            title="Full Width View" 
            onClick={handleFitWidthClick}
          >
            <svg style={iconStyle} viewBox="0 0 24 24">
              <rect x="3" y="6" width="18" height="12" rx="1"/>
              <path d="M3 12h18"/>
            </svg>
          </CommandButton>
          <CommandButton 
            title="Full Screen" 
            onClick={toggleFullScreen}
            active={isFullScreen}
          >
            <svg style={iconStyle} viewBox="0 0 24 24">
              <path d="M3 3h6v6m6-6h6v6m-6 6h6v6m-12 0h6v-6"/>
              {isFullScreen && <path d="M20 14v-4M14 20h-4M4 14v-4M14 4h-4"/>}
            </svg>
          </CommandButton>
        </div>
      )}
      {/* PDF Viewer - Takes remaining space */}
      <div
        ref={pdfViewerContainerRef} // Assign ref here
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: viewMode === 'calculatingFitPage' && !isFullScreen ? 'hidden' : 'auto', // Prevent scrolling in Fit Page (non-fullscreen)
          background: isFullScreen ? '#000' : '#f8f9fa', 
          minHeight: 0,
          width: '100%',
          // height: '100%' is implicitly handled by flex: 1 in a flex column parent
        }}
      >
        {pdfFile ? (
          <PDFViewer
            file={pdfFile}
            zoom={zoom / 100}
            viewMode={viewMode}
            calculationTargetDimensions={calculationTargetDimensions}
            onDocumentLoaded={handlePdfLoaded}
            scrollToPageNumber={page}
            onVisiblePageChanged={handlePageChange}
            onOptimalScaleCalculated={handleOptimalScaleCalculated}
            singlePageView={isFullScreen || viewMode === 'calculatingFitPage'}
          />
        ) : (
          'PDF Viewer Area'
        )}
      </div>
    </div>
  )
}

function CommandButton({ 
  children, 
  title, 
  onClick,
  active = false 
}: { 
  children: React.ReactNode, 
  title: string, 
  onClick?: () => void,
  active?: boolean
}) {
  return (
    <button
      title={title}
      style={{
        background: active ? '#e1e6f0' : 'none',
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
      onMouseOver={e => !active && (e.currentTarget.style.background = '#ececec')}
      onMouseOut={e => !active && (e.currentTarget.style.background = 'none')}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span style={{ height: 28, width: 1, background: '#e5e7eb', margin: '0 16px', display: 'inline-block', borderRadius: 1 }} />
}
