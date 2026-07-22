import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';

/**
 * PdfToolsSection
 * Drop this inside EditFileModal when fileData.mime_type === 'application/pdf'
 * Props:
 *   fileData      — the file object (needs .id, .file_name, .mime_type)
 *   onUpdateSuccess — callback to refresh parent after operation
 */
export default function PdfToolsSection({ fileData, onUpdateSuccess }) {
  const [totalPages,  setTotalPages]  = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [activeTab,   setActiveTab]   = useState(null); // 'split' | 'merge' | null
  const [busy,        setBusy]        = useState(false);

  // ── Split state ────────────────────────────────────────────
  const [splitFrom, setSplitFrom] = useState('');
  const [splitTo,   setSplitTo]   = useState('');

  // ── Merge state ────────────────────────────────────────────
  const [mergeFile,    setMergeFile]    = useState(null);
  const [mergeMode,    setMergeMode]    = useState('append'); // 'append' | 'insert'
  const [insertAt,     setInsertAt]     = useState('');

  // ── Fetch page count on mount ──────────────────────────────
  useEffect(() => {
    if (!fileData?.id) return;
    setLoadingInfo(true);
    api.get(`/files/${fileData.id}/pdf-info`)
      .then(res => setTotalPages(res.data.pageCount))
      .catch(() => setTotalPages(null))
      .finally(() => setLoadingInfo(false));
  }, [fileData?.id]);

  // ── Helpers ────────────────────────────────────────────────
  const reset = () => {
    setActiveTab(null);
    setSplitFrom(''); setSplitTo('');
    setMergeFile(null); setMergeMode('append'); setInsertAt('');
  };

  // ── Split handler ──────────────────────────────────────────
  const handleSplit = async () => {
    const from = parseInt(splitFrom);
    const to   = parseInt(splitTo);
    if (!from || !to || from < 1 || to > totalPages || from > to) {
      toast.error(`Enter a valid range between 1 and ${totalPages}.`);
      return;
    }
    setBusy(true);
    try {
      await api.post(`/files/${fileData.id}/split-pdf`, { fromPage: from, toPage: to });
      toast.success(`Pages ${from}–${to} extracted as a new file.`);
      onUpdateSuccess();
      reset();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Split failed.');
    } finally {
      setBusy(false);
    }
  };

  // ── Merge handler ──────────────────────────────────────────
  const handleMerge = async () => {
    if (!mergeFile) { toast.error('Select a file to merge.'); return; }
    if (mergeMode === 'insert' && (!insertAt || parseInt(insertAt) < 1 || parseInt(insertAt) > totalPages + 1)) {
      toast.error(`Insert position must be between 1 and ${totalPages + 1}.`);
      return;
    }
    const form = new FormData();
    form.append('file', mergeFile);
    form.append('mode', mergeMode);
    if (mergeMode === 'insert') form.append('insertAt', parseInt(insertAt) - 1); // 0-indexed
    setBusy(true);
    try {
      await api.post(`/files/${fileData.id}/merge-pages`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Pages merged successfully.');
      onUpdateSuccess();
      reset();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Merge failed.');
    } finally {
      setBusy(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="border-t border-gray-200 dark:border-gray-800 pt-4 mt-1">

      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">
          PDF Tools
        </span>
        {loadingInfo ? (
          <span className="text-xs text-gray-500 dark:text-gray-500">Loading…</span>
        ) : totalPages ? (
          <span className="text-xs text-gray-500 dark:text-gray-500">{totalPages} pages</span>
        ) : null}
      </div>

      {/* Tool buttons */}
      {!activeTab && (
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('split')}
            disabled={!totalPages}
            className="flex-1 py-2 text-xs font-semibold rounded-xl border border-gray-300 dark:border-gray-700 
                       text-gray-700 dark:text-gray-300 hover:border-blue-500 hover:text-blue-400 
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ✂️ Split Pages
          </button>
          <button
            onClick={() => setActiveTab('merge')}
            disabled={!totalPages}
            className="flex-1 py-2 text-xs font-semibold rounded-xl border border-gray-300 dark:border-gray-700 
                       text-gray-700 dark:text-gray-300 hover:border-green-500 hover:text-green-400
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            🔗 Merge Pages
          </button>
        </div>
      )}

      {/* ── SPLIT PANEL ── */}
      {activeTab === 'split' && (
        <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Extract pages into a new file. Original stays intact.
          </p>

          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <label className="text-xs text-gray-500 dark:text-gray-500 mb-1 block">From page</label>
              <input
                type="number" min="1" max={totalPages}
                value={splitFrom}
                onChange={e => setSplitFrom(e.target.value)}
                placeholder="1"
                className="w-full bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 
                           text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <span className="text-gray-400 dark:text-gray-600 mt-5">—</span>
            <div className="flex-1">
              <label className="text-xs text-gray-500 dark:text-gray-500 mb-1 block">To page</label>
              <input
                type="number" min="1" max={totalPages}
                value={splitTo}
                onChange={e => setSplitTo(e.target.value)}
                placeholder={totalPages}
                className="w-full bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 
                           text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={reset}
              className="flex-1 py-2 text-xs font-semibold rounded-xl border border-gray-300 dark:border-gray-700 
                         text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button onClick={handleSplit} disabled={busy}
              className="flex-1 py-2 text-xs font-semibold rounded-xl bg-blue-600 
                         hover:bg-blue-500 text-white disabled:opacity-50">
              {busy ? 'Splitting…' : 'Extract Pages'}
            </button>
          </div>
        </div>
      )}

      {/* ── MERGE PANEL ── */}
      {activeTab === 'merge' && (
        <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Upload a PDF or image to add to this document.
          </p>

          {/* File upload */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-500 mb-1 block">File (PDF / JPG / PNG)</label>
            <input
              type="file"
              accept=".pdf,image/jpeg,image/png"
              onChange={e => setMergeFile(e.target.files[0] || null)}
              className="w-full text-xs text-gray-600 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 
                         file:rounded-lg file:border-0 file:text-xs file:font-semibold
                         file:bg-gray-200 dark:file:bg-gray-800 file:text-gray-700 dark:file:text-gray-300 hover:file:bg-gray-300 dark:hover:file:bg-gray-700"
            />
          </div>

          {/* Mode toggle */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-500 mb-1 block">Where to add</label>
            <div className="flex gap-2">
              {['append', 'insert'].map(m => (
                <button key={m}
                  onClick={() => setMergeMode(m)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors
                    ${mergeMode === m
                      ? 'bg-green-600/20 border-green-500 text-green-400'
                      : 'border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-600'}`}>
                  {m === 'append' ? 'Append at end' : 'Insert at position'}
                </button>
              ))}
            </div>
          </div>

          {/* Insert position */}
          {mergeMode === 'insert' && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-500 mb-1 block">
                Insert before page (1–{totalPages + 1})
              </label>
              <input
                type="number" min="1" max={totalPages + 1}
                value={insertAt}
                onChange={e => setInsertAt(e.target.value)}
                placeholder={`1 – ${totalPages + 1}`}
                className="w-full bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 
                           text-sm text-white focus:outline-none focus:border-green-500"
              />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={reset}
              className="flex-1 py-2 text-xs font-semibold rounded-xl border border-gray-300 dark:border-gray-700 
                         text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button onClick={handleMerge} disabled={busy}
              className="flex-1 py-2 text-xs font-semibold rounded-xl bg-green-600 
                         hover:bg-green-500 text-white disabled:opacity-50">
              {busy ? 'Merging…' : 'Merge Pages'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}