"""Load session-logger exports (P#.json) into the Phase 3 test data workbook.

Usage: python scripts/coursework/phase3-import.py <data-dir> <workbook.xlsx>
Writes only the yellow input cells, for each participant ID found in the JSON.
Recalculate afterwards: powershell -File scripts/coursework/phase3-recalc.ps1 <workbook.xlsx>
"""
import json, sys
from pathlib import Path
from openpyxl import load_workbook

data_dir, book = Path(sys.argv[1]), Path(sys.argv[2])
wb = load_workbook(book)
records = sorted((json.loads(p.read_text(encoding="utf-8")) for p in data_dir.glob("P*.json")), key=lambda r: int(r["pid"][1:]))
if not records:
    sys.exit(f"No P#.json exports in {data_dir}")
OUTCOMES = {"Yes", "Partly", "No", "Gave up"}


def row_of(ws, pid, task=None):
    for r in range(2, ws.max_row + 1):
        if ws.cell(r, 1).value == pid and (task is None or ws.cell(r, 2).value == task):
            return r
    raise SystemExit(f"{ws.title}: no row for {pid} {task or ''}. The workbook has rows for P1-P8.")


def put(ws, r, c, v):
    ws.cell(r, c).value = v if v not in ("", None) else None


problems = []
for rec in records:
    pid = rec["pid"]
    if not rec.get("consent"):
        problems.append(f"{pid}: consent not recorded")
    w, d = rec.get("warmup", {}), rec.get("debrief", {})
    ws = wb["Participants"]; r = row_of(ws, pid)
    notes = " | ".join(v for v in (d.get("notes"), d.get("observations")) if v)
    for c, v in enumerate([rec.get("date"), "Y" if rec.get("consent") else "N", "Y" if rec.get("recording") else "N",
                           w.get("often"), w.get("today"), w.get("aiTools"), d.get("frustrating"), d.get("worked"), d.get("expected"), notes], 2):
        put(ws, r, c, v)
    ws = wb["TaskResults"]
    for task, t in rec["tasks"].items():
        r = row_of(ws, pid, task)
        done = t.get("outcome")
        if done not in OUTCOMES:
            problems.append(f"{pid} {task}: no completion outcome")
        x = t.get("extra", {})
        put(ws, r, 3, done)
        put(ws, r, 4, t.get("seconds") if done and t.get("seconds") else None)
        put(ws, r, 5, t.get("errors", 0) if done else None)
        put(ws, r, 6, t.get("ease"))
        put(ws, r, 7, t.get("easeWhy"))
        if task == "T3":
            put(ws, r, 8, x.get("gameOutcome")); put(ws, r, 9, x.get("noticedInsights"))
        if task == "T4":
            put(ws, r, 10, x.get("noticed")); put(ws, r, 11, x.get("didNext")); put(ws, r, 12, x.get("recovered"))
            if not x.get("noticed") or not x.get("recovered"):
                problems.append(f"{pid} T4: noticed/recovered not recorded")
        put(ws, r, 13, t.get("notes"))
        if done and t.get("ease") is None:
            problems.append(f"{pid} {task}: ease rating missing")
    ws = wb["SUS"]; r = row_of(ws, pid)
    sus = rec.get("sus", [])
    for c in range(10):
        v = sus[c] if c < len(sus) else None
        if v is not None and not 1 <= v <= 5:
            problems.append(f"{pid} SUS item {c + 1}: {v} out of range")
        put(ws, r, c + 2, v)
    if sum(v is not None for v in sus[:10]) < 10:
        problems.append(f"{pid}: SUS incomplete")
    trust = rec.get("trust", {})
    ws = wb["AITrust"]; r = row_of(ws, pid)
    for c, v in enumerate([rec.get("trustRating"), trust.get("why"), trust.get("knewGood"), trust.get("trouble"), trust.get("wantedChange"), trust.get("useInstead")], 2):
        put(ws, r, c, v)
    if rec.get("trustRating") is None:
        problems.append(f"{pid}: AI trust rating missing")

wb.save(book)
print(f"Imported {len(records)} participant(s): {', '.join(r['pid'] for r in records)}")
for p in problems:
    print("CHECK:", p)
