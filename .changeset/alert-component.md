---
'gesso-components': patch
---

`Alert` is a new component: a persistent inline banner for a message
that belongs to a region rather than to the screen. The trial notice
above a settings page, the declined-card line above a payment form, the
note over a list saying these numbers are an hour old. A `Toast`
appears, says its piece and leaves on a timer; an alert is still there
when you come back to it.

It takes a `title`, a `message`, one of three tones, and an optional
`onDismiss`. The tones are `neutral`, `accent` and `danger`, the same
three `Badge` and `Chip` carry, and there are three because the palette
has three: there is no `success` token and no `warning` token, and a
banner is not allowed to name a colour your theme has not given it. If
you want a green banner, theme `controlAccent` or wrap the banner in a
theme provider of its own.

The tone is carried by the banner's edge and the ink of its title, on
the same `controlBackground` sheet under all three, rather than by a
filled ground. A full `danger` wall across the width of a region is
louder than nearly any message that goes in one, and it puts the body
text on a ground your theme only had to make legible for short labels.

What it declares is the part worth reading before you use it. `live`
defaults to true, because a banner that appears is news. A live
`danger` banner is `role="alert"` with an assertive live region, so it
interrupts; that is right for a declined card and wrong for everything
else, so every other live tone is a polite `status`. `live={false}` is
the standing banner that was on the page at load: a `region` named by
its title, with no live region at all, so it can be found and skipped
rather than announced again every time focus goes past. Those three
props are read once, when the banner is built, because a live region
has to exist before the text inside it changes; a banner that has to
change tone or stop being live changes its `key`.

`onDismiss` draws a real button named "Dismiss", and pressing it calls
your handler and nothing else. The banner does not remove itself:
whether it is still in the tree is your conditional, because only you
know whether dismissing means for this render, this session or for
good.
