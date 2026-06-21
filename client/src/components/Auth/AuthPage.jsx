import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { registerUser, loginUser } from '../../utils/api';
import {
  generateKeyPair, exportPublicKey,
  encryptPrivateKey, decryptPrivateKey, generateSalt,
} from '../../utils/crypto';

export default function AuthPage() {
  const { signIn } = useAuth();
  const [tab, setTab]     = useState('login');
  const [form, setForm]   = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 'register') {
        // Generate key pair
        const { publicKey, privateKey } = await generateKeyPair();
        const publicKeyJwk = await exportPublicKey(publicKey);
        const salt = generateSalt();
        const { encryptedPrivateKey, keyIv } = await encryptPrivateKey(privateKey, form.password, salt);

        const data = await registerUser({
          username: form.username,
          password: form.password,
          public_key: publicKeyJwk,
          encrypted_private_key: encryptedPrivateKey,
          key_iv: keyIv,
          key_salt: salt,
        });
        signIn({ id: data.id, username: data.username }, data.token, privateKey);
      } else {
        const data = await loginUser({ username: form.username, password: form.password });
        // Decrypt private key using password
        const privateKey = await decryptPrivateKey(
          data.encrypted_private_key,
          data.key_iv,
          form.password,
          data.key_salt
        );
        signIn({ id: data.id, username: data.username }, data.token, privateKey);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-title">VAULT</div>
        <div className="auth-subtitle">End-to-end encrypted messaging</div>

        <div className="auth-tabs">
          <button className={`auth-tab${tab === 'login' ? ' active' : ''}`} onClick={() => { setTab('login'); setError(''); }}>Login</button>
          <button className={`auth-tab${tab === 'register' ? ' active' : ''}`} onClick={() => { setTab('register'); setError(''); }}>Register</button>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" name="username" value={form.username} onChange={update} placeholder="Enter username" autoComplete="username" required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" name="password" value={form.password} onChange={update} placeholder="Enter password" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading
              ? (tab === 'register' ? 'Generating keys…' : 'Decrypting…')
              : (tab === 'login' ? 'UNLOCK' : 'CREATE VAULT')}
          </button>
        </form>

        <div className="auth-notice">
          <span className="lock-icon"></span>
          Your private key never leaves your personal device. Messages are fully encrypted. 
        </div>
      </div>
    </div>
  );
}
