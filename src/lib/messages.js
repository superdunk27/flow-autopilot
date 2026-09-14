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
    STEP_PROGRESS: 'FA_STEP_PROGRESS',
  };

  // chrome.tabs.connect()/chrome.runtime.onConnect port name for the
  // persistent-connection service-worker keepalive (see README "v16").
  // A live, open port is documented by Chrome as keeping an MV3 service
  // worker alive for as long as it stays open — used as the *primary*
  // keepalive mechanism, alongside (not instead of) the chrome.alarms
  // one from v13, since alarms' periodInMinutes has an ambiguous
  // real-world minimum this project hasn't been able to confirm.
  root.FA_KEEPALIVE_PORT_NAME = 'fa-keepalive-port';

  root.FA_STORAGE_KEYS = {
    RUN: 'faRun',
    OPTIONS: 'faOptions',
    // Last-resort fallback for a STEP_DONE message that failed to reach
    // background.js even after retries (see README "v16") — the
    // content script writes the lost result here directly so a fully
    // completed real result is never silently discarded, even though
    // background.js does not yet automatically recover from this key
    // (a manual-recovery escape hatch for now, not full auto-recovery).
    LOST_STEP_DONE: 'faLostStepDone',
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
  // v3 — เปลี่ยน template เป็น 5-shot storyboard, UGC Minimal/Muji-Pinterest
  // style". Do not paraphrase — the spec explicitly requires this exact
  // wording. Supersedes the v2 template (single product-description +
  // single-image storyboard): the real-world reference example locks the
  // camera angle/lighting/text *style* across shots, not the pedestal/
  // background, and the video is 5 scenes x 2s = 10s instead of one
  // static 5s clip. Heading text changed accordingly — see
  // parseAnalysisResponse in content-chatgpt.js, which must match these
  // exact headings instead of the v2 ones.
  root.FA_ANALYZE_TEMPLATE = `You are a UGC-style product video storyboard assistant. When the user uploads a product photo, output exactly 3 sections in this order, plain text, no extra commentary:

## 1. Storyboard Plan (5 Shots)
Look at the image and identify the product. Write a 5-shot plan, one line per shot, in this format:
Shot 1: [pedestal/base material and look] — [camera angle] — [on-screen text for this shot]
Shot 2: ...
Shot 3: ...
Shot 4: ...
Shot 5: ...
Each shot places the product on a DIFFERENT base/pedestal (e.g. natural wood block, linen fabric, raw stone, ceramic dish, woven basket) but keeps the SAME camera angle/height and SAME soft natural lighting across all 5 shots, so the sequence feels like one continuous style — UGC Minimal aesthetic, Muji/Pinterest mood (neutral tones, natural materials, soft daylight, uncluttered).

## 2. Storyboard Image Prompt
A single image generation prompt (for Nano Banana / GPT Image) that produces ONE image containing all 5 shots as a horizontal 5-panel contact sheet, in this exact style: UGC Minimal aesthetic, Muji/Pinterest mood — neutral beige/white/wood tones, soft natural window light, no harsh shadows, each panel shows the product on a different natural-material pedestal per the plan above, same camera height and framing across all panels, clean minimal sans-serif text overlay in each panel matching the on-screen text from the plan, 9:16 vertical, consistent color grade across all 5 panels, no clutter, no extra props.

## 3. Video Prompt (10 seconds, 5 scenes)
A single video generation prompt (compatible with Flow/Veo, Sora, or Kling) describing: animate the 5-panel storyboard image above into a 10-second video, cutting to a new scene every 2 seconds in the same order as the panels, each scene is a static-camera shot with only gentle ambient motion (soft light shimmer, subtle depth breathing) — do not move the camera, do not redraw or regenerate any text overlay, keep all on-screen text completely static per scene, simple clean cuts between scenes (no fancy wipes/transitions), consistent color grade throughout, UGC minimal aesthetic maintained across all 5 scenes.

Always base shot details on the uploaded product image. Keep the house style (UGC Minimal, Muji/Pinterest mood, soft natural light, natural-material pedestals, consistent camera height, static-camera-with-ambient-motion video style) IDENTICAL across every product — only the pedestal choices, on-screen text, and product itself vary per shot.`;

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
