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
  var scheduleUrl = 'mailto:savio.mendonca@gmail.com?subject=' + encodeURIComponent('Quero agendar uma demonstração do DISTRE') + '&body=' + encodeURIComponent('Olá, gostaria de agendar uma demonstração do DISTRE.\n\nNome:\nEmpresa:\nTelefone:\nMelhor dia e horário:\n\nObrigado!');
  document.querySelectorAll('[data-schedule]').forEach(function (link) { link.href = scheduleUrl; });
})();
