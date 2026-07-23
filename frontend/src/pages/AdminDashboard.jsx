import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

// --- Reusable UI Elements ---

const Bar = ({ percent, danger = 80, warn = 60, height = "h-2" }) => {
  const safePercent = Math.min(Math.max(percent || 0, 0), 100);
  const color =
    safePercent >= danger
      ? 'bg-gradient-to-r from-red-500 to-rose-600'
      : safePercent >= warn
      ? 'bg-gradient-to-r from-amber-500 to-orange-500'
      : 'bg-gradient-to-r from-blue-500 to-indigo-600';

  return (
    <div className={`w-full ${height} bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden p-0.5 border border-gray-300/30 dark:border-gray-700/30`}>
      <div
        className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
        style={{ width: `${safePercent}%` }}
      />
    </div>
  );
};

const MetricCard = ({ title, icon, children, badge }) => (
  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between">
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400">
            {icon}
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">
            {title}
          </h3>
        </div>
        {badge && (
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  </div>
);

const StatRow = ({ label, value, subtext }) => (
  <div className="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-800/50 last:border-0 text-sm">
    <span className="text-gray-500 dark:text-gray-400 font-medium">{label}</span>
    <div className="text-right">
      <span className="text-gray-900 dark:text-white font-semibold">{value}</span>
      {subtext && <div className="text-[11px] text-gray-400 dark:text-gray-500">{subtext}</div>}
    </div>
  </div>
);

// --- Main Dashboard Component ---

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await api.get('/admin/system-stats');
      setStats(res.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load system stats');
    } finally {
      setLoading(false);
      if (isManual) setTimeout(() => setIsRefreshing(false), 500);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => fetchStats(false), 10000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-gray-500 dark:text-gray-400 text-sm">
        <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Gathering system diagnostics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-3">
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{error}</span>
      </div>
    );
  }

  if (!stats) return null;

  const { disk, memory, cpu, database, application } = stats;

  // Calculate totals for table visualization
  const totalTableGB = database.largestTables.reduce((acc, t) => acc + (t.sizeGB || 0), 0);

  // Upload Queue calculation helper
  const queueItems = Object.entries(application.uploadQueue || {});
  const totalQueue = queueItems.reduce((acc, [, val]) => acc + (Number(val) || 0), 0);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">System Health Overview</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Auto-refreshing every 10 seconds
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 dark:text-gray-500 hidden md:inline">
            Updated {new Date(stats.timestamp).toLocaleTimeString()}
          </span>
          <button
            onClick={() => fetchStats(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Quick Status Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-2xl">
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Disk Used</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">{disk.usedPercent}%</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{disk.usedGB} / {disk.totalGB} GB</div>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-2xl">
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">RAM Used</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">{memory.usedPercent}%</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{memory.usedGB} / {memory.totalGB} GB</div>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-2xl">
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Active DB Conns</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">{database.connections.active}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Total: {database.connections.total}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-2xl">
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Files Managed</div>
          <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">{application.totalFiles.toLocaleString()}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{application.totalFolders.toLocaleString()} folders</div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Disk Space */}
        <MetricCard
          title="Storage Architecture"
          badge={`${disk.freeGB} GB Free`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          }
        >
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <div>
                <span className="text-2xl font-bold text-gray-900 dark:text-white">{disk.usedPercent}%</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1.5">Capacity Allocated</span>
              </div>
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{disk.usedGB} / {disk.totalGB} GB</span>
            </div>
            <Bar percent={disk.usedPercent} height="h-3" />
            <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800/80">
              <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 block truncate">
                Path: {disk.pathChecked}
              </span>
            </div>
          </div>
        </MetricCard>

        {/* Memory */}
        <MetricCard
          title="System Memory"
          badge={`RSS: ${memory.processRssMB} MB`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          }
        >
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <div>
                <span className="text-2xl font-bold text-gray-900 dark:text-white">{memory.usedPercent}%</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1.5">RAM Utilization</span>
              </div>
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{memory.usedGB} / {memory.totalGB} GB</span>
            </div>
            <Bar percent={memory.usedPercent} height="h-3" />
            <StatRow label="Node.js Process Memory" value={`${memory.processRssMB} MB`} />
          </div>
        </MetricCard>

        {/* CPU */}
        <MetricCard
          title="Processing Unit"
          badge={`${cpu.cores} Cores`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z" />
            </svg>
          }
        >
          <div className="space-y-3">
            <StatRow label="Processor Architecture" value={cpu.model || 'Standard CPU'} />
            <StatRow label="Available Hardware Threads" value={`${cpu.cores} Cores`} />
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
              💡 OS load details are best verified directly within Task Manager / Hypervisor metrics.
            </div>
          </div>
        </MetricCard>

        {/* Application Stats */}
        <MetricCard
          title="Application Footprint"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        >
          <div className="space-y-1">
            <StatRow label="Total Files Stored" value={application.totalFiles.toLocaleString()} />
            <StatRow label="Total Directory Folders" value={application.totalFolders.toLocaleString()} />
            <StatRow label="Audit / Download Logs" value={application.totalDownloadLogs.toLocaleString()} />
          </div>
        </MetricCard>

        {/* Database Details */}
        <MetricCard
          title="Database Infrastructure"
          badge={`${database.sizeGB} GB`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          }
        >
          <div className="space-y-3">
            <StatRow label="Connection Pool" value={`${database.connections.total} Total (${database.connections.active} Active)`} />
            
            <div className="pt-2">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Top Data Tables
              </div>
              <div className="space-y-2">
                {database.largestTables.map((t) => {
                  const share = totalTableGB > 0 ? Math.round(((t.sizeGB || 0) / totalTableGB) * 100) : 0;
                  return (
                    <div key={t.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-mono text-gray-700 dark:text-gray-300">{t.name}</span>
                        <span className="text-gray-500">{t.sizeGB} GB · {t.rows.toLocaleString()} rows</span>
                      </div>
                      <Bar percent={share} height="h-1.5" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </MetricCard>

        {/* Upload Queue */}
        <MetricCard
          title="Upload Queue Activity"
          badge={totalQueue > 0 ? `${totalQueue} Active` : 'Idle'}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          }
        >
          <div className="space-y-2">
            {queueItems.length > 0 ? (
              queueItems.map(([key, val]) => (
                <div key={key} className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 capitalize">{key}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    {String(val)}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-600">
                Queue is clear and empty.
              </div>
            )}
          </div>
        </MetricCard>

      </div>
    </div>
  );
}