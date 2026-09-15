// Flow Autopilot — shared message type + storage key constants.
// Loaded as a plain classic script in content-script contexts; imported
// as an ES module in the background service worker (see background.js).

(function (root) {
  root.FA_MSG = {
    // popup -> background
    START_RUN: 'FA_START_RUN',
    CONFIRM_STEP: 'FA_CONFIRM_STEP',
    RETRY_STEP: 'FA_RETRY_STEP',
    CANCEL_RUN: 'FA_CANCEL_RUN',
    GET_STATE: 'FA_GET_STATE',

    // background -> content
    RUN_CHATGPT_STEP: 'FA_RUN_CHATGPT_STEP',
    RUN_FLOW_STEP: 'FA_RUN_FLOW_STEP',

    // content -> background
    STEP_DONE: 'FA_STEP_DONE',
  };

  root.FA_STORAGE_KEYS = {
    RUN: 'faRun',
    OPTIONS: 'faOptions',
  };

  root.FA_STEPS = {
    ANALYZE: 'analyze',
    IMAGEGEN: 'imagegen',
    FLOW: 'flow',
  };

  root.FA_STATUS = {
    IDLE: 'idle',
    RUNNING: 'running',
    AWAITING_REVIEW: 'awaiting_review',
    ERROR: 'error',
    DONE: 'done',
  };

  root.FA_DEFAULT_OPTIONS = {
    customGptUrl: '',
    analyzeTriggerMessage:
      'วิเคราะห์สินค้าในรูปนี้ แล้วให้ (1) รายละเอียดสินค้า (2) prompt สำหรับสร้างภาพ storyboard (3) prompt สำหรับสร้างวิดีโอ แยกหัวข้อให้ชัดเจน',
    autoReview: true,
  };
})(typeof window !== 'undefined' ? window : globalThis);
