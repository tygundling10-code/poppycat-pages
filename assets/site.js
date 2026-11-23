/* Paintings by Poppy — gallery, viewer and "how to buy" flow.
   All content comes from data/site.json and data/artworks.json (edit them in the Studio). */
(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ICON = {
    arrowL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    arrowR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    ig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r=".9" fill="currentColor" stroke="none"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>'
  };

  var site = {};
  var works = [];
  var view = [];
  var filter = 'all';
  var money;

  /* ---------------------------------------------------------------- data */
  function load() {
    var bust = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? Date.now() : Math.floor(Date.now() / 60000);
    var get = function (url) {
      return fetch(url + '?v=' + bust, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error(url + ' ' + r.status);
        return r.json();
      });
    };
    return Promise.all([get('data/site.json'), get('data/artworks.json')]).then(function (res) {
      site = res[0] || {};
      works = ((res[1] && res[1].artworks) || []).filter(function (a) { return a && a.id && a.images && a.images.length; });
    });
  }

  function handle() {
    return String(site.instagram || '').trim()
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  }
  function igUrl() { var h = handle(); return h ? 'https://www.instagram.com/' + encodeURIComponent(h) + '/' : 'https://www.instagram.com/'; }
  function igDm() { var h = handle(); return h ? 'https://ig.me/m/' + encodeURIComponent(h) : igUrl(); }
  function payEmail() { return String(site.etransferEmail || site.email || '').trim(); }
  function isPlaceholder() {
    return !handle() || handle() === 'yourhandle' || /example\.com$/i.test(site.email || '') || !site.email;
  }

  function price(n) {
    if (n === '' || n == null || isNaN(n)) return '';
    if (!money) {
      try {
        money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: site.currency || 'CAD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 2 });
      } catch (e) {
        money = { format: function (v) { return '$' + v; } };
      }
    }
    return money.format(Number(n));
  }

  function available(a) { return (a.options || []).filter(function (o) { return !o.sold && o.price !== '' && o.price != null; }); }
  function hasKind(a, k) { return (a.options || []).some(function (o) { return o.kind === k; }); }
  function originalFree(a) { return (a.options || []).some(function (o) { return o.kind === 'original' && !o.sold; }); }

  function priceLine(a) {
    var av = available(a);
    if (!(a.options || []).length) return '';
    if (!av.length) return 'Sold';
    var min = Math.min.apply(null, av.map(function (o) { return Number(o.price); }));
    return (av.length > 1 ? 'From ' : '') + price(min);
  }

  function kindLine(a) {
    var parts = [];
    var opts = a.options || [];
    if (hasKind(a, 'original')) parts.push(originalFree(a) ? 'Original available' : 'Original sold');
    var prints = opts.filter(function (o) { return o.kind === 'print'; });
    if (prints.length) {
      var free = prints.filter(function (o) { return !o.sold; }).length;
      parts.push(free ? (free === 1 ? 'Print available' : free + ' print sizes') : 'Prints sold out');
    }
    if (!parts.length && !opts.length) parts.push('Not for sale');
    return parts.join(' · ');
  }

  function richText(s) {
    return esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>');
  }
  function paragraphs(s) {
    return String(s || '').split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean)
      .map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }

  /* -------------------------------------------------------------- binding */
  function bind() {
    var name = site.name || 'Studio';
    var h = handle();
    $$('[data-bind="name"]').forEach(function (el) { el.textContent = name; });
    $$('[data-bind="handle"]').forEach(function (el) { el.textContent = h ? '@' + h : 'Instagram'; });
    $$('[data-bind="payEmail"]').forEach(function (el) { el.textContent = payEmail() || 'Ask me for the address'; });
    $$('[data-ig]').forEach(function (el) { el.href = igUrl(); });
    $$('[data-mail]').forEach(function (el) { el.href = mailto('Hello from your website', ''); });

    if (site.tagline) $('#tagline').innerHTML = richText(site.tagline);
    if (site.intro) $('#intro').textContent = site.intro;
    if (site.shippingNote) $('#shipNote').textContent = site.shippingNote;
    $('#eyebrow').textContent = site.location ? 'Original art & prints · ' + site.location : 'Original art & prints';

    var about = site.about || {};
    if (about.heading) $('#aboutHeading').textContent = about.heading;
    $('#aboutText').innerHTML = paragraphs(about.text);
    if (about.photo) {
      var ph = $('#aboutPhoto');
      ph.innerHTML = '<img src="' + esc(about.photo) + '" alt="' + esc('The artist behind ' + name) + '" loading="lazy">';
      ph.hidden = false;
      $('#about').classList.add('has-photo');
    }

    var cur = site.currency || 'CAD';
    $('#workNote').textContent = 'Prices are in ' + (cur === 'CAD' ? 'Canadian dollars' : cur) + '. Colours can look a little different from screen to screen.';

    $('#footWord').style.setProperty('--chars', Math.max(4, name.length));
    $('#instaHandle').style.setProperty('--chars', Math.max(6, (h ? h.length + 1 : 9)));
    $('#year').textContent = new Date().getFullYear();
    document.title = name + ' — original art & prints';

    var notes = [];
    if (works.some(function (a) { return a.sample; })) notes.push('sample artwork');
    if (isPlaceholder()) notes.push('placeholder contact details');
    var notice = $('#notice');
    if (notes.length) {
      notice.innerHTML = 'Preview: this page is showing ' + notes.join(' and ') + '. Swap in your own from the <a href="admin/">Studio</a>.';
      notice.hidden = false;
    }

    $$('[data-copy-email]').forEach(function (btn) {
      if (!payEmail()) { btn.disabled = true; btn.querySelector('em').hidden = true; return; }
      btn.addEventListener('click', function () { copy(payEmail(), 'Email address copied'); });
    });

    ticker();
  }

  function ticker() {
    var items = (site.ticker && site.ticker.length ? site.ticker : ['Original art', 'Art prints', 'Made by hand']).filter(Boolean);
    var run = [];
    while (run.length < 12) run = run.concat(items);
    var html = '<div class="ticker-run">' + run.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>';
    $('#ticker').innerHTML = html + html;
  }

  function mailto(subject, body) {
    var to = String(site.email || '').trim();
    return 'mailto:' + encodeURIComponent(to).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(subject) + (body ? '&body=' + encodeURIComponent(body) : '');
  }

  /* ----------------------------------------------------------------- hero */
  function hero() {
    var wall = $('#wall');
    var picks = works.filter(function (a) { return a.featured; });
    works.forEach(function (a) { if (picks.length < 3 && picks.indexOf(a) < 0) picks.push(a); });
    picks = picks.slice(0, 3);
    if (!picks.length) { $('.hero').classList.add('no-art'); wall.hidden = true; return; }
    wall.dataset.count = picks.length;
    wall.innerHTML = '<span class="wall-sun" aria-hidden="true"></span>' + picks.map(function (a, i) {
      var img = a.images[0];
      return '<a class="frame f' + (i + 1) + '" href="#art/' + encodeURIComponent(a.id) + '">' +
        '<span class="frame-in"><img src="' + esc(img.thumb || img.src) + '" alt="' + esc(a.title) + '" width="' + (img.w || 1000) + '" height="' + (img.h || 1250) + '" fetchpriority="' + (i ? 'auto' : 'high') + '"></span></a>';
    }).join('');

    if (reduceMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var raf = 0;
    $('.hero').addEventListener('pointermove', function (e) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var r = wall.getBoundingClientRect();
        var x = ((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * 2;
        var y = ((e.clientY - (r.top + r.height / 2)) / window.innerHeight) * 2;
        wall.style.setProperty('--px', Math.max(-1, Math.min(1, x)).toFixed(3));
        wall.style.setProperty('--py', Math.max(-1, Math.min(1, y)).toFixed(3));
      });
    });
    $('.hero').addEventListener('pointerleave', function () {
      wall.style.setProperty('--px', 0);
      wall.style.setProperty('--py', 0);
    });
  }

  /* -------------------------------------------------------------- gallery */
  var FILTERS = [
    { id: 'all', label: 'All', test: function () { return true; } },
    { id: 'available', label: 'Available', test: function (a) { return available(a).length > 0; } },
    { id: 'original', label: 'Originals', test: function (a) { return hasKind(a, 'original'); } },
    { id: 'print', label: 'Prints', test: function (a) { return hasKind(a, 'print'); } }
  ];

  function filters() {
    var box = $('#filters');
    var shown = FILTERS.map(function (f) { return { f: f, n: works.filter(f.test).length }; })
      .filter(function (x) { return x.f.id === 'all' || (x.n > 0 && x.n < works.length); });
    if (works.length < 4 || shown.length < 2) return;
    box.innerHTML = shown.map(function (x) {
      return '<button class="chip" type="button" data-filter="' + x.f.id + '" aria-pressed="' + (x.f.id === filter) + '">' + esc(x.f.label) + '<span>' + x.n + '</span></button>';
    }).join('');
    box.hidden = false;
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-filter]');
      if (!b || b.dataset.filter === filter) return;
      filter = b.dataset.filter;
      $$('.chip', box).forEach(function (c) { c.setAttribute('aria-pressed', c === b); });
      gallery(true);
    });
  }

  function columnCount() {
    var w = $('#gallery').clientWidth || window.innerWidth;
    return w < 600 ? 2 : w < 1500 ? 3 : 4;
  }

  function card(a) {
    var img = a.images[0];
    var w = img.w || 1000, h = img.h || 1250;
    var av = available(a);
    var tag = !av.length && (a.options || []).length ? 'Sold' : originalFree(a) ? 'Original' : '';
    var el = document.createElement('article');
    el.className = 'card' + (!av.length && (a.options || []).length ? ' is-sold' : '');
    el.innerHTML =
      '<div class="card-media" style="aspect-ratio:' + w + '/' + h + ';background-color:' + esc(a.color || '') + '">' +
        '<img src="' + esc(img.thumb || img.src) + '" alt="' + esc(a.title + (a.medium ? ', ' + a.medium : '')) + '" width="' + w + '" height="' + h + '" loading="lazy" decoding="async">' +
        (tag ? '<span class="tag">' + tag + '</span>' : '') +
        '<span class="peek" aria-hidden="true">' + ICON.eye + 'View</span>' +
      '</div>' +
      '<div class="card-cap"><h3><a href="#art/' + encodeURIComponent(a.id) + '">' + esc(a.title) + '</a></h3>' +
        '<span class="card-price">' + esc(priceLine(a)) + '</span></div>' +
      '<p class="card-kind">' + esc(kindLine(a)) + '</p>';
    var im = $('img', el);
    var done = function () { im.classList.add('is-loaded'); };
    if (im.complete && im.naturalWidth) done(); else { im.addEventListener('load', done); im.addEventListener('error', done); }
    el._ratio = h / w;
    return el;
  }

  var cols = 0;
  var cards = [];
  function gallery(rebuild) {
    var box = $('#gallery');
    var f = FILTERS.filter(function (x) { return x.id === filter; })[0] || FILTERS[0];
    if (rebuild || !cards.length) {
      view = works.filter(f.test);
      cards = view.map(card);
    }
    $('#workCount').textContent = view.length ? String(view.length).padStart(2, '0') : '';
    if (!view.length) {
      box.classList.add('is-empty');
      box.innerHTML = '<p class="empty">' + (works.length ? 'Nothing here right now. Try another filter.' : 'New work is on its way. Follow along on Instagram to see it first.') + '</p>';
      return;
    }
    box.classList.remove('is-empty');
    cols = columnCount();
    var columns = [], heights = [];
    for (var i = 0; i < cols; i++) {
      var c = document.createElement('div');
      c.className = 'masonry-col';
      columns.push(c);
      heights.push(0);
    }
    cards.forEach(function (el) {
      var k = heights.indexOf(Math.min.apply(null, heights));
      el.style.setProperty('--d', (k * 90) + 'ms');
      columns[k].appendChild(el);
      heights[k] += el._ratio + 0.22;
    });
    box.innerHTML = '';
    columns.forEach(function (c) { box.appendChild(c); });
    cards.forEach(function (el) { reveal(el); });
  }

  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 }) : null;
  function reveal(el) { if (io && !el.classList.contains('in')) io.observe(el); else el.classList.add('in'); }

  /* ------------------------------------------------------------ instagram */
  function instaTiles() {
    var box = $('#instaTiles');
    var picks = works.slice(0, 6);
    if (picks.length < 3) { box.hidden = true; return; }
    var rot = [-4, 3, -2, 4, -3, 2];
    box.innerHTML = picks.map(function (a, i) {
      var img = a.images[0];
      var href = a.instagram || igUrl();
      return '<a class="tile" href="' + esc(href) + '" target="_blank" rel="noopener" style="--r:' + rot[i] + 'deg" aria-label="' + esc(a.title + ' on Instagram') + '">' +
        '<img src="' + esc(img.thumb || img.src) + '" alt="" loading="lazy" decoding="async">' + ICON.ig + '</a>';
    }).join('');
  }

  /* --------------------------------------------------------------- viewer */
  var dlg = $('#viewer');
  var current = null;
  var imgIndex = 0;
  var openedHere = false;
  var lastFocus = null;

  function find(id) { return works.filter(function (a) { return a.id === id; })[0]; }
  function list() { return current && view.indexOf(current) >= 0 ? view : works; }

  function openArt(a) {
    if (!a) return;
    current = a;
    imgIndex = 0;
    renderViewer();
    if (!dlg.open) {
      lastFocus = document.activeElement;
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      requestAnimationFrame(function () { dlg.classList.add('is-open'); });
    }
    $('.panel', dlg).scrollTop = 0;
    dlg.scrollTop = 0;
    document.title = a.title + ' — ' + (site.name || 'Studio');
  }

  function closeViewer(fromHistory) {
    if (!dlg.open) return;
    dlg.classList.remove('is-open');
    setTimeout(function () {
      if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
      dlg.innerHTML = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }, reduceMotion ? 0 : 320);
    current = null;
    document.title = (site.name || 'Studio') + ' — original art & prints';
    if (!fromHistory) {
      if (openedHere) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
    }
    openedHere = false;
  }

  function step(dir) {
    var l = list();
    if (l.length < 2) return;
    var i = (l.indexOf(current) + dir + l.length) % l.length;
    var next = l[i];
    history.replaceState(null, '', '#art/' + encodeURIComponent(next.id));
    openArt(next);
  }

  function messageText(a, opt) {
    return 'Hi! I\'d love to buy "' + a.title + '"' + (opt ? ' (' + opt.label + ', ' + price(opt.price) + ')' : '') +
      '. Is it still available?';
  }

  function renderViewer() {
    var a = current;
    var l = list();
    var pos = l.indexOf(a) + 1;
    var img = a.images[imgIndex] || a.images[0];
    var opts = a.options || [];
    var av = available(a);
    var multi = a.images.length > 1;

    var facts = [['Medium', a.medium], ['Size', a.size], ['Year', a.year]].filter(function (f) { return f[1]; });

    var optionsHtml = '';
    if (opts.length) {
      optionsHtml = '<fieldset class="opts"><legend>' + (opts.length > 1 ? 'Choose an option' : 'Available as') + '</legend>' +
        opts.map(function (o, i) {
          var sold = o.sold;
          return '<label class="opt' + (sold ? ' is-sold' : '') + '">' +
            '<input type="radio" name="opt" value="' + i + '"' + (sold ? ' disabled' : '') + (o === av[0] ? ' checked' : '') + '>' +
            '<span class="opt-dot" aria-hidden="true"></span>' +
            '<span class="opt-name">' + esc(o.label || (o.kind === 'original' ? 'Original' : 'Print')) + '</span>' +
            '<span class="opt-price">' + (sold ? 'Sold' : esc(price(o.price))) + '</span></label>';
        }).join('') + '</fieldset><div class="request" id="request" aria-live="polite"></div>';
    } else {
      optionsHtml = '<p class="nfs">This piece isn\'t for sale, but I\'m always happy to talk about commissions or something similar.</p>';
    }

    var share = navigator.share ? 'Share' : 'Copy link';
    dlg.innerHTML =
      '<div class="viewer-grid">' +
        '<div class="stage' + (multi ? ' has-thumbs' : '') + '" style="--tone:' + esc(a.color || '#3a332b') + '">' +
          '<span class="v-count">' + String(pos).padStart(2, '0') + ' / ' + String(l.length).padStart(2, '0') + '</span>' +
          '<div class="stage-img"><img src="' + esc(img.src) + '" alt="' + esc(a.title) + '"></div>' +
          (l.length > 1 ? '<button class="v-nav v-prev" type="button" aria-label="Previous piece">' + ICON.arrowL + '</button>' +
            '<button class="v-nav v-next" type="button" aria-label="Next piece">' + ICON.arrowR + '</button>' : '') +
          (multi ? '<div class="thumbs">' + a.images.map(function (im, i) {
            return '<button class="thumb" type="button" data-img="' + i + '" aria-label="Photo ' + (i + 1) + '"' + (i === imgIndex ? ' aria-current="true"' : '') + '><img src="' + esc(im.thumb || im.src) + '" alt=""></button>';
          }).join('') + '</div>' : '') +
        '</div>' +
        '<div class="panel">' +
          '<p class="eyebrow">' + esc(a.sample ? 'Sample piece' : (a.year || 'Artwork')) + '</p>' +
          '<h2 class="v-title">' + esc(a.title) + '</h2>' +
          (a.sample ? '<p class="sample-note">This is placeholder art. Your own pieces will replace it.</p>' : '') +
          (facts.length ? '<dl class="facts">' + facts.map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join('') + '</dl>' : '') +
          '<div class="desc">' + paragraphs(a.description) + '</div>' +
          optionsHtml +
          '<div class="panel-foot">' +
            '<button type="button" data-share>' + ICON.share + share + '</button>' +
            (a.instagram ? '<a href="' + esc(a.instagram) + '" target="_blank" rel="noopener">' + ICON.ig + 'See it on Instagram</a>'
              : '<a href="' + esc(igUrl()) + '" target="_blank" rel="noopener">' + ICON.ig + 'More on Instagram</a>') +
          '</div>' +
        '</div>' +
        '<button class="v-close" type="button" aria-label="Close">' + ICON.close + '</button>' +
      '</div>';

    if (opts.length) renderRequest();

    var stageImg = $('.stage-img img', dlg);
    stageImg.addEventListener('click', function (e) {
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      var on = stageImg.classList.toggle('is-zoomed');
      if (on) zoomAt(e);
    });
    stageImg.addEventListener('mousemove', function (e) { if (stageImg.classList.contains('is-zoomed')) zoomAt(e); });
    function zoomAt(e) {
      var r = stageImg.getBoundingClientRect();
      var s = stageImg.classList.contains('is-zoomed') ? 2.4 : 1;
      var x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
      if (s > 1) { x = 50 + (x - 50) * 1; y = 50 + (y - 50) * 1; }
      stageImg.style.transformOrigin = Math.max(0, Math.min(100, x)) + '% ' + Math.max(0, Math.min(100, y)) + '%';
    }
  }

  function selectedOption() {
    var r = $('input[name="opt"]:checked', dlg);
    return r ? current.options[Number(r.value)] : null;
  }

  function renderRequest() {
    var box = $('#request', dlg);
    if (!box) return;
    var a = current;
    var o = selectedOption();
    if (!o) {
      box.className = 'request soldout';
      box.innerHTML = '<p>This one has found a home. If you love it, ask me about something similar or a commission.</p>' +
        '<div class="req-actions"><a class="btn sm" href="' + esc(mailto('About "' + a.title + '"', 'Hi! I saw "' + a.title + '" on your website. Do you have anything similar?')) + '">' + ICON.mail + 'Email me</a>' +
        '<a class="btn sm ghost" href="' + esc(igDm()) + '" target="_blank" rel="noopener">' + ICON.ig + 'Message on Instagram</a></div>';
      return;
    }
    var msg = messageText(a, o);
    var pay = payEmail();
    box.className = 'request';
    box.innerHTML = '<ol>' +
      '<li><h4>Send me a message</h4><p>Say which piece you\'d like and I\'ll set it aside for you.</p>' +
        '<blockquote>' + esc(msg) + '</blockquote>' +
        '<div class="req-actions">' +
          '<a class="btn sm" href="' + esc(mailto('I\'d like to buy "' + a.title + '"', msg)) + '">' + ICON.mail + 'Email</a>' +
          '<a class="btn sm ghost" href="' + esc(igDm()) + '" target="_blank" rel="noopener" data-dm>' + ICON.ig + 'Instagram</a>' +
          '<button class="btn sm ghost" type="button" data-copy-msg>Copy message</button>' +
        '</div></li>' +
      '<li><h4>Pay ' + esc(price(o.price)) + ' by e-Transfer</h4>' +
        (pay ? '<p>Once I confirm it\'s yours, send an Interac e-Transfer to:</p><button class="pay" type="button" data-copy-pay>' + esc(pay) + '<em>Copy</em></button>'
          : '<p>Once I confirm it\'s yours, I\'ll send you the e-Transfer details.</p>') +
      '</li>' +
      '<li><h4>Pickup or shipping</h4><p>' + esc(site.shippingNote || 'We\'ll sort out pickup or shipping once it\'s yours.') + '</p></li>' +
    '</ol>';
  }

  dlg.addEventListener('change', function (e) { if (e.target.name === 'opt') renderRequest(); });
  dlg.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('.v-close')) return closeViewer();
    if (t.closest('.v-prev')) return step(-1);
    if (t.closest('.v-next')) return step(1);
    var th = t.closest('[data-img]');
    if (th) {
      imgIndex = Number(th.dataset.img);
      var im = $('.stage-img img', dlg);
      var src = current.images[imgIndex].src;
      im.classList.add('is-swapping');
      setTimeout(function () { im.src = src; im.classList.remove('is-swapping', 'is-zoomed'); }, 180);
      $$('.thumb', dlg).forEach(function (b) { b.setAttribute('aria-current', b === th); });
      return;
    }
    if (t.closest('[data-copy-msg]')) return copy(messageText(current, selectedOption()), 'Message copied');
    if (t.closest('[data-dm]')) copyQuiet(messageText(current, selectedOption()), 'Message copied, paste it into the chat');
    if (t.closest('[data-copy-pay]')) return copy(payEmail(), 'Email address copied');
    if (t.closest('[data-share]')) {
      var url = location.href.split('#')[0] + '#art/' + encodeURIComponent(current.id);
      if (navigator.share) navigator.share({ title: current.title, url: url }).catch(function () {});
      else copy(url, 'Link copied');
      return;
    }
    if (t === dlg) closeViewer();
  });
  dlg.addEventListener('cancel', function (e) { e.preventDefault(); closeViewer(); });
  document.addEventListener('keydown', function (e) {
    if (!dlg.open || !current) return;
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  // swipe between pieces on touch screens
  (function () {
    var x0 = null, y0 = 0;
    dlg.addEventListener('touchstart', function (e) {
      if (!e.target.closest('.stage')) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    dlg.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    }, { passive: true });
  })();

  function route(e) {
    var m = location.hash.match(/^#art\/(.+)$/);
    if (m) {
      var a = find(decodeURIComponent(m[1]));
      if (a) {
        if (e && !dlg.open) openedHere = true;
        openArt(a);
        return;
      }
    }
    if (dlg.open) closeViewer(true);
  }

  /* ---------------------------------------------------------------- utils */
  var toastEl, toastTimer;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    // keep the toast above an open modal dialog
    var host = dlg.open ? dlg : document.body;
    if (toastEl.parentNode !== host) host.appendChild(toastEl);
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }
  function writeClip(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, fail) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      (dlg.open ? dlg : document.body).appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? ok() : fail(); } catch (err) { fail(err); }
      ta.remove();
    });
  }
  function copy(text, done) {
    writeClip(text).then(function () { toast(done || 'Copied'); }, function () { toast('Couldn\'t copy. Press and hold to copy instead.'); });
  }
  function copyQuiet(text, done) { writeClip(text).then(function () { toast(done); }, function () {}); }

  function header() {
    var h = $('#header');
    var onScroll = function () { h.classList.toggle('is-stuck', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ----------------------------------------------------------------- boot */
  header();
  $$('.reveal').forEach(reveal);
  load().then(function () {
    bind();
    hero();
    filters();
    gallery(true);
    instaTiles();
    document.documentElement.classList.add('ready');
    route();
    window.addEventListener('hashchange', route);
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { if (columnCount() !== cols) gallery(false); }, 150);
    });
  }).catch(function (err) {
    console.error(err);
    document.documentElement.classList.add('ready');
    $('#gallery').innerHTML = '<p class="empty">The artwork couldn\'t load just now. Please refresh the page.</p>';
  });
})();
