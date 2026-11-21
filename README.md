[![make.fun · news-image-20261121](https://make.fun/badge/news-image-20261121.svg)](https://make.fun/bounty/news-image-20261121?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)
[![make.fun rank](https://make.fun/badge/news-image-20261121/putri43/news-image-20261121/rank.svg)](https://make.fun/bounty/news-image-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)
[![make.fun reward](https://make.fun/badge/news-image-20261121/putri43/news-image-20261121/reward.svg)](https://make.fun/bounty/news-image-20261121?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)

# Saturday 21 November 2026 — The World in One Day

A program that draws one newspaper front page summing up the world's news of
Saturday 21 November 2026: **48 stories, every one first reported that day**,
across 7 regions, with 13 illustrated feature stories.

## What is on the page

- **13 illustrated features** — the day's biggest stories, each drawn as an
  original procedural illustration (no photos, no copied art).
- **STILL MOVING / SETTLED** — every feature carries a status chip: 5 stories
  were still unfolding at press time, 8 were settled. The status strip at the
  top of the page makes the split visible at a glance.
- **SATURDAY, BY THE CLOCK** — an hour-by-hour timeline from the Peru quake
  at 00:09 UTC to qualifying under the Las Vegas lights.
- **6-number KPI strip** — 48 stories, quake 6.7, Nasdaq −5.3%, Bitcoin
  $58,311, 3 missiles down over Riyadh, 14 tankers at Kharg.
- **World map** — a numbered pin for each feature story, plus a region count.
- **Full numbered list** — all 48 stories with the source that first reported
  each one.
- **Date-check footer** — stories first reported on Thursday 19 or Friday
  20 November are named and deliberately left out, so nothing on the page is
  yesterday's news wearing today's date.

## Run it

```sh
node main.ts            # writes /output/entry.png
node main.ts out.png    # writes out.png instead
```

Node's standard library only — no dependencies, no network. The program is
deterministic: running it twice writes byte-identical PNG files.

## The stories

Biggest of the day: a 6.7 earthquake in central Peru; COP31 going into
overtime in Antalya with fossil fuels missing from the draft; Saudi defences
downing three Houthi missiles over Riyadh on a third night of alerts; Wall
Street sliding into correction as AI shares sell off; Bitcoin under $60,000;
the UK and EU signing food, carbon and youth-mobility deals; a
Trump–Xi–Putin trilateral in Shenzhen; Iranian tankers massing at Kharg
Island; Indonesia and the EU signing a trade deal covering 98% of bilateral
trade; KL Rahul completing Test centuries in every SENA country; SpaceX
launching the classified USSF-317 mission; George Russell fastest in Las
Vegas practice; and New York's mayor setting 2032 to close Rikers Island.

## Entry

Built for the [make.fun bounty](https://make.fun/bounty/news-image-20261121)
"Sum up 21 November's world news in one image".
