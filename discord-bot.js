// WorldGaming Hub – Discord-Bot (automatisch gepackt aus werkzeuge/discord-bot.js – nicht von Hand ändern)
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// squadlogik.js
var require_squadlogik = __commonJS({
  "squadlogik.js"(exports2, module2) {
    var SR_QUEUES = /* @__PURE__ */ new Set([400, 420, 430, 440, 480, 490, 700]);
    var TOURNAMENTS = [
      { id: "wins", icon: "\u{1F3C6}", name: "Meiste Siege", unit: "Siege", min: 1, better: "max", fmt: (v) => `${v}` },
      { id: "kda", icon: "\u{1F3AF}", name: "Beste KDA", unit: "KDA", min: 5, better: "max", fmt: (v) => v.toFixed(2).replace(".", ",") },
      { id: "winrate", icon: "\u{1F4C8}", name: "Beste Siegquote", unit: "%", min: 8, better: "max", fmt: (v) => `${v.toFixed(1).replace(".", ",")} %` },
      { id: "csmin", icon: "\u{1F33E}", name: "Beste CS pro Minute", unit: "CS/Min", min: 5, better: "max", fmt: (v) => v.toFixed(2).replace(".", ",") },
      { id: "champs", icon: "\u{1F3B2}", name: "Siege mit verschiedenen Champions", unit: "Champions", min: 1, better: "max", fmt: (v) => `${v}` },
      { id: "dmg", icon: "\u{1F4A5}", name: "Meister Schaden pro Minute", unit: "Schaden/Min", min: 5, better: "max", fmt: (v) => Math.round(v).toLocaleString("de-DE") },
      { id: "vision", icon: "\u{1F441}\uFE0F", name: "Beste Sicht (Vision pro Minute)", unit: "Vision/Min", min: 5, better: "max", fmt: (v) => v.toFixed(2).replace(".", ",") }
    ];
    function weekStart(date = /* @__PURE__ */ new Date()) {
      const m = new Date(date);
      m.setHours(0, 0, 0, 0);
      m.setDate(m.getDate() - (m.getDay() + 6) % 7);
      return m;
    }
    function keyOf(monday) {
      return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    }
    function weekRange(date = /* @__PURE__ */ new Date()) {
      const start = weekStart(date);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start: start.getTime(), end: end.getTime(), key: keyOf(start) };
    }
    function previousWeek(date = /* @__PURE__ */ new Date()) {
      const s = weekStart(date);
      s.setDate(s.getDate() - 1);
      return weekRange(s);
    }
    function hash(text) {
      let h = 2166136261;
      for (const ch of String(text)) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }
    function tournamentFor(key) {
      const i = hash(`turnier:${key}`) % TOURNAMENTS.length;
      const d = /* @__PURE__ */ new Date(`${key}T12:00:00`);
      d.setDate(d.getDate() - 7);
      const prevKey = keyOf(weekStart(d));
      const prev = hash(`turnier:${prevKey}`) % TOURNAMENTS.length;
      return TOURNAMENTS[i === prev ? (i + 1) % TOURNAMENTS.length : i];
    }
    function rewardsFor(n) {
      if (n < 2) return [];
      if (n === 2) return [250];
      if (n <= 4) return [500, 250];
      return [800, 400, 200];
    }
    function personKey(r) {
      return `${String(r.name || "").toLowerCase()}#${String(r.tag || "").toLowerCase()}`;
    }
    function inRange(rows, range) {
      return rows.filter((r) => {
        const t = new Date(r.ended_at).getTime();
        return t >= range.start && t < range.end && SR_QUEUES.has(Number(r.queue));
      });
    }
    function playersOf(rows) {
      const by = /* @__PURE__ */ new Map();
      for (const r of rows) {
        const k = personKey(r);
        const p = by.get(k) || { key: k, name: r.name, tag: r.tag, puuid: r.puuid, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, csMinutes: 0, damage: 0, vision: 0, minutes: 0, winChamps: /* @__PURE__ */ new Set(), pentas: 0, quadras: 0 };
        const min = (Number(r.duration) || 0) / 60;
        p.games += 1;
        p.wins += r.win ? 1 : 0;
        p.kills += r.kills || 0;
        p.deaths += r.deaths || 0;
        p.assists += r.assists || 0;
        if (r.role !== "UTILITY") {
          p.cs += r.cs || 0;
          p.csMinutes += min;
        }
        p.damage += r.damage || 0;
        p.vision += r.vision || 0;
        p.minutes += min;
        if (r.win) p.winChamps.add(r.champ);
        p.pentas += r.penta || 0;
        p.quadras += r.quadra || 0;
        by.set(k, p);
      }
      return [...by.values()];
    }
    function valueOf(t, p) {
      switch (t.id) {
        case "wins":
          return p.wins;
        case "kda":
          return (p.kills + p.assists) / Math.max(1, p.deaths);
        case "winrate":
          return p.games ? p.wins / p.games * 100 : 0;
        case "csmin":
          return p.csMinutes > 0 ? p.cs / p.csMinutes : 0;
        case "champs":
          return p.winChamps.size;
        case "dmg":
          return p.minutes > 0 ? p.damage / p.minutes : 0;
        case "vision":
          return p.minutes > 0 ? p.vision / p.minutes : 0;
        default:
          return 0;
      }
    }
    function standings(rows, range) {
      const t = tournamentFor(range.key);
      const players = playersOf(inRange(rows, range));
      const ranked = players.filter((p) => p.games >= t.min).map((p) => ({ ...p, value: valueOf(t, p) })).sort((a, b) => (t.better === "max" ? b.value - a.value : a.value - b.value) || b.games - a.games || a.name.localeCompare(b.name));
      const rewards = rewardsFor(ranked.length);
      let place = 0;
      let lastValue = null;
      const table = ranked.map((p, i) => {
        if (lastValue === null || Math.abs(p.value - lastValue) > 1e-9) place = i + 1;
        lastValue = p.value;
        return {
          key: p.key,
          name: p.name,
          tag: p.tag,
          puuid: p.puuid,
          games: p.games,
          wins: p.wins,
          value: p.value,
          text: t.fmt(p.value),
          place,
          reward: rewards[place - 1] || 0
        };
      });
      const waiting = players.filter((p) => p.games < t.min).map((p) => ({ key: p.key, name: p.name, tag: p.tag, games: p.games, need: t.min - p.games }));
      return {
        key: range.key,
        start: range.start,
        end: range.end,
        tournament: { id: t.id, icon: t.icon, name: t.name, unit: t.unit, min: t.min },
        table,
        waiting,
        rewards,
        participants: table.length
      };
    }
    var CHALLENGE_REWARD = 300;
    function challenge(rows, range) {
      const players = playersOf(inRange(rows, range));
      const active = players.length;
      const target = Math.max(10, active * 5);
      const wins = players.reduce((a, p) => a + p.wins, 0);
      return {
        key: range.key,
        target,
        wins,
        active,
        done: wins >= target,
        reward: CHALLENGE_REWARD,
        contributors: players.filter((p) => p.games > 0).map((p) => ({ key: p.key, name: p.name, wins: p.wins, games: p.games })).sort((a, b) => b.wins - a.wins)
      };
    }
    function together(rows) {
      const byGame = /* @__PURE__ */ new Map();
      for (const r of rows) {
        if (!SR_QUEUES.has(Number(r.queue))) continue;
        const g = byGame.get(r.game_id) || { win: r.win, people: /* @__PURE__ */ new Set() };
        g.people.add(personKey(r));
        byGame.set(r.game_id, g);
      }
      const games = [...byGame.values()].filter((g) => g.people.size >= 2);
      return { games: games.length, wins: games.filter((g) => g.win).length };
    }
    function highlights(rows, range) {
      return rows.filter((r) => {
        const t = new Date(r.ended_at).getTime();
        return t >= range.start && t < range.end && (r.penta > 0 || r.quadra > 0);
      }).map((r) => ({ name: r.name, champ: r.champ, kind: r.penta > 0 ? "penta" : "quadra", kda: `${r.kills}/${r.deaths}/${r.assists}`, win: r.win }));
    }
    module2.exports = { TOURNAMENTS, weekRange, previousWeek, tournamentFor, rewardsFor, standings, challenge, together, highlights, personKey, CHALLENGE_REWARD };
  }
});

// saisons.js
var require_saisons = __commonJS({
  "saisons.js"(exports2, module2) {
    var TIERS = 50;
    var XP_PER_TIER = 450;
    var UPGRADE_PRICE = 1e4;
    var XP = { game: 100, win: 50, task: 100, weekly: 500 };
    function buildTiers(milestones) {
      const tiers = [];
      const fillerFree = [];
      const fillerPrem = [];
      for (let t = 1; t <= TIERS; t += 1) if (!milestones[t]) {
        fillerFree.push(t);
        fillerPrem.push(t);
      }
      const freeFill = {};
      fillerFree.forEach((t, i) => {
        freeFill[t] = i % 4 === 3 ? { type: "item", key: "reroll", count: 1 } : { type: "points", amount: 60 + Math.round(i / fillerFree.length * 8) * 10 };
      });
      const premMilestonePoints = Object.values(milestones).reduce((a, m) => a + (m.premium?.type === "points" ? m.premium.amount : 0), 0);
      const boosterAt = /* @__PURE__ */ new Set([fillerPrem[10], fillerPrem[26]]);
      const pointTiers = fillerPrem.filter((t) => !boosterAt.has(t));
      const weights = pointTiers.map((_, i) => 1 + i / pointTiers.length);
      const wsum = weights.reduce((a, b) => a + b, 0);
      const budget = 15e3 - premMilestonePoints;
      const premFill = {};
      let given = 0;
      pointTiers.forEach((t, i) => {
        const amount = i === pointTiers.length - 1 ? budget - given : Math.round(budget * weights[i] / wsum / 10) * 10;
        given += amount;
        premFill[t] = { type: "points", amount };
      });
      for (const t of boosterAt) premFill[t] = { type: "item", key: "booster", count: 1 };
      for (let t = 1; t <= TIERS; t += 1) {
        const m = milestones[t];
        tiers.push({ tier: t, milestone: !!m, free: m?.free || freeFill[t], premium: m?.premium || premFill[t] });
      }
      return tiers;
    }
    var SEASONS = [
      {
        id: "2026-11",
        year: 2026,
        month: 11,
        // November
        name: "Gewitternacht",
        icon: "\u26A1",
        design: "gewitternacht",
        tiers: buildTiers({
          5: { free: { type: "points", amount: 300 }, premium: { type: "unlock", id: "color:saison:2026-11", name: "Saison-Farbe \u201ESturmblau\u201C", icon: "\u{1F3A8}", kind: "color" } },
          10: { free: { type: "item", key: "booster", count: 1 }, premium: { type: "unlock", id: "confetti:gewitter", name: "Konfetti \u201EBlitze\u201C", icon: "\u26A1", kind: "confetti" } },
          15: { free: { type: "emoji", id: "emoji:2026-11", emoji: "\u{1F329}\uFE0F", name: "Scoreboard-Emoji \u{1F329}\uFE0F" }, premium: { type: "unlock", id: "effect:gewitter", name: "Effekt \u201EGewitterregen\u201C", icon: "\u{1F327}\uFE0F", kind: "effect" } },
          20: { free: { type: "points", amount: 500 }, premium: { type: "unlock", id: "sound:donner", name: "Sound-Paket \u201EDonnergrollen\u201C", icon: "\u{1F50A}", kind: "sound" } },
          25: { free: { type: "item", key: "shield", count: 1 }, premium: { type: "unlock", id: "frame:gewitter", name: "Rahmen \u201EBlitzring\u201C", icon: "\u{1F329}\uFE0F", kind: "frame" } },
          30: { free: { type: "points", amount: 500 }, premium: { type: "unlock", id: "ostyle:gewitter", name: "Overlay-Stil \u201EGewitter\u201C", icon: "\u{1F5A5}\uFE0F", kind: "ostyle" } },
          35: { free: { type: "item", key: "booster", count: 2 }, premium: { type: "unlock", id: "effect:wetterleuchten", name: "Effekt \u201EWetterleuchten\u201C", icon: "\u{1F30C}", kind: "effect" } },
          40: { free: { type: "title", id: "title:s2026-11", name: "Sturmj\xE4ger" }, premium: { type: "unlock", id: "winfx:gewitter", name: "Sieges-Animation \u201EBlitzeinschlag\u201C", icon: "\u{1F329}\uFE0F", kind: "winfx" } },
          45: { free: { type: "points", amount: 750 }, premium: { type: "points", amount: 1e3 } },
          50: {
            free: { type: "badge", id: "badge:2026-11", name: "Abzeichen \u201ENovember 2026\u201C", icon: "\u{1F3C5}" },
            premium: { type: "multi", name: "Design \u201EGewitternacht\u201C + goldener Titel", icon: "\u{1F451}", rewards: [
              { type: "unlock", id: "design:gewitternacht", name: "Design \u201EGewitternacht\u201C", kind: "design" },
              { type: "title", id: "title:s2026-11-gold", name: "\u26A1 Herr des Sturms", gold: true }
            ] }
          }
        })
      }
    ];
    var SEASON_TITLES = [
      { id: "title:s2026-11", name: "Sturmj\xE4ger", season: "2026-11" },
      { id: "title:s2026-11-gold", name: "\u26A1 Herr des Sturms", season: "2026-11", gold: true }
    ];
    var SEASON_EMOJIS = [{ id: "emoji:2026-11", emoji: "\u{1F329}\uFE0F", season: "2026-11" }];
    function startOf(season) {
      return new Date(season.year, season.month - 1, 1, 0, 0, 0, 0);
    }
    function endOf(season) {
      return new Date(season.year, season.month, 1, 0, 0, 0, 0);
    }
    function current(date = /* @__PURE__ */ new Date()) {
      return SEASONS.find((s) => date >= startOf(s) && date < endOf(s)) || null;
    }
    function upcoming(date = /* @__PURE__ */ new Date()) {
      return SEASONS.filter((s) => startOf(s) > date).sort((a, b) => startOf(a) - startOf(b))[0] || null;
    }
    function hasNextMonth(date = /* @__PURE__ */ new Date()) {
      const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      return SEASONS.some((s) => s.year === next.getFullYear() && s.month === next.getMonth() + 1);
    }
    module2.exports = { SEASONS, SEASON_TITLES, SEASON_EMOJIS, TIERS, XP_PER_TIER, UPGRADE_PRICE, XP, current, upcoming, hasNextMonth, startOf, endOf };
  }
});

// lcu.js
var require_lcu = __commonJS({
  "lcu.js"(exports2, module2) {
    var { execFile } = require("child_process");
    var fs2 = require("fs");
    var https2 = require("https");
    var LOCKFILE_PATHS = [
      "C:\\Riot Games\\League of Legends\\lockfile",
      "D:\\Riot Games\\League of Legends\\lockfile",
      "E:\\Riot Games\\League of Legends\\lockfile",
      "C:\\Program Files\\Riot Games\\League of Legends\\lockfile"
    ];
    var credentials = null;
    var lastProcessCheck = 0;
    var iconCache = { id: null, dataUrl: null };
    function fromLockfile() {
      for (const file of LOCKFILE_PATHS) {
        try {
          const [, , port, password] = fs2.readFileSync(file, "utf8").split(":");
          if (port && password) return { port, password };
        } catch {
        }
      }
      return null;
    }
    function fromProcess() {
      return new Promise((resolve) => {
        const command = `Get-CimInstance Win32_Process -Filter "name='LeagueClientUx.exe'" | Select-Object -ExpandProperty CommandLine`;
        execFile(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", command],
          { windowsHide: true, timeout: 8e3 },
          (error, stdout) => {
            if (error || !stdout) return resolve(null);
            const port = stdout.match(/--app-port=(\d+)/);
            const token = stdout.match(/--remoting-auth-token=([\w-]+)/);
            resolve(port && token ? { port: port[1], password: token[1] } : null);
          }
        );
      });
    }
    async function findCredentials() {
      const fromFile = fromLockfile();
      if (fromFile) return fromFile;
      if (Date.now() - lastProcessCheck < 15e3) return null;
      lastProcessCheck = Date.now();
      return fromProcess();
    }
    function request2(path2, method = "GET", body = null) {
      return new Promise((resolve, reject) => {
        const payload = body === null ? null : Buffer.from(JSON.stringify(body));
        const req = https2.request(
          {
            host: "127.0.0.1",
            port: credentials.port,
            path: path2,
            method,
            headers: {
              Authorization: "Basic " + Buffer.from("riot:" + credentials.password).toString("base64"),
              Accept: "application/json",
              ...payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}
            },
            // Der Client nutzt ein eigenes Zertifikat, das nur lokal gilt.
            // Wir sprechen ausschließlich mit 127.0.0.1 (deinem eigenen PC).
            rejectUnauthorized: false,
            timeout: 4e3
          },
          (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("error", reject);
            res.on(
              "end",
              () => resolve({
                status: res.statusCode,
                body: Buffer.concat(chunks),
                type: res.headers["content-type"] || ""
              })
            );
          }
        );
        req.on("timeout", () => req.destroy(new Error("Zeit\xFCberschreitung")));
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
      });
    }
    async function getJson(path2) {
      if (!credentials) throw new Error("Client nicht verbunden");
      const res = await request2(path2);
      if (res.status !== 200) return null;
      return JSON.parse(res.body.toString("utf8"));
    }
    async function send(method, path2, body = null) {
      if (!credentials) throw new Error("Client nicht verbunden");
      const res = await request2(path2, method, body);
      let data = null;
      try {
        data = res.body.length ? JSON.parse(res.body.toString("utf8")) : null;
      } catch {
        data = null;
      }
      return { ok: res.status >= 200 && res.status < 300, status: res.status, data };
    }
    async function getImage(path2) {
      if (!credentials) return null;
      try {
        const res = await request2(path2);
        if (res.status !== 200) return null;
        const type = res.type.split(";")[0] || "image/png";
        return `data:${type};base64,${res.body.toString("base64")}`;
      } catch {
        return null;
      }
    }
    var assetCache = /* @__PURE__ */ new Map();
    var ASSET_CACHE_BYTES = 80 * 1024 * 1024;
    var assetBytes = 0;
    async function getAsset(path2) {
      if (assetCache.has(path2)) {
        const hit = assetCache.get(path2);
        assetCache.delete(path2);
        assetCache.set(path2, hit);
        return hit;
      }
      if (!credentials) return null;
      try {
        const res = await request2(path2);
        if (res.status !== 200) return null;
        const asset = { body: res.body, type: res.type.split(";")[0] || "application/octet-stream" };
        assetCache.set(path2, asset);
        assetBytes += asset.body.length;
        while (assetBytes > ASSET_CACHE_BYTES && assetCache.size > 1) {
          const [oldKey, old] = assetCache.entries().next().value;
          assetCache.delete(oldKey);
          assetBytes -= old.body.length;
        }
        return asset;
      } catch {
        return null;
      }
    }
    async function getRaw(path2) {
      if (!credentials) throw new Error("Client nicht verbunden");
      const res = await request2(path2);
      return { status: res.status, text: res.body.toString("utf8") };
    }
    async function getIcon(iconId) {
      if (iconCache.id === iconId) return iconCache.dataUrl;
      const dataUrl = await getImage(`/lol-game-data/assets/v1/profile-icons/${iconId}.jpg`);
      if (dataUrl) iconCache = { id: iconId, dataUrl };
      return dataUrl;
    }
    async function getStatus() {
      if (!credentials) credentials = await findCredentials();
      if (!credentials) return { connected: false };
      try {
        const summoner = await getJson("/lol-summoner/v1/current-summoner");
        if (!summoner) return { connected: true, ready: false };
        const [ranked, phase, icon] = await Promise.all([
          getJson("/lol-ranked/v1/current-ranked-stats").catch(() => null),
          getJson("/lol-gameflow/v1/gameflow-phase").catch(() => null),
          getIcon(summoner.profileIconId)
        ]);
        const solo = ranked?.queueMap?.RANKED_SOLO_5x5;
        const hasRank = solo && solo.tier && solo.tier !== "NONE";
        return {
          connected: true,
          ready: true,
          phase: phase || "None",
          summoner: {
            puuid: summoner.puuid,
            name: summoner.gameName || summoner.displayName || "Unbekannt",
            tag: summoner.tagLine || "",
            level: summoner.summonerLevel
          },
          icon,
          solo: hasRank ? {
            tier: solo.tier,
            division: solo.division,
            lp: solo.leaguePoints,
            wins: solo.wins,
            losses: solo.losses
          } : null
        };
      } catch {
        credentials = null;
        return { connected: false };
      }
    }
    module2.exports = { getStatus, getJson, send, getImage, getAsset, getRaw };
  }
});

// ddragon.js
var require_ddragon = __commonJS({
  "ddragon.js"(exports2, module2) {
    var https2 = require("https");
    var fs2 = require("fs");
    var path2 = require("path");
    var { app } = require("electron");
    var HOST = "ddragon.leagueoflegends.com";
    var LOCALES = { de: "de_DE", en: "en_US" };
    var version = null;
    var cache = {};
    var loading = null;
    function getJson(urlPath) {
      return new Promise((resolve, reject) => {
        const req = https2.get({ host: HOST, path: urlPath, timeout: 15e3 }, (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`Data Dragon ${res.statusCode}`));
            return;
          }
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("error", reject);
          res.on("end", () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch (e) {
              reject(e);
            }
          });
        });
        req.on("timeout", () => req.destroy(new Error("Zeit\xFCberschreitung")));
        req.on("error", reject);
      });
    }
    function cacheDir() {
      return path2.join(app.getPath("userData"), "ddragon");
    }
    async function cached(name, fetcher) {
      const file = path2.join(cacheDir(), `${version}-${name}.json`);
      try {
        return JSON.parse(fs2.readFileSync(file, "utf8"));
      } catch {
      }
      const data = await fetcher();
      try {
        fs2.mkdirSync(cacheDir(), { recursive: true });
        for (const f of fs2.readdirSync(cacheDir())) if (!f.startsWith(`${version}-`)) fs2.rmSync(path2.join(cacheDir(), f), { force: true });
        fs2.writeFileSync(file, JSON.stringify(data));
      } catch {
      }
      return data;
    }
    async function load() {
      if (version && cache["de_DE:items"]) return true;
      if (loading) return loading;
      loading = (async () => {
        try {
          const versions = await getJson("/api/versions.json");
          version = Array.isArray(versions) ? versions[0] : null;
          if (!version) return false;
          for (const locale of Object.values(LOCALES)) {
            const items = await cached(`${locale}-items`, async () => (await getJson(`/cdn/${version}/data/${locale}/item.json`)).data || {});
            cache[`${locale}:items`] = items;
            const trees = await cached(`${locale}-runes`, () => getJson(`/cdn/${version}/data/${locale}/runesReforged.json`));
            const runes = {};
            for (const tree of Array.isArray(trees) ? trees : []) {
              runes[tree.id] = tree.name;
              for (const slot of tree.slots || []) for (const r of slot.runes || []) runes[r.id] = r.name;
            }
            cache[`${locale}:runes`] = runes;
          }
          return true;
        } catch (error) {
          console.error("Data Dragon nicht erreichbar:", error.message);
          version = null;
          return false;
        } finally {
          loading = null;
        }
      })();
      return loading;
    }
    function localeFor(lang) {
      return LOCALES[lang] || null;
    }
    function itemName(id, lang) {
      const locale = localeFor(lang);
      if (!locale) return null;
      return cache[`${locale}:items`]?.[String(id)]?.name || null;
    }
    function runeName(id, lang) {
      const locale = localeFor(lang);
      if (!locale) return null;
      return cache[`${locale}:runes`]?.[id] || null;
    }
    function purchasableOnRift(id) {
      const items = cache["en_US:items"] || cache["de_DE:items"];
      if (!items) return null;
      const i = items[String(id)];
      if (!i) return false;
      return !!(i.maps?.["11"] && i.gold?.purchasable !== false && (i.gold?.total || 0) > 0);
    }
    module2.exports = { load, itemName, runeName, purchasableOnRift, _cache: cache };
  }
});

// gamedata.js
var require_gamedata = __commonJS({
  "gamedata.js"(exports2, module2) {
    var lcu = require_lcu();
    var ddragon = require_ddragon();
    var itemLanguage = "auto";
    function setItemLanguage(lang) {
      itemLanguage = ["de", "en"].includes(lang) ? lang : "auto";
      if (itemLanguage !== "auto") ddragon.load().catch(() => {
      });
    }
    function getItemLanguage() {
      return itemLanguage;
    }
    var QUEUES = {
      420: "Solo/Duo",
      440: "Flex",
      400: "Normal Draft",
      430: "Normal Blind",
      490: "Quickplay",
      480: "Swiftplay",
      450: "ARAM",
      700: "Clash",
      1700: "Arena",
      1900: "URF",
      900: "ARURF"
    };
    function assetUrl(path2) {
      return path2 ? "lcu-asset://game" + path2 : null;
    }
    var champions = null;
    var items = null;
    var spells = null;
    var skins = null;
    async function loadIndex(file) {
      const list = await lcu.getJson(`/lol-game-data/assets/v1/${file}`);
      if (!Array.isArray(list)) return null;
      const map = {};
      for (const entry of list) map[entry.id] = entry;
      return map;
    }
    async function load() {
      if (!champions) champions = await loadIndex("champion-summary.json");
      if (!items) items = await loadIndex("items.json");
      if (!spells) spells = await loadIndex("summoner-spells.json");
      if (!skins) await loadSkins();
      if (!queues) await loadQueues();
      ddragon.load().catch(() => {
      });
    }
    var queues = null;
    async function loadQueues() {
      try {
        const list = await lcu.getJson("/lol-game-queues/v1/queues");
        queues = {};
        for (const q of Array.isArray(list) ? list : []) queues[q.id] = q;
      } catch {
        queues = null;
      }
    }
    function champion(id) {
      const c = champions?.[id];
      const tile = skins?.[id * 1e3]?.tilePath;
      const square = c?.squarePortraitPath || `/lol-game-data/assets/v1/champion-icons/${id}.png`;
      if (tile && tile !== square) fallbacks.set(tile, square);
      return {
        id,
        name: c?.name || `Champion ${id}`,
        icon: assetUrl(tile || square)
      };
    }
    var fallbacks = /* @__PURE__ */ new Map();
    function assetFallback(path2) {
      return fallbacks.get(path2) || null;
    }
    function item(id) {
      if (!id) return null;
      const i = items?.[id];
      return { id, name: ddragon.itemName(id, itemLanguage) || i?.name || "", icon: assetUrl(i?.iconPath) };
    }
    function spell(id) {
      if (!id) return null;
      const s = spells?.[id];
      return { id, name: s?.name || "", icon: assetUrl(s?.iconPath), cooldown: s?.cooldown || null };
    }
    function spellByName(name) {
      if (!spells || !name) return null;
      const key = String(name).toLowerCase();
      const s = Object.values(spells).find((x) => String(x.name).toLowerCase() === key);
      return s ? { id: s.id, name: s.name, icon: assetUrl(s.iconPath), cooldown: s.cooldown || null } : null;
    }
    var SPELL_IDS = {
      SummonerBoost: 1,
      SummonerExhaust: 3,
      SummonerFlash: 4,
      SummonerHaste: 6,
      SummonerHeal: 7,
      SummonerSmite: 11,
      SummonerTeleport: 12,
      SummonerMana: 13,
      SummonerDot: 14,
      SummonerBarrier: 21,
      SummonerSnowball: 32
    };
    function spellByKey(key, name) {
      let id = SPELL_IDS[key];
      if (!id && /Smite/i.test(key || "")) id = 11;
      if (!id && /Teleport/i.test(key || "")) id = 12;
      const s = id && spells ? spells[id] : null;
      if (s) return { id: s.id, name: s.name, icon: assetUrl(s.iconPath), cooldown: s.cooldown || null };
      return spellByName(name);
    }
    function championByName(name) {
      if (!champions || !name) return null;
      const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const key = norm(name);
      const c = Object.values(champions).find((x) => norm(x.name) === key || norm(x.alias) === key);
      return c ? champion(c.id) : null;
    }
    function championByAlias(alias) {
      if (!champions || !alias) return null;
      const key = String(alias).toLowerCase();
      const c = Object.values(champions).find((x) => String(x.alias).toLowerCase() === key);
      return c ? champion(c.id) : null;
    }
    var championDetailCache = /* @__PURE__ */ new Map();
    async function championDetails(id) {
      if (!id || id <= 0) return null;
      if (championDetailCache.has(id)) return championDetailCache.get(id);
      try {
        const data = await lcu.getJson(`/lol-game-data/assets/v1/champions/${id}.json`);
        if (!data) return null;
        const details = {
          damageType: data.tacticalInfo?.damageType || "kMixed",
          // kMagic, kPhysical, kMixed
          roles: data.roles || []
        };
        championDetailCache.set(id, details);
        return details;
      } catch {
        return null;
      }
    }
    function championIds() {
      return Object.keys(champions || {}).map(Number).filter((id) => id > 0);
    }
    function allItems() {
      return Object.values(items || {});
    }
    function completedItems() {
      return Object.values(items || {}).filter((i) => (i.priceTotal || 0) >= 2500 && i.inStore !== false && i.iconPath).map((i) => item(i.id));
    }
    function queueName(game) {
      if (QUEUES[game.queueId]) return QUEUES[game.queueId];
      const q = queues?.[game.queueId];
      const name = q?.description || q?.shortName || q?.name;
      if (name) return String(name).replace(/^Summoner's Rift\s*[-–:]?\s*/i, "").trim() || name;
      return game.gameMode && !/^[A-Z0-9_]+$/.test(game.gameMode) ? game.gameMode : "Sondermodus";
    }
    var RIFT_QUEUES = /* @__PURE__ */ new Set([400, 420, 430, 440, 480, 490, 700]);
    function isRiftQueue(queueId, mapId) {
      if (RIFT_QUEUES.has(Number(queueId))) return true;
      const q = queues?.[queueId];
      return Number(q?.mapId ?? mapId) === 11 && /CLASSIC/i.test(q?.gameMode || "");
    }
    var cosmeticIndex = null;
    function normalize(name) {
      return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    async function loadSkins() {
      if (!skins) {
        const data = await lcu.getJson("/lol-game-data/assets/v1/skins.json");
        if (data && typeof data === "object") skins = data;
      }
      return skins;
    }
    function skin(id) {
      return skins?.[id] || null;
    }
    async function loadCosmetics() {
      if (cosmeticIndex) return;
      await loadSkins();
      const [icons, emotes] = await Promise.all([
        lcu.getJson("/lol-game-data/assets/v1/summoner-icons.json").catch(() => null),
        lcu.getJson("/lol-game-data/assets/v1/summoner-emotes.json").catch(() => null)
      ]);
      const index = {};
      const add = (name, image, fit) => {
        const key = normalize(name);
        if (key && image && !index[key]) index[key] = { image: assetUrl(image), fit };
      };
      for (const s of Object.values(skins || {})) {
        add(s.name, s.loadScreenPath || s.tilePath || s.splashPath, "cover");
        for (const c of s.chromas || []) add(c.name, c.chromaPath, "contain");
        for (const t of s.questSkinInfo?.tiers || []) add(t.name, t.loadScreenPath || t.tilePath, "cover");
      }
      for (const i of Array.isArray(icons) ? icons : []) {
        add(i.title, i.imagePath || `/lol-game-data/assets/v1/profile-icons/${i.id}.jpg`, "contain");
      }
      for (const e of Array.isArray(emotes) ? emotes : []) add(e.name, e.inventoryIcon, "contain");
      cosmeticIndex = index;
    }
    function cosmeticImage(name) {
      if (!cosmeticIndex) return null;
      const direct = cosmeticIndex[normalize(name)];
      if (direct) return direct;
      const base = String(name || "").match(/^(.*)\s\([^)]+\)$/);
      if (base) return cosmeticIndex[normalize(base[1])] || null;
      return null;
    }
    module2.exports = {
      load,
      champion,
      item,
      spell,
      queueName,
      spellByName,
      spellByKey,
      championByAlias,
      championByName,
      assetFallback,
      championDetails,
      championIds,
      completedItems,
      allItems,
      setItemLanguage,
      getItemLanguage,
      isRiftQueue,
      ddragon,
      loadSkins,
      skin,
      loadCosmetics,
      cosmeticImage,
      assetUrl
    };
  }
});

// erfolge.js
var require_erfolge = __commonJS({
  "erfolge.js"(exports2, module2) {
    var ACHIEVEMENTS = [
      // Treue
      { id: "spiele-10", icon: "\u{1F3AE}", name: "Warm gespielt", desc: "10 Spiele mit dem Hub", type: "games", target: 10, points: 300 },
      { id: "spiele-50", icon: "\u{1F3AE}", name: "Stammgast", desc: "50 Spiele mit dem Hub", type: "games", target: 50, points: 1e3 },
      { id: "spiele-100", icon: "\u{1F3AE}", name: "Hundert", desc: "100 Spiele mit dem Hub", type: "games", target: 100, points: 2e3 },
      { id: "spiele-500", icon: "\u{1F451}", name: "Inventar", desc: "500 Spiele mit dem Hub", type: "games", target: 500, points: 1e4 },
      // Siege
      { id: "siege-1", icon: "\u{1F3C6}", name: "Erster Sieg", desc: "Dein erster Sieg mit dem Hub", type: "wins", target: 1, points: 200 },
      { id: "siege-25", icon: "\u{1F3C6}", name: "Gewinner-Typ", desc: "25 Siege mit dem Hub", type: "wins", target: 25, points: 1200 },
      { id: "siege-100", icon: "\u{1F3C6}", name: "Siegesserie", desc: "100 Siege mit dem Hub", type: "wins", target: 100, points: 5e3 },
      // Streaks
      { id: "streak-3", icon: "\u{1F525}", name: "Hei\xDF gelaufen", desc: "3 Siege in Folge", type: "bestStreak", target: 3, points: 400 },
      { id: "streak-5", icon: "\u{1F525}", name: "Nicht zu stoppen", desc: "5 Siege in Folge", type: "bestStreak", target: 5, points: 1200 },
      { id: "streak-10", icon: "\u2604\uFE0F", name: "Unaufhaltsam", desc: "10 Siege in Folge", type: "bestStreak", target: 10, points: 6e3 },
      // Einzelne Spiele
      { id: "triple", icon: "\u2694\uFE0F", name: "Triple Kill", desc: "Ein Triple Kill", type: "once", test: (f) => f.triple > 0, points: 200 },
      { id: "quadra", icon: "\u2694\uFE0F", name: "Quadra Kill", desc: "Ein Quadra Kill", type: "once", test: (f) => f.quadra > 0, points: 800 },
      { id: "penta", icon: "\u{1F4A5}", name: "PENTAKILL", desc: "Ein Pentakill", type: "once", test: (f) => f.penta > 0, points: 3e3 },
      { id: "perfekt", icon: "\u2728", name: "Unber\xFChrbar", desc: "Sieg ohne einen einzigen Tod (ab 15 Min.)", type: "once", test: (f) => f.win && f.deaths === 0 && f.minutes >= 15, points: 1e3 },
      { id: "cs9", icon: "\u{1F33E}", name: "Farm-Maschine", desc: "9 CS pro Minute in einem Spiel", type: "once", test: (f) => f.csPerMin >= 9, points: 600 },
      { id: "vision25", icon: "\u{1F441}\uFE0F", name: "Vision-K\xF6nig", desc: "2,5 Vision pro Minute in einem Spiel", type: "once", test: (f) => f.visionPerMin >= 2.5, points: 600 },
      { id: "kda10", icon: "\u{1F3AF}", name: "Chirurg", desc: "KDA von 10 oder mehr in einem Spiel", type: "once", test: (f) => f.kda >= 10, points: 800 },
      { id: "marathon", icon: "\u23F3", name: "Marathon", desc: "Ein Spiel \xFCber 40 Minuten", type: "once", test: (f) => f.minutes >= 40, points: 300 },
      { id: "schnell", icon: "\u26A1", name: "Kurzer Prozess", desc: "Sieg in unter 20 Minuten", type: "once", test: (f) => f.win && f.minutes < 20, points: 500 },
      { id: "nachteule", icon: "\u{1F989}", name: "Nachteule", desc: "Ein Spiel nach Mitternacht beendet", type: "once", test: (f) => f.hour >= 0 && f.hour < 5, points: 200 },
      // Champions + Tage
      { id: "kenner", icon: "\u{1F4D8}", name: "Champion-Kenner", desc: "20 Spiele mit demselben Champion", type: "champMax", target: 20, points: 800 },
      { id: "allrounder", icon: "\u{1F3AD}", name: "Allrounder", desc: "Siege mit 10 verschiedenen Champions", type: "winChamps", target: 10, points: 1200 },
      { id: "tag10", icon: "\u{1F4C5}", name: "Langer Tag", desc: "10 Spiele an einem Tag", type: "dayGames", target: 10, points: 600 }
    ];
    var DAILY_POOL = [
      { id: "d-spiele3", text: "Spiele 3 Spiele", kind: "games", target: 3, points: 120 },
      { id: "d-siege2", text: "Gewinne 2 Spiele", kind: "wins", target: 2, points: 160 },
      { id: "d-kda3", text: "Ein Spiel mit KDA 3 oder mehr", kind: "once", target: 1, points: 120, test: (f) => f.kda >= 3 },
      { id: "d-cs7", text: "Ein Spiel mit 7+ CS pro Minute", kind: "once", target: 1, points: 120, test: (f) => f.csPerMin >= 7 },
      { id: "d-vision1", text: "Ein Spiel mit 1+ Vision pro Minute", kind: "once", target: 1, points: 120, test: (f) => f.visionPerMin >= 1 },
      { id: "d-tode4", text: "Ein Spiel mit h\xF6chstens 4 Toden", kind: "once", target: 1, points: 120, test: (f) => f.deaths <= 4 },
      { id: "d-champs2", text: "Spiele 2 verschiedene Champions", kind: "champs", target: 2, points: 100 },
      { id: "d-zeit60", text: "Verbringe 60 Minuten im Spiel", kind: "minutes", target: 60, points: 120 }
    ];
    var WEEKLY_POOL = [
      { id: "w-spiele15", text: "Spiele 15 Spiele", kind: "games", target: 15, points: 600 },
      { id: "w-siege8", text: "Gewinne 8 Spiele", kind: "wins", target: 8, points: 800 },
      { id: "w-streak3", text: "Gewinne 3 Spiele in Folge", kind: "streak", target: 3, points: 600 },
      { id: "w-champs5", text: "Spiele 5 verschiedene Champions", kind: "champs", target: 5, points: 500 },
      { id: "w-zeit300", text: "Verbringe 5 Stunden im Spiel", kind: "minutes", target: 300, points: 600 },
      { id: "w-perfekt", text: "Gewinne ein Spiel mit h\xF6chstens 2 Toden", kind: "once", target: 1, points: 700, test: (f) => f.win && f.deaths <= 2 }
    ];
    var DAILY_COUNT = 3;
    var WEEKLY_COUNT = 2;
    function dayKey(date = /* @__PURE__ */ new Date()) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }
    function weekKey(date = /* @__PURE__ */ new Date()) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (d.getDay() + 6) % 7);
      return `W${dayKey(d)}`;
    }
    function pick(pool, count, seedText) {
      let seed = 0;
      for (const ch of seedText) seed = seed * 31 + ch.charCodeAt(0) >>> 0;
      const list = [...pool];
      const chosen = [];
      while (chosen.length < count && list.length) {
        seed = seed * 1103515245 + 12345 >>> 0;
        chosen.push(list.splice(seed % list.length, 1)[0]);
      }
      return chosen.map((t) => ({ id: t.id, progress: 0, done: false, champs: [] }));
    }
    function emptyStore() {
      return { done: {}, stats: { games: 0, wins: 0, champGames: {}, winChamps: [] }, daily: null, weekly: null };
    }
    function ensure(store, opts = {}) {
      const s = store || emptyStore();
      const dailyCount = opts.daily || DAILY_COUNT;
      s.done = s.done || {};
      s.stats = s.stats || { games: 0, wins: 0, champGames: {}, winChamps: [] };
      const dk = dayKey();
      const wk = weekKey();
      if (!s.daily || s.daily.key !== dk) s.daily = { key: dk, tasks: pick(DAILY_POOL, dailyCount, dk) };
      while (s.daily.tasks.length < dailyCount) {
        const free = DAILY_POOL.filter((t) => !s.daily.tasks.some((x) => x.id === t.id));
        if (!free.length) break;
        const extra = pick(free, 1, `${dk}-${s.daily.tasks.length}`)[0];
        s.daily.tasks.push(extra);
      }
      if (!s.weekly || s.weekly.key !== wk) s.weekly = { key: wk, tasks: pick(WEEKLY_POOL, WEEKLY_COUNT, wk) };
      return s;
    }
    function reroll(store, taskId) {
      const tasks = store?.daily?.tasks || [];
      const index = tasks.findIndex((t) => t.id === taskId && !t.done);
      if (index < 0) return false;
      const free = DAILY_POOL.filter((t) => !tasks.some((x) => x.id === t.id));
      if (!free.length) return false;
      tasks[index] = pick(free, 1, `${Date.now()}`)[0];
      return true;
    }
    var taskDef = (id) => DAILY_POOL.find((t) => t.id === id) || WEEKLY_POOL.find((t) => t.id === id);
    function advanceTask(task, f) {
      const def = taskDef(task.id);
      if (!def || task.done) return null;
      if (def.kind === "games") task.progress += 1;
      if (def.kind === "wins" && f.win) task.progress += 1;
      if (def.kind === "once" && def.test(f)) task.progress = 1;
      if (def.kind === "streak") task.progress = Math.max(task.progress, f.streak);
      if (def.kind === "champs" && f.champId && !task.champs.includes(f.champId)) {
        task.champs.push(f.champId);
        task.progress = task.champs.length;
      }
      if (task.progress >= def.target) {
        task.done = true;
        return { kind: "task", id: def.id, name: def.text, points: def.points };
      }
      return null;
    }
    function onGame(store, f) {
      const s = ensure(store);
      const st = s.stats;
      st.games += 1;
      if (f.win) st.wins += 1;
      if (f.champId) {
        st.champGames[f.champId] = (st.champGames[f.champId] || 0) + 1;
        if (f.win && !st.winChamps.includes(f.champId)) st.winChamps.push(f.champId);
      }
      const awards = [];
      for (const a of ACHIEVEMENTS) {
        if (s.done[a.id]) continue;
        const ok = a.type === "once" ? a.test(f) : progressOf(a, s, f) >= a.target;
        if (ok) {
          s.done[a.id] = Date.now();
          awards.push({ kind: "achievement", id: a.id, icon: a.icon, name: a.name, points: a.points });
        }
      }
      for (const t of [...s.daily.tasks, ...s.weekly.tasks]) {
        const award = advanceTask(t, f);
        if (award) awards.push(award);
      }
      return awards;
    }
    function onMinutes(store, minutes) {
      const s = ensure(store);
      const awards = [];
      for (const t of [...s.daily.tasks, ...s.weekly.tasks]) {
        const def = taskDef(t.id);
        if (!def || def.kind !== "minutes" || t.done) continue;
        t.progress = Math.min(def.target, t.progress + minutes);
        if (t.progress >= def.target) {
          t.done = true;
          awards.push({ kind: "task", id: def.id, name: def.text, points: def.points });
        }
      }
      return awards;
    }
    function progressOf(a, s, f = {}) {
      const st = s.stats;
      switch (a.type) {
        case "games":
          return st.games;
        case "wins":
          return st.wins;
        case "bestStreak":
          return Math.max(f.bestStreak || 0, s.bestStreakSeen || 0);
        case "champMax":
          return Math.max(0, ...Object.values(st.champGames));
        case "winChamps":
          return st.winChamps.length;
        case "dayGames":
          return f.dayGames || 0;
        default:
          return 0;
      }
    }
    function view(store, bestStreak, todayGames) {
      const s = ensure(store);
      s.bestStreakSeen = Math.max(s.bestStreakSeen || 0, bestStreak || 0);
      const tasks = (list) => list.map((t) => {
        const def = taskDef(t.id);
        return { id: t.id, text: def.text, target: def.target, progress: Math.floor(t.progress), done: t.done, points: def.points };
      });
      const now = /* @__PURE__ */ new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(24, 0, 0, 0);
      const endOfWeek = new Date(now);
      endOfWeek.setHours(0, 0, 0, 0);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - (now.getDay() + 6) % 7));
      return {
        daily: tasks(s.daily.tasks),
        weekly: tasks(s.weekly.tasks),
        dailyEndsAt: endOfDay.getTime(),
        weeklyEndsAt: endOfWeek.getTime(),
        achievements: ACHIEVEMENTS.map((a) => ({
          id: a.id,
          icon: a.icon,
          name: a.name,
          desc: a.desc,
          points: a.points,
          doneAt: s.done[a.id] || null,
          target: a.target || null,
          progress: a.type === "once" ? null : Math.min(a.target, progressOf(a, s, { bestStreak, dayGames: todayGames || 0 }))
        })),
        count: Object.keys(s.done).length,
        total: ACHIEVEMENTS.length
      };
    }
    module2.exports = { ensure, reroll, onGame, onMinutes, view, ACHIEVEMENTS, _pick: pick, _weekKey: weekKey };
  }
});

// speicher.js
var require_speicher = __commonJS({
  "speicher.js"(exports2, module2) {
    var fs2 = require("fs");
    function writeJson(file, value, { pretty = false, backup = true } = {}) {
      const text = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
      const tmp = `${file}.tmp`;
      const fd = fs2.openSync(tmp, "w");
      try {
        fs2.writeSync(fd, text);
        fs2.fsyncSync(fd);
      } finally {
        fs2.closeSync(fd);
      }
      if (backup && fs2.existsSync(file)) {
        try {
          fs2.copyFileSync(file, `${file}.bak`);
        } catch {
        }
      }
      fs2.renameSync(tmp, file);
    }
    function readJson(file, fallback) {
      const exists = fs2.existsSync(file);
      if (exists) {
        try {
          return JSON.parse(fs2.readFileSync(file, "utf8"));
        } catch {
        }
      }
      try {
        const value = JSON.parse(fs2.readFileSync(`${file}.bak`, "utf8"));
        console.warn(`${file} war besch\xE4digt \u2013 Sicherung geladen.`);
        return value;
      } catch {
      }
      if (exists) {
        try {
          fs2.renameSync(file, `${file}.kaputt-${Date.now()}`);
        } catch {
        }
        console.warn(`${file} war besch\xE4digt und wurde beiseitegelegt.`);
      }
      return fallback;
    }
    module2.exports = { writeJson, readJson };
  }
});

// src/designs.js
var require_designs = __commonJS({
  "src/designs.js"(exports2, module2) {
    var DESIGNS = {
      standard: {
        name: "Standard",
        tier: "basis",
        desc: "Dunkel und technisch, mit leuchtenden Neon-R\xE4ndern",
        effectsText: "Umlaufende Lichtr\xE4nder, Leuchten und Einblend-Animationen",
        defaultColor: "cyan",
        preview: { bg: "#03080d", card: "#07141d" },
        colors: {
          cyan: { name: "Cyan", rgb: "34, 211, 238" },
          blau: { name: "Blau", rgb: "96, 165, 250" },
          violett: { name: "Violett", rgb: "167, 139, 250" },
          pink: { name: "Pink", rgb: "244, 114, 182" },
          orange: { name: "Orange", rgb: "251, 146, 60" },
          rot: { name: "Rot", rgb: "244, 63, 94" },
          // Saison-Farbe (Battle Pass November 2026) – muss freigeschaltet werden
          sturm: { name: "\u26A1 Sturmblau", rgb: "125, 190, 255", unlockId: "color:saison:2026-11", season: "2026-11" }
        }
      },
      sakura: {
        name: "Cherry Blossom",
        tier: "mittel",
        desc: "Sanfte Rosa-T\xF6ne, weiche Ecken, fallende Bl\xFCten",
        effectsText: "Fallende Bl\xFCten, sanftes Leuchten und Einblend-Animationen",
        defaultColor: "rosa",
        unlockId: "design:sakura",
        preview: { bg: "#e6c9d4", card: "#ecd9df" },
        colors: {
          rosa: { name: "Sakura-Rosa", rgb: "232, 93, 145" },
          blau: { name: "Himmelblau", rgb: "59, 130, 246" },
          lavendel: { name: "Lavendel", rgb: "139, 92, 246" },
          pfirsich: { name: "Pfirsich", rgb: "234, 112, 72" },
          mint: { name: "Mint", rgb: "16, 163, 122" },
          kirsche: { name: "Kirschrot", rgb: "205, 38, 72" }
        }
      },
      // ----- Spezial-Designs: nur mit Punkten freischaltbar -----
      aurora: {
        name: "Aurora",
        tier: "mittel",
        desc: "Nordlicht-Schleier ziehen langsam \xFCber den Nachthimmel",
        effectsText: "Ziehende Nordlichter, Leuchten und Einblend-Animationen",
        defaultColor: "nordlicht",
        unlockId: "design:aurora",
        preview: { bg: "linear-gradient(160deg, #052a2a, #0a0f2a 60%, #120a2a)", card: "#071a22" },
        colors: {
          nordlicht: { name: "Nordlicht", rgb: "52, 211, 153" },
          eisblau: { name: "Eisblau", rgb: "125, 211, 252" },
          polar: { name: "Polar-Violett", rgb: "167, 139, 250" },
          polarrot: { name: "Polarrot", rgb: "251, 113, 133" }
        }
      },
      galaxie: {
        name: "Galaxie",
        tier: "premium",
        desc: "Tiefes Violett mit funkelndem Sternenhimmel",
        effectsText: "Funkelnde Sterne, Leuchten und Einblend-Animationen",
        defaultColor: "nebel",
        unlockId: "design:galaxie",
        preview: { bg: "radial-gradient(circle at 70% 30%, #3b1d6e, #07031a 70%)", card: "#0d0824" },
        colors: {
          nebel: { name: "Nebel-Violett", rgb: "192, 132, 252" },
          stern: { name: "Sternenblau", rgb: "96, 165, 250" },
          nova: { name: "Supernova", rgb: "244, 114, 182" },
          komet: { name: "Kometengold", rgb: "251, 191, 36" },
          mars: { name: "Marsrot", rgb: "248, 82, 82" }
        }
      },
      gold: {
        name: "Gold-Edition",
        tier: "premium",
        desc: "Fast schwarz mit edlen goldenen R\xE4ndern",
        effectsText: "Umlaufender Goldglanz, Leuchten und Einblend-Animationen",
        defaultColor: "gold",
        unlockId: "design:gold",
        preview: { bg: "linear-gradient(160deg, #1a1408, #050505 60%)", card: "#0f0d09" },
        colors: {
          gold: { name: "Gold", rgb: "245, 196, 66" },
          rose: { name: "Ros\xE9gold", rgb: "232, 160, 140" },
          platin: { name: "Platin", rgb: "203, 213, 225" },
          rubin: { name: "Rubin", rgb: "225, 29, 72" }
        }
      },
      // ----- 2.0: neue Designs (Standard ohne Animation, Mittel mit ruhiger, Premium mit voller Animation) -----
      mitternacht: {
        name: "Mitternacht",
        tier: "standard",
        desc: "Tiefes Nachtblau mit edlen, ruhigen Verl\xE4ufen",
        effectsText: "Sanftes Leuchten, keine Animation",
        defaultColor: "mond",
        unlockId: "design:mitternacht",
        preview: { bg: "linear-gradient(165deg, #0b1230, #02040f 65%)", card: "#0a1028" },
        colors: {
          mond: { name: "Mondblau", rgb: "99, 140, 255" },
          silber: { name: "Silber", rgb: "203, 213, 225" },
          tuerkis: { name: "T\xFCrkis", rgb: "45, 212, 191" },
          flieder: { name: "Flieder", rgb: "196, 181, 253" }
        }
      },
      smaragd: {
        name: "Smaragd",
        tier: "standard",
        desc: "Dunkles Gr\xFCn mit edlem Edelstein-Glanz",
        effectsText: "Sanftes Leuchten, keine Animation",
        defaultColor: "smaragd",
        unlockId: "design:smaragd",
        preview: { bg: "linear-gradient(165deg, #06281c, #020c08 65%)", card: "#06180f" },
        colors: {
          smaragd: { name: "Smaragd", rgb: "16, 185, 129" },
          limette: { name: "Limette", rgb: "163, 230, 53" },
          goldgelb: { name: "Goldgelb", rgb: "234, 179, 8" },
          aqua: { name: "Aqua", rgb: "34, 211, 238" }
        }
      },
      kupfer: {
        name: "Kupfer",
        tier: "standard",
        desc: "Warmes Kupfer und dunkles Holz, gem\xFCtlich und edel",
        effectsText: "Sanftes Leuchten, keine Animation",
        defaultColor: "kupfer",
        unlockId: "design:kupfer",
        preview: { bg: "linear-gradient(165deg, #2a1408, #0c0603 65%)", card: "#1a0e07" },
        colors: {
          kupfer: { name: "Kupfer", rgb: "234, 120, 60" },
          bernstein: { name: "Bernstein", rgb: "245, 158, 11" },
          rost: { name: "Rost", rgb: "220, 90, 60" },
          creme: { name: "Creme", rgb: "253, 230, 190" }
        }
      },
      graphit: {
        name: "Graphit",
        tier: "standard",
        desc: "Schlicht in Schwarz und Wei\xDF \u2013 klare Linien, nichts lenkt ab",
        effectsText: "Klare Kanten, keine Animation",
        defaultColor: "weiss",
        unlockId: "design:graphit",
        preview: { bg: "linear-gradient(165deg, #1c1c1f, #070708 65%)", card: "#121214" },
        colors: {
          weiss: { name: "Wei\xDF", rgb: "229, 231, 235" },
          rot: { name: "Signalrot", rgb: "239, 68, 68" },
          gelb: { name: "Gelb", rgb: "250, 204, 21" },
          blau: { name: "Blau", rgb: "96, 165, 250" }
        }
      },
      ozean: {
        name: "Ozean",
        tier: "mittel",
        desc: "Tiefsee mit sanften Wellen und schimmernden Lichtreflexen",
        effectsText: "Ziehende Wellen, tanzende Lichtflecken, aufsteigende Bl\xE4schen",
        defaultColor: "lagune",
        unlockId: "design:ozean",
        fx: "ozean",
        preview: { bg: "linear-gradient(180deg, #063a52, #021624 55%, #010a12)", card: "#04202e" },
        colors: {
          lagune: { name: "Lagune", rgb: "34, 211, 238" },
          tiefsee: { name: "Tiefsee", rgb: "59, 130, 246" },
          koralle: { name: "Koralle", rgb: "251, 113, 133" },
          seegras: { name: "Seegras", rgb: "45, 212, 191" }
        }
      },
      neoncity: {
        name: "Neon-City",
        tier: "mittel",
        desc: "Nachts in der Gro\xDFstadt: Leuchtreklame, Scanlines, Retro-Gitter",
        effectsText: "Pulsierende Neon-R\xE4nder, wanderndes Retro-Gitter, Scanlines",
        defaultColor: "magenta",
        unlockId: "design:neoncity",
        fx: "neoncity",
        preview: { bg: "linear-gradient(180deg, #14021f, #07010f 60%, #1a0630)", card: "#120420" },
        colors: {
          magenta: { name: "Magenta", rgb: "236, 72, 153" },
          cyan: { name: "Cyan", rgb: "34, 211, 238" },
          laser: { name: "Lasergr\xFCn", rgb: "163, 230, 53" },
          violett: { name: "Violett", rgb: "168, 85, 247" }
        }
      },
      runen: {
        name: "Arkane Runen",
        tier: "premium",
        desc: "Magische Runenkreise drehen sich im Dunkeln, Schriftzeichen glimmen auf",
        effectsText: "Drehende Runenkreise, schwebende Glyphen, magischer Hover-Schimmer",
        defaultColor: "arkan",
        unlockId: "design:runen",
        fx: "runen",
        preview: { bg: "radial-gradient(circle at 50% 40%, #2a1650, #0a0418 60%, #04020c)", card: "#120a26" },
        colors: {
          arkan: { name: "Arkan", rgb: "139, 92, 246" },
          mystik: { name: "Mystik-Blau", rgb: "96, 165, 250" },
          jade: { name: "Jade", rgb: "52, 211, 153" },
          gold: { name: "Runengold", rgb: "251, 191, 36" }
        }
      },
      drachenfeuer: {
        name: "Drachenfeuer",
        tier: "premium",
        desc: "Glut steigt auf, die R\xE4nder lodern \u2013 mit eigener Feuer-Siegesanimation",
        effectsText: "Aufsteigende Glut, lodernde R\xE4nder, Hitzeflimmern, Feuer-Sieg",
        defaultColor: "glut",
        unlockId: "design:drachenfeuer",
        fx: "drachenfeuer",
        winFx: true,
        // eigene Sieges-Animation (styles.css: .win-fx.design-drachenfeuer)
        preview: { bg: "linear-gradient(0deg, #4a1204, #160502 45%, #070201)", card: "#1a0805" },
        colors: {
          glut: { name: "Glut", rgb: "249, 115, 22" },
          flamme: { name: "Flamme", rgb: "239, 68, 68" },
          gold: { name: "Drachengold", rgb: "250, 204, 21" },
          blaufeuer: { name: "Blaufeuer", rgb: "56, 189, 248" }
        }
      },
      blutmond: {
        name: "Blutmond",
        tier: "premium",
        desc: "Ein roter Mond \xFCber dunklem Land, Asche rieselt \u2013 mit eigener Blutmond-Siegesanimation",
        effectsText: "Pulsierender Blutmond, rieselnde Asche, gl\xFChende R\xE4nder, Blutmond-Sieg",
        defaultColor: "blut",
        unlockId: "design:blutmond",
        fx: "blutmond",
        winFx: true,
        // eigene Sieges-Animation (styles.css: .win-fx.design-blutmond)
        preview: { bg: "radial-gradient(circle at 78% 22%, #7f1010 0 10%, #2a0507 22%, #0a0203 60%)", card: "#180507" },
        colors: {
          blut: { name: "Blutrot", rgb: "220, 38, 38" },
          karmin: { name: "Karmin", rgb: "190, 18, 60" },
          ember: { name: "Ember", rgb: "251, 146, 60" },
          violett: { name: "Nachtviolett", rgb: "147, 51, 234" }
        }
      },
      // ----- Saison-Designs: NUR im Battle Pass (Upgrade, Stufe 50), kommen nie wieder -----
      gewitternacht: {
        name: "Gewitternacht",
        tier: "saison",
        season: "2026-11",
        desc: "Saison November 2026: Gewitterwolken ziehen, Blitze erhellen das ganze Hub, Regen peitscht",
        effectsText: "Blitze mit Lichtblitz, ziehende Wolken, Regen, Strom-R\xE4nder, Blitz-Seitenwechsel, Blitz-Sieg",
        defaultColor: "blitz",
        unlockId: "design:gewitternacht",
        fx: "gewitternacht",
        winFx: true,
        preview: { bg: "linear-gradient(180deg, #1a2140, #070a18 55%, #03040a)", card: "#0b1024" },
        colors: {
          blitz: { name: "Blitzblau", rgb: "125, 211, 252" },
          violett: { name: "Sturmviolett", rgb: "167, 139, 250" },
          weiss: { name: "Blitzwei\xDF", rgb: "226, 232, 240" },
          gelb: { name: "Donnergelb", rgb: "250, 204, 21" }
        }
      }
    };
    function resolveDesign(settings) {
      const d = settings?.design || {};
      const key = DESIGNS[d.theme] ? d.theme : "standard";
      const design = DESIGNS[key];
      const customRgb = /^\d{1,3}, \d{1,3}, \d{1,3}$/.test(d.custom?.[key] || "") ? d.custom[key] : null;
      let colorKey = design.colors[d.colors?.[key]] ? d.colors[key] : design.defaultColor;
      if (d.colors?.[key] === "custom" && customRgb) colorKey = "custom";
      return {
        key,
        design,
        colorKey,
        color: colorKey === "custom" ? { name: "Eigene Farbe", rgb: customRgb } : design.colors[colorKey],
        effects: d.effects?.[key] !== false
      };
    }
    function designOwned(key, unlocked) {
      const d = DESIGNS[key];
      return !!d && (!d.unlockId || (unlocked || []).includes(d.unlockId));
    }
    function colorUnlockId(designKey, colorKey) {
      return `color:${designKey}:${colorKey}`;
    }
    var COLORWHEEL_ID = "feature:colorwheel";
    function colorOwned(designKey, colorKey, unlocked) {
      const d = DESIGNS[designKey];
      if (!d) return false;
      if (colorKey === "custom") return designOwned(designKey, unlocked) && (unlocked || []).includes(COLORWHEEL_ID);
      if (!d.colors[colorKey]) return false;
      if (d.colors[colorKey].unlockId) return (unlocked || []).includes(d.colors[colorKey].unlockId);
      if (d.season) return designOwned(designKey, unlocked);
      if (!d.unlockId || colorKey === d.defaultColor) return true;
      return (unlocked || []).includes(colorUnlockId(designKey, colorKey));
    }
    if (typeof module2 !== "undefined") module2.exports = { DESIGNS, resolveDesign, designOwned, colorOwned, colorUnlockId, COLORWHEEL_ID };
  }
});

// shoprotation.js
var require_shoprotation = __commonJS({
  "shoprotation.js"(exports2, module2) {
    var DESIGN_TIERS = ["standard", "mittel", "premium"];
    var OTHER_KINDS = ["effect", "frame", "confetti", "ostyle", "sound", "title"];
    var OTHER_SLOTS = 5;
    var ALWAYS_KINDS = ["feature", "consumable"];
    function weekStart(date = /* @__PURE__ */ new Date()) {
      const m = new Date(date);
      m.setHours(0, 0, 0, 0);
      m.setDate(m.getDate() - (m.getDay() + 6) % 7);
      return m;
    }
    function keyOf(monday) {
      const y = monday.getFullYear();
      const mo = String(monday.getMonth() + 1).padStart(2, "0");
      const d = String(monday.getDate()).padStart(2, "0");
      return `${y}-${mo}-${d}`;
    }
    function seeded(text) {
      let h = 2166136261;
      for (const ch of String(text)) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
      }
      let a = h >>> 0;
      return () => {
        a = a + 1831565813 >>> 0;
        let t = a;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    function shuffled(list, rnd) {
      const a = [...list];
      for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    function pickWeek(allShop, key, avoid = /* @__PURE__ */ new Set()) {
      const shop2 = allShop.filter((x) => !x.season);
      const rnd = seeded(`wgh-shop-${key}`);
      const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      const prefer = (list) => {
        const fresh = list.filter((x) => !avoid.has(x.id));
        return fresh.length ? fresh : list;
      };
      const designs = [];
      for (const tier of DESIGN_TIERS) {
        const pool = prefer(shop2.filter((x) => x.kind === "design" && x.tier === tier).sort(byId));
        const pick = shuffled(pool, rnd)[0];
        if (pick) designs.push(pick.id);
      }
      const others = [];
      const kinds = shuffled(OTHER_KINDS, rnd);
      const pools = Object.fromEntries(kinds.map((k) => [k, shuffled(prefer(shop2.filter((x) => x.kind === k).sort(byId)), rnd)]));
      while (others.length < OTHER_SLOTS && kinds.some((k) => pools[k].length)) {
        for (const k of kinds) {
          if (others.length >= OTHER_SLOTS) break;
          const next = pools[k].shift();
          if (next) others.push(next.id);
        }
      }
      return { designs, others };
    }
    var EPOCH = new Date(2026, 9, 19);
    var cache = /* @__PURE__ */ new Map();
    var cacheShopSig = "";
    function weekFor(shop2, start) {
      const sig = shop2.filter((x) => !x.season).map((x) => x.id).sort().join("|");
      if (sig !== cacheShopSig) {
        cache.clear();
        cacheShopSig = sig;
      }
      const key = keyOf(start);
      if (cache.has(key)) return cache.get(key);
      let week;
      if (start <= EPOCH) {
        week = pickWeek(shop2, key);
      } else {
        const prevStart = new Date(start);
        prevStart.setDate(prevStart.getDate() - 7);
        const prev = weekFor(shop2, prevStart);
        week = pickWeek(shop2, key, /* @__PURE__ */ new Set([...prev.designs, ...prev.others]));
      }
      cache.set(key, week);
      return week;
    }
    function current(shop2, date = /* @__PURE__ */ new Date()) {
      const start = weekStart(date);
      const week = weekFor(shop2, start);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return {
        key: keyOf(start),
        startsAt: start.getTime(),
        endsAt: end.getTime(),
        designs: week.designs,
        others: week.others,
        ids: /* @__PURE__ */ new Set([...week.designs, ...week.others])
      };
    }
    function isAvailable(item, rotation2, unlocked) {
      if (!item) return false;
      if (item.season) return false;
      if (ALWAYS_KINDS.includes(item.kind)) return true;
      if (item.kind === "color") return !item.requires || (unlocked || []).includes(item.requires);
      if (item.kind === "season") return false;
      return rotation2.ids.has(item.id);
    }
    module2.exports = { current, isAvailable, weekStart, keyOf, OTHER_SLOTS, DESIGN_TIERS };
  }
});

// src/sounds.js
var require_sounds = __commonJS({
  "src/sounds.js"(exports2, module2) {
    var SOUND_PACKS = {
      standard: {
        name: "Standard",
        desc: "Zwei klare Piept\xF6ne",
        wave: "sine",
        objective: [[660, 0, 0.15], [880, 0.16, 0.15]],
        spell: [[880, 0, 0.15], [1175, 0.16, 0.15]]
      },
      glocken: {
        name: "Glocken",
        desc: "Helle Glocken mit langem Nachklang",
        unlockId: "sound:glocken",
        price: 1500,
        wave: "triangle",
        objective: [[784, 0, 0.7], [988, 0.18, 0.7], [1319, 0.36, 0.9]],
        spell: [[1319, 0, 0.6], [1568, 0.14, 0.8]]
      },
      retro: {
        name: "Retro",
        desc: "Pieps wie aus alten Konsolen-Spielen",
        unlockId: "sound:retro",
        price: 1500,
        wave: "square",
        volume: 0.45,
        objective: [[523, 0, 0.08], [659, 0.09, 0.08], [784, 0.18, 0.08], [1047, 0.27, 0.16]],
        spell: [[1047, 0, 0.07], [1397, 0.08, 0.14]]
      },
      sanft: {
        name: "Sanft",
        desc: "Tiefe, weiche T\xF6ne \u2013 unaufdringlich",
        unlockId: "sound:sanft",
        price: 1500,
        wave: "sine",
        volume: 1.4,
        objective: [[392, 0, 0.45], [523, 0.22, 0.6]],
        spell: [[523, 0, 0.4], [659, 0.2, 0.55]]
      },
      // Saison-Sound (nur im Battle Pass November 2026)
      donner: {
        name: "Donnergrollen",
        desc: "Tiefes Grollen, dann ein heller Blitz-Ton",
        unlockId: "sound:donner",
        season: "2026-11",
        wave: "sawtooth",
        volume: 0.5,
        objective: [[73, 0, 0.7], [55, 0.25, 1.1], [1568, 0.9, 0.12]],
        spell: [[98, 0, 0.35], [1319, 0.3, 0.12]]
      },
      // Ansage-Stimme (Shop-Feature): Windows-Sprachausgabe statt Piepton
      stimme: {
        name: "Ansage-Stimme",
        desc: "Eine Stimme sagt z. B. \u201EBaron in 30 Sekunden\u201C",
        unlockId: "feature:voice",
        voice: true
      }
    };
    var CUSTOM_SOUNDS_ID = "feature:customsounds";
    function soundPackOwned(key, unlocked) {
      if (key === "custom") return (unlocked || []).includes(CUSTOM_SOUNDS_ID);
      const p = SOUND_PACKS[key];
      return !!p && (!p.unlockId || (unlocked || []).includes(p.unlockId));
    }
    if (typeof module2 !== "undefined") module2.exports = { SOUND_PACKS, soundPackOwned, CUSTOM_SOUNDS_ID };
  }
});

// src/kosmetik.js
var require_kosmetik = __commonJS({
  "src/kosmetik.js"(exports2, module2) {
    var EFFECTS = {
      schnee: { name: "Schnee", icon: "\u2744\uFE0F", desc: "Leise fallende Schneeflocken", unlockId: "effect:schnee", price: 2e3 },
      laub: { name: "Herbstlaub", icon: "\u{1F342}", desc: "Bunte Bl\xE4tter, die durchs Bild wehen", unlockId: "effect:laub", price: 2e3 },
      funken: { name: "Funken", icon: "\u2728", desc: "Gl\xFChende Funken steigen nach oben", unlockId: "effect:funken", price: 2500 },
      gluehwuermchen: { name: "Gl\xFChw\xFCrmchen", icon: "\u{1FAB2}", desc: "Sanft leuchtende Punkte, die umherschweben", unlockId: "effect:gluehwuermchen", price: 3e3 },
      sternschnuppen: { name: "Sternschnuppen", icon: "\u{1F320}", desc: "Ab und zu zischt eine Sternschnuppe vorbei", unlockId: "effect:sternschnuppen", price: 4e3 },
      // Saison-Items (nur im Battle Pass, nie im Shop) – season = Monat der Saison
      gewitterregen: { name: "Gewitterregen", icon: "\u{1F327}\uFE0F", desc: "Schr\xE4ger Regen, ab und zu ein Blitz", unlockId: "effect:gewitter", season: "2026-11" },
      wetterleuchten: { name: "Wetterleuchten", icon: "\u{1F30C}", desc: "Ferne Blitze lassen den Himmel aufleuchten", unlockId: "effect:wetterleuchten", season: "2026-11" }
    };
    var FRAMES = {
      neon: { name: "Neon-Puls", icon: "\u{1F4A0}", desc: "Pulsierender Ring in deiner Akzentfarbe", unlockId: "frame:neon", price: 3e3 },
      flammen: { name: "Flammen", icon: "\u{1F525}", desc: "Lodernder Feuerring", unlockId: "frame:flammen", price: 5e3 },
      gold: { name: "Gold", icon: "\u{1F451}", desc: "Edler, gl\xE4nzender Goldrahmen", unlockId: "frame:gold", price: 8e3 },
      blitz: { name: "Blitzring", icon: "\u{1F329}\uFE0F", desc: "Strom zuckt um dein Profilbild", unlockId: "frame:gewitter", season: "2026-11" }
    };
    var CONFETTI = {
      standard: { name: "Standard", icon: "\u{1F389}", desc: "Bunte Streifen in deiner Farbe" },
      blueten: { name: "Kirschbl\xFCten", icon: "\u{1F338}", desc: "Rosa Bl\xFCtenbl\xE4tter", unlockId: "confetti:blueten", price: 1500 },
      sterne: { name: "Sterne", icon: "\u2B50", desc: "Goldene Sterne", unlockId: "confetti:sterne", price: 1500 },
      muenzen: { name: "Goldm\xFCnzen", icon: "\u{1FA99}", desc: "Klimpernde M\xFCnzen", unlockId: "confetti:muenzen", price: 1500 },
      blitze: { name: "Blitze", icon: "\u26A1", desc: "Zuckende kleine Blitze", unlockId: "confetti:gewitter", season: "2026-11" }
    };
    var OVERLAY_STYLES = {
      standard: { name: "Standard", desc: "Dunkle Pillen mit farbigem Rand" },
      glas: { name: "Glas", desc: "Halbdurchsichtig mit Milchglas-Effekt", unlockId: "ostyle:glas", price: 2500 },
      minimal: { name: "Minimal", desc: "Nur Schrift mit Schatten, kein Kasten", unlockId: "ostyle:minimal", price: 2500 },
      gold: { name: "Gold", desc: "Schwarz mit goldenen R\xE4ndern", unlockId: "ostyle:gold", price: 2500 },
      gewitter: { name: "Gewitter", desc: "Dunkle Pillen mit zuckenden Blitzkanten", unlockId: "ostyle:gewitter", season: "2026-11" }
    };
    var WIN_FX = {
      auto: { name: "Passend zum Design", icon: "\u{1F389}", desc: "Konfetti bzw. die eigene Animation des Designs" },
      gewitter: { name: "Blitzeinschlag", icon: "\u{1F329}\uFE0F", desc: "Ein Blitz schl\xE4gt in dein Sieges-Banner ein", unlockId: "winfx:gewitter", season: "2026-11" }
    };
    var CONSUMABLES = {
      reroll: { id: "item:reroll", icon: "\u{1F3B2}", name: "Aufgabe neu w\xFCrfeln", desc: "Tauscht eine Tagesaufgabe gegen eine andere", price: 300, max: 5 },
      booster: { id: "item:booster", icon: "\u{1F680}", name: "Punkte-Booster", desc: "Dein n\xE4chstes gez\xE4hltes Spiel bringt \xD71,5 Punkte", price: 1500, max: 3 },
      shield: { id: "item:shield", icon: "\u{1F6E1}\uFE0F", name: "Streak-Schutz", desc: "Die n\xE4chste Niederlage setzt deinen Streak nicht zur\xFCck (max. 1 pro Woche)", price: 2500, max: 1 }
    };
    function cosmeticOwned(entry, unlocked) {
      return !!entry && (!entry.unlockId || (unlocked || []).includes(entry.unlockId));
    }
    if (typeof module2 !== "undefined") module2.exports = { EFFECTS, FRAMES, CONFETTI, OVERLAY_STYLES, WIN_FX, CONSUMABLES, cosmeticOwned };
  }
});

// punkte.js
var require_punkte = __commonJS({
  "punkte.js"(exports2, module2) {
    var path2 = require("path");
    var { app } = require("electron");
    var lcu = require_lcu();
    var gamedata = require_gamedata();
    var erfolge = require_erfolge();
    var { readJson, writeJson } = require_speicher();
    var POINTS = {
      // Hotfix 1.0.1: alle Werte verdoppelt (Kleinkram in 1–2 Tagen erspielbar)
      per10Minutes: 30,
      game: 40,
      win: 80,
      kda: 30,
      // KDA ab 4
      cs: 20,
      // ab 7 CS pro Minute
      vision: 20,
      // ab 1,5 Vision pro Minute
      daily5: 100,
      daily10: 300
    };
    var REMAKE_SECONDS = 300;
    var MAX_MULTIPLIER = 3;
    function multiplierFor(streak) {
      if (streak < 3) return 1;
      if (streak === 3) return 1.25;
      if (streak === 4) return 1.5;
      return Math.min(MAX_MULTIPLIER, 2 + (streak - 5) * 0.25);
    }
    var { DESIGNS, colorUnlockId } = require_designs();
    var rotation2 = require_shoprotation();
    var DESIGN_PRICES = {
      // Standard – eigene Farbwelt, keine Animation
      mitternacht: { design: 6e3, color: 600 },
      smaragd: { design: 6e3, color: 600 },
      kupfer: { design: 7e3, color: 600 },
      graphit: { design: 8e3, color: 600 },
      // Mittel – eine ruhige Hintergrund-Animation
      sakura: { design: 15e3, color: 1e3 },
      ozean: { design: 2e4, color: 1e3 },
      neoncity: { design: 25e3, color: 1100 },
      aurora: { design: 3e4, color: 1200 },
      // Premium – volle Animation, eigene Hover-Effekte, teils eigene Sieges-Animation
      runen: { design: 45e3, color: 1300 },
      galaxie: { design: 5e4, color: 1400 },
      drachenfeuer: { design: 55e3, color: 1400 },
      blutmond: { design: 6e4, color: 1500 },
      gold: { design: 8e4, color: 1500 }
    };
    var TITLES = [
      { id: "title:sakura", name: "Kirschbl\xFCte", price: 2500 },
      { id: "title:farmer", name: "CS-Maschine", price: 4e3 },
      { id: "title:streak", name: "Streak-Monster", price: 6e3 },
      { id: "title:legende", name: "Legende", price: 1e5 }
    ];
    var SHOP = [];
    for (const [key, prices] of Object.entries(DESIGN_PRICES)) {
      const d = DESIGNS[key];
      SHOP.push({ id: d.unlockId, kind: "design", key, tier: d.tier, name: d.name, desc: d.desc, price: prices.design });
      for (const [colorKey, c] of Object.entries(d.colors)) {
        if (colorKey === d.defaultColor) continue;
        SHOP.push({ id: colorUnlockId(key, colorKey), kind: "color", key, color: colorKey, rgb: c.rgb, name: c.name, desc: `Farbe f\xFCr ${d.name}`, price: prices.color, requires: d.unlockId });
      }
    }
    for (const t of TITLES) SHOP.push({ ...t, kind: "title", desc: "Titel unter deinem Namen" });
    var saisons2 = require_saisons();
    for (const t of saisons2.SEASON_TITLES) SHOP.push({ ...t, kind: "title", price: 0, desc: `Saison-Titel (Battle Pass ${t.season})` });
    var { SOUND_PACKS } = require_sounds();
    for (const [key, p] of Object.entries(SOUND_PACKS)) {
      if (p.unlockId && p.price) SHOP.push({ id: p.unlockId, kind: "sound", key, name: p.name, desc: p.desc, price: p.price });
    }
    var FEATURES = [
      { id: "feature:notes", icon: "\u{1F4DD}", name: "Champion-Notizen", desc: "Eigene Notizen pro Champion und Matchup \u2013 erscheinen im Champ Select", price: 3e3 },
      { id: "feature:winanim", icon: "\u{1F389}", name: "Sieges-Animation", desc: "Konfetti und Sieges-Banner am Spielende, gr\xF6\xDFer bei einer Streak", price: 5e3 },
      { id: "feature:customsounds", icon: "\u{1F3B5}", name: "Eigene Sounds", desc: "Eigene Sounddateien f\xFCr Objectives und bereite Zauber", price: 6e3 },
      { id: "feature:bans", icon: "\u{1F6AB}", name: "Pers\xF6nliche Ban-Vorschl\xE4ge", desc: "Im Champ Select: gegen welche Champions du oft verlierst", price: 1e4 },
      { id: "feature:colorwheel", icon: "\u{1F3A8}", name: "Freie Farbwahl", desc: "Farbrad: jede beliebige Farbe in jedem freigeschalteten Design", price: 2e4 },
      { id: "feature:scorestyle", icon: "\u{1F31F}", name: "Scoreboard-Stil", desc: "Dein Name leuchtet im Scoreboard in deiner Farbe, mit Emoji und Titel", price: 5e3 },
      { id: "feature:recap", icon: "\u{1F4CA}", name: "Wochen-R\xFCckblick", desc: "Jeden Montag deine Woche als sch\xF6ne Zusammenfassung", price: 6e3 },
      { id: "feature:voice", icon: "\u{1F5E3}\uFE0F", name: "Ansage-Stimme", desc: "Eine Stimme sagt Objectives und bereite Gegner-Zauber an", price: 7e3 },
      { id: "feature:champbg", icon: "\u{1F5BC}\uFE0F", name: "Champion-Hintergrund", desc: "Das Splash-Art deines Champions als Hintergrund im Hub", price: 8e3 },
      { id: "feature:slot4", icon: "\u2795", name: "Vierte Tagesaufgabe", desc: "Dauerhaft eine zus\xE4tzliche Tagesaufgabe", price: 8e3 },
      { id: "feature:announcer", icon: "\u{1F4E3}", name: "Eigene Ansager-Sounds", desc: "Deine eigenen Sounds f\xFCr Double, Triple, Quadra, Penta und Ace", price: 1e4 }
    ];
    for (const f of FEATURES) SHOP.push({ ...f, kind: "feature" });
    var { EFFECTS, FRAMES, CONFETTI, OVERLAY_STYLES, CONSUMABLES } = require_kosmetik();
    var addCatalog = (kind, list) => {
      for (const [key, c] of Object.entries(list)) {
        if (c.unlockId && !c.season) SHOP.push({ id: c.unlockId, kind, key, icon: c.icon, name: c.name, desc: c.desc, price: c.price });
      }
    };
    addCatalog("effect", EFFECTS);
    addCatalog("frame", FRAMES);
    addCatalog("confetti", CONFETTI);
    addCatalog("ostyle", OVERLAY_STYLES);
    for (const [key, c] of Object.entries(CONSUMABLES)) SHOP.push({ id: c.id, kind: "consumable", key, icon: c.icon, name: c.name, desc: c.desc, price: c.price, max: c.max });
    var EMPTY = {
      total: 0,
      // ausgebbare Punkte
      earned: 0,
      // insgesamt verdient
      streak: 0,
      bestStreak: 0,
      history: [],
      // letzte Gutschriften
      credited: [],
      // schon gutgeschriebene Spiel-IDs
      pending: [],
      // beendete Spiele, deren Ergebnis noch fehlt
      current: null,
      // laufendes Spiel { gameId, queueId, seconds, timeChunks }
      today: { date: "", games: 0, seconds: 0, bonus5: false, bonus10: false },
      unlocked: [],
      title: null,
      erfolge: null,
      // Erfolge + Tages-/Wochenaufgaben (siehe erfolge.js)
      items: { reroll: 0, booster: 0, shield: 0 },
      // Vorrat an Verbrauchsgegenständen
      boostArmed: false,
      // Booster fürs nächste Spiel aktiviert
      shieldWeek: ""
      // Woche, in der zuletzt ein Streak-Schutz gekauft wurde
    };
    var data = null;
    var saveTimer = null;
    function file() {
      return path2.join(app.getPath("userData"), "punkte.json");
    }
    function load() {
      if (data) return data;
      const saved = readJson(file(), null);
      data = { ...JSON.parse(JSON.stringify(EMPTY)), ...saved && typeof saved === "object" ? saved : {} };
      data.items = { reroll: 0, booster: 0, shield: 0, ...data.items || {} };
      return data;
    }
    function save() {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (!data) return;
      try {
        writeJson(file(), data, { pretty: true });
      } catch (error) {
        console.error("Punkte konnten nicht gespeichert werden:", error);
      }
    }
    function saveSoon() {
      if (!saveTimer) saveTimer = setTimeout(save, 5e3);
    }
    function todayKey() {
      const d = /* @__PURE__ */ new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    function today() {
      const d = load();
      if (d.today.date !== todayKey()) {
        d.today = { date: todayKey(), games: 0, seconds: 0, bonus5: false, bonus10: false };
      }
      return d.today;
    }
    var onChange = () => {
    };
    var onGameCredited = () => {
    };
    var onAward = () => {
    };
    function grantAwards(awards) {
      const tasks = awards.filter((a) => a.kind !== "achievement").length;
      if (tasks) setTimeout(() => addPassXp(tasks * saisons2.XP.task, "Aufgabe"), 0);
      for (const a of awards) {
        addEntry({
          kind: a.kind === "achievement" ? "achievement" : "task",
          text: a.kind === "achievement" ? `Erfolg: ${a.name}` : `Aufgabe erledigt: ${a.name}`,
          parts: [],
          multiplier: 1,
          total: a.points
        });
      }
      if (awards.length) onAward(awards);
    }
    function addEntry(entry) {
      const d = load();
      d.total += entry.total;
      d.earned += entry.total;
      if (entry.total > 0) {
        const wk = weekOf();
        d.weekEarned = d.weekEarned || {};
        d.weekEarned[wk] = (d.weekEarned[wk] || 0) + entry.total;
        const keep = Object.keys(d.weekEarned).sort().slice(-10);
        d.weekEarned = Object.fromEntries(keep.map((k) => [k, d.weekEarned[k]]));
      }
      d.history.unshift({ at: Date.now(), ...entry });
      d.history = d.history.slice(0, 60);
      save();
      onChange();
    }
    var COUNTING_PHASES = /* @__PURE__ */ new Set(["InProgress", "Reconnect"]);
    var lastTick = 0;
    var ticking = false;
    var currentChecked = false;
    async function tick(overlayEnabled) {
      if (ticking) return;
      ticking = true;
      try {
        const d = load();
        const now = Date.now();
        const elapsed = lastTick ? Math.min(30, (now - lastTick) / 1e3) : 0;
        lastTick = now;
        let phase = "";
        try {
          phase = await lcu.getJson("/lol-gameflow/v1/gameflow-phase") || "";
        } catch {
          phase = "";
        }
        if (COUNTING_PHASES.has(phase)) {
          if (d.current && !currentChecked) {
            const session = await lcu.getJson("/lol-gameflow/v1/session").catch(() => null);
            const nowId = session?.gameData?.gameId || 0;
            if (nowId && nowId !== d.current.gameId) {
              if (!d.current.custom && d.current.seconds > 0) d.pending.push({ gameId: d.current.gameId, endedAt: now });
              d.current = null;
            }
            if (nowId) currentChecked = true;
          }
          if (!d.current) {
            const session = await lcu.getJson("/lol-gameflow/v1/session").catch(() => null);
            const gameId = session?.gameData?.gameId || 0;
            const queueId = session?.gameData?.queue?.id ?? -1;
            const custom = queueId <= 0 || session?.gameData?.isCustomGame;
            if (gameId) d.current = { gameId, queueId, custom: !!custom, seconds: 0, timeChunks: 0, overlaySeconds: 0 };
          }
          if (d.current && !d.current.custom && overlayEnabled) {
            d.current.seconds += elapsed;
            today().seconds += elapsed;
            d.erfolge = erfolge.ensure(d.erfolge, slots());
            grantAwards(erfolge.onMinutes(d.erfolge, elapsed / 60));
            const chunks = Math.floor(d.current.seconds / 600);
            while (d.current.timeChunks < chunks) {
              d.current.timeChunks += 1;
              addEntry({
                kind: "time",
                text: `${d.current.timeChunks * 10} Minuten im Spiel`,
                parts: [{ label: "10 Minuten im Spiel", points: POINTS.per10Minutes }],
                multiplier: 1,
                total: POINTS.per10Minutes
              });
            }
            saveSoon();
          }
        } else if (d.current) {
          if (!d.current.custom && d.current.seconds > 0) {
            d.pending.push({ gameId: d.current.gameId, endedAt: now });
          }
          d.current = null;
          save();
        }
        await processPending();
      } finally {
        ticking = false;
      }
    }
    async function processPending() {
      const d = load();
      if (!d.pending.length) return;
      const me = await lcu.getJson("/lol-summoner/v1/current-summoner").catch(() => null);
      if (!me?.puuid) return;
      await gamedata.load().catch(() => {
      });
      for (const item of [...d.pending]) {
        const drop = () => {
          d.pending = d.pending.filter((p) => p.gameId !== item.gameId);
          save();
        };
        if (d.credited.includes(item.gameId)) {
          drop();
          continue;
        }
        if (Date.now() - item.endedAt > 6 * 3600 * 1e3) {
          drop();
          continue;
        }
        const game = await lcu.getJson(`/lol-match-history/v1/games/${item.gameId}`).catch(() => null);
        if (!game?.participants) continue;
        const identities = new Map((game.participantIdentities || []).map((x) => [x.participantId, x.player || {}]));
        const mine = game.participants.find((p) => identities.get(p.participantId)?.puuid === me.puuid);
        if (!mine) {
          drop();
          continue;
        }
        d.credited.unshift(item.gameId);
        d.credited = d.credited.slice(0, 300);
        drop();
        if ((game.gameDuration || 0) < REMAKE_SECONDS || game.queueId <= 0 || game.gameType === "CUSTOM_GAME") continue;
        creditGame(game, mine);
        try {
          onGameCredited({ gameId: game.gameId, puuid: me.puuid, name: me.gameName || me.displayName || "", tag: me.tagLine || "" });
        } catch {
        }
      }
    }
    function creditGame(game, mine) {
      const d = load();
      const s = mine.stats || {};
      const win = !!s.win;
      const minutes = Math.max(1, game.gameDuration / 60);
      let champ = "";
      try {
        champ = gamedata.champion(mine.championId)?.name || "";
      } catch {
      }
      let shieldUsed = false;
      if (!win && d.streak > 0 && d.items.shield > 0) {
        d.items.shield -= 1;
        shieldUsed = true;
      } else {
        d.streak = win ? d.streak + 1 : 0;
      }
      d.bestStreak = Math.max(d.bestStreak, d.streak);
      let multiplier = win ? multiplierFor(d.streak) : 1;
      const boosted = d.boostArmed;
      if (boosted) {
        multiplier = Math.round(multiplier * 1.5 * 100) / 100;
        d.boostArmed = false;
      }
      const parts = [{ label: "Spiel beendet", points: POINTS.game }];
      if (win) parts.push({ label: "Sieg", points: POINTS.win });
      const kda = ((s.kills || 0) + (s.assists || 0)) / Math.max(1, s.deaths || 0);
      if (kda >= 4) parts.push({ label: `KDA ${kda.toFixed(1)}`, points: POINTS.kda });
      const cs = ((s.totalMinionsKilled || 0) + (s.neutralMinionsKilled || 0)) / minutes;
      if (cs >= 7) parts.push({ label: `${cs.toFixed(1)} CS/Min`, points: POINTS.cs });
      const vision = (s.visionScore || 0) / minutes;
      if (vision >= 1.5) parts.push({ label: `Vision ${vision.toFixed(1)}/Min`, points: POINTS.vision });
      const base = parts.reduce((sum, p) => sum + p.points, 0);
      const total = Math.round(base * multiplier);
      addEntry({
        kind: "game",
        gameId: game.gameId,
        win,
        champion: champ,
        text: `${win ? "Sieg" : "Niederlage"}${champ ? ` mit ${champ}` : ""}${boosted ? " \xB7 \u{1F680} Booster" : ""}${shieldUsed ? " \xB7 \u{1F6E1}\uFE0F Streak gesch\xFCtzt" : ""}`,
        parts,
        streak: d.streak,
        multiplier,
        total
      });
      addPassXp(saisons2.XP.game + (win ? saisons2.XP.win : 0), win ? "Sieg" : "Spiel");
      const t = today();
      t.games += 1;
      if (t.games >= 5 && !t.bonus5) {
        t.bonus5 = true;
        addEntry({ kind: "bonus", text: "Tagesbonus: 5 Spiele", parts: [{ label: "5 Spiele heute", points: POINTS.daily5 }], multiplier: 1, total: POINTS.daily5 });
      }
      if (t.games >= 10 && !t.bonus10) {
        t.bonus10 = true;
        addEntry({ kind: "bonus", text: "Tagesbonus: 10 Spiele", parts: [{ label: "10 Spiele heute", points: POINTS.daily10 }], multiplier: 1, total: POINTS.daily10 });
      }
      d.erfolge = erfolge.ensure(d.erfolge, slots());
      const ended = (game.gameCreation || Date.now()) + (game.gameDuration || 0) * 1e3;
      grantAwards(erfolge.onGame(d.erfolge, {
        win,
        minutes,
        kills: s.kills || 0,
        deaths: s.deaths || 0,
        assists: s.assists || 0,
        kda,
        csPerMin: cs,
        visionPerMin: vision,
        champId: mine.championId || 0,
        triple: s.tripleKills || 0,
        quadra: s.quadraKills || 0,
        penta: s.pentaKills || 0,
        hour: new Date(ended).getHours(),
        streak: d.streak,
        bestStreak: d.bestStreak,
        dayGames: t.games
      }));
      save();
    }
    var adminMode = false;
    function setAdminMode(on) {
      adminMode = !!on;
      onChange();
    }
    function effectiveUnlocked() {
      return adminMode ? SHOP.map((x) => x.id) : load().unlocked;
    }
    function state() {
      const d = load();
      const t = today();
      const rot = rotation2.current(SHOP);
      const unlockedNow = effectiveUnlocked();
      return {
        rotation: { key: rot.key, startsAt: rot.startsAt, endsAt: rot.endsAt, designs: rot.designs, others: rot.others },
        pass: passView(),
        total: d.total,
        earned: d.earned,
        streak: d.streak,
        bestStreak: d.bestStreak,
        multiplier: multiplierFor(d.streak),
        nextMultiplier: multiplierFor(d.streak + 1),
        inGame: !!d.current && !d.current.custom,
        gameSeconds: d.current?.seconds || 0,
        today: { games: t.games, minutes: Math.floor(t.seconds / 60), bonus5: t.bonus5, bonus10: t.bonus10 },
        history: d.history.slice(0, 25),
        shop: SHOP.map((item) => ({ ...item, owned: unlockedNow.includes(item.id), available: rotation2.isAvailable(item, rot, unlockedNow) })),
        unlocked: effectiveUnlocked(),
        title: d.title && effectiveUnlocked().includes(d.title) ? d.title : null,
        // Titel nur, wenn (noch) frei
        adminMode,
        points: POINTS,
        items: { ...d.items },
        boostArmed: d.boostArmed,
        shieldBuyable: d.shieldWeek !== weekOf(),
        feedbackBonus: { claimed: !!d.feedbackBonus, revoked: !!d.feedbackBonusRevoked, amount: FEEDBACK_BONUS },
        erfolge: erfolge.view(d.erfolge = erfolge.ensure(d.erfolge, slots()), d.bestStreak, t.games)
      };
    }
    function owns(id) {
      return effectiveUnlocked().includes(id);
    }
    function buy(id) {
      const d = load();
      const item = SHOP.find((x) => x.id === id);
      if (!item) return { ok: false, reason: "Unbekannt" };
      if (adminMode) return { ok: false, reason: "Im Admin-Modus wird nichts gekauft" };
      if (!d.unlocked.includes(id) && !rotation2.isAvailable(item, rotation2.current(SHOP), d.unlocked)) {
        return { ok: false, reason: "Gerade nicht im Shop" };
      }
      if (item.kind === "consumable") return buyConsumable(d, item);
      if (d.unlocked.includes(id)) return { ok: false, reason: "Schon freigeschaltet" };
      if (item.requires && !d.unlocked.includes(item.requires)) return { ok: false, reason: "Erst das Design freischalten" };
      if (d.total < item.price) return { ok: false, reason: "Nicht genug Punkte" };
      d.total -= item.price;
      d.unlocked.push(id);
      d.history.unshift({ at: Date.now(), kind: "buy", text: `Gekauft: ${item.name}`, parts: [], multiplier: 1, total: -item.price });
      save();
      onChange();
      return { ok: true };
    }
    function weekEarned(key) {
      return load().weekEarned?.[key] || 0;
    }
    function weekOf(date = /* @__PURE__ */ new Date()) {
      const m = new Date(date);
      m.setHours(0, 0, 0, 0);
      m.setDate(m.getDate() - (m.getDay() + 6) % 7);
      return m.toISOString().slice(0, 10);
    }
    function buyConsumable(d, item) {
      if ((d.items[item.key] || 0) >= item.max) return { ok: false, reason: "Vorrat voll" };
      if (item.key === "shield" && d.shieldWeek === weekOf()) return { ok: false, reason: "Nur 1 pro Woche" };
      if (d.total < item.price) return { ok: false, reason: "Nicht genug Punkte" };
      d.total -= item.price;
      d.items[item.key] = (d.items[item.key] || 0) + 1;
      if (item.key === "shield") d.shieldWeek = weekOf();
      d.history.unshift({ at: Date.now(), kind: "buy", text: `Gekauft: ${item.name}`, parts: [], multiplier: 1, total: -item.price });
      save();
      onChange();
      return { ok: true };
    }
    function useItem(key, arg) {
      const d = load();
      if (key === "booster") {
        if (d.boostArmed) return { ok: false, reason: "Schon aktiv" };
        if (!d.items.booster) return { ok: false, reason: "Kein Booster da" };
        d.items.booster -= 1;
        d.boostArmed = true;
      } else if (key === "reroll") {
        if (!d.items.reroll) return { ok: false, reason: "Kein W\xFCrfel da" };
        d.erfolge = erfolge.ensure(d.erfolge, slots());
        if (!erfolge.reroll(d.erfolge, arg)) return { ok: false, reason: "Diese Aufgabe kann nicht getauscht werden" };
        d.items.reroll -= 1;
      } else {
        return { ok: false };
      }
      save();
      onChange();
      return { ok: true };
    }
    function slots() {
      return { daily: effectiveUnlocked().includes("feature:slot4") ? 4 : 3 };
    }
    function setTitle(id) {
      const d = load();
      if (id && !effectiveUnlocked().includes(id)) return { ok: false };
      d.title = id || null;
      save();
      onChange();
      return { ok: true };
    }
    function titleName() {
      const d = load();
      return SHOP.find((x) => x.id === d.title)?.name || null;
    }
    var FEEDBACK_BONUS = 500;
    function grantFeedbackBonus(token) {
      const d = load();
      if (d.feedbackBonus) return 0;
      d.feedbackBonus = true;
      d.feedbackBonusToken = token || null;
      addEntry({ kind: "bonus", text: "Danke f\xFCrs erste Feedback!", parts: [], multiplier: 1, total: FEEDBACK_BONUS });
      return FEEDBACK_BONUS;
    }
    function feedbackBonusToken() {
      const d = load();
      return d.feedbackBonus && !d.feedbackBonusRevoked ? d.feedbackBonusToken || null : null;
    }
    function revokeFeedbackBonus() {
      const d = load();
      if (!d.feedbackBonus || d.feedbackBonusRevoked) return false;
      d.feedbackBonusRevoked = true;
      const minus = Math.min(FEEDBACK_BONUS, d.total);
      d.total -= minus;
      d.earned = Math.max(0, d.earned - FEEDBACK_BONUS);
      d.history.unshift({ at: Date.now(), kind: "admin", text: "Feedback-Bonus vom Creator zur\xFCckgenommen", parts: [], multiplier: 1, total: -minus });
      d.history = d.history.slice(0, 60);
      save();
      onChange();
      return true;
    }
    function passData(d, season) {
      if (!d.pass || d.pass.season !== season.id) {
        d.pass = { season: season.id, xp: 0, premium: false, freeUpTo: 0, premiumUpTo: 0 };
      }
      return d.pass;
    }
    function tierOf(xp) {
      return Math.min(saisons2.TIERS, Math.floor(xp / saisons2.XP_PER_TIER));
    }
    function grantPassReward(d, r, season, tier, track) {
      if (!r) return "";
      const label = `Battle Pass ${season.name} \u2013 Stufe ${tier}${track === "premium" ? " (Upgrade)" : ""}`;
      if (r.type === "multi") return r.rewards.map((x) => grantPassReward(d, x, season, tier, track)).filter(Boolean).join(" + ");
      if (r.type === "points") {
        addEntry({ kind: "pass", text: label, parts: [], multiplier: 1, total: r.amount });
        return `+${r.amount.toLocaleString("de-DE")} Punkte`;
      }
      if (r.type === "item") {
        const c = Object.values(CONSUMABLES).find((x) => x.id === `item:${r.key}`) || CONSUMABLES[r.key];
        let added = 0;
        let refund = 0;
        for (let i = 0; i < (r.count || 1); i += 1) {
          if ((d.items[r.key] || 0) < c.max) {
            d.items[r.key] = (d.items[r.key] || 0) + 1;
            added += 1;
          } else refund += c.price;
        }
        if (refund) addEntry({ kind: "pass", text: `${label} \xB7 ${c.name} (Vorrat voll \u2192 Punkte)`, parts: [], multiplier: 1, total: refund });
        return added ? `${c.icon} ${c.name}${added > 1 ? ` \xD7${added}` : ""}` : `+${refund.toLocaleString("de-DE")} Punkte (Vorrat voll)`;
      }
      if (r.type === "unlock" || r.type === "title") {
        if (!d.unlocked.includes(r.id)) d.unlocked.push(r.id);
        return r.name;
      }
      if (r.type === "emoji") {
        if (!d.unlocked.includes(r.id)) d.unlocked.push(r.id);
        return r.name;
      }
      if (r.type === "badge") {
        d.badges = Array.isArray(d.badges) ? d.badges : [];
        if (!d.badges.some((b) => b.id === r.id)) d.badges.push({ id: r.id, name: r.name, icon: r.icon || "\u{1F3C5}", at: Date.now() });
        return r.name;
      }
      return "";
    }
    function payoutPass(d, season) {
      const p = passData(d, season);
      const tier = tierOf(p.xp);
      const awards = [];
      for (let t = p.freeUpTo + 1; t <= tier; t += 1) {
        const text = grantPassReward(d, season.tiers[t - 1].free, season, t, "free");
        awards.push({ kind: "pass", tier: t, track: "free", name: text });
      }
      p.freeUpTo = Math.max(p.freeUpTo, tier);
      if (p.premium) {
        for (let t = p.premiumUpTo + 1; t <= tier; t += 1) {
          const text = grantPassReward(d, season.tiers[t - 1].premium, season, t, "premium");
          awards.push({ kind: "pass", tier: t, track: "premium", name: text });
        }
        p.premiumUpTo = Math.max(p.premiumUpTo, tier);
      }
      return awards;
    }
    function addPassXp(amount, reason) {
      if (adminMode) return;
      const season = saisons2.current();
      if (!season || !(amount > 0)) return;
      const d = load();
      const p = passData(d, season);
      if (tierOf(p.xp) >= saisons2.TIERS) return;
      p.xp += amount;
      p.lastReason = reason || "";
      const awards = payoutPass(d, season);
      save();
      onChange();
      if (awards.length) onAward(awards);
    }
    function upgradePass() {
      if (adminMode) return { ok: false, reason: "Im Admin-Modus wird nichts gekauft" };
      const season = saisons2.current();
      if (!season) return { ok: false, reason: "Der Battle Pass hat noch nicht begonnen" };
      const d = load();
      const p = passData(d, season);
      if (p.premium) return { ok: false, reason: "Schon freigeschaltet" };
      if (d.total < saisons2.UPGRADE_PRICE) return { ok: false, reason: "Nicht genug Punkte" };
      d.total -= saisons2.UPGRADE_PRICE;
      d.history.unshift({ at: Date.now(), kind: "buy", text: `Battle Pass ${season.name}: Upgrade`, parts: [], multiplier: 1, total: -saisons2.UPGRADE_PRICE });
      p.premium = true;
      const awards = payoutPass(d, season);
      save();
      onChange();
      if (awards.length) onAward(awards);
      return { ok: true };
    }
    function passView() {
      const d = load();
      const now = /* @__PURE__ */ new Date();
      const season = saisons2.current(now);
      const next = saisons2.upcoming(now);
      const shown = season || next;
      const p = season ? passData(d, season) : null;
      return {
        active: !!season,
        adminMode,
        season: shown ? { id: shown.id, name: shown.name, icon: shown.icon, design: shown.design, startsAt: saisons2.startOf(shown).getTime(), endsAt: saisons2.endOf(shown).getTime(), tiers: shown.tiers } : null,
        xp: p ? p.xp : 0,
        tier: p ? tierOf(p.xp) : 0,
        premium: !!p?.premium,
        xpPerTier: saisons2.XP_PER_TIER,
        tiersTotal: saisons2.TIERS,
        upgradePrice: saisons2.UPGRADE_PRICE,
        xpRules: saisons2.XP,
        // Admin-Erinnerung: Pass läuft noch ≤ 7 Tage und für den Folgemonat ist noch keiner im Code
        needNext: !!season && saisons2.endOf(season) - now <= 7 * 864e5 && !saisons2.hasNextMonth(now),
        badges: d.badges || []
      };
    }
    function senderId() {
      const d = load();
      if (!d.senderId) {
        d.senderId = require("crypto").randomBytes(16).toString("hex");
        save();
      }
      return d.senderId;
    }
    function giftIds() {
      const d = load();
      return [senderId(), d.feedbackBonusToken].filter(Boolean);
    }
    function receiveGift(gift) {
      const d = load();
      const id = Number(gift?.id);
      const points = Math.round(Number(gift?.points) || 0);
      if (!id || points <= 0) return false;
      d.giftsReceived = Array.isArray(d.giftsReceived) ? d.giftsReceived : [];
      if (d.giftsReceived.includes(id)) return false;
      d.giftsReceived = [...d.giftsReceived, id].slice(-200);
      const msg = String(gift.message || "").trim();
      addEntry({ kind: "gift", text: `\u{1F381} Dankesch\xF6n vom Creator${msg ? `: ${msg.slice(0, 120)}` : ""}`, parts: [], multiplier: 1, total: points });
      return true;
    }
    function grantSquadReward(r) {
      if (adminMode) return false;
      const points = Math.round(Number(r?.points) || 0);
      const id = String(r?.id || "");
      if (points <= 0 || !id) return false;
      const d = load();
      d.squadPaid = Array.isArray(d.squadPaid) ? d.squadPaid : [];
      if (d.squadPaid.includes(id)) return false;
      d.squadPaid = [...d.squadPaid, id].slice(-100);
      addEntry({ kind: "squad", text: String(r.text || "Squad-Belohnung").slice(0, 100), parts: [], multiplier: 1, total: points });
      onAward([{ kind: "squad", name: r.text, points, icon: r.icon || "\u{1F465}" }]);
      return true;
    }
    function grantWeeklyGoal(goal) {
      if (adminMode) return false;
      const points = Math.round(Number(goal?.points) || 0);
      if (points <= 0) return false;
      addEntry({ kind: "weekly", text: `Wochenziel geschafft: ${String(goal.name || "").slice(0, 80)}`, parts: [], multiplier: 1, total: points });
      setTimeout(() => addPassXp(saisons2.XP.weekly, "Wochenziel"), 0);
      onAward([{ kind: "weekly", name: goal.name, points, icon: goal.icon || "\u{1F3AF}" }]);
      return true;
    }
    function adminAddPoints(amount) {
      const d = load();
      const n = Math.round(Number(amount) || 0);
      if (!n) return;
      const before = d.total;
      d.total = Math.max(0, d.total + n);
      d.history.unshift({ at: Date.now(), kind: "admin", text: n > 0 ? "Admin: Test-Punkte" : "Admin: Punkte abgezogen", parts: [], multiplier: 1, total: d.total - before });
      d.history = d.history.slice(0, 60);
      save();
      onChange();
    }
    function adminResetPoints() {
      const d = load();
      d.history.unshift({ at: Date.now(), kind: "admin", text: "Admin: Kontostand auf 0", parts: [], multiplier: 1, total: -d.total });
      d.total = 0;
      save();
      onChange();
    }
    function adminReset() {
      data = JSON.parse(JSON.stringify(EMPTY));
      save();
      onChange();
    }
    function setOnChange(fn) {
      onChange = fn;
    }
    function setOnGameCredited(fn) {
      onGameCredited = fn;
    }
    function setOnAward(fn) {
      onAward = fn;
    }
    module2.exports = {
      tick,
      state,
      buy,
      useItem,
      owns,
      weekEarned,
      weekOf,
      setTitle,
      titleName,
      setOnChange,
      save,
      addPassXp,
      upgradePass,
      passView,
      grantWeeklyGoal,
      grantSquadReward,
      setAdminMode,
      grantFeedbackBonus,
      feedbackBonusToken,
      revokeFeedbackBonus,
      senderId,
      giftIds,
      receiveGift,
      adminReset,
      adminResetPoints,
      adminAddPoints,
      setOnGameCredited,
      setOnAward,
      POINTS,
      multiplierFor,
      SHOP,
      _creditGame: creditGame,
      _load: load
      // für Tests
    };
  }
});

// werkzeuge/discord-bot.js
var path = require("path");
var fs = require("fs");
var os = require("os");
var https = require("https");
var Module = require("module");
var ROOT = path.join(__dirname, "..");
var PROBE = process.argv.includes("--probe") || process.env.DRY_RUN === "1";
var FORCE = process.argv.includes("--alles") || process.env.FORCE === "alles";
var realLoad = Module._load;
Module._load = function(request2, ...rest) {
  if (request2 === "electron") return { app: { getPath: () => os.tmpdir(), getVersion: () => "0" }, safeStorage: { isEncryptionAvailable: () => false } };
  if (request2 === "./lcu") return { getJson: async () => null, getStatus: async () => ({ connected: false }) };
  if (request2 === "./gamedata") return { load: async () => {
  }, champion: (id) => ({ id, name: `Champion ${id}` }), item: () => null, allItems: () => [] };
  return realLoad.call(this, request2, ...rest);
};
var logik = require_squadlogik();
var saisons = require_saisons();
var shop = null;
var rotation = null;
try {
  shop = require_punkte().SHOP;
  rotation = require_shoprotation();
} catch (error) {
  console.log("Shop konnte nicht geladen werden:", error.message);
}
function request(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request({ method, host: u.host, path: u.pathname + u.search, headers: { Accept: "application/json", ...payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}, ...headers }, timeout: 2e4 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("timeout", () => req.destroy(new Error("Zeit\xFCberschreitung")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
function supabaseConfig() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) return { url: process.env.SUPABASE_URL.replace(/\/+$/, ""), key: process.env.SUPABASE_KEY };
  try {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, "scoreboard.json"), "utf8"));
    return { url: c.url, key: c.publishableKey };
  } catch {
    return null;
  }
}
async function loadGames(sinceMs) {
  const c = supabaseConfig();
  if (!c) throw new Error("Keine Supabase-Adresse (scoreboard.json oder SUPABASE_URL/SUPABASE_KEY)");
  const since = encodeURIComponent(new Date(sinceMs).toISOString());
  const res = await request("GET", `${c.url}/rest/v1/spiele?ended_at=gte.${since}&select=*&order=ended_at.desc&limit=3000`, { apikey: c.key, Authorization: `Bearer ${c.key}` });
  if (res.status !== 200 || !Array.isArray(res.json)) throw new Error(`Supabase antwortet mit ${res.status}`);
  return res.json;
}
var champNames = null;
async function champName(id) {
  if (!champNames) {
    champNames = {};
    try {
      const v = (await request("GET", "https://ddragon.leagueoflegends.com/api/versions.json")).json?.[0];
      const data = (await request("GET", `https://ddragon.leagueoflegends.com/cdn/${v}/data/de_DE/champion.json`)).json?.data || {};
      for (const c of Object.values(data)) champNames[Number(c.key)] = c.name;
    } catch {
    }
  }
  return champNames[id] || `Champion ${id}`;
}
var MEDAL = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
var num = (n) => Number(n).toLocaleString("de-DE");
var COLOR = { gold: 16498468, cyan: 2282478, green: 4906624, purple: 10980346 };
function weekPosts(rows, now) {
  const embeds = [];
  const last = logik.standings(rows, logik.previousWeek(now));
  const t = last.tournament;
  embeds.push({
    title: `\u{1F3C1} Squad-Turnier \u2013 ${t.icon} ${t.name}`,
    description: last.table.length ? last.table.slice(0, 5).map((r) => `${r.place <= 3 ? MEDAL[r.place - 1] : `**${r.place}.**`} **${r.name}** \u2013 ${r.text} (${r.games} Spiele)${r.reward ? ` \xB7 +${num(r.reward)} Punkte` : ""}`).join("\n") + (last.participants < 2 ? "\n\n_Zu wenige Teilnehmer f\xFCr eine Belohnung._" : "") : `Letzte Woche hat niemand mitgemacht (mind. ${t.min} ${t.min === 1 ? "Spiel" : "Spiele"}).`,
    color: COLOR.gold
  });
  const ch = logik.challenge(rows, logik.previousWeek(now));
  if (ch.active > 0) {
    embeds.push({
      title: ch.done ? "\u{1F91D} Squad-Challenge geschafft!" : "\u{1F91D} Squad-Challenge knapp verpasst",
      description: `${ch.wins} von ${ch.target} Siegen zusammen.${ch.done ? ` Jeder, der mitgespielt hat, bekommt **${ch.reward} Punkte** (automatisch im Hub).` : ""}`,
      color: ch.done ? COLOR.green : COLOR.purple
    });
  }
  const cur = logik.standings(rows, logik.weekRange(now));
  const ct = cur.tournament;
  const chNow = logik.challenge(rows, logik.weekRange(now));
  embeds.push({
    title: `\u{1F195} Turnier dieser Woche: ${ct.icon} ${ct.name}`,
    description: `Z\xE4hlt ab ${ct.min} ${ct.min === 1 ? "Spiel" : "Spielen"} auf Summoner's Rift. Belohnung je nach Teilnehmerzahl \u2013 bis zu **${num(logik.rewardsFor(5)[0])} Punkte** f\xFCr Platz 1.
Squad-Challenge: zusammen **${chNow.target} Siege**.
Stand jederzeit im Hub unter \u{1F465} Squad.`,
    color: COLOR.cyan
  });
  if (shop && rotation) {
    const rot = rotation.current(shop, now);
    const byId = new Map(shop.map((x) => [x.id, x]));
    const KIND = { design: "", title: "Titel", effect: "Effekt", frame: "Rahmen", confetti: "Konfetti", sound: "Sound-Paket", ostyle: "Overlay-Stil", color: "Farbe", feature: "Feature", winfx: "Sieges-Animation" };
    const line = (id) => {
      const it = byId.get(id);
      return it ? `\u2022 ${KIND[it.kind] ? `${KIND[it.kind]} ` : ""}${it.kind === "title" ? `\u201E${it.name}\u201C` : it.name} \u2013 ${num(it.price)} \u2B50` : null;
    };
    embeds.push({
      title: "\u{1F504} Neuer Wochen-Shop",
      description: `**Designs**
${rot.designs.map(line).filter(Boolean).join("\n")}

**Au\xDFerdem**
${rot.others.map(line).filter(Boolean).join("\n")}

_Nur bis Sonntag 23:59._`,
      color: COLOR.purple
    });
  }
  return embeds;
}
function seasonStartPost(now) {
  const s = saisons.current(now);
  if (!s) return null;
  return {
    title: `\u{1F39F}\uFE0F Neue Saison: ${s.icon || ""} ${s.name}`,
    description: `Der Battle Pass f\xFCr ${now.toLocaleDateString("de-DE", { month: "long", year: "numeric" })} ist da \u2013 ${saisons.TIERS} Stufen, gratis f\xFCr alle, mit Upgrade f\xFCr ${num(saisons.UPGRADE_PRICE)} Punkte.
Jedes Spiel z\xE4hlt ab jetzt. Viel Spa\xDF! \u26A1`,
    color: COLOR.gold
  };
}
function seasonEndPost(now) {
  const s = saisons.current(now);
  if (!s) return null;
  return {
    title: `\u23F3 Letzter Tag: ${s.icon || ""} ${s.name}`,
    description: "Die Saison endet **heute um 23:59**. Danach gibt es die Saison-Belohnungen nie wieder \u2013 letzte Chance auf ein paar Stufen!",
    color: COLOR.purple
  };
}
async function highlightPost(rows, now) {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  y.setHours(0, 0, 0, 0);
  const range = { start: y.getTime(), end: y.getTime() + 864e5 };
  const list = logik.highlights(rows, range);
  if (!list.length) return null;
  const lines = [];
  for (const h of list.slice(0, 10)) lines.push(`${h.kind === "penta" ? "\u{1F590}\uFE0F **PENTAKILL**" : "\u270B Quadrakill"} \u2013 **${h.name}** mit ${await champName(h.champ)} (${h.kda}${h.win ? ", Sieg" : ""})`);
  return { title: "\u{1F3AC} Highlights von gestern", description: lines.join("\n"), color: COLOR.green };
}
async function main() {
  const now = /* @__PURE__ */ new Date();
  if (!PROBE && !FORCE && now.getHours() !== 0) {
    console.log(`Jetzt ist es ${now.getHours()} Uhr (deutsche Zeit) \u2013 nur um 0 Uhr wird gepostet.`);
    return;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const due = {
    week: FORCE || now.getDay() === 1,
    seasonStart: FORCE || now.getDate() === 1,
    seasonEnd: FORCE || tomorrow.getDate() === 1,
    highlights: true
  };
  const rows = await loadGames(logik.previousWeek(now).start - 864e5).catch((e) => {
    console.log(e.message);
    return [];
  });
  const embeds = [];
  if (due.seasonStart) {
    const p = seasonStartPost(now);
    if (p) embeds.push(p);
  }
  if (due.week) embeds.push(...weekPosts(rows, now));
  if (due.seasonEnd && !due.seasonStart) {
    const p = seasonEndPost(now);
    if (p) embeds.push(p);
  }
  if (due.highlights) {
    const p = await highlightPost(rows, now);
    if (p) embeds.push(p);
  }
  if (!embeds.length) {
    console.log("Heute gibt es nichts zu posten.");
    return;
  }
  const body = { username: "WorldGaming Hub", embeds: embeds.slice(0, 10) };
  if (PROBE) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }
  const hook = process.env.DISCORD_WEBHOOK;
  if (!hook) throw new Error("DISCORD_WEBHOOK fehlt (GitHub-Geheimnis)");
  const res = await request("POST", hook, {}, body);
  if (res.status >= 300) throw new Error(`Discord antwortet mit ${res.status}: ${res.text.slice(0, 200)}`);
  console.log(`Gepostet: ${embeds.map((e) => e.title).join(" | ")}`);
}
if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
module.exports = { weekPosts, seasonStartPost, seasonEndPost, highlightPost };
