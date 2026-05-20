import axios from 'axios';

const api = axios.create({ baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api` });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('vault_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export const registerUser  = (body) => api.post('/register', body).then(r => r.data);
export const loginUser     = (body) => api.post('/login', body).then(r => r.data);
export const searchUsers   = (q)    => api.get(`/users/search?q=${encodeURIComponent(q)}`).then(r => r.data);
export const getPublicKey  = (uid)  => api.get(`/users/${uid}/pubkey`).then(r => r.data);
export const getConversations = ()  => api.get('/conversations').then(r => r.data);
export const openConversation = (uid) => api.post('/conversations', { participant_b: uid }).then(r => r.data);
export const getMessages   = (cid)  => api.get(`/conversations/${cid}/messages`).then(r => r.data);
