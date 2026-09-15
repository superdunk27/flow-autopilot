// Flow Autopilot — options page logic.

const customGptUrlEl = document.getElementById('customGptUrl');
const triggerMessageEl = document.getElementById('triggerMessage');
const autoReviewEl = document.getElementById('autoReview');
const statusEl = document.getElementById('status');

async function load() {
  const { [FA_STORAGE_KEYS.OPTIONS]: stored } = await chrome.storage.local.get(FA_STORAGE_KEYS.OPTIONS);
  const options = { ...FA_DEFAULT_OPTIONS, ...(stored || {}) };
  customGptUrlEl.value = options.customGptUrl;
  triggerMessageEl.value = options.analyzeTriggerMessage;
  autoReviewEl.checked = options.autoReview;
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const options = {
    customGptUrl: customGptUrlEl.value.trim(),
    analyzeTriggerMessage: triggerMessageEl.value.trim() || FA_DEFAULT_OPTIONS.analyzeTriggerMessage,
    autoReview: autoReviewEl.checked,
  };
  await chrome.storage.local.set({ [FA_STORAGE_KEYS.OPTIONS]: options });
  statusEl.textContent = 'บันทึกแล้ว ✓';
  setTimeout(() => (statusEl.textContent = ''), 2000);
});

load();
