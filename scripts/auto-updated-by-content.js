'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(hexo.base_dir, '.hexo-updated-cache.json');

let cacheLoaded = false;
let cacheDirty = false;
let cache = {};
const seenSources = new Set();

function readCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;

  try {
    const text = fs.readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(text);
    cache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    cache = {};
  }
}

function writeCache() {
  if (!cacheDirty) return;
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

hexo.extend.filter.register('before_generate', () => {
  readCache();
  seenSources.clear();

  const posts = hexo.locals.get('posts');
  if (!posts) return;

  posts.forEach(post => {
    if (!post || !post.source) return;

    const normalizedSource = String(post.source).replace(/\\/g, '/');
    if (!/(^|\/)_posts\//.test(normalizedSource)) return;

    const fullPath = path.join(hexo.source_dir, normalizedSource);
    if (!fs.existsSync(fullPath)) return;

    const contentHash = crypto.createHash('sha1').update(fs.readFileSync(fullPath, 'utf8')).digest('hex');
    const cached = cache[normalizedSource];
    const currentUpdated = toDate(post.updated) || toDate(post.date) || new Date();

    seenSources.add(normalizedSource);

    if (!cached) {
      cache[normalizedSource] = {
        hash: contentHash,
        updated: currentUpdated.toISOString()
      };
      cacheDirty = true;
      post.updated = currentUpdated;
      return;
    }

    if (cached.hash === contentHash) {
      post.updated = toDate(cached.updated) || currentUpdated;
      return;
    }

    const now = new Date();
    cache[normalizedSource] = {
      hash: contentHash,
      updated: now.toISOString()
    };
    cacheDirty = true;
    post.updated = now;
  });

  for (const sourceKey of Object.keys(cache)) {
    if (!seenSources.has(sourceKey)) {
      delete cache[sourceKey];
      cacheDirty = true;
    }
  }

  writeCache();
});
