// Flow Autopilot — DOM selector configuration
//
// ChatGPT and Google Flow ship frequent, unannounced DOM/markup changes.
// This file is the SINGLE place to update when a step starts throwing
// "selector not found" errors. Each entry is a *list* of candidate CSS
// selectors tried in order (first match wins) so one small tweak on the
// site's end doesn't have to break automation immediately.
//
// NOTE: these selectors were written from public DOM inspection at
// scaffold time (2026-09-13) and have NOT been exercised against a live,
// logged-in ChatGPT Plus + custom GPT + Google Flow session (this
// environment has no such session). Treat them as a well-informed first
// draft, not a verified contract. See README.md "Known limitations".

(function (root) {
  root.FA_SELECTORS = {
    chatgpt: {
      // The hidden <input type="file"> ChatGPT's composer uses for attachments.
      fileInput: [
        'input[type="file"]',
        'input[data-testid="file-upload-input"]',
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
        'div[contenteditable="true"]',
        'textarea[data-testid="prompt-textarea"]',
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
      // Google Flow ("labs.google/fx/tools/flow") — Project creation / editor.
      newProjectButton: [
        'button[aria-label*="New project" i]',
        'a[href*="/fx/tools/flow/project"]',
      ],
      fileInput: [
        'input[type="file"]',
      ],
      uploadDropzone: [
        '[data-testid*="upload" i]',
        'button[aria-label*="upload" i]',
      ],
      promptField: [
        'textarea[placeholder*="prompt" i]',
        'textarea',
        'div[contenteditable="true"]',
      ],
      generateButton: [
        'button[aria-label*="Generate" i]',
        'button[type="submit"]',
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
