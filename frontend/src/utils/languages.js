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
    id: 'cpp14',
    label: 'C++ 14',
    ext: 'cpp',
  },
  {
    id: 'cpplatest',
    label: 'C++ 20',
    ext: 'cpp',
  },
  {
    id: 'java11',
    label: 'Java 11',
    ext: 'java',
  },
  {
    id: 'javalatest',
    label: 'Java 21',
    ext: 'java',
  }
];

export function getLanguageOption(monacoId) {
  return LANGUAGE_OPTIONS.find(({ id }) => id === monacoId) ?? LANGUAGE_OPTIONS[0];
}