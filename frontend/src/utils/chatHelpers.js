// Shared formatting/grouping helpers for the File Chat module.
// Centralized here so ChatThread/ConversationList/MessageBubble never
// duplicate this logic — one place to fix a date bug or icon mapping.

import {
  FileText, FileSpreadsheet, FileImage, Presentation,
  File as FileIcon, Play, Music, FileArchive, FileCode2,
} from 'lucide-react';

const EXT_ICON_MAP = {
  pdf: FileText, doc: FileText, docx: FileText, txt: FileText, rtf: FileText,
  xls: FileSpreadsheet, xlsx: FileSpreadsheet, csv: FileSpreadsheet,
  ppt: Presentation, pptx: Presentation,
  png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage, webp: FileImage,
  mp4: Play, webm: Play, mov: Play,
  mp3: Music, wav: Music, m4a: Music,
  zip: FileArchive, rar: FileArchive, '7z': FileArchive,
  js: FileCode2, ts: FileCode2, jsx: FileCode2, tsx: FileCode2, py: FileCode2, json: FileCode2,
};

export function getFileIcon(name, mimeType) {
  if (mimeType?.startsWith('image/')) return FileImage;
  if (mimeType?.startsWith('video/')) return Play;
  if (mimeType?.startsWith('audio/')) return Music;
  const ext = name?.split('.').pop()?.toLowerCase();
  return EXT_ICON_MAP[ext] || FileIcon;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Returns a stable calendar-day key (YYYY-MM-DD) for grouping.
export function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function formatDateDivider(iso) {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (startOfThat.getTime() === startOfToday.getTime()) return 'Today';
  if (startOfThat.getTime() === startOfYesterday.getTime()) return 'Yesterday';

  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], sameYear
    ? { month: 'long', day: 'numeric' }
    : { month: 'long', day: 'numeric', year: 'numeric' });
}

// Groups a flat, chronologically-sorted message array into
// [{ key, label, messages: [...] }] chunks by calendar day.
export function groupMessagesByDate(messages) {
  const groups = [];
  let currentKey = null;
  let currentGroup = null;

  for (const msg of messages) {
    const key = dayKey(msg.createdAt);
    if (key !== currentKey) {
      currentKey = key;
      currentGroup = { key, label: formatDateDivider(msg.createdAt), messages: [] };
      groups.push(currentGroup);
    }
    currentGroup.messages.push(msg);
  }
  return groups;
}

export function isPreviewable(mimeType) {
  if (!mimeType) return false;
  return mimeType.startsWith('image/') || mimeType === 'application/pdf' ||
         mimeType.startsWith('video/') || mimeType.startsWith('audio/');
}