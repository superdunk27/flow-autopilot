// Flow Autopilot — content script for Google Flow (labs.google/fx/tools/flow).
// Uploads the storyboard image + pastes the video prompt, waits for Veo
// to finish rendering, and extracts the resulting clip URL.
//
// Depends on globals from lib/messages.js, lib/selectors.js and
// lib/dom-utils.js, all loaded before this file per manifest.json.

(function () {
  const SEL = FA_SELECTORS.flow;
  const STEP = FA_STEPS.FLOW;

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

  async function uploadStoryboardImage(storyboardImageDataUrl) {
    const fileInput = await FA_UTILS.waitFor(SEL.fileInput, {
      step: STEP,
      description: 'ช่องแนบไฟล์ (file input) ของ Google Flow',
    });
    const file = FA_UTILS.dataUrlToFile(storyboardImageDataUrl, 'storyboard.png');
    await FA_UTILS.attachFileToInput(fileInput, file);
    await FA_UTILS.randomDelay(800, 1600);
  }

  async function submitVideoPrompt(videoPrompt) {
    const promptField = await FA_UTILS.waitFor(SEL.promptField, {
      step: STEP,
      description: 'ช่องกรอก prompt วิดีโอ',
    });
    FA_UTILS.typeIntoComposer(promptField, videoPrompt);
    await FA_UTILS.randomDelay(500, 1100);

    const generateBtn = await FA_UTILS.waitFor(SEL.generateButton, {
      step: STEP,
      description: 'ปุ่ม Generate',
    });
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
    await ensureNewProject();
    await uploadStoryboardImage(payload.storyboardImageDataUrl);
    await submitVideoPrompt(payload.videoPrompt);
    const result = await waitForVideo();
    chrome.runtime.sendMessage({
      type: FA_MSG.STEP_DONE,
      step: STEP,
      ok: true,
      payload: result,
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
