import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function Settings({ onClose }) {
  const { user, signOut } = useAuth();
  const [theme, setTheme] = useState(
    document.documentElement.getAttribute('data-theme') || 'dark'
  );

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('vault-theme', next);
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Appearance</div>
          <div className="settings-row">
            <span>Theme</span>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === 'dark' ? '☀ Light mode' : '☾ Dark mode'}
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-label">Account</div>
          <div className="settings-row">
            <span>Username</span>
            <span className="settings-value">{user?.username}</span>
          </div>
          <div className="settings-row">
            <span>Encryption</span>
            <span className="settings-value settings-value-green">End-to-end</span>
          </div>
        </div>

        <button className="settings-signout" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
}
