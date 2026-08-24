import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { 
  Plus, Search, X, Loader2, FileText, Trash2, Pencil, MapPin, History, 
  FolderOpen, UploadCloud, Clock, User, Send, Mail, MessageSquare, Calendar,
  List, PlusCircle
} from 'lucide-react';
import FilePickerModal from './chat/FilePickerModal';

const emptyForm = {
  entry_date: new Date().toISOString().slice(0, 10),
  doc_type: 'Letter',
  subject: '',
  description: '',
  assigned_to: '',
  received_by: '',      // new field
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
      toast.error('Date and File/Letter/PUC are required.');
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
        received_by: form.received_by,
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
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1">File / Letter / PUC</label>
              <select
                value={form.doc_type}
                onChange={(e) => update('doc_type', e.target.value)}
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="Letter">Letter</option>
                <option value="PUC">PUC</option>
                <option value="File">File</option>
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

          {/* Description field — commented out, not required for entry creation.
              form.description / payload.description still exist below so this
              can be restored by simply un-commenting this block.
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
          */}

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

          {/* New field: Received By */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1">Received By</label>
            <input
              type="text"
              value={form.received_by}
              onChange={(e) => update('received_by', e.target.value)}
              placeholder="Who received this entry"
              className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>

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

const toLocalDateValue = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// --- Movement / status timeline drawer --------------------------------------
const MovementTimelineDrawer = ({ entry, onClose, canAdd, onMovementAdded }) => {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('timeline');
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
      setActiveTab('timeline');
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
    if (isAdmin) return true;
    if (user?.dak_register_manager) return true;
    if (entry.created_by === user?.user_id) return true;
    if (m.logged_by === user?.user_id) return true;
    return false;
  };

  const currentLocation = movements.length > 0 ? movements[movements.length - 1].location : null;

  return (
    <div className="h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col border-l border-gray-200 dark:border-gray-800">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 px-5 pt-5 pb-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 truncate">
              <History size={18} className="text-blue-500 shrink-0" />
              Movement History
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-800 dark:text-white truncate max-w-[150px]">{entry.subject || entry.doc_type}</span>
              <span className="text-gray-400 dark:text-gray-600">•</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-500/20 bg-blue-500/10 text-blue-500 shrink-0">
                {entry.doc_type}
              </span>
              {entry.assigned_to && (
                <>
                  <span className="text-gray-400 dark:text-gray-600">•</span>
                  <span className="flex items-center gap-1 truncate">
                    <User size={12} className="text-gray-400 shrink-0" />
                    <span className="truncate">{entry.assigned_to}</span>
                  </span>
                </>
              )}
              {currentLocation && (
                <>
                  <span className="text-gray-400 dark:text-gray-600">•</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20 text-[11px] font-medium shrink-0">
                    <MapPin size={11} />
                    Current: {currentLocation}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer p-1 shrink-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 px-5 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'timeline'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <List size={14} />
            Timeline
          </button>
          {canAdd && (
            <button
              onClick={() => setActiveTab('add')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'add'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <PlusCircle size={14} />
              Log Update
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-600">
        {activeTab === 'timeline' && (
          <>
            {loading ? (
              <div className="py-12 text-center text-gray-400">
                <Loader2 size={24} className="mx-auto animate-spin" />
              </div>
            ) : movements.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400 dark:text-gray-500">
                No status updates logged yet.
              </div>
            ) : (
              <div className="space-y-4">
                {movements.map((m, idx) => {
                  const isLast = idx === movements.length - 1;
                  return (
                    <div key={m.id} className="relative flex gap-3">
                      <div className="relative flex flex-col items-center w-4 shrink-0 pt-1">
                        {!isLast && (
                          <div className="absolute top-3 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-gray-200 dark:bg-gray-800" />
                        )}
                        <div
                          className={`relative z-10 w-2.5 h-2.5 rounded-full border-2 shrink-0 ${
                            isLast
                              ? 'bg-blue-500 border-blue-500 ring-2 ring-blue-500/20'
                              : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600'
                          }`}
                        />
                      </div>

                      <div className="flex-1 min-w-0 pb-1">
                        <div className="bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-800 rounded-xl p-3 shadow-sm hover:shadow transition-all duration-200">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5 min-w-0">
                                <MapPin size={13} className="text-blue-500 shrink-0" />
                                <span className="truncate">{m.location}</span>
                              </span>
                              {isLast && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9px] font-bold border border-blue-500/20 shrink-0">
                                  Current
                                </span>
                              )}
                            </div>
                            {canDeleteMovement(m) && (
                              <button
                                type="button"
                                onClick={() => handleDeleteMovement(m.id)}
                                disabled={deletingMovementId === m.id}
                                className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-gray-200/50 dark:hover:bg-gray-700/50 cursor-pointer disabled:opacity-50 shrink-0"
                                title="Delete this status log"
                              >
                                {deletingMovementId === m.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Trash2 size={13} />
                                )}
                              </button>
                            )}
                          </div>

                          <div className="mt-2 space-y-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-2 flex-wrap text-gray-500 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                <Calendar size={11} className="shrink-0" />
                                {m.occurred_at
                                  ? new Date(m.occurred_at).toLocaleDateString(undefined, {
                                      year: 'numeric', month: 'short', day: 'numeric',
                                    })
                                  : new Date(m.moved_at).toLocaleDateString()}
                              </span>
                              <span className="text-gray-300 dark:text-gray-700">•</span>
                              <span className="flex items-center gap-1">
                                <Clock size={11} className="shrink-0" />
                                {new Date(m.moved_at).toLocaleString(undefined, {
                                  hour: '2-digit', minute: '2-digit', hour12: true,
                                })}
                              </span>
                            </div>

                            {(m.sent_by || m.received_by) && (
                              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                {m.sent_by && (
                                  <span className="flex items-center gap-1">
                                    <Send size={11} className="text-gray-400 shrink-0" />
                                    <span className="font-semibold text-gray-700 dark:text-gray-300">{m.sent_by}</span>
                                  </span>
                                )}
                                {m.sent_by && m.received_by && <span className="text-gray-300 dark:text-gray-600">→</span>}
                                {m.received_by && (
                                  <span className="flex items-center gap-1">
                                    <Mail size={11} className="text-gray-400 shrink-0" />
                                    <span className="font-semibold text-gray-700 dark:text-gray-300">{m.received_by}</span>
                                  </span>
                                )}
                              </div>
                            )}

                            {m.remarks && (
                              <div className="flex items-start gap-1.5 pt-1 border-t border-gray-200/50 dark:border-gray-800">
                                <MessageSquare size={11} className="text-gray-400 shrink-0 mt-0.5" />
                                <span className="text-gray-700 dark:text-gray-300 italic">{m.remarks}</span>
                              </div>
                            )}

                            <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 pt-1">
                              <User size={10} className="shrink-0" />
                              <span>Logged by <strong className="font-medium text-gray-600 dark:text-gray-400">{m.logged_by}</strong></span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'add' && canAdd && (
          <form onSubmit={handleAddMovement} className="space-y-4">
            <div className="relative">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Current Location <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => { setLocation(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="e.g. DSP Staff, Diary Cell, SP..."
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Sent By
                </label>
                <input
                  type="text"
                  value={sentBy}
                  onChange={(e) => setSentBy(e.target.value)}
                  placeholder="Who sent it"
                  className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Received By
                </label>
                <input
                  type="text"
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  placeholder="Who received it"
                  className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Movement Date
              </label>
              <input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                Actual date of handoff (change if logging later than it occurred).
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Remarks (optional)
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Any additional notes"
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
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
  const [modalEntry, setModalEntry] = useState(null);
  const [trackingEntry, setTrackingEntry] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Sorting state
  const [sortField, setSortField] = useState(null);
  const [sortOrder, setSortOrder] = useState('ASC');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (sortField) {
        params.sortField = sortField;
        params.sortOrder = sortOrder;
      }
      const { data } = await api.get('/dak-register', { params });
      setEntries(data.entries || []);
    } catch (error) {
      toast.error('Failed to load register entries.');
    } finally {
      setLoading(false);
    }
  }, [search, sortField, sortOrder]);

  useEffect(() => {
    const t = setTimeout(fetchEntries, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchEntries]);

  const handleSort = (field) => {
    if (sortField === field) {
      if (sortOrder === 'ASC') {
        setSortOrder('DESC');
      } else {
        setSortField(null);
        setSortOrder('ASC');
      }
    } else {
      setSortField(field);
      setSortOrder('ASC');
    }
  };

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

  // Opens the entry's linked file in a new tab. Reuses the exact same
  // download endpoint + token pattern as FileTable.jsx — mode=view tells
  // the backend to send Content-Disposition: inline instead of forcing a
  // download, so PDFs/images etc. render directly in the new tab.
  const handleOpenAttachment = (linkedFileId) => {
    if (!linkedFileId) return;
    const token = localStorage.getItem('sfms_token');
    const url = `${api.defaults.baseURL}/files/download/${linkedFileId}?token=${token}&mode=view`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const canEdit = (entry) => isAdmin || user?.dak_register_manager || entry.created_by === user?.user_id;

  const SortArrow = ({ field }) => {
    if (sortField !== field) {
      return <span className="ml-1 text-gray-300 dark:text-gray-600">↕</span>;
    }
    return sortOrder === 'ASC' ? <span className="ml-1 text-blue-500">▲</span> : <span className="ml-1 text-blue-500">▼</span>;
  };

  return (
    <div
      className="flex overflow-hidden relative"
      style={{ height: 'calc(100vh - 180px)' }}
    >
      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <div className="p-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 rounded-t-2xl shadow-sm shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
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
        </div>

        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-2xl">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[8%]" />
              <col className="w-[16%]" />
              <col className="w-[15%]" />   {/* previously description, now received_by */}
              <col className="w-[12%]" />   {/* assigned_to */}
              <col className="w-[14%]" />   {/* attachment */}
              <col className="w-[13%]" />   {/* logged */}
              <col className="w-[14%]" />   {/* actions */}
            </colgroup>
            <thead className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800 text-[10px] font-bold uppercase tracking-wider shadow-sm">
              <tr>
                <th className="py-3 px-3 text-left bg-gray-50 dark:bg-gray-950 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors select-none" onClick={() => handleSort('entry_date')}>
                  Date <SortArrow field="entry_date" />
                </th>
                <th className="py-3 px-3 text-left bg-gray-50 dark:bg-gray-950 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors select-none" onClick={() => handleSort('doc_type')}>
                  File/Letter/PUC <SortArrow field="doc_type" />
                </th>
                <th className="py-3 px-3 text-left bg-gray-50 dark:bg-gray-950 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors select-none" onClick={() => handleSort('subject')}>
                  Subject <SortArrow field="subject" />
                </th>
                <th className="py-3 px-3 text-left bg-gray-50 dark:bg-gray-950 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors select-none" onClick={() => handleSort('received_by')}>
                  Received By <SortArrow field="received_by" />
                </th>
                <th className="py-3 px-3 text-left bg-gray-50 dark:bg-gray-950 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors select-none" onClick={() => handleSort('assigned_to')}>
                  Assigned To <SortArrow field="assigned_to" />
                </th>
                <th className="py-3 px-3 text-left bg-gray-50 dark:bg-gray-950">Attachment</th>
                <th className="py-3 px-3 text-left bg-gray-50 dark:bg-gray-950 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors select-none" onClick={() => handleSort('created_by')}>
                  Logged <SortArrow field="created_by" />
                </th>
                <th className="py-3 px-3 text-center bg-gray-50 dark:bg-gray-950">Actions</th>
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
                    <td className="py-3 px-3 text-gray-600 dark:text-gray-400 truncate">
                      {new Date(e.entry_date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                        e.doc_type === 'Letter'
                          ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                          : e.doc_type === 'PUC'
                          ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                          : e.doc_type === 'File'
                          ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                      }`}>
                        {e.doc_type || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-600 dark:text-gray-400 truncate" title={e.subject || ''}>{e.subject || '—'}</td>
                    <td className="py-3 px-3 text-gray-600 dark:text-gray-400 truncate" title={e.received_by || ''}>{e.received_by || '—'}</td>
                    <td className="py-3 px-3 text-gray-900 dark:text-white truncate" title={e.assigned_to || ''}>{e.assigned_to || '—'}</td>
                    <td className="py-3 px-3 text-gray-500 dark:text-gray-500 truncate" title={e.linked_file_name || ''}>
                      {e.linked_file_name ? (
                        <button
                          type="button"
                          onClick={() => handleOpenAttachment(e.linked_file_id)}
                          className="inline-flex items-center gap-1 text-[11px] max-w-full text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          <FileText size={11} className="shrink-0" />
                          <span className="truncate">{e.linked_file_name}</span>
                        </button>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-3 truncate">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{e.created_by}</div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-600 truncate">
                        {e.created_at ? new Date(e.created_at).toLocaleString() : '—'}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setTrackingEntry(e)}
                          title="View details & movement history"
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
                        {canEdit(e) && (
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

      {/* Drawer Container */}
      <div
        className={`flex-shrink-0 h-full overflow-hidden transition-all duration-300 ease-in-out ${
          trackingEntry ? 'w-full sm:w-[32%] sm:min-w-[360px]' : 'w-0'
        }`}
      >
        <div
          className={`h-full transition-transform duration-300 ease-in-out ${
            trackingEntry ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {trackingEntry && (
            <MovementTimelineDrawer
              entry={trackingEntry}
              canAdd={!!user}
              onClose={() => setTrackingEntry(null)}
              onMovementAdded={fetchEntries}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {modalEntry && (
        <EntryModal
          initial={modalEntry.id ? modalEntry : null}
          onClose={() => setModalEntry(null)}
          onSaved={() => { setModalEntry(null); fetchEntries(); }}
        />
      )}
    </div>
  );
}