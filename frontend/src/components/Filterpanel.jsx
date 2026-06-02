/**
 * FilterPanel.jsx  (SFMS v2 — NEW)
 *
 * Slide-in filter panel with:
 *  • File Type
 *  • Visibility
 *  • Uploaded By (dropdown from /api/files/uploaders)
 *  • Date Range (From / To)
 *  • File Size Range (Min / Max in MB)
 *  • Reset All button
 *  • Active filter count badge on trigger button
 *
 * Closes on outside click or Escape.
 */

import React, { useRef, useEffect } from 'react';
import { FILE_TYPES, VISIBILITY_OPTIONS, DEFAULT_FILTERS } from '../hooks/useFileManager';

export default function FilterPanel({
  filters,
  updateFilter,
  resetFilters,
  activeFilterCount,
  uploaders = [],
  isOpen,
  setIsOpen,
}) {
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
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

  // Shared input class
  const inputCls = `w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2
                    text-xs text-gray-200 placeholder-gray-600
                    focus:outline-none focus:border-blue-500 transition-colors
                    hover:border-gray-700`;

  return (
    <div ref={panelRef} className="relative shrink-0">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium
                    rounded-xl border transition-all cursor-pointer select-none
                    ${isOpen || activeFilterCount > 0
                      ? 'bg-purple-600/10 border-purple-500/40 text-purple-400'
                      : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700 hover:text-white'
                    }`}
        title="Filter options"
      >
        {/* Funnel icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0"
             fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
        </svg>
        <span className="hidden sm:inline">Filter</span>

        {/* Active filter count badge */}
        {activeFilterCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center
                           text-[9px] font-black bg-purple-500 text-white rounded-full leading-none">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Filter Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 z-40
                        bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Filter Files
              {activeFilterCount > 0 && (
                <span className="ml-2 text-purple-400">({activeFilterCount} active)</span>
              )}
            </span>
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-[10px] text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
              >
                Reset All
              </button>
            )}
          </div>

          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">

            {/* ── File Type ───────────────────────────── */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                File Type
              </label>
              <select
                value={filters.fileType}
                onChange={(e) => updateFilter('fileType', e.target.value)}
                className={inputCls}
              >
                {FILE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* ── Visibility ──────────────────────────── */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                Visibility
              </label>
              <div className="flex gap-2 flex-wrap">
                {VISIBILITY_OPTIONS.map((v) => (
                  <button
                    key={v.value}
                    onClick={() => updateFilter('visibility', v.value)}
                    className={`px-3 py-1.5 text-[11px] font-semibold rounded-xl border
                                transition-all cursor-pointer
                                ${filters.visibility === v.value
                                  ? 'bg-purple-600 border-purple-500 text-white'
                                  : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                                }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Uploaded By ─────────────────────────── */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                Uploaded By
              </label>
              {uploaders.length > 0 ? (
                <select
                  value={filters.uploader}
                  onChange={(e) => updateFilter('uploader', e.target.value)}
                  className={inputCls}
                >
                  <option value="">All Uploaders</option>
                  {uploaders.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={filters.uploader}
                  onChange={(e) => updateFilter('uploader', e.target.value)}
                  placeholder="Enter user ID…"
                  className={inputCls}
                />
              )}
            </div>

            {/* ── Date Range ──────────────────────────── */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                Upload Date Range
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[9px] text-gray-600 mb-1">From</span>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => updateFilter('dateFrom', e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <span className="block text-[9px] text-gray-600 mb-1">To</span>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => updateFilter('dateTo', e.target.value)}
                    min={filters.dateFrom || undefined}
                    className={inputCls}
                  />
                </div>
              </div>
            </div>

            {/* ── File Size Range ─────────────────────── */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                File Size Range (MB)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[9px] text-gray-600 mb-1">Min MB</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={filters.sizeMinMB}
                    onChange={(e) => updateFilter('sizeMinMB', e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                </div>
                <div>
                  <span className="block text-[9px] text-gray-600 mb-1">Max MB</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={filters.sizeMaxMB}
                    onChange={(e) => updateFilter('sizeMaxMB', e.target.value)}
                    placeholder="∞"
                    className={inputCls}
                  />
                </div>
              </div>
              {/* Quick size presets */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[
                  { label: '< 1 MB',    min: '',  max: '1' },
                  { label: '1–10 MB',   min: '1', max: '10' },
                  { label: '10–100 MB', min: '10', max: '100' },
                  { label: '> 100 MB',  min: '100', max: '' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      updateFilter('sizeMinMB', preset.min);
                      updateFilter('sizeMaxMB', preset.max);
                    }}
                    className={`px-2 py-1 text-[10px] font-semibold rounded-lg border
                                transition-all cursor-pointer
                                ${filters.sizeMinMB === preset.min && filters.sizeMaxMB === preset.max
                                  ? 'bg-purple-600 border-purple-500 text-white'
                                  : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-300'
                                }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-800/60 bg-gray-950/40 flex items-center justify-between">
            <span className="text-[10px] text-gray-600">
              {activeFilterCount > 0
                ? `${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} applied`
                : 'No filters applied'}
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-gray-400 hover:text-white
                         transition-colors cursor-pointer px-3 py-1.5
                         bg-gray-800 hover:bg-gray-700 rounded-lg"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}