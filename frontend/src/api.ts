import axios from 'axios';

const api = axios.create({
  baseURL: '/api/files',
});

export interface FileNode {
  key: string;
  title: string;
  isLeaf: boolean;
  children?: FileNode[];
}

export const getFiles = async () => {
  const response = await api.get<FileNode[]>('/');
  return response.data;
};

export const getFileContent = async (path: string) => {
  const response = await api.get<{ content: string }>('/content', { 
    params: { path },
    // Prevent caching
    headers: { 'Cache-Control': 'no-cache' }
  });
  return response.data.content;
};

export const createFile = async (path: string, type: 'file' | 'folder') => {
  await api.post('/', { path, type });
};

export const updateFile = async (path: string, content: string) => {
  await api.put('/', { path, content });
};

export const deleteFile = async (path: string) => {
  await api.delete('/', { params: { path } });
};

export const renameFile = async (oldPath: string, newPath: string) => {
  await api.post('/rename', { oldPath, newPath });
};

export const moveFile = async (oldPath: string, newPath: string) => {
  await api.post('/move', { oldPath, newPath });
};

export const uploadFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post<{ url: string }>('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data.url;
};
