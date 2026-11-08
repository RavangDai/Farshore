"""Fill the instructor's Usability_Test_Script_Template.docx with Farshore's Phase 3 script.

Usage: python scripts/coursework/phase3-fill-template.py <unpacked-template-dir>
Edits word/document.xml in place (unzip the template first, re-zip afterwards). The
template has three task blocks; Task 2's block is duplicated for the extra task, so
the AI failure task becomes Task 4. Per-session blanks (participant, results, SUS
answers) are left for the moderator.
"""
import re, sys
from pathlib import Path
from xml.sax.saxutils import escape

doc = Path(sys.argv[1]) / "word/document.xml"
x = doc.read_text(encoding="utf-8")

TASKS = {
    1: dict(flow="F1 Start or resume and learn a trial",
            wording="You've heard about a game where you travel home with Odysseus, and you've just opened it for the first time. Start a new journey and get ready for the first challenge.",
            success="The Land of the Lotus-Eaters briefing is on screen (it shows \"YOUR OBJECTIVE\")."),
    2: dict(flow="F2 Prepare, review and accept a model strategy",
            wording="Before you face your first opponent, you want to know what you're up against. Find out what your opponent plans to do in this challenge, and who or what decided that plan.",
            success="Paraphrases the strategy in the rival panel AND says the AI model chose it (\"Strategy chosen by qwen3:4b-instruct\")."),
    3: dict(flow="F3 Play against an active mythic rival",
            wording="A friend told you the Cyclops' Cave is the toughest island, and that you can see how the Cyclops thinks. Play it, and while you play, tell me why the Cyclops made one of his moves, using what the game shows you.",
            success="Cites a reason or action from the AI Insights (or AI Lab) panel for a specific throw.",
            setup="Moderator setup before reading the task (untimed): Settings > Unlock all islands, close Settings, open the Voyage map. Say: \"I've unlocked another island to save time.\""),
}
AI_TASK = dict(flow="F4 Recover from a failed or unsuitable AI plan",
               wording="You'd like to try a different island. Open the Island of Aeolus and get ready to play it.",
               does="Error. The mock AI service (mode error-once) fails the first strategy request, so the briefing shows \"The rival is not ready\" with \"Prepare the rival again\". The retry succeeds.",
               setup="Moderator setup before reading the task: in a second tab of the same browser window open http://localhost:3000/api/ai-mock?mode=error-once, then close that tab (after the session, open ...?mode=off). Success = they get back to a ready rival (start button reads \"...counts toward your voyage\") without help.")
BLANK = "____________________________________________"


def t(text):
    return f'<w:t xml:space="preserve">{escape(text)}</w:t>'


def fill_after_label(block, label, text):
    """In a two-column table, put text in the cell after the cell whose text is `label`."""
    i = block.find(f">{escape(label)}</w:t>")
    assert i > 0, label
    j = re.compile(r"<w:t(?=[ >])").search(block, i + 10).start()  # not <w:tc>, <w:tcPr> ...
    start, end = block.find(">", j) + 1, block.find("</w:t>", j)
    return block[:start] + escape(text) + block[end:]


def note_para(text):
    return f'<w:p><w:pPr><w:spacing w:after="100"/></w:pPr><w:r><w:rPr><w:i/><w:iCs/></w:rPr>{t(text)}</w:r></w:p>'


# Session information and warm-up questions
for label, value in [("Team / app name", "Farshore (solo project, Bibek Pathak)"),
                     ("Moderator / Note-taker", "Bibek Pathak (moderator and note-taker)"),
                     ("Build or prototype version tested", "Farshore 3.0.0, Nov 5 2026 build, run locally; Tasks 1-3 use Qwen3-4B-Instruct via Ollama, Task 4 uses the mock AI service")]:
    x = fill_after_label(x, label, value)
x = x.replace("This will take about [__] minutes.", "This will take about 20 minutes.")
for old, new in [("How often do you [do the activity our app supports]? ", "How often do you play video games, and what kind? "),
                 ("How do you do it today, without our app? ", "When you play against a computer opponent, how do you work out what it is planning? "),
                 ("Have you used AI tools for anything like this before? ", "Have you used AI tools (such as ChatGPT) or played games with AI-driven characters before? ")]:
    assert old in x, old
    x = x.replace(old, new)

# Task blocks: heading paragraph .. "After the task" paragraph (Tasks 1 and 2 in the template).
def task_block(xml, n):
    heading = xml.find(f"Task {n} ")
    start = max(xml.rfind("<w:p>", 0, heading), xml.rfind("<w:p ", 0, heading))
    after = xml.find("After the task, ask:", start)
    end = xml.find("</w:p>", after) + len("</w:p>")
    return start, end


def fill_task(block, n, spec):
    block = block.replace(f"Task {n} – from primary flow: {BLANK}", f"Task {n} – from primary flow: {spec['flow']}")
    block = block.replace(f"Task {n} — from primary flow: {BLANK}", f"Task {n} — from primary flow: {spec['flow']}")
    block = fill_after_label(block, "Task wording (read aloud)", spec["wording"])
    block = fill_after_label(block, "Success criterion (what counts as done)", spec["success"])
    return block


s2, e2 = task_block(x, 2)
original2 = x[s2:e2]
task3 = original2.replace("Task 2 ", "Task 3 ", 1)
task3 = fill_task(task3, 3, TASKS[3])
heading_end = task3.find("</w:p>") + len("</w:p>")
task3 = task3[:heading_end] + note_para(TASKS[3]["setup"]) + task3[heading_end:]
x = x[:s2] + fill_task(original2, 2, TASKS[2]) + task3 + x[e2:]
s1, e1 = task_block(x, 1)
x = x[:s1] + fill_task(x[s1:e1], 1, TASKS[1]) + x[e1:]

# The template's AI failure task becomes Task 4.
ai = re.search(r"Task 3 .{1,3} the AI failure or low-confidence task", x)
assert ai, "AI task heading"
x = x[:ai.start()] + f"Task 4 – the AI failure task (from primary flow: {AI_TASK['flow']})" + x[ai.end():]
intro = x.find("Trigger it with your mock service, and do not warn them in advance.</w:t></w:r></w:p>")
assert intro > 0
cut = intro + len("Trigger it with your mock service, and do not warn them in advance.</w:t></w:r></w:p>")
x = x[:cut] + note_para(AI_TASK["setup"]) + x[cut:]
tail = x[cut:]
tail = fill_after_label(tail, "Task wording (read aloud)", AI_TASK["wording"])
tail = fill_after_label(tail, "What the AI does (error / low confidence / poor result)", AI_TASK["does"])
x = x[:cut] + tail

doc.write_text(x, encoding="utf-8")
print("filled", doc)
