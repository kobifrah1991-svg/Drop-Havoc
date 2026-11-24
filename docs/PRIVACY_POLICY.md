# Drop Havoc – Privacy Policy

> This document describes the data practices of the Drop Havoc game as implemented in the source code at the date below. **It is a draft for review. It is not legal advice and is not a binding legal opinion.** A lawyer should review it before it is published or used in a store listing.

_Last updated: 17 November 2026_

Drop Havoc ("the game") is operated by **Scitedra Games / Scitedra Labs**, Israel (the "controller"; this identification is a **proposal**, pending confirmation of the registered business name, number and address). For privacy questions, access requests and deletion requests, contact **scitedra.labs@gmail.com**. You can also delete your account in the game, from Settings and from the pause screen, as described below.

## What we collect

| Data | When | Why |
|---|---|---|
| Google account email, first name, and (if Google provides it) profile photo | Only if you choose "Sign in with Google" | To keep your account (level, credits, items, league points) and to let signed-in friends invite you by email while they are online. Other players see only your first name or chosen nickname, never your email. The account is stored under a key derived from your verified email. |
| Random guest ID | When you play without signing in | A random device token is stored on your device and on our server so guest progress can be kept. At most 10 new guest accounts are accepted per IP address per hour. |
| Nickname, chosen character and cosmetics | When you play | Shown to other players in the match. The public room list and the league table show display names (and league points/level), not email addresses. |
| Gameplay statistics (kills, deaths, level, credits, owned and equipped in-game items, match preferences, league points) | While you play online, and when practice results are reported | To run the game, keep your progress and operate the seasonal league. In-game credits have no real-money value and cannot be bought with real money. There is currently no real-money billing. |
| IP address | When you connect to the game server | To run the connection, apply rate limits, limit new guest accounts, and enforce bans or mutes for abuse or cheating (guest bans may be tied to IP and device token). |
| Chat messages | When you chat | Delivered to players in the same room and filtered automatically. Messages are not stored, except when a player report includes a short snippet, or when a moderator or admin acts. |
| Player reports | When you or another player submit a report | The report stores the reporter's ID, the reported player's ID, a reason, an optional short text snippet, and the time. Used only for moderation and safety. |
| Voice (microphone, push-to-talk) | Only while you hold the talk button, and only after you grant microphone permission | Sent directly to the other players in your room over an encrypted WebRTC link. We do not record or store voice. You can refuse the permission and still play. |
| IP address shared with other players and connection brokers | In rooms with friends and in voice chat | Devices connect directly where possible (WebRTC). Other players' devices can see your IP address, as with most peer-to-peer games. A connection broker (PeerJS) sees it briefly to introduce the devices. Google STUN servers are used to help the connection. If a direct voice link fails, a public TURN relay (Open Relay by Metered) forwards the already-encrypted audio and can see the IP addresses of the devices it connects. |
| Admin, ban and mute records; admin audit log | When a moderator or admin acts, or when someone tries to use the admin login | An audit log of admin actions (including the actor's email or login method, target, result and IP) and records of bans and mutes (name, email or guest token, IP for guests, reason, expiry, who issued it). Staff role lists are stored so the right people keep access after a server restart. |
| Technical logs | When the game server or hosting platform runs | The server writes operational messages (for example whether account storage loaded). The hosting platform may keep ordinary connection or request logs, which can include IP address and similar technical data, according to that provider's own policy. |

Offline practice against bots in the browser sends no match data to us until you are online and the client reports a capped practice result in order to pay in-game rewards. Rooms hosted by a friend on their own device are not received by our game server as gameplay data; the peer-to-peer connection services above still apply.

On your device the game may store a guest ID, a sign-in choice and similar settings in local storage. Clearing the game's data, or uninstalling the app, removes that copy from the device. The Android app does not allow OS backup of its data.

## Services and processors

These providers process data on our behalf or receive technical data as described, for the purposes and in the locations below. The exact cloud region is the one configured on each account; we will name a specific region here once it is confirmed.

| Provider | What it does | What is stored or seen | Location |
|---|---|---|---|
| **Render** | Hosts the game server (WebSocket and HTTPS), including an in-memory copy of accounts and, while the instance disk lasts, local files | Connection data (including IP), rate-limit counters (held in memory, not in Redis), session data, optional local copies of accounts (`data/`), player reports (`data/reports.jsonl`) and admin files (`data/admin-audit.log`, `data/bans.json`, `data/admins.json`). On Render's free plan the disk is wiped when the service sleeps or restarts, so durable copies are kept in Firestore and, if configured, Upstash. | Render's cloud (region as configured on the service) |
| **Google / Firebase Authentication** | "Sign in with Google" | Email, name, profile photo and a verified ID token. Used to identify the signed-in player. Sign-in uses Firebase project `cyberlab-3d`. The Android app opens the sign-in page in the phone's browser and receives tokens back in the app. The sign-in page may load the Firebase JavaScript SDK from Google (`gstatic.com`). | Google Cloud / Google's locations |
| **Firebase Hosting `init.js` (fallback)** | If public Firebase settings are not already built into the client, the game may load the reserved script `https://scitedra-games.web.app/__/firebase/init.js` (or the matching `firebaseapp.com` host) to discover those settings so Google sign-in can be offered | A normal HTTPS request to Google/Firebase Hosting, which includes your IP address and standard request metadata. The script itself only supplies public project settings (for example API key and project ID). It is a fallback; when the settings are already built in, this request is not made. | Google / Firebase Hosting |
| **Cloud Firestore (Google)** | Primary durable copy of player accounts, and (when configured) of moderation data and player reports | Player accounts under `{FIRESTORE_PREFIX}/players/{accountId}`: the account record (name, level, credits, XP, items, stats, league, preferences, timestamps). Index fields on the document include name, level, credits and last update. Staff and ban/mute data under `{FIRESTORE_PREFIX}/admin/staff` and `{FIRESTORE_PREFIX}/admin/moderation`. Player reports in the top-level `reports` collection (`reporterId`, `reportedId`, `reason`, `snippet`, `at`) when Firestore reporting is enabled. The default project name in the deploy file is `scitedra-games`. | Google Cloud (region as configured on the Firebase/Google Cloud project) |
| **Upstash Redis** | Optional extra copy of the accounts database, so progress can survive a server restart | A single Redis key (default `drop-havoc:accounts`) holding the accounts JSON (the same progress data as above). Upstash is **not** used for rate limits, the lobby, chat or reports in the current code. Those stay in memory, in local server files, or in Firestore. | Upstash's cloud (region as configured on the Upstash database) |
| **Google Fonts** | Loads the Rubik and Assistant typefaces used in the web game (`fonts.googleapis.com` / `fonts.gstatic.com`) | Your IP address and standard request metadata are sent to Google when the page loads the fonts. | Google |
| **GitHub Pages** | Hosts the static game files, the sign-in page and update checks | Ordinary web requests for those files, which may include IP address and similar technical data, under GitHub's own policy. | GitHub's cloud |
| **PeerJS (0.peerjs.com)** | Briefly introduces devices so a friend-hosted room can connect over WebRTC | IP addresses and connection signalling, only to set up the link. Game traffic then flows device to device. | PeerJS's public broker |
| **Google STUN** (`stun.l.google.com`, `stun1.l.google.com`) | Helps WebRTC find a network path | IP address and port, for the connection handshake only. | Google |
| **Metered Open Relay (TURN)** | Fallback relay for voice chat when a direct link is blocked | Forwards already-encrypted voice packets; can see the IP addresses of the devices it connects. It is not used to store voice. | Metered / Open Relay |

We share data with competent authorities only when the law requires it.

## What we do not do

- We do not sell personal data, and we do not show ads or use an advertising ID.
- There are no real-money purchases in the game.
- We do not use third-party analytics or tracking SDKs.

## Retention

The retention periods in this section are **proposals, pending the operator's confirmation and legal review**. They are not yet a final decision.

- **Account and progress data** is kept while the account is active, and is deleted 12 months after the last login, or sooner on request. (12 months is a proposed period.)
- **Player reports** are kept for **90 days** (a proposed default), and then deleted, unless a longer period is required to finish an open moderation case or to meet a legal obligation.
- **Ban, mute and admin audit records** are kept for up to 12 months after the restriction ends, or for 12 months after the action if there is no end date, unless a longer period is required by law. (These 12-month periods are proposals.) A ban that is set with no end date stays in force until it is lifted; the underlying record follows the same retention rule once it is no longer in force.
- **Guest data on your device** is removed when you clear the game's data or uninstall the app. A copy on the server is handled like other account data.
- **Technical hosting logs** follow the relevant provider's retention settings.

There is currently no automatic deletion job in the game code. If confirmed, the periods above are the policy we intend to apply operationally, including by honouring deletion requests.

## Your rights

Depending on the law that applies to you, you may have the right to access the personal data we hold about you, to have it corrected, to have it deleted, to restrict or object to certain processing, and to receive a copy of data you provided.

These rights are provided under Israel's Privacy Protection Law, including Amendment 13. You may also lodge a complaint with the Israeli Privacy Protection Authority.

If you are in the European Economic Area, the United Kingdom or another place where the GDPR or a similar law applies, you may have the additional rights given by that law (including data portability, the right to object to processing based on legitimate interests, and the right to lodge a complaint with your local supervisory authority). We include this section because the game is available online; whether we have users in those places should be confirmed before publication.

To delete your account, use the in-game option described below once it is released, or email us. To exercise other rights, email **scitedra.labs@gmail.com**:

- from the Google account you used to sign in; or
- for a guest account, tell us your nickname and roughly when and on which platform you played.

We will respond to email requests within 30 days, or sooner if the applicable law requires it. We may need to ask you for enough information to identify the account and to prevent someone else from requesting your data.

<h2 id="delete">How to delete your account and data</h2>

Once in-app deletion is released, you can delete your account in the game: in **Settings**, and on the **pause** screen (under Settings). This will be the primary way to delete a Google or guest account. Until then, and as an alternative afterwards, email us as described below.

You can also email **scitedra.labs@gmail.com** with the subject "Delete my Drop Havoc account". Send it from the Google account you signed in with, or, for a guest account, write your nickname and roughly when you last played. We will respond to email requests within 30 days, or sooner if the applicable law requires it, and confirm by email.

Upon deletion, we delete the profile, progress, inventory, the Firestore player document and its backups. The optional Upstash copy of the account is removed on the next full save of the accounts data, which is scheduled as part of the deletion. Reports you sent are kept for moderation, but the sender id is replaced by a one-way hash (HMAC). Reports about you are deleted, unless there is an active ban against you, in which case they are kept with the same hashed id. Bans and mutes are not removed; they are kept only as hashed identifiers. Your email address, user id, guest token, name and IP address are deleted in plaintext form; only hashes remain so that an existing ban or mute can still be applied. Entries in the admin audit log may remain, but plaintext identifiers are removed from them. If the email is also listed in a staff or moderator record, that staff entry is deleted too.

If deletion cannot start because of a server configuration problem, nothing is deleted, and you will be told that it failed. You can try again, or email us and we will complete the request. If the account data on the game server is removed but a stored Firestore copy cannot be deleted, you will be told that it failed. Please try again (a retry can finish removing any remaining copy), or email us and we will complete the request.

Records we must keep for a legal obligation may be kept for the periods set out above and then deleted.

Uninstalling the app or clearing its data removes the guest ID and local settings from your device, but it does not by itself delete the server copy. Use the in-game option (once released) or the email above if you also want the server copy removed.

## Children

The game is intended for players aged **16 and over** (proposed minimum age, pending the operator's confirmation). It contains realistic weapons, violence and chat with other players, including strangers. We do not knowingly collect personal data from children under that age. If you believe a child under that age gave us personal data, contact us and we will delete it.

## International transfers

Some of the providers listed above may process data outside Israel (for example in the United States or the European Union), according to the region configured on each service. Where a transfer law applies, we rely on the provider's published terms and transfer tools (such as standard contractual clauses) and on the need to operate the online game. Specific regions will be filled in once they are confirmed.

## Security

Connections to the game use HTTPS and a secure WebSocket. WebRTC voice and peer-to-peer game links are encrypted by design. Access to admin tools requires a verified Google account or the operator's secret admin code. That said, no online service is completely secure.

## Changes

We will post changes on this page and update the date at the top. If a change is material, we will also say so in the game or by email where we have an address and can reasonably do so.
