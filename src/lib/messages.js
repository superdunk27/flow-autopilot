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

  // Verbatim from ψ/active/flow-autopilot-extension.md "Update 2026-09-14
  // v4 — ใส่ลูกเล่นตัวหนังสือ/badge/layout กลับเข้าไป". Do not paraphrase —
  // the spec explicitly requires this exact wording, confirmed
  // byte-for-byte against the spec's fenced block via a Python diff
  // (see this project's own past practice for v2/v3). Supersedes the v3
  // template: after imagegen first worked live, Toey compared the
  // output against the original reference clip and found 2 real gaps —
  // v3's "clean minimal sans-serif text overlay" produced plain flat
  // captions with no badges/doodles, and v3's "horizontal 5-panel
  // contact sheet" laid out as one long row instead of the reference's
  // 2-column grid. v4 only changes section 2 (Storyboard Image Prompt:
  // 2/2/1 grid layout, gradient number badges, bold gradient Thai
  // lettering, sparkle/heart/leaf doodles, an emphasized final-panel
  // CTA) and section 3 (Video Prompt: text animation float/breathe/fade
  // + drifting doodles, matching section 2's new style) to match.
  // Section 1 (Storyboard Plan) and all 3 section headings are
  // byte-identical to v3 — parseAnalysisResponse in content-chatgpt.js
  // needs no changes.
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
A single image generation prompt (for Nano Banana / GPT Image) that produces ONE image containing all 5 shots arranged in a grid layout (2 columns, with the 5th panel centered alone in the final row — a 2/2/1 layout), thin white gutters between panels, slightly rounded panel corners, clean white or neutral background around the grid. Photography style: UGC Minimal aesthetic, Muji/Pinterest mood — neutral beige/white/wood tones, soft natural window light, no harsh shadows, each panel shows the product on a different natural-material pedestal per the plan above, same camera height and framing across all panels, consistent color grade across all 5 panels, no clutter, no extra props. Text/decoration style (this should be bold and eye-catching, contrasting with the minimal photography): each panel has a small circled number badge (1-5) in a two-tone gradient matching the product's accent color, thick rounded bold Thai lettering for the on-screen text overlay (not plain sans-serif) in a color gradient that complements the background, with small sparkle/heart/leaf doodle accents floating near the text in each panel. The final (5th) panel's text should be noticeably larger/bolder than the other four, with a small arrow or heart doodle pointing toward it, as a stronger closing call-to-action.

## 3. Video Prompt (10 seconds, 5 scenes)
A single video generation prompt (compatible with Flow/Veo, Sora, or Kling) describing: animate the 5-panel storyboard image above into a 10-second video, cutting to a new scene every 2 seconds in the same order as the panels, each scene is a static-camera shot with only gentle ambient motion (soft light shimmer, subtle depth breathing) — do not move the camera, do not redraw or regenerate the product or background. Text overlays in each scene gently float/breathe and fade in/out with soft easing (matching the storyboard image's text style from step 2), small sparkle/heart/leaf doodles drift near the text — keep all on-screen text content the same as its corresponding panel, simple clean cuts between scenes (no fancy wipes/transitions), consistent color grade throughout, UGC minimal photography style maintained across all 5 scenes even as the text/decoration stays bold and eye-catching.

Always base shot details on the uploaded product image. Keep the house style (UGC Minimal photography, Muji/Pinterest mood, soft natural light, natural-material pedestals, consistent camera height, grid layout with gradient number badges, bold gradient Thai text with sparkle/heart/leaf doodles, static-camera-with-ambient-motion video style) IDENTICAL across every product — only the pedestal choices, on-screen text, accent color, and product itself vary per shot.`;

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
