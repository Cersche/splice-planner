# Splice Planner · Fiber Fast Homes

Plan fiber splice routes and print 11x17 field sheets, branded for Fiber
Fast Homes (logo files in `assets/`: `logo.png` for prints, `logo-light.png`
and `mark.png` for the dark screens). It runs in any web
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

1. Pick your name at the top (**Working as**). Guest, the default, can open,
   look at and print plans but not change them. Names aren't logins (there's
   no server); they go on what each person adds, on shared files and prints.
   **+ Add a name…** adds one.
2. Pick where the route starts: **Cabinet** (head end or FDH) or **Other**
   (handhole, pedestal, vault, manhole, or type your own).
3. The route sits on a canvas: drag the background or hold the middle mouse
   button to move around (one finger on a phone); scroll the mouse wheel
   (zooms toward the pointer), pinch or use **−** / **+** to zoom, and
   **Fit all** to see the whole job. Shift + scroll moves sideways. The small map in the corner shows
   where you are; tap it to jump.
   Lines are colored by what runs on them: cables red, splitter tails
   blue, terminal tails green, dashed grey where there's no cable yet.
4. Tap the **+** beside a location to add the next one after it. It's joined
   by a path (the line); a cable doesn't have to go on it yet.
5. Tap a line to set its conduit (size, ducts, color, footage) and its cable:
   type (cable, splitter tail, terminal tail), name, size, whether it passes
   through, and which incoming fibers it's spliced to. The line shows only
   the name, size and where the fibers go ("1-12 → HH2"); spares and the
   color code are in the cable's dialog.
6. Values the app fills in have a small **lock**: locked means automatic,
   tap it to set the value yourself (F2 counts, DS counts, fiber picks,
   cable names). For fiber picks, unlocked gives the range boxes and a grid
   of fibers: tap fibers (Shift+tap for a run, a tube name for the whole
   tube), then tap where they start on the new cable, or drag them across.
7. Tap a location for its menu. Head ends, FDHs and field locations each get
   their own: equipment from stock templates (OLTs, FDH panels, splice cases,
   terminals, patch panels, splitters 1x2 to 1x64), the splice case or
   patching editor, home counts, details, splice sheet, rename, move or
   remove.
   - **Open splice case** / **Connections and patching**: drag from a fiber,
     splitter output or port on the left to a fiber, splitter input or port
     on the right (or tap one, then the other). Fiber rows sit on a wash of
     their buffer tube's color. Tray and slot numbers are filled in when
     there's a splice case, and can be changed.
   - **Home counts (F2 / DS)**: F2 and DS fill in by themselves, in route
     order. Drag a home onto a splitter or terminal port (or tap the home,
     then the port), unlock a home to pick from dropdowns, or fill the ticked
     homes (all of them if none are ticked) in order. **Count scheme…** sets
     the whole job's numbering: F2 and DS labels, leading zeros, where
     automatic F2 starts, and DS as the splitter port or a running count.
8. Tap the project title at the top to name the job. To build in phases,
   pick **+ Add a phase** next to it: what's drawn so far becomes Phase 1.
   Choosing a phase shows that phase and the ones before it; splice sheets
   mark earlier work as "Existing".
9. **Import homes** brings in an address list for the whole job. Homes wait
   on the unassigned list until you pick the location that feeds them.
10. **Check plan** lists problems and warnings. Tap one to find it.
11. **Share plan** saves a `.ffhspl` plan file named with the job, your name
    and the date (on a phone it opens the share sheet). The file remembers
    who drafted the plan and who last edited it; opening it shows "From Dave,
    Oct 20". **Open plan** opens `.ffhspl` files and older `.json` ones. With
    the app installed in Chrome or Edge on a computer, double-clicking a
    `.ffhspl` file can open it in the app.
12. **Print / PDF** prints 11x17 field sheets: a route overview on page 1,
    then one page per splice location (a big drawing of the stop with every
    splice numbered in an orange bubble, a checklist keyed to the bubbles,
    and the homes it feeds), then summary tables. A full-size route map
    across several sheets is optional.

Nothing asks "Are you sure?": removals happen right away with an **Undo**
bar at the bottom. **Start over** asks for a second tap.

Plans are saved in the browser as you work. Use **Share plan** to keep a copy
or send it to someone else.
