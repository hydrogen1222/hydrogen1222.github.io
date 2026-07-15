'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readExplicitUpdated(content) {
  const frontMatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/);
  if (!frontMatter) return null;

  const updated = frontMatter[1].match(/^updated:\s*['"]?(.+?)['"]?\s*$/m);
  return updated ? toDate(updated[1]) : null;
}

function readLastGitUpdate(relativePath) {
  try {
    const timestamp = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', relativePath],
      { cwd: hexo.base_dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    return toDate(timestamp);
  } catch (_) {
    return null;
  }
}

hexo.extend.filter.register('before_generate', () => {
  const posts = hexo.locals.get('posts');
  if (!posts) return;

  posts.forEach(post => {
    if (!post || !post.source) return;

    const normalizedSource = String(post.source).replace(/\\/g, '/');
    if (!/(^|\/)_posts\//.test(normalizedSource)) return;

    const fullPath = path.join(hexo.source_dir, normalizedSource);
    if (!fs.existsSync(fullPath)) return;

    const content = fs.readFileSync(fullPath, 'utf8');
    const relativePath = path.relative(hexo.base_dir, fullPath).replace(/\\/g, '/');
    const updated = readExplicitUpdated(content)
      || readLastGitUpdate(relativePath)
      || toDate(post.date)
      || new Date();

    post.updated = updated;
  });
});
