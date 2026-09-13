// Flow Autopilot — background service worker.
// Orchestrates the 3-step pipeline across tabs. Classic (non-module)
// service worker so it can share the same plain-script lib files as the
// content scripts via importScripts().

importScripts('../lib/messages.js');

const RUN_KEY = FA_STORAGE_KEYS.RUN;
const OPT_KEY = FA_STORAGE_KEYS.OPTIONS;

// ---- storage helpers ---------------------------------------------------

async function getRun() {
  const { [RUN_KEY]: run } = await chrome.storage.local.get(RUN_KEY);
  return run || null;
}

async function setRun(patch) {
  const current = (await getRun()) || {};
  const next = { ...current, ...patch, updatedAt: Date.now() };
  await chrome.storage.local.set({ [RUN_KEY]: next });
  return next;
}

async function getOptions() {
  const { [OPT_KEY]: opts } = await chrome.storage.local.get(OPT_KEY);
  return { ...FA_DEFAULT_OPTIONS, ...(opts || {}) };
}

function fail(step, message, hint) {
  return setRun({ status: FA_STATUS.ERROR, currentStep: step, error: { step, message, hint } });
}

// ---- tab + messaging helpers -------------------------------------------

async function openTab(url) {
  const tab = await chrome.tabs.create({ url, active: true });
  return tab.id;
}

/**
 * Sends a message to a tab's content script, retrying while the page is
 * still loading / the content script hasn't registered its listener yet.
 * Throws a descriptive error instead of silently giving up.
 */
async function sendMessageWithRetry(tabId, message, { timeoutMs = 20000, intervalMs = 400 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `[Flow Autopilot] เชื่อมต่อกับ content script ใน tab ${tabId} ไม่ได้ภายใน ${Math.round(timeoutMs / 1000)}s ` +
            `(อาจเป็นเพราะโดเมนไม่ตรงกับที่ประกาศใน manifest.json, หรือหน้ายังโหลดไม่เสร็จ)`
        );
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

/**
 * Races `promise` against a ceiling timeout, rejecting with a clear
 * message if it wins. Belt-and-suspenders against a run getting stuck at
 * status "running" forever: `chrome.tabs.sendMessage`'s returned promise
 * only settles once the content script calls sendResponse (see
 * content-chatgpt.js / content-flow.js's message listeners), which for
 * this extension only happens once an entire step's work has finished or
 * thrown — if a tab gets closed, navigated away from, or otherwise loses
 * its content script mid-step in a way that doesn't cleanly reject that
 * promise, background.js would otherwise await it indefinitely with no
 * way out except the user manually clicking "ยกเลิก" without ever being
 * told why. This ensures a step always eventually reaches a terminal
 * status on its own.
 */
function withCeiling(promise, ms, description) {
  let timer;
  const ceiling = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`[Flow Autopilot] ${description} ไม่เสร็จภายใน ${Math.round(ms / 60000)} นาที — ยกเลิกอัตโนมัติแทนที่จะค้างไม่มีกำหนด`)),
      ms
    );
  });
  return Promise.race([promise, ceiling]).finally(() => clearTimeout(timer));
}

// ---- pipeline steps -------------------------------------------------------

// Ceilings comfortably above each step's own internal timeouts (5 min
// generation-wait for chatgpt.com steps, 10 min for Flow's video), so a
// step that's still genuinely working never trips this — it only fires
// if the content script's response never arrives at all.
const CHATGPT_STEP_CEILING_MS = 8 * 60 * 1000;
const FLOW_STEP_CEILING_MS = 12 * 60 * 1000;

async function startAnalyzeStep(productImageDataUrl) {
  const opts = await getOptions();
  // No custom GPT required as of v2 — plain chatgpt.com new chat, with
  // the analysis instructions riding along as a user message instead of
  // a custom GPT's system prompt (free accounts can't create custom
  // GPTs). See ψ/active/flow-autopilot-extension.md "Update v2".
  const tabId = await openTab('https://chatgpt.com/');
  await setRun({
    status: FA_STATUS.RUNNING,
    currentStep: FA_STEPS.ANALYZE,
    productImageDataUrl,
    tabIds: { analyze: tabId },
    error: null,
    warnings: [],
  });
  try {
    await withCeiling(
      sendMessageWithRetry(tabId, {
        type: FA_MSG.RUN_CHATGPT_STEP,
        payload: {
          mode: FA_STEPS.ANALYZE,
          stepLabel: FA_STEPS.ANALYZE,
          productImageDataUrl,
          promptText: `${opts.analyzeTemplate}\n\n${FA_ANALYZE_TRAILER}`,
        },
      }),
      CHATGPT_STEP_CEILING_MS,
      'ขั้นวิเคราะห์สินค้า (ChatGPT)'
    );
  } catch (err) {
    await fail(FA_STEPS.ANALYZE, err.message);
  }
}

async function startImageGenStep(storyboardPrompt) {
  const run = await getRun();
  const tabId = await openTab('https://chatgpt.com/');
  await setRun({
    status: FA_STATUS.RUNNING,
    currentStep: FA_STEPS.IMAGEGEN,
    storyboardPrompt,
    tabIds: { ...run.tabIds, imagegen: tabId },
    error: null,
  });
  try {
    await withCeiling(
      sendMessageWithRetry(tabId, {
        type: FA_MSG.RUN_CHATGPT_STEP,
        payload: {
          mode: FA_STEPS.IMAGEGEN,
          stepLabel: FA_STEPS.IMAGEGEN,
          productImageDataUrl: run.productImageDataUrl,
          promptText: storyboardPrompt,
        },
      }),
      CHATGPT_STEP_CEILING_MS,
      'ขั้นสร้างภาพ storyboard (ChatGPT)'
    );
  } catch (err) {
    await fail(FA_STEPS.IMAGEGEN, err.message);
  }
}

async function startFlowStep(videoPrompt) {
  const run = await getRun();
  const tabId = await openTab('https://flow.google.com/');
  await setRun({
    status: FA_STATUS.RUNNING,
    currentStep: FA_STEPS.FLOW,
    videoPrompt,
    tabIds: { ...run.tabIds, flow: tabId },
    error: null,
  });
  try {
    await withCeiling(
      sendMessageWithRetry(tabId, {
        type: FA_MSG.RUN_FLOW_STEP,
        payload: {
          storyboardImageDataUrl: run.storyboardImageDataUrl,
          videoPrompt,
        },
      }),
      FLOW_STEP_CEILING_MS,
      'ขั้นสร้างวิดีโอ (Google Flow)'
    );
  } catch (err) {
    await fail(FA_STEPS.FLOW, err.message);
  }
}

// ---- message router ------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    console.error('[Flow Autopilot] unhandled error in message handler', err);
    sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  });
  return true; // keep the channel open for the async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case FA_MSG.GET_STATE: {
      return { run: await getRun(), options: await getOptions() };
    }

    case FA_MSG.START_RUN: {
      await startAnalyzeStep(message.payload.productImageDataUrl);
      return { ok: true };
    }

    case FA_MSG.CONFIRM_STEP: {
      const { step, fields } = message.payload;
      if (step === FA_STEPS.ANALYZE) {
        await setRun({
          storyboardPlan: fields.storyboardPlan,
          storyboardPrompt: fields.storyboardPrompt,
          videoPrompt: fields.videoPrompt,
        });
        await startImageGenStep(fields.storyboardPrompt);
      } else if (step === FA_STEPS.IMAGEGEN) {
        await setRun({ videoPrompt: fields.videoPrompt });
        await startFlowStep(fields.videoPrompt);
      }
      return { ok: true };
    }

    case FA_MSG.RETRY_STEP: {
      const run = await getRun();
      if (!run) return { ok: false, error: 'ไม่มี run ให้ retry' };
      if (run.currentStep === FA_STEPS.ANALYZE) await startAnalyzeStep(run.productImageDataUrl);
      else if (run.currentStep === FA_STEPS.IMAGEGEN) await startImageGenStep(run.storyboardPrompt);
      else if (run.currentStep === FA_STEPS.FLOW) await startFlowStep(run.videoPrompt);
      return { ok: true };
    }

    case FA_MSG.CANCEL_RUN: {
      await chrome.storage.local.remove(RUN_KEY);
      return { ok: true };
    }

    case FA_MSG.STEP_DONE: {
      await handleStepDone(message);
      return { ok: true };
    }

    default:
      return { ok: false, error: `unknown message type: ${message.type}` };
  }
}

async function appendWarnings(step, newWarnings) {
  if (!newWarnings || !newWarnings.length) return;
  const run = await getRun();
  const tagged = newWarnings.map((w) => `[${step}] ${w}`);
  await setRun({ warnings: [...(run?.warnings || []), ...tagged] });
}

async function handleStepDone(message) {
  const { step, ok, payload, error } = message;
  if (!ok) {
    await fail(step, error?.message || 'unknown error', error?.selectorsTried ? `Selectors tried: ${error.selectorsTried.join(', ')}` : undefined);
    return;
  }

  await appendWarnings(step, payload.warnings);

  const opts = await getOptions();

  if (step === FA_STEPS.ANALYZE) {
    const patch = {
      storyboardPlan: payload.storyboardPlan,
      storyboardPrompt: payload.storyboardPrompt,
      videoPrompt: payload.videoPrompt,
      rawAnalyzeResponse: payload.raw,
    };
    if (opts.autoReview) {
      await setRun({ ...patch, status: FA_STATUS.AWAITING_REVIEW, currentStep: FA_STEPS.ANALYZE });
    } else {
      await setRun(patch);
      await startImageGenStep(payload.storyboardPrompt);
    }
    return;
  }

  if (step === FA_STEPS.IMAGEGEN) {
    const patch = { storyboardImageDataUrl: payload.imageDataUrl };
    if (opts.autoReview) {
      await setRun({ ...patch, status: FA_STATUS.AWAITING_REVIEW, currentStep: FA_STEPS.IMAGEGEN });
    } else {
      await setRun(patch);
      const run = await getRun();
      await startFlowStep(run.videoPrompt);
    }
    return;
  }

  if (step === FA_STEPS.FLOW) {
    await setRun({
      status: FA_STATUS.DONE,
      currentStep: FA_STEPS.FLOW,
      resultVideoUrl: payload.resultVideoUrl,
      resultProjectUrl: payload.resultProjectUrl,
    });
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: '../../icons/icon128.png',
        title: 'Flow Autopilot',
        message: 'วิดีโอเสร็จแล้ว — เปิด extension เพื่อดูลิงก์ผลลัพธ์',
      });
    } catch (_) {
      // notifications permission optional; ignore if unavailable
    }
  }
}
