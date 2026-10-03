---
'gesso-framework': minor
'create-gesso-app': patch
---

`createApp({ pageKeys: true })` says the application is the page: a key pressed while nothing on the page has focus goes to the app, and the canvas takes focus. Keys only reached the app through its canvas, so a page that loads with focus on its body ignored every shortcut until the first click. The templates `create-gesso-app` writes turn it on; an app embedded in a larger page leaves it off.
