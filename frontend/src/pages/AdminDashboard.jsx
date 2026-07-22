import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const Bar = ({ percent, danger = 80, warn = 60 }) => {
  const color = percent >= danger ? 'bg-red-500' : percent >= warn ? 'bg-amber-500' : 'bg-blue-500';
  return (
    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
};

const Card = ({ title, children }) => (
  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">{title}</h3>
    {children}
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex justify-between text-sm py-0.5">
    <span className="text-gray-500">{label}</span>
    <span className="text-white font-medium">{value}</span>
  </div>
);

export default function AdminDashboard() {
  const [stats, setStats]     = useState(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/admin/system-stats');
      setStats(res.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load system stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000); // poll every 10s
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) return <div className="text-gray-400 text-sm p-6">Loading system stats...</div>;
  if (error)   return <div className="text-red-400 text-sm p-6">{error}</div>;
  if (!stats)  return null;

  const { disk, memory, cpu, database, application } = stats;

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">System Health</h1>
        <span className="text-xs text-gray-500">
          Updated {new Date(stats.timestamp).toLocaleTimeString()} · auto-refreshes every 10s
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Disk */}
        <Card title="Disk Space">
          <Row label="Used" value={`${disk.usedGB} GB / ${disk.totalGB} GB`} />
          <Row label="Free" value={`${disk.freeGB} GB`} />
          <div className="mt-2"><Bar percent={disk.usedPercent} /></div>
          <p className="text-xs text-gray-600 mt-1 truncate">{disk.pathChecked}</p>
        </Card>

        {/* Memory */}
        <Card title="Memory">
          <Row label="Used" value={`${memory.usedGB} GB / ${memory.totalGB} GB`} />
          <Row label="This process (RSS)" value={`${memory.processRssMB} MB`} />
          <div className="mt-2"><Bar percent={memory.usedPercent} /></div>
        </Card>

        {/* CPU */}
        <Card title="CPU">
          <Row label="Cores" value={cpu.cores} />
          <Row label="Model" value={cpu.model} />
          <p className="text-xs text-gray-600 mt-2">
            Load average isn't reliable on Windows — for real CPU usage, check
            Task Manager or Performance Monitor on the VM directly.
          </p>
        </Card>

        {/* Database */}
        <Card title="Database">
          <Row label="Size" value={`${database.sizeGB} GB`} />
          <Row label="Connections" value={`${database.connections.total} (${database.connections.active} active)`} />
          <div className="mt-3 space-y-1">
            <p className="text-xs text-gray-500 mb-1">Largest tables</p>
            {database.largestTables.map(t => (
              <Row key={t.name} label={t.name} value={`${t.sizeGB} GB · ${t.rows.toLocaleString()} rows`} />
            ))}
          </div>
        </Card>

        {/* Application */}
        <Card title="Application">
          <Row label="Total files" value={application.totalFiles.toLocaleString()} />
          <Row label="Total folders" value={application.totalFolders.toLocaleString()} />
          <Row label="Download logs" value={application.totalDownloadLogs.toLocaleString()} />
        </Card>

        {/* Upload Queue */}
        <Card title="Upload Queue">
          {Object.entries(application.uploadQueue || {}).map(([k, v]) => (
            <Row key={k} label={k} value={String(v)} />
          ))}
        </Card>

      </div>
    </div>
  );
}