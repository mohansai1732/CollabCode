import api from './api';

export async function fetchFiles(roomId) {
  const { data } = await api.get('/files', { params: { roomId } });
  return data.files || [];
}

export async function createFile(payload) {
  const { data } = await api.post('/files', payload);
  return data.file;
}

export async function updateFile(id, roomId, payload) {
  const { data } = await api.put(`/files/${id}`, { ...payload, roomId });
  return data.file;
}

export async function deleteFile(id, roomId) {
  const { data } = await api.delete(`/files/${id}`, { params: { roomId } });
  return data;
}

export default {
  fetchFiles,
  createFile,
  updateFile,
  deleteFile,
};
