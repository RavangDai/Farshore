# Putting the screen designs in Figma

The annotated frames in `phase3/frames/` are SVG files. Each one holds a real capture of the tested prototype plus vector callouts (numbered markers and a notes panel). Figma imports them as editable layers: the screenshot becomes an image fill, and the markers and notes become shapes and text.

## Steps (about 10 minutes)

1. Sign in at https://www.figma.com and choose **New design file**. Name it `Farshore Phase 3: Screen Designs`.
2. Rename the first page `Desktop`. Add pages named `Phone`, `AI states` and, after testing, `Before / after`.
3. Drag every `D*.svg` file from `phase3/frames/` onto the **Desktop** page, the `M*.svg` files onto **Phone**, and the AI-state frames (listed in `frames/index.json` with an "AI" flow) onto **AI states**. Figma places each SVG as its own frame.
4. Select all the frames on a page and use **Tidy up** (Ctrl+Alt+T) to arrange them in a grid.
5. Optional: add a cover frame with the title, your name, CMPS 4200 and the date.
6. Click **Share** at the top right. Under **General access**, choose **Anyone with the link** and **can view**. Copy the link.
7. Paste the link into `phase3/SUBMIT.md` (the Figma line) and send it to me, so I can put it on the PDF cover and the screen designs section.

## Notes

- If Figma says a font is missing, choose Arial or Georgia when asked.
- Marker colours: gold = interface note, cyan = AI behavior or AI state, red = a usability issue found in testing.
- After the Stage 2 fixes I will export "after" frames. Put them on the **Before / after** page next to the frames they replace.
