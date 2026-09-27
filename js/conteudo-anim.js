(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // 1. Efeito 3D Tilt interativo do mouse nos cards (igual à página de Creators)
  var tiltCards = document.querySelectorAll('.case-card, .checklist');
  tiltCards.forEach(function (card) {
    card.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch') return;
      var bounds = card.getBoundingClientRect();
      var pointerX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      var pointerY = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
      var distance = Math.min(1, Math.hypot(pointerX, pointerY) / Math.SQRT2);

      card.style.setProperty('--tilt-x', (pointerX * 4.5).toFixed(2) + 'deg');
      card.style.setProperty('--tilt-y', (-pointerY * 4.5).toFixed(2) + 'deg');
      card.style.setProperty('--card-depth', ((1 - distance) * 6).toFixed(1) + 'px');
    });

    card.addEventListener('pointerleave', function () {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
      card.style.setProperty('--card-depth', '0px');
    });
  });

  // 2. Animação de Scroll Reveal por IntersectionObserver (igual Creators)
  if (!('IntersectionObserver' in window)) return;

  var animElements = document.querySelectorAll('article.piece, .case-card, .checklist, .pull, .stat-inline');
  if (!animElements.length) return;

  document.documentElement.classList.add('scroll-reveal-ready');

  function revealElement(el) {
    if (el.classList.contains('is-visible')) return;
    el.classList.add('is-visible');
    observer.unobserve(el);
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          revealElement(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  function revealPassedElements() {
    animElements.forEach(function (el) {
      if (el.getBoundingClientRect().bottom < window.innerHeight) {
        revealElement(el);
      }
    });
  }

  window.addEventListener('scroll', revealPassedElements, { passive: true });

  animElements.forEach(function (el, index) {
    el.style.setProperty('--reveal-delay', (index % 3) * 90 + 'ms');
    observer.observe(el);
  });

  revealPassedElements();
})();
