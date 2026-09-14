// Flow Autopilot — content script for Google Flow (flow.google.com).
// Uploads the storyboard image + pastes the video prompt, waits for Veo
// to finish rendering, and extracts the resulting clip URL.
//
// Depends on globals from lib/messages.js, lib/selectors.js and
// lib/dom-utils.js, all loaded before this file per manifest.json.

(function () {
  const SEL = FA_SELECTORS.flow;
  const STEP = FA_STEPS.FLOW;
  const GENERATE_TEXT_PATTERNS = [/^generate$/i, /generate video/i, /create video/i];
  const NEW_PROJECT_TEXT_PATTERNS = [/new project/i];
  const ADD_TO_PROMPT_TEXT_PATTERNS = [/^add to prompt$/i, /add to prompt/i];

  // Same keepalive-port acceptance as content-chatgpt.js — see README "v16".
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== FA_KEEPALIVE_PORT_NAME) return;
  });

  // Same retry+fallback STEP_DONE delivery as content-chatgpt.js — see
  // that file's sendStepDone() doc comment and README "v16" for why a
  // bare fire-and-forget sendMessage for this specific message is a real
  // silent-failure risk, not a theoretical one.
  async function sendStepDone(message) {
    const MAX_ATTEMPTS = 4;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await chrome.runtime.sendMessage(message);
        return;
      } catch (err) {
        console.error('[Flow Autopilot] STEP_DONE delivery attempt', attempt, 'of', MAX_ATTEMPTS, 'failed:', err);
        if (attempt < MAX_ATTEMPTS) await FA_UTILS.sleep(1000 * attempt);
      }
    }
    console.error(
      '[Flow Autopilot] STEP_DONE could not be delivered after',
      MAX_ATTEMPTS,
      'attempts — writing result to chrome.storage.local (key:',
      FA_STORAGE_KEYS.LOST_STEP_DONE,
      ') as a fallback instead of discarding it'
    );
    try {
      await chrome.storage.local.set({ [FA_STORAGE_KEYS.LOST_STEP_DONE]: { ...message, lostAt: Date.now() } });
    } catch (_) {
      // best-effort only — nothing further to fall back to
    }
  }

  function collectWarning(warnings, el, selectorList, label) {
    if (FA_UTILS.isLastResortMatch(el, selectorList)) {
      warnings.push(
        `⚠️ ${label}: จับคู่ด้วย selector ทั่วไปที่สุด (last-resort) — อาจได้ element ผิด โปรดตรวจผลลัพธ์`
      );
    }
  }

  async function ensureNewProject() {
    // If a "New project" affordance is visible (i.e. we're not already
    // inside a project), click it. If we're already in a project (e.g.
    // Flow navigated us there directly), this is a no-op — the upload
    // dropzone check right after will just proceed.
    //
    // CONFIRMED live 2026-09-14: real DOM query found the "New project"
    // button has NO aria-label and NO data-testid at all — only visible
    // text ("add\nNew project", the "add" being a Material icon
    // ligature). The old aria-label-based selectors never matched
    // anything real; findByVisibleText is the actual primary path now,
    // CSS candidates kept only as a cheap first try in case a future
    // redesign adds a real attribute.
    try {
      let btn = null;
      for (const sel of SEL.newProjectButton) {
        try {
          btn = document.querySelector(sel);
        } catch (_) { /* ignore invalid selector */ }
        if (btn) break;
      }
      if (!btn) btn = FA_UTILS.findByVisibleText('button, a', NEW_PROJECT_TEXT_PATTERNS);
      if (btn) {
        btn.click();
        await FA_UTILS.randomDelay(800, 1500);
      }
    } catch (_) {
      // not present — assume we're already in a project context
    }
  }

  // CONFIRMED live 2026-09-14 (2nd round): no <input type="file"> exists
  // on the page until this exact 2-click sequence happens — click "Add
  // ingredients to the prompt box" to open a media panel, then click
  // "Upload media" (a real `.sidebar-upload-btn`) inside it, which makes
  // a real file input appear (accept list confirmed distinctive — see
  // selectors.js). Feeding a file through that input via DataTransfer
  // was NOT confirmed to complete an upload this round (live interaction
  // became unreliable right as this was being tested) — see README "v6".
  /**
   * Real bug found by QA reviewing b0ba5c4 (2026-09-15, see README
   * "v27"): the previous "verify-after-type" check read the typed
   * text back from the SAME element findPromptField() had just chosen
   * — a tautology that always passes regardless of whether the right
   * element was picked, providing zero actual protection against the
   * exact wrong-field risk it was meant to close. QA's fix: tie field
   * selection to real DOM evidence of the action we just took (adding
   * the storyboard image to the prompt), not an unrelated size/label
   * heuristic that a decoy element could satisfy by coincidence (e.g.
   * mid-transition right after the asset picker closes).
   *
   * uploadStoryboardImage() below snapshots every <img> element that
   * exists *before* touching the file input, then again right after
   * "Add to prompt" settles, and returns whichever <img> elements are
   * genuinely new — these are strong, structurally-grounded evidence
   * that this specific image really did land somewhere, without
   * needing to know or guess its actual class/selector.
   */
  function snapshotImages() {
    return new Set(document.querySelectorAll('img'));
  }

  function newImagesSince(before) {
    return Array.from(document.querySelectorAll('img')).filter((img) => !before.has(img));
  }

  async function uploadStoryboardImage(storyboardImageDataUrl, warnings) {
    const imagesBeforeUpload = snapshotImages();
    const dropzoneBtn = await FA_UTILS.waitFor(SEL.uploadDropzone, {
      step: STEP,
      description: 'ปุ่มเปิดแผงแนบไฟล์ ("Add ingredients to the prompt box")',
    });
    collectWarning(warnings, dropzoneBtn, SEL.uploadDropzone, 'ปุ่มเปิดแผงแนบไฟล์');
    dropzoneBtn.click();
    await FA_UTILS.randomDelay(500, 1000);

    let uploadBtn;
    try {
      uploadBtn = await FA_UTILS.waitFor(SEL.uploadButton, {
        step: STEP,
        description: 'ปุ่ม "Upload media"',
        timeoutMs: 8000,
      });
    } catch (_) {
      uploadBtn = FA_UTILS.findByVisibleText('button, span', [/^upload media$/i, /^upload$/i]);
      if (uploadBtn && uploadBtn.tagName !== 'BUTTON') uploadBtn = uploadBtn.closest('button') || uploadBtn;
      if (uploadBtn) {
        warnings.push('⚠️ ปุ่ม "Upload media": หาไม่เจอด้วย selector ที่กำหนด ใช้การจับคู่จากข้อความปุ่มแทน โปรดตรวจผลลัพธ์');
      } else {
        throw new FASelectorError({
          step: STEP,
          description: 'ปุ่ม "Upload media"',
          selectorsTried: [...SEL.uploadButton, '<text match: upload media / upload>'],
        });
      }
    }
    uploadBtn.click();
    await FA_UTILS.randomDelay(500, 1000);

    const fileInput = await FA_UTILS.waitFor(SEL.fileInput, {
      step: STEP,
      description: 'ช่องแนบไฟล์ (file input) ของ Google Flow',
    });
    collectWarning(warnings, fileInput, SEL.fileInput, 'ช่องแนบไฟล์');
    const file = FA_UTILS.dataUrlToFile(storyboardImageDataUrl, 'storyboard.png');
    await FA_UTILS.attachFileToInput(fileInput, file);
    await FA_UTILS.randomDelay(800, 1600);

    // Real gap found live 2026-09-15 (see README "v25"): missing
    // entirely, not wrong — feeding the file into fileInput above only
    // puts it in an asset picker, which Aree confirmed live stays open
    // afterward with an explicit "Add to prompt" button that was never
    // clicked. Without this, submitVideoPrompt() went on to type the
    // video prompt and click Generate anyway with no image actually
    // committed to the prompt — and per Aree's live check of the
    // project's "All media" (only storyboard.png present, no video),
    // Flow appears to just silently no-op on an incomplete request
    // rather than show any error, which is exactly the kind of
    // silent-wrong-success this project exists to catch. Required, not
    // soft — same reasoning as attachProductImage's required
    // attachmentPreview gate on the ChatGPT side (see README "v7"):
    // proceeding to Generate without confirming this succeeded would
    // silently waste a real quota unit on an empty request.
    let addToPromptBtn = null;
    let addToPromptViaCss = false;
    const addToPromptStart = Date.now();
    while (!addToPromptBtn && Date.now() - addToPromptStart < 10000) {
      for (const sel of SEL.addToPromptButton) {
        try {
          addToPromptBtn = document.querySelector(sel);
        } catch (_) { /* ignore invalid selector */ }
        if (addToPromptBtn) break;
      }
      if (addToPromptBtn) {
        addToPromptViaCss = true;
      } else {
        addToPromptBtn = FA_UTILS.findByVisibleText('button', ADD_TO_PROMPT_TEXT_PATTERNS);
      }
      if (!addToPromptBtn) await FA_UTILS.sleep(250);
    }
    if (!addToPromptBtn) {
      throw new FASelectorError({
        step: STEP,
        description: 'ปุ่ม "Add to prompt" (ยืนยันว่ารูป storyboard ถูกใส่เข้า prompt จริง ก่อนพิมพ์/generate)',
        selectorsTried: [...SEL.addToPromptButton, `<text match: ${ADD_TO_PROMPT_TEXT_PATTERNS.join(', ')}>`],
        siteHint: 'ถ้าปุ่มนี้เปลี่ยนชื่อ/ตำแหน่งอีก ตรวจ DOM จริงผ่าน DevTools แล้วปรับ selectors.js',
      });
    }
    if (!addToPromptViaCss) {
      warnings.push('⚠️ ปุ่ม "Add to prompt": หาไม่เจอด้วย selector ที่กำหนด ใช้การจับคู่จากข้อความปุ่มแทน โปรดตรวจผลลัพธ์');
    }
    addToPromptBtn.click();
    await FA_UTILS.randomDelay(500, 1000);

    // QA's Q2 (2026-09-15, see README "v26") — not previously checked
    // at all: nothing confirmed the click actually did anything. Weak
    // but real signal, since the exact post-click DOM (e.g. "does a
    // thumbnail now appear in the prompt box") isn't confirmed live:
    // the asset picker's own button is expected to disappear/become
    // not-visible once its action completes (closing the picker) — if
    // it's still clearly there and visible, that's worth a warning, not
    // a hard failure, since this heuristic itself isn't live-confirmed
    // either and a false failure here would be worse than a missed one.
    if (FA_UTILS.isReallyVisible(addToPromptBtn)) {
      warnings.push('⚠️ ปุ่ม "Add to prompt": คลิกแล้วแต่ปุ่มยังแสดงอยู่ (ไม่ปิด asset picker) — ไม่ยืนยันได้ว่าคลิกมีผลจริง โปรดตรวจผลลัพธ์');
    }

    // See the doc comment above snapshotImages()/newImagesSince() — this
    // is the real evidence findPromptField() uses to pick the right
    // field, instead of a size/label guess disconnected from what we
    // actually just did to the page.
    const newImgs = newImagesSince(imagesBeforeUpload);
    if (!newImgs.length) {
      warnings.push('⚠️ ไม่เจอรูปใหม่ใน DOM หลังกด "Add to prompt" — findPromptField() จะ fallback ไปใช้ heuristic ขนาด/label แทน (แม่นยำน้อยกว่า) โปรดตรวจผลลัพธ์');
    }
    return newImgs;
  }

  // Real gap found by QA reviewing ef7db33 (2026-09-15, see README
  // "v26") — exactly the risk that fix was meant to close, one step
  // later: SEL.promptField's generic catch-alls (`textarea`,
  // `div[contenteditable="true"]`) went through a bare
  // `document.querySelector`, which just returns whichever qualifying
  // element comes first in DOM order — the real prompt box has no
  // id/testid/aria-label at all (see selectors.js), and the same page
  // also has an unrelated search input and an "Editable text"-labelled
  // field QA found live. Typing the video prompt into the wrong one
  // and clicking Generate would waste a real, scarce (~5/day) quota
  // unit — the exact failure mode ef7db33 just fixed for the image,
  // now checked for the text too.
  const PROMPT_FIELD_EXCLUDE_HINTS = [/search/i, /editable text/i];

  /**
   * Combined DOM-tree distance between `a` and `b` (steps up from `a`
   * to their nearest common ancestor, plus steps up from `b`) —
   * `Infinity` if somehow not both attached to the same document. Used
   * to score prompt-field candidates by real structural closeness to
   * confirmed evidence, instead of an unrelated size/label guess.
   */
  function commonAncestorDistance(a, b) {
    const depthsOfA = new Map();
    let node = a;
    let depth = 0;
    while (node) {
      depthsOfA.set(node, depth);
      node = node.parentElement;
      depth++;
    }
    node = b;
    depth = 0;
    while (node) {
      if (depthsOfA.has(node)) return depth + depthsOfA.get(node);
      node = node.parentElement;
      depth++;
    }
    return Infinity;
  }

  /**
   * QA found (2026-09-15, see README "v27") that the previous version
   * of this — scoring candidates purely by rendered size — could be
   * fooled by a decoy element that happens to render large at the
   * moment of the query (e.g. mid-transition right as the asset picker
   * closes) and has no aria-label/placeholder to exclude it by. Now
   * takes `evidenceImgs` — real `<img>` elements confirmed to have
   * newly appeared as a direct result of clicking "Add to prompt" (see
   * uploadStoryboardImage()'s snapshotImages()/newImagesSince()) — and,
   * when available, picks whichever visible candidate is structurally
   * *closest* in the DOM tree to that real evidence, rather than
   * guessing from size/label alone. Falls back to the old size
   * heuristic only when no such evidence exists (e.g. the "Add to
   * prompt" click didn't produce a detectably new `<img>` at all).
   */
  async function findPromptField(step, evidenceImgs = [], { timeoutMs = 20000, pollMs = 250 } = {}) {
    // The first 3 candidates in SEL.promptField require an
    // aria-label/placeholder actually containing "prompt" — a strong,
    // specific signal, safe to trust via a plain querySelector if one
    // ever matches (kept in case a future DOM revision adds one).
    const specificSelectors = SEL.promptField.slice(0, 3);
    const start = Date.now();
    for (;;) {
      for (const sel of specificSelectors) {
        let el = null;
        try {
          el = document.querySelector(sel);
        } catch (_) { /* ignore invalid selector */ }
        if (el) return el;
      }
      const candidates = Array.from(document.querySelectorAll('textarea, div[contenteditable="true"]'))
        .filter((el) => FA_UTILS.isReallyVisible(el))
        .filter((el) => {
          const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''}`;
          return !PROMPT_FIELD_EXCLUDE_HINTS.some((re) => re.test(label));
        });
      if (candidates.length) {
        if (evidenceImgs.length) {
          candidates.sort((a, b) => {
            const da = Math.min(...evidenceImgs.map((img) => commonAncestorDistance(a, img)));
            const db = Math.min(...evidenceImgs.map((img) => commonAncestorDistance(b, img)));
            return da - db;
          });
        } else {
          // No real evidence to anchor on — fall back to preferring the
          // largest rendered candidate, since the main composer is
          // expected to visually dominate the page far more than a
          // small utility input like a search box. Weaker than the
          // evidence-based path above; a warning is pushed by the
          // caller in this case (see uploadStoryboardImage()).
          candidates.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return rb.width * rb.height - ra.width * ra.height;
          });
        }
        return candidates[0];
      }
      if (Date.now() - start > timeoutMs) {
        throw new FASelectorError({
          step,
          description: 'ช่องกรอก prompt วิดีโอ',
          selectorsTried: SEL.promptField,
          siteHint: 'ตรวจ DOM จริงผ่าน DevTools ว่า contenteditable/textarea ตัวไหนคือ prompt box จริง แล้วปรับ exclude hints ใน findPromptField()',
        });
      }
      await FA_UTILS.sleep(pollMs);
    }
  }

  async function submitVideoPrompt(videoPrompt, warnings, evidenceImgs = []) {
    const promptField = await findPromptField(STEP, evidenceImgs);
    collectWarning(warnings, promptField, SEL.promptField, 'ช่องกรอก prompt');
    FA_UTILS.typeIntoComposer(promptField, videoPrompt);
    await FA_UTILS.randomDelay(500, 1100);

    // NOTE (2026-09-15, see README "v27"): this only catches typing
    // silently failing to register (e.g. execCommand blocked) — it
    // does NOT verify the *element itself* was the right one, since
    // reading back from the same reference we just wrote to is a
    // tautology (QA's catch on the previous version of this check).
    // Picking the right element is findPromptField()'s job now, via
    // real DOM evidence above — this is a narrower, honestly-scoped
    // safety net for a different failure mode, not a replacement for it.
    const landedText = (promptField.value ?? promptField.innerText ?? promptField.textContent ?? '').trim();
    const expectedSnippet = videoPrompt.trim().slice(0, 15);
    if (!landedText || (expectedSnippet && !landedText.includes(expectedSnippet))) {
      throw new FASelectorError({
        step: STEP,
        description:
          `ยืนยันว่าพิมพ์ video prompt เข้าไปสำเร็จจริง (เจอข้อความในช่อง: "${landedText.slice(0, 80)}") ` +
          '— การพิมพ์อาจไม่สำเร็จ (ไม่ใช่เรื่องเลือกช่องผิด — จุดนั้นเช็คแยกแล้วใน findPromptField()) ไม่กด Generate ต่อเพื่อป้องกันเสีย quota ฟรีๆ',
        selectorsTried: SEL.promptField,
      });
    }

    let generateBtn;
    try {
      generateBtn = await FA_UTILS.waitFor(SEL.generateButton, {
        step: STEP,
        description: 'ปุ่ม Generate',
        timeoutMs: 8000,
      });
    } catch (_) {
      // Structural selectors missed — fall back to matching the button's
      // visible text, which is more specific than a bare CSS guess.
      generateBtn = FA_UTILS.findByVisibleText('button', GENERATE_TEXT_PATTERNS);
      if (generateBtn) {
        warnings.push('⚠️ ปุ่ม Generate: หาไม่เจอด้วย selector ที่กำหนด ใช้การจับคู่จากข้อความปุ่มแทน โปรดตรวจผลลัพธ์');
      } else {
        throw new FASelectorError({
          step: STEP,
          description: 'ปุ่ม Generate',
          selectorsTried: [...SEL.generateButton, `<text match: ${GENERATE_TEXT_PATTERNS.join(', ')}>`],
        });
      }
    }
    // Real live evidence (Toey, 2026-09-15, see README "v26"): hovering
    // this exact button showed a tooltip reading "prompt must be
    // provided" — the button is a real disabled-state element gated by
    // Flow's own validation when the request is incomplete, not merely
    // "clicking it does nothing." Clicking a disabled element fires no
    // handler and throws nothing, which is almost certainly why the
    // earlier live test's Generate click produced no visible error at
    // all despite the request being incomplete — a silent no-op that
    // looked like success. Checked explicitly now, same pattern as
    // waitForSendButtonReady() on the ChatGPT side: never click blind.
    if (!FA_UTILS.isEnabled(generateBtn)) {
      throw new FASelectorError({
        step: STEP,
        description:
          'ปุ่ม Generate ยัง disabled อยู่ (Flow เองบอกไว้ตรงๆ ผ่าน tooltip ว่า "prompt must be provided" ' +
          'เมื่อข้อมูลไม่ครบ) — ไม่กดปุ่มที่ disabled เพื่อป้องกันการคลิกที่ไม่มีผลอะไรเลยแบบเงียบๆ ' +
          'ตรวจว่ารูป (ผ่าน "Add to prompt") และ prompt text เข้าไปในช่องที่ถูกต้องจริงหรือยัง',
        selectorsTried: SEL.generateButton,
      });
    }
    generateBtn.click();
  }

  async function waitForVideo() {
    await FA_UTILS.waitForGenerationComplete(SEL.generatingIndicator, {
      step: STEP,
      description: 'Veo กำลังสร้างวิดีโอ',
      // Video generation is slower than a chat reply — give it more room.
      timeoutMs: 10 * 60 * 1000,
    });
    const videoEl = await FA_UTILS.waitFor(SEL.resultVideo, {
      step: STEP,
      description: 'วิดีโอผลลัพธ์',
      timeoutMs: 30000,
    });
    const src = videoEl.currentSrc || videoEl.src || videoEl.querySelector('source')?.src;
    if (!src) {
      throw new FASelectorError({
        step: STEP,
        description: 'src ของ <video> ผลลัพธ์',
        selectorsTried: SEL.resultVideo,
      });
    }
    return { resultVideoUrl: src, resultProjectUrl: location.href };
  }

  async function run(payload) {
    const warnings = [];
    await ensureNewProject();
    const evidenceImgs = await uploadStoryboardImage(payload.storyboardImageDataUrl, warnings);
    await submitVideoPrompt(payload.videoPrompt, warnings, evidenceImgs);
    const result = await waitForVideo();
    await sendStepDone({
      type: FA_MSG.STEP_DONE,
      step: STEP,
      ok: true,
      runId: payload.runId,
      payload: { ...result, warnings },
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== FA_MSG.RUN_FLOW_STEP) return undefined;
    run(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch(async (err) => {
        console.error('[Flow Autopilot]', err);
        await sendStepDone({
          type: FA_MSG.STEP_DONE,
          step: STEP,
          ok: false,
          runId: message.payload.runId,
          error: FA_UTILS.serializeError(err),
        });
        sendResponse({ ok: false, error: String(err.message || err) });
      });
    return true; // async
  });
})();
