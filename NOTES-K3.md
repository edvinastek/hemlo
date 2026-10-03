# NOTES-K3 (v17: calm shell — nav, Settings, Modules hub, tips)

Branch v17/k3, worktree /home/claude/wt17/k3. Harness: vite on 5303, script in scratchpad/k3h (throwaway).

## Log
- Step 1 (nav): nav.chosen added (settings.ts); pages-rules: effectiveStyle (row while ≤5 pages, hub beyond, unless chosen),
  fitBar (row never scrolls: Today, Plan, first two, Modules), grid capped at four across with Modules last, hubBar at most
  five (two pins; Stats only while a pin place is free), holderOf (Modules marked when the open page is off the bar).
  Nav.tsx: no sideways scrolling on the phone bar, equal columns, only the current page highlighted, long labels a size
  down / two lines, Inbox count badge on Plan (src/lib/inbox-count.ts useInboxCount). "More" is called Settings everywhere.
