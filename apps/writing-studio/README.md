# Writing DNA Lab — opt-in feasibility prototype

> **Documentation scope (31 October 2026): Optional standalone prototype.** The Writing DNA Lab is separate from the encrypted vault and current native capture workflow. [Core objective](../../docs/CORE_OBJECTIVE.md) | [Documentation index](../../docs/DOCUMENTATION_INDEX.md)

Open `index.html` with a local static server from this directory (for example, `python -m http.server 8765`) and navigate to `http://localhost:8765`. It works entirely in the browser and makes no network requests after the page has loaded from the local server. It does not integrate with the encrypted vault or monitor other applications. Writing samples stay in the open tab until you clear or close it; no localStorage or IndexedDB is used.

Choose 1–12 samples, separate them with `---`, review the JSON, and generate a reusable instruction prompt. The exported profile contains source excerpts, so inspect it before sharing. The analyzer intentionally measures only superficial, explainable statistics, not personal identity or actual authorship. It is neither a grammar checker nor a generative writing model.

Test with `node --test tests/writing-studio-browser.test.mjs tests/writing-style.test.ts` using a compatible Node version (Node 22 needs `--experimental-strip-types` for .ts tests).
