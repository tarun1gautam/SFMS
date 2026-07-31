/**
 * SearchBar.jsx  (SFMS v2 — Mobile Optimized)
 */

import React, { useRef, useEffect } from 'react';
import { SEARCH_FIELDS } from '../hooks/useFileManager';

export default function SearchBar({
  searchTerm,
  setSearchTerm,
  searchField,
  setSearchField,
  clearSearch,
}) {
  const inputRef = useRef(null);

  // Escape key clears search
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && searchTerm) {
        clearSearch();
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [searchTerm, clearSearch]);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 w-full">
      {/* Search field selector (Compact on mobile) */}
      <div className="relative shrink-0">
        <select
          value={searchField}
          onChange={(e) => setSearchField(e.target.value)}
          className="appearance-none bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl
                     pl-2 sm:pl-3 pr-5 sm:pr-7 py-2 sm:py-2.5 text-[10px] sm:text-[11px] font-semibold text-gray-700 dark:text-gray-300
                     focus:outline-none focus:border-blue-500 cursor-pointer max-w-[90px] sm:max-w-none truncate
                     transition-colors hover:border-gray-300 dark:hover:border-gray-700 uppercase tracking-wider"
          title="Search field"
        >
          {SEARCH_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {/* Custom dropdown arrow */}
        <span className="pointer-events-none absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500 text-[9px] sm:text-[10px]">
          ▾
        </span>
      </div>

      {/* Text input (Maximizes remaining space) */}
      <div className="relative flex-1 min-w-0">
        {/* Search icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500 dark:text-gray-500 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={`Search ${SEARCH_FIELDS.find(f => f.value === searchField)?.label || 'Files'}…`}
          className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl
                     pl-8 sm:pl-9 pr-7 sm:pr-9 py-2 sm:py-2.5 text-xs sm:text-sm text-gray-800 dark:text-gray-200
                     placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500
                     transition-colors hover:border-gray-300 dark:hover:border-gray-700 truncate"
        />

        {/* Clear button */}
        {searchTerm && (
          <button
            onClick={clearSearch}
            className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500
                       hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer text-base sm:text-lg leading-none"
            title="Clear search (Esc)"
          >
            ×
          </button>
        )}
      </div>

      {/* Active indicator (Hidden on mobile to preserve search bar width) */}
      {searchTerm && (
        <span className="hidden sm:inline-block shrink-0 text-[10px] font-bold text-blue-400 bg-blue-500/10
                         border border-blue-500/20 px-2 py-1 rounded-lg uppercase tracking-wide">
          Active
        </span>
      )}
    </div>
  );
}