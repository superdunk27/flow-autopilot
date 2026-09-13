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

  async function attachAndSend({ step, productImageDataUrl, promptText, warnings }) {
    const fileInput = await FA_UTILS.waitFor(SEL.fileInput, {
      step,
      description: 'ช่องแนบไฟล์ (file input) ของ ChatGPT',
    });
    collectWarning(warnings, fileInput, SEL.fileInput, 'ช่องแนบไฟล์');
    const file = FA_UTILS.dataUrlToFile(productImageDataUrl, 'product.png');
    await FA_UTILS.attachFileToInput(fileInput, file);

    await FA_UTILS.waitFor(SEL.attachmentPreview, {
      step,
      description: 'ภาพตัวอย่างไฟล์แนบ (ยืนยันว่าอัปโหลดสำเร็จ)',
      timeoutMs: 30000,
    });
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
    sendBtn.click();

    await FA_UTILS.waitForGenerationComplete(SEL.stopGeneratingButton, {
      step,
      description: 'ChatGPT กำลังตอบ',
      timeoutMs: 5 * 60 * 1000,
    });
  }

  /**
   * Splits the analysis reply into the 3 sections FA_ANALYZE_TEMPLATE asks
   * for: product description / storyboard image prompt / video animation
   * prompt. Since v2 sends that exact template as a plain message (no
   * custom GPT), we know the model is asked for literal "1. Product
   * Description" / "2. Storyboard Image Prompt" / "3. Video Animation
   * Prompt" headings — matched first, with the older looser Thai/English
   * heuristics kept as secondary alternatives in case the model doesn't
   * echo the heading text exactly. Falls back to splitting the text into
   * 3 roughly-equal paragraph groups so the pipeline still has
   * *something* to show in the review step rather than crashing outright
   * — the review step (see popup) always lets the user fix a bad split by
   * hand, so this fallback is safe, never silently wrong.
   */
  function parseAnalysisResponse(text) {
    const labelPatterns = [
      { key: 'productDetails', re: /(1\.\s*product description|รายละเอียดสินค้า|product details?)[:：]?/i },
      { key: 'storyboardPrompt', re: /(2\.\s*storyboard image prompt|storyboard[^:：]*prompt|prompt.*storyboard|prompt สำหรับ.*storyboard)[:：]?/i },
      { key: 'videoPrompt', re: /(3\.\s*video animation prompt|prompt.*วิดีโอ|video prompt|prompt สำหรับ.*วิดีโอ)[:：]?/i },
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
      return { ...result, parseConfidence: 'labeled' };
    }

    // Fallback: split into paragraph blocks, group into 3.
    const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length >= 3) {
      const third = Math.ceil(paragraphs.length / 3);
      return {
        productDetails: paragraphs.slice(0, third).join('\n\n'),
        storyboardPrompt: paragraphs.slice(third, third * 2).join('\n\n'),
        videoPrompt: paragraphs.slice(third * 2).join('\n\n'),
        parseConfidence: 'fallback',
      };
    }

    return {
      productDetails: text,
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
