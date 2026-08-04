import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ArrowLeft, MessageSquareOff, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../utils/api';
import MessageBubble from './MessageBubble';
import SendFileBar from './SendFileBar';
import DateDivider from './DateDivider';
import FilePreviewLightbox from './FilePreviewLightbox';
import UserAvatar from './UserAvatar';
import { groupMessagesByDate } from '../../utils/chatHelpers';

const SEEN_DEBOUNCE_MS = 400;

export default function ChatThread({ user, recipientId, socketRef, onBack, isMobile }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState(null);

  const scrollContainerRef = useRef(null);
  const bottomAnchorRef = useRef(null);
  const bubbleNodesRef = useRef(new Map()); // messageId -> DOM node, for IntersectionObserver
  const pendingSeenRef = useRef(new Set());
  const seenFlushTimerRef = useRef(null);
  const wasAtBottomRef = useRef(true);
  const loadedRecipientRef = useRef(null); // guards against a duplicate fetch if recipientId identity churns

  // ── Load conversation history (once per recipient change) ─────────────
  useEffect(() => {
    if (!recipientId || loadedRecipientRef.current === recipientId) return;
    loadedRecipientRef.current = recipientId;

    let cancelled = false;
    setLoading(true);
    api.get(`/messages/conversation/${recipientId}`, { params: { page: 1, limit: 50 } })
      .then(res => {
        if (cancelled) return;
        setMessages((res.data.data || []).slice().reverse());
      })
      .catch(err => {
        console.error('Failed to load conversation:', err);
        if (!cancelled) toast.error('Could not load this conversation.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [recipientId]);

  // Reset the "already loaded" guard when the user actually navigates away
  // and back to a DIFFERENT recipient (not just a re-render).
  useEffect(() => {
    return () => { if (loadedRecipientRef.current !== recipientId) loadedRecipientRef.current = null; };
  }, [recipientId]);

  // ── Auto-scroll: only snap to bottom if the user was already at/near the
  //    bottom before new messages arrived — preserves reading position if
  //    they've scrolled up to review history. ─────────────────────────────
  const checkIfAtBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  useEffect(() => {
    if (wasAtBottomRef.current) {
      bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  const handleScroll = useCallback(() => {
    wasAtBottomRef.current = checkIfAtBottom();
  }, [checkIfAtBottom]);

  // ── Seen-on-visibility: only mark a message seen once it's ACTUALLY
  //    scrolled into view, not merely present in the DOM — avoids false
  //    read receipts for messages the user never looked at (e.g. arriving
  //    while they're scrolled up reading old history). ────────────────────
  const flushSeen = useCallback(() => {
    const ids = Array.from(pendingSeenRef.current);
    if (ids.length === 0) return;
    pendingSeenRef.current.clear();
    api.patch('/messages/seen', { messageIds: ids, senderId: recipientId }).catch(() => {
      // best-effort — if it fails, those messages simply stay unseen until
      // the next visibility pass re-queues them
    });
  }, [recipientId]);

  const observerRef = useRef(null);
  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.dataset.messageId;
        if (!id) continue;
        pendingSeenRef.current.add(id);
        changed = true;
      }
      if (changed) {
        clearTimeout(seenFlushTimerRef.current);
        seenFlushTimerRef.current = setTimeout(flushSeen, SEEN_DEBOUNCE_MS);
      }
    }, { root: scrollContainerRef.current, threshold: 0.6 });

    return () => {
      observerRef.current?.disconnect();
      clearTimeout(seenFlushTimerRef.current);
    };
  }, [flushSeen]);

  const registerBubbleRef = useCallback((messageId, node) => {
    const prevNode = bubbleNodesRef.current.get(messageId);
    if (prevNode && observerRef.current) observerRef.current.unobserve(prevNode);

    if (node) {
      bubbleNodesRef.current.set(messageId, node);
      observerRef.current?.observe(node);
    } else {
      bubbleNodesRef.current.delete(messageId);
    }
  }, []);

  // Only observe messages that are actually unseen — no point watching
  // ones already marked seen.
  useEffect(() => {
    messages.forEach(m => {
      if (m.senderId === recipientId && !m.isSeen) {
        const node = bubbleNodesRef.current.get(m.id);
        if (node) observerRef.current?.observe(node);
      }
    });
  }, [messages, recipientId]);

  // ── Socket wiring — filtered to THIS conversation only ─────────────────
  useEffect(() => {
    const sock = socketRef.current;
    if (!sock) return;

    const belongsHere = (msg) => msg.senderId === recipientId || msg.recipientId === recipientId;

    const handleNew = (msg) => {
      if (!belongsHere(msg)) return;
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    };

    const handleReactionAdded = ({ messageId, userId, emoji }) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const reactions = m.reactions || [];
        const existing = reactions.find(r => r.emoji === emoji);
        const hasReacted = userId === user.user_id;
        if (existing) {
          return {
            ...m,
            reactions: reactions.map(r => r.emoji === emoji
              ? { ...r, count: r.count + 1, hasReacted: r.hasReacted || hasReacted }
              : r),
          };
        }
        return { ...m, reactions: [...reactions, { emoji, count: 1, hasReacted }] };
      }));
    };

    const handleReactionRemoved = ({ messageId, userId, emoji }) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const reactions = (m.reactions || [])
          .map(r => r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1), hasReacted: userId === user.user_id ? false : r.hasReacted } : r)
          .filter(r => r.count > 0);
        return { ...m, reactions };
      }));
    };

    const handleSeen = ({ seenBy, messageIds }) => {
      if (seenBy !== recipientId) return; // only care if the PEER just saw OUR messages
      setMessages(prev => prev.map(m => messageIds.includes(m.id) ? { ...m, isSeen: true, seenAt: new Date().toISOString() } : m));
    };

    const handleDeleted = ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    };

    sock.on('message:new', handleNew);
    sock.on('message:sent', handleNew);
    sock.on('message:reaction_added', handleReactionAdded);
    sock.on('message:reaction_removed', handleReactionRemoved);
    sock.on('messages:seen', handleSeen);
    sock.on('message:deleted', handleDeleted);

    return () => {
      sock.off('message:new', handleNew);
      sock.off('message:sent', handleNew);
      sock.off('message:reaction_added', handleReactionAdded);
      sock.off('message:reaction_removed', handleReactionRemoved);
      sock.off('messages:seen', handleSeen);
      sock.off('message:deleted', handleDeleted);
    };
  }, [recipientId, socketRef, user.user_id]);

  // ── Optimistic reaction toggle ──────────────────────────────────────────
  const handleReact = useCallback(async (messageId, emoji) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const reactions = m.reactions || [];
      const existing = reactions.find(r => r.emoji === emoji);
      if (existing) {
        return { ...m, reactions: reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, hasReacted: true } : r) };
      }
      return { ...m, reactions: [...reactions, { emoji, count: 1, hasReacted: true }] };
    }));
    try {
      await api.post(`/messages/${messageId}/reactions`, { emoji });
    } catch {
      toast.error('Could not add reaction.');
    }
  }, []);

  const handleUnreact = useCallback(async (messageId, emoji) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const reactions = (m.reactions || [])
        .map(r => r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1), hasReacted: false } : r)
        .filter(r => r.count > 0);
      return { ...m, reactions };
    }));
    try {
      await api.delete(`/messages/${messageId}/reactions`, { data: { emoji } });
    } catch {
      toast.error('Could not remove reaction.');
    }
  }, []);

  const handleDelete = useCallback(async (messageId) => {
    const prevMessages = messages;
    setMessages(prev => prev.filter(m => m.id !== messageId));
    try {
      await api.delete(`/messages/${messageId}`);
    } catch {
      toast.error('Could not delete message.');
      setMessages(prevMessages); // revert on failure
    }
  }, [messages]);

  const handleMessageSent = useCallback((msg) => {
    setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    wasAtBottomRef.current = true;
  }, []);

  const groupedMessages = useMemo(() => groupMessagesByDate(messages), [messages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-line dark:border-gray-800 shrink-0">
        {isMobile && (
          <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-lg text-subtle hover:bg-field dark:hover:bg-gray-800">
            <ArrowLeft size={18} />
          </button>
        )}
        <UserAvatar name={recipientId} />
        <h3 className="text-sm font-bold text-ink dark:text-white">{recipientId}</h3>
      </div>

      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-faint">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-xs">Loading conversation…</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-faint">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <MessageSquareOff size={22} className="text-blue-500" />
            </div>
            <p className="text-xs">No files shared yet. Send one below.</p>
          </div>
        ) : (
          <>
            {groupedMessages.map(group => (
              <div key={group.key}>
                <DateDivider label={group.label} />
                {group.messages.map(msg => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOwn={msg.senderId === user.user_id}
                    onReact={handleReact}
                    onUnreact={handleUnreact}
                    onDelete={handleDelete}
                    onPreview={setPreviewFile}
                    registerRef={registerBubbleRef}
                  />
                ))}
              </div>
            ))}
            <div ref={bottomAnchorRef} />
          </>
        )}
      </div>

      <SendFileBar user={user} recipientId={recipientId} onMessageSent={handleMessageSent} />

      {previewFile && (
        <FilePreviewLightbox file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}