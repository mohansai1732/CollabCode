import api from './api';

export const executeCode = async (language, code, stdin = '') => {
  try {
    const response = await api.post('/execute', {
      language,
      code,
      stdin
    });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      return { error: error.response.data.error || error.response.data.message || 'Execution failed' };
    }
    throw error;
  }
};
