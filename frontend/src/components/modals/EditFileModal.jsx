import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';

export default function EditFileModal({ isOpen, onClose, fileData, onUpdateSuccess }) {
  const [fileName, setFileName] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [description, setDescription] = useState('');
  const [filePath, setFilePath] = useState('');
  const [targetUsers, setTargetUsers] = useState([]);
  const [targetUsersInputval, setTargetUsersInputval] = useState('');
  const [suggestions, setSuggestions] = useState([]); 
  const [realTargetUsers, setRealTargetUsers] = useState([]);

  // Initialize state when modal opens or fileData changes
  useEffect(() => {
    if (fileData) {
      setFileName(fileData.file_name || '');
      setVisibility(fileData.visibility || 'public');
      setDescription(fileData.description || '');
      setFilePath(fileData.file_path || '');
      setTargetUsers(fileData.target_users || []);
      setRealTargetUsers(fileData.target_users);
    }
  }, [fileData]);

  useEffect(() => {
    if (visibility === "public") {
      setTargetUsers([]);
    } else {
      setTargetUsers(realTargetUsers);
    }
  }, [visibility, realTargetUsers]);

  if (!isOpen) return null;

  const handleUpdate = async () => {
    // ========================================================
    // START NEW CHANGES: API-BASED COLLISION CHECK
    // ========================================================
    const cleanedNewName = fileName.trim();
    const originalName = fileData?.file_name || '';

    // Only hit the server if the user actually changed the name string
    if (cleanedNewName.toLowerCase() !== originalName.toLowerCase()) {
      console.log('Checking for name collision with:', cleanedNewName,originalName);
      try {
        const collisionResponse = await api.get(`/files/check-collision?filename=${encodeURIComponent(cleanedNewName)}`);
        console.log('Collision check response:', collisionResponse.data);
        
        if (collisionResponse.data && collisionResponse.data.exists) {
          toast.error('A file with a similar name already exists. Please choose a different name.');
          return; // Stop execution before running the PUT request
        }
      } catch (err) {
        console.error('Collision validation check failed:', err);
        toast.error('Error validation checking file accessibility name.');
        return; // Halt if validation system cannot communicate
      }
    }
    // ========================================================
    // END NEW CHANGES
    // ========================================================

    const oldPath = filePath;
    const newPath = oldPath.replace(/[^\\/]*$/, fileName);
    console.log(fileName,oldPath,newPath);
    try {
      await api.put(`/files/edit/${fileData.id}`, {
        file_name: fileName,
        visibility,
        description,
        file_path: newPath,
        target_users: targetUsers
      });
      toast.success('File metadata updated successfully.');
      onUpdateSuccess();
      onClose();
    } catch (err) {
      toast.error('Failed to update file details.');
    }
  };

  const handleSearchChange = async (e) => {
    const value = e.target.value;
    setTargetUsersInputval(value);

    if (value.length > 0) {
      try {
        const response = await api.get(`/auth/users/search?query=${encodeURIComponent(value)}`);
        const data = response.data;
        
        const filteredSuggestions = data.users.filter(user => !targetUsers.includes(user));
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
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
        <h2 className="text-xl font-bold text-white mb-4">Edit File Details</h2>

        <div className="space-y-5">
          {/* File Name */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">File Name</label>
            <input 
              value={fileName} 
              onChange={(e) => setFileName(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Visibility Scope</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="group">Group</option>
            </select>
          </div>

          {visibility !== "public" && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Clearance Target Keys
              </label>
              
              {/* Display selected tags */}
              <div className="flex flex-wrap gap-2 mb-2">
                {targetUsers && targetUsers.map(user => (
                  <span key={user} className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs">
                    {user}
                    <button onClick={() => setTargetUsers(targetUsers.filter(u => u !== user))} className="ml-2 text-red-400">×</button>
                  </span>
                ))}
              </div>

              {/* Search Input */}
              <div className="relative">
                <input
                  type="text"
                  value={targetUsersInputval}
                  onChange={handleSearchChange}
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
                          setTargetUsers([...targetUsers, user]);
                          setTargetUsersInputval('');
                          setSuggestions([]);
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

          {/* Description */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="3"
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold bg-gray-950 border border-gray-800 rounded-xl hover:bg-gray-800 text-gray-400">Cancel</button>
            <button onClick={handleUpdate} className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}