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

let selectedImageDataUrl = null;

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

productImageInput.addEventListener('change', async () => {
  const file = productImageInput.files[0];
  if (!file) return;
  selectedImageDataUrl = await fileToDataUrl(file);
  fileLabel.textContent = file.name;
  preview.src = selectedImageDataUrl;
  preview.hidden = false;
  updateRunButton();
});

function updateRunButton() {
  runBtn.disabled = !selectedImageDataUrl;
}

document.getElementById('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

runBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: FA_MSG.START_RUN, payload: { productImageDataUrl: selectedImageDataUrl } });
});

['cancelBtn', 'cancelBtn2', 'cancelBtn3'].forEach((id) => {
  document.getElementById(id).addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: FA_MSG.CANCEL_RUN });
  });
});

document.getElementById('retryBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: FA_MSG.RETRY_STEP });
});

document.getElementById('newRunBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: FA_MSG.CANCEL_RUN });
});

document.getElementById('reviewContinueBtn').addEventListener('click', async () => {
  const run = await getRun();
  const fields = {};
  document.querySelectorAll('#reviewFields textarea').forEach((ta) => {
    fields[ta.dataset.field] = ta.value;
  });
  chrome.runtime.sendMessage({
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

function render(run) {
  renderWarnings(run);
  if (!run || run.status === 'idle' || !run.status) {
    showView('idle');
    updateRunButton();
    return;
  }
  if (run.status === 'running') {
    showView('running');
    document.getElementById('runningLabel').textContent = STEP_LABELS[run.currentStep] || 'กำลังทำงาน…';
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
  const { run } = await chrome.runtime.sendMessage({ type: FA_MSG.GET_STATE });
  return run;
}

async function init() {
  const { run } = await chrome.runtime.sendMessage({ type: FA_MSG.GET_STATE });
  updateRunButton();
  render(run);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[FA_STORAGE_KEYS.RUN]) {
    render(changes[FA_STORAGE_KEYS.RUN].newValue);
  }
});

init();
