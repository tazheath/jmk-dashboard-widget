(function () {
  'use strict';

  var TABLE = 'Vehicles';
  var VIN_PREFILL = 'VIN';
  var CSS_FALLBACK = 'https://cdn.jsdelivr.net/gh/tazheath/jmk-dashboard-widget@main/dashboard.css';

  var SCAFFOLD =
    '<div class="jd-bar">' +
      '<label class="jd-search">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<input type="text" class="jd-search-input" placeholder="Search year, make, model, VIN\u2026" />' +
      '</label>' +
      '<select class="jd-loc" aria-label="Filter by location" style="display:none"></select>' +
      '<button type="button" class="jd-add" style="display:none">+ Add Vehicle</button>' +
      '<span class="jd-count"></span>' +
    '</div>' +
    '<div class="jd-list"><div class="jd-loading">Loading inventory\u2026</div></div>' +
    '<div class="jd-modal" aria-modal="true" role="dialog">' +
      '<div class="jd-modal__backdrop" data-close="1"></div>' +
      '<div class="jd-modal__dialog">' +
        '<div class="jd-modal__head">' +
          '<span class="jd-modal__title"></span>' +
          '<span class="jd-modal__head-right">' +
            '<a class="jd-modal__newtab" href="#" target="_blank" rel="noopener noreferrer">Open in new tab \u2197</a>' +
            '<button type="button" class="jd-modal__close" aria-label="Close" data-close="1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
          '</span>' +
        '</div>' +
        /* VIN auto-fill bar */
        '<div class="jd-vin" hidden>' +
          '<div class="jd-vin__row">' +
            '<input type="text" class="jd-vin__input" maxlength="17" placeholder="Enter VIN to auto fill" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="Vehicle Identification Number" />' +
            '<button type="button" class="jd-btn jd-vin__btn">Auto Fill</button>' +
          '</div>' +
          '<p class="jd-vin__status" role="status" aria-live="polite"></p>' +
        '</div>' +
        '<div class="jd-modal__body"><div class="jd-modal__loading">Form loading\u2026</div><iframe title="Form"></iframe></div>' +
      '</div>' +
    '</div>';

  var DOTS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

  /* VIN Decode */
  var VIN_DECODE = {
    API: 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/',
    RE: /^[A-HJ-NPR-Z0-9]{17}$/,
    FIELDS: {
      year: 'Year', make: 'Make', model: 'Model', vin: 'VIN',
      vehicleType: 'Vehicle Type', driveType: 'Drive Type', transmission: 'Transmission'
    },
    VEHICLE_TYPE: { car: 'Car', suv: 'SUV', truck: 'Truck', minivan: 'Minivan' },
    DRIVE_TYPE:   { fwd: 'FWD', rwd: 'RWD', awd: 'AWD', fourwd: '4X4', twowd: '4X2' },
    TRANSMISSION: { automatic: 'Automatic', manual: 'Manual' },
    MAKE_OVERRIDES: {
      'BMW': 'BMW', 'GMC': 'GMC', 'RAM': 'RAM', 'MINI': 'MINI',
      'BYD': 'BYD', 'MERCEDES-BENZ': 'Mercedes-Benz'
    }
  };

  /* Hold each dashboard hidden until dashboard.css loads, so the modal never flashes unstyled */
  var cssReady = false;
  var cssWaiters = [];
  function onCssReady(cb) { if (cssReady) cb(); else cssWaiters.push(cb); }
  function flushCss() {
    if (cssReady) return;
    cssReady = true;
    cssWaiters.splice(0).forEach(function (fn) { fn(); });
  }
  function ensureCss() {
    var link = document.querySelector('link[data-jmk-dash]');
    if (!link) {
      var href = CSS_FALLBACK;
      var s = document.querySelector('script[src*="dashboard.js"]');
      if (s && s.src) href = s.src.replace(/dashboard\.js(\?.*)?$/, 'dashboard.css');
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-jmk-dash', '');
      document.head.appendChild(link);
    }
    if (link.sheet) { flushCss(); return; }
    link.addEventListener('load', flushCss, { once: true });
    link.addEventListener('error', flushCss, { once: true });
    setTimeout(flushCss, 3000);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) { var n = parseInt(String(v == null ? '' : v).replace(/[^0-9.]/g, ''), 10); return isNaN(n) ? 0 : n; }
  function money(v) {
    var n = Number(String(v == null ? '' : v).replace(/[^0-9.]/g, ''));
    if (!n) return '';
    return '$' + n.toLocaleString('en-US');
  }
  function photoUrl(f) {
    var p = f && f.Photos && f.Photos[0];
    if (!p) return '';
    if (p.thumbnails && p.thumbnails.large && p.thumbnails.large.url) return p.thumbnails.large.url;
    return p.url || '';
  }
  function isSold(f) { return String((f && f.Status) || '').toLowerCase() === 'sold'; }
  function isArchived(f) { return String((f && f.Status) || '').toLowerCase() === 'archive'; }

  function toEmbed(url) {
    if (!url) return '';
    if (/airtable\.com\/embed\//i.test(url)) return url;
    return url.replace(/(airtable\.com)\/(shr[A-Za-z0-9]+)/i, '$1/embed/$2');
  }
  function withPrefill(url, vin) {
    if (!url) return '';
    if (!vin) return url;
    var sep = url.indexOf('?') > -1 ? '&' : '?';
    return url + sep + 'prefill_' + encodeURIComponent(VIN_PREFILL) + '=' + encodeURIComponent(vin);
  }

  function prefillAll(url, data) {
    if (!url) return '';
    var params = [];
    Object.keys(data).forEach(function (name) {
      var val = data[name];
      if (val === undefined || val === null || val === '') return;
      params.push('prefill_' + encodeURIComponent(name) + '=' + encodeURIComponent(val));
    });
    if (!params.length) return url;
    return url + (url.indexOf('?') > -1 ? '&' : '?') + params.join('&');
  }
  function titleCaseMake(m) {
    if (!m) return '';
    var key = m.toUpperCase();
    if (VIN_DECODE.MAKE_OVERRIDES[key]) return VIN_DECODE.MAKE_OVERRIDES[key];
    return m.toLowerCase().replace(/\b([a-z])/g, function (c) { return c.toUpperCase(); });
  }
  function mapVehicleType(bc) {
    if (!bc) return '';
    var s = bc.toLowerCase(), T = VIN_DECODE.VEHICLE_TYPE;
    if (s.indexOf('pickup') > -1 || s.indexOf('truck') > -1) return T.truck;
    if (s.indexOf('utility') > -1 || s.indexOf('suv') > -1 || s.indexOf('mpv') > -1) return T.suv;
    if (s.indexOf('minivan') > -1 || s.indexOf('van') > -1) return T.minivan;
    if (/sedan|saloon|coupe|hatch|liftback|notchback|convertible|cabriolet|wagon/.test(s)) return T.car;
    return '';
  }
  function mapDriveType(d) {
    if (!d) return '';
    var s = d.toLowerCase(), D = VIN_DECODE.DRIVE_TYPE;
    if (s.indexOf('all-wheel') > -1 || s.indexOf('awd') > -1) return D.awd;
    if (s.indexOf('4wd') > -1 || s.indexOf('4-wheel') > -1 || s.indexOf('4x4') > -1 || s.indexOf('four-wheel') > -1) return D.fourwd;
    if (s.indexOf('4x2') > -1 || s.indexOf('2wd') > -1) return D.twowd;
    if (s.indexOf('front') > -1 || s.indexOf('fwd') > -1) return D.fwd;
    if (s.indexOf('rear') > -1 || s.indexOf('rwd') > -1) return D.rwd;
    return '';
  }
  function mapTransmission(t) {
    if (!t) return '';
    var s = t.toLowerCase(), X = VIN_DECODE.TRANSMISSION;
    if (s.indexOf('manual') > -1 && s.indexOf('automated') === -1) return X.manual;
    if (s.indexOf('manual') > -1) return X.automatic;
    if (s.indexOf('auto') > -1 || s.indexOf('cvt') > -1 ||
        s.indexOf('continuously') > -1 || s.indexOf('dual-clutch') > -1) return X.automatic;
    return '';
  }

  function fetchAll(cfg) {
    var records = [];
    var base = 'https://api.airtable.com/v0/' + encodeURIComponent(cfg.baseId) + '/' + encodeURIComponent(TABLE);
    function page(offset) {
      var url = base + '?pageSize=100' + (offset ? ('&offset=' + encodeURIComponent(offset)) : '');
      return fetch(url, { headers: { Authorization: 'Bearer ' + cfg.token } })
        .then(function (res) {
          if (!res.ok) throw new Error('Airtable ' + res.status);
          return res.json();
        })
        .then(function (data) {
          records = records.concat(data.records || []);
          if (data.offset) return page(data.offset);
          return records;
        });
    }
    return page();
  }

  function rowHtml(rec, showMore) {
    var f = rec.fields || {};
    var vin = f.VIN || '';
    var title = [f.Year, f.Make, f.Model].filter(Boolean).join(' ') || '\u2014';
    var sold = isSold(f);
    var photo = photoUrl(f);
    var loc = f.Location || '';
    var locSlug = (loc.toLowerCase().match(/[a-z0-9]+/) || [''])[0];
    var sub = [money(f.Price), (num(f.Mileage) ? num(f.Mileage).toLocaleString() + ' mi' : ''), (vin ? 'VIN ' + vin : '')].filter(Boolean).join('  \u00B7  ');
    var search = (title + ' ' + vin).toLowerCase();

    var actions = '';
    if (!sold) actions += '<button type="button" class="jd-btn jd-btn--ghost" data-act="price" data-vin="' + esc(vin) + '">Edit Price</button>';
    actions += '<button type="button" class="jd-btn jd-btn--ghost" data-act="photos" data-vin="' + esc(vin) + '">Replace Photos</button>';
    actions += '<button type="button" class="jd-btn" data-act="sold" data-vin="' + esc(vin) + '">Mark Sold</button>';

    if (showMore) {
      actions +=
        '<div class="jd-more-wrap">' +
          '<button type="button" class="jd-btn jd-btn--ghost jd-btn--icon" data-more="1" aria-label="More actions" aria-haspopup="true" aria-expanded="false">' + DOTS_SVG + '</button>' +
          '<div class="jd-menu">' +
            '<button type="button" class="jd-btn jd-btn--danger" data-act="archive" data-vin="' + esc(vin) + '">Delete</button>' +
          '</div>' +
        '</div>';
    }

    return '<div class="jd-row" data-search="' + esc(search) + '" data-loc="' + esc(loc.toLowerCase()) + '">' +
        '<div class="jd-thumb">' + (photo ? '<img src="' + esc(photo) + '" alt="" loading="lazy">' : '') + '</div>' +
        '<div class="jd-info"><div class="jd-title">' + esc(title) + '</div>' +
          (sub ? '<div class="jd-sub">' + esc(sub) + '</div>' : '') + '</div>' +
                '<div class="jd-status">' +
          (loc ? '<span class="jd-pill jd-pill--loc' + (locSlug ? ' jd-pill--loc-' + locSlug : '') + '">' + esc(loc) + '</span>' : '') +
          '<span class="jd-pill ' + (sold ? 'is-sold' : 'is-avail') + '">' + (sold ? 'Sold' : 'Available') + '</span>' +
        '</div>' +
        '<div class="jd-actions">' + actions + '</div>' +
      '</div>';
  }

  function sortRecords(recs) {
    return recs.sort(function (a, b) {
      var yd = num(b.fields && b.fields.Year) - num(a.fields && a.fields.Year);
      if (yd) return yd;
      var sa = (a.fields && a.fields['Sort Date']) || '';
      var sb = (b.fields && b.fields['Sort Date']) || '';
      return String(sb).localeCompare(String(sa));
    });
  }

  function initDash(el) {
    el.style.visibility = 'hidden';
    el.innerHTML = SCAFFOLD;
    onCssReady(function () { el.style.visibility = ''; });

    var cfg = {
      baseId: (el.dataset.baseId || '').trim(),
      token:  (el.dataset.token  || '').trim(),
      location: (el.dataset.location || '').trim(),
      forms: {
        sold:    (el.dataset.formSold    || '').trim(),
        price:   (el.dataset.formPrice   || '').trim(),
        photos:  (el.dataset.formPhotos  || '').trim(),
        add:     (el.dataset.formAdd     || '').trim(),
        archive: (el.dataset.formArchive || '').trim()   
      }
    };

    var list    = el.querySelector('.jd-list');
    var count   = el.querySelector('.jd-count');
    var search  = el.querySelector('.jd-search-input');
    var locSel  = el.querySelector('.jd-loc');
    var addBtn  = el.querySelector('.jd-add');
    var modal   = el.querySelector('.jd-modal');
    var mTitle  = el.querySelector('.jd-modal__title');
    var mFrame  = el.querySelector('.jd-modal__body iframe');
    var mNewTab = el.querySelector('.jd-modal__newtab');
    var mLoad   = el.querySelector('.jd-modal__loading');
    var vinBar    = el.querySelector('.jd-vin');    
    var vinInput  = el.querySelector('.jd-vin__input');
    var vinBtn    = el.querySelector('.jd-vin__btn');  
    var vinStatus = el.querySelector('.jd-vin__status');
    var vinFilled = false;

    if (!cfg.baseId || !cfg.token) {
      list.innerHTML = '<div class="jd-empty">Dashboard not configured: set data-base-id and data-token on the .jmk-dash div.</div>';
      return;
    }

    function closeMenus() {
      el.querySelectorAll('.jd-more-wrap.is-open').forEach(function (w) {
        w.classList.remove('is-open');
        var b = w.querySelector('[data-more]');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
    }

    function openForm(rawUrl, vin, title, showVin) {
      if (!rawUrl) { alert('That form URL isn\u2019t set on the dashboard yet.'); return; }
      mTitle.textContent = title;
      vinBar.hidden = !showVin;
      if (showVin) { vinInput.value = ''; setVinStatus(''); vinFilled = false; }
      if (mLoad) mLoad.style.display = '';
      mFrame.src   = withPrefill(toEmbed(rawUrl), vin);
      mNewTab.href = withPrefill(rawUrl, vin);
      modal.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }
    function closeForm() {
      modal.classList.remove('is-open');
      mFrame.src = 'about:blank';
      document.body.style.overflow = '';
    }
    modal.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-close]')) closeForm();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (modal.classList.contains('is-open')) closeForm();
      closeMenus();
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('.jd-more-wrap')) closeMenus();
    });
    mFrame.addEventListener('load', function () { if (mLoad) mLoad.style.display = 'none'; });

    if (cfg.forms.add) {
      addBtn.style.display = '';
      addBtn.addEventListener('click', function () { openForm(cfg.forms.add, '', 'Add New Vehicle', true); });
    }

    function setVinStatus(msg, type) {
      vinStatus.textContent = msg || '';
      vinStatus.className = 'jd-vin__status' + (type ? ' is-' + type : '');
    }
    function loadAddForm(data) {
      var embedUrl = prefillAll(toEmbed(cfg.forms.add), data);
      mNewTab.href = prefillAll(cfg.forms.add, data);
      mFrame.src = 'about:blank';
      setTimeout(function () {
        if (mLoad) mLoad.style.display = '';
        mFrame.src = embedUrl;
      }, 50);
      vinFilled = true;
    }
    function doAutofill() {
      var F = VIN_DECODE.FIELDS;
      var vin = (vinInput.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      vinInput.value = vin;

      if (!VIN_DECODE.RE.test(vin)) {
        setVinStatus('That VIN doesn\u2019t look right. It should be 17 characters with no I, O, or Q.', 'error');
        return;
      }
      if (vinFilled && !window.confirm('This reloads the form with the new VIN and clears anything already entered, including photos. Continue?')) return;

      setVinStatus('Looking up VIN\u2026', 'loading');
      vinBtn.disabled = true;
      var controller = window.AbortController ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 12000) : null;

      fetch(VIN_DECODE.API + encodeURIComponent(vin) + '?format=json', controller ? { signal: controller.signal } : {})
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (json) {
          var res = (json && json.Results && json.Results[0]) || {};
          var data = {};
          data[F.vin] = vin;

          var year  = res.ModelYear || '';
          var make  = titleCaseMake(res.Make || '');
          var model = res.Model || '';
          if (year)  data[F.year]  = String(year);
          if (make)  data[F.make]  = make;
          if (model) data[F.model] = model;

          var vt = mapVehicleType(res.BodyClass || '');
          var dt = mapDriveType(res.DriveType || '');
          var tr = mapTransmission(res.TransmissionStyle || '');
          if (vt) data[F.vehicleType]  = vt;
          if (dt) data[F.driveType]    = dt;
          if (tr) data[F.transmission] = tr;

          loadAddForm(data);
          if (year && make && model) {
            setVinStatus('Filled ' + year + ' ' + make + ' ' + model + '. Review the form, add photos, then submit.', 'ok');
          } else {
            setVinStatus('Couldn\u2019t fully decode that VIN. The VIN is filled in, so enter the rest by hand.', 'warn');
          }
        })
        .catch(function (err) {
          var d = {};
          d[F.vin] = vin;
          loadAddForm(d);
          setVinStatus(
            ((err && err.name === 'AbortError') ? 'The lookup timed out.' : 'Couldn\u2019t reach the VIN lookup.') +
            ' The VIN is filled in, so enter the rest by hand or tap Auto Fill to retry.',
            'error'
          );
        })
        .then(function () {
          if (timer) clearTimeout(timer);
          vinBtn.disabled = false;
        });
    }
    vinBtn.addEventListener('click', doAutofill);
    vinInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doAutofill(); }
    });

    var ACTS = {
      sold:    { url: cfg.forms.sold,    title: 'Mark Vehicle Sold' },
      price:   { url: cfg.forms.price,   title: 'Update Vehicle Price' },
      photos:  { url: cfg.forms.photos,  title: 'Update Photos' },
      archive: { url: cfg.forms.archive, title: 'Delete Vehicle' }
    };
    list.addEventListener('click', function (e) {
      if (!e.target.closest) return;

      var moreBtn = e.target.closest('button[data-more]');
      if (moreBtn) {
        var wrap = moreBtn.parentNode;
        var willOpen = !wrap.classList.contains('is-open');
        closeMenus();
        if (willOpen) {
          wrap.classList.add('is-open');
          moreBtn.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var a = ACTS[btn.getAttribute('data-act')];
      if (!a) return;
      closeMenus();   /* NEW */
      openForm(a.url, btn.getAttribute('data-vin') || '', a.title);
    });

    function applyFilters() {
      var q = search.value.trim().toLowerCase();
      var loc = locSel ? locSel.value : '';
      var rows = list.querySelectorAll('.jd-row');
      var shown = 0;
      rows.forEach(function (r) {
        var matchQ = !q || r.getAttribute('data-search').indexOf(q) > -1;
        var matchL = !loc || r.getAttribute('data-loc') === loc;
        var hit = matchQ && matchL;
        r.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      count.textContent = shown + (shown === 1 ? ' vehicle' : ' vehicles');
    }
    search.addEventListener('input', applyFilters);
    if (locSel) locSel.addEventListener('change', applyFilters);

    fetchAll(cfg).then(function (recs) {
      recs = sortRecords(recs).filter(function (r) {
        var f = r.fields || {};
        return !isSold(f) && !isArchived(f);
      });

      if (cfg.location) {
        var want = cfg.location.toLowerCase();
        recs = recs.filter(function (r) { return String((r.fields || {}).Location || '').toLowerCase().indexOf(want) > -1; });
      }

      if (!recs.length) { list.innerHTML = '<div class="jd-empty">No available vehicles.</div>'; count.textContent = '0 vehicles'; return; }
      var showMore = !!cfg.forms.archive;
      list.innerHTML = recs.map(function (r) { return rowHtml(r, showMore); }).join('');

      if (!cfg.location) {
        var locs = [];
        recs.forEach(function (r) {
          var L = String((r.fields || {}).Location || '').trim();
          if (L && locs.indexOf(L) === -1) locs.push(L);
        });
        locs.sort();
        if (locs.length > 1) {
          var opts = '<option value="">All Locations</option>';
          locs.forEach(function (L) { opts += '<option value="' + esc(L.toLowerCase()) + '">' + esc(L) + '</option>'; });
          locSel.innerHTML = opts;
          locSel.style.display = '';
        }
      }

      applyFilters();
    }).catch(function (err) {
      list.innerHTML = '<div class="jd-empty">Could not load inventory (' + esc(err.message) + '). Check the base ID and token.</div>';
    });
  }

  function scan() {
    var els = document.querySelectorAll('.jmk-dash:not([data-jmk-dash-init])');
    els.forEach(function (el) { el.setAttribute('data-jmk-dash-init', ''); ensureCss(); initDash(el); });
  }
  function boot() {
    scan();
    if (window.MutationObserver) {
      var obs = new MutationObserver(scan);
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () { obs.disconnect(); }, 10000);
    } else {
      var n = 0, iv = setInterval(function () { scan(); if (++n > 40) clearInterval(iv); }, 250);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
