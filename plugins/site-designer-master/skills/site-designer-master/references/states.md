# Interaction and states

The development build has a page at `/_review/` that shows every state once, so the meter and the critic see
states that are hard to reach by clicking. Add every component the site uses to it.

| Rule | Check |
| --- | --- |
| Every control has hover (pointer only), focus-visible, pressed and disabled states; a busy state for anything that waits. | /_review/ in the meter and the critic |
| The focus ring is 2px in the focus colour with a 2px offset, at least 3:1 against what is behind it, and never hidden under a sticky header (`scroll-padding-block-start`). | meter rule AXE_SERIOUS, the critic |
| Disabled is not opacity alone: a muted fill, `aria-disabled`, and the reason nearby. | |
| Inventory every content state: loading (a skeleton shaped like the content), empty (what it is and how to fill it), error (inline, what happened, how to fix it, nothing lost), success (what happens next). | /_review/ |
| Nothing lives only on hover; touch users get the same. | |
| Links in text look like links (an underline). | the site kit's base.css |
| Feedback within 100 ms of a click; anything over about 1 s shows progress. | |
| Confirm only what cannot be undone. | |
| A dialog moves focus in, keeps it there, closes on Escape and returns focus; never use a dialog for what could be a page. No newsletter popup on the first visit. | keyboard walk |
| Control sizes: at least 24x24px everywhere, 44px tall on touch for buttons, inputs and selects. | meter rules TARGET_SIZE and TARGET_TOUCH |
| **Every action answers three questions**: what just happened, can I take it back, what do I do next. What tools skip most often is exactly this: status, undo, recovery. | the walk |
| **The bad moments are designed**: a form that did not go through keeps what was typed and offers a way forward (try again, call, write); a failed payment or booking says what to check and who to contact. Handled well, a failure leaves people as happy as no failure. | the walk's break-it list |
| **A limit is exact**: a count and a date ("2 of 2 used, back on 1 December"), never a vague "you have reached the limit". | the critic |
| **One pattern per situation across every page**: the same sent message, the same error, the same empty state, the same limit. A site that is 20 pages that do not agree feels like 20 products. | the critic, comparing pages |
| **Never a blank start**: a list, a form or an area that starts empty opens on a sample, a suggestion or a started item, with one button to make it the visitor's own; teach where the thing is used, never in a tour before it. | the walk |
| **Numbers come with a sentence**: every figure or chart a visitor sees says what it means and what to do ("Your busiest day was Thursday"); an empty result says why it is empty and gives the one action that fills it. | the critic |
