import React, { useState } from 'react';
import { X, Search, User } from 'lucide-react';
import api from '../../utils/api';

export default function NewConversationModal({ isOpen, onClose, onSelectUser }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e) => {
    const value = e.target.value;
    setQuery(value);
    if (!value.trim()) { setResults([]); return; }
    setIsSearching(true);
    try {
      const res = await api.get(`/auth/users/search?query=${encodeURIComponent(value)}`);
      const users = (res.data.users || []).map(u => typeof u === 'string' ? { user_id: u } : u);
      setResults(users);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 rounded-2xl w-full max-w-sm p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-ink dark:text-white">New Conversation</h3>
          <button onClick={onClose} className="text-faint hover:text-ink dark:hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={handleSearch}
            placeholder="Search users..."
            className="w-full bg-field dark:bg-gray-800 border border-line dark:border-gray-700 rounded-xl pl-9 pr-3 py-2 text-sm text-ink dark:text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1">
          {isSearching && <p className="text-xs text-faint text-center py-4">Searching…</p>}
          {!isSearching && query && results.length === 0 && (
            <p className="text-xs text-faint text-center py-4">No users found.</p>
          )}
          {results.map(u => (
            <button
              key={u.user_id}
              onClick={() => { onSelectUser(u.user_id); onClose(); setQuery(''); setResults([]); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-field dark:hover:bg-gray-800 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <User size={15} />
              </div>
              <span className="text-sm font-medium text-ink dark:text-gray-200">{u.user_id}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}