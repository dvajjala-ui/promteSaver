# Workbench design guidelines

Three-zone layout: compact left navigation, primary searchable prompt canvas, contextual right inspector. On narrower laptops the inspector becomes an overlay; on phones navigation compacts to a scrollable strip. Theme uses locally bundled system font stacks, mint accent on deep-charcoal surfaces, simple icons, subtle hover transitions and reduced-motion rules. All prompts remain explicit manual saves, with preview-only library queries and full-text retrieval on selection. Settings stays reachable via the top-bar even when its sidebar entry is hidden.

Shortcuts stay compatible with the existing app (`Ctrl/Cmd+K`, `Ctrl/Cmd+N`). The inspector and list/card layout can be toggled from visible controls. Writing Studio is a split editor workspace, with jumps between profile, compose, review and export. Do not call a fixture screenshot an installed app screenshot.

Before market launch: independent WCAG keyboard/screen reader review, 200% zoom, forced colors, full native Windows/Mac WebView and installer tests, clipboard privacy, OS keychain, database encryption, signed releases, crash/idle memory profiling, and licensing review.
