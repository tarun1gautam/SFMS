import React, { useState } from 'react'
import { ChevronDown, KeyRound, LogOut, LayoutDashboard, Users, ShieldCheck } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

export default function Navbar({ 
  stats = {}, 
  formatBytes, 
  isAdmin, 
  activeTab, 
  setActiveTab, 
  user, 
  logout, 
  setIsChangePasswordOpen,
  setIsMfaSettingsOpen,
}) {
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  return (
    <nav className="bg-surface/95 dark:bg-gray-900/90 backdrop-blur-md border-b border-line dark:border-gray-800 px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between top-0 z-50 shadow-sm shadow-gray-200/70 dark:shadow-lg dark:shadow-black/20">
      
      {/* Brand Header */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative w-9 h-9 sm:w-10 sm:h-10 shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 rounded-xl shadow-lg shadow-blue-600/30" />
          <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" />
          <div className="relative w-full h-full flex items-center justify-center">
            <span className="text-white font-black text-xs sm:text-sm tracking-tight drop-shadow-sm">SF</span>
          </div>
        </div>
        
        {/* Workspace Title */}
        <div className="hidden sm:block">
          <h1 className="text-[15px] font-bold text-ink dark:text-white tracking-tight leading-tight">
            SFMS <span className="font-medium text-faint dark:text-gray-500">Workspace</span>
          </h1>
          <p className="text-[11px] text-faint dark:text-gray-500 tracking-wide">
            Secure File Management System
          </p>
        </div>
      </div>

      {/* Right Navigation Items */}
      <div className="flex items-center gap-1.5 sm:gap-3">

        {/* Compact Stats - Hidden on Mobile */}
        <div className="hidden md:flex items-center gap-4 border-l border-line dark:border-gray-800 pl-4 mr-1">
          <div className="flex items-center gap-1.5 text-xs text-subtle dark:text-gray-400" title="Total files">
            <svg className="w-4 h-4 text-faint dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="font-semibold text-ink dark:text-gray-200 tabular-nums">{stats.totalFiles || 0}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-subtle dark:text-gray-400" title="Storage used">
            <svg className="w-4 h-4 text-faint dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
            <span className="font-semibold text-ink dark:text-gray-200 tabular-nums">{formatBytes ? formatBytes(stats.totalStorageBytes) : '0 B'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-subtle dark:text-gray-400" title={stats.topDownloadedFile?.original_name || 'No activity'}>
            <svg className="w-4 h-4 text-faint dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="font-semibold text-ink dark:text-gray-200 tabular-nums">
              {stats.topDownloadedFile ? stats.topDownloadedFile.download_count : 0}
            </span>
          </div>
        </div>

        {/* Admin Section Buttons */}
        {isAdmin && (
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* 1. User Mgmt Button */}
            <button
              onClick={() => setActiveTab(activeTab === 'admin_users' ? 'files' : 'admin_users')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                activeTab === 'admin_users'
                  ? 'bg-blue-600 border-blue-500 text-white shadow shadow-blue-600/20'
                  : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 hover:border-blue-300 dark:hover:border-blue-500/30'
              }`}
            >
              <Users size={15} />
              <span className="text-xs font-bold uppercase tracking-wider">Mgmt</span>
            </button>

            {/* 2. Admin Dashboard Button */}
            <button
              onClick={() => setActiveTab(activeTab === 'admin_dashboard' ? 'files' : 'admin_dashboard')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                activeTab === 'admin_dashboard'
                  ? 'bg-blue-600 border-blue-500 text-white shadow shadow-blue-600/20'
                  : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 hover:border-blue-300 dark:hover:border-blue-500/30'
              }`}
            >
              <LayoutDashboard size={15} />
              <span className="text-xs font-bold uppercase tracking-wider">Admin</span>
            </button>
          </div>
        )}

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Identity Display / Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsProfileOpen((p) => !p)}
            className="flex items-center gap-1.5 sm:gap-2.5 pl-1 pr-1.5 sm:pr-2 py-1 rounded-xl hover:bg-field dark:hover:bg-gray-800/50 transition-all cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/80 to-blue-700/80 border border-blue-500/30 flex items-center justify-center text-[11px] font-bold text-white uppercase shadow shadow-blue-900/20">
              {(user?.user_id || 'G').slice(0, 2)}
            </div>
            <div className="hidden md:block text-right">
              <span className="block text-sm font-semibold text-ink dark:text-gray-200 leading-tight">{user?.user_id || 'Guest'}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {user?.role || 'User'}
              </span>
            </div>
            <ChevronDown size={14} className={`text-faint dark:text-gray-500 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
          </button>

          {isProfileOpen && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setIsProfileOpen(false)} />
              <div className="absolute right-0 mt-2 w-52 bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 rounded-xl shadow-xl shadow-gray-300/40 dark:shadow-2xl z-[70] overflow-hidden">
                <div className="px-4 py-3 border-b border-line dark:border-gray-800/80 bg-surface-alt dark:bg-transparent">
                  <p className="text-sm font-semibold text-ink dark:text-gray-200 truncate">{user?.user_id}</p>
                  <p className="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-bold">{user?.role}</p>
                </div>
                <button
                  onClick={() => { setIsChangePasswordOpen(true); setIsProfileOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-subtle dark:text-gray-300 hover:bg-field dark:hover:bg-gray-800 hover:text-ink dark:hover:text-white transition-all cursor-pointer"
                >
                  <KeyRound size={15} /> Change Password
                </button>
                <button
                  onClick={() => { setIsMfaSettingsOpen(true); setIsProfileOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-subtle dark:text-gray-300 hover:bg-field dark:hover:bg-gray-800 hover:text-ink dark:hover:text-white transition-all cursor-pointer"
                >
                  <ShieldCheck size={15} /> MFA Settings
                </button>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all cursor-pointer border-t border-line dark:border-gray-800/80"
                >
                  <LogOut size={15} /> Logout
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </nav>
  )
}