'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
let html = read('src/editor.html');
const licenses = [read('LICENSE'), read('vendor/LICENSE-marked.md')].join('\n\n');
html = html.replace('<!doctype html>', () => '<!doctype html>\n<!--\n' + licenses.replace(/--/g, '- -') + '\n-->');
html = html.replace('/*__MARKED__*/', () => read('vendor/marked.cjs'))
  .replace('/*__CORE__*/', () => 'globalThis.ResumeReferenceCSS='+JSON.stringify(read('src/reference.css'))+';\n'+read('src/core.cjs'))
  .replace('/*__SAMPLE__*/', () => JSON.stringify(read('examples/sample.md')).replace(/</g, '\\u003c'));
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('已生成离线编辑器：index.html');
