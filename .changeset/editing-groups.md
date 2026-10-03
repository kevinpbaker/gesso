---
'gesso-core': minor
'gesso-framework': minor
---

Editables can select as one. Set `editingGroup` on a container and a selection can start in one field and end in another: arrows move between fields at their edges (up and down keep the column), Shift extends across them, a drag or a Shift and press reaches into other fields, and select all takes the whole group. Every field in the range draws its part. Typing, deleting, Enter, paste and cut over such a selection go to the group's `onEdit` with both ends, since only the application knows how its blocks join, and copy and cut take the whole selection, as the group's `copyText` if it gives one.
