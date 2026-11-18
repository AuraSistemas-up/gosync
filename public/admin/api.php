<?php
/**
 * API do painel admin do catálogo (roda na hospedagem, PHP 7.0+).
 *   ?a=ping | me | login | logout | get | save | upload | password
 * Guarda as configurações em ../data/config.json e as imagens em ../banners e ../logo.
 * Credenciais alteradas pelo painel ficam em credenciais.json (bloqueado pelo .htaccess).
 */
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const DEFAULT_USER = 'kuelhos';
// bcrypt da senha inicial (a senha em si não fica no código). Troque pelo painel: Segurança.
const DEFAULT_HASH = '$2b$10$WAQyFOLWLvabAHhjqi5cFuOWuV4gRxZNWXiLBX8exn77jkmrUwyKC';
const MAX_BANNERS = 6;
const MAX_UPLOAD = 6291456; // 6 MB

$ROOT = realpath(__DIR__ . '/..');
$DIRS = array('data' => $ROOT . '/data', 'banner' => $ROOT . '/banners', 'logo' => $ROOT . '/logo');
$CONFIG = $DIRS['data'] . '/config.json';
$CRED = __DIR__ . '/credenciais.json';
$TRIES = __DIR__ . '/tentativas.json';

function out($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail($msg, $code = 400)
{
    out(array('ok' => false, 'error' => $msg), $code);
}

function body_json()
{
    $d = json_decode(file_get_contents('php://input'), true);
    return is_array($d) ? $d : array();
}

function atomic_write($file, $content)
{
    $tmp = $file . '.tmp' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, $content, LOCK_EX) === false) {
        return false;
    }
    if (!@rename($tmp, $file)) {
        @unlink($file);
        if (!@rename($tmp, $file)) {
            @unlink($tmp);
            return false;
        }
    }
    return true;
}

// Impede execução de scripts dentro das pastas de imagens enviadas.
function protect_dir($dir)
{
    $f = $dir . '/.htaccess';
    if (is_dir($dir) && !is_file($f)) {
        @file_put_contents($f, "Options -Indexes\n<FilesMatch \"\\.(php[0-9]?|phtml|phar|cgi|pl|py)\$\">\n  <IfModule mod_authz_core.c>\n    Require all denied\n  </IfModule>\n  <IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n  </IfModule>\n</FilesMatch>\n");
    }
}

function load_credentials()
{
    global $CRED;
    if (is_file($CRED)) {
        $c = json_decode(file_get_contents($CRED), true);
        if (is_array($c) && !empty($c['user']) && !empty($c['hash'])) {
            return array($c['user'], $c['hash']);
        }
    }
    return array(DEFAULT_USER, DEFAULT_HASH);
}

function load_config()
{
    global $CONFIG;
    $c = is_file($CONFIG) ? json_decode(file_get_contents($CONFIG), true) : null;
    if (!is_array($c)) {
        $c = array();
    }
    return array(
        'name' => isset($c['name']) ? (string)$c['name'] : '',
        'primaryColor' => isset($c['primaryColor']) ? (string)$c['primaryColor'] : '',
        'logo' => isset($c['logo']) ? (string)$c['logo'] : '',
        'banners' => isset($c['banners']) && is_array($c['banners']) ? array_values($c['banners']) : array(),
        'whatsapp' => isset($c['whatsapp']) ? (string)$c['whatsapp'] : '',
        'message' => isset($c['message']) ? (string)$c['message'] : '',
        'hero' => array(
            'enabled' => isset($c['hero']['enabled']) ? (bool)$c['hero']['enabled'] : true,
            'title' => isset($c['hero']['title']) ? (string)$c['hero']['title'] : '',
            'subtitle' => isset($c['hero']['subtitle']) ? (string)$c['hero']['subtitle'] : '',
        ),
        'photoStyle' => isset($c['photoStyle']) ? (string)$c['photoStyle'] : 'spotlight',
        'footer' => array(
            'about' => isset($c['footer']['about']) ? (string)$c['footer']['about'] : '',
            'address' => isset($c['footer']['address']) ? (string)$c['footer']['address'] : '',
            'hours' => isset($c['footer']['hours']) ? (string)$c['footer']['hours'] : '',
            'phone' => isset($c['footer']['phone']) ? (string)$c['footer']['phone'] : '',
            'instagram' => isset($c['footer']['instagram']) ? (string)$c['footer']['instagram'] : '',
        ),
    );
}

// ---------- sessão ----------
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
session_name('adm_sid');
if (PHP_VERSION_ID >= 70300) {
    session_set_cookie_params(array('lifetime' => 0, 'path' => '/admin', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict'));
} else {
    session_set_cookie_params(0, '/admin; samesite=Strict', '', $https, true);
}
session_start();

$a = isset($_GET['a']) ? $_GET['a'] : '';
$method = $_SERVER['REQUEST_METHOD'];
$authed = !empty($_SESSION['auth']);

function need_auth()
{
    global $authed, $method;
    if (!$authed) {
        fail('Faça login para continuar.', 401);
    }
}

function need_csrf()
{
    global $method;
    if ($method !== 'POST') {
        fail('Método inválido.', 405);
    }
    $t = isset($_SERVER['HTTP_X_CSRF_TOKEN']) ? $_SERVER['HTTP_X_CSRF_TOKEN'] : '';
    if (empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $t)) {
        fail('Sessão expirada. Recarregue a página.', 403);
    }
}

switch ($a) {
    case 'ping':
        foreach ($DIRS as $d) {
            if (!is_dir($d)) {
                @mkdir($d, 0755, true);
            }
            protect_dir($d);
        }
        out(array(
            'ok' => true,
            'php' => PHP_VERSION,
            'gd' => function_exists('getimagesizefromstring'),
            'writable' => array(
                'data' => is_writable($DIRS['data']),
                'banners' => is_writable($DIRS['banner']),
                'logo' => is_writable($DIRS['logo']),
            ),
        ));

    case 'me':
        out(array('ok' => true, 'auth' => $authed, 'csrf' => $authed ? $_SESSION['csrf'] : null));

    case 'login':
        if ($method !== 'POST') {
            fail('Método inválido.', 405);
        }
        // Limite de tentativas por IP (8 a cada 15 minutos).
        $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '?';
        $now = time();
        $tries = is_file($TRIES) ? json_decode(file_get_contents($TRIES), true) : array();
        $tries = is_array($tries) ? $tries : array();
        $mine = array();
        foreach ($tries as $k => $list) {
            $list = array_values(array_filter((array)$list, function ($t) use ($now) {
                return $t > $now - 900;
            }));
            if ($list) {
                $tries[$k] = $list;
            } else {
                unset($tries[$k]);
            }
        }
        $mine = isset($tries[$ip]) ? $tries[$ip] : array();
        if (count($mine) >= 8) {
            fail('Muitas tentativas. Aguarde 15 minutos.', 429);
        }
        $d = body_json();
        list($user, $hash) = load_credentials();
        $okUser = isset($d['user']) && hash_equals(strtolower($user), strtolower(trim((string)$d['user'])));
        $okPass = isset($d['pass']) && password_verify((string)$d['pass'], $hash);
        if (!($okUser && $okPass)) {
            $mine[] = $now;
            $tries[$ip] = $mine;
            @file_put_contents($TRIES, json_encode($tries), LOCK_EX);
            sleep(1);
            fail('Usuário ou senha incorretos.', 401);
        }
        session_regenerate_id(true);
        $_SESSION['auth'] = true;
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        out(array('ok' => true, 'csrf' => $_SESSION['csrf']));

    case 'logout':
        $_SESSION = array();
        session_destroy();
        out(array('ok' => true));

    case 'get':
        need_auth();
        out(array('ok' => true, 'config' => load_config(), 'maxBanners' => MAX_BANNERS));

    case 'save':
        need_auth();
        need_csrf();
        $d = body_json();
        $name = trim(isset($d['name']) ? (string)$d['name'] : '');
        if (function_exists('mb_substr')) {
            $name = mb_substr($name, 0, 60, 'UTF-8');
        }
        $color = isset($d['primaryColor']) ? (string)$d['primaryColor'] : '';
        if ($color !== '' && !preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            fail('Cor inválida.');
        }
        $logo = isset($d['logo']) ? (string)$d['logo'] : '';
        if ($logo !== '' && !preg_match('#^/logo/[a-f0-9]{16}\.(jpg|png|webp|gif)$#', $logo)) {
            fail('Logo inválido.');
        }
        $banners = array();
        $list = isset($d['banners']) && is_array($d['banners']) ? $d['banners'] : array();
        foreach (array_slice($list, 0, MAX_BANNERS) as $b) {
            $img = isset($b['image']) ? (string)$b['image'] : '';
            if (!preg_match('#^/banners/[a-f0-9]{16}\.(jpg|png|webp|gif)$#', $img)) {
                fail('Banner inválido.');
            }
            $link = isset($b['link']) ? trim((string)$b['link']) : '';
            if ($link !== '' && !preg_match('#^(https?://|/)#i', $link)) {
                fail('O link do banner deve começar com http://, https:// ou /.');
            }
            $banners[] = array('image' => $img, 'link' => $link);
        }
        // WhatsApp: só dígitos com DDI (10 a 15) ou vazio.
        $wa = preg_replace('/\D/', '', isset($d['whatsapp']) ? (string)$d['whatsapp'] : '');
        if ($wa !== '' && (strlen($wa) < 10 || strlen($wa) > 15)) {
            fail('WhatsApp inválido. Use DDI + DDD + número (ex.: 5511999998888).');
        }
        $message = isset($d['message']) ? str_replace("\r", '', (string)$d['message']) : '';
        if (function_exists('mb_substr')) {
            $message = mb_substr($message, 0, 1000, 'UTF-8');
        }
        $hero = isset($d['hero']) && is_array($d['hero']) ? $d['hero'] : array();
        $heroTitle = trim(isset($hero['title']) ? (string)$hero['title'] : '');
        $heroSub = trim(isset($hero['subtitle']) ? (string)$hero['subtitle'] : '');
        if (function_exists('mb_substr')) {
            $heroTitle = mb_substr($heroTitle, 0, 60, 'UTF-8');
            $heroSub = mb_substr($heroSub, 0, 140, 'UTF-8');
        }
        $photoStyle = isset($d['photoStyle']) ? (string)$d['photoStyle'] : 'spotlight';
        if (!in_array($photoStyle, array('classic', 'spotlight', 'frame'), true)) {
            fail('Estilo de foto inválido.');
        }
        // Rodapé: textos curtos; Instagram só o @usuário (aceita colar o link completo).
        $ft = isset($d['footer']) && is_array($d['footer']) ? $d['footer'] : array();
        $clip = function ($v, $max) {
            $v = trim(str_replace("\r", '', (string)$v));
            return function_exists('mb_substr') ? mb_substr($v, 0, $max, 'UTF-8') : substr($v, 0, $max);
        };
        $ig = trim(isset($ft['instagram']) ? (string)$ft['instagram'] : '');
        $ig = preg_replace('#^https?://(www\.)?instagram\.com/#i', '', $ig);
        $ig = ltrim(preg_replace('#[/?].*$#', '', $ig), '@');
        if ($ig !== '' && !preg_match('/^[A-Za-z0-9._]{1,30}$/', $ig)) {
            fail('Instagram inválido. Use só o @usuário (ex.: kuelhos_sapatos).');
        }
        $footer = array(
            'about' => $clip(isset($ft['about']) ? $ft['about'] : '', 300),
            'address' => $clip(isset($ft['address']) ? $ft['address'] : '', 200),
            'hours' => $clip(isset($ft['hours']) ? $ft['hours'] : '', 200),
            'phone' => $clip(isset($ft['phone']) ? $ft['phone'] : '', 30),
            'instagram' => $ig,
        );
        $cfg = array(
            'footer' => $footer,
            'name' => $name, 'primaryColor' => $color, 'logo' => $logo, 'banners' => $banners,
            'whatsapp' => $wa, 'message' => $message,
            'hero' => array('enabled' => !empty($hero['enabled']), 'title' => $heroTitle, 'subtitle' => $heroSub),
            'photoStyle' => $photoStyle,
            'updatedAt' => gmdate('c'),
        );
        if (!is_dir($DIRS['data'])) {
            @mkdir($DIRS['data'], 0755, true);
        }
        if (!atomic_write($CONFIG, json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))) {
            fail('Não foi possível gravar a configuração (permissão na pasta data/).', 500);
        }
        // Remove imagens órfãs com mais de 1 hora (não referenciadas na configuração).
        $keep = array();
        foreach ($banners as $b) {
            $keep[basename($b['image'])] = true;
        }
        if ($logo !== '') {
            $keep[basename($logo)] = true;
        }
        foreach (array($DIRS['banner'], $DIRS['logo']) as $dir) {
            foreach (glob($dir . '/*') ?: array() as $f) {
                $bn = basename($f);
                if (is_file($f) && preg_match('/^[a-f0-9]{16}\.(jpg|png|webp|gif)$/', $bn) && empty($keep[$bn]) && filemtime($f) < time() - 3600) {
                    @unlink($f);
                }
            }
        }
        out(array('ok' => true, 'config' => load_config()));

    case 'upload':
        need_auth();
        need_csrf();
        $kind = isset($_GET['kind']) ? $_GET['kind'] : '';
        if ($kind !== 'banner' && $kind !== 'logo') {
            fail('Tipo de imagem inválido.');
        }
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            fail('Nenhum arquivo recebido.');
        }
        if (strlen($raw) > MAX_UPLOAD) {
            fail('Imagem maior que 6 MB.', 413);
        }
        $info = @getimagesizefromstring($raw);
        $types = array(IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_GIF => 'gif');
        if (defined('IMAGETYPE_WEBP')) {
            $types[IMAGETYPE_WEBP] = 'webp';
        }
        if (!$info || !isset($types[$info[2]])) {
            fail('Envie uma imagem JPG, PNG, WEBP ou GIF.');
        }
        $dir = $DIRS[$kind];
        if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
            fail('Não foi possível criar a pasta de imagens.', 500);
        }
        protect_dir($dir);
        $name = bin2hex(random_bytes(8)) . '.' . $types[$info[2]];
        if (file_put_contents($dir . '/' . $name, $raw) === false) {
            fail('Não foi possível gravar a imagem (permissão).', 500);
        }
        out(array('ok' => true, 'url' => '/' . ($kind === 'logo' ? 'logo' : 'banners') . '/' . $name));

    case 'password':
        need_auth();
        need_csrf();
        $d = body_json();
        list($user, $hash) = load_credentials();
        if (!isset($d['current']) || !password_verify((string)$d['current'], $hash)) {
            fail('Senha atual incorreta.', 401);
        }
        $next = isset($d['next']) ? (string)$d['next'] : '';
        if (strlen($next) < 8) {
            fail('A nova senha deve ter pelo menos 8 caracteres.');
        }
        $newUser = isset($d['user']) && trim((string)$d['user']) !== '' ? trim((string)$d['user']) : $user;
        $ok = atomic_write($CRED, json_encode(array('user' => $newUser, 'hash' => password_hash($next, PASSWORD_DEFAULT))));
        if (!$ok) {
            fail('Não foi possível gravar a nova senha (permissão na pasta admin/).', 500);
        }
        out(array('ok' => true));

    default:
        fail('Ação desconhecida.', 404);
}
