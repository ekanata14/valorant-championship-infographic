#!/usr/bin/env python3
"""Bangun data juara turnamen dari skor pertandingan.

Input:
  - dataset/all_matches_games_ids.csv
  - dataset/kaggle/vct_<tahun>/matches/scores.csv
  - data.json (kamus tim, turnamen, region)
Output:
  - src/winners.json
"""

import argparse
import csv
import json
import os
import sys
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(BASE)
MATCHES = os.path.join(ROOT, "dataset", "all_matches_games_ids.csv")
DATA = os.path.join(BASE, "data.json")
OUT = os.path.join(BASE, "src", "winners.json")

# Event internasional VCT (Champions + Masters). Nama persis dari dataset.
MAJORS = {
    "Valorant Champions 2021",
    "Valorant Champions 2022",
    "Valorant Champions 2023",
    "Valorant Champions 2024",
    "Valorant Champions 2025",
    "Valorant Champions Tour Stage 2: Masters Reykjavík",
    "Valorant Champions Tour Stage 3: Masters Berlin",
    "Valorant Champions Tour Stage 1: Masters Reykjavík",
    "Valorant Champions Tour Stage 2: Masters Copenhagen",
    "Champions Tour 2023: Masters Tokyo",
    "Champions Tour 2024: Masters Madrid",
    "Champions Tour 2024: Masters Shanghai",
    "Valorant Masters Bangkok 2025",
    "Valorant Masters Toronto 2025",
    "Valorant Masters Santiago 2026",
    "Valorant Masters London 2026",
}

B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def enc(n, width):
    out = ""
    for _ in range(width):
        out = B36[n % 36] + out
        n //= 36
    return out


def tier_of(name, year):
    if name in MAJORS:
        return "major"
    if name.startswith("VCT ") or name.startswith("Champions Tour"):
        return "vct"
    return "other"


def final_rank(match_type):
    t = match_type.strip().lower()
    if "grand final" in t:
        return 2
    if t in ("final", "finals"):
        return 1
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--scores-root",
        default=os.path.join(ROOT, "dataset", "kaggle"),
        help="folder berisi vct_2021/.../matches/scores.csv",
    )
    args = ap.parse_args()
    scores_root = os.path.abspath(args.scores_root)

    with open(DATA, encoding="utf-8") as fh:
        data = json.load(fh)
    team_names = data["filters"]["teams"]
    team_index = {t: i for i, t in enumerate(team_names)}
    tournament_names = data["filters"]["tournaments"]
    tour_index = {t: i for i, t in enumerate(tournament_names)}
    region_names = data["filters"]["regions"]
    tour_region = data["filters"]["tournamentRegion"]

    # --- laga unik, urutan sama seperti aggregate.py ---
    with open(MATCHES, newline="", encoding="utf-8-sig") as fh:
        rows = [r for r in csv.DictReader(fh) if r["Map"].strip() not in ("", "TBD")]

    match_order = {}
    for r in rows:
        mid = r["Match ID"]
        if mid in match_order:
            continue
        pair = [t.strip().strip('"') for t in r["Match Name"].split(" vs ")]
        match_order[mid] = {
            "tour": r["Tournament"],
            "stage": r["Stage"],
            "type": r["Match Type"],
            "name": r["Match Name"],
            "year": int(r["Year"]),
            "teamA": pair[0] if len(pair) == 2 else "",
            "teamB": pair[1] if len(pair) == 2 else "",
        }
    match_ids = sorted(match_order, key=int)
    match_index = {mid: i for i, mid in enumerate(match_ids)}

    # --- skor per laga ---
    scores = {}
    score_rows = 0
    for year in range(2021, 2027):
        path = os.path.join(scores_root, f"vct_{year}", "matches", "scores.csv")
        if not os.path.exists(path):
            print(f"PERINGATAN: {path} tidak ada", file=sys.stderr)
            continue
        with open(path, newline="", encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                key = (r["Tournament"], r["Stage"], r["Match Type"], r["Match Name"])
                try:
                    a = int((r.get("Team A Score") or "").strip() or -1)
                    b = int((r.get("Team B Score") or "").strip() or -1)
                except ValueError:
                    a = b = -1
                scores[key] = {
                    "a": a,
                    "b": b,
                    "result": (r.get("Match Result") or "").strip(),
                    "teamA": (r.get("Team A") or "").strip(),
                    "teamB": (r.get("Team B") or "").strip(),
                }
                score_rows += 1

    result_chars = []
    score_chars = []
    matched_scores = 0
    for mid in match_ids:
        info = match_order[mid]
        key = (info["tour"], info["stage"], info["type"], info["name"])
        s = scores.get(key)
        if not s:
            result_chars.append("2")
            score_chars.append("zz")
            continue
        matched_scores += 1
        a, b = s["a"], s["b"]
        if a >= 0 and b >= 0:
            winner = "0" if a > b else "1" if b > a else "2"
            score_chars.append(enc(min(a, 35), 1) + enc(min(b, 35), 1))
        else:
            res = s["result"].lower()
            if res and info["teamA"].lower() in res:
                winner = "0"
            elif res and info["teamB"].lower() in res:
                winner = "1"
            else:
                winner = "2"
            score_chars.append("zz")
        result_chars.append(winner)

    # --- kumpulan laga per turnamen ---
    by_tour = defaultdict(list)
    for mid in match_ids:
        by_tour[match_order[mid]["tour"]].append(match_index[mid])

    tournaments = []
    for name in tournament_names:
        ids = by_tour.get(name, [])
        year = match_order[match_ids[ids[0]]]["year"] if ids else None
        tier = tier_of(name, year or 0)
        region = (
            "International"
            if tier == "major"
            else region_names[int(tour_region[tour_index[name]])]
        )

        candidates = []
        for mi in ids:
            mid = match_ids[mi]
            info = match_order[mid]
            rank = final_rank(info["type"])
            if rank:
                candidates.append((rank, int(mid), mi))

        final_mi = None
        confidence = "none"
        if candidates:
            candidates.sort(reverse=True)
            final_mi = candidates[0][2]
            confidence = "high" if candidates[0][0] == 2 else "medium"
        elif ids:
            final_mi = max(ids, key=lambda mi: int(match_ids[mi]))
            confidence = "low"

        winner = runner = None
        score = None
        stage = None
        third = []
        third_label = None
        if final_mi is not None:
            mid = match_ids[final_mi]
            info = match_order[mid]
            stage = info["stage"]
            s = scores.get((info["tour"], info["stage"], info["type"], info["name"]))
            if s:
                a, b = s["a"], s["b"]
                side = None
                if a >= 0 and b >= 0:
                    side = 0 if a > b else 1 if b > a else None
                    score = [max(a, b), min(a, b)]
                elif s["result"]:
                    res = s["result"].lower()
                    if info["teamA"].lower() in res:
                        side = 0
                    elif info["teamB"].lower() in res:
                        side = 1
                if side is not None:
                    # pakai nama tim dari laga (kanonik), bukan alias dari overview/skor
                    ta = info["teamA"]
                    tb = info["teamB"]
                    winner = team_index.get(ta if side == 0 else tb)
                    runner = team_index.get(tb if side == 0 else ta)
                    if winner is None:
                        confidence = "low"

        # juara 3: loser Lower Final (double elim) atau kedua loser Semifinal
        if final_mi is not None and stage is not None:
            stage_ids = [
                mi for mi in ids
                if match_order[match_ids[mi]]["stage"] == stage
            ]

            def loser_of(mi):
                info = match_order[match_ids[mi]]
                s = scores.get((info["tour"], info["stage"], info["type"], info["name"]))
                if not s:
                    return None
                side = None
                if s["a"] is not None and s["b"] is not None:
                    side = 0 if s["a"] > s["b"] else 1 if s["b"] > s["a"] else None
                elif s["result"]:
                    res = s["result"].lower()
                    if info["teamA"].lower() in res:
                        side = 0
                    elif info["teamB"].lower() in res:
                        side = 1
                if side is None:
                    return None
                loser_name = info["teamB"] if side == 0 else info["teamA"]
                return team_index.get(loser_name)

            lower = [
                mi for mi in stage_ids
                if match_order[match_ids[mi]]["type"].strip().lower() == "lower final"
            ]
            semis = [
                mi for mi in stage_ids
                if "semifinal" in match_order[match_ids[mi]]["type"].strip().lower()
            ]
            if lower:
                t = loser_of(lower[0])
                if t is not None:
                    third = [t]
                    third_label = "3"
            elif semis:
                for mi in semis:
                    t = loser_of(mi)
                    if t is not None and t not in third:
                        third.append(t)
                if third:
                    third_label = "3–4" if len(third) > 1 else "3"

        tournaments.append(
            {
                "name": name,
                "year": year,
                "tier": tier,
                "region": region,
                "winner": winner,
                "runnerUp": runner,
                "third": third,
                "thirdLabel": third_label,
                "score": score,
                "finalMatch": match_ids[final_mi] if final_mi is not None else None,
                "stage": stage,
                "confidence": confidence,
            }
        )

    payload = {
        "matchResults": "".join(result_chars),
        "matchScores": "".join(score_chars),
        "tournaments": tournaments,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

    # --- laporan QA ---
    with_winner = [t for t in tournaments if t["winner"] is not None]
    majors = [t for t in tournaments if t["tier"] == "major"]
    print(f"laga            : {len(match_ids):,}")
    print(f"baris skor      : {score_rows:,} (cocok {matched_scores:,})")
    print(f"turnamen        : {len(tournaments)} (juara terisi {len(with_winner)})")
    print(f"major           : {len(majors)} (juara {sum(1 for t in majors if t['winner'] is not None)})")
    print()
    print("MAJOR:")
    for t in sorted(majors, key=lambda x: (x["year"] or 0, x["name"])):
        w = team_names[t["winner"]] if t["winner"] is not None else "—"
        r = team_names[t["runnerUp"]] if t["runnerUp"] is not None else "—"
        sc = f"{t['score'][0]}–{t['score'][1]}" if t["score"] else "—"
        print(f"  {t['year']} {t['name']}: {w} vs {r} ({sc}) [{t['confidence']}]")

    no_winner = [t for t in tournaments if t["winner"] is None]
    print()
    print(f"tanpa juara: {len(no_winner)}")
    for t in no_winner[:10]:
        print(f"  {t['year']} {t['name']} ({t['tier']}, {t['confidence']})")
    print(f"wrote {OUT} ({os.path.getsize(OUT):,} bytes)")


if __name__ == "__main__":
    main()
