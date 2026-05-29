<?php

declare(strict_types=1);

$config = require __DIR__ . '/config.php';

session_name($config['session_name']);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

define('ROOT_DIR', dirname(__DIR__));
define('DATA_FILE', ROOT_DIR . '/data/portfolio.json');
define('JS_DATA_FILE', ROOT_DIR . '/js/portfolio-data.js');
define('SETTINGS_FILE', ROOT_DIR . '/data/settings.json');
define('IMAGES_DIR', ROOT_DIR . '/images');
define('VIDEOS_DIR', ROOT_DIR . '/videos');

const CATEGORY_LABELS = [
    'hotels' => 'Отели и гостиницы',
    'houses' => 'Частные дома',
    'apartments' => 'Квартиры',
    'commercial' => 'Коммерческие объекты',
];

function jsonResponse(mixed $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function isAuthenticated(): bool
{
    return !empty($_SESSION['admin']);
}

function requireAuth(): void
{
    if (!isAuthenticated()) {
        jsonResponse(['error' => 'Требуется авторизация'], 401);
    }
}

function defaultSettings(): array
{
    return [
        'stats' => [
            ['value' => '6', 'label' => 'реализованных проектов'],
            ['value' => '100%', 'label' => 'под ключ'],
            ['value' => '3', 'label' => 'направления работы'],
        ],
    ];
}

function loadSettings(): array
{
    if (!is_file(SETTINGS_FILE)) {
        return defaultSettings();
    }
    $raw = file_get_contents(SETTINGS_FILE);
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? array_merge(defaultSettings(), $data) : defaultSettings();
}

function saveSettings(array $settings): void
{
    $json = json_encode($settings, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json !== false) {
        file_put_contents(SETTINGS_FILE, $json . "\n", LOCK_EX);
    }
}

function getPasswordHash(): string
{
    global $config;
    $settings = loadSettings();
    return $settings['password_hash'] ?? ($config['password_hash'] ?? '');
}

function loadPortfolio(): array
{
    if (!is_file(DATA_FILE)) {
        return [];
    }
    $raw = file_get_contents(DATA_FILE);
    $data = json_decode($raw ?: '[]', true);
    return is_array($data) ? $data : [];
}

function buildMedia(array $images, array $videos): array
{
    $poster = $images[0] ?? null;
    $media = [];
    foreach ($images as $src) {
        $media[] = ['type' => 'image', 'src' => $src];
    }
    foreach ($videos as $src) {
        $item = ['type' => 'video', 'src' => $src];
        if ($poster) {
            $item['poster'] = $poster;
        }
        $media[] = $item;
    }
    return $media;
}

function normalizeProject(array $project): array
{
    $category = $project['category'] ?? 'commercial';
    if (!isset(CATEGORY_LABELS[$category])) {
        $category = 'commercial';
    }

    $images = array_values(array_filter($project['images'] ?? [], 'is_string'));
    $videos = array_values(array_filter($project['videos'] ?? [], 'is_string'));

    return [
        'slug' => $project['slug'] ?? '',
        'title' => trim($project['title'] ?? ''),
        'description' => trim($project['description'] ?? ''),
        'category' => $category,
        'categoryLabel' => CATEGORY_LABELS[$category],
        'images' => $images,
        'videos' => $videos,
        'media' => buildMedia($images, $videos),
    ];
}

function savePortfolio(array $portfolio): void
{
    $dir = dirname(DATA_FILE);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $normalized = array_map('normalizeProject', $portfolio);
    $json = json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false) {
        jsonResponse(['error' => 'Ошибка сериализации данных'], 500);
    }

    if (file_put_contents(DATA_FILE, $json . "\n", LOCK_EX) === false) {
        jsonResponse(['error' => 'Не удалось сохранить portfolio.json'], 500);
    }

    $js = 'const PORTFOLIO_DATA = ' . $json . ";\n";
    file_put_contents(JS_DATA_FILE, $js, LOCK_EX);
}

function slugify(string $text): string
{
    $map = [
        'а' => 'a', 'б' => 'b', 'в' => 'v', 'г' => 'g', 'д' => 'd', 'е' => 'e', 'ё' => 'e',
        'ж' => 'zh', 'з' => 'z', 'и' => 'i', 'й' => 'y', 'к' => 'k', 'л' => 'l', 'м' => 'm',
        'н' => 'n', 'о' => 'o', 'п' => 'p', 'р' => 'r', 'с' => 's', 'т' => 't', 'у' => 'u',
        'ф' => 'f', 'х' => 'h', 'ц' => 'ts', 'ч' => 'ch', 'ш' => 'sh', 'щ' => 'sch', 'ъ' => '',
        'ы' => 'y', 'ь' => '', 'э' => 'e', 'ю' => 'yu', 'я' => 'ya',
    ];

    $text = mb_strtolower(trim($text), 'UTF-8');
    $text = strtr($text, $map);
    $text = preg_replace('/[^a-z0-9]+/', '-', $text) ?? '';
    $text = trim($text, '-');
    return $text ?: 'project';
}

function uniqueSlug(string $base, array $portfolio, ?string $except = null): string
{
    $slug = slugify($base);
    $existing = array_column($portfolio, 'slug');
    if ($except !== null) {
        $existing = array_values(array_filter($existing, fn ($s) => $s !== $except));
    }
    if (!in_array($slug, $existing, true)) {
        return $slug;
    }
    $i = 2;
    while (in_array("{$slug}-{$i}", $existing, true)) {
        $i++;
    }
    return "{$slug}-{$i}";
}

function findProjectIndex(array $portfolio, string $slug): int|false
{
    foreach ($portfolio as $i => $project) {
        if (($project['slug'] ?? '') === $slug) {
            return $i;
        }
    }
    return false;
}

function safeRelativePath(string $path): ?string
{
    $path = str_replace('\\', '/', $path);
    if ($path === '' || str_contains($path, '..') || str_starts_with($path, '/')) {
        return null;
    }
    if (!preg_match('#^(images|videos)/[a-zA-Z0-9._-]+$#', $path)) {
        return null;
    }
    return $path;
}

function deleteMediaFile(string $relativePath): void
{
    $safe = safeRelativePath($relativePath);
    if ($safe === null) {
        return;
    }
    $full = ROOT_DIR . '/' . $safe;
    if (is_file($full)) {
        unlink($full);
    }
}

function uploadErrorMessage(int $code): string
{
    return match ($code) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Файл слишком большой для настроек PHP на сервере',
        UPLOAD_ERR_PARTIAL => 'Файл загружен не полностью, попробуйте ещё раз',
        UPLOAD_ERR_NO_FILE => 'Файл не получен сервером',
        UPLOAD_ERR_NO_TMP_DIR => 'На сервере нет временной папки для загрузок',
        UPLOAD_ERR_CANT_WRITE => 'Сервер не может записать файл на диск',
        UPLOAD_ERR_EXTENSION => 'Загрузка остановлена расширением PHP',
        default => 'Ошибка загрузки (код ' . $code . ')',
    };
}

function collectUploadedFiles(): array
{
    $collected = [];

    foreach ($_FILES as $batch) {
        if (!is_array($batch) || !array_key_exists('name', $batch)) {
            continue;
        }

        if (is_array($batch['name'])) {
            $count = count($batch['name']);
            for ($i = 0; $i < $count; $i++) {
                if (($batch['name'][$i] ?? '') === '' && ($batch['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
                    continue;
                }
                $collected[] = [
                    'name' => (string) ($batch['name'][$i] ?? 'file'),
                    'tmp_name' => (string) ($batch['tmp_name'][$i] ?? ''),
                    'error' => (int) ($batch['error'][$i] ?? UPLOAD_ERR_NO_FILE),
                    'size' => (int) ($batch['size'][$i] ?? 0),
                ];
            }
            continue;
        }

        if (($batch['name'] ?? '') === '' && ($batch['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            continue;
        }

        $collected[] = [
            'name' => (string) ($batch['name'] ?? 'file'),
            'tmp_name' => (string) ($batch['tmp_name'] ?? ''),
            'error' => (int) ($batch['error'] ?? UPLOAD_ERR_NO_FILE),
            'size' => (int) ($batch['size'] ?? 0),
        ];
    }

    return $collected;
}

function detectUploadedMedia(string $tmpPath, string $originalName): ?array
{
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $mime = '';

    if (is_file($tmpPath)) {
        $imageInfo = @getimagesize($tmpPath);
        if ($imageInfo !== false) {
            $mime = $imageInfo['mime'] ?? '';
            $outExt = match ($mime) {
                'image/jpeg' => 'jpg',
                'image/png' => 'png',
                'image/webp' => 'webp',
                'image/gif' => 'gif',
                'image/bmp' => 'bmp',
                'image/avif' => 'avif',
                default => in_array($ext, ['jpg', 'jpeg', 'jfif'], true) ? 'jpg' : ($ext ?: 'jpg'),
            };
            return ['type' => 'image', 'ext' => $outExt === 'jpeg' ? 'jpg' : $outExt];
        }

        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo !== false) {
                $mime = finfo_file($finfo, $tmpPath) ?: '';
            }
        }
    }

    $imageExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif', 'jfif'];
    $videoExt = ['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv'];

    if (str_starts_with($mime, 'image/') || in_array($ext, $imageExt, true)) {
        $outExt = in_array($ext, ['jpg', 'jpeg', 'jfif'], true) ? 'jpg' : ($ext ?: 'jpg');
        return ['type' => 'image', 'ext' => $outExt];
    }

    if (str_starts_with($mime, 'video/') || in_array($ext, $videoExt, true)) {
        return ['type' => 'video', 'ext' => in_array($ext, ['webm', 'mov', 'm4v', 'avi', 'mkv'], true) ? $ext : 'mp4'];
    }

    return null;
}

function ensureMediaDirs(): void
{
    foreach ([IMAGES_DIR, VIDEOS_DIR] as $dir) {
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
    }
}

function nextMediaNumber(string $dir, string $slug): int
{
    $existing = glob($dir . '/' . $slug . '-*') ?: [];
    return count($existing) + 1;
}

function exceedsUploadLimit(int $size, int $limit): bool
{
    return $limit > 0 && $size > $limit;
}
