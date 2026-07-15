'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
}

const posts = git(['ls-files', 'source/_posts/*.md', 'source/_posts/**/*.md'])
  .split(/\r?\n/)
  .filter(Boolean);

let updated = 0;

for (const post of posts) {
  const timestamp = git(['log', '-1', '--format=%cI', '--', post]);
  const date = new Date(timestamp);
  if (!timestamp || Number.isNaN(date.getTime())) continue;

  const fullPath = path.join(root, post);
  const stat = fs.statSync(fullPath);
  fs.utimesSync(fullPath, stat.atime, date);
  updated += 1;
}

console.log(`Restored Git update times for ${updated} posts.`);
