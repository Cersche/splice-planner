# Splice Planner

Plan fiber splice routes and print 11x17 field sheets. It runs in any web
browser: nothing to install, no account, and it keeps working with no signal.

## Opening the app

**On a computer:** open the link, then press **Ctrl+D** (Mac: **Cmd+D**) to
bookmark it. In Chrome or Edge you can also click the small install icon at the
right end of the address bar to get a desktop icon.

**On a tablet or phone:**
- iPad / iPhone (Safari): tap **Share**, then **Add to Home Screen**.
- Android (Chrome): tap the **⋮** menu, then **Add to Home screen** or **Install app**.

After that it opens from its own icon like any other app. Open it once while
you have signal and it will work offline after that.

## Using it

1. Pick where the route starts: **Cabinet** (head end or FDH) or **Other**
   (handhole, pedestal, vault, manhole, or type your own).
2. Tap the **+** beside a location to add the next one after it. It's joined
   by a path (the line); a cable doesn't have to go on it yet.
3. Tap a line to set its conduit (size, ducts, color, footage) and its cable:
   type (cable, splitter tail, terminal tail), name, size, whether it passes
   through, and which incoming fibers it's spliced to (automatic, or pick
   them yourself). Each cable shows a label like "1-12 to HH2, 13-48 spare".
4. Tap a location for its menu. Head ends, FDHs and field locations each get
   their own: equipment from stock templates (OLTs, FDH panels, splice cases,
   terminals, patch panels, splitters 1x2 to 1x64), the splice case or
   patching editor, home counts, details, splice sheet, rename, move or
   remove.
   - **Open splice case** / **Connections and patching**: drag from a fiber,
     splitter output or port on the left to a fiber, splitter input or port
     on the right (or tap one, then the other). Tray and slot numbers are
     filled in when there's a splice case, and can be changed. The splice
     sheets follow what you connect.
   - **Home counts (F2 / DS)**: tick homes, pick a splitter and first port,
     and fill DS counts in order.
5. Tap the project title at the top to name the job. To build in phases,
   pick **+ Add a phase** next to it: what's drawn so far becomes Phase 1.
   Choosing a phase shows that phase and the ones before it; splice sheets
   mark earlier work as "Existing".
6. **Import homes** brings in an address list for the whole job. Homes wait
   on the unassigned list until you pick the location that feeds them.
7. **Check plan** lists problems and warnings. Tap one to find it.
8. **Save plan** downloads the plan as a file. **Open plan** loads one back.
9. **Print / Save PDF (11x17)** prints the field sheet: the map, details,
   cables, conduit, splitters, homes, color code and a splice sheet for
   every closure.

Nothing asks "Are you sure?": removals happen right away with an **Undo**
bar at the bottom. **Start over** asks for a second tap.

Plans are saved in the browser as you work. Use **Save plan** to keep a copy
or send it to someone else.
