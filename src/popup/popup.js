// Flow Autopilot — popup UI logic. Renders one of: idle / running /
// awaiting_review / error / done, driven entirely by the run state stored
// in chrome.storage.local (background.js is the sole writer).

const views = {
  idle: document.getElementById('idleView'),
  running: document.getElementById('runningView'),
  awaiting_review: document.getElementById('reviewView'),
  error: document.getElementById('errorView'),
  done: document.getElementById('doneView'),
};

const productImageInput = document.getElementById('productImage');
const fileLabel = document.getElementById('fileLabel');
const preview = document.getElementById('preview');
const runBtn = document.getElementById('runBtn');
const imageUrlInput = document.getElementById('imageUrlInput');
const loadUrlBtn = document.getElementById('loadUrlBtn');
const urlError = document.getElementById('urlError');

let selectedImageDataUrl = null;
let currentRun = null;
let stuckCheckTimer = null;

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setSelectedImage(dataUrl, label) {
  selectedImageDataUrl = dataUrl;
  fileLabel.textContent = label;
  preview.src = dataUrl;
  preview.hidden = false;
  updateRunButton();
}

productImageInput.addEventListener('change', async () => {
  const file = productImageInput.files[0];
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  setSelectedImage(dataUrl, file.name);
});

function showUrlError(message) {
  urlError.textContent = message;
  urlError.hidden = !message;
}

loadUrlBtn.addEventListener('click', async () => {
  const url = imageUrlInput.value.trim();
  showUrlError('');
  if (!url) {
    showUrlError('ใส่ URL รูปภาพก่อน');
    return;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    showUrlError('URL ไม่ถูกต้อง');
    return;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    showUrlError('รองรับเฉพาะ URL แบบ http(s)');
    return;
  }

  loadUrlBtn.disabled = true;
  loadUrlBtn.textContent = '…';
  try {
    // Fetching an arbitrary user-supplied origin from the popup needs a
    // host permission we don't declare upfront (manifest keeps
    // host_permissions minimal — see PR #1 review). Request it only when
    // this feature is actually used, gated on this click's user gesture,
    // rather than asking for <all_urls> at install time for everyone.
    const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
    if (!granted) {
      showUrlError('ต้องอนุญาต permission ก่อนถึงจะโหลดรูปจาก URL ภายนอกได้');
      return;
    }
    const resp = await fetch(parsed.href);
    if (!resp.ok) {
      showUrlError(`โหลดรูปไม่สำเร็จ (HTTP ${resp.status})`);
      return;
    }
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      showUrlError(`URL นี้ไม่ใช่รูปภาพ (content-type: ${contentType || 'ไม่ทราบ'})`);
      return;
    }
    const blob = await resp.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    setSelectedImage(dataUrl, parsed.pathname.split('/').pop() || 'image-from-url');
  } catch (err) {
    showUrlError(`โหลดรูปไม่สำเร็จ: ${err.message || err}`);
  } finally {
    loadUrlBtn.disabled = false;
    loadUrlBtn.textContent = 'โหลด';
  }
});

function updateRunButton() {
  runBtn.disabled = !selectedImageDataUrl;
}

document.getElementById('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

// Real bug found live 2026-09-14 (see README "v15"): every button here
// used to call chrome.runtime.sendMessage() directly, awaited with no
// try/catch. If that promise *rejects* — which it does when the service
// worker is genuinely unreachable, e.g. stuck Inactive and not waking on
// a new message — the rejection had nowhere to go but an unhandled
// promise rejection in the popup's own JS context. MV3 popups close the
// instant they lose focus, taking their console buffer with them, so
// that rejection was realistically never seen by anyone — clicking a
// button did visibly nothing at all, exactly the silent-failure class
// this project explicitly exists to avoid. sendToBackground() below
// makes that failure land in the DOM itself instead, where it survives
// as long as the popup stays open and needs no console to be watched.
const connectionErrorBanner = document.getElementById('connectionErrorBanner');

function showConnectionError(label, err) {
  connectionErrorBanner.hidden = false;
  connectionErrorBanner.textContent =
    `⚠️ ส่งคำสั่ง "${label}" ไปหา extension ไม่สำเร็จ (${err && err.message ? err.message : err}) — ` +
    `service worker อาจค้าง/ไม่ตอบสนอง ลองเปิด chrome://extensions แล้วกดปุ่ม reload (⟳) ที่การ์ด Flow Autopilot แล้วลองใหม่`;
}

function clearConnectionError() {
  connectionErrorBanner.hidden = true;
  connectionErrorBanner.textContent = '';
}

/**
 * Sends `message` to background.js, surfacing a *visible* error in the
 * popup (not just console) if the message can't even be delivered —
 * returns null in that case instead of throwing, so callers don't also
 * need their own try/catch. Also checks the response shape on success
 * (see README "v11") as a secondary safety net.
 */
async function sendToBackground(label, message) {
  let res;
  try {
    res = await chrome.runtime.sendMessage(message);
  } catch (err) {
    console.error('[Flow Autopilot popup]', label, 'failed to reach background:', err);
    showConnectionError(label, err);
    return null;
  }
  clearConnectionError();
  if (!res || res.ok === false) {
    console.error('[Flow Autopilot popup]', label, 'returned an error:', res);
  }
  return res;
}

runBtn.addEventListener('click', async () => {
  await sendToBackground('START_RUN', { type: FA_MSG.START_RUN, payload: { productImageDataUrl: selectedImageDataUrl } });
});

['cancelBtn', 'cancelBtn2', 'cancelBtn3'].forEach((id) => {
  document.getElementById(id).addEventListener('click', async () => {
    await sendToBackground('CANCEL_RUN', { type: FA_MSG.CANCEL_RUN });
  });
});

document.getElementById('retryBtn').addEventListener('click', async () => {
  await sendToBackground('RETRY_STEP', { type: FA_MSG.RETRY_STEP });
});

document.getElementById('newRunBtn').addEventListener('click', async () => {
  await sendToBackground('CANCEL_RUN', { type: FA_MSG.CANCEL_RUN });
});

document.getElementById('reviewContinueBtn').addEventListener('click', async () => {
  const run = await getRun();
  if (!run) return; // getRun() already showed the connection-error banner
  const fields = {};
  document.querySelectorAll('#reviewFields textarea').forEach((ta) => {
    fields[ta.dataset.field] = ta.value;
  });
  await sendToBackground('CONFIRM_STEP', {
    type: FA_MSG.CONFIRM_STEP,
    payload: { step: run.currentStep, fields },
  });
});

const STEP_LABELS = {
  analyze: 'ขั้น 1/3 — ChatGPT วิเคราะห์สินค้า',
  imagegen: 'ขั้น 2/3 — ChatGPT สร้างภาพ storyboard',
  flow: 'ขั้น 3/3 — Google Flow สร้างวิดีโอ',
};

function renderReview(run) {
  const container = document.getElementById('reviewFields');
  container.innerHTML = '';
  const hint = document.getElementById('reviewHint');

  if (run.currentStep === 'analyze') {
    hint.textContent =
      run.parseConfidence === 'labeled'
        ? 'ตรวจสอบผลที่แยกได้ก่อนไปต่อ (แก้ไขได้ถ้าไม่ตรง):'
        : '⚠️ แยกหัวข้ออัตโนมัติไม่มั่นใจ — กรุณาตรวจ/แก้ไขให้ถูกต้องก่อนไปต่อ:';
    addTextarea(container, 'storyboardPlan', 'Storyboard Plan (5 shots)', run.storyboardPlan);
    addTextarea(container, 'storyboardPrompt', 'Prompt สำหรับสร้างภาพ storyboard (5-panel)', run.storyboardPrompt);
    addTextarea(container, 'videoPrompt', 'Prompt สำหรับสร้างวิดีโอ (10 วิ, 5 ซีน)', run.videoPrompt);
  } else if (run.currentStep === 'imagegen') {
    hint.textContent = 'ตรวจสอบภาพ storyboard และ prompt วิดีโอก่อนส่งเข้า Google Flow:';
    const img = document.createElement('img');
    img.src = run.storyboardImageDataUrl;
    container.appendChild(img);
    addTextarea(container, 'videoPrompt', 'Prompt สำหรับสร้างวิดีโอ', run.videoPrompt);
  }
}

function addTextarea(container, field, labelText, value) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const ta = document.createElement('textarea');
  ta.dataset.field = field;
  ta.value = value || '';
  container.appendChild(label);
  container.appendChild(ta);
}

function renderWarnings(run) {
  const banner = document.getElementById('warningsBanner');
  const warnings = run?.warnings || [];
  if (!warnings.length) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.innerHTML = warnings.map((w) => `<div>${w}</div>`).join('');
}

// A running step past this age is very likely stuck rather than still
// legitimately working — comfortably above each step's own internal
// generation-wait timeout (5 min for chatgpt.com steps, 10 min for
// Flow's video), but below background.js's hard ceiling (see
// CHATGPT_STEP_CEILING_MS / FLOW_STEP_CEILING_MS), so the user gets an
// early, actionable warning before the automatic failure kicks in.
const STUCK_THRESHOLD_MS = {
  analyze: 6 * 60 * 1000,
  imagegen: 6 * 60 * 1000,
  flow: 9 * 60 * 1000,
};

function updateStuckHint() {
  const stuckHint = document.getElementById('stuckHint');
  if (!currentRun || currentRun.status !== 'running') {
    stuckHint.hidden = true;
    return;
  }
  const threshold = STUCK_THRESHOLD_MS[currentRun.currentStep] ?? 6 * 60 * 1000;
  const elapsed = Date.now() - (currentRun.updatedAt || Date.now());
  stuckHint.hidden = elapsed <= threshold;
}

function setRunningPoll(active) {
  if (active && !stuckCheckTimer) {
    stuckCheckTimer = setInterval(updateStuckHint, 15000);
  } else if (!active && stuckCheckTimer) {
    clearInterval(stuckCheckTimer);
    stuckCheckTimer = null;
  }
}

function render(run) {
  currentRun = run;
  renderWarnings(run);
  setRunningPoll(run?.status === 'running');
  if (!run || run.status === 'idle' || !run.status) {
    showView('idle');
    updateRunButton();
    return;
  }
  if (run.status === 'running') {
    showView('running');
    document.getElementById('runningLabel').textContent = STEP_LABELS[run.currentStep] || 'กำลังทำงาน…';
    // Live progress from the content script (added 2026-09-15, see
    // README "v11") — a long but legitimate wait (e.g. a large real
    // photo taking a while to upload) otherwise looks identical to
    // something silently stuck, since nothing here changed at all
    // before. run.progressLabel is best-effort and may be absent/stale
    // (e.g. right when a new step starts, before its first update
    // arrives) — hidden rather than shown blank in that case.
    const progressEl = document.getElementById('progressLabel');
    if (run.progressLabel) {
      progressEl.textContent = run.progressLabel;
      progressEl.hidden = false;
    } else {
      progressEl.hidden = true;
    }
    updateStuckHint();
    return;
  }
  if (run.status === 'awaiting_review') {
    renderReview(run);
    showView('awaiting_review');
    return;
  }
  if (run.status === 'error') {
    showView('error');
    document.getElementById('errorStep').textContent = STEP_LABELS[run.error?.step] || run.error?.step || 'error';
    // Added 2026-09-15: real report where Toey opened a fresh popup tab
    // and saw an error immediately, with no way to tell whether it was
    // from the run just attempted or a stale leftover from an earlier
    // session — since this view is driven entirely by whatever's
    // persisted in chrome.storage.local (see file header), it can't
    // otherwise be told apart. run.updatedAt is already stamped by
    // background.js's setRun() on every write; just wasn't surfaced
    // here before.
    const ageEl = document.getElementById('errorAge');
    if (run.updatedAt) {
      const elapsedMin = Math.round((Date.now() - run.updatedAt) / 60000);
      ageEl.textContent =
        elapsedMin < 1
          ? 'เพิ่งเกิดขึ้นเมื่อครู่นี้'
          : elapsedMin < 60
            ? `เกิดขึ้นเมื่อ ${elapsedMin} นาทีที่แล้ว`
            : `⚠️ เกิดขึ้นเมื่อ ${Math.round(elapsedMin / 60)} ชั่วโมงที่แล้ว — อาจเป็น error ค้างจากรอบก่อน ไม่ใช่รอบล่าสุด`;
      ageEl.hidden = false;
    } else {
      ageEl.hidden = true;
    }
    document.getElementById('errorMessage').textContent = run.error?.message || '';
    document.getElementById('errorHint').textContent = run.error?.hint || '';
    return;
  }
  if (run.status === 'done') {
    showView('done');
    const link = document.getElementById('resultLink');
    link.href = run.resultProjectUrl || run.resultVideoUrl || '#';
    return;
  }
  showView('idle');
}

async function getRun() {
  const res = await sendToBackground('GET_STATE', { type: FA_MSG.GET_STATE });
  return res ? res.run : null;
}

async function init() {
  // Same connection-failure gap as the button handlers above, but more
  // consequential here: an uncaught rejection in init() (no .catch() on
  // its call at the bottom of this file) would leave the whole popup
  // stuck on whatever the static HTML shows by default — no visible
  // error, and reviewContinueBtn/etc. reading getRun() later would
  // silently see nothing either. sendToBackground() surfaces the same
  // visible banner here instead of failing invisibly at startup.
  const res = await sendToBackground('GET_STATE', { type: FA_MSG.GET_STATE });
  updateRunButton();
  render(res ? res.run : null);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[FA_STORAGE_KEYS.RUN]) {
    render(changes[FA_STORAGE_KEYS.RUN].newValue);
  }
});

init();
