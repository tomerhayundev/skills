# Forms

Forms are where sites lose people. Locally they work for real: a form posts to `/forms/<name>`, the local
server stores the fields in `.site-data/submissions.jsonl` and sends the visitor back with `?sent=<name>`;
the site kit's script then hides the form and shows the block marked `data-sent` next to it.

```html
<form method="post" action="/forms/contact">
  <label for="c-email">Email</label>
  <input id="c-email" name="email" type="email" autocomplete="email" required>
  <button type="submit">Send the message</button>
</form>
<div data-sent hidden tabindex="-1"><h2>Sent</h2><p>A reply comes by email within two working days.</p></div>
```

| Rule | Check |
| --- | --- |
| The fewest fields that do the job, each one justified; one column. Choices that can be tapped (chips, steppers, pictures) instead of typed, with the most common one pre-selected ([decisions](decisions.md)). | the brief's purpose for the form |
| A visible label above every field; a placeholder is never a label. | meter rule AXE_SERIOUS (label) |
| The right `type`, `inputmode` and `autocomplete` (name, email, tel, street-address). Email, phone and URL fields read left to right even on a Hebrew page. | the site kit's base.css for direction |
| Mark the optional fields when most are required. | |
| Validate when a field is left, not on every keystroke; the error sits under the field, says how to fix it, and is linked with `aria-describedby`. After a failed submit, an error summary at the top takes focus. | /_review/ |
| The submit button says what happens, shows a busy state and blocks a double submit; success replaces the form with what happens next. | meter rule BUTTON_TEXT |
| Success is a moment, not a bare "Sent": it thanks in the site's voice and says what happens next and when. People remember a visit by its best moment and its end; this is often both. | the walk list, the critic |
| Paste and password managers always work; no puzzle a person must solve. | |
| Phone, date and address accept local formats with spaces and dashes. | |
| What a real back end would need (payment, accounts, a booking engine) is designed and marked as such in the handover. | Step 7 |
