let PORTFOLIO = [];
let currentFilter = 'all';
let lightboxMedia = [];
let lightboxIdx = 0;
let lightboxTitle = '';
let lightboxDescription = '';

const grid = document.getElementById('portfolio-grid');
const filters = document.getElementById('filters');
const lightbox = document.getElementById('lightbox');
const lightboxVideo = document.getElementById('lightbox-video');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxDesc = document.getElementById('lightbox-desc');
const lightboxCounter = document.getElementById('lightbox-counter');
const _dotsEl = document.getElementById('lightbox-dots');
const _swipeHint = document.getElementById('lb-swipe-hint');
const MAX_DOTS = 15;

/* ── Lightbox stage & image buffers ── */
const _stage = document.getElementById('lightbox-stage');
let _imgA = document.getElementById('lightbox-img');
let _imgB = document.getElementById('lightbox-img-b');

let _front = _imgA;
let _back = _imgB;
let _lbDir = 1;       // 1 = next, -1 = prev
let _animTimer = null;

function getMedia(project) {
  if (project.media && project.media.length) return project.media;
  return (project.images || []).map(src => ({ type: 'image', src }));
}

function mediaLabel(project) {
  const photos = (project.images || []).length;
  const videos = (project.videos || []).length;
  const parts = [];
  if (photos) parts.push(`${photos} фото`);
  if (videos) parts.push(`${videos} видео`);
  return parts.join(' · ') || '0 фото';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPortfolio() {
  grid.innerHTML = '';
  const items = (currentFilter === 'all'
    ? PORTFOLIO
    : PORTFOLIO.filter(p => p.category === currentFilter)
  ).filter(p => getMedia(p).length > 0);

  if (!items.length) {
    grid.innerHTML = '<p class="portfolio__empty">В этой категории пока нет проектов.</p>';
    return;
  }

  items.forEach((project, idx) => {
    const media = getMedia(project);
    const hasVideo = media.some(m => m.type === 'video');
    const cover = media.find(m => m.type === 'image')?.src || project.images?.[0] || '';
    const card = document.createElement('article');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-card__img">
        ${hasVideo ? '<span class="project-card__badge">▶ видео</span>' : ''}
        <img src="${cover}" alt="${project.title}" loading="lazy">
      </div>
      <div class="project-card__info">
        <h3 class="project-card__title">${escapeHtml(project.title)}</h3>
        <p class="project-card__meta">${escapeHtml(project.categoryLabel)} · ${mediaLabel(project)}</p>
        ${project.description ? `<p class="project-card__desc">${escapeHtml(project.description)}</p>` : ''}
      </div>
    `;
    card.addEventListener('click', () => openLightbox(idx, items));
    grid.appendChild(card);
  });
}

function pauseVideo() {
  lightboxVideo.pause();
  lightboxVideo.removeAttribute('src');
  lightboxVideo.load();
}

/* ── Dots ── */
function renderDots() {
  if (!_dotsEl) return;
  const n = lightboxMedia.length;
  if (n < 2 || n > MAX_DOTS) { _dotsEl.innerHTML = ''; return; }
  if (_dotsEl.children.length !== n) {
    _dotsEl.innerHTML = Array.from({ length: n }, (_, i) =>
      `<span class="lb-dot${i === lightboxIdx ? ' active' : ''}"></span>`
    ).join('');
  } else {
    Array.from(_dotsEl.children).forEach((d, i) =>
      d.classList.toggle('active', i === lightboxIdx)
    );
  }
}

/* ── Preload cache ── */
const _imgCache = {};
function preloadAdjacent() {
  for (let d = -2; d <= 3; d++) {
    if (d === 0) continue;
    const i = (lightboxIdx + d + lightboxMedia.length) % lightboxMedia.length;
    const it = lightboxMedia[i];
    if (it?.type === 'image' && !_imgCache[it.src]) {
      const img = new Image(); img.src = it.src; _imgCache[it.src] = img;
    }
  }
}
/* ── Slide animation ── */
const SLIDE_MS = 180;

function canShowImages() {
  return Boolean(_stage && _front && _back);
}

function finalizeSlide() {
  if (!_animTimer || !canShowImages()) return;
  clearTimeout(_animTimer);
  _animTimer = null;
  _front.className = 'lb-buf';
  _front.src = '';
  _back.className = 'lb-buf lb-visible';
  _stage.classList.remove('lb-next', 'lb-prev');
  [_front, _back] = [_back, _front];
}

function slideImages(src) {
  if (!canShowImages()) return;
  finalizeSlide();

  if (!_imgCache[src]) {
    const img = new Image(); img.src = src; _imgCache[src] = img;
  }

  if (_front.src) {
    const current = new URL(_front.src, location.href).href;
    const next = new URL(src, location.href).href;
    if (current === next) return;
  }

  const animClass = _lbDir > 0 ? 'lb-next' : 'lb-prev';

  _back.src = src;
  _back.className = 'lb-buf lb-enter';
  _front.classList.add('lb-leave');

  void _stage.offsetWidth;

  _stage.classList.add(animClass);
  _back.classList.add('lb-entering');

  _animTimer = setTimeout(() => {
    finalizeSlide();
  }, SLIDE_MS);
}

function showLightboxItem(instant) {
  const item = lightboxMedia[lightboxIdx];
  if (!item) return;

  const kind = item.type === 'video' ? 'видео' : 'фото';
  lightboxCaption.textContent = `${lightboxTitle} — ${kind}`;
  lightboxCounter.textContent = `${lightboxIdx + 1} / ${lightboxMedia.length}`;
  renderDots();

  if (item.type === 'video') {
    if (!canShowImages()) return;
    finalizeSlide();
    _front.className = 'lb-buf';
    _back.className = 'lb-buf';
    _front.src = '';
    _back.src = '';
    lightboxVideo.classList.remove('active');
    pauseVideo();
    lightboxVideo.src = item.src;
    const poster = item.poster || lightboxMedia.find(m => m.type === 'image')?.src;
    if (poster) lightboxVideo.poster = poster;
    lightboxVideo.classList.add('active');
    lightboxVideo.play().catch(() => {});
    preloadAdjacent();
    return;
  }

  lightboxVideo.classList.remove('active');
  pauseVideo();

  if (!canShowImages()) return;

  if (instant) {
    finalizeSlide();
    _front.src = item.src;
    _front.className = 'lb-buf lb-visible';
    _back.src = '';
    _back.className = 'lb-buf';
    _stage.classList.remove('lb-next', 'lb-prev');
  } else {
    slideImages(item.src);
  }
  preloadAdjacent();
}

function openLightbox(projectIdx, list) {
  const project = list[projectIdx];
  if (!project || !canShowImages()) return;
  lightboxMedia = getMedia(project);
  lightboxIdx = 0;
  _lbDir = 1;
  lightboxTitle = project.title;
  lightboxDescription = project.description || '';
  if (lightboxDesc) {
    lightboxDesc.textContent = lightboxDescription;
    lightboxDesc.classList.toggle('hidden', !lightboxDescription);
  }
  lightbox.classList.toggle('has-desc', Boolean(lightboxDescription));
  _front = _imgA;
  _back = _imgB;
  if (_animTimer) { clearTimeout(_animTimer); _animTimer = null; }
  _stage.classList.remove('lb-next', 'lb-prev');
  showLightboxItem(true);
  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
  preloadAdjacent();
  if (_swipeHint) _swipeHint.classList.toggle('visible', lightboxMedia.length > 1);
}

function closeLightbox() {
  finalizeSlide();
  if (_swipeHint) _swipeHint.classList.remove('visible');
  lightbox.classList.remove('open', 'has-desc');
  document.body.style.overflow = '';
  pauseVideo();
  _front.src = '';
  _back.src = '';
  _front.className = 'lb-buf lb-visible';
  _back.className = 'lb-buf';
  _stage.classList.remove('lb-next', 'lb-prev');
  lightboxVideo.classList.remove('active');
}

function nextItem() {
  if (!lightboxMedia.length) return;
  _lbDir = 1;
  lightboxIdx = (lightboxIdx + 1) % lightboxMedia.length;
  showLightboxItem();
}

function prevItem() {
  if (!lightboxMedia.length) return;
  _lbDir = -1;
  lightboxIdx = (lightboxIdx - 1 + lightboxMedia.length) % lightboxMedia.length;
  showLightboxItem();
}

filters.addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  filters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  renderPortfolio();
});

document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
document.getElementById('lightbox-next').addEventListener('click', nextItem);
document.getElementById('lightbox-prev').addEventListener('click', prevItem);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') nextItem();
  if (e.key === 'ArrowLeft') prevItem();
});

// Touch swipe (mobile only)
;(function () {
  const stage = document.getElementById('lightbox-stage');
  if (!stage) return;
  let x0 = 0, y0 = 0, active = false;

  stage.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    active = true;
  }, { passive: true });

  stage.addEventListener('touchmove', e => {
    if (!active) return;
    const dx = e.touches[0].clientX - x0;
    const dy = e.touches[0].clientY - y0;
    if (Math.abs(dx) > Math.abs(dy)) e.preventDefault();
  }, { passive: false });

  stage.addEventListener('touchend', e => {
    if (!active) return;
    active = false;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) < 48 || Math.abs(dy) > Math.abs(dx)) return;
    dx < 0 ? nextItem() : prevItem();
  }, { passive: true });
}());

const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobile-menu');
const mobileBackdrop = document.getElementById('mobile-menu-backdrop');

function openMobileMenu() {
  burger.classList.add('active');
  mobileMenu.classList.add('open');
  mobileMenu.setAttribute('aria-hidden', 'false');
  burger.setAttribute('aria-expanded', 'true');
  burger.setAttribute('aria-label', 'Закрыть меню');
  document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  burger.classList.remove('active');
  mobileMenu.classList.remove('open');
  mobileMenu.setAttribute('aria-hidden', 'true');
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-label', 'Открыть меню');
  document.body.style.overflow = '';
}

burger.addEventListener('click', () => {
  if (mobileMenu.classList.contains('open')) closeMobileMenu();
  else openMobileMenu();
});

mobileBackdrop.addEventListener('click', closeMobileMenu);

mobileMenu.querySelectorAll('.mobile-menu__link, .mobile-menu__whatsapp').forEach(link => {
  link.addEventListener('click', closeMobileMenu);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && mobileMenu.classList.contains('open')) closeMobileMenu();
});

const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 20);
});

async function loadPortfolio() {
  if (typeof PORTFOLIO_DATA !== 'undefined') {
    PORTFOLIO = PORTFOLIO_DATA;
  }
  try {
    const res = await fetch('data/portfolio.json?' + Date.now());
    if (res.ok) PORTFOLIO = await res.json();
  } catch (_) {}
  renderPortfolio();
}

async function loadSettings() {
  try {
    const res = await fetch('data/settings.json?' + Date.now());
    if (!res.ok) return;
    const s = await res.json();
    if (!Array.isArray(s.stats) || !s.stats.length) return;
    const ul = document.getElementById('about-stats');
    if (!ul) return;
    ul.innerHTML = s.stats
      .map(item => `<li><strong>${escapeHtml(String(item.value))}</strong><span>${escapeHtml(String(item.label))}</span></li>`)
      .join('');
  } catch (_) {}
}

loadPortfolio();
loadSettings();
