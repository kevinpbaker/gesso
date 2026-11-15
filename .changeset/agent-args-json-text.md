---
'gesso-framework': patch
---

An agent tool's arguments written in the wrong JSON type are put back in the type the schema asks for before they are checked, for application tools and channel commands alike: an object or array sent as JSON text (`{"profile": "{\"id\": \"sendcutsend\"}"}`), a number sent as a string (`"quantity": "8"`) and `"true"` or `"false"` where a boolean belongs, as smaller models often write them. They used to be refused, which cost the model a turn it might not recover from. Only where the schema does not take the string as it is (no free string type, and not one of an enum's words), and only when the text is that kind of value; anything else reaches the checks as it came. Text that looks like an object or array but would not parse is refused with how to send it.
