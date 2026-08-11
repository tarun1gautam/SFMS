import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, X, Loader2, FileText, Trash2, Pencil, MapPin, History, FolderOpen, UploadCloud } from 'lucide-react';
import FilePickerModal from './chat/FilePickerModal';

const emptyForm = {
  entry_date: new Date().toISOString().slice(0, 10),
  doc_type: 'Letter',
  subject: '',
  description: '',
  assigned_to: '',
  linked_file_id: null,
  linked_file_name: '',
};

// --- Add / Edit entry modal ------------------------------------------------
const EntryModal = ({ initial, onClose, onSaved }) => {
  const { user } = useAuth();
  const isEditing = Boolean(initial?.id);
  const [form, setForm] = useState(initial || emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.entry_date || !form.doc_type) {
      toast.error('Date and Letter/PUC are required.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        entry_date: form.entry_date,
        doc_type: form.doc_type,
        subject: form.subject,
        description: form.description,
        assigned_to: form.assigned_to,
        linked_file_id: form.linked_file_id,
      };

      if (isEditing) {
        await api.patch(`/dak-register/${initial.id}`, payload);
        toast.success('Entry updated.');
      } else {
        await api.post('/dak-register', payload);
        toast.success('Entry logged.');
      }
      onSaved();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save entry.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">
            {isEditing ? 'Edit Entry' : 'Log New Entry'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1">Date</label>
              <input
                type="date"
                value={form.entry_date}
                onChange={(e) => update('entry_date', e.target.value)}
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1">Letter / PUC</label>
              <select
                value={form.doc_type}
                onChange={(e) => update('doc_type', e.target.value)}
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="Letter">Letter</option>
                <option value="PUC">PUC</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1">Subject</label>
            <textarea
              value={form.subject}
              onChange={(e) => update('subject', e.target.value)}
              rows={2}
              placeholder="What this is about"
              className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              rows={3}
              placeholder="Additional details about this entry"
              className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1">Assigned To</label>
            <input
              type="text"
              value={form.assigned_to}
              onChange={(e) => update('assigned_to', e.target.value)}
              placeholder="Who this is assigned to"
              className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Optional attachment */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1">
              Attachment (optional)
            </label>

            {form.linked_file_name ? (
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2">
                <FileText size={14} className="text-blue-500 shrink-0" />
                <span className="text-sm text-gray-900 dark:text-white truncate flex-1">{form.linked_file_name}</span>
                <button
                  type="button"
                  onClick={() => { update('linked_file_id', null); update('linked_file_name', ''); }}
                  className="text-gray-400 hover:text-red-400 cursor-pointer shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilePicker(true)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-blue-500/40 hover:text-blue-500 transition-colors cursor-pointer"
                >
                  <FolderOpen size={13} /> Send from SFMS
                </button>
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-60"
                >
                  <UploadCloud size={13} /> Upload from Device
                </button>
              </div>
            )}
          </div>

          <FilePickerModal
            isOpen={showFilePicker}
            onClose={() => setShowFilePicker(false)}
            user={user}
            onSelectFile={(file) => {
              update('linked_file_id', file.id);
              update('linked_file_name', file.original_name || file.file_name);
              setShowFilePicker(false);
            }}
          />

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isSaving && <Loader2 size={12} className="animate-spin" />}
              {isEditing ? 'Save Changes' : 'Log Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Formats a Date as the value a <input type="date"> expects, in local time
const toLocalDateValue = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// --- Movement / status timeline modal --------------------------------------
const MovementTimelineModal = ({ entry, onClose, canAdd, onMovementAdded }) => {
  const { user, isAdmin } = useAuth();
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState('');
  const [sentBy, setSentBy] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => toLocalDateValue(new Date()));
  const [isSaving, setIsSaving] = useState(false);
  const [deletingMovementId, setDeletingMovementId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/dak-register/${entry.id}/movements`);
      setMovements(data.movements || []);
    } catch {
      toast.error('Failed to load movement history.');
    } finally {
      setLoading(false);
    }
  }, [entry.id]);

  useEffect(() => { fetchMovements(); }, [fetchMovements]);

  useEffect(() => {
    api.get('/dak-register/locations/suggestions')
      .then(({ data }) => setSuggestions(data.locations || []))
      .catch(() => {});
  }, []);

  const filteredSuggestions = suggestions.filter(s =>
    s.toLowerCase().includes(location.toLowerCase()) && s.toLowerCase() !== location.toLowerCase()
  );

  const handleAddMovement = async (e) => {
    e.preventDefault();
    if (!location.trim()) {
      toast.error('Enter where this file is now.');
      return;
    }
    setIsSaving(true);
    try {
      await api.post(`/dak-register/${entry.id}/movements`, {
        location: location.trim(), sent_by: sentBy, received_by: receivedBy,
        remarks, occurred_at: occurredAt || null,
      });
      toast.success('Status updated.');
      setLocation('');
      setSentBy('');
      setReceivedBy('');
      setRemarks('');
      setOccurredAt(toLocalDateValue(new Date()));
      fetchMovements();
      onMovementAdded?.();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to log update.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMovement = async (movementId) => {
    if (!window.confirm('Delete this movement entry? This action cannot be undone.')) return;
    setDeletingMovementId(movementId);
    try {
      await api.delete(`/dak-register/${entry.id}/movements/${movementId}`);
      toast.success('Status log deleted.');
      fetchMovements();
      onMovementAdded?.();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete movement.');
    } finally {
      setDeletingMovementId(null);
    }
  };

  const canDeleteMovement = (m) => {
    return isAdmin || user?.dak_register_manager || m.logged_by === user?.user_id;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <History size={16} /> Movement History
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">
          {entry.subject || entry.doc_type}{entry.assigned_to ? ` · Assigned to ${entry.assigned_to}` : ''}
        </p>

        {/* Timeline */}
        {loading ? (
          <div className="py-8 text-center text-gray-400"><Loader2 size={18} className="mx-auto animate-spin" /></div>
        ) : movements.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-600 py-4 text-center">
            No status updates logged yet.
          </p>
        ) : (
          <ol className="relative border-l border-gray-200 dark:border-gray-800 ml-2 mb-5 space-y-4">
            {movements.map((m, i) => (
              <li key={m.id} className="ml-4 group relative">
                <span className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full ${
                  i === movements.length - 1 ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-700'
                }`} />
                
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                    <MapPin size={12} className="text-gray-400 shrink-0" /> {m.location}
                  </div>
                  {canDeleteMovement(m) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMovement(m.id)}
                      disabled={deletingMovementId === m.id}
                      title="Delete status log"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-0.5 rounded cursor-pointer disabled:opacity-50"
                    >
                      {deletingMovementId === m.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {m.occurred_at ? new Date(m.occurred_at).toLocaleDateString() : new Date(m.moved_at).toLocaleDateString()}
                </p>
                {(m.sent_by || m.received_by) && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {m.sent_by && <>Sent by <span className="font-medium">{m.sent_by}</span></>}
                    {m.sent_by && m.received_by && ' · '}
                    {m.received_by && <>Received by <span className="font-medium">{m.received_by}</span></>}
                  </p>
                )}
                {m.remarks && <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">{m.remarks}</p>}
                <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-0.5">
                  Logged by {m.logged_by} on {new Date(m.moved_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        )}

        {/* Add new status */}
        {canAdd && (
          <form onSubmit={handleAddMovement} className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-3">
            <div className="relative">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1">
                Currently at
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => { setLocation(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="e.g. DSP Staff, Diary Cell, SP..."
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSuggestions(false)} />
                  <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg max-h-32 overflow-y-auto">
                    {filteredSuggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setLocation(s); setShowSuggestions(false); }}
                        className="w-full px-3 py-1.5 text-xs text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1">
                Movement Date
              </label>
              <input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1">
                When it actually happened — change this if you're logging it later than it occurred.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1">
                  Sent By
                </label>
                <input
                  type="text"
                  value={sentBy}
                  onChange={(e) => setSentBy(e.target.value)}
                  placeholder="Who sent it"
                  className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1">
                  Received By
                </label>
                <input
                  type="text"
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  placeholder="Who received it"
                  className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1">
                Remarks (optional)
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isSaving && <Loader2 size={12} className="animate-spin" />}
              Log Status Update
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// --- Main panel -------------------------------------------------------------
export default function DakRegister() {
  const { user, isAdmin } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalEntry, setModalEntry] = useState(null); // null=closed, {}=new, {...}=edit
  const [trackingEntry, setTrackingEntry] = useState(null); // entry whose movement modal is open
  const [deletingId, setDeletingId] = useState(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      const { data } = await api.get('/dak-register', { params });
      setEntries(data.entries || []);
    } catch (error) {
      toast.error('Failed to load register entries.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchEntries, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchEntries]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this register entry? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await api.delete(`/dak-register/${id}`);
      toast.success('Entry deleted.');
      fetchEntries();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete entry.');
    } finally {
      setDeletingId(null);
    }
  };

  const canEdit = (entry) => isAdmin || user?.dak_register_manager || entry.created_by === user?.user_id;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-800 rounded-2xl">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search assigned to..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white text-xs w-64 focus:outline-none focus:border-blue-500"
          />
        </div>

        <button
          onClick={() => setModalEntry(emptyForm)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
        >
          <Plus size={14} /> Log New Entry
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1050px]">
            <thead className="bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800 text-[10px] font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3">Sr No.</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Letter/PUC</th>
                <th className="py-3 px-3">Subject</th>
                <th className="py-3 px-3">Description</th>
                <th className="py-3 px-3">Assigned To</th>
                <th className="py-3 px-3">Attachment</th>
                <th className="py-3 px-3">Logged</th>
                <th className="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400 text-xs">
                  <Loader2 size={18} className="mx-auto mb-2 animate-spin" /> Loading...
                </td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400 text-xs">No entries found.</td></tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 align-top">
                    <td className="py-3 px-3 font-mono text-gray-500 dark:text-gray-500">{e.serial_no}</td>
                    <td className="py-3 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {new Date(e.entry_date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                        e.doc_type === 'Letter'
                          ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                          : 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                      }`}>
                        {e.doc_type || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-600 dark:text-gray-400 max-w-[220px]">{e.subject || '—'}</td>
                    <td className="py-3 px-3 text-gray-600 dark:text-gray-400 max-w-[220px]">{e.description || '—'}</td>
                    <td className="py-3 px-3 text-gray-900 dark:text-white">{e.assigned_to || '—'}</td>
                    <td className="py-3 px-3 text-gray-500 dark:text-gray-500">
                      {e.linked_file_name
                        ? <span className="inline-flex items-center gap-1 text-[11px]"><FileText size={11} />{e.linked_file_name}</span>
                        : '—'}
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{e.created_by}</div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-600 whitespace-nowrap">
                        {e.created_at ? new Date(e.created_at).toLocaleString() : '—'}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setTrackingEntry(e)}
                          title="Track movement history"
                          className="p-1.5 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 hover:border-indigo-500/40 text-gray-500 dark:text-gray-500 hover:text-indigo-400 transition-colors cursor-pointer"
                        >
                          <History size={12} />
                        </button>
                        {canEdit(e) && (
                          <button
                            onClick={() => setModalEntry(e)}
                            title="Edit"
                            className="p-1.5 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 hover:border-blue-500/40 text-gray-500 dark:text-gray-500 hover:text-blue-400 transition-colors cursor-pointer"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                        {(isAdmin || user?.dak_register_manager) && (
                          <button
                            onClick={() => handleDelete(e.id)}
                            disabled={deletingId === e.id}
                            title="Delete"
                            className="p-1.5 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 hover:border-red-500/40 text-gray-500 dark:text-gray-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {deletingId === e.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalEntry && (
        <EntryModal
          initial={modalEntry.id ? modalEntry : null}
          onClose={() => setModalEntry(null)}
          onSaved={() => { setModalEntry(null); fetchEntries(); }}
        />
      )}

      {trackingEntry && (
        <MovementTimelineModal
          entry={trackingEntry}
          canAdd={canEdit(trackingEntry)}
          onClose={() => setTrackingEntry(null)}
          onMovementAdded={fetchEntries}
        />
      )}
    </div>
  );
}