/** Monaco editor language id */
export const LANGUAGE_OPTIONS = [
  {
    id: 'javascript',
    label: 'JavaScript',
    ext: 'js',
  },
  {
    id: 'python',
    label: 'Python',
    ext: 'py',
  },
  {
    id: 'cpp',
    label: 'C++',
    ext: 'cpp',
  },
  {
    id: 'java',
    label: 'Java',
    ext: 'java',
  }
];

export function getLanguageOption(monacoId) {
  return LANGUAGE_OPTIONS.find(({ id }) => id === monacoId) ?? LANGUAGE_OPTIONS[0];
}