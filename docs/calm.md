# Calm by default: the design rules for version 17

The owner tested version 16 and found it cluttered: "keep most of the options accessible yet kinda hidden; clutter would scare new users." Freedom stays (the person decides, nothing is lost); what changes is the surface. Every function of v16 stays reachable, at most **two levels** down (surface → sheet, ⋮ or expanded row). Research behind these rules: NN/g on progressive disclosure, minimalist design, contextual menus, onboarding and empty states; Apple HIG (tab bars, toolbars, lists, context menus, disclosure controls, onboarding, settings); Material 3 (FAB, navigation bar, chips); and how Things 3, Structured, Todoist, TickTick, Reminders, Google Tasks, Apple Health, MyFitnessPal and Cronometer hide their advanced options. Sources are listed at the end.

## The rules (IDs used in docs/requirements.md as CALM-nn)

**Structure**
- **CALM-01 One main action per screen.** The round + is it. No second add on the same screen (no inline "+ Add a …" row *and* a +; no "New view" button *and* an empty-state button). Inline capture fields are allowed only where typing is the main action (Inbox, shopping list); then there is no +.
- **CALM-02 Visibility follows use, not existence.** What a person uses every day is on the surface; everything else is one level down. The first view of a screen should show content, not controls: aim for **at most 12 tappable things above the fold** on any main screen (excluding list rows themselves).
- **CALM-03 One ⋮ per page** (`src/ui/PageMenu.tsx`), top right, level with the title: views, sort, grouping, layout switches, select, export (`useExport`), edit module, about. No Export links on pages, no "Edit module" buttons, no layout switches on the page.
- **CALM-04 Navigation: 3–5 destinations.** The bar never scrolls. With more than five pages on, the bar is Today, Plan, up to two pinned pages, and Modules (the hub, which holds everything else). Only the current page is highlighted.
- **CALM-05 Tabs only for real destinations, at most four.** Power views of a module (table, board, month, calendar of its records) live under ⋮ → Views. A tab row that would hold one tab is not drawn.

**Rows**
- **CALM-06 A row is a title and at most one quiet line**, a tick and a ⋮. Metadata only when it is set (no "No section", no "0 min"); glyphs over words where the meaning is obvious (↻ repeats, a small checklist count). Secondary actions (push 15/30/60, copy, duplicate, move, skip) live in the expanded row and the ⋮, never on the collapsed row.
- **CALM-07 One way to say a thing on a row.** "All day" once, a time once, a status once.

**Forms and sheets**
- **CALM-08 Forms stage their fields.** What a person needs to make the thing is visible (a task: what, day, time, length, repeat, note); everything else sits in one "More options" disclosure (`src/ui/MoreOptions.tsx`), which opens by itself when something inside is set and shows a one-line summary when closed.
- **CALM-09 Sheets open where the work is.** A sheet that can guess its first step skips it and shows the guess as a line with "Change" (the add-food sheet opens on the food search with "Lunch · now · eaten — Change").
- **CALM-10 Never a sheet on a sheet; every sheet closes on Back and Escape.**

**Words**
- **CALM-11 No explanatory paragraphs on screens.** Page subtitles go. A control that is unclear gets a better label, not a paragraph. Explanations live in one place: the item's "About" in the ⋮, or a just-in-time tip. Empty states keep one sentence and one button.
- **CALM-12 Settings rows have at most one helper line**, ideally none.
- **CALM-13 Data credits and legal lines** (NEVO, Open Prices, Open Food Facts) live in Settings → About and on the page where the data is shown in full (the food page), not on lists.

**Learning**
- **CALM-14 Tips are one slim line with ×**, shown at the moment they help, at most one per session app-wide, never repeated, and findable again in Settings.
- **CALM-15 Empty smart sections are hidden** (an empty Inbox has no section on Today; an empty Budgets block is not drawn; it is offered where it belongs).
- **CALM-16 Selecting many starts with a long press** on a row (and "Select" in the ⋮); no always-visible Select buttons.

**Freedom**
- **CALM-17 No global Simple/Advanced switch.** Disclosure is local; modules are opt-in and keep their data when hidden; density choices live in the page's ⋮ (e.g. "Show times on rows"), off by default.
- **CALM-18 Nothing is lost.** Every v16 function stays reachable in at most two steps from where it was, and "What moved where" (Settings → Tips) lists every move of v17.

## Sources
- NN/g: Progressive disclosure — https://www.nngroup.com/articles/progressive-disclosure/ · Aesthetic and minimalist design — https://www.nngroup.com/articles/aesthetic-minimalist-design/ · Contextual menus — https://www.nngroup.com/articles/contextual-menus-guidelines/ · Hamburger menus (hidden navigation is >20% less discoverable) — https://www.nngroup.com/articles/hamburger-menus/ · Mobile onboarding — https://www.nngroup.com/articles/mobile-app-onboarding/ · Empty states — https://www.nngroup.com/articles/empty-state-interface-design/ · Bottom sheets — https://www.nngroup.com/articles/bottom-sheet/ · Customisation — https://www.nngroup.com/articles/customization-of-uis-and-products/
- Apple HIG: Tab bars, Toolbars, Lists and tables, Context menus, Disclosure controls, Onboarding, Settings — https://developer.apple.com/design/human-interface-guidelines/ · WWDC25 session 359 on tab count
- Material 3 / Android: FAB — https://developer.android.com/develop/ui/compose/components/fab · Navigation bar (3–5 destinations) and chips — material-components-android docs
- Apps: Todoist navigation bar and Quick Add customisation; Structured features off by default; TickTick tab bar and hidden smart lists; Apple Health pinned items; Cronometer display settings; MyFitnessPal Today tab.
- Google Research on first impressions (simple and familiar designs preferred within 50 ms).
