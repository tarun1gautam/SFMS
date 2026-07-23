/**
 * SortDropdown.jsx  (SFMS v2 — NEW)
 *
 * Floating dropdown that lets the user pick:
 *  • Sort field (Name, Upload Date, Size, Type, etc.)
 *  • Sort direction (A→Z / Z→A, Newest/Oldest, Largest/Smallest)
 *
 * Closes on outside click or Escape.
 */

import React, { useRef, useEffect } from 'react';
import { SORT_FIELDS } from '../hooks/useFileManager';

export default function SortDropdown({
  sortField,
  sortOrder,
  onSortChange,
  setSortOrder,
  isOpen,
  setIsOpen,
}) {
  const dropRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen, setIsOpen]);

  // Close on Escape
  useEffect(() => {
    const handle = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [setIsOpen]);

  const activeLabel = SORT_FIELDS.find(f => f.value === sortField)?.label || 'Default';
  const isDefaultSort = sortField === 'default';

  return (
    <div ref={dropRef} className="relative shrink-0">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl
                    border transition-all cursor-pointer select-none
                    ${isOpen || !isDefaultSort
                      ? 'bg-blue-600/10 border-blue-500/40 text-blue-400'
                      : 'bg-surface dark:bg-gray-950 border-line dark:border-gray-800 text-subtle dark:text-gray-300 hover:border-line-strong dark:hover:border-gray-700 hover:text-ink dark:hover:text-white'
                    }`}
        title="Sort options"
      >
        {/* Sort icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0"
             fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
        </svg>
        <span className="hidden sm:inline">Sort</span>
        {!isDefaultSort && (
          <span className="text-[10px] font-bold bg-blue-500 text-white
                           rounded-full px-1.5 py-0.5 leading-none">
            {sortOrder === 'asc' ? '↑' : '↓'}
          </span>
        )}
        <svg xmlns="http://www.w3.org/2000/svg"
             className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
             viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 z-40
                        bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Sort Options
            </span>
            {!isDefaultSort && (
              <button
                onClick={() => { onSortChange('default'); setSortOrder('desc'); }}
                className="text-[10px] text-gray-500 dark:text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          {/* Sort Direction (shown when a non-default field is active) */}
          {!isDefaultSort && (
            <div className="px-4 py-2 border-b border-gray-200/60 dark:border-gray-800/60">
              <p className="text-[10px] text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-2">Direction</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSortOrder('asc')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer
                    ${sortOrder === 'asc'
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700'}`}
                >
                  ↑ Ascending
                </button>
                <button
                  onClick={() => setSortOrder('desc')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer
                    ${sortOrder === 'desc'
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700'}`}
                >
                  ↓ Descending
                </button>
              </div>
            </div>
          )}

          {/* Sort Field List */}
          <div className="py-1 max-h-64 overflow-y-auto">
            {SORT_FIELDS.map((field) => (
              <button
                key={field.value}
                onClick={() => onSortChange(field.value)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer
                            flex items-center justify-between
                            ${sortField === field.value
                              ? 'bg-blue-600/10 text-blue-400'
                              : 'text-subtle dark:text-gray-300 hover:bg-field dark:hover:bg-gray-800/50 hover:text-ink dark:hover:text-white'
                            }`}
              >
                <span>{field.label}</span>
                {sortField === field.value && (
                  <span className="text-[11px] text-blue-400">
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Current state footer */}
          <div className="px-4 py-2 border-t border-gray-200/60 dark:border-gray-800/60 bg-white/40 dark:bg-gray-950/40">
            <p className="text-[10px] text-gray-400 dark:text-gray-600">
              Sorted by: <span className="text-gray-600 dark:text-gray-400">{activeLabel}</span>
              {!isDefaultSort && (
                <> ({sortOrder === 'asc' ? 'Ascending' : 'Descending'})</>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}