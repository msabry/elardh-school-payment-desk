# Plan: Smart SMS, customer lookup, screenshot reading, active enrollments

Total estimate: about 4 working days (including testing with real messages and screenshots). Each story can ship on its own.

| Story | What you get | Estimate |
|---|---|---|
| 1. SMS reading | Paste the SMS while recording; app fills amount, sender/receiver phone or name, reference | 0.5 day |
| 2. Customer lookup | From that phone/name, app suggests the matching customer in the picker | 1 day |
| 3. Screenshot reading for reviewer | Reviewer uploads a transfer screenshot; app suggests amount, wallet, reference, sender, customer | 1.5 days |
| 4. Active enrollment | Each child's active course shows first (pre-selected) for the reviewer | 0.5–1 day |

## Story 1 — Read the SMS (0.5 day)
- Most of this exists already (the hidden AI check reads amount, wallet, reference).
- Add: sender/receiver phone number and name to what the AI pulls out.
- Show a "read message" button next to the SMS box for both accountants; results fill the fields as suggestions the accountant can change.

## Story 2 — Find the customer (1 day)
- Match the phone from the SMS against the Customers tab phone column (ignoring +20, leading 0, spaces).
- If no phone match, match by name (tolerant to small spelling differences in Arabic).
- Show "suggested customer: X" with one tap to accept; if several match, list them.
- Needs: customer phone numbers filled in the Customers tab (several are blank today).

## Story 3 — Screenshot for the reviewer (1.5 days)
- On the review page, add "upload screenshot" on each card.
- AI reads the image (InstaPay / Vodafone Cash screens) and suggests amount, wallet, reference, sender; then Story 2's lookup suggests the customer.
- Highlight differences against what the other accountant entered (red, like the current mismatch box).
- Save the screenshot to the Drive receipts folder with the transaction.

## Story 4 — Active enrollment first (0.5–1 day)
- Add a "status" column (active / inactive) to the Enrollments tab.
- Reviewer's course picker lists the active enrollment first and pre-selects it; others remain available.
- If a child has no active enrollment, show a small warning.

## Questions to settle before building
- Story 4: is "active" a column you will maintain in the sheet, or should it mean "the most recent enrollment"?
- Story 3: should screenshot upload also be available when recording (not only reviewing)?

## Technical notes
- Extend `extractSms` schema in `src/lib/sms-ai.server.ts` with `senderPhone`, `senderName`, `receiverPhone`, `receiverName`; add `extractScreenshot` using the same gateway with image input.
- Pure matching (`normalizePhone`, `suggestCustomers`, `pickActiveEnrollment`) in `src/lib/filters.ts` with unit tests.
- Enrollments read range widens to include the status column; `Enrollment` gets `active: boolean`.
- Each AI read uses a small amount of AI credits.
