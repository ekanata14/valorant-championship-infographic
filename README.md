# Juara VCT 2021–2026 — Infografis Interaktif

Satu file HTML mandiri yang menjawab satu pertanyaan utama:
**siapa juara turnamen VALORANT tiap tahun, dengan siapa pemainnya, dan bagaimana performanya.**

Urutan cerita: **VCT Champions → VCT Masters → VCT regional/Challengers → turnamen lain**.
Setiap juara menampilkan tim, roster, skor final, dan tautan ke **halaman tim** serta **halaman pemain**.
Dashboard analitik lama tetap tersedia di view **Jelajah Data**.

## Cara membuka

```
open infografis/index.html
```

Tidak ada request jaringan. Rute hash di dalam satu file:

| Rute | Isi |
|---|---|
| `#/` | Juara: hero juara terbaru, timeline Champions, grid Masters, regional, turnamen lain |
| `#/vct` | Semua juara VCT (major + regional/Challengers), filter tahun & pencarian |
| `#/lainnya` | Juara turnamen non-VCT (Oceania, Strike Arabia, Skyesports, dll.) |
| `#/team/<id>` | Halaman tim: piala, performa, roster, laga terakhir |
| `#/player/<id>` | Halaman pemain: karier, performa per turnamen, piala, laga terakhir |
| `#/data` | Dashboard analitik + tabel cari data (pemain/laga/tim/turnamen) |

## Struktur data

- `data.json` — agregat dashboard + baris terkompresi untuk filter.
- `src/players.json` — 15.371 pemain, lineup per laga (126.858 pasangan pemain–laga).
- `src/winners.json` — 235 turnamen: final, juara, runner-up, skor, tier, region.
- `src/performance.json` — agregat per pemain×turnamen (peta, kill/death, rating, ACS, menang–kalah)
  dan tim×turnamen (peta, rating, ACS, menang–kalah), dikemas base36.
- `src/images.json` — manifest logo event/tim dan foto pemain; `assets/img/` menyimpan gambar kecil
  (build.py menyematkannya sebagai data URI agar HTML tetap mandiri).

Join:
- **Skor & juara**: `matches/scores.csv` → `(Tournament, Stage, Match Type, Match Name)`.
  Final dideteksi dari `Match Type`: `Grand Final(s)` → `Final(s)` → fallback laga terakhir.
- **Lineup & performa**: `matches/overview.csv` → `(Tournament, Stage, Match Type, Match Name, Map)`,
  `Side=both`, `Map≠All Maps`.
- Alias nama tim (mis. NRG vs Mega Minors) dipetakan saat join.

## Sumber data

VLR.gg — dataset [“Valorant Champion Tour 2021–2026 Data”](https://www.kaggle.com/datasets/ryanluong1/valorant-champion-tour-2021-2023-data)
oleh Ryan Luong (Kaggle, MIT), di-scrape dari vlr.gg.
Tabel yang dipakai: `all_ids`, `matches/scores.csv`, `matches/overview.csv`.

## Cara membangun ulang

Prasyarat: Python 3 (stdlib saja). Untuk `assets.py` diperlukan `sips` (macOS) dan koneksi internet.

```bash
cd infografis
python3 build/aggregate.py            # CSV -> data.json
python3 build/players_join.py --overview-root dataset/kaggle   # -> src/players.json
python3 build/winners.py --scores-root dataset/kaggle          # -> src/winners.json
python3 build/performance.py --overview-root dataset/kaggle    # -> src/performance.json
python3 build/assets.py                # logo event/tim + foto pemain -> assets/img, src/images.json
python3 build/build.py                # semuanya -> index.html
```

`assets.py` mengunduh dari VLR.gg dan memerlukan `sips` (macOS) untuk memperkecil gambar.
Jalankan sekali saja; hasilnya dipakai ulang oleh `build.py`. Tanpa `assets/img`, kartu memakai
inisial sebagai fallback.

Untuk menjalankan join, unduh dataset (80 MB) lalu ekstrak:

```bash
kaggle datasets download -d ryanluong1/valorant-champion-tour-2021-2023-data \
  -p dataset/kaggle --unzip
```

Tanpa folder `dataset/kaggle`, build tetap jalan, tetapi juara/performa kosong.

## Validasi juara major

16 event internasional, semuanya terisi dan cocok dengan hasil yang diketahui:

| Tahun | Event | Juara | Runner-up | Skor |
|---|---|---|---|---|
| 2021 | Champions 2021 | Acend | Gambit Esports | 3–2 |
| 2022 | Champions 2022 | LOUD | OpTic Gaming | 3–1 |
| 2023 | Champions 2023 | Evil Geniuses | Paper Rex | 3–1 |
| 2024 | Champions 2024 | EDward Gaming | Team Heretics | 3–2 |
| 2025 | Champions 2025 | NRG | FNATIC | 3–2 |
| 2021 | Masters Reykjavík | Sentinels | FNATIC | 3–0 |
| 2021 | Masters Berlin | Gambit Esports | Envy | 3–0 |
| 2022 | Masters Reykjavík | OpTic Gaming | LOUD | 3–0 |
| 2022 | Masters Copenhagen | FunPlus Phoenix | Paper Rex | 3–2 |
| 2023 | Masters Tokyo | FNATIC | Evil Geniuses | 3–0 |
| 2024 | Masters Madrid | Sentinels | Gen.G | 3–2 |
| 2024 | Masters Shanghai | Gen.G | Team Heretics | 3–2 |
| 2025 | Masters Bangkok | T1 | G2 Esports | 3–2 |
| 2025 | Masters Toronto | Paper Rex | FNATIC | 3–1 |
| 2026 | Masters Santiago | Nongshim RedForce | Paper Rex | 3–0 |
| 2026 | Masters London | LEVIATÁN | Paper Rex | 3–2 |

3 turnamen tidak punya juara karena final/skor tidak terdeteksi (liga kecil 2021); tidak ditampilkan sebagai kartu juara.

## Fitur

- **Juara**: kartu per event dengan tim, runner-up, skor, dan roster (rating per pemain).
- **VCT**: filter tahun, pencarian event/tim, kartu major + tabel regional/Challengers.
- **Turnamen lain**: pencarian event/tim; turnamen non-VCT (Oceania, Strike Arabia, Skyesports, dll.).
- **Halaman tim**: piala, menang–kalah, win rate, rating/ACS, peta, roster, 12 laga terakhir.
- **Halaman pemain**: laga, W–L, win rate, rating, ACS, K/D, performa per turnamen, piala, 12 laga terakhir.
- **Jelajah Data**: dashboard peta/stage/wilayah/tim/pemain + tabel cari lintas data.
- **Gambar**: logo event di kartu/tabel/piala, logo tim di kartu/tim/lawan, foto pemain di roster,
  halaman pemain, dan tabel performa. Event VCT tanpa logo spesifik memakai lambang VCT;
  entitas tanpa gambar memakai inisial.
- Light/dark, responsif, print.

## Gambar & lisensi

Logo event/tim dan foto pemain diambil dari **VLR.gg** (`og:image`), diperkecil menjadi 64/72 px,
lalu disematkan sebagai data URI. Logo dan foto adalah milik masing-masing pemiliknya dan dipakai
untuk keperluan edukasi; cantumkan VLR.gg sebagai sumber di laporan.
Cakupan: logo semua event (sebagian memakai lambang VCT), logo tim juara/runner-up,
foto 89 pemain (40 teratas + roster final major).

## Keterbatasan

- Juara hanya diisi bila **final & skor** terdeteksi; turnamen liga tanpa final tidak punya juara.
- Performa dari `overview.csv`; sebagian kecil laga tidak punya data lineup/performa.
- Statistik tim/pemain di halaman detail adalah **agregat per turnamen**, bukan per peta.
- Cakupan arsip tidak merata (85,1% di 2021–2022); 2026 kemungkinan belum lengkap.
- Wilayah heuristik dari nama turnamen; tier major dikurasi manual.

## Struktur berkas

```
infografis/
├── build/
│   ├── aggregate.py        # CSV -> data.json (+ baris filter + Match ID)
│   ├── players_join.py     # overview.csv -> players.json (lineup, sisi tim)
│   ├── winners.py          # scores.csv -> winners.json (final, juara, tier)
│   ├── performance.py      # overview.csv -> performance.json
│   ├── assets.py           # logo event/tim + foto pemain -> assets/img
│   └── build.py            # semua payload + template -> index.html
├── src/
│   ├── template.html       # kerangka + markup dashboard
│   ├── styles.css          # design system + komponen juara/tim/pemain
│   ├── charts.js           # renderer SVG dashboard
│   ├── app.js              # mesin dashboard + indeks global (window.__APP)
│   ├── views.js            # router + halaman Juara/VCT/Tim/Pemain
│   ├── players.json        # lineup pemain per laga
│   ├── winners.json        # juara & skor final per turnamen
│   ├── performance.json    # agregat performa pemain/tim per turnamen
│   ├── images.json         # manifest gambar (nama -> path)
│   ├── fonts/              # Oswald (OFL) subset latin
│   └── ../../assets/img/   # logo event/tim, foto pemain (hasil assets.py)
├── data.json               # agregat + baris terkompresi
└── index.html              # ★ produk final (~4,3 MB, mandiri)
```

## Yang perlu dilengkapi sebelum dikumpulkan

1. **Identitas kelompok** di cover laporan (nama, NIM, program studi, perguruan tinggi).
2. **Tautan produk.** Panduan mewajibkan link yang bisa dibuka dosen:
   - GitHub Pages: unggah `index.html` ke repo publik → Settings → Pages.
   - Netlify Drop: https://app.netlify.com/drop
3. **Laporan 2–3 halaman** (dataset, alasan visualisasi, elemen interaktif, interpretasi).
