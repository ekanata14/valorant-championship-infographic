#!/usr/bin/env python3
"""Unduh logo event, logo tim, dan foto pemain dari VLR.gg, lalu kecilkan.

Sumber gambar: og:image halaman VLR (logo event/tim, foto pemain).
Output:
  - assets/img/{events,teams,players}/... (gambar kecil)
  - src/images.json (manifest nama -> path relatif)

Tidak dijalankan saat build; jalankan sekali saat memperbarui aset,
lalu build.py menyematkan gambar sebagai data URI.
"""

import argparse
import csv
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(BASE)
DATASET = os.path.join(ROOT, "dataset")
DATA = os.path.join(BASE, "data.json")
WINNERS = os.path.join(BASE, "src", "winners.json")
PLAYERS = os.path.join(BASE, "src", "players.json")
OUTDIR = os.path.join(BASE, "assets", "img")
MANIFEST = os.path.join(BASE, "src", "images.json")

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
)


def http(url, binary=False, tries=3):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=25) as res:
                return res.read() if binary else res.read().decode("utf-8", "replace")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
            if attempt + 1 == tries:
                return None
            time.sleep(0.8 * (attempt + 1))
    return None


def og_image(page):
    html = http(page)
    if not html:
        return None
    m = re.search(r'property="og:image"\s+content="([^"]+)"', html)
    if not m:
        m = re.search(r'content="([^"]+)"\s+property="og:image"', html)
    if not m:
        return None
    url = m.group(1).strip()
    return ("https:" + url) if url.startswith("//") else url


def resize(src_bytes, out_path, size, jpeg=False):
    tmp = out_path + ".tmp"
    with open(tmp, "wb") as fh:
        fh.write(src_bytes)
    cmd = ["sips", "-Z", str(size)]
    cmd += ["-s", "format", "jpeg", "-s", "formatOptions", "72"] if jpeg else ["-s", "format", "png"]
    cmd += [tmp, "--out", out_path]
    ok = True
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (subprocess.CalledProcessError, FileNotFoundError):
        os.replace(tmp, out_path)
        ok = False
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return ok


def load_manifest():
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as fh:
            return json.load(fh)
    return {"events": {}, "teams": {}, "players": {}}


def save_manifest(m):
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(m, fh, ensure_ascii=False, separators=(",", ":"))


def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="batasi jumlah per jenis (uji coba)")
    ap.add_argument("--delay", type=float, default=0.12)
    ap.add_argument("--overview-root", default=os.path.join(DATASET, "kaggle"))
    ap.add_argument("--only", choices=["all", "events", "teams", "players"], default="all")
    args = ap.parse_args()

    with open(DATA, encoding="utf-8") as fh:
        data = json.load(fh)
    with open(WINNERS, encoding="utf-8") as fh:
        winners = json.load(fh)["tournaments"]
    with open(PLAYERS, encoding="utf-8") as fh:
        player_names = json.load(fh)["players"]

    team_names = data["filters"]["teams"]
    tour_names = data["filters"]["tournaments"]

    # --- ID dari dataset ---
    match_rows = [
        r for r in read_csv(os.path.join(DATASET, "all_matches_games_ids.csv"))
        if r["Map"].strip() not in ("", "TBD")
    ]
    tour_ids = defaultdict(Counter)
    match_info = {}
    for r in match_rows:
        tour_ids[r["Tournament"]][r["Tournament ID"]] += 1
        match_info.setdefault(
            r["Match ID"],
            {"tour": r["Tournament"], "stage": r["Stage"],
             "type": r["Match Type"], "name": r["Match Name"]},
        )
    tour_id = {name: c.most_common(1)[0][0] for name, c in tour_ids.items()}

    team_id = {}
    for r in read_csv(os.path.join(DATASET, "all_teams_ids.csv")):
        team_id.setdefault(r["Team"].strip(), r["Team ID"])
    player_id = {}
    for r in read_csv(os.path.join(DATASET, "all_players_ids.csv")):
        player_id.setdefault(r["Player"].strip(), r["Player ID"])

    # --- target event & tim ---
    events = [(n, tour_id.get(n)) for n in tour_names if tour_id.get(n)]
    winning_teams = set()
    for w in winners:
        for idx in (w.get("winner"), w.get("runnerUp")):
            if idx is not None:
                winning_teams.add(team_names[idx])
    teams = [(n, team_id.get(n)) for n in sorted(winning_teams) if team_id.get(n)]

    # --- roster juara major (final match) ---
    major_finals = []
    for w in winners:
        if w.get("tier") != "major" or w.get("winner") is None:
            continue
        info = match_info.get(w.get("finalMatch"))
        if info:
            major_finals.append(
                {
                    "key": (info["tour"], info["stage"], info["type"], info["name"]),
                    "winner": team_names[w["winner"]],
                    "runner": team_names[w["runnerUp"]] if w.get("runnerUp") is not None else "",
                }
            )
    target_keys = {f["key"] for f in major_finals}
    final_rows = defaultdict(list)
    if target_keys:
        for year in range(2021, 2027):
            path = os.path.join(os.path.abspath(args.overview_root), f"vct_{year}", "matches", "overview.csv")
            if not os.path.exists(path):
                continue
            for r in read_csv(path):
                if r.get("Side") != "both" or r.get("Map") == "All Maps":
                    continue
                k = (r["Tournament"], r["Stage"], r["Match Type"], r["Match Name"])
                if k in target_keys:
                    final_rows[k].append(
                        ((r.get("Player") or "").strip(), (r.get("Team") or "").strip())
                    )

    wanted_players = set(player_names[:40])
    for f in major_finals:
        rows = final_rows.get(f["key"], [])
        seen = {t for _, t in rows if t}
        winner = f["winner"].lower()
        runner = f["runner"].lower()
        lower = {t.lower(): t for t in seen}
        alias = None
        if winner not in lower and runner in lower and len(seen) == 2:
            alias = next((t for t in seen if t.lower() != runner), None)
        for p, t in rows:
            tl = t.lower()
            if p and (tl == winner or (alias and tl == alias.lower())):
                wanted_players.add(p)

    players = []
    for name in dict.fromkeys(list(player_names[:40]) + sorted(wanted_players)):
        pid = player_id.get(name)
        if pid:
            players.append((name, pid))

    if args.limit:
        events = events[: args.limit]
        teams = teams[: args.limit]
        players = players[: args.limit]

    manifest = load_manifest()
    for kind in ("events", "teams", "players"):
        os.makedirs(os.path.join(OUTDIR, kind), exist_ok=True)
    # tanda VCT untuk event yang tidak punya logo spesifik
    if os.path.exists(os.path.join(OUTDIR, "events", "vct.png")):
        manifest["events"]["__vct"] = "events/vct.png"
    assigned = defaultdict(dict)
    stats = Counter()

    tasks = []
    for kind, items, size, jpeg in (
        ("events", events, 64, False),
        ("teams", teams, 64, False),
        ("players", players, 72, True),
    ):
        if args.only not in ("all", kind):
            continue
        for name, eid in items:
            rel = manifest[kind].get(name)
            if rel and os.path.exists(os.path.join(OUTDIR, rel)):
                stats[(kind, "cached")] += 1
                continue
            tasks.append((kind, name, eid, size, jpeg))

    def work(task):
        kind, name, eid, size, jpeg = task
        page = (
            "https://www.vlr.gg/"
            + ("event" if kind == "events" else "team" if kind == "teams" else "player")
            + f"/{eid}"
        )
        img_url = og_image(page)
        time.sleep(args.delay)
        if not img_url:
            return kind, name, None, None, "no-image"
        data_bytes = http(img_url, binary=True)
        time.sleep(args.delay)
        if not data_bytes or len(data_bytes) < 200:
            return kind, name, None, img_url, "download-fail"
        out_rel = f"{kind}/{eid}.{'jpg' if jpeg else 'png'}"
        resize(data_bytes, os.path.join(OUTDIR, out_rel), size, jpeg=jpeg)
        return kind, name, out_rel, img_url, "ok"

    print(f"antrean: {len(tasks)} (cache {sum(v for (k, s), v in stats.items() if s == 'cached')})")
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(work, t) for t in tasks]
        for n, fut in enumerate(as_completed(futures), 1):
            kind, name, rel, url, status = fut.result()
            stats[(kind, status)] += 1
            if url:
                assigned[kind][name] = url
            if rel:
                manifest[kind][name] = rel
            if n % 50 == 0:
                save_manifest(manifest)
                print(f"  {n}/{len(tasks)}")
    save_manifest(manifest)

    # buang gambar yang dipakai banyak entitas (siluet/banner default)
    for kind, threshold in (("events", 8), ("teams", 8), ("players", 5)):
        counts = Counter(assigned[kind].values())
        defaults = {u for u, c in counts.items() if c > threshold}
        if not defaults:
            continue
        removed = 0
        for name, url in list(assigned[kind].items()):
            if url in defaults and name in manifest[kind]:
                rel = manifest[kind].pop(name)
                p = os.path.join(OUTDIR, rel)
                if os.path.exists(p):
                    os.remove(p)
                removed += 1
        print(f"  default {kind}: {len(defaults)} URL dipakai >{threshold}; {removed} entri dihapus")
        stats[(kind, "default-removed")] += removed

    save_manifest(manifest)
    total = 0
    for kind in manifest:
        for rel in manifest[kind].values():
            p = os.path.join(OUTDIR, rel)
            if os.path.exists(p):
                total += os.path.getsize(p)
    print("statistik:", dict(stats))
    print(f"gambar tersimpan: {sum(len(v) for v in manifest.values())}, total {total/1024:.0f} KB")
    print(f"manifest: {MANIFEST}")


if __name__ == "__main__":
    main()
