---
'create-gesso-app': patch
---

**The Electrobun template's README no longer explains a `vendor/` that
is not there.** The CLI appends the vendoring section itself, and only
under `--local`, so the template carrying its own hardcoded copy meant a
registry-scaffolded project shipped with a section about a directory it
does not have, and a `--local` one got the section twice. Removed from
the template; the two other lines that assumed every project was
vendored now say which route they are about.
