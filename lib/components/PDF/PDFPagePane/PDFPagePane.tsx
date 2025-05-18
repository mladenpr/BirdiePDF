import React from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// Ensure worker is configured (copy if not already central)
// pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PDFPagePaneProps {
  totalPages: number;
  currentPage: number;
  onPageSelect: (pageNumber: number) => void;
  isVisible: boolean;
  pdfFile: Blob | null; // Added pdfFile prop
}

const PDFPagePane: React.FC<PDFPagePaneProps> = ({ totalPages, currentPage, onPageSelect, isVisible, pdfFile }) => {
  if (!isVisible || !pdfFile) { // Also check for pdfFile
    return null;
  }

  const thumbnailWidth = 100; // Define a width for thumbnails

  return (
    <div style={{
      width: '280px', // Slightly wider to accommodate padding/margins for thumbnails
      minWidth: '280px',
      borderRight: '1px solid #e0e0e0',
      background: '#f0f2f5', // Slightly different background for the pane
      overflowY: 'auto',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <h4 style={{ 
        margin: '0',
        padding: '15px 20px',
        borderBottom: '1px solid #d1d5db',
        color: '#1f2937',
        fontWeight: '600',
        background: '#e5e7eb'
      }}>
        Pages
      </h4>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
        <Document file={pdfFile} loading="Loading document for thumbnails...">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => (
            <div
              key={`thumb-${pageNumber}`}
              onClick={() => onPageSelect(pageNumber)}
              style={{
                cursor: 'pointer',
                padding: '5px',
                marginBottom: '10px',
                borderRadius: '4px',
                border: pageNumber === currentPage ? '2px solid #007bff' : '2px solid transparent',
                background: pageNumber === currentPage ? '#e9ecef' : '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                if (pageNumber !== currentPage) {
                  e.currentTarget.style.borderColor = '#007bff';
                }
              }}
              onMouseLeave={(e) => {
                if (pageNumber !== currentPage) {
                  e.currentTarget.style.borderColor = 'transparent';
                }
              }}
            >
              <Page
                pageNumber={pageNumber}
                width={thumbnailWidth}
                renderTextLayer={false} // No text layer for thumbnails
                renderAnnotationLayer={false} // No annotation layer for thumbnails
                loading={<div style={{width: thumbnailWidth, height: thumbnailWidth * 1.41, background: '#e9ecef', display: 'flex', alignItems:'center', justifyContent:'center'}}>L...</div>}
              />
              <span style={{
                marginTop: '5px',
                fontSize: '12px',
                color: pageNumber === currentPage ? '#007bff' : '#333',
                fontWeight: pageNumber === currentPage ? 'bold' : 'normal',
              }}>
                Page {pageNumber}
              </span>
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
};

export default PDFPagePane; 