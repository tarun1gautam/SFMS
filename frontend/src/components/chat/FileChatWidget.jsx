import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import api from '../../utils/api';
import useFileChatSocket from '../../hooks/useFileChatSocket';
import ConversationList from './ConversationList';
import ChatThread from './ChatThread';
import NewConversationModal from './NewConversationModal';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
}

export default function FileChatWidget({ user }) {
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [activeUserId, setActiveUserId] = useState(null);
  const [isNewConvoOpen, setIsNewConvoOpen] = useState(false);
  const isMobile = useIsMobile();

  const fetchInFlightRef = useRef(false);

  const fetchConversations = useCallback(async () => {
    // Prevents overlapping fetches if multiple socket events fire in a burst
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const res = await api.get('/messages/conversations/recent');
      setConversations(res.data?.data || []);
    } catch (err) {
      console.error('Failed to fetch recent conversations:', err);
    } finally {
      setConversationsLoading(false);
      fetchInFlightRef.current = false;
    }
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // Bump a conversation to the top locally (instant feedback), then
  // reconcile with the server shortly after — avoids visible flicker while
  // still staying eventually-consistent with real unread counts/previews.
  const bumpConversation = useCallback((partnerId, patch = {}) => {
    setConversations(prev => {
      const idx = prev.findIndex(c => (c.partner?.userId || c.userId || c.user_id) === partnerId);
      if (idx === -1) return prev;
      const updated = { ...prev[idx], ...patch, lastActivityTimestamp: new Date().toISOString() };
      const rest = prev.filter((_, i) => i !== idx);
      return [updated, ...rest];
    });
  }, []);

  const socketRef = useFileChatSocket({
    onNewMessage: (msg) => {
      const partnerId = msg.senderId === user.user_id ? msg.recipientId : msg.senderId;
      bumpConversation(partnerId, {
        lastMessage: { file: msg.file },
        unreadCount: partnerId === activeUserId ? 0 : undefined, // let server value win if we don't know better
      });
      fetchConversations();
    },
    onSent: () => fetchConversations(),
  });

  const handleSelectNewUser = (selectedUserId) => {
    setActiveUserId(selectedUserId);
    if (!conversations.some(c => (c.partner?.userId || c.userId || c.user_id) === selectedUserId)) {
      setConversations(prev => [
        {
          partner: { userId: selectedUserId },
          lastMessage: null,
          unreadCount: 0,
          lastActivityTimestamp: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
  };

  const handleSelectConversation = (partnerId) => {
    setActiveUserId(partnerId);
    // Clear the unread badge locally the instant it's opened — ChatThread's
    // own seen-on-visibility flow will confirm this with the server.
    setConversations(prev => prev.map(c =>
      (c.partner?.userId || c.userId || c.user_id) === partnerId ? { ...c, unreadCount: 0 } : c
    ));
  };

  const showList = !isMobile || !activeUserId;
  const showThread = !isMobile || !!activeUserId;

  return (
    <div className="bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 rounded-2xl overflow-hidden h-[calc(100vh-210px)] min-h-[550px] shadow-xl flex">
      {showList && (
        <div className={`${isMobile ? 'w-full' : 'w-80 shrink-0'} h-full`}>
          <ConversationList
            conversations={conversations}
            activeId={activeUserId}
            onSelect={handleSelectConversation}
            onNewConversation={() => setIsNewConvoOpen(true)}
            loading={conversationsLoading}
          />
        </div>
      )}

      {showThread && (
        <div className="flex-1 h-full min-w-0">
          {activeUserId ? (
            <ChatThread
              user={user}
              recipientId={activeUserId}
              socketRef={socketRef}
              onBack={() => setActiveUserId(null)}
              isMobile={isMobile}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-faint">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shadow-inner">
                <MessageSquare size={28} />
              </div>
              <p className="text-xs font-medium">Select a conversation or start a new file transfer</p>
            </div>
          )}
        </div>
      )}

      <NewConversationModal
        isOpen={isNewConvoOpen}
        onClose={() => setIsNewConvoOpen(false)}
        onSelectUser={handleSelectNewUser}
      />
    </div>
  );
}