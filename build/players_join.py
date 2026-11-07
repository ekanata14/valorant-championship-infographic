#!/usr/bin/env python3
"""Join data pemain (Kaggle: matches/overview.csv) ke pertandingan di dataset ini.

Kunci join: Tournament + Stage + Match Type + Match Name + Map.
Keluaran: src/players.json (nama pemain, tim utama, dan daftar pemain per laga).

Contoh:
    python3 build/players_join.py --overview-root dataset/kaggle
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
OUT = os.path.join(BASE, "src", "players.json")

SENTINEL = "zzzz"  # penanda akhir daftar (indeks 46655 + sisi)
B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def enc(n, width):
    out = ""
    for _ in range(width):
        out = B36[n % 36] + out
        n //= 36
    return out


def key_of(r):
    return (r["Tournament"], r["Stage"], r["Match Type"], r["Match Name"], r["Map"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--overview-root",
        default=os.path.join(ROOT, "dataset", "kaggle"),
        help="folder berisi vct_2021/.../matches/overview.csv",
    )
    args = ap.parse_args()
    root = os.path.abspath(args.overview_root)

    with open(MATCHES, newline="", encoding="utf-8-sig") as fh:
        rows = [r for r in csv.DictReader(fh) if r["Map"].strip() not in ("", "TBD")]

    match_ids = sorted({r["Match ID"] for r in rows}, key=int)
    match_index = {mid: i for i, mid in enumerate(match_ids)}
    index_of = {}
    for r in rows:
        index_of.setdefault(key_of(r), r["Match ID"])

    with open(DATA, encoding="utf-8") as fh:
        existing = json.load(fh)
    team_names = existing["filters"]["teams"]
    team_index = {t: i for i, t in enumerate(team_names)}

    match_teams = {}
    for r in rows:
        if r["Match ID"] in match_teams:
            continue
        pair = [t.strip().strip('"') for t in r["Match Name"].split(" vs ")]
        match_teams[r["Match ID"]] = pair if len(pair) == 2 else ["", ""]

    match_players = [dict() for _ in match_ids]
    player_teams = defaultdict(Counter)
    seen_rows = 0
    matched_rows = 0
    missing_years = []

    for year in range(2021, 2027):
        path = os.path.join(root, f"vct_{year}", "matches", "overview.csv")
        if not os.path.exists(path):
            missing_years.append(year)
            continue
        with open(path, newline="", encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                if r.get("Side") != "both" or r.get("Map") == "All Maps":
                    continue
                seen_rows += 1
                mid = index_of.get(key_of(r))
                if not mid:
                    continue
                matched_rows += 1
                player = r.get("Player", "").strip()
                if not player:
                    continue
                team = r.get("Team", "").strip()
                match_players[match_index[mid]].setdefault(player, team)
                if team:
                    player_teams[player][team] += 1

    if missing_years:
        print(
            "PERINGATAN: overview.csv tidak ditemukan untuk tahun "
            + ", ".join(map(str, missing_years))
            + f" di {root}",
            file=sys.stderr,
        )

    match_count = {}
    for m, players in enumerate(match_players):
        for p in players:
            match_count[p] = match_count.get(p, 0) + 1

    players = sorted(match_count, key=lambda p: (-match_count[p], p.lower()))
    pidx = {p: i for i, p in enumerate(players)}

    parts = []
    for m, players_in_match in enumerate(match_players):
        team_a, team_b = (t.strip().lower() for t in match_teams[match_ids[m]])
        seen = {t.strip().lower() for t in players_in_match.values() if t.strip()}

        # kadang nama tim di overview berbeda dari nama laga (mis. NRG vs Mega Minors);
        # kalau hanya satu sisi yang cocok dan tepat dua tim muncul, sisi lain diisi sisanya.
        alias_a = alias_b = None
        if len(seen) == 2:
            if team_a not in seen and team_b in seen:
                alias_a = next(iter(seen - {team_b}))
            elif team_b not in seen and team_a in seen:
                alias_b = next(iter(seen - {team_a}))

        for p in sorted(players_in_match, key=lambda x: pidx[x]):
            team = players_in_match[p].strip().lower()
            if team and team == team_a:
                side = "0"
            elif team and team == team_b:
                side = "1"
            elif alias_a and team == alias_a:
                side = "0"
            elif alias_b and team == alias_b:
                side = "1"
            else:
                side = "2"
            parts.append(enc(pidx[p], 3) + side)
        parts.append(SENTINEL)

    main_team = []
    for p in players:
        team = player_teams[p].most_common(1)[0][0] if player_teams[p] else ""
        main_team.append(enc(team_index.get(team, 46655), 3))

    payload = {
        "players": players,
        "matchCount": [match_count[p] for p in players],
        "playerTeam": "".join(main_team),
        "matchPlayers": "".join(parts),
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

    pairs = sum(len(s) for s in match_players)
    covered = sum(1 for s in match_players if s)
    print(f"overview rows   : {seen_rows:,} (matched {matched_rows:,})")
    print(f"matches covered : {covered:,} / {len(match_ids):,}")
    print(f"players         : {len(players):,}")
    print(f"player-laga     : {pairs:,}")
    print(f"matchPlayers    : {len(payload['matchPlayers']):,} chars")
    print(f"wrote           : {OUT} ({os.path.getsize(OUT):,} bytes)")


if __name__ == "__main__":
    main()
