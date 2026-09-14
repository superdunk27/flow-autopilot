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
  // v7 — เข้มกฎล็อกตัวหนังสือ ไม่ให้ blend ข้ามช็อต". Do not paraphrase —
  // confirmed byte-for-byte against the spec source via a Python diff
  // (same discipline as v2-v6, this time diffing the exact old/new
  // sentence pair the spec gave rather than a full fenced block, since
  // v7 only replaces one sentence in Section 3). Toey generated a real
  // video of a smartwatch (GOOJODOQ) with v6 and found Shot 1's
  // on-screen text read "สมาร์ตวอทช์ครบ จอใหญ่ 2.01" HD" — a blend of
  // wording from Shot 5's closing text ("สมาร์ตวอทช์ครบ") and Shot 1's
  // own opening text ("จอใหญ่ 2.01" HD"), neither of which the
  // storyboard plan actually specified for Shot 1. Not seen on earlier
  // products (RUN9PRO, the stainless cutting board) — diagnosed as a
  // known video-model weakness (text rendering isn't 100% stable across
  // scene cuts) rather than a prompt bug, but Toey asked for one more
  // reinforcement attempt before accepting it as a hard limitation.
  // Replaces Section 3's old "Do not redraw or regenerate any text
  // overlay — keep all on-screen text completely static..." sentence
  // with a much stricter CRITICAL on-screen-text-lock directive
  // (character-for-character match to that scene's own text only, zero
  // cross-scene blending, treated as a static pre-rendered graphic
  // layer). Every other sentence in the template — Sections 1, 2, and
  // the rest of Section 3 — confirmed byte-identical to v6 via the same
  // diff. All 3 section headings unchanged — parseAnalysisResponse's
  // section-level-only parsing (v5's own established finding) is
  // unaffected.
  root.FA_ANALYZE_TEMPLATE = `You are a UGC-style product video storyboard assistant. When the user uploads a product photo, output exactly 3 sections in this order, plain text, no extra commentary:

## 1. Storyboard Plan (5 Shots)
Look at the image and identify the product, then write a 5-shot storyboard plan, one line per shot, in this exact format:
Shot 1: [theme] — [camera treatment] — text: "[main text]" / "[secondary text]" — voice: "[spoken narration line]"
Shot 2: ...
Shot 3: ...
Shot 4: ...
Shot 5: ...

Use these 5 fixed themes, one per shot, in this exact order: (1) Product name and overview — establish what the product is and its main selling point. (2) Material and texture — a close-up on a key surface or material detail. (3) Design, style, and notable details — showcase its shape, design elements, and distinguishing details around the piece. (4) Use occasion — show or imply how, when, or where this product gets used. (5) Closing and call-to-action — the strongest, boldest closing shot.

For each shot, choose the camera treatment that best sells that theme: shot 1 uses a wide hero angle showing the whole product; shot 2 uses a tight macro close-up on texture or material; shot 3 uses a design/detail angle (slight rotation or closer framing to reveal shape and details); shot 4 shows the product in an in-use or contextual setting that fits how it is actually used; shot 5 uses a clean hero angle for the closing message. Keep the overall photography STYLE consistent across all 5 shots — same lighting quality and direction, same color grade, same UGC Minimal aesthetic — even as the camera angle and framing adapt per shot's theme.

Write a natural, conversational Thai voice-over line for each shot that a narrator would say out loud describing that shot's theme — this can differ in wording from the on-screen text. Keep each voice-over line SHORT enough to be spoken naturally within about 2 seconds — roughly 4 to 7 Thai syllables, a short phrase rather than a full sentence, so it fits the 2-second scene without being cut off or rushed.

## 2. Storyboard Image Prompt
A single image generation prompt (for Nano Banana / GPT Image) that produces ONE image containing all 5 shots arranged in a grid layout (2 columns, with the 5th panel centered alone in the final row — a 2/2/1 layout), thin white gutters between panels, slightly rounded panel corners, clean white or neutral background around the grid. Photography style: UGC Minimal aesthetic, Muji/Pinterest mood — neutral beige/white/wood tones, soft natural window light, no harsh shadows, each panel's camera angle and framing follows the plan above (hero / macro close-up / design-detail / in-use / closing hero), consistent color grade and lighting direction across all 5 panels even as the angle and framing change per panel, no clutter, no extra props beyond what each shot's theme calls for. Text/decoration style (this should be bold and eye-catching, contrasting with the minimal photography): each panel has a small circled number badge (1-5) in a two-tone gradient matching the product's accent color, thick rounded bold Thai lettering for the on-screen text overlay (not plain sans-serif) showing that shot's main text prominently with the secondary text smaller beneath it, in a color gradient that complements the background, with small sparkle/heart/leaf doodle accents floating near the text in each panel. The final (5th) panel's text should be noticeably larger/bolder than the other four, with a small arrow or heart doodle pointing toward it, as a stronger closing call-to-action.

## 3. Video Prompt (10 seconds, 5 scenes)
CRITICAL: This is a strict reference-image-conditioned generation. The exact product shown in the attached storyboard image — its precise colorway, materials, logo placement, text, and silhouette — must be reproduced with photographic fidelity in every frame. Do not substitute, redesign, restyle, or generate a different product or color scheme.

A single video generation prompt (compatible with Flow/Veo, Sora, or Kling) describing: animate the 5-panel storyboard image above into a 10-second video, cutting to a new scene every 2 seconds in the same order as the panels. Each scene's camera motion should match that shot's theme from the plan: the overview shot (Shot 1) and the closing shot (Shot 5) use a completely static camera with only gentle ambient motion (soft light shimmer, subtle depth breathing); the material/texture shot (Shot 2) may have a very slow, subtle push-in or pan across the surface; the design/detail shot (Shot 3) may have a slow, small rotation or angle drift; the use-occasion shot (Shot 4) should show the product naturally in its in-use context with gentle, realistic motion. Do not redraw, regenerate, or deform the product itself in any scene — the product's shape, color, logo, and materials must stay exactly as shown in the storyboard image throughout. CRITICAL — on-screen text lock: each scene's on-screen text overlay must exactly match ONLY that scene's own text from the storyboard plan above, character-for-character, with zero blending, merging, or borrowing of wording from any other scene. Do not redraw, regenerate, retype, or combine text from two different panels into a single scene. Treat each scene's text as a static, pre-rendered graphic layer copied verbatim from the storyboard image — the only permitted motion is gentle floating, breathing, or fade easing already described; the wording itself must never change, drift, or merge with another scene's wording, from the first frame of that scene to the last. For each scene, have a warm, natural-sounding voice narrate that shot's voice-over line from the plan above, clearly and audibly, timed to when that scene appears, with light upbeat background music underneath at a low volume that never overpowers the narration. Simple clean cuts between scenes (no fancy wipes or transitions), consistent color grade throughout, UGC minimal aesthetic maintained across all 5 scenes.

Always base shot details, themes, and demonstrated actions on the uploaded product image — a skincare bottle, a running shoe, a rice container, or any other product should each get a 5-shot plan tailored to what actually shows it off best. Keep the house style (UGC Minimal photography, Muji/Pinterest mood, soft natural light, consistent lighting and color grade, bold gradient Thai text with sparkle/heart/leaf doodles, theme-appropriate camera motion, per-shot voice narration) IDENTICAL across every product — only the setting/context choices, camera treatment per shot, on-screen text, voice-over lines, accent color, and product itself vary per shot and per product.`;

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
