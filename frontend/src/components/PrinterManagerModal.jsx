import React, { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import {
  Printer, Loader2, Eye, X, RefreshCw, Monitor, Server, Lock,
  ShieldCheck, RotateCw, ZoomIn, ZoomOut, Maximize2, Download,
  Save, Settings2, FileText, ChevronLeft, ChevronRight, Layers,
  Check, AlertCircle, FileUp, ChevronDown, SlidersHorizontal
} from 'lucide-react';
import usePrinter from '../hooks/usePrinter';
import { printDOM, printPDFBlob } from '../utils/printDOM';

/**
 * PrinterManagerModal — Advanced Enterprise Print Preview & Manager
 *
 * Offers two print paths:
 *  1. "My Printer" (Local / Browser Mode) — Full Chrome/Acrobat-style UI with
 *     live PDF/Document preview, interactive controls, and native browser printing.
 *  2. "Server Printer" — PIN-gated silent direct execution to printers on the server.
 */
export default function PrinterManagerModal({
  isOpen,
  onClose,
  pdfBlob = null,
  htmlContent = null,
  documentTitle = 'Document',
  defaultOptions = {},
  allowFileUpload = false,
  serverPrinterPin = '1234',
}) {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. STATE MANAGEMENT & PREFERENCES (Preserved 100%)
  // ───────────────────────────────────────────────────────────────────────────
  
  // Mode selection: 'local' (Browser/Preview) | 'server' (Direct execution)
  const [printMode, setPrintMode] = useState('local');
  const [pinInput, setPinInput] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [pinError, setPinError] = useState('');

  // Hook for server printers
  const {
    printers,
    selectedPrinter,
    setSelectedPrinter,
    isLoadingPrinters,
    isPrinting,
    refreshPrinters,
    printPDF,
  } = usePrinter({ autoFetch: false });

  // Uploaded file overrides
  const [uploadedFile, setUploadedFile] = useState(null);
  const activeBlob = uploadedFile || pdfBlob;

  // Active Blob Object URL for iframe/preview rendering
  const [blobUrl, setBlobUrl] = useState(null);

  // Print Configuration Settings
  const [copies, setCopies] = useState(defaultOptions.copies || 1);
  const [paperSize, setPaperSize] = useState(defaultOptions.paperSize || 'A4');
  const [customWidth, setCustomWidth] = useState('210');
  const [customHeight, setCustomHeight] = useState('297');
  const [orientation, setOrientation] = useState(defaultOptions.orientation || 'portrait');
  
  // Page Range & Selection
  const [pageRangeType, setPageRangeType] = useState('all'); // 'all' | 'current' | 'custom'
  const [customPageRange, setCustomPageRange] = useState('');
  const [pageRangeError, setPageRangeError] = useState('');
  const [pageFilter, setPageFilter] = useState('all'); // 'all' | 'odd' | 'even'
  const [reverseOrder, setReverseOrder] = useState(false);

  // Layout & Styling
  const [margins, setMargins] = useState('default'); // 'default' | 'none' | 'minimum' | 'custom'
  const [customMarginTop, setCustomMarginTop] = useState('10');
  const [customMarginBottom, setCustomMarginBottom] = useState('10');
  const [customMarginLeft, setCustomMarginLeft] = useState('10');
  const [customMarginRight, setCustomMarginRight] = useState('10');
  
  const [scaleType, setScaleType] = useState('fit-page'); // 'fit-page' | 'fit-width' | 'custom'
  const [customScale, setCustomScale] = useState(100);
  const [pagesPerSheet, setPagesPerSheet] = useState('1');
  const [duplex, setDuplex] = useState('simplex'); // 'simplex' | 'long-edge' | 'short-edge'
  const [colorMode, setColorMode] = useState('color'); // 'color' | 'grayscale' | 'bw'

  // Finishing & Toggles
  const [includeBackgrounds, setIncludeBackgrounds] = useState(true);
  const [includeHeadersFooters, setIncludeHeadersFooters] = useState(true);
  const [watermarkText, setWatermarkText] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Preview Viewport Interactive Controls
  const [zoomLevel, setZoomLevel] = useState(78);
  const [rotation, setRotation] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isPreviewPrinting, setIsPreviewPrinting] = useState(false);

  // Mobile Drawer State
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

  // Load persistent preferences from localStorage on mount
  useEffect(() => {
    try {
      const savedPref = localStorage.getItem('printer_manager_prefs');
      if (savedPref) {
        const parsed = JSON.parse(savedPref);
        if (parsed.paperSize) setPaperSize(parsed.paperSize);
        if (parsed.orientation) setOrientation(parsed.orientation);
        if (parsed.margins) setMargins(parsed.margins);
        if (parsed.colorMode) setColorMode(parsed.colorMode);
      }
    } catch (e) {
      // Ignore storage errors
    }
  }, []);

  // Save persistent preferences when updated
  const savePreferences = (key, val) => {
    try {
      const savedPref = JSON.parse(localStorage.getItem('printer_manager_prefs') || '{}');
      savedPref[key] = val;
      localStorage.setItem('printer_manager_prefs', JSON.stringify(savedPref));
    } catch (e) {}
  };

  // Manage Blob URL creation and memory cleanup
  useEffect(() => {
    if (!activeBlob) {
      setBlobUrl(null);
      return;
    }
    setIsPreviewLoading(true);
    const url = URL.createObjectURL(activeBlob);
    setBlobUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [activeBlob]);

  // Validate custom page range input
  useEffect(() => {
    if (pageRangeType !== 'custom') {
      setPageRangeError('');
      return;
    }
    if (!customPageRange.trim()) {
      setPageRangeError('e.g. 1-3, 5, 8');
      return;
    }
    const isValid = /^(\d+(-\d+)?)(,\s*\d+(-\d+)?)*$/.test(customPageRange.trim());
    setPageRangeError(isValid ? '' : 'Invalid format. Use numbers and hyphens (e.g., 1-3, 5)');
  }, [customPageRange, pageRangeType]);

  if (!isOpen) return null;

  // ───────────────────────────────────────────────────────────────────────────
  // 2. HANDLERS & ACTIONS (Preserved 100%)
  // ───────────────────────────────────────────────────────────────────────────

  const handleSelectLocalMode = () => setPrintMode('local');
  const handleSelectServerMode = () => setPrintMode('server');

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setPinError('');
    if (pinInput !== serverPrinterPin) {
      setPinError('Incorrect PIN. Please try again.');
      setPinInput('');
      return;
    }
    setPinVerified(true);
    setPinInput('');
    await refreshPrinters();
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are supported for direct file preview.');
      return;
    }
    setUploadedFile(file);
    toast.success(`Loaded file: ${file.name}`);
  };

  const handleDirectServerPrint = async () => {
    if (!activeBlob) {
      toast.error('Server printing requires a valid PDF file.');
      return;
    }
    const result = await printPDF(activeBlob, {
      copies,
      paperSize,
      orientation,
      fileName: uploadedFile?.name || `${documentTitle.replace(/\s+/g, '_')}.pdf`,
    });
    if (result.success) onClose();
  };

  const handleBrowserPrint = async () => {
    if (pageRangeType === 'custom' && pageRangeError) {
      toast.error('Please fix the page range syntax before printing.');
      return;
    }
    setIsPreviewPrinting(true);
    try {
      if (activeBlob) {
        await printPDFBlob(activeBlob);
      } else if (htmlContent) {
        await printDOM(htmlContent, {
          pageSize: paperSize,
          orientation,
          title: documentTitle,
        });
      } else {
        toast.error('Nothing available to print.');
        return;
      }
      onClose();
    } catch (err) {
      toast.error('Failed to launch browser print dialog.');
      console.error('Browser print error:', err);
    } finally {
      setIsPreviewPrinting(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!activeBlob && !blobUrl) {
      toast.error('No PDF available to download.');
      return;
    }
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = uploadedFile?.name || `${documentTitle.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Document downloaded');
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 3. RENDER CONTENT helper to avoid duplication between Mobile & Desktop
  // ───────────────────────────────────────────────────────────────────────────

  const renderControlPanel = () => (
    <>
      {/* SERVER PRINT MODE (PIN Gated) */}
      {printMode === 'server' && !pinVerified ? (
        <div className="p-5 flex flex-col items-center justify-center my-auto text-center">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3">
            <Lock size={22} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Server Printer Access</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-[260px]">
            Direct silent printing bypasses client print dialogs. Enter your authorization PIN to view server printers.
          </p>

          <form onSubmit={handlePinSubmit} className="w-full space-y-3">
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setPinError(''); }}
              placeholder="Enter Security PIN"
              autoFocus
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-center tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
            {pinError && <p className="text-xs text-red-500 font-medium">{pinError}</p>}
            <button
              type="submit"
              disabled={!pinInput}
              className="w-full flex items-center justify-center gap-2 min-h-[44px] py-2.5 text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md disabled:opacity-40 transition-all cursor-pointer"
            >
              <ShieldCheck size={16} /> Unlock Server Options
            </button>
          </form>
        </div>
      ) : (
        /* ACTIVE CONTROLS (Local Mode or Verified Server Mode) */
        <div className="p-4 sm:p-5 space-y-4 sm:space-y-5">
          
          {/* 1. Destination / Printer Selection */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Destination
            </label>
            {printMode === 'server' ? (
              <div className="flex gap-2">
                <select
                  value={selectedPrinter}
                  onChange={(e) => setSelectedPrinter(e.target.value)}
                  disabled={isLoadingPrinters}
                  className="flex-1 min-h-[38px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                >
                  {printers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.isDefault ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={refreshPrinters}
                  disabled={isLoadingPrinters}
                  className="p-2 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  title="Refresh server printers"
                >
                  <RefreshCw size={14} className={isLoadingPrinters ? 'animate-spin text-blue-500' : ''} />
                </button>
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-2">
                  <Monitor size={15} className="text-blue-500 shrink-0" /> System Native Printer Dialog
                </span>
                <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold">Auto</span>
              </div>
            )}
          </div>

          {/* 2. Copies & Color Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Copies
              </label>
              <input
                type="number"
                min={1}
                max={99}
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full min-h-[38px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Color
              </label>
              <select
                value={colorMode}
                onChange={(e) => {
                  setColorMode(e.target.value);
                  savePreferences('colorMode', e.target.value);
                }}
                className="w-full min-h-[38px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="color">Color</option>
                <option value="grayscale">Grayscale</option>
                <option value="bw">Black & White</option>
              </select>
            </div>
          </div>

          {/* 3. Page Range Selection */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Pages
            </label>
            <select
              value={pageRangeType}
              onChange={(e) => setPageRangeType(e.target.value)}
              className="w-full min-h-[38px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 mb-2"
            >
              <option value="all">All Pages</option>
              <option value="current">Current Page Only</option>
              <option value="custom">Custom Range</option>
            </select>

            {pageRangeType === 'custom' && (
              <div>
                <input
                  type="text"
                  placeholder="e.g. 1-5, 8, 11-13"
                  value={customPageRange}
                  onChange={(e) => setCustomPageRange(e.target.value)}
                  className={`w-full min-h-[38px] bg-slate-50 dark:bg-slate-950 border rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none ${
                    pageRangeError ? 'border-red-500 focus:border-red-500' : 'border-slate-200 dark:border-slate-800 focus:border-blue-500'
                  }`}
                />
                {pageRangeError && <p className="text-[11px] text-red-500 mt-1 font-medium">{pageRangeError}</p>}
              </div>
            )}
          </div>

          {/* 4. Layout & Orientation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Paper Size
              </label>
              <select
                value={paperSize}
                onChange={(e) => {
                  setPaperSize(e.target.value);
                  savePreferences('paperSize', e.target.value);
                }}
                className="w-full min-h-[38px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="A4">A4 (210 x 297mm)</option>
                <option value="Letter">Letter (8.5 x 11in)</option>
                <option value="Legal">Legal (8.5 x 14in)</option>
                <option value="A3">A3</option>
                <option value="A5">A5</option>
                <option value="80mm">80mm Receipt</option>
                <option value="custom">Custom Size</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Orientation
              </label>
              <select
                value={orientation}
                onChange={(e) => {
                  setOrientation(e.target.value);
                  savePreferences('orientation', e.target.value);
                }}
                className="w-full min-h-[38px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
          </div>

          {/* Custom Dimensions Input if Custom Selected */}
          {paperSize === 'custom' && (
            <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Width (mm)</label>
                <input
                  type="number"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Height (mm)</label>
                <input
                  type="number"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs"
                />
              </div>
            </div>
          )}

          {/* 5. Margins & Scale */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Margins
              </label>
              <select
                value={margins}
                onChange={(e) => {
                  setMargins(e.target.value);
                  savePreferences('margins', e.target.value);
                }}
                className="w-full min-h-[38px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="default">Default</option>
                <option value="none">None</option>
                <option value="minimum">Minimum</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Scale
              </label>
              <select
                value={scaleType}
                onChange={(e) => setScaleType(e.target.value)}
                className="w-full min-h-[38px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="fit-page">Fit to Printable</option>
                <option value="fit-width">Fit to Width</option>
                <option value="custom">Custom (%)</option>
              </select>
            </div>
          </div>

          {scaleType === 'custom' && (
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <input
                type="range"
                min="10"
                max="200"
                value={customScale}
                onChange={(e) => setCustomScale(Number(e.target.value))}
                className="flex-1 accent-blue-600"
              />
              <span className="text-xs font-bold w-12 text-right">{customScale}%</span>
            </div>
          )}

          {/* File Upload Override */}
          {allowFileUpload && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Upload PDF File Override
              </label>
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center justify-center gap-2 min-h-[38px] bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-xl px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer transition-colors">
                  <FileUp size={15} className="text-blue-500 shrink-0" />
                  <span className="truncate">{uploadedFile ? uploadedFile.name : 'Choose local PDF...'}</span>
                  <input type="file" accept="application/pdf" onChange={handleFileUpload} className="hidden" />
                </label>
                {uploadedFile && (
                  <button
                    onClick={() => setUploadedFile(null)}
                    className="p-2 text-slate-400 hover:text-red-500 rounded-lg"
                    title="Remove custom file"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Collapsible Advanced Settings */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 py-1"
            >
              <span className="flex items-center gap-1.5"><Settings2 size={14} /> More Settings</span>
              <span>{showAdvanced ? '−' : '+'}</span>
            </button>

            {showAdvanced && (
              <div className="space-y-3 mt-3 pt-2 animate-in fade-in duration-150">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Pages per sheet</label>
                    <select
                      value={pagesPerSheet}
                      onChange={(e) => setPagesPerSheet(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value="1">1 page</option>
                      <option value="2">2 pages</option>
                      <option value="4">4 pages</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Duplex Mode</label>
                    <select
                      value={duplex}
                      onChange={(e) => setDuplex(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value="simplex">One-sided</option>
                      <option value="long-edge">Flip on long edge</option>
                      <option value="short-edge">Flip on short edge</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeBackgrounds}
                      onChange={(e) => setIncludeBackgrounds(e.target.checked)}
                      className="rounded accent-blue-600 w-4 h-4"
                    />
                    Background Graphics
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeHeadersFooters}
                      onChange={(e) => setIncludeHeadersFooters(e.target.checked)}
                      className="rounded accent-blue-600 w-4 h-4"
                    />
                    Headers & Footers
                  </label>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Watermark Overlay</label>
                  <input
                    type="text"
                    placeholder="e.g. CONFIDENTIAL / DRAFT"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 dark:bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 lg:p-6 transition-opacity animate-in fade-in duration-200">
      
      {/* Outer Card Frame — Responsive sizing using safe-area spacing */}
      <div className="bg-white dark:bg-slate-900 border-0 sm:border border-slate-200 dark:border-slate-800 rounded-none sm:rounded-2xl w-full max-w-6xl h-full sm:h-[92vh] sm:max-h-[850px] flex flex-col shadow-2xl overflow-hidden relative text-slate-800 dark:text-slate-100 pb-safe">
        
        {/* ── Modal Header (Compact & Responsive) ── */}
        <div className="flex items-center justify-between px-3.5 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-semibold shrink-0">
              <Printer size={18} className="sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-base font-bold leading-tight text-slate-900 dark:text-white flex items-center gap-1.5 sm:gap-2 truncate">
                <span>Print Terminal</span>
                <span className="text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 truncate max-w-[120px] sm:max-w-[200px]" title={documentTitle}>
                  {documentTitle}
                </span>
              </h2>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                Configure destination, paper, layout, and preview options
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mode Switcher Toggle */}
            <div className="flex items-center bg-slate-200/60 dark:bg-slate-950 p-0.5 sm:p-1 rounded-xl border border-slate-300/50 dark:border-slate-800">
              <button
                type="button"
                onClick={handleSelectLocalMode}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  printMode === 'local'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Monitor size={13} className="shrink-0" />
                <span className="hidden xs:inline">My Printer</span>
              </button>
              <button
                type="button"
                onClick={handleSelectServerMode}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  printMode === 'server'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Server size={13} className="shrink-0" />
                <span className="hidden xs:inline">Server</span>
              </button>
            </div>

            {/* Mobile Settings Drawer Button */}
            <button
              onClick={() => setMobileSettingsOpen(!mobileSettingsOpen)}
              className="lg:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              title="Toggle settings drawer"
            >
              <SlidersHorizontal size={18} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              title="Close modal"
            >
              <X size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* ── Main Body Split-View ── */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* DESKTOP LEFT PANEL: CONFIGURATION CONTROLS (95% Identical desktop layout) */}
          {/* ───────────────────────────────────────────────────────────────── */}
          <div className="hidden lg:flex w-[340px] xl:w-[380px] flex-col shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-y-auto custom-scrollbar">
            {renderControlPanel()}

            {/* Desktop Sticky Action Footer */}
            <div className="mt-auto p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
              {printMode === 'server' ? (
                <button
                  onClick={handleDirectServerPrint}
                  disabled={isPrinting || !selectedPrinter || !activeBlob || !pinVerified}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md disabled:opacity-40 transition-all cursor-pointer"
                >
                  {isPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                  Direct Server Print
                </button>
              ) : (
                <button
                  onClick={handleBrowserPrint}
                  disabled={isPreviewPrinting || (!activeBlob && !htmlContent)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md disabled:opacity-40 transition-all cursor-pointer"
                >
                  {isPreviewPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                  Print via Browser
                </button>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleDownloadPDF}
                  disabled={!blobUrl}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl disabled:opacity-40 transition-colors"
                >
                  <Download size={14} /> Download PDF
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* MOBILE / TABLET SLIDE-UP DRAWER (Settings Modal on Mobile)        */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {mobileSettingsOpen && (
            <div className="lg:hidden absolute inset-0 z-30 bg-white dark:bg-slate-900 flex flex-col overflow-y-auto animate-in slide-in-from-bottom duration-200">
              <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Print Options</span>
                <button
                  onClick={() => setMobileSettingsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {renderControlPanel()}
              </div>
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <button
                  onClick={() => setMobileSettingsOpen(false)}
                  className="w-full py-2.5 text-xs font-bold bg-blue-600 text-white rounded-xl shadow-sm"
                >
                  Done (Apply Settings)
                </button>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* RIGHT PANEL: LIVE DOCUMENT PREVIEW VIEWPORT                       */}
          {/* ───────────────────────────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-950 overflow-hidden relative min-h-0">
            
            {/* Viewport Top Toolbar */}
            <div className="px-3 sm:px-4 py-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 z-10">
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-slate-800 dark:text-slate-200">{paperSize}</span>
                <span>•</span>
                <span className="capitalize">{orientation}</span>
                {colorMode === 'grayscale' && <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded">Grayscale</span>}
              </div>

              {/* Viewport Controls: Zoom & Rotate */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(40, z - 15))}
                  className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 min-h-[36px] min-w-[36px] flex items-center justify-center"
                  title="Zoom Out"
                >
                  <ZoomOut size={16} />
                </button>
                <span className="text-[11px] sm:text-xs font-mono font-semibold w-9 text-center">{zoomLevel}%</span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(200, z + 15))}
                  className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 min-h-[36px] min-w-[36px] flex items-center justify-center"
                  title="Zoom In"
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 ml-0.5 min-h-[36px] min-w-[36px] flex items-center justify-center"
                  title="Rotate Preview"
                >
                  <RotateCw size={16} />
                </button>
              </div>
            </div>

            {/* Document Render Canvas */}
            <div className="flex-1 overflow-auto p-2 sm:p-6 lg:p-8 flex items-center justify-center relative custom-scrollbar">
              {blobUrl ? (
                <div
                  className="transition-all duration-200 shadow-2xl rounded-sm bg-white overflow-hidden relative max-w-full"
                  style={{
                    transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                    transformOrigin: 'center center',
                    filter: colorMode === 'grayscale' ? 'grayscale(100%)' : colorMode === 'bw' ? 'contrast(200%) grayscale(100%)' : 'none',
                    width: orientation === 'landscape' ? '842px' : '595px',
                    height: orientation === 'landscape' ? '595px' : '842px',
                  }}
                >
                  {/* Watermark Overlay Preview */}
                  {watermarkText && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20 overflow-hidden">
                      <span className="text-4xl sm:text-6xl font-black text-slate-400/20 dark:text-slate-600/20 -rotate-45 uppercase select-none tracking-widest text-center px-4">
                        {watermarkText}
                      </span>
                    </div>
                  )}

                  <iframe
                    src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                    title="Print Document Preview"
                    className="w-full h-full border-0"
                    onLoad={() => setIsPreviewLoading(false)}
                  />
                </div>
              ) : htmlContent ? (
                <div
                  className="bg-white text-slate-900 p-4 sm:p-8 shadow-2xl rounded-sm transition-all duration-200 overflow-auto max-w-full"
                  style={{
                    transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                    width: orientation === 'landscape' ? '842px' : '595px',
                    height: orientation === 'landscape' ? '595px' : '842px',
                  }}
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <div className="w-14 h-14 rounded-2xl bg-slate-200/50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 flex items-center justify-center mb-3">
                    <FileText size={26} />
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">No Document Loaded</p>
                  <p className="text-[11px] sm:text-xs max-w-[240px]">Pass a valid PDF Blob or HTML content, or select a file using the file override option.</p>
                </div>
              )}
            </div>

            {/* Bottom Status Bar */}
            <div className="px-3 sm:px-4 py-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] sm:text-xs text-slate-500 shrink-0">
              <span className="truncate max-w-[180px] sm:max-w-[280px]">
                {uploadedFile?.name || `${documentTitle}.pdf`}
              </span>
              <span className="flex items-center gap-1 font-medium">
                <Check size={13} className="text-emerald-500 shrink-0" /> <span className="hidden xs:inline">Preview</span> Ready
              </span>
            </div>

          </div>

        </div>

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* MOBILE STICKY ACTION FOOTER (Always Visible on Touch Devices)     */}
        {/* ───────────────────────────────────────────────────────────────── */}
        <div className="lg:hidden p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 shrink-0">
          {printMode === 'server' ? (
            <button
              onClick={handleDirectServerPrint}
              disabled={isPrinting || !selectedPrinter || !activeBlob || !pinVerified}
              className="flex-1 flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md disabled:opacity-40 transition-all"
            >
              {isPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
              Server Print
            </button>
          ) : (
            <button
              onClick={handleBrowserPrint}
              disabled={isPreviewPrinting || (!activeBlob && !htmlContent)}
              className="flex-1 flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md disabled:opacity-40 transition-all"
            >
              {isPreviewPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
              Print
            </button>
          )}

          <button
            onClick={handleDownloadPDF}
            disabled={!blobUrl}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl disabled:opacity-40"
            title="Download PDF"
          >
            <Download size={16} />
          </button>
          
          <button
            onClick={onClose}
            className="min-h-[44px] px-3 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}