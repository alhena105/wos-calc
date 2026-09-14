# data.xlsx(Ton 시트 오프라인 사본) → tools/sim/out/xlsx/*.tsv
#   python tools/sim/xlsx2tsv.py [data.xlsx]     (pip install openpyxl)
import openpyxl, sys, re, os
src = sys.argv[1] if len(sys.argv) > 1 else "data.xlsx"
out = os.path.join(os.path.dirname(__file__), "out", "xlsx"); os.makedirs(out, exist_ok=True)
wb = openpyxl.load_workbook(src, data_only=True)
for ws in wb.worksheets:
    name = re.sub(r"[^A-Za-z0-9]+", "_", ws.title).strip("_")
    rows = []
    for r in ws.iter_rows(values_only=True):
        if all(v is None for v in r): continue
        rows.append(["" if v is None else str(v).replace("
", " / ") for v in r])
    with open(os.path.join(out, name + ".tsv"), "w", encoding="utf-8") as f:
        for r in rows: f.write("	".join(r).rstrip("	") + "
")
    print(name, len(rows))
