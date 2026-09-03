export function sanitizeRendererRuntimeDependency(source) {
  if (typeof source !== 'string') {
    throw new TypeError('Renderer runtime dependency source must be a string.');
  }

  return source
    .replace(/Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*/g, '')
    // [2026-09-03] `export { X } from './y.js'` 는 tsc 가 `var y_js_2 = require(...)` + getter 로 낸다. 단일 스코프엔 exports 가 없다 — 지운다(y 는 어차피 인라인).
    .replace(/^\s*Object\.defineProperty\(exports, "[A-Za-z0-9_$]+", \{ enumerable: true, get: function \(\) \{ return [^;]+; \} \}\);\s*$/gm, '')
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
    .replace(/(?:const|var|let)\s+\w+\s*=\s*require\([^)]+\);\s*/g, '')
    .replace(/\(0,\s*(\w+)_js_\d+\.(\w+)\)/g, '$2')
    .replace(/(\w+)_js_\d+\.(\w+)/g, '$2')
    .replace(/(\w+)_js_\d+\[["'](\w+)["']\]/g, '$2');
}
