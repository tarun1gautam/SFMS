import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { toast } from 'react-hot-toast';

const STORAGE_KEY = 'sfms_selected_printer';

/**
 * usePrinter — manages printer discovery, selection persistence, and
 * submitting print jobs to the SFMS Print Management API.
 */
export default function usePrinter() {
  const [printers, setPrinters]           = useState([]);
  const [selectedPrinter, setSelectedPrinterState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || ''
  );
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isPrinting, setIsPrinting]       = useState(false);
  const [error, setError]                 = useState(null);

  // ── Fetch printers on mount ─────────────────────────────────────────
  const fetchPrinters = useCallback(async () => {
    setIsLoadingPrinters(true);
    setError(null);
    try {
      const res = await api.get('/print/printers');
      const list = res.data.printers || [];
      setPrinters(list);

      // If nothing selected yet, or the saved selection no longer exists,
      // default to the server's default printer (or the first one available)
      setSelectedPrinterState(prev => {
        const stillExists = list.some(p => p.name === prev);
        if (prev && stillExists) return prev;

        const defaultPrinter = list.find(p => p.isDefault);
        const fallback = defaultPrinter?.name || list[0]?.name || '';
        if (fallback) localStorage.setItem(STORAGE_KEY, fallback);
        return fallback;
      });
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load printer list.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoadingPrinters(false);
    }
  }, []);

  useEffect(() => {
    fetchPrinters();
  }, [fetchPrinters]);

  // ── Persist selection to localStorage whenever it changes ───────────
  const setSelectedPrinter = useCallback((printerName) => {
    setSelectedPrinterState(printerName);
    localStorage.setItem(STORAGE_KEY, printerName);
  }, []);

  // ── Submit a print job ───────────────────────────────────────────────
  /**
   * @param {Blob} pdfBlob - the PDF file/blob to print
   * @param {Object} options
   * @param {string} [options.printerName] - overrides the selected printer
   * @param {number} [options.copies=1]
   * @param {string} [options.paperSize] - e.g. 'A4', 'Letter', '80mm'
   * @param {string} [options.orientation] - 'portrait' | 'landscape'
   * @param {string} [options.fileName='document.pdf']
   */
  const printPDF = useCallback(async (pdfBlob, options = {}) => {
    const targetPrinter = options.printerName || selectedPrinter;

    if (!targetPrinter) {
      const message = 'No printer selected.';
      setError(message);
      toast.error(message);
      return { success: false, error: message };
    }

    if (!pdfBlob) {
      const message = 'No document provided to print.';
      setError(message);
      toast.error(message);
      return { success: false, error: message };
    }

    setIsPrinting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', pdfBlob, options.fileName || 'document.pdf');
      formData.append('printerName', targetPrinter);
      formData.append('copies', String(options.copies || 1));
      if (options.paperSize)   formData.append('paperSize', options.paperSize);
      if (options.orientation) formData.append('orientation', options.orientation);

      const res = await api.post('/print/job', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success(res.data.message || 'Print job submitted.');
      return { success: true, data: res.data };
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to submit print job.';
      setError(message);
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setIsPrinting(false);
    }
  }, [selectedPrinter]);

  return {
    printers,
    selectedPrinter,
    setSelectedPrinter,
    isLoadingPrinters,
    isPrinting,
    error,
    refreshPrinters: fetchPrinters,
    printPDF,
  };
}