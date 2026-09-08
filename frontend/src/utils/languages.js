/** Monaco editor language id and templates */
export const LANGUAGE_OPTIONS = [
  {
    id: 'javascript',
    label: 'JavaScript',
    ext: 'js',
    template: `// JavaScript (Node.js)
console.log("Hello from JavaScript!");
`,
  },
  {
    id: 'python',
    label: 'Python',
    ext: 'py',
    template: `# Python 3
print("Hello from Python!")
`,
  },
  {
    id: 'c',
    label: 'C (GCC)',
    ext: 'c',
    template: `#include <stdio.h>

int main() {
    printf("Hello from C!\\n");
    return 0;
}
`,
  },
  {
    id: 'cpp',
    label: 'C++ (G++)',
    ext: 'cpp',
    template: `#include <iostream>

int main() {
    std::cout << "Hello from C++!" << std::endl;
    return 0;
}
`,
  },
  {
    id: 'java',
    label: 'Java (OpenJDK)',
    ext: 'java',
    template: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Java!");
    }
}
`,
  },
];

export function getLanguageOption(monacoId) {
  return LANGUAGE_OPTIONS.find(({ id }) => id === monacoId) ?? LANGUAGE_OPTIONS[0];
}

export function getLanguageBoilerplate(langId) {
  const option = LANGUAGE_OPTIONS.find(({ id }) => id === langId);
  return option?.template || '';
}