/* Korval — интерактив: плавный скролл, меню, форма «Umów demo», появление блоков */
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------------------------
     Плавный скролл к якорям (своя анимация, одинаковая во всех браузерах)
     --------------------------------------------------------------------- */
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let scrollRaf = null;

  function scrollToY(targetY) {
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    const endY = Math.max(0, Math.min(targetY, maxY));
    const startY = window.scrollY;
    const distance = endY - startY;
    cancelAnimationFrame(scrollRaf);

    if (reduceMotion.matches || Math.abs(distance) < 2) {
      window.scrollTo(0, endY);
      return Promise.resolve();
    }

    // длительность зависит от расстояния: короткий прыжок быстрый, длинный — плавный
    const duration = Math.min(1400, Math.max(550, Math.abs(distance) * 0.35));

    return new Promise((resolve) => {
      let start = null;
      const step = (now) => {
        if (start === null) start = now;
        const progress = Math.min(1, (now - start) / duration);
        window.scrollTo(0, startY + distance * easeInOutCubic(progress));
        if (progress < 1) scrollRaf = requestAnimationFrame(step);
        else resolve();
      };
      scrollRaf = requestAnimationFrame(step);
    });
  }

  // пользователь крутит колесо или касается экрана — отдаём ему управление
  ['wheel', 'touchstart'].forEach((type) =>
    window.addEventListener(type, () => cancelAnimationFrame(scrollRaf), { passive: true })
  );

  function goTo(hash, pushHistory = true) {
    const isTop = hash === '#top';
    const target = isTop ? null : document.querySelector(hash);
    if (!isTop && !target) return;

    const y = isTop ? 0 : target.getBoundingClientRect().top + window.scrollY;
    scrollToY(y).then(() => {
      if (target) {
        // для клавиатуры и скринридеров переносим фокус в раздел
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    });
    if (pushHistory && location.hash !== hash) history.pushState(null, '', hash);
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || link.hasAttribute('data-demo')) return;

    const hash = link.getAttribute('href');
    if (hash === '#') { event.preventDefault(); return; } // заглушки (соцсети, документы)
    if (hash !== '#top' && !document.querySelector(hash)) return;

    event.preventDefault();
    if (menu.isOpen()) menu.close({ restoreFocus: false });
    goTo(hash);
  });

  window.addEventListener('popstate', () => goTo(location.hash || '#top', false));

  /* ---------------------------------------------------------------------
     Полноэкранное меню
     --------------------------------------------------------------------- */
  const menuEl = document.getElementById('menu');
  const menuOpenBtn = document.querySelector('[data-menu-open]');
  const menuCloseBtn = menuEl.querySelector('[data-menu-close]');
  let focusBeforeMenu = null;

  const menu = {
    isOpen: () => menuEl.classList.contains('is-open'),
    open() {
      focusBeforeMenu = document.activeElement;
      menuEl.classList.add('is-open');
      menuEl.removeAttribute('inert');
      menuOpenBtn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('no-scroll');
      setTimeout(() => menuCloseBtn.focus({ preventScroll: true }), 60);
    },
    close({ restoreFocus = true } = {}) {
      menuEl.classList.remove('is-open');
      menuEl.setAttribute('inert', '');
      menuOpenBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('no-scroll');
      if (restoreFocus && focusBeforeMenu) focusBeforeMenu.focus({ preventScroll: true });
    },
  };
  menuEl.setAttribute('inert', '');

  menuOpenBtn.addEventListener('click', () => menu.open());
  menuCloseBtn.addEventListener('click', () => menu.close());

  document.addEventListener('keydown', (event) => {
    if (!menu.isOpen()) return;
    if (event.key === 'Escape') { menu.close(); return; }
    if (event.key === 'Tab') {
      // удерживаем фокус внутри меню
      const focusables = menuEl.querySelectorAll('a[href], button:not([disabled])');
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  /* ---------------------------------------------------------------------
     Модальное окно «Umów demo»
     --------------------------------------------------------------------- */
  const dialog = document.getElementById('demo');
  const form = dialog.querySelector('form');
  const planSelect = form.elements.plan;
  const CLOSE_MS = 380;

  function openDemo(plan) {
    if (menu.isOpen()) menu.close({ restoreFocus: false });
    dialog.classList.remove('is-sent');
    if (plan) planSelect.value = plan;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    // два кадра, чтобы браузер успел отрисовать начальное состояние перед анимацией
    requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('is-open')));
    document.body.classList.add('no-scroll');
  }

  function closeDemo() {
    dialog.classList.remove('is-open');
    document.body.classList.remove('no-scroll');
    const finish = () => {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    };
    if (reduceMotion.matches) finish();
    else setTimeout(finish, CLOSE_MS);
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-demo]');
    if (!trigger) return;
    event.preventDefault();
    openDemo(trigger.dataset.plan);
  });

  dialog.querySelectorAll('[data-demo-close]').forEach((btn) => btn.addEventListener('click', closeDemo));
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDemo(); }); // Esc
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDemo(); }); // клик по подложке

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateField(field) {
    const input = field.querySelector('input, select');
    const error = field.querySelector('.err');
    const value = input.value.trim();
    let message = '';
    if (input.required && !value) message = 'To pole jest wymagane';
    else if (input.type === 'email' && value && !EMAIL_RE.test(value)) message = 'Podaj poprawny adres e-mail';
    error.textContent = message;
    field.classList.toggle('has-error', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
  }

  form.querySelectorAll('[data-field]').forEach((field) => {
    const input = field.querySelector('input, select');
    input.addEventListener('blur', () => { if (input.value) validateField(field); });
    input.addEventListener('input', () => { if (field.classList.contains('has-error')) validateField(field); });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let firstInvalid = null;
    form.querySelectorAll('[data-field]').forEach((field) => {
      if (!validateField(field) && !firstInvalid) firstInvalid = field.querySelector('input, select');
    });
    if (firstInvalid) { firstInvalid.focus(); return; }

    const data = Object.fromEntries(new FormData(form));

    /* Здесь подключается реальная отправка, например Formspree:
       await fetch('https://formspree.io/f/ВАШ_ID', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
         body: JSON.stringify(data),
       });
    */
    void data;

    dialog.classList.add('is-sent');
    form.reset();
    dialog.querySelector('.modal-sent [data-demo-close]').focus();
  });

  /* ---------------------------------------------------------------------
     Появление блоков при скролле
     --------------------------------------------------------------------- */
  const revealItems = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealItems.forEach((el) => observer.observe(el));
  } else {
    revealItems.forEach((el) => el.classList.add('is-in'));
  }
})();
