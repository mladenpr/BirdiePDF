import '../styles/app.css'
import { useState, useCallback, useRef, useEffect } from 'react'
import PDFViewer from '@/lib/components/PDFViewer'
import { useWindowContext } from '@/lib/window/components/WindowContext';
import openIcon from '../assets/icons/open.png';
import saveIcon from '../assets/icons/save.png';
import saveAsIcon from '../assets/icons/saveas.png';
import fitPageIcon from '../assets/icons/fitpage.png';
import fullWidthIcon from '../assets/icons/fullwidth.png';
import fullScreenIcon from '../assets/icons/fullscreen.png';
import previousPageIcon from '../assets/icons/previous_page.svg';
import nextPageIcon from '../assets/icons/next_page.svg';
import zoomInIcon from '../assets/icons/zoom_in.svg';
import zoomOutIcon from '../assets/icons/zoom_out.svg';
import percentageIcon from '../assets/icons/percentage.svg';
import searchIcon from '../assets/icons/search.svg';
import panelIcon from '../assets/icons/pages.svg';
import type { SearchMatch } from '@/lib/components/PDFViewer';
import PDFPagePane from '@/lib/components/PDFPagePane';

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
  const [goToPageNumber, setGoToPageNumber] = useState<number | undefined>(undefined); // NEW: for explicit go to
  const [isPagePaneOpen, setIsPagePaneOpen] = useState(false); // NEW: State for page pane

  // Search state
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [searchTriggerCounter, setSearchTriggerCounter] = useState(0);

  // Handler for page changes (used by input, prev/next buttons, and PDFViewer scroll detection)
  const handlePageChange = useCallback((newPage: number, explicitGoTo?: boolean) => {
    setPage(prevPage => {
      const validPage = Math.max(1, Math.min(newPage, totalPages || 1));
      if (validPage !== prevPage) {
        if (explicitGoTo) {
          setGoToPageNumber(validPage); // Only set for explicit go to
        }
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
      // or if the search input is visible and focused
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (showSearchInput && activeElement === document.getElementById('searchInput'))
      ) {
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
  }, [page, handlePageChange, showSearchInput]);

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

  // Search handlers
  const toggleSearchInput = () => {
    setShowSearchInput(prev => !prev);
    if (showSearchInput) { // If we are closing it
      // Clear all search state
      setSearchQuery('');
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      // Also reset the trigger counter to avoid auto-search on reopening
      setSearchTriggerCounter(0);
    }
  };

  const handleSearchQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    if (event.target.value === '') {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
    }
  };

  const handleSearchSubmit = () => { // No longer async, just triggers the counter
    if (!searchQuery.trim()) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }
    setSearchTriggerCounter(prev => prev + 1); // Increment counter to trigger search in PDFViewer
    console.log('App.tsx: Search trigger counter incremented for query:', searchQuery);
  };

  const handleNextMatch = () => {
    if (searchMatches.length > 0) {
      setCurrentMatchIndex(prev => (prev + 1) % searchMatches.length);
    }
  };

  const handlePreviousMatch = () => {
    if (searchMatches.length > 0) {
      setCurrentMatchIndex(prev => (prev - 1 + searchMatches.length) % searchMatches.length);
    }
  };

  // Callback from PDFViewer with search results
  const onSearchResults = useCallback((matches: SearchMatch[]) => {
    setSearchMatches(matches);
    setCurrentMatchIndex(matches.length > 0 ? 0 : -1);
  }, []);

  // Reset goToPageNumber after each use
  useEffect(() => {
    if (goToPageNumber !== undefined) {
      const timeout = setTimeout(() => setGoToPageNumber(undefined), 300);
      return () => clearTimeout(timeout);
    }
  }, [goToPageNumber]);

  const togglePagePane = () => {
    setIsPagePaneOpen(prev => !prev);
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
          <CommandButton title="Toggle Page Pane" onClick={togglePagePane} active={isPagePaneOpen}>
            <img src={panelIcon} alt="Page Pane" style={iconStyle} />
          </CommandButton>
          <Divider />
          <CommandButton title="Open" onClick={handleOpenFile}>
            <img src={openIcon} alt="Open" style={iconStyle} />
          </CommandButton>
          <CommandButton title="Save" onClick={handleSave}>
            <img src={saveIcon} alt="Save" style={iconStyle} />
          </CommandButton>
          <CommandButton title="Save As" onClick={handleSaveAs}>
            <img src={saveAsIcon} alt="Save As" style={iconStyle} />
          </CommandButton>
          <Divider />
          <CommandButton title="Previous Page" onClick={() => handlePageChange(page - 1, true)}>
            <img src={previousPageIcon} alt="Previous Page" style={iconStyle} />
          </CommandButton>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={page}
            onChange={(e) => handlePageChange(parseInt(e.target.value) || 1, true)}
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
          <CommandButton title="Next Page" onClick={() => handlePageChange(page + 1, true)}>
            <img src={nextPageIcon} alt="Next Page" style={iconStyle} />
          </CommandButton>
          <Divider />
          <CommandButton title="Zoom Out" onClick={() => setZoom(prev => Math.max(25, prev - 25))}>
            <img src={zoomOutIcon} alt="Zoom Out" style={iconStyle} />
          </CommandButton>
          <img src={percentageIcon} alt="Zoom Level" style={{...iconStyle, width: 18, height: 18, marginRight: '4px', stroke: 'none', fill: '#555'}} />
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
            <img src={zoomInIcon} alt="Zoom In" style={iconStyle} />
          </CommandButton>
          <Divider />
          <CommandButton 
            title="Fit Page" 
            onClick={handleFitPageClick}
          >
            <img src={fitPageIcon} alt="Fit Page" style={iconStyle} />
          </CommandButton>
          <CommandButton 
            title="Full Width View" 
            onClick={handleFitWidthClick}
          >
            <img src={fullWidthIcon} alt="Full Width View" style={iconStyle} />
          </CommandButton>
          <CommandButton 
            title="Full Screen" 
            onClick={toggleFullScreen}
            active={isFullScreen}
          >
            <img src={fullScreenIcon} alt="Full Screen" style={iconStyle} />
          </CommandButton>
          <Divider />
          <CommandButton title="Search" onClick={toggleSearchInput} active={showSearchInput}>
            <img src={searchIcon} alt="Search" style={iconStyle} />
          </CommandButton>
          {showSearchInput && (
            <>
              <input
                id="searchInput"
                type="text"
                placeholder="Search PDF..."
                value={searchQuery}
                onChange={handleSearchQueryChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearchSubmit();
                  if (e.key === 'Escape') toggleSearchInput();
                }}
                style={{
                  width: 150,
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  color: '#222',
                  borderRadius: 8,
                  fontSize: 16,
                  margin: '0 6px',
                  padding: '4px 8px',
                  outline: 'none',
                  boxShadow: 'none',
                  height: 32,
                }}
              />
              <CommandButton title="Previous Match" onClick={handlePreviousMatch} disabled={searchMatches.length === 0}>
                <img src={previousPageIcon} alt="Previous Match" style={{...iconStyle, transform: 'rotate(90deg)'}} />
              </CommandButton>
              <span style={{ color: '#222', fontSize: 14, margin: '0 4px', minWidth: 40, textAlign: 'center'}}>
                {searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : '0/0'}
              </span>
              <CommandButton title="Next Match" onClick={handleNextMatch} disabled={searchMatches.length === 0}>
                <img src={nextPageIcon} alt="Next Match" style={{...iconStyle, transform: 'rotate(90deg)' }} />
              </CommandButton>
            </>
          )}
        </div>
      )}
      {/* PDF Viewer - Takes remaining space */}
      <div
        ref={pdfViewerContainerRef} // Assign ref here
        style={{
          flex: 1,
          display: 'flex', // Changed to flex to accommodate side pane
          flexDirection: 'row', // Children (pane and viewer) will be in a row
          overflow: viewMode === 'calculatingFitPage' && !isFullScreen ? 'hidden' : 'auto', // Prevent scrolling in Fit Page (non-fullscreen)
          background: isFullScreen ? '#000' : '#f8f9fa', 
          minHeight: 0,
          width: '100%',
          // height: '100%' is implicitly handled by flex: 1 in a flex column parent
        }}
      >
        {isPagePaneOpen && (
          <PDFPagePane 
            totalPages={totalPages}
            currentPage={page}
            onPageSelect={(selectedPage) => handlePageChange(selectedPage, true)} // Pass true for explicitGoTo
            isVisible={isPagePaneOpen} 
            pdfFile={pdfFile}
          />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 /* Important for flex item to shrink */ }}>
          {pdfFile ? (
            <PDFViewer
              file={pdfFile}
              zoom={zoom / 100}
              viewMode={viewMode}
              calculationTargetDimensions={calculationTargetDimensions}
              onDocumentLoaded={handlePdfLoaded}
              scrollToPageNumber={page}
              goToPageNumber={goToPageNumber} // NEW: only for explicit go to
              onVisiblePageChanged={handlePageChange}
              onOptimalScaleCalculated={handleOptimalScaleCalculated}
              singlePageView={isFullScreen || viewMode === 'calculatingFitPage'}
              // Search related props for PDFViewer
              searchQuery={searchQuery}
              searchMatches={searchMatches}
              currentMatchIndex={currentMatchIndex}
              onSearchResults={onSearchResults} 
              triggerSearch={searchTriggerCounter} 
            />
          ) : (
            'PDF Viewer Area'
          )}
        </div>
      </div>
    </div>
  )
}

function CommandButton({ 
  children, 
  title, 
  onClick,
  active = false,
  disabled = false
}: { 
  children: React.ReactNode, 
  title: string, 
  onClick?: () => void,
  active?: boolean,
  disabled?: boolean
}) {
  return (
    <button
      title={title}
      disabled={disabled}
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
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s',
        outline: 'none',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseOver={e => !active && !disabled && (e.currentTarget.style.background = '#ececec')}
      onMouseOut={e => !active && !disabled && (e.currentTarget.style.background = 'none')}
      onClick={!disabled ? onClick : undefined}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span style={{ height: 28, width: 1, background: '#e5e7eb', margin: '0 16px', display: 'inline-block', borderRadius: 1 }} />
}
