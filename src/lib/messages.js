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

  // Verbatim from ψ/active/flow-autopilot-extension.md "Update 2026-09-13
  // v2 — ตัด custom GPT dependency ออก". Do not paraphrase — the spec
  // explicitly requires this exact wording for consistent output across
  // products. This replaces the v1 custom-GPT system prompt: since free
  // ChatGPT accounts can't create custom GPTs (verified via OpenAI help
  // docs — GPT Builder needs Plus/Pro/Team/Enterprise), the same
  // instructions now ride along as a plain user message on ordinary
  // chatgpt.com instead of living in a custom GPT's system prompt.
  root.FA_ANALYZE_TEMPLATE = `You are a product video storyboard assistant. When the user uploads a product photo, output exactly 3 sections in this order, plain text, no extra commentary:

## 1. Product Description
[Look at the image, write 1-2 concise sentences identifying the product name/type and 1-2 key visual selling points]

## 2. Storyboard Image Prompt
Minimalist product photography of [product name and key feature from step 1], centered on a clean pastel background (choose a color that complements the product), soft diffused studio lighting, subtle soft shadow beneath product, 3/4 angle top-down view, negative space on the right third of the frame reserved for text, add a clean minimal sans-serif text overlay in a color that contrasts with the background reading "[write a short 2-4 word Thai headline fitting the product]" positioned in that negative space, consistent minimal beauty-product aesthetic, 9:16 vertical composition, high-key soft lighting, no clutter, no extra objects

## 3. Video Animation Prompt
Animate this exact image with a slow gentle push-in camera movement, subtle soft light shimmer on the product surface, keep the product, background, composition, and all text overlays completely static and unchanged — do not redraw or regenerate the text, only add motion to lighting and very subtle product highlight, cinematic minimal aesthetic, smooth 5 second clip, no camera shake, preserve exact color palette from the source image

Always fill in the bracketed placeholders based on the uploaded image. Never change the fixed wording outside the placeholders — consistency across all products is critical.`;

  // Short trailing line appended after the template, sent together with
  // the attached image in one message. Per spec this is given as an
  // example phrasing ("เช่น"), not a verbatim-locked block like the
  // template above, but kept exactly as suggested since it already reads
  // naturally as an instruction to the model.
  root.FA_ANALYZE_TRAILER = 'Here is the product photo, please follow the instructions above.';

  root.FA_DEFAULT_OPTIONS = {
    analyzeTemplate: root.FA_ANALYZE_TEMPLATE,
    autoReview: true,
  };
})(typeof window !== 'undefined' ? window : globalThis);
