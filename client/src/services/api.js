import axios from 'axios';

const rawApiUrl = import.meta.env.VITE_API_URL;
const normalizeBaseUrl = (url) => {
  if (!url) return '/api';
  const trimmed = url.trim().replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

export const API_BASE_URL = normalizeBaseUrl(rawApiUrl);
export const SSE_URL = `${API_BASE_URL}/sse`;

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT token from localStorage if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('raceproof_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle 401 unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If unauthenticated, clear token
      const isAuthEndpoint = error.config.url?.includes('/auth/login') || error.config.url?.includes('/auth/register');
      if (!isAuthEndpoint) {
        localStorage.removeItem('raceproof_token');
        localStorage.removeItem('raceproof_user');
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.patch('/auth/me', data),
};

export const hackathonsAPI = {
  getAll: () => api.get('/hackathons'),
  getById: (id) => api.get(`/hackathons/${id}`),
};

export const teamsAPI = {
  create: (data) => api.post('/teams', data),
  getAll: (params) => api.get('/teams', { params }),
  getById: (id) => api.get(`/teams/${id}`),
  update: (id, data) => api.patch(`/teams/${id}`, data),
  disband: (id) => api.delete(`/teams/${id}`),
  getMembers: (id) => api.get(`/teams/${id}/members`),
  removeMember: (teamId, userId) => api.delete(`/teams/${teamId}/members/${userId}`),
  leave: (teamId) => api.post(`/teams/${teamId}/leave`),
  transferLeadership: (teamId, newLeaderId) => api.post(`/teams/${teamId}/transfer-leadership`, { newLeaderId }),
  getAuditLogs: (teamId) => api.get(`/teams/${teamId}/audit-logs`),
  createInvite: (teamId, expiresInHours) => api.post(`/teams/${teamId}/invites`, { expiresInHours }),
  getSuggestions: (teamId, limit = 10) => api.get(`/teams/${teamId}/suggestions`, { params: { limit } }),
};

export const requestsAPI = {
  create: (teamId, message) => api.post(`/teams/${teamId}/requests`, { message }),
  getTeamRequests: (teamId) => api.get(`/teams/${teamId}/requests`),
  getMyRequests: () => api.get('/requests/my'),
  accept: (requestId) => api.patch(`/requests/${requestId}/accept`),
  decline: (requestId) => api.patch(`/requests/${requestId}/decline`),
  cancel: (requestId) => api.delete(`/requests/${requestId}`),
};

export const invitesAPI = {
  get: (token) => api.get(`/invites/${token}`),
  accept: (token) => api.post(`/invites/${token}/accept`),
};

export const demoAPI = {
  runConcurrencyBenchmark: () => api.post('/demo/concurrency-benchmark'),
};

export default api;

