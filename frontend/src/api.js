const API_URL = import.meta.env.VITE_API_URL || '/api';

// Fonte única da chave do token — antes App.jsx e api.js tinham cada um a
// sua própria constante e desalinharam quando o app foi renomeado.
export const TOKEN_KEY = 'truecine_token';

function buildQuery(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else qs.append(key, value);
  });
  return qs.toString();
}

async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

export const api = {
  getGenres: () => request('/movies/genres'),
  getProviderList: () => request('/movies/providers'),
  getMovies: (params = {}) => request(`/movies?${buildQuery(params)}`),
  drawRandom: (count, params = {}) => request(`/movies?${buildQuery({ ...params, random: true, count })}`),
  getMovie: (id) => request(`/movies/${id}`),
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),
  updateProfile: (body) => request('/auth/me', { method: 'PUT', body: JSON.stringify(body) }),
  getRecommendationCandidates: () => request('/recommendations?limit=150&negativeSampleSize=60'),
  sendFeedback: (movieId, rating) => request('/feedback', { method: 'POST', body: JSON.stringify({ movieId, rating }) }),
  getComments: (movieId) => request(`/movies/${movieId}/comments`),
  postComment: (movieId, text) => request(`/movies/${movieId}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
  deleteComment: (movieId, commentId) => request(`/movies/${movieId}/comments/${commentId}`, { method: 'DELETE' }),
  getProviders: (movieId, region) => request(`/movies/${movieId}/providers?${buildQuery({ region })}`),
  toggleFavorite: (movieId) => request('/auth/favorite', { method: 'POST', body: JSON.stringify({ movieId }) }),
  getExtras: (movieId) => request(`/movies/${movieId}/extras`),
  getSimilar: (movieId) => request(`/movies/${movieId}/similar`),
  getFavoritesRanking: (type, limit) => request(`/ranking/favorites?${buildQuery({ type, limit })}`),
};
