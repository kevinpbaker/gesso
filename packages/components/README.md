# gesso-components

The component library: five tiers, one contract.

```bash
npm install gesso-core gesso-framework gesso-components rxjs
```

```tsx
import { Button } from 'gesso-components';

<Button label="Sign in" onClick={() => session.signIn()} />;
```

## The contract

Every control in the library, without exception:

- **Controlled by default**, with an optional `defaultX` for the uncontrolled case
- **Themed through `UiTheme` tokens** and taking no colour props, so a theme change repaints exactly the nodes that read it
- **Keyboard operable** from a keymap that is data, not a switch statement
- **Emitting semantics** from the day it was written, so an assistive technology has something to read

`label` is one prop for the words and for the accessible name, because in a button with words they are the same thing and two props are two things to keep in step. A button whose content is a glyph passes `children` and keeps `label` as the name.

## The five tiers

Inputs, overlays, structure, data and media: `Button`, `Checkbox`, `Chip`, `Dialog`, `Menu`, `Tooltip`, `Card`, `Divider`, `Accordion`, `Toolbar`, `DataTable`, `LazyList`, `Badge`, `Image`, `Icon`, `Avatar`, `Skeleton` and the rest.

## Documentation

[Components](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/components/index.md) | [Forms](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/guide/forms.md) | [Themes and the environment](https://github.com/kevinpbaker/gesso/blob/main/apps/docs/appearance/themes-and-the-environment.md)

MIT (c) Kevin Baker
