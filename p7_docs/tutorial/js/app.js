/* ============================================================
   Olist ELT Academy — app engine
   Lessons self-register into window.TUTORIAL_LESSONS via the
   js/lessons/*.js files. This file renders nav, lessons,
   checklists, quizzes, and persists progress to localStorage.
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'olist-elt-academy-v1';

  var TRACKS = [
    { id: 'start', label: '🚀 Getting Started' },
    { id: 'technical', label: '🔧 Technical Track' },
    { id: 'business', label: '📊 Business Track' },
    { id: 'capstone', label: '🏆 Capstone' }
  ];

  var lessons = (window.TUTORIAL_LESSONS || []).slice().sort(function (a, b) {
    return a.order - b.order;
  });

  /* ---------- state ---------- */
  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) { return {}; }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  var state = loadState();
  state.completed = state.completed || {};   // lessonId -> true
  state.steps = state.steps || {};           // lessonId -> { idx: true }
  state.quiz = state.quiz || {};             // lessonId -> { idx: chosenOption }
  state.theme = state.theme || 'light';

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function lessonById(id) {
    for (var i = 0; i < lessons.length; i++) if (lessons[i].id === id) return lessons[i];
    return null;
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    $('#theme-toggle').textContent = state.theme === 'dark' ? '☀️' : '🌙';
    if (window.mermaid) {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: state.theme === 'dark' ? 'dark' : 'default',
          securityLevel: 'loose',
          flowchart: { useMaxWidth: true }
        });
      } catch (e) {}
    }
  }

  /* ---------- sidebar nav ---------- */
  function renderNav() {
    var nav = $('#lesson-nav');
    var html = '';
    TRACKS.forEach(function (track) {
      var items = lessons.filter(function (l) { return l.track === track.id; });
      if (!items.length) return;
      html += '<div class="nav-group"><div class="nav-group-title">' + track.label + '</div>';
      items.forEach(function (l) {
        var done = state.completed[l.id] ? ' done' : '';
        html += '<a class="nav-item' + done + '" href="#' + l.id + '" data-id="' + l.id + '">' +
          '<span class="nav-icon">' + (l.icon || '📄') + '</span>' +
          '<span class="nav-title">' + esc(l.title) + '</span>' +
          '<span class="nav-check">✔</span></a>';
      });
      html += '</div>';
    });
    nav.innerHTML = html;
  }

  function updateNavState(activeId) {
    $all('.nav-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-id') === activeId);
      el.classList.toggle('done', !!state.completed[el.getAttribute('data-id')]);
    });
    var doneCount = lessons.filter(function (l) { return state.completed[l.id]; }).length;
    var pct = lessons.length ? Math.round(100 * doneCount / lessons.length) : 0;
    $('#overall-pct').textContent = pct + '%';
    $('#overall-fill').style.width = pct + '%';
  }

  /* ---------- lesson rendering ---------- */
  function render(id) {
    var lesson = lessonById(id) || lessons[0];
    if (!lesson) return;
    var idx = lessons.indexOf(lesson);
    var prev = lessons[idx - 1];
    var next = lessons[idx + 1];
    var trackLabel = { start: 'Getting Started', technical: 'Technical', business: 'Business', capstone: 'Capstone' }[lesson.track] || lesson.track;

    var html = '';

    // header
    html += '<div class="lesson-header">' +
      '<div class="lesson-meta">' +
      '<span class="badge ' + lesson.track + '">' + trackLabel + '</span>' +
      '<span class="badge time">⏱ ~' + lesson.minutes + ' min</span>' +
      '<span class="badge time">Lesson ' + (idx + 1) + ' of ' + lessons.length + '</span>' +
      '</div>' +
      '<h1>' + (lesson.icon ? lesson.icon + ' ' : '') + esc(lesson.title) + '</h1>' +
      (lesson.subtitle ? '<p class="lesson-subtitle">' + esc(lesson.subtitle) + '</p>' : '') +
      '</div>';

    // objectives
    if (lesson.objectives && lesson.objectives.length) {
      html += '<div class="objectives"><h3>🎯 What you will learn</h3><ul>';
      lesson.objectives.forEach(function (o) { html += '<li>' + o + '</li>'; });
      html += '</ul></div>';
    }

    // body
    html += '<div class="lesson-body">' + lesson.body + '</div>';

    // steps checklist
    if (lesson.steps && lesson.steps.length) {
      var saved = state.steps[lesson.id] || {};
      html += '<div class="steps-section"><h2>✅ Hands-on checklist</h2>' +
        '<p class="steps-hint">Work through these against the real repo. Your ticks are saved locally.</p>';
      lesson.steps.forEach(function (s, i) {
        var checked = saved[i] ? ' checked' : '';
        html += '<label class="step-item' + (saved[i] ? ' checked' : '') + '" data-step="' + i + '">' +
          '<input type="checkbox"' + checked + '><span class="step-text">' + s + '</span></label>';
      });
      html += '</div>';
    }

    // quiz
    if (lesson.quiz && lesson.quiz.length) {
      html += '<div class="quiz-section"><h2>🧠 Check your understanding</h2>';
      lesson.quiz.forEach(function (q, qi) {
        html += '<div class="quiz-q" data-q="' + qi + '"><div class="q-text">' + (qi + 1) + '. ' + q.q + '</div>';
        q.options.forEach(function (opt, oi) {
          html += '<div class="quiz-opt" data-opt="' + oi + '">' + opt + '</div>';
        });
        html += '<div class="quiz-explain">' + (q.explain || '') + '</div></div>';
      });
      html += '<div class="quiz-score" id="quiz-score"></div></div>';
    }

    // footer nav
    var isDone = !!state.completed[lesson.id];
    html += '<div class="lesson-footer">';
    html += prev
      ? '<a class="nav-btn prev" href="#' + prev.id + '"><span class="dir">← Previous</span><span class="name">' + esc(prev.title) + '</span></a>'
      : '<span></span>';
    html += '<button class="complete-btn' + (isDone ? ' done' : '') + '" id="complete-btn">' +
      (isDone ? '✔ Completed' : 'Mark lesson complete') + '</button>';
    html += next
      ? '<a class="nav-btn next" href="#' + next.id + '"><span class="dir">Next →</span><span class="name">' + esc(next.title) + '</span></a>'
      : '<span></span>';
    html += '</div>';

    $('#content').innerHTML = html;
    window.scrollTo(0, 0);
    updateNavState(lesson.id);
    wireLesson(lesson);
    renderExtras();
  }

  /* ---------- post-render: highlight, mermaid, copy ---------- */
  function renderExtras() {
    // syntax highlighting
    if (window.hljs) {
      $all('.lesson-body pre code').forEach(function (block) {
        try { hljs.highlightElement(block); } catch (e) {}
      });
    }
    // copy buttons
    $all('.lesson-body pre').forEach(function (pre) {
      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', function () {
        var code = pre.querySelector('code');
        var text = code ? code.innerText : pre.innerText;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function () {
            btn.textContent = 'Copied!';
            setTimeout(function () { btn.textContent = 'Copy'; }, 1400);
          });
        }
      });
      pre.appendChild(btn);
    });
    // mermaid
    if (window.mermaid) {
      var nodes = $all('.mermaid');
      if (nodes.length) {
        nodes.forEach(function (n, i) {
          if (!n.getAttribute('data-src')) n.setAttribute('data-src', n.textContent);
          n.removeAttribute('data-processed');
          n.textContent = n.getAttribute('data-src');
          n.id = 'mermaid-' + Date.now() + '-' + i;
        });
        try { mermaid.run({ nodes: nodes }); } catch (e) {}
      }
    }
  }

  /* ---------- per-lesson interactivity ---------- */
  function wireLesson(lesson) {
    // steps
    $all('.step-item').forEach(function (item) {
      item.addEventListener('change', function () {
        var i = item.getAttribute('data-step');
        var cb = item.querySelector('input');
        state.steps[lesson.id] = state.steps[lesson.id] || {};
        if (cb.checked) state.steps[lesson.id][i] = true;
        else delete state.steps[lesson.id][i];
        item.classList.toggle('checked', cb.checked);
        saveState();
      });
    });

    // quiz
    var quizState = state.quiz[lesson.id] || {};
    function paintQuiz() {
      var answered = 0, correct = 0;
      $all('.quiz-q').forEach(function (qEl) {
        var qi = +qEl.getAttribute('data-q');
        var q = lesson.quiz[qi];
        var chosen = quizState[qi];
        var opts = $all('.quiz-opt', qEl);
        opts.forEach(function (oEl) {
          var oi = +oEl.getAttribute('data-opt');
          oEl.classList.remove('selected', 'correct', 'wrong');
          if (chosen !== undefined) {
            if (oi === q.answer) oEl.classList.add('correct');
            else if (oi === chosen) oEl.classList.add('wrong');
          }
        });
        var expl = $('.quiz-explain', qEl);
        if (expl) expl.classList.toggle('show', chosen !== undefined);
        if (chosen !== undefined) {
          answered++;
          if (chosen === q.answer) correct++;
        }
      });
      var score = $('#quiz-score');
      if (score) {
        score.textContent = answered === lesson.quiz.length
          ? 'Score: ' + correct + ' / ' + lesson.quiz.length + (correct === lesson.quiz.length ? ' 🎉 Perfect!' : ' — review the explanations above.')
          : (answered ? answered + ' of ' + lesson.quiz.length + ' answered…' : '');
      }
    }
    $all('.quiz-opt').forEach(function (oEl) {
      oEl.addEventListener('click', function () {
        var qEl = oEl.closest('.quiz-q');
        var qi = +qEl.getAttribute('data-q');
        if (quizState[qi] !== undefined) return; // lock after first answer
        quizState[qi] = +oEl.getAttribute('data-opt');
        state.quiz[lesson.id] = quizState;
        saveState();
        paintQuiz();
      });
    });
    if (lesson.quiz && lesson.quiz.length) paintQuiz();

    // complete button
    var btn = $('#complete-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        state.completed[lesson.id] = !state.completed[lesson.id];
        if (!state.completed[lesson.id]) delete state.completed[lesson.id];
        saveState();
        btn.classList.toggle('done', !!state.completed[lesson.id]);
        btn.textContent = state.completed[lesson.id] ? '✔ Completed' : 'Mark lesson complete';
        updateNavState(lesson.id);
      });
    }
  }

  /* ---------- search ---------- */
  function wireSearch() {
    var input = $('#search-input');
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      $all('.nav-item').forEach(function (el) {
        var l = lessonById(el.getAttribute('data-id'));
        var hay = (l.title + ' ' + (l.subtitle || '') + ' ' + (l.body || '')).toLowerCase();
        el.classList.toggle('hidden-by-search', q && hay.indexOf(q) === -1);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      }
    });
  }

  /* ---------- routing ---------- */
  function route() {
    var id = location.hash.replace('#', '') || (lessons[0] && lessons[0].id);
    render(id);
    var sb = $('#sidebar');
    if (sb) sb.classList.remove('open');
  }

  /* ---------- boot ---------- */
  function boot() {
    applyTheme();
    renderNav();
    wireSearch();
    route();
    window.addEventListener('hashchange', route);

    $('#theme-toggle').addEventListener('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      saveState();
      applyTheme();
      route(); // re-render mermaid with new theme
    });

    $('#reset-progress').addEventListener('click', function () {
      if (confirm('Reset all progress (completed lessons, checklists, quiz answers)?')) {
        state = { completed: {}, steps: {}, quiz: {}, theme: state.theme };
        saveState();
        route();
      }
    });

    $('#hamburger').addEventListener('click', function () {
      $('#sidebar').classList.toggle('open');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
