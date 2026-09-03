// Устуу-Хурээ — рендер контента из data.json
(function () {
  'use strict';

  var BADGE_VARIANTS = {
    primary: 'badge-primary',
    time: 'badge-time',
    muted: 'badge-muted',
    outline: 'badge-outline',
    tag: 'badge-tag'
  };
  var TIME_VARIANTS = {
    primary: 'badge-primary',
    time: 'badge-time',
    muted: ''
  };
  var MOON_VARIANTS = { '8': 'moon-day-8', '15': 'moon-day-15', '30': 'moon-day-30' };

  function get(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Текст из data.json может содержать <strong>/<a> — разрешаем только их.
  function rich(s) {
    var escaped = String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped
      .replace(/&lt;(\/?(strong|em|br))&gt;/g, '<$1>')
      .replace(/&lt;a\s+class="link"\s+href="([^"]*)"\s*&gt;/g, '<a class="link" href="$1">')
      .replace(/&lt;\/a&gt;/g, '</a>');
  }
  function ic(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" aria-hidden="true"><use href="assets/icons/sprite.svg#i-' + name + '"/></svg>';
  }
  function bindText(root, data, path) {
    var el = root.querySelector('[data-bind="' + path + '"]');
    var v = get(data, path);
    if (el && v != null) {
      if (el.classList.contains('rich')) el.innerHTML = rich(v); else el.textContent = v;
    }
  }
  function bindAttr(root, data, path, attr, suffix) {
    var el = root.querySelector('[' + (attr === 'href' ? 'data-bind-href' : 'data-bind-' + attr) + '="' + path + '"]');
    if (!el) el = root.querySelector('[data-bind="' + path + '"]');
    var v = get(data, path);
    if (el && v != null) el.setAttribute(attr, suffix ? v + suffix : v);
  }

  function renderAll(data) {
    var root = document;

    // Простые текстовые и атрибутные биндинги
    root.querySelectorAll('[data-bind]').forEach(function (el) {
      var path = el.getAttribute('data-bind');
      var v = get(data, path);
      if (v != null && typeof v !== 'object') {
        if (el.classList.contains('rich')) el.innerHTML = rich(v); else el.textContent = v;
      }
    });
    root.querySelectorAll('[data-bind-src]').forEach(function (el) {
      var v = get(data, el.getAttribute('data-bind-src'));
      if (v) { el.src = v; }
    });
    root.querySelectorAll('[data-bind-alt]').forEach(function (el) {
      var v = get(data, el.getAttribute('data-bind-alt'));
      if (v) el.alt = v;
    });
    root.querySelectorAll('[data-bind-href]').forEach(function (el) {
      var v = get(data, el.getAttribute('data-bind-href'));
      if (v) el.setAttribute('href', v);
    });
    root.querySelectorAll('[data-bind-html]').forEach(function (el) {
      var v = get(data, el.getAttribute('data-bind-html'));
      if (v != null) el.innerHTML = rich(v);
    });

    // ---------- index.html: эры ----------
    var erasGrid = document.getElementById('eras-grid');
    if (erasGrid && data.home) {
      erasGrid.innerHTML = data.home.eras.map(function (era) {
        return '<article class="card timeline-era">' +
          '<span class="era"' + (era.eraAccent ? ' style="color:var(--secondary)"' : '') + '>' + escapeHtml(era.era) + '</span>' +
          '<h3>' + escapeHtml(era.title) + '</h3>' +
          '<p>' + escapeHtml(era.text) + '</p>' +
          (era.img ? '<img src="' + escapeHtml(era.img) + '" alt="' + escapeHtml(era.imgAlt || '') + '" loading="lazy" width="1200" height="655">' : '') +
          '</article>';
      }).join('');
    }

    // ---------- Ламы (index) ----------
    var lamasGrid = document.getElementById('lamas-grid');
    if (lamasGrid && data.lamas) {
      lamasGrid.innerHTML = data.lamas.map(function (l) {
        return '<article class="card lama-card">' +
          '<div class="lama-head">' +
          '<div class="lama-avatar"><img src="' + escapeHtml(l.photo) + '" alt="' + escapeHtml(l.name) + '" loading="lazy" width="600" height="327"></div>' +
          '<div><span class="badge ' + (BADGE_VARIANTS[l.badgeVariant] || 'badge-muted') + '">' + escapeHtml(l.badge) + '</span>' +
          '<h3 class="t-md lama-name">' + escapeHtml(l.name) + '</h3>' +
          '<p class="lama-spec">' + escapeHtml(l.spec) + '</p></div>' +
          '</div>' +
          '<p class="lama-quote">' + escapeHtml(l.quote) + '</p>' +
          '<div class="lama-schedule"><span>' + ic('schedule') + ' ' + escapeHtml(l.days) + '</span>' +
          '<span style="color:var(--' + (l.tagVariant === 'secondary' ? 'secondary' : 'primary') + ')">' + escapeHtml(l.tag) + '</span></div>' +
          '</article>';
      }).join('');
    }

    // ---------- Реликвии ----------
    var relicsGrid = document.getElementById('relics-grid');
    if (relicsGrid && data.relics) {
      relicsGrid.innerHTML = data.relics.map(function (r) {
        return '<article class="card relic">' +
          '<div class="relic-img"><img src="' + escapeHtml(r.photo) + '" alt="' + escapeHtml(r.title) + '" loading="lazy" width="700" height="382"></div>' +
          '<div><h3>' + escapeHtml(r.title) + '</h3><p>' + escapeHtml(r.text) + '</p></div>' +
          '</article>';
      }).join('');
    }

    // ---------- Хуралы: службы ----------
    var servicesWrap = document.getElementById('services-list');
    if (servicesWrap && data.services) {
      servicesWrap.innerHTML = data.services.map(function (s) {
        return '<article class="card card-relative service">' +
          (s.watermark ? '<svg class="watermark ic" aria-hidden="true"><use href="assets/icons/sprite.svg#i-' + s.watermark + '"/></svg>' : '') +
          '<div class="service-top">' +
          '<div class="service-badges">' +
          '<span class="badge ' + (TIME_VARIANTS[s.timeVariant] || '') + '"' + (s.timeVariant === 'muted' ? ' style="background:var(--muted);color:var(--on-white)"' : '') + '>' + escapeHtml(s.time) + '</span>' +
          (s.tag ? '<span class="badge badge-outline">' + escapeHtml(s.tag) + '</span>' : '') +
          '</div>' +
          '<span class="service-place">' + ic('temple_buddhist', 'ic-sm') + ' ' + escapeHtml(s.place) + '</span>' +
          '</div>' +
          '<h3 class="service-title t-lg">' + escapeHtml(s.title) + '</h3>' +
          '<p class="body-md muted">' + escapeHtml(s.text) + '</p>' +
          '<div class="service-foot">' +
          (s.offering
            ? '<span class="service-offering">' + ic(s.offeringIcon || 'volunteer_activism') + ' ' + escapeHtml(s.offering) + '</span>'
            : (s.note ? '<span class="service-note">' + ic('info') + ' ' + escapeHtml(s.note) + '</span>' : '')) +
          (s.hasNoteButton !== false && s.hasNoteButton
            ? '<a class="btn btn-primary" href="#note-form">Подать записку</a>'
            : '') +
          '</div></article>';
      }).join('');
    }

    // ---------- Хуралы: табы ----------
    var tabsWrap = document.getElementById('period-tabs');
    if (tabsWrap && data.khuraly && data.khuraly.tabs) {
      tabsWrap.innerHTML = data.khuraly.tabs.map(function (t, i) {
        return '<button class="tab' + (i === 0 ? ' tab-active' : '') + '" type="button" role="tab" aria-selected="' + (i === 0) + '">' + escapeHtml(t) + '</button>';
      }).join('');
    }

    // ---------- Лунный календарь ----------
    var moonWrap = document.getElementById('moon-grid');
    if (moonWrap && data.moon) {
      moonWrap.innerHTML = data.moon.map(function (m) {
        return '<div class="card moon-card">' +
          '<div class="moon-head"><span class="moon-day ' + (MOON_VARIANTS[m.variant] || 'moon-day-15') + '">' + escapeHtml(m.day) + '</span>' +
          '<span class="moon-kind lbl">' + escapeHtml(m.kind) + '</span></div>' +
          '<h3>' + escapeHtml(m.title) + '</h3><p>' + escapeHtml(m.text) + '</p>' +
          '</div>';
      }).join('');
    }

    // ---------- Новости: фильтры ----------
    var chipsWrap = document.getElementById('news-chips');
    if (chipsWrap && data.novosti && data.novosti.categories) {
      chipsWrap.innerHTML = data.novosti.categories.map(function (c, i) {
        return '<button class="chip' + (i === 0 ? ' chip-active' : '') + '" type="button" data-filter="' + escapeHtml(c.id) + '">' + escapeHtml(c.label) + '</button>';
      }).join('');
    }

    // ---------- Новости: главная ----------
    var feat = document.getElementById('news-featured');
    if (feat && data.novosti && data.novosti.featured) {
      var f = data.novosti.featured;
      feat.setAttribute('data-cat', f.cat || 'huraly');
      feat.innerHTML =
        '<div class="news-feature-img">' +
        '<img src="' + escapeHtml(f.img) + '" alt="' + escapeHtml(f.alt) + '" width="1376" height="768">' +
        '<span class="news-feature-flag">' + escapeHtml(f.flag) + '</span>' +
        '<span class="news-feature-reading">' + ic('schedule', 'ic-sm') + ' ' + escapeHtml(f.reading) + '</span>' +
        '</div>' +
        '<div class="news-feature-body">' +
        '<div style="display:flex;align-items:center;gap:8px;color:var(--muted)" class="lbl">' +
        '<span style="color:var(--secondary);font-weight:600">' + escapeHtml(f.cat) + '</span><span>•</span>' +
        '<time datetime="' + escapeHtml(f.datetime) + '">' + escapeHtml(f.date) + '</time></div>' +
        '<h2>' + escapeHtml(f.title) + '</h2>' +
        '<p class="body-sm" style="color:var(--charcoal)">' + escapeHtml(f.text) + '</p>' +
        '<div class="news-quote">' + escapeHtml(f.quote) + '</div>' +
        '<a class="link-arrow t-sm" href="' + escapeHtml(f.linkHref || 'huraly.html') + '">' + escapeHtml(f.link) +
        ic('arrow_forward', 'ic-sm') + '</a>' +
        '</div>';
    }

    // ---------- Новости: хроника ----------
    var list = document.getElementById('news-list');
    if (list && data.novosti && data.novosti.items) {
      list.innerHTML = data.novosti.items.map(function (n) {
        return '<article class="card news-item" data-cat="' + escapeHtml(n.cat) + '">' +
          '<div class="news-thumb"><img src="' + escapeHtml(n.img) + '" alt="' + escapeHtml(n.imgAlt || '') + '" loading="lazy" width="700" height="523"></div>' +
          '<div class="news-body">' +
          '<span class="news-cat">' + (n.catIcon ? ic(n.catIcon, 'ic-xs') : '') + ' ' + escapeHtml(n.catLabel) + '</span>' +
          '<h4 class="news-title t-sm"><a href="#">' + escapeHtml(n.title) + '</a></h4>' +
          '<p class="news-excerpt body-sm">' + escapeHtml(n.excerpt) + '</p>' +
          '<div class="news-meta"><span>' + (n.dateIcon ? ic(n.dateIcon, 'ic-sm') + ' ' : '') + escapeHtml(n.date) + '</span>' +
          '<a href="#">' + escapeHtml(n.linkLabel || 'Подробнее →') + '</a></div>' +
          '</div></article>';
      }).join('');
    }

    // ---------- Паломникам: GPS и благотворительность ----------
    var gpsEl = document.getElementById('gps-text');
    if (gpsEl && data.palomnikam && data.palomnikam.route && data.palomnikam.route.gps) {
      gpsEl.textContent = 'GPS координаты: ' + data.palomnikam.route.gps;
    }
    var charityWrap = document.getElementById('charity-paragraphs');
    if (charityWrap && data.palomnikam && data.palomnikam.charity && data.palomnikam.charity.paragraphs) {
      charityWrap.innerHTML = data.palomnikam.charity.paragraphs.map(function (p) {
        return '<p class="body-sm muted">' + rich(typeof p === 'string' ? p : (p && p.p) || '') + '</p>';
      }).join('');
    }

    // ---------- Новости: счётчик ----------
    var newsCount = document.getElementById('news-count');
    if (newsCount && data.novosti && data.novosti.items) {
      newsCount.textContent = data.novosti.items.length + ' ' +
        (data.novosti.items.length % 10 === 1 && data.novosti.items.length !== 11 ? 'публикация' : 'публикаций');
    }

    // ---------- Паломникам: правила ----------
    var rulesWrap = document.getElementById('rules-grid');
    if (rulesWrap && data.palomnikam && data.palomnikam.rules) {
      rulesWrap.innerHTML = data.palomnikam.rules.map(function (r) {
        return '<article class="card rule-item card-pad-md">' +
          '<div class="rule-icon">' + ic(r.icon) + '</div>' +
          '<div><h3>' + escapeHtml(r.title) + '</h3><p>' + rich(r.text) + '</p></div>' +
          '</article>';
      }).join('');
    }

    // ---------- Паломникам: прием ----------
    var recItems = document.getElementById('reception-items');
    if (recItems && data.palomnikam && data.palomnikam.reception) {
      recItems.innerHTML = data.palomnikam.reception.items.map(function (it) {
        return '<div style="display:flex;gap:12px;align-items:flex-start;padding:12px;background:var(--ivory);border:1px solid rgba(234,226,213,.7);border-radius:var(--r-sm)">' +
          ic(it.icon, 'ic-md') .replace('class="ic ic-md"', 'class="ic ic-md" style="color:var(--saffron);margin-top:4px"') +
          '<div><h4 class="lbl-lg" style="color:var(--charcoal)">' + escapeHtml(it.title) + '</h4>' +
          '<p class="body-sm muted" style="margin-top:4px">' + escapeHtml(it.text) + '</p></div></div>';
      }).join('');
    }

    // Перезапуск интерактива site.js для нового DOM (фильтры/табы)
    if (window.hureeBindInteractive) window.hureeBindInteractive();
  }

  // fetch data.json и рендер
  fetch('data.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(renderAll)
    .catch(function (err) {
      console.error('Не удалось загрузить data.json:', err);
    });
})();
