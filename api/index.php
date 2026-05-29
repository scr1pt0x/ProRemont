<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

/** @var array $config */
global $config;

$action = $_GET['action'] ?? $_POST['action'] ?? '';

if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = readJsonBody();
    $password = $body['password'] ?? '';
    if ($password === '' || !password_verify($password, getPasswordHash())) {
        jsonResponse(['error' => 'Неверный пароль'], 401);
    }
    $_SESSION['admin'] = true;
    jsonResponse(['ok' => true]);
}

if ($action === 'logout' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    jsonResponse(['ok' => true]);
}

if ($action === 'session' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    jsonResponse(['authenticated' => isAuthenticated()]);
}

if ($action === 'categories' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    jsonResponse(['categories' => CATEGORY_LABELS]);
}

if ($action === 'settings-load' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    requireAuth();
    jsonResponse(['settings' => loadSettings()]);
}

if ($action === 'change-password' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAuth();
    $body = readJsonBody();
    $current  = $body['current'] ?? '';
    $newPass  = $body['new'] ?? '';
    $confirm  = $body['confirm'] ?? '';

    if ($current === '' || $newPass === '' || $confirm === '') {
        jsonResponse(['error' => 'Заполните все поля'], 400);
    }
    if (mb_strlen($newPass, 'UTF-8') < 6) {
        jsonResponse(['error' => 'Новый пароль должен содержать не менее 6 символов'], 400);
    }
    if ($newPass !== $confirm) {
        jsonResponse(['error' => 'Пароли не совпадают'], 400);
    }
    if (!password_verify($current, getPasswordHash())) {
        jsonResponse(['error' => 'Текущий пароль неверный'], 403);
    }

    $settings = loadSettings();
    $settings['password_hash'] = password_hash($newPass, PASSWORD_DEFAULT);
    saveSettings($settings);
    jsonResponse(['ok' => true]);
}

if ($action === 'settings-save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAuth();
    $body = readJsonBody();
    $current = loadSettings();

    if (isset($body['stats']) && is_array($body['stats'])) {
        $stats = [];
        foreach ($body['stats'] as $stat) {
            if (!is_array($stat)) {
                continue;
            }
            $value = trim((string) ($stat['value'] ?? ''));
            $label = trim((string) ($stat['label'] ?? ''));
            if ($value !== '' && $label !== '') {
                $stats[] = ['value' => $value, 'label' => $label];
            }
        }
        if (!empty($stats)) {
            $current['stats'] = $stats;
        }
    }

    saveSettings($current);
    jsonResponse(['ok' => true, 'settings' => $current]);
}

if ($action === 'list' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    requireAuth();
    jsonResponse(['projects' => loadPortfolio()]);
}

if ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAuth();
    $body = readJsonBody();
    $portfolio = loadPortfolio();

    $originalSlug = trim($body['originalSlug'] ?? '');
    $title = trim($body['title'] ?? '');
    $description = trim($body['description'] ?? '');
    $category = trim($body['category'] ?? 'commercial');
    $requestedSlug = trim($body['slug'] ?? '');
    $images = is_array($body['images'] ?? null) ? $body['images'] : [];
    $videos = is_array($body['videos'] ?? null) ? $body['videos'] : [];

    if ($title === '') {
        jsonResponse(['error' => 'Укажите название работы'], 400);
    }

    $images = array_values(array_filter(array_map(function ($p) {
        return is_string($p) ? safeRelativePath($p) : null;
    }, $images)));

    $videos = array_values(array_filter(array_map(function ($p) {
        return is_string($p) ? safeRelativePath($p) : null;
    }, $videos)));

    $isEdit = $originalSlug !== '';
    $slugBase = $requestedSlug !== '' ? $requestedSlug : $title;
    $slug = uniqueSlug($slugBase, $portfolio, $isEdit ? $originalSlug : null);

    if ($isEdit) {
        $idx = findProjectIndex($portfolio, $originalSlug);
        if ($idx === false) {
            jsonResponse(['error' => 'Работа не найдена'], 404);
        }
        $saved = normalizeProject([
            'slug' => $slug,
            'title' => $title,
            'description' => $description,
            'category' => $category,
            'images' => $images,
            'videos' => $videos,
        ]);
        $portfolio[$idx] = $saved;
    } else {
        $saved = normalizeProject([
            'slug' => $slug,
            'title' => $title,
            'description' => $description,
            'category' => $category,
            'images' => $images,
            'videos' => $videos,
        ]);
        $portfolio[] = $saved;
    }

    savePortfolio($portfolio);
    jsonResponse(['ok' => true, 'project' => $saved]);
}

if ($action === 'delete' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAuth();
    $body = readJsonBody();
    $slug = trim($body['slug'] ?? '');
    if ($slug === '') {
        jsonResponse(['error' => 'Не указан slug'], 400);
    }

    $portfolio = loadPortfolio();
    $idx = findProjectIndex($portfolio, $slug);
    if ($idx === false) {
        jsonResponse(['error' => 'Работа не найдена'], 404);
    }

    $project = $portfolio[$idx];
    foreach (array_merge($project['images'] ?? [], $project['videos'] ?? []) as $path) {
        deleteMediaFile($path);
    }

    array_splice($portfolio, $idx, 1);
    savePortfolio($portfolio);
    jsonResponse(['ok' => true]);
}

if ($action === 'upload' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAuth();
    ensureMediaDirs();

    $slug = trim($_POST['slug'] ?? '');
    if ($slug === '') {
        $slug = 'work-' . time();
    }
    $slug = slugify($slug);
    if ($slug === '' || !preg_match('/^[a-z0-9-]+$/', $slug)) {
        jsonResponse(['error' => 'Некорректный slug'], 400);
    }

    $incoming = collectUploadedFiles();
    if (!$incoming) {
        $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($contentLength > 0 && empty($_POST) && empty($_FILES)) {
            jsonResponse(['error' => 'Файл слишком большой для настроек PHP (post_max_size / upload_max_filesize)'], 413);
        }
        jsonResponse(['error' => 'Файлы не переданы'], 400);
    }

    $uploaded = ['images' => [], 'videos' => []];
    $errors = [];
    $imageNum = nextMediaNumber(IMAGES_DIR, $slug);
    $videoNum = nextMediaNumber(VIDEOS_DIR, $slug);

    foreach ($incoming as $file) {
        $name = $file['name'] ?? 'file';
        if ($file['error'] !== UPLOAD_ERR_OK) {
            $errors[] = $name . ': ' . uploadErrorMessage($file['error']);
            continue;
        }
        if (!is_uploaded_file($file['tmp_name'])) {
            $errors[] = $name . ': файл не принят сервером';
            continue;
        }

        $media = detectUploadedMedia($file['tmp_name'], $name);
        if ($media === null) {
            $errors[] = $name . ': неподдерживаемый формат';
            continue;
        }

        if ($media['type'] === 'image') {
            if (exceedsUploadLimit($file['size'], $config['max_image_bytes'])) {
                $errors[] = $name . ': изображение слишком большое';
                continue;
            }
            $filename = sprintf('%s-%02d.%s', $slug, $imageNum, $media['ext']);
            $dest = IMAGES_DIR . '/' . $filename;
            if (!move_uploaded_file($file['tmp_name'], $dest)) {
                $errors[] = $name . ': не удалось сохранить';
                continue;
            }
            $uploaded['images'][] = 'images/' . $filename;
            $imageNum++;
            continue;
        }

        if (exceedsUploadLimit($file['size'], $config['max_video_bytes'])) {
            $errors[] = $name . ': видео слишком большое';
            continue;
        }
        $filename = sprintf('%s-%02d.%s', $slug, $videoNum, $media['ext'] === 'mp4' ? 'mp4' : $media['ext']);
        $dest = VIDEOS_DIR . '/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            $errors[] = $name . ': не удалось сохранить видео';
            continue;
        }
        $uploaded['videos'][] = 'videos/' . $filename;
        $videoNum++;
    }

    if (!$uploaded['images'] && !$uploaded['videos']) {
        jsonResponse([
            'error' => $errors[0] ?? 'Не удалось загрузить файлы',
            'errors' => $errors,
        ], 400);
    }

    jsonResponse([
        'ok' => true,
        'uploaded' => $uploaded,
        'errors' => $errors,
    ]);
}

if ($action === 'remove-media' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    requireAuth();
    $body = readJsonBody();
    $slug = trim($body['slug'] ?? '');
    $path = safeRelativePath($body['path'] ?? '');

    if ($slug === '' || $path === null) {
        jsonResponse(['error' => 'Некорректные параметры'], 400);
    }

    $portfolio = loadPortfolio();
    $idx = findProjectIndex($portfolio, $slug);
    if ($idx !== false) {
        $project = $portfolio[$idx];
        $project['images'] = array_values(array_filter($project['images'] ?? [], fn ($p) => $p !== $path));
        $project['videos'] = array_values(array_filter($project['videos'] ?? [], fn ($p) => $p !== $path));
        $portfolio[$idx] = normalizeProject($project);
        deleteMediaFile($path);
        savePortfolio($portfolio);
        jsonResponse(['ok' => true, 'project' => $portfolio[$idx]]);
    }

    $basename = basename($path);
    if (!str_starts_with($basename, $slug . '-')) {
        jsonResponse(['error' => 'Файл не принадлежит этому slug'], 400);
    }

    deleteMediaFile($path);
    jsonResponse(['ok' => true]);
}

jsonResponse(['error' => 'Неизвестное действие'], 404);
