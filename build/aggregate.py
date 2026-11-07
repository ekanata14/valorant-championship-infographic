#!/usr/bin/env python3
"""Agregasi dataset VLR (CSV) menjadi JSON ringkas untuk infografis.

Pakai csv.DictReader karena beberapa Match Name mengandung koma di dalam
tanda kutip, mis. "Cloud9 vs Stay Small, Stay Second".
"""

import csv
import json
import os
from collections import Counter, defaultdict, OrderedDict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(BASE)
DATASET = os.path.join(ROOT, "dataset")
OUT = os.path.join(BASE, "data.json")

MATCHES = os.path.join(DATASET, "all_matches_games_ids.csv")
TEAMS = os.path.join(DATASET, "all_teams_ids.csv")
PLAYERS = os.path.join(DATASET, "all_players_ids.csv")

IGNORED_MAPS = {"TBD", ""}

REGION_RULES = [
    ("China", ("china",)),
    ("Brazil", ("brazil",)),
    ("LATAM", ("latin america", "latam")),
    ("Americas", ("americas", "north america")),
    ("EMEA", ("emea", "europe", "cis", "turkey", "dach", "france", "spain", "italy",
              "poland", "nordics", "benelux", "portugal")),
    ("Pacific/APAC", ("pacific", "apac", "asia-pacific", "east asia", "korea", "japan",
                      "oceania", "thailand", "philippines", "vietnam", "indonesia",
                      "singapore", "malaysia", "hong kong", "taiwan", "south asia",
                      "india", "mena", "mongolia")),
]
GLOBAL = "Global/International"


def region_of(name):
    low = name.lower()
    for region, keys in REGION_RULES:
        if any(k in low for k in keys):
            return region
    return GLOBAL


def stage_bucket(stage):
    low = stage.lower()
    if "open qualifier" in low:
        return "Open Qualifier"
    if "closed qualifier" in low or low.strip() == "qualifiers":
        return "Closed Qualifier"
    if "qualifier" in low:
        return "Qualifier"
    if "group" in low:
        return "Group Stage"
    if "regular season" in low or low.startswith("week"):
        return "Regular Season"
    if "playoff" in low:
        return "Playoffs"
    if "main event" in low:
        return "Main Event"
    if "bracket" in low or "final" in low:
        return "Bracket / Final"
    return "Lainnya"


def read_rows(path):
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            yield {k.strip(): (v or "").strip() for k, v in row.items() if k}


def main():
    rows = []
    tbd = 0
    quoted_comma = 0
    blank_map = 0
    missing_match_name = 0

    for r in read_rows(MATCHES):
        if not r.get("Match ID"):
            continue
        if not r.get("Map"):
            blank_map += 1
            continue
        if r["Map"] in IGNORED_MAPS:
            tbd += 1
            continue
        if "," in r.get("Match Name", ""):
            quoted_comma += 1
        if " vs " not in r.get("Match Name", ""):
            missing_match_name += 1
        rows.append(r)

    years = sorted({int(r["Year"]) for r in rows})
    total_games = len(rows)

    matches_by_year = defaultdict(set)
    tourneys_by_year = defaultdict(set)
    maps_by_year = defaultdict(set)
    for r in rows:
        y = int(r["Year"])
        matches_by_year[y].add(r["Match ID"])
        tourneys_by_year[y].add(r["Tournament"])
        maps_by_year[y].add(r["Map"])

    all_match_ids = set()
    for r in rows:
        all_match_ids.add(r["Match ID"])

    # match -> jumlah peta (untuk histogram format)
    maps_per_match = Counter()
    for mid, cnt in Counter(r["Match ID"] for r in rows).items():
        maps_per_match[cnt] += 1

    # --- peta ---
    map_total = Counter(r["Map"] for r in rows)
    map_year = defaultdict(lambda: defaultdict(int))
    for r in rows:
        map_year[r["Map"]][int(r["Year"])] += 1

    maps = []
    for name, total in map_total.most_common():
        by_year = {str(y): map_year[name].get(y, 0) for y in years}
        present = [y for y in years if map_year[name].get(y, 0) > 0]
        maps.append({
            "map": name,
            "total": total,
            "share": round(total / total_games, 4),
            "firstYear": present[0] if present else None,
            "lastYear": present[-1] if present else None,
            "peakYear": max(present, key=lambda y: map_year[name][y]) if present else None,
            "byYear": by_year,
        })

    # --- tahun ---
    years_out = []
    for y in years:
        years_out.append({
            "year": y,
            "mapGames": sum(1 for r in rows if int(r["Year"]) == y),
            "matches": len(matches_by_year[y]),
            "tournaments": len(tourneys_by_year[y]),
            "mapsPlayed": len(maps_by_year[y]),
        })

    # --- stage ---
    stage_count = Counter(stage_bucket(r["Stage"]) for r in rows)
    stage_year = defaultdict(lambda: defaultdict(int))
    for r in rows:
        stage_year[stage_bucket(r["Stage"])][int(r["Year"])] += 1
    ordered = [kv for kv in stage_count.most_common() if kv[0] != "Lainnya"]
    if "Lainnya" in stage_count:
        ordered.append(("Lainnya", stage_count["Lainnya"]))
    stages = [
        {
            "stage": name,
            "count": count,
            "share": round(count / total_games, 4),
            "byYear": {str(y): stage_year[name].get(y, 0) for y in years},
        }
        for name, count in ordered
    ]

    # --- wilayah ---
    region_games = Counter()
    region_year = defaultdict(lambda: defaultdict(int))
    region_tourneys = defaultdict(set)
    region_tourney_games = defaultdict(Counter)
    for r in rows:
        region = region_of(r["Tournament"])
        region_games[region] += 1
        region_year[region][int(r["Year"])] += 1
        region_tourneys[region].add(r["Tournament"])
        region_tourney_games[region][r["Tournament"]] += 1
    regions = [
        {
            "region": region,
            "mapGames": games,
            "share": round(games / total_games, 4),
            "tournaments": len(region_tourneys[region]),
            "byYear": {str(y): region_year[region].get(y, 0) for y in years},
            "topTournaments": [
                {"name": n, "mapGames": g}
                for n, g in region_tourney_games[region].most_common(3)
            ],
        }
        for region, games in region_games.most_common()
    ]

    # --- turnamen ---
    tourney_games = Counter()
    tourney_matches = defaultdict(set)
    tourney_year = {}
    for r in rows:
        tourney_games[r["Tournament"]] += 1
        tourney_matches[r["Tournament"]].add(r["Match ID"])
        tourney_year[r["Tournament"]] = int(r["Year"])
    top_tournaments = [
        {
            "name": name,
            "mapGames": games,
            "matches": len(tourney_matches[name]),
            "year": tourney_year[name],
            "region": region_of(name),
        }
        for name, games in tourney_games.most_common(12)
    ]

    # --- tim ---
    team_matches = defaultdict(set)
    team_games = Counter()
    team_year_matches = defaultdict(lambda: defaultdict(set))
    for r in rows:
        for team in r["Match Name"].split(" vs "):
            team = team.strip().strip('"')
            if not team:
                continue
            team_matches[team].add(r["Match ID"])
            team_year_matches[team][int(r["Year"])].add(r["Match ID"])
            team_games[team] += 1
    top_teams = [
        {
            "team": team,
            "matches": len(ids),
            "mapGames": team_games[team],
            "byYear": {str(y): len(team_year_matches[team].get(y, ())) for y in years},
        }
        for team, ids in sorted(team_matches.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:24]
    ]

    teams_total = sum(1 for _ in read_rows(TEAMS))
    players_total = sum(1 for _ in read_rows(PLAYERS))

    # Satu turnamen bisa punya dua Tournament ID (mis. kualifikasi yang dipecah).
    tourney_ids_by_name = defaultdict(set)
    for r in rows:
        tourney_ids_by_name[r["Tournament"]].add(r["Tournament ID"])
    tournament_ids = len({r["Tournament ID"] for r in rows})
    duplicate_tournament_names = sum(1 for ids in tourney_ids_by_name.values() if len(ids) > 1)

    top3_share = round(sum(m["total"] for m in maps[:3]) / total_games, 4)
    coverage_2021_22 = round(
        sum(y["mapGames"] for y in years_out if y["year"] <= 2022) / total_games, 4
    )

    # --- kamus filter + baris terkompresi (memungkinkan filter lintas grafik) ---
    map_names = [m["map"] for m in maps]
    stage_names = [s["stage"] for s in stages]
    region_names = [r["region"] for r in regions]
    tournament_names = sorted(tourney_games)
    tour_index = {n: i for i, n in enumerate(tournament_names)}

    match_info = {}
    for r in rows:
        mid = r["Match ID"]
        if mid in match_info:
            continue
        pair = [t.strip().strip('"') for t in r["Match Name"].split(" vs ")]
        if len(pair) != 2:
            pair = ["", ""]
        match_info[mid] = (int(r["Year"]), stage_bucket(r["Stage"]), r["Tournament"], pair)

    match_ids = sorted(match_info, key=lambda x: int(x))
    match_index = {mid: i for i, mid in enumerate(match_ids)}

    team_counts = Counter()
    for mid in match_ids:
        for t in match_info[mid][3]:
            if t:
                team_counts[t] += 1
    team_names = [t for t, _ in team_counts.most_common()]
    team_index = {t: i for i, t in enumerate(team_names)}
    team_none = len(team_names)  # sentinel untuk tim kosong

    year_index = {y: i for i, y in enumerate(years)}
    map_index = {m: i for i, m in enumerate(map_names)}
    stage_index = {s: i for i, s in enumerate(stage_names)}
    region_index = {rg: i for i, rg in enumerate(region_names)}

    B36 = "0123456789abcdefghijklmnopqrstuvwxyz"

    def enc(n, width):
        out = ""
        for _ in range(width):
            out = B36[n % 36] + out
            n //= 36
        return out

    m_year, m_stage, m_tour, m_teams = [], [], [], []
    for mid in match_ids:
        year, stage, tour, pair = match_info[mid]
        a = team_index.get(pair[0], team_none)
        b = team_index.get(pair[1], team_none)
        m_year.append(enc(year_index[year], 1))
        m_stage.append(enc(stage_index[stage], 1))
        m_tour.append(enc(tour_index[tour], 2))
        m_teams.append(enc(a, 3) + enc(b, 3))

    filters_block = OrderedDict([
        ("years", years),
        ("matchIds", match_ids),
        ("maps", map_names),
        ("stages", stage_names),
        ("regions", region_names),
        ("tournaments", tournament_names),
        ("teams", team_names),
        ("teamSentinel", team_none),
        ("tournamentRegion", "".join(enc(region_index[region_of(n)], 1) for n in tournament_names)),
        ("matches", {
            "year": "".join(m_year),
            "stage": "".join(m_stage),
            "tournament": "".join(m_tour),
            "teams": "".join(m_teams),
        }),
        ("rows", {
            "map": "".join(enc(map_index[r["Map"]], 1) for r in rows),
            "match": "".join(enc(match_index[r["Match ID"]], 3) for r in rows),
        }),
    ])

    data = OrderedDict([
        ("meta", {
            "mapGames": total_games,
            "rawRows": total_games + tbd + blank_map,
            "excluded": tbd + blank_map,
            "matches": len(all_match_ids),
            "tournaments": len(tourney_games),
            "tournamentIds": tournament_ids,
            "duplicateTournamentNames": duplicate_tournament_names,
            "teams": teams_total,
            "players": players_total,
            "maps": len(maps),
            "mapsPerMatch": round(total_games / len(all_match_ids), 2),
            "yearMin": years[0],
            "yearMax": years[-1],
        }),
        ("insights", {
            "top3MapShare": top3_share,
            "top3Maps": [m["map"] for m in maps[:3]],
            "topMap": maps[0]["map"],
            "topMapTotal": maps[0]["total"],
            "peakYear": max(years_out, key=lambda y: y["mapGames"])["year"],
            "coverage2021_2022": coverage_2021_22,
            "openQualifierShare": next(
                (s["share"] for s in stages if s["stage"] == "Open Qualifier"), 0
            ),
            "mostActiveTeam": top_teams[0]["team"] if top_teams else "",
            "mostActiveTeamMatches": top_teams[0]["matches"] if top_teams else 0,
        }),
        ("years", years_out),
        ("maps", maps),
        ("stages", stages),
        ("mapsPerMatch", [
            {"maps": k, "matches": v} for k, v in sorted(maps_per_match.items())
        ]),
        ("regions", regions),
        ("topTournaments", top_tournaments),
        ("topTeams", top_teams),
        ("quality", {
            "mapTBD": tbd,
            "quotedCommaRows": quoted_comma,
            "blankMap": blank_map,
            "matchNameMissingVs": missing_match_name,
        }),
        ("filters", filters_block),
    ])

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))

    # --- ringkasan QA ---
    print("rows bersih      :", total_games, "(TBD:", tbd, "| mapa kosong:", blank_map, ")")
    print("pertandingan     :", len(all_match_ids))
    print("turnamen         :", len(tourney_games))
    print("peta             :", len(maps))
    print("tim / pemain     :", teams_total, "/", players_total)
    print("sum years        :", sum(y["mapGames"] for y in years_out))
    print("sum maps         :", sum(m["total"] for m in maps))
    print("sum stages       :", sum(s["count"] for s in stages))
    print("sum regions      :", sum(r["mapGames"] for r in regions))
    print("top3 share       :", top3_share)
    print("region split     :", [(r["region"], r["mapGames"]) for r in regions])
    print("stage split      :", [(s["stage"], s["count"]) for s in stages])
    print("maps per match   :", [(k, v) for k, v in sorted(maps_per_match.items())])
    print("top team         :", top_teams[0] if top_teams else None)
    print("wrote            :", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
