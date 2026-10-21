const EXT: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript',
  json: 'json', jsonc: 'json', css: 'css', scss: 'css', less: 'css',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', kts: 'kotlin',
  swift: 'swift', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp',
  php: 'php', sql: 'sql', yml: 'yaml', yaml: 'yaml', md: 'markdown', markdown: 'markdown',
  diff: 'diff', patch: 'diff', ini: 'ini', toml: 'ini', conf: 'ini',
  dockerfile: 'dockerfile', makefile: 'bash',
};

export function languageFromPath(path: string): string {
  const base = path.split('/').pop()?.toLowerCase() || '';
  if (base === 'dockerfile') return 'dockerfile';
  if (base.startsWith('makefile')) return 'bash';
  const ext = base.includes('.') ? base.split('.').pop() || '' : '';
  return EXT[ext] || 'text';
}
