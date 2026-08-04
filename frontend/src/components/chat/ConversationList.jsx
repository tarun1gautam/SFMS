import React, { useState, useMemo } from 'react';
import { Search, Plus, FileText } from 'lucide-react';
import UserAvatar from './UserAvatar';

function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl animate-pulse">
      <div className="w-9 h-9 rounded-full bg-field dark:bg-gray-800" />
      <div className="flex-1 space-y-1.5">
        <div className="h-2.5 w-24 rounded bg-field dark:bg-gray-800" />
        <div className="h-2 w-32 rounded bg-field dark:bg-gray-800" />
      </div>
    </div>
  );
}

export default function ConversationList({ conversations, activeId, onSelect, onNewConversation, loading }) {
  const [search, setSearch] = useState('');

  // Client-side filter only — never re-fetches on keystroke.
  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => (c.partner?.userId || c.userId || c.user_id || '').toLowerCase().includes(q));
  }, [conversations, search]);

  const handleKeyDown = (e, idx) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = filteredConversations[idx + 1];
      if (next) document.getElementById(`conv-${next.partner?.userId || next.userId || next.user_id}`)?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = filteredConversations[idx - 1];
      if (prev) document.getElementById(`conv-${prev.partner?.userId || prev.userId || prev.user_id}`)?.focus();
    }
  };

  return (
    <div className="w-full h-full flex flex-col border-r border-line dark:border-gray-800 bg-surface/50 dark:bg-gray-900/50">
      <div className="p-4 pb-2 flex items-center justify-between shrink-0">
        <h2 className="text-base font-bold text-ink dark:text-white tracking-tight">File Conversations</h2>
        <button
          onClick={onNewConversation}
          className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-all duration-200"
          title="Start New File Chat"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="px-3 py-2 shrink-0 sticky top-0 z-10 bg-surface/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-field dark:bg-gray-800/80 border border-line dark:border-gray-700/60 rounded-xl pl-8 pr-3 py-1.5 text-xs text-ink dark:text-white placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1 custom-scrollbar">
        {loading ? (
          <>{[...Array(5)].map((_, i) => <ConversationSkeleton key={i} />)}</>
        ) : filteredConversations.length === 0 ? (
          <div className="p-6 text-center text-xs text-faint">
            {search ? 'No matching conversations.' : 'No conversations found.'}
          </div>
        ) : (
          filteredConversations.map((conv, idx) => {
            const partnerId = conv.partner?.userId || conv.userId || conv.user_id;
            const lastFileName = conv.lastMessage?.file?.fileName || conv.lastMessage?.file?.originalName || conv.lastFileName || conv.last_file_name || 'Shared a file';
            const unreadCount = conv.unreadCount ?? conv.unread_count ?? 0;
            const isSelected = activeId === partnerId;

            return (
              <button
                id={`conv-${partnerId}`}
                key={partnerId}
                onClick={() => onSelect(partnerId)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all duration-150 text-left relative focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'hover:bg-field dark:hover:bg-gray-800/60 text-ink dark:text-gray-200'
                }`}
              >
                <UserAvatar name={partnerId} isOnline={conv.partner?.isOnline} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-ink dark:text-white'}`}>
                      {partnerId}
                    </p>
                    {conv.lastActivityTimestamp && (
                      <span className={`text-[10px] shrink-0 ${isSelected ? 'text-white/70' : 'text-faint'}`}>
                        {new Date(conv.lastActivityTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>

                  <p className={`text-[11px] flex items-center gap-1 mt-0.5 truncate ${isSelected ? 'text-white/80' : 'text-faint'}`}>
                    <FileText size={12} className="shrink-0" />
                    <span className="truncate">{lastFileName}</span>
                  </p>
                </div>

                {unreadCount > 0 && !isSelected && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-extrabold shadow-sm animate-in zoom-in duration-200">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}