import { map } from 'rxjs/operators';

import { percent } from '@gesso/core';
import { internalState, type ComponentContext, type Inputs } from '@gesso/framework';

/**
 * A bare `<editabletext>`, one level below the component library.
 *
 * There is no `TextInput` here on purpose: everything the field does
 * is the node's, and the component is the label, the message and the
 * theming around exactly this.
 */
export function NameField(_inputs: Inputs<{}>, _ctx: ComponentContext) {
  const text = internalState('Ada Lovelace');
  const selection = internalState('0 to 0');
  const refused = internalState(0);

  // #region field
  /**
   * Two listeners, and they run at different moments.
   *
   * `onBeforeInput` runs before the edit reaches the text, carries the
   * DOM's own `inputType` vocabulary, and cancels the edit when it
   * calls `preventDefault()`. This one refuses any insertion carrying a
   * digit, whether it was typed, pasted or committed by an assistive
   * technology, because all three arrive here as an insertion with
   * `data`.
   *
   * `onInput` runs after the text changed, and carries the whole new
   * value with the selection that followed it. Writing that value
   * straight back to the cell the field is bound to is what makes the
   * field controlled without disturbing the caret: the keystroke landed
   * in the node's own model first, and the property it is compared
   * against now agrees with it.
   */
  const field = (
    <editabletext
      label="Name"
      value={text}
      placeholder="Your name"
      textWrap="none"
      width={percent(100)}
      padding={8}
      fontSize={14}
      color="text"
      borderWidth={1}
      borderRadius={6}
      borderColor="border"
      backgroundColor="controlBackground"
      onBeforeInput={event => {
        if (event.data !== null && /\d/.test(event.data)) {
          event.preventDefault();
          refused.value++;
        }
      }}
      onInput={event => {
        text.value = event.value;
        selection.value = `${event.selectionStart} to ${event.selectionEnd}`;
      }}
    />
  );
  // #endregion field

  return (
    <column gap={10} padding={20} width={percent(100)} height={percent(100)}>
      {field}
      <column gap={4}>
        <text text={text.pipe(map(value => `value: ${value}`))} fontSize={12} color="textMuted" />
        <text text={selection.pipe(map(range => `selection: ${range}`))} fontSize={12} color="textMuted" />
        <text
          text={refused.pipe(map(count => `refused: ${count} ${count === 1 ? 'edit' : 'edits'}`))}
          fontSize={12}
          color="textMuted"
        />
      </column>
      <text
        text="Digits are refused. Double click a word to select it; the caret, the selection and the undo history are the node's."
        fontSize={12}
        color="textMuted"
      />
    </column>
  );
}
