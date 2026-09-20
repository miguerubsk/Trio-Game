# Trio

A web version of **Trio** for playing with friends from your phone, each of us at home. No accounts
and no public lobby: someone creates a room, shares a four-letter code, and the rest join with it.

Trio is a **memory** game: cards are turned face up, everyone sees them, and they go back to exactly
the same place. That one fact drives the whole design, so the server is the only source of truth and
**never sends the value of a face-down card to the browser**. Open the devtools and read the socket
traffic if you want: it isn't there.

The interface is in Spanish, because that's who I play with.

## How it plays

- 36 cards: the numbers 1 to 12, three of each.
- On your turn you flip cards one at a time, choosing each one after seeing the last: a card from the
  middle of the table, or the **lowest or highest** card in anyone's hand, your own included.
- If all three match, you take the trio. If they don't, everything goes back where it was.
- Flipped cards stay face up until **the player whose turn it is presses «continuar»**. They decide
  how long everyone else gets to memorise them. Then the turn passes on.
- First to **3 trios** wins, and so does anyone who makes the **trio of sevens**, on the spot.
- **Teams mode** (4 or 6 players): partners play with no cards in the middle, their trios add up, and
  each pair may swap a card at the start and every time a rival team takes a trio.

### Bots

If you're short of people, the host can **add bots** to the room and they count as players. The room
also sets how good their memory is (weak, normal, iron) and how long a disconnected player is waited
for before a bot takes over — 60 seconds by default, or never. The player gets their seat back as
soon as they reconnect, and the host can bring the bot in earlier from that player's row.

Bots play with exactly the information you have: they remember what was turned face up in front of
everyone, and nothing else. They cannot see face-down cards.

## Running it at home

You need Docker. From the project folder:

```bash
docker compose up --build -d
```

Or without compiling anything, using the published image (`amd64`, `arm64`, `armv7`):

```bash
docker compose pull trio && docker compose up -d --no-build
```

That's enough to play on your own network: open `http://<server-ip>:3060` on each phone. (Change the
left-hand number in `docker-compose.yml` if that port is taken.) To try it from a single computer,
use **separate private windows**: the session is stored per browser, so two ordinary tabs are the
same player.

To stop it: `docker compose down`.

## Playing from outside your network

The server is never exposed directly. It goes out through a Cloudflare tunnel that connects from the
inside.

**Quick tunnel**, no account and nothing to configure. The address is random and changes every time:

```bash
docker compose --profile quick-tunnel up -d
docker compose logs quick-tunnel | grep trycloudflare
```

That `https://….trycloudflare.com` address is the one you pass around.

**Named tunnel**, if you want a fixed address on your own domain. In the
[Cloudflare Zero Trust](https://one.dash.cloudflare.com) dashboard → *Networks* → *Tunnels*, create a
tunnel, point it at `http://trio:3000` and copy its token:

```bash
cp .env.example .env     # and paste the token into TUNNEL_TOKEN
docker compose --profile tunnel up -d
```

With either tunnel you can drop the `ports` section from `docker-compose.yml` if you'd rather the
server wasn't reachable on the local network at all.

## Development

Node 20 or newer. If you don't have it installed, everything below runs inside a container:

```bash
docker run --rm -it -v "$PWD":/w -w /w -e HOME=/tmp -p 5173:5173 node:20-alpine <command>
```

```bash
npm install
npm run dev        # client on :5173 (the only one you open) and server on :3000
npm test           # engine, server and client
npm run typecheck
npm run lint
npm run build
```

The repository is a monorepo with three packages:

| Package | What it is |
|---|---|
| `packages/shared` | The game engine: cards, dealing, turns, trios, teams, and the per-player view. No dependencies and no I/O, so all of it is tested without starting anything. |
| `packages/server` | Node + Socket.IO: rooms, codes, sessions, validation of every action, and the inactivity safeguards. It also serves the compiled client. |
| `packages/client` | React + Vite: home, room and table. Mobile-first. |

Two things worth knowing before touching anything:

- **`buildView` builds each view field by field** instead of copying the state and deleting the
  secrets. That way a new card added to the state can't leak by accident. Tests serialise the view
  and look for values that shouldn't be in it.
- **The play log is not a cheat sheet.** A flipped card is logged with its value only while it is
  still face up. Once it goes back, the log keeps who flipped it and from where, but not what it was.
  Remembering that is the game.

## Releases

Every push to `master` runs the checks and publishes the image to Docker Hub as
`miguerubsk/trio-game:master`, plus the commit sha. A **`v*` tag** publishes `latest` and the version
number as well, and creates a GitHub release:

```bash
npm version 0.2.0 --no-git-tag-version
git commit -am "Version 0.2.0" && git push
git tag -s -m "Trio 0.2.0" v0.2.0 && git push --tags
```

The workflow stops on purpose unless two things hold: the tag matches the version in `package.json`,
and the tag is **signed** with the project key (it runs `git verify-tag` before building anything).
A release exists because its owner tagged it, not because someone with write access pushed a tag.

Each release carries the image for every platform ready for `docker load`, a tarball that runs on
plain Node without Docker, `SHA512SUMS`, its PGP signature and the public key. To check what you
downloaded:

```bash
gpg --recv-keys 683C47647FCB2433BBF84CE4CEDF03871B2B9517
gpg --verify SHA512SUMS.asc SHA512SUMS
sha512sum -c SHA512SUMS
```

It's the same key that signs the commits in this repository, so if you already trust those there's
nothing new to trust.

Building a release needs four repository secrets: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (an
access token, not the password) to publish the image, and `GPG_PRIVATE_KEY` and `GPG_PASSPHRASE` to
sign the checksums.

## Known limits

- Games live in memory: restarting the server loses whatever was being played.
- A room with no activity is dropped after two hours.
- 3 to 6 players, 4 or 6 in teams.

## Roadmap

- **Internationalisation.** The interface is Spanish only. The strings sit partly in
  `packages/client/src/text.ts` and partly inline in the components; the work is to pull them all
  into one place, add English, and let you pick a language.
- **Spicy mode.** The card model already carries the `secondary` field for the small corner numbers,
  and the card front leaves room for them, so what's missing is the rules in the engine and drawing
  those numbers. Dealing and the per-player view stay as they are.

## License

The code in this repository is free software under the **GNU GPL v3** (see [LICENSE](LICENSE)). The
game it recreates is not mine, which is what the credits below are about.

## Credits

**Trio** is a game by **Kaya Miyano**, published in Spain by **Devir**. This is a homemade,
non-commercial version for playing with friends, built without their artwork or their visual
identity: the cards here are drawn from scratch. If you enjoy it, buy the real thing, which is better
around a table.
