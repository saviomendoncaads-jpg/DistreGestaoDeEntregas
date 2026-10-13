(function () {
  'use strict';
  var menuButton = document.querySelector('.dh-menu-button');
  var menu = document.getElementById('mobileNav');
  if (menuButton && menu) {
    menuButton.addEventListener('click', function () {
      var opened = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!opened));
      menuButton.setAttribute('aria-label', opened ? 'Abrir menu' : 'Fechar menu');
      menu.hidden = opened;
    });
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) { menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Abrir menu'); }
    });
  }
  var panelUrl = new URLSearchParams(location.search).get('panel') || '/app';
  document.querySelectorAll('[data-panel-link]').forEach(function (link) { link.href = panelUrl; });
  var demo = document.getElementById('video-demonstracao');
  var video = document.getElementById('demoVideo');
  var demoOpener;
  if (demo && video) {
    document.querySelectorAll('[data-demo-video]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        demoOpener = link;
        if (!video.getAttribute('src')) { video.src = video.dataset.src; video.load(); }
        if (!demo.open) { demo.showModal(); }
        video.play().catch(function () { /* Os controles permanecem disponíveis. */ });
      });
    });
    demo.querySelector('[data-demo-close]').addEventListener('click', function () { demo.close(); });
    demo.addEventListener('close', function () {
      video.pause();
      if (demoOpener && demoOpener.getClientRects().length) { demoOpener.focus(); }
      else if (menuButton && menuButton.getClientRects().length) { menuButton.focus(); }
    });
    demo.addEventListener('click', function (event) {
      var bounds = demo.getBoundingClientRect();
      if (event.target === demo && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) { demo.close(); }
    });
  }
})();
