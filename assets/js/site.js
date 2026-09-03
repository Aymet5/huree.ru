// Устуу-Хурээ — huree.ru: интерактив (табы, фильтры, формы, анимации)
(function () {
  'use strict';

  // Переинициализируемая привязка интерактива (вызывается и после рендера из data.json)
  window.hureeBindInteractive = function () {

    // ---------- Табы периода молебнов ----------
    document.querySelectorAll('.tabs').forEach(function (tabs) {
      if (tabs.dataset.bound) return;
      tabs.dataset.bound = '1';
      tabs.addEventListener('click', function (e) {
        var btn = e.target.closest('.tab');
        if (!btn) return;
        tabs.querySelectorAll('.tab').forEach(function (t) {
          t.classList.remove('tab-active');
          t.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('tab-active');
        btn.setAttribute('aria-selected', 'true');
      });
    });

    // ---------- Фильтры новостей ----------
    document.querySelectorAll('.chip[data-filter]').forEach(function (chip) {
      if (chip.dataset.bound) return;
      chip.dataset.bound = '1';
      chip.addEventListener('click', function () {
        // снимаем выделение со всех чипов-фильтров
        document.querySelectorAll('.chip[data-filter]').forEach(function (c) { c.classList.remove('chip-active'); });
        chip.classList.add('chip-active');
        var f = chip.getAttribute('data-filter');
        // элементы с категориями пересчитываем каждый раз (DOM мог быть отрендерен заново)
        document.querySelectorAll('[data-cat]').forEach(function (item) {
          item.style.display = (f === 'all' || item.getAttribute('data-cat') === f) ? '' : 'none';
        });
      });
    });
  };

  window.hureeBindInteractive();

  // ---------- Форма записки ----------
  var prayerForm = document.getElementById('prayer-form');
  if (prayerForm) {
    prayerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!prayerForm.checkValidity()) { prayerForm.reportValidity(); return; }
      var success = document.getElementById('prayer-success');
      if (success) {
        prayerForm.hidden = true;
        success.hidden = false;
        success.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // ---------- Форма подписки ----------
  var subForm = document.getElementById('subscribe-form');
  if (subForm) {
    subForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!subForm.checkValidity()) { subForm.reportValidity(); return; }
      var success = document.getElementById('subscribe-success');
      if (success) {
        subForm.hidden = true;
        success.hidden = false;
        success.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // ---------- Плавное появление секций ----------
  if ('IntersectionObserver' in window &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -40px 0px' });
    function observeAll() {
      document.querySelectorAll('.page > section:not(.reveal)').forEach(function (s) {
        s.classList.add('reveal');
        io.observe(s);
      });
    }
    observeAll();
    // дочерние секции, добавленные рендером, тоже наблюдаем
    setTimeout(observeAll, 400);
  }
})();
