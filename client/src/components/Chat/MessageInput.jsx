import { useState, useRef, useEffect } from 'react';

export default function MessageInput({ onSend, disabled, onTypingStart, onTypingStop }) {
  const [text, setText] = useState('');
  const isTypingRef = useRef(false);
  const timerRef    = useRef(null);

  function stopTyping() {
    clearTimeout(timerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTypingStop?.();
    }
  }

  function handleChange(e) {
    const val = e.target.value;
    setText(val);

    if (val.trim()) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        onTypingStart?.();
      }
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(stopTyping, 2000);
    } else {
      stopTyping();
    }
  }

  function handleSend() {
    if (!text.trim() || disabled) return;
    stopTyping();
    onSend(text.trim());
    setText('');
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className="msg-input-bar">
      <input
        className="msg-input"
        placeholder="Message (encrypted before sending)…"
        value={text}
        onChange={handleChange}
        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
        disabled={disabled}
      />
      <button className="msg-send-btn" onClick={handleSend} disabled={disabled || !text.trim()}>
        Send
      </button>
    </div>
  );
}
