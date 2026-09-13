// Flow Autopilot — content script for chatgpt.com.
// Handles two modes, driven by messages from the background service
// worker, both on a plain chatgpt.com new chat (no custom GPT — see
// FA_ANALYZE_TEMPLATE in lib/messages.js): "analyze" (product-photo
// analysis, instructions sent as a regular message) and "imagegen"
// (default ChatGPT image generation from the storyboard prompt).
//
// Depends on globals from lib/messages.js, lib/selectors.js and
// lib/dom-utils.js, all loaded before this file per manifest.json.

(function () {
  const SEL = FA_SELECTORS.chatgpt;

  function collectWarning(warnings, el, selectorList, label) {
    if (FA_UTILS.isLastResortMatch(el, selectorList)) {
      warnings.push(
        `⚠️ ${label}: จับคู่ด้วย selector ทั่วไปที่สุด (last-resort) — อาจได้ element ผิด โปรดตรวจผลลัพธ์`
      );
    }
  }

  /**
   * Enters ChatGPT's "Create image" mode via the composer's "+" menu.
   * Per real-account testing (2026-09-13), the image-gen step needs this
   * explicit step — just typing an image request as plain text on a
   * fresh chat isn't enough to reliably trigger image generation.
   * UNVERIFIED against live DOM (no authenticated session was reachable
   * this round — see README "Known limitations"): plusMenuButton is a
   * best-effort aria-label guess, but the menu item itself is found by
   * its actual visible text ("Create image") via findByVisibleText,
   * which is far more resilient to markup changes than guessing a
   * data-testid/class for it would be.
   */
  async function enterCreateImageMode(step, warnings) {
    const plusBtn = await FA_UTILS.waitFor(SEL.plusMenuButton, {
      step,
      description: 'ปุ่ม "+" เปิดเมนู attachment/tools',
    });
    collectWarning(warnings, plusBtn, SEL.plusMenuButton, 'ปุ่ม "+"');
    plusBtn.click();
    await FA_UTILS.randomDelay(400, 800);

    // Poll for the "Create image" menu item by visible text rather than
    // a single waitFor call, since the menu itself may take a moment to
    // render after the click.
    const start = Date.now();
    let menuItem = null;
    while (!menuItem && Date.now() - start < 8000) {
      menuItem = FA_UTILS.findByVisibleText(SEL.menuItemTags, [/create image/i]);
      if (!menuItem) await FA_UTILS.sleep(250);
    }
    if (!menuItem) {
      throw new FASelectorError({
        step,
        description: 'เมนู "Create image" (หลังกดปุ่ม +)',
        selectorsTried: [`${SEL.menuItemTags} matching text /create image/i`],
      });
    }
    menuItem.click();
    await FA_UTILS.randomDelay(500, 1000);
  }

  async function attachAndSend({ step, mode, productImageDataUrl, promptText, warnings }) {
    if (mode === FA_STEPS.IMAGEGEN) {
      await enterCreateImageMode(step, warnings);
    }

    const fileInput = await FA_UTILS.waitFor(SEL.fileInput, {
      step,
      description: 'ช่องแนบไฟล์ (file input) ของ ChatGPT',
    });
    collectWarning(warnings, fileInput, SEL.fileInput, 'ช่องแนบไฟล์');
    const file = FA_UTILS.dataUrlToFile(productImageDataUrl, 'product.png');
    await FA_UTILS.attachFileToInput(fileInput, file);

    // The exact "attachment finished uploading" indicator is unverified
    // against live DOM (see selectors.js comment) — a real user hit a
    // clean "selector not found" here even though the upload had
    // genuinely succeeded. Treat it as an optional confidence signal
    // only (never throws) and gate on the send button actually becoming
    // enabled instead — a functional readiness signal the site has to
    // get right for its own UI to work, not a guess at its markup.
    await FA_UTILS.softWaitFor(SEL.attachmentPreview, { timeoutMs: 8000 });
    await FA_UTILS.randomDelay(500, 1100);

    const composer = await FA_UTILS.waitFor(SEL.composer, {
      step,
      description: 'ช่องพิมพ์ข้อความ (composer)',
    });
    FA_UTILS.typeIntoComposer(composer, promptText);
    await FA_UTILS.randomDelay(400, 900);

    const sendBtn = await FA_UTILS.waitFor(SEL.sendButton, {
      step,
      description: 'ปุ่มส่งข้อความ (send)',
    });
    await FA_UTILS.waitForEnabled(sendBtn, {
      step,
      description: 'ปุ่มส่ง (รอจนกดได้ — ยืนยันว่าอัปโหลด/พิมพ์เสร็จจริง)',
      timeoutMs: 30000,
    });
    sendBtn.click();

    await FA_UTILS.waitForGenerationComplete(SEL.stopGeneratingButton, {
      step,
      description: 'ChatGPT กำลังตอบ',
      timeoutMs: 5 * 60 * 1000,
    });
  }

  /**
   * Splits the analysis reply into the 3 sections FA_ANALYZE_TEMPLATE (v3)
   * asks for: storyboard plan (5 shots) / storyboard image prompt / video
   * prompt. Since the template is sent verbatim as a plain message (no
   * custom GPT), we know the model is asked for literal "1. Storyboard
   * Plan (5 Shots)" / "2. Storyboard Image Prompt" / "3. Video Prompt (10
   * seconds, 5 scenes)" headings — matched first, with looser fallback
   * alternatives (heading text without the leading number, in case
   * numbering/formatting drifts) as secondary. Falls back to splitting
   * the text into 3 roughly-equal paragraph groups so the pipeline still
   * has *something* to show in the review step rather than crashing
   * outright — the review step (see popup) always lets the user fix a
   * bad split by hand, so this fallback is safe, never silently wrong.
   *
   * Guard against a real bug QA found in PR #2's version of this
   * function: a heading pattern can technically "match" while capturing
   * an empty or near-empty section (e.g. two headings landing back to
   * back with nothing meaningful between them) — that's a labeled match
   * that isn't actually usable. If autoReview happened to be off, an
   * empty videoPrompt would go straight into Google Flow's prompt field
   * unnoticed. So a labeled match with any section under MIN_SECTION_LEN
   * characters is treated as not good enough and falls through to the
   * paragraph fallback instead of being returned as-is.
   */
  const MIN_SECTION_LEN = 10;

  function parseAnalysisResponse(text) {
    // Each alternative consumes the rest of its heading line ([^\n]*) so
    // a trailing parenthetical like "(5 Shots)" or "(10 seconds, 5
    // scenes)" is swallowed by the label match instead of leaking into
    // the start of the captured section body.
    const labelPatterns = [
      { key: 'storyboardPlan', re: /(1\.\s*storyboard plan[^\n]*|storyboard plan[^\n]*)/i },
      { key: 'storyboardPrompt', re: /(2\.\s*storyboard image prompt[^\n]*|storyboard image prompt[^\n]*|storyboard[^\n：]*prompt[^\n]*|prompt.*storyboard[^\n]*)/i },
      { key: 'videoPrompt', re: /(3\.\s*video prompt[^\n]*|video prompt[^\n]*)/i },
    ];

    const matches = labelPatterns
      .map(({ key, re }) => {
        const m = re.exec(text);
        return m ? { key, index: m.index, matchEnd: m.index + m[0].length } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.index - b.index);

    if (matches.length === 3) {
      const result = {};
      matches.forEach((m, i) => {
        const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
        result[m.key] = text.slice(m.matchEnd, end).trim();
      });
      const allSectionsUsable = Object.values(result).every((v) => v.length >= MIN_SECTION_LEN);
      if (allSectionsUsable) {
        return { ...result, parseConfidence: 'labeled' };
      }
      // Headings matched but at least one section came out empty/near-
      // empty — don't ship that silently, fall through to the paragraph
      // fallback below instead.
    }

    // Fallback: split into paragraph blocks, group into 3.
    const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length >= 3) {
      const third = Math.ceil(paragraphs.length / 3);
      return {
        storyboardPlan: paragraphs.slice(0, third).join('\n\n'),
        storyboardPrompt: paragraphs.slice(third, third * 2).join('\n\n'),
        videoPrompt: paragraphs.slice(third * 2).join('\n\n'),
        parseConfidence: 'fallback',
      };
    }

    return {
      storyboardPlan: text,
      storyboardPrompt: text,
      videoPrompt: text,
      parseConfidence: 'failed',
    };
  }

  function extractLastAssistantText() {
    const nodes = document.querySelectorAll(
      Array.isArray(SEL.assistantMessages) ? SEL.assistantMessages.join(', ') : SEL.assistantMessages
    );
    if (!nodes.length) {
      throw new FASelectorError({
        step: 'analyze',
        description: 'ข้อความคำตอบของ assistant',
        selectorsTried: SEL.assistantMessages,
      });
    }
    return nodes[nodes.length - 1].innerText.trim();
  }

  async function runAnalyze(payload) {
    const warnings = [];
    await attachAndSend({ step: FA_STEPS.ANALYZE, ...payload, warnings });
    const raw = extractLastAssistantText();
    const parsed = parseAnalysisResponse(raw);
    chrome.runtime.sendMessage({
      type: FA_MSG.STEP_DONE,
      step: FA_STEPS.ANALYZE,
      ok: true,
      payload: { raw, ...parsed, warnings },
    });
  }

  async function runImageGen(payload) {
    const warnings = [];
    await attachAndSend({ step: FA_STEPS.IMAGEGEN, ...payload, warnings });
    const imgEl = await FA_UTILS.waitFor(SEL.generatedImage, {
      step: FA_STEPS.IMAGEGEN,
      description: 'ภาพ storyboard ที่ ChatGPT สร้าง',
      timeoutMs: 60000,
    });
    const imageDataUrl = await FA_UTILS.elementImageToDataUrl(imgEl);
    chrome.runtime.sendMessage({
      type: FA_MSG.STEP_DONE,
      step: FA_STEPS.IMAGEGEN,
      ok: true,
      payload: { imageDataUrl, warnings },
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== FA_MSG.RUN_CHATGPT_STEP) return undefined;
    const { mode } = message.payload;
    const run = mode === FA_STEPS.ANALYZE ? runAnalyze(message.payload) : runImageGen(message.payload);
    run
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error('[Flow Autopilot]', err);
        chrome.runtime.sendMessage({
          type: FA_MSG.STEP_DONE,
          step: mode,
          ok: false,
          error: FA_UTILS.serializeError(err),
        });
        sendResponse({ ok: false, error: String(err.message || err) });
      });
    return true; // async
  });
})();
