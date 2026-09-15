// Flow Autopilot — options page logic.

const analyzeTemplateEl = document.getElementById('analyzeTemplate');
const autoReviewEl = document.getElementById('autoReview');
const statusEl = document.getElementById('status');

async function load() {
  const { [FA_STORAGE_KEYS.OPTIONS]: stored } = await chrome.storage.local.get(FA_STORAGE_KEYS.OPTIONS);
  const options = { ...FA_DEFAULT_OPTIONS, ...(stored || {}) };
  analyzeTemplateEl.value = options.analyzeTemplate;
  autoReviewEl.checked = options.autoReview;
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const options = {
    analyzeTemplate: analyzeTemplateEl.value.trim() || FA_DEFAULT_OPTIONS.analyzeTemplate,
    autoReview: autoReviewEl.checked,
  };
  await chrome.storage.local.set({ [FA_STORAGE_KEYS.OPTIONS]: options });
  statusEl.textContent = 'บันทึกแล้ว ✓';
  setTimeout(() => (statusEl.textContent = ''), 2000);
});

document.getElementById('resetTemplateBtn').addEventListener('click', () => {
  analyzeTemplateEl.value = FA_DEFAULT_OPTIONS.analyzeTemplate;
});

load();
