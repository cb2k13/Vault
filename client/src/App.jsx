import { useAuth } from './context/AuthContext';
import AuthPage from './components/Auth/AuthPage';
import ChatPage from './components/Chat/ChatPage';
import { useEffect } from 'react';
import { connectSocket } from './utils/socket';

export default function App() {
  const { user, loading } = useAuth();

  useEffect(() => {
    const token = localStorage.getItem('vault_token');
    if (token && user) connectSocket(token);
  }, [user]);

  if (loading) return <div className="app-loading">🔒</div>;
  return user ? <ChatPage /> : <AuthPage />;
}
