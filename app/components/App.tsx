import '../styles/app.css'
import { useState, useCallback, useRef, useEffect, useLayoutEffect, forwardRef } from 'react'
import PDFViewer from '@/lib/components/PDF/PDFViewer/PDFViewer'
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
import pointerIcon from '../assets/icons/pointer.svg';
import panIcon from '../assets/icons/drag.svg';
import type { SearchMatch } from '@/lib/components/PDF/PDFViewer/types';
import PDFPagePane from '@/lib/components/PDF/PDFPagePane/PDFPagePane';
import CommandButton from '@/lib/components/UI/CommandButton';
import Divider from '@/lib/components/UI/Divider';

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
  const [interactionMode, setInteractionMode] = useState<'pointer' | 'pan'>('pointer'); // NEW: Interaction mode

  // Search state
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [searchTriggerCounter, setSearchTriggerCounter] = useState(0);

  // State for responsive command bar
  const [showZoomControls, setShowZoomControls] = useState(true);
  const [showViewControls, setShowViewControls] = useState(true);
  const [showPageInput, setShowPageInput] = useState(true);
  // showSearchInputText is implicitly controlled by showSearchInput and available space

  // Refs for command bar elements
  const commandBarRef = useRef<HTMLDivElement>(null);
  const panelBtnRef = useRef<HTMLButtonElement>(null);
  const fileOpsRefs = [useRef<HTMLButtonElement>(null), useRef<HTMLButtonElement>(null), useRef<HTMLButtonElement>(null)];
  const pageNavBtnsRefs = [useRef<HTMLButtonElement>(null), useRef<HTMLButtonElement>(null)];
  const pageInputRef = useRef<HTMLDivElement>(null); // For the div wrapping input and total pages
  const zoomControlsRef = useRef<HTMLDivElement>(null);
  const viewControlsRef = useRef<HTMLDivElement>(null);
  const fullScreenBtnRef = useRef<HTMLButtonElement>(null);
  const interactionModeBtnRef = useRef<HTMLButtonElement>(null);
  const searchToggleBtnRef = useRef<HTMLButtonElement>(null);
  const searchInputFieldsRef = useRef<HTMLDivElement>(null); // For the div wrapping search input and nav
  const dividerRefs = [useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null)];

  // Add refs for each group at the top of the App component
  const pagesGroupRef = useRef<HTMLDivElement>(null);
  const fileGroupRef = useRef<HTMLDivElement>(null);
  const navigationGroupRef = useRef<HTMLDivElement>(null);
  const zoomGroupRef = useRef<HTMLDivElement>(null);
  const viewGroupRef = useRef<HTMLDivElement>(null);
  const pointerGroupRef = useRef<HTMLDivElement>(null);
  const searchGroupRef = useRef<HTMLDivElement>(null);

  // Replace all individual show* state variables with a single state object
  const [visibleGroups, setVisibleGroups] = useState({
    zoom: true,
    view: true,
    search: true,
    file: true,
    pages: true,
    navigation: true,
    pointer: true
  });

  // NEW: This state will store the widths of each group once measured
  const [groupWidths, setGroupWidths] = useState<Record<string, number>>({});

  // Cache for divider widths
  const [dividerWidths, setDividerWidths] = useState<number[]>([]);

  // Flag to track if initial measurement is complete
  const [initialMeasurementComplete, setInitialMeasurementComplete] = useState(false);

  // Define the order in which groups should be hidden
  const groupHidePriority = ['zoom', 'view', 'search', 'file', 'pages', 'navigation', 'pointer'];

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

  // Replace the previous useLayoutEffect for group hiding
  useLayoutEffect(() => {
    // Helper function to measure all group widths (runs only once)
    function measureAllGroupWidths() {
      if (!commandBarRef.current) return false;
      
      console.log("==== MEASURING ALL GROUP WIDTHS (with margins) ====");
      const widths: Record<string, number> = {};
      
      // Helper to get total width including margins
      function getTotalGroupWidth(ref: React.RefObject<HTMLDivElement | null>, groupName: string) {
        if (!ref.current) {
          console.warn(`Ref for group '${groupName}' is null at measurement time.`);
          return 0;
        }
        const style = window.getComputedStyle(ref.current);
        const marginLeft = parseFloat(style.marginLeft) || 0;
        const marginRight = parseFloat(style.marginRight) || 0;
        const total = ref.current.offsetWidth + marginLeft + marginRight;
        console.log(`Group '${groupName}' offsetWidth:`, ref.current.offsetWidth, 'marginLeft:', marginLeft, 'marginRight:', marginRight, 'total:', total);
        // Extra debug: log children and computed style
        if (groupName === 'zoom') {
          console.log('Zoom group ref:', ref.current);
          console.log('Zoom group children:', ref.current.children);
          console.log('Zoom group computed style:', style);
        }
        return total;
      }
      
      widths.zoom = getTotalGroupWidth(zoomGroupRef, 'zoom');
      widths.view = getTotalGroupWidth(viewGroupRef, 'view');
      widths.search = getTotalGroupWidth(searchGroupRef, 'search');
      widths.file = getTotalGroupWidth(fileGroupRef, 'file');
      widths.pages = getTotalGroupWidth(pagesGroupRef, 'pages');
      widths.navigation = getTotalGroupWidth(navigationGroupRef, 'navigation');
      widths.pointer = getTotalGroupWidth(pointerGroupRef, 'pointer');
      
      // Measure divider widths
      const divWidths = dividerRefs.map(ref => ref.current?.offsetWidth || 0);
      
      console.log("Measured group widths (with margins):", widths);
      console.log("Measured divider widths:", divWidths);
      
      setGroupWidths(widths);
      setDividerWidths(divWidths);
      setInitialMeasurementComplete(true);
      return true;
    }
    
    // Helper function to calculate which groups to show based on available width
    function determineVisibleGroups() {
      if (!commandBarRef.current || !initialMeasurementComplete) return;
      
      const style = window.getComputedStyle(commandBarRef.current);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;
      const gap = parseFloat(style.gap) || 0;
      const availableWidth = commandBarRef.current.offsetWidth - paddingLeft - paddingRight;
      console.log("Available container width (minus padding):", availableWidth);
      
      // Add a safety buffer to prevent overflow (account for any miscalculations or margins)
      const SAFETY_BUFFER = 0; // Extra pixels to prevent overflow
      const effectiveAvailableWidth = availableWidth - SAFETY_BUFFER;
      console.log("Effective available width (with safety buffer):", effectiveAvailableWidth);
      
      // Start with all groups visible
      const newVisibility = {
        zoom: true,
        view: true,
        search: true,
        file: true,
        pages: true,
        navigation: true,
        pointer: true
      };
      
      // Get actual divider width (average from measured dividers)
      const avgDividerWidth = dividerWidths.length > 0 
        ? dividerWidths.reduce((sum, width) => sum + width, 0) / dividerWidths.length 
        : 0;
      console.log("Average divider width:", avgDividerWidth);
      
      // Calculate total width with all groups visible
      let totalWidth = 0;
      let visibleGroupsCount = 0;
      
      for (const group of Object.keys(newVisibility)) {
        totalWidth += groupWidths[group] || 0;
        visibleGroupsCount += 1;
        console.log(`Group '${group}' width:`, groupWidths[group] || 0);
      }
      
      // Add width of dividers (when all groups visible)
      const maxVisibleDividers = Math.min(dividerWidths.length, Object.keys(newVisibility).length - 1);
      totalWidth += maxVisibleDividers * avgDividerWidth;
      
      // Add total gap width between groups
      const totalGapWidth = gap * (visibleGroupsCount - 1);
      totalWidth += totalGapWidth;
      console.log(`Flex gap: ${gap}px, total gap width: ${totalGapWidth}px`);
      
      console.log("Total width with all groups:", totalWidth);
      console.log("Difference:", totalWidth - effectiveAvailableWidth);
      
      // If total width exceeds available width, start hiding groups in priority order
      if (totalWidth > effectiveAvailableWidth) {
        console.log("Need to hide some groups");
        
        // Copy of newVisibility to track which groups are still visible during iteration
        let currentVisibility = {...newVisibility};
        
        // Try hiding groups one by one in priority order
        for (const group of groupHidePriority) {
          // Skip if already all groups fit
          if (totalWidth <= effectiveAvailableWidth) break;
          
          // Calculate how much width we save by hiding this group
          // First, the group itself
          const groupWidth = groupWidths[group] || 0;
          
          // Next, any dividers that would no longer be needed
          // (simplified logic - in reality we'd need to check which dividers are affected)
          let dividerWidthSaved = avgDividerWidth; // Assume at least one divider is saved
          
          // Total width saved by hiding this group
          const widthSaved = groupWidth + dividerWidthSaved;
          
          // Hide this group
          newVisibility[group] = false;
          currentVisibility[group] = false;
          totalWidth -= widthSaved;
          
          console.log(`Hiding '${group}' group saves ${widthSaved}px (group: ${groupWidth}px, divider: ~${dividerWidthSaved}px)`);
          console.log(`New total width after hiding '${group}': ${totalWidth}px`);
        }
      }
      
      console.log("Final visibility:", newVisibility);
      console.log("Final theoretical width:", totalWidth);
      
      setVisibleGroups(newVisibility);
    }
    
    // Main logic
    if (!initialMeasurementComplete) {
      // First pass: force all groups to be visible and measure their widths
      setVisibleGroups({
        zoom: true,
        view: true,
        search: true,
        file: true,
        pages: true,
        navigation: true,
        pointer: true
      });
      // Use requestAnimationFrame to ensure DOM is ready before measuring
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (measureAllGroupWidths()) {
            // Once measurement is complete, immediately determine which groups to show
            determineVisibleGroups();
          }
        }, 50); // Short timeout to ensure DOM is painted
      });
    } else {
      // Subsequent passes: use existing measurements to determine visibility
      determineVisibleGroups();
    }
    
    // Add resize event listener
    function handleResize() {
      if (initialMeasurementComplete) {
        determineVisibleGroups();
      }
    }
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initialMeasurementComplete, groupWidths, dividerWidths]); // Only dependencies that don't change frequently

  useEffect(() => {
    if (isFullScreen) {
      setTimeout(() => {
        console.log('--- Command Bar Group Widths (Full Screen) ---');
        console.log('Pages Group:', pagesGroupRef.current?.offsetWidth || 0, 'px');
        console.log('File Group:', fileGroupRef.current?.offsetWidth || 0, 'px');
        console.log('Navigation Group:', navigationGroupRef.current?.offsetWidth || 0, 'px');
        console.log('Zoom Group:', zoomGroupRef.current?.offsetWidth || 0, 'px');
        console.log('View Group:', viewGroupRef.current?.offsetWidth || 0, 'px');
        console.log('Pointer Group:', pointerGroupRef.current?.offsetWidth || 0, 'px');
        console.log('Search Group:', searchGroupRef.current?.offsetWidth || 0, 'px');
      }, 100);
    }
  }, [isFullScreen]);

  // Log command bar width on resize when not in fullscreen
  useEffect(() => {
    function logCommandBarWidth() {
      if (!isFullScreen && commandBarRef.current) {
        console.log('Command Bar Width (not fullscreen):', commandBarRef.current.offsetWidth, 'px');
      }
    }
    window.addEventListener('resize', logCommandBarWidth);
    // Log once on mount
    logCommandBarWidth();
    return () => window.removeEventListener('resize', logCommandBarWidth);
  }, [isFullScreen]);

  return (
    <div style={{
      width: '100%',
      background: '#f8f9fa',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      height: '100vh',
      overflow: 'hidden',
      overflowX: 'hidden',
    }}>
      {/* Command Palette - Render only if not in fullscreen */}
      { !isFullScreen && (
        <div 
          ref={commandBarRef}
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            padding: '10px 24px 10px 24px',
            borderBottom: '1px solid #e5e7eb',
            background: '#f8f9fa',
            minHeight: 48,
            fontFamily: 'inherit',
            minWidth: 0,
          }}>
          {/* Pages Group */}
          {visibleGroups.pages && (
            <div ref={pagesGroupRef} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <CommandButton ref={panelBtnRef} title="Toggle Page Pane" onClick={togglePagePane} active={isPagePaneOpen}>
                <img src={panelIcon} alt="Page Pane" style={iconStyle} />
              </CommandButton>
            </div>
          )}
          {visibleGroups.pages && visibleGroups.file && <Divider ref={dividerRefs[0]} />}
          {/* File Group */}
          {visibleGroups.file && (
            <div ref={fileGroupRef} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <CommandButton ref={fileOpsRefs[0]} title="Open" onClick={handleOpenFile}>
                <img src={openIcon} alt="Open" style={iconStyle} />
              </CommandButton>
              <CommandButton ref={fileOpsRefs[1]} title="Save" onClick={handleSave}>
                <img src={saveIcon} alt="Save" style={iconStyle} />
              </CommandButton>
              <CommandButton ref={fileOpsRefs[2]} title="Save As" onClick={handleSaveAs}>
                <img src={saveAsIcon} alt="Save As" style={iconStyle} />
              </CommandButton>
            </div>
          )}
          {visibleGroups.file && visibleGroups.navigation && <Divider ref={dividerRefs[1]} />}
          {/* Navigation Group */}
          {visibleGroups.navigation && (
            <div ref={navigationGroupRef} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <CommandButton ref={pageNavBtnsRefs[0]} title="Previous Page" onClick={() => handlePageChange(page - 1, true)}>
                <img src={previousPageIcon} alt="Previous Page" style={iconStyle} />
              </CommandButton>
              <div ref={pageInputRef} style={{ display: 'flex', alignItems: 'center' }}>
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
              </div>
              <CommandButton ref={pageNavBtnsRefs[1]} title="Next Page" onClick={() => handlePageChange(page + 1, true)}>
                <img src={nextPageIcon} alt="Next Page" style={iconStyle} />
              </CommandButton>
            </div>
          )}
          {visibleGroups.navigation && visibleGroups.zoom && <Divider ref={dividerRefs[2]} />}
          {/* Zoom Group */}
          {visibleGroups.zoom && (
            <div ref={zoomGroupRef} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <CommandButton title="Zoom Out" onClick={() => setZoom(prev => Math.max(25, prev - 25))}>
                <img src={zoomOutIcon} alt="Zoom Out" style={iconStyle} />
              </CommandButton>
              <input
                type="text"
                value={zoomInput}
                onChange={handleZoomInputChange}
                onBlur={handleZoomInputBlur}
                onKeyDown={handleZoomInputKeyDown}
                style={{
                  width: 45,
                  textAlign: 'center',
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  color: '#222',
                  borderRadius: 8,
                  fontSize: 16,
                  margin: '0 6px 0 0',
                  padding: '4px 0',
                  outline: 'none',
                  boxShadow: 'none',
                  height: 32,
                }}
              />
              <img src={percentageIcon} alt="Zoom Level" style={{...iconStyle, width: 18, height: 18, margin: '0 4px 0 2px', stroke: 'none', fill: '#555'}} />
              <CommandButton title="Zoom In" onClick={() => setZoom(prev => Math.min(400, prev + 25))}>
                <img src={zoomInIcon} alt="Zoom In" style={iconStyle} />
              </CommandButton>
            </div>
          )}
          {visibleGroups.zoom && visibleGroups.view && <Divider ref={dividerRefs[3]} />}
          {/* View Group */}
          {visibleGroups.view && (
            <div ref={viewGroupRef} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
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
                ref={fullScreenBtnRef}
                title="Full Screen" 
                onClick={toggleFullScreen}
                active={isFullScreen}
              >
                <img src={fullScreenIcon} alt="Full Screen" style={iconStyle} />
              </CommandButton>
            </div>
          )}
          {visibleGroups.view && visibleGroups.pointer && <Divider ref={dividerRefs[4]} />}
          {/* Pointer Group */}
          {visibleGroups.pointer && (
            <div ref={pointerGroupRef} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <CommandButton 
                ref={interactionModeBtnRef}
                title={interactionMode === 'pointer' ? "Switch to Pan Mode (Drag Document)" : "Switch to Pointer Mode (Select Text)"}
                onClick={() => setInteractionMode(prev => prev === 'pointer' ? 'pan' : 'pointer')}
                active={interactionMode === 'pan'}
              >
                <img 
                  src={interactionMode === 'pointer' ? panIcon : pointerIcon} 
                  alt={interactionMode === 'pointer' ? "Pan Tool" : "Pointer Tool"} 
                  style={iconStyle} 
                />
              </CommandButton>
            </div>
          )}
          {/* Search Group */}
          {visibleGroups.search && (
            <div ref={searchGroupRef} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <CommandButton ref={searchToggleBtnRef} title="Search" onClick={toggleSearchInput} active={showSearchInput}>
                <img src={searchIcon} alt="Search" style={iconStyle} />
              </CommandButton>
              {showSearchInput && (
                <div ref={searchInputFieldsRef} style={{ display: 'flex', alignItems: 'center' }}>
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
                </div>
              )}
            </div>
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
              interactionMode={interactionMode} // Pass interaction mode
            />
          ) : (
            'PDF Viewer Area'
          )}
        </div>
      </div>
    </div>
  )
}
