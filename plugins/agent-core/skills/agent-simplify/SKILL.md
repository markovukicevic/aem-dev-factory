---
name: agent-simplify
description: Simplify a selected area of working code while preserving its intended behavior and existing user changes.
---

# Simplify code

Identify the user's selected scope; if none is given, inspect the current changes and repository instructions before selecting a focused area. Read the implementation, its callers, relevant history and existing checks to understand why complexity exists. A guard, boundary, error path or seemingly repetitive code may preserve real behavior; do not remove it just because it is longer.

Simplify only where the current code can become easier to understand without changing the requested behavior. Preserve public interfaces, data formats, error handling, security boundaries and unrelated user work unless the user explicitly asks to change them. Prefer a few coherent changes over sweeping rewrites. Avoid adding abstractions, comments or tests that merely duplicate the implementation. Use existing checks or a focused verification appropriate to the change and the user's testing preferences; add a test only when it protects a material behavior that cannot otherwise be verified adequately.

Review the resulting diff and report what changed, how behavior was checked and any unverified edge cases. Do not reset, discard, commit, push or publish work without the user's authorization. This initial skill does not claim that a passing check proves complete behavioral equivalence; client behavior is unverified.
