const GAS_URL  = 'https://script.google.com/macros/s/AKfycbzqiRxH0TAWTERknWymL7vOIq6xmnj4HnxNo_HDPKHXq2rwXORVuOUNK2CGwMLQFVyT/exec';
const ADMIN_PW = 'okojin2026';
const LS_KEY   = 'okojin_ws2026';
let gasData     = [];
let presentList  = [];
let presentIndex = 0;
let gasPreloadPromise = null;

// ページ読込直後にバックグラウンドで取得しておき、「前回読込」を即時化する
function preloadGAS() {
  if (!gasPreloadPromise) gasPreloadPromise = fetchFromGAS();
  return gasPreloadPromise;
}

// ── 共通のクラス・出席番号・氏名（全タブで共有） ─────────────
const IDENTITY_KEY = 'okojin_ws2026_identity';

function saveIdentity() {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({
      cls: document.getElementById('my-class').value,
      num: document.getElementById('my-num').value
    }));
  } catch (e) {}
}

function restoreIdentity() {
  try {
    const saved = JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null');
    if (saved) {
      document.getElementById('my-class').value = saved.cls || '';
      document.getElementById('my-num').value = saved.num || '';
    }
  } catch (e) {}
  onIdentityChange();
}

// クラス・出席番号を選んだ瞬間に、既存の回答データから氏名を自動表示する
// （手入力させず、なりすまし・誤入力を防ぐ。まだ回答がない＝初回提出の場合だけ手入力できる）
async function onIdentityChange() {
  saveIdentity();
  const cls = document.getElementById('my-class').value.trim();
  const num = document.getElementById('my-num').value.trim();
  const nameEl = document.getElementById('my-name');
  const statusEl = document.getElementById('my-name-status');

  if (!cls || !num) {
    nameEl.value = '';
    nameEl.readOnly = false;
    statusEl.textContent = '';
    return;
  }

  statusEl.textContent = '検索中…';
  const records = await preloadGAS();
  const rec = records.find(r => norm(r.cls) === norm(cls) && norm(r.num) === norm(num));
  if (rec && rec.name) {
    nameEl.value = rec.name;
    nameEl.readOnly = true;
    statusEl.textContent = '';
  } else {
    nameEl.value = '';
    nameEl.readOnly = false;
    statusEl.textContent = '初めての提出ですね。氏名を入力してください。';
  }
}

// ── タブ切替 ────────────────────────────────────────────
function showTab(t, btn) {
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('view-' + t).classList.add('active');
  if (t === 'gallery') loadGallery();
  if (t === 'schedule') loadSchedule();
  if (t === 'meetings') loadMeetings();
  if (t === 'presentation') loadPresentations();
  if (t === 'admin') {
    document.getElementById('admin-lock').style.display = 'block';
    document.getElementById('admin-content').style.display = 'none';
    document.getElementById('pw-input').value = '';
    document.getElementById('pw-err').style.display = 'none';
  }
}

// ── 管理タブ切替 ────────────────────────────────────────
function showAdminTab(t, btn) {
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('admin-list').style.display     = t === 'list'     ? '' : 'none';
  document.getElementById('admin-analysis').style.display = t === 'analysis' ? '' : 'none';
  document.getElementById('admin-dream').style.display    = t === 'dream'    ? '' : 'none';
  document.getElementById('admin-advice').style.display   = t === 'advice'   ? '' : 'none';
  document.getElementById('admin-check').style.display    = t === 'check'    ? '' : 'none';
  if (t === 'analysis') runAnalysis();
  if (t === 'dream')    runDreamAnalysis();
  if (t === 'advice')   runAdviceAnalysis();
}

// ── 字数カウント ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('f-future').addEventListener('input', function () {
    const n = this.value.length;
    const el = document.getElementById('char-count');
    el.textContent = n + '字';
    el.className = 'char-count' + (n >= 100 && n <= 200 ? ' ok' : n > 200 ? ' over' : '');
  });
  preloadGAS();
  preloadSchedule();
  restoreScheduleGroup();
  restoreIdentity();
});

// ── 前回読込：画面内メッセージ表示 ───────────────────────
function showLookupMsg(type, text) {
  const successEl = document.getElementById('lookup-msg-success');
  const errorEl   = document.getElementById('lookup-msg-error');
  successEl.style.display = 'none';
  errorEl.style.display   = 'none';
  const el = type === 'success' ? successEl : errorEl;
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(showLookupMsg._t);
  showLookupMsg._t = setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// ── ローカルストレージ ───────────────────────────────────
function loadLocal() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function saveLocal(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); }
function toHankaku(el) {
  el.value = el.value.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '');
}
function makeId(c, n) { return c + '-' + n; }
function norm(s) { return String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).trim(); }

// ── GASからデータ取得（JSONP） ──────────────────────────
function fetchFromGASOnce(timeoutMs) {
  return new Promise(function (resolve) {
    var cbName = 'cb' + Date.now() + Math.floor(Math.random() * 100000);
    var done = false;
    function cleanup() {
      try { delete window[cbName]; } catch (e) {}
      var el = document.getElementById('jsonp-' + cbName);
      if (el) el.parentNode.removeChild(el);
    }
    window[cbName] = function (data) {
      if (done) return;
      done = true;
      cleanup();
      resolve(Array.isArray(data) ? data : []);
    };
    var s = document.createElement('script');
    s.id = 'jsonp-' + cbName;
    s.src = GAS_URL + '?callback=' + cbName + '&_=' + Date.now();
    s.onerror = function () { if (!done) { done = true; cleanup(); resolve(null); } };
    document.body.appendChild(s);
    setTimeout(function () { if (!done) { done = true; cleanup(); resolve(null); } }, timeoutMs);
  });
}

async function fetchFromGAS() {
  // GAS側の応答が混雑時に遅れることがあるため、タイムアウト時は1回だけ再試行する
  const first = await fetchFromGASOnce(20000);
  if (first !== null) return first;
  const retry = await fetchFromGASOnce(20000);
  return retry !== null ? retry : [];
}

// ── GAS汎用JSONPリクエスト（配列以外のレスポンスも扱える） ──
function gasJsonpGetOnce(params, timeoutMs) {
  return new Promise(function (resolve) {
    var cbName = 'cb' + Date.now() + Math.floor(Math.random() * 100000);
    var done = false;
    function cleanup() {
      try { delete window[cbName]; } catch (e) {}
      var el = document.getElementById('jsonp-' + cbName);
      if (el) el.parentNode.removeChild(el);
    }
    window[cbName] = function (data) {
      if (done) return;
      done = true;
      cleanup();
      resolve(data);
    };
    var qs = new URLSearchParams(params);
    qs.set('callback', cbName);
    qs.set('_', Date.now());
    var s = document.createElement('script');
    s.id = 'jsonp-' + cbName;
    s.src = GAS_URL + '?' + qs.toString();
    s.onerror = function () { if (!done) { done = true; cleanup(); resolve(null); } };
    document.body.appendChild(s);
    setTimeout(function () { if (!done) { done = true; cleanup(); resolve(null); } }, timeoutMs);
  });
}

async function gasJsonpGet(params) {
  const first = await gasJsonpGetOnce(params, 20000);
  if (first !== null) return first;
  return gasJsonpGetOnce(params, 20000);
}

// ── 梅澤先生との日程調整 ───────────────────────────────────
let lastScheduleData = [];
let schedulePreloadPromise = null; // ページ読込直後のバックグラウンド先読み（初回のみ使用）
let scheduleLoadedOnce = false;
const SCH_GROUP_KEY = 'okojin_ws2026_sch_group';

function preloadSchedule() {
  if (!schedulePreloadPromise) schedulePreloadPromise = gasJsonpGet({ action: 'schedule' });
  return schedulePreloadPromise;
}

// 選んだグループをブラウザに記憶し、次回以降タブを開いた時に自動選択する
// （選び直さないと予約済みの「会議に参加する」ボタンが出てこないため）
function restoreScheduleGroup() {
  try {
    const saved = localStorage.getItem(SCH_GROUP_KEY);
    if (saved) document.getElementById('sch-group').value = saved;
  } catch (e) {}
}

function onScheduleGroupChange() {
  const el = document.getElementById('sch-group');
  try { localStorage.setItem(SCH_GROUP_KEY, el.value); } catch (e) {}
  renderScheduleList(lastScheduleData);
}

async function loadSchedule() {
  document.getElementById('schedule-loading').style.display = 'block';
  document.getElementById('schedule-list').innerHTML = '';
  // 初回はページ読込時に先読みしておいたデータを使い、以降は毎回最新を取得する
  const data = scheduleLoadedOnce ? await gasJsonpGet({ action: 'schedule' }) : await preloadSchedule();
  scheduleLoadedOnce = true;
  document.getElementById('schedule-loading').style.display = 'none';
  lastScheduleData = Array.isArray(data) ? data : [];
  renderScheduleList(lastScheduleData);
}

function renderScheduleList(slots) {
  const myGroup = document.getElementById('sch-group').value;
  const container = document.getElementById('schedule-list');
  container.innerHTML = '';
  slots.forEach(slot => {
    const isMine  = !!slot.group && slot.group === myGroup;
    const isTaken = !!slot.group && slot.group !== myGroup;
    const row = document.createElement('div');
    row.className = 'schedule-row' + (isMine ? ' mine' : '') + (isTaken ? ' taken' : '');

    let statusText = '空き';
    if (isMine)  statusText = `あなたのグループ（${slot.group}）が予約済み`;
    if (isTaken) statusText = `${slot.group}グループが予約済み`;

    let actionHtml = '';
    if (!slot.group) {
      actionHtml = `<button class="schedule-btn schedule-btn-entry" onclick="bookScheduleSlot('${slot.datetime}', this)">会議に申し込む</button>`;
    } else if (isMine) {
      actionHtml = `<button class="clear-btn" onclick="cancelScheduleSlot('${slot.datetime}', this)">取消</button>`;
    }

    const main = document.createElement('div');
    const dt = document.createElement('div');
    dt.className = 'schedule-datetime';
    dt.textContent = slot.datetime;
    const st = document.createElement('div');
    st.className = 'schedule-status';
    st.textContent = statusText;
    main.appendChild(dt);
    main.appendChild(st);

    const actions = document.createElement('div');
    actions.className = 'schedule-row-actions';
    if (isMine) {
      const meetLink = document.createElement('a');
      meetLink.className = 'schedule-btn schedule-btn-join';
      meetLink.href = slot.meet;
      meetLink.target = '_blank';
      meetLink.rel = 'noopener';
      meetLink.textContent = '会議に参加する';
      actions.appendChild(meetLink);
    }
    if (actionHtml) actions.insertAdjacentHTML('beforeend', actionHtml);

    row.appendChild(main);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

// ── 梅澤先生とのミーティング（確定分のみ表示） ───────────────
async function loadMeetings() {
  document.getElementById('meetings-loading').style.display = 'block';
  document.getElementById('meetings-list').innerHTML = '';
  document.getElementById('meetings-empty').style.display = 'none';
  // スケジュール取得と同じエンドポイント・先読みキャッシュを共有する
  const data = scheduleLoadedOnce ? await gasJsonpGet({ action: 'schedule' }) : await preloadSchedule();
  scheduleLoadedOnce = true;
  document.getElementById('meetings-loading').style.display = 'none';
  const confirmed = (Array.isArray(data) ? data : []).filter(s => s.group);
  renderMeetingsList(confirmed);
}

function renderMeetingsList(slots) {
  const container = document.getElementById('meetings-list');
  container.innerHTML = '';
  document.getElementById('meetings-empty').style.display = slots.length ? 'none' : 'block';
  slots.forEach(slot => {
    const row = document.createElement('div');
    row.className = 'schedule-row';

    const main = document.createElement('div');
    const dt = document.createElement('div');
    dt.className = 'schedule-datetime';
    dt.textContent = slot.datetime;
    const st = document.createElement('div');
    st.className = 'schedule-status';
    st.textContent = `${slot.group}グループ`;
    main.appendChild(dt);
    main.appendChild(st);

    const actions = document.createElement('div');
    actions.className = 'schedule-row-actions';
    const meetLink = document.createElement('a');
    meetLink.className = 'schedule-btn schedule-btn-join';
    meetLink.href = slot.meet;
    meetLink.target = '_blank';
    meetLink.rel = 'noopener';
    meetLink.textContent = '会議に参加する';
    actions.appendChild(meetLink);

    row.appendChild(main);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

// ── 最終プレゼン：資料の提出・一覧 ─────────────────────────
const PRESENTATION_MAX_BYTES = 20 * 1024 * 1024; // 20MB

function showPresentationMsg(type, text) {
  const successEl = document.getElementById('p-msg-success');
  const errorEl   = document.getElementById('p-msg-error');
  successEl.style.display = 'none';
  errorEl.style.display   = 'none';
  const el = type === 'success' ? successEl : errorEl;
  if (text) el.textContent = text;
  el.style.display = 'block';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function uploadPresentation() {
  const cls  = document.getElementById('my-class').value.trim();
  const num  = document.getElementById('my-num').value.trim();
  const name = document.getElementById('my-name').value.trim();
  const fileInput = document.getElementById('p-file');
  const file = fileInput.files && fileInput.files[0];

  if (!cls || !num) { showPresentationMsg('error', '画面上部でクラス・出席番号を選択してください。'); return; }
  if (!name)        { showPresentationMsg('error', '画面上部で氏名を確認してください。'); return; }
  if (!file)        { showPresentationMsg('error', 'ファイルを選択してください。'); return; }
  if (file.size > PRESENTATION_MAX_BYTES) {
    showPresentationMsg('error', 'ファイルサイズが20MBを超えています。圧縮するか、画像を減らしてください。');
    return;
  }

  const btn = document.getElementById('p-submit-btn');
  btn.disabled = true; btn.textContent = 'アップロード中…';

  let result = null;
  try {
    const base64 = await fileToBase64(file);
    const params = new URLSearchParams();
    params.append('action', 'uploadPresentation');
    params.append('cls', cls);
    params.append('num', num);
    params.append('name', name);
    params.append('filename', file.name);
    params.append('mimeType', file.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    params.append('fileData', base64);
    // no-corsだとエラー内容が読めないため、通常のfetchで応答を確認する
    const res = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    result = await res.json();
  } catch (e) {
    console.error(e);
    btn.disabled = false; btn.textContent = '⬆ アップロードする';
    showPresentationMsg('error', 'アップロードに失敗しました。時間をおいてもう一度お試しください。');
    return;
  }

  btn.disabled = false; btn.textContent = '⬆ アップロードする';

  if (result && result.result === 'success') {
    fileInput.value = '';
    showPresentationMsg('success', 'アップロードしました。下の一覧に反映されるまで少し時間がかかることがあります。');
    setTimeout(loadPresentations, 1500);
  } else {
    showPresentationMsg('error', 'アップロードに失敗しました：' + (result && result.message ? result.message : '不明なエラー'));
  }
}

async function loadPresentations() {
  document.getElementById('presentation-loading').style.display = 'block';
  document.getElementById('presentation-list').innerHTML = '';
  document.getElementById('presentation-empty').style.display = 'none';
  const data = await gasJsonpGet({ action: 'presentations' });
  document.getElementById('presentation-loading').style.display = 'none';
  const list = Array.isArray(data) ? data : [];
  renderPresentationsList(list);
}

function renderPresentationsList(list) {
  const container = document.getElementById('presentation-list');
  container.innerHTML = '';
  document.getElementById('presentation-empty').style.display = list.length ? 'none' : 'block';
  list.forEach(item => {
    const card = document.createElement('a');
    card.className = 'presentation-card';
    card.href = item.url;
    card.target = '_blank';
    card.rel = 'noopener';

    const header = document.createElement('div');
    header.className = 'student-card-header';
    const nameEl = document.createElement('span');
    nameEl.className = 'student-card-name';
    nameEl.textContent = item.name || '';
    const idEl = document.createElement('span');
    idEl.className = 'student-card-id';
    idEl.textContent = `${item.cls}組 ${item.num}番`;
    header.appendChild(nameEl);
    header.appendChild(idEl);

    const thumb = document.createElement('div');
    thumb.className = 'presentation-thumb';
    if (item.thumbnail) {
      const img = document.createElement('img');
      img.src = item.thumbnail;
      img.alt = item.filename || '';
      thumb.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'presentation-thumb-placeholder';
      placeholder.textContent = 'PPT';
      thumb.appendChild(placeholder);
    }

    card.appendChild(header);
    card.appendChild(thumb);
    container.appendChild(card);
  });
}

function showScheduleMsg(type, text) {
  const successEl = document.getElementById('schedule-msg-success');
  const errorEl   = document.getElementById('schedule-msg-error');
  successEl.style.display = 'none';
  errorEl.style.display   = 'none';
  const el = type === 'success' ? successEl : errorEl;
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(showScheduleMsg._t);
  showScheduleMsg._t = setTimeout(() => { el.style.display = 'none'; }, 5000);
}

async function bookScheduleSlot(datetime, btn) {
  const group = document.getElementById('sch-group').value;
  if (!group) { showScheduleMsg('error', 'グループを選択してください。'); return; }
  try { localStorage.setItem(SCH_GROUP_KEY, group); } catch (e) {}
  if (btn) { btn.disabled = true; btn.textContent = '処理中…'; }
  const res = await gasJsonpGet({ action: 'scheduleBook', datetime, group });
  if (res && res.result === 'success') {
    // サーバーへの再取得はせず、手元のデータをその場で更新して即座に表示を反映する
    lastScheduleData.forEach(s => {
      if (s.group === group) s.group = '';
      if (s.datetime === datetime) s.group = group;
    });
    renderScheduleList(lastScheduleData);
    const bookedSlot = lastScheduleData.find(s => s.datetime === datetime);
    const meetUrl = bookedSlot ? bookedSlot.meet : '';
    showScheduleMsg('success', `${datetime} にエントリーしました。当日はこの画面の「会議に参加する」から参加できます（URL: ${meetUrl}）。`);
  } else if (res && res.result === 'conflict') {
    const slot = lastScheduleData.find(s => s.datetime === datetime);
    if (slot) slot.group = res.group;
    renderScheduleList(lastScheduleData);
    showScheduleMsg('error', `その枠はすでに${res.group}グループが予約しています。`);
  } else {
    if (btn) { btn.disabled = false; btn.textContent = '会議に申し込む'; }
    showScheduleMsg('error', '通信に失敗しました。時間をおいてもう一度お試しください。');
  }
}

async function cancelScheduleSlot(datetime, btn) {
  const group = document.getElementById('sch-group').value;
  if (!group) { showScheduleMsg('error', 'グループを選択してください。'); return; }
  if (btn) { btn.disabled = true; btn.textContent = '処理中…'; }
  const res = await gasJsonpGet({ action: 'scheduleCancel', datetime, group });
  if (res && res.result === 'success') {
    const slot = lastScheduleData.find(s => s.datetime === datetime);
    if (slot) slot.group = '';
    renderScheduleList(lastScheduleData);
    showScheduleMsg('success', '予約を取り消しました。');
  } else {
    if (btn) { btn.disabled = false; btn.textContent = '取消'; }
    showScheduleMsg('error', '通信に失敗しました。時間をおいてもう一度お試しください。');
  }
}

// ── 梅澤先生への問い合わせ ─────────────────────────────────
function openContactModal() {
  document.getElementById('c-msg-success').style.display = 'none';
  document.getElementById('c-msg-error').style.display = 'none';
  const cls  = document.getElementById('my-class').value.trim();
  const num  = document.getElementById('my-num').value.trim();
  const name = document.getElementById('my-name').value.trim();
  const display = document.getElementById('c-identity-display');
  display.textContent = (cls && num && name)
    ? `提出者：${cls}組 ${num}番　${name}さん`
    : '⚠ 画面上部でクラス・出席番号・氏名を選択してから送信してください。';
  document.getElementById('contact-overlay').classList.add('active');
}

function closeContactModal() {
  document.getElementById('contact-overlay').classList.remove('active');
}

function showContactMsg(type, text) {
  const successEl = document.getElementById('c-msg-success');
  const errorEl   = document.getElementById('c-msg-error');
  successEl.style.display = 'none';
  errorEl.style.display   = 'none';
  const el = type === 'success' ? successEl : errorEl;
  if (text) el.textContent = text;
  el.style.display = 'block';
}

async function submitContact() {
  const cls     = document.getElementById('my-class').value.trim();
  const num     = document.getElementById('my-num').value.trim();
  const name    = document.getElementById('my-name').value.trim();
  const email   = document.getElementById('c-email').value.trim();
  const message = document.getElementById('c-message').value.trim();

  if (!cls || !num) { showContactMsg('error', '画面上部でクラス・出席番号を選択してください。'); return; }
  if (!name)        { showContactMsg('error', '画面上部で氏名を確認してください。'); return; }
  if (!email || !email.includes('@')) { showContactMsg('error', 'メールアドレスを正しく入力してください。'); return; }
  if (!message)     { showContactMsg('error', '問い合わせ内容を入力してください。'); return; }

  const btn = document.getElementById('c-submit-btn');
  btn.disabled = true; btn.textContent = '送信中…';

  try {
    const params = new URLSearchParams();
    params.append('action', 'contact');
    params.append('cls', cls);
    params.append('num', num);
    params.append('name', name);
    params.append('email', email);
    params.append('message', message);
    await fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  } catch (e) { console.error(e); }

  btn.disabled = false; btn.textContent = '✈ 送信する';
  document.getElementById('c-message').value = '';
  showContactMsg('success');
  setTimeout(closeContactModal, 1500);
}

// ── フォーム送信 ─────────────────────────────────────────
async function submitForm() {
  const grade    = '1';
  const cls      = document.getElementById('my-class').value.trim();
  const num      = document.getElementById('my-num').value.trim();
  const name     = document.getElementById('my-name').value.trim();
  const ai1      = document.getElementById('f-ai1').value.trim();
  const ai2      = document.getElementById('f-ai2').value.trim();
  const ai3      = document.getElementById('f-ai3').value.trim();
  const future   = document.getElementById('f-future').value.trim();
  const idea = document.getElementById('f-idea').value.trim();
  const job      = document.getElementById('f-job').value.trim();
  const hansei   = document.getElementById('f-hansei').value.trim();
  const nack5    = document.getElementById('f-nack5').value.trim();
  const kizuki1  = document.getElementById('f-kizuki1').value.trim();
  const kizuki   = document.getElementById('f-kizuki').value.trim();
  const stadium  = document.getElementById('f-stadium').value.trim();

  if (!cls || !num) { alert('画面上部でクラス・出席番号を選択してください。'); return; }
  if (!name)     { alert('画面上部で氏名を確認してください。'); return; }
  if (!future)   { alert('「もしAIがさらに進化したら？」を記入してください。'); return; }
  if (!idea) { alert('アイデアを記入してください。'); return; }
  if (!stadium) { alert('スタジアム実験プラン（個人）を記入してください。'); return; }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.textContent = '送信中…';

  const now = new Date();
  const dt  = now.toLocaleDateString('ja-JP') + ' ' + now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const id  = makeId(cls, num);
  const record = { cls, num, name, ai1, ai2, ai3, future, idea, dt, job, kizuki, hansei, nack5, kizuki1, stadium };

  const local = loadLocal();
  const idx   = local.findIndex(r => r.cls === cls && r.num === num);
  if (idx >= 0) local[idx] = record; else local.push(record);
  saveLocal(local);

  try {
    const params = new URLSearchParams();
    Object.entries(record).forEach(([k, v]) => params.append(k, String(v)));
    await fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  } catch (e) { console.error(e); }

  btn.disabled = false; btn.textContent = '✈ 提出する';
  document.getElementById('msg-success').style.display = 'block';
  setTimeout(() => { document.getElementById('msg-success').style.display = 'none'; }, 5000);
}

// ── クリア ───────────────────────────────────────────────
function clearForm() {
  ['f-ai1','f-ai2','f-ai3','f-future','f-idea','f-job','f-hansei','f-nack5','f-kizuki1','f-kizuki','f-stadium']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('char-count').textContent = '0字';
  document.getElementById('char-count').className = 'char-count';
}

// ── 前回読込 ─────────────────────────────────────────────
async function lookupStudent() {
  const cls = document.getElementById('my-class').value.trim();
  const num = document.getElementById('my-num').value.trim();
  if (!cls || !num) { showLookupMsg('error', '画面上部でクラス・出席番号を選択してから「前回読込」を押してください。'); return; }

  // まずlocalStorageから検索、なければ事前取得済みのGASデータ（preloadGAS）から検索
  let rec = loadLocal().find(r => norm(r.cls) === norm(cls) && norm(r.num) === norm(num));
  if (!rec) {
    const btn = document.getElementById('lookup-btn');
    const originalLabel = btn.textContent;
    btn.disabled = true; btn.textContent = '検索中…';
    let fetched = await preloadGAS();
    rec = fetched.find(r => norm(r.cls) === norm(cls) && norm(r.num) === norm(num));
    if (!rec && fetched.length === 0) {
      // プリロードが失敗していた場合のみ、改めて取得を試みる
      fetched = await fetchFromGAS();
      rec = fetched.find(r => norm(r.cls) === norm(cls) && norm(r.num) === norm(num));
    }
    btn.disabled = false; btn.textContent = originalLabel;
    if (rec) {
      const local = loadLocal();
      const idx = local.findIndex(r => norm(r.cls) === norm(cls) && norm(r.num) === norm(num));
      if (idx >= 0) local[idx] = rec; else local.push(rec);
      saveLocal(local);
    }
  }

  if (rec) {
    document.getElementById('my-name').value   = rec.name    || '';
    document.getElementById('f-ai1').value     = rec.ai1     || '';
    document.getElementById('f-ai2').value     = rec.ai2     || '';
    document.getElementById('f-ai3').value     = rec.ai3     || '';
    document.getElementById('f-future').value  = rec.future  || '';
    document.getElementById('f-idea').value    = rec.idea    || '';
    document.getElementById('f-job').value     = rec.job     || '';
    document.getElementById('f-hansei').value  = rec.hansei  || '';
    document.getElementById('f-nack5').value   = rec.nack5   || '';
    document.getElementById('f-kizuki1').value = rec.kizuki1 || '';
    document.getElementById('f-kizuki').value  = rec.kizuki  || '';
    document.getElementById('f-stadium').value = rec.stadium || '';
    const n  = (rec.future || '').length;
    const el = document.getElementById('char-count');
    el.textContent = n + '字';
    el.className = 'char-count' + (n >= 100 && n <= 200 ? ' ok' : n > 200 ? ' over' : '');
    showLookupMsg('success', `前回の入力（${rec.name || '無記名'}さん）を読み込みました。編集後に再提出してください。`);
  } else {
    showLookupMsg('error', '入力が見つかりませんでした。新規として入力してください。');
  }
}

// ── みんなの回答 ─────────────────────────────────────────
async function loadGallery() {
  document.getElementById('gallery-loading').style.display = 'block';
  document.getElementById('gallery-grid').innerHTML = '';
  document.getElementById('gallery-empty').style.display = 'none';
  gasData = await fetchFromGAS();
  document.getElementById('gallery-loading').style.display = 'none';
  applyFilter();
}

function applyFilter() {
  const q   = (document.getElementById('gallery-search').value || '').toLowerCase();
  const cls = document.getElementById('class-filter').value;
  const classes = [...new Set(gasData.map(r => r.cls + '組').filter(Boolean))].sort((a,b) => parseInt(a)-parseInt(b));
  const sel = document.getElementById('class-filter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">全クラス</option>' + classes.map(c => `<option value="${c}"${c === cur ? ' selected' : ''}>${c}</option>`).join('');
  let filtered = gasData;
  if (cls)  filtered = filtered.filter(r => (r.cls + '組') === cls);
  if (q)    filtered = filtered.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  filtered = filtered.slice().sort((a, b) => String(a.cls).localeCompare(String(b.cls), 'ja', {numeric:true}) || String(a.num).localeCompare(String(b.num), 'ja', {numeric:true}));
  presentList = filtered;
  document.getElementById('gallery-count').textContent = filtered.length + '件';
  const grid  = document.getElementById('gallery-grid');
  const empty = document.getElementById('gallery-empty');
  if (!filtered.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  grid.innerHTML = filtered.map((r, i) => `
    <div class="student-card" onclick="openPresent(${i})">
      <div class="student-card-header">
        <div class="student-card-name">${esc(r.name)}</div>
        <div class="student-card-id">${esc(r.cls)}組 ${esc(r.num)}番</div>
      </div>
      <div class="student-card-body">
        <div class="card-section">
          <div class="card-section-label">AIが使われていると感じる場面</div>
          <div class="ai-tags">${[r.ai1, r.ai2, r.ai3].filter(Boolean).map(a => `<span class="ai-tag">${esc(a)}</span>`).join('')}</div>
        </div>
        <div class="card-section">
          <div class="card-section-label">もしAIが進化したら</div>
          <div class="card-section-text">${esc(r.future || '').replace(/\n/g, '<br>')}</div>
        </div>
        <div class="card-section">
          <div class="card-section-label">アイデア</div>
          <div class="card-section-text">${esc(r.idea || '').replace(/\n/g, '<br>')}</div>
        </div>
        ${r.kizuki1 ? `<div class="card-section">
          <div class="card-section-label">気づき（第１回授業後）</div>
          <div class="card-section-text">${esc(r.kizuki1).replace(/\n/g, '<br>')}</div>
        </div>` : ''}
        ${r.hansei ? `<div class="card-section">
          <div class="card-section-label">AIと話してみて</div>
          <div class="card-section-text">${esc(r.hansei).replace(/\n/g, '<br>')}</div>
        </div>` : ''}
        ${r.nack5 ? `<div class="card-section">
          <div class="card-section-label">NACK5ビジネスアイデア</div>
          <div class="card-section-text">${esc(r.nack5).replace(/\n/g, '<br>')}</div>
        </div>` : ''}
        ${r.kizuki ? `<div class="card-section">
          <div class="card-section-label">気づき（事前課題終了時点）</div>
          <div class="card-section-text">${esc(r.kizuki).replace(/\n/g, '<br>')}</div>
        </div>` : ''}
      </div>
    </div>`).join('');
}

// ── プレゼンモード ───────────────────────────────────────
function openPresent(i) {
  presentIndex = i;
  renderPresent();
  document.getElementById('present-overlay').classList.add('active');
}

function closePresent() {
  document.getElementById('present-overlay').classList.remove('active');
}

function navPresent(dir) {
  const next = presentIndex + dir;
  if (next < 0 || next >= presentList.length) return;
  presentIndex = next;
  renderPresent();
}

function renderPresent() {
  const r = presentList[presentIndex];
  if (!r) return;
  document.getElementById('present-name').textContent = r.name;
  document.getElementById('present-id').textContent   = `${r.cls}組 ${r.num}番`;
  document.getElementById('present-body').innerHTML = `
    <div class="present-section">
      <div class="present-label">AIが使われていると感じる場面</div>
      <div class="present-ai-tags">${[r.ai1, r.ai2, r.ai3].filter(Boolean).map(a => `<span class="present-ai-tag">${esc(a)}</span>`).join('')}</div>
    </div>
    <div class="present-section">
      <div class="present-label">もしAIが進化したら</div>
      <div class="present-text">${esc(r.future || '').replace(/\n/g, '<br>')}</div>
    </div>
    <div class="present-section">
      <div class="present-label">アイデア</div>
      <div class="present-text">${esc(r.idea || '').replace(/\n/g, '<br>')}</div>
    </div>
    ${r.kizuki1 ? `<div class="present-section">
      <div class="present-label">気づき（第１回授業後）</div>
      <div class="present-text">${esc(r.kizuki1).replace(/\n/g, '<br>')}</div>
    </div>` : ''}
    ${r.hansei ? `<div class="present-section">
      <div class="present-label">AIと話してみて</div>
      <div class="present-text">${esc(r.hansei).replace(/\n/g, '<br>')}</div>
    </div>` : ''}
    ${r.nack5 ? `<div class="present-section">
      <div class="present-label">NACK5ビジネスアイデア</div>
      <div class="present-text">${esc(r.nack5).replace(/\n/g, '<br>')}</div>
    </div>` : ''}
    ${r.kizuki ? `<div class="present-section">
      <div class="present-label">気づき（事前課題終了時点）</div>
      <div class="present-text">${esc(r.kizuki).replace(/\n/g, '<br>')}</div>
    </div>` : ''}`;
  document.getElementById('present-progress').textContent = `${presentIndex + 1} / ${presentList.length}`;
  document.getElementById('present-prev').disabled = (presentIndex === 0);
  document.getElementById('present-next').disabled = (presentIndex === presentList.length - 1);
  document.getElementById('present-card').scrollTop = 0;
}

document.addEventListener('keydown', function (e) {
  const overlay = document.getElementById('present-overlay');
  if (!overlay.classList.contains('active')) return;
  if (e.key === 'Escape')      closePresent();
  if (e.key === 'ArrowLeft')   navPresent(-1);
  if (e.key === 'ArrowRight')  navPresent(1);
});

// ── 管理者 ───────────────────────────────────────────────
function checkPw() {
  if (document.getElementById('pw-input').value === ADMIN_PW) {
    document.getElementById('admin-lock').style.display    = 'none';
    document.getElementById('admin-content').style.display = 'block';
    loadDashboard();
  } else {
    document.getElementById('pw-err').style.display = 'block';
  }
}

async function loadDashboard() {
  gasData = await fetchFromGAS();
  const today = new Date().toLocaleDateString('ja-JP');
  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="stat-num">${gasData.length}</div><div class="stat-label">提出数（合計）</div></div>
    <div class="stat"><div class="stat-num">${gasData.filter(r => String(r.dt).startsWith(today)).length}</div><div class="stat-label">本日の提出</div></div>
    <div class="stat"><div class="stat-num">${gasData.length}</div><div class="stat-label">スプレッドシート反映済</div></div>`;
  renderTable();
}

function renderTable() {
  const q        = (document.getElementById('search-box') || {}).value || '';
  const filtered = q ? gasData.filter(r => JSON.stringify(r).toLowerCase().includes(q.toLowerCase())) : gasData;
  const tbody    = document.getElementById('table-body');
  const empty    = document.getElementById('empty-state');
  if (!filtered.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = filtered.slice().reverse().map((r, i) => `
    <tr>
      <td class="col-id">${esc(r.cls || '')}組${esc(r.num || '')}番</td>
      <td class="col-name" title="${esc(r.name)}">${esc(r.name)}</td>
      <td class="col-cls">${esc(r.cls || '')}組</td>
      <td class="col-ai1" title="${esc(r.ai1 || '')}">${esc(r.ai1 || '—')}</td>
      <td class="col-q" title="${esc(r.idea || '')}">${esc((r.idea || '').substring(0, 35) + ((r.idea || '').length > 35 ? '…' : ''))}</td>
      <td class="col-dt">${esc(r.dt || '')}</td>
      <td class="col-act" style="text-align:center"><button class="expand-btn" onclick="toggleDetail(${i},this)">▾</button></td>
    </tr>
    <tr class="detail-row" id="detail-${i}">
      <td class="detail-cell" colspan="7">
        <strong>AI場面①</strong>　${esc(r.ai1 || '—')}<br>
        <strong>AI場面②</strong>　${esc(r.ai2 || '—')}<br>
        <strong>AI場面③</strong>　${esc(r.ai3 || '—')}<br><br>
        <strong>もしAIが進化したら</strong><br>${esc(r.future || '').replace(/\n/g, '<br>')}<br><br>
        <strong>アイデア</strong><br>${esc(r.idea || '').replace(/\n/g, '<br>')}<br><br>
        <strong>将来の夢・職業</strong>　${esc(r.job || '（未記入）')}<br><br>
        <strong>AIと話してみて</strong><br>${esc(r.hansei || '（未記入）').replace(/\n/g, '<br>')}<br><br>
        <strong>NACK5ビジネスアイデア</strong><br>${esc(r.nack5 || '（未記入）').replace(/\n/g, '<br>')}<br><br>
        <strong>気づき（第１回授業後）</strong><br>${esc(r.kizuki1 || '（未記入）').replace(/\n/g, '<br>')}<br><br>
        <strong>気づき（事前課題終了時点）</strong><br>${esc(r.kizuki || '（未提出）').replace(/\n/g, '<br>')}
      </td>
    </tr>`).join('');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toggleDetail(i, btn) {
  const row    = document.getElementById('detail-' + i);
  const isOpen = row.classList.contains('open');
  document.querySelectorAll('.detail-row.open').forEach(r => r.classList.remove('open'));
  document.querySelectorAll('.expand-btn').forEach(b => b.textContent = '▾');
  if (!isOpen) { row.classList.add('open'); btn.textContent = '▴'; }
}

function exportCSV() {
  if (!gasData.length) { alert('データがありません。'); return; }
  const header = ['クラス','番号','氏名','AI場面①','AI場面②','AI場面③','AIが進化したら','アイデア','将来の夢・職業','AIと話してみて','NACK5ビジネスアイデア','気づき（第１回授業後）','気づき（事前課題終了時点）','提出日時'];
  const rows   = gasData.map(r => [r.cls, r.num, r.name, r.ai1||'', r.ai2||'', r.ai3||'', r.future||'', r.idea||'', r.job||'', r.hansei||'', r.nack5||'', r.kizuki1||'', r.kizuki||'', r.dt]
    .map(v => `"${String(v).replace(/"/g, '""')}"`));
  const csv    = [header, ...rows].map(r => r.join(',')).join('\n');
  const blob   = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a      = document.createElement('a');
  a.href       = URL.createObjectURL(blob);
  a.download   = '大高人WS2026_事前課題_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── グループワーク ────────────────────────────────────────
function submitGroup() {
  const gname = document.getElementById('g-name').value.trim();
  const idea  = document.getElementById('g-idea').value.trim();
  const reason= document.getElementById('g-reason').value.trim();
  const nack5 = document.getElementById('g-nack5').value.trim();

  if (!gname || !idea) { alert('グループ名とアイデアを入力してください。'); return; }

  const dt = new Date().toLocaleString('ja-JP');
  const btn = document.getElementById('g-submit-btn');
  btn.disabled = true;
  btn.textContent = '送信中…';
  document.getElementById('g-msg-success').style.display = 'none';
  document.getElementById('g-msg-error').style.display   = 'none';

  localStorage.setItem('group_last', JSON.stringify({ gname, idea, reason, nack5 }));

  const params = new URLSearchParams({ action: 'group', gname, idea, reason, nack5, dt });
  fetch(GAS_URL, { method: 'POST', body: params })
    .then(r => r.json())
    .then(() => {
      document.getElementById('g-msg-success').style.display = 'block';
    })
    .catch(() => {
      document.getElementById('g-msg-error').style.display = 'block';
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = '✈ 提出する';
    });
}

async function loadGroup() {
  const gname = document.getElementById('g-name').value;
  if (!gname) { alert('グループ名を選択してから「前回読込」を押してください。'); return; }

  // localStorageから検索
  const saved = localStorage.getItem('group_last');
  if (saved) {
    const d = JSON.parse(saved);
    if (d.gname === gname) {
      fillGroup(d); alert('読み込みが完了しました。'); return;
    }
  }

  // GASのグループシートから取得
  const records = await new Promise(resolve => {
    const cbName = 'gcb' + Date.now();
    let done = false;
    window[cbName] = data => { done = true; resolve(Array.isArray(data) ? data : []); delete window[cbName]; };
    const s = document.createElement('script');
    s.src = GAS_URL + '?action=group&callback=' + cbName + '&_=' + Date.now();
    s.onerror = () => { if (!done) { done = true; resolve([]); } };
    document.body.appendChild(s);
    setTimeout(() => { if (!done) { done = true; resolve([]); } }, 10000);
  });

  const rec = records.find(r => r.gname === gname);
  if (rec) {
    fillGroup(rec);
    localStorage.setItem('group_last', JSON.stringify(rec));
    alert('読み込みが完了しました。');
  } else {
    alert('保存された入力内容がありません。');
  }
}

function fillGroup(d) {
  document.getElementById('g-name').value   = d.gname  || '';
  document.getElementById('g-idea').value   = d.idea   || '';
  document.getElementById('g-reason').value = d.reason || '';
  document.getElementById('g-nack5').value  = d.nack5  || '';
}

function clearGroup() {
  ['g-name','g-idea','g-reason','g-nack5'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('g-msg-success').style.display = 'none';
  document.getElementById('g-msg-error').style.display   = 'none';
}

// ── AI分析 ───────────────────────────────────────────────
const GROUP_COLORS = [
  { bg:'#E6F1FB', border:'#85B7EB', text:'#0C447C', cbg:'#B5D4F4', ct:'#0C447C' },
  { bg:'#E1F5EE', border:'#5DCAA5', text:'#085041', cbg:'#9FE1CB', ct:'#085041' },
  { bg:'#FAEEDA', border:'#EF9F27', text:'#633806', cbg:'#FAC775', ct:'#633806' },
  { bg:'#FBEAF0', border:'#ED93B1', text:'#4B1528', cbg:'#F4C0D1', ct:'#4B1528' },
  { bg:'#EEEDFE', border:'#AFA9EC', text:'#26215C', cbg:'#CECBF6', ct:'#26215C' },
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function typeText(el, text, speed) {
  for (let i = 0; i < text.length; i++) { el.textContent = text.slice(0, i + 1); await sleep(speed || 16); }
}

async function runAdviceAnalysis() {
  const btn    = document.getElementById('advice-btn');
  const status = document.getElementById('advice-status');
  const result = document.getElementById('advice-result');
  btn.disabled = true;
  result.innerHTML = '';
  status.textContent = '⏳ データを取得しています...';
  if (!gasData.length) { gasData = await fetchFromGAS(); }
  if (!gasData.length) { status.textContent = '❌ データがありません。スプレッドシートに回答が入力されているか確認してください。'; btn.disabled = false; return; }
  status.textContent = '⏳ 生徒の回答をもとに授業アドバイスを生成しています...（30秒ほどかかります）';

  try {
    const analysisResult = await new Promise(function (resolve, reject) {
      const cbName = 'advice_' + Date.now();
      const done   = { v: false };
      window[cbName] = function (data) {
        done.v = true; resolve(data);
        try { delete window[cbName]; } catch (e) {}
        const el = document.getElementById('jsonp-' + cbName);
        if (el) el.parentNode.removeChild(el);
      };
      const s  = document.createElement('script');
      s.id     = 'jsonp-' + cbName;
      s.src    = GAS_URL + '?action=analyzeAdvice&callback=' + cbName + '&_=' + Date.now();
      s.onerror = function () { if (!done.v) { done.v = true; reject(new Error('通信エラー')); } };
      document.body.appendChild(s);
      setTimeout(function () { if (!done.v) { done.v = true; reject(new Error('タイムアウト')); } }, 90000);
    });

    if (analysisResult.error) { throw new Error(analysisResult.error); }

    const text   = analysisResult.result;
    const clean  = text.replace(/```json\n?|```/g, '').trim();
    const parsed = JSON.parse(clean);

    status.textContent = '✅ 生成完了！';
    result.innerHTML = '';

    const PHASE_STYLES = [
      { bg: '#1E2761', badge: 'rgba(2,195,154,0.3)', badgeText: '#02C39A', label: 'Phase 0', title: '事前課題' },
      { bg: '#028090', badge: 'rgba(255,255,255,0.25)', badgeText: '#fff',   label: 'Phase 1', title: '座学 90分' },
      { bg: '#5a67d8', badge: 'rgba(255,255,255,0.25)', badgeText: '#fff',   label: 'Phase 2', title: 'NACK5スタジアム見学' },
      { bg: '#744210', badge: 'rgba(255,255,255,0.25)', badgeText: '#fff',   label: 'Phase 3', title: 'プレゼン 90分' },
    ];

    parsed.phases.forEach(function (phase, i) {
      const st = PHASE_STYLES[i] || PHASE_STYLES[PHASE_STYLES.length - 1];
      const card = document.createElement('div');
      card.style.cssText = 'background:#fff;border:1.5px solid #d1d9e0;border-radius:12px;overflow:hidden;margin-bottom:14px;opacity:0;transform:translateY(8px);transition:opacity .4s ease,transform .4s ease';
      card.innerHTML = `
        <div style="background:${st.bg};color:#fff;padding:12px 18px;display:flex;align-items:center;gap:10px">
          <span style="background:${st.badge};color:${st.badgeText};font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px">${st.label}</span>
          <span style="font-size:14px;font-weight:700">${esc(phase.title || st.title)}</span>
        </div>
        <div style="padding:16px 18px;font-size:12px;line-height:2;color:#374151">
          <div style="font-weight:700;color:#028090;margin-bottom:6px">▍ねらい</div>
          <p style="margin-bottom:14px">${esc(phase.goal)}</p>
          <div style="font-weight:700;color:#028090;margin-bottom:6px">▍推奨アクティビティ・進行アドバイス</div>
          <ul style="padding-left:18px;line-height:2.4;margin-bottom:14px">${phase.activities.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
          <div style="font-weight:700;color:#028090;margin-bottom:6px">▍この授業ならではのポイント（生徒の回答より）</div>
          <div style="background:#f0f4f8;border-radius:8px;padding:12px 16px;line-height:2">${esc(phase.insight)}</div>
        </div>`;
      result.appendChild(card);
      setTimeout(function () { card.style.opacity = '1'; card.style.transform = 'translateY(0)'; }, i * 120);
    });

  } catch (e) {
    console.error(e);
    status.textContent = '❌ 生成に失敗しました。もう一度お試しください。（' + e.message + ')';
  }
  btn.disabled = false;
}

async function runDreamAnalysis() {
  const btn    = document.getElementById('dream-analyze-btn');
  const status = document.getElementById('dream-analysis-status');
  const result = document.getElementById('dream-analysis-result');
  btn.disabled = true;
  result.innerHTML = '';
  status.textContent = '⏳ データを取得しています...';
  if (!gasData.length) { gasData = await fetchFromGAS(); }
  if (!gasData.length) { status.textContent = '❌ データがありません。'; btn.disabled = false; return; }
  status.textContent = '⏳ AIが将来の夢を分析しています...（30秒ほどかかります）';

  try {
    const analysisResult = await new Promise(function (resolve, reject) {
      const cbName = 'dream_' + Date.now();
      const done   = { v: false };
      window[cbName] = function (data) {
        done.v = true;
        resolve(data);
        try { delete window[cbName]; } catch (e) {}
        const el = document.getElementById('jsonp-' + cbName);
        if (el) el.parentNode.removeChild(el);
      };
      const s  = document.createElement('script');
      s.id     = 'jsonp-' + cbName;
      s.src    = GAS_URL + '?action=analyzeDream&callback=' + cbName + '&_=' + Date.now();
      s.onerror = function () { if (!done.v) { done.v = true; reject(new Error('通信エラー')); } };
      document.body.appendChild(s);
      setTimeout(function () { if (!done.v) { done.v = true; reject(new Error('タイムアウト')); } }, 60000);
    });

    if (analysisResult.error) { throw new Error(analysisResult.error); }

    const text   = analysisResult.result;
    const clean  = text.replace(/```json\n?|```/g, '').trim();
    const parsed = JSON.parse(clean);

    status.textContent = '✅ 分析完了！グループを表示しています...';

    for (let gi = 0; gi < parsed.groups.length; gi++) {
      const g   = parsed.groups[gi];
      const col = GROUP_COLORS[gi % GROUP_COLORS.length];
      const card = document.createElement('div');
      card.className = 'analysis-group';
      card.innerHTML = `
        <div class="analysis-group-header" style="background:${col.bg}">
          <span class="analysis-group-label" style="color:${col.text}">${esc(g.name)}</span>
          <span class="analysis-group-count" style="background:${col.cbg};color:${col.ct}">${g.members.length}名</span>
        </div>
        <div class="analysis-group-body">
          <div class="analysis-summary" id="dsummary-${gi}"></div>
          <div class="analysis-members">${g.members.map(m => `<span class="analysis-member">${esc(m)}</span>`).join('')}</div>
        </div>`;
      result.appendChild(card);
      await sleep(50);
      card.classList.add('visible');
      const summaryEl = document.getElementById('dsummary-' + gi);
      summaryEl.innerHTML = '<span class="typing-cursor"></span>';
      await sleep(200);
      summaryEl.textContent = '';
      await typeText(summaryEl, g.summary, 14);
      await sleep(200);
    }

    const overallCard = document.createElement('div');
    overallCard.className = 'analysis-overall';
    overallCard.innerHTML = '<div class="analysis-overall-label">全体の傾向</div><div class="analysis-overall-text" id="doverall"></div>';
    result.appendChild(overallCard);
    await sleep(100);
    overallCard.classList.add('visible');
    const overallEl = document.getElementById('doverall');
    overallEl.innerHTML = '<span class="typing-cursor"></span>';
    await sleep(200);
    overallEl.textContent = '';
    await typeText(overallEl, parsed.overall, 12);
    status.textContent = '✅ 分析完了！';

  } catch (e) {
    console.error(e);
    status.textContent = '❌ 分析に失敗しました。もう一度お試しください。（' + e.message + ')';
  }
  btn.disabled = false;
}

async function runAnalysis() {
  const btn    = document.getElementById('analyze-btn');
  const status = document.getElementById('analysis-status');
  const result = document.getElementById('analysis-result');
  btn.disabled = true;
  result.innerHTML = '';
  status.textContent = '⏳ データを取得しています...';
  if (!gasData.length) { gasData = await fetchFromGAS(); }
  if (!gasData.length) { status.textContent = '❌ データがありません。'; btn.disabled = false; return; }
  status.textContent = '⏳ AIが回答を分析しています...（30秒ほどかかります）';

  try {
    const analysisResult = await new Promise(function (resolve, reject) {
      const cbName = 'analysis_' + Date.now();
      const done   = { v: false };
      window[cbName] = function (data) {
        done.v = true;
        resolve(data);
        try { delete window[cbName]; } catch (e) {}
        const el = document.getElementById('jsonp-' + cbName);
        if (el) el.parentNode.removeChild(el);
      };
      const s  = document.createElement('script');
      s.id     = 'jsonp-' + cbName;
      s.src    = GAS_URL + '?action=analyze&callback=' + cbName + '&_=' + Date.now();
      s.onerror = function () { if (!done.v) { done.v = true; reject(new Error('通信エラー')); } };
      document.body.appendChild(s);
      setTimeout(function () { if (!done.v) { done.v = true; reject(new Error('タイムアウト')); } }, 60000);
    });

    if (analysisResult.error) { throw new Error(analysisResult.error); }

    const text   = analysisResult.result;
    const clean  = text.replace(/```json\n?|```/g, '').trim();
    const parsed = JSON.parse(clean);

    status.textContent = '✅ 分析完了！グループを表示しています...';

    for (let gi = 0; gi < parsed.groups.length; gi++) {
      const g   = parsed.groups[gi];
      const col = GROUP_COLORS[gi % GROUP_COLORS.length];
      const card = document.createElement('div');
      card.className = 'analysis-group';
      card.innerHTML = `
        <div class="analysis-group-header" style="background:${col.bg}">
          <span class="analysis-group-label" style="color:${col.text}">${esc(g.name)}</span>
          <span class="analysis-group-count" style="background:${col.cbg};color:${col.ct}">${g.members.length}名</span>
        </div>
        <div class="analysis-group-body">
          <div class="analysis-summary" id="asummary-${gi}"></div>
          <div class="analysis-members">${g.members.map(m => `<span class="analysis-member">${esc(m)}</span>`).join('')}</div>
        </div>`;
      result.appendChild(card);
      await sleep(50);
      card.classList.add('visible');
      const summaryEl = document.getElementById('asummary-' + gi);
      summaryEl.innerHTML = '<span class="typing-cursor"></span>';
      await sleep(200);
      summaryEl.textContent = '';
      await typeText(summaryEl, g.summary, 14);
      await sleep(200);
    }

    const overallCard = document.createElement('div');
    overallCard.className = 'analysis-overall';
    overallCard.innerHTML = '<div class="analysis-overall-label">全体の傾向</div><div class="analysis-overall-text" id="aoverall"></div>';
    result.appendChild(overallCard);
    await sleep(100);
    overallCard.classList.add('visible');
    const overallEl = document.getElementById('aoverall');
    overallEl.innerHTML = '<span class="typing-cursor"></span>';
    await sleep(200);
    overallEl.textContent = '';
    await typeText(overallEl, parsed.overall, 12);
    status.textContent = '✅ 分析完了！';

  } catch (e) {
    console.error(e);
    status.textContent = '❌ 分析に失敗しました。もう一度お試しください。（' + e.message + ')';
  }
  btn.disabled = false;
}

// ── 全件チェック ──────────────────────────────────────────
async function runCheck() {
  const btn    = document.getElementById('check-btn');
  const status = document.getElementById('check-status');
  const result = document.getElementById('check-result');
  btn.disabled = true;
  status.textContent = 'GASからデータを取得中…';
  result.innerHTML = '';

  const records = await fetchFromGAS();
  if (!records.length) {
    status.textContent = '❌ データが取得できませんでした。';
    btn.disabled = false;
    return;
  }

  let ok = 0, ng = 0;
  const rows = records.map(r => {
    const found = records.find(x => norm(x.cls) === norm(r.cls) && norm(x.num) === norm(r.num));
    const pass  = !!found;
    if (pass) ok++; else ng++;
    return `<tr style="background:${pass ? '#f0fdf4' : '#fef2f2'}">
      <td style="padding:6px 10px">${pass ? '✅' : '❌'}</td>
      <td style="padding:6px 10px">${esc(r.cls)}組 ${esc(r.num)}番</td>
      <td style="padding:6px 10px">${esc(r.name)}</td>
      <td style="padding:6px 10px;font-size:11px;color:#6b7280">cls=${JSON.stringify(r.cls)} num=${JSON.stringify(r.num)}</td>
    </tr>`;
  });

  status.textContent = `完了：${records.length}件中 ✅${ok}件 / ❌${ng}件`;
  result.innerHTML = `<table style="border-collapse:collapse;width:100%;font-size:13px">
    <thead><tr style="background:#f3f4f6">
      <th style="padding:6px 10px;text-align:left">結果</th>
      <th style="padding:6px 10px;text-align:left">クラス・番号</th>
      <th style="padding:6px 10px;text-align:left">氏名</th>
      <th style="padding:6px 10px;text-align:left">raw値</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
  btn.disabled = false;
}
