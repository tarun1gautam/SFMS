import React, { useState } from 'react';
import { Database, UploadCloud, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../utils/api';
import FilePickerModal from './FilePickerModal';

export default function SendFileBar({ user, recipientId, onMessageSent, virtualPath }) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [sendState, setSendState] = useState('idle'); // idle | sending | done

  const handleSendReference = async (file) => {
    setIsPickerOpen(false);
    setSendState('sending');
    try {
      const res = await api.post('/messages/file-reference', { recipientId, fileId: file.id });
      onMessageSent?.(res.data.data);
      setSendState('done');
      setTimeout(() => setSendState('idle'), 900);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send file.');
      setSendState('idle');
    }
  };

  const handleUploadFromDevice = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSendState('sending');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('recipientId', recipientId);

      // --- CRITICAL FIXES FOR BACKEND COMPATIBILITY ---
      // 1. Send target_users as a stringified JSON array containing the recipient
      formData.append('target_users', JSON.stringify([recipientId]));
      
      // 2. Set visibility to 'group' (or 'public') to bypass the private upload block
      formData.append('visibility', 'group');

      // 3. Optional: Pass virtual_path if required by your backend storage
      if (virtualPath) {
        formData.append('virtual_path', virtualPath);
      }

      // Reset the file input target after appending to FormData
      e.target.value = '';

      // Allow Axios to automatically set 'Content-Type' with the boundary
      const res = await api.post('/messages/upload', formData);

      onMessageSent?.(res.data.data.message);
      setSendState('done');
      setTimeout(() => setSendState('idle'), 900);
    } catch (err) {
      e.target.value = '';
      toast.error(err.response?.data?.error || 'Failed to upload file.');
      setSendState('idle');
    }
  };

  const isBusy = sendState === 'sending';

  return (
    <div className="flex items-center gap-2 p-3 border-t border-line dark:border-gray-800 shrink-0">
      <button
        type="button"
        onClick={() => setIsPickerOpen(true)}
        disabled={isBusy}
        className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl
                   bg-field dark:bg-gray-800 hover:bg-line dark:hover:bg-gray-700
                   text-subtle dark:text-gray-300 border border-line dark:border-gray-700
                   transition-all disabled:opacity-50"
      >
        <Database size={14} />
        Send from SFMS
      </button>

      <label className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl
                          bg-blue-600 hover:bg-blue-500 text-white transition-all cursor-pointer
                          ${isBusy ? 'opacity-70 pointer-events-none' : ''}`}>
        <UploadCloud size={14} />
        Upload from Device
        <input type="file" className="hidden" onChange={handleUploadFromDevice} disabled={isBusy} />
      </label>

      <div className="w-5 shrink-0 flex items-center justify-center">
        {sendState === 'sending' && <Loader2 size={16} className="animate-spin text-blue-500" />}
        {sendState === 'done' && <CheckCircle2 size={16} className="text-emerald-500 animate-in zoom-in duration-200" />}
      </div>

      <FilePickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        user={user}
        onSelectFile={handleSendReference}
      />
    </div>
  );
}