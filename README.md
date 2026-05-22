# How good was my guess

A [Tampermonkey](https://www.tampermonkey.net/) userscript for
[GeoGuessr](https://www.geoguessr.com/).

*For the curious GeoGuessr who doesn't want to wait the extra 15 seconds.*

In a GeoGuessr duel the score and distance of your guess are only revealed once
the round ends. This userscript surfaces them the instant you commit your guess
— both in the browser console and as a small overlay just below the round timer.

## What it does

- Logs each of your guesses to the browser console: round number, distance and
  score.
- Displays `score / distance` in an overlay positioned beneath the round timer,
  e.g. `4445 / 217 km`.
- Only reports *your* guesses — the opponent's guesses stay hidden, exactly as
  the game intends.

Distance is formatted as:

| Distance        | Shown as |
| --------------- | -------- |
| 10 km and above | `217 km` |
| 1 km – 10 km    | `5.3 km` |
| below 1 km      | `840 m`  |

## How it works

GeoGuessr duels run over a WebSocket. The script wraps `window.WebSocket`,
watches for `DuelPlayerGuessed` messages, picks out the entry belonging to the
player (identified in-band from the `SubscribeToLobby` message) and reads the
`distance` and `score` fields.

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Open the
   [userscript](https://github.com/alech/how-good-was-my-guess/raw/refs/heads/main/how-good-was-my-guess.user.js)
   — Tampermonkey detects the `.user.js` file and prompts you to install it.
3. Reload GeoGuessr and start a duel.

Set `DEBUG = true` near the top of the script for verbose console output.

## Caveat

When you are the *second* player to guess, the round ends almost immediately, so
the overlay only flashes up for a moment before the result screen takes over.
That is expected.

## License

Released under [CC0 1.0 Universal](LICENSE) — public domain.
