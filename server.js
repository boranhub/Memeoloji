'use strict';
// Memeoloji sunucusu - bağımlılık gerektirmez (yalnızca Node.js >= 18)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUB = path.join(__dirname, 'public');
const IMG = path.join(DATA, 'img');
fs.mkdirSync(IMG, { recursive: true });
const DBF = path.join(DATA, 'db.json');

/* ---------- veritabanı (JSON dosyası) ---------- */
let db = { users: [], memes: [], sessions: [] };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DBF, 'utf8')) }; } catch {}
db.sessions = db.sessions.filter(s => s.exp > Date.now());
let timer = null;
const flush = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = DBF + '.tmp';
    fs.writeFile(tmp, JSON.stringify(db), e => { if (!e) fs.rename(tmp, DBF, () => {}); });
  }, 150);
};
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

/* ---------- yardımcılar ---------- */
const STATUS = ['yaygin', 'bulundu', 'kayip'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
const HEAD = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
};
const send = (res, code, obj) => { res.writeHead(code, { ...HEAD, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const fail = (res, code, msg) => send(res, code, { error: msg });
const body = (req, max = 3e6) => new Promise((ok, no) => {
  let n = 0; const c = [];
  req.on('data', d => { n += d.length; if (n > max) { no(Object.assign(new Error('Veri çok büyük'), { code: 413 })); req.destroy(); } else c.push(d); });
  req.on('end', () => { try { ok(JSON.parse(Buffer.concat(c).toString() || '{}')); } catch { no(Object.assign(new Error('Geçersiz istek'), { code: 400 })); } });
});
const hits = new Map();
const limited = (ip, max = 12, win = 10 * 60 * 1000) => {
  const now = Date.now(); let h = hits.get(ip);
  if (!h || h.r < now) h = { n: 0, r: now + win };
  h.n++; hits.set(ip, h); return h.n > max;
};
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v.r < n) hits.delete(k); }, 60000).unref();
const userOf = req => {
  const m = /^Bearer (\w{20,})$/.exec(req.headers.authorization || ''); if (!m) return null;
  const s = db.sessions.find(x => x.h === sha(m[1]) && x.exp > Date.now());
  return s ? db.users.find(u => u.name === s.user) || null : null;
};
const pub = m => ({ id: m.id, title: m.title, released: m.released, status: m.status, story: m.story, image: m.image, sources: m.sources, tags: m.tags, author: m.author, created: m.created, likes: m.likes });
const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const rmImg = p => { if (p && /^\/img\/[a-z0-9-]+\.jpg$/.test(p)) fs.unlink(path.join(IMG, path.basename(p)), () => {}); };
function saveImage(dataUrl, id) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw Object.assign(new Error('Görsel biçimi geçersiz'), { code: 400 });
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 1.5e6 || buf[0] !== 0xff || buf[1] !== 0xd8) throw Object.assign(new Error('Görsel geçersiz veya çok büyük'), { code: 400 });
  const name = `${id}-${Date.now().toString(36)}.jpg`;
  fs.writeFileSync(path.join(IMG, name), buf);
  return '/img/' + name;
}
function clean(b, prev) {
  const title = str(b.title, 60);
  if (!title) throw Object.assign(new Error('Meme adı gerekli'), { code: 400 });
  const arr = (a, n, l) => (Array.isArray(a) ? a : []).map(x => str(x, l)).filter(Boolean).slice(0, n);
  return {
    title, released: str(b.released, 40), story: str(b.story, 5000),
    status: STATUS.includes(b.status) ? b.status : 'yaygin',
    sources: arr(b.sources, 10, 300), tags: arr(b.tags, 8, 30).map(t => t.replace(/^#/, ''))
  };
}
function applyImage(m, v) {
  if (typeof v !== 'string') return;
  if (v.startsWith('data:image/')) { const old = m.image; m.image = saveImage(v, m.id); rmImg(old); }
  else if (v === '' && m.image) { rmImg(m.image); m.image = ''; }
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const route = req.method + ' ' + url.pathname;

  if (route === 'POST /api/register' || route === 'POST /api/login') {
    if (limited(ip)) return fail(res, 429, 'Çok fazla deneme. Biraz bekleyip tekrar dene.');
    const b = await body(req, 5000);
    const name = str(b.name, 20), pw = typeof b.password === 'string' ? b.password : '';
    if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(name)) return fail(res, 400, 'Kullanıcı adı 3-20 karakter olmalı (harf, rakam, _ . -).');
    if (pw.length < 6 || pw.length > 100) return fail(res, 400, 'Şifre en az 6 karakter olmalı.');
    let user = db.users.find(u => u.name.toLowerCase() === name.toLowerCase());
    if (route.endsWith('register')) {
      if (user) return fail(res, 409, 'Bu kullanıcı adı alınmış.');
      const salt = crypto.randomBytes(16).toString('hex');
      user = { name, salt, hash: (await scrypt(pw, salt, 64)).toString('hex'), joined: Date.now() };
      db.users.push(user);
    } else {
      const h = user ? (await scrypt(pw, user.salt, 64)) : Buffer.alloc(64);
      if (!user || !crypto.timingSafeEqual(h, Buffer.from(user.hash, 'hex'))) return fail(res, 401, 'Kullanıcı adı veya şifre hatalı.');
    }
    const token = crypto.randomBytes(32).toString('hex');
    db.sessions.push({ h: sha(token), user: user.name, exp: Date.now() + 30 * 864e5 });
    flush();
    return send(res, 200, { token, user: user.name });
  }

  const me = userOf(req);
  if (!me) return fail(res, 401, 'Oturum geçersiz. Tekrar giriş yap.');

  if (route === 'GET /api/me') return send(res, 200, { user: me.name });
  if (route === 'POST /api/logout') {
    const t = req.headers.authorization.slice(7);
    db.sessions = db.sessions.filter(s => s.h !== sha(t)); flush();
    return send(res, 200, { ok: true });
  }
  if (route === 'GET /api/memes') return send(res, 200, { memes: db.memes.map(pub) });
  if (route === 'POST /api/memes') {
    if (limited('w' + me.name, 40, 60 * 60 * 1000)) return fail(res, 429, 'Saatlik ekleme sınırına ulaştın.');
    const b = await body(req);
    const m = { id: crypto.randomBytes(5).toString('hex'), ...clean(b), image: '', author: me.name, created: Date.now(), likes: [] };
    applyImage(m, b.image); db.memes.push(m); flush();
    return send(res, 201, pub(m));
  }
  const mm = /^\/api\/memes\/([a-f0-9]+)(\/like)?$/.exec(url.pathname);
  if (mm) {
    const m = db.memes.find(x => x.id === mm[1]);
    if (!m) return fail(res, 404, 'Kayıt bulunamadı.');
    if (mm[2] && req.method === 'POST') {
      const i = m.likes.indexOf(me.name); i < 0 ? m.likes.push(me.name) : m.likes.splice(i, 1); flush();
      return send(res, 200, pub(m));
    }
    if (!mm[2] && (req.method === 'PUT' || req.method === 'DELETE')) {
      if (m.author !== me.name) return fail(res, 403, 'Bu kaydı yalnızca ekleyen kişi değiştirebilir.');
      if (req.method === 'DELETE') { rmImg(m.image); db.memes = db.memes.filter(x => x !== m); flush(); return send(res, 200, { ok: true }); }
      const b = await body(req); Object.assign(m, clean(b)); applyImage(m, b.image); flush();
      return send(res, 200, pub(m));
    }
  }
  fail(res, 404, 'Bulunamadı.');
}

/* ---------- statik dosyalar ---------- */
function serve(req, res, url) {
  let file;
  if (url.pathname.startsWith('/img/')) {
    const n = path.basename(url.pathname);
    if (!/^[a-z0-9-]+\.jpg$/.test(n)) { res.writeHead(404, HEAD); return res.end(); }
    file = path.join(IMG, n);
  } else {
    let p; try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400, HEAD); return res.end(); }
    file = path.join(PUB, p === '/' ? 'index.html' : p);
    if (!file.startsWith(PUB + path.sep)) { res.writeHead(403, HEAD); return res.end(); }
  }
  fs.readFile(file, (e, d) => {
    if (e) { res.writeHead(404, HEAD); return res.end('Bulunamadı'); }
    const ext = path.extname(file);
    res.writeHead(200, { ...HEAD, 'Content-Type': ext === '.jpg' ? 'image/jpeg' : TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.jpg' ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(d);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, HEAD); res.end(); }
    else if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serve(req, res, url);
    else { res.writeHead(405, HEAD); res.end(); }
  } catch (e) {
    if (!res.headersSent) fail(res, e.code === 413 || e.code === 400 ? e.code : 500, e.code === 413 || e.code === 400 ? e.message : 'Sunucu hatası');
    if (!e.code) console.error(e);
  }
}).listen(PORT, () => console.log(`Memeoloji çalışıyor: http://localhost:${PORT}`));
process.on('SIGTERM', () => { try { fs.writeFileSync(DBF, JSON.stringify(db)); } catch {} process.exit(0); });
