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
  if (demo) {
    document.querySelectorAll('[data-demo-video]').forEach(function (link) {
      link.addEventListener('click', function () {
        demo.focus({ preventScroll: true });
      });
    });
  }
})();
