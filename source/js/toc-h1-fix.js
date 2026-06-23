(function () {
  'use strict';

  function decodeHtml(text) {
    var textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }

  function normalizeLabel(text) {
    return decodeHtml(text || '')
      .replace(/^¶\s*/, '')
      .replace(/^\d+(?:\.\d+)*\.?\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slugify(text) {
    var cleaned = normalizeLabel(text)
      .replace(/[~`!@#$%^&*()+=[\]{}|\\:;"'<>,.?/]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return cleaned || 'heading';
  }

  function buildUniqueId(base, usedIds) {
    var id = base;
    var seq = 2;
    while (usedIds[id] || document.getElementById(id)) {
      id = base + '-' + seq;
      seq += 1;
    }
    usedIds[id] = true;
    return id;
  }

  function applyTocH1Fix() {
    var toc = document.querySelector('#card-toc');
    var article = document.querySelector('#article-container');
    if (!toc || !article) return;

    var headings = article.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (!headings.length) return;

    var usedIds = {};
    var i;
    for (i = 0; i < headings.length; i++) {
      if (headings[i].id) {
        usedIds[headings[i].id] = true;
      }
    }

    var byText = {};
    var headingIdsInOrder = [];
    for (i = 0; i < headings.length; i++) {
      var heading = headings[i];
      if (!heading.id) {
        heading.id = buildUniqueId(slugify(heading.textContent), usedIds);
      }

      headingIdsInOrder.push(heading.id);
      var key = normalizeLabel(heading.textContent);
      if (!byText[key]) byText[key] = [];
      byText[key].push(heading.id);
    }

    var tocLinks = toc.querySelectorAll('.toc-link');
    var fallbackIndex = 0;

    for (i = 0; i < tocLinks.length; i++) {
      var link = tocLinks[i];
      var href = link.getAttribute('href');
      var label = normalizeLabel(link.textContent);
      var targetId = null;

      if (label && byText[label] && byText[label].length) {
        targetId = byText[label].shift();
      } else if (!href && fallbackIndex < headingIdsInOrder.length) {
        targetId = headingIdsInOrder[fallbackIndex];
      }

      if (!href || (href.charAt(0) === '#' && !document.getElementById(href.slice(1)))) {
        if (targetId) {
          link.setAttribute('href', '#' + targetId);
        }
      }

      if (fallbackIndex < headingIdsInOrder.length) {
        fallbackIndex += 1;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', applyTocH1Fix);
  document.addEventListener('pjax:complete', applyTocH1Fix);
})();
