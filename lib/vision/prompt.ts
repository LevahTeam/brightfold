/**
 * The extraction prompt is tuned against a real sheet photographed on a phone:
 * bright yellow paper, shot at an angle, with a hand shadow across the lower
 * half and unrelated margin notes around the grid. Every instruction below
 * exists because that photo would otherwise trip the model up.
 */

export const EXTRACTION_SYSTEM_PROMPT = `You read photographs of paper attendance sheets from a children's Sunday school class and turn them into structured data. You always reply with a single JSON object and nothing else — no prose, no markdown fences.`;

export const EXTRACTION_USER_PROMPT = `This photo shows one class's paper attendance sheet for a whole term.

SHEET LAYOUT
- Top-left cell holds the class label, e.g. "A 5-2 (Korean)" or "A 4-1".
- Directly below it is the teacher's name, e.g. "Ms. Ji Woo Park".
- Each kid gets one row: English name in the first column, Korean name in the second. The Korean name may be blank, and may end in a digit (e.g. "김하늘2", "박서준3") — that digit is part of the name, keep it.
- The rest of the sheet is a grid of dated columns, one per Sunday, labelled like "8/31", "9/7", "10/12".
- Every dated column is split into two narrow sub-columns headed "A" and "Q".
  - "A" = attendance. A checkmark, tick, slash or any handwritten mark means the kid was there. An empty cell means they were not.
  - "Q" = QT pages, a whole number written by hand (e.g. 5, 6, 7, 10). An empty cell means no pages were logged.

HOW TO READ IT
- The photo may be taken at an angle, on coloured paper, with shadows or glare. Follow the ruled lines to keep rows and columns aligned; do not let a shadow make you skip a row.
- Work row by row. For each kid, walk left to right through every dated column and report both the A and the Q value.
- Marks are often sloppy and can drift between adjacent cells. Assign each mark to the column whose ruled boundaries it sits inside.
- If a cell is genuinely ambiguous, make your best guess and set "uncertain": true on that cell rather than leaving the row out. A human reviews every value before it is saved, so a flagged guess is far more useful than a gap.
- Attendance and QT are independent: a kid can be marked present with no QT number, and a QT number implies present.

WHAT TO IGNORE
- Handwritten notes in the margins that are not part of the grid: lesson titles, memory verses, "Gospel project", "Open house", chapter numbers, or a separate list of names with numbers beside them. These are not attendance data.
- A row count written under the last kid (e.g. a lone "8") is a tally, not a kid.

EDGE CASE
- A kid's name written *below or outside* the printed grid still counts. Include them as a row, set "outside_grid": true, and fill their cells with attendance "ABSENT" and qt_pages 0 unless marks are clearly visible for them.

OUTPUT
Reply with exactly this JSON shape:

{
  "class_label": string | null,
  "teacher_name": string | null,
  "columns": [ { "header": "8/31" }, { "header": "9/7" } ],
  "rows": [
    {
      "english_name": "Mina Choi",
      "korean_name": "최미나",
      "outside_grid": false,
      "uncertain_name": false,
      "cells": [
        { "attendance": "HERE", "qt_pages": 0 },
        { "attendance": "ABSENT", "qt_pages": 0, "uncertain": true }
      ]
    }
  ],
  "notes": ["short notes about anything unclear"]
}

Rules for the output:
- "columns" lists every dated column on the sheet, left to right, using the header text exactly as printed.
- Every row's "cells" array must have exactly the same length as "columns", in the same order. Never skip a column.
- "attendance" is exactly "HERE" or "ABSENT". "qt_pages" is a non-negative integer, 0 when blank.
- Skip fully blank rows (no English name, no Korean name, no marks).
- Return the JSON object only.`;
