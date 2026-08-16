/**
 * Reader.js — 通用小说阅读器功能模块
 * 功能：阅读进度保存、回到顶部、浮动目录、上下章导航、字体调节、
 *       深色模式、书签、朗读、字数统计、阅读时长、选中复制、分享、评论
 */
(function () {
  'use strict';

  const STORY_ID = location.pathname.replace(/^.*\/|\.html$/g, '');
  const LS_PREFIX = 'reader_' + STORY_ID + '_';

  // ── State ──
  let fontScale = parseFloat(localStorage.getItem(LS_PREFIX + 'fontScale')) || 1;
  let darkMode = localStorage.getItem(LS_PREFIX + 'darkMode') === '1';
  let bookmarks = JSON.parse(localStorage.getItem(LS_PREFIX + 'bookmarks') || '[]');
  let ttsSpeaking = false;
  let ttsUtterance = null;

  // ── DOM helpers ──
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  // ── 1. Reading Progress Bar ──
  function initProgressBar() {
    // Remove any existing progress bar from inline scripts
    var existing = document.getElementById('progress');
    if (existing) existing.remove();
    var bar = document.createElement('div');
    bar.id = 'reader-progress';
    document.body.prepend(bar);
    window.addEventListener('scroll', function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var pct = h > 0 ? Math.min(100, (window.scrollY / h) * 100) : 0;
      bar.style.width = pct + '%';
    }, { passive: true });
  }

  // ── 2. Reading Position Save ──
  function initPositionSave() {
    var saved = localStorage.getItem(LS_PREFIX + 'scrollPos');
    if (saved) {
      var pos = parseFloat(saved);
      if (pos > 100) {
        setTimeout(function () { window.scrollTo({ top: pos, behavior: 'smooth' }); }, 300);
      }
    }
    var saveTimer;
    window.addEventListener('scroll', function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        var pct = h > 0 ? Math.round((window.scrollY / h) * 100) : 0;
        localStorage.setItem(LS_PREFIX + 'scrollPos', window.scrollY);
        localStorage.setItem(LS_PREFIX + 'progressPct', pct);
      }, 500);
    }, { passive: true });
  }

  // ── 3. Bottom Toolbar ──
  function initToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'reader-toolbar';
    toolbar.innerHTML = `
      <button id="btn-font-down" title="缩小字体">A-</button>
      <span id="font-size-label">${Math.round(fontScale * 100)}%</span>
      <button id="btn-font-up" title="放大字体">A+</button>
      <span class="sep"></span>
      <button id="btn-dark-mode" title="深色模式">🌙</button>
      <span class="sep"></span>
      <button id="btn-tts" title="朗读">🔊</button>
      <button id="btn-bookmark" title="添加书签">🔖</button>
      <button id="btn-share" title="分享">↗</button>
    `;
    document.body.appendChild(toolbar);

    // Show/hide on scroll
    let lastY = 0, toolbarTimer;
    window.addEventListener('scroll', function () {
      const y = window.scrollY;
      if (y > 400 && y < lastY - 20) {
        toolbar.classList.add('visible');
      } else if (y < 300 || y > lastY + 40) {
        toolbar.classList.remove('visible');
      }
      lastY = y;
      clearTimeout(toolbarTimer);
      if (y > 400) {
        toolbarTimer = setTimeout(function () { toolbar.classList.remove('visible'); }, 4000);
      }
    }, { passive: true });

    // Font size
    function applyFontScale() {
      document.documentElement.style.setProperty('--font-scale', fontScale);
      document.body.style.fontSize = (17 * fontScale) + 'px';
      const label = $('#font-size-label');
      if (label) label.textContent = Math.round(fontScale * 100) + '%';
      localStorage.setItem(LS_PREFIX + 'fontScale', fontScale);
    }
    $('#btn-font-down').addEventListener('click', function () {
      fontScale = Math.max(0.7, fontScale - 0.1);
      applyFontScale();
    });
    $('#btn-font-up').addEventListener('click', function () {
      fontScale = Math.min(2, fontScale + 0.1);
      applyFontScale();
    });
    applyFontScale();

    // Dark mode
    function applyDarkMode() {
      if (darkMode) {
        document.body.classList.add('dark-mode');
        $('#btn-dark-mode').textContent = '☀️';
      } else {
        document.body.classList.remove('dark-mode');
        $('#btn-dark-mode').textContent = '🌙';
      }
      localStorage.setItem(LS_PREFIX + 'darkMode', darkMode ? '1' : '0');
    }
    $('#btn-dark-mode').addEventListener('click', function () {
      darkMode = !darkMode;
      applyDarkMode();
    });
    applyDarkMode();

    // TTS
    $('#btn-tts').addEventListener('click', toggleTTS);

    // Bookmark
    $('#btn-bookmark').addEventListener('click', addBookmark);

    // Share
    $('#btn-share').addEventListener('click', sharePage);
  }

  // ── 4. Back to Top ──
  function initBackToTop() {
    const btn = document.createElement('button');
    btn.id = 'btn-back-to-top';
    btn.innerHTML = '↑';
    btn.title = '回到顶部';
    document.body.appendChild(btn);
    window.addEventListener('scroll', function () {
      btn.classList.toggle('visible', window.scrollY > 600);
    }, { passive: true });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── 5. Floating TOC Sidebar ──
  function initFloatingTOC() {
    const chapters = $$('.chapter[id]');
    const tocLinks = $$('.toc-list a[href]');
    if (chapters.length === 0) return;

    // Build sidebar content
    const listItems = chapters.map(function (ch) {
      const id = ch.id;
      const zh = ($('.ch-zh', ch) || {}).textContent || id;
      const en = ($('.ch-en', ch) || {}).textContent || '';
      const words = countWords(ch);
      return { id: id, zh: zh, en: en, words: words };
    });

    // Floating button
    const btn = document.createElement('button');
    btn.id = 'btn-toc-float';
    btn.innerHTML = '☰';
    btn.title = '目录';
    document.body.appendChild(btn);
    window.addEventListener('scroll', function () {
      btn.classList.toggle('visible', window.scrollY > 600);
    }, { passive: true });

    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'toc-overlay';
    document.body.appendChild(overlay);

    // Sidebar
    const sidebar = document.createElement('div');
    sidebar.id = 'toc-sidebar';
    sidebar.innerHTML = '<div class="toc-sidebar-header"><h3>目 录</h3><button class="toc-sidebar-close">×</button></div><ul class="toc-sidebar-list"></ul><div id="bookmarks-panel"><div style="font-size:0.82rem;color:var(--muted);margin-bottom:0.6rem;">书 签</div><div class="bm-list"></div></div>';
    document.body.appendChild(sidebar);

    const list = $('.toc-sidebar-list', sidebar);
    listItems.forEach(function (item) {
      const li = document.createElement('li');
      li.innerHTML = '<a href="#' + item.id + '">' + item.zh + '<span class="toc-sidebar-progress">' + item.words + ' 字 · 约 ' + Math.max(1, Math.round(item.words / 400)) + ' 分钟</span></a>';
      list.appendChild(li);
    });

    function open() { overlay.classList.add('open'); sidebar.classList.add('open'); renderBookmarks(); }
    function close() { overlay.classList.remove('open'); sidebar.classList.remove('open'); }
    btn.addEventListener('click', open);
    overlay.addEventListener('click', close);
    $('.toc-sidebar-close', sidebar).addEventListener('click', close);

    // Close on link click
    $$('.toc-sidebar-list a', sidebar).forEach(function (a) {
      a.addEventListener('click', function () { setTimeout(close, 200); });
    });

    // Highlight current chapter
    function updateActive() {
      let current = '';
      chapters.forEach(function (ch) {
        if (ch.getBoundingClientRect().top < 200) current = ch.id;
      });
      $$('.toc-sidebar-list a', sidebar).forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('href') === '#' + current);
      });
    }
    window.addEventListener('scroll', updateActive, { passive: true });
  }

  // ── 6. Chapter Navigation (prev/next) ──
  function initChapterNav() {
    const chapters = $$('.chapter[id]');
    if (chapters.length < 2) return;
    chapters.forEach(function (ch, i) {
      const nav = document.createElement('div');
      nav.className = 'chapter-nav';
      const prev = i > 0 ? '<a href="#' + chapters[i - 1].id + '">← ' + (($('.ch-zh', chapters[i - 1]) || {}).textContent || '上一章') + '</a>' : '<span class="nav-placeholder">←</span>';
      const next = i < chapters.length - 1 ? '<a href="#' + chapters[i + 1].id + '">' + (($('.ch-zh', chapters[i + 1]) || {}).textContent || '下一章') + ' →</a>' : '<span class="nav-placeholder">→</span>';
      nav.innerHTML = prev + next;
      ch.appendChild(nav);
    });
  }

  // ── 7. Reading Time & Word Count ──
  function countWords(el) {
    return (el.textContent || '').replace(/\s/g, '').length;
  }
  function initChapterMeta() {
    $$('.chapter[id]').forEach(function (ch) {
      const head = $('.chapter-head', ch);
      if (!head) return;
      const words = countWords(ch);
      const minutes = Math.max(1, Math.round(words / 400));
      const meta = document.createElement('div');
      meta.className = 'ch-meta';
      meta.textContent = words + ' 字 · 约 ' + minutes + ' 分钟';
      head.appendChild(meta);
    });
  }

  // ── 8. Bookmark System ──
  function addBookmark() {
    const y = window.scrollY;
    const chapters = $$('.chapter[id]');
    let chapterName = '';
    chapters.forEach(function (ch) {
      if (ch.offsetTop <= y + 100) {
        chapterName = ($('.ch-zh', ch) || {}).textContent || ch.id;
      }
    });
    const text = getVisibleParagraph();
    const snippet = text ? text.slice(0, 60) + '...' : '';
    const exists = bookmarks.find(function (b) { return Math.abs(b.pos - y) < 50; });
    if (exists) {
      showToast('已添加过此书签');
      return;
    }
    bookmarks.push({ pos: y, chapter: chapterName, snippet: snippet, time: Date.now() });
    saveBookmarks();
    showToast('已添加书签 — ' + chapterName);
  }

  function getVisibleParagraph() {
    const paras = $$('.story-para');
    for (var i = 0; i < paras.length; i++) {
      const r = paras[i].getBoundingClientRect();
      if (r.top > 0 && r.top < window.innerHeight * 0.7) return paras[i].textContent.trim();
    }
    return '';
  }

  function saveBookmarks() {
    localStorage.setItem(LS_PREFIX + 'bookmarks', JSON.stringify(bookmarks));
  }

  function renderBookmarks() {
    const panel = $('#bookmarks-panel');
    if (!panel) return;
    const list = $('.bm-list', panel);
    if (!list) return;
    if (bookmarks.length === 0) {
      list.innerHTML = '<div class="bm-empty">暂无书签</div>';
      panel.style.display = 'block';
      return;
    }
    panel.style.display = 'block';
    list.innerHTML = bookmarks.map(function (b, i) {
      return '<div class="bm-item" data-pos="' + b.pos + '">' +
        b.chapter + (b.snippet ? ' — ' + b.snippet : '') +
        '<span class="bm-delete" data-idx="' + i + '">×</span></div>';
    }).join('');
    // Click to navigate
    $$('.bm-item', list).forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.classList.contains('bm-delete')) return;
        window.scrollTo({ top: parseInt(el.dataset.pos), behavior: 'smooth' });
      });
    });
    // Delete
    $$('.bm-delete', list).forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        const idx = parseInt(el.dataset.idx);
        bookmarks.splice(idx, 1);
        saveBookmarks();
        renderBookmarks();
      });
    });
  }

  // ── 9. TTS (Text-to-Speech) ──
  function toggleTTS() {
    if (!('speechSynthesis' in window)) { showToast('浏览器不支持朗读功能'); return; }
    if (ttsSpeaking) {
      speechSynthesis.cancel();
      ttsSpeaking = false;
      $('#btn-tts').textContent = '🔊';
      $('#btn-tts').classList.remove('active');
      return;
    }
    // Get visible chapter text
    const chapters = $$('.chapter[id]');
    let targetChapter = chapters[0];
    chapters.forEach(function (ch) {
      if (ch.getBoundingClientRect().top < 200) targetChapter = ch;
    });
    const text = (targetChapter.textContent || '').trim();
    if (!text) { showToast('没有可朗读的内容'); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    utterance.onstart = function () {
      ttsSpeaking = true;
      $('#btn-tts').textContent = '⏹';
      $('#btn-tts').classList.add('active');
    };
    utterance.onend = function () {
      ttsSpeaking = false;
      $('#btn-tts').textContent = '🔊';
      $('#btn-tts').classList.remove('active');
    };
    utterance.onerror = function () {
      ttsSpeaking = false;
      $('#btn-tts').textContent = '🔊';
      $('#btn-tts').classList.remove('active');
    };
    ttsUtterance = utterance;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  // ── 10. Selection Copy with Attribution ──
  function initSelectionCopy() {
    const tooltip = document.createElement('div');
    tooltip.id = 'selection-tooltip';
    tooltip.innerHTML = '<button id="btn-copy-sel">复制并分享</button>';
    document.body.appendChild(tooltip);

    document.addEventListener('mouseup', function (e) {
      const sel = window.getSelection();
      const text = (sel.toString() || '').trim();
      if (text.length < 5) { tooltip.style.display = 'none'; return; }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      tooltip.style.display = 'block';
      tooltip.style.left = Math.min(rect.left + rect.width / 2, window.innerWidth - 120) + 'px';
      tooltip.style.top = (rect.top + window.scrollY - 44) + 'px';
    });

    $('#btn-copy-sel').addEventListener('click', function () {
      const text = (window.getSelection().toString() || '').trim();
      const title = document.title.split('·')[0].trim();
      const attr = '\n\n—— 《' + title + '》 ' + location.href;
      navigator.clipboard.writeText(text + attr).then(function () {
        showToast('已复制到剪贴板');
        tooltip.style.display = 'none';
        window.getSelection().removeAllRanges();
      }).catch(function () {
        showToast('复制失败，请重试');
      });
    });

    document.addEventListener('mousedown', function (e) {
      if (!tooltip.contains(e.target)) tooltip.style.display = 'none';
    });
  }

  // ── 11. Share ──
  function sharePage() {
    const url = location.href;
    const title = document.title;
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () {});
    } else {
      navigator.clipboard.writeText(title + '\n' + url).then(function () {
        showToast('链接已复制到剪贴板');
      }).catch(function () {
        showToast('复制失败，请手动复制地址栏链接');
      });
    }
  }

  // ── 12. Toast ──
  function showToast(msg) {
    var toast = $('#share-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'share-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 2000);
  }

  // ── 13. Giscus Comments ──
  // 需要在 GitHub 仓库 Settings > Features 中启用 Discussions，
  // 并在 https://giscus.app 配置后替换下面的 data-repo-id 和 data-category-id
  function initGiscus() {
    var container = document.createElement('div');
    container.id = 'giscus-container';
    container.innerHTML = '<h3>留言</h3>';
    var footer = document.querySelector('footer');
    if (footer) {
      footer.parentNode.insertBefore(container, footer);
    } else {
      var wrap = document.querySelector('.wrap');
      if (wrap) {
        wrap.parentNode.insertBefore(container, wrap.nextSibling);
      } else {
        document.body.appendChild(container);
      }
    }
    var script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.setAttribute('data-repo', 'SoleFish8/meet-you-summer');
    script.setAttribute('data-repo-id', 'R_kgDOOZyecw');
    script.setAttribute('data-category', 'General');
    script.setAttribute('data-category-id', 'DIC_kwDOOZyec84CpZ-X');
    script.setAttribute('data-mapping', 'pathname');
    script.setAttribute('data-strict', '0');
    script.setAttribute('data-reactions-enabled', '1');
    script.setAttribute('data-emit-metadata', '0');
    script.setAttribute('data-input-position', 'bottom');
    script.setAttribute('data-theme', 'preferred_color_scheme');
    script.setAttribute('data-lang', 'zh-CN');
    script.setAttribute('crossorigin', 'anonymous');
    script.async = true;
    script.onerror = function () {
      container.innerHTML = '<h3>留言</h3><p style="text-align:center;color:var(--muted);font-size:0.85rem;">评论系统需要在 GitHub 仓库中启用 Discussions 并配置 Giscus。<br>详情请参考 <a href="https://giscus.app/zh-CN" target="_blank" rel="noopener" style="color:var(--accent);">giscus.app</a></p>';
    };
    container.appendChild(script);
  }

  // ── 14. Smooth Scroll (already in CSS, but ensure anchor clicks are smooth) ──
  function initSmoothScroll() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // ── Init All ──
  function init() {
    initProgressBar();
    initPositionSave();
    initToolbar();
    initBackToTop();
    initFloatingTOC();
    initChapterNav();
    initChapterMeta();
    initSmoothScroll();
    initSelectionCopy();
    initGiscus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();