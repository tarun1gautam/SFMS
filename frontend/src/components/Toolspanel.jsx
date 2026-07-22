/**
 * ToolsPanel.jsx  (SFMS — Document Toolkit)
 *
 * Six self-contained tools rendered as cards. Each tool manages its own
 * local state and talks directly to /api/tools/*. Results download
 * automatically as a blob — nothing is written to the file directory.
 */

import React, { useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import api from '../utils/api';
import {
  LayoutGrid, Droplets, Minimize2, FileStack,
  Images, FolderArchive, UploadCloud, X, RotateCw,
  Download, Loader2, GripVertical,
} from 'lucide-react';

// ── HELPERS ──────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function blobErrorMessage(err, fallback) {
  try {
    if (err.response?.data instanceof Blob) {
      const text = await err.response.data.text();
      const parsed = JSON.parse(text);
      return parsed.error || fallback;
    }
    return err.response?.data?.error || err.message || fallback;
  } catch (_) {
    return fallback;
  }
}

// ── SHARED UI COMPONENTS ─────────────────────────────────────────────────

function ToolCard({ icon: Icon, title, description, accent, children }) {
  return (
    <div className="bg-gray-100/50 dark:bg-gray-900/50 border border-gray-200/80 dark:border-gray-800/80 rounded-2xl shadow-xl overflow-hidden flex flex-col backdrop-blur-sm hover:border-gray-300/50 dark:hover:border-gray-700/50 transition-all duration-300 group">
      <div className="p-6 border-b border-gray-200/60 dark:border-gray-800/60 flex items-center gap-4 bg-gray-100/20 dark:bg-gray-900/20">
        <div className={`p-2.5 rounded-xl border shrink-0 transition-transform duration-300 group-hover:scale-105 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-tight">{title}</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-1">{description}</p>
        </div>
      </div>
      <div className="p-6 flex-1 flex flex-col gap-5 bg-gray-100/10 dark:bg-gray-900/10">{children}</div>
    </div>
  );
}

function Dropzone({ multiple, accept, files, onFiles, hint }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (fileList) => {
    const arr = Array.from(fileList);
    onFiles(multiple ? arr : arr.slice(0, 1));
  };

  return (
    <div className="w-full">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        className={`cursor-pointer rounded-xl border border-dashed p-5 text-center transition-all duration-200 ${
          dragOver 
            ? 'border-blue-500 bg-blue-500/5 scale-[0.99]' 
            : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white/60 dark:bg-gray-950/60 hover:bg-white/90 dark:hover:bg-gray-950/90'
        }`}
      >
        <UploadCloud className="h-5 w-5 mx-auto text-gray-500 dark:text-gray-500 mb-2 transition-transform duration-200 group-hover:-translate-y-0.5" />
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <span className="text-blue-400 font-medium hover:underline">Click to upload</span> or drag & drop
        </p>
        {hint && <p className="text-[10px] text-gray-500 dark:text-gray-500 font-mono tracking-wide mt-1.5">{hint}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-3.5 space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between bg-white/80 dark:bg-gray-950/80 border border-gray-200/80 dark:border-gray-800/80 rounded-xl px-3 py-2 transition-all hover:bg-white dark:hover:bg-gray-950">
              <span className="text-xs text-gray-700 dark:text-gray-300 truncate font-medium pr-3">{f.name}</span>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="text-[10px] text-gray-500 dark:text-gray-500 font-mono font-medium">{formatBytes(f.size)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onFiles(files.filter((_, idx) => idx !== i)); }}
                  className="text-gray-500 dark:text-gray-500 hover:text-red-400 transition-colors cursor-pointer p-0.5 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-md"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RunButton({ loading, onClick, label = 'Process & Download', disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="mt-auto w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500
                 disabled:bg-gray-200/60 dark:disabled:bg-gray-800/60 disabled:text-gray-500 dark:disabled:text-gray-500 disabled:cursor-not-allowed
                 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-blue-900/10 
                 transition-all duration-200 cursor-pointer active:scale-[0.98]"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {loading ? 'Processing…' : label}
    </button>
  );
}

// ── 1. PAGE ORGANIZER ────────────────────────────────────────────────────

// function PageOrganizer() {
//   const [file, setFile] = useState(null);
//   const [pages, setPages] = useState([]); // {index, rotate, key}
//   const [loadingInfo, setLoadingInfo] = useState(false);
//   const [processing, setProcessing] = useState(false);
//   const dragIndex = useRef(null);

//   const onFiles = async (files) => {
//     const f = files[0] || null;
//     setFile(f);
//     setPages([]);
//     if (!f) return;
//     setLoadingInfo(true);
//     try {
//       const fd = new FormData();
//       fd.append('file', f);
//       const res = await api.post('/tools/pdf/info', fd);
//       setPages(res.data.pages.map(p => ({ index: p.index, rotate: 0, key: p.index })));
//     } catch (err) {
//       toast.error(await blobErrorMessage(err, 'Could not read that PDF'));
//       setFile(null);
//     } finally {
//       setLoadingInfo(false);
//     }
//   };

//   const rotatePage = (key) =>
//     setPages(prev => prev.map(p => p.key === key ? { ...p, rotate: (p.rotate + 90) % 360 } : p));

//   const deletePage = (key) =>
//     setPages(prev => prev.filter(p => p.key !== key));

//   const handleDrop = (targetKey) => {
//     if (dragIndex.current === null || dragIndex.current === targetKey) return;
//     setPages(prev => {
//       const arr = [...prev];
//       const from = arr.findIndex(p => p.key === dragIndex.current);
//       const to = arr.findIndex(p => p.key === targetKey);
//       const [moved] = arr.splice(from, 1);
//       arr.splice(to, 0, moved);
//       return arr;
//     });
//     dragIndex.current = null;
//   };

//   return (
//     <ToolCard
//       icon={LayoutGrid}
//       title="Page Organizer"
//       description="Reorder, rotate, or delete pages before saving"
//       accent="bg-blue-500/10 border-blue-500/20 text-blue-400"
//     >
//       <Dropzone multiple={false} accept="application/pdf" files={file ? [file] : []} onFiles={onFiles} hint="One PDF at a time" />

//       {loadingInfo && (
//         <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500 font-medium bg-white/50 dark:bg-gray-950/50 border border-gray-200 dark:border-gray-800 px-3 py-2 rounded-xl">
//           <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" /> Reading structure details…
//         </div>
//       )}

//       {pages.length > 0 && (
//         <div className="flex flex-wrap gap-2 bg-white/50 dark:bg-gray-950/50 border border-gray-200/80 dark:border-gray-800/80 rounded-xl p-3 max-h-56 overflow-y-auto custom-scrollbar">
//           {pages.map((p) => (
//             <div
//               key={p.key}
//               draggable
//               onDragStart={() => (dragIndex.current = p.key)}
//               onDragOver={(e) => e.preventDefault()}
//               onDrop={() => handleDrop(p.key)}
//               className="flex flex-col items-center gap-2 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300/80 dark:hover:border-gray-700/80 rounded-xl px-2 py-2.5 cursor-grab active:cursor-grabbing transition-colors select-none"
//               title="Drag to reorder"
//             >
//               <div className="flex items-center gap-1 text-gray-500 dark:text-gray-500">
//                 <GripVertical className="h-3 w-3 opacity-60" />
//                 <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400 font-mono">Pg {p.index + 1}</span>
//               </div>
//               <div
//                 className="w-10 h-13 rounded-lg border border-gray-300/60 dark:border-gray-700/60 bg-white dark:bg-gray-950 flex items-center justify-center transition-transform duration-200 shadow-inner"
//                 style={{ transform: `rotate(${p.rotate}deg)` }}
//               >
//                 <span className="text-[10px] font-bold text-gray-400 dark:text-gray-600 font-mono">{p.index + 1}</span>
//               </div>
//               <div className="flex items-center gap-2 mt-0.5 border-t border-gray-200/60 dark:border-gray-800/60 pt-1.5 w-full justify-center">
//                 <button onClick={() => rotatePage(p.key)} className="text-gray-500 dark:text-gray-500 hover:text-blue-400 transition-colors cursor-pointer p-0.5 rounded" title="Rotate 90°">
//                   <RotateCw className="h-3 w-3" />
//                 </button>
//                 <button onClick={() => deletePage(p.key)} className="text-gray-500 dark:text-gray-500 hover:text-red-400 transition-colors cursor-pointer p-0.5 rounded" title="Delete page">
//                   <X className="h-3 w-3" />
//                 </button>
//               </div>
//             </div>
//           ))}
//         </div>
//       )}

//       <RunButton loading={processing} disabled={pages.length === 0} onClick={async () => {
//         if (!file || pages.length === 0) return;
//         setProcessing(true);
//         try {
//           const fd = new FormData();
//           fd.append('file', file);
//           fd.append('order', JSON.stringify(pages.map(p => ({ index: p.index, rotate: p.rotate }))));
//           const res = await api.post('/tools/pdf/organize', fd, { responseType: 'blob' });
//           triggerDownload(res.data, 'organized.pdf');
//           toast.success('PDF reorganized');
//         } catch (err) {
//           toast.error(await blobErrorMessage(err, 'Failed to reorganize PDF'));
//         } finally {
//           setProcessing(false);
//         }
//       }} label="Save Organized PDF" />
//     </ToolCard>
//   );
// }

function PageOrganizer() {
  const [file, setFile] = useState(null);
  const [pages, setPages] = useState([]); // {index, rotate, key}
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [draggingKey, setDraggingKey] = useState(null);
  const dragIndex = useRef(null);

  const onFiles = async (files) => {
    const f = files[0] || null;
    setFile(f);
    setPages([]);
    if (!f) return;
    setLoadingInfo(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await api.post('/tools/pdf/info', fd);
      setPages(res.data.pages.map(p => ({ index: p.index, rotate: 0, key: p.index })));
    } catch (err) {
      toast.error(await blobErrorMessage(err, 'Could not read that PDF'));
      setFile(null);
    } finally {
      setLoadingInfo(false);
    }
  };

  const rotatePage = (key) =>
    setPages(prev => prev.map(p => p.key === key ? { ...p, rotate: (p.rotate + 90) % 360 } : p));

  const deletePage = (key) =>
    setPages(prev => prev.filter(p => p.key !== key));

  // Dynamic Live Sorter: Swaps items instantaneously when entering sibling territory
  const handleDragEnter = (e, targetKey) => {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === targetKey) return;

    setPages((prev) => {
      const arr = [...prev];
      const fromIndex = arr.findIndex((p) => p.key === dragIndex.current);
      const toIndex = arr.findIndex((p) => p.key === targetKey);

      if (fromIndex === -1 || toIndex === -1) return prev;

      // Extract item and insert at target position mid-flight
      const [movedItem] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, movedItem);
      return arr;
    });
  };

  return (
    <ToolCard
      icon={LayoutGrid}
      title="Page Organizer"
      description="Reorder, rotate, or delete pages before saving"
      accent="bg-blue-500/10 border-blue-500/20 text-blue-400"
    >
      <Dropzone multiple={false} accept="application/pdf" files={file ? [file] : []} onFiles={onFiles} hint="One PDF at a time" />

      {loadingInfo && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500 font-medium bg-white/50 dark:bg-gray-950/50 border border-gray-200 dark:border-gray-800 px-3 py-2 rounded-xl">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" /> Reading structure details…
        </div>
      )}

      {pages.length > 0 && (
        <div className="flex flex-wrap gap-2.5 bg-white/50 dark:bg-gray-950/50 border border-gray-200/80 dark:border-gray-800/80 rounded-xl p-3 max-h-56 overflow-y-auto custom-scrollbar">
          {pages.map((p) => {
            const isDragging = p.key === draggingKey;
            
            return (
              <div
                key={p.key}
                draggable
                onDragStart={() => {
                  dragIndex.current = p.key;
                  setDraggingKey(p.key);
                }}
                onDragEnter={(e) => handleDragEnter(e, p.key)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={() => {
                  dragIndex.current = null;
                  setDraggingKey(null);
                }}
                className={`flex flex-col items-center gap-2 bg-gray-100 dark:bg-gray-900 border rounded-xl px-2.5 py-2.5 select-none transition-all duration-200 ${
                  isDragging 
                    ? 'border-blue-500/50 bg-blue-500/5 opacity-30 scale-95' 
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300/80 dark:hover:border-gray-700/80 cursor-grab active:cursor-grabbing'
                }`}
                title="Drag to reorder"
              >
                <div className="flex items-center gap-1 text-gray-500 dark:text-gray-500 pointer-events-none">
                  <GripVertical className="h-3 w-3 opacity-60" />
                  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400 font-mono">Pg {p.index + 1}</span>
                </div>
                
                <div
                  className="w-10 h-13 rounded-lg border border-gray-300/60 dark:border-gray-700/60 bg-white dark:bg-gray-950 flex items-center justify-center transition-transform duration-200 shadow-inner pointer-events-none"
                  style={{ transform: `rotate(${p.rotate}deg)` }}
                >
                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-600 font-mono">{p.index + 1}</span>
                </div>
                
                <div className="flex items-center gap-2 mt-0.5 border-t border-gray-200/60 dark:border-gray-800/60 pt-1.5 w-full justify-center">
                  <button 
                    onClick={(e) => { e.stopPropagation(); rotatePage(p.key); }} 
                    className="text-gray-500 dark:text-gray-500 hover:text-blue-400 transition-colors cursor-pointer p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-800" 
                    title="Rotate 90°"
                  >
                    <RotateCw className="h-3 w-3" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deletePage(p.key); }} 
                    className="text-gray-500 dark:text-gray-500 hover:text-red-400 transition-colors cursor-pointer p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-800" 
                    title="Delete page"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RunButton loading={processing} disabled={pages.length === 0} onClick={async () => {
        if (!file || pages.length === 0) return;
        setProcessing(true);
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('order', JSON.stringify(pages.map(p => ({ index: p.index, rotate: p.rotate }))));
          const res = await api.post('/tools/pdf/organize', fd, { responseType: 'blob' });
          triggerDownload(res.data, 'organized.pdf');
          toast.success('PDF reorganized');
        } catch (err) {
          toast.error(await blobErrorMessage(err, 'Failed to reorganize PDF'));
        } finally {
          setProcessing(false);
        }
      }} label="Save Organized PDF" />
    </ToolCard>
  );
}

// ── 2. WATERMARK ─────────────────────────────────────────────────────────

function Watermark() {
  const [file, setFile] = useState(null);
  const [logo, setLogo] = useState(null);
  const [text, setText] = useState('');
  const [opacity, setOpacity] = useState(0.3);
  const [position, setPosition] = useState('center');
  const [processing, setProcessing] = useState(false);

  const run = async () => {
    if (!file) return toast.error('Upload a PDF first');
    if (!text.trim() && !logo) return toast.error('Add watermark text or a logo image');
    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (logo) fd.append('logo', logo);
      fd.append('text', text);
      fd.append('opacity', String(opacity));
      fd.append('position', position);
      const res = await api.post('/tools/pdf/watermark', fd, { responseType: 'blob' });
      triggerDownload(res.data, 'watermarked.pdf');
      toast.success('Watermark applied');
    } catch (err) {
      toast.error(await blobErrorMessage(err, 'Failed to watermark PDF'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ToolCard
      icon={Droplets}
      title="Dynamic Watermarking"
      description="Overlay text or a logo with custom opacity & position"
      accent="bg-purple-500/10 border-purple-500/20 text-purple-400"
    >
      <Dropzone multiple={false} accept="application/pdf" files={file ? [file] : []} onFiles={(fs) => setFile(fs[0] || null)} hint="One PDF at a time" />

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Watermark text e.g., "CONFIDENTIAL"'
        className="w-full bg-white/60 dark:bg-gray-950/60 border border-gray-200 dark:border-gray-800 rounded-xl px-3.5 py-2 text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500/80 transition-colors"
      />

      <Dropzone multiple={false} accept="image/png,image/jpeg" files={logo ? [logo] : []} onFiles={(fs) => setLogo(fs[0] || null)} hint="Optional logo asset (PNG/JPG)" />

      <div className="grid grid-cols-2 gap-4 bg-white/30 dark:bg-gray-950/30 border border-gray-200/50 dark:border-gray-800/50 p-3.5 rounded-xl">
        <div>
          <label className="text-[10px] text-gray-500 dark:text-gray-500 uppercase tracking-widest font-bold block mb-1.5">Position</label>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:border-blue-500/80 cursor-pointer"
          >
            <option value="center">Center</option>
            <option value="diagonal">Diagonal</option>
            <option value="top-left">Top Left</option>
            <option value="top-right">Top Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-right">Bottom Right</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 dark:text-gray-500 uppercase tracking-widest font-bold block mb-1">Opacity ({Math.round(opacity * 100)}%)</label>
          <input
            type="range" min="0.05" max="1" step="0.05"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            className="w-full mt-2 accent-blue-500 bg-gray-200 dark:bg-gray-800 h-1 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      <RunButton loading={processing} onClick={run} label="Apply Watermark" />
    </ToolCard>
  );
}

// ── 3. COMPRESSOR ────────────────────────────────────────────────────────

function Compressor() {
  const [file, setFile] = useState(null);
  const [quality, setQuality] = useState('medium');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    if (!file) return toast.error('Upload a PDF first');
    setProcessing(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('quality', quality);
      const res = await api.post('/tools/pdf/compress', fd, { responseType: 'blob' });
      const original = parseInt(res.headers['x-original-size'] || file.size);
      const compressed = parseInt(res.headers['x-compressed-size'] || res.data.size);
      setResult({ original, compressed });
      triggerDownload(res.data, 'compressed.pdf');
      toast.success('PDF compressed');
    } catch (err) {
      toast.error(await blobErrorMessage(err, 'Failed to compress PDF'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ToolCard
      icon={Minimize2}
      title="File Size Optimization"
      description="Downsample assets to shrink heavy PDFs below transmission caps"
      accent="bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
    >
      <Dropzone multiple={false} accept="application/pdf" files={file ? [file] : []} onFiles={(fs) => { setFile(fs[0] || null); setResult(null); }} hint="Optimized for scanned or visual-heavy content" />

      <div className="flex items-center bg-white dark:bg-gray-950 border border-gray-200/80 dark:border-gray-800/80 rounded-xl p-1 gap-1">
        {[
          ['low', 'Smallest'], 
          ['medium', 'Balanced'], 
          ['high', 'Fine Print']
        ].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setQuality(val)}
            className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 cursor-pointer ${
              quality === val 
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100/40 dark:hover:bg-gray-900/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {result && (
        <div className="text-xs text-gray-600 dark:text-gray-400 bg-white/80 dark:bg-gray-950/80 border border-gray-200/80 dark:border-gray-800/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between font-mono">
          <div className="flex items-center gap-1.5">
            <span className="line-through text-gray-400 dark:text-gray-600">{formatBytes(result.original)}</span>
            <span className="text-gray-500 dark:text-gray-500">→</span>
            <span className="text-emerald-400 font-bold">{formatBytes(result.compressed)}</span>
          </div>
          <span className="text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md text-[10px]">
            {result.compressed < result.original ? `-${Math.round((1 - result.compressed / result.original) * 100)}%` : '0%'}
          </span>
        </div>
      )}

      <RunButton loading={processing} onClick={run} label="Compress PDF" />
    </ToolCard>
  );
}

// ── 4. FLATTEN FORM (COMMENTED OUT FOR LATER USE) ────────────────────────
/*
function FormFlattener() {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);

  const run = async () => {
    if (!file) return toast.error('Upload a PDF first');
    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/tools/pdf/flatten', fd, { responseType: 'blob' });
      triggerDownload(res.data, 'flattened.pdf');
      toast.success('Form flattened');
    } catch (err) {
      toast.error(await blobErrorMessage(err, 'Failed to flatten form'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ToolCard
      icon={FileStack}
      title="Form Flattening Engine"
      description="Lock fillable AcroForm values into a static layout"
      accent="bg-amber-500/10 border-amber-500/20 text-amber-400"
    >
      <Dropzone multiple={false} accept="application/pdf" files={file ? [file] : []} onFiles={(fs) => setFile(fs[0] || null)} hint="PDF with fillable form fields" />
      <div className="flex-1" />
      <RunButton loading={processing} onClick={run} label="Flatten Form" />
    </ToolCard>
  );
}
*/

// ── 5. IMAGES TO PDF ─────────────────────────────────────────────────────

function ImagesToPdf() {
  const [files, setFiles] = useState([]);
  const [pageSize, setPageSize] = useState('a4');
  const [processing, setProcessing] = useState(false);

  const run = async () => {
    if (files.length === 0) return toast.error('Add at least one image');
    setProcessing(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('images', f));
      fd.append('pageSize', pageSize);
      const res = await api.post('/tools/images-to-pdf', fd, { responseType: 'blob' });
      triggerDownload(res.data, 'images.pdf');
      toast.success('PDF created');
    } catch (err) {
      toast.error(await blobErrorMessage(err, 'Failed to compile images'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ToolCard
      icon={Images}
      title="Images to PDF"
      description="Compile JPG, PNG, or WebP images into one clean document structure"
      accent="bg-pink-500/10 border-pink-500/20 text-pink-400"
    >
      <Dropzone multiple accept="image/png,image/jpeg,image/webp" files={files} onFiles={setFiles} hint="Selection arrangement matches payload order" />

      <div>
        <label className="text-[10px] text-gray-500 dark:text-gray-500 uppercase tracking-widest font-bold block mb-1.5">Page Layout</label>
        <div className="flex items-center bg-white dark:bg-gray-950 border border-gray-200/80 dark:border-gray-800/80 rounded-xl p-1 gap-1">
          {[
            ['a4', 'Standard A4 Centered'], 
            ['fit', 'Native Aspect Dim.']
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setPageSize(val)}
              className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 cursor-pointer ${
                pageSize === val 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100/40 dark:hover:bg-gray-900/40'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <RunButton loading={processing} disabled={files.length === 0} onClick={run} label="Create PDF" />
    </ToolCard>
  );
}

// ── 6. ZIP CREATOR (COMMENTED OUT FOR LATER USE) ─────────────────────────
/*
function ZipCreator() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);

  const run = async () => {
    if (files.length === 0) return toast.error('Add at least one file');
    setProcessing(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      const res = await api.post('/tools/zip', fd, { responseType: 'blob' });
      triggerDownload(res.data, 'archive.zip');
      toast.success('Archive created');
    } catch (err) {
      toast.error(await blobErrorMessage(err, 'Failed to create zip'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ToolCard
      icon={FolderArchive}
      title="Batch Compression (Zip)"
      description="Bundle any set of files into a single .zip archive"
      accent="bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
    >
      <Dropzone multiple files={files} onFiles={setFiles} hint="Any file type" />
      <div className="flex-1" />
      <RunButton loading={processing} disabled={files.length === 0} onClick={run} label="Create .zip" />
    </ToolCard>
  );
}
*/

// ── PANEL MAIN ROUTER ────────────────────────────────────────────────────

export default function ToolsPanel() {
  return (
    <div className="p-5 sm:p-8 space-y-6">
      <div className="border-b border-gray-200/80 dark:border-gray-800/80 pb-5">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-2xl">Document Toolkit</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 max-w-2xl leading-relaxed">
          Quick, isolated internal browser-memory execution utilities. No persistent staging writes are processed unless documents are pushed manually to directory streams.
        </p>
      </div>
      
      {/* 
        Responsive dashboard grid layout.
        Modified columns to keep scaling balanced across mid/high resolution screens.
      */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
        <PageOrganizer />
        <Watermark />
        <Compressor />
        {/* <ImagesToPdf /> */}
        
        {/* Commented out engines for future activation */}
        {/* <FormFlattener /> */}
        {/* <ZipCreator /> */}
      </div>
    </div>
  );
}