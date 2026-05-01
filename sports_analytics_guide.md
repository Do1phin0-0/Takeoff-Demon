# Sports Analytics Reasoning Agent — Operator Guide

This guide explains how to deploy and operate the agent defined in
`sports_analytics_prompt.md`. Read this before wiring the agent into a
product.

---

## 1. What the agent does

It takes a single JSON input describing a player, a stat, a threshold
("line"), and a list of recent post-game results, and returns a structured
analytical write-up with a probability range that the player's next-game
value exceeds the line.

It is an **informational reasoning layer**, not a data-collection layer
and not a recommendation engine.

## 2. What the agent does NOT do

- It does not browse, fetch, or scrape any website.
- It does not call APIs.
- It does not produce betting picks, odds, or recommendations.
- It does not retain data across calls.
- It does not invent stats when input is missing.

If you need any of those, build them as separate services around the
agent — do not relax the prompt.

---

## 3. System architecture (recommended)

```
+------------------+     +----------------------+     +-------------------+
|  Data ingestion  | --> |   Normalizer /       | --> |  Reasoning agent  |
|  (your service)  |     |   Schema builder     |     |  (this prompt)    |
+------------------+     +----------------------+     +-------------------+
       |                          |                            |
       | sportsdata.io            | Validates against          | Returns the
       | api-sports.io            | stat dictionaries.         | 6-section
       | (espn / sofascore /      | Applies window filter      | response.
       |  flashscore /            | upstream so the agent      |
       |  sports-reference for    | gets clean input.          |
       |  reference only)         |                            |
```

**Why three layers:**
- LLMs are unreliable as fetchers — they hallucinate URLs and parse HTML
  inconsistently.
- Schema validation outside the model lets you fail loudly on bad input
  rather than hoping the model refuses.
- Provider rotation, caching, and rate-limiting belong in the ingestion
  layer, not the prompt.

---

## 4. Allowed providers

| Provider              | Tier      | Use                                    |
|-----------------------|-----------|----------------------------------------|
| sportsdata.io         | Primary   | Paid API. Preferred for all sports.    |
| api-sports.io         | Primary   | Paid API. Good for soccer/tennis.      |
| espn.com              | Secondary | Reference / spot-check only.           |
| sports-reference.com  | Secondary | Reference / spot-check only.           |
| sofascore.com         | Secondary | Reference / spot-check only.           |
| flashscore.com        | Secondary | Reference / spot-check only.           |

**Important:** the secondary sites do not have open public APIs for this
use. Scraping them likely violates their Terms of Service. Use them only
for manual verification by a human operator, not as a programmatic
ingestion source.

The agent itself never connects to any of these. It only reads the
`source` field in the input JSON to label provenance.

---

## 5. Sport coverage

| Sport       | Window   | Min n | Notes                                           |
|-------------|----------|-------|-------------------------------------------------|
| NBA         | 30 days  | 4     | Full per-game stat coverage.                    |
| NFL         | 30 days  | 4     | Often only 4 games available within window.     |
| MLB         | 30 days  | 4     | Separate batter / pitcher stat sets.            |
| NHL         | 30 days  | 4     | Separate skater / goalie stat sets.             |
| Soccer      | 30 days  | 4     | Goalkeeper / outfield split enforced.           |
| Tennis      | 30 days  | 4     | Per-match.                                      |
| Badminton   | 30 days  | 4     | Stat set is intentionally minimal.              |
| Golf        | 60 days  | 3     | Round-level stats only. No tournament lines.    |
| NCAAF (D1)  | 30 days  | 4     | FBS only. Below D1 refused.                     |
| NCAAB (D1)  | 30 days  | 4     | D1 only. Below D1 refused.                      |

---

## 6. Input contract

Send exactly one JSON object per request. Required fields:

- `player`, `sport`, `stat`, `line`, `recent_games`, `analysis_date`,
  `source`
- `season_context` is required as an object but its child fields may be
  null
- `opponent` may be null

`recent_games[].value` must be a number, not a string. Dates must be
ISO `YYYY-MM-DD`.

The ingestion layer should reject input before it reaches the agent if:
- `source` is not in the allowed list
- `stat` is not in the sport's stat dictionary
- `recent_games` contains future dates
- `sport` is NCAAF / NCAAB and the league level is below D1 / FBS

Doing this upstream means fewer wasted agent calls and clearer errors.

---

## 7. Example call

### Input

```json
{
  "player": "Nikola Jokic",
  "sport": "NBA",
  "stat": "rebounds",
  "line": 11.5,
  "recent_games": [
    { "date": "2026-04-04", "value": 13, "opponent": "LAL", "minutes_or_duration": 36 },
    { "date": "2026-04-07", "value": 9,  "opponent": "GSW", "minutes_or_duration": 33 },
    { "date": "2026-04-11", "value": 14, "opponent": "DAL", "minutes_or_duration": 38 },
    { "date": "2026-04-15", "value": 12, "opponent": "PHX", "minutes_or_duration": 35 },
    { "date": "2026-04-19", "value": 15, "opponent": "MIN", "minutes_or_duration": 39 },
    { "date": "2026-04-23", "value": 10, "opponent": "OKC", "minutes_or_duration": 31 }
  ],
  "season_context": {
    "minutes_average": 35.4,
    "rest_days": 2,
    "home_or_away": "home"
  },
  "opponent": "Suns",
  "analysis_date": "2026-04-30",
  "source": "sportsdata.io"
}
```

### Expected response shape

A 6-section write-up:

1. Data Validity Check
2. Recent Performance Summary
3. Trend & Variance Analysis
4. Probability Estimate (10-point range)
5. Confidence & Limitations
6. Disclaimer (verbatim)

---

## 8. Failure modes the agent will refuse

The agent is designed to stop, not improvise, when:

- `source` is missing or not in the allowlist
- `stat` is not in the sport's dictionary
- Sample size after filtering is below the sport's min_n
- Golf input requests a tournament-level stat
- NCAAF / NCAAB input is below D1
- Soccer goalkeeper stat is requested for an outfield player (or vice
  versa) based on the data
- Dates are malformed or future-dated for all entries

When refused, the response will name the reason. Surface that reason to
the operator — do not retry blindly.

---

## 9. Tunable parameters

Defaults are set in the prompt. Change them only by editing the prompt
file, not at call time:

| Parameter           | Default                | Where set            |
|---------------------|------------------------|----------------------|
| Analysis window     | 30 days (60 for golf)  | Section 1            |
| Minimum sample n    | 4 (3 for golf)         | Section 1            |
| Recency half-life   | 10 days                | Section 3, Step C    |
| Probability range   | 10-point band          | Section 3, Step F    |

Guidance:
- Shorten half-life (5-7 days) for streaky stats like 3PM or strikeouts.
- Lengthen it (14 days) for stable stats like minutes or innings.
- Raise min_n to 5-6 if you want stricter refusals at the cost of
  fewer answered queries.
- Narrow the probability range to 5 points only if you have validated
  calibration on backtests; otherwise keep 10.

---

## 10. Compliance posture

- The agent does not produce betting advice. It produces probability
  estimates over historical data.
- The disclaimer in Section 6 of the prompt is mandatory and verbatim.
  Do not let downstream UI suppress it.
- This tool has not been calibrated against any sportsbook line and
  should not be marketed as a betting product.
- If you distribute this through a regulated channel, get legal review
  before launch. The recency framing and "probability" output are
  unmistakably adjacent to wagering.

---

## 11. Known limitations

- **No injury or lineup awareness.** A player listed as out will still
  be analyzed if their recent games are supplied. The ingestion layer
  must filter inactives.
- **No matchup modeling.** Opponent strength is referenced only as
  qualitative context, never as a numeric adjustment.
- **No park / surface / weather effects** for MLB, tennis, or golf.
  These would require a richer schema and a different methodology.
- **Badminton coverage is thin** at the provider level. Expect frequent
  insufficient-sample refusals.
- **Tournament golf lines (total strokes, made cut) are out of scope.**
  These need a tournament-level model with field strength, course fit,
  and round-by-round projection.

---

## 12. Versioning

Treat the prompt as a versioned artifact. When you change it:

1. Bump a version string at the top of the prompt file.
2. Re-run any backtest or eval suite you maintain.
3. Note the change in this guide's Changelog section if you add one.

The agent has no memory between calls, so prompt changes take effect
immediately on the next invocation.
