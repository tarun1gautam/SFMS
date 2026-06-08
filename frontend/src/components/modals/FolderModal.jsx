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

export default function FolderModal({ isOpen, onClose,user, onFolderCreate }) {
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

const [newFolderName, setNewFolderName] = useState('');

  // Ref tracker to clean up the interval securely
  const timerRef = useRef(null);

  // STABILIZATION FIX: Separate predictable interval clock for Elapsed Time metrics
  
  useEffect(() => {
    if (isOpen) {
      api.get('/folders').then(res => setFolders(res.data.folders)).catch(console.error);
    }
  }, [isOpen]);

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



  const handleClose = () => {
    resetState();
    onClose();
  };

  const CreateFolder = async () => {
     const formData = new FormData();
    formData.append('folder_name', newFolderName);
    formData.append('full_path', selectedFolder);
    formData.append('visibility', visibility);
    formData.append('target_users', JSON.stringify(targetUsersInput));
    formData.append('shared_label', JSON.stringify(targetUsersInput)); 

    console.log("Creating folder with data:", {
      folder_name: newFolderName,
      full_path: selectedFolder,
      visibility,
      target_users: targetUsersInput,
      shared_label: JSON.stringify(targetUsersInput)
    });

    try {
      const response = await api.post('/createFolder', { name: newFolderName, parent_path: selectedFolder });
      if (response.status === 201) {
        toast.success("Folder created successfully");
        resetState();
        onClose();
      } else {
        toast.error("Failed to create folder");
      }
    } catch (error) {
      toast.error("An error occurred while creating the folder");
    }
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

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 shadow-2xl relative">
        <h3 className="text-xl font-bold text-white mb-2">Create Folder</h3>

        {!hasConflict ? (
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Folder Name</label>
             <div className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 flex items-center focus-within:border-blue-500 transition-colors">
  {/* The Search/Input Field */}
  <input 
    value={newFolderName}
    className="w-full bg-transparent text-white outline-none ml-1 text-sm"
    onChange={(e)=>{setNewFolderName(e.target.value)}}
    placeholder="Folder Name"
  />
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


            {/* ── Actions ── */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 text-sm font-semibold bg-gray-950 border border-gray-800 rounded-xl hover:bg-gray-800 text-gray-400 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => CreateFolder(null)}
                className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 text-white rounded-xl shadow transition-all cursor-pointer"
              >
                Create Folder
              </button>
            </div>
          </div>
        ) : ""}
      </div>
    </div>
  );
}