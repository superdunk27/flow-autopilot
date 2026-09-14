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

  /**
   * Best-effort progress label, sent to background (which stores it for
   * the popup to render) and always logged to this tab's own console.
   * Added 2026-09-15 (see README "v11") after a real report of the
   * pipeline appearing to do *nothing* for an uncomfortably long
   * stretch — not an actual silent failure (every step still eventually
   * throws or succeeds), but a long, legitimate wait (e.g. a real,
   * several-MB photo taking a while to upload) is otherwise visually
   * indistinguishable from something stuck, since neither the chat tab
   * nor the popup showed *any* incremental signal before this. Never
   * awaited/blocking — a failure to deliver a progress update must never
   * affect the actual pipeline.
   */
  function reportProgress(label) {
    console.log('[Flow Autopilot]', label);
    try {
      chrome.runtime.sendMessage({ type: FA_MSG.STEP_PROGRESS, label });
    } catch (_) {
      // extension context can be invalidated mid-run (e.g. reload) —
      // progress reporting is non-critical, never let this break the
      // actual step.
    }
  }

  function collectWarning(warnings, el, selectorList, label) {
    if (FA_UTILS.isLastResortMatch(el, selectorList)) {
      warnings.push(
        `⚠️ ${label}: จับคู่ด้วย selector ทั่วไปที่สุด (last-resort) — อาจได้ element ผิด โปรดตรวจผลลัพธ์`
      );
    }
  }

  /** Fires a hover-style event sequence on `el` — pointerenter,
   * mouseenter, mouseover — in addition to whatever click happens
   * separately. See enterCreateImageMode for why. */
  function dispatchHoverSequence(el) {
    el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  }

  /**
   * Tries to open the "+" menu and returns its confirmed-open container,
   * or null if it never appeared after trying both a click and a hover
   * sequence. Does not throw — enterCreateImageMode decides what a null
   * result means.
   */
  async function tryOpenPlusMenu(plusBtn, step) {
    plusBtn.click();
    await FA_UTILS.randomDelay(400, 800);
    try {
      return await FA_UTILS.waitFor(SEL.menuContainer, { step, description: 'เมนูที่เปิดจากปุ่ม "+"', timeoutMs: 4000 });
    } catch (_) {
      // Real DOM (confirmed live, v5 round) carries an `interestfor`
      // attribute on this button — part of the emerging HTML "Interest
      // Invokers" spec for hover-triggered popovers. A bare click may
      // simply not be the right trigger; retry with an explicit hover
      // sequence before a fresh click.
      dispatchHoverSequence(plusBtn);
      await FA_UTILS.sleep(400);
      plusBtn.click();
      await FA_UTILS.randomDelay(400, 800);
      try {
        return await FA_UTILS.waitFor(SEL.menuContainer, {
          step,
          description: 'เมนูที่เปิดจากปุ่ม "+" (ลองรอบ 2 — hover แล้วค่อยคลิก)',
          timeoutMs: 4000,
        });
      } catch (__) {
        return null;
      }
    }
  }

  /**
   * Enters ChatGPT's "Create image" mode via the composer's "+" menu.
   * Per real-account testing (2026-09-13), the image-gen step needs this
   * explicit step — just typing an image request as plain text on a
   * fresh chat isn't enough to reliably trigger image generation.
   *
   * Rewritten after a real regression (2026-09-14): the previous version
   * searched the *whole document* for text matching /create image/i
   * without first confirming a menu had actually opened. A real user saw
   * the "+" click produce no visible effect, yet the code proceeded as
   * if "Create image" had been clicked — meaning it matched and clicked
   * some element still mounted elsewhere in the DOM (portal/animation-
   * based menu libraries commonly keep menu items in the DOM even while
   * closed) rather than the real, visible menu item. Root-caused, not
   * just retried: now (1) confirms a real `[role="menu"]` container
   * actually appears before searching it at all — trying both a click
   * and a hover sequence, since the button's real DOM carries an
   * `interestfor` attribute suggesting hover may be the actual trigger
   * — and (2) scopes the "Create image" text search to *inside* that
   * confirmed-open container, which structurally rules out matching
   * anything elsewhere on the page.
   */
  async function enterCreateImageMode(step, warnings) {
    reportProgress(`[${step}] กำลังกดปุ่ม "+" เพื่อเข้าโหมด Create image…`);
    const plusBtn = await FA_UTILS.waitFor(SEL.plusMenuButton, {
      step,
      description: 'ปุ่ม "+" เปิดเมนู attachment/tools',
    });
    collectWarning(warnings, plusBtn, SEL.plusMenuButton, 'ปุ่ม "+"');

    const menuContainer = await tryOpenPlusMenu(plusBtn, step);
    if (!menuContainer) {
      throw new FASelectorError({
        step,
        description: 'เมนู attachment/tools ไม่เปิดเลยหลังลองทั้งคลิกและ hover ปุ่ม "+"',
        selectorsTried: SEL.menuContainer,
        siteHint:
          'ปุ่ม "+" มี attribute interestfor ซึ่งอาจแปลว่าเมนูเปิดด้วยกลไกอื่นที่ยังไม่ครอบคลุม — ' +
          'เปิด DevTools บนหน้าจริง ลองคลิก/hover ปุ่มเองดูว่าเมนูเปิดอย่างไร แล้วปรับ tryOpenPlusMenu() ให้ตรง',
      });
    }

    reportProgress(`[${step}] เมนู "+" เปิดแล้ว กำลังหารายการ "Create image"…`);

    // Poll within the confirmed-open menu only — never the whole
    // document — since the menu's content may render a moment after the
    // container itself appears.
    const start = Date.now();
    let menuItem = null;
    while (!menuItem && Date.now() - start < 8000) {
      menuItem = FA_UTILS.findByVisibleText(SEL.menuItemTags, [/create image/i], { root: menuContainer });
      if (!menuItem) await FA_UTILS.sleep(250);
    }
    if (!menuItem) {
      throw new FASelectorError({
        step,
        description: 'รายการ "Create image" ภายในเมนูที่เปิดจากปุ่ม "+"',
        selectorsTried: [`${SEL.menuItemTags} matching text /create image/i, scoped inside the confirmed-open menu`],
        siteHint: 'เมนูเปิดจริงแล้ว แต่หาข้อความ "Create image" ไม่เจอข้างใน — ชื่อ/ตำแหน่งในเมนูอาจเปลี่ยนไป เปิด DevTools ดู DOM จริงของเมนู',
      });
    }
    menuItem.click();
    reportProgress(`[${step}] กดเมนู "Create image" แล้ว`);
    await FA_UTILS.randomDelay(500, 1000);
  }

  /**
   * ChatGPT is a heavy SPA — the content script fires at document_idle,
   * which only guarantees the initial page load event happened, not
   * that React has finished hydrating (attaching real event handlers to
   * elements that already exist in the DOM). A real regression
   * (2026-09-14, see README "v8") hit exactly this: attachmentPreview
   * failed from the very first check, before any typing/sending —
   * Toey's own real-account testing observed no attachment chip ever
   * appearing, consistent with the file-attach step running against a
   * not-yet-interactive page rather than the selector itself being
   * wrong. Waits for composer + the "+" button to both exist, then
   * requires them to still be present after a settle delay (catches an
   * early skeleton render getting replaced by the real one) before
   * anything else touches the page.
   */
  async function waitForPageReady(step) {
    reportProgress(`[${step}] รอหน้าเว็บ chatgpt.com โหลดพร้อมใช้งาน…`);
    await FA_UTILS.waitFor(SEL.composer, {
      step,
      description: 'ช่องพิมพ์ข้อความ (composer) — รอหน้าเว็บโหลดพร้อมใช้งานก่อนเริ่ม',
      timeoutMs: 15000,
    });
    await FA_UTILS.waitFor(SEL.plusMenuButton, {
      step,
      description: 'ปุ่ม "+" — รอหน้าเว็บโหลดพร้อมใช้งานก่อนเริ่ม',
      timeoutMs: 15000,
    });
    await FA_UTILS.sleep(1500);
    const stillPresent = (list) => list.some((sel) => {
      try {
        return !!document.querySelector(sel);
      } catch (_) {
        return false;
      }
    });
    if (!stillPresent(SEL.composer) || !stillPresent(SEL.plusMenuButton)) {
      // Page re-rendered during the settle window (hydration replaced an
      // early skeleton) — wait once more for things to exist again.
      reportProgress(`[${step}] หน้าเว็บ re-render ระหว่างรอ — รออีกครั้ง…`);
      await FA_UTILS.waitFor(SEL.composer, {
        step,
        description: 'ช่องพิมพ์ข้อความ (composer) — หน้าเว็บ re-render ระหว่างรอ',
        timeoutMs: 15000,
      });
      await FA_UTILS.sleep(1000);
    }
    reportProgress(`[${step}] หน้าเว็บพร้อมใช้งานแล้ว`);
  }

  /**
   * Attaches the product image and verifies it actually took, retrying
   * up to 2 more times with a fresh file-input lookup and a longer
   * settle delay if an attempt's attachmentPreview check fails.
   *
   * Timeout sizing note (2026-09-15): the original 15s/2-attempt budget
   * was tuned against a 3KB test image used for live verification — a
   * real product photo from a phone camera can easily be 1-10MB+, and
   * ChatGPT's real upload + thumbnail-render pipeline for a file that
   * size plausibly takes meaningfully longer than for a tiny test image.
   * A recurrence of this exact error was traced (full call-graph check,
   * not just a diff read) to be mechanically unrelated to the
   * checkVisibility()/enterCreateImageMode changes in a397024 — neither
   * findByVisibleText nor isReallyVisible is ever called from this
   * function or waitForPageReady, and enterCreateImageMode only runs for
   * the image-gen step, never analyze. So this widened budget is a
   * real-world-sizing correction, not a fix for a specific proven defect
   * in this function — flagged as such rather than claimed as certain.
   */
  async function attachProductImage(step, productImageDataUrl, warnings) {
    const MAX_ATTEMPTS = 3;
    const ATTEMPT_TIMEOUT_MS = 25000;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        reportProgress(`[${step}] กำลังหาช่องแนบไฟล์ (รอบ ${attempt}/${MAX_ATTEMPTS})…`);
        const fileInput = await FA_UTILS.waitFor(SEL.fileInput, {
          step,
          description: 'ช่องแนบไฟล์ (file input) ของ ChatGPT',
        });
        collectWarning(warnings, fileInput, SEL.fileInput, 'ช่องแนบไฟล์');
        const file = FA_UTILS.dataUrlToFile(productImageDataUrl, 'product.png');
        await FA_UTILS.attachFileToInput(fileInput, file);
        reportProgress(`[${step}] แนบไฟล์แล้ว กำลังรอ ChatGPT ยืนยันว่าอัปโหลดสำเร็จ (รอบ ${attempt}/${MAX_ATTEMPTS}, timeout ${ATTEMPT_TIMEOUT_MS / 1000}s)…`);

        // REQUIRED gate, not optional — a real user hit exactly the
        // failure this was previously soft about: the send button
        // became enabled from having *text* alone, with no file
        // actually attached, so the message went out with no image and
        // ChatGPT replied asking for the photo (2026-09-14 bug report).
        // button[aria-label^="Remove file"] was independently CONFIRMED
        // live the same day (see README "v5") as the real "an
        // attachment is present" indicator, so it's no longer an
        // unverified guess — waiting on the send button becoming
        // enabled is a *necessary* signal (composer is ready) but not a
        // *sufficient* one (an attachment is actually there); this
        // checks the sufficient condition explicitly instead of
        // assuming it.
        const attachmentChip = await FA_UTILS.waitFor(SEL.attachmentPreview, {
          step,
          description: 'ภาพตัวอย่างไฟล์แนบ (ยืนยันว่าอัปโหลดสำเร็จจริงก่อนพิมพ์/ส่ง)',
          timeoutMs: ATTEMPT_TIMEOUT_MS,
        });
        collectWarning(warnings, attachmentChip, SEL.attachmentPreview, 'ภาพตัวอย่างไฟล์แนบ');
        reportProgress(`[${step}] แนบไฟล์สำเร็จ ยืนยันแล้ว`);
        return;
      } catch (err) {
        reportProgress(`[${step}] แนบไฟล์รอบ ${attempt}/${MAX_ATTEMPTS} ไม่สำเร็จ: ${(err.message || '').slice(0, 80)}`);
        if (attempt < MAX_ATTEMPTS) {
          warnings.push(
            `⚠️ แนบไฟล์รอบที่ ${attempt} ไม่สำเร็จ (${(err.message || '').slice(0, 100)}) — ลองใหม่อีกครั้งหลังรอหน้าเว็บ/อัปโหลดเพิ่ม`
          );
          await FA_UTILS.sleep(2500 * attempt);
          continue;
        }
        throw new FASelectorError({
          step,
          description: `ภาพตัวอย่างไฟล์แนบ (หลังลอง ${MAX_ATTEMPTS} รอบ)`,
          selectorsTried: SEL.attachmentPreview,
          siteHint:
            'อาจไม่ใช่แค่ selector ผิด — เป็นไปได้ว่าหน้าเว็บยังโหลด/hydrate ไม่เสร็จ หรือไฟล์รูปมีขนาดใหญ่และ ChatGPT ' +
            'ยังอัปโหลด/สร้าง thumbnail ไม่เสร็จตอนเช็ค ลองรันใหม่อีกครั้ง หรือลองรูปขนาดเล็กลง',
        });
      }
    }
  }

  async function attachAndSend({ step, mode, productImageDataUrl, promptText, warnings }) {
    await waitForPageReady(step);

    if (mode === FA_STEPS.IMAGEGEN) {
      await enterCreateImageMode(step, warnings);
    }

    await attachProductImage(step, productImageDataUrl, warnings);
    await FA_UTILS.randomDelay(500, 1100);

    reportProgress(`[${step}] กำลังพิมพ์ข้อความ…`);
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
      description: 'ปุ่มส่ง (รอจนกดได้ — แต่ปุ่ม enabled ไม่ได้แปลว่ามีไฟล์แนบอยู่จริง เช็คแยกด้านล่างอีกที)',
      timeoutMs: 30000,
    });

    // Final re-check right before sending: the attachment chip found
    // above could in principle have been removed between then and now
    // (e.g. a stray click, a re-render). This is the literal last chance
    // to catch "about to send with no image attached" before it happens
    // — throws instead of silently sending text-only, which is exactly
    // the failure mode being fixed here.
    const stillAttached = SEL.attachmentPreview.some((sel) => {
      try {
        return !!document.querySelector(sel);
      } catch (_) {
        return false;
      }
    });
    if (!stillAttached) {
      throw new FASelectorError({
        step,
        description: 'ยืนยันไฟล์แนบก่อนกดส่ง (ไฟล์แนบหายไปก่อนกดส่งจริง — ไม่ส่งข้อความเปล่าๆ)',
        selectorsTried: SEL.attachmentPreview,
      });
    }

    sendBtn.click();
    reportProgress(`[${step}] ส่งข้อความแล้ว กำลังรอ ChatGPT ตอบ…`);

    await FA_UTILS.waitForGenerationComplete(SEL.stopGeneratingButton, {
      step,
      description: 'ChatGPT กำลังตอบ',
      timeoutMs: 5 * 60 * 1000,
    });
    reportProgress(`[${step}] ChatGPT ตอบเสร็จแล้ว กำลังตรวจสอบผลลัพธ์…`);

    // ChatGPT free tier rate-limits chats with files/images attached —
    // confirmed real live 2026-09-14 (see README "v5"). Checked here,
    // right after generation "completes", because this is also the one
    // place that catches the worst case: if the limit blocks generation
    // from ever starting, the "stop generating" button never appears at
    // all, so waitForGenerationComplete's grace-window logic would
    // otherwise resolve as if generation finished normally — a real
    // silent-wrong-success risk, not just a cosmetic one. Any positive
    // match is treated as a hard error unconditionally, even if the
    // response looks complete, since there's no reliable way to tell
    // whether a banner appearing mid-generation means the response is
    // trustworthy or truncated.
    const rateLimitHit = FA_UTILS.detectChatGptRateLimit();
    if (rateLimitHit) {
      throw new FARateLimitError({
        step,
        resetsAt: typeof rateLimitHit === 'string' ? rateLimitHit : null,
      });
    }
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

  /**
   * Defense-in-depth check (see FAMissingImageError in dom-utils.js): the
   * pre-send attachment-chip verification in attachAndSend should make
   * "sent with no image" impossible now, but if ChatGPT's reply reads
   * like it never received the photo anyway, treat that as an explicit
   * error instead of silently parsing/using whatever text came back.
   * Tolerant of no assistant message existing yet — that case is a
   * different, more specific error raised elsewhere (extractLastAssistantText
   * for analyze, the generatedImage waitFor timeout for imagegen).
   */
  function checkForMissingImageReply(step) {
    const nodes = document.querySelectorAll(
      Array.isArray(SEL.assistantMessages) ? SEL.assistantMessages.join(', ') : SEL.assistantMessages
    );
    if (!nodes.length) return;
    const text = nodes[nodes.length - 1].innerText;
    if (FA_UTILS.detectChatGptMissingImageReply(text)) {
      throw new FAMissingImageError({ step, replyText: text });
    }
  }

  async function runAnalyze(payload) {
    const warnings = [];
    await attachAndSend({ step: FA_STEPS.ANALYZE, ...payload, warnings });
    checkForMissingImageReply(FA_STEPS.ANALYZE);
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
    checkForMissingImageReply(FA_STEPS.IMAGEGEN);
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
