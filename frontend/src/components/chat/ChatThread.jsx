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
  const loadedRecipientRef = useRef(null); // guards against duplicate fetch

  // ── Helper to sort messages chronologically (Oldest -> Newest) ────────
  const sortMessagesChronologically = (msgs) => {
    return [...msgs].sort((a, b) => {
      const timeA = new Date(a.createdAt || a.upload_timestamp || a.timestamp || 0).getTime();
      const timeB = new Date(b.createdAt || b.upload_timestamp || b.timestamp || 0).getTime();
      return timeA - timeB; // Oldest at top (index 0), Newest at bottom
    });
  };

  // ── Scroll to Bottom Helper ──────────────────────────────────────────
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    bottomAnchorRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  // ── Load conversation history ─────────────────────────────────────────
  useEffect(() => {
    if (!recipientId || loadedRecipientRef.current === recipientId) return;
    loadedRecipientRef.current = recipientId;

    let cancelled = false;
    setLoading(true);

    api.get(`/messages/conversation/${recipientId}`, { params: { page: 1, limit: 50 } })
      .then(res => {
        if (cancelled) return;
        const rawMessages = res.data.data || [];
        
        // Sort chronologically (earliest to latest)
        const sorted = sortMessagesChronologically(rawMessages);
        setMessages(sorted);

        // Scroll to the bottom when history loads
        setTimeout(() => {
          scrollToBottom('auto');
        }, 50);
      })
      .catch(err => {
        console.error('Failed to load conversation:', err);
        if (!cancelled) toast.error('Could not load this conversation.');
      })
      .finally(() => { 
        if (!cancelled) setLoading(false); 
      });

    return () => { cancelled = true; };
  }, [recipientId, scrollToBottom]);

  // Reset guard when navigating to a different recipient
  useEffect(() => {
    return () => { 
      if (loadedRecipientRef.current !== recipientId) loadedRecipientRef.current = null; 
    };
  }, [recipientId]);

  // ── Auto-scroll setup ─────────────────────────────────────────────────
  const checkIfAtBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  useEffect(() => {
    if (wasAtBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [messages, scrollToBottom]);

  const handleScroll = useCallback(() => {
    wasAtBottomRef.current = checkIfAtBottom();
  }, [checkIfAtBottom]);

  // ── Seen-on-visibility ────────────────────────────────────────────────
  const flushSeen = useCallback(() => {
    const ids = Array.from(pendingSeenRef.current);
    if (ids.length === 0) return;
    pendingSeenRef.current.clear();
    api.patch('/messages/seen', { messageIds: ids, senderId: recipientId }).catch(() => {});
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

  useEffect(() => {
    messages.forEach(m => {
      if (m.senderId === recipientId && !m.isSeen) {
        const node = bubbleNodesRef.current.get(m.id);
        if (node) observerRef.current?.observe(node);
      }
    });
  }, [messages, recipientId]);

  // ── Real-time Socket wiring ────────────────────────────────────────────
  useEffect(() => {
    const sock = socketRef.current;
    if (!sock) return;

    const belongsHere = (msg) => msg.senderId === recipientId || msg.recipientId === recipientId;

    const handleNew = (msg) => {
      if (!belongsHere(msg)) return;
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        // Append new message at the bottom
        return sortMessagesChronologically([...prev, msg]);
      });
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
      if (seenBy !== recipientId) return;
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

  // ── Reaction Handlers ──────────────────────────────────────────────────
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
      setMessages(prevMessages);
    }
  }, [messages]);

  // Handle local outgoing message push
  const handleMessageSent = useCallback((msg) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      return sortMessagesChronologically([...prev, msg]);
    });
    wasAtBottomRef.current = true;
    setTimeout(() => scrollToBottom('smooth'), 50);
  }, [scrollToBottom]);

  const groupedMessages = useMemo(() => groupMessagesByDate(messages), [messages]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-line dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900 z-10">
        {isMobile && (
          <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-lg text-subtle hover:bg-field dark:hover:bg-gray-800">
            <ArrowLeft size={18} />
          </button>
        )}
        <UserAvatar name={recipientId} />
        <h3 className="text-sm font-bold text-ink dark:text-white">{recipientId}</h3>
      </div>

      {/* Messages Scroll Body */}
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
          <div className="flex flex-col justify-end min-h-full">
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
            <div ref={bottomAnchorRef} className="h-1 w-full shrink-0" />
          </div>
        )}
      </div>

      {/* Bottom Send Bar */}
      <div className="shrink-0">
        <SendFileBar user={user} recipientId={recipientId} onMessageSent={handleMessageSent} />
      </div>

      {previewFile && (
        <FilePreviewLightbox file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}