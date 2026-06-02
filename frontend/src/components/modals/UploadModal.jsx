/**
 * UploadModal.jsx  (SFMS v2 — Enhanced)
 *
 * Changes from v1:
 *  • The modal now sends `shared_label` alongside `target_users` so the
 *    new "Shared To" column is populated correctly on upload.
 *  • For public files  → shared_label = ['Public']
 *  • For private/group → shared_label mirrors the target_users array
 *    (or ['—'] if none specified)
 *  • All existing UI, conflict detection, and upload logic preserved.
 */

import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';

export default function UploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [selectedFile,       setSelectedFile]       = useState(null);
  const [visibility,         setVisibility]         = useState('public');
  const [targetUsersInput,   setTargetUsersInput]   = useState('');
  const [isUploading,        setIsUploading]        = useState(false);

  // Conflict States
  const [hasConflict,        setHasConflict]        = useState(false);
  const [conflictingFileName, setConflictingFileName] = useState('');

  useEffect(() => {
    console.log(conflictingFileName);
  }, [conflictingFileName]);

  if (!isOpen) return null;

  const resetState = () => {
    setSelectedFile(null);
    setVisibility('public');
    setTargetUsersInput('');
    setIsUploading(false);
    setHasConflict(false);
    setConflictingFileName('');
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setHasConflict(false);
    }
  };

  /**
   * Build the shared_label array from current form state.
   * This is what the backend stores and the FileTable displays.
   */
  const buildSharedLabel = () => {
    if (visibility === 'public') return ['Public'];
    const users = targetUsersInput
      .split(',')
      .map(u => u.trim())
      .filter(u => u !== '');
    return users.length > 0 ? users : ['—'];
  };

  const executeUploadRequest = async (resolutionStrategy = null) => {
    if (!selectedFile) return;

    // ── Step 1: collision check (only on first attempt) ──
    if (!resolutionStrategy) {
      try {
        const res = await api.get(
          `/files/check-collision?filename=${encodeURIComponent(selectedFile.name)}`
        );
        if (res.data.exists) {
          setHasConflict(true);
          setConflictingFileName(selectedFile.name);
          return;
        }
      } catch (err) {
        console.error('Error checking file collision:', err);
        return;
      }
    }

    // ── Step 2: build FormData ────────────────────────────
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('visibility', visibility);

    const usersArray = targetUsersInput
      .split(',')
      .map(u => u.trim())
      .filter(u => u !== '');
    formData.append('target_users', JSON.stringify(usersArray));

    // NEW v2: send shared_label so the backend stores it
    const sharedLabel = buildSharedLabel();
    formData.append('shared_label', JSON.stringify(sharedLabel));

    if (resolutionStrategy) {
      formData.append('conflict_resolution', resolutionStrategy);
    }

    // ── Step 3: upload ────────────────────────────────────
    setIsUploading(true);
    try {
      await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Asset successfully stored in file repository.');
      onUploadSuccess();
      handleClose();
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.conflict) {
        setHasConflict(true);
        setConflictingFileName(err.response.data.existing_file);
        toast.error('Namespace conflict detected in storage cluster.');
      } else {
        toast.error(err.response?.data?.error || 'Pipeline upload crash.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Preview of what shared_label will be
  const sharedPreview = buildSharedLabel();

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
        <h2 className="text-xl font-bold text-white mb-4">Upload Workspace Asset</h2>

        {!hasConflict ? (
          <div className="space-y-5">

            {/* ── File Input ────────────────────────────── */}
            <div className="border-2 border-dashed border-gray-800 hover:border-gray-700
                            rounded-xl p-4 text-center transition-colors">
              <input type="file" onChange={handleFileChange}
                     className="hidden" id="modal-file-input" />
              <label htmlFor="modal-file-input" className="cursor-pointer block text-sm text-gray-400">
                {selectedFile ? (
                  <span className="font-semibold text-blue-400 truncate block max-w-xs mx-auto">
                    {selectedFile.name}
                  </span>
                ) : (
                  'Click to browse filesystem storage location'
                )}
              </label>
            </div>

            {/* ── Visibility ────────────────────────────── */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Scope Clearance Visibility
              </label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5
                           text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="public">Public (Global Visibility Scope)</option>
                <option value="private">Private (Restricted Node Verification)</option>
                <option value="group">Group (Collaborative Shared Cluster)</option>
              </select>
            </div>

            {/* ── Target Users (private/group only) ─────── */}
            {visibility !== 'public' && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Clearance Target Keys (Comma Separated)
                </label>
                <input
                  type="text"
                  value={targetUsersInput}
                  onChange={(e) => setTargetUsersInput(e.target.value)}
                  placeholder="e.g., user1, user2, finance_team"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2
                             text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {/* ── NEW v2: Shared To preview ─────────────── */}
            <div className="bg-gray-950/50 border border-gray-800/60 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                Shared To Preview
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sharedPreview.map((label, i) => (
                  <span key={i}
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px]
                                font-semibold border
                                ${label === 'Public'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : label === '—'
                                    ? 'bg-gray-700/30 text-gray-500 border-gray-700/20'
                                    : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                                }`}
                  >
                    {label === 'Public' ? '🌐 ' : ''}{label}
                  </span>
                ))}
              </div>
            </div>

            {/* ── Actions ───────────────────────────────── */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 text-sm font-semibold bg-gray-950 border border-gray-800
                           rounded-xl hover:bg-gray-800 text-gray-400 cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={!selectedFile || isUploading}
                onClick={() => executeUploadRequest(null)}
                className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500
                           disabled:bg-gray-800 text-white rounded-xl shadow transition-all cursor-pointer"
              >
                {isUploading ? 'Streaming…' : 'Commit Upload'}
              </button>
            </div>
          </div>
        ) : (
          /* ── Conflict Resolution Panel (unchanged) ──── */
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-4 rounded-xl text-xs space-y-1">
              <p className="font-bold">Namespace Collision:</p>
              <p className="opacity-80 font-mono truncate">{conflictingFileName}</p>
              <p className="opacity-60 pt-2">
                A file with this filename already occupies your path target matrix for this current week snapshot.
                Select your resolution engine path:
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => executeUploadRequest('replace')}
                disabled={isUploading}
                className={`w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-red-600
                            text-white rounded-xl transition-all
                            ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-500 cursor-pointer'}`}
              >
                {isUploading ? 'Uploading…..' : 'Overwrite Old Database Entry'}
              </button>
              <button
                onClick={() => executeUploadRequest('rename')}
                disabled={isUploading}
                className={`w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-gray-950
                            border border-gray-800 hover:bg-gray-800 text-white rounded-xl
                            ${isUploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
              >
                {isUploading ? 'Uploading…..' : 'Auto-Append Version Tag'}
              </button>
              <button
                onClick={handleClose}
                className="w-full py-2.5 text-xs font-bold uppercase tracking-wider
                           bg-transparent text-gray-500 hover:text-gray-400 cursor-pointer"
              >
                Cancel Deployment Pipeline
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}