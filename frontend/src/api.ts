import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      window.location.reload(); // Simple redirect to login logic in App
    }
    return Promise.reject(error);
  }
);

export interface FileNode {
  key: string;
  title: string;
  isLeaf: boolean;
  children?: FileNode[];
}

export const getAuthStatus = async () => {
  const response = await api.get<{ requiresAuth: boolean }>('/auth/status');
  return response.data;
};

export const login = async (password: string) => {
  const response = await api.post<{ token: string }>('/auth/login', { password });
  return response.data;
};

export const getFiles = async () => {
  const response = await api.get<FileNode[]>('/files');
  return response.data;
};

export const getFileContent = async (path: string) => {
  const response = await api.get<{ content: string }>('/files/content', { 
    params: { path },
    // Prevent caching
    headers: { 'Cache-Control': 'no-cache' }
  });
  return response.data.content;
};

export const createFile = async (path: string, type: 'file' | 'folder') => {
  await api.post('/files', { path, type });
};

export const updateFile = async (path: string, content: string) => {
  await api.put('/files', { path, content });
};

export const deleteFile = async (path: string) => {
  await api.delete('/files', { params: { path } });
};

export const renameFile = async (oldPath: string, newPath: string) => {
  await api.post('/files/rename', { oldPath, newPath });
};

export const moveFile = async (oldPath: string, newPath: string) => {
  await api.post('/files/move', { oldPath, newPath });
};

export const uploadFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post<{ url: string }>('/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data.url;
};
