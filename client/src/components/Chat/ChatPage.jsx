import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../utils/socket';
import { getConversations, getMessages, getPublicKey } from '../../utils/api';
import { encryptMessage, importPublicKey } from '../../utils/crypto';
import Sidebar from './Sidebar';
import MessageThread from './MessageThread';
import MessageInput from './MessageInput';

export default function ChatPage() {
  const { user, privateKey } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv]       = useState(null);
  const [messages, setMessages]           = useState([]);
  const [sending, setSending]             = useState(false);
  const [onlineUsers, setOnlineUsers]     = useState(new Set());
  const [typingConvIds, setTypingConvIds] = useState(new Set());

  // Presence + typing socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const typingTimers = new Map();

    function onOnlineUsers(ids) { setOnlineUsers(new Set(ids)); }
    function onUserOnline(id)   { setOnlineUsers(prev => new Set([...prev, id])); }
    function onUserOffline(id)  { setOnlineUsers(prev => { const s = new Set(prev); s.delete(id); return s; }); }

    function onTypingStart({ conversation_id }) {
      setTypingConvIds(prev => new Set([...prev, conversation_id]));
      clearTimeout(typingTimers.get(conversation_id));
      typingTimers.set(conversation_id, setTimeout(() => {
        setTypingConvIds(prev => { const s = new Set(prev); s.delete(conversation_id); return s; });
      }, 3000));
    }
    function onTypingStop({ conversation_id }) {
      clearTimeout(typingTimers.get(conversation_id));
      typingTimers.delete(conversation_id);
      setTypingConvIds(prev => { const s = new Set(prev); s.delete(conversation_id); return s; });
    }

    socket.on('online_users', onOnlineUsers);
    socket.on('user_online',  onUserOnline);
    socket.on('user_offline', onUserOffline);
    socket.on('typing_start', onTypingStart);
    socket.on('typing_stop',  onTypingStop);

    return () => {
      socket.off('online_users', onOnlineUsers);
      socket.off('user_online',  onUserOnline);
      socket.off('user_offline', onUserOffline);
      socket.off('typing_start', onTypingStart);
      socket.off('typing_stop',  onTypingStop);
      typingTimers.forEach(t => clearTimeout(t));
    };
  }, []);

  // Load conversations on mount
  useEffect(() => {
    getConversations().then(setConversations).catch(console.error);
  }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConv) return;
    setMessages([]);
    getMessages(activeConv.id).then(setMessages).catch(console.error);
  }, [activeConv?.id]);

  // Socket: receive incoming messages
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function onNewMessage(msg) {
      if (msg.conversation_id === activeConv?.id) {
        setMessages(prev => [...prev, msg]);
      }
    }

    socket.on('new_message', onNewMessage);
    return () => socket.off('new_message', onNewMessage);
  }, [activeConv?.id]);

  const handleSend = useCallback(async (plaintext) => {
    if (!activeConv || !privateKey || sending) return;
    setSending(true);
    try {
      const otherId = activeConv.other_user.id;

      // Fetch recipient's public key and our own
      const [recipientKeyData, senderKeyData] = await Promise.all([
        getPublicKey(otherId),
        getPublicKey(user.id),
      ]);

      const [recipientPubKey, senderPubKey] = await Promise.all([
        importPublicKey(recipientKeyData.public_key),
        importPublicKey(senderKeyData.public_key),
      ]);

      const payload = await encryptMessage(plaintext, recipientPubKey, senderPubKey);

      const socket = getSocket();
      socket.emit('send_message', {
        conversation_id: activeConv.id,
        recipient_id: otherId,
        ...payload,
      });
    } catch (err) {
      console.error('Send failed:', err);
    } finally {
      setSending(false);
    }
  }, [activeConv, privateKey, user, sending]);

  // When server echoes back the saved message, add it to thread
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function onMessageSent(msg) {
      if (msg.conversation_id === activeConv?.id) {
        setMessages(prev => [...prev, msg]);
      }
    }

    socket.on('message_sent', onMessageSent);
    return () => socket.off('message_sent', onMessageSent);
  }, [activeConv?.id]);

  const handleTypingStart = useCallback(() => {
    if (!activeConv) return;
    getSocket()?.emit('typing_start', {
      conversation_id: activeConv.id,
      recipient_id: activeConv.other_user.id,
    });
  }, [activeConv]);

  const handleTypingStop = useCallback(() => {
    if (!activeConv) return;
    getSocket()?.emit('typing_stop', {
      conversation_id: activeConv.id,
      recipient_id: activeConv.other_user.id,
    });
  }, [activeConv]);

  function handleNewConversation(conv) {
    setConversations(prev => {
      if (prev.find(c => c.id === conv.id)) return prev;
      return [conv, ...prev];
    });
  }

  return (
    <div className="chat-layout">
      <Sidebar
        conversations={conversations}
        activeId={activeConv?.id}
        onSelect={setActiveConv}
        onNewConversation={handleNewConversation}
        onlineUsers={onlineUsers}
      />

      <main className="chat-main">
        {!activeConv ? (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">🔒</div>
            <div className="chat-welcome-title">Vault</div>
            <div className="chat-welcome-sub">Select a conversation or search for someone to message.</div>
            <div className="chat-welcome-badge">All messages are end-to-end encrypted</div>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <div className="chat-header-avatar-wrap">
                <div className="chat-header-avatar">👤</div>
                {onlineUsers.has(activeConv.other_user?.id) && <span className="presence-dot presence-dot-lg" />}
              </div>
              <div className="chat-header-info">
                <div className="chat-header-name">{activeConv.other_user?.username}</div>
                <div className={`chat-header-status${typingConvIds.has(activeConv.id) ? ' chat-header-typing' : ''}`}>
                  {typingConvIds.has(activeConv.id)
                    ? 'typing…'
                    : onlineUsers.has(activeConv.other_user?.id)
                      ? 'Online · 🔒 encrypted'
                      : '🔒 End-to-end encrypted'}
                </div>
              </div>
            </div>

            <MessageThread messages={messages} privateKey={privateKey} />

            <MessageInput
              onSend={handleSend}
              disabled={sending || !privateKey}
              onTypingStart={handleTypingStart}
              onTypingStop={handleTypingStop}
            />
          </>
        )}
      </main>
    </div>
  );
}
