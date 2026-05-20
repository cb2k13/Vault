import { createContext, useContext, useState, useEffect } from 'react';
import { connectSocket, disconnectSocket } from '../utils/socket';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null);
  const [privateKey, setPrivateKey] = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('vault_user');
    if (stored) setUser(JSON.parse(stored));
    setLoading(false);
  }, []);

  function signIn(userData, token, privKey) {
    localStorage.setItem('vault_token', token);
    localStorage.setItem('vault_user', JSON.stringify(userData));
    setUser(userData);
    setPrivateKey(privKey);
    connectSocket(token);
  }

  function signOut() {
    localStorage.removeItem('vault_token');
    localStorage.removeItem('vault_user');
    setUser(null);
    setPrivateKey(null);
    disconnectSocket();
  }

  return (
    <Ctx.Provider value={{ user, privateKey, loading, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
