import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import {
  Printer, Loader2, Eye, X, RefreshCw, Monitor, Server, Lock, ShieldCheck,
  ChevronDown, ChevronUp, ZoomIn, ZoomOut, ChevronLeft, ChevronRight,
  File, Image, FileText, FileSpreadsheet, FileType, AlertCircle
} from 'lucide-react';
import usePrinter from '../hooks/usePrinter';
import { printDOM, printPDFBlob } from '../utils/printDOM';

// ============================================================
// 1. DOCUMENT RENDERER UTILITY
// ============================================================

class DocumentRenderer {
  constructor() {
    this.pdfjsLib = null;
    this.mammoth = null;
    this.XLSX = null;
  }

  async initialize() {
    // Lazy load libraries
    if (!this.pdfjsLib) {
      this.pdfjsLib = await import('pdfjs-dist/build/pdf');
      this.pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${this.pdfjsLib.version}/pdf.worker.min.js`;
    }
    return this;
  }

  async renderPDF(file, options = {}) {
    const pdf = await this.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    const totalPages = pdf.numPages;

    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      
      // Create canvas for rendering
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
      
      pages.push({
        canvas: canvas,
        width: viewport.width,
        height: viewport.height,
        pageNumber: i,
      });
    }

    return {
      pages,
      totalPages,
      metadata: {
        title: pdf._pdfInfo?.title || 'Untitled',
        author: pdf._pdfInfo?.author,
        creator: pdf._pdfInfo?.creator,
      }
    };
  }

  async renderDOCX(file, options = {}) {
    if (!this.mammoth) {
      this.mammoth = await import('mammoth');
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await this.mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;

    // Create page renderer for HTML content
    return this.renderHTML(html, options);
  }

  async renderXLSX(file, options = {}) {
    if (!this.XLSX) {
      this.XLSX = await import('xlsx');
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = this.XLSX.read(arrayBuffer, { type: 'array' });
    
    // Convert to HTML tables
    let html = '<div class="xlsx-document">';
    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const htmlTable = this.XLSX.utils.sheet_to_html(worksheet);
      html += `<div class="sheet-container"><h3>${sheetName}</h3>${htmlTable}</div>`;
    });
    html += '</div>';

    return this.renderHTML(html, options);
  }

  async renderImage(file, options = {}) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        // Fit image to page
        const pageWidth = 595; // A4 in points
        const pageHeight = 842;
        
        const scale = Math.min(
          (pageWidth - 80) / img.width,
          (pageHeight - 80) / img.height
        );
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        URL.revokeObjectURL(url);
        
        resolve({
          pages: [{
            canvas,
            width: canvas.width,
            height: canvas.height,
            pageNumber: 1,
            type: 'image',
          }],
          totalPages: 1,
          metadata: {
            title: file.name,
            dimensions: `${img.width}x${img.height}`,
          }
        });
      };
      
      img.onerror = () => {
        resolve(this.renderText(file, options));
      };
      
      img.src = url;
    });
  }

  async renderText(file, options = {}) {
    const text = await file.text();
    const html = `<pre class="text-document">${this.escapeHtml(text)}</pre>`;
    return this.renderHTML(html, options);
  }

  async renderHTML(html, options = {}) {
    // Create a virtual DOM for rendering
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.cssText = `
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      padding: 40px;
      max-width: 100%;
    `;

    // Apply print styles
    const style = document.createElement('style');
    style.textContent = this.getPrintCSS(options);
    container.appendChild(style);

    // Calculate pages by splitting content
    const pages = await this.paginateHTML(container, options);
    
    return {
      pages,
      totalPages: pages.length,
      metadata: {
        title: 'Document',
        wordCount: html.replace(/<[^>]*>/g, '').length,
      }
    };
  }

  async paginateHTML(container, options = {}) {
    // Simple pagination - split content into pages
    const pageHeight = options.pageHeight || 842;
    const contentHeight = container.scrollHeight;
    const pagesCount = Math.ceil(contentHeight / pageHeight);
    const pages = [];

    for (let i = 0; i < pagesCount; i++) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 595;
      canvas.height = 842;

      // Render content section to canvas
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Here we would render the specific page content
      // This is a simplified version
      ctx.fillStyle = '#000000';
      ctx.font = '12px Arial';
      ctx.fillText(`Page ${i + 1} of ${pagesCount}`, 20, 20);

      pages.push({
        canvas,
        width: canvas.width,
        height: canvas.height,
        pageNumber: i + 1,
        type: 'html',
      });
    }

    return pages;
  }

  getPrintCSS(options = {}) {
    const { orientation = 'portrait', paperSize = 'A4' } = options;
    const paperSizes = {
      A4: { width: '210mm', height: '297mm' },
      Letter: { width: '215.9mm', height: '279.4mm' },
      Legal: { width: '215.9mm', height: '355.6mm' },
      A3: { width: '297mm', height: '420mm' },
    };

    const size = paperSizes[paperSize] || paperSizes.A4;
    const width = orientation === 'landscape' ? size.height : size.width;
    const height = orientation === 'landscape' ? size.width : size.height;

    return `
      @page {
        size: ${width} ${height};
        margin: 20mm;
      }
      
      @media print {
        body { 
          margin: 0;
          padding: 0;
          background: white;
        }
        
        .xlsx-document {
          font-family: Arial, sans-serif;
          font-size: 10pt;
        }
        
        .sheet-container {
          margin-bottom: 20px;
          page-break-after: always;
        }
        
        .sheet-container h3 {
          font-size: 12pt;
          font-weight: bold;
          margin: 10px 0;
        }
        
        table {
          border-collapse: collapse;
          width: 100%;
        }
        
        td, th {
          border: 1px solid #ddd;
          padding: 4px 6px;
          text-align: left;
        }
        
        .text-document {
          font-family: 'Courier New', monospace;
          font-size: 10pt;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
      }
    `;
  }

  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async renderDocument(file, fileType, options = {}) {
    await this.initialize();
    
    switch (fileType) {
      case 'pdf':
        return this.renderPDF(file, options);
      case 'docx':
        return this.renderDOCX(file, options);
      case 'xlsx':
        return this.renderXLSX(file, options);
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'svg':
      case 'gif':
        return this.renderImage(file, options);
      case 'txt':
      case 'csv':
        return this.renderText(file, options);
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }
}

// ============================================================
// 2. MAIN PRINT PREVIEW MODAL COMPONENT
// ============================================================

export default function PrinterManagerModal({
  isOpen,
  onClose,
  pdfBlob = null,
  htmlContent = null,
  documentTitle = 'Document',
  defaultOptions = {},
  allowFileUpload = false,
  serverPrinterPin = '1234',
  file = null, // New: support for direct file upload
  fileType = null, // New: file type detection
}) {
  // ── Print modes ──
  const [printMode, setPrintMode] = useState('local'); // 'local' | 'server'
  const [pinInput, setPinInput] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [pinError, setPinError] = useState('');

  // ── Server printer ──
  const {
    printers,
    selectedPrinter,
    setSelectedPrinter,
    isLoadingPrinters,
    isPrinting: serverPrinting,
    refreshPrinters,
    printPDF,
  } = usePrinter({ autoFetch: false });

  // ── Print settings ──
  const [settings, setSettings] = useState({
    copies: defaultOptions.copies || 1,
    paperSize: defaultOptions.paperSize || 'A4',
    orientation: defaultOptions.orientation || 'portrait',
    pages: 'all', // 'all' | 'current' | 'custom'
    pageRange: '',
    color: 'color',
    margins: 'default',
    scale: 100,
    headerFooter: true,
    backgroundGraphics: true,
    duplex: false,
  });

  // ── Preview state ──
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [isPreviewPrinting, setIsPreviewPrinting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [documentPages, setDocumentPages] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [isDocumentLoading, setIsDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState(null);
  const [documentMetadata, setDocumentMetadata] = useState(null);
  const [renderer, setRenderer] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    printer: true,
    pages: true,
    layout: true,
    color: true,
    paperSize: true,
    margins: true,
    scale: true,
    options: true,
  });

  const viewportRef = useRef(null);
  const previewCanvasRef = useRef(null);

  if (!isOpen) return null;

  const activeFile = uploadedFile || file || pdfBlob;
  const activeFileType = fileType || (activeFile?.type?.split('/')[1]) || 'pdf';

  // ── Initialize document renderer ──
  useEffect(() => {
    if (isOpen) {
      const rendererInstance = new DocumentRenderer();
      setRenderer(rendererInstance);
      
      // Load document if file is provided
      if (activeFile) {
        loadDocument(rendererInstance);
      }
    }
  }, [isOpen, activeFile]);

  // ── Load document ──
  const loadDocument = async (rendererInstance) => {
    if (!rendererInstance) return;
    
    setIsDocumentLoading(true);
    setDocumentError(null);
    
    try {
      let fileToRender = activeFile;
      
      // Convert blob to File if needed
      if (fileToRender instanceof Blob && !(fileToRender instanceof File)) {
        const fileName = documentTitle || 'document';
        const fileExtension = activeFileType || 'pdf';
        fileToRender = new File([fileToRender], `${fileName}.${fileExtension}`, {
          type: fileToRender.type || `application/${fileExtension}`,
        });
      }
      
      const result = await rendererInstance.renderDocument(
        fileToRender,
        activeFileType,
        {
          paperSize: settings.paperSize,
          orientation: settings.orientation,
        }
      );
      
      setDocumentPages(result.pages);
      setTotalPages(result.totalPages);
      setDocumentMetadata(result.metadata);
      setCurrentPage(1);
    } catch (err) {
      setDocumentError(err.message);
      toast.error(`Failed to load document: ${err.message}`);
    } finally {
      setIsDocumentLoading(false);
    }
  };

  // ── Re-render when settings change ──
  useEffect(() => {
    if (renderer && activeFile && documentPages.length > 0) {
      // Update preview with new settings
      renderCurrentPage();
    }
  }, [settings.orientation, settings.paperSize, settings.scale, settings.margins]);

  // ── Render current page ──
  const renderCurrentPage = () => {
    const pageData = documentPages[currentPage - 1];
    if (!pageData || !previewCanvasRef.current) return;

    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const zoomFactor = zoom / 100;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply scaling
    const scale = (settings.scale / 100) * zoomFactor;
    const margin = settings.margins === 'none' ? 0 : 40;

    // Draw page
    const sourceCanvas = pageData.canvas;
    const drawWidth = sourceCanvas.width * scale;
    const drawHeight = sourceCanvas.height * scale;
    const x = (canvas.width - drawWidth) / 2;
    const y = margin * zoomFactor;

    ctx.drawImage(sourceCanvas, x, y, drawWidth, drawHeight);

    // Draw page border
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, drawWidth, drawHeight);

    // Draw page number
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      `Page ${currentPage} of ${totalPages}`,
      canvas.width / 2,
      canvas.height - 20
    );
  };

  // ── Page navigation ──
  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const goToPreviousPage = () => goToPage(currentPage - 1);
  const goToNextPage = () => goToPage(currentPage + 1);

  // ── Zoom handlers ──
  const handleZoomIn = () => setZoom(Math.min(zoom + 10, 200));
  const handleZoomOut = () => setZoom(Math.max(zoom - 10, 50));

  // ── Section toggle ──
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // ── Setting change handler ──
  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  // ── Get pages to print ──
  const getPagesToPrint = useCallback(() => {
    if (settings.pages === 'all') {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (settings.pages === 'current') {
      return [currentPage];
    }
    // Custom range
    return parsePageRange(settings.pageRange, totalPages);
  }, [settings.pages, settings.pageRange, currentPage, totalPages]);

  const parsePageRange = (range, total) => {
    const pages = new Set();
    const parts = range.split(',').map(s => s.trim());
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        for (let i = start; i <= Math.min(end, total); i++) {
          pages.add(i);
        }
      } else {
        const page = Number(part);
        if (page >= 1 && page <= total) {
          pages.add(page);
        }
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  };

  // ── Print handlers ──
  const handleDirectServerPrint = async () => {
    if (!activeFile) {
      toast.error('No document to print');
      return;
    }

    const pagesToPrint = getPagesToPrint();
    // In a real implementation, you would render only the selected pages
    const result = await printPDF(activeFile, {
      copies: settings.copies,
      paperSize: settings.paperSize,
      orientation: settings.orientation,
      fileName: documentTitle || 'document.pdf',
      pages: pagesToPrint,
    });
    if (result.success) onClose();
  };

  const handleBrowserPrint = async () => {
    setIsPreviewPrinting(true);
    try {
      // Use the browser's native print dialog
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('Please allow popups to print');
        return;
      }

      // Generate print content with proper styling
      let printContent = '';
      
      if (activeFile && documentPages.length > 0) {
        // Render all pages as images
        const pagesToPrint = getPagesToPrint();
        printContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>${documentTitle}</title>
              <style>
                ${renderer?.getPrintCSS(settings)}
                body { margin: 0; padding: 0; }
                .page { 
                  page-break-after: always;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  min-height: 100vh;
                }
                .page img {
                  max-width: 100%;
                  max-height: 100vh;
                  object-fit: contain;
                }
              </style>
            </head>
            <body>
        `;
        
        for (const pageNum of pagesToPrint) {
          const pageData = documentPages[pageNum - 1];
          if (pageData) {
            const imgData = pageData.canvas.toDataURL('image/png');
            printContent += `
              <div class="page">
                <img src="${imgData}" alt="Page ${pageNum}" />
              </div>
            `;
          }
        }
        
        printContent += `
            </body>
          </html>
        `;
      } else if (htmlContent) {
        printContent = renderer?.getPrintCSS(settings) + htmlContent;
      } else {
        toast.error('No document to print');
        return;
      }

      // Write to print window
      printWindow.document.write(printContent);
      printWindow.document.close();
      
      // Wait for images to load
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
      
      onClose();
    } catch (err) {
      toast.error('Failed to open browser print preview.');
      console.error('Browser print error:', err);
    } finally {
      setIsPreviewPrinting(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Determine file type
    const extension = file.name.split('.').pop().toLowerCase();
    const supportedTypes = ['pdf', 'docx', 'xlsx', 'png', 'jpg', 'jpeg', 'svg', 'txt', 'csv'];
    
    if (!supportedTypes.includes(extension)) {
      toast.error(`Unsupported file type: ${extension}. Supported: ${supportedTypes.join(', ')}`);
      return;
    }
    
    setUploadedFile(file);
    // Reload document with new file
    if (renderer) {
      loadDocument(renderer);
    }
  };

  // ── Render sidebar section ──
  const Section = ({ title, section, children }) => (
    <div className="print-sidebar-section">
      <button
        className="print-sidebar-section-header"
        onClick={() => toggleSection(section)}
      >
        <span>{title}</span>
        {expandedSections[section] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {expandedSections[section] && (
        <div className="print-sidebar-section-content">
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-7xl h-[90vh] shadow-2xl flex flex-col overflow-hidden">
        
        {/* ── Header ── */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
          <div className="flex items-center gap-3">
            <Printer size={20} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Print — {documentTitle}
            </h2>
            {documentMetadata && (
              <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">
                {documentMetadata.pages || totalPages} pages
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Main Content ── */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* ── Sidebar ── */}
          <div className="w-80 bg-gray-50 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 overflow-y-auto p-4">
            
            {/* Mode Toggle */}
            <div className="flex items-center bg-white dark:bg-gray-900 p-1 rounded-lg border border-gray-200 dark:border-gray-800 mb-4">
              <button
                type="button"
                onClick={() => setPrintMode('local')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all ${
                  printMode === 'local'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Monitor size={16} />
                My Printer
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('server')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all ${
                  printMode === 'server'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Server size={16} />
                Server
              </button>
            </div>

            {/* ── Server PIN Gate ── */}
            {printMode === 'server' && !pinVerified && (
              <form onSubmit={handlePinSubmit} className="space-y-4">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-3">
                    <Lock size={20} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Server Printer Access
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Enter PIN to use server-connected printers
                  </p>
                </div>

                <input
                  type="password"
                  inputMode="numeric"
                  value={pinInput}
                  onChange={e => { setPinInput(e.target.value); setPinError(''); }}
                  placeholder="Enter PIN"
                  autoFocus
                  className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-center text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                />

                {pinError && (
                  <p className="text-xs text-red-500 text-center">{pinError}</p>
                )}

                <button
                  type="submit"
                  disabled={!pinInput}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ShieldCheck size={16} />
                  Unlock
                </button>
              </form>
            )}

            {/* ── Print Settings ── */}
            {(printMode === 'local' || (printMode === 'server' && pinVerified)) && (
              <div className="space-y-4">
                
                {/* Printer Selection */}
                {printMode === 'server' && pinVerified && (
                  <Section title="Printer" section="printer">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedPrinter || ''}
                          onChange={(e) => setSelectedPrinter(e.target.value)}
                          disabled={isLoadingPrinters}
                          className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="">Select a printer...</option>
                          {printers.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name} {p.isDefault && '(Default)'}
                            </option>
                          ))}
                          <option value="save-as-pdf">Save as PDF</option>
                        </select>
                        <button
                          onClick={refreshPrinters}
                          disabled={isLoadingPrinters}
                          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-40"
                        >
                          <RefreshCw size={16} className={isLoadingPrinters ? 'animate-spin' : ''} />
                        </button>
                      </div>
                      {isLoadingPrinters && (
                        <div className="text-xs text-gray-500">Loading printers...</div>
                      )}
                    </div>
                  </Section>
                )}

                {/* Pages */}
                <Section title="Pages" section="pages">
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="pages"
                          value="all"
                          checked={settings.pages === 'all'}
                          onChange={() => handleSettingChange('pages', 'all')}
                          className="accent-blue-600"
                        />
                        All
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="pages"
                          value="current"
                          checked={settings.pages === 'current'}
                          onChange={() => handleSettingChange('pages', 'current')}
                          className="accent-blue-600"
                        />
                        Current
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="pages"
                          value="custom"
                          checked={settings.pages === 'custom'}
                          onChange={() => handleSettingChange('pages', 'custom')}
                          className="accent-blue-600"
                        />
                        Custom
                      </label>
                    </div>
                    {settings.pages === 'custom' && (
                      <input
                        type="text"
                        placeholder="e.g., 1-3, 5, 7-9"
                        value={settings.pageRange}
                        onChange={(e) => handleSettingChange('pageRange', e.target.value)}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      />
                    )}
                    <div className="text-xs text-gray-500">
                      {totalPages} page{totalPages !== 1 ? 's' : ''} total
                    </div>
                  </div>
                </Section>

                {/* Layout */}
                <Section title="Layout" section="layout">
                  <div className="flex gap-3">
                    <button
                      className={`flex-1 flex flex-col items-center gap-1 p-3 border-2 rounded-lg transition-all ${
                        settings.orientation === 'portrait'
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                      onClick={() => handleSettingChange('orientation', 'portrait')}
                    >
                      <div className="w-8 h-10 border border-current rounded flex items-center justify-center">
                        <div className="w-5 h-7 border border-current rounded"></div>
                      </div>
                      <span className="text-xs">Portrait</span>
                    </button>
                    <button
                      className={`flex-1 flex flex-col items-center gap-1 p-3 border-2 rounded-lg transition-all ${
                        settings.orientation === 'landscape'
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                      onClick={() => handleSettingChange('orientation', 'landscape')}
                    >
                      <div className="w-10 h-8 border border-current rounded flex items-center justify-center">
                        <div className="w-7 h-5 border border-current rounded"></div>
                      </div>
                      <span className="text-xs">Landscape</span>
                    </button>
                  </div>
                </Section>

                {/* Color */}
                <Section title="Color" section="color">
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="color"
                        value="color"
                        checked={settings.color === 'color'}
                        onChange={() => handleSettingChange('color', 'color')}
                        className="accent-blue-600"
                      />
                      Color
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="color"
                        value="monochrome"
                        checked={settings.color === 'monochrome'}
                        onChange={() => handleSettingChange('color', 'monochrome')}
                        className="accent-blue-600"
                      />
                      Monochrome
                    </label>
                  </div>
                </Section>

                {/* Paper Size */}
                <Section title="Paper Size" section="paperSize">
                  <select
                    value={settings.paperSize}
                    onChange={(e) => handleSettingChange('paperSize', e.target.value)}
                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                    <option value="Legal">Legal</option>
                    <option value="A3">A3</option>
                    <option value="A5">A5</option>
                    <option value="Executive">Executive</option>
                  </select>
                </Section>

                {/* Margins */}
                <Section title="Margins" section="margins">
                  <select
                    value={settings.margins}
                    onChange={(e) => handleSettingChange('margins', e.target.value)}
                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="default">Default</option>
                    <option value="none">None</option>
                    <option value="minimal">Minimal</option>
                    <option value="custom">Custom</option>
                  </select>
                </Section>

                {/* Scale */}
                <Section title="Scale" section="scale">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="50"
                        max="200"
                        value={settings.scale}
                        onChange={(e) => handleSettingChange('scale', parseInt(e.target.value))}
                        className="flex-1 accent-blue-600"
                      />
                      <span className="text-sm font-medium min-w-[40px]">
                        {settings.scale}%
                      </span>
                    </div>
                    <button
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      onClick={() => handleSettingChange('scale', 100)}
                    >
                      Reset to 100%
                    </button>
                  </div>
                </Section>

                {/* Options */}
                <Section title="Options" section="options">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={settings.headerFooter}
                        onChange={(e) => handleSettingChange('headerFooter', e.target.checked)}
                        className="accent-blue-600"
                      />
                      Headers and footers
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={settings.backgroundGraphics}
                        onChange={(e) => handleSettingChange('backgroundGraphics', e.target.checked)}
                        className="accent-blue-600"
                      />
                      Background graphics
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={settings.duplex}
                        onChange={(e) => handleSettingChange('duplex', e.target.checked)}
                        className="accent-blue-600"
                      />
                      Duplex (double-sided)
                    </label>
                    <div className="flex items-center gap-2 text-sm">
                      <span>Copies:</span>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={settings.copies}
                        onChange={(e) => handleSettingChange('copies', Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </Section>

                {/* File Upload */}
                {allowFileUpload && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Upload File to Print
                    </label>
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      className="w-full text-sm text-gray-500 dark:text-gray-400
                        file:mr-3 file:py-2 file:px-3 file:rounded-lg
                        file:border-0 file:text-sm file:font-semibold
                        file:bg-blue-50 file:text-blue-700
                        dark:file:bg-blue-900/30 dark:file:text-blue-400
                        hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50
                        cursor-pointer"
                    />
                    {uploadedFile && (
                      <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                        ✓ {uploadedFile.name}
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                  <button
                    onClick={onCancel}
                    className="flex-1 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={printMode === 'local' ? handleBrowserPrint : handleDirectServerPrint}
                    disabled={
                      isPreviewPrinting || 
                      (printMode === 'server' && (!selectedPrinter || serverPrinting)) ||
                      (printMode === 'local' && !activeFile && !htmlContent) ||
                      isDocumentLoading
                    }
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPreviewPrinting || serverPrinting || isDocumentLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        {isDocumentLoading ? 'Loading...' : 'Printing...'}
                      </>
                    ) : (
                      <>
                        <Printer size={16} />
                        Print
                      </>
                    )}
                  </button>
                </div>

              </div>
            )}
          </div>

          {/* ── Preview Viewport ── */}
          <div className="flex-1 bg-gray-100 dark:bg-gray-950 relative overflow-hidden">
            
            {/* Document loading */}
            {isDocumentLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Loader2 size={48} className="animate-spin text-blue-600" />
                <p className="mt-4 text-gray-600 dark:text-gray-400">Loading document...</p>
              </div>
            )}

            {/* Error state */}
            {documentError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                <AlertCircle size={48} className="text-red-500" />
                <p className="mt-4 text-red-600 dark:text-red-400 text-center max-w-md">
                  {documentError}
                </p>
                <button
                  onClick={() => loadDocument(renderer)}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Preview canvas */}
            {!isDocumentLoading && !documentError && documentPages.length > 0 && (
              <>
                <div className="w-full h-full flex items-center justify-center p-8 overflow-auto">
                  <canvas
                    ref={previewCanvasRef}
                    className="shadow-lg bg-white"
                    width={window.innerWidth * 0.5}
                    height={window.innerHeight * 0.7}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                    }}
                  />
                </div>

                {/* Page Controls */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg flex items-center gap-2 px-4 py-2">
                  <button
                    onClick={handleZoomOut}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                    title="Zoom out"
                  >
                    <ZoomOut size={16} />
                  </button>
                  <span className="text-sm font-medium min-w-[50px] text-center">
                    {zoom}%
                  </span>
                  <button
                    onClick={handleZoomIn}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                    title="Zoom in"
                  >
                    <ZoomIn size={16} />
                  </button>
                  <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-2"></div>
                  <button
                    onClick={goToPreviousPage}
                    disabled={currentPage === 1}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-medium min-w-[80px] text-center">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </>
            )}

            {/* No document state */}
            {!isDocumentLoading && !documentError && documentPages.length === 0 && !activeFile && !htmlContent && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <File size={48} className="text-gray-300 dark:text-gray-600" />
                <p className="mt-4 text-gray-500 dark:text-gray-400">
                  No document loaded. Pass a pdfBlob, htmlContent, or upload a file.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}