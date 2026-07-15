'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const MUSIC_DIR = path.join(hexo.source_dir, 'music');
const PLAYLIST_YML = path.join(hexo.source_dir, '_data', 'music_playlist.yml');
const COVER_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'svg'];

const hashCache = new Map();
let cachedPlaylist = null;

function computeAssetHash(filePath) {
  if (hashCache.has(filePath)) {
    return hashCache.get(filePath);
  }

  let hash = '';
  try {
    const content = fs.readFileSync(filePath);
    hash = crypto.createHash('sha1').update(content).digest('hex').slice(0, 8);
  } catch (_) {
    // 文件读不到，留空 → URL 不带版本号
  }
  hashCache.set(filePath, hash);
  return hash;
}

function urlWithHash(urlPath, filePath) {
  const hash = computeAssetHash(filePath);
  return hash ? `${urlPath}?v=${hash}` : urlPath;
}

function tryStat(p) {
  try {
    return fs.statSync(p);
  } catch (_) {
    return null;
  }
}

function resolveIfExists(p) {
  const st = tryStat(p);
  return st && st.isFile() ? p : null;
}

function findSidecar(baseName, exts) {
  for (const ext of exts) {
    const candidate = path.join(MUSIC_DIR, `${baseName}.${ext}`);
    const st = tryStat(candidate);
    if (st && st.isFile()) {
      return candidate;
    }
  }
  return null;
}

function loadPlaylistYml() {
  if (!fs.existsSync(PLAYLIST_YML)) {
    return [];
  }

  try {
    const parsed = yaml.load(fs.readFileSync(PLAYLIST_YML, 'utf8'));
    if (parsed == null) {
      return [];
    }
    if (!Array.isArray(parsed)) {
      throw new TypeError('playlist.yml 顶层必须是歌曲数组。');
    }
    return parsed;
  } catch (error) {
    hexo.log.error(`无法解析音乐歌单 ${PLAYLIST_YML}: ${error.message}`);
    throw error;
  }
}

function scanMp3() {
  if (!fs.existsSync(MUSIC_DIR)) {
    return [];
  }

  return fs.readdirSync(MUSIC_DIR)
    .filter((f) => f.toLowerCase().endsWith('.mp3'))
    .sort()
    .map((f) => ({ file: f }));
}

function buildPlaylist() {
  const ymlEntries = loadPlaylistYml();
  const ymlByFile = new Map();
  ymlEntries.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || typeof entry.file !== 'string' || !entry.file.trim()) {
      throw new TypeError(`playlist.yml 第 ${index + 1} 项缺少有效的 file 字段。`);
    }

    const file = entry.file.trim();
    if (path.basename(file) !== file) {
      throw new TypeError(`音乐文件必须直接位于 source/music：${file}`);
    }
    if (ymlByFile.has(file)) {
      throw new TypeError(`playlist.yml 中存在重复歌曲：${file}`);
    }

    entry.file = file;
    ymlByFile.set(file, entry);
  });

  const mp3List = scanMp3();
  const ordered = [];
  const seen = new Set();

  ymlEntries.forEach((entry) => {
    if (entry && entry.file && !seen.has(entry.file)) {
      ordered.push(entry.file);
      seen.add(entry.file);
    }
  });

  mp3List.forEach((mp3) => {
    if (!seen.has(mp3.file)) {
      ordered.push(mp3.file);
      seen.add(mp3.file);
    }
  });

  return ordered.map((file) => {
    const entry = ymlByFile.get(file) || { file };
    const baseName = file.replace(/\.mp3$/i, '');
    const audioPath = path.join(MUSIC_DIR, file);
    if (!resolveIfExists(audioPath)) {
      throw new Error(`歌单引用的音频不存在：${file}`);
    }

    const lyricsName = entry.lyrics || `${baseName}.lrc`;
    const lyricsPath = resolveIfExists(path.join(MUSIC_DIR, lyricsName)) || findSidecar(baseName, ['lrc']);

    const coverName = entry.cover;
    const coverPath = coverName
      ? resolveIfExists(path.join(MUSIC_DIR, coverName))
      : findSidecar(baseName, COVER_EXTS);

    if (entry.lyrics && !lyricsPath) {
      throw new Error(`歌曲 ${file} 指定的歌词不存在：${entry.lyrics}`);
    }
    if (entry.cover && !coverPath) {
      throw new Error(`歌曲 ${file} 指定的封面不存在：${entry.cover}`);
    }

    const track = {
      file,
      title: entry.title || baseName,
      artist: entry.artist || '',
      subtitle: entry.subtitle || '',
      eyebrow: entry.eyebrow || 'Stormy Broadcast',
      ambience: entry.ambience || '',
      src: urlWithHash(`/music/${file}`, audioPath),
      lyricsMode: entry.lyricsMode || 'dual',
      loop: entry.loop === true,
      sourceUrl: entry.sourceUrl || '',
      sourceLabel: entry.sourceLabel || ''
    };

    if (lyricsPath) {
      track.lyrics = urlWithHash(`/music/${path.basename(lyricsPath)}`, lyricsPath);
    }

    if (coverPath) {
      track.cover = urlWithHash(`/music/${path.basename(coverPath)}`, coverPath);
    }

    return track;
  });
}

function getPlaylist() {
  if (!cachedPlaylist) {
    cachedPlaylist = buildPlaylist();
  }
  return cachedPlaylist;
}

hexo.extend.filter.register('before_generate', () => {
  hashCache.clear();
  cachedPlaylist = buildPlaylist();
});

hexo.extend.filter.register('after_render:html', (str) => {
  if (!str || typeof str !== 'string') {
    return str;
  }

  const playlist = getPlaylist();
  if (!playlist || !playlist.length) {
    return str;
  }

  const inline = JSON.stringify(playlist).replace(/</g, '\\u003c');
  const injection = `<script>window.BLOG_MUSIC_PLAYLIST=${inline};</script>`;

  if (str.includes('</head>')) {
    return str.replace('</head>', `${injection}</head>`);
  }

  return str;
});
