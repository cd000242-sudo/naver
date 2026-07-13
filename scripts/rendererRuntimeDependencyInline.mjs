export function sanitizeRendererRuntimeDependency(source) {
  if (typeof source !== 'string') {
    throw new TypeError('Renderer runtime dependency source must be a string.');
  }

  return source
    .replace(/Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*/g, '')
    .replace(/^exports\.\w+\s*(=\s*exports\.\w+\s*)*=\s*void\s+0;\s*$/gm, '')
    .replace(/exports\.(\w+)\s*=\s*void\s+0;\s*/g, '')
    .replace(/exports\.(\w+)\s*=\s*\1;/g, '')
    .replace(/^([ \t]*)exports\.(\w+)\s*=\s*(\{|\[|function|class|new\s)/gm, '$1const $2 = $3')
    .replace(/^([ \t]*)exports\.(\w+)\s*=\s*([^;=]+);/gm, (match, indent, name, value) => {
      if (value.trim() === name || value.includes('exports.')) return '';
      return `${indent}const ${name} = ${value};`;
    })
    .replace(/exports\.default\s*=/g, '// exports.default =')
    .replace(/module\.exports\s*=/g, '// module.exports =')
    .replace(/exports\.(\w+)/g, '$1')
    .replace(/const\s+\{[^}]+\}\s*=\s*require\([^)]+\);\s*/g, '')
    .replace(/const\s+\w+\s*=\s*require\([^)]+\);\s*/g, '')
    .replace(/\(0,\s*(\w+)_js_1\.(\w+)\)/g, '$2')
    .replace(/(\w+)_js_1\.(\w+)/g, '$2')
    .replace(/(\w+)_js_1\[["'](\w+)["']\]/g, '$2');
}
