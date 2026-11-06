# Customer UI fixes (Task 15C)

Every customer page was opened at 375, 768 and 1280 px (light) with the demo customer "Meera".
"Before" screenshots: `docs/ui-screenshots/t15-before-c-*`. "After": `docs/ui-screenshots/t15-after-c-*`
(plus `t15-after-book-*` for the guided booking and `t15-after-tour-*` for the tour).
No page had page-level horizontal scroll before or after (checked by script, `scrollWidth - innerWidth = 0`).

## Problems found, and what was done

| # | Page | Problem | Fix |
|---|------|---------|-----|
| 1 | All | Every page began with a frosted glass header card over a busy photo. Text sat on a picture, and every header looked the same weight as the content below it. | `PageHeader` is now a flat header: display-face title, one line of description, a hairline under it, the primary action on the right (stacked on phones). The customer area has no photo behind it (`PageBackground plain`). |
| 2 | All | Spacing between header, filters and lists differed per page. | One rhythm: header `mb-lg`, sections `gap-lg`, lists `gap-md`. Pages keep their own `py` only where they had a form. |
| 3 | Home (dashboard) | Eleven identical "Available / Open" cards that only repeated the sidebar. It did not say what mattered. | New `CustomerHome`: **Needs you** (pay now, waiting for approval), **Next visit**, the rating prompt, and four shortcuts. Empty states say what happens next. |
| 4 | Invoices | A 5-column table cut off at the right edge at 375 px (the Details column was off screen). | Table from 768 px up; below that each invoice is a card: service, date, number, total and a View button. |
| 5 | My appointments | 15,000 px tall at 375 px: every past visit was listed. | Past visits show the latest 4 with "Show all N past visits" (and "Show fewer"). Upcoming stays complete. |
| 6 | Booking | One long page with five numbered boxes and a summary far below on a phone. | Guided flow: step indicator (Service, Time, Details, Review), one decision per step, Back/Next, each step is checked before moving on (errors stay on the step), the summary and the policy checkbox appear on the last step. Focus moves to the step heading. Nothing typed is lost when going back (steps stay mounted, hidden). |
| 7 | Booking, appointments, home | "Requested" and "Awaiting payment" mean nothing to a customer. | Customer wording: **Waiting for approval** and **Ready to pay** (`StatusBadge plain`). The desk keeps its own words. |
| 8 | All (phone) | The floating chat button sat on top of the last card. | `main` has bottom padding on phones. |
| 9 | Booking, Wallet, Stylist Chat | A first visit gave no hint what the page does. | Dismissible first-visit tips (`PageTip`), remembered on the server per person, never shown again after dismissing. |
| 10 | Sidebar | No way to learn the app. | First-run guided tour and a "Take the tour" item in the Account group (see the Task 15D section of `docs/PROGRESS.md`). |

## Checked and left as is

- **Wallet, Packages, Memberships, Orders, Waitlist, Profile, Shop:** one column on phones, forms have visible labels, hints and field errors, empty and loading states exist (`EmptyState`, `LoadingState`). Button sizes already follow sm 32 / md 40 / lg 48 (`button-styles.ts`).
- **Modals** (reschedule, cancel, invoice) trap focus, close on Escape and return focus.

## Not done

- The Shop and Wallet pages keep their existing glass-card sections; they are readable and consistent, and were not restructured.
- Pagination for Invoices on very long histories (the page is a plain list of cards, about 110 px each).
