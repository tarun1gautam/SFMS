import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Printer, Loader2, Eye, X, RefreshCw } from 'lucide-react';
import usePrinter from '../hooks/usePrinter';
import { printDOM, printPDFBlob } from '../utils/printDOM';

/**
 * PrinterManagerModal — lets the user pick a server printer and either:
 *  1. Submit a silent direct print job to the Windows Server, or
 *  2. Preview & print via the browser's native print dialog (fallback).
 *
 * Props:
 *  - isOpen, onClose: modal visibility control
 *  - pdfBlob: the PDF Blob to print (for direct server print + PDF browser fallback)
 *  - htmlContent: optional raw HTML to print via printDOM() instead of a PDF blob
 *  - documentTitle: label shown in the modal + used as print title
 *  - defaultOptions: { copies, paperSize, orientation } initial values
 *  - allowFileUpload: shows an "upload a PDF to print" override input
 */
export default function PrinterManagerModal({
  isOpen,
  onClose,
  pdfBlob = null,
  htmlContent = null,
  documentTitle = 'Document',
  defaultOptions = {},
  allowFileUpload = false,
}) {
  const {
    printers,
    selectedPrinter,
    setSelectedPrinter,
    isLoadingPrinters,
    isPrinting,
    refreshPrinters,
    printPDF,
  } = usePrinter();

  const [copies, setCopies]           = useState(defaultOptions.copies || 1);
  const [paperSize, setPaperSize]     = useState(defaultOptions.paperSize || 'A4');
  const [orientation, setOrientation] = useState(defaultOptions.orientation || 'portrait');
  const [isPreviewPrinting, setIsPreviewPrinting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  if (!isOpen) return null;

  // Whichever blob is "active" — an uploaded override takes priority over the prop
  const activeBlob = uploadedFile || pdfBlob;

  const handleDirectServerPrint = async () => {
    if (!activeBlob) {
      toast.error('Direct server printing requires a generated PDF document.');
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
        toast.error('Nothing available to preview — no PDF or HTML content provided.');
        return;
      }
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
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files can be printed directly. Use Preview & Print for other formats.');
      return;
    }
    setUploadedFile(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/60 dark:bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl shadow-gray-300/40 dark:shadow-black/50 relative">

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-ink dark:text-white flex items-center gap-2">
            <Printer size={20} className="text-blue-600 dark:text-blue-400" />
            Print — {documentTitle}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-faint dark:text-gray-500 hover:text-ink dark:hover:text-white hover:bg-field dark:hover:bg-gray-800 rounded-lg transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">

          {/* Printer selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-subtle dark:text-gray-400">
                Server Printer
              </label>
              <button
                onClick={refreshPrinters}
                disabled={isLoadingPrinters}
                className="text-faint dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-40"
                title="Refresh printer list"
              >
                <RefreshCw size={13} className={isLoadingPrinters ? 'animate-spin' : ''} />
              </button>
            </div>

            {isLoadingPrinters ? (
              <div className="w-full bg-field dark:bg-gray-950 border border-line dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-faint dark:text-gray-500">
                Loading printers…
              </div>
            ) : printers.length === 0 ? (
              <div className="w-full bg-field dark:bg-gray-950 border border-line dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-amber-600 dark:text-amber-400">
                No printers found on server host.
              </div>
            ) : (
              <select
                value={selectedPrinter}
                onChange={e => setSelectedPrinter(e.target.value)}
                className="w-full bg-field dark:bg-gray-950 border border-line dark:border-gray-800 rounded-xl px-3 py-2.5 text-sm text-ink dark:text-white focus:outline-none focus:border-blue-500"
              >
                {printers.map(p => (
                  <option key={p.name} value={p.name}>
                    {p.name}{p.isDefault ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Copies / Paper size / Orientation */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-subtle dark:text-gray-400 mb-1.5">
                Copies
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={copies}
                onChange={e => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-field dark:bg-gray-950 border border-line dark:border-gray-800 rounded-xl px-3 py-2 text-sm text-ink dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-subtle dark:text-gray-400 mb-1.5">
                Paper Size
              </label>
              <select
                value={paperSize}
                onChange={e => setPaperSize(e.target.value)}
                className="w-full bg-field dark:bg-gray-950 border border-line dark:border-gray-800 rounded-xl px-2 py-2 text-sm text-ink dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
                <option value="80mm">80mm (Receipt)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-subtle dark:text-gray-400 mb-1.5">
                Orientation
              </label>
              <select
                value={orientation}
                onChange={e => setOrientation(e.target.value)}
                className="w-full bg-field dark:bg-gray-950 border border-line dark:border-gray-800 rounded-xl px-2 py-2 text-sm text-ink dark:text-white focus:outline-none focus:border-blue-500"
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
          </div>

          {/* Upload a different file to print — optional override */}
          {allowFileUpload && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-subtle dark:text-gray-400 mb-1.5">
                Or Upload a File to Print
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-subtle dark:text-gray-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg
                             file:border-0 file:text-xs file:font-semibold file:bg-field dark:file:bg-gray-800
                             file:text-subtle dark:file:text-gray-300 hover:file:bg-line dark:hover:file:bg-gray-700 cursor-pointer"
                />
                {uploadedFile && (
                  <button
                    onClick={() => setUploadedFile(null)}
                    className="p-1.5 text-faint dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Remove uploaded file"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {uploadedFile && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 truncate">
                  Using: {uploadedFile.name}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              onClick={handleDirectServerPrint}
              disabled={isPrinting || !selectedPrinter || !activeBlob}
              className="flex items-center justify-center gap-2 py-2.5 text-sm font-semibold
                         bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow shadow-blue-600/20
                         disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {isPrinting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Submitting job…
                </>
              ) : (
                <>
                  <Printer size={16} />
                  Direct Server Print
                </>
              )}
            </button>

            <button
              onClick={handleBrowserPrint}
              disabled={isPreviewPrinting || (!activeBlob && !htmlContent)}
              className="flex items-center justify-center gap-2 py-2.5 text-sm font-medium
                         bg-field dark:bg-gray-950 border border-line dark:border-gray-800
                         hover:bg-line dark:hover:bg-gray-800 text-subtle dark:text-gray-300
                         rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {isPreviewPrinting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Opening preview…
                </>
              ) : (
                <>
                  <Eye size={16} />
                  Preview &amp; Print via Browser
                </>
              )}
            </button>

            {!activeBlob && !htmlContent && (
              <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                No document loaded — pass a pdfBlob or htmlContent prop{allowFileUpload ? ', or upload a file above' : ''}.
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}