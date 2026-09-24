"""Review dashboard: each task supplies a manifest of documents, page images and located fields; reviewers record field verdicts."""
import csv
import hashlib
import io
import json
import math
import re
import sqlite3
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from flask import Flask, abort, jsonify, redirect, render_template, request, send_from_directory, url_for

ROOT = Path(__file__).parent
TASKS = ROOT / "tasks"
RANDOM_N = 60
app = Flask(__name__)
DDL = """CREATE TABLE IF NOT EXISTS verdicts (task TEXT, doc_id TEXT, field_id TEXT, verdict TEXT, correction TEXT, ts TEXT,
    PRIMARY KEY (task, doc_id, field_id))"""


def db():
    con = sqlite3.connect(ROOT / "review.db")
    con.row_factory = sqlite3.Row
    con.execute(DDL)
    return con


def load(task):
    d = TASKS / task
    if not (d / "manifest.jsonl").exists():
        abort(404)
    meta = json.loads((d / "task.json").read_text()) if (d / "task.json").exists() else {"name": task, "title": task}
    docs = [json.loads(l) for l in (d / "manifest.jsonl").read_text().splitlines() if l.strip()]
    return meta, docs


def queues(task, docs):
    """Random queue is a seeded shuffle so it is stable across runs; targeted queue is every flagged document, most flags first."""
    rnd = sorted(docs, key=lambda x: hashlib.sha1(f"{task}:{x['doc_id']}".encode()).hexdigest())[:RANDOM_N]
    tgt = sorted((x for x in docs if x["flags"]), key=lambda x: -len(x["flags"]))
    return {"random": rnd, "targeted": tgt}


def flag_kind(flag):
    """Collapse a flag sentence to its kind: counts, names and years stripped."""
    f = re.sub(r"^\d[\d,]*\s+", "", flag)
    f = re.sub(r"\s+\d{4}$", "", f)
    if ":" in f:
        head, tail = f.split(":", 1)
        f = tail.strip() if "%" in tail else head.strip()
    return f


def wilson_upper(errors, n, z=1.96):
    if not n:
        return None
    p = errors / n
    return (p + z * z / (2 * n) + z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n)


def stats(task, docs):
    con = db()
    v = defaultdict(dict)
    for r in con.execute("SELECT doc_id, field_id, verdict FROM verdicts WHERE task=?", (task,)):
        v[r["doc_id"]][r["field_id"]] = r["verdict"]
    by_type = defaultdict(lambda: [0, 0])
    done, wrong_docs = set(), set()
    for d in docs:
        live = [f for f in d["fields"] if f["value"] not in (None, "") and f.get("type") != "note"]
        vs = v.get(d["doc_id"], {})
        if live and all(f["id"] in vs for f in live):
            done.add(d["doc_id"])
        for f in live:
            if f["id"] in vs:
                by_type[f["type"]][0] += 1
                if vs[f["id"]] == "wrong":
                    by_type[f["type"]][1] += 1
                    wrong_docs.add(d["doc_id"])
    q = queues(task, docs)
    rnd_done = [d["doc_id"] for d in q["random"] if d["doc_id"] in done]
    rnd_wrong = [x for x in rnd_done if x in wrong_docs]
    groups = defaultdict(list)
    for d in q["targeted"]:
        for k in dict.fromkeys(flag_kind(f) for f in d["flags"]):
            groups[k].append(d)
    groups = dict(sorted(groups.items(), key=lambda kv: -len(kv[1])))
    return {"docs": len(docs), "done": done, "wrong_docs": wrong_docs, "by_type": dict(by_type), "verdicts": v,
            "random_n": len(rnd_done), "random_errors": len(rnd_wrong), "bound": wilson_upper(len(rnd_wrong), len(rnd_done)),
            "targeted_n": sum(d["doc_id"] in done for d in q["targeted"]), "targeted_total": len(q["targeted"]), "queues": q,
            "groups": groups, "next": {k: next((d["doc_id"] for d in q[k] if d["doc_id"] not in done), None) for k in q}}


def ledger(doc):
    """Group fields into sections and rows so one holder is reviewed as one line."""
    secs = {}
    for f in doc["fields"]:
        key = f["id"] if f.get("row") is None else f["row"]
        secs.setdefault(f.get("section", "Report"), {}).setdefault(key, []).append(f)
    return [(name, list(rows.values())) for name, rows in secs.items()]


@app.route("/")
def index():
    tasks = []
    for d in sorted(TASKS.iterdir()) if TASKS.exists() else []:
        if (d / "manifest.jsonl").exists():
            meta, docs = load(d.name)
            tasks.append((meta, stats(d.name, docs)))
    return render_template("index.html", tasks=tasks)


@app.route("/t/<task>")
def task_page(task):
    meta, docs = load(task)
    s = stats(task, docs)
    return render_template("task.html", meta=meta, s=s, wilson=wilson_upper)


@app.route("/t/<task>/d/<doc_id>")
def doc_page(task, doc_id):
    meta, docs = load(task)
    doc = next((d for d in docs if d["doc_id"] == doc_id), None) or abort(404)
    s = stats(task, docs)
    q = request.args.get("q", "random")
    order = [d["doc_id"] for d in s["queues"].get(q, [])]
    nxt = next((x for x in order[order.index(doc_id) + 1:] if x not in s["done"]), None) if doc_id in order else None
    con = db()
    verdicts = {r["field_id"]: dict(r) for r in con.execute("SELECT * FROM verdicts WHERE task=? AND doc_id=?", (task, doc_id))}
    return render_template("doc.html", meta=meta, doc=doc, ledger=ledger(doc), verdicts=verdicts, q=q, nxt=nxt, s=s,
                           position=order.index(doc_id) + 1 if doc_id in order else None, total=len(order))


@app.route("/t/<task>/d/<doc_id>/verdict", methods=["POST"])
def verdict(task, doc_id):
    body = request.get_json()
    con = db()
    rows = body if isinstance(body, list) else [body]
    for b in rows:
        con.execute("INSERT OR REPLACE INTO verdicts VALUES (?,?,?,?,?,?)",
                    (task, doc_id, b["field_id"], b["verdict"], b.get("correction"), datetime.now().isoformat(timespec="seconds")))
    con.commit()
    return jsonify(ok=True)


@app.route("/t/<task>/corrections.csv")
def corrections(task):
    con = db()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["doc_id", "field_id", "verdict", "correction", "ts"])
    for r in con.execute("SELECT doc_id, field_id, verdict, correction, ts FROM verdicts WHERE task=? ORDER BY ts", (task,)):
        w.writerow(tuple(r))
    return out.getvalue(), {"Content-Type": "text/csv", "Content-Disposition": f"attachment; filename={task}-verdicts.csv"}


@app.route("/media/<task>/<path:name>")
def media(task, name):
    return send_from_directory(TASKS / task / "pages", name)


if __name__ == "__main__":
    app.run(debug=True, port=5001)
