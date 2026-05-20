import { useState } from 'react';

export default function MessageInput({ onSend, disabled }) {
  const [text, setText] = useState('');

  function handleSend() {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
  }

  return (
    <div className="msg-input-bar">
      <input
        className="msg-input"
        placeholder="Message (encrypted before sending)…"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
        disabled={disabled}
      />
      <button className="msg-send-btn" onClick={handleSend} disabled={disabled || !text.trim()}>
        Send
      </button>
    </div>
  );
}
