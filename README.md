# scrape-review

Side-by-side review dashboard for scraped data. Each task supplies documents, page images and the fields extracted from them; a reviewer marks fields correct or wrong and the dashboard turns those verdicts into an error-rate bound, so confidence in the unreviewed remainder is a number rather than a feeling.

```
uv sync
uv run python app.py          # http://127.0.0.1:5001
```

## How it builds comfort

- **Random queue**: a seeded sample of 60 documents, stable across runs. Zero errors in n reviews bounds the document error rate at about 3/n with 95% confidence: 30 gives under 10%, 60 under 5%, 300 under 1%. The page shows the live Wilson bound.
- **Targeted queue**: every document carrying a risk flag from the exporter (thin text layer, values not found on the page, tables that overflow, arithmetic that does not reconcile). If the worst cases hold, the rest almost certainly do.
- **Field-level verdicts** with optional corrections, keyboard driven (j/k move, y correct, x wrong, a accept all remaining, n next). Per-field-type accuracy is reported and verdicts export as CSV for feeding back into the task.
- **Source in view**: the extracted value's bounding box is drawn on the page image, and clicking a field scrolls to it. Values the exporter could not locate are shown in grey so the reviewer checks them against the image. The original filing is one click away.

## Adding a task

Create `tasks/<name>/task.json` (`name`, `title`, `description`), `tasks/<name>/pages/*.png`, and `tasks/<name>/manifest.jsonl` with one record per document:

```json
{"doc_id": "...", "title": "...", "subtitle": "...", "source_url": "https://...",
 "pages": ["doc-0.png", "doc-1.png"],
 "fields": [{"id": "sh.0.shares", "label": "shares", "value": 119109046, "type": "int", "page": 1, "bbox": [0.51, 0.19, 0.58, 0.21]}],
 "flags": ["thin text layer"], "strata": {"symbol": "WTC"}}
```

`bbox` is optional and in fractions of the page. `type` is one of `text`, `int`, `pct`, `date`. The dashboard knows nothing about the domain; `asx-substantial-holders/review_export.py` is the reference exporter.
