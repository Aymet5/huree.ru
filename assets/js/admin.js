// Админ-панель Устуу-Хурээ — простая, для нетехнического пользователя
(function () {
  'use strict';

  var CONFIG = {
    repo: 'Aymet5/huree.ru',
    branch: 'main',
    passHash: '786873266d85595c1bb272e4c3ecb4402ddf95ab345c1d84e3018b84ba2a6bc4',
    imgDir: 'assets/img'
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ---------------- Утилиты ----------------
  function sha256(s) {
    var crypto = window.crypto || window.msCrypto;
    if (crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('00' + b.toString(16)).slice(-2);
        }).join('');
      });
    }
    return Promise.reject(new Error('Браузер не поддерживает Web Crypto'));
  }
  function toast(msg, isErr) {
    var t = $('#admin-toast');
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.hidden = false;
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.hidden = true; }, 5000);
  }
  function debounce(fn, ms) {
    var tm;
    return function () {
      var args = arguments, self = this;
      clearTimeout(tm);
      tm = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ---------------- Хранилище ----------------
  var store = {
    data: null,
    dirty: false, // есть неопубликованные правки
    load: function () {
      var raw = sessionStorage.getItem('huree-admin-data');
      if (raw) { store.data = JSON.parse(raw); return Promise.resolve(store.data); }
      return fetch('data.json', { cache: 'no-cache' })
        .then(function (r) { return r.json(); })
        .then(function (d) { store.data = d; return d; });
    },
    save: function (markDirty) {
      sessionStorage.setItem('huree-admin-data', JSON.stringify(store.data));
      if (markDirty !== false) {
        store.dirty = true;
        updateDirtyBadge();
      }
    },
    reset: function () { sessionStorage.removeItem('huree-admin-data'); }
  };

  function updateDirtyBadge() {
    var badge = $('#dirty-badge');
    var btn = $('#save-all-btn');
    if (!badge || !btn) return;
    if (store.dirty) {
      badge.hidden = false;
      btn.classList.add('btn-attention');
    } else {
      badge.hidden = true;
      btn.classList.remove('btn-attention');
    }
  }

  // ---------------- Подключение к GitHub (токен хранится навсегда) ----------------
  var gh = {
    token: localStorage.getItem('huree-gh-token') || '',
    api: function (path) { return 'https://api.github.com/repos/' + CONFIG.repo + path; },
    authHeaders: function () { return { Authorization: 'token ' + gh.token, Accept: 'application/vnd.github+json' }; },
    isConnected: function () { return !!gh.token; },
    saveToken: function (t) {
      gh.token = t;
      localStorage.setItem('huree-gh-token', t);
    },
    forgetToken: function () {
      gh.token = '';
      localStorage.removeItem('huree-gh-token');
    },
    getSha: function (path) {
      return fetch(gh.api('/contents/' + path + '?ref=' + CONFIG.branch + '&t=' + Date.now()), { headers: gh.authHeaders(), cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw ghError(r); return r.json(); })
        .then(function (j) { return j.sha; });
    },
    put: function (path, content, message) {
      return gh.getSha(path).catch(function () { return null; }).then(function (sha) {
        return fetch(gh.api('/contents/' + path), {
          method: 'PUT',
          headers: gh.authHeaders(),
          body: JSON.stringify({
            message: message,
            content: btoa(unescape(encodeURIComponent(content))),
            sha: sha || undefined,
            branch: CONFIG.branch
          })
        });
      });
    }
  };
  function ghError(r) {
    var err = new Error('Ошибка соединения с GitHub (' + r.status + ')');
    if (r.status === 401) err = new Error('Ключ доступа неверный или истёк. Откройте «Настройки подключения» и введите новый.');
    if (r.status === 404) err = new Error('GitHub не нашёл репозиторий. Проверьте, что ключ создан с правами на репозиторий (repo).');
    if (r.status === 409) err = new Error('Конфликт версий: кто-то другой обновил сайт. Обновите страницу и попробуйте снова.');
    return err;
  }

  // ---------------- Мастер первого запуска ----------------
  function ensureToken(viaSettings) {
    if (gh.isConnected()) return Promise.resolve(gh.token);
    return new Promise(function (resolve, reject) {
      openTokenWizard(function (token) { resolve(token); }, viaSettings);
      // reject происходит внутри визарда кнопкой «Отмена»
      window.__wizCancel = function () { reject(new Error('Нет ключа доступа — публикация невозможна')); };
    });
  }

  function openTokenWizard(onDone, viaSettings) {
    var overlay = document.createElement('div');
    overlay.className = 'wiz-overlay';
    overlay.innerHTML =
      '<div class="wiz-card" role="dialog" aria-modal="true">' +
      '  <div class="wiz-head"><svg class="ic" aria-hidden="true"><use href="assets/icons/sprite.svg#i-temple_buddhist"/></svg>' +
      '  <h2>Подключение к сайту</h2></div>' +
      '  <p class="wiz-intro">Чтобы ваши правки появлялись на сайте, нужен <b>ключ доступа GitHub</b> — это как пароль от сайта. Его нужно создать один раз, дальше всё будет работать само.</p>' +
      '  <ol class="wiz-steps">' +
      '    <li><b>Откройте страницу создания ключа:</b><br>' +
      '      <a href="https://github.com/settings/tokens/new?scopes=repo&description=huree-admin" target="_blank" rel="noopener" class="wiz-big-link">Нажмите здесь — откроется нужная страница →</a>' +
      '      <span class="wiz-hint">(сайт github.com попросит войти — войдите под аккаунтом <b>Aymet5</b>)</span></li>' +
      '    <li><b>Прокрутите вниз</b> и нажмите зелёную кнопку <span class="wiz-btn-emu">Generate token</span>.</li>' +
      '    <li><b>Скопируйте показанный код</b> (набор букв и цифр) и вставьте его в поле ниже.</li>' +
      '  </ol>' +
      '  <div class="field"><label for="wiz-token">Ключ доступа</label>' +
      '  <input class="input" id="wiz-token" type="text" placeholder="Например: ghp_aBcD1234…" autocomplete="off"></div>' +
      '  <div class="wiz-actions">' +
      '    <button class="btn btn-secondary" id="wiz-cancel" type="button">Отмена</button>' +
      '    <button class="btn btn-primary" id="wiz-save" type="button">Подключить</button>' +
      '  </div>' +
      '  <p class="wiz-note">Ключ сохранится только в этом браузере на этом компьютере — вводить его заново не придётся.</p>' +
      '</div>';
    document.body.appendChild(overlay);

    $('#wiz-cancel', overlay).addEventListener('click', function () {
      overlay.remove();
      if (window.__wizCancel) window.__wizCancel();
    });
    $('#wiz-save', overlay).addEventListener('click', function () {
      var t = $('#wiz-token', overlay).value.trim();
      if (!t) { toast('Вставьте ключ доступа в поле', true); return; }
      gh.saveToken(t);
      overlay.remove();
      toast('Сайт подключён! Теперь правки можно публиковать.');
      if (onDone) onDone(t);
      if (viaSettings) buildView(currentView);
    });
    $('#wiz-token', overlay).focus();
  }

  // ---------------- Модель ----------------
  function getModel(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, store.data);
  }
  function setModel(path, val) {
    var keys = path.split('.');
    var obj = store.data;
    for (var i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] == null) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = val;
    store.save();
  }

  // ---------------- Визуальный выбор иконки ----------------
  var ICON_SETS = {
    rule: ['rotate_right', 'checkroom', 'spa', 'no_photography', 'verified', 'info', 'volunteer_activism', 'favorite', 'healing', 'shield', 'nights_stay', 'water_drop'],
    offering: ['volunteer_activism', 'healing', 'spa', 'favorite', 'water_drop', 'wb_sunny', 'candle'],
    cat: ['wb_sunny', 'festival', 'park', 'menu_book', 'event', 'auto_stories'],
    reception: ['nights_stay', 'water_drop', 'spa', 'healing', 'auto_stories', 'menu_book'],
    moon: ['routine', 'nights_stay', 'wb_sunny', 'temple_buddhist'],
    watermark: ['shield', 'spa', 'temple_buddhist', 'healing', 'favorite', 'candle'],
    date: ['', 'calendar_month', 'event', 'schedule']
  };

  function iconPicker(label, path, set) {
    var wrap = document.createElement('div');
    wrap.className = 'field';
    var lab = document.createElement('label');
    lab.textContent = label;
    wrap.appendChild(lab);

    var grid = document.createElement('div');
    grid.className = 'icon-grid';
    var icons = ICON_SETS[set] || ICON_SETS.rule;
    icons.forEach(function (name) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon-cell' + (getModel(path) === name ? ' active' : '');
      b.title = name || 'без иконки';
      if (name) {
        b.innerHTML = '<svg class="ic ic-lg" aria-hidden="true"><use href="assets/icons/sprite.svg#i-' + name + '"/></svg>';
      } else {
        b.innerHTML = '<span class="icon-none">нет</span>';
      }
      b.addEventListener('click', function () {
        $$('.icon-cell', grid).forEach(function (c) { c.classList.remove('active'); });
        b.classList.add('active');
        setModel(path, name);
      });
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  // ---------------- Поля ----------------
  function field(f) {
    var wrap = document.createElement('div');
    wrap.className = 'field';
    var id = 'f' + Math.random().toString(36).slice(2, 8);
    var label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = f.label;
    if (f.hint) {
      var hint = document.createElement('span');
      hint.className = 'field-hint-inline';
      hint.textContent = ' — ' + f.hint;
      label.appendChild(hint);
    }
    wrap.appendChild(label);

    var el;
    if (f.type === 'textarea') {
      el = document.createElement('textarea');
      el.rows = f.rows || 4;
      if (f.rich) {
        var bar = document.createElement('div');
        bar.className = 'fmt-bar';
        var bold = document.createElement('button');
        bold.type = 'button';
        bold.innerHTML = '<b>Ж</b>';
        bold.title = 'Выделить жирным';
        bold.addEventListener('click', function () { wrapTag(el, 'strong'); });
        var link = document.createElement('button');
        link.type = 'button';
        link.textContent = '🔗 Ссылка';
        link.title = 'Вставить ссылку на страницу сайта';
        link.addEventListener('click', function () { insertLink(el); });
        bar.appendChild(bold);
        bar.appendChild(link);
        bar.appendChild(document.createElement('span')).className = 'fmt-hint';
        bar.lastChild.textContent = 'Выделяйте мышкой текст и нажимайте кнопки';
        wrap.appendChild(bar);
      }
    } else if (f.type === 'select') {
      el = document.createElement('select');
      (f.options || []).forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o.v; opt.textContent = o.t;
        el.appendChild(opt);
      });
    } else {
      el = document.createElement('input');
      el.type = f.type || 'text';
    }
    el.id = id;
    if (f.placeholder) el.placeholder = f.placeholder;
    el.dataset.model = f.path;
    wrap.appendChild(el);

    var v = getModel(f.path);
    if (v != null) el.value = v;
    el.addEventListener('input', debounce(function () { setModel(f.path, el.value); }, 150));
    el.addEventListener('change', function () { setModel(f.path, el.value); });
    return wrap;
  }

  function wrapTag(ta, tag) {
    var start = ta.selectionStart, end = ta.selectionEnd;
    var sel = ta.value.slice(start, end) || 'текст';
    ta.value = ta.value.slice(0, start) + '<' + tag + '>' + sel + '</' + tag + '>' + ta.value.slice(end);
    ta.focus();
    var setModelDebounced = setModel.bind(null, ta.dataset.model, ta.value);
    setModel(ta.dataset.model, ta.value);
    ta.setSelectionRange(start + tag.length + 2, start + tag.length + 2 + sel.length);
  }
  function insertLink(ta) {
    var page = prompt('На какую страницу ссылаться?\n\nhuraly.html — расписание хуралов\nnovosti.html — новости\npalomnikam.html — паломникам\nindex.html — главная\n\nМожно оставить как есть:', 'novosti.html');
    if (page === null) return;
    var start = ta.selectionStart, end = ta.selectionEnd;
    var sel = ta.value.slice(start, end) || 'текст ссылки';
    ta.value = ta.value.slice(0, start) + '<a class="link" href="' + page + '">' + sel + '</a>' + ta.value.slice(end);
    setModel(ta.dataset.model, ta.value);
    ta.focus();
  }

  // ---------------- Поле-изображение ----------------
  function imgField(label, path) {
    var wrap = document.createElement('div');
    wrap.className = 'field img-field';

    var lab = document.createElement('label');
    lab.textContent = label;
    wrap.appendChild(lab);

    var row = document.createElement('div');
    row.className = 'img-row';

    var prev = document.createElement('div');
    prev.className = 'img-preview';
    function setPrev() {
      var v = getModel(path);
      prev.innerHTML = v ? '<img src="' + v + '" alt="">' : '<div class="img-empty">нет фото</div>';
    }
    setPrev();

    var right = document.createElement('div');
    right.className = 'img-right';

    var upBtn = document.createElement('label');
    upBtn.className = 'btn btn-primary';
    upBtn.innerHTML = '<svg class="ic ic-md" aria-hidden="true"><use href="assets/icons/sprite.svg#i-foundation"/></svg> Выбрать фото с компьютера';
    var file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    upBtn.appendChild(file);
    file.addEventListener('change', function () {
      if (!file.files || !file.files[0]) return;
      var f = file.files[0];
      if (f.size > 4 * 1024 * 1024) { toast('Фото слишком большое (больше 4 МБ). Уменьшите фото и попробуйте снова.', true); return; }
      upBtn.classList.add('loading');
      upBtn.textContent = 'Загружаю…';
      uploadImage(f).then(function (imgPath) {
        setModel(path, imgPath);
        setPrev();
        toast('Фото загружено. Нажмите «Опубликовать», чтобы оно появилось на сайте.');
      }).catch(function (err) {
        toast('Не получилось загрузить фото: ' + err.message, true);
      }).then(function () {
        upBtn.classList.remove('loading');
        upBtn.innerHTML = '<svg class="ic ic-md" aria-hidden="true"><use href="assets/icons/sprite.svg#i-foundation"/></svg> Выбрать фото с компьютера';
        var f2 = document.createElement('input');
        f2.type = 'file'; f2.accept = 'image/*'; f2.hidden = true;
        upBtn.appendChild(f2);
        f2.addEventListener('change', file.onchange);
        file = f2;
      });
    });
    right.appendChild(upBtn);

    var pickBtn = document.createElement('button');
    pickBtn.className = 'btn btn-secondary';
    pickBtn.type = 'button';
    pickBtn.textContent = 'Выбрать из уже загруженных';
    pickBtn.addEventListener('click', function () {
      openMediaPicker(function (p) {
        setModel(path, p);
        setPrev();
        toast('Фото выбрано.');
      });
    });
    right.appendChild(pickBtn);

    var removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-secondary';
    removeBtn.type = 'button';
    removeBtn.textContent = 'Убрать фото';
    removeBtn.addEventListener('click', function () {
      if (!getModel(path)) return;
      if (!confirm('Убрать фото? (Сам файл останется в медиатеке)')) return;
      setModel(path, '');
      setPrev();
    });
    right.appendChild(removeBtn);

    row.appendChild(prev);
    row.appendChild(right);
    wrap.appendChild(row);
    return wrap;
  }

  // ---------------- Загрузка изображения ----------------
  function uploadImage(fileObj) {
    return ensureToken().then(function () {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onerror = function () { reject(new Error('Не удалось прочитать файл')); };
        fr.onload = function () {
          var name = 'f' + Date.now() + '-' + fileObj.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/\.(jpe?g|png|webp|gif)$/i, '');
          var ext = (fileObj.name.match(/\.(jpe?g|png|webp|gif)$/i) || ['.jpg'])[0].toLowerCase();
          if (ext === '.jpeg') ext = '.jpg';
          var path = CONFIG.imgDir + '/' + name + ext;
          var b64 = fr.result.split(',')[1];
          gh.getSha(path).catch(function () { return null; }).then(function (sha) {
            return fetch(gh.api('/contents/' + path), {
              method: 'PUT',
              headers: gh.authHeaders(),
              body: JSON.stringify({
                message: 'Фото: ' + fileObj.name,
                content: b64,
                sha: sha || undefined,
                branch: CONFIG.branch
              })
            });
          }).then(function (r) {
            if (!r.ok) throw ghError(r);
            return path;
          }).then(resolve, reject);
        };
        fr.readAsDataURL(fileObj);
      });
    });
  }

  // ---------------- Медиатека ----------------
  function listImages() {
    return ensureToken().then(function () {
      return fetch(gh.api('/contents/' + CONFIG.imgDir + '?ref=' + CONFIG.branch + '&t=' + Date.now()), {
        headers: gh.authHeaders(), cache: 'no-store'
      }).then(function (r) {
        if (!r.ok) throw ghError(r);
        return r.json();
      }).then(function (files) {
        return files.filter(function (f) { return f.type === 'file' && /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name); })
          .map(function (f) { return { name: f.name, size: f.size, url: f.download_url }; });
      });
    });
  }

  var pickerBack = null;
  function openMediaPicker(cb) {
    pickerBack = currentView;
    var main = $('#admin-main');
    main.innerHTML = '<div class="admin-loading">Открываю галерею фото…</div>';
    listImages().then(function (files) {
      main.innerHTML = '';
      var head = document.createElement('div');
      head.className = 'admin-section-head';
      head.innerHTML = '<h2>Галерея фото сайта</h2><p>Нажмите на фото, чтобы использовать его.</p>';
      main.appendChild(head);
      var grid = document.createElement('div');
      grid.className = 'media-grid';
      files.forEach(function (f) {
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'media-cell';
        cell.innerHTML = '<img src="' + f.url + '" alt="" loading="lazy">' +
          '<span class="media-meta"><span class="media-name">' + f.name + '</span></span>';
        cell.addEventListener('click', function () {
          cb(CONFIG.imgDir + '/' + f.name);
          navTo(pickerBack || 'site');
        });
        grid.appendChild(cell);
      });
      main.appendChild(grid);
      var back = document.createElement('button');
      back.className = 'btn btn-secondary';
      back.type = 'button';
      back.style.marginTop = '16px';
      back.textContent = '← Вернуться без выбора';
      back.addEventListener('click', function () { navTo(pickerBack || 'site'); });
      main.appendChild(back);
    }).catch(function (err) {
      toast('Не удалось открыть галерею: ' + err.message, true);
      navTo(pickerBack || 'site');
    });
  }

  // ---------------- Список записей (CRUD) ----------------
  function listView(opts) {
    var wrap = document.createElement('div');

    function build() {
      var head = document.createElement('div');
      head.className = 'admin-section-head';
      head.innerHTML = '<h2></h2><p></p>';
      head.querySelector('h2').textContent = opts.title;
      head.querySelector('p').textContent = opts.desc || '';
      wrap.appendChild(head);

      var holder = document.createElement('div');
      var list = getModel(opts.path) || [];

      list.forEach(function (item, i) {
        var card = document.createElement('div');
        card.className = 'admin-card';

        var row = document.createElement('div');
        row.className = 'admin-row-head';
        var title = document.createElement('span');
        title.className = 'row-title';
        title.textContent = (i + 1) + '. ' + opts.itemLabel(item, i);
        row.appendChild(title);

        var actions = document.createElement('div');
        actions.className = 'admin-row-actions';
        var up = mkBtn('↑', 'Переставить выше', function () { move(i, -1); });
        var down = mkBtn('↓', 'Переставить ниже', function () { move(i, 1); });
        var del = mkBtn('✕ Удалить', 'Удалить запись', function () { delItem(i); });
        del.classList.add('btn-danger');
        actions.appendChild(up); actions.appendChild(down); actions.appendChild(del);
        row.appendChild(actions);
        card.appendChild(row);

        opts.fields(item, i).forEach(function (el) { card.appendChild(el); });
        holder.appendChild(card);
      });

      var add = document.createElement('button');
      add.className = 'btn btn-primary';
      add.type = 'button';
      add.style.marginTop = '8px';
      add.textContent = '+ Добавить «' + opts.addLabel + '»';
      add.addEventListener('click', function () {
        var arr = getModel(opts.path);
        if (!arr) { arr = []; setModel(opts.path, arr); }
        arr.push(opts.blank());
        store.save();
        rebuild();
      });
      holder.appendChild(add);
      wrap.appendChild(holder);
    }

    function move(i, dir) {
      var arr = getModel(opts.path);
      var j = i + dir;
      if (j < 0 || j >= arr.length) return;
      var tmp = arr[j]; arr[j] = arr[i]; arr[i] = tmp;
      store.save();
      rebuild();
    }
    function delItem(i) {
      var arr = getModel(opts.path);
      if (!confirm('Точно удалить запись «' + opts.itemLabel(arr[i], i) + '»?')) return;
      arr.splice(i, 1);
      store.save();
      rebuild();
    }
    function rebuild() {
      wrap.innerHTML = '';
      build();
    }

    build();
    return wrap;
  }
  function mkBtn(text, title, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-secondary';
    b.textContent = text;
    b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------------- Разделы ----------------
  var views = {};
  var currentView = 'site';

  function section(el, title, desc) {
    var head = document.createElement('div');
    head.className = 'admin-section-head';
    head.innerHTML = '<h2></h2><p></p>';
    head.querySelector('h2').textContent = title;
    head.querySelector('p').textContent = desc || '';
    el.appendChild(head);
  }

  // Категории новостей — выбор по названию
  function categorySelect(path) {
    var wrap = document.createElement('div');
    wrap.className = 'field';
    var lab = document.createElement('label');
    lab.textContent = 'Раздел новости';
    wrap.appendChild(lab);
    var sel = document.createElement('select');
    sel.dataset.model = path;
    (getModel('novosti.categories') || []).forEach(function (c) {
      if (c.id === 'all') return;
      var o = document.createElement('option');
      o.value = c.id; o.textContent = c.label;
      sel.appendChild(o);
    });
    var v = getModel(path);
    if (v) sel.value = v;
    sel.addEventListener('change', function () {
      setModel(path, sel.value);
      // подтянуть отображаемое название
      var cat = (getModel('novosti.categories') || []).find(function (c) { return c.id === sel.value; });
      if (cat) setModel(path.replace(/\.cat$/, '.catLabel'), cat.label);
    });
    wrap.appendChild(sel);
    return wrap;
  }

  function buildViews() {
    views.site = function (el) {
      section(el, 'Общие настройки', 'Телефон, часы работы и подпись внизу сайта. Отображаются на всех страницах.');
      var c = document.createElement('div'); c.className = 'admin-card';
      c.appendChild(field({ path: 'site.name', label: 'Название сайта' }));
      c.appendChild(field({ path: 'site.phone', label: 'Телефон обители', hint: 'пишите в формате +7 (923) 000-00-00' }));
      c.appendChild(field({ path: 'site.hours', label: 'Часы работы' }));
      c.appendChild(field({ path: 'site.footerRegion', label: 'Подпись внизу страницы', type: 'textarea', rows: 2 }));
      el.appendChild(c);
      // phoneHref генерируется автоматически из site.phone
      var old = c.querySelector('input[data-model="site.phone"]');
      old.addEventListener('change', function () {
        setModel('site.phoneHref', 'tel:' + old.value.replace(/[^\d+]/g, ''));
      });
    };

    views.home = function (el) {
      section(el, 'Главная страница', 'Верхние тексты, главное фото и разделы истории.');
      var c1 = document.createElement('div'); c1.className = 'admin-card'; c1.innerHTML = '<h3>Верх страницы</h3>';
      c1.appendChild(field({ path: 'home.eyebrow', label: 'Маленькая надпись над заголовком' }));
      c1.appendChild(field({ path: 'home.title', label: 'Главный заголовок' }));
      c1.appendChild(field({ path: 'home.lede', label: 'Вступительный текст', type: 'textarea', rows: 3 }));
      c1.appendChild(imgField('Большое фото под заголовком', 'home.heroImg'));
      c1.appendChild(field({ path: 'home.heroCaption', label: 'Подпись на фото' }));
      el.appendChild(c1);

      var c2 = document.createElement('div'); c2.className = 'admin-card'; c2.innerHTML = '<h3>История: основание храма</h3>';
      c2.appendChild(field({ path: 'home.foundation.eyebrow', label: 'Маленькая надпись раздела' }));
      c2.appendChild(field({ path: 'home.foundation.title', label: 'Заголовок' }));
      c2.appendChild(field({ path: 'home.foundation.subtitle', label: 'Подзаголовок' }));
      c2.appendChild(field({ path: 'home.foundation.text', label: 'Основной текст', type: 'textarea', rows: 3 }));
      c2.appendChild(field({ path: 'home.foundation.bentoTitle', label: 'Заголовок рамки-врезки' }));
      c2.appendChild(field({ path: 'home.foundation.bentoText', label: 'Текст рамки-врезки', type: 'textarea', rows: 4 }));
      el.appendChild(c2);

      var c3 = el.appendChild(document.createElement('div')); c3.className = 'admin-card'; c3.innerHTML = '<h3>Остальные подписи</h3>';
      c3.appendChild(field({ path: 'home.revivalEyebrow', label: 'Надпись раздела «Возрождение»' }));
      c3.appendChild(field({ path: 'home.lamasEyebrow', label: 'Надпись раздела «Наставники»' }));
      c3.appendChild(field({ path: 'home.lamasTitle', label: 'Заголовок про наставников' }));
      c3.appendChild(field({ path: 'home.lamasText', label: 'Описание наставников', type: 'textarea', rows: 2 }));
      c3.appendChild(field({ path: 'home.relicsEyebrow', label: 'Надпись раздела «Святыни»' }));
      c3.appendChild(field({ path: 'home.relicsTitle', label: 'Заголовок про святыни' }));
      c3.appendChild(field({ path: 'home.relicsText', label: 'Описание святынь', type: 'textarea', rows: 2 }));
      c3.appendChild(field({ path: 'home.quote.text', label: 'Мудрая цитата', type: 'textarea', rows: 4 }));
      c3.appendChild(field({ path: 'home.quote.author', label: 'Под чьим именем цитата' }));
      el.appendChild(c3);

      el.appendChild(subList('home.eras', 'Этапы истории', [
        { key: 'era', label: 'Годы / эпоха' },
        { key: 'title', label: 'Заголовок' },
        { key: 'text', label: 'Текст', type: 'textarea', rows: 3 },
        { key: 'img', label: 'Фото', type: 'img' },
        { key: 'imgAlt', label: 'Описание фото (для слабовидящих)' }
      ], function () { return { era: 'Новые годы', title: 'Новый этап', text: '', img: '', imgAlt: '' }; }, 'Этап истории'));
    };

    views.lamas = function (el) {
      el.appendChild(listView({
        title: 'Ламы и наставники',
        desc: 'Карточки священнослужителей на главной странице.',
        path: 'lamas', addLabel: 'лама',
        itemLabel: function (l) { return l.name || 'Без имени'; },
        fields: function (l) { return [
          field({ path: l.__path + '.name', label: 'Имя' }),
          field({ path: l.__path + '.spec', label: 'Чем занимается' }),
          field({ path: l.__path + '.badge', label: 'Должность на бейдже' }),
          field({ path: l.__path + '.badgeVariant', label: 'Цвет бейджа', type: 'select', options: [
            { v: 'primary', t: 'Бордо' }, { v: 'tag', t: 'Терракота' }, { v: 'muted', t: 'Латунь' }, { v: 'outline', t: 'Светлый' }
          ] }),
          imgField('Портрет', l.__path + '.photo'),
          field({ path: l.__path + '.quote', label: 'Цитата-наставление', type: 'textarea', rows: 3 }),
          field({ path: l.__path + '.days', label: 'Когда принимает' }),
          field({ path: l.__path + '.tag', label: 'Отметка справа' }),
          field({ path: l.__path + '.tagVariant', label: 'Цвет отметки', type: 'select', options: [
            { v: 'primary', t: 'Бордо' }, { v: 'secondary', t: 'Терракота' }
          ] })
        ]; },
        blank: function () { return { badge: 'Лама', badgeVariant: 'muted', name: 'Имя ламы', spec: '', photo: '', quote: '', days: '', tag: 'Личный прием', tagVariant: 'primary' }; }
      }));
    };

    views.relics = function (el) {
      el.appendChild(listView({
        title: 'Святыни и реликвии',
        desc: 'Карточки на главной странице.',
        path: 'relics', addLabel: 'святыня',
        itemLabel: function (r) { return r.title || 'Без названия'; },
        fields: function (r) { return [
          field({ path: r.__path + '.title', label: 'Название' }),
          field({ path: r.__path + '.text', label: 'Описание', type: 'textarea', rows: 3 }),
          imgField('Фото', r.__path + '.photo')
        ]; },
        blank: function () { return { title: 'Новая святыня', text: '', photo: '' }; }
      }));
    };

    views.khuraly = function (el) {
      section(el, 'Страница «Хуралы» — тексты', 'Заголовки и описания страницы расписания.');
      var c = document.createElement('div'); c.className = 'admin-card';
      c.appendChild(field({ path: 'khuraly.eyebrow', label: 'Маленькая надпись над заголовком' }));
      c.appendChild(field({ path: 'khuraly.title', label: 'Главный заголовок' }));
      c.appendChild(field({ path: 'khuraly.lede', label: 'Вступительный текст', type: 'textarea', rows: 3 }));
      c.appendChild(imgField('Фото в карточке-приветствии', 'khuraly.cardImg'));
      c.appendChild(field({ path: 'khuraly.cardTitle', label: 'Заголовок карточки' }));
      c.appendChild(field({ path: 'khuraly.cardText', label: 'Текст карточки', type: 'textarea', rows: 2 }));
      c.appendChild(field({ path: 'khuraly.dayHeading', label: 'Заголовок над молебнами' }));
      c.appendChild(field({ path: 'khuraly.lunarDay', label: 'Лунный день (бейдж справа)' }));
      c.appendChild(field({ path: 'khuraly.yearLabel', label: 'Год по восточному календарю' }));
      el.appendChild(c);

      var c2 = document.createElement('div'); c2.className = 'admin-card'; c2.innerHTML = '<h3>Форма «Подать записку»</h3>';
      c2.appendChild(field({ path: 'khuraly.formTitle', label: 'Заголовок формы' }));
      c2.appendChild(field({ path: 'khuraly.formDesc', label: 'Описание', type: 'textarea', rows: 2 }));
      c2.appendChild(field({ path: 'khuraly.formNamesHint', label: 'Подсказка про имена', type: 'textarea', rows: 2 }));
      c2.appendChild(field({ path: 'khuraly.formDonationHint', label: 'Подсказка про пожертвование', type: 'textarea', rows: 2 }));
      c2.appendChild(field({ path: 'khuraly.formSuccess', label: 'Сообщение после отправки' }));
      c2.appendChild(field({ path: 'khuraly.formSuccessNote', label: 'Дополнение после отправки' }));
      el.appendChild(c2);

      var c3 = document.createElement('div'); c3.className = 'admin-card'; c3.innerHTML = '<h3>Лунный календарь</h3>';
      c3.appendChild(field({ path: 'khuraly.moonHeading', label: 'Заголовок блока' }));
      c3.appendChild(field({ path: 'khuraly.moonSubheading', label: 'Подзаголовок блока' }));
      el.appendChild(c3);
    };

    views.services = function (el) {
      el.appendChild(listView({
        title: 'Молебны в расписании',
        desc: 'Карточки хуралов на день.',
        path: 'services', addLabel: 'молебен',
        itemLabel: function (s) { return s.title || 'Без названия'; },
        fields: function (s) { return [
          field({ path: s.__path + '.title', label: 'Название молебна' }),
          field({ path: s.__path + '.time', label: 'Время', hint: 'например: 09:00 — 11:30' }),
          field({ path: s.__path + '.timeVariant', label: 'Цвет плашки времени', type: 'select', options: [
            { v: 'primary', t: 'Бордо' }, { v: 'time', t: 'Золотой' }, { v: 'muted', t: 'Серый' }
          ] }),
          field({ path: s.__path + '.tag', label: 'Метки (через запятую)', hint: 'например: Ежедневно, О здравии' }),
          field({ path: s.__path + '.place', label: 'Место проведения' }),
          field({ path: s.__path + '.text', label: 'Описание', type: 'textarea', rows: 3 }),
          iconPicker('Иконка на фоне карточки', s.__path + '.watermark', 'watermark'),
          field({ path: s.__path + '.offering', label: 'Строка про подношение', hint: 'если есть' }),
          iconPicker('Иконка подношения', s.__path + '.offeringIcon', 'offering'),
          field({ path: s.__path + '.note', label: 'Примечание внизу', type: 'textarea', rows: 2 }),
          field({ path: s.__path + '.hasNoteButton', label: 'Кнопка «Подать записку»', type: 'select', options: [
            { v: 'true', t: 'Показывать' }, { v: 'false', t: 'Не показывать' }
          ] })
        ]; },
        blank: function () { return { time: '00:00 — 00:00', timeVariant: 'primary', tag: '', place: 'Главный дуган', title: 'Новый молебен', text: '', offering: '', hasNoteButton: true }; }
      }));
    };

    views.moon = function (el) {
      el.appendChild(listView({
        title: 'Особые лунные дни',
        desc: 'Карточки внизу страницы «Хуралы».',
        path: 'moon', addLabel: 'лунный день',
        itemLabel: function (m) { return (m.day ? m.day + ' — ' : '') + (m.title || ''); },
        fields: function (m) { return [
          field({ path: m.__path + '.day', label: 'Число лунного дня' }),
          field({ path: m.__path + '.variant', label: 'Цвет числа', type: 'select', options: [
            { v: '8', t: 'Золотой' }, { v: '15', t: 'Бордовый' }, { v: '30', t: 'Льняной' }
          ] }),
          field({ path: m.__path + '.kind', label: 'Название дня (например: Полнолуние)' }),
          field({ path: m.__path + '.title', label: 'Заголовок' }),
          field({ path: m.__path + '.text', label: 'Описание', type: 'textarea', rows: 3 })
        ]; },
        blank: function () { return { day: '1', variant: '15', kind: 'Лунный день', title: '', text: '' }; }
      }));
    };

    views['novosti-head'] = function (el) {
      section(el, 'Страница «Новости» — оформление', 'Заголовки и большая новость сверху.');
      var c = document.createElement('div'); c.className = 'admin-card';
      c.appendChild(field({ path: 'novosti.eyebrow', label: 'Маленькая надпись над заголовком' }));
      c.appendChild(field({ path: 'novosti.title', label: 'Главный заголовок' }));
      c.appendChild(field({ path: 'novosti.lede', label: 'Вступительный текст', type: 'textarea', rows: 2 }));
      c.appendChild(field({ path: 'novosti.chronicleHeading', label: 'Заголовок над списком новостей' }));
      el.appendChild(c);

      var f = document.createElement('div'); f.className = 'admin-card'; f.innerHTML = '<h3>Большая новость сверху</h3>';
      f.appendChild(imgField('Фото большой новости', 'novosti.featured.img'));
      f.appendChild(field({ path: 'novosti.featured.alt', label: 'Описание фото (для слабовидущих)' }));
      f.appendChild(field({ path: 'novosti.featured.flag', label: 'Метка на фото (например: Главное событие)' }));
      f.appendChild(field({ path: 'novosti.featured.reading', label: 'Время чтения (например: Чтение: 5 мин)' }));
      f.appendChild(field({ path: 'novosti.featured.cat', label: 'Раздел (текстом)' }));
      f.appendChild(field({ path: 'novosti.featured.date', label: 'Дата (текстом, например: 18 мая 2024)' }));
      f.appendChild(field({ path: 'novosti.featured.title', label: 'Заголовок' }));
      f.appendChild(field({ path: 'novosti.featured.text', label: 'Текст', type: 'textarea', rows: 3 }));
      f.appendChild(field({ path: 'novosti.featured.quote', label: 'Цитата-врезка', type: 'textarea', rows: 2 }));
      f.appendChild(field({ path: 'novosti.featured.link', label: 'Текст ссылки внизу' }));
      f.appendChild(field({ path: 'novosti.featured.linkHref', label: 'Куда ведёт ссылка', type: 'select', options: [
        { v: 'huraly.html', t: 'Страница «Хуралы»' },
        { v: 'novosti.html', t: 'Страница «Новости»' },
        { v: 'palomnikam.html', t: 'Страница «Паломникам»' },
        { v: 'index.html', t: 'Главная страница' }
      ] }));
      el.appendChild(f);

      var s = document.createElement('div'); s.className = 'admin-card'; s.innerHTML = '<h3>Блок подписки</h3>';
      s.appendChild(field({ path: 'novosti.subscribe.title', label: 'Заголовок' }));
      s.appendChild(field({ path: 'novosti.subscribe.text', label: 'Текст', type: 'textarea', rows: 2 }));
      s.appendChild(field({ path: 'novosti.subscribe.hint', label: 'Мелкая подпись под кнопкой', type: 'textarea', rows: 2 }));
      s.appendChild(field({ path: 'novosti.subscribe.success', label: 'Сообщение после подписки' }));
      s.appendChild(field({ path: 'novosti.subscribe.successNote', label: 'Дополнение' }));
      el.appendChild(s);

      el.appendChild(subList('novosti.categories', 'Разделы новостей (для фильтров)', [
        { key: 'id', label: 'Код раздела (латиницей, без пробелов)' },
        { key: 'label', label: 'Название раздела' }
      ], function () { return { id: 'novyi', label: 'Новый раздел' }; }, 'раздел'));
    };

    views['novosti-items'] = function (el) {
      el.appendChild(listView({
        title: 'Новости — записи',
        desc: 'Все новости обители. Новая запись появится вверху списка — переставьте стрелками при необходимости.',
        path: 'novosti.items', addLabel: 'новость',
        itemLabel: function (n) { return n.title || 'Без названия'; },
        fields: function (n, i) { return [
          field({ path: n.__path + '.title', label: 'Заголовок' }),
          categorySelect(n.__path + '.cat'),
          field({ path: n.__path + '.excerpt', label: 'Краткий текст', type: 'textarea', rows: 2 }),
          field({ path: n.__path + '.date', label: 'Дата (текстом)' }),
          imgField('Фото', n.__path + '.img'),
          field({ path: n.__path + '.imgAlt', label: 'Описание фото (для слабовидущих)' }),
          field({ path: n.__path + '.linkLabel', label: 'Текст ссылки (например: Подробнее)' })
        ]; },
        blank: function () { return { cat: 'huraly', catLabel: 'Праздники и хуралы', catIcon: 'event', title: 'Новая новость', excerpt: '', date: '', img: '', linkLabel: 'Подробнее →' }; }
      }));
    };

    views.palomnikam = function (el) {
      section(el, 'Страница «Паломникам» — тексты', 'Памятка, дорога, контакты.');
      var c1 = document.createElement('div'); c1.className = 'admin-card'; c1.innerHTML = '<h3>Верх страницы</h3>';
      c1.appendChild(field({ path: 'palomnikam.eyebrow', label: 'Маленькая надпись над заголовком' }));
      c1.appendChild(field({ path: 'palomnikam.title', label: 'Главный заголовок' }));
      c1.appendChild(field({ path: 'palomnikam.lede', label: 'Вступительный текст', type: 'textarea', rows: 3 }));
      c1.appendChild(imgField('Большое фото', 'palomnikam.heroImg'));
      c1.appendChild(field({ path: 'palomnikam.heroMetaLeft', label: 'Подпись на фото слева (место)' }));
      c1.appendChild(field({ path: 'palomnikam.heroMetaRight', label: 'Подпись на фото справа (часы)' }));
      c1.appendChild(field({ path: 'palomnikam.rulesHeading', label: 'Заголовок над правилами' }));
      el.appendChild(c1);

      var c2 = document.createElement('div'); c2.className = 'admin-card'; c2.innerHTML = '<h3>Личный прием лам</h3>';
      c2.appendChild(field({ path: 'palomnikam.reception.title', label: 'Заголовок' }));
      c2.appendChild(field({ path: 'palomnikam.reception.desc', label: 'Описание', type: 'textarea', rows: 2 }));
      c2.appendChild(field({ path: 'palomnikam.reception.queue', label: 'Про очередь' }));
      c2.appendChild(field({ path: 'palomnikam.reception.hours', label: 'Часы приема' }));
      el.appendChild(c2);

      el.appendChild(subList('palomnikam.reception.items', 'Виды приема', [
        { key: 'icon', label: 'Иконка', type: 'icon', set: 'reception' },
        { key: 'title', label: 'Название' },
        { key: 'text', label: 'Описание', type: 'textarea', rows: 3 }
      ], function () { return { icon: 'spa', title: '', text: '' }; }, 'вид'));

      var c3 = document.createElement('div'); c3.className = 'admin-card'; c3.innerHTML = '<h3>Как добраться</h3>';
      c3.appendChild(field({ path: 'palomnikam.route.heading', label: 'Заголовок' }));
      c3.appendChild(field({ path: 'palomnikam.route.address', label: 'Адрес', type: 'textarea', rows: 2 }));
      c3.appendChild(field({ path: 'palomnikam.route.text', label: 'Как доехать', type: 'textarea', rows: 4 }));
      c3.appendChild(field({ path: 'palomnikam.route.gps', label: 'GPS-координаты' }));
      c3.appendChild(imgField('Фото дороги', 'palomnikam.route.img'));
      c3.appendChild(field({ path: 'palomnikam.route.imgBadge', label: 'Метка на фото' }));
      c3.appendChild(field({ path: 'palomnikam.route.hoursLeft', label: 'Часы: подпись' }));
      c3.appendChild(field({ path: 'palomnikam.route.hoursRight', label: 'Часы: значение' }));
      el.appendChild(c3);

      var c4 = document.createElement('div'); c4.className = 'admin-card'; c4.innerHTML = '<h3>Контакты и помощь обители</h3>';
      c4.appendChild(field({ path: 'palomnikam.contact.title', label: 'Заголовок блока контактов' }));
      c4.appendChild(field({ path: 'palomnikam.contact.text', label: 'Текст контактов', type: 'textarea', rows: 3 }));
      c4.appendChild(field({ path: 'palomnikam.contact.button', label: 'Надпись на кнопке' }));
      c4.appendChild(field({ path: 'palomnikam.charity.title', label: 'Заголовок про помощь обители' }));
      el.appendChild(c4);

      el.appendChild(subList('palomnikam.charity.paragraphs', 'Абзацы про помощь обители', [
        { key: 'p', label: 'Абзац', type: 'textarea', rows: 3, rich: true }
      ], function () { return ''; }, 'абзац', true));
    };

    views['palomnikam-rules'] = function (el) {
      el.appendChild(listView({
        title: 'Правила для паломников',
        desc: 'Карточки буддийского этикета.',
        path: 'palomnikam.rules', addLabel: 'правило',
        itemLabel: function (r) { return r.title || 'Без названия'; },
        fields: function (r) { return [
          field({ path: r.__path + '.title', label: 'Заголовок' }),
          iconPicker('Иконка', r.__path + '.icon', 'rule'),
          field({ path: r.__path + '.text', label: 'Текст', type: 'textarea', rows: 4, rich: true })
        ]; },
        blank: function () { return { icon: 'spa', title: 'Новое правило', text: '' }; }
      }));
    };

    views.media = function (el) {
      section(el, 'Фотографии сайта', 'Здесь собраны все фото. Загружайте новые — они сразу доступны для всех разделов.');
      var up = document.createElement('label');
      up.className = 'btn btn-primary';
      up.style.marginBottom = '16px';
      up.innerHTML = 'Выбрать фото с компьютера';
      var file = document.createElement('input');
      file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
      up.appendChild(file);
      file.addEventListener('change', function () {
        if (!file.files[0]) return;
        uploadImage(file.files[0]).then(function () {
          toast('Фото загружено!');
          buildView('media');
        }).catch(function (err) { toast('Не получилось: ' + err.message, true); });
      });
      el.appendChild(up);

      var grid = document.createElement('div');
      grid.className = 'admin-loading';
      grid.textContent = 'Открываю галерею…';
      el.appendChild(grid);
      listImages().then(function (files) {
        grid.className = 'media-grid';
        grid.innerHTML = '';
        if (!files.length) { grid.className = 'admin-loading'; grid.textContent = 'Пока нет фото — загрузите первое!'; return; }
        files.forEach(function (f) {
          var cell = document.createElement('div');
          cell.className = 'media-cell';
          cell.innerHTML = '<img src="' + f.url + '" alt="" loading="lazy">' +
            '<span class="media-meta"><span class="media-name">' + f.name + '</span>' +
            '<span class="media-size">' + (Math.round(f.size / 1024)) + ' КБ</span></span>';
          grid.appendChild(cell);
        });
      }).catch(function (err) {
        grid.className = 'admin-loading';
        grid.textContent = 'Не удалось открыть галерею: ' + err.message;
      });
    };

    views.settings = function (el) {
      section(el, 'Подключение к сайту', 'Ключ доступа — это пароль от сайта, по которому панель публикует изменения.');
      var c = document.createElement('div'); c.className = 'admin-card';
      var status = document.createElement('div');
      status.className = 'conn-status';
      if (gh.isConnected()) {
        status.innerHTML = '<span class="conn-dot ok"></span> Сайт подключён — ключ сохранён в этом браузере.';
        var forget = mkBtn('Отключить сайт от этого браузера', '', function () {
          if (!confirm('Отключить? Тогда при следующей публикации нужно будет ввести ключ заново.')) return;
          gh.forgetToken();
          buildView('settings');
        });
        status.appendChild(forget);
      } else {
        status.innerHTML = '<span class="conn-dot bad"></span> Сайт ещё не подключён. Нажмите кнопку ниже — я проведу вас по шагам.';
        var conn = mkBtn('Подключить сайт', '', function () { openTokenWizard(function () { buildView('settings'); }); });
        conn.classList.add('btn-primary');
        conn.classList.remove('btn-secondary');
        status.appendChild(conn);
      }
      c.appendChild(status);
      el.appendChild(c);
    };
  }

  // Вложенный список
  function subList(path, title, fields, blank, addLabel, isPlain) {
    var wrapEl = document.createElement('div');
    wrapEl.className = 'admin-card';

    function build() {
      wrapEl.innerHTML = '<h3>' + title + '</h3>';
      var list = getModel(path) || [];
      list.forEach(function (item, i) {
        var itemPath = isPlain ? (path + '.' + i) : (path + '.' + i + '.' + fields[0].key);
        fields.forEach(function (f) {
          var realPath = isPlain ? (path + '.' + i) : (path + '.' + i + '.' + f.key);
          if (f.type === 'img') wrapEl.appendChild(imgField(f.label, realPath));
          else if (f.type === 'icon') wrapEl.appendChild(iconPicker(f.label, realPath, f.set));
          else wrapEl.appendChild(field({ path: realPath, label: f.label, type: f.type, rows: f.rows, rich: f.rich }));
        });
        var del = mkBtn('✕ Удалить', 'Удалить', function () {
          if (!confirm('Удалить ' + (isPlain ? 'этот абзац' : 'эту запись') + '?')) return;
          getModel(path).splice(i, 1);
          store.save();
          wrapEl.innerHTML = '';
          build();
        });
        del.classList.add('btn-danger');
        del.style.marginTop = '8px';
        del.style.marginBottom = '16px';
        wrapEl.appendChild(del);
        var sep = document.createElement('hr');
        sep.style.border = 'none';
        sep.style.borderTop = '1px solid var(--linen)';
        sep.style.margin = '0 0 16px';
        wrapEl.appendChild(sep);
      });
      var add = mkBtn('+ Добавить «' + addLabel + '»', '', function () {
        var arr = getModel(path);
        if (!arr) { arr = []; setModel(path, arr); }
        arr.push(blank());
        store.save();
        wrapEl.innerHTML = '';
        build();
      });
      add.classList.add('btn-primary');
      add.classList.remove('btn-secondary');
      wrapEl.appendChild(add);
    }
    build();
    return wrapEl;
  }

  // Поля со __path
  // listView передаёт item c __path в fields() — дополним в build
  var origListView = listView;
  listView = function (opts) {
    var wrap = document.createElement('div');
    function build() {
      wrap.innerHTML = '';
      var head = document.createElement('div');
      head.className = 'admin-section-head';
      head.innerHTML = '<h2></h2><p></p>';
      head.querySelector('h2').textContent = opts.title;
      head.querySelector('p').textContent = opts.desc || '';
      wrap.appendChild(head);
      var holder = document.createElement('div');
      var list = getModel(opts.path) || [];
      list.forEach(function (item, i) {
        item.__path = opts.path + '.' + i;
        var card = document.createElement('div');
        card.className = 'admin-card';
        var row = document.createElement('div');
        row.className = 'admin-row-head';
        var t = document.createElement('span');
        t.className = 'row-title';
        t.textContent = (i + 1) + '. ' + opts.itemLabel(item, i);
        row.appendChild(t);
        var actions = document.createElement('div');
        actions.className = 'admin-row-actions';
        actions.appendChild(mkBtn('↑', 'Выше', function () { move(i, -1); }));
        actions.appendChild(mkBtn('↓', 'Ниже', function () { move(i, 1); }));
        var del = mkBtn('✕', 'Удалить', function () { delItem(i); });
        del.classList.add('btn-danger');
        actions.appendChild(del);
        row.appendChild(actions);
        card.appendChild(row);
        opts.fields(item, i).forEach(function (el) { card.appendChild(el); });
        holder.appendChild(card);
      });
      var add = mkBtn('+ Добавить «' + opts.addLabel + '»', '', function () {
        var arr = getModel(opts.path);
        if (!arr) { arr = []; setModel(opts.path, arr); }
        arr.push(opts.blank());
        store.save();
        build();
      });
      add.classList.add('btn-primary');
      add.classList.remove('btn-secondary');
      add.style.marginTop = '8px';
      holder.appendChild(add);
      wrap.appendChild(holder);
    }
    function move(i, dir) {
      var arr = getModel(opts.path);
      var j = i + dir;
      if (j < 0 || j >= arr.length) return;
      var tmp = arr[j]; arr[j] = arr[i]; arr[i] = tmp;
      store.save();
      build();
    }
    function delItem(i) {
      var arr = getModel(opts.path);
      if (!confirm('Точно удалить запись «' + opts.itemLabel(arr[i], i) + '»?')) return;
      arr.splice(i, 1);
      store.save();
      build();
    }
    build();
    return wrap;
  };

  // ---------------- Навигация ----------------
  function buildView(name) {
    var el = $('#admin-main');
    el.innerHTML = '';
    if (views[name]) views[name](el);
  }
  function navTo(name) {
    currentView = name;
    $$('.admin-nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === name);
    });
    buildView(name);
    window.scrollTo(0, 0);
  }

  // ---------------- Публикация ----------------
  function publish() {
    if (!store.dirty && !confirm('Вы ничего не меняли с последней публикации. Всё равно опубликовать?')) return;
    // чистим служебное поле __path перед сохранением
    var clean = JSON.parse(JSON.stringify(store.data, function (k, v) { return k === '__path' ? undefined : v; }));

    var doPut = function () {
      var btn = $('#save-all-btn');
      btn.disabled = true;
      btn.textContent = 'Публикую…';
      return gh.put('data.json', JSON.stringify(clean, null, 2), 'Обновление содержимого сайта').then(function (r) {
        if (!r.ok) throw ghError(r);
        return r.json();
      }).then(function () {
        store.dirty = false;
        store.save(false);
        updateDirtyBadge();
        toast('Готово! Изменения опубликованы. На сайте появятся через 1–2 минуты.');
      }).catch(function (err) {
        toast('Не получилось опубликовать: ' + err.message, true);
      }).then(function () {
        btn.disabled = false;
        btn.innerHTML = '<svg class="ic ic-md" aria-hidden="true"><use href="assets/icons/sprite.svg#i-send"/></svg> Опубликовать';
      });
    };

    if (!gh.isConnected()) {
      openTokenWizard(function () { doPut(); });
    } else {
      doPut();
    }
  }

  // ---------------- Защита от потери правок ----------------
  window.addEventListener('beforeunload', function (e) {
    if (store.dirty) {
      e.preventDefault();
      e.returnValue = 'Есть несохранённые (не опубликованные) изменения. Уйдёте без публикации?';
    }
  });

  // ---------------- Старт ----------------
  function openPanel() {
    $('#login-screen').style.display = 'none';
    $('#admin-app').hidden = false;
    store.load().then(function () {
      buildViews();
      navTo('site');
      updateDirtyBadge();
    });
  }

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var pass = $('#admin-pass').value;
    sha256(pass).then(function (h) {
      if (h === CONFIG.passHash) {
        sessionStorage.setItem('huree-admin-auth', '1');
        openPanel();
      } else {
        $('#login-error').hidden = false;
        $('#admin-pass').value = '';
      }
    }).catch(function () { $('#login-error').hidden = false; });
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.admin-nav-btn');
    if (btn) { navTo(btn.dataset.view); return; }
    if (e.target.closest('#save-all-btn')) { publish(); return; }
    if (e.target.closest('#logout-btn')) {
      sessionStorage.removeItem('huree-admin-auth');
      store.reset();
      location.reload();
    }
    if (e.target.closest('#export-btn')) {
      var blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'huree-backup.json';
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });

  if (sessionStorage.getItem('huree-admin-auth') === '1') {
    openPanel();
  }
})();
