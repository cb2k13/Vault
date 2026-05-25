import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { decryptMessage } from '../../utils/crypto';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function Message({ msg, privateKey, userId, showReceipt, isRead, msgReactions, onReact }) {
  const isSender   = msg.sender_id === userId;
  const [text, setText]       = useState(null);
  const [failed, setFailed]   = useState(false);
  const [hovered, setHovered] = useState(false);
  const hideTimer  = useRef(null);

  function handleMouseEnter() {
    clearTimeout(hideTimer.current);
    setHovered(true);
  }
  function handleMouseLeave() {
    hideTimer.current = setTimeout(() => setHovered(false), 200);
  }

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  useEffect(() => {
    if (!privateKey) return;
    decryptMessage(msg, privateKey, isSender)
      .then(setText)
      .catch(() => setFailed(true));
  }, [msg.id, privateKey]);

  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className={`msg-row${isSender ? ' msg-row-self' : ' msg-row-other'}${hovered ? ' msg-row-hovered' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="msg-col">
        {hovered && (
          <div className={`emoji-picker${isSender ? ' emoji-picker-left' : ' emoji-picker-right'}`}>
            {EMOJIS.map(e => (
              <button key={e} className="emoji-btn" onClick={() => onReact(msg.id, e)}>{e}</button>
            ))}
          </div>
        )}

        <div className={`msg-bubble${isSender ? ' msg-bubble-self' : ' msg-bubble-other'}`}>
          {text === null && !failed && <span className="msg-decrypting">🔓 decrypting…</span>}
          {failed && <span className="msg-failed">⚠ decryption failed</span>}
          {text !== null && <span className="msg-text">{text}</span>}
          <span className="msg-time">
            {time}
            {isSender && showReceipt && (
              <span className={`msg-receipt${isRead ? ' msg-receipt-read' : ''}`}>
                {isRead ? ' ✓✓' : ' ✓'}
              </span>
            )}
          </span>
        </div>

        {msgReactions?.size > 0 && (
          <div className={`msg-reactions${isSender ? ' msg-reactions-self' : ''}`}>
            {[...msgReactions.entries()].map(([emoji, users]) => (
              <button
                key={emoji}
                className={`reaction-chip${users.has(userId) ? ' reaction-chip-mine' : ''}`}
                onClick={() => onReact(msg.id, emoji)}
              >
                {emoji}{users.size > 1 && <span className="reaction-count">{users.size}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MessageThread({ messages, privateKey, isRead, reactions, onReact }) {
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

  const lastSentIdx = messages.reduce((acc, msg, i) => msg.sender_id === user.id ? i : acc, -1);

  return (
    <div className="thread-scroll">
      {messages.map((msg, i) => (
        <Message
          key={msg.id}
          msg={msg}
          privateKey={privateKey}
          userId={user.id}
          showReceipt={i === lastSentIdx}
          isRead={isRead}
          msgReactions={reactions.get(msg.id)}
          onReact={onReact}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
