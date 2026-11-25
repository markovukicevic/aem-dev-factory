# Accessibility checklist

Use this reference alongside the project's actual accessibility requirements. Mark each applicable item as observed, failed, not applicable or not checked; do not infer conformance from a checklist or an automated scan.

## Keyboard and focus
- Interactive controls can be reached and operated with a keyboard, with a meaningful focus order and visible focus indicator.
- There are no keyboard traps. Dialogs manage focus and return it appropriately when closed.
- Repeated navigation can be bypassed where required.

## Structure and screen readers
- Headings and landmarks describe the page structure; controls have accessible names and roles.
- Informative images have appropriate alternatives; decorative images are ignored by assistive technology.
- Form fields have labels; errors identify the field and explain the problem. Associate relevant help and error text with inputs.
- Tables use appropriate headers, and dynamic updates are announced when needed.
- Prefer native HTML; use ARIA only when needed and keep state synchronized with behavior.

## Visual presentation and media
- Check contrast against applicable requirements (typically 4.5:1 for normal text and 3:1 for large text); information is not conveyed by color alone.
- Content remains usable when text is resized and at narrow viewports; flashing content meets applicable limits.
- Provide captions, transcripts and playback controls as appropriate to the media and requirements.

## AEM-specific review
- Inspect authored image alternatives in DAM and component dialogs.
- Guard optional links against empty or misleading output.
- Check authored heading hierarchy and custom dialog controls.
- Inspect overlays and component updates for keyboard and assistive-technology behavior.

Automated axe results can help identify issues but do not cover every requirement. Record the page, environment, revision, method, limitations and actual observations; do not claim manual or automated checks ran unless they did.
