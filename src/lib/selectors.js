// Flow Autopilot — DOM selector configuration
//
// ChatGPT and Google Flow ship frequent, unannounced DOM/markup changes.
// This file is the SINGLE place to update when a step starts throwing
// "selector not found" errors. Each entry is a *list* of candidate CSS
// selectors tried in order (first match wins) so one small tweak on the
// site's end doesn't have to break automation immediately — but keep the
// MOST SPECIFIC candidate first and the broadest structural one (if any)
// last: `content/content-*.js` flags a match against the last-resort
// candidate as a visible warning (see `FA_UTILS.isLastResortMatch`)
// instead of failing silently, precisely because a broad selector like
// `input[type="file"]` can match the *wrong* file input on a page with
// more than one and nothing about that match looks like a failure.
//
// NOTE: these selectors were written from public DOM inspection at
// scaffold time (2026-09-13) and have NOT been exercised against a live,
// logged-in ChatGPT Plus + custom GPT + Google Flow session (this
// environment has no such session). Treat them as a well-informed first
// draft, not a verified contract. See README.md "Known limitations".
//
// Domain history: Google Flow moved from labs.google/fx/tools/flow to
// flow.google.com (confirmed 2026-09-13 — labs.google/fx/tools/flow now
// 308-redirects there, including every /shared/tool/<id> sub-path).
// manifest.json's host_permissions/content_scripts.matches target
// flow.google.com accordingly.

(function (root) {
  root.FA_SELECTORS = {
    chatgpt: {
      // The hidden <input type="file"> ChatGPT's composer uses for
      // attachments. data-testid first (specific); bare type="file" is the
      // last-resort catch-all in case the testid changes.
      fileInput: [
        'input[data-testid="file-upload-input"]',
        'input[type="file"]',
      ],
      // Thumbnail/chip that appears once an attachment finishes uploading.
      attachmentPreview: [
        '[data-testid="attachment-thumbnail"]',
        '[class*="attachment"] img',
        'button[aria-label*="attach" i]',
      ],
      // The prompt composer (ChatGPT uses a contenteditable ProseMirror div).
      composer: [
        '#prompt-textarea',
        'div[contenteditable="true"][data-id]',
        'textarea[data-testid="prompt-textarea"]',
        'div[contenteditable="true"]',
      ],
      sendButton: [
        'button[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label*="Send" i]',
      ],
      // Shown while ChatGPT is still generating a response.
      stopGeneratingButton: [
        'button[data-testid="stop-button"]',
        'button[aria-label*="Stop" i]',
      ],
      // Assistant message turns, in DOM order.
      assistantMessages: [
        '[data-message-author-role="assistant"]',
        'div[data-testid^="conversation-turn"] [data-message-author-role="assistant"]',
      ],
      // Generated image inside the latest assistant message (image-gen chat).
      generatedImage: [
        '[data-message-author-role="assistant"] img[src*="oaiusercontent"]',
        '[data-message-author-role="assistant"] img[alt]',
      ],
    },
    flow: {
      // Google Flow (flow.google.com) — Project creation / editor.
      newProjectButton: [
        'button[aria-label*="New project" i]',
        'a[href*="/project/"]',
      ],
      // Image-upload input. `accept*="image"` narrows to actual image
      // inputs (Flow's editor has more than one file input once a project
      // is open — e.g. video/asset uploads elsewhere on the page — so the
      // bare `input[type="file"]` alone is too easy to match the wrong
      // one silently). Kept as the last-resort candidate, not the first.
      fileInput: [
        'input[type="file"][accept*="image" i]',
        'input[data-testid*="upload" i][type="file"]',
        'input[type="file"]',
      ],
      uploadDropzone: [
        '[data-testid*="upload" i]',
        'button[aria-label*="upload" i]',
        'button[aria-label*="add image" i]',
      ],
      promptField: [
        'textarea[placeholder*="prompt" i]',
        'textarea[aria-label*="prompt" i]',
        'div[contenteditable="true"][aria-label*="prompt" i]',
        'textarea',
      ],
      // No structural fallback (`button[type="submit"]` was removed — SPA
      // buttons rarely use native submit, and it risks matching an
      // unrelated dialog's submit button). content-flow.js falls back to
      // `FA_UTILS.findByVisibleText` (matches visible button text like
      // "Generate") instead, which is a more specific last resort than a
      // structural guess.
      generateButton: [
        'button[aria-label*="Generate" i]',
        'button[data-testid*="generate" i]',
      ],
      // Spinner / progress indicator shown while Veo renders the clip.
      generatingIndicator: [
        '[data-testid*="progress" i]',
        '[role="progressbar"]',
        '[class*="loading" i]',
      ],
      resultVideo: [
        'video[src]',
        'video source[src]',
      ],
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
