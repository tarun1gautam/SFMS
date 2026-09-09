import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';

/**
 * PdfToolsSection — visual redesign only.
 * All API calls, validation, and success/error handling are unchanged
 * from the original component, except for Split (see handleSplit below):
 * the backend now streams the extracted pages straight back as a download
 * instead of saving a new file to storage, so the frontend downloads the
 * response as a blob instead of waiting on a JSON "file saved" message.
 */

const ScissorsIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <path strokeLinecap="round" d="M8.5 7.5L19 18M8.5 16.5L19 6M10.5 12l2 2" />
  </svg>
);

const MergeIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v9a3 3 0 003 3h4M7 4L4.5 6.5M7 4l2.5 2.5M17 8V4m0 0l-2.5 2.5M17 4l2.5 2.5M17 16v4m0 0l-2.5-2.5M17 20l2.5-2.5" />
  </svg>
);

const InfoIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" d="M12 11v5" />
    <circle cx="12" cy="8" r="0.75" fill="currentColor" stroke="none" />
  </svg>
);

const PdfDocIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4h4" />
    <path strokeLinecap="round" d="M8.5 14.5h1.2M8.5 17h2M13.5 14.5h2M13.5 17h2" />
  </svg>
);

const UploadFileIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V4m0 0L8 8m4-4l4 4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
  </svg>
);

// Reads an error out of an axios error response, whether the response body
// came back as JSON (normal case) or as a Blob (happens here because the
// split request is sent with responseType: 'blob' — on a non-2xx response
// axios still hands back a Blob, not the parsed JSON error).
async function extractErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') {
    try { return JSON.parse(data).error || fallback; } catch (_) { return fallback; }
  }
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      return JSON.parse(text).error || fallback;
    } catch (_) {
      return fallback;
    }
  }
  return data.error || fallback;
}

export default function PdfToolsSection({ fileData, onUpdateSuccess }) {
  const [totalPages,  setTotalPages]  = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [activeTab,   setActiveTab]   = useState(null); // 'split' | 'merge' | null
  const [busy,        setBusy]        = useState(false);

  const [splitFrom, setSplitFrom] = useState('');
  const [splitTo,   setSplitTo]   = useState('');

  const [mergeFile, setMergeFile] = useState(null);
  const [mergeMode, setMergeMode] = useState('append'); // 'append' | 'insert'
  const [insertAt,  setInsertAt]  = useState('');

  useEffect(() => {
    if (!fileData?.id) return;
    setLoadingInfo(true);
    api.get(`/files/${fileData.id}/pdf-info`)
      .then(res => setTotalPages(res.data.pageCount))
      .catch(() => setTotalPages(null))
      .finally(() => setLoadingInfo(false));
  }, [fileData?.id]);

  const reset = () => {
    setActiveTab(null);
    setSplitFrom(''); setSplitTo('');
    setMergeFile(null); setMergeMode('append'); setInsertAt('');
  };

  // ── Split handler ──────────────────────────────────────────
  // The backend streams the extracted page range straight back as a PDF
  // download — it does not save a new file to storage. So this requests
  // the response as a blob and triggers a normal browser download from it,
  // instead of posting for a JSON "file saved" message.
  const handleSplit = async () => {
    const from = parseInt(splitFrom);
    const to   = parseInt(splitTo);
    if (!from || !to || from < 1 || to > totalPages || from > to) {
      toast.error(`Enter a valid range between 1 and ${totalPages}.`);
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(
        `/files/${fileData.id}/split-pdf`,
        { fromPage: from, toPage: to },
        { responseType: 'blob' }
      );

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url  = window.URL.createObjectURL(blob);
      const ext  = (fileData.file_name || '').match(/\.[^.]+$/)?.[0] || '.pdf';
      const base = (fileData.file_name || 'document').replace(/\.[^.]+$/, '');

      const link = document.createElement('a');
      link.href = url;
      link.download = `${base}_pages${from}-${to}${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(`Pages ${from}–${to} downloaded.`);
      reset();
    } catch (err) {
      toast.error(await extractErrorMessage(err, 'Split failed.'));
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
    <div className="border-t border-gray-200 dark:border-gray-800 pt-3 mt-1">

      {/* Compact header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-500/10 text-blue-500 dark:text-blue-400 shrink-0">
            <PdfDocIcon className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-xs font-bold text-gray-900 dark:text-white truncate">PDF Tools</p>
            <p className="text-[10.5px] text-gray-500 dark:text-gray-500 truncate">Quick document actions</p>
          </div>
        </div>

        {loadingInfo ? (
          <span className="text-[11px] text-gray-400 dark:text-gray-600 shrink-0 animate-pulse">Loading…</span>
        ) : totalPages ? (
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 shrink-0 tabular-nums">
            {totalPages} {totalPages === 1 ? 'page' : 'pages'}
          </span>
        ) : null}
      </div>

      {/* Action cards */}
      {!activeTab && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setActiveTab('split')}
            disabled={!totalPages}
            className="group flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800
                       bg-white dark:bg-gray-950 px-3 py-2.5 text-left
                       hover:border-blue-400 dark:hover:border-blue-500/60 hover:bg-blue-50/60 dark:hover:bg-blue-500/5
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 dark:disabled:hover:border-gray-800
                       transition-all duration-150"
          >
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-blue-500/10 text-blue-500 dark:text-blue-400 shrink-0 group-hover:scale-105 transition-transform">
              <ScissorsIcon className="w-3.5 h-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">Split Pages</span>
              <span className="block text-[10.5px] text-gray-500 dark:text-gray-500 truncate">Extract a range</span>
            </span>
          </button>

          <button
            onClick={() => setActiveTab('merge')}
            disabled={!totalPages}
            className="group flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800
                       bg-white dark:bg-gray-950 px-3 py-2.5 text-left
                       hover:border-emerald-400 dark:hover:border-emerald-500/60 hover:bg-emerald-50/60 dark:hover:bg-emerald-500/5
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 dark:disabled:hover:border-gray-800
                       transition-all duration-150"
          >
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 shrink-0 group-hover:scale-105 transition-transform">
              <MergeIcon className="w-3.5 h-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">Merge Pages</span>
              <span className="block text-[10.5px] text-gray-500 dark:text-gray-500 truncate">Add pages in</span>
            </span>
          </button>
        </div>
      )}

      {/* SPLIT PANEL */}
      {activeTab === 'split' && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-3 space-y-3
                         animate-[fadeIn_0.15s_ease-out]">
          <div className="flex items-center gap-1.5">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-500/10 text-blue-500 dark:text-blue-400">
              <ScissorsIcon className="w-3 h-3" />
            </span>
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Split PDF</p>
          </div>

          <div>
            <label className="block text-[10.5px] font-medium text-gray-500 dark:text-gray-500 mb-1">
              Select page range
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" max={totalPages}
                value={splitFrom}
                onChange={e => setSplitFrom(e.target.value)}
                placeholder="From"
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2.5 py-1.5
                           text-xs text-gray-900 dark:text-white text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30
                           transition-colors"
              />
              <span className="text-gray-300 dark:text-gray-700 text-xs shrink-0">—</span>
              <input
                type="number" min="1" max={totalPages}
                value={splitTo}
                onChange={e => setSplitTo(e.target.value)}
                placeholder="To"
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2.5 py-1.5
                           text-xs text-gray-900 dark:text-white text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30
                           transition-colors"
              />
            </div>
          </div>

          <div className="flex items-start gap-1.5 rounded-md bg-blue-50 dark:bg-blue-500/10 px-2.5 py-2">
            <InfoIcon className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0 mt-[1px]" />
            <p className="text-[10.5px] leading-snug text-blue-700 dark:text-blue-300">
              The extracted PDF will be downloaded directly and won't be added to your storage.
            </p>
          </div>

          <div className="flex gap-2 pt-0.5">
            <button onClick={reset}
              className="flex-1 py-1.5 text-xs font-semibold rounded-md border border-gray-200 dark:border-gray-700
                         text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button onClick={handleSplit} disabled={busy}
              className="flex-1 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500
                         text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                         flex items-center justify-center gap-1.5">
              {busy && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {busy ? 'Preparing…' : 'Download PDF'}
            </button>
          </div>
        </div>
      )}

      {/* MERGE PANEL */}
      {activeTab === 'merge' && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-3 space-y-3
                         animate-[fadeIn_0.15s_ease-out]">
          <div className="flex items-center gap-1.5">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
              <MergeIcon className="w-3 h-3" />
            </span>
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Merge Pages</p>
          </div>

          <label
            htmlFor="pdf-merge-file"
            className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 dark:border-gray-700
                       bg-gray-50 dark:bg-gray-900 px-3 py-2 cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-500/60
                       transition-colors"
          >
            <UploadFileIcon className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
            <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
              {mergeFile ? mergeFile.name : 'Choose PDF / JPG / PNG'}
            </span>
            <input
              id="pdf-merge-file"
              type="file"
              accept=".pdf,image/jpeg,image/png"
              onChange={e => setMergeFile(e.target.files[0] || null)}
              className="hidden"
            />
          </label>

          <div>
            <label className="block text-[10.5px] font-medium text-gray-500 dark:text-gray-500 mb-1">Where to add</label>
            <div className="flex gap-1.5">
              {['append', 'insert'].map(m => (
                <button key={m}
                  onClick={() => setMergeMode(m)}
                  className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md border transition-colors
                    ${mergeMode === m
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                  {m === 'append' ? 'Append at end' : 'Insert at position'}
                </button>
              ))}
            </div>
          </div>

          {mergeMode === 'insert' && (
            <div>
              <label className="block text-[10.5px] font-medium text-gray-500 dark:text-gray-500 mb-1">
                Insert before page (1–{totalPages + 1})
              </label>
              <input
                type="number" min="1" max={totalPages + 1}
                value={insertAt}
                onChange={e => setInsertAt(e.target.value)}
                placeholder={`1 – ${totalPages + 1}`}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2.5 py-1.5
                           text-xs text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30
                           transition-colors"
              />
            </div>
          )}

          <div className="flex gap-2 pt-0.5">
            <button onClick={reset}
              className="flex-1 py-1.5 text-xs font-semibold rounded-md border border-gray-200 dark:border-gray-700
                         text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button onClick={handleMerge} disabled={busy}
              className="flex-1 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500
                         text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                         flex items-center justify-center gap-1.5">
              {busy && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {busy ? 'Merging…' : 'Merge Pages'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}