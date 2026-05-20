import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { decryptMessage } from '../../utils/crypto';

function Message({ msg, privateKey, userId }) {
  const isSender = msg.sender_id === userId;
  const [text, setText]     = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!privateKey) return;
    decryptMessage(msg, privateKey, isSender)
      .then(setText)
      .catch(() => setFailed(true));
  }, [msg.id, privateKey]);

  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`msg-row${isSender ? ' msg-row-self' : ' msg-row-other'}`}>
      <div className={`msg-bubble${isSender ? ' msg-bubble-self' : ' msg-bubble-other'}`}>
        {text === null && !failed && <span className="msg-decrypting">🔓 decrypting…</span>}
        {failed && <span className="msg-failed">⚠ decryption failed</span>}
        {text !== null && <span className="msg-text">{text}</span>}
        <span className="msg-time">{time}</span>
      </div>
    </div>
  );
}

export default function MessageThread({ messages, privateKey }) {
  const { user } = useAuth();
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!messages.length) {
    return (
      <div className="thread-empty">
        <div className="thread-empty-icon">🔒</div>
        <div className="thread-empty-text">No messages yet. Say hello — it'll be encrypted.</div>
      </div>
    );
  }

  return (
    <div className="thread-scroll">
      {messages.map(msg => (
        <Message key={msg.id} msg={msg} privateKey={privateKey} userId={user.id} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
