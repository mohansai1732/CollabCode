

export function createFileModel({ roomId, filename, language = 'javascript', content = '' }) {
  const now = new Date().toISOString();
  return {
    roomId: String(roomId || '').trim(),
    filename: String(filename || '').trim(),
    language: String(language || 'javascript').toLowerCase(),
    content: String(content || ''),
    createdAt: now,
    updatedAt: now,
  };
}

export default { createFileModel };
