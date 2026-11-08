"""Build the blank Phase 3 raw test data workbook (formulas only, no results).

Usage: python scripts/coursework/phase3-workbook.py <out.xlsx>
Fields follow the instructor's Usability_Test_Script_Template: completed (Yes / Partly /
No / Gave up), time on task, errors, ease 1-5, SUS, and the AI trust and perception
questions. Recalculate in Excel afterwards (scripts/coursework/phase3-recalc.ps1).
"""
import sys
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.formula import ArrayFormula

OUT = sys.argv[1]
PARTICIPANTS = [f"P{i}" for i in range(1, 9)]  # room for 8; unused rows stay empty
TASKS = [
    ("T1", "Start your journey", "F1 Start or resume and learn a trial", "You've heard about a game where you travel home with Odysseus, and you've just opened it for the first time. Start a new journey and get ready for the first challenge.", "The Land of the Lotus-Eaters briefing is on screen."),
    ("T2", "Know your opponent", "F2 Prepare, review and accept a model strategy", "Before you face your first opponent, you want to know what you're up against. Find out what your opponent plans to do in this challenge, and who or what decided that plan.", "Paraphrases the strategy in the rival panel and says the AI model chose it."),
    ("T3", "Read the rival's mind", "F3 Play against an active mythic rival", "A friend told you the Cyclops' Cave is the toughest island, and that you can see how the Cyclops thinks. Play it, and while you play, tell me why the Cyclops made one of his moves, using what the game shows you.", "Cites a reason or action from the AI Insights / AI Lab panel for a specific throw."),
    ("T4", "AI failure: Island of Aeolus", "F4 Recover from a failed or unsuitable AI plan", "You'd like to try a different island. Open the Island of Aeolus and get ready to play it. (Mock AI service in mode error-once; no warning.)", "Gets back to a ready rival (start button reads '...counts toward your voyage') without help."),
]
SUS_ITEMS = [
    "I think that I would like to use this app frequently.",
    "I found the app unnecessarily complex.",
    "I thought the app was easy to use.",
    "I think that I would need the support of a technical person to be able to use this app.",
    "I found the various functions in this app were well integrated.",
    "I thought there was too much inconsistency in this app.",
    "I would imagine that most people would learn to use this app very quickly.",
    "I found the app very awkward to use.",
    "I felt very confident using the app.",
    "I needed to learn a lot of things before I could get going with this app.",
]

ARIAL = "Arial"
H_FILL = PatternFill("solid", fgColor="102E40")
INPUT_FILL = PatternFill("solid", fgColor="FFF4C2")
CALC_FILL = PatternFill("solid", fgColor="EEF3F5")
thin = Side(style="thin", color="C9D6DC")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
F_BODY = Font(name=ARIAL, size=10)
F_BOLD = Font(name=ARIAL, size=10, bold=True)
F_INPUT = Font(name=ARIAL, size=10, color="0000FF")
F_HEAD = Font(name=ARIAL, size=10, bold=True, color="FFFFFF")
F_TITLE = Font(name=ARIAL, size=14, bold=True, color="102E40")
F_NOTE = Font(name=ARIAL, size=9, italic=True, color="526875")
WRAP = Alignment(wrap_text=True, vertical="top")
N = len(PARTICIPANTS)
wb = Workbook()


def header(ws, row, labels, widths):
    for c, label in enumerate(labels, 1):
        cell = ws.cell(row=row, column=c, value=label)
        cell.font, cell.fill, cell.border = F_HEAD, H_FILL, BORDER
        cell.alignment = Alignment(wrap_text=True, vertical="center")
    for c, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(c)].width = w
    ws.row_dimensions[row].height = 32
    ws.freeze_panes = ws.cell(row=row + 1, column=1)


def style(cell, kind, wrap=False):
    cell.border = BORDER
    cell.font = F_INPUT if kind == "input" else F_BODY
    if kind == "input":
        cell.fill = INPUT_FILL
    elif kind == "calc":
        cell.fill = CALC_FILL
    cell.alignment = WRAP if wrap else Alignment(vertical="top")


def validate(ws, rng, **kw):
    dv = DataValidation(allow_blank=True, **kw)
    ws.add_data_validation(dv)
    dv.add(rng)


# README ------------------------------------------------------------------
ws = wb.active
ws.title = "README"
ws.column_dimensions["A"].width = 22
ws.column_dimensions["B"].width = 110
ws["A1"] = "Farshore Phase 3: raw usability test data"
ws["A1"].font = F_TITLE
rows = [
    ("Purpose", "Raw results from moderated usability sessions of the Farshore prototype: task completion, time on task, errors, ease ratings, System Usability Scale (SUS) responses and AI trust answers. Every value comes from a real session with a real participant (Phase 3 brief: AI-generated or simulated users, sessions or data are not permitted)."),
    ("Script", "Instructor template, filled in as Farshore-Usability-Test-Script.docx. Four tasks from the Phase 2 primary flows (F1-F4). T4 leads the participant into an AI error via the mock AI service (mode error-once)."),
    ("Moderator", "Bibek Pathak (solo project)."),
    ("Legend", "Yellow cells with blue text are data entry. Grey cells are formulas; do not type in them. Unused participant rows stay empty and are ignored by every formula."),
    ("Completed?", "Yes / Partly / No / Gave up, as on the template. Success rate counts Yes only; 'incl. partly' adds Partly."),
    ("Time on task", "Seconds from when the participant begins until they say they are done or give up."),
    ("Ease", "After each task: 'How easy or difficult was that, from 1 (very difficult) to 5 (very easy)?' plus why."),
    ("SUS", "Template wording ('app'). Odd items contribute (answer - 1), even items (5 - answer); the sum x 2.5 gives 0-100 (Brooke, 1996). About 68 is average (Sauro, 2011). Grades use the Sauro-Lewis curved scale (Sauro and Lewis, 2016)."),
    ("AI trust", "'On a scale of 1 (not at all) to 5 (completely), how much did you trust the results the app gave you?' plus why, and the template's four perception questions."),
    ("Severity", "Issues sheet: 0 not a problem, 1 cosmetic, 2 minor, 3 major, 4 usability catastrophe. Status: Fixed (before the midterm), Phase 4, or Won't fix."),
    ("Baseline", "Phase 5 repeats these tasks and measures. Do not change the script between participants; note any forced change."),
    ("Privacy", "Participants are identified only by ID. No names, contact details or recordings are stored here."),
]
r = 3
for k, v in rows:
    ws.cell(row=r, column=1, value=k).font = F_BOLD
    c = ws.cell(row=r, column=2, value=v)
    c.font, c.alignment = F_BODY, WRAP
    r += 1
r += 1
ws.cell(row=r, column=1, value="Example rows").font = F_BOLD
ws.cell(row=r, column=2, value="Format only. These are not data and are not counted anywhere.").font = F_NOTE
r += 1
for k, v in [("TaskResults", "P1 | T1 | Yes | 74.2 | 1 | 4 | \"found it once I scrolled\" | | | | | | \"Where's the start button?\""),
             ("TaskResults (T4)", "P1 | T4 | Yes | 41.0 | 0 | 3 | ... | | | yes | pressed Prepare the rival again | yes | \"Oh, it broke, let me retry\""),
             ("SUS", "P1 | 4 | 2 | 4 | 1 | 4 | 2 | 5 | 2 | 4 | 2  (score and grade are calculated)"),
             ("AITrust", "P1 | 4 | \"it explained why\" | ... (one answer per question)"),
             ("Issues", "Start button hidden below the fold | T1, T2 | P1, P3 | 3 | \"Where do I start?\" | Move start above the rival panel | Fixed | B1")]:
    ws.cell(row=r, column=1, value=k).font = F_BODY
    c = ws.cell(row=r, column=2, value=v)
    c.font, c.alignment = F_NOTE, WRAP
    r += 1

# Participants -------------------------------------------------------------
ws = wb.create_sheet("Participants")
labels = ["Participant", "Date and time", "Consent (Y/N)", "Recording permitted (Y/N)", "How often they play games, and what kind", "How they work out what a computer opponent plans", "AI tools / AI characters used before", "Frustrating moment", "What worked best", "Expected but missing", "Notes / top 3 observations"]
header(ws, 1, labels, [11, 15, 10, 11, 30, 30, 30, 30, 30, 30, 40])
validate(ws, f"C2:D{N + 1}", type="list", formula1='"Y,N"')
for i, p in enumerate(PARTICIPANTS, 2):
    style(ws.cell(row=i, column=1, value=p), "body")
    for c in range(2, len(labels) + 1):
        style(ws.cell(row=i, column=c), "input", wrap=c >= 5)

# Tasks --------------------------------------------------------------------
ws = wb.create_sheet("Tasks")
header(ws, 1, ["Task", "Name", "Phase 2 primary flow", "Task wording (read aloud)", "Success criterion"], [7, 26, 32, 70, 48])
for i, t in enumerate(TASKS, 2):
    for c, v in enumerate(t, 1):
        style(ws.cell(row=i, column=c, value=v), "body", wrap=True)
    ws.row_dimensions[i].height = 48

# TaskResults --------------------------------------------------------------
ws = wb.create_sheet("TaskResults")
labels = ["Participant", "Task", "Completed? (Yes/Partly/No/Gave up)", "Time on task (s)", "Errors or wrong turns", "Ease (1-5)", "Ease: why", "T3 game result", "T3 noticed AI Insights unprompted", "T4 noticed something was wrong", "T4 what they did next", "T4 recovered without help", "Quotes and observations",
          "Success (Yes = 1)", "Completed incl. partly", "Completed time (s)"]
header(ws, 1, labels, [11, 7, 13, 10, 9, 8, 28, 10, 12, 12, 28, 12, 50, 10, 11, 11])
last = N * len(TASKS) + 1
validate(ws, f"C2:C{last}", type="list", formula1='"Yes,Partly,No,Gave up"')
validate(ws, f"D2:D{last}", type="decimal", operator="between", formula1="0", formula2="3600")
validate(ws, f"E2:E{last}", type="whole", operator="between", formula1="0", formula2="99")
validate(ws, f"F2:F{last}", type="whole", operator="between", formula1="1", formula2="5")
validate(ws, f"H2:H{last}", type="list", formula1='"won,lost,not finished"')
for col in "IJL":
    validate(ws, f"{col}2:{col}{last}", type="list", formula1='"yes,no"')
row = 2
for p in PARTICIPANTS:
    for t in TASKS:
        style(ws.cell(row=row, column=1, value=p), "body")
        style(ws.cell(row=row, column=2, value=t[0]), "body")
        for c in range(3, 14):
            style(ws.cell(row=row, column=c), "input", wrap=c in (7, 11, 13))
        # Task-specific columns are only used for their task.
        unused = {"T3": (10, 11, 12), "T4": (8, 9)}.get(t[0], (8, 9, 10, 11, 12))
        for c in unused:
            ws.cell(row=row, column=c).fill = PatternFill(None)
        ws.cell(row=row, column=14, value=f'=IF(C{row}="","",IF(C{row}="Yes",1,0))')
        ws.cell(row=row, column=15, value=f'=IF(C{row}="","",IF(OR(C{row}="Yes",C{row}="Partly"),1,0))')
        ws.cell(row=row, column=16, value=f'=IF(AND(O{row}=1,D{row}<>""),D{row},"")')
        for c in (14, 15, 16):
            style(ws.cell(row=row, column=c), "calc")
        row += 1
ws.auto_filter.ref = f"A1:P{last}"

# SUS ----------------------------------------------------------------------
ws = wb.create_sheet("SUS")
header(ws, 1, ["Participant"] + [f"Q{i}" for i in range(1, 11)] + ["Items answered", "SUS score", "Grade (Sauro-Lewis)"], [26] + [6] * 10 + [10, 10, 12])
for i, q in enumerate(SUS_ITEMS, 2):
    ws.cell(row=1, column=i).comment = Comment(q, "Farshore")
validate(ws, f"B2:K{N + 1}", type="whole", operator="between", formula1="1", formula2="5")


def grade(ref):
    cuts = [(84.1, "A+"), (80.8, "A"), (78.9, "A-"), (77.2, "B+"), (74.1, "B"), (72.6, "B-"), (71.1, "C+"), (65, "C"), (62.7, "C-"), (51.7, "D")]
    f = '"F"'
    for cut, g in reversed(cuts):
        f = f'IF({ref}>={cut},"{g}",{f})'
    return f'=IF({ref}="","",{f})'


for i, p in enumerate(PARTICIPANTS, 2):
    style(ws.cell(row=i, column=1, value=p), "body")
    for c in range(2, 12):
        style(ws.cell(row=i, column=c), "input")
    ws.cell(row=i, column=12, value=f"=COUNT(B{i}:K{i})")
    ws.cell(row=i, column=13, value=f'=IF(L{i}=10,((B{i}-1)+(5-C{i})+(D{i}-1)+(5-E{i})+(F{i}-1)+(5-G{i})+(H{i}-1)+(5-I{i})+(J{i}-1)+(5-K{i}))*2.5,"")')
    ws.cell(row=i, column=14, value=grade(f"M{i}"))
    for c in (12, 13, 14):
        style(ws.cell(row=i, column=c), "calc")
    ws.cell(row=i, column=13).number_format = "0.0"
s0 = N + 3
rng = f"M2:M{N + 1}"
stats = [("Complete responses (n)", f"=COUNT({rng})"), ("Mean SUS", f'=IF(COUNT({rng})=0,"",AVERAGE({rng}))'), ("Standard deviation", f'=IF(COUNT({rng})<2,"",STDEV({rng}))'),
         ("Median", f'=IF(COUNT({rng})=0,"",MEDIAN({rng}))'), ("Minimum", f'=IF(COUNT({rng})=0,"",MIN({rng}))'), ("Maximum", f'=IF(COUNT({rng})=0,"",MAX({rng}))'),
         ("Benchmark (average product)", 68), ("Mean minus benchmark", f'=IF(B{s0 + 1}="","",B{s0 + 1}-B{s0 + 6})'), ("Grade of the mean", grade(f"B{s0 + 1}"))]
for k, (label, f) in enumerate(stats):
    ws.cell(row=s0 + k, column=1, value=label).font = F_BOLD
    c = ws.cell(row=s0 + k, column=2, value=f)
    style(c, "input" if label.startswith("Benchmark") else "calc")
    c.number_format = "0.0"
ws.cell(row=s0 + 6, column=3, value="Source: Sauro (2011), average SUS across about 500 studies.").font = F_NOTE

# AITrust ------------------------------------------------------------------
ws = wb.create_sheet("AITrust")
labels = ["Participant", "Trust rating (1-5)", "Why", "How did you know whether a result was good or not?", "When the app had trouble, what did you think had happened?", "Anything you wanted to change about a result but could not?", "Would you use this instead of how you do it today? Why?"]
header(ws, 1, labels, [26, 10, 36, 36, 36, 36, 36])
validate(ws, f"B2:B{N + 1}", type="whole", operator="between", formula1="1", formula2="5")
for i, p in enumerate(PARTICIPANTS, 2):
    style(ws.cell(row=i, column=1, value=p), "body")
    for c in range(2, len(labels) + 1):
        style(ws.cell(row=i, column=c), "input", wrap=c > 2)
t0 = N + 3
col = f"B2:B{N + 1}"
for k, (label, f, fmt) in enumerate([("Responses (n)", f"=COUNT({col})", "0"), ("Mean trust", f'=IF(COUNT({col})=0,"",AVERAGE({col}))', "0.00"),
                                     ("Median trust", f'=IF(COUNT({col})=0,"",MEDIAN({col}))', "0.0"), ("Share rating 4 or 5", f'=IF(COUNT({col})=0,"",COUNTIF({col},">=4")/COUNT({col}))', "0%")]):
    ws.cell(row=t0 + k, column=1, value=label).font = F_BOLD
    c = ws.cell(row=t0 + k, column=2, value=f)
    style(c, "calc")
    c.number_format = fmt

# Summary ------------------------------------------------------------------
ws = wb.create_sheet("Summary", 1)
ws["A1"] = "Results by task (calculated from TaskResults; nothing to type here)"
ws["A1"].font = F_TITLE
labels = ["Task", "Name", "Attempts (n)", "Yes", "Partly", "No", "Gave up", "Success rate (Yes)", "Completed incl. partly",
          "Median completed time (s)", "Mean completed time (s)", "Min (s)", "Max (s)", "Mean errors", "Mean ease (1-5)"]
for c, label in enumerate(labels, 1):
    cell = ws.cell(row=3, column=c, value=label)
    cell.font, cell.fill, cell.border = F_HEAD, H_FILL, BORDER
    cell.alignment = Alignment(wrap_text=True, vertical="center")
ws.row_dimensions[3].height = 42
for c, w in enumerate([32, 26, 9, 7, 7, 7, 8, 10, 11, 11, 11, 9, 9, 9, 9], 1):
    ws.column_dimensions[get_column_letter(c)].width = w
TR = "TaskResults!"
B, C, D, E, F, M = (f"{TR}${x}$2:${x}${last}" for x in "BCDEFP")
for i, t in enumerate(TASKS, 4):
    a = f"$A{i}"
    has_time = f'COUNTIFS({B},{a},{M},">=0")'
    vals = [t[0], t[1], f'=COUNTIFS({B},{a},{C},"<>")',
            f'=COUNTIFS({B},{a},{C},"Yes")', f'=COUNTIFS({B},{a},{C},"Partly")', f'=COUNTIFS({B},{a},{C},"No")', f'=COUNTIFS({B},{a},{C},"Gave up")',
            f'=IF(C{i}=0,"",D{i}/C{i})', f'=IF(C{i}=0,"",(D{i}+E{i})/C{i})', None,
            f'=IF({has_time}=0,"",AVERAGEIFS({M},{B},{a},{M},">=0"))',
            f'=IF({has_time}=0,"",_xlfn.MINIFS({M},{B},{a},{M},">=0"))',
            f'=IF({has_time}=0,"",_xlfn.MAXIFS({M},{B},{a},{M},">=0"))',
            f'=IF(C{i}=0,"",AVERAGEIFS({E},{B},{a},{C},"<>"))',
            f'=IF(COUNTIFS({B},{a},{F},">=1")=0,"",AVERAGEIFS({F},{B},{a},{F},">=1"))']
    for c, v in enumerate(vals, 1):
        style(ws.cell(row=i, column=c, value=v), "body" if c <= 2 else "calc")
    ws[f"J{i}"] = ArrayFormula(f"J{i}", f'=IF({has_time}=0,"",MEDIAN(IF(({B}={a})*ISNUMBER({M}),{M})))')
    style(ws[f"J{i}"], "calc")
    for c in (8, 9):
        ws.cell(row=i, column=c).number_format = "0%"
    for c in (10, 11, 12, 13, 14, 15):
        ws.cell(row=i, column=c).number_format = "0.0"
o = 4 + len(TASKS) + 1
ws.cell(row=o, column=1, value="Overall").font = Font(name=ARIAL, size=11, bold=True)
tasks_end = 3 + len(TASKS)


def yes_share(col, task):
    rng = f"{TR}${col}$2:${col}${last}"
    return f'=IF(COUNTIFS({B},"{task}",{rng},"<>")=0,"",COUNTIFS({B},"{task}",{rng},"yes")/COUNTIFS({B},"{task}",{rng},"<>"))'


overall = [
    ("Participants with any task data", f'=SUMPRODUCT((Participants!$A$2:$A${N + 1}<>"")*(COUNTIFS({C},"<>",{TR}$A$2:$A${last},Participants!$A$2:$A${N + 1})>0))', "0"),
    ("Task attempts", f"=SUM(C4:C{tasks_end})", "0"),
    ("Success rate, all tasks (Yes)", f'=IF(B{o + 2}=0,"",SUM(D4:D{tasks_end})/B{o + 2})', "0%"),
    ("Completed incl. partly, all tasks", f'=IF(B{o + 2}=0,"",(SUM(D4:D{tasks_end})+SUM(E4:E{tasks_end}))/B{o + 2})', "0%"),
    ("Mean SUS", f"=SUS!B{s0 + 1}", "0.0"),
    ("SUS standard deviation", f"=SUS!B{s0 + 2}", "0.0"),
    ("SUS grade of the mean", f"=SUS!B{s0 + 8}", "@"),
    ("Mean AI trust (1-5)", f"=AITrust!B{t0 + 1}", "0.00"),
    ("T3: noticed AI Insights unprompted", yes_share("I", "T3"), "0%"),
    ("T4: noticed the AI problem", yes_share("J", "T4"), "0%"),
    ("T4: recovered without help", yes_share("L", "T4"), "0%"),
]
for k, (label, f, fmt) in enumerate(overall, 1):
    ws.cell(row=o + k, column=1, value=label).font = F_BODY
    c = ws.cell(row=o + k, column=2, value=f)
    style(c, "calc")
    c.number_format = fmt
ws.cell(row=o + len(overall) + 2, column=1, value="Completed time counts Yes and Partly attempts with a recorded time. Medians are used because small samples of task times are skewed.").font = F_NOTE

# Issues -------------------------------------------------------------------
ws = wb.create_sheet("Issues")
header(ws, 1, ["#", "Issue observed", "Task(s)", "Participants affected", "Count", "Severity (0-4)", "Evidence or quote", "Change / plan", "Status", "Change ID"], [5, 44, 9, 16, 7, 9, 40, 40, 11, 9])
validate(ws, "F2:F41", type="whole", operator="between", formula1="0", formula2="4")
validate(ws, "I2:I41", type="list", formula1='"Fixed,Phase 4,Won\'t fix"')
for i in range(2, 42):
    style(ws.cell(row=i, column=1, value=f'=IF(B{i}="","",ROW()-1)'), "calc")
    for c in (2, 3, 4, 6, 7, 8, 9, 10):
        style(ws.cell(row=i, column=c), "input", wrap=True)
    style(ws.cell(row=i, column=5, value=f'=IF(D{i}="","",LEN(D{i})-LEN(SUBSTITUTE(D{i},"P","")))'), "calc")

wb.save(OUT)
print("wrote", OUT)
