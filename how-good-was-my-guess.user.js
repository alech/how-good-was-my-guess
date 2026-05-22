// ==UserScript==
// @name         How good was my guess
// @namespace    https://github.com/alech/how-good-was-my-guess
// @version      0.3.1
// @description  Shows the distance and score of your own guess in GeoGuessr duels, in the console and on the page below the round timer.
// @author       Alexander Klink
// @match        https://www.geoguessr.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const LOG_PREFIX = '[how-good-was-my-guess]';

    // Set to true for verbose diagnostics (every websocket/worker created, every
    // incoming message code, the full DuelPlayerGuessed payload).
    const DEBUG = false;

    // The local player's id, learned from the outgoing SubscribeToLobby /
    // SubscribeToLiveStream messages (they fire at duel start, before round 1).
    let subscribeId = null;

    // The opponent's player id, learned from incoming LiveStreamSamples (the
    // live stream we receive is the opponent's). Used only to guard against
    // spectating, where the subscribe id is a spectated player, not us.
    let opponentId = null;

    // gameId:roundNumber pairs already reported, so each guess is shown only
    // once even though every DuelPlayerGuessed message carries the full history.
    const loggedRounds = new Set();

    // ---------------------------------------------------------------- display

    let displayEl = null;
    let repositionTimer = null;

    function getDisplayEl() {
        if (displayEl && displayEl.isConnected) return displayEl;
        displayEl = document.createElement('div');
        displayEl.id = 'hgwmg-display';
        Object.assign(displayEl.style, {
            position: 'fixed',
            zIndex: '2147483000',
            padding: '4px 14px',
            borderRadius: '10px',
            background: 'rgba(20, 17, 36, 0.85)',
            border: '1px solid rgba(121, 80, 229, 0.9)',
            color: '#ffffff',
            fontFamily: 'inherit',
            fontWeight: '700',
            fontSize: '18px',
            lineHeight: '1.35',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            textAlign: 'center',
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
            display: 'none',
        });
        (document.body || document.documentElement).appendChild(displayEl);
        return displayEl;
    }

    // The round timer is a ClockTimer component. Its CSS-module class keeps the
    // "clock-timer_timerContainer" prefix across builds; only the hash changes.
    function findTimer() {
        const candidates = document.querySelectorAll('[class*="clock-timer_timerContainer"]');
        for (const el of candidates) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return el;
        }
        return null;
    }

    function positionUnderTimer() {
        const el = getDisplayEl();
        const timer = findTimer();
        if (!timer) {
            el.style.visibility = 'hidden';
            return;
        }
        const r = timer.getBoundingClientRect();
        el.style.left = r.left + r.width / 2 + 'px';
        el.style.top = r.bottom + 8 + 'px';
        el.style.transform = 'translateX(-50%)';
        el.style.visibility = 'visible';
    }

    function showDisplay(text) {
        const el = getDisplayEl();
        el.textContent = text;
        el.style.display = 'block';
        positionUnderTimer();
        if (repositionTimer === null) {
            repositionTimer = setInterval(positionUnderTimer, 200);
        }
    }

    function hideDisplay() {
        if (!displayEl) return;
        displayEl.style.display = 'none';
        if (repositionTimer !== null) {
            clearInterval(repositionTimer);
            repositionTimer = null;
        }
    }

    // Distance comes from the API in meters.
    function formatDistance(meters) {
        if (meters >= 10000) return Math.round(meters / 1000) + ' km';
        if (meters >= 1000) return (meters / 1000).toFixed(1) + ' km';
        return Math.round(meters) + ' m';
    }

    // ------------------------------------------------------------- ws parsing

    function handleOutgoing(data) {
        if (typeof data !== 'string') return;
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (e) {
            return;
        }
        const code = msg && msg.code;
        if (DEBUG && code && code !== 'HeartBeat') {
            console.log(LOG_PREFIX, 'outgoing message code:', code);
        }
        if ((code === 'SubscribeToLobby' || code === 'SubscribeToLiveStream') && msg.playerId) {
            subscribeId = msg.playerId;
        }
    }

    function handleIncoming(data) {
        if (typeof data !== 'string') return;
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (e) {
            return;
        }
        if (!msg || !msg.code) return;

        // The live stream we receive in a 1v1 duel is the opponent's, so its
        // playerId reliably identifies the opponent.
        if (msg.code === 'LiveStreamSamples') {
            if (msg.playerId) opponentId = msg.playerId;
            return;
        }

        if (DEBUG && msg.code !== 'HeartBeat') {
            console.log(LOG_PREFIX, 'incoming message code:', msg.code);
        }

        // A new round (or the end of one) clears the previous result so the
        // overlay does not linger over the next round's timer.
        if (msg.code === 'DuelNewRound' || msg.code === 'DuelRoundTimedOut') {
            hideDisplay();
            return;
        }

        if (msg.code !== 'DuelPlayerGuessed') return;

        const state = msg.duel && msg.duel.state;
        if (!state) return;

        // The playing player is the one whose id matches our outgoing Subscribe
        // messages. If that turns out to be the opponent (whose live stream we
        // receive), we are spectating rather than playing, so show nothing.
        const players = [];
        for (const team of state.teams || []) {
            for (const player of team.players || []) players.push(player);
        }
        const myPlayer = players.find((p) => p.playerId === subscribeId);
        if (!myPlayer) return; // not a player in this duel
        if (opponentId && myPlayer.playerId === opponentId) return; // spectating

        // Report any of the playing player's guesses we have not shown yet.
        // A DuelPlayerGuessed triggered solely by the opponent adds nothing new
        // to our own guess list, so it produces no output. Guesses with a null
        // score are unrevealed placeholders and are skipped.
        const newGuesses = (myPlayer.guesses || []).filter((g) => {
            if (g.score === null || g.score === undefined) return false;
            return !loggedRounds.has((state.gameId || '') + ':' + g.roundNumber);
        });
        if (newGuesses.length === 0) return;

        if (DEBUG) console.log(LOG_PREFIX, 'your guess - full message:', msg);

        for (const guess of newGuesses) {
            loggedRounds.add((state.gameId || '') + ':' + guess.roundNumber);
            console.log(
                LOG_PREFIX,
                `Round ${guess.roundNumber}: your guess was ` +
                    `${(guess.distance / 1000).toFixed(2)} km (${Math.round(guess.distance)} m) away, ` +
                    `score ${guess.score}`
            );
        }

        const latest = newGuesses[newGuesses.length - 1];
        showDisplay(`${latest.score} / ${formatDistance(latest.distance)}`);
    }

    // --------------------------------------------------------- ws interception

    function instrumentSocket(ws) {
        ws.addEventListener('message', (event) => {
            try {
                handleIncoming(event.data);
            } catch (e) {
                console.error(LOG_PREFIX, 'error handling incoming message', e);
            }
        });

        const nativeSend = ws.send.bind(ws);
        ws.send = function (data) {
            try {
                handleOutgoing(data);
            } catch (e) {
                console.error(LOG_PREFIX, 'error handling outgoing message', e);
            }
            return nativeSend(data);
        };
    }

    const NativeWebSocket = window.WebSocket;

    window.WebSocket = new Proxy(NativeWebSocket, {
        construct(target, args) {
            // GeoGuessr passes a URL object (not a string) as args[0].
            if (DEBUG) console.log(LOG_PREFIX, 'WebSocket created:', String(args[0]));

            const ws = Reflect.construct(target, args);
            try {
                instrumentSocket(ws);
            } catch (e) {
                console.error(LOG_PREFIX, 'error instrumenting socket', e);
            }
            return ws;
        },
    });

    console.log(LOG_PREFIX, 'WebSocket interception installed');
})();
