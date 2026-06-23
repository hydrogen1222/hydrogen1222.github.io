'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ASSET_URL_PATTERN = /\b(href|src)=["'](\/(?:css|js|music)\/[^"'?]+)(?:\?v=[^"']*)?["']/g;
const SOURCE_ROOT = hexo.source_dir;

const hashCache = new Map();

function computeAssetHash(filePath) {
  if (hashCache.has(filePath)) {
    return hashCache.get(filePath);
  }

  let hash = '';
  try {
    const content = fs.readFileSync(filePath);
    hash = crypto.createHash('sha1').update(content).digest('hex').slice(0, 8);
  } catch (_) {
    // 文件读不到，留空 → URL 原样返回
  }
  hashCache.set(filePath, hash);
  return hash;
}

function resolveAsset(urlPath) {
  const filePath = path.join(SOURCE_ROOT, urlPath.replace(/^\//, ''));
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  } catch (_) {
    // 路径异常或无权限，视为不存在
  }
  return null;
}

hexo.extend.filter.register('after_render:html', (str) => {
  if (!str || typeof str !== 'string') {
    return str;
  }

  return str.replace(ASSET_URL_PATTERN, (match, attr, urlPath) => {
    const filePath = resolveAsset(urlPath);
    if (!filePath) {
      return match;
    }

    const hash = computeAssetHash(filePath);
    if (!hash) {
      return match;
    }

    return `${attr}="${urlPath}?v=${hash}"`;
  });
});
