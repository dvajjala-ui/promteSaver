# UX principles and usability checklist

**Experience goal:** "Quietly useful, always understandable, quick enough that I actually use it."

## Information architecture

- **Home / All prompts:** single search, most-recent/important prompts, first-run examples if explicitly requested.
- **Pinned:** curated daily prompts rather than every noisy capture.
- **Templates:** reusable text with `{{variables}}` filled at copy time. No dangerous hidden scripts or implicit agent actions.
- **Captured:** provenance-labeled imported/observed source records. Separate immutable source evidence from editable library items.
- **Settings & privacy:** status, local storage disclosures, recording boundaries and lock controls. No buried security opt-out.

## Interaction design in current preview

1. Onboarding only needs vault passphrase + confirmation. Password strength is a risk, but no account/marketing funnel. Give a clear offline promise and plain-language encryption limitations.
2. Empty state gives **Save a prompt** or **Add examples**. Examples are synthetic and opt-in.
3. Search is prominent; `Ctrl/Cmd + K` opens Quick Find and `Ctrl/Cmd + N` opens prompt creation. Cap results to protect weak devices.
4. Cards show source/type, recent date, tags and a small preview. Pin, copy and edit are discoverable. Destructive delete asks for confirmation.
5. Template variables are resolved at user action, then copied to clipboard. They never trigger auto-submit. Clipboard history is outside the app's control.
6. Client-side views are DOM/text-based with no heavy JS framework, animation loops, icon libraries or remote fonts. Responsive grid adapts to narrow browser windows.
7. `.editor-dialog` has native dialog focus trapping, Escape to request dismissal (confirm if a draft is dirty), visible labels and focus rings. Reduced-motion preferences disable transitions.

## Accessibility and internationalization backlog

- Current: semantic buttons/inputs, labels, keyboard shortcuts, visible focus, live result/notification regions, `prefers-reduced-motion`, no auto-running effects.
- Next: run **axe-core/WCAG 2.2 AA** audit, actual screen-reader testing with NVDA/VoiceOver, 200% zoom, meaningful focus restoration after dialog close, color contrast audit, non-US date/time formatting, right-to-left and CJK/multilingual query handling.
- Text normalization for search uses Unicode NFKC/lowercasing; actual accented/CJK/mixed-language retrieval coverage needs consented fixtures.
- Browser helper supports only a known AI-site allowlist and an explicitly focused editor. When detection fails, explain why without inspecting the whole page.

## Design tokens (current)

Background `#0b1014`; surface `#111820`; border `#26313b`; text `#ebf1f0`; muted `#84939e`; mint accent `#b7f9ce`; purple secondary `#a8a3e6`. System font stack to avoid font downloads. Small, legible body and clear high-contrast primary actions. Never convey security/capture status through color alone.

## Usability study protocol (not yet executed)

Recruit 4 developers and 4 everyday AI users spanning Windows/macOS and at least two lower-spec machines. Ask each to: (1) save an existing prompt, (2) find it with a tag/search phrase after distraction, (3) make a template, (4) copy with filled variables, (5) pause/lock and locate deletion, (6) explain what is and is not captured. Log task completion, time, misclicks, trust concerns and interview notes only with consent. Prioritize problems by severity and frequency; do not claim usability success before testing.

## Reference standards

- [WCAG 2.2: keyboard/focus](https://www.w3.org/TR/WCAG22/) — operable interface and visible focus.
- [MDN keyboard accessible](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Guides/Understanding_WCAG/Keyboard) — focusable interactive controls.
- [Raycast snippets](https://manual.raycast.com/snippets) and [Text Blaze forms](https://blaze.today/guides/forms/) — discovery/reuse patterns; independent implementation, no source copied.

## v0.3 evidence and remaining UX work

A real Chromium fixture run now exercises keyboard finder/Escape, conditional edit recovery, cancellable dirty-draft dialogs, low-memory/compact layouts, bounded pagination, bulk project moves, password errors, backup preview and lock clearing. Screenshots include 390px mobile and desktop layouts. The live HTTP UI, screen readers, 200% zoom and WCAG audit remain separate unverified gates; do not promote fixtures into a conformance claim. Native browser prompts were replaced with asynchronous HTML dialogs; clipboard fallback offers selectable text without claiming a copy occurred.
