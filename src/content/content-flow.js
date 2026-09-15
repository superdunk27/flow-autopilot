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
    try {
      const btn = await FA_UTILS.waitFor(SEL.newProjectButton, {
        step: STEP,
        description: 'ปุ่ม "New project"',
        timeoutMs: 8000,
      });
      btn.click();
      await FA_UTILS.randomDelay(800, 1500);
    } catch (_) {
      // not present — assume we're already in a project context
    }
  }

  async function uploadStoryboardImage(storyboardImageDataUrl, warnings) {
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
    chrome.runtime.sendMessage({
      type: FA_MSG.STEP_DONE,
      step: STEP,
      ok: true,
      payload: { ...result, warnings },
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== FA_MSG.RUN_FLOW_STEP) return undefined;
    run(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error('[Flow Autopilot]', err);
        chrome.runtime.sendMessage({
          type: FA_MSG.STEP_DONE,
          step: STEP,
          ok: false,
          error: FA_UTILS.serializeError(err),
        });
        sendResponse({ ok: false, error: String(err.message || err) });
      });
    return true; // async
  });
})();
