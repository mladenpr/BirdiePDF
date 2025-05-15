import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'

// Configure the worker
// pdf.worker.min.mjs should be copied to the root of the output directory by vite-plugin-static-copy
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// For debugging
console.log('PDF.js worker path:', pdfjs.GlobalWorkerOptions.workerSrc);
console.log('PDF.js version:', pdfjs.version);

const PAGES_TO_PRELOAD_BUFFER = 2; // Number of pages to preload before and after the visible ones

interface VisiblePageInfo {
  pageNumber: number;
  boundingClientRectTop: number;
}

export interface PDFViewerProps {
  file: string | Blob
  zoom?: number
  viewMode?: 'default' | 'fullPage' | 'fullWidth'
  onDocumentLoaded?: (pages: number) => void
  scrollToPageNumber?: number
  onVisiblePageChanged?: (pageNumber: number) => void
}

const PDFViewer = ({ 
  file,
  zoom = 1,
  viewMode = 'default',
  onDocumentLoaded,
  scrollToPageNumber,
  onVisiblePageChanged
}: PDFViewerProps) => {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [width, setWidth] = useState<number | undefined>(600)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visiblePageTimeoutRef = useRef<number | null>(null);

  const userHadRecentScroll = useRef(false);
  const userScrollTimeoutRef = useRef<number | null>(null);
  const lastProgrammaticScrollToPageRef = useRef<number | undefined>();

  // Log file info for debugging
  useEffect(() => {
    if (file) {
      console.log('PDF file type:', file instanceof Blob ? 'Blob' : typeof file);
      if (file instanceof Blob) {
        console.log('Blob size:', file.size);
        console.log('Blob type:', file.type);
      }
    }
  }, [file]);

  // Update width based on viewMode
  useEffect(() => {
    if (viewMode === 'fullWidth') {
      setWidth(undefined) // Use container width
    } else if (viewMode === 'fullPage') {
      setWidth(undefined) // Width will adjust to fit page height
    } else {
      setWidth(600 * zoom) // Default width with zoom applied
    }
    // When viewMode or zoom changes, re-evaluate rendered pages based on current visibility
    // This is implicitly handled by the existing IntersectionObserver re-observing if necessary,
    // or can be forced by re-initializing renderedPages if needed.
    // For now, let's rely on the observer.
  }, [viewMode, zoom])

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    console.log('PDF loaded successfully with', numPages, 'pages');
    setNumPages(numPages)
    setLoadError(null)
    
    // Initialize rendered pages
    const initialPages = new Set<number>();
    if (numPages > 0) {
      for (let i = 1; i <= Math.min(numPages, PAGES_TO_PRELOAD_BUFFER + 1); i++) {
        initialPages.add(i);
      }
      if (scrollToPageNumber) {
        for (let i = Math.max(1, scrollToPageNumber - PAGES_TO_PRELOAD_BUFFER); 
             i <= Math.min(numPages, scrollToPageNumber + PAGES_TO_PRELOAD_BUFFER); 
             i++) {
          initialPages.add(i);
        }
      }
    }
    setRenderedPages(initialPages);
    
    // Notify parent component
    if (onDocumentLoaded) {
      onDocumentLoaded(numPages)
    }
  }

  function onDocumentLoadError(error: Error) {
    console.error('Error loading PDF:', error);
    setLoadError(error);
    setRenderedPages(new Set()); // Clear rendered pages on error
  }

  useEffect(() => {
    // Initialize pageRefs and renderedPages when file changes
    pageRefs.current = {};
    setRenderedPages(new Set()); // Clear rendered pages when file changes, will be repopulated onDocumentLoadSuccess
  }, [file]); // Reset refs when file changes

  const handleUserScroll = useCallback(() => {
    userHadRecentScroll.current = true;
    const currentTimeoutId = userScrollTimeoutRef.current;
    if (currentTimeoutId !== null) {
      clearTimeout(currentTimeoutId);
    }
    userScrollTimeoutRef.current = window.setTimeout(() => {
      userHadRecentScroll.current = false;
    }, 300);
  }, []);

  useEffect(() => {
    // Cleanup scroll timeout on unmount
    return () => {
      const currentTimeoutId = userScrollTimeoutRef.current;
      if (currentTimeoutId !== null) {
        clearTimeout(currentTimeoutId);
      }
    };
  }, []);

  useEffect(() => {
    if (
      scrollToPageNumber &&
      scrollToPageNumber !== lastProgrammaticScrollToPageRef.current &&
      pageRefs.current[scrollToPageNumber]
    ) {
      if (!userHadRecentScroll.current) {
        pageRefs.current[scrollToPageNumber]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        lastProgrammaticScrollToPageRef.current = scrollToPageNumber;
      }
    } else if (!scrollToPageNumber) {
      // Reset if prop becomes undefined
      lastProgrammaticScrollToPageRef.current = undefined;
    }
  }, [scrollToPageNumber]);

  useEffect(() => {
    const options = {
      root: null, // viewport
      rootMargin: '0px',
      threshold: 0.5 // Trigger when 50% of the page is visible
    };

    // Debounce the callback slightly
    const debouncedUpdateVisiblePage = () => {
      let mostVisibleEntry: IntersectionObserverEntry | null = null;
      let maxRatio = 0;

      // Iterate over all observed entries from a new query (if observer is active)
      const currentObserver = observerRef.current;
      if (!currentObserver) return;

      // This is a common pattern: read all entries the observer is currently tracking.
      // Note: IntersectionObserver doesn't store entries after firing callback, so we observe and re-evaluate.
      // For simplicity here, we'll rely on the entries provided to handleIntersect directly.
      // A more robust approach might involve re-querying or managing a list of visible items.

      // The logic below will be inside handleIntersect based on entries provided to it.
    };

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      if (visiblePageTimeoutRef.current) {
        clearTimeout(visiblePageTimeoutRef.current);
      }

      // Update rendered pages based on intersection
      let newPagesToRenderFound = false;
      const currentRendered = new Set(renderedPages); // Work with a copy to batch updates

      entries.forEach(entry => {
        const pageNumStr = entry.target.getAttribute('data-page-number');
        if (pageNumStr) {
          const pageNumber = parseInt(pageNumStr, 10);
          if (entry.isIntersecting) {
            for (let i = Math.max(1, pageNumber - PAGES_TO_PRELOAD_BUFFER); 
                 i <= Math.min(numPages || 0, pageNumber + PAGES_TO_PRELOAD_BUFFER); 
                 i++) {
              if (!currentRendered.has(i)) {
                currentRendered.add(i);
                newPagesToRenderFound = true;
              }
            }
          }
          // Optional: Logic to "unrender" pages far from viewport can be added here
          // For now, we only add pages to render.
        }
      });

      if (newPagesToRenderFound) {
        setRenderedPages(currentRendered);
      }
      
      // Debounced update for the single most visible page (for onVisiblePageChanged prop)
      visiblePageTimeoutRef.current = window.setTimeout(() => {
        let topVisiblePage: VisiblePageInfo | null = null;

        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const pageNumStr = entry.target.getAttribute('data-page-number');
            if (pageNumStr) {
              const pageNumber = parseInt(pageNumStr, 10);
              if (pageNumber > 0) {
                const boundingClientRectTop = entry.boundingClientRect.top;
                if (topVisiblePage === null || boundingClientRectTop < topVisiblePage.boundingClientRectTop) {
                  topVisiblePage = { pageNumber, boundingClientRectTop };
                }
              }
            }
          }
        });

        if (topVisiblePage !== null && onVisiblePageChanged) {
          // At this point, topVisiblePage is guaranteed to be VisiblePageInfo
          onVisiblePageChanged(topVisiblePage.pageNumber);
        }
      }, 200); // Increased debounce to 200ms
    };

    observerRef.current = new IntersectionObserver(handleIntersect, options);
    const currentObserverInstance = observerRef.current; // Capture for cleanup

    // Observe all current page refs
    Object.values(pageRefs.current).forEach(pageEl => {
      if (pageEl) currentObserverInstance.observe(pageEl);
    });

    return () => {
      if (currentObserverInstance) {
        currentObserverInstance.disconnect();
      }
      if (visiblePageTimeoutRef.current) {
        clearTimeout(visiblePageTimeoutRef.current);
      }
    };
  // Ensure all dependencies are correctly listed, especially if pageRefs.current itself is modified elsewhere
  // Adding `file` dependency to re-run when the PDF changes and pageRefs are repopulated.
  }, [numPages, onVisiblePageChanged, file, renderedPages]); // Added renderedPages

  // Calculate scale based on viewMode
  const getScale = () => {
    if (viewMode === 'fullPage') {
      return 1 // Scale will be handled by the Page component's height property
    }
    return zoom
  }

  return (
    <div 
      onScroll={handleUserScroll}
      style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      marginTop: 16,
      width: '100%',
      height: viewMode === 'fullPage' ? '100%' : 'auto',
      overflow: 'auto'
    }}>
      <div style={{ 
        border: '1px solid #ccc', 
        borderRadius: 4, 
        overflow: 'auto', 
        background: '#222',
        height: viewMode === 'fullPage' ? 'calc(100% - 32px)' : 'auto',
        width: viewMode === 'fullWidth' ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
      }}>
        {loadError ? (
          <div style={{ color: 'white', padding: '20px', textAlign: 'center' }}>
            <h3>Error Loading PDF</h3>
            <p>{loadError.message}</p>
          </div>
        ) : (
          <Document 
            file={file} 
            onLoadSuccess={onDocumentLoadSuccess} 
            onLoadError={onDocumentLoadError}
            loading={<div style={{ color: 'white', padding: '20px' }}>Loading PDF...</div>}
          >
            {Array.from({ length: numPages || 0 }, (_, i) => {
               const pageNumber = i + 1;
               return (
                 <div 
                   key={pageNumber} 
                   style={{ margin: '24px 0', minHeight: '500px' /* Placeholder height */ }}
                   ref={(el: HTMLDivElement | null) => { pageRefs.current[pageNumber] = el; }}
                   data-page-number={pageNumber}
                 >
                   {renderedPages.has(pageNumber) ? (
                     <Page
                       pageNumber={pageNumber}
                       width={width}
                       scale={getScale()}
                       renderTextLayer={true}
                       renderAnnotationLayer={true}
                     />
                   ) : (
                     <div style={{ 
                       display: 'flex', 
                       justifyContent: 'center', 
                       alignItems: 'center', 
                       height: '100%', 
                       minHeight: '500px', /* Match approx page height */
                       color: 'grey' 
                     }}>
                       Loading page {pageNumber}...
                     </div>
                   )}
                 </div>
               );
            })}
          </Document>
        )}
      </div>
    </div>
  )
}

export default PDFViewer 