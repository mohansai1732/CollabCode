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
  }
];

export function getLanguageOption(monacoId) {
  return LANGUAGE_OPTIONS.find(({ id }) => id === monacoId) ?? LANGUAGE_OPTIONS[0];
}