# Fixtures

Real ClickTheCity responses captured on **2026-11-17** (Tue, Manila), requested
from the Ortigas default point `14.5990, 121.0675`. They are snapshots: showtimes
and now-showing titles will not match the live site later, so tests must not
depend on "today". Pass the fixture date explicitly.

| File | Request | Why it is here |
|---|---|---|
| `now-showing.json` | `/now-showing` | Title catalog (40 movies). Includes old titles (Dune 2021, Pinocchio 2013); `main_cast`/`director` are sometimes `""` instead of arrays; `running_time` can be `""`. |
| `nearby-malls/godzilla-page1.json` | `/nearby-malls?...&movie_id=31af70&page=1` | 15 malls by distance. `date` is ignored by this endpoint (same result with `&date=`). `available_schedule` = dates the *movie* has showtimes. |
| `nearby-malls/godzilla-page2.json` | same, `page=2` | Paging (`paging.next`), distances 6.0–12.2 km. |
| `nearby-malls/boldstar-far-away.json` | `movie_id=63fc2f` | A movie whose nearest malls are far / outside Metro Manila: exercises the 15 km cap and the "not showing near you" message. |
| `nearby-malls/no-movie-all-malls.json` | no `movie_id` | All malls (used to build the "what's showing" list). |
| `directory/page1..7.json` | `/nearby-malls?latitude=14.5995&longitude=120.9842&page=N` | The cinema directory (105 cinemas out to ~77 km), recorded 2026-11-18 from central Manila. 15 per page; `limit` is ignored. API distances match great-circle distance within 0.05 km. |
| `theater/<slug>.2026-11-17.json` | `/theater/<slug>?date=2026-11-17` | Eight nearest malls. Godzilla (movieId 21542) is on at all eight, on 1–2 screens each (names like `1`, `IMAX`, `Gateway Cineplex 10 (Platinum Cinema)`). |
| `theater/sm-megamall.2026-11-18.json`, `...2026-11-21.json` | other dates | Date parameter works. |
| `theater/sm-megamall.2026-12-30.empty.json` | far date | `schedule_available` is `true` but `schedules` is empty: do not trust that flag. |

Notes on the API (verified 2026-11-17):

- `movie_id` accepts the hash (`31af70`) or the numeric id (`21542`).
- `schedules[].movieId` is the **numeric** id.
- Plain `curl` is rejected with 403; a generic custom User-Agent works.
- CORS: the server only echoes `Access-Control-Allow-Origin` for some origins
  (not the `aix preview` origin), hence `tools/dev-proxy.mjs`.

| Note |
|---|
| Synopses and review articles in these snapshots are removed; the tests do not use them. |
