/**
 * transferStore.js
 *
 * Tiny IndexedDB wrapper that persists in-flight transfer state
 * (offset / acked bytes / checksum state) so a transfer can resume
 * from the exact byte it left off — even across a Wi-Fi drop, a
 * page reload, or a socket reconnect. No server involvement.
 */

const DB_NAME = 'sfms_nearby_share';
const STORE = 'transfers';
const VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'transferId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTransferState(transferId, state) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ transferId, ...state, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getTransferState(transferId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(transferId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTransferState(transferId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(transferId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listStaleTransfers(maxAgeMs = 24 * 60 * 60 * 1000) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const now = Date.now();
      resolve((req.result || []).filter((r) => now - r.updatedAt < maxAgeMs));
    };
    req.onerror = () => reject(req.error);
  });
}
