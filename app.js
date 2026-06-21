/* ── State ─────────────────────────────────────────────────── */
const S = {
  name: '', sleep: 7, water: 5, mood: 3, stress: 3, energy: 2,
  calY: new Date().getFullYear(), calM: new Date().getMonth(),
  fields: {}, hiddenBlocks: [], blockOrder: [], checks: {},
  entries: [], aiInsight: null, aiDismissed: false,
  insightPeriod: 7,
  consentData: false, consentLocation: false,
  exploreFilter: 'all', exploreSearch: '',
  weather: 'sunny'
};

function load() { try { const d = localStorage.getItem('jrnl'); if (d) Object.assign(S, JSON.parse(d)); } catch (e) { } }
function save() { try { localStorage.setItem('jrnl', JSON.stringify(S)); } catch (e) { } }
function escapeHtml(txt) {
  return String(txt).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function dateKey(d = new Date()) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function dateValue(key) { const [y, m, d] = String(key).split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function fieldKey(el) {
  if (el.id) return el.id;
  const card = el.closest('.block-card');
  const fields = [...document.querySelectorAll('input,textarea')];
  return `${card?.id || 'field'}-${fields.indexOf(el)}`;
}

/* ── Mood / Icon Helpers ─────────────────────────────────── */
const MOOD_ICONS = ['', 'ti-mood-cry', 'ti-mood-sad', 'ti-mood-empty', 'ti-mood-smile', 'ti-mood-happy'];
const MOOD_COLORS = ['', '#94A3B8', '#60A5FA', '#CBD5E1', '#4ADE80', '#10B981'];
const MOOD_BG = ['', '#F1F5F9', '#DBEAFE', '#F8FAFC', '#DCFCE7', '#D1FAE5'];
const MOOD_LABELS = ['', '매우 낮음', '낮음', '보통', '좋음', '매우 좋음'];

function moodDot(v) {
  const n = clamp(Math.round(Number(v)) || 3, 1, 5);
  return `<span class="mood-dot" style="background:${MOOD_COLORS[n]}"></span>`;
}
function moodIconHtml(v) {
  const n = clamp(Math.round(Number(v)) || 3, 1, 5);
  return `<i class="ti ${MOOD_ICONS[n]}" style="color:${MOOD_COLORS[n]};font-size:18px"></i>`;
}
function moodEmoji(v) { return moodDot(v); }
function moodText(v) { return MOOD_LABELS[Math.round(Number(v))] || '보통'; }

/* ── Recording Date ─────────────────────────────────────── */
let recordingDate = new Date();

function changeRecordingDate(dir) {
  const d = new Date(recordingDate);
  d.setDate(d.getDate() + dir);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (d > today) return;
  recordingDate = d;
  updateRecordingDateUI();
  loadEntryForDate(recordingDate);
}

function updateRecordingDateUI() {
  const today = new Date();
  const isToday = recordingDate.toDateString() === today.toDateString();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const el = document.getElementById('tb-date');
  if (el) {
    const dateStr = `${recordingDate.getFullYear()}년 ${recordingDate.getMonth() + 1}월 ${recordingDate.getDate()}일 · ${days[recordingDate.getDay()]}요일`;
    el.innerHTML = isToday
      ? `${dateStr} <span class="date-today-badge">오늘</span>`
      : `${dateStr} <span class="date-past-badge">과거</span>`;
  }
  const nextBtn = document.getElementById('date-nav-next');
  if (nextBtn) nextBtn.style.opacity = isToday ? '0.35' : '1';
  nextBtn && (nextBtn.style.cursor = isToday ? 'default' : 'pointer');

  const sub = document.querySelector('.home-sub');
  if (sub) {
    const isToday2 = recordingDate.toDateString() === new Date().toDateString();
    sub.textContent = isToday2 ? '생각과 감정을 자유롭게 남겨보세요.' : `${recordingDate.getMonth() + 1}월 ${recordingDate.getDate()}일 기록을 수정하고 있어요`;
  }
}

function loadEntryForDate(d) {
  const key = dateKey(d);
  const entry = getEntryByKey(key);
  if (entry) {
    S.mood = entry.mood || 3;
    S.sleep = entry.sleep != null ? entry.sleep : 7;
    S.stress = entry.stress || 3;
    S.water = entry.water || 5;
    restoreInteractiveState();
    const ta = document.getElementById('ta-note');
    if (ta) { ta.value = entry.note || ''; updateCount('ta-note', 'cnt-note'); }
  }
}

/* ── Navigation / History API ─────────────────────────────── */
const VALID_PAGES = ['home', 'explore', 'insights', 'blocks', 'settings'];
const PAGE_TITLES = { home: '', explore: '탐색', insights: '인사이트', blocks: '블록 라이브러리', settings: '설정' };

function _activatePage(id) {
  if (!VALID_PAGES.includes(id)) id = 'home';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + id);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const lnk = document.querySelector(`[data-page="${id}"]`);
  if (lnk) lnk.classList.add('active');
  closeSidebar();
  window.scrollTo(0, 0);

  const isHome = id === 'home';
  const homeControls = document.getElementById('topbar-home-controls');
  if (homeControls) homeControls.style.display = isHome ? 'flex' : 'none';
  const dateNav = document.getElementById('topbar-date-nav');
  if (dateNav) dateNav.style.display = isHome ? 'flex' : 'none';
  const pageTitle = document.getElementById('topbar-page-title');
  if (pageTitle) { pageTitle.textContent = PAGE_TITLES[id] || ''; pageTitle.style.display = isHome ? 'none' : 'block'; }

  if (id === 'insights') renderInsights();
  if (id === 'explore') renderEntries();
}

function goPage(id) {
  if (!VALID_PAGES.includes(id)) id = 'home';
  history.pushState({ page: id }, '', '#' + id);
  _activatePage(id);
}

window.addEventListener('popstate', e => {
  const page = e.state?.page || location.hash.slice(1) || 'home';
  _activatePage(page);
});

function initPageFromHash() {
  const hash = location.hash.slice(1);
  const page = VALID_PAGES.includes(hash) ? hash : 'home';
  history.replaceState({ page }, '', '#' + page);
  _activatePage(page);
}

/* ── Sidebar ─────────────────────────────────────────────── */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('nav-overlay');
  const icon = document.getElementById('hamburger-icon');
  sidebar.classList.toggle('mobile-open');
  overlay.classList.toggle('show');
  if (sidebar.classList.contains('mobile-open')) {
    icon.className = 'ti ti-x';
    document.getElementById('hamburger').classList.add('sidebar-open');
  } else {
    icon.className = 'ti ti-menu-2';
    document.getElementById('hamburger').classList.remove('sidebar-open');
  }
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('nav-overlay').classList.remove('show');
  document.getElementById('hamburger-icon').className = 'ti ti-menu-2';
  document.getElementById('hamburger').classList.remove('sidebar-open');
}

/* ── Onboarding ──────────────────────────────────────────── */
let obStep = 0;

function onbNext() {
  document.getElementById(`ob${obStep}`).classList.remove('active');
  if (obStep < 4) {
    obStep++;
    document.getElementById(`ob${obStep}`).classList.add('active');
    document.getElementById(`p${obStep}`).classList.add('done');
    document.getElementById('onb-back').style.display = 'block';
    document.getElementById('onb-skip').style.display = 'block';
    if (obStep === 4) document.querySelector('.onb-btn').textContent = '시작하기';
  } else {
    S.name = document.getElementById('onb-name').value.trim() || '사용자';
    save();
    startGen();
  }
}

function onbBack() {
  if (obStep === 0) return;
  document.getElementById(`ob${obStep}`).classList.remove('active');
  document.getElementById(`p${obStep}`).classList.remove('done');
  obStep--;
  document.getElementById(`ob${obStep}`).classList.add('active');
  if (obStep === 0) {
    document.getElementById('onb-back').style.display = 'none';
    document.getElementById('onb-skip').style.display = 'none';
  }
  document.querySelector('.onb-btn').textContent = obStep === 4 ? '시작하기' : '다음';
}

function onbSkip() { onbNext(); }

function startGen() {
  document.getElementById('onboarding-screen').style.display = 'none';
  const gs = document.getElementById('generating-screen');
  gs.style.display = 'flex';
  ['gi0', 'gi1', 'gi2', 'gi3'].forEach((id, i) =>
    setTimeout(() => document.getElementById(id).classList.add('show'), 500 + i * 600));
  setTimeout(() => {
    const b = document.getElementById('gen-done');
    b.style.opacity = '1'; b.style.pointerEvents = 'auto';
  }, 500 + 4 * 600 + 400);
}

function enterApp() {
  document.getElementById('generating-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  initApp();
}

function reOnboard() {
  if (!confirm('온보딩을 다시 시작하면 이름 설정이 초기화돼요. 기록 데이터는 유지돼요. 계속할까요?')) return;
  S.name = '';
  save();
  location.reload();
}

/* ── App Init ────────────────────────────────────────────── */
function initApp() {

  // 발표용 대학생 페르소나 기본 세팅
  S.hiddenBlocks = [
    'bc-weather',
    'bc-quote',
    'bc-meal'
  ];

  updateRecordingDateUI();
  updateGreeting();

  const n = S.name || '사용자';

  ['sb-avatar', 'set-avatar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = n.charAt(0);
  });

  ['sb-name', 'set-name', 'set-name-val'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = n;
  });

  restoreInteractiveState();
  initWater();
  renderCalendar();
  renderEntries();
  bindPersistentFields();
  updateActiveCount();
  renderInsights();
  restoreBlockOrder();
  initDragDrop();
  initConsentToggles();
  initPageFromHash();
}

function updateGreeting() {
  const n = S.name || '사용자';

  const el = document.getElementById('home-greeting');
  if (!el) return;

  el.textContent = `${n}님, 졸업전시 준비는 어떤가요?`;
}

/* ── Mood ────────────────────────────────────────────────── */
function setMood(btn, lvl) {
  document.querySelectorAll('.mood-opt').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  S.mood = lvl; save();
  showToast(`기분을 기록했어요`);
}

/* ── Sleep ───────────────────────────────────────────────── */
function adjSleep(d) {
  S.sleep = Math.max(0, Math.min(12, S.sleep + d));
  document.getElementById('sv').textContent = S.sleep % 1 === 0 ? S.sleep : S.sleep.toFixed(1);
  const p = Math.min(100, Math.round(S.sleep / 8 * 100));
  document.getElementById('sf').style.width = p + '%';
  document.getElementById('sh').textContent = `권장 수면의 ${p}%`;
  save();
}

/* ── Checkbox ────────────────────────────────────────────── */
function toggleCb(el) { el.classList.toggle('on'); S.checks[checkKey(el)] = el.classList.contains('on'); save(); }
function checkKey(el) { return [...document.querySelectorAll('.checkbox')].indexOf(el); }

/* ── Counter ─────────────────────────────────────────────── */
function updateCount(taId, cntId) {
  const ta = document.getElementById(taId);
  if (ta) document.getElementById(cntId).textContent = `${ta.value.length} / 140`;
}

/* ── Water ───────────────────────────────────────────────── */
function initWater() {
  const wrap = document.getElementById('water-cups');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const c = document.createElement('div');
    c.className = 'wcup' + (i < (S.water || 5) ? ' on' : '');
    c.onclick = () => {
      const idx = Array.from(wrap.children).indexOf(c);
      S.water = c.classList.contains('on') && idx === S.water - 1 ? idx : idx + 1;
      Array.from(wrap.children).forEach((x, j) => x.classList.toggle('on', j < S.water));
      document.getElementById('water-lbl').textContent = `${S.water} / 8 잔`;
      save();
    };
    wrap.appendChild(c);
  }
  const lbl = document.getElementById('water-lbl');
  if (lbl) lbl.textContent = `${S.water || 5} / 8 잔`;
}

/* ── Scales ──────────────────────────────────────────────── */
const stressLabels = ['', '매우 낮음', '낮음', '보통', '높음', '매우 높음'];
function setScale(type, btn, lvl) {
  const scaleId = type + '-scale';
  document.querySelectorAll(`#${scaleId} button`).forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  S[type] = lvl;
  if (type === 'stress') { const lbl = document.getElementById('stress-lbl'); if (lbl) lbl.textContent = stressLabels[lvl]; }
  save();
}

/* ── Weather ─────────────────────────────────────────────── */
function setWeather(btn) {
  document.querySelectorAll('.weather-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  S.weather = btn.dataset.w || 'sunny';
  save();
}

/* ── Exercise ────────────────────────────────────────────── */
function setExType(el) { el.classList.toggle('on'); }

/* ── Quote ───────────────────────────────────────────────── */
const quotes = [
  { q: '"시작이 반이다."', s: '— 아리스토텔레스' },
  { q: '"우리가 반복적으로 하는 것이 바로 우리다."', s: '— 아리스토텔레스' },
  { q: '"천 리 길도 한 걸음부터."', s: '— 노자' },
  { q: '"오늘 할 수 있는 일을 내일로 미루지 말라."', s: '— 벤자민 프랭클린' },
  { q: '"성장은 불편함 속에서 일어난다."', s: '— 작자 미상' },
  { q: '"기록하지 않으면 사라진다."', s: '— 작자 미상' }
];
let qIdx = 0;
function nextQuote() {
  qIdx = (qIdx + 1) % quotes.length;
  document.getElementById('q-text').textContent = quotes[qIdx].q;
  document.getElementById('q-src').textContent = quotes[qIdx].s;
}

/* ── KPT ─────────────────────────────────────────────────── */
function switchKpt(btn, tab) {
  document.querySelectorAll('.kpt-tab').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll('.kpt-panel').forEach(p => p.classList.remove('on'));
  document.getElementById('kp-' + tab).classList.add('on');
}

/* ── Checklist ───────────────────────────────────────────── */
function addCheckItem() {
  const txt = prompt('할 일을 입력하세요:');
  if (!txt) return;
  const row = document.createElement('div');
  row.className = 'cl-row';
  row.innerHTML = `<div class="checkbox" onclick="toggleCb(this)"></div><span class="cl-label">${escapeHtml(txt)}</span>`;
  document.getElementById('cl-items').appendChild(row);
  S.fields.checklistHtml = document.getElementById('cl-items').innerHTML;
  save();
}

/* ── Photo ───────────────────────────────────────────────── */
function handlePhoto(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    const drop = document.getElementById('photo-drop');
    drop.innerHTML = `
      <img src="${ev.target.result}" alt="오늘의 사진">
      <button class="photo-remove-btn" onclick="removePhoto(event)" title="사진 제거">
        <i class="ti ti-x"></i>
      </button>`;
    drop.classList.add('has-image');
  };
  r.readAsDataURL(f);
}

function removePhoto(e) {
  e.stopPropagation();
  const drop = document.getElementById('photo-drop');
  drop.innerHTML = `<i class="ti ti-camera-plus"></i><span>사진 추가하기</span>`;
  drop.classList.remove('has-image');
  document.getElementById('photo-file').value = '';
}

/* ── Block Toggle (library) ──────────────────────────────── */
function toggleBlock(blockId, toggleEl) {
  toggleEl.classList.toggle('on');
  const b = document.getElementById(blockId);
  const hidden = !toggleEl.classList.contains('on');
  if (b) b.classList.toggle('hidden', hidden);
  S.hiddenBlocks = [...new Set(S.hiddenBlocks.filter(id => id !== blockId).concat(hidden ? [blockId] : []))];
  // Sync any other toggle with same blockId
  document.querySelectorAll(`[id="lib-toggle-${blockId}"]`).forEach(t => {
    t.classList.toggle('on', !hidden);
  });
  save(); updateActiveCount();
  showToast(hidden ? '블록을 숨겼어요' : '블록을 다시 표시했어요');
}



/* ── Block Context Menu (⋮) ─────────────────────────────── */
let _ctxBlockId = null;

function openBlockMenu(e, blockId) {
  e.stopPropagation();
  _ctxBlockId = blockId;
  const menu = document.getElementById('block-ctx-menu');
  if (!menu) return;

  // Position menu
  const btnRect = e.currentTarget.getBoundingClientRect();
  menu.style.display = 'block'; // temp show to measure
  const mW = menu.offsetWidth;
  const mH = menu.offsetHeight;
  menu.style.display = '';

  let left = btnRect.right - mW;
  let top = btnRect.bottom + 6;
  if (left < 8) left = 8;
  if (top + mH > window.innerHeight - 8) top = btnRect.top - mH - 6;
  menu.style.left = left + 'px';
  menu.style.top = (top + window.scrollY) + 'px';
  menu.classList.add('show');

  setTimeout(() => document.addEventListener('click', closeBlockMenuOutside, { once: true }), 10);
}

function closeBlockMenuOutside() {
  document.getElementById('block-ctx-menu')?.classList.remove('show');
}

function closeBlockMenu() {
  document.getElementById('block-ctx-menu')?.classList.remove('show');
}

/* ctx: remove from home */
let _pendingRemoveBlockId = null;
function ctxRemoveBlock() {
  closeBlockMenu();
  if (!_ctxBlockId) return;
  _pendingRemoveBlockId = _ctxBlockId;
  document.getElementById('remove-block-modal').classList.add('show');
}

function closeRemoveBlockModal() {
  document.getElementById('remove-block-modal').classList.remove('show');
  _pendingRemoveBlockId = null;
}

function confirmRemoveBlock() {
  if (!_pendingRemoveBlockId) return;
  const blockId = _pendingRemoveBlockId;
  closeRemoveBlockModal();

  const card = document.getElementById(blockId);
  if (card) card.classList.add('hidden');
  if (!S.hiddenBlocks.includes(blockId)) S.hiddenBlocks.push(blockId);

  // Sync library toggle
  const toggle = document.getElementById(`lib-toggle-${blockId}`);
  if (toggle) toggle.classList.remove('on');

  // Also sync old-style toggles
  document.querySelectorAll('.toggle').forEach(t => {
    const match = t.getAttribute('onclick')?.match(/'(bc-[^']+)'/);
    if (match && match[1] === blockId) t.classList.remove('on');
  });

  save(); updateActiveCount();
  showToast('블록을 제거했어요. 블록 라이브러리에서 복원할 수 있어요.');
}

/* ── Block Drag & Drop (improved) ───────────────────────── */
let dragSrc = null;
let dropIndicator = null;

function getDropIndicator() {
  if (!dropIndicator) {
    dropIndicator = document.createElement('div');
    dropIndicator.className = 'drag-drop-indicator';
    dropIndicator.style.cssText = `
      height:3px;border-radius:2px;background:var(--accent);
      margin:2px 0;transition:none;pointer-events:none;
    `;
  }
  return dropIndicator;
}

function initDragDrop() {
  const grid = document.getElementById('blocks-grid');
  if (!grid) return;

  grid.querySelectorAll('.block-card').forEach(card => {
    const handle = card.querySelector('.drag-handle');

    // Only allow drag when handle is grabbed
    handle?.addEventListener('mousedown', () => {
      card.draggable = true;
    });
    handle?.addEventListener('touchstart', () => {
      card.draggable = true;
    }, { passive: true });

    card.addEventListener('mouseup', () => {
      if (!dragSrc) card.draggable = false;
    });

    card.addEventListener('dragstart', e => {
      if (!card.draggable) { e.preventDefault(); return; }
      dragSrc = card;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.id);
      // Delay visual so drag image captures normal state
      requestAnimationFrame(() => card.classList.add('dragging'));
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      card.draggable = false;
      dragSrc = null;
      // Remove indicator
      const ind = document.querySelector('.drag-drop-indicator');
      if (ind && ind.parentNode) ind.parentNode.removeChild(ind);
      grid.querySelectorAll('.block-card').forEach(c => c.classList.remove('drag-over'));
      saveBlockOrder();
    });

    card.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragSrc || card === dragSrc) return;
      e.dataTransfer.dropEffect = 'move';

      grid.querySelectorAll('.block-card').forEach(c => c.classList.remove('drag-over'));

      const rect = card.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const ind = getDropIndicator();

      if (e.clientY < mid) {
        // Insert before card
        grid.insertBefore(ind, card);
        grid.insertBefore(dragSrc, card);
      } else {
        // Insert after card
        const next = card.nextSibling;
        if (next) {
          grid.insertBefore(ind, next);
          grid.insertBefore(dragSrc, next);
        } else {
          grid.appendChild(ind);
          grid.appendChild(dragSrc);
        }
      }
    });

    card.addEventListener('dragleave', e => {
      // Only remove if actually leaving to outside grid
      if (!grid.contains(e.relatedTarget)) {
        const ind = document.querySelector('.drag-drop-indicator');
        if (ind && ind.parentNode) ind.parentNode.removeChild(ind);
      }
    });

    card.addEventListener('drop', e => {
      e.preventDefault();
      const ind = document.querySelector('.drag-drop-indicator');
      if (ind && ind.parentNode) ind.parentNode.removeChild(ind);
    });
  });

  // Also handle grid-level dragover for edge cases
  grid.addEventListener('dragover', e => e.preventDefault());
  grid.addEventListener('drop', e => {
    e.preventDefault();
    const ind = document.querySelector('.drag-drop-indicator');
    if (ind && ind.parentNode) ind.parentNode.removeChild(ind);
  });
}

function saveBlockOrder() {
  S.blockOrder = [...document.querySelectorAll('#blocks-grid [id^="bc-"]')].map(el => el.id);
  save();
}

function restoreBlockOrder() {
  if (!S.blockOrder || !S.blockOrder.length) return;
  const grid = document.getElementById('blocks-grid');
  if (!grid) return;
  S.blockOrder.forEach(id => {
    const el = document.getElementById(id);
    if (el) grid.appendChild(el);
  });
}

/* ── Block Info Popup ────────────────────────────────────── */
const blockInfoData = {
  'bc-mood': { name: '오늘의 기분', desc: '하루의 감정 상태를 5단계로 기록해요. 수면·습관 데이터와 함께 분석하면 기분 패턴을 발견할 수 있어요.' },
  'bc-sleep': { name: '수면 기록', desc: '매일 수면 시간을 기록하면 패턴을 파악하고 수면 질 개선에 활용할 수 있어요. 권장 수면은 8시간이에요.' },
  'bc-energy': { name: '에너지 레벨', desc: '낮음·보통·높음 3단계로 하루의 활력 상태를 간단하게 체크해요.' },
  'bc-habit': { name: '습관 체크', desc: '매일 반복하고 싶은 습관을 체크리스트로 관리해요. 달성률이 인사이트에 자동 집계돼요.' },
  'bc-stress': { name: '스트레스 지수', desc: '1~5단계로 하루의 스트레스 수준을 기록해요. 패턴 분석을 통해 스트레스 요인을 파악할 수 있어요.' },
  'bc-water': { name: '수분 섭취', desc: '8잔을 목표로 하루 물 마시기를 트래킹해요. 충분한 수분 섭취는 집중력과 건강에 도움이 돼요.' },
  'bc-weather': { name: '날씨', desc: '오늘의 날씨와 기온을 기록해요. 날씨와 기분의 상관관계를 나중에 살펴볼 수 있어요.' },
  'bc-quote': { name: '오늘의 인용구', desc: '영감을 주는 문장을 매일 만나요. 버튼을 누르면 새로운 문구로 바뀌어요.' },
  'bc-note': { name: '오늘의 한 줄', desc: '하루를 한 문장으로 압축해요. 140자 제한으로 핵심만 남기는 습관을 만들 수 있어요.' },
  'bc-gratitude': { name: '감사 일기', desc: '매일 감사한 3가지를 기록하면 긍정적 마인드셋 형성에 도움이 돼요. 심리학 연구로 검증된 방법이에요.' },
  'bc-freewrite': { name: '프리라이팅', desc: '형식 없이 생각나는 대로 써내려가는 방법이에요. 머릿속을 비우고 창의적 사고를 자극해요.' },
  'bc-checklist': { name: '오늘의 할 일', desc: '오늘 해야 할 일들을 체크리스트로 관리해요. 완료한 항목에 체크하면서 성취감을 느낄 수 있어요.' },
  'bc-4l': { name: 'LLLL 회고', desc: '애자일 회고 방법론. Liked(좋았던), Learned(배운), Lacked(부족한), Longed for(바라는)를 각각 기록해요.' },
  'bc-kpt': { name: 'KPT 회고', desc: '지속할 것(Keep), 문제(Problem), 시도할 것(Try)을 정리하는 회고 프레임워크예요.' },
  'bc-goal': { name: '목표 달성도', desc: '장기 목표의 진행률을 시각적으로 표시해요. 목표를 눈에 보이게 하면 달성 가능성이 높아져요.' },
  'bc-exercise': { name: '운동 기록', desc: '운동 종류·시간·강도를 기록해요. 꾸준한 운동 기록이 건강 습관 형성에 도움이 돼요.' },
  'bc-meal': { name: '식사 기록', desc: '아침·점심·저녁 식사를 기록해요. 식습관을 파악하고 균형 잡힌 식단 관리에 활용할 수 있어요.' },
  'bc-photo': { name: '오늘의 사진', desc: '하루를 사진 한 장으로 기억해요. 시간이 지나면 사진 한 장이 긴 글보다 더 생생하게 기억을 되살려줘요.' }
};

function showBlockInfo(blockId, e) {
  e.stopPropagation();
  const info = blockInfoData[blockId];
  if (!info) return;
  const popup = document.getElementById('block-info-popup');
  if (!popup) return;
  popup.querySelector('.bip-name').textContent = info.name;
  popup.querySelector('.bip-desc').textContent = info.desc;
  const rect = e.currentTarget.getBoundingClientRect();
  const popW = 240;
  let left = rect.left;
  if (left + popW > window.innerWidth - 16) left = window.innerWidth - popW - 16;
  popup.style.top = (rect.bottom + 8 + window.scrollY) + 'px';
  popup.style.left = left + 'px';
  popup.classList.add('show');
  setTimeout(() => document.addEventListener('click', closeBlockInfo, { once: true }), 10);
}

function closeBlockInfo() {
  const popup = document.getElementById('block-info-popup');
  if (popup) popup.classList.remove('show');
}

/* ── Date Picker ─────────────────────────────────────────── */
let dpY = new Date().getFullYear();
let dpM = new Date().getMonth();

function openDatePicker() {
  // Sync to current recording date
  dpY = recordingDate.getFullYear();
  dpM = recordingDate.getMonth();
  renderDatePicker();

  const popup = document.getElementById('date-picker-popup');
  const overlay = document.getElementById('date-picker-overlay');
  const dateEl = document.getElementById('tb-date');

  // Position below tb-date
  const rect = dateEl.getBoundingClientRect();
  popup.style.top = (rect.bottom + 8 + window.scrollY) + 'px';
  const pLeft = rect.left;
  const pW = 270;
  let left = pLeft;
  if (left + pW > window.innerWidth - 8) left = window.innerWidth - pW - 8;
  if (left < 8) left = 8;
  popup.style.left = left + 'px';

  overlay.classList.add('show');
  popup.classList.add('show');
}

function closeDatePicker() {
  document.getElementById('date-picker-popup')?.classList.remove('show');
  document.getElementById('date-picker-overlay')?.classList.remove('show');
}

function dpChangeMonth(dir) {
  dpM += dir;
  if (dpM < 0) { dpM = 11; dpY--; }
  if (dpM > 11) { dpM = 0; dpY++; }
  renderDatePicker();
}

function renderDatePicker() {
  const lbl = document.getElementById('dp-month-lbl');
  if (lbl) lbl.textContent = `${dpY}년 ${dpM + 1}월`;

  const wrap = document.getElementById('dp-days');
  if (!wrap) return;
  wrap.innerHTML = '';

  const today = new Date();
  const selKey = dateKey(recordingDate);

  const firstDay = new Date(dpY, dpM, 1).getDay();
  const lastDate = new Date(dpY, dpM + 1, 0).getDate();
  const prevLast = new Date(dpY, dpM, 0).getDate();

  // Prev month placeholders
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = document.createElement('div');
    d.className = 'dp-day dp-other';
    d.textContent = prevLast - i;
    wrap.appendChild(d);
  }

  // Current month
  for (let day = 1; day <= lastDate; day++) {
    const thisDate = new Date(dpY, dpM, day);
    const key = dateKey(thisDate);
    const isFuture = thisDate > today;
    const isToday = thisDate.toDateString() === today.toDateString();
    const isSelected = key === selKey;

    const d = document.createElement('div');
    d.className = 'dp-day' +
      (isToday ? ' dp-today' : '') +
      (isSelected ? ' dp-selected' : '') +
      (isFuture ? ' dp-disabled' : '');
    d.textContent = day;

    if (!isFuture) {
      d.onclick = () => {
        recordingDate = thisDate;
        updateRecordingDateUI();
        loadEntryForDate(recordingDate);
        closeDatePicker();
        showToast(`${dpM + 1}월 ${day}일로 이동했어요`);
      };
    }
    wrap.appendChild(d);
  }

  // Next month placeholders (fill to complete grid)
  const total = firstDay + lastDate;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 1; i <= remaining; i++) {
    const d = document.createElement('div');
    d.className = 'dp-day dp-other';
    d.textContent = i;
    wrap.appendChild(d);
  }
}

/* ── Calendar & Entries ──────────────────────────────────── */
const sampleEntries = {
  '2026-4-10': {
  mood: 4,
  text: '오늘 UX 프로젝트 팀이 확정됐다.',
  tags: ['팀플']
},

'2026-4-11': {
  mood: 3,
  text: '사용자 조사 계획을 세우기 시작했다. 어떤 질문을 해야 의미 있는 답변을 얻을 수 있을지 고민이 많았다.',
  tags: ['리서치']
},

'2026-4-12': {
  mood: 5,
  text: `카페에서 포트폴리오 작업을 했다. 예전 프로젝트들을 다시 정리하다 보니 그때는 보이지 않았던 문제점들도 많이 보였다.
아직 수정해야 할 부분은 많지만 조금씩 방향이 잡히는 느낌이다.`,
  tags: ['포트폴리오']
},

'2026-4-13': {
  mood: 5,
  text: `교수님께 프로젝트 기획안 피드백을 받았다.
생각보다 긍정적인 평가를 받아 기분이 좋았다.
특히 문제 정의 부분이 명확하다는 이야기를 들어 자신감이 조금 생겼다.`,
  tags: ['피드백']
},

'2026-4-14': {
  mood: 2,
  text: '수업이 연달아 있어서 너무 피곤했다.',
  tags: ['수업']
},

'2026-4-15': {
  mood: 4,
  text: '사용자 인터뷰 질문지를 작성했다. 생각보다 질문을 만드는 일이 쉽지 않았다.',
  tags: ['인터뷰']
},

'2026-4-16': {
  mood: 5,
  text: `첫 사용자 인터뷰를 진행했다.
예상했던 답변도 있었지만 전혀 생각하지 못했던 의견도 들을 수 있었다.
인터뷰를 진행할수록 실제 사용자는 내가 생각했던 것과 다르다는 점을 느끼게 된다.`,
  tags: ['인터뷰']
},

'2026-4-17': {
  mood: 3,
  text: '인터뷰 녹취를 정리했다.',
  tags: ['정리']
},

'2026-4-18': {
  mood: 4,
  text: `친구들과 디자인 전시를 보러 갔다.
인터랙티브 작업들이 특히 인상적이었다.
졸업전시를 준비할 때 참고해보고 싶은 아이디어도 몇 가지 발견했다.`,
  tags: ['전시']
},

'2026-4-19': {
  mood: 5,
  text: `어제 전시에서 본 아이디어들을 정리해봤다.
생각보다 프로젝트에 적용할 수 있는 부분이 많았다.
오랜만에 작업 의욕이 크게 올라가는 하루였다.`,
  tags: ['아이디어']
},

'2026-4-20': {
  mood: 3,
  text: '월요일이라 해야 할 일이 한꺼번에 몰려 있었다.',
  tags: ['계획']
},

'2026-4-21': {
  mood: 2,
  text: `팀플 회의 시간을 잡는 데만 한참이 걸렸다.
프로젝트보다 일정 조율이 더 어려운 것 같다.`,
  tags: ['팀플']
},

'2026-4-22': {
  mood: 4,
  text: '팀 회의를 진행했다. 방향성이 조금 더 구체적으로 잡히기 시작했다.',
  tags: ['회의']
},

'2026-4-23': {
  mood: 4,
  text: `피그마에서 와이어프레임 작업을 시작했다.
구조를 잡는 단계라 아직 투박하지만 서비스의 모습이 조금씩 보이기 시작했다.`,
  tags: ['피그마']
},

'2026-4-24': {
  mood: 5,
  text: `와이어프레임 초안을 완성했다.
아직 부족한 부분은 많지만 화면 흐름은 어느 정도 정리된 것 같다.
팀원들에게 공유했더니 반응도 괜찮았다.`,
  tags: ['와이어프레임']
},

'2026-4-25': {
  mood: 4,
  text: '주말 동안 레퍼런스를 수집했다.',
  tags: ['리서치']
},

'2026-4-26': {
  mood: 5,
  text: `친구와 카페에서 같이 작업했다.
혼자 할 때보다 집중도 훨씬 잘 됐다.
가끔은 작업 환경을 바꾸는 것도 중요한 것 같다.`,
  tags: ['카페']
},

'2026-4-27': {
  mood: 3,
  text: '발표 자료 제작을 시작했다.',
  tags: ['발표']
},

'2026-4-28': {
  mood: 4,
  text: `사용자 여정을 다시 정리했다.
처음에는 단순하다고 생각했는데 실제로 그려보니 생각보다 복잡했다.`,
  tags: ['UX']
},

'2026-4-29': {
  mood: 2,
  text: `과제 마감이 겹쳤다.
해야 할 일은 많은데 시간이 부족하게 느껴졌다.
오늘은 거의 하루 종일 노트북 앞에 앉아 있었던 것 같다.`,
  tags: ['과제']
},

'2026-4-30': {
  mood: 4,
  text: '우선순위를 다시 정리하니 조금 숨통이 트였다.',
  tags: ['정리']
},

'2026-5-01': {
  mood: 5,
  text: `연휴 첫날.
오랜만에 마음 편하게 늦잠도 자고 밀려 있던 개인 작업도 조금 진행했다.`,
  tags: ['휴식']
},

'2026-5-02': {
  mood: 5,
  text: '친구들과 전시를 보고 맛있는 저녁을 먹었다.',
  tags: ['친구']
},

'2026-5-03': {
  mood: 4,
  text: `하루 종일 특별한 일정 없이 쉬었다.
최근 몇 주 동안 과제가 많았는데 잠시라도 쉬어갈 수 있어서 좋았다.`,
  tags: ['휴식']
},

'2026-5-04': {
  mood: 3,
  text: '연휴가 끝나간다는 생각에 괜히 아쉬웠다.',
  tags: ['일상']
},

'2026-5-05': {
  mood: 4,
  text: `포트폴리오를 업데이트했다.
예전 프로젝트 설명을 읽어보니 수정하고 싶은 부분이 꽤 많았다.`,
  tags: ['포트폴리오']
},

'2026-5-06': {
  mood: 3,
  text: '연휴 이후 첫 수업이라 집중하기가 쉽지 않았다.',
  tags: ['수업']
},

'2026-5-07': {
  mood: 2,
  text: `하루 종일 과제를 했다.
진도는 많이 나갔지만 체력이 거의 바닥난 느낌이다.
오늘은 일찍 자야겠다.`,
  tags: ['과제']
},

'2026-5-08': {
  mood: 4,
  text: `프로토타입을 수정했다.
사용자 흐름을 조금만 바꿨는데도 사용성이 꽤 좋아진 것 같다.
작은 변화가 생각보다 큰 차이를 만든다는 걸 느꼈다.`,
  tags: ['프로토타입']
},

'2026-5-09': {
  mood: 5,
  text: `이번 주 계획했던 작업을 대부분 마무리했다.
완벽하진 않지만 목표했던 범위는 달성했다.
오랜만에 성취감이 크게 느껴지는 하루였다.`,
  tags: ['성취']
},

'2026-5-10': {
  mood: 4,
  text: '주말이라 늦잠을 자고 여유롭게 하루를 시작했다.',
  tags: ['주말']
},

'2026-5-11': {
  mood: 4,
  text: `프로젝트 방향성을 다시 정리했다.
그동안 수집한 인터뷰 결과를 보니 생각보다 공통된 패턴이 많이 보였다.`,
  tags: ['프로젝트']
},

'2026-5-12': {
  mood: 3,
  text: '과제와 팀플 일정이 겹쳐 조금 정신없는 하루였다.',
  tags: ['과제']
},

'2026-5-13': {
  mood: 2,
  text: `발표 준비가 생각보다 오래 걸렸다.
자료를 만들다 보니 아직 정리되지 않은 부분들이 많이 보였다.
계획보다 늦게 잠들었다.`,
  tags: ['발표']
},

'2026-5-14': {
  mood: 4,
  text: '점심시간에 친구와 산책을 했다. 머리가 조금 정리되는 느낌이었다.',
  tags: ['산책']
},

'2026-5-15': {
  mood: 5,
  text: `이번 주 과제를 모두 제출했다.
오랫동안 붙잡고 있던 작업을 끝내니 후련했다.
주말에는 조금 쉬고 싶다.`,
  tags: ['성취']
},

'2026-5-16': {
  mood: 5,
  text: `카페에서 포트폴리오 작업을 했다.
집중도 잘 되고 작업도 생각보다 많이 진행됐다.
이런 날이 자주 있었으면 좋겠다.`,
  tags: ['포트폴리오']
},

'2026-5-17': {
  mood: 5,
  text: '하루 종일 쉬면서 에너지를 충전했다.',
  tags: ['휴식']
},

'2026-5-18': {
  mood: 4,
  text: `새로운 한 주 계획을 세웠다.
이번 주는 프로토타입 완성도를 높이는 것이 목표다.`,
  tags: ['계획']
},

'2026-5-19': {
  mood: 4,
  text: `아침에 일찍 학교에 도착했다.
오전에는 집중이 잘 돼서 생각보다 많은 작업을 처리할 수 있었다.`,
  tags: ['집중']
},

'2026-5-20': {
  mood: 3,
  text: '팀플 회의가 길어지면서 하루가 금방 지나갔다.',
  tags: ['팀플']
},

'2026-5-21': {
  mood: 2,
  text: `수업과 과제가 겹쳐 피곤함이 많이 느껴졌다.
집에 돌아오니 아무것도 하기 싫을 정도였다.`,
  tags: ['피곤']
},

'2026-5-22': {
  mood: 4,
  text: `프로토타입 화면을 수정했다.
사용 흐름이 훨씬 자연스러워진 것 같아 만족스럽다.`,
  tags: ['프로토타입']
},

'2026-5-23': {
  mood: 5,
  text: `프로젝트 중간 발표가 있었다.
발표 전에는 많이 긴장했지만 생각보다 반응이 좋았다.
교수님께서 문제 정의가 명확하다고 평가해주셔서 뿌듯했다.
남은 작업도 잘 마무리하고 싶다.`,
  tags: ['발표']
},

'2026-5-24': {
  mood: 4,
  text: `주말이라 카페에서 개인 작업을 했다.
사람 구경도 하고 음악도 들으면서 여유롭게 시간을 보냈다.`,
  tags: ['카페']
},

'2026-5-25': {
  mood: 5,
  text: '친구들과 저녁을 먹으며 오랜만에 수다를 떨었다.',
  tags: ['친구']
},

'2026-5-26': {
  mood: 3,
  text: '월요일이라 조금 적응이 필요했다.',
  tags: ['월요일']
},

'2026-5-27': {
  mood: 2,
  text: `이번 주 해야 할 일이 갑자기 늘어났다.
과제와 프로젝트 일정이 겹치면서 부담감도 커졌다.
하루 종일 일정표만 들여다본 것 같다.`,
  tags: ['스트레스']
},

'2026-5-28': {
  mood: 4,
  text: `사용자 인터뷰 내용을 정리했다.
처음에는 보이지 않던 패턴들이 하나씩 보이기 시작했다.`,
  tags: ['인터뷰']
},

'2026-5-29': {
  mood: 5,
  text: `피그마에서 프로토타입을 수정했다.
며칠 동안 고민하던 문제를 해결할 방법을 찾았다.
덕분에 전체 흐름도 훨씬 자연스러워졌다.
오랜만에 작업이 정말 잘 풀리는 날이었다.`,
  tags: ['피그마']
},

'2026-5-30': {
  mood: 4,
  text: '가족과 통화를 하며 여유로운 시간을 보냈다.',
  tags: ['가족']
},

'2026-5-31': {
  mood: 5,
  text: `이번 달 목표를 대부분 달성했다.
완벽하지는 않지만 꾸준히 기록하고 작업한 덕분에 많이 성장한 느낌이다.`,
  tags: ['성장']
},

'2026-6-1': {
  mood: 4,
  text: '새로운 달이 시작됐다. 이번 달 목표도 다시 정리해봤다.',
  tags: ['목표']
},

'2026-6-2': {
  mood: 3,
  text: `오후가 되니 집중력이 많이 떨어졌다.
짧게 산책을 하고 나서야 다시 작업을 이어갈 수 있었다.`,
  tags: ['집중력']
},

'2026-6-3': {
  mood: 2,
  text: '어제 늦게 자서 그런지 하루 종일 피곤했다.',
  tags: ['수면부족']
},

'2026-6-4': {
  mood: 4,
  text: `프로젝트 마감 일정이 조금씩 가까워지고 있다.
해야 할 일은 많지만 그래도 계획대로 진행되고 있다.`,
  tags: ['프로젝트']
},

'2026-6-5': {
  mood: 5,
  text: `오랜만에 작업이 정말 잘 됐다.
막혀 있던 부분이 한 번에 해결되면서 전체 구조도 훨씬 깔끔해졌다.
오늘은 꽤 만족스러운 하루였다.`,
  tags: ['성취']
},

'2026-6-6': {
  mood: 4,
  text: '주말 동안 독서를 하고 전시도 보러 다녀왔다.',
  tags: ['전시']
},

'2026-6-7': {
  mood: 5,
  text: `특별한 일정 없이 푹 쉬었다.
카페에서 책을 읽고 음악을 들으며 여유로운 시간을 보냈다.
이런 하루가 가끔은 꼭 필요한 것 같다.`,
  tags: ['휴식']
},

'2026-6-8': {
  mood: 3,
  text: `월요일이라 해야 할 일이 한꺼번에 몰려 있었다.
주말 동안 미뤄둔 작업들을 정리하느라 시간이 금방 지나갔다.`,
  tags: ['업무']
},

'2026-6-9': {
  mood: 4,
  text: `포트폴리오를 다시 점검했다.
예전보다 훨씬 정리가 잘 되어 있는 것 같아 조금 뿌듯했다.`,
  tags: ['포트폴리오']
},

'2026-6-10': {
  mood: 5,
  text: `졸전 프로젝트 진행 상황을 점검했다.
생각보다 많은 부분이 완성되어 있었다.
몇 달 전과 비교하면 정말 많은 변화가 있었다.
남은 기간 동안 완성도를 더 높여보고 싶다.`,
  tags: ['프로젝트', '졸업전시']
},


};

function renderCalendar() {
  const y = S.calY, m = S.calM;
  document.getElementById('cal-m').textContent = `${y}년 ${m + 1}월`;
  const first = new Date(y, m, 1).getDay();
  const last = new Date(y, m + 1, 0).getDate();
  const prevLast = new Date(y, m, 0).getDate();
  const today = new Date();
  const wrap = document.getElementById('cal-days');
  wrap.innerHTML = '';
  for (let i = first - 1; i >= 0; i--) {
    const d = document.createElement('div');
    d.className = 'cal-day other';
    d.innerHTML = `<span class="cal-dn">${prevLast - i}</span>`;
    wrap.appendChild(d);
  }
  for (let day = 1; day <= last; day++) {
    const key = `${y}-${m + 1}-${day}`;
    const entry = getEntryByKey(key) || sampleEntries[key];
    const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === day;
    const d = document.createElement('div');
    d.className = 'cal-day' + (isToday ? ' today' : '') + (entry ? ' has-entry' : '');
    const moodN = entry ? (typeof entry.mood === 'number' ? entry.mood : 3) : 0;
    d.innerHTML = (entry ? `<span class="cal-mood-dot" style="background:${MOOD_COLORS[moodN] || MOOD_COLORS[3]}"></span>` : '') +
      `<span class="cal-dn">${day}</span>`;
    if (entry) d.onclick = () => showEntryPreview(key, entry);
    wrap.appendChild(d);
  }
}

function showEntryPreview(key, entry) {

  const [y, m, d] = key.split('-');

  document.getElementById('entry-modal-date').textContent =
    `${y}년 ${m}월 ${d}일`;

  document.getElementById('entry-modal-mood').innerHTML =
    `
    ${moodIconHtml(entry.mood)}
    <span style="margin-left:8px">
      ${moodText(entry.mood)}
    </span>
    `;

  document.getElementById('entry-modal-text').textContent =
    entry.text || '';

  document.getElementById('entry-modal-tags').innerHTML =
    (entry.tags || [])
      .map(tag =>
        `<span class="tag">#${tag}</span>`
      )
      .join('');

  document
    .getElementById('entry-modal')
    .classList
    .add('show');
}

function closeEntryModal() {

  document
    .getElementById('entry-modal')
    .classList
    .remove('show');

}

function chMonth(d) {
  S.calM += d;
  if (S.calM < 0) { S.calM = 11; S.calY--; }
  if (S.calM > 11) { S.calM = 0; S.calY++; }
  save();
  renderCalendar();
}

/* ── Explore Search & Filter ─────────────────────────────── */
let exploreSearchTerm = '';
let exploreMoodFilter = 'all';

let advancedFilters = {
  goodMood: false,
  badMood: false,
  sleepLow: false,
  sleepHigh: false
};

function applyAdvancedFilter() {

  advancedFilters.goodMood =
    document.getElementById('filter-good-mood').checked;

  advancedFilters.badMood =
    document.getElementById('filter-bad-mood').checked;

  advancedFilters.sleepLow =
    document.getElementById('filter-sleep-low').checked;

  advancedFilters.sleepHigh =
    document.getElementById('filter-sleep-high').checked;

  renderEntries();

  toggleAdvancedFilter();

}

function resetAdvancedFilter() {

  document.getElementById('filter-good-mood').checked = false;

  document.getElementById('filter-bad-mood').checked = false;

  document.getElementById('filter-sleep-low').checked = false;

  document.getElementById('filter-sleep-high').checked = false;

  advancedFilters = {
    goodMood: false,
    badMood: false,
    sleepLow: false,
    sleepHigh: false
  };

  renderEntries();

}

function filterEntries() {
  const searchInput = document.getElementById('explore-search');
  exploreSearchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  renderEntries();
}

function setExploreFilter(mood, btn) {
  exploreMoodFilter = String(mood);
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderEntries();
}

function renderEntries() {
  const list = document.getElementById('entry-list');
  if (!list) return;
  const saved = (S.entries || []).map(e => [e.date, {
    mood: e.mood || 3, moodNum: e.mood || 3,
    text: e.note || '저장된 오늘의 기록', tags: ['내 기록']
  }]);
  const sampleMapped = Object.entries(sampleEntries).map(([k, e]) => [k, {
    mood: e.mood, moodNum: e.mood, text: e.text, tags: e.tags
  }]);
  let merged = [...saved, ...sampleMapped]
    .filter(([k], i, arr) => arr.findIndex(([x]) => x === k) === i)
    .sort((a, b) => dateValue(b[0]) - dateValue(a[0]));

  if (exploreMoodFilter !== 'all') {
    const mf = parseInt(exploreMoodFilter);
    merged = merged.filter(([, e]) => Math.round(e.moodNum) === mf);
  }

  if (advancedFilters.goodMood) {
    merged = merged.filter(
      ([, e]) => e.moodNum >= 4
    );
  }

  if (advancedFilters.badMood) {
    merged = merged.filter(
      ([, e]) => e.moodNum <= 2
    );
  }

  if (advancedFilters.sleepLow) {
    merged = merged.filter(
      ([k]) => {
        const entry = getEntryByKey(k);
        return entry && entry.sleep <= 6;
      }
    );
  }

  if (advancedFilters.sleepHigh) {
    merged = merged.filter(
      ([k]) => {
        const entry = getEntryByKey(k);
        return entry && entry.sleep >= 8;
      }
    );
  }

  if (exploreSearchTerm) {
    merged = merged.filter(([, e]) =>
      e.text.toLowerCase().includes(exploreSearchTerm) ||
      (e.tags || []).some(t => t.toLowerCase().includes(exploreSearchTerm))
    );
  }

  if (merged.length === 0) {
    list.innerHTML = `<div class="explore-empty"><i class="ti ti-search-off"></i><span>검색 결과가 없어요</span></div>`;
    return;
  }

  list.innerHTML = merged.slice(0, 12).map(([k, e]) => {
    const p = k.split('-');
    const moodN = Math.round(e.moodNum) || 3;
    return `<div class="entry-card">
      <div class="entry-top">
        <span class="entry-date">${p[1]}월 ${p[2]}일</span>
        <span class="entry-mood-icon" style="color:${MOOD_COLORS[moodN]}"><i class="ti ${MOOD_ICONS[moodN]}"></i></span>
      </div>
      <div class="entry-text">${escapeHtml(e.text)}</div>
      <div class="entry-tags">${(e.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}</div>
    </div>`;
  }).join('');
}

function toggleAdvancedFilter() {

  const panel =
    document.getElementById(
      'advanced-filter-panel'
    );

  panel.classList.toggle('show');

}



/* ── Save / Reset ────────────────────────────────────────── */
function getEntryByKey(key) { return (S.entries || []).find(e => e.date === key); }

function habitCompletion() {
  const boxes = [...document.querySelectorAll('#bc-habit .checkbox')];
  if (!boxes.length) return 0;
  return Math.round(boxes.filter(b => b.classList.contains('on')).length / boxes.length * 100);
}

function saveEntry() {
  bindPersistentFields();
  const key = dateKey(recordingDate);
  const entry = {
    date: key, mood: S.mood || 3, sleep: Number(S.sleep) || 0, stress: S.stress || 3,
    habit: habitCompletion(), water: S.water || 0,
    note: document.getElementById('ta-note')?.value.trim() || '',
    updatedAt: new Date().toISOString()
  };
  const idx = (S.entries || []).findIndex(e => e.date === key);
  if (idx >= 0) S.entries[idx] = { ...S.entries[idx], ...entry };
  else S.entries.push(entry);
  S.entries = S.entries.sort((a, b) => dateValue(a.date) - dateValue(b.date)).slice(-90);
  S.aiDismissed = false;
  save();
  renderCalendar();
  renderEntries();
  renderInsights();
  const isToday = recordingDate.toDateString() === new Date().toDateString();
  showToast(isToday ? '오늘의 기록이 저장됐어요' : `${recordingDate.getMonth() + 1}월 ${recordingDate.getDate()}일 기록이 저장됐어요`);
}

function resetApp() {
  document.getElementById('reset-modal').classList.add('show');
}
function closeResetModal() {
  document.getElementById('reset-modal').classList.remove('show');
}
function confirmReset() {
  localStorage.clear();
  location.reload();
}

/* ── Insights ────────────────────────────────────────────── */
function setPeriod(days, btn) {
  S.insightPeriod = days;
  save();
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const sub = document.getElementById('insight-period-sub');
  const labels = { 7: '지난 7일간의 기록', 30: '지난 30일간의 기록', 90: '지난 3개월 기록', 180: '지난 6개월 기록', 0: '전체 기록' };
  if (sub) sub.textContent = `${labels[days] || ''}을 분석했어요`;
  renderInsights();
}

function seedInsightEntries() {
  const today = new Date();
  const mood = [3, 2, 4, 5, 5, 4, 3];
  const sleep = [5.5, 4.8, 6.7, 7.8, 7.2, 8, Number(S.sleep) || 7];
  const stress = [4, 5, 3, 2, 2, 3, Number(S.stress) || 3];
  const habit = [58, 42, 70, 86, 76, 82, habitCompletion()];
  const water = [4, 3, 5, 6, 6, 7, Number(S.water) || 5];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - 6 + i);
    return { date: dateKey(d), mood: mood[i], sleep: sleep[i], stress: stress[i], habit: habit[i], water: water[i], note: '' };
  });
}

function insightEntries() {
  const period = S.insightPeriod || 7;
  const seeded = seedInsightEntries();
  const byDate = Object.fromEntries(seeded.map(e => [e.date, e]));
  (S.entries || []).forEach(e => { byDate[e.date] = { ...byDate[e.date], ...e }; });
  let all = Object.values(byDate).sort((a, b) => dateValue(a.date) - dateValue(b.date));
  if (period > 0) return all.slice(-period);
  return all;
}

function dayLabel(key) {
  const [y, m, day] = String(key).split('-').map(Number);
  const d = new Date(y, m - 1, day);
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
}

function renderLineChart(id, entries, metric, max, color, suffix = '') {
  const el = document.getElementById(id); if (!el) return;
  const w = 640, h = 220, pad = 34;
  const pts = entries.map((e, i) => {
    const x = pad + (entries.length === 1 ? 0 : i * (w - pad * 2) / (entries.length - 1));
    const v = clamp(Number(e[metric]) || 0, 0, max);
    const y = h - pad - (v / max) * (h - pad * 2);
    return { x, y, v, label: dayLabel(e.date) };
  });
  const path = pts.map((p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1], c = (p.x - prev.x) * 0.45;
    return `C ${prev.x + c} ${prev.y}, ${p.x - c} ${p.y}, ${p.x} ${p.y}`;
  }).join(' ');
  const area = `${path} L ${pts[pts.length - 1].x} ${h - pad} L ${pts[0].x} ${h - pad} Z`;
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${metric} 추이 그래프">
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" class="chart-axis"/>
    <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" class="chart-axis"/>
    <path d="${area}" fill="${color}" opacity=".08"></path>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"></path>
    ${pts.map(p => `<g>
      <circle cx="${p.x}" cy="${p.y}" r="5" fill="#fff" stroke="${color}" stroke-width="3"></circle>
      <text x="${p.x}" y="${h - 10}" text-anchor="middle" class="chart-label">${p.label}</text>
      <text x="${p.x}" y="${p.y - 12}" text-anchor="middle" class="chart-value">${Math.round(p.v * 10) / 10}${suffix}</text>
    </g>`).join('')}
  </svg>`;
}

function insightStats(entries) {
  return {
    streak: entries.length,
    habit: Math.round(avg(entries.map(e => Number(e.habit) || 0))),
    sleep: Math.round(avg(entries.map(e => Number(e.sleep) || 0)) * 10) / 10,
    mood: Math.round(avg(entries.map(e => Number(e.mood) || 0)) * 10) / 10,
    stress: Math.round(avg(entries.map(e => Number(e.stress) || 0)) * 10) / 10
  };
}

function renderMoodSummary(entries, stats) {
  const el = document.getElementById('mood-summary'); if (!el) return;
  const counts = [1, 2, 3, 4, 5].map(v => entries.filter(e => Math.round(Number(e.mood) || 0) === v).length);
  const topIdx = counts.indexOf(Math.max(...counts)) + 1;
  el.innerHTML = `<div class="summary-grid">
    <div class="summary-item">
      <span class="summary-k">평균 기분</span>
      <strong>${stats.mood}/5</strong>
      <em>${moodText(stats.mood)}</em>
    </div>
    <div class="summary-item">
      <span class="summary-k">가장 잦은 상태</span>
      <strong style="font-size:22px"><i class="ti ${MOOD_ICONS[topIdx]}" style="color:${MOOD_COLORS[topIdx]}"></i></strong>
      <em>${counts[topIdx - 1]}일 기록</em>
    </div>
    <div class="summary-bars">
      ${counts.map((c, i) => `
        <div class="summary-bar-row">
          <span><i class="ti ${MOOD_ICONS[i + 1]}" style="color:${MOOD_COLORS[i + 1]}"></i></span>
          <div><b style="width:${entries.length ? Math.round(c / entries.length * 100) : 0}%;background:${MOOD_COLORS[i + 1]}"></b></div>
          <em>${c}일</em>
        </div>`).join('')}
    </div>
  </div>`;
}

function renderDonut(id, value, max, label, color) {
  const el = document.getElementById(id);
  if (!el) return;

  const pct = clamp(value / max, 0, 1);
  const dash = Math.round(pct * 100);

  el.innerHTML = `
  <div class="donut">
    <svg viewBox="0 0 120 120" role="img" aria-label="${label}">
      <circle
        cx="60"
        cy="60"
        r="46"
        class="donut-bg"
        pathLength="100">
      </circle>

      <circle
        cx="60"
        cy="60"
        r="46"
        class="donut-fg"
        pathLength="100"
        style="stroke:${color};stroke-dasharray:${dash} 100">
      </circle>
    </svg>

    <div class="donut-center">
      <strong>${value}</strong>
      <span>/ ${max}</span>
    </div>
  </div>

  <div class="donut-caption">${label}</div>`;
}

function generateInsightText(stats) {
  return `
  최근 기록을 분석한 결과 평균 수면 시간은
  <strong>${stats.sleep}시간</strong>으로 나타났습니다.

  수면 시간이 7시간 이상인 날에는
  평균 기분 점수가 더 높게 기록되는 경향이 확인되었습니다.

  또한 운동을 기록한 날에는
  긍정적인 표현과 높은 기분 점수가 자주 나타났습니다.

  반면 수면 부족이 있었던 날에는
  스트레스 수치가 상대적으로 높게 기록되었습니다.

  현재 가장 안정적인 패턴은
  규칙적인 수면과 주 3회 이상 운동을 실천한 주간으로 분석됩니다.
  `;
}

function renderAiInsight(stats) {
  const box = document.getElementById('ai-insight-body'); if (!box) return;
  if (S.aiDismissed) {
    box.innerHTML = '<div class="ai-empty">AI 분석을 숨겼어요. 다시 생성할 수 있어요.</div>';
    return;
  }
  box.innerHTML = S.aiInsight || generateInsightText(stats);
}

function editAiInsight() {
  const current = (document.getElementById('ai-insight-body')?.innerText || '').trim();
  const next = prompt('AI 분석 문구를 수정하세요:', current);
  if (next === null) return;
  S.aiInsight = escapeHtml(next).replace(/\n/g, '<br>');
  S.aiDismissed = false;
  save(); renderInsights(); showToast('AI 분석을 수정했어요');
}

function deleteAiInsight() {
  if (!confirm('AI 주간 분석을 숨길까요? 기록 데이터는 삭제되지 않아요.')) return;
  S.aiDismissed = true;
  save(); renderInsights(); showToast('AI 분석을 숨겼어요');
}

function regenerateAiInsight() {
  S.aiInsight = null; S.aiDismissed = false;
  save(); renderInsights(); showToast('AI 분석을 다시 생성했어요');
}

function renderInsights() {
  const entries = insightEntries();
  const stats = insightStats(entries);
  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  setText('stat-streak', stats.streak);
  setText('stat-habit', stats.habit);
  setText('stat-sleep', stats.sleep);
  setText('stat-mood-change', `평균 기분 ${stats.mood}/5 · 스트레스 ${stats.stress}/5`);
  renderLineChart('sleep-line-chart', entries, 'sleep', 10, '#4E6478', 'h');
  renderMoodSummary(entries, stats);
  renderDonut('stress-donut', stats.stress, 5, stressLabels[Math.round(stats.stress)] || '보통', '#7D6352');

  const moodWeek = document.getElementById('mood-week');
  if (moodWeek) {
    moodWeek.innerHTML = entries.map(e => {
      const n = clamp(Math.round(Number(e.mood)), 1, 5);
      return `<div class="mood-day">
        <div class="mood-emo" style="color:${MOOD_COLORS[n]}"><i class="ti ${MOOD_ICONS[n]}"></i></div>
        <div class="mood-lbl">${dayLabel(e.date)}</div>
      </div>`;
    }).join('');
  }

  const hp = document.getElementById('habit-prog');
  if (hp) hp.innerHTML = `
    <div class="hp-row">
      <div class="hp-top"><span class="hp-name">최근 평균</span><span class="hp-pct">${stats.habit}%</span></div>
      <div class="hp-bar"><div class="hp-fill" style="width:${stats.habit}%"></div></div>
    </div>
    <div class="hp-row">
      <div class="hp-top"><span class="hp-name">오늘 달성</span><span class="hp-pct">${entries[entries.length - 1]?.habit || 0}%</span></div>
      <div class="hp-bar"><div class="hp-fill" style="width:${entries[entries.length - 1]?.habit || 0}%"></div></div>
    </div>
    <div class="hp-note">체크한 습관 수를 기준으로 저장할 때마다 갱신됩니다.</div>`;

  renderAiInsight(stats);

  document.querySelectorAll('.period-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.period) === (S.insightPeriod || 7));
  });
}

/* ── Consent Settings ────────────────────────────────────── */
function initConsentToggles() {
  const dataToggle = document.getElementById('consent-data-toggle');
  if (dataToggle) dataToggle.classList.toggle('on', !!S.consentData);
  const locToggle = document.getElementById('consent-location-toggle');
  if (locToggle) locToggle.classList.toggle('on', !!S.consentLocation);
}

function toggleConsent(type, el) {
  el.classList.toggle('on');
  if (type === 'data') S.consentData = el.classList.contains('on');
  if (type === 'location') S.consentLocation = el.classList.contains('on');
  save();
  showToast(el.classList.contains('on') ? '동의했어요' : '동의를 취소했어요');
}

/* ── Toast ───────────────────────────────────────────────── */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ── Field Persistence ───────────────────────────────────── */
function bindPersistentFields() {
  if (S.fields.checklistHtml) document.getElementById('cl-items').innerHTML = S.fields.checklistHtml;
  document.querySelectorAll('input,textarea').forEach(el => {
    const key = fieldKey(el);
    if (Object.prototype.hasOwnProperty.call(S.fields, key)) el.value = S.fields[key];
    el.oninput = () => {
      S.fields[key] = el.value;
      if (el.id === 'ta-note') updateCount('ta-note', 'cnt-note');
      save();
    };
  });
  updateCount('ta-note', 'cnt-note');
}

function restoreInteractiveState() {
  document.querySelectorAll('.mood-opt').forEach((btn, i) => btn.classList.toggle('on', i + 1 === S.mood));
  const sv = document.getElementById('sv');
  if (sv) sv.textContent = S.sleep % 1 === 0 ? S.sleep : S.sleep.toFixed(1);
  const sleepPct = Math.min(100, Math.round(S.sleep / 8 * 100));
  const sf = document.getElementById('sf');
  if (sf) sf.style.width = sleepPct + '%';
  const sh = document.getElementById('sh');
  if (sh) sh.textContent = `권장 수면의 ${sleepPct}%`;
  document.querySelectorAll('#stress-scale button').forEach((btn, i) => btn.classList.toggle('on', i + 1 === S.stress));
  const sl = document.getElementById('stress-lbl');
  if (sl) sl.textContent = stressLabels[S.stress] || '보통';
  document.querySelectorAll('#energy-scale button').forEach((btn, i) => btn.classList.toggle('on', i + 1 === (S.energy || 2)));

  // Restore hidden blocks
  document.querySelectorAll('[id^="bc-"]').forEach(card => card.classList.toggle('hidden', (S.hiddenBlocks || []).includes(card.id)));

  // Sync library toggles (new id-based)
  document.querySelectorAll('[id^="lib-toggle-bc-"]').forEach(toggle => {
    const blockId = toggle.id.replace('lib-toggle-', '');
    toggle.classList.toggle('on', !(S.hiddenBlocks || []).includes(blockId));
  });

  document.querySelectorAll('.checkbox').forEach(el => {
    const key = checkKey(el);
    if (Object.prototype.hasOwnProperty.call(S.checks, key)) el.classList.toggle('on', S.checks[key]);
  });
  initWater();
}

function updateActiveCount() {
  const total = document.querySelectorAll('[id^="bc-"]').length;
  const hidden = document.querySelectorAll('[id^="bc-"].hidden').length;
  const el = document.getElementById('active-block-count');
  if (el) el.innerHTML = `현재 <strong style="color:var(--ink)">${total - hidden}개</strong> 블록이 활성화되어 있어요.`;
}

/* ── Modal Helpers ───────────────────────────────────────── */
function openAISettings() { document.getElementById('ai-settings-modal').classList.add('show'); }
function closeAISettings() { document.getElementById('ai-settings-modal').classList.remove('show'); }
function saveAISettings() { closeAISettings(); showToast('AI 인사이트 설정이 저장됐어요.'); }
function openBlockSettings() { document.getElementById('block-settings-modal').classList.add('show'); }
function closeBlockSettings() { document.getElementById('block-settings-modal').classList.remove('show'); }
function saveBlockSettings() { closeBlockSettings(); showToast('블록 개인화 설정이 저장됐어요.'); }

/* ── Global Click Listener ───────────────────────────────── */
document.addEventListener('click', function (e) {
  // Close date picker if clicked outside
  const popup = document.getElementById('date-picker-popup');
  const dateEl = document.getElementById('tb-date');
  if (popup && popup.classList.contains('show')) {
    if (!popup.contains(e.target) && e.target !== dateEl && !dateEl?.contains(e.target)) {
      closeDatePicker();
    }
  }

  const target = e.target;
  if (target.classList.contains('onb-chip')) {
    const group = target.closest('.chips');
    if (group) {
      if (group.id === 'ch0') { target.classList.toggle('on'); }
      else { group.querySelectorAll('.onb-chip').forEach(c => c.classList.remove('on')); target.classList.add('on'); }
    }
    return;
  }
  const insightStyleBtn = target.closest('.insight-style');
  if (insightStyleBtn) { document.querySelectorAll('.insight-style').forEach(el => el.classList.remove('selected')); insightStyleBtn.classList.add('selected'); return; }
  const insightPeriodBtn = target.closest('.insight-period');
  if (insightPeriodBtn) { document.querySelectorAll('.insight-period').forEach(el => el.classList.remove('selected')); insightPeriodBtn.classList.add('selected'); return; }
  const insightToneBtn = target.closest('.insight-tone');
  if (insightToneBtn) { document.querySelectorAll('.insight-tone').forEach(el => el.classList.remove('selected')); insightToneBtn.classList.add('selected'); return; }
  const blockGoalBtn = target.closest('.block-goal');
  if (blockGoalBtn) { document.querySelectorAll('.block-goal').forEach(el => el.classList.remove('selected')); blockGoalBtn.classList.add('selected'); return; }
  const recordStyleBtn = target.closest('.record-style');
  if (recordStyleBtn) { document.querySelectorAll('.record-style').forEach(el => el.classList.remove('selected')); recordStyleBtn.classList.add('selected'); return; }
  const generalChip = target.closest('.ai-setting-group .chip');
  if (generalChip) { generalChip.classList.toggle('selected'); return; }
});
