const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const TEMP_DIR = path.join(ROOT, 'tools', `.cover-art-temp-${process.pid}`);
const DEFAULT_COVER_URL = 'https://s2.loli.net/2026/02/09/Dn8KqW2prvXtMYg.png';
const VIEWBOX = { width: 1200, height: 675 };
const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function main() {
  const options = parseArgs(process.argv.slice(2));
  const edgePath = resolveEdgePath();
  const posts = collectMarkdownFiles(POSTS_DIR)
    .map(loadPost)
    .filter(Boolean)
    .filter((post) => post.cover === DEFAULT_COVER_URL)
    .filter((post) => !options.match || matchesPost(post, options.match))
    .slice(0, options.limit || Number.MAX_SAFE_INTEGER);

  if (!posts.length) {
    console.log('No posts matched the default cover filter.');
    return;
  }

  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  console.log(`Generating ${posts.length} cover(s)...`);
  let successCount = 0;

  for (const post of posts) {
    const assetDir = path.join(path.dirname(post.filePath), path.basename(post.filePath, '.md'));
    const outputPath = path.join(assetDir, 'cover.png');
    const theme = pickTheme(post);
    const htmlPath = path.join(TEMP_DIR, `${slugify(post.relativePath)}.html`);
    const html = buildHtml(buildSvg(post, theme));

    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(htmlPath, html, 'utf8');
    renderHtmlToPng(edgePath, htmlPath, outputPath);
    updatePostCover(post, 'cover.png');

    successCount += 1;
    console.log(`[${successCount}/${posts.length}] ${post.relativePath} -> ${path.relative(ROOT, outputPath)}`);
  }

  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  console.log(`Done. Generated ${successCount} cover(s).`);
}

function parseArgs(args) {
  const options = { match: '', limit: 0 };
  for (const arg of args) {
    if (arg.startsWith('--match=')) {
      options.match = arg.slice('--match='.length).trim();
    }
    if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.slice('--limit='.length)) || 0;
    }
  }
  return options;
}

function resolveEdgePath() {
  for (const candidate of EDGE_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error('Microsoft Edge headless executable was not found.');
}

function matchesPost(post, rawNeedle) {
  const needle = rawNeedle.toLowerCase();
  return [
    post.relativePath,
    post.title,
    post.snippet,
    post.body.slice(0, 400),
  ].some((value) => value.toLowerCase().includes(needle));
}

function collectMarkdownFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function loadPost(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const parsed = parseFrontMatter(raw);
  if (!parsed) {
    return null;
  }
  const title = chooseDisplayTitle(filePath, parsed.data.title || '', parsed.body);
  const relativePath = path.relative(POSTS_DIR, filePath).replace(/\\/g, '/');
  return {
    filePath,
    relativePath,
    raw,
    newline: raw.includes('\r\n') ? '\r\n' : '\n',
    frontMatter: parsed.frontMatter,
    body: parsed.body,
    data: parsed.data,
    title,
    cover: parsed.data.cover || '',
    snippet: extractSnippet(parsed.body),
    summary: extractSummary(parsed.body),
  };
}

function parseFrontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return null;
  }

  const frontMatter = match[1];
  const body = match[2];
  const data = {};
  for (const line of frontMatter.split(/\r?\n/)) {
    const fieldMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!fieldMatch) {
      continue;
    }
    const key = fieldMatch[1];
    let value = fieldMatch[2].trim();
    value = value.replace(/^['"]|['"]$/g, '');
    data[key] = value;
  }

  return { frontMatter, body, data };
}

function chooseDisplayTitle(filePath, frontTitle, body) {
  const fileTitle = prettifyFileTitle(path.basename(filePath, '.md'));
  const heading = extractFirstHeading(body);
  if (!frontTitle) {
    return fileTitle;
  }
  if (!heading) {
    return frontTitle;
  }
  const frontVsHeading = titleSimilarity(frontTitle, heading);
  const fileVsHeading = titleSimilarity(fileTitle, heading);
  if (frontVsHeading < 0.25 && fileVsHeading >= 0.34) {
    return fileTitle;
  }
  return frontTitle;
}

function prettifyFileTitle(value) {
  return value.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractFirstHeading(body) {
  const match = body.match(/^\s{0,3}#{1,6}\s+(.+)$/m);
  return match ? match[1].replace(/[*_`~]/g, '').trim() : '';
}

function titleSimilarity(left, right) {
  const leftTokens = tokenizeTitle(left);
  const rightTokens = tokenizeTitle(right);
  if (!leftTokens.length || !rightTokens.length) {
    return 0;
  }
  const rightSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length;
  return overlap / Math.max(1, Math.min(leftTokens.length, rightTokens.length));
}

function tokenizeTitle(value) {
  return value
    .toLowerCase()
    .replace(/[’'":;,.!?()[\]{}\\\/]+/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function extractSnippet(body) {
  const cleaned = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, '$1')
    .replace(/^>\s*/gm, '')
    .replace(/[#*_~>-]/g, ' ')
    .replace(/\r?\n+/g, '\n')
    .trim();
  const paragraphs = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^---+$/.test(line));
  return (paragraphs[0] || '').slice(0, 96);
}

function extractSummary(body) {
  const snippet = extractSnippet(body).replace(/\s+/g, ' ').trim();
  if (!snippet) {
    return 'A fresh cover drawn from the article itself.';
  }
  const limit = /[\u4e00-\u9fff]/.test(snippet) ? 34 : 64;
  return snippet.length > limit ? `${snippet.slice(0, limit - 3)}...` : snippet;
}

function updatePostCover(post, newCoverValue) {
  const lines = post.frontMatter.split(/\r?\n/);
  let found = false;
  const updatedFrontMatter = lines.map((line) => {
    if (/^cover:\s*/.test(line)) {
      found = true;
      return `cover: ${newCoverValue}`;
    }
    return line;
  });

  if (!found) {
    updatedFrontMatter.push(`cover: ${newCoverValue}`);
  }

  const updatedRaw = `---${post.newline}${updatedFrontMatter.join(post.newline)}${post.newline}---${post.newline}${post.body}`;
  fs.writeFileSync(post.filePath, updatedRaw, 'utf8');
}

function renderHtmlToPng(edgePath, htmlPath, outputPath) {
  const fileUrl = pathToFileURL(htmlPath).toString();
  execFileSync(edgePath, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--run-all-compositor-stages-before-draw',
    '--force-color-profile=srgb',
    `--window-size=${VIEWBOX.width},${VIEWBOX.height}`,
    `--screenshot=${outputPath}`,
    fileUrl,
  ], { stdio: 'pipe' });
}

function pickTheme(post) {
  const haystack = `${post.relativePath} ${post.title} ${post.snippet} ${post.summary}`.toLowerCase();
  const has = (...parts) => parts.some((part) => haystack.includes(part.toLowerCase()));

  if (has('hitler')) return theme('historyTribune', post, 'TED-ED HISTORY');
  if (has('journalist', 'murderers accountable')) return theme('newsSpotlight', post, 'COURAGE STORY');
  if (has('nasa', 'software engineer')) return theme('spaceCode', post, 'SPACE & CODE');
  if (has('rocks could save the world', 'rocks')) return theme('earthMineral', post, 'EARTH SCIENCE');
  if (has('zombies')) return theme('zombieNight', post, 'DARK HISTORY');
  if (has('marriage')) return theme('ringsTimeline', post, 'SOCIAL HISTORY');
  if (has('cupid', 'psyche')) return theme('mythicHeart', post, 'MYTH & SYMBOL');
  if (has('warrior', 'mughals')) return theme('battlePalace', post, 'HISTORY TALE');
  if (has('falling in love')) return theme('loveChemistry', post, 'SCIENCE OF LOVE');
  if (has('all night', 'brain')) return theme('brainNight', post, 'BRAIN & SLEEP');
  if (has('repair your stuff', 'repair')) return theme('repairBench', post, 'RIGHT TO REPAIR');
  if (has('february', '28 days')) return theme('calendarMoon', post, 'CALENDAR NOTE');

  if (has('new york')) return theme('cityBook', post, 'ENGLISH LESSON');
  if (has('amish')) return theme('farmBook', post, 'ENGLISH LESSON');
  if (has('lesson')) return theme('lessonNotebook', post, 'ENGLISH LESSON');

  if (has('bridget jones')) return theme('diaryGlow', post, 'ATLANTIC NOTES');
  if (has('elon musk', 'europe')) return theme('techEurope', post, 'ATLANTIC NOTES');
  if (has('mommy')) return theme('familyLight', post, 'ATLANTIC NOTES');
  if (has('covid')) return theme('publicDebate', post, 'ATLANTIC NOTES');
  if (has('might makes right')) return theme('powerHistory', post, 'ATLANTIC NOTES');
  if (post.relativePath.includes('Stormy English')) return theme('essayAtlas', post, 'ENGLISH NOTES');

  if (has('phoenix')) return theme('phoenixRise', post, 'REFLECTION');
  if (has('waterfall')) return theme('waterfallPath', post, 'REFLECTION');
  if (has('starry')) return theme('starryField', post, 'REFLECTION');
  if (has('spring')) return theme('springWindow', post, 'REFLECTION');
  if (has('isolated city')) return theme('isolatedCity', post, 'REFLECTION');
  if (post.relativePath.includes('沉思录')) return theme('journalBloom', post, 'REFLECTION');

  if (has('gentoo', 'linux')) return theme('linuxTerminal', post, 'COMPUTING');
  if (has('网络')) return theme('networkThreads', post, 'COMPUTING');
  if (has('程序', 'algorithm', '经典')) return theme('classicCode', post, 'COMPUTING');
  if (post.relativePath.includes('计算机')) return theme('classicCode', post, 'COMPUTING');

  if (has('rietveld')) return theme('diffractionArc', post, 'RESEARCH NOTE');
  if (has('空位', '空隙', '间隙')) return theme('vacancyLattice', post, 'RESEARCH NOTE');
  if (has('甲烷', '玻璃管', '熔融')) return theme('furnaceGlass', post, 'RESEARCH NOTE');
  if (has('电池', '储能')) return theme('batteryGrid', post, 'RESEARCH NOTE');
  if (has('马弗炉')) return theme('muffleFurnace', post, 'RESEARCH NOTE');
  if (has('科研中的问题')) return theme('researchDesk', post, 'RESEARCH NOTE');
  if (post.relativePath.includes('科研/first stage')) return theme('researchDesk', post, 'RESEARCH NOTE');

  if (has('cu(111)', 'slab')) return theme('copperSlab', post, 'VASP NOTE');
  if (has('bulk')) return theme('copperBulk', post, 'VASP NOTE');
  if (has('potcar')) return theme('potcarShield', post, 'VASP NOTE');
  if (has('encut')) return theme('encutWave', post, 'VASP NOTE');
  if (has('vaspkit', '使用')) return theme('vaspTerminal', post, 'VASP NOTE');
  if (has('报错', 'error', 'cif', 'poscar')) return theme('terminalWarning', post, 'VASP NOTE');
  if (has('formula')) return theme('formulaGarden', post, 'VASP NOTE');
  if (has('intel', '编译', '安装')) return theme('chipCompile', post, 'VASP NOTE');
  if (post.relativePath.includes('科研/VASP')) return theme('vaspTerminal', post, 'VASP NOTE');

  if (has('歌词', '音乐', '阳光', '快乐无罪')) return theme('musicHorizon', post, 'ESSAY NOTE');
  if (has('固体化学')) return theme('solidChemistry', post, 'ACADEMIC NOTE');

  return theme('essayAtlas', post, 'ACADEMIC VAULT');
}

function theme(key, post, label) {
  const paletteMap = {
    historyTribune: ['#201a24', '#45314d', '#dd6e42', '#f1c27d', '#f7ecd8'],
    newsSpotlight: ['#10202d', '#244461', '#5bc0be', '#ffd166', '#f5f7ff'],
    spaceCode: ['#0c1932', '#203f70', '#79c7ff', '#ffd36e', '#f5f8ff'],
    earthMineral: ['#15231f', '#325346', '#85c88a', '#f1c27d', '#f7f7e8'],
    zombieNight: ['#151527', '#363458', '#8cc8ff', '#9fffa4', '#f5f6ff'],
    ringsTimeline: ['#281a26', '#5b3157', '#f59e9e', '#f5d17b', '#fff5ef'],
    mythicHeart: ['#1d2038', '#534d95', '#8fc9ff', '#ffadc6', '#fef7ff'],
    battlePalace: ['#25191a', '#5f3430', '#d8915d', '#f6cd7f', '#fff7ee'],
    loveChemistry: ['#1d2440', '#425c8c', '#7fd6ff', '#ff9dca', '#f8fbff'],
    brainNight: ['#10182d', '#2c426e', '#8ac1ff', '#ffe08a', '#f7fbff'],
    repairBench: ['#152130', '#304b6f', '#78cdf5', '#ffd36b', '#f5f7fa'],
    calendarMoon: ['#171d33', '#39466d', '#7fb4ff', '#ffe18c', '#fbfbff'],
    cityBook: ['#132239', '#355e8f', '#8ed5ff', '#ffd17a', '#fbfbff'],
    farmBook: ['#1a2f25', '#456b51', '#8ed7a1', '#ffd37e', '#fff9ef'],
    lessonNotebook: ['#1b2640', '#4f6fb0', '#84d5ff', '#ffe08d', '#fbfbff'],
    diaryGlow: ['#231b35', '#5b3d7f', '#85c9ff', '#ffb0c5', '#fdf8ff'],
    techEurope: ['#112844', '#2d5e8c', '#7bc3ff', '#f8d572', '#f4f8ff'],
    familyLight: ['#2b1f2a', '#6f4d77', '#90d8ff', '#ffd987', '#fff8f1'],
    publicDebate: ['#1e2130', '#4c5674', '#89d0ff', '#ffb870', '#f6f8ff'],
    powerHistory: ['#281f1c', '#6b4530', '#e2a563', '#f7d983', '#fff7ef'],
    essayAtlas: ['#17233a', '#375f88', '#88d0ff', '#ffd488', '#f6fbff'],
    phoenixRise: ['#241726', '#6f3855', '#ff8d5c', '#ffd77f', '#fff5ec'],
    waterfallPath: ['#102135', '#265674', '#7fd6ff', '#b4ffe1', '#f3fbff'],
    starryField: ['#0f1730', '#324d89', '#8fc9ff', '#ffe28a', '#f7faff'],
    springWindow: ['#1a2b27', '#497060', '#9ddcbe', '#ffd897', '#fffaf0'],
    isolatedCity: ['#1b2238', '#4a5f7d', '#8fd1ff', '#ffcc84', '#f5f8ff'],
    journalBloom: ['#1e2337', '#506180', '#8bd0ff', '#ffc58d', '#f8fbff'],
    linuxTerminal: ['#132030', '#32526b', '#7bd2ff', '#9af59a', '#f4f8fb'],
    networkThreads: ['#11263a', '#365d82', '#7fd0ff', '#ffd27d', '#f5fbff'],
    classicCode: ['#152131', '#365070', '#7cc9ff', '#ffd98b', '#f6f9ff'],
    diffractionArc: ['#162131', '#395071', '#7cc9ff', '#ffe08a', '#f7fbff'],
    vacancyLattice: ['#16242e', '#355969', '#79d1d7', '#ffd07c', '#f5fbfa'],
    furnaceGlass: ['#27181a', '#653b2f', '#ff8f57', '#ffd97e', '#fff6ef'],
    batteryGrid: ['#112432', '#28506a', '#77d7ff', '#8effb0', '#f5fcff'],
    muffleFurnace: ['#281918', '#6d3e2d', '#ff8c4c', '#ffd479', '#fff8ef'],
    researchDesk: ['#1a2534', '#3c5b78', '#85d2ff', '#ffd28a', '#f6fbff'],
    copperSlab: ['#1e2130', '#63463d', '#d9946b', '#7dd3fc', '#fef8f3'],
    copperBulk: ['#191f2d', '#5a4d6e', '#d59b7a', '#8acfff', '#fcf8ff'],
    potcarShield: ['#162233', '#355979', '#7fd0ff', '#a8ffcf', '#f6fbff'],
    encutWave: ['#132138', '#385980', '#84d2ff', '#ffd978', '#f6fbff'],
    vaspTerminal: ['#132033', '#355171', '#7dcfff', '#99f0ff', '#f5fbff'],
    terminalWarning: ['#231b2a', '#5e415f', '#7bcfff', '#ffb36d', '#fbf8ff'],
    formulaGarden: ['#152535', '#335e70', '#79cfd6', '#ffd37d', '#f6fbfa'],
    chipCompile: ['#102235', '#315d7c', '#7fd2ff', '#a3ffca', '#f5fbff'],
    musicHorizon: ['#1c1f35', '#4f4e7c', '#84d2ff', '#ffd37b', '#fff8fb'],
    solidChemistry: ['#152434', '#38597c', '#7fd3ff', '#a9ffd4', '#f7fbff'],
  };

  return {
    key,
    label,
    palette: paletteMap[key] || paletteMap.essayAtlas,
    title: post.title,
    summary: post.summary,
    category: deriveCategoryLabel(post),
  };
}

function deriveCategoryLabel(post) {
  const categories = (post.data.categories || '')
    .replace(/[\[\]]/g, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return categories[0] || path.dirname(post.relativePath).split('/').filter(Boolean).slice(-1)[0] || 'Article';
}

function buildHtml(svg) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    html, body {
      width: ${VIEWBOX.width}px;
      height: ${VIEWBOX.height}px;
      margin: 0;
      overflow: hidden;
      background: #0f1630;
    }
    body {
      display: grid;
      place-items: center;
    }
    svg {
      width: ${VIEWBOX.width}px;
      height: ${VIEWBOX.height}px;
      display: block;
    }
  </style>
</head>
<body>${svg}</body>
</html>`;
}

function buildSvg(post, themeInfo) {
  const rng = createRng(hashString(post.relativePath));
  const [bgA, bgB, accentA, accentB, ink] = themeInfo.palette;
  const summary = escapeXml(themeInfo.summary);
  const label = escapeXml(themeInfo.label);
  const category = escapeXml(themeInfo.category);
  const title = escapeXml(post.title);
  const decor = buildBackdrop(rng, accentA, accentB);
  const art = buildArt(themeInfo.key, rng, accentA, accentB, ink);
  const titleFont = title.length > 28 ? 56 : 68;
  const summaryFont = /[A-Za-z]{8,}/.test(post.summary) ? 20 : 22;
  const summaryHeight = 92;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgA}" />
      <stop offset="100%" stop-color="${bgB}" />
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${withAlpha('#ffffff', 0.20)}" />
      <stop offset="100%" stop-color="${withAlpha('#ffffff', 0.08)}" />
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accentA}" />
      <stop offset="100%" stop-color="${accentB}" />
    </linearGradient>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="18" />
    </filter>
    <filter id="cardBlur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="10" />
    </filter>
  </defs>

  <rect width="${VIEWBOX.width}" height="${VIEWBOX.height}" rx="44" fill="url(#bg)" />
  ${decor}
  <rect x="40" y="42" width="612" height="590" rx="34" fill="${withAlpha('#08111f', 0.14)}" stroke="${withAlpha('#ffffff', 0.18)}" />
  <circle cx="920" cy="162" r="138" fill="${withAlpha(accentA, 0.16)}" filter="url(#softGlow)" />
  <circle cx="1000" cy="470" r="118" fill="${withAlpha(accentB, 0.18)}" filter="url(#softGlow)" />
  ${art}
  <rect x="68" y="74" width="196" height="54" rx="27" fill="${withAlpha('#ffffff', 0.14)}" stroke="${withAlpha('#ffffff', 0.18)}" />
  <text x="166" y="108" text-anchor="middle" fill="${ink}" font-family="Segoe UI, Microsoft YaHei, Noto Sans SC, sans-serif" font-size="23" font-weight="700" letter-spacing="4">${label}</text>
  <text x="70" y="156" fill="${withAlpha(ink, 0.72)}" font-family="Segoe UI, Microsoft YaHei, Noto Sans SC, sans-serif" font-size="24" font-weight="600" letter-spacing="2">${category}</text>

  <foreignObject x="68" y="186" width="540" height="220">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif; color: ${ink}; display: flex; flex-direction: column; gap: 18px;">
      <div style="font-size: ${titleFont}px; line-height: 1.12; font-weight: 800; letter-spacing: 1px;">${escapeHtml(post.title)}</div>
      <div style="font-size: 24px; line-height: 1.5; color: ${withAlpha(ink, 0.72)};">${escapeHtml(category)} / ${escapeHtml(themeInfo.label)}</div>
    </div>
  </foreignObject>

  <rect x="68" y="460" width="520" height="${summaryHeight}" rx="28" fill="${withAlpha('#08111f', 0.22)}" stroke="${withAlpha('#ffffff', 0.12)}" />
  <foreignObject x="94" y="486" width="470" height="${summaryHeight - 24}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif; color: ${withAlpha(ink, 0.84)}; font-size: ${summaryFont}px; line-height: 1.56; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;">
      ${escapeHtml(summary)}
    </div>
  </foreignObject>

  <rect x="68" y="596" width="220" height="16" rx="8" fill="${withAlpha('#ffffff', 0.12)}" />
  <rect x="68" y="596" width="${120 + Math.floor(rng() * 90)}" height="16" rx="8" fill="url(#accent)" />
  <text x="1110" y="610" text-anchor="end" fill="${withAlpha(ink, 0.56)}" font-family="Segoe UI, Microsoft YaHei, Noto Sans SC, sans-serif" font-size="22" font-weight="600" letter-spacing="3">BCS ACADEMIC VAULT</text>
</svg>`;
}

function buildBackdrop(rng, accentA, accentB) {
  const sparkles = Array.from({ length: 20 }, () => {
    const x = Math.floor(rng() * 1150) + 20;
    const y = Math.floor(rng() * 620) + 20;
    const r = (rng() * 2.6 + 1.2).toFixed(2);
    const opacity = (rng() * 0.35 + 0.18).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${withAlpha('#ffffff', opacity)}" />`;
  }).join('');
  return `
    <path d="M0 520 C150 470 260 470 380 514 C525 565 650 575 760 532 C902 476 1045 470 1200 528 L1200 675 L0 675 Z" fill="${withAlpha('#020610', 0.28)}" />
    <path d="M0 560 C130 512 254 508 366 548 C512 600 662 608 792 564 C918 520 1066 512 1200 560 L1200 675 L0 675 Z" fill="${withAlpha(accentA, 0.12)}" />
    <path d="M0 110 C150 72 330 90 458 126 C642 180 828 204 1018 160 C1088 144 1148 134 1200 136 L1200 0 L0 0 Z" fill="${withAlpha(accentB, 0.12)}" />
    ${sparkles}
  `;
}

function buildArt(key, rng, accentA, accentB, ink) {
  switch (key) {
    case 'historyTribune':
      return renderHistoryTribune(accentA, accentB, ink);
    case 'newsSpotlight':
      return renderNewsSpotlight(accentA, accentB, ink);
    case 'spaceCode':
      return renderSpaceCode(accentA, accentB, ink, rng);
    case 'earthMineral':
      return renderEarthMineral(accentA, accentB, ink);
    case 'zombieNight':
      return renderZombieNight(accentA, accentB, ink);
    case 'ringsTimeline':
      return renderRingsTimeline(accentA, accentB, ink);
    case 'mythicHeart':
      return renderMythicHeart(accentA, accentB, ink);
    case 'battlePalace':
      return renderBattlePalace(accentA, accentB, ink);
    case 'loveChemistry':
      return renderLoveChemistry(accentA, accentB, ink);
    case 'brainNight':
      return renderBrainNight(accentA, accentB, ink);
    case 'repairBench':
      return renderRepairBench(accentA, accentB, ink);
    case 'calendarMoon':
      return renderCalendarMoon(accentA, accentB, ink);
    case 'cityBook':
      return renderCityBook(accentA, accentB, ink);
    case 'farmBook':
      return renderFarmBook(accentA, accentB, ink);
    case 'lessonNotebook':
      return renderLessonNotebook(accentA, accentB, ink);
    case 'diaryGlow':
      return renderDiaryGlow(accentA, accentB, ink);
    case 'techEurope':
      return renderTechEurope(accentA, accentB, ink);
    case 'familyLight':
      return renderFamilyLight(accentA, accentB, ink);
    case 'publicDebate':
      return renderPublicDebate(accentA, accentB, ink);
    case 'powerHistory':
      return renderPowerHistory(accentA, accentB, ink);
    case 'phoenixRise':
      return renderPhoenixRise(accentA, accentB, ink);
    case 'waterfallPath':
      return renderWaterfallPath(accentA, accentB, ink);
    case 'starryField':
      return renderStarryField(accentA, accentB, ink, rng);
    case 'springWindow':
      return renderSpringWindow(accentA, accentB, ink);
    case 'isolatedCity':
      return renderIsolatedCity(accentA, accentB, ink);
    case 'journalBloom':
      return renderJournalBloom(accentA, accentB, ink);
    case 'linuxTerminal':
      return renderLinuxTerminal(accentA, accentB, ink);
    case 'networkThreads':
      return renderNetworkThreads(accentA, accentB, ink);
    case 'classicCode':
      return renderClassicCode(accentA, accentB, ink);
    case 'diffractionArc':
      return renderDiffractionArc(accentA, accentB, ink);
    case 'vacancyLattice':
      return renderVacancyLattice(accentA, accentB, ink);
    case 'furnaceGlass':
      return renderFurnaceGlass(accentA, accentB, ink);
    case 'batteryGrid':
      return renderBatteryGrid(accentA, accentB, ink);
    case 'muffleFurnace':
      return renderMuffleFurnace(accentA, accentB, ink);
    case 'researchDesk':
      return renderResearchDesk(accentA, accentB, ink);
    case 'copperSlab':
      return renderCopperSlab(accentA, accentB, ink);
    case 'copperBulk':
      return renderCopperBulk(accentA, accentB, ink);
    case 'potcarShield':
      return renderPotcarShield(accentA, accentB, ink);
    case 'encutWave':
      return renderEncutWave(accentA, accentB, ink);
    case 'vaspTerminal':
      return renderVaspTerminal(accentA, accentB, ink);
    case 'terminalWarning':
      return renderTerminalWarning(accentA, accentB, ink);
    case 'formulaGarden':
      return renderFormulaGarden(accentA, accentB, ink);
    case 'chipCompile':
      return renderChipCompile(accentA, accentB, ink);
    case 'musicHorizon':
      return renderMusicHorizon(accentA, accentB, ink);
    case 'solidChemistry':
      return renderSolidChemistry(accentA, accentB, ink);
    default:
      return renderEssayAtlas(accentA, accentB, ink);
  }
}

function renderHistoryTribune(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['skyline', 88, 228, 1.02], ['podium', 236, 248, 1], ['banner', 132, 124, 1], ['banner', 342, 124, 1], ['sun', 356, 98, 0.7]]); }
function renderNewsSpotlight(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['paper', 146, 142, 1], ['mic', 360, 286, 0.9], ['spotlight', 314, 102, 1]]); }
function renderSpaceCode(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['orbit', 316, 128, 1], ['rocket', 314, 128, 1], ['terminal', 128, 280, 1]]); }
function renderEarthMineral(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['planet', 314, 148, 1], ['crystal', 194, 330, 1], ['leaf', 378, 282, 0.92]]); }
function renderZombieNight(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['moon', 360, 100, 0.9], ['skyline', 104, 240, 1], ['hand', 214, 350, 1], ['hand', 314, 360, 0.86]]); }
function renderRingsTimeline(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['rings', 298, 178, 1], ['timeline', 120, 340, 1], ['spark', 378, 130, 1]]); }
function renderMythicHeart(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['moon', 366, 96, 0.76], ['heartWing', 300, 194, 1], ['starArc', 146, 112, 1]]); }
function renderBattlePalace(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['palace', 142, 180, 1], ['spear', 370, 138, 1], ['sun', 348, 96, 0.66]]); }
function renderLoveChemistry(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['flask', 186, 168, 1], ['heart', 334, 186, 1], ['orbit', 356, 282, 0.66]]); }
function renderBrainNight(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['moon', 368, 96, 0.82], ['brain', 286, 198, 1], ['starArc', 134, 122, 1]]); }
function renderRepairBench(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['device', 144, 160, 1], ['wrench', 338, 186, 1], ['spark', 386, 286, 1]]); }
function renderCalendarMoon(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['calendar', 182, 132, 1], ['moon', 388, 126, 0.72], ['timeline', 148, 344, 0.9]]); }
function renderCityBook(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['skyline', 110, 176, 1.04], ['book', 184, 324, 1], ['sun', 374, 108, 0.7]]); }
function renderFarmBook(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['hill', 92, 276, 1], ['barn', 154, 208, 1], ['book', 214, 330, 0.92]]); }
function renderLessonNotebook(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['notebook', 160, 148, 1], ['pencil', 366, 170, 1], ['spark', 382, 306, 1]]); }
function renderDiaryGlow(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['diary', 164, 166, 1], ['heart', 344, 200, 0.86], ['steam', 372, 308, 1]]); }
function renderTechEurope(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['phone', 256, 164, 1], ['orbit', 170, 158, 0.72], ['ring', 380, 240, 1]]); }
function renderFamilyLight(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['sun', 346, 114, 0.76], ['family', 212, 232, 1], ['window', 128, 120, 1]]); }
function renderPublicDebate(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['podium', 222, 248, 1], ['bubble', 150, 132, 1], ['skyline', 88, 320, 1]]); }
function renderPowerHistory(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['crown', 342, 116, 1], ['podium', 220, 234, 0.92], ['timeline', 136, 340, 1]]); }
function renderEssayAtlas(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['book', 160, 288, 1], ['compass', 360, 176, 1], ['skyline', 108, 174, 0.94]]); }
function renderPhoenixRise(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['sun', 360, 108, 0.84], ['phoenix', 244, 190, 1], ['mountain', 112, 336, 1]]); }
function renderWaterfallPath(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['waterfall', 162, 134, 1], ['leaf', 388, 146, 0.9], ['mountain', 144, 354, 1]]); }
function renderStarryField(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['moon', 362, 92, 0.76], ['starArc', 142, 102, 1], ['tent', 184, 314, 1]]); }
function renderSpringWindow(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['window', 142, 124, 1], ['leaf', 362, 274, 1], ['sun', 370, 118, 0.64]]); }
function renderIsolatedCity(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['skyline', 172, 214, 0.9], ['moon', 388, 112, 0.72], ['orbit', 210, 348, 0.92]]); }
function renderJournalBloom(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['journal', 166, 156, 1], ['leaf', 378, 198, 1], ['spark', 374, 314, 1]]); }
function renderLinuxTerminal(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['terminal', 132, 154, 1], ['gear', 362, 230, 1], ['chip', 324, 300, 0.82]]); }
function renderNetworkThreads(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['network', 160, 142, 1], ['server', 300, 248, 1], ['ring', 182, 316, 0.84]]); }
function renderClassicCode(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['code', 144, 154, 1], ['gear', 362, 304, 0.9], ['chip', 356, 176, 0.7]]); }
function renderDiffractionArc(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['chart', 132, 170, 1], ['cube', 360, 252, 0.84], ['wave', 160, 132, 1]]); }
function renderVacancyLattice(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['lattice', 156, 150, 1], ['cube', 374, 170, 0.76], ['spark', 326, 258, 1]]); }
function renderFurnaceGlass(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['furnace', 154, 202, 1], ['flask', 344, 144, 1], ['flame', 346, 286, 1]]); }
function renderBatteryGrid(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['battery', 174, 168, 1], ['network', 314, 180, 0.88], ['bolt', 388, 286, 1]]); }
function renderMuffleFurnace(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['furnace', 170, 194, 1], ['wave', 314, 150, 0.76], ['chip', 356, 282, 0.74]]); }
function renderResearchDesk(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['notebook', 138, 176, 0.92], ['flask', 366, 172, 0.92], ['leaf', 376, 304, 0.86]]); }
function renderCopperSlab(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['cube', 208, 230, 1], ['chart', 332, 160, 0.8], ['wave', 144, 312, 0.8]]); }
function renderCopperBulk(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['cube', 234, 188, 1.08], ['orbit', 334, 304, 0.84], ['spark', 392, 162, 1]]); }
function renderPotcarShield(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['shield', 190, 156, 1], ['cube', 350, 258, 0.74], ['orbit', 350, 150, 0.72]]); }
function renderEncutWave(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['chart', 152, 222, 0.94], ['wave', 144, 150, 1], ['chip', 372, 234, 0.76]]); }
function renderVaspTerminal(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['terminal', 140, 164, 1], ['cube', 334, 260, 0.76], ['orbit', 372, 150, 0.64]]); }
function renderTerminalWarning(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['terminal', 140, 164, 1], ['warning', 362, 240, 1], ['spark', 180, 328, 1]]); }
function renderFormulaGarden(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['journal', 156, 154, 1], ['leaf', 384, 232, 1], ['orbit', 350, 142, 0.72]]); }
function renderChipCompile(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['chip', 176, 166, 1], ['terminal', 292, 252, 0.82], ['ring', 372, 140, 0.76]]); }
function renderMusicHorizon(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['music', 180, 164, 1], ['sun', 344, 108, 0.82], ['wave', 150, 312, 1]]); }
function renderSolidChemistry(accentA, accentB, ink) { return buildMotifScene(accentA, accentB, ink, [['periodic', 150, 142, 1], ['cube', 318, 248, 0.86], ['flask', 392, 168, 0.76]]); }

function buildMotifScene(accentA, accentB, ink, motifs) {
  const content = motifs
    .map(([name, x, y, scale]) => motif(name, x, y, scale, accentA, accentB, ink))
    .join('');
  return `
    <g transform="translate(694 74)">
      <rect x="0" y="0" width="454" height="528" rx="40" fill="${withAlpha('#06111d', 0.12)}" stroke="${withAlpha('#ffffff', 0.16)}" />
      <circle cx="332" cy="126" r="118" fill="${withAlpha(accentA, 0.16)}" filter="url(#softGlow)" />
      <circle cx="376" cy="346" r="88" fill="${withAlpha(accentB, 0.14)}" filter="url(#softGlow)" />
      <path d="M34 420 C140 368 270 372 416 424 L416 500 L34 500 Z" fill="${withAlpha('#050c18', 0.24)}" />
      ${content}
      <rect x="34" y="452" width="386" height="34" rx="17" fill="${withAlpha('#ffffff', 0.08)}" />
      <rect x="34" y="452" width="182" height="34" rx="17" fill="${withAlpha(accentA, 0.34)}" />
      <text x="398" y="475" text-anchor="end" fill="${withAlpha(ink, 0.54)}" font-family="Segoe UI, Microsoft YaHei, Noto Sans SC, sans-serif" font-size="18" font-weight="700" letter-spacing="2">CUSTOM COVER</text>
    </g>
  `;
}

function motif(name, x, y, scale, accentA, accentB, ink) {
  const s = scale || 1;
  switch (name) {
    case 'sun':
      return `<g><circle cx="${x}" cy="${y}" r="${48 * s}" fill="${withAlpha(accentB, 0.18)}" filter="url(#softGlow)" /><circle cx="${x}" cy="${y}" r="${30 * s}" fill="${withAlpha(accentB, 0.82)}" /></g>`;
    case 'moon':
      return `<g><circle cx="${x}" cy="${y}" r="${40 * s}" fill="${withAlpha(accentB, 0.82)}" /><circle cx="${x + 16 * s}" cy="${y - 2 * s}" r="${34 * s}" fill="${withAlpha('#091220', 0.86)}" /></g>`;
    case 'skyline':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="90" width="46" height="110" rx="8" fill="${withAlpha(ink, 0.16)}" /><rect x="56" y="54" width="40" height="146" rx="8" fill="${withAlpha(ink, 0.16)}" /><rect x="104" y="18" width="62" height="182" rx="8" fill="${withAlpha(ink, 0.16)}" /><rect x="176" y="70" width="48" height="130" rx="8" fill="${withAlpha(ink, 0.16)}" /><rect x="232" y="34" width="74" height="166" rx="8" fill="${withAlpha(ink, 0.16)}" /></g>`;
    case 'podium':
      return `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="90" cy="18" r="18" fill="${withAlpha(ink, 0.82)}" /><rect x="74" y="34" width="32" height="54" rx="16" fill="${withAlpha(ink, 0.82)}" /><rect x="32" y="86" width="116" height="74" rx="22" fill="${withAlpha(accentA, 0.62)}" /><rect x="48" y="104" width="84" height="14" rx="7" fill="${withAlpha('#ffffff', 0.18)}" /><rect x="58" y="128" width="64" height="12" rx="6" fill="${withAlpha(accentB, 0.72)}" /></g>`;
    case 'banner':
      return `<path d="M${x} ${y} h72 l-14 50 l14 50 h-72 z" fill="${withAlpha(accentA, 0.58)}" />`;
    case 'paper':
      return `<g transform="translate(${x} ${y}) scale(${s}) rotate(-6)"><rect x="0" y="0" width="162" height="206" rx="24" fill="${withAlpha('#ffffff', 0.9)}" /><rect x="20" y="22" width="118" height="22" rx="11" fill="${withAlpha(accentA, 0.42)}" /><path d="M26 66 h112 M26 92 h112 M26 118 h112" stroke="${withAlpha(ink, 0.14)}" stroke-width="8" stroke-linecap="round" /><rect x="26" y="142" width="70" height="44" rx="14" fill="${withAlpha(accentB, 0.42)}" /><rect x="106" y="142" width="32" height="44" rx="12" fill="${withAlpha(ink, 0.08)}" /></g>`;
    case 'mic':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="34" height="70" rx="17" fill="${withAlpha(accentB, 0.76)}" /><path d="M17 70 v46" stroke="${withAlpha(ink, 0.72)}" stroke-width="8" stroke-linecap="round" /><path d="M-4 118 h42" stroke="${withAlpha(accentA, 0.54)}" stroke-width="8" stroke-linecap="round" /></g>`;
    case 'spotlight':
      return `<path d="M${x} ${y} c-76 54 -110 132 -120 232" fill="none" stroke="${withAlpha(accentA, 0.66)}" stroke-width="28" stroke-linecap="round" />`;
    case 'orbit':
      return `<ellipse cx="${x}" cy="${y}" rx="${86 * s}" ry="${34 * s}" fill="none" stroke="${withAlpha(accentA, 0.58)}" stroke-width="6" />`;
    case 'rocket':
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -54 c38 14 58 54 52 106 c-42 8 -84 -6 -108 -44 c12 -18 30 -40 56 -62 z" fill="${withAlpha('#ffffff', 0.92)}" /><circle cx="2" cy="-2" r="14" fill="${withAlpha(accentA, 0.7)}" /><path d="M-28 26 l-24 34 l28 -10 z" fill="${withAlpha(accentB, 0.78)}" /><path d="M32 26 l24 34 l-28 -10 z" fill="${withAlpha(accentB, 0.78)}" /><path d="M2 56 l-18 42 h36 z" fill="${withAlpha(accentA, 0.76)}" /></g>`;
    case 'terminal':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="212" height="142" rx="26" fill="${withAlpha('#0a1222', 0.74)}" stroke="${withAlpha('#ffffff', 0.14)}" /><circle cx="28" cy="24" r="6" fill="${withAlpha(accentB, 0.8)}" /><circle cx="48" cy="24" r="6" fill="${withAlpha(accentA, 0.8)}" /><path d="M36 58 l24 20 l-24 20" fill="none" stroke="${withAlpha(accentA, 0.86)}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" /><path d="M84 98 h72" stroke="${withAlpha(accentB, 0.72)}" stroke-width="8" stroke-linecap="round" /><path d="M84 70 h92" stroke="${withAlpha('#ffffff', 0.22)}" stroke-width="8" stroke-linecap="round" /></g>`;
    case 'planet':
      return `<g><circle cx="${x}" cy="${y}" r="${84 * s}" fill="${withAlpha(accentA, 0.54)}" /><path d="M${x - 84 * s} ${y + 10 * s} c24 -30 66 -34 94 -18 c30 16 60 16 88 -8" fill="none" stroke="${withAlpha(accentB, 0.72)}" stroke-width="${18 * s}" stroke-linecap="round" /><ellipse cx="${x}" cy="${y}" rx="${126 * s}" ry="${34 * s}" fill="none" stroke="${withAlpha(ink, 0.14)}" stroke-width="${14 * s}" /></g>`;
    case 'crystal':
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 46 l34 -46 l42 14 l12 50 l-36 40 l-42 -16 z" fill="${withAlpha(accentB, 0.72)}" /><path d="M34 0 l48 18 l-10 48 l-46 -4 z" fill="${withAlpha(accentA, 0.62)}" /></g>`;
    case 'leaf':
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 40 v34" stroke="${withAlpha(ink, 0.54)}" stroke-width="6" stroke-linecap="round" /><path d="M0 44 c18 -24 40 -28 60 -16 c-14 28 -36 34 -60 16 z" fill="${withAlpha(accentA, 0.78)}" /><path d="M0 56 c-18 -22 -40 -26 -58 -14 c14 26 34 32 58 14 z" fill="${withAlpha(accentB, 0.68)}" /></g>`;
    case 'hand':
      return `<path d="M${x} ${y} c-10 -36 -4 -66 16 -88 c16 10 24 26 24 46 c0 24 6 34 22 46 v18 h-28 c-18 0 -30 -8 -34 -22 z" fill="${withAlpha(accentA, 0.62)}" />`;
    case 'rings':
      return `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="0" r="50" fill="none" stroke="${withAlpha(accentA, 0.72)}" stroke-width="18" /><circle cx="54" cy="0" r="50" fill="none" stroke="${withAlpha(accentB, 0.72)}" stroke-width="18" /><circle cx="24" cy="-56" r="10" fill="${withAlpha(ink, 0.82)}" /></g>`;
    case 'timeline':
      return `<path d="M${x} ${y} C${x + 80 * s} ${y - 62 * s} ${x + 178 * s} ${y - 64 * s} ${x + 282 * s} ${y - 6 * s}" fill="none" stroke="${withAlpha(accentA, 0.72)}" stroke-width="10" stroke-linecap="round" />`;
    case 'starArc':
      return `<path d="M${x} ${y} c56 -20 112 -12 170 22" fill="none" stroke="${withAlpha(accentA, 0.56)}" stroke-width="8" stroke-dasharray="2 16" stroke-linecap="round" />`;
    case 'spark':
      return `<g><circle cx="${x}" cy="${y}" r="8" fill="${withAlpha(accentB, 0.78)}" /><circle cx="${x + 22 * s}" cy="${y + 18 * s}" r="5" fill="${withAlpha('#ffffff', 0.56)}" /><circle cx="${x - 18 * s}" cy="${y + 30 * s}" r="4" fill="${withAlpha(accentA, 0.48)}" /></g>`;
    case 'heartWing':
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 24 c-18 -32 -60 -28 -68 6 c-8 30 14 56 68 90 c54 -34 76 -60 68 -90 c-8 -34 -50 -38 -68 -6 z" fill="${withAlpha(accentB, 0.74)}" /><path d="M-72 24 c-34 -4 -58 -18 -74 -42 c28 -8 54 0 78 26" fill="none" stroke="${withAlpha(accentA, 0.62)}" stroke-width="14" stroke-linecap="round" /><path d="M72 24 c34 -4 58 -18 74 -42 c-28 -8 -54 0 -78 26" fill="none" stroke="${withAlpha(accentA, 0.62)}" stroke-width="14" stroke-linecap="round" /></g>`;
    case 'palace':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="34" y="72" width="186" height="112" rx="20" fill="${withAlpha(accentA, 0.42)}" /><path d="M12 72 l116 -68 l116 68 z" fill="${withAlpha(accentB, 0.74)}" /><rect x="102" y="112" width="44" height="72" rx="16" fill="${withAlpha(ink, 0.18)}" /></g>`;
    case 'spear':
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 v180" stroke="${withAlpha(ink, 0.72)}" stroke-width="8" stroke-linecap="round" /><path d="M10 18 h70 l-16 34 l16 34 h-70 z" fill="${withAlpha(accentA, 0.72)}" /><path d="M0 -12 l18 18 l-18 18 l-18 -18 z" fill="${withAlpha(accentB, 0.8)}" /></g>`;
    case 'heart':
      return `<path d="M${x} ${y + 20 * s} c-18 -32 -60 -28 -68 6 c-8 28 12 54 68 88 c56 -34 76 -60 68 -88 c-8 -34 -50 -38 -68 -6 z" fill="${withAlpha(accentB, 0.76)}" />`;
    case 'brain':
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 24 c-36 0 -62 28 -62 60 c0 18 8 34 22 44 c6 26 28 42 58 42 c18 0 34 -6 46 -16 c12 10 28 16 46 16 c30 0 52 -16 58 -42 c14 -10 22 -26 22 -44 c0 -32 -26 -60 -62 -60 c-8 -34 -34 -54 -64 -54 c-18 0 -34 8 -46 22 c-12 -14 -28 -22 -46 -22 c-30 0 -56 20 -64 54 z" fill="${withAlpha(accentA, 0.72)}" /><path d="M-36 40 c10 10 18 24 18 42 M6 18 c14 14 22 32 22 54 M50 26 c16 12 28 30 32 56" fill="none" stroke="${withAlpha(accentB, 0.58)}" stroke-width="10" stroke-linecap="round" /></g>`;
    case 'device':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="164" height="216" rx="28" fill="${withAlpha('#ffffff', 0.92)}" /><rect x="16" y="20" width="132" height="118" rx="18" fill="${withAlpha(accentA, 0.34)}" /><rect x="50" y="160" width="64" height="10" rx="5" fill="${withAlpha(ink, 0.16)}" /><rect x="38" y="182" width="88" height="10" rx="5" fill="${withAlpha(accentB, 0.68)}" /></g>`;
    case 'calendar':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="178" height="188" rx="28" fill="${withAlpha('#ffffff', 0.92)}" /><rect x="0" y="0" width="178" height="48" rx="28" fill="${withAlpha(accentB, 0.72)}" /><circle cx="42" cy="24" r="8" fill="${withAlpha('#ffffff', 0.88)}" /><circle cx="136" cy="24" r="8" fill="${withAlpha('#ffffff', 0.88)}" /><text x="46" y="116" fill="${withAlpha(ink, 0.78)}" font-family="Segoe UI, sans-serif" font-size="70" font-weight="800">28</text></g>`;
    case 'book':
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 c40 -28 90 -34 148 -18 v124 c-58 -16 -108 -10 -148 18 z" fill="${withAlpha('#ffffff', 0.92)}" /><path d="M148 -18 c58 -16 108 -10 148 18 v124 c-40 -28 -90 -34 -148 -18 z" fill="${withAlpha('#ffffff', 0.84)}" /><path d="M148 -18 v142" stroke="${withAlpha(accentA, 0.34)}" stroke-width="8" /><path d="M42 36 h70 M42 58 h82 M42 80 h64" stroke="${withAlpha(ink, 0.14)}" stroke-width="8" stroke-linecap="round" /><path d="M184 36 h78 M184 58 h68 M184 80 h86" stroke="${withAlpha(accentB, 0.34)}" stroke-width="8" stroke-linecap="round" /></g>`;
    case 'hill':
      return `<path d="M${x} ${y} c52 -44 98 -54 154 -30 c34 14 64 14 92 0 c28 -14 56 -18 92 -6 v108 h-338 z" fill="${withAlpha(accentA, 0.24)}" />`;
    case 'barn':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="26" y="60" width="138" height="108" rx="20" fill="${withAlpha(accentA, 0.5)}" /><path d="M0 60 l96 -60 l96 60 z" fill="${withAlpha(accentB, 0.74)}" /><rect x="80" y="98" width="30" height="70" rx="14" fill="${withAlpha(ink, 0.18)}" /></g>`;
    case 'notebook':
      return `<g transform="translate(${x} ${y}) scale(${s}) rotate(-6)"><rect x="0" y="0" width="178" height="220" rx="28" fill="${withAlpha('#ffffff', 0.92)}" /><rect x="0" y="0" width="34" height="220" rx="18" fill="${withAlpha(accentA, 0.52)}" /><path d="M56 42 h88 M56 74 h88 M56 106 h88 M56 138 h68" stroke="${withAlpha(ink, 0.14)}" stroke-width="10" stroke-linecap="round" /><rect x="56" y="170" width="62" height="22" rx="11" fill="${withAlpha(accentB, 0.62)}" /></g>`;
    case 'pencil':
      return `<g transform="translate(${x} ${y}) scale(${s}) rotate(18)"><rect x="0" y="0" width="28" height="150" rx="14" fill="${withAlpha(accentB, 0.8)}" /><path d="M14 -28 l18 28 h-36 z" fill="${withAlpha('#ffffff', 0.82)}" /><path d="M14 -16 l8 12 h-16 z" fill="${withAlpha(ink, 0.78)}" /></g>`;
    case 'diary':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="164" height="212" rx="28" fill="${withAlpha(accentB, 0.58)}" /><rect x="18" y="18" width="128" height="176" rx="22" fill="${withAlpha('#ffffff', 0.92)}" /><path d="M46 60 h68 M46 88 h82 M46 116 h74" stroke="${withAlpha(ink, 0.14)}" stroke-width="8" stroke-linecap="round" /><rect x="46" y="146" width="52" height="22" rx="11" fill="${withAlpha(accentA, 0.56)}" /></g>`;
    case 'steam':
      return `<path d="M${x} ${y} c-8 -12 -8 -24 0 -36 M${x + 22 * s} ${y} c-8 -12 -8 -24 0 -36" fill="none" stroke="${withAlpha(ink, 0.42)}" stroke-width="6" stroke-linecap="round" />`;
    case 'phone':
      return `<g transform="translate(${x} ${y}) scale(${s}) rotate(-6)"><rect x="0" y="0" width="112" height="198" rx="24" fill="${withAlpha('#ffffff', 0.92)}" /><rect x="12" y="22" width="88" height="136" rx="18" fill="${withAlpha(accentA, 0.42)}" /><circle cx="56" cy="176" r="10" fill="${withAlpha(ink, 0.16)}" /></g>`;
    case 'ring':
      return `<g><circle cx="${x}" cy="${y}" r="${18 * s}" fill="${withAlpha(accentB, 0.72)}" /><circle cx="${x}" cy="${y}" r="${40 * s}" fill="none" stroke="${withAlpha(accentB, 0.42)}" stroke-width="8" /><circle cx="${x}" cy="${y}" r="${62 * s}" fill="none" stroke="${withAlpha(accentB, 0.22)}" stroke-width="8" /></g>`;
    case 'family':
      return `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="24" cy="22" r="18" fill="${withAlpha(ink, 0.82)}" /><circle cx="82" cy="10" r="22" fill="${withAlpha(ink, 0.84)}" /><circle cx="138" cy="24" r="18" fill="${withAlpha(ink, 0.82)}" /><rect x="8" y="46" width="34" height="86" rx="17" fill="${withAlpha(accentA, 0.56)}" /><rect x="62" y="34" width="40" height="108" rx="20" fill="${withAlpha(accentB, 0.66)}" /><rect x="122" y="46" width="34" height="86" rx="17" fill="${withAlpha(accentA, 0.56)}" /></g>`;
    case 'window':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="124" height="132" rx="22" fill="${withAlpha('#ffffff', 0.16)}" /><path d="M62 0 v132 M0 66 h124" stroke="${withAlpha(accentA, 0.32)}" stroke-width="8" /></g>`;
    case 'bubble':
      return `<g><path d="M${x} ${y} h86 a18 18 0 0 1 18 18 v30 a18 18 0 0 1 -18 18 h-34 l-16 16 v-16 h-36 a18 18 0 0 1 -18 -18 v-30 a18 18 0 0 1 18 -18 z" fill="${withAlpha(accentA, 0.48)}" /><path d="M${x + 114} ${y + 42} h98 a18 18 0 0 1 18 18 v28 a18 18 0 0 1 -18 18 h-38 l-16 16 v-16 h-44 a18 18 0 0 1 -18 -18 v-28 a18 18 0 0 1 18 -18 z" fill="${withAlpha(accentB, 0.46)}" /></g>`;
    case 'crown':
      return `<path d="M${x} ${y + 40 * s} l18 -40 l28 24 l28 -24 l18 40 v18 h-92 z" fill="${withAlpha(accentB, 0.8)}" />`;
    case 'compass':
      return `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="0" r="56" fill="none" stroke="${withAlpha(accentA, 0.66)}" stroke-width="10" /><path d="M0 -46 l14 36 h-28 z M0 46 l-14 -36 h28 z M-46 0 l36 14 v-28 z M46 0 l-36 -14 v28 z" fill="${withAlpha(accentB, 0.74)}" /></g>`;
    case 'phoenix':
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 84 c32 -64 84 -106 152 -112 c-16 32 -24 54 -22 70 c34 12 54 34 62 64 c-30 -12 -54 -14 -70 -6 c-10 28 -30 50 -60 68 c-34 20 -76 32 -126 36 c26 -20 40 -42 42 -66 c-22 -6 -40 -18 -52 -34 c28 2 52 -6 74 -20 z" fill="${withAlpha(accentA, 0.74)}" /><path d="M60 86 c26 -34 64 -54 114 -60 c-18 22 -26 40 -22 56 c22 8 38 22 44 42 c-16 -6 -30 -6 -42 0 c-10 24 -30 40 -60 50 c14 -16 22 -34 22 -50 c-18 0 -34 -8 -46 -22 z" fill="${withAlpha(accentB, 0.76)}" /></g>`;
    case 'mountain':
      return `<path d="M${x} ${y} l76 -92 l72 72 l58 -64 l74 84 l56 -48 l52 48 v84 h-388 z" fill="${withAlpha(ink, 0.12)}" />`;
    case 'waterfall':
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 h92 v180 l-28 40 h-64 z" fill="${withAlpha(ink, 0.16)}" /><path d="M92 0 h84 l-24 90 l18 130 h-78 z" fill="${withAlpha(ink, 0.12)}" /><path d="M68 0 h36 v218 h-36 z" fill="${withAlpha(accentA, 0.74)}" /><path d="M92 218 c36 14 68 16 96 6" fill="none" stroke="${withAlpha(accentB, 0.66)}" stroke-width="14" stroke-linecap="round" /></g>`;
    case 'tent':
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 66 l54 -72 l54 72 z" fill="${withAlpha(accentA, 0.66)}" /><path d="M84 74 l44 -56 l44 56 z" fill="${withAlpha(accentB, 0.66)}" /><path d="M-18 88 h174" stroke="${withAlpha(ink, 0.18)}" stroke-width="10" stroke-linecap="round" /></g>`;
    case 'journal':
      return `<g transform="translate(${x} ${y}) scale(${s}) rotate(-4)"><rect x="0" y="0" width="178" height="212" rx="30" fill="${withAlpha('#ffffff', 0.92)}" /><rect x="20" y="18" width="138" height="24" rx="12" fill="${withAlpha(accentA, 0.42)}" /><path d="M34 68 h104 M34 98 h104 M34 128 h80 M34 158 h96" stroke="${withAlpha(ink, 0.14)}" stroke-width="10" stroke-linecap="round" /><rect x="34" y="182" width="54" height="18" rx="9" fill="${withAlpha(accentB, 0.68)}" /></g>`;
    case 'gear':
      return `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="0" r="42" fill="${withAlpha(accentB, 0.62)}" /><circle cx="0" cy="0" r="18" fill="${withAlpha('#ffffff', 0.72)}" /><path d="M0 -56 v18 M0 56 v-18 M56 0 h-18 M-56 0 h18 M40 -40 l-12 12 M-40 40 l12 -12 M-40 -40 l12 12 M40 40 l-12 -12" stroke="${withAlpha(ink, 0.58)}" stroke-width="8" stroke-linecap="round" /></g>`;
    case 'network':
      return `<g><circle cx="${x}" cy="${y}" r="${18 * s}" fill="${withAlpha(accentA, 0.74)}" /><circle cx="${x + 86 * s}" cy="${y + 54 * s}" r="${16 * s}" fill="${withAlpha(accentB, 0.72)}" /><circle cx="${x + 168 * s}" cy="${y + 6 * s}" r="${18 * s}" fill="${withAlpha(accentA, 0.74)}" /><circle cx="${x + 226 * s}" cy="${y + 90 * s}" r="${16 * s}" fill="${withAlpha(accentB, 0.72)}" /><path d="M${x + 18 * s} ${y} l${68 * s} ${54 * s} l${82 * s} ${-48 * s} l${58 * s} ${84 * s}" fill="none" stroke="${withAlpha('#ffffff', 0.34)}" stroke-width="8" stroke-linecap="round" /></g>`;
    case 'server':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="132" height="40" rx="16" fill="${withAlpha('#ffffff', 0.9)}" /><rect x="0" y="56" width="132" height="40" rx="16" fill="${withAlpha('#ffffff', 0.82)}" /><rect x="0" y="112" width="132" height="40" rx="16" fill="${withAlpha('#ffffff', 0.74)}" /><circle cx="24" cy="20" r="6" fill="${withAlpha(accentA, 0.78)}" /><circle cx="24" cy="76" r="6" fill="${withAlpha(accentB, 0.78)}" /><circle cx="24" cy="132" r="6" fill="${withAlpha(accentA, 0.78)}" /></g>`;
    case 'code':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="220" height="180" rx="28" fill="${withAlpha('#0a1222', 0.76)}" stroke="${withAlpha('#ffffff', 0.14)}" /><circle cx="28" cy="24" r="6" fill="${withAlpha(accentB, 0.8)}" /><circle cx="48" cy="24" r="6" fill="${withAlpha(accentA, 0.8)}" /><path d="M34 64 h56 M104 64 h80 M34 98 h144 M34 132 h84" stroke="${withAlpha('#ffffff', 0.22)}" stroke-width="10" stroke-linecap="round" /><rect x="34" y="150" width="58" height="12" rx="6" fill="${withAlpha(accentB, 0.68)}" /></g>`;
    case 'chart':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="224" height="164" rx="26" fill="${withAlpha('#ffffff', 0.9)}" /><path d="M24 128 h170 M24 28 v100" stroke="${withAlpha(ink, 0.28)}" stroke-width="8" stroke-linecap="round" /><path d="M42 128 l12 -40 l18 24 l18 -68 l18 58 l18 -82 l16 110 l18 -40 l18 -22" fill="none" stroke="${withAlpha(accentA, 0.82)}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" /></g>`;
    case 'lattice':
      return Array.from({ length: 4 }, (_, row) => Array.from({ length: 5 }, (_, col) => {
        const cx = x + col * 52 * s;
        const cy = y + row * 52 * s;
        const node = row === 1 && col === 2
          ? `<circle cx="${cx}" cy="${cy}" r="${18 * s}" fill="none" stroke="${withAlpha(accentB, 0.82)}" stroke-width="${6 * s}" />`
          : `<circle cx="${cx}" cy="${cy}" r="${11 * s}" fill="${withAlpha((row + col) % 2 ? accentB : accentA, 0.72)}" />`;
        const h = col < 4 ? `<path d="M${cx + 11 * s} ${cy} h${30 * s}" stroke="${withAlpha('#ffffff', 0.24)}" stroke-width="${6 * s}" />` : '';
        const v = row < 3 ? `<path d="M${cx} ${cy + 11 * s} v${30 * s}" stroke="${withAlpha('#ffffff', 0.24)}" stroke-width="${6 * s}" />` : '';
        return node + h + v;
      }).join('')).join('');
    case 'furnace':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="176" height="158" rx="28" fill="${withAlpha('#ffffff', 0.88)}" /><rect x="24" y="28" width="128" height="82" rx="18" fill="${withAlpha(accentA, 0.4)}" /><rect x="50" y="124" width="76" height="18" rx="9" fill="${withAlpha(accentB, 0.72)}" /><circle cx="148" cy="124" r="12" fill="${withAlpha(ink, 0.18)}" /></g>`;
    case 'battery':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="162" height="202" rx="30" fill="${withAlpha('#ffffff', 0.92)}" /><rect x="54" y="-18" width="54" height="24" rx="12" fill="${withAlpha(ink, 0.22)}" /><rect x="22" y="32" width="118" height="138" rx="24" fill="${withAlpha(accentA, 0.34)}" /><path d="M72 58 l-18 50 h30 l-18 54 l48 -68 h-26 l16 -36 z" fill="${withAlpha(accentB, 0.84)}" /></g>`;
    case 'bolt':
      return `<path d="M${x} ${y} l34 -52 h-24 l34 -64 l-14 52 h28 z" fill="${withAlpha(accentB, 0.86)}" />`;
    case 'cube':
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 44 l76 -44 l76 44 l-76 44 z" fill="${withAlpha(accentB, 0.72)}" /><path d="M0 44 v88 l76 44 v-88 z" fill="${withAlpha(accentA, 0.64)}" /><path d="M152 44 v88 l-76 44 v-88 z" fill="${withAlpha('#ffffff', 0.46)}" /></g>`;
    case 'shield':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="132" height="176" rx="26" fill="${withAlpha('#ffffff', 0.9)}" /><path d="M32 34 h66 M32 58 h66 M32 82 h50" stroke="${withAlpha(ink, 0.14)}" stroke-width="8" stroke-linecap="round" /><path d="M96 72 l48 18 v44 c0 30 -18 54 -48 70 c-30 -16 -48 -40 -48 -70 V90 z" fill="${withAlpha(accentA, 0.64)}" /><path d="M96 108 l10 18 l22 4 l-16 16 l4 22 l-20 -12 l-20 12 l4 -22 l-16 -16 l22 -4 z" fill="${withAlpha(accentB, 0.84)}" /></g>`;
    case 'wave':
      return `<path d="M${x} ${y} c30 -22 60 -22 90 0 c30 22 60 22 90 0 c30 -22 60 -22 90 0" fill="none" stroke="${withAlpha(accentA, 0.64)}" stroke-width="10" stroke-linecap="round" />`;
    case 'chip':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="156" height="156" rx="28" fill="${withAlpha('#ffffff', 0.9)}" /><rect x="34" y="34" width="88" height="88" rx="20" fill="${withAlpha(accentA, 0.56)}" /><path d="M20 20 h-20 M20 52 h-20 M20 84 h-20 M20 116 h-20 M156 20 h20 M156 52 h20 M156 84 h20 M156 116 h20 M20 20 v-20 M52 20 v-20 M84 20 v-20 M116 20 v-20 M20 156 v20 M52 156 v20 M84 156 v20 M116 156 v20" stroke="${withAlpha(accentB, 0.62)}" stroke-width="8" stroke-linecap="round" /></g>`;
    case 'warning':
      return `<g><path d="M${x} ${y - 62 * s} l${62 * s} ${108 * s} h-${124 * s} z" fill="${withAlpha(accentB, 0.84)}" /><rect x="${x - 6 * s}" y="${y - 26 * s}" width="${12 * s}" height="${42 * s}" rx="${6 * s}" fill="${withAlpha(ink, 0.82)}" /><circle cx="${x}" cy="${y + 32 * s}" r="${7 * s}" fill="${withAlpha(ink, 0.82)}" /></g>`;
    case 'music':
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 v94 c0 16 -12 28 -28 28 s-28 -12 -28 -28 s12 -28 28 -28 c10 0 20 4 28 10 v-54 l94 -20 v84 c0 16 -12 28 -28 28 s-28 -12 -28 -28 s12 -28 28 -28 c10 0 20 4 28 10 v-40 z" fill="${withAlpha(accentA, 0.76)}" /><circle cx="120" cy="10" r="18" fill="${withAlpha(accentB, 0.66)}" /></g>`;
    case 'periodic':
      return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="0" y="0" width="188" height="148" rx="24" fill="${withAlpha('#ffffff', 0.18)}" />${Array.from({ length: 3 }, (_, row) => Array.from({ length: 5 }, (_, col) => `<rect x="${18 + col * 32}" y="${20 + row * 32}" width="24" height="24" rx="6" fill="${withAlpha((row + col) % 2 ? accentA : accentB, 0.62)}" />`).join('')).join('')}<text x="126" y="124" fill="${withAlpha(ink, 0.78)}" font-family="Segoe UI, sans-serif" font-size="46" font-weight="800">H</text></g>`;
    case 'flask':
      return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M22 0 h28 v38 l34 78 c8 18 -4 36 -24 36 h-76 c-20 0 -32 -18 -24 -36 l34 -78 z" fill="${withAlpha('#ffffff', 0.9)}" /><path d="M4 104 c18 -10 36 -12 54 -8 c12 4 26 4 42 0 c10 -2 20 -2 30 0" fill="${withAlpha(accentA, 0.64)}" /><circle cx="34" cy="92" r="8" fill="${withAlpha(accentB, 0.5)}" /><circle cx="66" cy="72" r="6" fill="${withAlpha(accentB, 0.42)}" /></g>`;
    default:
      return '';
  }
}

function hashString(input) {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let value = seed >>> 0;
  return function rng() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function slugify(value) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-');
}

function withAlpha(color, alpha) {
  if (color.startsWith('#') && color.length === 7) {
    const a = Math.max(0, Math.min(255, Math.round(Number(alpha) * 255)));
    return `${color}${a.toString(16).padStart(2, '0')}`;
  }
  return color;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

main();
