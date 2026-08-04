import React, { useEffect } from 'react';
import { X, Download } from 'lucide-react';
import api from '../../utils/api';

export default function FilePreviewLightbox({ file, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!file) return null;

  const token = localStorage.getItem('sfms_token');
  const baseURL = api.defaults.baseURL || '/api';
  const viewUrl = `${baseURL}/files/download/${file.id}?token=${token}&mode=view`;
  const downloadUrl = `${baseURL}/files/download/${file.id}?token=${token}`;

  const isImage = file.mimeType?.startsWith('image/');
  const isPdf = file.mimeType === 'application/pdf';
  const isVideo = file.mimeType?.startsWith('video/');
  const isAudio = file.mimeType?.startsWith('audio/');

  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        
          <a href={downloadUrl}
          onClick={(e) => e.stopPropagation()}
          className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Download"
        >
          <Download size={18} />
        </a>
        <button
          onClick={onClose}
          className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Close"
        >
          <X size={18} />
        </button>
      </div>

      <div
        className="max-w-[90vw] max-h-[85vh] w-full flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {isImage && (
          <img src={viewUrl} alt={file.originalName || file.fileName} className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain" />
        )}
        {isPdf && (
          <iframe src={viewUrl} title={file.originalName} className="w-full h-[85vh] rounded-2xl bg-white shadow-2xl" />
        )}
        {isVideo && (
          <video src={viewUrl} controls autoPlay className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl" />
        )}
        {isAudio && (
          <div className="bg-surface dark:bg-gray-900 rounded-2xl p-8 shadow-2xl min-w-[320px]">
            <p className="text-sm font-semibold text-ink dark:text-white mb-4 text-center truncate">
              {file.originalName || file.fileName}
            </p>
            <audio src={viewUrl} controls autoPlay className="w-full" />
          </div>
        )}
        <p className="text-xs text-white/70 mt-3 truncate max-w-full">{file.originalName || file.fileName}</p>
      </div>
    </div>
  );
}