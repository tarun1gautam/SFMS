/**
 * UploadModal.jsx   (SFMS v2 — Enhanced with Time Stabilization Fixes)
 *
 * Changes from previous version:
 * • FIX applied to Elapsed Time: Switched from inline mathematical tracking inside onUploadProgress
 * to a dedicated useEffect setInterval tracker. This prevents time from fluctuating or jumping backwards during retries.
 * • FIX applied to ETA: Wrapped the remaining time equations in math floor boundaries to ensure steady degradation.
 */

import React, { useEffect, useState, useRef } from 'react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';

export default function UploadModal({ isOpen, onClose,user, onUploadSuccess }) {
  const [selectedFile,        setSelectedFile]        = useState(null);
  const [visibility,          setVisibility]          = useState('public');
  const [targetUsersInput,    setTargetUsersInput]    = useState('');
  const [fileDescription, setFileDescription] = useState('');
  const [isUploading,         setIsUploading]         = useState(false);
  
  // Upload metrics
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [uploadDuration, setUploadDuration] = useState(null);
  
  // Live upload elapsed time
  const [elapsedTime, setElapsedTime] = useState(0);

  // Conflict States
  const [hasConflict,        setHasConflict]        = useState(false);
  const [confuploadedby, setConfuploadedby] = useState('');
  const [confuploadedat, setConfuploadedat] = useState(0);
  const [confuploadesize, setConfuploadedsize] = useState(0);
  const [conflictingFileName, setConflictingFileName] = useState('');


  const [basePath, setBasePath] = useState(user.base_path);
  const [folders, setFolders] = useState([]);
  const [filteredFolders, setfilteredFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(user.base_path); // Default root
  const [folderSearch, setFolderSearch] = useState('');
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);

const [targetUsersInputval, setTargetUsersInputval] = useState('');
const [selectedUsers, setSelectedUsers] = useState([]);      // List of confirmed users
const [suggestions, setSuggestions] = useState([]);          // API results for the dropdown

  // Ref tracker to clean up the interval securely
  const timerRef = useRef(null);

  // STABILIZATION FIX: Separate predictable interval clock for Elapsed Time metrics
  
  useEffect(() => {
    if (isOpen) {
      api.get('/folders').then(res => setFolders(res.data.folders)).catch(console.error);
    }
  }, [isOpen]);
  
  useEffect(() => {
    if (isUploading) {
      setElapsedTime(0);
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isUploading]);

  if (!isOpen) return null;

  const resetState = () => {
    setSelectedFile(null);
    setVisibility('public');
    setTargetUsersInput('');
    setIsUploading(false);
    setHasConflict(false);
    setConflictingFileName('');
    // Reset upload stats
    setUploadProgress(0);
    setUploadSpeed(0);
    setEstimatedTime(0);
    setElapsedTime(0);
    setUploadDuration(null);
    setFileDescription('');
    setConfuploadedby('');
    setConfuploadedat(0);
    setConfuploadedsize(0);
    setConflictingFileName('');
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setHasConflict(false);
    }
  };

  const buildSharedLabel = () => {
    if (visibility === 'public') return ['Public'];
    const users = targetUsersInput
      // .split(',')
      // .map(u => u.trim())
      // .filter(u => u !== '');
    return users.length > 0 ? users : ['—'];
  };

  const executeUploadRequest = async (resolutionStrategy = null) => {
    if (!selectedFile) return;

    if(selectedFolder && !selectedFolder.endsWith("/")){
      toast.error('Path must end with a forward slash (/)');
      return
    }

    const doesFolderExist = folders.some(folder => folder.full_path === selectedFolder);
    if(!doesFolderExist){
      toast.error('folder not exist');
      return
    }

    if (!resolutionStrategy) {
      try {
        const res = await api.get(
          `/files/check-collision?filename=${encodeURIComponent(selectedFile.name)}`
        );
        console.log(selectedFile.name,res.data);
        if (res.data.exists) {
          setHasConflict(true);
          // console.log(res.data);
          setConfuploadedby(res.data.fileDetails.uploadedBy);
          setConfuploadedat(res.data.fileDetails.uploadTimestamp);
          setConfuploadedsize(res.data.fileDetails.filesize);
          setConflictingFileName(selectedFile.name);
          return;
        }
      } catch (err) {
        console.error('Error checking file collision:', err);
        return;
      }
    }


    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('visibility', visibility);
    formData.append('description', fileDescription);
    formData.append('virtual_path', selectedFolder);

    const usersArray = targetUsersInput
      // .split(',')
      // .map(u => u.trim())
      // .filter(u => u !== '');
    formData.append('target_users', JSON.stringify(usersArray));

    const sharedLabel = buildSharedLabel();
    formData.append('shared_label', JSON.stringify(sharedLabel));

    if (resolutionStrategy) {
      formData.append('conflict_resolution', resolutionStrategy);
    }

    const uploadStartTime = Date.now();
    setIsUploading(true);
    setHasConflict(false);
    try {
      await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },

        onUploadProgress: (progressEvent) => {
          const loaded = progressEvent.loaded || 0;
          const total = progressEvent.total || 1;
          const percent = Math.round((loaded * 100) / total);

          // Calculate precise runtime duration for speed evaluations
          const internalElapsedSeconds = (Date.now() - uploadStartTime) / 1000;
          const speed = internalElapsedSeconds > 0 ? loaded / internalElapsedSeconds : 0;
          const remainingBytes = total - loaded;

          // STABILIZATION FIX: Prevent volatile zero or negative speed jumps from inflating ETA calculations
          const eta = speed > 50000 ? remainingBytes / speed : 0;

          setUploadProgress(percent);
          setUploadSpeed(speed);
          if (eta > 0) {
            setEstimatedTime(eta);
          }
        },
      });
      
      toast.success('Asset successfully stored in file repository.');
      const totalTime = ((Date.now() - uploadStartTime) / 1000).toFixed(2);
      setUploadDuration(totalTime);
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

  const formatSpeed = (bytesPerSecond) => {
    if (!bytesPerSecond) return '0 MB/s';
    return `${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`;
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return '0 sec';
    
    const s = Math.ceil(seconds);
    if (s < 60) return `${s} sec`;
    
    const m = Math.floor(s / 60);
    const remainingSeconds = s % 60;
    if (m < 60) return `${m} min ${remainingSeconds} sec`;
    
    const h = Math.floor(m / 60);
    const remainingMinutes = m % 60;
    if (h < 24) return `${h} hr ${remainingMinutes} min`;
    
    const d = Math.floor(h / 24);
    const remainingHours = h % 24;
    return `${d} day${d > 1 ? 's' : ''} ${remainingHours} hr`;
  };

  const handleFolderSearch = (e) => {
  // setShowFolderDropdown(true);
  const searchvalue = e.target.value;
  if(!searchvalue){
    setSelectedFolder("");
  }
  const value = basePath+e.target.value;
  setSelectedFolder(value);
  setFolderSearch(searchvalue);
  const fFolders = folders.filter((f) => {
    const path = f.full_path;
    const folderlevel = (path.match(/\//g) || []).length;
    const searchlevel = (value.match(/\//g) || []).length;
    if((searchlevel+1) === folderlevel){
      return f.full_path.toLowerCase().includes(value.toLowerCase());
    }else{
      return false;
    }

  });
  setfilteredFolders(fFolders);
  // console.log(value,selectedFolder);
  console.log(selectedFolder);
};

const handleSearchChange = async (e) => {
  const value = e.target.value;
  setTargetUsersInputval(value);

  if (value.length > 0) {
    try {
      // Replace with your actual API endpoint URL
      const response = await api.get(`/auth/users/search?query=${encodeURIComponent(value)}`);
      const data = response.data;
      
      // Filter out users who are already selected to avoid duplicates
      const filteredSuggestions = data.users.filter(user => !targetUsersInput.includes(user));
      setSuggestions(filteredSuggestions);
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  } else {
    setSuggestions([]);
  }
};

  const sharedPreview = buildSharedLabel();

  const newFileSize = selectedFile?.size || 0; // If null, default to 0
const existingFileSize = Number(confuploadesize) || 0;
const sizeDiff = (newFileSize - existingFileSize) / 1024;

const isSameSize = newFileSize === existingFileSize;
const diffLabel = sizeDiff === 0 
  ? "the SAME SIZE" 
  : `a SIZE ${Math.abs(sizeDiff).toFixed(2)} KB ${sizeDiff > 0 ? "LARGER" : "SMALLER"}`;

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 shadow-2xl relative">
        <h3 className="text-xl font-bold text-white mb-2">Upload Workspace Asset</h3>

        {!hasConflict ? (
          <div className="space-y-3">
            {/* ── File Input ── */}
            <div className="border-2 border-dashed border-purple-500/50 bg-gradient-to-br from-purple-500/10 to-pink-500/10 hover:from-purple-500/20 hover:to-pink-500/20 rounded-xl p-2 text-center transition-all duration-200 cursor-pointer group hover:border-purple-400 hover:shadow-lg hover:shadow-purple-500/20">
              <input type="file" onChange={handleFileChange} className="hidden" id="modal-file-input" />
              <label htmlFor="modal-file-input" className="cursor-pointer block">
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-semibold text-green-400 truncate block max-w-xs mx-auto text-base">
                      {selectedFile.name}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <span className="text-base font-medium text-gray-300">
                      Click to browse filesystem storage location
                    </span>
                    <span className="text-xs text-gray-500">or drag & drop anywhere</span>
                  </div>
                )}
              </label>
            </div>


            {/* Folder Selection (Minimal Dropdown) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Target Directory</label>
              <div className="relative">
                {/* <span className="text-gray-500 font-mono select-none pointer-events-none">
    SFMS/
  </span>
                <input 
                  value={folderSearch || selectedFolder}
                  // onClick={() => setShowFolderDropdown(!showFolderDropdown)}
                  onClick={() => {
                    setShowFolderDropdown(!showFolderDropdown);
                    handleFolderSearch({ target: { value: folderSearch || selectedFolder} });
                  }}
                  // onChange={(e) => setFolderSearch(e.target.value)}
                  onChange={handleFolderSearch}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white focus:border-blue-500 outline-none"
                  placeholder="Select folder..."
                /> */}
                <div className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 flex items-center focus-within:border-blue-500 transition-colors">
  {/* Fixed Prefix */}
  <span className="text-gray-500 font-mono select-none whitespace-nowrap">
    {basePath}
  </span>
  
  {/* The Search/Input Field */}
  <input 
    value={folderSearch || selectedFolder.slice(basePath.length)}
    onClick={() => {
      setShowFolderDropdown(!showFolderDropdown);
      // Pass the current value to the handler
      handleFolderSearch({ target: { value: folderSearch || "" } });
    }}
    onChange={handleFolderSearch}
    className="w-full bg-transparent text-white outline-none ml-1 text-sm"
    placeholder="navigate_to_folder..."
  />
</div>
                {showFolderDropdown && (
                  <div className="absolute z-20 w-full bg-gray-900 border border-gray-800 mt-1 rounded-xl max-h-48 overflow-y-auto">
                    {filteredFolders.map(f => (
                      <div key={f.folder_id} onClick={() => { setSelectedFolder(f.full_path); setShowFolderDropdown(false); setFolderSearch(f.full_path.slice(basePath.length)) }} 
                           className="px-4 py-2 hover:bg-gray-800 text-sm text-gray-300 cursor-pointer">
                        {f.full_path}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Visibility ── */}
            {!isUploading && (<div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Scope Clearance Visibility
              </label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="public">Public (Global Visibility Scope)</option>
                <option value="private">Private (Restricted Node Verification)</option>
                <option value="group">Group (Collaborative Shared Cluster)</option>
              </select>
            </div>)}

            {/* ── Target Users ── */}
            {visibility !== 'public' && !isUploading &&  (
              <div>
  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
    Clearance Target Keys
  </label>
  
  {/* Display selected tags */}
  <div className="flex flex-wrap gap-2 mb-2">
    {targetUsersInput && targetUsersInput.map(user => (
      <span key={user} className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs">
        {user}
        <button onClick={() => setTargetUsersInput(targetUsersInput.filter(u => u !== user))} className="ml-2 text-red-400">×</button>
      </span>
    ))}
  </div>

  {/* Search Input */}
  <div className="relative">
    <input
      type="text"
      value={targetUsersInputval}
      onChange={handleSearchChange} // Fetch data here based on e.target.value
      placeholder="Type to search users..."
      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white"
    />

    {/* Dropdown Menu */}
    {suggestions.length > 0 && (
      <ul className="absolute z-10 w-full bg-gray-900 border border-gray-800 mt-1 rounded-lg shadow-xl max-h-40 overflow-y-auto">
        {suggestions.map(user => (
          <li 
            key={user}
            onClick={() => {
              setTargetUsersInput([...targetUsersInput, user]);
              setTargetUsersInputval(''); // Clear input
              setSuggestions([]);       // Close dropdown
            }}
            className="px-4 py-2 hover:bg-gray-800 cursor-pointer text-sm text-white"
          >
            {user}
          </li>
        ))}
      </ul>
    )}
  </div>
</div>
            )}

            {/* ── Shared To preview ── */}
            {/* <div className="bg-gray-950/50 border border-gray-800/60 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                Shared To Preview
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sharedPreview.map((label, i) => (
                  <span key={i}
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border
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
            </div> */}

             {/* ── File Description ── */}
{!isUploading && (<div>
  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
    File Description
  </label>
  <textarea
    value={fileDescription}
    onChange={(e) => setFileDescription(e.target.value)}
    placeholder="Briefly describe what this file is for..."
    rows="2"
    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none transition-colors"
  />
</div>)}

            {/* Progress Bar Rendering Grid Interface Elements */}
            {isUploading && (
              <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4 space-y-3">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Upload Progress</span>
                  <span>{uploadProgress}%</span>
                </div>

                <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="bg-gray-900 rounded-lg p-2">
                    <p className="text-gray-500">Speed</p>
                    <p className="text-blue-400 font-semibold">{formatSpeed(uploadSpeed)}</p>
                  </div>

                  <div className="bg-gray-900 rounded-lg p-2">
                    <p className="text-gray-500">Elapsed</p>
                    <p className="text-yellow-400 font-semibold">{formatTime(elapsedTime)}</p>
                  </div>

                  <div className="bg-gray-900 rounded-lg p-2">
                    <p className="text-gray-500">ETA</p>
                    <p className="text-emerald-400 font-semibold">{formatTime(estimatedTime)}</p>
                  </div>
                </div>

                {uploadDuration && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                    <p className="text-xs text-emerald-400">
                      Upload completed in {formatTime(uploadDuration)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 text-sm font-semibold bg-gray-950 border border-gray-800 rounded-xl hover:bg-gray-800 text-gray-400 cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={!selectedFile || isUploading}
                onClick={() => executeUploadRequest(null)}
                className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 text-white rounded-xl shadow transition-all cursor-pointer"
              >
                {isUploading ? 'Streaming…' : 'Commit Upload'}
              </button>
            </div>
          </div>
        ) : (
          /* ── Conflict Resolution Panel ── */
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-5 rounded-xl text-sm space-y-3">
  <div className="flex items-center gap-2">
    <span className="font-bold text-amber-500">Namespace Collision:</span>
    <span className="opacity-80 font-mono truncate bg-black/20 px-2 py-0.5 rounded">{conflictingFileName}</span>
  </div>

  <div className="opacity-90 leading-relaxed">
    {/* Comparison Logic */}
    A file of 
    <span className="font-semibold text-white px-1">
      {selectedFile && Number(confuploadesize) === selectedFile.size 
        ? "the same size" 
        : selectedFile ? `${(Math.abs(selectedFile.size - Number(confuploadesize)) / 1024).toFixed(2)} KB ${selectedFile.size > Number(confuploadesize) ? "larger" : "smaller"}` : "unknown size"}
    </span> 
    with this name was previously uploaded by 
    <b className="text-red-500 px-1">{confuploadedby || "Unknown"}</b> 
    on 
    <b className="text-red-500 px-1">
      {confuploadedat ? new Date(confuploadedat).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : "an unknown date"}
    </b>.
  </div>

  <div className="pt-2 border-t border-amber-500/10 font-medium">
    Select your resolution engine path:
  </div>
</div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => executeUploadRequest('replace')}
                disabled={isUploading}
                className={`w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-red-600 text-white rounded-xl transition-all ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-500 cursor-pointer'}`}
              >
                {isUploading ? 'Uploading…..' : 'Overwrite Old Database Entry'}
              </button>
              <button
                onClick={() => executeUploadRequest('rename')}
                disabled={isUploading}
                className={`w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-gray-950 border border-gray-800 hover:bg-gray-800 text-white rounded-xl ${isUploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
              >
                {isUploading ? 'Uploading…..' : 'Auto-Append Version Tag'}
              </button>
              <button
                onClick={()=>setHasConflict(!hasConflict)}
                className="w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-transparent text-gray-500 hover:text-gray-400 cursor-pointer"
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