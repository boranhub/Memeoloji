(() => {
'use strict';
const BASE = String(window.API_BASE || '').replace(/\/+$/, '');
const imgUrl = p => p && p.startsWith('/img/') ? BASE + p : p;
const ST = {
  yaygin:  { t: 'Yaygın',  c: 'var(--blue)' },
  bulundu: { t: 'Bulundu', c: 'var(--green)' },
  kayip:   { t: 'Kayıp',   c: 'var(--orange)' }
};
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const safeUrl = u => /^https?:\/\//i.test(u) ? u : null;
const art = t => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `linear-gradient(145deg,hsl(${h % 360} 75% 62%),hsl(${(h + 50) % 360} 70% 45%))`; };
const ICON = {
  search: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l4 4"/></svg>',
  home: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="13" r="9"/><path d="M16.5 9.5l-2 5-5 2 2-5z"/></svg>',
  user: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="13" cy="9" r="4.5"/><path d="M4.5 22c1-4.5 4-6.5 8.5-6.5s7.5 2 8.5 6.5"/></svg>',
  plus: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2L2 10l8 8"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s-8-4.9-8-11a4.6 4.6 0 018-3 4.6 4.6 0 018 3c0 6.1-8 11-8 11z"/></svg>'
};

/* ---------- sunucu bağlantısı ---------- */
const TK = 'memeoloji:token';
let token = localStorage.getItem(TK), me = null, memes = [];
const ui = { tab: 'home', q: '', f: 'all' };
async function api(path, o = {}) {
  let r;
  try {
    r = await fetch(BASE + '/api' + path, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  } catch { throw new Error('Sunucuya ulaşılamadı. İnternetini kontrol et.'); }
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) { if (r.status === 401 && token && !o.quiet) logout(true); throw new Error(j.error || 'Bir hata oluştu.'); }
  return j;
}
function logout(expired) {
  if (token && !expired) api('/logout', { method: 'POST', quiet: true }).catch(() => {});
  token = null; me = null; memes = []; localStorage.removeItem(TK);
  document.querySelectorAll('.page,.sheet').forEach(e => e.remove());
  ui.tab = 'home'; renderAuth(); if (expired) toast('Oturum süresi doldu, tekrar giriş yap');
}
async function sync(silent) {
  try { memes = (await api('/memes')).memes; if (me && $('#s-home')) refresh(); } catch (e) { if (!silent) toast(e.message); }
}
setInterval(() => { if (me && !document.hidden && !document.querySelector('.sheet')) sync(true); }, 30000);
document.addEventListener('visibilitychange', () => { if (me && !document.hidden) sync(true); });

/* ---------- yardımcılar ---------- */
let toastT;
const toast = t => { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2200); };
const thumb = (m, cls = 'thumb') => m.image
  ? `<img class="${cls}" src="${esc(imgUrl(m.image))}" alt="">`
  : `<div class="${cls}" style="background:${art(m.title)}">${esc(m.title.replace(/^Örnek: /, '').charAt(0).toUpperCase())}</div>`;
const pill = s => `<span class="pill" style="--c:${ST[s].c}"><i></i>${ST[s].t}</span>`;
const seg = (opts, cur) => `<div class="seg" style="--n:${opts.length};--i:${Math.max(0, opts.findIndex(o => o[0] === cur))}"><div class="knob"></div>${opts.map(o => `<button type="button" data-v="${o[0]}" class="${o[0] === cur ? 'on' : ''}">${o[1]}</button>`).join('')}</div>`;
const bindSeg = (root, cb) => root.querySelectorAll('.seg').forEach(sg => sg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  sg.style.setProperty('--i', [...sg.querySelectorAll('button')].indexOf(b));
  cb(b.dataset.v, sg);
}));

/* ---------- giriş ---------- */
function renderAuth() {
  let mode = 'login';
  const app = $('#app');
  app.innerHTML = `<div class="screen" style="padding:0"><div class="auth">
    <div class="logo">🧬</div><h1>Memeoloji</h1>
    <p class="sub">Memelerin kaynağını, hikâyesini ve durumunu toplulukla birlikte kayda geçir.</p>
    ${seg([['login', 'Giriş yap'], ['reg', 'Hesap aç']], 'login')}
    <label class="field" id="fu"><input id="u" placeholder="Kullanıcı adı" autocomplete="username" maxlength="20"></label>
    <label class="field" id="fp"><input id="p" type="password" placeholder="Şifre" autocomplete="current-password" maxlength="100"></label>
    <div class="msg" id="msg"></div>
    <button class="btn" id="go">Giriş yap</button></div></div>`;
  bindSeg(app, v => { mode = v; $('#go').textContent = v === 'login' ? 'Giriş yap' : 'Hesap aç'; $('#msg').textContent = ''; });
  const fail = (t, f) => { $('#msg').textContent = t; const el = $(f); el.classList.remove('err'); void el.offsetWidth; el.classList.add('err'); };
  let busy = false;
  const go = async () => {
    if (busy) return;
    const name = $('#u').value.trim(), pw = $('#p').value;
    if (name.length < 3) return fail('Kullanıcı adı en az 3 karakter olmalı.', '#fu');
    if (pw.length < 6) return fail('Şifre en az 6 karakter olmalı.', '#fp');
    busy = true; const b = $('#go'); b.textContent = 'Bekle…'; b.style.opacity = .6;
    try {
      const r = await api(mode === 'reg' ? '/register' : '/login', { method: 'POST', body: { name, password: pw }, quiet: true });
      token = r.token; me = r.user; localStorage.setItem(TK, token);
      await sync(true); renderApp(); toast(`Hoş geldin, ${me}`);
    } catch (e) { fail(e.message, mode === 'reg' ? '#fu' : '#fp'); busy = false; b.style.opacity = 1; b.textContent = mode === 'login' ? 'Giriş yap' : 'Hesap aç'; }
  };
  $('#go').onclick = go;
  app.onkeydown = e => { if (e.key === 'Enter') go(); };
}

/* ---------- ana uygulama ---------- */
function renderApp() {
  $('#app').innerHTML = `
    <div class="navbar" id="nav"><span id="navt"></span></div>
    <div class="screen" id="s-home"></div>
    <div class="screen" id="s-me" hidden></div>
    <nav class="tabbar">
      <button class="tab" data-t="home">${ICON.home}Keşfet</button>
      <button class="tab add" data-t="add"><span class="plus">${ICON.plus}</span>Ekle</button>
      <button class="tab" data-t="me">${ICON.user}Profil</button>
    </nav><div class="dim" id="dim"></div>`;
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => b.dataset.t === 'add' ? openSheet() : setTab(b.dataset.t));
  document.querySelectorAll('.screen').forEach(s => s.addEventListener('scroll', () => $('#nav').classList.toggle('on', s.scrollTop > 44)));
  setTab(ui.tab === 'me' ? 'me' : 'home');
}
function setTab(t) {
  ui.tab = t;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $('#s-home').hidden = t !== 'home'; $('#s-me').hidden = t !== 'me';
  $('#navt').textContent = t === 'home' ? 'Keşfet' : 'Profil';
  $('#nav').classList.remove('on');
  t === 'home' ? renderHome() : renderMe();
}
const match = m => {
  if (ui.f !== 'all' && m.status !== ui.f) return false;
  const q = ui.q.trim().toLowerCase();
  return !q || [m.title, m.story, m.released, (m.tags || []).join(' ')].join(' ').toLowerCase().includes(q);
};
function rowHtml(m, i) {
  return `<button class="row in-item" style="animation-delay:${Math.min(i, 8) * 45}ms" data-id="${m.id}">${thumb(m)}
    <div class="info"><h3>${esc(m.title)}</h3><p>${esc(m.released || 'Tarih belirtilmemiş')}</p>
    <div class="meta">${pill(m.status)}<span class="likes">♥ ${m.likes.length}</span></div></div>${ICON.chev}</button>`;
}
function renderHome() {
  const el = $('#s-home');
  const first = !el.dataset.ready;
  if (first) {
    el.dataset.ready = 1;
    el.innerHTML = `<h1 class="large">Keşfet</h1>
      <label class="search">${ICON.search}<input id="q" type="search" placeholder="Meme, etiket veya hikâye ara"></label>
      <div class="chips">${[['all', 'Tümü'], ['yaygin', 'Yaygın'], ['bulundu', 'Bulundu'], ['kayip', 'Kayıp']].map(c => `<button class="chip ${ui.f === c[0] ? 'on' : ''}" data-f="${c[0]}">${c[1]}</button>`).join('')}</div>
      <div id="list"></div>`;
    $('#q', el).oninput = e => { ui.q = e.target.value; fillList(); };
    el.querySelectorAll('.chip').forEach(c => c.onclick = () => { ui.f = c.dataset.f; el.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); fillList(); });
  }
  fillList();
}
function fillList() {
  const list = memes.filter(match).sort((a, b) => b.created - a.created);
  $('#list').innerHTML = list.length
    ? `<div class="list">${list.map(rowHtml).join('')}</div>`
    : memes.length ? `<div class="empty"><b>Sonuç yok</b>Aramayı veya filtreyi değiştir.</div>` : `<div class="empty"><b>Henüz meme eklenmemiş</b>Ortadaki + düğmesiyle ilk kaydı sen ekle.</div>`;
  $('#list').querySelectorAll('.row').forEach(r => r.onclick = () => openDetail(r.dataset.id));
}
function renderMe() {
  const mine = memes.filter(m => m.author === me).sort((a, b) => b.created - a.created);
  const got = mine.reduce((n, m) => n + m.likes.length, 0);
  $('#s-me').innerHTML = `<div class="me"><div class="avatar">${esc(me.charAt(0).toUpperCase())}</div><h2>${esc(me)}</h2><p>Topluluk üyesi</p></div>
    <div class="stats"><div class="stat"><b>${mine.length}</b><span>Eklediğin meme</span></div><div class="stat"><b>${got}</b><span>Aldığın beğeni</span></div></div>
    <h2 class="sec">Katkılarım</h2>
    ${mine.length ? `<div class="list">${mine.map(rowHtml).join('')}</div>` : `<div class="empty"><b>Henüz kayıt yok</b>Ortadaki + düğmesiyle ilk memeni ekle.</div>`}
    <div class="pad" style="margin-top:24px"><button class="btn danger" id="out">Çıkış yap</button></div>`;
  $('#s-me').querySelectorAll('.row').forEach(r => r.onclick = () => openDetail(r.dataset.id));
  $('#out').onclick = () => logout();
}
const refresh = () => { ui.tab === 'home' ? fillList() : renderMe(); };

/* ---------- detay sayfası ---------- */
function openDetail(id) {
  const m = memes.find(x => x.id === id); if (!m) return;
  const pg = document.createElement('div'); pg.className = 'page';
  const own = m.author === me;
  const hero = m.image ? `style="background-image:url('${esc(imgUrl(m.image))}')"` : `style="background:${art(m.title)}"`;
  const body = () => `
    <button class="back" id="bk">${ICON.back}Keşfet</button>
    <div class="hero" ${hero}>${m.image ? '' : esc(m.title.replace(/^Örnek: /, '').charAt(0).toUpperCase())}</div>
    <div class="page-in"><h1>${esc(m.title)}</h1>${pill(m.status)}
      ${(m.tags || []).length ? `<div class="tags">${m.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="actions"><button class="like ${m.likes.includes(me) ? 'on' : ''}" id="lk">${ICON.heart}<span>${m.likes.length}</span></button></div>
      <h2>Bilgiler</h2><div class="card">
        <div class="kv"><span>Çıkış tarihi</span><b>${esc(m.released || 'Belirtilmemiş')}</b></div>
        <div class="kv"><span>Durum</span><b>${ST[m.status].t}</b></div>
        <div class="kv"><span>Ekleyen</span><b>${esc(m.author)}</b></div>
        <div class="kv"><span>Eklenme</span><b>${new Date(m.created).toLocaleDateString('tr-TR')}</b></div></div>
      <h2>Nasıl ortaya çıktı?</h2><div class="story">${esc(m.story || 'Henüz bir hikâye eklenmemiş.')}</div>
      <h2>Kaynakça</h2><div class="card">${m.sources.length ? m.sources.map((s, i) => { const u = safeUrl(s); return `<div class="src"><em>${i + 1}</em>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(s)}</a>` : `<span>${esc(s)}</span>`}</div>`; }).join('') : '<div class="kv"><span>Kaynak eklenmemiş</span></div>'}</div>
      ${own ? `<div class="actions"><button class="btn ghost" id="ed">Düzenle</button><button class="btn danger" id="dl">Sil</button></div>` : ''}
    </div>`;
  const draw = () => {
    const sc = pg.scrollTop; pg.innerHTML = body(); pg.scrollTop = sc;
    $('#bk', pg).onclick = close;
    $('#lk', pg).onclick = async () => {
      const i = m.likes.indexOf(me); i < 0 ? m.likes.push(me) : m.likes.splice(i, 1); draw(); refresh();
      try { Object.assign(m, await api('/memes/' + m.id + '/like', { method: 'POST' })); } catch (e) { toast(e.message); }
      draw(); refresh();
    };
    if (own) {
      $('#ed', pg).onclick = () => openSheet(m, () => { draw(); refresh(); });
      $('#dl', pg).onclick = async () => {
        if (!confirm('Bu kayıt silinsin mi?')) return;
        try { await api('/memes/' + m.id, { method: 'DELETE' }); memes = memes.filter(x => x.id !== m.id); close(); refresh(); toast('Silindi'); } catch (e) { toast(e.message); }
      };
    }
  };
  const close = () => { pg.classList.remove('in'); setTimeout(() => pg.remove(), 450); };
  draw(); $('#app').appendChild(pg);
  requestAnimationFrame(() => requestAnimationFrame(() => pg.classList.add('in')));
}

/* ---------- ekle / düzenle ---------- */
function resize(file) {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onerror = no;
    r.onload = () => {
      const im = new Image(); im.onerror = no;
      im.onload = () => {
        const k = Math.min(1, 720 / Math.max(im.width, im.height));
        const c = document.createElement('canvas'); c.width = im.width * k; c.height = im.height * k;
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/jpeg', .8));
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
function openSheet(edit, done) {
  const d = edit ? { ...edit, sources: [...edit.sources], tags: [...edit.tags] } : { title: '', released: '', status: 'yaygin', story: '', image: '', sources: [''], tags: [] };
  if (!d.sources.length) d.sources = [''];
  const app = $('#app'), sh = document.createElement('div'); sh.className = 'sheet';
  const srcRows = () => d.sources.map((s, i) => `<label class="field"><input data-i="${i}" class="src-in" placeholder="Kaynak adı veya bağlantı" value="${esc(s)}"></label>`).join('');
  sh.innerHTML = `<div class="grab"></div><div class="sh-head"><button id="cx">İptal</button><h2>${edit ? 'Kaydı düzenle' : 'Yeni meme'}</h2><button id="sv">Kaydet</button></div>
    <div class="sh-body">
      <label class="upload ${d.image ? 'has' : ''}" id="up" ${d.image ? `style="background-image:url('${esc(imgUrl(d.image))}')"` : ''}>Görsel ekle (isteğe bağlı)<input type="file" accept="image/*"></label>
      <span class="lbl">Meme adı</span><label class="field"><input id="f-t" maxlength="60" placeholder="Örn. Rickroll" value="${esc(d.title)}"></label>
      <span class="lbl">Çıkış tarihi</span><label class="field"><input id="f-r" maxlength="40" placeholder="Örn. 2010 veya Mart 2012" value="${esc(d.released)}"></label>
      <span class="lbl">Durum</span>${seg([['yaygin', 'Yaygın'], ['bulundu', 'Bulundu'], ['kayip', 'Kayıp']], d.status)}
      <span class="lbl">Nasıl ortaya çıktı?</span><label class="field"><textarea id="f-s" placeholder="Arka plan, ilk paylaşım, yayılma süreci…">${esc(d.story)}</textarea></label>
      <span class="lbl">Kaynakça</span><div id="srcs">${srcRows()}</div><button class="addsrc" id="as">+ Kaynak ekle</button>
      <span class="lbl">Etiketler (virgülle ayır)</span><label class="field"><input id="f-g" placeholder="müzik, hayvan, şablon" value="${esc(d.tags.join(', '))}"></label>
    </div>`;
  const dim = $('#dim'); app.appendChild(sh); dim.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => sh.classList.add('on')));
  const close = () => { sh.classList.remove('on'); dim.classList.remove('on'); setTimeout(() => sh.remove(), 500); };
  dim.onclick = close; $('#cx', sh).onclick = close;
  bindSeg(sh, v => d.status = v);
  const syncSrc = () => sh.querySelectorAll('.src-in').forEach(i => i.oninput = () => d.sources[+i.dataset.i] = i.value);
  syncSrc();
  $('#as', sh).onclick = () => { d.sources.push(''); $('#srcs', sh).innerHTML = srcRows(); syncSrc(); sh.querySelector(`[data-i="${d.sources.length - 1}"]`).focus(); };
  $('input[type=file]', sh).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { d.image = await resize(f); const up = $('#up', sh); up.style.backgroundImage = `url('${imgUrl(d.image)}')`; up.classList.add('has'); } catch { toast('Görsel okunamadı'); }
  };
  let saving = false;
  $('#sv', sh).onclick = async () => {
    if (saving) return;
    d.title = $('#f-t', sh).value.trim();
    if (!d.title) { const f = $('#f-t', sh).parentElement; f.classList.remove('err'); void f.offsetWidth; f.classList.add('err'); return toast('Meme adı gerekli'); }
    d.released = $('#f-r', sh).value.trim(); d.story = $('#f-s', sh).value.trim();
    d.tags = $('#f-g', sh).value.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean).slice(0, 8);
    d.sources = d.sources.map(x => x.trim()).filter(Boolean);
    const payload = { title: d.title, released: d.released, status: d.status, story: d.story, image: d.image, sources: d.sources, tags: d.tags };
    saving = true; $('#sv', sh).textContent = '…';
    try {
      const r = await api(edit ? '/memes/' + edit.id : '/memes', { method: edit ? 'PUT' : 'POST', body: payload });
      if (edit) Object.assign(edit, r); else memes.push(r);
      close(); toast(edit ? 'Kaydedildi' : 'Meme eklendi');
      if (edit) done && done(); else if (ui.tab !== 'home') setTab('home'); else refresh();
    } catch (e) { toast(e.message); saving = false; $('#sv', sh).textContent = 'Kaydet'; }
  };
  // aşağı sürükleyerek kapat
  let y0 = null;
  const hd = [$('.grab', sh), $('.sh-head', sh)];
  hd.forEach(h => {
    h.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; y0 = e.clientY; sh.classList.add('drag'); h.setPointerCapture(e.pointerId); });
    h.addEventListener('pointermove', e => { if (y0 !== null) sh.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
    const up = e => { if (y0 === null) return; const dy = e.clientY - y0; y0 = null; sh.classList.remove('drag'); sh.style.transform = ''; if (dy > 110) close(); };
    h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const b = $('.sh-head #cx') || $('.back'); b && b.click(); } });

(async () => {
  if (!token) return renderAuth();
  try { me = (await api('/me', { quiet: true })).user; await sync(true); renderApp(); }
  catch (e) { if (/ulaşılamadı/.test(e.message)) { $('#app').innerHTML = '<div class="empty" style="padding-top:35vh"><b>Bağlantı yok</b>Sunucuya ulaşılamadı.<br><br><button class="btn" id="rl">Tekrar dene</button></div>'; $('#rl').onclick = () => location.reload(); } else { token = null; localStorage.removeItem(TK); renderAuth(); } }
})();
})();
