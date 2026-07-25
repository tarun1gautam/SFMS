const AGENT_URL = 'http://localhost:9001';

export async function isAgentRunning() {
  try {
    const res = await fetch(`${AGENT_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getWatchedFolders() {
  const res = await fetch(`${AGENT_URL}/api/folders`);
  if (!res.ok) throw new Error('Failed to fetch folders');
  return (await res.json()).folders;
}

export async function addWatchedFolder(path) {
  const res = await fetch(`${AGENT_URL}/api/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to add folder');
  return data;
}

export async function removeWatchedFolder(path) {
  const res = await fetch(`${AGENT_URL}/api/folders`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error('Failed to remove folder');
  return res.json();
}

export async function scanRecentFiles(days = 7) {
  const res = await fetch(`${AGENT_URL}/api/scan-recent?days=${days}`);
  if (!res.ok) throw new Error('Scan failed');
  return res.json(); // { days, count, files: [...] }
}

export async function uploadSelectedFiles(filePaths, extra, authToken) {
  const res = await fetch(`${AGENT_URL}/api/upload-selected`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePaths, extra, authToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload request failed');
  return data; // { results: [...] }
}

// Reads a single file's raw bytes from the Agent so the browser can turn it
// into a real File object and hand it to the existing UploadModal — reusing
// all of its collision-detection, progress, and resolution UI unchanged.
export async function readAgentFile(filePath) {
  const res = await fetch(`${AGENT_URL}/api/read-file?path=${encodeURIComponent(filePath)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to read file: ${filePath}`);
  }
  return res.blob();
}