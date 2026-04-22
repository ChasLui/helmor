---
"helmor": patch
---

Fix fast Claude thinking blocks that were collapsing themselves and showing a generic "Thinking" label — they now stay expanded and show "Thought for Ns" as soon as reasoning finishes, even when the block completes too quickly for the streaming UI to observe it mid-flight.
