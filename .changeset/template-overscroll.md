---
'create-gesso-app': patch
---

The templates' pages set `overscroll-behavior: none`. A full-page app hands a scroll it can't use back to the page, and on a Mac Chrome then stretched the whole page and showed white behind it, or took a sideways swipe as Back.
