// Админ-панель Устуу-Хурээ
// Хранение: sessionStorage (данные) + публикация в GitHub через Contents API.
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // КОНФИГ ПУБЛИКАЦИИ
  // repo: репозиторий GitHub; branch: ветка; passHash: sha256 пароля входа.
  // ------------------------------------------------------------------
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
    // небезопасный фолбэк для старых браузеров не используем — просто отклоняем
    return Promise.reject(new Error('Web Crypto недоступен'));
  }
  function toast(msg, isErr) {
    var t = $('#admin-toast');
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.hidden = false;
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.hidden = true; }, 4000);
  }
  function debounce(fn, ms) {
    var tm;
    return function () {
      var args = arguments, self = this;
      clearTimeout(tm);
      tm = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }
  function uid(prefix) { return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ---------------- Хранилище ----------------
  var store = {
    data: null,
    load: function () {
      var raw = sessionStorage.getItem('huree-admin-data');
      if (raw) { store.data = JSON.parse(raw); return Promise.resolve(store.data); }
      return fetch('data.json', { cache: 'no-cache' })
        .then(function (r) { return r.json(); })
        .then(function (d) { store.data = d; store.save(); return d; });
    },
    save: function () { sessionStorage.setItem('huree-admin-data', JSON.stringify(store.data)); },
    reset: function () { sessionStorage.removeItem('huree-admin-data'); }
  };

  // ---------------- Токен GitHub ----------------
  // PAT вводится при публикации (не храним в коде): нужен scope repo.contents.
  var gh = {
    token: sessionStorage.getItem('huree-gh-token') || '',
    api: function (path) { return 'https://api.github.com/repos/' + CONFIG.repo + path; },
    authHeaders: function () { return { Authorization: 'token ' + gh.token, Accept: 'application/vnd.github+json' }; },
    getSha: function (path) {
      return fetch(gh.api('/contents/' + path + '?ref=' + CONFIG.branch + '&t=' + Date.now()), { headers: gh.authHeaders(), cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('GitHub ' + r.status); return r.json(); })
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

  // ---------------- Вход ----------------
  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var pass = $('#admin-pass').value;
    sha256(pass).then(function (h) {
      if (h === CONFIG.passHash) {
        sessionStorage.setItem('huree-admin-auth', '1');
        openPanel();
      } else {
        $('#login-error').hidden = false;
      }
    }).catch(function () { $('#login-error').hidden = false; });
  });

  function openPanel() {
    $('#login-screen').style.display = 'none';
    $('#admin-app').hidden = false;
    store.load().then(function () { buildViews(); navTo('site'); });
  }

  $('#logout-btn') && $('#logout-btn').addEventListener('click', function () {
    sessionStorage.removeItem('huree-admin-auth');
    sessionStorage.removeItem('huree-gh-token');
    store.reset();
    location.reload();
  });

  // ---------------- Поля формы (декларативные) ----------------
  // f: {path, type, label, placeholder, rows}
  function field(f) {
    var wrap = document.createElement('div');
    wrap.className = 'field';
    var id = uid('f');
    var label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = f.label;
    wrap.appendChild(label);

    var el;
    if (f.type === 'textarea') {
      el = document.createElement('textarea');
      el.rows = f.rows || 4;
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

    // значение из модели
    var v = getModel(f.path);
    if (v != null) el.value = v;
    el.addEventListener('input', debounce(function () {
      setModel(f.path, el.value);
    }, 150));
    el.addEventListener('change', function () { setModel(f.path, el.value); });
    return wrap;
  }

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
  // путь с индексом: 'lamas.0.name'
  function reindex(listPath) {
    // ничего — индексы стабильны пока не удаляем; при удалении пересобираем view
  }

  // Поле-изображение: превью + путь + загрузка файла + выбор из медиатеки
  function imgField(label, path, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'field img-field';

    var lab = document.createElement('label');
    lab.textContent = label;
    wrap.appendChild(lab);

    var row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '16px';
    row.style.alignItems = 'flex-start';
    row.style.flexWrap = 'wrap';

    var prev = document.createElement('div');
    prev.className = 'img-preview';
    function setPrev() {
      var v = getModel(path);
      prev.innerHTML = v ? '<img src="' + v + '" alt="">' : '';
    }
    setPrev();

    var right = document.createElement('div');
    right.style.display = 'flex';
    right.style.flexDirection = 'column';
    right.style.gap = '8px';
    right.style.minWidth = '220px';
    right.style.flex = '1';

    var input = document.createElement('input');
    input.className = 'input';
    input.dataset.model = path;
    input.value = getModel(path) || '';
    input.placeholder = 'assets/img/...';
    input.addEventListener('input', debounce(function () {
      setModel(path, input.value);
      setPrev();
    }, 150));
    right.appendChild(input);

    var ctrl = document.createElement('div');
    ctrl.className = 'img-controls';

    var upBtn = document.createElement('label');
    upBtn.className = 'btn btn-secondary';
    upBtn.style.minHeight = '38px';
    upBtn.style.fontSize = '14px';
    upBtn.textContent = 'Загрузить фото…';
    var file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.hidden = true;
    upBtn.appendChild(file);
    file.addEventListener('change', function () {
      if (!file.files || !file.files[0]) return;
      uploadImage(file.files[0]).then(function (imgPath) {
        input.value = imgPath;
        setModel(path, imgPath);
        setPrev();
        toast('Фото загружено: ' + imgPath + '. Не забудьте «Опубликовать».');
      }).catch(function (err) {
        toast('Ошибка загрузки: ' + err.message, true);
      });
    });
    ctrl.appendChild(upBtn);

    var pickBtn = document.createElement('button');
    pickBtn.className = 'btn btn-secondary';
    pickBtn.style.minHeight = '38px';
    pickBtn.style.fontSize = '14px';
    pickBtn.type = 'button';
    pickBtn.textContent = 'Выбрать из медиатеки';
    pickBtn.addEventListener('click', function () {
      openMediaPicker(function (p) {
        input.value = p;
        setModel(path, p);
        setPrev();
      });
    });
    ctrl.appendChild(pickBtn);

    right.appendChild(ctrl);
    row.appendChild(prev);
    row.appendChild(right);
    wrap.appendChild(row);
    return wrap;
  }

  // ---------------- Загрузка изображения в GitHub ----------------
  function uploadImage(fileObj) {
    return ensureToken().then(function () {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onerror = function () { reject(new Error('Не удалось прочитать файл')); };
        fr.onload = function () {
          var name = fileObj.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/\.jpe?g$/, '.jpg').replace(/\.png$/, '.png').replace(/\.webp$/, '.webp');
          if (!/\.(jpg|jpeg|png|webp|gif)$/.test(name)) name += '.jpg';
          var path = CONFIG.imgDir + '/' + name;
          var b64 = fr.result.split(',')[1];
          return gh.getSha(path).catch(function () { return null; }).then(function (sha) {
            return fetch(gh.api('/contents/' + path), {
              method: 'PUT',
              headers: gh.authHeaders(),
              body: JSON.stringify({
                message: 'admin: загрузка фото ' + name,
                content: b64,
                sha: sha || undefined,
                branch: CONFIG.branch
              })
            });
          }).then(function (r) {
            if (!r.ok) throw new Error('GitHub ' + r.status);
            return path;
          }).then(resolve, reject);
        };
        fr.readAsDataURL(fileObj);
      });
    });
  }

  // ---------------- Выбор из медиатеки ----------------
  function listImages() {
    return ensureToken().then(function () {
      return fetch(gh.api('/contents/' + CONFIG.imgDir + '?ref=' + CONFIG.branch + '&t=' + Date.now()), {
        headers: gh.authHeaders(), cache: 'no-store'
      }).then(function (r) {
        if (!r.ok) throw new Error('GitHub ' + r.status);
        return r.json();
      }).then(function (files) {
        return files.filter(function (f) { return f.type === 'file' && /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name); });
      });
    });
  }

  var mediaPickerBack = null;
  function openMediaPicker(cb) {
    var main = $('#admin-main');
    mediaPickerBack = currentView;
    main.innerHTML = '<div class="admin-loading">Загружаю медиатеку…</div>';
    listImages().then(function (files) {
      main.innerHTML = '';
      var head = document.createElement('div');
      head.className = 'admin-section-head';
      head.innerHTML = '<h2>Выбор фото</h2><p>Нажмите на изображение, чтобы подставить его путь.</p>';
      main.appendChild(head);

      var grid = document.createElement('div');
      grid.className = 'media-grid';
      files.forEach(function (f) {
        var cell = document.createElement('button');
        cell.className = 'media-cell';
        cell.type = 'button';
        cell.style.cursor = 'pointer';
        cell.innerHTML = '<img src="' + f.download_url + '" alt="" loading="lazy">' +
          '<span class="media-meta"><span class="media-name">' + f.name + '</span></span>';
        cell.addEventListener('click', function () {
          cb(CONFIG.imgDir + '/' + f.name);
          navTo(mediaPickerBack || 'site');
        });
        grid.appendChild(cell);
      });
      main.appendChild(grid);

      var back = document.createElement('button');
      back.className = 'btn btn-secondary';
      back.type = 'button';
      back.style.marginTop = '16px';
      back.textContent = '← Назад без выбора';
      back.addEventListener('click', function () { navTo(mediaPickerBack || 'site'); });
      main.appendChild(back);
    }).catch(function (err) {
      toast('Не удалось получить список фото: ' + err.message, true);
      navTo(mediaPickerBack || 'site');
    });
  }

  // ---------------- Токен ----------------
  var tokenModalShown = false;
  function ensureToken() {
    if (gh.token) return Promise.resolve(gh.token);
    return new Promise(function (resolve, reject) {
      var t = prompt('Для работы с GitHub введите Personal Access Token (scope: repo).\nЕго можно создать на https://github.com/settings/tokens');
      if (!t) { reject(new Error('Токен не введён')); return; }
      gh.token = t.trim();
      sessionStorage.setItem('huree-gh-token', gh.token);
      resolve(gh.token);
    });
  }

  // ---------------- Списки (CRUD) ----------------
  function listView(opts) {
    // opts: {title, path, itemLabel(item,i), fields(f,i), blank() => new item}
    var wrap = document.createElement('div');

    var head = document.createElement('div');
    head.className = 'admin-section-head';
    head.innerHTML = '<h2>' + opts.title + '</h2><p>' + (opts.desc || '') + '</p>';
    wrap.appendChild(head);

    function render() {
      $$('div', wrap).forEach(function () {}); // no-op
      var cards = $('.admin-list', wrap);
      if (cards) cards.remove();
      var list = getModel(opts.path) || [];

      var holder = document.createElement('div');
      holder.className = 'admin-list';

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
        var up = document.createElement('button');
        up.className = 'btn btn-secondary'; up.type = 'button'; up.textContent = '↑';
        up.addEventListener('click', function () {
          if (i === 0) return;
          var arr = getModel(opts.path);
          var tmp = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = tmp;
          store.save(); rerender();
        });
        var down = document.createElement('button');
        down.className = 'btn btn-secondary'; down.type = 'button'; down.textContent = '↓';
        down.addEventListener('click', function () {
          var arr = getModel(opts.path);
          if (i >= arr.length - 1) return;
          var tmp = arr[i + 1]; arr[i + 1] = arr[i]; arr[i] = tmp;
          store.save(); rerender();
        });
        var del = document.createElement('button');
        del.className = 'btn btn-danger'; del.type = 'button'; del.textContent = 'Удалить';
        del.addEventListener('click', function () {
          if (!confirm('Удалить запись «' + opts.itemLabel(item, i) + '»?')) return;
          var arr = getModel(opts.path);
          arr.splice(i, 1);
          store.save(); rerender();
        });
        actions.appendChild(up); actions.appendChild(down); actions.appendChild(del);
        row.appendChild(actions);
        card.appendChild(row);

        opts.fields.forEach(function (f) {
          var def = Object.assign({}, f, { path: opts.path + '.' + i + '.' + f.key });
          if (f.type === 'img') card.appendChild(imgField(f.label, def.path));
          else if (f.type === 'select') card.appendChild(field(Object.assign({}, def, { options: f.options })));
          else card.appendChild(field(Object.assign({}, def, { type: f.type || 'text' })));
        });

        holder.appendChild(card);
      });

      function rerender() { render(); }

      var add = document.createElement('button');
      add.className = 'btn btn-primary';
      add.type = 'button';
      add.style.marginTop = '8px';
      add.textContent = '+ Добавить запись';
      add.addEventListener('click', function () {
        var arr = getModel(opts.path);
        if (!arr) { arr = []; setModel(opts.path, arr); }
        arr.push(opts.blank());
        store.save(); rerender();
      });
      holder.appendChild(add);
      wrap.appendChild(holder);
      // перерисовка: просто пересобрать весь view
      holder._rerender = rerender;
      // Оборачиваем rerender для пересборки всего раздела
      wrap._rerenderAll = function () { buildView(opts.view); navTo(opts.view, true); };
      // заменяем локальный rerender на пересборку
      holder._rerender = holder._rerender; // keep
    }
    render();
    return wrap;
  }

  // ---------------- Разделы ----------------
  var views = {};
  var currentView = 'site';

  function section(container, title, desc) {
    var head = document.createElement('div');
    head.className = 'admin-section-head';
    head.innerHTML = '<h2></h2><p></p>';
    head.querySelector('h2').textContent = title;
    head.querySelector('p').textContent = desc || '';
    container.appendChild(head);
    return container;
  }

  function buildViews() {
    views.site = function (el) {
      section(el, 'Общие настройки', 'Название, телефон и часы работы — отображаются на всех страницах.');
      var card = document.createElement('div');
      card.className = 'admin-card';
      card.appendChild(field({ path: 'site.name', label: 'Название сайта' }));
      card.appendChild(field({ path: 'site.phone', label: 'Телефон (отображение)', placeholder: '+7 (___) ___-__-__' }));
      card.appendChild(field({ path: 'site.phoneHref', label: 'Телефон (ссылка tel:)', placeholder: 'tel:+7…' }));
      card.appendChild(field({ path: 'site.hours', label: 'Часы работы' }));
      card.appendChild(field({ path: 'site.footerRegion', label: 'Строка копирайта в подвале', type: 'textarea', rows: 2 }));
      el.appendChild(card);
    };

    views['home'] = function (el) {
      section(el, 'Главная: тексты и фото', 'Заголовки, вступления и фотографии главной страницы.');
      var c1 = document.createElement('div'); c1.className = 'admin-card'; c1.appendChild(field({ path: 'home.eyebrow', label: 'Надзаголовок' }));
      c1.appendChild(field({ path: 'home.title', label: 'Заголовок (H1)' }));
      c1.appendChild(field({ path: 'home.lede', label: 'Вступление', type: 'textarea', rows: 3 }));
      c1.appendChild(imgField('Главное фото (hero)', 'home.heroImg'));
      c1.appendChild(field({ path: 'home.heroCaption', label: 'Подпись на фото' }));
      el.appendChild(c1);

      var c2 = document.createElement('div'); c2.className = 'admin-card'; c2.innerHTML = '<h3>Основание (1905–1907)</h3>';
      c2.appendChild(field({ path: 'home.foundation.eyebrow', label: 'Метка раздела' }));
      c2.appendChild(field({ path: 'home.foundation.title', label: 'Заголовок' }));
      c2.appendChild(field({ path: 'home.foundation.subtitle', label: 'Подзаголовок' }));
      c2.appendChild(field({ path: 'home.foundation.text', label: 'Текст', type: 'textarea', rows: 3 }));
      c2.appendChild(field({ path: 'home.foundation.bentoTitle', label: 'Заголовок врезки' }));
      c2.appendChild(field({ path: 'home.foundation.bentoText', label: 'Текст врезки', type: 'textarea', rows: 4 }));
      el.appendChild(c2);

      var c3 = document.createElement('div'); c3.className = 'admin-card'; c3.innerHTML = '<h3>Прочие тексты главной</h3>';
      c3.appendChild(field({ path: 'home.revivalEyebrow', label: 'Метка «Возрождение»' }));
      c3.appendChild(field({ path: 'home.lamasEyebrow', label: 'Метка «Наставники»' }));
      c3.appendChild(field({ path: 'home.lamasTitle', label: 'Заголовок наставников' }));
      c3.appendChild(field({ path: 'home.lamasText', label: 'Описание наставников', type: 'textarea', rows: 2 }));
      c3.appendChild(field({ path: 'home.relicsEyebrow', label: 'Метка «Святыни»' }));
      c3.appendChild(field({ path: 'home.relicsTitle', label: 'Заголовок реликвий' }));
      c3.appendChild(field({ path: 'home.relicsText', label: 'Описание реликвий', type: 'textarea', rows: 2 }));
      c3.appendChild(field({ path: 'home.quote.text', label: 'Цитата-наставление', type: 'textarea', rows: 4 }));
      c3.appendChild(field({ path: 'home.quote.author', label: 'Автор цитаты' }));
      el.appendChild(c3);

      // Эры — вложенный список
      el.appendChild(buildSubList('home.eras', 'Эры истории', [
        { key: 'era', label: 'Метка (годы)' },
        { key: 'title', label: 'Заголовок' },
        { key: 'text', label: 'Текст', type: 'textarea', rows: 3 },
        { key: 'img', label: 'Фото', type: 'img' },
        { key: 'imgAlt', label: 'Alt фото' }
      ], function () {
        return { era: 'Новая эра', title: 'Заголовок', text: 'Текст', img: '', imgAlt: '' };
      }));
    };

    views.lamas = function (el) {
      el.appendChild(listView({
        title: 'Ламы и наставники',
        desc: 'Карточки священнослужителей на главной странице.',
        path: 'lamas', view: 'lamas',
        itemLabel: function (l) { return l.name || 'Без имени'; },
        fields: [
          { key: 'name', label: 'Имя' },
          { key: 'spec', label: 'Специализация' },
          { key: 'badge', label: 'Бейдж' },
          { key: 'badgeVariant', label: 'Цвет бейджа', type: 'select', options: [
            { v: 'primary', t: 'Бордо' }, { v: 'tag', t: 'Терракота' }, { v: 'muted', t: 'Латунь' }, { v: 'outline', t: 'Контурный' }
          ] },
          { key: 'photo', label: 'Фото', type: 'img' },
          { key: 'quote', label: 'Цитата', type: 'textarea', rows: 3 },
          { key: 'days', label: 'Дни и часы приема' },
          { key: 'tag', label: 'Отметка' },
          { key: 'tagVariant', label: 'Цвет отметки', type: 'select', options: [
            { v: 'primary', t: 'Бордо' }, { v: 'secondary', t: 'Терракота' }
          ] }
        ],
        blank: function () {
          return { badge: 'Лама', badgeVariant: 'muted', name: 'Новое имя', spec: '', photo: '', quote: '', days: 'Вт–Вс, 09:00 – 13:00', tag: 'Личный прием', tagVariant: 'primary' };
        }
      }));
    };

    views.relics = function (el) {
      el.appendChild(listView({
        title: 'Реликвии',
        desc: 'Святыни урочища на главной странице.',
        path: 'relics', view: 'relics',
        itemLabel: function (r) { return r.title || 'Без названия'; },
        fields: [
          { key: 'title', label: 'Название' },
          { key: 'text', label: 'Описание', type: 'textarea', rows: 3 },
          { key: 'photo', label: 'Фото', type: 'img' }
        ],
        blank: function () { return { title: 'Новая реликвия', text: '', photo: '' }; }
      }));
    };

    views.khuraly = function (el) {
      section(el, 'Хуралы: настройки раздела', 'Тексты и карточка расписания.');
      var c = document.createElement('div'); c.className = 'admin-card';
      c.appendChild(field({ path: 'khuraly.eyebrow', label: 'Надзаголовок' }));
      c.appendChild(field({ path: 'khuraly.title', label: 'Заголовок (H1)' }));
      c.appendChild(field({ path: 'khuraly.lede', label: 'Вступление', type: 'textarea', rows: 3 }));
      c.appendChild(imgField('Фото карточки', 'khuraly.cardImg'));
      c.appendChild(field({ path: 'khuraly.cardTitle', label: 'Заголовок карточки' }));
      c.appendChild(field({ path: 'khuraly.cardText', label: 'Текст карточки', type: 'textarea', rows: 2 }));
      c.appendChild(field({ path: 'khuraly.dayHeading', label: 'Заголовок дня' }));
      c.appendChild(field({ path: 'khuraly.lunarDay', label: 'Лунный день (бейдж)' }));
      c.appendChild(field({ path: 'khuraly.yearLabel', label: 'Год по календарю' }));
      el.appendChild(c);

      var c2 = document.createElement('div'); c2.className = 'admin-card'; c2.innerHTML = '<h3>Тексты формы записки</h3>';
      c2.appendChild(field({ path: 'khuraly.formTitle', label: 'Заголовок формы' }));
      c2.appendChild(field({ path: 'khuraly.formDesc', label: 'Описание', type: 'textarea', rows: 2 }));
      c2.appendChild(field({ path: 'khuraly.formNamesHint', label: 'Подсказка об именах', type: 'textarea', rows: 2 }));
      c2.appendChild(field({ path: 'khuraly.formDonationHint', label: 'Подсказка о пожертвовании', type: 'textarea', rows: 2 }));
      c2.appendChild(field({ path: 'khuraly.formSuccess', label: 'Сообщение об успехе' }));
      c2.appendChild(field({ path: 'khuraly.formSuccessNote', label: 'Дополнение об успехе' }));
      el.appendChild(c2);

      var c3 = document.createElement('div'); c3.className = 'admin-card'; c3.innerHTML = '<h3>Лунный календарь</h3>';
      c3.appendChild(field({ path: 'khuraly.moonHeading', label: 'Заголовок блока' }));
      c3.appendChild(field({ path: 'khuraly.moonSubheading', label: 'Подзаголовок блока' }));
      el.appendChild(c3);
    };

    views.services = function (el) {
      el.appendChild(listView({
        title: 'Молебны (службы дня)',
        desc: 'Карточки хуралов на странице расписания.',
        path: 'services', view: 'services',
        itemLabel: function (s) { return s.title || 'Без названия'; },
        fields: [
          { key: 'title', label: 'Название хурала' },
          { key: 'time', label: 'Время' },
          { key: 'timeVariant', label: 'Цвет бейджа времени', type: 'select', options: [
            { v: 'primary', t: 'Бордо' }, { v: 'time', t: 'Золото' }, { v: 'muted', t: 'Серый' }
          ] },
          { key: 'tag', label: 'Метка (напр. «Ежедневно»)' },
          { key: 'place', label: 'Место' },
          { key: 'text', label: 'Описание', type: 'textarea', rows: 3 },
          { key: 'watermark', label: 'Иконка-фон (shield/spa/…)', type: 'text' },
          { key: 'offering', label: 'Подношение (строка)' },
          { key: 'offeringIcon', label: 'Иконка подношения' },
          { key: 'note', label: 'Примечание (если без кнопки)', type: 'textarea', rows: 2 },
          { key: 'hasNoteButton', label: 'Показывать кнопку «Подать записку»', type: 'select', options: [
            { v: 'true', t: 'Да' }, { v: 'false', t: 'Нет' }
          ] }
        ],
        blank: function () {
          return { time: '00:00 — 00:00', timeVariant: 'primary', tag: '', place: 'Главный дуган', title: 'Новый хурал', text: '', offering: '', hasNoteButton: true };
        }
      }));
    };

    views.moon = function (el) {
      el.appendChild(listView({
        title: 'Особые дни лунного календаря',
        desc: 'Карточки лунных дней на странице хуралов.',
        path: 'moon', view: 'moon',
        itemLabel: function (m) { return (m.day ? m.day + ' — ' : '') + (m.title || ''); },
        fields: [
          { key: 'day', label: 'Число' },
          { key: 'variant', label: 'Стиль числа', type: 'select', options: [
            { v: '8', t: 'Золотой' }, { v: '15', t: 'Бордовый' }, { v: '30', t: 'Льняной' }
          ] },
          { key: 'kind', label: 'Тип дня' },
          { key: 'title', label: 'Название' },
          { key: 'text', label: 'Описание', type: 'textarea', rows: 3 }
        ],
        blank: function () { return { day: '1', variant: '15', kind: 'Лунный день', title: '', text: '' }; }
      }));
    };

    views['novosti-head'] = function (el) {
      section(el, 'Новости: настройки раздела', 'Заголовки и главная новость.');
      var c = document.createElement('div'); c.className = 'admin-card';
      c.appendChild(field({ path: 'novosti.eyebrow', label: 'Надзаголовок' }));
      c.appendChild(field({ path: 'novosti.title', label: 'Заголовок (H1)' }));
      c.appendChild(field({ path: 'novosti.lede', label: 'Вступление', type: 'textarea', rows: 2 }));
      c.appendChild(field({ path: 'novosti.chronicleHeading', label: 'Заголовок хроники' }));
      el.appendChild(c);

      var f = document.createElement('div'); f.className = 'admin-card'; f.innerHTML = '<h3>Главная новость</h3>';
      f.appendChild(imgField('Фото', 'novosti.featured.img'));
      f.appendChild(field({ path: 'novosti.featured.alt', label: 'Alt фото' }));
      f.appendChild(field({ path: 'novosti.featured.flag', label: 'Флаг-метка' }));
      f.appendChild(field({ path: 'novosti.featured.reading', label: 'Время чтения' }));
      f.appendChild(field({ path: 'novosti.featured.cat', label: 'Категория' }));
      f.appendChild(field({ path: 'novosti.featured.date', label: 'Дата (текст)' }));
      f.appendChild(field({ path: 'novosti.featured.datetime', label: 'Дата (ISO, для SEO)', placeholder: '2024-05-18' }));
      f.appendChild(field({ path: 'novosti.featured.title', label: 'Заголовок' }));
      f.appendChild(field({ path: 'novosti.featured.text', label: 'Текст', type: 'textarea', rows: 3 }));
      f.appendChild(field({ path: 'novosti.featured.quote', label: 'Цитата', type: 'textarea', rows: 2 }));
      f.appendChild(field({ path: 'novosti.featured.link', label: 'Текст ссылки' }));
      f.appendChild(field({ path: 'novosti.featured.linkHref', label: 'Ссылка (huraly.html и т.п.)' }));
      el.appendChild(f);

      var s = document.createElement('div'); s.className = 'admin-card'; s.innerHTML = '<h3>Подписка</h3>';
      s.appendChild(field({ path: 'novosti.subscribe.title', label: 'Заголовок' }));
      s.appendChild(field({ path: 'novosti.subscribe.text', label: 'Текст', type: 'textarea', rows: 2 }));
      s.appendChild(field({ path: 'novosti.subscribe.hint', label: 'Подсказка', type: 'textarea', rows: 2 }));
      s.appendChild(field({ path: 'novosti.subscribe.success', label: 'Успех' }));
      s.appendChild(field({ path: 'novosti.subscribe.successNote', label: 'Дополнение об успехе' }));
      el.appendChild(s);

      // Категории
      el.appendChild(buildSubList('novosti.categories', 'Категории фильтра', [
        { key: 'id', label: 'ID (латиницей)' },
        { key: 'label', label: 'Название' }
      ], function () { return { id: 'new', label: 'Новая категория' }; }));
    };

    views['novosti-items'] = function (el) {
      el.appendChild(listView({
        title: 'Новости: записи',
        desc: 'Хроника обители. Категория должна совпадать с ID категории фильтра.',
        path: 'novosti.items', view: 'novosti-items',
        itemLabel: function (n) { return n.title || 'Без названия'; },
        fields: [
          { key: 'title', label: 'Заголовок' },
          { key: 'excerpt', label: 'Кратко', type: 'textarea', rows: 2 },
          { key: 'cat', label: 'Категория (id)', type: 'select', options: [
            { v: 'huraly', t: 'huraly — Праздники и хуралы' },
            { v: 'besedy', t: 'besedy — Беседы лам' },
            { v: 'restavraciya', t: 'restavraciya — Восстановление храма' }
          ] },
          { key: 'catLabel', label: 'Категория (отображение)' },
          { key: 'catIcon', label: 'Иконка категории' },
          { key: 'date', label: 'Дата (текст)' },
          { key: 'dateIcon', label: 'Иконка даты (или пусто)' },
          { key: 'img', label: 'Фото', type: 'img' },
          { key: 'imgAlt', label: 'Alt фото' },
          { key: 'linkLabel', label: 'Текст ссылки' }
        ],
        blank: function () {
          return { cat: 'huraly', catLabel: 'Хуралы', catIcon: 'event', title: 'Новая запись', excerpt: '', date: '1 января 2025', img: '', linkLabel: 'Подробнее →' };
        }
      }));
    };

    views.palomnikam = function (el) {
      section(el, 'Паломникам: тексты', 'Заголовки, прием лам, дорога, контакты.');
      var c1 = document.createElement('div'); c1.className = 'admin-card'; c1.innerHTML = '<h3>Шапка страницы</h3>';
      c1.appendChild(field({ path: 'palomnikam.eyebrow', label: 'Надзаголовок' }));
      c1.appendChild(field({ path: 'palomnikam.title', label: 'Заголовок (H1)' }));
      c1.appendChild(field({ path: 'palomnikam.lede', label: 'Вступление', type: 'textarea', rows: 3 }));
      c1.appendChild(imgField('Главное фото', 'palomnikam.heroImg'));
      c1.appendChild(field({ path: 'palomnikam.heroMetaLeft', label: 'Подпись слева (место)' }));
      c1.appendChild(field({ path: 'palomnikam.heroMetaRight', label: 'Подпись справа (часы)' }));
      c1.appendChild(field({ path: 'palomnikam.rulesHeading', label: 'Заголовок правил' }));
      el.appendChild(c1);

      var c2 = document.createElement('div'); c2.className = 'admin-card'; c2.innerHTML = '<h3>Личный прием у лам</h3>';
      c2.appendChild(field({ path: 'palomnikam.reception.title', label: 'Заголовок' }));
      c2.appendChild(field({ path: 'palomnikam.reception.desc', label: 'Описание', type: 'textarea', rows: 2 }));
      c2.appendChild(field({ path: 'palomnikam.reception.queue', label: 'Очередь' }));
      c2.appendChild(field({ path: 'palomnikam.reception.hours', label: 'Часы приема' }));
      el.appendChild(c2);

      // Приемы — вложенный список
      el.appendChild(buildSubList('palomnikam.reception.items', 'Виды приема', [
        { key: 'icon', label: 'Иконка' },
        { key: 'title', label: 'Название' },
        { key: 'text', label: 'Описание', type: 'textarea', rows: 3 }
      ], function () { return { icon: 'spa', title: '', text: '' }; }));

      var c3 = document.createElement('div'); c3.className = 'admin-card'; c3.innerHTML = '<h3>Как добраться</h3>';
      c3.appendChild(field({ path: 'palomnikam.route.heading', label: 'Заголовок' }));
      c3.appendChild(field({ path: 'palomnikam.route.address', label: 'Адрес', type: 'textarea', rows: 2 }));
      c3.appendChild(field({ path: 'palomnikam.route.text', label: 'Описание пути', type: 'textarea', rows: 4 }));
      c3.appendChild(field({ path: 'palomnikam.route.gps', label: 'GPS координаты' }));
      c3.appendChild(imgField('Фото дороги', 'palomnikam.route.img'));
      c3.appendChild(field({ path: 'palomnikam.route.imgBadge', label: 'Метка на фото' }));
      c3.appendChild(field({ path: 'palomnikam.route.hoursLeft', label: 'Часы: подпись' }));
      c3.appendChild(field({ path: 'palomnikam.route.hoursRight', label: 'Часы: значение' }));
      el.appendChild(c3);

      var c4 = document.createElement('div'); c4.className = 'admin-card'; c4.innerHTML = '<h3>Контакты и благотворительность</h3>';
      c4.appendChild(field({ path: 'palomnikam.contact.title', label: 'Заголовок контактов' }));
      c4.appendChild(field({ path: 'palomnikam.contact.text', label: 'Текст контактов', type: 'textarea', rows: 3 }));
      c4.appendChild(field({ path: 'palomnikam.contact.button', label: 'Кнопка' }));
      c4.appendChild(field({ path: 'palomnikam.charity.title', label: 'Заголовок благотворительности' }));
      el.appendChild(c4);

      el.appendChild(buildSubList('palomnikam.charity.paragraphs', 'Абзацы благотворительности', [
        { key: 'p', label: 'Абзац (можно <strong>, ссылка class=link)', type: 'textarea', rows: 3 }
      ], function () { return ''; }, 'p'));
    };

    views['palomnikam-rules'] = function (el) {
      el.appendChild(listView({
        title: 'Паломникам: правила',
        desc: 'Карточки буддийского этикета.',
        path: 'palomnikam.rules', view: 'palomnikam-rules',
        itemLabel: function (r) { return r.title || 'Без названия'; },
        fields: [
          { key: 'icon', label: 'Иконка (rotate_right/checkroom/spa/no_photography/…)' },
          { key: 'title', label: 'Заголовок' },
          { key: 'text', label: 'Текст (можно <strong>…</strong>)', type: 'textarea', rows: 4 }
        ],
        blank: function () { return { icon: 'spa', title: 'Новое правило', text: '' }; }
      }));
    };

    views.media = function (el) {
      section(el, 'Медиатека', 'Все фотографии сайта. Загружайте новые и копируйте путь для вставки в записи.');
      var up = document.createElement('label');
      up.className = 'btn btn-primary';
      up.style.marginBottom = '16px';
      up.innerHTML = 'Загрузить фото в медиатеку';
      var file = document.createElement('input');
      file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
      up.appendChild(file);
      file.addEventListener('change', function () {
        if (!file.files[0]) return;
        uploadImage(file.files[0]).then(function (p) {
          toast('Загружено: ' + p);
          buildView('media'); navTo('media', true);
        }).catch(function (err) { toast('Ошибка: ' + err.message, true); });
      });
      el.appendChild(up);

      var grid = document.createElement('div');
      grid.className = 'admin-loading';
      grid.textContent = 'Загружаю…';
      el.appendChild(grid);
      listImages().then(function (files) {
        grid.className = 'media-grid';
        grid.innerHTML = '';
        if (!files.length) { grid.className = 'admin-loading'; grid.textContent = 'Пока нет изображений.'; return; }
        files.forEach(function (f) {
          var cell = document.createElement('div');
          cell.className = 'media-cell';
          var p = CONFIG.imgDir + '/' + f.name;
          cell.innerHTML = '<img src="' + f.download_url + '" alt="" loading="lazy">' +
            '<span class="media-meta"><span class="media-name">' + f.name + '</span>' +
            '<span class="media-size">' + Math.round(f.size / 1024) + ' КБ</span>' +
            '<button class="media-copy" type="button">Копировать путь</button></span>';
          $('.media-copy', cell).addEventListener('click', function () {
            navigator.clipboard && navigator.clipboard.writeText(p);
            toast('Скопировано: ' + p);
          });
          grid.appendChild(cell);
        });
      }).catch(function (err) {
        grid.className = 'admin-loading';
        grid.textContent = 'Не удалось загрузить медиатеку: ' + err.message;
      });
    };
  }

  // Вложенный список внутри раздела (эры, категории, абзацы)
  // itemKey: если задан — элементы являются простыми строками (например, абзацы)
  function buildSubList(path, title, fields, blank, itemKey) {
    var wrapEl = document.createElement('div');
    wrapEl.className = 'admin-card';

    function render() {
      wrapEl.innerHTML = '<h3>' + title + '</h3>';
      var list = getModel(path) || [];
      list.forEach(function (item, i) {
        fields.forEach(function (f) {
          var realPath = itemKey ? (path + '.' + i) : (path + '.' + i + '.' + f.key);
          var label = itemKey ? f.label : f.label;
          if (f.type === 'img') wrapEl.appendChild(imgField(label, realPath));
          else wrapEl.appendChild(field({ path: realPath, label: label, type: f.type, rows: f.rows }));
        });
        var del = document.createElement('button');
        del.className = 'btn btn-danger';
        del.type = 'button';
        del.textContent = 'Удалить ' + (i + 1);
        del.style.marginTop = '8px';
        del.style.marginBottom = '16px';
        del.addEventListener('click', function () {
          if (!confirm('Удалить элемент ' + (i + 1) + '?')) return;
          getModel(path).splice(i, 1);
          store.save();
          render();
        });
        wrapEl.appendChild(del);
        var sep = document.createElement('hr');
        sep.style.border = 'none';
        sep.style.borderTop = '1px solid var(--linen)';
        sep.style.margin = '0 0 16px';
        wrapEl.appendChild(sep);
      });
      var add = document.createElement('button');
      add.className = 'btn btn-secondary';
      add.type = 'button';
      add.textContent = '+ Добавить';
      add.addEventListener('click', function () {
        var arr = getModel(path);
        if (!arr) { arr = []; setModel(path, arr); }
        arr.push(blank());
        store.save();
        render();
      });
      wrapEl.appendChild(add);
    }
    render();
    return wrapEl;
  }

  // ---------------- Навигация ----------------
  function buildView(name) {
    var el = $('#admin-main');
    el.innerHTML = '';
    if (views[name]) views[name](el);
  }
  function navTo(name, skipBuild) {
    currentView = name;
    $$('.admin-nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === name);
    });
    if (!skipBuild) buildView(name);
    else buildView(name);
  }

  $$('.admin-nav-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { navTo(btn.dataset.view); });
  });

  // ---------------- Публикация ----------------
  $('#save-all-btn').addEventListener('click', function () {
    if (!confirm('Опубликовать изменения на сайте? Будет обновлён data.json в репозитории ' + CONFIG.repo + '.')) return;
    ensureToken().then(function () {
      var json = JSON.stringify(store.data, null, 2);
      var btn = $('#save-all-btn');
      btn.disabled = true;
      btn.textContent = 'Публикую…';
      return gh.put('data.json', json, 'admin: обновление контента сайта').then(function (r) {
        if (!r.ok) throw new Error('GitHub ' + r.status + ' — проверьте токен и права');
        return r.json();
      }).then(function () {
        toast('Опубликовано! Обновление появится на сайте через 1–2 минуты.');
      }).catch(function (err) {
        toast('Ошибка публикации: ' + err.message, true);
      }).then(function () {
        btn.disabled = false;
        btn.innerHTML = '<svg class="ic ic-md" aria-hidden="true"><use href="assets/icons/sprite.svg#i-send"/></svg> Опубликовать изменения';
      });
    }).catch(function (err) {
      toast(err.message || 'Нужен токен GitHub для публикации', true);
    });
  });

  // ---------------- Экспорт / импорт ----------------
  $('#export-btn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#import-file').addEventListener('change', function () {
    var f = $('#import-file').files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        store.data = JSON.parse(fr.result);
        store.save();
        buildView(currentView);
        toast('data.json загружен в панель. Не забудьте «Опубликовать».');
      } catch (e) {
        toast('Файл не является корректным JSON', true);
      }
    };
    fr.readAsText(f);
    $('#import-file').value = '';
  });

  // ---------------- Старт ----------------
  if (sessionStorage.getItem('huree-admin-auth') === '1') {
    openPanel();
  }
})();
