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
  async function uploadStoryboardImage(storyboardImageDataUrl, warnings) {
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
  }

  async function submitVideoPrompt(videoPrompt, warnings) {
    const promptField = await FA_UTILS.waitFor(SEL.promptField, {
      step: STEP,
      description: 'ช่องกรอก prompt วิดีโอ',
    });
    collectWarning(warnings, promptField, SEL.promptField, 'ช่องกรอก prompt');
    FA_UTILS.typeIntoComposer(promptField, videoPrompt);
    await FA_UTILS.randomDelay(500, 1100);

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
    await uploadStoryboardImage(payload.storyboardImageDataUrl, warnings);
    await submitVideoPrompt(payload.videoPrompt, warnings);
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
