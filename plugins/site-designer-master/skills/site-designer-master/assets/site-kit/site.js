// The only script every site gets: the mobile menu and the sent-form message. Pages work without it.
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    var set = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      document.documentElement.classList.toggle('nav-open', open);
    };
    toggle.addEventListener('click', function () { set(toggle.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { set(false); toggle.focus(); }
    });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
  }
  // After a form post the server sends the visitor back with ?sent=<form name>: show that form's success block.
  var sent = new URLSearchParams(location.search).get('sent');
  if (sent) {
    var form = document.querySelector('form[action$="/forms/' + sent + '"]');
    var done = form && form.parentNode.querySelector('[data-sent]');
    if (form && done) { form.hidden = true; done.hidden = false; done.focus(); }
  }
})();
