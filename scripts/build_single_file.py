"""Bundle web/ into one self-contained HTML page for sharing (dist/platewise.html).

The app is split into several files so three people can work without stepping
on each other. Some hosts (like a Claude Artifact) want a single page, so this
inlines the CSS and JS. The sample data stays beside it as data/sample_events.json.

Run:  python scripts/build_single_file.py
"""
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB, DIST = ROOT / "web", ROOT / "dist"


def main() -> None:
    html = (WEB / "index.html").read_text()
    html = html.replace(
        '<link rel="stylesheet" href="css/styles.css">',
        "<style>\n" + (WEB / "css" / "styles.css").read_text() + "</style>",
    )
    html = re.sub(
        r'<script src="(js/[\w.]+)"></script>',
        lambda m: "<script>\n" + (WEB / m.group(1)).read_text() + "</script>",
        html,
    )
    (DIST / "data").mkdir(parents=True, exist_ok=True)
    (DIST / "platewise.html").write_text(html)
    shutil.copy(WEB / "data" / "sample_events.json", DIST / "data" / "sample_events.json")
    print("wrote dist/platewise.html")


if __name__ == "__main__":
    main()
