import { useState } from 'react';
import { searchUsers, openConversation } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar({ conversations, activeId, onSelect, onNewConversation }) {
  const { user, signOut } = useAuth();
  const [query, setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function handleSearch(e) {
    const q = e.target.value;
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const data = await searchUsers(q.trim());
      setResults(data.filter(u => u.id !== user.id));
    } catch { setResults([]); }
    finally { setSearching(false); }
  }

  async function startChat(targetUser) {
    try {
      const conv = await openConversation(targetUser.id);
      setQuery('');
      setResults([]);
      onNewConversation(conv);
      onSelect(conv);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">🔒 Vault</div>
        <div className="sidebar-user">
          <span className="sidebar-username">{user?.username}</span>
          <button className="btn-signout" onClick={signOut} title="Sign out">⎋</button>
        </div>
      </div>

      <div className="sidebar-search">
        <input
          className="search-input"
          placeholder="Search users…"
          value={query}
          onChange={handleSearch}
        />
        {results.length > 0 && (
          <div className="search-results">
            {results.map(u => (
              <button key={u.id} className="search-result-item" onClick={() => startChat(u)}>
                <span className="result-avatar">👤</span>
                <span className="result-name">{u.username}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="conv-list">
        {conversations.length === 0 && (
          <div className="conv-empty">Search for a user above to start a conversation</div>
        )}
        {conversations.map(conv => {
          const other = conv.other_user;
          return (
            <button
              key={conv.id}
              className={`conv-item${conv.id === activeId ? ' active' : ''}`}
              onClick={() => onSelect(conv)}
            >
              <div className="conv-avatar">👤</div>
              <div className="conv-info">
                <div className="conv-name">{other?.username}</div>
                <div className="conv-preview">🔒 encrypted</div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
