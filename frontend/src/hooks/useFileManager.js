/**
 * useFileManager.js  (SFMS v2 — NEW)
 *
 * Custom hook that centralizes all state and logic for:
 *  • Sort (field + direction)
 *  • Filter (visibility, type, uploader, date range, size range)
 *  • Search (term + field)
 *  • Pagination
 *
 * The hook returns processed files so the Dashboard and FileTable
 * components stay thin and presentational.
 *
 * NOTE: We do ALL filtering client-side on the already-fetched page
 * so instant/real-time feedback is zero-latency.  The server-side
 * params (sort / filter) are also sent so large datasets (>100 rows)
 * still work correctly via the API.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import api from '../utils/api';
import { toast } from 'react-hot-toast';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SORT_FIELDS = [
  { value: 'default',       label: 'Default (Pinned → Newest)' },
  { value: 'name',          label: 'File Name' },
  { value: 'upload_date',   label: 'Upload Date' },
  { value: 'last_modified', label: 'Last Modified' },
  { value: 'size',          label: 'File Size' },
  { value: 'type',          label: 'File Type' },
  { value: 'uploader',      label: 'Uploaded By' },
  { value: 'visibility',    label: 'Visibility' },
];

export const FILE_TYPES = [
  { value: '',       label: 'All Types' },
  { value: 'pdf',    label: 'PDF' },
  { value: 'docx',   label: 'Word (DOCX)' },
  { value: 'xlsx',   label: 'Excel (XLSX)' },
  { value: 'pptx',   label: 'PowerPoint (PPTX)' },
  { value: 'image',  label: 'Images (JPG/PNG/GIF…)' },
  { value: 'jpg',    label: 'JPEG' },
  { value: 'png',    label: 'PNG' },
  { value: 'video',  label: 'Video' },
  { value: 'audio',  label: 'Audio' },
  { value: 'zip',    label: 'ZIP Archive' },
  { value: 'rar',    label: 'RAR Archive' },
  { value: 'txt',    label: 'Text' },
  { value: 'csv',    label: 'CSV' },
  { value: 'json',   label: 'JSON' },
];

export const SEARCH_FIELDS = [
  { value: 'name',     label: 'File Name' },
  { value: 'id',       label: 'File Reference ID' },
  { value: 'uploader', label: 'Uploaded By' },
  { value: 'shared',   label: 'Shared To' },
];

export const VISIBILITY_OPTIONS = [
  { value: '',        label: 'All' },
  { value: 'public',  label: 'Public' },
  { value: 'private', label: 'Private' },
  { value: 'group',   label: 'Group' },
];

// Default filter state — exported so the panel can reset to it
export const DEFAULT_FILTERS = {
  visibility:  '',
  fileType:    '',
  uploader:    '',
  dateFrom:    '',
  dateTo:      '',
  sizeMinMB:   '',
  sizeMaxMB:   '',
};

// ─── Helper: client-side mime matching ───────────────────────────────────────
const MIME_MAP = {
  pdf:    (m) => m?.includes('pdf'),
  docx:   (m) => m?.includes('wordprocessingml'),
  xlsx:   (m) => m?.includes('spreadsheetml'),
  pptx:   (m) => m?.includes('presentationml'),
  image:  (m) => m?.startsWith('image/'),
  jpg:    (m) => m?.includes('jpeg'),
  jpeg:   (m) => m?.includes('jpeg'),
  png:    (m) => m?.includes('png'),
  gif:    (m) => m?.includes('gif'),
  video:  (m) => m?.startsWith('video/'),
  audio:  (m) => m?.startsWith('audio/'),
  zip:    (m) => m?.includes('zip'),
  rar:    (m) => m?.includes('rar') || m?.includes('x-rar'),
  txt:    (m) => m?.includes('text/plain'),
  csv:    (m) => m?.includes('csv'),
  json:   (m) => m?.includes('json'),
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export default function useFileManager() {

  // Raw data from API
  const [rawFiles,    setRawFiles]    = useState([]);
  const [pagination,  setPagination]  = useState({ page: 1, totalPages: 1, total: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [uploaders,   setUploaders]   = useState([]);  // for filter dropdown

  // Search state
  const [searchTerm,  setSearchTerm]  = useState('');
  const [searchField, setSearchField] = useState('name');

  // Sort state
  const [sortField, setSortField] = useState('default');
  const [sortOrder, setSortOrder] = useState('desc');

  // Filter state
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  // UI state
  const [loading,       setLoading]       = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [sortDropOpen,    setSortDropOpen]    = useState(false);

  // ── Derived: count active filters for badge ────────────────
  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(([, v]) => v !== '').length;
  }, [filters]);

  // ── Fetch uploaders once ───────────────────────────────────
  const fetchUploaders = useCallback(async () => {
    try {
      const res = await api.get('/files/uploaders');
      setUploaders(res.data.uploaders || []);
    } catch {
      // non-critical — swallow
    }
  }, []);

  // ── Fetch files from API ───────────────────────────────────
  const fetchFiles = useCallback(async (pageNumber = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', pageNumber);

      // Sort
      if (sortField !== 'default') {
        params.set('sort',  sortField);
        params.set('order', sortOrder);
      }

      // Server-side filters (for large datasets beyond current page)
      if (filters.visibility) params.set('filterVisibility', filters.visibility);
      if (filters.fileType)   params.set('filterType',       filters.fileType);
      if (filters.uploader)   params.set('filterUploader',   filters.uploader);
      if (filters.dateFrom)   params.set('filterDateFrom',   filters.dateFrom);
      if (filters.dateTo)     params.set('filterDateTo',     filters.dateTo);
      if (filters.sizeMinMB !== '') params.set('filterSizeMin', Math.round(parseFloat(filters.sizeMinMB) * 1024 * 1024));
      if (filters.sizeMaxMB !== '') params.set('filterSizeMax', Math.round(parseFloat(filters.sizeMaxMB) * 1024 * 1024));

      // Server-side search
      if (searchTerm) {
        params.set('search',       searchTerm);
        params.set('search_field', searchField);
      }

      const res = await api.get(`/files?${params.toString()}`);
      setRawFiles(res.data.files);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error('Could not populate active file listings.');
    } finally {
      setLoading(false);
    }
  }, [sortField, sortOrder, filters, searchTerm, searchField]);

  // Re-fetch when page, sort, filters, or search changes
  useEffect(() => {
    fetchFiles(currentPage);
  }, [currentPage, fetchFiles]);

  // Reset to page 1 when sort/filter/search changes (avoid stale page)
  useEffect(() => {
    if (currentPage !== 1) setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortField, sortOrder, filters, searchTerm, searchField]);

  // ── Client-side processed files ────────────────────────────
  // Secondary pass: instant client-side re-filter/re-sort of the
  // already-fetched page for immediate visual feedback before the
  // debounced API call returns.
  const processedFiles = useMemo(() => {
    let result = [...rawFiles];

    // Client-side search (instant feedback)
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter((f) => {
        if (searchField === 'id')       return f.id?.toLowerCase().includes(term);
        if (searchField === 'uploader') return f.uploaded_by?.toLowerCase().includes(term);
        if (searchField === 'shared')   return f.shared_label?.some(s => s.toLowerCase().includes(term));
        // default: name
        return (
          f.file_name?.toLowerCase().includes(term) ||
          f.original_name?.toLowerCase().includes(term)
        );
      });
    }

    // Client-side filters
    if (filters.visibility) {
      result = result.filter(f => f.visibility === filters.visibility);
    }
    if (filters.fileType) {
      const matcher = MIME_MAP[filters.fileType];
      if (matcher) result = result.filter(f => matcher(f.mime_type));
    }
    if (filters.uploader) {
      result = result.filter(f => f.uploaded_by === filters.uploader);
    }
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      result = result.filter(f => new Date(f.upload_timestamp) >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(f => new Date(f.upload_timestamp) <= to);
    }
    if (filters.sizeMinMB !== '') {
      const minBytes = parseFloat(filters.sizeMinMB) * 1024 * 1024;
      result = result.filter(f => f.file_size >= minBytes);
    }
    if (filters.sizeMaxMB !== '') {
      const maxBytes = parseFloat(filters.sizeMaxMB) * 1024 * 1024;
      result = result.filter(f => f.file_size <= maxBytes);
    }

    // Client-side sort
    if (sortField !== 'default') {
      result.sort((a, b) => {
        let va, vb;
        switch (sortField) {
          case 'name':          va = a.file_name?.toLowerCase();     vb = b.file_name?.toLowerCase();     break;
          case 'upload_date':   va = new Date(a.upload_timestamp);   vb = new Date(b.upload_timestamp);   break;
          case 'last_modified': va = new Date(a.last_modified);      vb = new Date(b.last_modified);      break;
          case 'size':          va = a.file_size;                    vb = b.file_size;                    break;
          case 'type':          va = a.mime_type?.toLowerCase();     vb = b.mime_type?.toLowerCase();     break;
          case 'uploader':      va = a.uploaded_by?.toLowerCase();   vb = b.uploaded_by?.toLowerCase();   break;
          case 'visibility':    va = a.visibility?.toLowerCase();    vb = b.visibility?.toLowerCase();    break;
          default:              return 0;
        }
        if (va === undefined || va === null) return 1;
        if (vb === undefined || vb === null) return -1;
        let cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return sortOrder === 'desc' ? -cmp : cmp;
      });
    } else {
      // Default: pinned first, then by upload date desc
      result.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.upload_timestamp) - new Date(a.upload_timestamp);
      });
    }

    return result;
  }, [rawFiles, searchTerm, searchField, filters, sortField, sortOrder]);

  // ── Sort helpers ───────────────────────────────────────────
  const handleSortChange = useCallback((field) => {
    if (field === sortField) {
      // Toggle order if same field clicked
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setSortDropOpen(false);
  }, [sortField]);

  // ── Filter helpers ─────────────────────────────────────────
  const updateFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  // ── Search helpers ─────────────────────────────────────────
  const clearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  return {
    // Data
    files:         processedFiles,
    rawFiles,
    pagination,
    currentPage,
    setCurrentPage,
    uploaders,
    fetchFiles,
    fetchUploaders,
    loading,

    // Search
    searchTerm,   setSearchTerm,
    searchField,  setSearchField,
    clearSearch,

    // Sort
    sortField,    setSortField,
    sortOrder,    setSortOrder,
    handleSortChange,
    sortDropOpen, setSortDropOpen,

    // Filters
    filters,
    updateFilter,
    resetFilters,
    activeFilterCount,
    filterPanelOpen, setFilterPanelOpen,
  };
}