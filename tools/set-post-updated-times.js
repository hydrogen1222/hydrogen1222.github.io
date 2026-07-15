'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const postsRoot = path.join(root, 'source', '_posts');

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
}

function findMarkdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findMarkdownFiles(fullPath);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [fullPath] : [];
  });
}

const posts = findMarkdownFiles(postsRoot);

let updated = 0;

for (const post of posts) {
  const relativePath = path.relative(root, post).replace(/\\/g, '/');
  const timestamp = git(['log', '-1', '--format=%cI', '--', relativePath]);
  const date = new Date(timestamp);
  if (!timestamp || Number.isNaN(date.getTime())) continue;

  const stat = fs.statSync(post);
  fs.utimesSync(post, stat.atime, date);
  updated += 1;
}

console.log(`Restored Git update times for ${updated} posts.`);
