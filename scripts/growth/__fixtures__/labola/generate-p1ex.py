"""P1拡張ライト用の架空Shift_JIS(CP932) CSVを生成する。実行は python3 generate-p1ex.py。"""
import csv
from pathlib import Path

ROOT = Path(__file__).parent

def write_csv(name, header, rows):
    with (ROOT / name).open("w", encoding="cp932", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(header)
        writer.writerows(rows)

write_csv("program_sjis.csv", ["名称", "カテゴリ", "スポーツ", "開催日", "開始時間", "終了時間", "募集数", "ステータス", "公開ステータス"], [
    ["はじめてクラス", "スクール", "ピックルボール", "2026/07/17", "10:00", "11:00", "6", "受付中", "公開"],
    ["交流イベント", "イベント", "ピックルボール", "2026/07/20", "18:00", "20:00", "12", "受付中", "公開"],
])
write_csv("blocked_sjis.csv", ["日付", "開始時間", "終了時間", "スペース", "予約名", "予約色", "備考"], [
    ["2026/07/17", "05:00", "07:00", "Court A", "清掃", "", ""],
    ["2026/07/18", "12:00", "13:00", "None", "補助", "", ""],
])
