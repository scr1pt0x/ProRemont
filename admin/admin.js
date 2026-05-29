const API = '../api/index.php';

const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const projectsList = document.getElementById('projects-list');
const listEmpty = document.getElementById('list-empty');
const mediaGrid = document.getElementById('media-grid');
const uploadZone = document.getElementById('upload-zone');
const uploadInput = document.getElementById('upload-input');
const uploadPick = document.getElementById('upload-pick');
const uploadError = document.getElementById('upload-error');
const saveError = document.getElementById('save-error');
const saveSuccess = document.getElementById('save-success');
const toast = document.getElementById('toast');
const statsEditor = document.getElementById('stats-editor');
const settingsError = document.getElementById('settings-error');
const settingsSuccess = document.getElementById('settings-success');

let categories = {};
let projects = [];
let editing = null;
let draft = emptyDraft();
let currentSettings = { stats: [] };

function emptyDraft() {
  return {
    originalSlug: '',
    slug: '',
    title: '',
    description: '',
    category: 'commercial',
    images: [],
    videos: [],
  };
}

const views = {
  login: document.getElementById('view-login'),
  dashboard: document.getElementById('view-dashboard'),
  editor: document.getElementById('view-editor'),
  settings: document.getElementById('view-settings'),
};

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.classList.toggle('hidden', key !== name);
  });
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 2800);
}

async function api(action, options = {}) {
  const { method = 'GET', body, formData } = options;
  const url = `${API}?action=${encodeURIComponent(action)}`;
  const init = { method, credentials: 'same-origin' };

  if (formData) {
    init.body = formData;
  } else if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(raw.slice(0, 120) || 'Сервер вернул некорректный ответ');
  }
  if (!res.ok) {
    throw new Error(data.error || data.errors?.[0] || 'Ошибка запроса');
  }
  return data;
}

function slugify(text) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return text
    .toLowerCase()
    .trim()
    .split('')
    .map(ch => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}

function mediaCount(project) {
  const photos = (project.images || []).length;
  const videos = (project.videos || []).length;
  const parts = [];
  if (photos) parts.push(`${photos} фото`);
  if (videos) parts.push(`${videos} видео`);
  return parts.join(' · ') || 'нет медиа';
}

function renderProjectsList() {
  projectsList.innerHTML = '';
  listEmpty.classList.toggle('hidden', projects.length > 0);

  projects.forEach(project => {
    const cover = project.images?.[0];
    const row = document.createElement('div');
    row.className = 'project-row';
    row.innerHTML = `
      ${cover
        ? `<img class="project-row__thumb" src="../${cover}" alt="">`
        : '<div class="project-row__thumb project-row__thumb--empty">нет фото</div>'}
      <div class="project-row__info">
        <div class="project-row__title">${escapeHtml(project.title)}</div>
        <div class="project-row__meta">${escapeHtml(project.categoryLabel)} · ${mediaCount(project)}</div>
        ${project.description ? `<div class="project-row__desc">${escapeHtml(project.description)}</div>` : ''}
      </div>
      <span class="project-row__arrow">›</span>
    `;
    row.addEventListener('click', () => openEditor(project));
    projectsList.appendChild(row);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fillCategorySelect() {
  const select = document.getElementById('field-category');
  select.innerHTML = Object.entries(categories)
    .map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`)
    .join('');
}

function getCombinedMedia() {
  const items = [];
  draft.images.forEach(src => items.push({ type: 'image', src }));
  draft.videos.forEach(src => items.push({ type: 'video', src }));
  return items;
}

function applyMediaOrder(items) {
  draft.images = items.filter(i => i.type === 'image').map(i => i.src);
  draft.videos = items.filter(i => i.type === 'video').map(i => i.src);
}

function renderMediaGrid() {
  const items = getCombinedMedia();
  mediaGrid.innerHTML = '';

  items.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'media-item';
    el.innerHTML = `
      <span class="media-item__badge">${item.type === 'video' ? '▶ видео' : 'фото'}</span>
      <button type="button" class="media-item__remove" aria-label="Удалить">&times;</button>
      ${item.type === 'video'
        ? `<video src="../${item.src}" muted playsinline></video>`
        : `<img src="../${item.src}" alt="">`}
      <div class="media-item__move">
        <button type="button" data-dir="-1" ${idx === 0 ? 'disabled' : ''}>←</button>
        <button type="button" data-dir="1" ${idx === items.length - 1 ? 'disabled' : ''}>→</button>
      </div>
    `;

    el.querySelector('.media-item__remove').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Удалить файл с сервера?')) return;
      try {
        const slug = draft.slug || draft.originalSlug || await ensureSlug();
        await api('remove-media', {
          method: 'POST',
          body: { slug, path: item.src },
        });
        applyMediaOrder(items.filter((_, i) => i !== idx));
        renderMediaGrid();
        showToast('Файл удалён');
      } catch (err) {
        showToast(err.message);
      }
    });

    el.querySelectorAll('.media-item__move button').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = Number(btn.dataset.dir);
        const next = idx + dir;
        if (next < 0 || next >= items.length) return;
        const copy = [...items];
        [copy[idx], copy[next]] = [copy[next], copy[idx]];
        applyMediaOrder(copy);
        renderMediaGrid();
      });
    });

    mediaGrid.appendChild(el);
  });
}

function openEditor(project = null) {
  saveError.classList.add('hidden');
  saveSuccess.classList.add('hidden');
  uploadError.classList.add('hidden');

  if (project) {
    editing = project.slug;
    draft = {
      originalSlug: project.slug,
      slug: project.slug,
      title: project.title,
      description: project.description || '',
      category: project.category,
      images: [...(project.images || [])],
      videos: [...(project.videos || [])],
    };
    document.getElementById('editor-title').textContent = 'Редактирование';
    document.getElementById('btn-delete').hidden = false;
  } else {
    editing = null;
    draft = emptyDraft();
    document.getElementById('editor-title').textContent = 'Новая работа';
    document.getElementById('btn-delete').hidden = true;
  }

  document.getElementById('field-title').value = draft.title;
  document.getElementById('field-description').value = draft.description;
  document.getElementById('field-slug').value = draft.slug;
  document.getElementById('field-category').value = draft.category;
  renderMediaGrid();
  showView('editor');
}

async function ensureSlug() {
  const title = document.getElementById('field-title').value.trim();
  let slug = document.getElementById('field-slug').value.trim();
  if (!slug) {
    slug = title ? slugify(title) : `work-${Date.now()}`;
    document.getElementById('field-slug').value = slug;
  }
  draft.slug = slug;
  return slug;
}

async function prepareFileForUpload(file) {
  if (!file.type.startsWith('image/') || file.size <= 1.5 * 1024 * 1024) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 2400;
    let { width, height } = bitmap;
    if (width > maxSide || height > maxSide) {
      if (width >= height) {
        height = Math.round((height * maxSide) / width);
        width = maxSide;
      } else {
        width = Math.round((width * maxSide) / height);
        height = maxSide;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

async function uploadFiles(fileList) {
  uploadError.classList.add('hidden');
  const slug = await ensureSlug();
  const files = [...fileList];
  if (!files.length) return;

  uploadZone.classList.add('upload-zone--busy');
  let uploadedCount = 0;
  const failed = [];

  for (const original of files) {
    const file = await prepareFileForUpload(original);
    const formData = new FormData();
    formData.append('slug', slug);
    formData.append('files[]', file, file.name);

    try {
      const data = await api('upload', { method: 'POST', formData });
      draft.images.push(...(data.uploaded?.images || []));
      draft.videos.push(...(data.uploaded?.videos || []));
      uploadedCount += (data.uploaded?.images?.length || 0) + (data.uploaded?.videos?.length || 0);
      if (data.errors?.length) failed.push(...data.errors);
    } catch (err) {
      failed.push(`${original.name}: ${err.message}`);
    }
  }

  uploadZone.classList.remove('upload-zone--busy');
  document.getElementById('field-slug').value = slug;
  renderMediaGrid();

  if (uploadedCount) {
    showToast(`Загружено: ${uploadedCount}`);
  } else if (failed.length) {
    uploadError.textContent = failed.join(' · ');
    uploadError.classList.remove('hidden');
  } else {
    uploadError.textContent = 'Не удалось загрузить файлы';
    uploadError.classList.remove('hidden');
  }
}

async function saveProject() {
  saveError.classList.add('hidden');
  saveSuccess.classList.add('hidden');

  draft.title = document.getElementById('field-title').value.trim();
  draft.description = document.getElementById('field-description').value.trim();
  draft.category = document.getElementById('field-category').value;
  draft.slug = document.getElementById('field-slug').value.trim() || slugify(draft.title);

  if (!draft.title) {
    saveError.textContent = 'Укажите название';
    saveError.classList.remove('hidden');
    return;
  }

  try {
    const data = await api('save', {
      method: 'POST',
      body: {
        originalSlug: draft.originalSlug,
        slug: draft.slug,
        title: draft.title,
        description: draft.description,
        category: draft.category,
        images: draft.images,
        videos: draft.videos,
      },
    });

    draft.originalSlug = data.project.slug;
    draft.slug = data.project.slug;
    editing = data.project.slug;
    document.getElementById('btn-delete').hidden = false;
    document.getElementById('field-slug').value = draft.slug;

    await loadProjects();
    saveSuccess.classList.remove('hidden');
    showToast('Сохранено');
  } catch (err) {
    saveError.textContent = err.message;
    saveError.classList.remove('hidden');
  }
}

async function deleteProject() {
  if (!draft.originalSlug) return;
  if (!confirm(`Удалить «${draft.title}» и все файлы?`)) return;

  try {
    await api('delete', { method: 'POST', body: { slug: draft.originalSlug } });
    await loadProjects();
    showView('dashboard');
    showToast('Работа удалена');
  } catch (err) {
    showToast(err.message);
  }
}

async function loadProjects() {
  const data = await api('list');
  projects = data.projects || [];
  renderProjectsList();
}

/* ── Settings ──────────────────────────── */

function renderStatsEditor(stats) {
  statsEditor.innerHTML = '';
  stats.forEach((stat, i) => {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <input type="text" class="stat-value" value="${escapeHtml(stat.value)}" placeholder="Значение">
      <input type="text" class="stat-label" value="${escapeHtml(stat.label)}" placeholder="Подпись">
      <button type="button" class="stat-row__remove" aria-label="Удалить">×</button>
    `;
    row.querySelector('.stat-row__remove').addEventListener('click', () => {
      row.remove();
    });
    statsEditor.appendChild(row);
  });
}

function collectStats() {
  return [...statsEditor.querySelectorAll('.stat-row')].map(row => ({
    value: row.querySelector('.stat-value').value.trim(),
    label: row.querySelector('.stat-label').value.trim(),
  })).filter(s => s.value && s.label);
}

async function openSettings() {
  settingsError.classList.add('hidden');
  settingsSuccess.classList.add('hidden');
  try {
    const data = await api('settings-load');
    currentSettings = data.settings || { stats: [] };
    renderStatsEditor(currentSettings.stats || []);
    showView('settings');
  } catch (err) {
    showToast(err.message);
  }
}

async function saveSettings() {
  settingsError.classList.add('hidden');
  settingsSuccess.classList.add('hidden');
  const stats = collectStats();
  try {
    await api('settings-save', { method: 'POST', body: { stats } });
    currentSettings.stats = stats;
    settingsSuccess.classList.remove('hidden');
    showToast('Настройки сохранены');
  } catch (err) {
    settingsError.textContent = err.message;
    settingsError.classList.remove('hidden');
  }
}

async function init() {
  try {
    const cats = await api('categories');
    categories = cats.categories || {};
    fillCategorySelect();
  } catch (_) {
    categories = {
      hotels: 'Отели и гостиницы',
      houses: 'Частные дома',
      apartments: 'Квартиры',
      commercial: 'Коммерческие объекты',
    };
    fillCategorySelect();
  }

  const session = await api('session');
  if (session.authenticated) {
    await loadProjects();
    showView('dashboard');
  } else {
    showView('login');
  }
}

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.classList.add('hidden');
  const password = document.getElementById('login-password').value;
  try {
    await api('login', { method: 'POST', body: { password } });
    await loadProjects();
    showView('dashboard');
    document.getElementById('login-password').value = '';
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove('hidden');
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await api('logout', { method: 'POST' });
  showView('login');
});

document.getElementById('btn-add').addEventListener('click', () => openEditor());
document.getElementById('btn-back').addEventListener('click', async () => {
  await loadProjects();
  showView('dashboard');
});
document.getElementById('btn-save').addEventListener('click', saveProject);
document.getElementById('btn-delete').addEventListener('click', deleteProject);

document.getElementById('btn-open-settings').addEventListener('click', openSettings);

document.getElementById('btn-pw-save').addEventListener('click', async () => {
  const pwError   = document.getElementById('pw-error');
  const pwSuccess = document.getElementById('pw-success');
  pwError.classList.add('hidden');
  pwSuccess.classList.add('hidden');

  const current = document.getElementById('pw-current').value;
  const newPass = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;

  if (!current || !newPass || !confirm) {
    pwError.textContent = 'Заполните все поля';
    pwError.classList.remove('hidden');
    return;
  }
  if (newPass !== confirm) {
    pwError.textContent = 'Пароли не совпадают';
    pwError.classList.remove('hidden');
    return;
  }

  try {
    await api('change-password', { method: 'POST', body: { current, new: newPass, confirm } });
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-confirm').value = '';
    pwSuccess.classList.remove('hidden');
    showToast('Пароль изменён');
  } catch (err) {
    pwError.textContent = err.message;
    pwError.classList.remove('hidden');
  }
});
document.getElementById('btn-settings-back').addEventListener('click', () => showView('dashboard'));
document.getElementById('btn-settings-save').addEventListener('click', saveSettings);
document.getElementById('btn-add-stat').addEventListener('click', () => {
  const row = document.createElement('div');
  row.className = 'stat-row';
  row.innerHTML = `
    <input type="text" class="stat-value" placeholder="Значение">
    <input type="text" class="stat-label" placeholder="Подпись">
    <button type="button" class="stat-row__remove" aria-label="Удалить">×</button>
  `;
  row.querySelector('.stat-row__remove').addEventListener('click', () => row.remove());
  statsEditor.appendChild(row);
  row.querySelector('.stat-value').focus();
});

document.getElementById('field-title').addEventListener('input', () => {
  if (!draft.originalSlug && !document.getElementById('field-slug').dataset.manual) {
    document.getElementById('field-slug').value = slugify(document.getElementById('field-title').value);
    draft.slug = document.getElementById('field-slug').value;
  }
});

document.getElementById('field-slug').addEventListener('input', e => {
  e.target.dataset.manual = e.target.value ? '1' : '';
});

uploadInput.addEventListener('change', () => {
  const picked = [...(uploadInput.files || [])];
  uploadInput.value = '';
  if (picked.length) uploadFiles(picked);
});

uploadPick.addEventListener('click', e => {
  e.stopPropagation();
  if (!uploadZone.classList.contains('upload-zone--busy')) {
    uploadInput.click();
  }
});

uploadZone.addEventListener('click', e => {
  if (e.target.closest('#upload-pick') || uploadZone.classList.contains('upload-zone--busy')) return;
  uploadInput.click();
});

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));

uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
});

init();
