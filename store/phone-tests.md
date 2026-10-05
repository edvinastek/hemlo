# Phone tests for version 19 (X5: shortcuts, quick-add widget, Health Connect)

What could not be checked without a phone. Install the version 19 build, sign in, and go through the list. Each line
says what to do and what should happen. Note any that fail with the phone model and Android version.

## Launcher shortcuts (NAV-24)

1. Open Visuma once and go to Today (the app sends the + menu's order to the phone a moment after Today opens).
2. Leave the app, long-press the Visuma icon. **Expect:** up to four shortcuts, the same as the first four in Today's
   + menu, in the same order (Task, Task to Inbox, Food, Event for a new profile, if those modules are on).
3. Tap **Task**. **Expect:** Visuma opens on Today with a new task's sheet open. Back closes the sheet.
4. With Visuma open on another page (say Food), go home and use the **Food** shortcut. **Expect:** the app comes
   forward (no restart, no splash screen), on Today, with Add food open.
5. In the + menu, Edit menu: move Shopping item to the top, hide Event. Leave the app and long-press the icon again.
   **Expect:** the shortcuts follow (Shopping first, no Event).
6. Switch a module off (More → Modules) whose entry is a shortcut, then open Today. **Expect:** that shortcut is gone.
7. Drag a shortcut to the home screen (pin it), then tap it. **Expect:** it opens like the long-press one.
8. Change the app icon (Settings → Looks), leave the app, long-press the new icon. **Expect:** the shortcuts are
   still there.
9. Sign out. **Expect:** the shortcuts are gone. Sign in again and open Today: they come back.

## Quick-add widget (WID-11)

10. Home screen → Widgets → Visuma. **Expect:** "Visuma · Quick add" with a preview of four buttons and the line
    "The first entries of your + menu, one tap each."
11. Place it (4 × 1). **Expect:** four buttons, the same entries as the shortcuts, in the app's theme.
12. Resize to 3 × 1 and 2 × 1. **Expect:** three, then two buttons, nothing cut off.
13. Tap each button. **Expect:** Visuma opens on that entry's sheet (as the shortcuts do), also from a cold start.
14. Change the + menu order in the app. **Expect:** the widget's buttons follow within a second or two.
15. Switch the phone to dark mode (theme "follow the phone"). **Expect:** the widget turns dark with the home screen.
    Choose a theme in Settings → Looks: the widget takes its colours.
16. With TalkBack on, move over the buttons. **Expect:** "Add task", "Add task to Inbox", "Add food"…
17. Sign out. **Expect:** the widget shows the four default buttons; tapping one opens the sign-in screen.

## Health Connect sleep import (SLP-05)

Needs Health Connect with some sleep in it (Android 14 and later: built in; Android 9 to 13: the Health Connect app
from Google Play). A sleep tracker app, a watch, or Health Connect's own data entry can put sleep there.

18. Sleep on, open Sleep → ⋮. **Expect:** "Import from Health Connect" (not shown on Android 8 or older, in the
    browser or on Windows).
19. On Android 9 to 13 without the Health Connect app: choose it. **Expect:** "Health Connect needs installing or
    updating first." and **Get Health Connect**, which opens Google Play. Install it, come back: the sheet now offers
    the days.
20. Choose 14 days → Import. **Expect:** Health Connect's own permission screen asking for **Sleep only** (nothing
    else). Its "privacy policy" link opens "Visuma and Health Connect"; its Privacy policy button leads to the policy.
21. Allow. **Expect:** "N nights added." (plus days that already had a night, naps left out). Each night on the Sleep
    page on the morning it ended, with bed and wake times as the tracker recorded them; hours asleep from the stages
    when the tracker records stages.
22. Undo on the bar. **Expect:** those nights go. Import again: they come back.
23. Import again without Undo. **Expect:** "No new nights." and the same nights, not doubled.
24. Delete one imported night, import again. **Expect:** it stays deleted.
25. A night typed in by hand on a day Health Connect also has: **Expect:** the typed one stays.
26. Deny the permission twice, then Import. **Expect:** "Visuma may not read sleep. You can allow it in Health
    Connect." and **Open Health Connect**, which opens Health Connect's settings; allow Sleep there, come back,
    Import works.
27. Android 14 and later: Settings → Security and privacy → Privacy → Health Connect → App permissions → Visuma →
    the link at the bottom. **Expect:** "Visuma and Health Connect" opens.
28. On another device signed in to the same account (after sync): **Expect:** the imported nights are there.
29. Health Connect only gives 30 days before the permission was first given: on a fresh grant, 30 days is the most
    that comes back. Not a fault.
