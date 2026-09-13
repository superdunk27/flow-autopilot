// Flow Autopilot — shared DOM automation helpers for content scripts.
// Loaded as a plain classic script (content scripts run in an isolated
// world, so `window` here is shared only between this extension's own
// content scripts on the page, never the page's own globals).

(function (root) {
  class FASelectorError extends Error {
    constructor({ step, description, selectorsTried, siteHint }) {
      super(
        `[Flow Autopilot] หา element ไม่เจอ (${description}) ในขั้น "${step}". ` +
          `ลองแล้ว: ${selectorsTried.join(', ')}. ` +
          `${siteHint || 'เว็บอาจเปลี่ยน DOM — เปิด src/lib/selectors.js แล้วอัปเดต selector ให้ตรงของจริง'}`
      );
      this.name = 'FASelectorError';
      this.step = step;
      this.description = description;
      this.selectorsTried = selectorsTried;
    }
  }

  class FATimeoutError extends Error {
    constructor({ step, description, timeoutMs }) {
      super(
        `[Flow Autopilot] รอ "${description}" นานเกิน ${Math.round(timeoutMs / 1000)} วินาทีในขั้น "${step}" — ` +
          `ไม่เสร็จ/ไม่มี indicator ที่คาดไว้ ระบบไม่ silent fail จึงหยุดรอและแจ้ง error นี้แทน`
      );
      this.name = 'FATimeoutError';
      this.step = step;
    }
  }

  /**
   * ChatGPT's real, confirmed rate-limit notice for chats containing
   * files/images (hit live 2026-09-14 while testing the analyze step —
   * see README "v5"): "Chat paused until usage resets at <time> — You've
   * reached the limit for chats that include files or images. Start a
   * new text-only chat or upgrade to continue now." Thrown instead of
   * trusting whatever content did or didn't get generated — a rate-limit
   * hit is treated as an error unconditionally (never silently used, even
   * if a response happens to look complete), since there's no reliable
   * way to tell whether the banner appearing mid-generation means the
   * response is trustworthy or truncated.
   */
  class FARateLimitError extends Error {
    constructor({ step, resetsAt }) {
      super(
        `[Flow Autopilot] ChatGPT free tier มี rate limit สำหรับแชทที่มีไฟล์/รูปแนบ ในขั้น "${step}" — ` +
          `เจอข้อความ "You've reached the limit for chats that include files or images"` +
          `${resetsAt ? ` (จะใช้ได้อีกครั้งตอน ${resetsAt})` : ''}. ` +
          `${resetsAt ? 'รอจนถึงเวลาที่ระบุ' : 'รอสักครู่'} หรือ upgrade บัญชี แล้วลองใหม่ — ไม่เชื่อถือ response ที่ได้ตอนนี้ เผื่อไว้ก่อนว่าอาจไม่ครบ`
      );
      this.name = 'FARateLimitError';
      this.step = step;
      this.resetsAt = resetsAt || null;
    }
  }

  /**
   * Scans the page's visible text for ChatGPT's rate-limit banner (see
   * FARateLimitError above). Returns the extracted "resets at ..." time
   * string if found (or `true` if the phrase matched but the time
   * couldn't be parsed out), otherwise `false`. Does not throw — callers
   * decide what to do with a positive match.
   */
  function detectChatGptRateLimit() {
    const text = document.body ? document.body.innerText : '';
    if (!/reached the limit for chats that include files or images/i.test(text)) return false;
    const m = /resets at\s*([\d:]+\s*[AaPp]\.?[Mm]\.?)/.exec(text);
    return m ? m[1] : true;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const randomDelay = (minMs, maxMs) =>
    sleep(Math.floor(minMs + Math.random() * (maxMs - minMs)));

  /**
   * Poll `document.querySelector` across a list of candidate selectors
   * until one matches (or `timeoutMs` elapses). Never silently returns
   * null — throws a descriptive FASelectorError instead.
   *
   * The matched element is tagged with `__faMatchedSelector` and
   * `__faMatchedIndex` so callers can tell whether a *specific* candidate
   * matched (index 0/1) vs. the broadest last-resort one — matching on a
   * generic fallback isn't wrong by itself, but a caller can use this to
   * surface a visible warning instead of the risk being silent (see
   * `isLastResortMatch` below).
   */
  function waitFor(selectorList, { step, description, timeoutMs = 20000, pollMs = 250, root: searchRoot = document }) {
    const list = Array.isArray(selectorList) ? selectorList : [selectorList];
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        for (let i = 0; i < list.length; i++) {
          const sel = list[i];
          try {
            const el = searchRoot.querySelector(sel);
            if (el) {
              try {
                el.__faMatchedSelector = sel;
                el.__faMatchedIndex = i;
              } catch (_) {
                // some elements (rare) may not accept expando props; ignore
              }
              return resolve(el);
            }
          } catch (_) {
            // invalid selector on this page, ignore and keep trying others
          }
        }
        if (Date.now() - start > timeoutMs) {
          reject(new FASelectorError({ step, description, selectorsTried: list }));
          return;
        }
        setTimeout(tick, pollMs);
      };
      tick();
    });
  }

  /** True when `el` (from `waitFor`) matched only the broadest, last-resort
   * candidate in its selector list — i.e. the specific candidates all
   * missed and we fell back to a generic match that *could* be the wrong
   * element. Used to turn "matched something, might be wrong" into a
   * visible warning instead of a silent risk. */
  function isLastResortMatch(el, selectorList) {
    const list = Array.isArray(selectorList) ? selectorList : [selectorList];
    return list.length > 1 && el.__faMatchedIndex === list.length - 1;
  }

  /**
   * Finds the first *visible* element matching `tagSelector` whose
   * innerText matches one of `textPatterns` (RegExps). More specific than
   * a bare structural guess like `button[type="submit"]` — matching on
   * what a human would actually read on the button, not just its tag/type.
   * Returns null (does not throw) if nothing matches; callers decide
   * whether that's fatal.
   */
  function findByVisibleText(tagSelector, textPatterns, { root: searchRoot = document } = {}) {
    const patterns = Array.isArray(textPatterns) ? textPatterns : [textPatterns];
    const candidates = Array.from(searchRoot.querySelectorAll(tagSelector));
    for (const el of candidates) {
      const text = (el.innerText || el.textContent || '').trim();
      if (!text) continue;
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      if (!visible) continue;
      if (patterns.some((re) => re.test(text))) return el;
    }
    return null;
  }

  /** True if `el` looks enabled/clickable — neither the native `disabled`
   * property nor `aria-disabled="true"` is set. */
  function isEnabled(el) {
    return !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  }

  /**
   * Waits until `el` becomes enabled (see isEnabled). Used as a
   * *functional* readiness signal — e.g. "has this site's composer
   * finished processing an upload" — instead of guessing at whichever
   * decorative thumbnail/preview markup the site happens to render for
   * that state, which is far more likely to drift across DOM changes
   * than the button's own disabled state (the site has to keep that
   * correct for its own UI to work at all). Throws FATimeoutError if it
   * never becomes enabled — never silently proceeds with a disabled
   * button.
   */
  async function waitForEnabled(el, { step, description, timeoutMs = 30000, pollMs = 250 } = {}) {
    const start = Date.now();
    while (!isEnabled(el)) {
      if (Date.now() - start > timeoutMs) {
        throw new FATimeoutError({ step, description, timeoutMs });
      }
      await sleep(pollMs);
    }
  }

  /**
   * Best-effort variant of waitFor: same polling behavior, but resolves
   * to `null` instead of throwing if nothing matches within timeoutMs.
   * Use for signals that are a nice-to-have confidence boost but should
   * never block or fail the pipeline on their own (e.g. an optional
   * upload-thumbnail check layered on top of a required functional
   * check like waitForEnabled).
   */
  async function softWaitFor(selectorList, { timeoutMs = 5000, pollMs = 250, root: searchRoot = document } = {}) {
    try {
      return await waitFor(selectorList, { step: 'soft', description: 'soft', timeoutMs, pollMs, root: searchRoot });
    } catch (_) {
      return null;
    }
  }

  /**
   * Waits until an element that WAS present disappears (or never appears
   * at all within a short grace window), used for "stop generating"
   * buttons etc. Resolves either way; does not throw on absence.
   */
  async function waitForDisappearance(selectorList, { timeoutMs = 15000, pollMs = 300, graceMs = 3000, root: searchRoot = document } = {}) {
    const list = Array.isArray(selectorList) ? selectorList : [selectorList];
    const start = Date.now();
    // Grace window: give the indicator a moment to appear at all.
    while (Date.now() - start < graceMs) {
      if (list.some((sel) => { try { return !!searchRoot.querySelector(sel); } catch { return false; } })) break;
      await sleep(pollMs);
    }
    const disappearStart = Date.now();
    while (Date.now() - disappearStart < timeoutMs) {
      const present = list.some((sel) => { try { return !!searchRoot.querySelector(sel); } catch { return false; } });
      if (!present) return true;
      await sleep(pollMs);
    }
    return false;
  }

  /**
   * Waits for a generation cycle to finish: a "stop generating" style
   * indicator must appear-then-disappear, OR simply disappear if it was
   * already gone by the time we check (fast responses). Throws
   * FATimeoutError if it never settles — this is the anti-silent-fail
   * guard for "is the AI done responding yet".
   */
  async function waitForGenerationComplete(indicatorSelectors, { step, description = 'AI กำลังสร้างคำตอบ', timeoutMs = 5 * 60 * 1000 } = {}) {
    const ok = await waitForDisappearance(indicatorSelectors, { timeoutMs, graceMs: 4000 });
    if (!ok) {
      throw new FATimeoutError({ step, description, timeoutMs });
    }
    // Small settle delay — some UIs finish the network stream slightly
    // before the DOM/text finishes rendering.
    await sleep(600);
  }

  function dataUrlToFile(dataUrl, filename) {
    const [meta, base64] = dataUrl.split(',');
    const mimeMatch = /data:(.*?);base64/.exec(meta);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /** Fetches an <img> element's current src (incl. blob:/CDN URLs on the
   * same origin, which carries the page's cookies) and returns a data URL
   * so it can be message-passed to the background/other tabs. */
  async function elementImageToDataUrl(imgEl) {
    const src = imgEl.currentSrc || imgEl.src;
    const resp = await fetch(src, { credentials: 'include' });
    if (!resp.ok) throw new Error(`[Flow Autopilot] ดึงรูปที่สร้างไม่สำเร็จ (HTTP ${resp.status}) จาก ${src}`);
    const blob = await resp.blob();
    return blobToDataUrl(blob);
  }

  /**
   * Attaches a File to a real <input type="file"> via DataTransfer, then
   * dispatches the events frameworks listen for.
   */
  async function attachFileToInput(inputEl, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    inputEl.files = dt.files;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Sets a value on a React-controlled <textarea>/<input> in a way React's
   * change detection actually notices (plain `.value = x` is ignored by
   * React's synthetic event system because it patches the native setter).
   */
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Types text into either a contenteditable rich-text composer (ChatGPT's
   * ProseMirror box) or a plain textarea/input, in a way the underlying
   * framework picks up as real user input.
   */
  function typeIntoComposer(el, text) {
    el.focus();
    if (el.isContentEditable) {
      // Clear existing content first.
      document.execCommand('selectAll', false, undefined);
      document.execCommand('delete', false, undefined);
      const inserted = document.execCommand('insertText', false, text);
      if (!inserted) {
        // Fallback for browsers/pages that block execCommand: set
        // textContent directly and fire the input event the editor
        // framework listens for.
        el.textContent = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
    } else {
      setNativeValue(el, text);
    }
  }

  function serializeError(err) {
    if (!err) return { message: 'unknown error' };
    return {
      name: err.name,
      message: err.message,
      step: err.step,
      selectorsTried: err.selectorsTried,
    };
  }

  root.FA_UTILS = {
    sleep,
    randomDelay,
    waitFor,
    isLastResortMatch,
    findByVisibleText,
    isEnabled,
    waitForEnabled,
    softWaitFor,
    waitForDisappearance,
    waitForGenerationComplete,
    dataUrlToFile,
    blobToDataUrl,
    elementImageToDataUrl,
    attachFileToInput,
    setNativeValue,
    typeIntoComposer,
    serializeError,
    detectChatGptRateLimit,
  };
  root.FASelectorError = FASelectorError;
  root.FATimeoutError = FATimeoutError;
  root.FARateLimitError = FARateLimitError;
})(typeof window !== 'undefined' ? window : globalThis);
