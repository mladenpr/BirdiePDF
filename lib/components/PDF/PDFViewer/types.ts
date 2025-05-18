export interface SearchMatch {
  pageIndex: number; // 0-indexed page number
  itemIndex: number; // Index of the text item on the page
  text: string; // The full text of the item where match was found
  query: string; // The search query that was matched
  startIndexInItem: number; // Start char index of the match within item.text
  endIndexInItem: number; // End char index of the match
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
  interactionMode?: 'pointer' | 'pan'; // NEW: Interaction mode prop
} 