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

export interface PDFViewerProps {
  file: string | Blob
  currentPage?: number
  zoom?: number
  viewMode?: 'default' | 'fullPage' | 'fullWidth'
  onPageChange?: (page: number) => void
  onDocumentLoaded?: (pages: number) => void
}

const PDFViewer = ({ 
  file,
  currentPage,
  zoom = 1,
  viewMode = 'default',
  onPageChange,
  onDocumentLoaded
}: PDFViewerProps) => {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(currentPage || 1)
  const [width, setWidth] = useState<number | undefined>(600)
  const [loadError, setLoadError] = useState<Error | null>(null)

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

  // Update page number when currentPage prop changes
  useEffect(() => {
    if (currentPage !== undefined) {
      setPageNumber(currentPage)
    }
  }, [currentPage])

  // Update width based on viewMode
  useEffect(() => {
    if (viewMode === 'fullWidth') {
      setWidth(undefined) // Use container width
    } else if (viewMode === 'fullPage') {
      setWidth(undefined) // Width will adjust to fit page height
    } else {
      setWidth(600 * zoom) // Default width with zoom applied
    }
  }, [viewMode, zoom])

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    console.log('PDF loaded successfully with', numPages, 'pages');
    setNumPages(numPages)
    setPageNumber(1)
    setLoadError(null)
    
    // Notify parent component
    if (onDocumentLoaded) {
      onDocumentLoaded(numPages)
    }
  }

  function onDocumentLoadError(error: Error) {
    console.error('Error loading PDF:', error);
    setLoadError(error);
  }

  const handlePageChange = (newPage: number) => {
    setPageNumber(newPage)
    
    // Notify parent component
    if (onPageChange) {
      onPageChange(newPage)
    }
  }

  const goToPrevPage = () => {
    const newPage = Math.max(pageNumber - 1, 1)
    handlePageChange(newPage)
  }
  
  const goToNextPage = () => {
    const newPage = numPages ? Math.min(pageNumber + 1, numPages) : pageNumber
    handlePageChange(newPage)
  }

  // Calculate scale based on viewMode
  const getScale = () => {
    if (viewMode === 'fullPage') {
      return 1 // Scale will be handled by the Page component's height property
    }
    return zoom
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      marginTop: 16,
      width: '100%',
      height: viewMode === 'fullPage' ? '100%' : 'auto',
      overflow: 'auto'
    }}>
      {!currentPage && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={goToPrevPage} disabled={pageNumber <= 1}>
            Previous
          </button>
          <span style={{ margin: '0 12px' }}>
            Page {pageNumber} {numPages ? `of ${numPages}` : ''}
          </span>
          <button onClick={goToNextPage} disabled={numPages ? pageNumber >= numPages : true}>
            Next
          </button>
        </div>
      )}
      <div style={{ 
        border: '1px solid #ccc', 
        borderRadius: 4, 
        overflow: 'auto', 
        background: '#222',
        height: viewMode === 'fullPage' ? 'calc(100% - 32px)' : 'auto',
        width: viewMode === 'fullWidth' ? '100%' : 'auto',
        display: 'flex',
        justifyContent: 'center',
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
            <Page 
              pageNumber={pageNumber} 
              width={width}
              height={viewMode === 'fullPage' ? undefined : undefined}
              scale={getScale()}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>
        )}
      </div>
    </div>
  )
}

export default PDFViewer 