---
"helmor": patch
---

Make the workspace unread dot behave the way you'd expect:
- Clicking a workspace you just marked as unread now actually clears the green dot. Previously the click was silently ignored when the workspace was already the currently selected one.
- "Mark as unread" only flips the workspace flag itself — it no longer flips a random session's unread state as a side effect, and your manual workspace-level mark is preserved as long as any session in that workspace is still unread.
