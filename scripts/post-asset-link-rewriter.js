'use strict';

const path = require('path');

hexo.extend.filter.register('after_render:html', (str, data) => {
  if (!str || typeof str !== 'string' || !data || !data.path) return str;

  const route = data.path.replace(/\\/g, '/');
  if (!route.endsWith('/index.html')) return str;

  const dirname = path.basename(path.dirname(route));
  if (!dirname) return str;

  const variants = [encodeURIComponent(dirname), dirname];

  let out = str;
  for (const prefix of variants) {
    if (!prefix) continue;
    const re = new RegExp(
      `(href=["'])${escapeRegex(prefix)}/([^"']+)(["'])`,
      'g'
    );
    out = out.replace(re, '$1$2$3');
  }

  return out;
});

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
