import api from './api';

export const executeCode = async ({ roomId, language, code, stdin = '', broadcast = false }) => {
  const response = await api.post('/execute', {
    roomId,
    language,
    code,
    stdin,
    broadcast,
  });
  return response.data;
};
