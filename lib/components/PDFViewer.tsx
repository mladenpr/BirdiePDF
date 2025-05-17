import React, { useState, useCallback, useEffect, useRef } from 'react'
// console.log('Triggering linter for PDFViewer.tsx'); // This line will be part of the no-op
import { Document, Page, pdfjs, PageProps } from 'react-pdf'

// Import the CSS files in a way that's compatible with Electron bundling
// Make imports explicit to ensure they're included in the bundle
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'

// Add debug statement to confirm CSS imports
console.log('PDF CSS imports loaded:', 
  Boolean(document.querySelector('style'))
);

// Custom CSS for search highlighting
import './PDFViewerSearch.css' // CSS for search result highlighting

/**
 * PDF Search Highlighting Implementation Notes:
 * 
 * The text highlighting works by:
 * 1. Extracting text content from each PDF page using pageData.getTextContent()
 * 2. Storing text items in textItemsByPage state for searching
 * 3. When a search is triggered, we find matches and their positions in textItemsByPage
 * 4. For matched text items, our customTextRenderer adds a special marker suffix (::highlight or ::highlightCurrent)
 * 5. These markers are added to the actual text content, which react-pdf puts in data-text-content attributes
 * 6. Our CSS in PDFViewerSearch.css targets elements with these markers using attribute selectors
 * 
 * For improvements/future work:
 * - Consider implementing more precise highlighting (current approach highlights the entire text chunk)
 * - Add options for case sensitivity, whole word matching, etc.
 * - Consider using a Web Worker for searching large documents
 */

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

// Define a more specific type for search matches
export interface SearchMatch {
  pageIndex: number; // 0-indexed page number
  itemIndex: number; // Index of the text item on the page
  text: string; // The full text of the item where match was found
  query: string; // The search query that was matched
  startIndexInItem: number; // Start char index of the match within item.text
  endIndexInItem: number; // End char index of the match
  // Optional: position/bounding box for direct rendering if needed later
  // transform?: number[]; // from item.transform
  // width?: number; // from item.width
  // height?: number; // from item.height
}

export interface PDFViewerProps {
  file: string | Blob
  zoom?: number
  viewMode?: 'default' | 'calculatingFitPage' | 'calculatingFitWidth'
  calculationTargetDimensions?: { width: number; height: number } | null;
  onDocumentLoaded?: (pages: number) => void
  scrollToPageNumber?: number
  goToPageNumber?: number
  onVisiblePageChanged?: (pageNumber: number) => void
  onOptimalScaleCalculated?: (scale: number) => void
  singlePageView?: boolean
  // Search related props
  searchQuery?: string;
  currentMatchIndex?: number;
  onSearchResults?: (matches: SearchMatch[]) => void;
  searchMatches?: SearchMatch[];
  triggerSearch?: number; // Changed to number to accept the counter
}

const PDFViewer = ({ 
  file,
  zoom = 1,
  viewMode = 'default',
  calculationTargetDimensions = null,
  onDocumentLoaded,
  scrollToPageNumber,
  goToPageNumber,
  onVisiblePageChanged,
  onOptimalScaleCalculated,
  singlePageView = false,
  // Destructure search props
  searchQuery,
  currentMatchIndex,
  onSearchResults,
  searchMatches,
  triggerSearch,
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
  const [textItemsByPage, setTextItemsByPage] = useState<Record<number, any[]>>({}); // To store text items for search

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
    
    // Log information about the document styling (for debugging)
    setTimeout(() => {
      const textLayers = document.querySelectorAll('.react-pdf__Page__textContent');
      console.log(`PDFViewer: Found ${textLayers.length} text layers`);
      if (textLayers.length > 0) {
        const firstLayer = textLayers[0];
        console.log('PDFViewer: First text layer styles:', window.getComputedStyle(firstLayer));
        
        const spans = firstLayer.querySelectorAll('span');
        console.log(`PDFViewer: First text layer has ${spans.length} spans`);
        if (spans.length > 0) {
          console.log('PDFViewer: First span attributes:', 
            Array.from(spans[0].attributes).map(attr => `${attr.name}="${attr.value}"`).join(', ')
          );
          console.log('PDFViewer: First span styles:', window.getComputedStyle(spans[0]));
        }
      }
    }, 1000);
    
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

  // Only scroll to page for explicit Go to Page actions
  useEffect(() => {
    if (
      goToPageNumber &&
      goToPageNumber !== lastProgrammaticScrollToPageRef.current &&
      pageRefs.current[goToPageNumber]
    ) {
      pageRefs.current[goToPageNumber]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      lastProgrammaticScrollToPageRef.current = goToPageNumber;
    } else if (!goToPageNumber) {
      // Reset if prop becomes undefined
      lastProgrammaticScrollToPageRef.current = undefined;
    }
  }, [goToPageNumber]);

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

  // Effect for handling search trigger
  useEffect(() => {
    if (triggerSearch && searchQuery && searchQuery.trim() !== '' && numPages && onSearchResults && textItemsByPage) {
      console.log('PDFViewer: Search triggered for query:', searchQuery);
      const allFoundMatches: SearchMatch[] = []; 
      const queryLower = searchQuery.toLowerCase();

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const pageTextItems = textItemsByPage[pageNum] || [];
        pageTextItems.forEach((item, itemIdx) => {
          const itemTextLower = item.str.toLowerCase();
          let startIndex = itemTextLower.indexOf(queryLower);
          while (startIndex !== -1) {
            allFoundMatches.push({ 
              pageIndex: pageNum - 1, 
              itemIndex: itemIdx, 
              text: item.str, 
              query: searchQuery, 
              startIndexInItem: startIndex,
              endIndexInItem: startIndex + queryLower.length,
            });
            startIndex = itemTextLower.indexOf(queryLower, startIndex + 1); 
          }
        });
      }
      console.log('PDFViewer: Found matches:', allFoundMatches);
      if (onSearchResults) {
        onSearchResults(allFoundMatches);
      }
    }
  }, [triggerSearch, searchQuery, numPages, textItemsByPage, onSearchResults]);

  // Direct DOM manipulation for highlighting as a fallback for when CSS selectors don't work
  useEffect(() => {
    if (searchMatches && searchMatches.length > 0) {
      // Short timeout to ensure the text layer is rendered
      const timeoutId = setTimeout(() => {
        console.log('PDFViewer: Attempting direct DOM manipulation for highlighting');
        
        // First, reset any previous direct highlights
        document.querySelectorAll('.pdf-direct-highlight, .pdf-direct-highlight-current').forEach(el => {
          (el as HTMLElement).style.backgroundColor = '';
          (el as HTMLElement).style.color = '';
          el.classList.remove('pdf-direct-highlight', 'pdf-direct-highlight-current');
        });
        
        // For each match, try to find span with the specific data-text-content
        searchMatches.forEach((match, idx) => {
          const pageNum = match.pageIndex + 1;
          const page = document.querySelector(`.react-pdf__Page[data-page-number="${pageNum}"]`);
          if (!page) return;
          
          const textLayer = page.querySelector('.react-pdf__Page__textContent');
          if (!textLayer) return;
          
          const matchedText = match.text;
          const isCurrent = idx === currentMatchIndex;
          
          // Try to find the span with our text
          const spans = textLayer.querySelectorAll('span[data-text-content]');
          spans.forEach(span => {
            const content = span.getAttribute('data-text-content');
            if (content && content.includes(matchedText)) {
              // Found text, apply direct styling
              console.log(`PDFViewer: Direct highlight applied to "${matchedText}" on page ${pageNum}`);
              (span as HTMLElement).style.backgroundColor = isCurrent ? 'cyan' : 'red';
              (span as HTMLElement).style.color = 'black';
              span.classList.add(isCurrent ? 'pdf-direct-highlight-current' : 'pdf-direct-highlight');
            }
          });
        });
      }, 500); // Small delay to ensure text layer is rendered
      
      return () => clearTimeout(timeoutId);
    }
  }, [searchMatches, currentMatchIndex]);

  // Effect for scrolling to the current match
  useEffect(() => {
    if (searchQuery && searchMatches && currentMatchIndex !== undefined && currentMatchIndex >= 0) {
      console.log('PDFViewer: Scroll to match index:', currentMatchIndex);
      const matchToScrollTo = searchMatches[currentMatchIndex];
      if (matchToScrollTo) {
        const pageElement = pageRefs.current[matchToScrollTo.pageIndex + 1];
        if (pageElement) {
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          console.log(`Scrolling to page ${matchToScrollTo.pageIndex + 1} for current match.`);
          // Try to scroll the specific mark into view if possible
          const markId = `current-match-${matchToScrollTo.pageIndex}-${matchToScrollTo.itemIndex}-${searchMatches.filter(m => m.pageIndex === matchToScrollTo.pageIndex && m.itemIndex === matchToScrollTo.itemIndex).findIndex(m => m === matchToScrollTo)}`;
          const markElement = document.getElementById(markId);
          if (markElement) {
            markElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            console.log('Scrolled to specific mark:', markId);
          }

        }
      }
    }
  }, [currentMatchIndex, searchQuery, searchMatches]); // onSearchResults removed as it's not used here

  // Custom text renderer for highlighting search matches
  type TextLayerItemProps = Parameters<Required<PageProps>['customTextRenderer']>[0];

  // This function creates a customTextRenderer for a specific page
  const createTextRenderer = useCallback((pageNumber: number) => {
    // This is the actual renderer that will be passed to react-pdf
    return (textItemProps: TextLayerItemProps): string => {
      const { str, itemIndex } = textItemProps;
      
      // If no search query or matches, return the original string as is
      if (!searchQuery || !searchMatches || searchMatches.length === 0) {
        return str;
      }
      
      const pageIndex = pageNumber - 1; // Convert 1-indexed to 0-indexed
      
      // Find matches relevant to this text item on this page
      const relevantMatches = searchMatches.filter(
        match => match.pageIndex === pageIndex && match.itemIndex === itemIndex
      );
      
      if (relevantMatches.length === 0) {
        return str; // No matches for this text item
      }
      
      // Check if this item contains the current match
      const isCurrentMatch = relevantMatches.some(match => 
        searchMatches[currentMatchIndex ?? -1] === match
      );
      
      // Add more visible identification - using custom HTML attribute
      // This adds a unique ID for each match
      const matchId = relevantMatches[0] ? `match-${pageIndex}-${itemIndex}` : '';
      const currentMatchId = isCurrentMatch ? `current-match-${pageIndex}-${itemIndex}` : '';
      
      // Add a marker suffix to the string AND a unique ID that can be used for debugging
      // CSS will target [data-text-content$="::highlight"] and [data-text-content$="::highlightCurrent"]
      // The format is specially crafted to maintain compatibility with react-pdf text layer rendering
      const markerSuffix = isCurrentMatch ? '::highlightCurrent' : '::highlight';
      
      // Log this in detail to console - helpful for debugging
      console.log(`PDFViewer: Marking text "${str}" with ${markerSuffix} on page ${pageNumber}, item ${itemIndex}`);
      
      return `${str}${markerSuffix}#${matchId}#${currentMatchId}`;
    };
  }, [searchQuery, searchMatches, currentMatchIndex]);

  // CSS class setting for the text layer - to be applied to the Page component
  const textLayerStyles = {
    '.react-pdf__Page__textContent': {
      // Custom CSS for text layer
    }
  };

  // Note for implementation: 
  // Since react-pdf's customTextRenderer expects a string return,
  // we'll need to use a different approach for highlighting:
  // 1. Use CSS to highlight search terms in the rendered PDF
  // 2. Add a custom overlay component that renders highlights positioned over the text
  
  // For now, we'll focus on the basic search functionality

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
      scrollBehavior: 'smooth',
      justifyContent: singlePageView ? 'center' : undefined,
    }}>
      <div 
        ref={pageContainerRef}
        style={{ 
        border: singlePageView ? 'none' : '0px solid #ccc',
        borderRadius: singlePageView ? 0 : 4,
        overflow: 'auto', 
        scrollBehavior: 'smooth',
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
                      style={{ margin: 0, height: '100%' }}
                      ref={(el: HTMLDivElement | null) => { pageRefs.current[pageNumber] = el; }}
                      data-page-number={pageNumber}
                    >
                      <Page
                        className="pdf-page" // Add a class for CSS styling
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
                          pageData.getTextContent().then(textContent => {
                            setTextItemsByPage(prev => ({...prev, [pageNumber]: textContent.items }));
                          });
                        }}
                        customTextRenderer={createTextRenderer(pageNumber)}
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
                      style={{
                        margin: '4px 0', // This margin is for spacing between pages, should be fine
                        // height: '100%' // Remove this, let Page content dictate height
                      }}
                      ref={(el: HTMLDivElement | null) => { pageRefs.current[pageNumber] = el; }}
                      data-page-number={pageNumber}
                    >
                      {renderedPages.has(pageNumber) ? (
                        <Page
                          className="pdf-page" // Add a class for CSS styling
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
                            pageData.getTextContent().then(textContent => {
                              setTextItemsByPage(prev => ({...prev, [pageNumber]: textContent.items }));
                            });
                          }}
                          customTextRenderer={createTextRenderer(pageNumber)}
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

// Add a global debugging helper that can be called from the console
// e.g. window.debugPDFViewer.highlightAll() in the browser console
if (typeof window !== 'undefined') {
  (window as any).debugPDFViewer = {
    // Force highlighting on all text spans for testing
    highlightAll: () => {
      console.log('PDFViewer Debug: Highlighting all text spans');
      document.querySelectorAll('.react-pdf__Page__textContent span').forEach((span, i) => {
        const el = span as HTMLElement;
        el.style.backgroundColor = i % 2 === 0 ? 'yellow' : 'lightgreen';
        el.style.color = 'black';
        // Also log the content and attributes
        console.log(`Span ${i}:`, {
          content: el.getAttribute('data-text-content'),
          styles: window.getComputedStyle(el)
        });
      });
    },
    
    // Forcefully apply CSS to matching text spans
    highlightByContent: (term: string) => {
      console.log(`PDFViewer Debug: Highlighting spans containing "${term}"`);
      document.querySelectorAll('.react-pdf__Page__textContent span[data-text-content]').forEach((span) => {
        const content = span.getAttribute('data-text-content');
        if (content && content.toLowerCase().includes(term.toLowerCase())) {
          const el = span as HTMLElement;
          el.style.backgroundColor = 'red';
          el.style.color = 'white';
          el.style.fontWeight = 'bold';
          el.style.zIndex = '1000';
          console.log('Highlighted span:', content);
        }
      });
    },
    
    // Display information about text spans
    inspectTextLayer: () => {
      const pages = document.querySelectorAll('.react-pdf__Page');
      console.log(`PDFViewer Debug: Found ${pages.length} PDF pages`);
      
      pages.forEach((page, pageIdx) => {
        const textLayer = page.querySelector('.react-pdf__Page__textContent');
        if (!textLayer) {
          console.log(`Page ${pageIdx + 1}: No text layer found`);
          return;
        }
        
        const spans = textLayer.querySelectorAll('span');
        console.log(`Page ${pageIdx + 1}: Found ${spans.length} text spans`);
        
        if (spans.length > 0) {
          console.log('Sample span attributes:', 
            Array.from(spans[0].attributes).map(attr => `${attr.name}="${attr.value}"`).join(', ')
          );
        }
      });
    }
  };
}

export default PDFViewer 