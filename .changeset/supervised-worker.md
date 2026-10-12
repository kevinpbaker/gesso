---
'gesso-framework': patch
---

`SupervisedWorker` and `superviseSelf`, from `gesso-framework/worker`, run a worker whose code the application does not trust to behave: a plugin, a user's script, a parser fed whatever a file holds. The starting side asks the worker every second whether it is there, and ends it if it has not answered for five seconds or not said it is ready within ten, so a loop in it costs a core and holds up no thread; `status$` says where it is and why it stopped. The worker's side answers as messages come, says when it is ready or that it could not start, and reports what nothing in it caught. Their own messages carry a field of their own, so the application's protocol passes through `post` and `onMessage` untouched.
