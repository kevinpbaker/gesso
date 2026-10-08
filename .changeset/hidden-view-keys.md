---
'gesso-framework': patch
'gesso-vite-plugin': patch
---

`@hidden` on a view key keeps it from AI agents. The Vite plugin lists such keys in `ChannelSchema.hidden`, and the agent surface leaves them out of every tool result, the view resource and the output schema, so an application can keep geometry, clipboard text and the like out of an agent's context. A tool's text result is now compact JSON rather than indented, as the same view is in its structured content.
