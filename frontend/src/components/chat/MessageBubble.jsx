import React, { useState, useRef, useEffect } from 'react';
import {
  Download, Check, CheckCheck, Smile, Trash2, Eye, Clock,
} from 'lucide-react';
import api from '../../utils/api';
import { getFileIcon, formatBytes, formatTime, isPreviewable } from '../../utils/chatHelpers';

const PREDEFINED_REACTIONS = ['👍', '❤️', '😂', '😮', '👀'];

function MessageBubble({ message, isOwn, onReact, onUnreact, onDelete, onPreview, registerRef }) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef(null);
  const bubbleRef = useRef(null);

  const file = message.file || {};
  const Icon = getFileIcon(file.originalName || file.fileName, file.mimeType);
  const reactions = message.reactions || [];
  const canPreview = isPreviewable(file.mimeType);

  // Register this DOM node with the parent so IntersectionObserver-based
  // seen-marking can watch it — only relevant for incoming (not-own) messages.
  useEffect(() => {
    if (!isOwn && registerRef) registerRef(message.id, bubbleRef.current);
    return () => { if (!isOwn && registerRef) registerRef(message.id, null); };
  }, [message.id, isOwn, registerRef]);

  // Close the reaction picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const onClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showPicker]);

  const handleDownload = (e) => {
    e.stopPropagation();
    const token = localStorage.getItem('sfms_token');
    const baseURL = api.defaults.baseURL || '/api';
    window.open(`${baseURL}/files/download/${file.id || message.fileId}?token=${token}`, '_blank');
  };

  return (
    <div ref={bubbleRef} data-message-id={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group mb-3`}>
      <div className={`max-w-[85%] sm:max-w-[75%] md:max-w-[65%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>

        <div className={`relative flex flex-col gap-2 p-3.5 rounded-2xl border shadow-sm transition-all duration-200
          ${isOwn
            ? 'bg-blue-600 border-blue-600 text-white rounded-br-md'
            : 'bg-surface dark:bg-gray-900 border-line dark:border-gray-800 text-ink dark:text-white rounded-bl-md'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isOwn ? 'bg-white/15 text-white' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
            }`}>
              <Icon size={20} />
            </div>

            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold truncate max-w-[220px] ${isOwn ? 'text-white' : 'text-ink dark:text-white'}`}>
                {file.originalName || file.fileName || 'Shared File'}
              </p>
              <div className="flex items-center gap-2 text-[11px] opacity-80">
                <span>{formatBytes(file.fileSize)}</span>
                <span>•</span>
                <span className="uppercase font-mono text-[10px] bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded">
                  {message.isReference ? 'SFMS Reference' : 'Direct Upload'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {canPreview && (
                <button
                  onClick={(e) => { e.stopPropagation(); onPreview(file); }}
                  title="Preview File"
                  className={`p-1.5 rounded-lg transition-colors ${
                    isOwn ? 'hover:bg-white/20 text-white' : 'hover:bg-field dark:hover:bg-gray-800 text-faint'
                  }`}
                >
                  <Eye size={16} />
                </button>
              )}
              <button
                onClick={handleDownload}
                title="Download File"
                className={`p-1.5 rounded-lg transition-colors ${
                  isOwn ? 'hover:bg-white/20 text-white' : 'hover:bg-field dark:hover:bg-gray-800 text-faint'
                }`}
              >
                <Download size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-1 px-1 relative text-[11px] text-faint flex-wrap">
          <span className="flex items-center gap-1">
            {message.status === 'sending' && <Clock size={11} className="animate-pulse" />}
            {formatTime(message.createdAt)}
          </span>

          {reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => r.hasReacted ? onUnreact(message.id, r.emoji) : onReact(message.id, r.emoji)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-all duration-150 hover:scale-105 ${
                r.hasReacted
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 font-bold'
                  : 'bg-field dark:bg-gray-800 border-line dark:border-gray-700 text-subtle hover:bg-line dark:hover:bg-gray-700'
              }`}
            >
              <span>{r.emoji}</span>
              <span className="text-[10px]">{r.count}</span>
            </button>
          ))}

          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setShowPicker(prev => !prev)}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-full text-faint hover:text-blue-500 hover:bg-field dark:hover:bg-gray-800 transition-all"
            >
              <Smile size={14} />
            </button>

            {showPicker && (
              <div className={`absolute z-20 bottom-full mb-1 ${isOwn ? 'right-0' : 'left-0'} bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 rounded-xl shadow-xl p-1.5 flex gap-1 animate-in fade-in zoom-in-95 duration-150`}>
                {PREDEFINED_REACTIONS.map(emoji => {
                  const mine = reactions.find(r => r.emoji === emoji && r.hasReacted);
                  return (
                    <button
                      key={emoji}
                      onClick={() => {
                        if (mine) onUnreact(message.id, emoji);
                        else onReact(message.id, emoji);
                        setShowPicker(false);
                      }}
                      className={`text-base hover:scale-125 transition-transform p-1 rounded ${mine ? 'bg-blue-500/10' : 'hover:bg-field dark:hover:bg-gray-800'}`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => onDelete(message.id)}
            title="Delete for me"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-full text-faint hover:text-red-500 hover:bg-field dark:hover:bg-gray-800 transition-all"
          >
            <Trash2 size={13} />
          </button>

          {isOwn && (
            <span className="ml-0.5">
              {message.isSeen ? (
                <CheckCheck size={14} className="text-blue-400" title={message.seenAt ? `Seen at ${formatTime(message.seenAt)}` : 'Seen'} />
              ) : (
                <Check size={14} className="text-faint" title="Delivered" />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Only re-render a bubble when ITS OWN data actually changes — this is what
// prevents every message in the thread re-rendering whenever one message's
// reaction/seen-status changes, which was the biggest render-perf issue in
// a long conversation.
export default React.memo(MessageBubble, (prev, next) => {
  return prev.message === next.message && prev.isOwn === next.isOwn;
});