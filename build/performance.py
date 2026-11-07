#!/usr/bin/env python3
"""Agregat performa pemain dan tim per turnamen dari matches/overview.csv.

Input:
  - dataset/all_matches_games_ids.csv
  - dataset/kaggle/vct_<tahun>/matches/overview.csv
  - dataset/kaggle/vct_<tahun>/matches/scores.csv
  - data.json, src/players.json
Output:
  - src/performance.json (entri fixed-width base36)
"""

import argparse
import csv
import json
import os
import sys
from collections import Counter, defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(BASE)
MATCHES = os.path.join(ROOT, "dataset", "all_matches_games_ids.csv")
DATA = os.path.join(BASE, "data.json")
PLAYERS = os.path.join(BASE, "src", "players.json")
OUT = os.path.join(BASE, "src", "performance.json")

B36 = "0123456789abcdefghijklmnopqrstuvwxyz"
PLAYER_WIDTH = 25
TEAM_WIDTH = 23


def enc(n, width):
    n = max(0, int(round(n)))
    out = ""
    for _ in range(width):
        out = B36[n % 36] + out
        n //= 36
    return out


def num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--overview-root", default=os.path.join(ROOT, "dataset", "kaggle"))
    args = ap.parse_args()
    root = os.path.abspath(args.overview_root)

    with open(DATA, encoding="utf-8") as fh:
        data = json.load(fh)
    with open(PLAYERS, encoding="utf-8") as fh:
        player_names = json.load(fh)["players"]

    team_names = data["filters"]["teams"]
    team_index = {t: i for i, t in enumerate(team_names)}
    tour_names = data["filters"]["tournaments"]
    tour_index = {t: i for i, t in enumerate(tour_names)}
    player_index = {p: i for i, p in enumerate(player_names)}

    # --- laga unik, urutan sama seperti aggregate.py ---
    with open(MATCHES, newline="", encoding="utf-8-sig") as fh:
        rows = [r for r in csv.DictReader(fh) if r["Map"].strip() not in ("", "TBD")]
    match_order = {}
    for r in rows:
        if r["Match ID"] in match_order:
            continue
        pair = [t.strip().strip('"') for t in r["Match Name"].split(" vs ")]
        match_order[r["Match ID"]] = {
            "tour": r["Tournament"],
            "stage": r["Stage"],
            "type": r["Match Type"],
            "name": r["Match Name"],
            "teamA": pair[0] if len(pair) == 2 else "",
            "teamB": pair[1] if len(pair) == 2 else "",
            "year": int(r["Year"]),
        }
    match_ids = sorted(match_order, key=int)
    match_index = {mid: i for i, mid in enumerate(match_ids)}

    def key(mid):
        m = match_order[mid]
        return (m["tour"], m["stage"], m["type"], m["name"])

    match_key = {key(mid): i for i, mid in enumerate(match_ids)}
    canon = [
        (match_order[mid]["teamA"].lower(), match_order[mid]["teamB"].lower())
        for mid in match_ids
    ]

    # --- skor ---
    scores = {}
    for year in range(2021, 2027):
        path = os.path.join(root, f"vct_{year}", "matches", "scores.csv")
        if not os.path.exists(path):
            print(f"PERINGATAN: {path} tidak ada", file=sys.stderr)
            continue
        with open(path, newline="", encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                k = (r["Tournament"], r["Stage"], r["Match Type"], r["Match Name"])
                a = r.get("Team A Score", "").strip()
                b = r.get("Team B Score", "").strip()
                try:
                    a, b = int(a), int(b)
                except ValueError:
                    a = b = None
                scores[k] = {
                    "a": a,
                    "b": b,
                    "teamA": (r.get("Team A") or "").strip().lower(),
                    "teamB": (r.get("Team B") or "").strip().lower(),
                    "result": (r.get("Match Result") or "").strip().lower(),
                }

    match_winner = []
    for mid in match_ids:
        s = scores.get(key(mid))
        side = -1
        if s:
            if s["a"] is not None and s["b"] is not None:
                side = 0 if s["a"] > s["b"] else 1 if s["b"] > s["a"] else -1
            elif s["result"]:
                a, b = canon[match_index[mid]]
                if a and a in s["result"]:
                    side = 0
                elif b and b in s["result"]:
                    side = 1
        match_winner.append(side)

    # --- pass 1: tim yang muncul per laga (untuk alias nama tim) ---
    seen = defaultdict(set)
    for year in range(2021, 2027):
        path = os.path.join(root, f"vct_{year}", "matches", "overview.csv")
        if not os.path.exists(path):
            continue
        with open(path, newline="", encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                if r.get("Side") != "both" or r.get("Map") == "All Maps":
                    continue
                mi = match_key.get(
                    (r["Tournament"], r["Stage"], r["Match Type"], r["Match Name"])
                )
                if mi is None:
                    continue
                team = (r.get("Team") or "").strip().lower()
                if team:
                    seen[mi].add(team)

    def side_for(mi, team):
        a, b = canon[mi]
        t = team.strip().lower()
        if t and t == a:
            return 0
        if t and t == b:
            return 1
        if len(seen[mi]) == 2:
            if a not in seen[mi] and b in seen[mi]:
                return 0 if t != b else 1
            if b not in seen[mi] and a in seen[mi]:
                return 1 if t != a else 0
        return -1

    # --- pass 2: agregasi ---
    players = {}
    teams = {}
    player_match = set()
    team_match = set()

    rows_read = matched = 0
    for year in range(2021, 2027):
        path = os.path.join(root, f"vct_{year}", "matches", "overview.csv")
        if not os.path.exists(path):
            continue
        with open(path, newline="", encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                if r.get("Side") != "both" or r.get("Map") == "All Maps":
                    continue
                rows_read += 1
                mi = match_key.get(
                    (r["Tournament"], r["Stage"], r["Match Type"], r["Match Name"])
                )
                if mi is None:
                    continue
                player = (r.get("Player") or "").strip()
                pidx = player_index.get(player)
                if pidx is None:
                    continue
                tix = tour_index.get(r["Tournament"])
                if tix is None:
                    continue
                matched += 1
                side = side_for(mi, (r.get("Team") or ""))
                ti = -1
                if side == 0:
                    ti = team_index.get(match_order[match_ids[mi]]["teamA"], -1)
                elif side == 1:
                    ti = team_index.get(match_order[match_ids[mi]]["teamB"], -1)

                rating = num(r.get("Rating"))
                acs = num(r.get("Average Combat Score"))
                kills = num(r.get("Kills"))
                deaths = num(r.get("Deaths"))
                assists = num(r.get("Assists"))

                rec = players.setdefault(
                    (pidx, tix),
                    {
                        "maps": 0,
                        "kills": 0,
                        "deaths": 0,
                        "assists": 0,
                        "rating": 0,
                        "acs": 0,
                        "wins": 0,
                        "losses": 0,
                        "teams": Counter(),
                    },
                )
                rec["maps"] += 1
                rec["kills"] += kills
                rec["deaths"] += deaths
                rec["assists"] += assists
                rec["rating"] += rating * 100
                rec["acs"] += acs
                if ti >= 0:
                    rec["teams"][ti] += 1

                if (pidx, tix, mi) not in player_match:
                    player_match.add((pidx, tix, mi))
                    w = match_winner[mi]
                    if w >= 0 and side >= 0:
                        if side == w:
                            rec["wins"] += 1
                        else:
                            rec["losses"] += 1

                if ti >= 0:
                    trec = teams.setdefault(
                        (ti, tix),
                        {
                            "maps": 0,
                            "wins": 0,
                            "losses": 0,
                            "kills": 0,
                            "deaths": 0,
                            "rating": 0,
                            "acs": 0,
                        },
                    )
                    trec["maps"] += 1
                    trec["kills"] += kills
                    trec["deaths"] += deaths
                    trec["rating"] += rating * 100
                    trec["acs"] += acs
                    if (ti, tix, mi) not in team_match:
                        team_match.add((ti, tix, mi))
                        w = match_winner[mi]
                        if w >= 0:
                            if side == w:
                                trec["wins"] += 1
                            else:
                                trec["losses"] += 1

    player_entries = []
    for (pidx, tix), r in sorted(players.items()):
        player_entries.append(
            enc(pidx, 3)
            + enc(tix, 2)
            + enc(r["maps"], 2)
            + enc(r["kills"], 3)
            + enc(r["deaths"], 3)
            + enc(r["rating"], 4)
            + enc(r["acs"], 4)
            + enc(r["wins"], 2)
            + enc(r["losses"], 2)
        )

    team_entries = []
    for (ti, tix), r in sorted(teams.items()):
        team_entries.append(
            enc(ti, 3)
            + enc(tix, 2)
            + enc(r["maps"], 3)
            + enc(r["wins"], 2)
            + enc(r["losses"], 2)
            + enc(r["rating"], 5)
            + enc(r["acs"], 6)
        )

    for e in player_entries:
        assert len(e) == PLAYER_WIDTH, (len(e), e)
    for e in team_entries:
        assert len(e) == TEAM_WIDTH, (len(e), e)

    payload = {
        "playerWidth": PLAYER_WIDTH,
        "teamWidth": TEAM_WIDTH,
        "playerCount": len(player_entries),
        "teamCount": len(team_entries),
        "players": "".join(player_entries),
        "teams": "".join(team_entries),
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

    print(f"overview rows   : {rows_read:,} (matched {matched:,})")
    print(f"player-turnamen : {len(player_entries):,}")
    print(f"team-turnamen   : {len(team_entries):,}")
    print(f"wrote           : {OUT} ({os.path.getsize(OUT):,} bytes)")

    # contoh QA: f0rsakeN
    sample = player_index.get("f0rsakeN")
    if sample is not None:
        recs = [(t, r) for (p, t), r in players.items() if p == sample]
        maps = sum(r["maps"] for _, r in recs)
        kills = sum(r["kills"] for _, r in recs)
        deaths = sum(r["deaths"] for _, r in recs)
        rating = sum(r["rating"] for _, r in recs) / 100 / max(maps, 1)
        acs = sum(r["acs"] for _, r in recs) / max(maps, 1)
        print(
            f"QA f0rsakeN    : {len(recs)} turnamen, {maps} peta, "
            f"rating {rating:.2f}, ACS {acs:.0f}, K/D {kills/max(deaths,1):.2f}"
        )


if __name__ == "__main__":
    main()
