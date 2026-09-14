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

// ---- MV3 service-worker keepalive ---------------------------------------

// Real bug found live 2026-09-15 (see README "v13"): chrome://extensions
// showed this service worker as (Inactive) *while a run was still stuck
// "running"* — confirmed directly, not theorized. MV3 terminates an idle
// SW after ~30s of no extension-API activity, and does so unconditionally
// (a pending chrome.tabs.sendMessage() response and even the withCeiling
// setTimeout below are NOT a reliable exemption — this is a well-known
// MV3 platform gap, not specific to this extension). When that happens
// mid-step, the *entire* startAnalyzeStep/etc. call stack — including its
// own try/catch → fail() safety net — is destroyed with it: the very
// mechanism built to guarantee "a step always eventually reaches a
// terminal status" (see withCeiling's doc comment) is itself vulnerable
// to exactly what it was built to catch. A step can go fully silent this
// way even though nothing in background.js or content-chatgpt.js is
// actually broken.
//
// Standard fix: a recurring chrome.alarms alarm while a step is in
// flight. Any extension API event (an alarm firing included) resets the
// 30s idle countdown, so firing well under that threshold keeps the SW
// alive for the whole step without needing to resume any destroyed
// state — chrome.alarms is used (not a bare setTimeout/setInterval)
// specifically because those are the *unreliable* ones in a service
// worker per Chrome's own docs; alarms are the documented exception.
//
// UPDATE 2026-09-15 (see README "v16"): the caveat above turned out to
// matter live, not just in theory. A fresh run got past "ChatGPT ตอบเสร็จ
// แล้ว" — real content confirmed visible in the tab — but the popup froze
// with zero errors anywhere (chrome://extensions/?errors= stayed empty),
// and the service worker was confirmed (Inactive) again at exactly the
// moment progress stopped. No throw, no reject — execution just stopped,
// consistent with the alarm not actually preventing idle-termination
// during this step, most likely because periodInMinutes silently got
// clamped coarser than the ~30s idle window (never live-confirmed either
// way — see v13). Switched the *primary* mechanism to the persistent-port
// technique flagged as the fallback back then: a live chrome.tabs.connect()
// port to the step's own tab has no minimum-period ambiguity at all —
// Chrome documents an open message channel as keeping the service worker
// alive for as long as it stays connected, independent of any timer.
// The alarm is kept running alongside it (belt-and-suspenders, and it
// still self-diagnoses via its console.debug tick), not removed.
const KEEPALIVE_ALARM_NAME = 'fa-keepalive';
const KEEPALIVE_PERIOD_MINUTES = 0.4; // ~24s, under the ~30s idle threshold

let keepalivePort = null;

function startKeepalive(tabId) {
  chrome.alarms.create(KEEPALIVE_ALARM_NAME, { periodInMinutes: KEEPALIVE_PERIOD_MINUTES });
  try {
    keepalivePort = chrome.tabs.connect(tabId, { name: FA_KEEPALIVE_PORT_NAME });
    keepalivePort.onDisconnect.addListener(() => {
      keepalivePort = null;
    });
  } catch (err) {
    // Best-effort — the alarm above still provides some protection even
    // if the port fails to open (e.g. the tab closed already).
    console.error('[Flow Autopilot] keepalive port failed to open', err);
  }
}

function stopKeepalive() {
  chrome.alarms.clear(KEEPALIVE_ALARM_NAME);
  if (keepalivePort) {
    try {
      keepalivePort.disconnect();
    } catch (_) {
      // already disconnected (e.g. the tab/content script went away)
    }
    keepalivePort = null;
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM_NAME) return;
  // No-op besides this console line — merely being a registered listener
  // that fires is what resets the SW's idle timer. Logged (not silent)
  // so a future live session can directly confirm from the SW's own
  // console whether keepalive ticks were actually still firing during a
  // stuck run, instead of having to assume it worked.
  console.debug('[Flow Autopilot] keepalive tick', new Date().toISOString());
});

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
    progressLabel: null,
  });
  startKeepalive(tabId);
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
  } finally {
    stopKeepalive();
  }
}

async function startImageGenStep(storyboardPrompt) {
  const run = await getRun();
  // chatgpt.com/images (not a plain new chat) — see README "v14".
  // Confirmed live 2026-09-14: this dedicated route's composer is
  // already in image-generation mode by default, and exposes the same
  // file input the analyze step already attaches to directly (no "+"
  // menu click needed), sidestepping that button's interestfor
  // trusted-event requirement instead of working around it.
  const tabId = await openTab('https://chatgpt.com/images');
  await setRun({
    status: FA_STATUS.RUNNING,
    currentStep: FA_STEPS.IMAGEGEN,
    storyboardPrompt,
    tabIds: { ...run.tabIds, imagegen: tabId },
    error: null,
    progressLabel: null,
  });
  startKeepalive(tabId);
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
  } finally {
    stopKeepalive();
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
    progressLabel: null,
  });
  startKeepalive(tabId);
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
  } finally {
    stopKeepalive();
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

    // START_RUN/CONFIRM_STEP/RETRY_STEP are each wrapped in their own
    // try/catch that writes to run state via fail() on any throw — not
    // just the errors already handled inside startAnalyzeStep() etc.
    // Real gap found (2026-09-15, see README "v11"): popup.js's Run/
    // Confirm/Retry click handlers are fire-and-forget
    // (chrome.runtime.sendMessage with no response handling), so if
    // something threw *before* reaching a step-starter's own internal
    // try/catch (e.g. getOptions()/openTab() failing), the only catch
    // was the generic top-level one below, which just logs to the
    // service worker's own (invisible to the user) console and returns
    // a response nobody reads — a genuine silent-fail path, distinct
    // from anything already covered by fail() inside the step starters.
    case FA_MSG.START_RUN: {
      try {
        await startAnalyzeStep(message.payload.productImageDataUrl);
      } catch (err) {
        console.error('[Flow Autopilot] START_RUN failed before its own error handling', err);
        await fail('setup', `เริ่ม run ไม่สำเร็จ: ${err.message || err}`, 'ลองใหม่ หรือเช็ค console ของ background service worker (chrome://extensions → รายละเอียด → ตรวจสอบ service worker)');
      }
      return { ok: true };
    }

    case FA_MSG.CONFIRM_STEP: {
      try {
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
      } catch (err) {
        console.error('[Flow Autopilot] CONFIRM_STEP failed before its own error handling', err);
        await fail(message.payload?.step || 'unknown', `ดำเนินการต่อไม่สำเร็จ: ${err.message || err}`);
      }
      return { ok: true };
    }

    case FA_MSG.RETRY_STEP: {
      try {
        const run = await getRun();
        if (!run) {
          console.error('[Flow Autopilot] RETRY_STEP called with no run in storage');
          return { ok: false, error: 'ไม่มี run ให้ retry' };
        }
        if (run.currentStep === FA_STEPS.ANALYZE) await startAnalyzeStep(run.productImageDataUrl);
        else if (run.currentStep === FA_STEPS.IMAGEGEN) await startImageGenStep(run.storyboardPrompt);
        else if (run.currentStep === FA_STEPS.FLOW) await startFlowStep(run.videoPrompt);
      } catch (err) {
        console.error('[Flow Autopilot] RETRY_STEP failed before its own error handling', err);
        await fail(message.payload?.step || 'unknown', `ลองใหม่ไม่สำเร็จ: ${err.message || err}`);
      }
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

    case FA_MSG.STEP_PROGRESS: {
      // Lightweight, best-effort progress label so the popup can show
      // *what's actually happening* during a long wait instead of a
      // static "กำลังทำงาน" the whole time — a long-but-legitimate wait
      // (e.g. a large real photo taking a while to upload) is otherwise
      // visually indistinguishable from something silently stuck. Never
      // throws on a stale/racing update; last write wins.
      await setRun({ progressLabel: message.label || null });
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
