'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const roots = ['scripts', 'source/js', 'tools'];

function collectJavaScript(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScript(fullPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

const files = roots.flatMap(directory => collectJavaScript(path.join(root, directory)));
files.push(path.join(root, 'auto_cover.js'));

for (const file of files) {
  const relativePath = path.relative(root, file).replace(/\\/g, '/');
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: relativePath });
}

console.log(`JavaScript syntax check passed for ${files.length} files.`);
