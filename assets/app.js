/* 🐱 貓咪照護日誌 — 純前端，資料存在 localStorage，可選擇用 Firebase 雲端即時共編，也可匯出 / 匯入 / 用連結分享 */
'use strict';

/* ========== 小工具 ========== */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now() + Math.random().toString(16).slice(2));
const today = () => new Date().toLocaleDateString('sv-SE');
const dayDiff = (from, to) => Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000);
const num = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const sum = a => a.reduce((t, n) => t + (n || 0), 0);
const STORE_KEY = 'cat-diary-v1';
const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ========== 資料結構 ========== */
const COLLECTIONS = ['cats', 'daily', 'weights', 'vaccines', 'deworm', 'vet', 'meds', 'grooming', 'expenses', 'moments'];

const emptyDb = () => ({ version: 1, updatedAt: Date.now(), ...Object.fromEntries(COLLECTIONS.map(k => [k, []])) });

let db = emptyDb();
let ui = { tab: 'dashboard', sub: 'vaccines', catId: 'all' };

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) db = normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('讀取本機資料失敗', e);
  }
}
function normalize(d) {
  const out = emptyDb();
  if (!d || typeof d !== 'object') return out;
  for (const k of COLLECTIONS) if (Array.isArray(d[k])) out[k] = d[k].filter(r => r && typeof r === 'object');
  out.updatedAt = Number(d.updatedAt) || Date.now();
  return out;
}
function save() {
  db.updatedAt = Date.now();
  saveLocal();
  cloudPush();
}
function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    toast('儲存失敗，可能是照片太多導致空間不足');
  }
}
const countRecords = d => COLLECTIONS.reduce((t, k) => t + d[k].length, 0);

/* ========== 欄位定義 ========== */
const SCHEMAS = {
  cats: {
    label: '貓咪', icon: '🐾', single: '貓咪', title: r => r.name || '未命名貓咪', noCat: true,
    fields: [
      { k: 'name', l: '名字', t: 'text', req: true },
      { k: 'photo', l: '照片', t: 'image' },
      { k: 'birthday', l: '生日（會自動算年齡）', t: 'date' },
      { k: 'gender', l: '性別', t: 'select', o: ['', '女生', '男生', '未知'] },
      { k: 'breed', l: '品種', t: 'text', list: '米克斯,美國短毛貓,英國短毛貓,波斯貓,布偶貓,摺耳貓,暹羅貓,曼赤肯,緬因貓' },
      { k: 'color', l: '毛色 / 花紋', t: 'text' },
      { k: 'neutered', l: '結紮狀態', t: 'select', o: ['', '已結紮', '未結紮', '未知'] },
      { k: 'adoptedDate', l: '來到家裡的日子', t: 'date' },
      { k: 'microchip', l: '晶片號碼', t: 'text' },
      { k: 'targetWeight', l: '理想體重 (kg)', t: 'number' },
      { k: 'clinic', l: '固定動物醫院', t: 'text' },
      { k: 'clinicPhone', l: '醫院電話', t: 'tel' },
      { k: 'insurance', l: '寵物保險 / 保單號碼', t: 'text' },
      { k: 'allergy', l: '過敏 / 慢性病 / 注意事項', t: 'textarea' },
      { k: 'notes', l: '備註（個性、喜好食物…）', t: 'textarea' }
    ]
  },
  daily: {
    label: '每日紀錄', icon: '📅', single: '當日紀錄', title: r => r.date,
    fields: [
      { k: 'date', l: '日期', t: 'date', req: true, def: today },
      { k: 'water', l: '喝水量 (ml)', t: 'number', hint: '選填，不確定可留空' },
      { k: 'foodDry', l: '乾飼料 (g)', t: 'number' },
      { k: 'foodWet', l: '濕食 / 罐頭 (g)', t: 'number' },
      { k: 'treat', l: '零食 / 保健品', t: 'text' },
      { k: 'appetite', l: '食慾', t: 'select', o: ['', '很好', '正常', '偏少', '幾乎沒吃'] },
      { k: 'pee', l: '尿尿次數', t: 'number' },
      { k: 'poo', l: '便便次數', t: 'number' },
      { k: 'poopScore', l: '便便狀況', t: 'select', o: ['', '正常', '偏硬 / 便祕', '偏軟', '腹瀉', '有血絲', '有毛'] },
      { k: 'vomit', l: '嘔吐次數', t: 'number' },
      { k: 'mood', l: '精神狀況', t: 'select', o: ['', '活力充沛', '正常', '懶洋洋', '躲起來', '不太對勁'] },
      { k: 'play', l: '玩耍時間 (分鐘)', t: 'number' },
      { k: 'notes', l: '今天的備註', t: 'textarea' }
    ]
  },
  weights: {
    label: '體重', icon: '⚖️', single: '體重紀錄', title: r => `${r.kg ?? '-'} kg`,
    fields: [
      { k: 'date', l: '量測日期', t: 'date', req: true, def: today },
      { k: 'kg', l: '體重 (kg)', t: 'number', req: true },
      { k: 'bcs', l: '體態評分 BCS (1~9)', t: 'number', hint: '5 為標準體態' },
      { k: 'notes', l: '備註', t: 'textarea' }
    ]
  },
  vaccines: {
    label: '疫苗', icon: '💉', single: '疫苗紀錄', title: r => r.name || '疫苗', due: 'nextDate',
    fields: [
      { k: 'name', l: '疫苗名稱', t: 'text', req: true, list: '三合一,四合一,五合一,狂犬病,貓白血病 FeLV,貓披衣菌' },
      { k: 'date', l: '施打日期', t: 'date', req: true, def: today },
      { k: 'nextDate', l: '下次施打日（會進提醒）', t: 'date' },
      { k: 'clinic', l: '動物醫院', t: 'text' },
      { k: 'lot', l: '疫苗批號', t: 'text' },
      { k: 'cost', l: '費用', t: 'number' },
      { k: 'notes', l: '反應 / 備註', t: 'textarea' }
    ]
  },
  deworm: {
    label: '驅蟲 / 預防', icon: '🛡️', single: '驅蟲紀錄', title: r => `${r.type || '驅蟲'}${r.name ? '・' + r.name : ''}`, due: 'nextDate',
    fields: [
      { k: 'type', l: '類型', t: 'select', req: true, o: ['體內驅蟲', '體外驅蟲', '心絲蟲預防', '全效型'] },
      { k: 'name', l: '藥品名稱', t: 'text', list: 'Revolution 蚤安,Broadline,NexGard Combo,Advocate,Milbemax' },
      { k: 'date', l: '使用日期', t: 'date', req: true, def: today },
      { k: 'nextDate', l: '下次使用日（會進提醒）', t: 'date' },
      { k: 'cost', l: '費用', t: 'number' },
      { k: 'notes', l: '備註', t: 'textarea' }
    ]
  },
  vet: {
    label: '就醫', icon: '🏥', single: '就醫紀錄', title: r => r.reason || r.clinic || '就醫', due: 'nextDate',
    fields: [
      { k: 'date', l: '看診日期', t: 'date', req: true, def: today },
      { k: 'reason', l: '主訴 / 症狀', t: 'text', req: true },
      { k: 'clinic', l: '動物醫院', t: 'text' },
      { k: 'doctor', l: '醫師', t: 'text' },
      { k: 'diagnosis', l: '診斷結果', t: 'textarea' },
      { k: 'treatment', l: '處置 / 開立藥物', t: 'textarea' },
      { k: 'cost', l: '費用', t: 'number' },
      { k: 'nextDate', l: '回診日（會進提醒）', t: 'date' },
      { k: 'notes', l: '備註', t: 'textarea' }
    ]
  },
  meds: {
    label: '用藥', icon: '💊', single: '用藥紀錄', title: r => r.name || '用藥', due: 'endDate',
    fields: [
      { k: 'name', l: '藥名 / 保健品', t: 'text', req: true },
      { k: 'dose', l: '劑量', t: 'text', hint: '例如：半顆、0.5 ml' },
      { k: 'freq', l: '頻率', t: 'select', o: ['', '一天一次', '一天兩次', '一天三次', '兩天一次', '一週一次', '一個月一次', '需要時'] },
      { k: 'startDate', l: '開始日期', t: 'date', req: true, def: today },
      { k: 'endDate', l: '結束 / 回診拿藥日（會進提醒）', t: 'date' },
      { k: 'notes', l: '備註', t: 'textarea' }
    ]
  },
  grooming: {
    label: '美容清潔', icon: '🛁', single: '清潔紀錄', title: r => r.type || '清潔',
    fields: [
      { k: 'type', l: '項目', t: 'select', req: true, o: ['洗澡', '剪指甲', '梳毛', '刷牙', '清耳朵', '剃毛 / 修剪', '擠肛門腺', '換貓砂'] },
      { k: 'date', l: '日期', t: 'date', req: true, def: today },
      { k: 'place', l: '地點 / 美容師', t: 'text' },
      { k: 'cost', l: '費用', t: 'number' },
      { k: 'notes', l: '備註', t: 'textarea' }
    ]
  },
  expenses: {
    label: '花費', icon: '💰', single: '花費紀錄', title: r => `${r.category || '其他'}${r.item ? '・' + r.item : ''}`,
    fields: [
      { k: 'date', l: '日期', t: 'date', req: true, def: today },
      { k: 'category', l: '分類', t: 'select', req: true, o: ['飼料', '罐頭 / 鮮食', '零食', '貓砂', '醫療', '保健品', '玩具', '生活用品', '美容', '保險', '其他'] },
      { k: 'item', l: '品項', t: 'text' },
      { k: 'amount', l: '金額', t: 'number', req: true },
      { k: 'shop', l: '購買地點', t: 'text' },
      { k: 'notes', l: '備註', t: 'textarea' }
    ]
  },
  moments: {
    label: '回憶', icon: '📸', single: '生活紀錄', title: r => r.title || '生活紀錄',
    fields: [
      { k: 'date', l: '日期', t: 'date', req: true, def: today },
      { k: 'title', l: '標題', t: 'text', req: true, hint: '例如：第一次學會握手' },
      { k: 'photo', l: '照片', t: 'image' },
      { k: 'notes', l: '內容', t: 'textarea' }
    ]
  }
};

const TABS = [
  { k: 'dashboard', l: '總覽', i: '🏠' },
  { k: 'cats', l: '貓咪', i: '🐾' },
  { k: 'daily', l: '每日', i: '📅' },
  { k: 'health', l: '健康', i: '💉' },
  { k: 'weights', l: '體重', i: '⚖️' },
  { k: 'expenses', l: '花費', i: '💰' },
  { k: 'moments', l: '回憶', i: '📸' },
  { k: 'data', l: '資料', i: '🔗' }
];
const HEALTH_SUBS = ['vaccines', 'deworm', 'vet', 'meds', 'grooming'];

/* ========== 年齡 ========== */
function ageOf(birthday) {
  if (!birthday) return null;
  const bd = new Date(birthday + 'T00:00:00');
  if (isNaN(bd)) return null;
  const now = new Date();
  let y = now.getFullYear() - bd.getFullYear();
  let m = now.getMonth() - bd.getMonth();
  if (now.getDate() < bd.getDate()) m--;
  if (m < 0) { y--; m += 12; }
  if (y < 0) return null;
  return { y, m, days: Math.floor((now - bd) / 86400000) };
}
function ageText(birthday) {
  const a = ageOf(birthday);
  if (!a) return '';
  if (a.y === 0 && a.m === 0) return `${a.days} 天`;
  return a.y === 0 ? `${a.m} 個月` : `${a.y} 歲 ${a.m} 個月`;
}
/** 常見的貓換算人類年齡：第 1 年 ≈ 15 歲，第 2 年 +9 歲，之後每年 +4 歲 */
function humanAge(birthday) {
  const a = ageOf(birthday);
  if (!a) return null;
  const t = a.y + a.m / 12;
  if (t <= 1) return Math.round(t * 15);
  if (t <= 2) return Math.round(15 + (t - 1) * 9);
  return Math.round(24 + (t - 2) * 4);
}
function lifeStage(birthday) {
  const a = ageOf(birthday);
  if (!a) return '';
  const m = a.y * 12 + a.m;
  if (m < 7) return '幼貓';
  if (m < 24) return '青年貓';
  if (m < 84) return '成貓';
  if (m < 132) return '熟齡貓';
  return '老年貓';
}

/* ========== 查詢 ========== */
const catById = id => db.cats.find(c => c.id === id);
const catName = id => catById(id)?.name || '（未指定貓咪）';
function rows(key) {
  const list = db[key] || [];
  const filtered = ui.catId === 'all' || SCHEMAS[key].noCat ? list : list.filter(r => r.catId === ui.catId);
  return [...filtered].sort((a, b) => String(b.date || b.startDate || b.name || '').localeCompare(String(a.date || a.startDate || a.name || '')));
}
function visibleCats() {
  return ui.catId === 'all' ? db.cats : db.cats.filter(c => c.id === ui.catId);
}

/* ========== 畫面 ========== */
function renderTabs() {
  $('#tabs').innerHTML = TABS.map(t =>
    `<button class="tab ${ui.tab === t.k ? 'active' : ''}" data-tab="${t.k}">${t.i} ${esc(t.l)}</button>`).join('');
}
function renderCatFilter() {
  const sel = $('#catFilter');
  sel.innerHTML = `<option value="all">全部貓咪</option>` +
    db.cats.map(c => `<option value="${esc(c.id)}">${esc(c.name || '未命名')}</option>`).join('');
  sel.value = db.cats.some(c => c.id === ui.catId) ? ui.catId : 'all';
  ui.catId = sel.value;
  renderInfo();
}
function renderInfo() {
  const label = { off: '本機儲存', connecting: '☁️ 雲端連線中…', online: '☁️ 雲端同步中', offline: '☁️ 離線中，連上網路後自動同步', error: '⚠️ 雲端同步失敗' }[cloud.status];
  $('#dbInfo').textContent = `${db.cats.length} 隻貓 · ${countRecords(db)} 筆紀錄 · ${label}`;
  $('#footerNote').textContent = cloud.status === 'off'
    ? '資料僅存在這台裝置的瀏覽器中，請定期到「資料」頁備份，或開啟雲端同步。'
    : '資料存在雲端，擁有分享連結的人都可以一起檢視與編輯。';
}

function render(opts = {}) {
  renderTabs();
  renderCatFilter();
  const v = $('#view');
  if (ui.tab === 'dashboard') v.innerHTML = viewDashboard();
  else if (ui.tab === 'health') v.innerHTML = viewHealth();
  else if (ui.tab === 'data') v.innerHTML = viewData();
  else if (ui.tab === 'weights') v.innerHTML = viewWeights();
  else v.innerHTML = viewCollection(ui.tab);
  if (!opts.keepScroll) window.scrollTo({ top: 0 });
}

/* ---- 總覽 ---- */
function viewDashboard() {
  if (!db.cats.length) {
    return `<div class="empty"><span class="big">🐱</span>還沒有貓咪資料<br><br>
      <button class="btn primary" data-add="cats">新增第一隻貓咪</button></div>`;
  }
  const cards = visibleCats().map(c => {
    const d = db.daily.filter(r => r.catId === c.id);
    const t = d.find(r => r.date === today());
    const last7 = d.filter(r => r.date && dayDiff(r.date, today()) <= 6 && dayDiff(r.date, today()) >= 0);
    const avgW = last7.length ? Math.round(sum(last7.map(r => num(r.water))) / last7.filter(r => num(r.water) != null).length || 0) : 0;
    const w = db.weights.filter(r => r.catId === c.id).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    const ha = humanAge(c.birthday);
    return `<div class="card">
      <div class="cat-card">
        ${avatarHtml(c)}
        <div class="body">
          <div class="card-title">${esc(c.name || '未命名')} ${c.gender === '女生' ? '♀' : c.gender === '男生' ? '♂' : ''}</div>
          <div class="card-sub">${esc(ageText(c.birthday) || '未填生日')}${ha != null ? `・約人類 ${ha} 歲` : ''}${lifeStage(c.birthday) ? '・' + lifeStage(c.birthday) : ''}</div>
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat"><div class="v">${t && num(t.water) != null ? num(t.water) : '—'}</div><div class="l">今天喝水 ml</div></div>
        <div class="stat"><div class="v">${t && (num(t.foodDry) != null || num(t.foodWet) != null) ? sum([num(t.foodDry), num(t.foodWet)]) : '—'}</div><div class="l">今天吃飯 g</div></div>
        <div class="stat"><div class="v">${avgW || '—'}</div><div class="l">7 天平均喝水</div></div>
        <div class="stat"><div class="v">${w ? w.kg : '—'}</div><div class="l">最新體重 kg</div></div>
      </div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn primary" data-add="daily" data-cat="${esc(c.id)}">＋ 記錄今天</button>
        <button class="btn" data-add="weights" data-cat="${esc(c.id)}">＋ 量體重</button>
      </div>
    </div>`;
  }).join('');

  const rem = reminders();
  const remHtml = rem.length ? rem.slice(0, 12).map(r => {
    const cls = r.days < 0 ? 'over' : r.days <= 14 ? 'soon' : '';
    const when = r.days < 0 ? `已逾期 ${-r.days} 天` : r.days === 0 ? '就是今天' : `還有 ${r.days} 天`;
    return `<div class="remind ${cls}"><span class="dot"></span>
      <span>${esc(r.icon)} ${esc(r.catName)}・${esc(r.text)}</span>
      <span class="when">${esc(r.date)}（${when}）</span></div>`;
  }).join('') : `<p class="note">目前沒有即將到期的提醒 🎉</p>`;

  const monthCost = monthlyCost();
  return `
  <div class="section-head"><div><h2>總覽</h2><p>今天是 ${today()}</p></div></div>
  <div class="grid">${cards}</div>
  <div class="card" style="margin-top:16px">
    <div class="card-title">⏰ 提醒事項</div>
    <div style="margin-top:6px">${remHtml}</div>
  </div>
  <div class="card">
    <div class="card-title">💰 本月花費</div>
    <div class="stat-grid">
      <div class="stat"><div class="v">$${monthCost.total}</div><div class="l">${today().slice(0, 7)} 合計</div></div>
      ${Object.entries(monthCost.byCat).slice(0, 5).map(([k, v]) => `<div class="stat"><div class="v">$${v}</div><div class="l">${esc(k)}</div></div>`).join('')}
    </div>
  </div>`;
}

function avatarHtml(c) {
  const ok = typeof c.photo === 'string' && c.photo.startsWith('data:image/');
  return ok ? `<img class="avatar" src="${esc(c.photo)}" alt="${esc(c.name || '貓咪')}">`
    : `<div class="avatar">🐱</div>`;
}

function reminders() {
  const out = [];
  for (const key of ['vaccines', 'deworm', 'vet', 'meds']) {
    const field = SCHEMAS[key].due;
    for (const r of db[key]) {
      if (!r[field]) continue;
      if (ui.catId !== 'all' && r.catId !== ui.catId) continue;
      const days = dayDiff(today(), r[field]);
      if (days > 120) continue;
      out.push({
        days, date: r[field], icon: SCHEMAS[key].icon,
        catName: catName(r.catId),
        text: key === 'vaccines' ? `${r.name} 回診施打`
          : key === 'deworm' ? `${r.type || '驅蟲'} 下次使用`
            : key === 'vet' ? `回診：${r.reason || r.clinic || ''}`
              : `${r.name} 療程結束 / 回診拿藥`
      });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

function monthlyCost() {
  const m = today().slice(0, 7);
  const byCat = {};
  let total = 0;
  const add = (cat, amt) => { if (!amt) return; byCat[cat] = (byCat[cat] || 0) + amt; total += amt; };
  for (const r of db.expenses) if (String(r.date).startsWith(m) && (ui.catId === 'all' || r.catId === ui.catId)) add(r.category || '其他', num(r.amount) || 0);
  for (const key of ['vet', 'vaccines', 'deworm', 'grooming'])
    for (const r of db[key]) if (String(r.date).startsWith(m) && (ui.catId === 'all' || r.catId === ui.catId)) add(key === 'grooming' ? '美容' : '醫療', num(r.cost) || 0);
  return { total: Math.round(total), byCat };
}

/* ---- 一般清單 ---- */
function viewCollection(key, hideHead) {
  const s = SCHEMAS[key];
  const list = rows(key);
  const head = hideHead ? '' : `<div class="section-head">
      <div><h2>${s.icon} ${esc(s.label)}</h2><p>共 ${list.length} 筆</p></div>
      <button class="btn primary" data-add="${key}">＋ 新增${esc(s.single)}</button>
    </div>`;
  if (!db.cats.length && !s.noCat)
    return head + `<div class="empty"><span class="big">🐾</span>請先到「貓咪」頁新增一隻貓咪</div>`;
  if (!list.length)
    return head + `<div class="empty"><span class="big">${s.icon}</span>還沒有${esc(s.label)}紀錄</div>`;
  return head + (key === 'cats' ? `<div class="grid">${list.map(r => cardHtml(key, r)).join('')}</div>`
    : list.map(r => cardHtml(key, r)).join(''));
}

function cardHtml(key, r) {
  const s = SCHEMAS[key];
  const chips = s.fields
    .filter(f => f.k !== 'notes' && f.t !== 'image' && !['name', 'title'].includes(f.k))
    .map(f => {
      const v = r[f.k];
      if (v === '' || v == null) return '';
      const unit = f.k === 'cost' || f.k === 'amount' ? '$' : '';
      return `<span class="chip">${esc(f.l.replace(/（.*?）/g, '').trim())} <b>${unit}${esc(v)}</b></span>`;
    }).join('');

  if (key === 'cats') {
    const ha = humanAge(r.birthday);
    return `<div class="card"><div class="cat-card">
        ${avatarHtml(r)}
        <div class="body">
          <div class="card-head">
            <div>
              <div class="card-title">${esc(r.name || '未命名')}</div>
              <div class="card-sub">${esc(ageText(r.birthday) || '未填生日')}${ha != null ? `・約人類 ${ha} 歲` : ''}</div>
            </div>
            <div class="card-actions">
              <button class="mini-btn" data-edit="${key}" data-id="${esc(r.id)}">編輯</button>
              <button class="mini-btn danger" data-del="${key}" data-id="${esc(r.id)}">刪除</button>
            </div>
          </div>
        </div>
      </div>
      <div class="chips">${chips}</div>
      ${r.allergy ? `<p class="note">⚠️ ${esc(r.allergy)}</p>` : ''}
      ${r.notes ? `<p class="note">${esc(r.notes)}</p>` : ''}
    </div>`;
  }

  return `<div class="card">
    <div class="card-head">
      <div>
        <div class="card-title">${s.icon} ${esc(s.title(r))}</div>
        <div class="card-sub">${esc(r.date || r.startDate || '')}${SCHEMAS[key].noCat ? '' : '・' + esc(catName(r.catId))}</div>
      </div>
      <div class="card-actions">
        <button class="mini-btn" data-edit="${key}" data-id="${esc(r.id)}">編輯</button>
        <button class="mini-btn danger" data-del="${key}" data-id="${esc(r.id)}">刪除</button>
      </div>
    </div>
    ${typeof r.photo === 'string' && r.photo.startsWith('data:image/') ? `<img src="${esc(r.photo)}" alt="" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px;margin-top:10px">` : ''}
    <div class="chips">${chips}</div>
    ${r.notes ? `<p class="note">${esc(r.notes)}</p>` : ''}
  </div>`;
}

/* ---- 健康（含子分頁） ---- */
function viewHealth() {
  const subs = HEALTH_SUBS.map(k =>
    `<button class="subtab ${ui.sub === k ? 'active' : ''}" data-sub="${k}">${SCHEMAS[k].icon} ${esc(SCHEMAS[k].label)}</button>`).join('');
  return `<div class="subtabs">${subs}</div>` + viewCollection(ui.sub);
}

/* ---- 體重（含折線圖） ---- */
function viewWeights() {
  const head = `<div class="section-head">
      <div><h2>⚖️ 體重</h2><p>定期量體重能最早發現貓咪的健康變化</p></div>
      <button class="btn primary" data-add="weights">＋ 新增體重紀錄</button>
    </div>`;
  const charts = visibleCats().map(c => {
    const pts = db.weights.filter(r => r.catId === c.id && r.date && num(r.kg) != null)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (pts.length < 1) return '';
    const last = pts[pts.length - 1], first = pts[0];
    const diff = (num(last.kg) - num(first.kg)).toFixed(2);
    return `<div class="card">
      <div class="card-title">${esc(c.name || '未命名')}</div>
      <div class="card-sub">最新 ${esc(last.kg)} kg（${esc(last.date)}）・與第一筆相比 ${diff > 0 ? '+' : ''}${diff} kg${c.targetWeight ? `・理想 ${esc(c.targetWeight)} kg` : ''}</div>
      ${lineChart(pts.map(p => ({ x: p.date, y: num(p.kg) })))}
    </div>`;
  }).join('');
  return head + charts + viewCollection('weights', true);
}

function lineChart(pts) {
  if (pts.length < 2) return `<p class="note">再多記錄幾筆就會畫出體重趨勢圖。</p>`;
  const W = 600, H = 170, pad = 30;
  const ys = pts.map(p => p.y);
  const min = Math.min(...ys), max = Math.max(...ys);
  const span = max - min || 1;
  const X = i => pad + (i * (W - pad * 2)) / (pts.length - 1);
  const Y = v => H - pad - ((v - min) / span) * (H - pad * 2);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => `<circle class="pt" cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <line class="ax" x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}"/>
    <path class="ln" d="${d}"/>${dots}
    <text x="2" y="${pad}">${max.toFixed(1)}</text>
    <text x="2" y="${H - pad}">${min.toFixed(1)}</text>
    <text x="${pad}" y="${H - 8}">${esc(pts[0].x)}</text>
    <text x="${W - pad}" y="${H - 8}" text-anchor="end">${esc(pts[pts.length - 1].x)}</text>
  </svg>`;
}

/* ---- 資料 / 分享 ---- */
function viewCloudCard() {
  if (!cloudConfigured()) {
    return `<div class="card">
      <div class="card-title">☁️ 雲端同步（尚未設定）</div>
      <p class="note">設定 Firebase 後，資料會存在雲端，家人打開同一個連結就能即時一起編輯。
        設定方式請看專案 README 的「開啟雲端同步」。目前資料只存在這台裝置。</p>
    </div>`;
  }
  if (!cloud.space) {
    return `<div class="card">
      <div class="card-title">☁️ 雲端同步</div>
      <p class="note">建立一個家庭共享空間，目前這台裝置的 ${countRecords(db)} 筆紀錄會一起上傳。
        之後把空間連結傳給家人，大家打開就能即時一起編輯。<br>
        已經有家人給的連結？直接打開那個連結就會自動加入。</p>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn primary" id="btnCloudCreate">建立雲端家庭空間</button>
      </div>
    </div>`;
  }
  const status = { connecting: '連線中…', online: '✅ 已同步', offline: '📴 離線中，恢復網路後會自動上傳', error: `⚠️ ${esc(cloud.error)}` }[cloud.status] || '';
  return `<div class="card">
    <div class="card-title">☁️ 雲端同步　<span class="card-sub">${status}</span></div>
    <p class="note">把下面的連結傳給家人，打開就能一起檢視與編輯，任何人修改都會即時同步到所有裝置。
      <b>拿到連結的人都能修改資料</b>，請只傳給信任的人。</p>
    <textarea class="share-box" id="cloudLink" readonly>${esc(spaceUrl(cloud.space))}</textarea>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn primary" id="btnCloudCopy">複製共享連結</button>
      <button class="btn" id="btnCloudLeave">這台裝置停止同步</button>
    </div>
  </div>`;
}

function viewData() {
  return `
  <div class="section-head"><div><h2>🔗 資料備份與共享</h2><p>最後更新：${new Date(db.updatedAt).toLocaleString('zh-TW')}</p></div></div>

  ${viewCloudCard()}

  <div class="card">
    <div class="card-title">📤 匯出備份</div>
    <p class="note">下載一個 JSON 檔，可以傳給家人，或之後匯入還原。</p>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn primary" id="btnExport">下載備份檔 (.json)</button>
      <button class="btn" id="btnExportCsv">匯出每日紀錄 (.csv)</button>
    </div>
  </div>

  <div class="card">
    <div class="card-title">📥 匯入 / 合併</div>
    <p class="note">選擇備份檔。「合併」會保留兩邊的紀錄（同一筆以較新的為準），適合多人各自記錄後再彙整。</p>
    <div class="btn-row" style="margin-top:10px">
      <input type="file" id="fileImport" accept="application/json,.json" style="display:none">
      <button class="btn primary" id="btnMerge">合併匯入</button>
      <button class="btn danger" id="btnReplace">覆蓋匯入</button>
    </div>
  </div>

  <div class="card">
    <div class="card-title">🔗 產生資料快照連結（不需雲端）</div>
    <p class="note">連結本身就包含壓縮後的資料。把連結傳給家人，他們打開後就能載入並編輯，再把新的連結傳回來合併即可。開啟雲端同步後通常用不到。</p>
    <label class="inline-check"><input type="checkbox" id="shareNoPhoto" checked> 不包含照片（強烈建議，連結才不會過長）</label>
    <div class="btn-row" style="margin:8px 0">
      <button class="btn primary" id="btnShare">產生分享連結</button>
      <button class="btn" id="btnCopy">複製連結</button>
    </div>
    <textarea class="share-box" id="shareOut" readonly placeholder="按上面的按鈕產生連結…"></textarea>
  </div>

  <div class="card">
    <div class="card-title">🗑️ 清除資料</div>
    <p class="note">會刪除這個瀏覽器裡的所有紀錄${cloud.space ? '，<b>雲端上的共享資料也會一起刪除</b>' : ''}，請先確定已經匯出備份。</p>
    <div class="btn-row" style="margin-top:10px"><button class="btn danger" id="btnClear">全部清除</button></div>
  </div>`;
}

/* ========== 表單 ========== */
let formCtx = null;

function openForm(key, id, presetCatId) {
  const s = SCHEMAS[key];
  const rec = id ? db[key].find(r => r.id === id) : null;
  formCtx = { key, id, photo: rec?.photo || '' };
  $('#modalTitle').textContent = `${rec ? '編輯' : '新增'}${s.single}`;

  let html = '';
  if (!s.noCat) {
    const cur = rec?.catId || presetCatId || (ui.catId !== 'all' ? ui.catId : db.cats[0]?.id) || '';
    html += `<div class="field"><label>哪一隻貓咪 *</label><select name="catId" required>
      ${db.cats.map(c => `<option value="${esc(c.id)}" ${c.id === cur ? 'selected' : ''}>${esc(c.name || '未命名')}</option>`).join('')}
    </select></div>`;
  }
  html += s.fields.map(f => fieldHtml(f, rec ? rec[f.k] : (typeof f.def === 'function' ? f.def() : f.def))).join('');
  $('#modalForm').innerHTML = html;
  $('#modal').classList.remove('hidden');
  setTimeout(() => $('#modalForm input,#modalForm select')?.focus(), 50);
}

function fieldHtml(f, v) {
  v = v ?? '';
  const req = f.req ? ' required' : '';
  const star = f.req ? ' *' : '';
  const hint = f.hint ? `<div class="hint">${esc(f.hint)}</div>` : '';
  let input;
  if (f.t === 'textarea') input = `<textarea name="${f.k}"${req}>${esc(v)}</textarea>`;
  else if (f.t === 'select') {
    const opts = (f.o || []).map(o => `<option value="${esc(o)}" ${String(v) === o ? 'selected' : ''}>${o === '' ? '（未填）' : esc(o)}</option>`).join('');
    input = `<select name="${f.k}"${req}>${opts}</select>`;
  } else if (f.t === 'image') {
    const ok = typeof v === 'string' && v.startsWith('data:image/');
    input = `<div class="photo-pick">
        <img id="photoPrev" src="${ok ? esc(v) : BLANK_IMG}" alt="">
        <input type="file" name="__photo" accept="image/*">
        <button type="button" class="mini-btn" id="photoClear">清除</button>
      </div>`;
  } else {
    const listId = f.list ? `list-${f.k}` : '';
    const dl = f.list ? `<datalist id="${listId}">${f.list.split(',').map(o => `<option value="${esc(o.trim())}">`).join('')}</datalist>` : '';
    const step = f.t === 'number' ? ' step="any"' : '';
    input = `<input type="${f.t}" name="${f.k}" value="${esc(v)}"${req}${step}${f.list ? ` list="${listId}"` : ''}>${dl}`;
  }
  return `<div class="field"><label>${esc(f.l)}${star}</label>${input}${hint}</div>`;
}

function closeForm() { $('#modal').classList.add('hidden'); formCtx = null; }

function submitForm(e) {
  e.preventDefault();
  if (!formCtx) return;
  const { key, id } = formCtx;
  const fd = new FormData(e.target);
  const rec = { id: id || uid(), updatedAt: Date.now() };
  if (!SCHEMAS[key].noCat) rec.catId = fd.get('catId') || '';
  for (const f of SCHEMAS[key].fields) {
    if (f.t === 'image') { rec[f.k] = formCtx.photo || ''; continue; }
    const raw = String(fd.get(f.k) ?? '').trim();
    rec[f.k] = f.t === 'number' ? (raw === '' ? '' : num(raw) ?? '') : raw;
  }
  const idx = db[key].findIndex(r => r.id === rec.id);
  if (idx >= 0) db[key][idx] = rec; else db[key].push(rec);
  save();
  closeForm();
  render();
  toast(id ? '已更新' : '已新增');
}

/* 壓縮照片後轉成 dataURL，避免 localStorage 爆掉 */
function readPhoto(file) {
  return new Promise(resolve => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 480;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => resolve('');
      img.src = fr.result;
    };
    fr.onerror = () => resolve('');
    fr.readAsDataURL(file);
  });
}

/* ========== 匯出 / 匯入 / 分享 ========== */
function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  download(`cat-diary-${today()}.json`, JSON.stringify(db, null, 2));
  toast('已下載備份檔');
}
function exportCsv() {
  const cols = ['date', 'cat', ...SCHEMAS.daily.fields.filter(f => f.k !== 'date').map(f => f.k)];
  const head = ['日期', '貓咪', ...SCHEMAS.daily.fields.filter(f => f.k !== 'date').map(f => f.l)];
  const esc2 = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = rows('daily').map(r => cols.map(c => esc2(c === 'cat' ? catName(r.catId) : r[c])).join(','));
  download(`cat-daily-${today()}.csv`, '\uFEFF' + [head.map(esc2).join(','), ...body].join('\r\n'), 'text/csv');
  toast('已下載 CSV');
}

/** 把 incoming 合併進 target：同 id 以 updatedAt 較新的為準，雙方新增的都保留 */
function mergeInto(target, incoming) {
  const inc = normalize(incoming);
  for (const key of COLLECTIONS) {
    const map = new Map(target[key].map(r => [r.id, r]));
    for (const r of inc[key]) {
      if (!r.id) r.id = uid();
      const cur = map.get(r.id);
      if (!cur || (Number(r.updatedAt) || 0) >= (Number(cur.updatedAt) || 0)) map.set(r.id, r);
    }
    target[key] = [...map.values()];
  }
  return target;
}
function mergeDb(incoming) {
  mergeInto(db, incoming);
  save();
}

function pickFile(mode) {
  const input = $('#fileImport');
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (mode === 'replace') {
        if (!confirm('覆蓋匯入會刪除目前所有資料，確定嗎？')) return;
        db = normalize(data); save();
      } else mergeDb(data);
      render();
      toast(mode === 'replace' ? '已覆蓋匯入' : '已合併匯入');
    } catch (err) {
      toast('檔案格式不正確');
    } finally { input.value = ''; }
  };
  input.click();
}

const b64urlEnc = u8 => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlDec = str => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
};

async function encodePayload(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') {
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    return 'z.' + b64urlEnc(new Uint8Array(buf));
  }
  return 'p.' + b64urlEnc(bytes);
}
async function decodePayload(str) {
  const tag = str.slice(0, 1);
  let bytes = b64urlDec(str.slice(2));
  if (tag === 'z') {
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    bytes = new Uint8Array(buf);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function makeShareLink() {
  const stripPhoto = $('#shareNoPhoto').checked;
  const data = JSON.parse(JSON.stringify(db));
  if (stripPhoto) for (const key of COLLECTIONS) data[key].forEach(r => { if (r.photo) r.photo = ''; });
  const code = await encodePayload(data);
  const url = location.origin + location.pathname + '#d=' + code;
  $('#shareOut').value = url;
  if (url.length > 30000) toast('連結偏長，部分通訊軟體可能截斷，建議改用匯出檔案');
  else toast('已產生分享連結');
}

async function handleHash() {
  const m = location.hash.match(/^#d=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const data = await decodePayload(decodeURIComponent(m[1]));
    const incoming = normalize(data);
    const n = countRecords(incoming);
    if (cloud.space && !cloud.synced) {
      // 雲端還在連線：等第一次同步完成後再合併上去
      if (!confirm(`收到分享資料（${incoming.cats.length} 隻貓、${n} 筆紀錄）。\n\n要合併到雲端共享空間嗎？`)) return;
      cloud.pendingMerge = mergeInto(cloud.pendingMerge || emptyDb(), incoming);
      toast('連上雲端後會合併分享的資料');
      return;
    }
    const hasLocal = countRecords(db) > 0;
    if (!hasLocal) { db = incoming; save(); toast(`已載入分享的 ${n} 筆紀錄`); return; }
    const ok = confirm(`收到分享資料（${incoming.cats.length} 隻貓、${n} 筆紀錄）。\n\n按「確定」合併到你目前的資料，按「取消」則不載入。`);
    if (ok) { mergeDb(incoming); toast('已合併分享的資料'); }
  } catch (e) {
    toast('分享連結已損壞或不完整');
  }
}

/* ========== 雲端同步（Firebase Firestore） ==========
 * 每個家庭一個「空間」：spaces/{空間ID}/records/{集合__紀錄id}，一筆紀錄一份文件。
 * 空間 ID 是分享連結 ?space= 後面的隨機字串，知道連結的人才能讀寫。
 * save() 會比對上次同步的內容，只上傳有變動 / 被刪除的紀錄；雲端有變動時即時更新畫面。 */
const FIREBASE_VER = '12.4.0';
const SPACE_KEY = 'cat-diary-space';
const cloud = { fs: null, api: null, space: '', unsub: null, synced: null, pendingMerge: null, status: 'off', error: '' };

const cloudConfigured = () => !!window.CAT_DIARY_FIREBASE?.projectId;
const validSpace = s => /^[A-Za-z0-9_-]{16,64}$/.test(s || '');
const docKey = (key, id) => `${key}__${id}`;
const spaceUrl = space => location.origin + location.pathname + '?space=' + encodeURIComponent(space);
function newSpaceId() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), b => abc[b % abc.length]).join('');
}
function setSpaceInUrl(space) {
  const u = new URL(location.href);
  if (space) u.searchParams.set('space', space); else u.searchParams.delete('space');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
}
/** 目前資料攤平成 { 文件ID: JSON字串 }，用來比對差異 */
function flatten(d) {
  const m = new Map();
  for (const k of COLLECTIONS) for (const r of d[k]) if (r.id) m.set(docKey(k, r.id), JSON.stringify(r));
  return m;
}

async function cloudConnect(space, mergeLocal) {
  cloud.unsub?.();
  Object.assign(cloud, { space, unsub: null, synced: null, status: 'connecting', error: '' });
  cloud.pendingMerge = mergeLocal ? JSON.parse(JSON.stringify(db)) : null;
  localStorage.setItem(SPACE_KEY, space);
  setSpaceInUrl(space);
  renderInfo();
  try {
    if (!cloud.fs) {
      const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VER}/`;
      const [appMod, fsMod] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js')]);
      const app = appMod.initializeApp(window.CAT_DIARY_FIREBASE);
      try {
        // 存一份在 IndexedDB：離線時也能看、離線修改會在恢復網路後自動上傳
        cloud.fs = fsMod.initializeFirestore(app, {
          ignoreUndefinedProperties: true,
          localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() })
        });
      } catch {
        cloud.fs = fsMod.getFirestore(app);
      }
      cloud.api = fsMod;
    }
    if (cloud.space !== space) return; // 連線途中已經切換或停止
    const { collection, onSnapshot } = cloud.api;
    cloud.unsub = onSnapshot(collection(cloud.fs, 'spaces', space, 'records'),
      { includeMetadataChanges: true }, onCloudSnapshot, cloudError);
  } catch (e) {
    cloudError(e);
  }
}

function onCloudSnapshot(snap) {
  const first = !cloud.synced;
  const status = snap.metadata.fromCache ? 'offline' : 'online';
  // 第一次同步要等伺服器的資料，避免用空白或過期的快取蓋掉 / 合併
  if (first && snap.metadata.fromCache && (snap.empty || cloud.pendingMerge)) return;
  if (!first && !snap.docChanges().length) {
    if (cloud.status !== status) { cloud.status = status; renderInfo(); if (ui.tab === 'data') render({ keepScroll: true }); }
    return;
  }
  const next = emptyDb();
  const synced = new Map();
  snap.forEach(d => {
    const { col, rec } = d.data();
    if (!COLLECTIONS.includes(col) || !rec?.id || d.id !== docKey(col, rec.id)) return;
    next[col].push(rec);
    synced.set(d.id, JSON.stringify(rec));
  });
  next.updatedAt = Math.max(0, ...COLLECTIONS.flatMap(k => next[k].map(r => Number(r.updatedAt) || 0))) || Date.now();
  db = next;
  cloud.synced = synced;
  cloud.status = status;
  cloud.error = '';
  if (first && cloud.pendingMerge) {
    const m = cloud.pendingMerge;
    cloud.pendingMerge = null;
    mergeDb(m); // 會觸發 save() → 上傳差異
    toast('已同步到雲端');
  } else saveLocal();
  render({ keepScroll: true });
}

function cloudPush() {
  if (!cloud.synced || !cloud.api) return; // 未開啟雲端，或還在等第一次同步
  const now = flatten(db);
  const ops = [];
  for (const [id, s] of now) if (cloud.synced.get(id) !== s) ops.push({ id, s });
  for (const id of cloud.synced.keys()) if (!now.has(id)) ops.push({ id, s: null });
  cloud.synced = now;
  if (!ops.length) return;
  const { writeBatch, doc } = cloud.api;
  // Firestore 單次批次最多 500 筆、約 10MB，照片多時要拆開
  let batch = writeBatch(cloud.fs), n = 0, bytes = 0;
  const flush = () => { if (n) batch.commit().catch(cloudError); batch = writeBatch(cloud.fs); n = 0; bytes = 0; };
  for (const { id, s } of ops) {
    if (n >= 400 || bytes + (s?.length || 0) > 4e6) flush();
    const ref = doc(cloud.fs, 'spaces', cloud.space, 'records', id);
    if (s == null) batch.delete(ref);
    else {
      const rec = JSON.parse(s);
      batch.set(ref, { col: id.slice(0, id.indexOf('__')), rec, updatedAt: Number(rec.updatedAt) || Date.now() });
    }
    n++; bytes += s?.length || 0;
  }
  flush();
}

function cloudError(e) {
  console.error('雲端同步錯誤', e);
  cloud.status = 'error';
  cloud.error = e?.code === 'permission-denied' ? '沒有權限，請確認 Firestore 安全規則已設定（見 README）'
    : e?.code === 'resource-exhausted' ? '超過 Firebase 免費額度，請明天再試'
      : (e?.message || String(e));
  toast('雲端同步失敗：' + cloud.error);
  renderInfo();
  if (ui.tab === 'data') render({ keepScroll: true });
}

function cloudLeave() {
  cloud.unsub?.();
  Object.assign(cloud, { space: '', unsub: null, synced: null, pendingMerge: null, status: 'off', error: '' });
  localStorage.removeItem(SPACE_KEY);
  setSpaceInUrl('');
}

/** 啟動時：網址帶 ?space= 就加入那個空間，否則接回上次的空間 */
function startCloud() {
  const param = new URLSearchParams(location.search).get('space');
  const stored = localStorage.getItem(SPACE_KEY);
  if (param && !validSpace(param)) { toast('共享連結不正確'); setSpaceInUrl(''); }
  if (!cloudConfigured()) {
    if (param) toast('這個網站還沒設定雲端同步，暫時只能使用本機資料');
    return;
  }
  if (validSpace(param) && param !== stored) {
    const n = countRecords(db);
    const merge = n > 0 && confirm(`即將加入雲端共享空間。\n\n這台裝置目前有 ${n} 筆資料：\n按「確定」把它們合併到共享空間；\n按「取消」則捨棄本機資料，只使用共享空間的資料。`);
    cloudConnect(param, merge);
  } else if (validSpace(stored)) cloudConnect(stored, false);
}

/* ========== 事件 ========== */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('cat-diary-theme', t);
  $('#themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
}

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tab],[data-sub],[data-add],[data-edit],[data-del],button');
  if (!t) return;

  if (t.dataset.tab) { ui.tab = t.dataset.tab; render(); return; }
  if (t.dataset.sub) { ui.sub = t.dataset.sub; render(); return; }
  if (t.dataset.add) { openForm(t.dataset.add, null, t.dataset.cat); return; }
  if (t.dataset.edit) { openForm(t.dataset.edit, t.dataset.id); return; }
  if (t.dataset.del) {
    const key = t.dataset.del;
    const extra = key === 'cats' ? '\n（這隻貓的所有紀錄也會一併刪除）' : '';
    if (!confirm(`確定要刪除這筆${SCHEMAS[key].single}嗎？${extra}`)) return;
    db[key] = db[key].filter(r => r.id !== t.dataset.id);
    if (key === 'cats') for (const k of COLLECTIONS) if (!SCHEMAS[k].noCat) db[k] = db[k].filter(r => r.catId !== t.dataset.id);
    save(); render(); toast('已刪除');
    return;
  }

  switch (t.id) {
    case 'themeBtn': applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); break;
    case 'modalClose': case 'modalCancel': closeForm(); break;
    case 'photoClear': formCtx.photo = ''; $('#photoPrev').src = BLANK_IMG; break;
    case 'btnExport': exportJson(); break;
    case 'btnExportCsv': exportCsv(); break;
    case 'btnMerge': pickFile('merge'); break;
    case 'btnReplace': pickFile('replace'); break;
    case 'btnShare': await makeShareLink(); break;
    case 'btnCopy': {
      const v = $('#shareOut').value;
      if (!v) { toast('請先產生連結'); break; }
      try { await navigator.clipboard.writeText(v); toast('已複製到剪貼簿'); }
      catch { $('#shareOut').select(); document.execCommand('copy'); toast('已複製'); }
      break;
    }
    case 'btnClear':
      if (confirm(cloud.space ? '確定要清除全部資料嗎？\n雲端共享空間的資料也會一起刪除，所有家人都會看不到，且無法復原。' : '確定要清除本機全部資料嗎？此動作無法復原。')) { db = emptyDb(); save(); render(); toast('已清除'); }
      break;
    case 'btnCloudCreate':
      cloudConnect(newSpaceId(), true);
      render({ keepScroll: true });
      break;
    case 'btnCloudCopy':
      try { await navigator.clipboard.writeText(spaceUrl(cloud.space)); toast('已複製共享連結'); }
      catch { $('#cloudLink').select(); document.execCommand('copy'); toast('已複製'); }
      break;
    case 'btnCloudLeave':
      if (!confirm('這台裝置停止雲端同步嗎？\n資料會保留一份在這台裝置，雲端資料不受影響；之後再打開共享連結就能重新加入。')) break;
      cloudLeave(); render({ keepScroll: true }); toast('已停止同步');
      break;
  }
});

document.addEventListener('change', async e => {
  if (e.target.id === 'catFilter') { ui.catId = e.target.value; render(); return; }
  if (e.target.name === '__photo') {
    const f = e.target.files?.[0];
    if (!f) return;
    const data = await readPhoto(f);
    formCtx.photo = data;
    $('#photoPrev').src = data;
  }
});

$('#modalForm').addEventListener('submit', submitForm);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeForm(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeForm(); });

/* ========== 啟動 ========== */
applyTheme(localStorage.getItem('cat-diary-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
load();
startCloud();
handleHash().then(() => render());
