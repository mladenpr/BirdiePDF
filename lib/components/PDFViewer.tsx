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

const PAGES_TO_PRELOAD_BUFFER = 3; // Number of pages to preload before and after the visible ones

interface VisiblePageInfo {
  pageNumber: number;
  boundingClientRectTop: number;
}

export interface PDFViewerProps {
  file: string | Blob
  zoom?: number
  viewMode?: 'default' | 'calculatingFitPage' | 'calculatingFitWidth'
  calculationTargetDimensions?: { width: number; height: number } | null;
  onDocumentLoaded?: (pages: number) => void
  scrollToPageNumber?: number
  onVisiblePageChanged?: (pageNumber: number) => void
  onOptimalScaleCalculated?: (scale: number) => void
  singlePageView?: boolean
}

const PDFViewer = ({ 
  file,
  zoom = 1,
  viewMode = 'default',
  calculationTargetDimensions = null,
  onDocumentLoaded,
  scrollToPageNumber,
  onVisiblePageChanged,
  onOptimalScaleCalculated,
  singlePageView = false
}: PDFViewerProps) => {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageContainerSize, setPageContainerSize] = useState<{ width?: number; height?: number }>({});
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visiblePageTimeoutRef = useRef<number | null>(null);

  const userHadRecentScroll = useRef(false);
  const userScrollTimeoutRef = useRef<number | null>(null);
  const lastProgrammaticScrollToPageRef = useRef<number | undefined>(undefined);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const originalPageDimensionsRef = useRef<Record<number, {width: number; height: number}>>({});

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

  // Update width based on viewMode -- THIS LOGIC IS NOW PRIMARILY FOR CALCULATIONS, NOT DIRECT DISPLAY
  useEffect(() => {
    // We still need pageContainerSize for calculations, so update it if the container resizes.
    // This effect might be simplified or merged with ResizeObserver logic if direct display based on 'fullPage' is removed.
    if (pageContainerRef.current) {
      setPageContainerSize({
        width: pageContainerRef.current.clientWidth,
        height: pageContainerRef.current.clientHeight,
      });
    }
  }, [file, numPages]); // Removed viewMode, trigger on file/page changes or rely on ResizeObserver

  // Effect for ResizeObserver on pageContainerRef - to keep pageContainerSize updated for calculations
  useEffect(() => {
    if (!pageContainerRef.current) {
      return;
    }
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        console.log('PDFViewer: ResizeObserver triggered, updating pageContainerSize');
        setPageContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    resizeObserver.observe(pageContainerRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, []); // No viewMode dependency, always observe container

  // Calculate and report optimal scale for 'calculatingFitWidth' mode
  useEffect(() => {
    if (
      viewMode === 'calculatingFitWidth' &&
      onOptimalScaleCalculated
    ) {
      const pageToUse = scrollToPageNumber || 1;
      const pageDimensions = originalPageDimensionsRef.current[pageToUse];
      const containerWidth = calculationTargetDimensions?.width || pageContainerRef.current?.clientWidth;

      if (pageDimensions?.width && containerWidth) {
        if (containerWidth > 0 && pageDimensions.width > 0) {
          console.log('PDFViewer: Calculating optimal scale for full width', {containerWidth, pageOriginalWidth: pageDimensions.width, pageToUse});
          const fitScale = containerWidth / pageDimensions.width;
          onOptimalScaleCalculated(fitScale);
        } else {
          console.log('PDFViewer: Using default scale (1) for full width due to invalid dimensions');
          onOptimalScaleCalculated(1);
        }
      } else {
        const timeoutId = setTimeout(() => {
          if (viewMode === 'calculatingFitWidth' && onOptimalScaleCalculated) {
            const laterContainerWidth = calculationTargetDimensions?.width || pageContainerRef.current?.clientWidth;
            const laterPageDimensions = originalPageDimensionsRef.current[pageToUse];
            if (laterContainerWidth && laterPageDimensions?.width && laterPageDimensions.width > 0) {
              console.log('PDFViewer: Retry successful - calculating optimal scale for fitWidth');
              const fitScale = laterContainerWidth / laterPageDimensions.width;
              onOptimalScaleCalculated(fitScale);
            } else {
              console.log('PDFViewer: Using fallback scale (1) for fitWidth after retry');
              onOptimalScaleCalculated(1);
            }
          }
        }, 100);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [viewMode, scrollToPageNumber, onOptimalScaleCalculated, originalPageDimensionsRef, pageContainerSize.width, calculationTargetDimensions, file, numPages]);

  // Calculate and report optimal scale for 'calculatingFitPage' mode
  useEffect(() => {
    if (
      viewMode === 'calculatingFitPage' &&
      onOptimalScaleCalculated
    ) {
      const targetWidth = calculationTargetDimensions?.width || pageContainerSize.width;
      const targetHeight = calculationTargetDimensions?.height || pageContainerSize.height;
      const pageToUse = scrollToPageNumber || 1;
      const pageDimensions = originalPageDimensionsRef.current[pageToUse];

      if (targetWidth && targetHeight && pageDimensions?.width && pageDimensions?.height && pageDimensions.width > 0 && pageDimensions.height > 0) {
        const scaleX = targetWidth / pageDimensions.width;
        const scaleY = targetHeight / pageDimensions.height;
        const fitScale = Math.min(scaleX, scaleY);
        
        if (fitScale > 0.01) {
          console.log('PDFViewer: Calculating optimal scale for full page', { fitScale, pageToUse, targetWidth, targetHeight, pageDimensions });
          onOptimalScaleCalculated(fitScale);
        } else {
          console.warn('PDFViewer: Calculated fitScale for fullPage is too small, defaulting to 1', { fitScale });
          onOptimalScaleCalculated(1);
        }
      } else if (pageDimensions) {
          console.warn('PDFViewer: Using default scale (1) for full page due to zero/missing dimension(s) for page', pageToUse, {targetWidth, targetHeight});
          onOptimalScaleCalculated(1);
      } else {
        console.warn(`PDFViewer: fullPage mode, but original dimensions for page ${pageToUse} are not available. Retrying.`);
        const timeoutId = setTimeout(() => {
           if (viewMode === 'calculatingFitPage' && onOptimalScaleCalculated) { // Check viewMode again inside timeout
            const freshTargetWidth = calculationTargetDimensions?.width || pageContainerSize.width;
            const freshTargetHeight = calculationTargetDimensions?.height || pageContainerSize.height;
            const freshPageDimensions = originalPageDimensionsRef.current[pageToUse];
            if (freshTargetWidth && freshTargetHeight && freshPageDimensions?.width && freshPageDimensions.width > 0 && freshPageDimensions?.height && freshPageDimensions.height > 0) {
              const scaleX = freshTargetWidth / freshPageDimensions.width;
              const scaleY = freshTargetHeight / freshPageDimensions.height;
              const fitScale = Math.min(scaleX, scaleY);
              if (fitScale > 0.01) {
                onOptimalScaleCalculated(fitScale);
              } else { onOptimalScaleCalculated(1); }
            } else {
              console.warn('PDFViewer: Fallback to scale 1 for fullPage after retry, dimensions still missing/invalid for page', pageToUse, {freshTargetWidth, freshTargetHeight});
              onOptimalScaleCalculated(1);
            }
           }
        },150); 
        return () => clearTimeout(timeoutId);
      }
    }
  }, [viewMode, pageContainerSize, scrollToPageNumber, onOptimalScaleCalculated, originalPageDimensionsRef, calculationTargetDimensions, numPages, file]);

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
                  topVisiblePage = { pageNumber, boundingClientRectTop } as VisiblePageInfo;
                }
              }
            }
          }
        });

        if (topVisiblePage !== null && onVisiblePageChanged) {
          // At this point, topVisiblePage is guaranteed to be VisiblePageInfo
          onVisiblePageChanged((topVisiblePage as VisiblePageInfo).pageNumber);
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
  }, [numPages, onVisiblePageChanged, file, renderedPages, viewMode]); // Added viewMode

  // getDynamicPageProps should now ALWAYS return scale based on App's zoom, as viewModes are for calculation signals only.
  const getDynamicPageProps = () => {
    // console.log(`PDFViewer: getDynamicPageProps, current App zoom prop (as scale): ${zoom}, viewMode signal: ${viewMode}`);
    // All rendering is now based on the zoom prop controlled by App.tsx (passed as `scale` to Page)
    // The 'calculatingFitPage' and 'calculatingFitWidth' viewModes are signals for useEffect hooks to calculate and callback,
    // not for direct rendering changes within this function for an intermediate state.
    // App.tsx will set viewMode to 'default' and update the zoom prop for the actual visual render change.
    return { width: undefined, height: undefined, scale: zoom }; // `zoom` is the prop from App.tsx (e.g., 0.75 for 75%)
  };

  return (
    <div 
      onScroll={handleUserScroll}
      style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      marginTop: singlePageView ? 0 : 4,
      width: '100%',
      height: '100%',
      overflow: 'auto',
      justifyContent: singlePageView ? 'center' : undefined,
    }}>
      <div 
        ref={pageContainerRef}
        style={{ 
        border: singlePageView ? 'none' : '0px solid #ccc',
        borderRadius: singlePageView ? 0 : 4,
        overflow: 'auto', 
        background: singlePageView ? 'transparent' : '#f8f9fa',
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: singlePageView ? 'center' : 'flex-start',
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
            {singlePageView
              ? (() => {
                  const pageNumber = scrollToPageNumber || 1;
                  const pageProps = getDynamicPageProps();
                  return (
                    <div 
                      key={pageNumber} 
                      style={{ margin: 0, minHeight: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}
                      ref={(el: HTMLDivElement | null) => { pageRefs.current[pageNumber] = el; }}
                      data-page-number={pageNumber}
                    >
                      <Page
                        pageNumber={pageNumber}
                        width={pageProps.width}
                        height={pageProps.height}
                        scale={pageProps.scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        onLoadSuccess={(pageData) => {
                          if (originalPageDimensionsRef.current) {
                            originalPageDimensionsRef.current[pageNumber] = {
                              width: pageData.originalWidth,
                              height: pageData.originalHeight,
                            };
                          }
                        }}
                      />
                    </div>
                  );
                })()
              : Array.from({ length: numPages || 0 }, (_, i) => {
                  const pageNumber = i + 1;
                  const pageProps = getDynamicPageProps();
                  return (
                    <div 
                      key={pageNumber} 
                      style={{ margin: '4px 0', minHeight: '500px' }}
                      ref={(el: HTMLDivElement | null) => { pageRefs.current[pageNumber] = el; }}
                      data-page-number={pageNumber}
                    >
                      {renderedPages.has(pageNumber) ? (
                        <Page
                          pageNumber={pageNumber}
                          width={pageProps.width}
                          height={pageProps.height}
                          scale={pageProps.scale}
                          renderTextLayer={true}
                          renderAnnotationLayer={true}
                          onLoadSuccess={(pageData) => {
                            if (originalPageDimensionsRef.current) {
                              originalPageDimensionsRef.current[pageNumber] = {
                                width: pageData.originalWidth,
                                height: pageData.originalHeight,
                              };
                            }
                          }}
                        />
                      ) : (
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'center', 
                          alignItems: 'center', 
                          height: '100%', 
                          minHeight: '500px',
                          color: 'grey' 
                        }}>
                          Loading page {pageNumber}...
                        </div>
                      )}
                    </div>
                  );
                })
            }
          </Document>
        )}
      </div>
    </div>
  )
}

export default PDFViewer 