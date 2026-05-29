const CATEGORY_LABELS = {
  hotels: 'Отели и гостиницы',
  houses: 'Частные дома',
  apartments: 'Квартиры',
  commercial: 'Коммерческие объекты',
};

let PORTFOLIO = [];
let currentFilter = 'all';
let lightboxMedia = [];
let lightboxIdx = 0;
let lightboxTitle = '';
let lightboxDescription = '';

const grid = document.getElementById('portfolio-grid');
const filters = document.getElementById('filters');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxVideo = document.getElementById('lightbox-video');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxDesc = document.getElementById('lightbox-desc');
const lightboxCounter = document.getElementById('lightbox-counter');

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

function showLightboxItem() {
  const item = lightboxMedia[lightboxIdx];
  if (!item) return;

  lightboxImg.classList.remove('active');
  lightboxVideo.classList.remove('active');
  pauseVideo();

  if (item.type === 'video') {
    lightboxVideo.src = item.src;
    const poster = item.poster || lightboxMedia.find(m => m.type === 'image')?.src;
    if (poster) lightboxVideo.poster = poster;
    lightboxVideo.classList.add('active');
    lightboxVideo.play().catch(() => {});
  } else {
    lightboxImg.src = item.src;
    lightboxImg.classList.add('active');
  }

  const kind = item.type === 'video' ? 'видео' : 'фото';
  lightboxCaption.textContent = `${lightboxTitle} — ${kind}`;
  lightboxCounter.textContent = `${lightboxIdx + 1} / ${lightboxMedia.length}`;
}

function openLightbox(projectIdx, list) {
  const project = list[projectIdx];
  if (!project) return;
  lightboxMedia = getMedia(project);
  lightboxIdx = 0;
  lightboxTitle = project.title;
  lightboxDescription = project.description || '';
  if (lightboxDesc) {
    lightboxDesc.textContent = lightboxDescription;
    lightboxDesc.classList.toggle('hidden', !lightboxDescription);
  }
  lightbox.classList.toggle('has-desc', Boolean(lightboxDescription));
  showLightboxItem();
  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('open');
  lightbox.classList.remove('has-desc');
  document.body.style.overflow = '';
  pauseVideo();
  lightboxImg.src = '';
  lightboxImg.classList.remove('active');
  lightboxVideo.classList.remove('active');
}

function nextItem() {
  if (!lightboxMedia.length) return;
  lightboxIdx = (lightboxIdx + 1) % lightboxMedia.length;
  showLightboxItem();
}

function prevItem() {
  if (!lightboxMedia.length) return;
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
