/* RUFL website. Reads /data/league.json (the same format the LFL/YCFA bots write),
   so a RUFL bot can publish into it later without touching this file. */
(() => {
  "use strict";
  const INVITE = "https://discord.gg/Z6WvRbmyQ"; // fallback; league.json "discord" wins when set
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $("#app");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let D = null, lastUpdated = null, live = null;
  const state = { sort: {}, view: null, week: null, lg: null };
  try { state.lg = localStorage.getItem("rufl-lg") || null; } catch (e) {}

  // ---------------------------------------------------------------- helpers
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (n == null || n === "" ? "–" : Number.isInteger(+n) ? String(+n) : (+n).toFixed(1));
  const num = (n) => Number(n || 0).toLocaleString("en-US");
  const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"));
  const weekNum = (w) => parseInt(String(w || "").replace(/\D/g, ""), 10) || 0;
  const ARW = `<svg class="arw" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  const BACK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`;
  const DC = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>`;
  const invite = () => (D && D.league.discord) || INVITE;
  const season = () => String(D.league.season);
  const tab = (k) => D.tabs.find((t) => t.key === k);
  const teamBy = (name) => (name ? D.teams.find((t) => t.name === name) || D.teams.find((t) => t.name.toLowerCase() === String(name).toLowerCase()) : null);
  const teamById = (id) => D.teams.find((t) => t.id === id);
  const teamHref = (name) => { const t = teamBy(name); return t ? `/team/${t.id}` : null; };
  const playerHref = (key) => `/player/${encodeURIComponent(key)}`;
  const gameHref = (id) => `/game/${id}`;
  const recOf = (t) => (t ? `${t.w}-${t.l}${t.t ? "-" + t.t : ""}` : "");
  const confRec = (t) => `${t.cw}-${t.cl}${t.ct ? "-" + t.ct : ""}`;
  const scored = (g) => g && g.home && g.away && g.hs != null && g.as != null;
  const diffCls = (d) => (d > 0 ? "up" : d < 0 ? "down" : "");
  const diffTxt = (d) => (d > 0 ? "+" : "") + (d ?? 0);
  const confTeams = (c) => c.teams.map(teamById).filter(Boolean);
  // ----- leagues (RUFL runs an NFL league and a CFB league; conferences carry "league")
  const leagues = () => (D.leagues && D.leagues.length ? D.leagues
    : [...new Set(D.conferences.map((c) => c.league).filter(Boolean))].map((k) => ({ key: k, name: k, full: k })));
  const leagueOf = (name) => {
    const t = teamBy(name); if (!t) return null;
    if (t.league) return t.league;
    const c = D.conferences.find((x) => x.name === t.conf); return c ? c.league || null : null;
  };
  const inLg = (name) => !state.lg || leagueOf(name) === state.lg;
  const confList = () => D.conferences.map((c) => ({ name: c.name, full: c.full || c.name, league: c.league || null, teams: confTeams(c) })).filter((c) => c.teams.length);
  function byLeague(list, all) {
    const groups = leagues().filter((l) => all || !state.lg || l.key === state.lg)
      .map((l) => ({ lg: l, confs: list.filter((c) => c.league === l.key) })).filter((g) => g.confs.length);
    const loose = list.filter((c) => !c.league);
    if (loose.length && (all || !state.lg)) groups.push({ lg: null, confs: loose });
    return groups;
  }
  const race = (k) => { const l = leagues().find((x) => x.key === k) || {}; const label = l.race || (k === "CFB" ? "Heisman" : "MVP"); return { label, slug: label.toLowerCase() }; };
  const sec = (path = "") => (state.lg ? `/${state.lg.toLowerCase()}${path}` : path || "/");
  const lgObj = (k) => leagues().find((l) => l.key === k) || { key: k, name: k, full: k };
  const lgBanner = (l) => (l && !state.lg ? `<div class="lg-banner lg-${esc(l.key)}"><b>${esc(l.name)}</b><span>${esc(l.full)}</span></div>` : "");
  const lgSegOff = true;
  function lgSeg() {
    if (lgSegOff) return "";
    const L = leagues();
    if (L.length < 2) return "";
    const cur = state.lg || "";
    return `<div class="seg lg-seg" role="tablist" aria-label="League">${[["", "All"], ...L.map((l) => [l.key, l.name])]
      .map(([k, l]) => `<button class="${cur === k ? "on" : ""}" data-lg="${esc(k)}" role="tab" aria-selected="${cur === k}">${esc(l)}</button>`).join("")}</div>`;
  }
  const tools = (...parts) => `<div class="head-tools">${parts.filter(Boolean).join("")}</div>`;
  function crestColor(hex) {
    // very dark team colours (Browns, Texans, Cowboys...) get lifted a little so the crest reads on the dark site
    const h = String(hex || "#6b4bb3").replace("#", "");
    if (lum("#" + h) > 0.14) return "#" + h;
    const n = parseInt(h.padEnd(6, "0").slice(0, 6), 16), mix = (v) => Math.round(v + (255 - v) * 0.22);
    return "#" + [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  const lum = (hex) => { const n = parseInt(String(hex || "#6b4bb3").replace("#", "").padEnd(6, "0").slice(0, 6), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  const ago = (ts) => {
    const s = Math.max(1, Math.round(Date.now() / 1000 - ts));
    if (s < 60) return "just now";
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
    const d = Math.round(h / 24); return `${d} day${d > 1 ? "s" : ""} ago`;
  };
  function abbr(name) {
    const w = String(name || "").replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
    if (!w.length) return "?";
    return (w.length > 1 ? w.map((x) => x[0]).join("") : w[0].slice(0, 3)).toUpperCase().slice(0, 4);
  }
  // team crest (shield) in the team colour, or the team logo/emoji when there is one
  function mark(name, size = "") {
    const t = teamBy(name);
    const c = crestColor((t && t.color) || "#6b4bb3");
    const img = t && (t.logo || t.emoji_url);
    const ab = (t && t.abbr) || abbr(name);
    return `<span class="crest ${size} ${lum(c) > 0.6 ? "lt" : ""} ${img ? "has-img" : ""}" style="--tc:${esc(c)}" aria-hidden="true">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<b>${esc(ab)}</b>`}</span>`;
  }
  function hs(key, name, size = "") {
    const p = D.players[key];
    const url = p && p.avatar;
    const t = p && teamBy(p.team);
    const ini = esc(String(name || (p && p.name) || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase());
    return `<span class="hs ${size}" style="--tc:${esc((t && t.color) || "#6b4bb3")}" aria-hidden="true">${url ? `<img src="${esc(url)}" alt="" loading="lazy">` : ini}</span>`;
  }
  const teamLink = (name) => { const h = teamHref(name); return h ? `<a href="${h}" data-link>${esc(name)}</a>` : esc(name || ""); };
  const form = (s) => `<span class="form">${[...(s || "")].map((c) => `<i class="${c}" title="${c === "W" ? "Win" : c === "L" ? "Loss" : "Tie"}">${c}</i>`).join("")}</span>`;
  const page = (html, cls = "") => `<div class="page ${cls}">${html}</div>`;
  function head(kick, title, extra = "") {
    const k = state.lg ? `${esc(lgObj(state.lg).name)} · ${kick}` : kick;
    return `<header class="pagehead"><div><p class="kicker">${k}</p><h1>${title}</h1></div>${extra}</header>`;
  }
  function empty(title, text, opts = {}) {
    return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>
      ${opts.join !== false ? `<a class="btn btn-sm discord-link" href="${esc(invite())}" target="_blank" rel="noopener">${DC}Join the Discord</a>` : ""}</div>`;
  }
  const sh = (title, link, sub) => `<div class="sh"><h2>${title}</h2>${sub ? `<span class="sub">${sub}</span>` : ""}${link ? `<a class="go" href="${link[0]}" data-link>${link[1]} ${ARW}</a>` : ""}</div>`;
  const hasGames = () => D.games.some((g) => String(g.season) === season());

  // ---------------------------------------------------------------- data
  const SRC = "/data/league.json";
  async function load(first) {
    try {
      const r = await fetch(`${SRC}?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      const changed = data.league.updated !== lastUpdated;
      lastUpdated = data.league.updated;
      D = normalize(data);
      if (first) { chrome(); render(false); requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("preload"))); }
      else if (changed) { chrome(); render(true); }
    } catch (e) {
      if (first) app.innerHTML = page(empty("Couldn't load the league", "Check your connection and refresh the page."));
    }
  }
  function normalize(d) {
    d.league = d.league || { name: "RUFL", season: 8, seasons: [8] };
    d.league.seasons = d.league.seasons && d.league.seasons.length ? d.league.seasons : [d.league.season];
    for (const k of ["tabs", "teams", "conferences", "schedule", "games", "awards"]) d[k] = d[k] || [];
    for (const k of ["leaders", "mvp", "players"]) d[k] = d[k] || {};
    d.records = d.records || { game: [], season: [] };
    d.records.game = d.records.game || []; d.records.season = d.records.season || [];
    d.teams.forEach((t) => { t.results = t.results || []; t.leaders = t.leaders || {}; t.roster = t.roster || []; t.members = t.members || []; });
    return d;
  }

  // header bits that depend on data
  function chrome() {
    $$(".js-season").forEach((e) => (e.textContent = D.league.season));
    $$(".discord-link").forEach((a) => (a.href = invite()));
    const up = $("#updated");
    if (up) up.textContent = D.league.updated && hasGames() ? `Stats updated ${ago(D.league.updated)}` : "";
    $$('[data-sec="rules"]').forEach((a) => (a.hidden = !(D.rulebook && D.rulebook.articles && D.rulebook.articles.length)));
    renderStrip();
    if (D.league.demo && !$(".demo-flag")) document.body.insertAdjacentHTML("beforeend", `<div class="demo-flag">Demo data · preview only</div>`);
  }
  function renderStrip() {
    const strip = $("#strip");
    const fin = D.games.filter((g) => scored(g) && inLg(g.home || g.away)).slice(0, 14);
    strip.hidden = !fin.length;
    strip.innerHTML = fin.length ? `<span class="strip-label">${state.lg ? esc(lgObj(state.lg).name) + " " : ""}Finals</span><div class="strip-track">${fin.map((g) => {
      const hw = g.hs > g.as, aw = g.as > g.hs;
      return `<a class="bug" href="${gameHref(g.id)}" data-link>
        <span class="bug-wk">${esc(String(g.week || "").replace("Week ", "WK "))}</span>
        <span class="bug-row ${aw ? "w" : ""}">${mark(g.away, "xs")}<b>${esc((teamBy(g.away) || {}).abbr || abbr(g.away))}</b><em>${g.as}</em></span>
        <span class="bug-row ${hw ? "w" : ""}">${mark(g.home, "xs")}<b>${esc((teamBy(g.home) || {}).abbr || abbr(g.home))}</b><em>${g.hs}</em></span>
      </a>`;
    }).join("")}</div>` : "";
  }

  // ---------------------------------------------------------------- shared blocks
  function scoreboard(g, big) {
    const ok = scored(g);
    const hw = ok && g.hs > g.as, aw = ok && g.as > g.hs;
    const side = (name, sc, win, lose, cls) => `<div class="sb-side ${cls} ${win ? "w" : ""} ${lose ? "l" : ""}" style="--tc:${esc((teamBy(name) || {}).color || "#6b4bb3")}">
        ${mark(name, big ? "xl" : "lg")}
        <div class="sb-name"><b>${name ? (big ? teamLink(name) : esc(name)) : "TBD"}</b><small>${esc(recOf(teamBy(name)))}</small></div>
        ${ok ? `<div class="sb-score">${sc}</div>` : ""}
      </div>`;
    return `<div class="scoreboard ${big ? "big" : ""}">
      ${side(g.away, g.as, aw, ok && !aw, "away")}
      <div class="sb-mid"><span class="sb-final">${ok ? "Final" : "Upcoming"}</span><small>${esc(g.week || "")}</small></div>
      ${side(g.home, g.hs, hw, ok && !hw, "home")}
    </div>`;
  }

  function standingsTable(teams, opts = {}) {
    if (!teams.length) return "";
    const ties = teams.some((t) => t.t);
    return `<div class="tablewrap"><table class="tbl standings">
      <thead><tr><th class="rk">#</th><th class="l">Team</th><th>W</th><th>L</th>${ties ? "<th>T</th>" : ""}${opts.conf ? "<th>Conf</th>" : ""}${opts.compact ? "" : "<th>PF</th><th>PA</th>"}<th>Diff</th>${opts.compact ? "" : "<th>Strk</th><th class=\"l\">Last 5</th>"}</tr></thead>
      <tbody>${teams.map((t, i) => `<tr class="link ${opts.cut && i === opts.cut - 1 ? "cut" : ""}" data-href="/team/${t.id}" style="--tc:${esc(t.color || "#6b4bb3")}">
        <td class="rk">${i + 1}</td>
        <td class="l"><a class="tm" href="/team/${t.id}" data-link>${mark(t.name, "sm")}<span>${esc(t.name)}</span></a></td>
        <td class="key">${t.w}</td><td>${t.l}</td>${ties ? `<td>${t.t}</td>` : ""}${opts.conf ? `<td class="dim">${confRec(t)}</td>` : ""}
        ${opts.compact ? "" : `<td>${t.pf}</td><td>${t.pa}</td>`}
        <td class="${diffCls(t.diff)}">${diffTxt(t.diff)}</td>
        ${opts.compact ? "" : `<td class="dim">${esc(t.streak || "–")}</td><td class="l">${form(t.last5)}</td>`}
      </tr>`).join("")}</tbody></table></div>`;
  }

  function leaderCard(t, rows) {
    const top = rows[0];
    if (!top) return "";
    const tm = teamBy(top.team);
    return `<a class="lcard reveal" href="${sec(`/stats/${t.key.toLowerCase()}`)}" data-link style="--tc:${esc((tm && tm.color) || "#8b3dff")}">
      <div class="lc-top"><span class="lc-cat">${esc(t.label)}</span><span class="lc-pos">${esc(t.pos)}</span></div>
      <div class="lc-who">${hs(top.key, top.player, "lg")}<div><b>${esc(top.player)}</b><small>${top.team ? esc(top.team) : "Free agent"}</small></div></div>
      <div class="lc-stat"><span class="lc-v">${esc(top.cols[0])}</span><span class="lc-u">${esc(t.cols[0])}</span><span class="lc-pts">${fmt(top.pts)} <small>PTS</small></span></div>
      <ol class="lc-rest">${rows.slice(1, 4).map((r, i) => `<li><span>${i + 2}</span><b>${esc(r.player)}</b><small>${esc(r.cols[0])} ${esc(t.cols[0])}</small><em>${fmt(r.pts)}</em></li>`).join("")}</ol>
    </a>`;
  }

  function mvpRows(rows, limit) {
    const max = Math.max(1, ...rows.map((r) => r.pts));
    return rows.slice(0, limit).map((r, i) => {
      const t = teamBy(r.team);
      const parts = Object.entries(r.tabs || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      return `<a class="mvp-row reveal" href="${playerHref(r.key)}" data-link style="--tc:${esc((t && t.color) || "#8b3dff")}">
        <span class="mvp-rk ${i < 3 ? "top" : ""}">${i + 1}</span>
        ${hs(r.key, r.player, "md")}
        <span class="mvp-who"><b>${esc(r.player)}</b><small>${r.team ? esc(r.team) : "Free agent"} · ${r.gp} GP</small>
          <span class="mvp-bar">${parts.map(([k, v]) => `<i style="width:${(v / max) * 100}%" class="c-${k}" title="${esc((tab(k) || {}).label || k)} ${fmt(v)}"></i>`).join("")}</span></span>
        <span class="mvp-pts">${fmt(r.pts)}<small>PTS</small></span>
      </a>`;
    }).join("");
  }
  const legend = () => `<div class="legend">${D.tabs.map((t) => `<span><i class="c-${t.key}"></i>${esc(t.label)}</span>`).join("")}</div>`;

  // ---------------------------------------------------------------- HOME
  const infoBlocks = (L, LG) => `
    <section class="blk info" id="about">
      <div class="info-text">
        ${sh("About RUFL")}
        <p>RUFL is a fan-run football league played on Ultimate Football on Roblox. Teams have owners and coaching staffs, sign players, and play a scheduled season that ends with the Ultimate Bowl.</p>
        <p>Season ${esc(L.season)} runs ${LG.length > 1 ? `two separate leagues: ${LG.map((l) => `<b>${esc(l.full)}</b>`).join(" and ")}` : "one league"}${D.teams.length ? `, ${D.teams.length} teams in total` : ""}. Everything is organised in the RUFL Discord.</p>
      </div>
      <ol class="steps" id="join">
        <li><b>Join the Discord</b><span>Signings, schedules, results and announcements are all posted there.</span></li>
        <li><b>Get verified</b><span>Link your Roblox account and pick your roles.</span></li>
        <li><b>Get signed</b><span>Post in free agency. Teams sign players all season.</span></li>
        <li class="cta"><a class="btn discord-link" href="${esc(invite())}" target="_blank" rel="noopener">${DC}Join the Discord</a></li>
      </ol>
    </section>
    <section class="blk" id="bowl">${sh("Ultimate Bowl", null, "$200 prize this season")}
      <div class="bowl-grid">
        <figure class="bowl-card"><img src="/img/bowl5.jpg" alt="Ultimate Bowl V poster" loading="lazy" width="960" height="540"><figcaption>Ultimate Bowl V</figcaption></figure>
        <figure class="bowl-card"><img src="/img/bowl4.jpg" alt="Ultimate Bowl IV poster" loading="lazy" width="960" height="540"><figcaption>Ultimate Bowl IV · Tampa Bay Buccaneers Stadium</figcaption></figure>
      </div>
    </section>
    <section class="blk" id="faq">${sh("FAQ")}
      <div class="qa">
        <details><summary>What game does RUFL play?</summary><p>Ultimate Football on Roblox. All league games are played there.</p></details>
        <details><summary>What's the difference between NFL and CFB?</summary><p>They're two separate RUFL leagues with their own teams, conferences, standings and stats. NFL crowns an MVP; CFB has a Heisman race. Use the NFL / CFB switch at the top to move between them.</p></details>
        <details><summary>Do I need a team to join?</summary><p>No. Join the Discord as a free agent. Teams sign players from the free-agency channel all season.</p></details>
        <details><summary>What is the Ultimate Bowl?</summary><p>The championship game at the end of every RUFL season. This season the winning team plays for $200.</p></details>
        <details><summary>Where do the stats on this site come from?</summary><p>From the stat sheets of official RUFL games. Scores, standings, leaders and player pages update after each game is posted.</p></details>
      </div>
    </section>`;
  const ctaBand = (L) => `<section class="cta-band"><div class="wrap"><div><h2>Play in RUFL</h2><p><b data-live="members">3,800+</b> members. Teams are signing players for Season ${esc(L.season)}.</p></div>
        <a class="btn discord-link" href="${esc(invite())}" target="_blank" rel="noopener">${DC}Join the Discord</a></div></section>`;

  // "/" : pick a league
  function chooserPage() {
    const L = D.league, LG = leagues();
    const hero = `<section class="hero">
      <div class="hero-media" aria-hidden="true"></div>
      <div class="wrap hero-inner">
        <p class="hero-tag"><img src="/img/logo.png" alt="" width="34" height="33">Season ${esc(L.season)} · Series 1</p>
        <h1>Ultimate Football League</h1>
        <p class="hero-sub">${LG.length > 1 ? `Two leagues, ${LG.map((l) => esc(l.name)).join(" and ")},` : "A competitive league"} on Roblox's Ultimate Football, with full schedules, tracked stats and a $200 Ultimate Bowl.</p>
        <div class="hero-cta">
          ${LG.map((l, i) => `<a class="btn ${i ? "btn-line" : ""}" href="/${l.key.toLowerCase()}" data-link>${esc(l.name)} league ${ARW}</a>`).join("")}
          <a class="btn btn-line discord-link" href="${esc(invite())}" target="_blank" rel="noopener">${DC}Discord</a>
        </div>
      </div>
      <div class="hero-facts"><div class="wrap">
        <div><b data-live="members">3,800+</b><span>Members</span></div>
        <div><b data-live="online">–</b><span>Online now</span></div>
        <div><b>${D.teams.length || "–"}</b><span>Teams</span></div>
        <div><b>$200</b><span>Ultimate Bowl</span></div>
      </div></div>
    </section>`;
    const cards = LG.map((l) => {
      const ts = D.teams.filter((t) => leagueOf(t.name) === l.key);
      const cf = D.conferences.filter((c) => c.league === l.key).map((c) => c.name);
      const g = D.games.filter((x) => String(x.season) === season() && scored(x) && leagueOf(x.home || x.away) === l.key).length;
      return `<a class="lg-card lg-${esc(l.key)}" href="/${l.key.toLowerCase()}" data-link>
        <div class="lgc-top"><b>${esc(l.name)}</b><span>${esc(l.full)}</span></div>
        <div class="lgc-logos">${ts.map((t) => mark(t.name, "sm")).join("")}</div>
        <dl class="lgc-meta"><div><dt>Teams</dt><dd>${ts.length}</dd></div><div><dt>Conferences</dt><dd>${cf.map(esc).join(" · ") || "–"}</dd></div><div><dt>Award race</dt><dd>${race(l.key).label}</dd></div><div><dt>Games played</dt><dd>${g}</dd></div></dl>
        <span class="lgc-go">Go to ${esc(l.name)} ${ARW}</span></a>`;
    }).join("");
    return `<div class="home">${hero}<div class="wrap home-body">
      <section class="blk" id="leagues">${sh("Choose a league")}<div class="lg-cards">${cards}</div></section>
      ${infoBlocks(L, LG)}</div>${ctaBand(L)}</div>`;
  }

  // "/nfl", "/cfb" : that league's home
  function sectionHome() {
    const L = D.league, s = season(), k = state.lg, lo = lgObj(k), r = race(k);
    const games = D.games.filter((g) => String(g.season) === s && inLg(g.home || g.away));
    const latest = games.find(scored);
    const board = D.leaders[s] || {};
    const mv = (D.mvp[s] || []).filter((e) => inLg(e.team));
    const power = D.teams.filter((t) => t.prank && inLg(t.name)).sort((a, b) => a.prank - b.prank).slice(0, 5);
    const wk = pickWeek();
    const wkGames = wk ? wk.matchups.filter((m) => inLg(m.home || m.away)) : [];
    const teams = D.teams.filter((t) => inLg(t.name));
    const confs = D.conferences.filter((c) => c.league === k);
    const top = `<section class="sec-hero lg-${esc(k)}"><div class="wrap sec-inner">
        <div class="sec-id"><p class="kicker">RUFL · Season ${esc(s)}</p><h1>${esc(lo.name)}</h1><p class="sec-sub">${esc(lo.full)} · ${teams.length} teams${confs.length ? " · " + confs.map((c) => esc(c.name)).join(" · ") : ""}</p></div>
        <div class="sec-logos">${teams.map((t) => `<a href="/team/${t.id}" data-link title="${esc(t.name)}">${mark(t.name, "sm")}</a>`).join("")}</div>
      </div></section>`;
    const rankRow = (href, rk, pic, name, sub, val, unit) => `<a class="rank-row" href="${href}" data-link><span class="rk">${rk}</span>${pic}<span class="who"><b>${name}</b><small>${sub}</small></span><span class="val">${val}${unit ? `<small>${unit}</small>` : ""}</span></a>`;
    let main = "";
    if (latest) {
      const list = wkGames.length ? wkGames : games.slice(0, 8);
      main += `<section class="blk">${sh(esc(wkGames.length ? wk.week : "Latest scores"), [sec("/scores"), "All scores"])}<div class="mg-grid">${list.map(miniGame).join("")}</div></section>`;
      if (Object.keys(board).length) main += `<section class="blk">${sh("Stat leaders", [sec("/stats"), "All stats"])}<div class="lgrid">${D.tabs.map((t) => leaderCard(t, (board[t.key] || []).filter((x) => inLg(x.team)))).join("")}</div></section>`;
      const groups = byLeague(confList());
      if (groups.length) main += `<section class="blk">${sh("Standings", [sec("/standings"), "Full standings"])}${groups.map((g) => `<div class="st-grid">${g.confs.map((c) => `<div class="card st-card"><div class="st-head"><h3>${esc(c.name)}</h3></div>${standingsTable(c.teams, { compact: true, conf: true })}</div>`).join("")}</div>`).join("")}</section>`;
      if (mv.length || power.length) main += `<section class="blk two">
        ${mv.length ? `<div>${sh(`${r.label} race`, [sec("/" + r.slug), "Full race"])}<div class="card list">${mv.slice(0, 5).map((e, i) => rankRow(playerHref(e.key), i + 1, hs(e.key, e.player, "sm"), `<span class="pn">${esc(e.player)}</span>`, esc(e.team || "Free agent"), fmt(e.pts), "PTS")).join("")}</div></div>` : ""}
        ${power.length ? `<div>${sh("Power rankings", [sec("/standings?view=power"), "All"])}<div class="card list">${power.map((t, i) => rankRow(`/team/${t.id}`, i + 1, mark(t.name, "sm"), esc(t.name), `${recOf(t)} · ${diffTxt(t.diff)}`, move(t.move), "")).join("")}</div></div>` : ""}
      </section>`;
    } else {
      main += `<section class="blk">${sh(`${esc(lo.name)} teams`, [sec("/teams"), "All teams"])}
        <p class="blk-note">${esc(lo.name)} scores, standings, stats and the ${esc(r.label)} race appear here once Season ${esc(s)} games are posted.</p>
        ${teamDirectory()}</section>`;
    }
    return `<div class="home sec-home">${top}<div class="wrap home-body">${main}</div></div>`;
  }

  // every team, grouped by league and conference (pre-season home)
  function teamDirectory() {
    const groups = byLeague(confList());
    if (!groups.length) return D.teams.length ? `<div class="dir-grid">${D.teams.map(dirTeam).join("")}</div>` : empty("Teams coming soon", "Team pages appear here once the season's teams are set.");
    return `<div class="dir">${groups.map((g) => `<div class="dir-lg">${lgBanner(g.lg)}<div class="dir-confs">${g.confs.map((c) => `<div class="card dir-conf"><h3>${esc(c.name)}</h3>${c.teams.map(dirTeam).join("")}</div>`).join("")}</div></div>`).join("")}</div>`;
  }
  const dirTeam = (t) => `<a class="dir-team" href="/team/${t.id}" data-link>${mark(t.name, "sm")}<span>${esc(t.name)}</span></a>`;

  const move = (m) => (m > 0 ? `<span class="mv up" title="Up ${m}">▲ ${m}</span>` : m < 0 ? `<span class="mv down" title="Down ${-m}">▼ ${-m}</span>` : `<span class="mv">–</span>`);

  function miniGame(m) {
    const ok = m.hs != null && m.as != null;
    const hw = ok && m.hs > m.as, aw = ok && m.as > m.hs;
    const row = (name, sc, w, l) => `<span class="mg-row ${w ? "w" : ""} ${l ? "l" : ""}">${mark(name, "xs")}<b>${esc((teamBy(name) || {}).abbr || name || "TBD")}</b><em>${ok ? sc : ""}</em></span>`;
    const inner = `<span class="mg-st">${ok ? "Final" : esc(m.week || "Upcoming")}</span>${row(m.away, m.as, aw, ok && !aw)}${row(m.home, m.hs, hw, ok && !hw)}`;
    const id = m.game_id ?? m.id;
    return ok && id != null ? `<a class="mg" href="${gameHref(id)}" data-link>${inner}</a>` : `<div class="mg">${inner}</div>`;
  }

  // ---------------------------------------------------------------- SCORES
  function pickWeek() {
    const weeks = D.schedule || [];
    if (!weeks.length) return null;
    const played = (w) => w.matchups.some((m) => m.hs != null && m.as != null);
    return weeks.find((w) => w.week === state.week) || [...weeks].reverse().find(played) || weeks[0];
  }
  function scoresPage() {
    const s = season();
    const weeks = D.schedule || [];
    const games = D.games.filter((g) => String(g.season) === s && inLg(g.home || g.away));
    let body = "", picker = "";
    if (weeks.length) {
      const w = pickWeek();
      picker = `<div class="weeks" role="tablist">${weeks.map((x) => {
        const done = x.matchups.length && x.matchups.every((m) => m.hs != null);
        return `<button class="wk ${x.week === w.week ? "on" : ""}" data-week="${esc(x.week)}" role="tab" aria-selected="${x.week === w.week}"><span>${esc(String(x.week).replace("Week ", "WK "))}</span><small>${done ? "Final" : x.matchups.some((m) => m.hs != null) ? "Live" : "Next"}</small></button>`;
      }).join("")}</div>`;
      const ms = w.matchups.filter((m) => inLg(m.home || m.away));
      body = ms.length ? `<div class="score-grid">${ms.map((m) => {
        const g = m.game_id != null ? D.games.find((x) => x.id === m.game_id) : null;
        return scoreCard(g || { home: m.home, away: m.away, hs: m.hs, as: m.as, week: w.week, id: m.game_id });
      }).join("")}</div>` : empty(`No ${state.lg || ""} games this week`, "Pick another week or league.", { join: false });
    } else if (games.length) {
      const byWeek = {};
      games.forEach((g) => (byWeek[g.week || "Other"] = byWeek[g.week || "Other"] || []).push(g));
      body = Object.entries(byWeek).sort((a, b) => weekNum(b[0]) - weekNum(a[0])).map(([wk, list]) =>
        `<section class="blk-sm">${sh(esc(wk))}<div class="score-grid">${list.map(scoreCard).join("")}</div></section>`).join("");
    } else {
      body = empty("No games yet", `Season ${s} scores show up here as soon as the first game is posted.`);
    }
    return page(`${head(`Season ${esc(s)}`, "Scores", tools(lgSeg()))}${picker}${body}`);
  }
  function scoreCard(g) {
    const ok = scored(g);
    const potg = g.potg;
    const inner = `${scoreboard(g, false)}
      ${ok && potg ? `<div class="sc-foot">${hs(potg.key, potg.player, "sm")}<span><small>POTG</small> <b>${esc(potg.player)}</b> · ${esc(potg.phrase || fmt(potg.pts) + " PTS")}</span></div>` : ""}
      ${ok && g.id != null ? `<span class="sc-link">Box score ${ARW}</span>` : ""}`;
    return ok && g.id != null ? `<a class="card score-card reveal" href="${gameHref(g.id)}" data-link>${inner}</a>` : `<div class="card score-card upcoming reveal">${inner}</div>`;
  }

  // ---------------------------------------------------------------- GAME
  function gamePage(id) {
    const g = D.games.find((x) => String(x.id) === String(id));
    if (!g) return notFound();
    const byTab = D.tabs.map((t) => ({ t, lines: (g.lines || []).filter((l) => l.cat === t.key) })).filter((x) => x.lines.length);
    const teams = [g.away, g.home].filter(Boolean);
    const p = g.potg;
    return page(`
      <a class="crumb" href="${sec("/scores")}" data-link>${BACK} Scores</a>
      <section class="game-hero reveal" style="--ac:${esc((teamBy(g.away) || {}).color || "#8b3dff")};--hc:${esc((teamBy(g.home) || {}).color || "#ff7a18")}">
        ${scoreboard(g, true)}
        ${g.recap || p ? `<div class="game-foot">${g.recap ? `<p>${esc(g.recap)}</p>` : "<p></p>"}
          ${p ? `<a class="potg" href="${playerHref(p.key)}" data-link>${hs(p.key, p.player, "md")}<span><small>Player of the game</small><b>${esc(p.player)}</b><em>${esc(p.phrase || "")}</em></span><span class="potg-pts">${fmt(p.pts)}<small>PTS</small></span></a>` : ""}</div>` : ""}
      </section>
      ${byTab.length ? byTab.map(({ t, lines }) => `<section class="blk-sm">${sh(esc(t.label), null, esc(t.pos))}
        ${teams.length > 1 ? "" : ""}
        <div class="card"><div class="tablewrap"><table class="tbl">
          <thead><tr><th class="l">Player</th><th>PTS</th>${t.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
          <tbody>${lines.sort((a, b) => b.pts - a.pts).map((l) => `<tr class="link" data-href="${playerHref(l.key)}">
            <td class="l"><span class="pl">${hs(l.key, l.player, "sm")}<span><a href="${playerHref(l.key)}" data-link class="nm">${esc(l.player)}</a><small>${esc(l.team || "–")}</small></span></span></td>
            <td class="key">${fmt(l.pts)}</td>${l.cols.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table></div></div></section>`).join("") : empty("No player stats", "This game has a score but no stat lines yet.", { join: false })}`);
  }

  // ---------------------------------------------------------------- STANDINGS
  function leagueOrder() {
    return [...D.teams].sort((a, b) => {
      const pa = a.gp ? (a.w + a.t / 2) / a.gp : 0, pb = b.gp ? (b.w + b.t / 2) / b.gp : 0;
      return pb - pa || b.w - a.w || b.diff - a.diff || a.name.localeCompare(b.name);
    });
  }
  function standingsPage() {
    const qv = new URLSearchParams(location.search).get("view");
    const confs = confList();
    const views = [["conf", "Conferences"], ["league", "Table"], ["power", "Power rankings"]].filter(([k]) => k !== "conf" || confs.length);
    let view = state.view || qv || views[0][0];
    if (!views.some(([k]) => k === view)) view = views[0][0];
    state.view = view;
    const top = (extra) => head(`Season ${esc(season())}`, "Standings", extra);
    if (!D.teams.length) return page(`${top("")}${empty("No standings yet", "Standings fill in once teams play their first games.")}`);
    const seg = `<div class="seg" role="tablist">${views.map(([k, l]) => `<button class="${k === view ? "on" : ""}" data-view="${k}" role="tab" aria-selected="${k === view}">${l}</button>`).join("")}</div>`;
    const lgTeams = (key) => leagueOrder().filter((t) => (key ? leagueOf(t.name) === key : !leagueOf(t.name)));
    let body = "";
    if (view === "conf") {
      body = byLeague(confs).map((g) => `<section class="lg-block">${lgBanner(g.lg)}<div class="st-grid ${g.confs.length === 1 ? "one" : ""}">${g.confs.map((c) => `<section class="card st-card reveal"><div class="st-head"><h3>${esc(c.name)}</h3><span>${esc(c.full !== c.name ? c.full : `${c.teams.length} teams`)}</span></div>${standingsTable(c.teams, { conf: true })}</section>`).join("")}</div></section>`).join("");
    } else if (view === "league") {
      const L = leagues().filter((l) => !state.lg || l.key === state.lg);
      body = (L.length ? L : [null]).map((l) => {
        const list = l ? lgTeams(l.key) : leagueOrder();
        return list.length ? `<section class="lg-block">${lgBanner(l)}<section class="card st-card reveal">${standingsTable(list, { conf: confs.length > 0 })}</section></section>` : "";
      }).join("");
    } else {
      const list = D.teams.filter((t) => t.prank && inLg(t.name)).sort((a, b) => a.prank - b.prank);
      const max = Math.max(1, ...list.map((t) => t.power || 0));
      body = list.length ? `<div class="power">${list.map((t, i) => `<a class="pw-row card reveal" href="/team/${t.id}" data-link style="--tc:${esc(crestColor(t.color))}">
          <span class="pw-rk">${state.lg ? i + 1 : t.prank}</span>${move(t.move)}${mark(t.name, "md")}
          <span class="pw-nm"><b>${esc(t.name)}</b><small>${recOf(t)} · ${diffTxt(t.diff)} PD · ${esc(t.streak || "")}</small></span>
          <span class="pw-bar"><i style="width:${((t.power || 0) / max) * 100}%"></i></span><span class="pw-v">${fmt(t.power)}</span></a>`).join("")}</div>
          <p class="note">Power score mixes record, point differential and recent form.</p>` : empty("No power rankings yet", "Power rankings start after the first week of games.", { join: false });
    }
    return page(`${top(tools(lgSeg(), seg))}${body}`);
  }

  // ---------------------------------------------------------------- STATS
  function statsPage(key) {
    const t = tab(String(key || "").toUpperCase()) || D.tabs[0];
    if (!t) return page(`${head("Stat leaders")}${empty("No stats yet", "Stat leaders show up once games are posted.")}`);
    const ask = new URLSearchParams(location.search).get("season");
    const opts = [...D.league.seasons.map(String).reverse(), ...(D.leaders.all ? ["all"] : [])];
    const s = opts.includes(ask) ? ask : season();
    const rows = ((D.leaders[s] || {})[t.key] || []).filter((r) => inLg(r.team)).map((r, i) => ({ ...r, rank: i + 1 }));
    const q = s !== season() ? `?season=${s}` : "";
    const tabsNav = `<nav class="pills" aria-label="Stat categories">${D.tabs.map((x) => `<a class="${x.key === t.key ? "on" : ""}" href="${sec(`/stats/${x.key.toLowerCase()}`)}${q}" data-link><b>${esc(x.pos)}</b><span>${esc(x.label)}</span></a>`).join("")}</nav>`;
    const seasonSel = opts.length > 1 ? `<label class="sel"><span>Season</span><select id="seasonSel">${opts.map((o) => `<option value="${o}" ${o === s ? "selected" : ""}>${o === "all" ? "All time" : "Season " + o}</option>`).join("")}</select></label>` : "";
    const top3 = rows.slice(0, 3);
    setTimeout(() => {
      const draw = () => drawStatTable(t, rows, ($("#statSearch")?.value || "").toLowerCase());
      $("#statSearch")?.addEventListener("input", draw);
      $("#seasonSel")?.addEventListener("change", (e) => go(`${sec(`/stats/${t.key.toLowerCase()}`)}${e.target.value === season() ? "" : "?season=" + e.target.value}`));
      draw();
    });
    return page(`${head(s === "all" ? "All time" : `Season ${esc(s)}`, `${esc(t.label)} <span>leaders</span>`, tools(lgSeg(), seasonSel))}
      ${tabsNav}
      ${rows.length ? `<div class="top3">${top3.map((r, i) => {
        const tm = teamBy(r.team);
        return `<a class="t3 reveal ${i === 0 ? "first" : ""}" href="${playerHref(r.key)}" data-link style="--tc:${esc((tm && tm.color) || "#8b3dff")}">
          <span class="t3-rk">${i + 1}</span>${hs(r.key, r.player, "lg")}
          <span class="t3-who"><b>${esc(r.player)}</b><small>${r.team ? esc(r.team) : "Free agent"}</small></span>
          <span class="t3-stats">${t.cols.slice(0, 3).map((c, j) => `<span><b>${esc(r.cols[j])}</b><small>${esc(c)}</small></span>`).join("")}<span class="pts"><b>${fmt(r.pts)}</b><small>PTS</small></span></span></a>`;
      }).join("")}</div>
      <div class="card table-card"><div class="table-tools"><div class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="statSearch" type="search" placeholder="Find a player or team"></div><span class="muted">${rows.length} players · tap a column to sort</span></div>
        <div class="tablewrap" id="statTable"></div></div>
      <p class="note">${esc(t.guide || "")} <a href="/points" data-link>How PTS work ${ARW}</a></p>`
      : empty("No stats yet", `${t.label} leaders show up once Season ${s} games are posted.`)}`);
  }
  const numVal = (v) => { const n = parseFloat(String(v ?? "").replace("%", "")); return isNaN(n) ? -Infinity : n; };
  function drawStatTable(t, rows, q) {
    const el = $("#statTable");
    if (!el) return;
    const st = state.sort[t.key] || { col: "pts", dir: -1 };
    const val = (r) => (st.col === "pts" ? r.pts : st.col === "gp" ? r.gp : st.col === "player" ? r.player.toLowerCase() : numVal(r.cols[st.col]));
    const list = rows.filter((r) => !q || r.player.toLowerCase().includes(q) || String(r.team || "").toLowerCase().includes(q))
      .sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * st.dir * (st.col === "player" ? -1 : 1) || a.rank - b.rank; });
    const on = (c) => st.col === c;
    const th = (col, label, cls = "") => `<th class="sortable ${cls} ${on(col) ? "sorted" : ""} ${on(col) && st.dir === 1 ? "asc" : ""}" data-col="${col}" tabindex="0">${label}<span class="ar">▾</span></th>`;
    const td = (col, v, cls = "") => `<td class="${cls} ${on(col) ? "sorted-col" : ""}">${v}</td>`;
    el.innerHTML = list.length ? `<table class="tbl stat">
      <thead><tr><th class="rk">#</th>${th("player", "Player", "l")}${th("gp", "GP")}${th("pts", "PTS")}${t.cols.map((c, i) => th(i, esc(c))).join("")}</tr></thead>
      <tbody>${list.map((r) => `<tr class="link" data-href="${playerHref(r.key)}">
        <td class="rk">${r.rank}</td>
        <td class="l"><span class="pl">${hs(r.key, r.player, "sm")}<span><a class="nm" href="${playerHref(r.key)}" data-link>${esc(r.player)}</a><small>${r.team ? esc(r.team) : "Free agent"}</small></span></span></td>
        ${td("gp", r.gp, "dim")}${td("pts", fmt(r.pts), "key")}${r.cols.map((v, i) => td(i, esc(v))).join("")}</tr>`).join("")}</tbody></table>`
      : `<div class="empty-mini">No players match “${esc(q)}”.</div>`;
    $$("th.sortable", el).forEach((h) => {
      const act = () => {
        const col = isNaN(+h.dataset.col) ? h.dataset.col : +h.dataset.col;
        const cur = state.sort[t.key] || { col: "pts", dir: -1 };
        state.sort[t.key] = { col, dir: cur.col === col ? -cur.dir : -1 };
        drawStatTable(t, rows, q);
      };
      h.addEventListener("click", act);
      h.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
    });
  }

  // ---------------------------------------------------------------- TEAMS
  function teamsPage() {
    const confs = confList();
    const card = (t) => `<a class="tcard reveal" href="/team/${t.id}" data-link style="--tc:${esc(crestColor(t.color || "#6b4bb3"))}">
        <span class="tc-glow" aria-hidden="true"></span>${mark(t.name, "lg")}
        <span class="tc-nm"><b>${esc(t.name)}</b><small>${t.gp ? `<em>${recOf(t)}</em>${t.conf ? ` · ${confRec(t)} conf` : ""} · <span class="${diffCls(t.diff)}">${diffTxt(t.diff)}</span>` : `${esc(t.conf || "")}${t.conf ? " · " : ""}No games yet`}</small>${t.gp ? form(t.last5) : ""}</span></a>`;
    const groups = byLeague(confs);
    const placed = new Set(confs.flatMap((c) => c.teams.map((t) => t.id)));
    const others = D.teams.filter((t) => !placed.has(t.id) && inLg(t.name));
    const html = groups.map((g) => `<section class="lg-block">${lgBanner(g.lg)}${g.confs.map((c) => `<section class="blk-sm">${sh(esc(c.name), null, `${esc(c.full !== c.name ? c.full + " · " : "")}${c.teams.length} teams`)}<div class="tgrid">${c.teams.map(card).join("")}</div></section>`).join("")}</section>`).join("")
      + (others.length ? `<section class="blk-sm">${sh(groups.length ? "Other teams" : "All teams", null, `${others.length} teams`)}<div class="tgrid">${others.map(card).join("")}</div></section>` : "");
    return page(`${head(`Season ${esc(season())}`, "Teams", tools(lgSeg()))}
      ${html || empty("Teams coming soon", "Every RUFL team gets its own page here, with its roster, schedule and leaders.")}`);
  }

  function teamPage(id) {
    const t = teamById(id);
    if (!t) return notFound();
    const conf = D.conferences.find((c) => c.name === t.conf);
    const crank = conf ? conf.teams.indexOf(t.id) + 1 : 0;
    const sched = [...t.results].reverse();
    const ranks = Object.entries(t.ranks || {});
    const lt = lum(t.color) > 0.6;
    return page(`
      <a class="crumb" href="${sec("/teams")}" data-link>${BACK} Teams</a>
      <section class="ent-hero reveal ${lt ? "lt" : ""}" style="--tc:${esc(t.color || "#6b4bb3")}">
        <span class="ent-ghost" aria-hidden="true">${esc(t.abbr || abbr(t.name))}</span>
        ${mark(t.name, "xxl")}
        <div class="ent-id"><p class="ent-k">${esc([leagueOf(t.name), t.conf].filter(Boolean).join(" · ") || D.league.name)}${crank && t.gp ? ` · ${ord(crank)} in conference` : ""}</p><h1>${esc(t.name)}</h1>
          ${t.coach ? `<p class="ent-sub">Head coach <b>${esc(t.coach.name)}</b></p>` : ""}</div>
        <div class="ent-big"><b>${recOf(t) || "0-0"}</b><small>Record</small></div>
      </section>
      <div class="statbar reveal">
        ${t.conf ? `<div><b>${confRec(t)}</b><span>Conference</span></div>` : ""}
        <div><b>${t.pf}</b><span>Points for</span></div><div><b>${t.pa}</b><span>Points against</span></div>
        <div><b class="${diffCls(t.diff)}">${diffTxt(t.diff)}</b><span>Differential</span></div>
        <div><b>${esc(t.streak || "–")}</b><span>Streak</span></div>
        ${t.prank ? `<div><b>${ord(t.prank)}</b><span>Power rank</span></div>` : ""}
      </div>
      <div class="cols">
        <section>${sh("Schedule &amp; results")}
          <div class="card list">${sched.length ? sched.map((r) => `<a class="sched" href="${gameHref(r.game_id)}" data-link>
            <span class="wk">${esc(r.week || "")}</span><span class="opp"><small>vs</small>${mark(r.opp, "sm")}<b>${esc(r.opp)}</b></span>
            <span class="res"><i class="${r.res}">${r.res}</i>${r.pf}–${r.pa}</span></a>`).join("") : `<div class="empty-mini">No games yet.</div>`}</div></section>
        <aside>${sh("Team leaders")}
          <div class="card list">${D.tabs.filter((x) => t.leaders[x.key]).map((x) => { const l = t.leaders[x.key]; return `<a class="rail-row" href="${playerHref(l.key)}" data-link><span class="pos">${esc(x.pos)}</span>${hs(l.key, l.player, "sm")}<span class="who"><b>${esc(l.player)}</b><small>${esc(l.phrase || "")}</small></span><span class="v">${fmt(l.pts)}<small>PTS</small></span></a>`; }).join("") || `<div class="empty-mini">No leaders yet.</div>`}</div>
        </aside>
      </div>
      ${ranks.length ? `<section class="blk-sm">${sh("Per game", null, "League rank")}<div class="statbar ranks">${ranks.map(([k, [v, r]]) => `<div><b>${fmt(v)}</b><span>${esc(k)}</span><em class="${r <= 3 ? "hot" : ""}">${ord(r)}</em></div>`).join("")}</div></section>` : ""}
      ${t.members.length ? `<section class="blk-sm">${sh("Roster", null, `${t.members.length} players`)}<div class="roster">${t.members.map((m) => {
        const p = D.players[m.key];
        const pic = m.avatar ? `<span class="hs md"><img src="${esc(m.avatar)}" alt="" loading="lazy"></span>` : hs(m.key, m.name, "md");
        const inner = `${pic}<span class="who"><b>${esc(m.name)}</b><small>${m.tag ? `<span class="tag">${esc(m.tag)}</span>` : p ? `${fmt(p.pts)} PTS · ${p.gp} GP` : "No stats yet"}</small></span>`;
        return p ? `<a class="card roster-card" href="${playerHref(m.key)}" data-link>${inner}</a>` : `<div class="card roster-card">${inner}</div>`;
      }).join("")}</div></section>` : ""}
      ${t.roster.length ? `<section class="blk-sm">${sh("Player stats", null, "By total PTS")}<div class="card"><div class="tablewrap"><table class="tbl">
        <thead><tr><th class="rk">#</th><th class="l">Player</th><th>GP</th><th>PTS</th></tr></thead>
        <tbody>${t.roster.map((p, i) => `<tr class="link" data-href="${playerHref(p.key)}"><td class="rk">${i + 1}</td>
          <td class="l"><span class="pl">${hs(p.key, p.player, "sm")}<a class="nm" href="${playerHref(p.key)}" data-link>${esc(p.player)}</a></span></td><td class="dim">${p.gp}</td><td class="key">${fmt(p.pts)}</td></tr>`).join("")}</tbody></table></div></div></section>` : ""}`);
  }

  // ---------------------------------------------------------------- PLAYER
  function playerPage(key) {
    key = decodeURIComponent(key);
    const p = D.players[key];
    if (!p) return notFound();
    const t = teamBy(p.team);
    const s = season();
    const cur = (p.totals || {})[s] || {}, all = (p.totals || {}).all || {};
    const tabsHere = D.tabs.filter((x) => cur[x.key] || all[x.key]);
    const curPts = Math.round(Object.values(cur).reduce((a, x) => a + x.pts, 0) * 10) / 10;
    const c = (t && t.color) || "#6b4bb3";
    return page(`
      <a class="crumb" href="${sec("/stats")}" data-link>${BACK} Stat leaders</a>
      <section class="ent-hero player reveal ${lum(c) > 0.6 ? "lt" : ""}" style="--tc:${esc(c)}">
        <span class="ent-ghost" aria-hidden="true">${esc(tabsHere.map((x) => x.pos).join(" ") || "RUFL")}</span>
        ${hs(key, p.name, "xxl")}
        <div class="ent-id"><p class="ent-k">${p.team ? `${mark(p.team, "xs")} ${teamLink(p.team)}` : "Free agent"}${p.role ? ` · <span class="role">${esc(p.role)}</span>` : ""}${tabsHere.length ? " · " + tabsHere.map((x) => x.pos).join(" / ") : ""}</p><h1 class="nocase">${esc(p.name)}</h1></div>
        <div class="ent-big"><b>${fmt(curPts)}</b><small>Season ${esc(s)} PTS</small></div>
      </section>
      <div class="statbar reveal">
        <div><b>${p.gp}</b><span>Games</span></div>
        ${p.mvp_rank ? `<div><b>${ord(p.mvp_rank)}</b><span>${race(leagueOf(p.team) || state.lg).label} race</span></div>` : ""}
        ${Object.entries(p.ranks || {}).map(([k, [r, n]]) => `<div><b>${ord(r)}</b><span>${esc((tab(k) || {}).label || k)}</span><em>of ${n}</em></div>`).join("")}
        <div><b>${fmt(p.pts)}</b><span>Career PTS</span></div>
      </div>
      ${tabsHere.map((x) => {
        const rows = [[`Season ${s}`, cur[x.key]], ["Career", all[x.key]]].filter((r) => r[1]);
        return `<section class="blk-sm">${sh(esc(x.label), null, esc(x.pos))}<div class="card"><div class="tablewrap"><table class="tbl">
          <thead><tr><th class="l"></th><th>GP</th><th>PTS</th>${x.cols.map((col) => `<th>${esc(col)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map(([lbl, r]) => `<tr><td class="l"><b>${lbl}</b></td><td class="dim">${r.gp}</td><td class="key">${fmt(r.pts)}</td>${r.cols.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table></div></div></section>`;
      }).join("")}
      <div class="cols">
        <section>${sh("Game log")}<div class="card"><div class="tablewrap"><table class="tbl log">
          <thead><tr><th class="l">Week</th><th class="l">Opponent</th><th class="l">Line</th><th>PTS</th></tr></thead>
          <tbody>${(p.log || []).map((g) => `<tr class="link" data-href="${gameHref(g.game_id)}">
            <td class="l dim">${esc(g.week)}</td>
            <td class="l">${g.opp ? `<span class="pl">${mark(g.opp, "xs")}<span>${esc(g.opp)}</span>${g.result ? `<span class="res sm"><i class="${g.result[0]}">${g.result[0]}</i>${esc(g.result.slice(2))}</span>` : ""}</span>` : `Game #${g.game_id}`}</td>
            <td class="l dim wrap-cell">${(g.lines || []).map((l) => esc(l.phrase)).join(" · ") || "–"}</td>
            <td class="key">${fmt(g.pts)}</td></tr>`).join("")}</tbody></table></div></div></section>
        <aside>${sh("Career highs")}<div class="card list">
          ${(p.highs || []).map((h) => `<div class="rail-row"><span class="who"><b>${esc(h.label)}</b><small>${esc([h.week, h.opp ? "vs " + h.opp : ""].filter(Boolean).join(" · "))}</small></span><span class="v">${esc(h.value)}</span></div>`).join("") || `<div class="empty-mini">No highs yet.</div>`}
        </div></aside>
      </div>`);
  }

  // ---------------------------------------------------------------- MVP / AWARDS / RECORDS / POINTS / RULES
  function mvpPage() {
    const s = season();
    const rows = (D.mvp[s] || []).filter((r) => inLg(r.team));
    return page(`${head(`Season ${esc(s)}`, `${race(state.lg).label} <span>race</span>`, tools(lgSeg()))}
      ${rows.length ? `${legend()}<div class="mvp-list">${mvpRows(rows, 50)}</div><p class="note">Total PTS across every position a player has stats at. The bar shows where the points come from.</p>`
        : empty("The race hasn't started", `The ${race(state.lg).label} race ranks every player by total PTS once games are posted.`)}`);
  }
  function awardCard(a) {
    return `<section class="card award reveal">
      <a class="potw" href="${playerHref(a.potw.key)}" data-link style="--tc:${esc((teamBy(a.potw.team) || {}).color || "#8b3dff")}">
        <span class="potw-badge">★ Player of the week · ${esc(a.week)}</span>
        ${hs(a.potw.key, a.potw.player, "xl")}
        <span class="potw-who"><b>${esc(a.potw.player)}</b><small>${esc(a.potw.team || "Free agent")}</small></span>
        <span class="potw-pts">${fmt(a.potw.pts)}<small>PTS</small></span></a>
      <div class="totw"><p class="totw-h">Team of the week</p>${D.tabs.filter((t) => a.totw[t.key]).map((t) => { const x = a.totw[t.key]; return `<a href="${playerHref(x.key)}" data-link><span class="pos">${esc(t.pos)}</span>${hs(x.key, x.player, "sm")}<span class="nm">${esc(x.player)}</span><span class="v">${fmt(x.pts)}</span></a>`; }).join("")}</div>
    </section>`;
  }
  function awardsPage() {
    return page(`${head(`Season ${esc(season())}`, "Weekly <span>awards</span>", "")}
      ${D.awards.length ? `<div class="award-list">${D.awards.map(awardCard).join("")}</div>` : empty("No awards yet", "Player and Team of the Week are picked from each week's games.")}`);
  }
  function recordsPage() {
    const r = D.records;
    const card = (x, isSeason) => `<a class="rcard reveal" href="${playerHref(x.key)}" data-link>
      <span class="r-lbl">${esc(x.label)}</span><span class="r-val">${esc(x.value)}</span>
      <span class="r-by">${hs(x.key, x.player, "sm")}<span><b>${esc(x.player)}</b><small>${isSeason ? `Season ${esc(x.season)}` : esc([x.week, x.opp ? "vs " + x.opp : "", `Season ${x.season}`].filter(Boolean).join(" · "))}</small></span></span></a>`;
    return page(`${head("All time", "Record <span>book</span>", "")}
      <section class="blk-sm">${sh("Single game")}${r.game.length ? `<div class="rgrid">${r.game.map((x) => card(x, false)).join("")}</div>` : empty("No records yet", "Records are set as games are posted.", { join: false })}</section>
      <section class="blk-sm">${sh("Single season")}${r.season.length ? `<div class="rgrid">${r.season.map((x) => card(x, true)).join("")}</div>` : empty("No records yet", "Season records fill in as the season goes.", { join: false })}</section>`);
  }
  function pointsPage() {
    return page(`${head("Scoring", "How <span>PTS</span> work", "")}
      <p class="lead-p reveal">Every stat line earns RUFL points (PTS). Big plays like yards, touchdowns, takeaways and clutch downs carry the score, and turnovers cost you. PTS decide the stat leaders, the MVP race and the weekly awards.</p>
      ${D.tabs.length ? `<div class="guide-grid">${D.tabs.map((t) => `<div class="card guide reveal"><div class="g-head"><span class="g-pos">${esc(t.pos)}</span><h3>${esc(t.label)}</h3></div><ul>${String(t.guide || "").split(/[,;]\s*/).filter(Boolean).map((x) => `<li class="${/^-/.test(x.trim()) ? "neg" : ""}">${esc(x.trim())}</li>`).join("")}</ul></div>`).join("")}</div>` : empty("Scoring guide coming", "The PTS guide is published with the first stats.", { join: false })}`);
  }
  function md(text) {
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^<b>(\d+\.\d+)<\/b>/, '<span class="rule-no">$1</span>');
    const out = []; let list = null;
    const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`); list = null; } };
    for (const raw of String(text || "").split("\n")) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      const m = line.match(/^[-*] (.+)/), n = line.match(/^\d+\. (.+)/);
      if (m || n) { const tag = m ? "ul" : "ol"; if (list && list.tag !== tag) flush(); list = list || { tag, items: [] }; list.items.push(inline((m || n)[1])); continue; }
      flush(); out.push(`<p>${inline(line)}</p>`);
    }
    flush();
    return out.join("");
  }
  function rulesPage() {
    const rb = D.rulebook;
    if (!rb || !rb.articles || !rb.articles.length) return page(`${head("Official", "Rule <span>book</span>", "")}${empty("No rule book yet", "League staff haven't published the rule book here yet. The rules live in the Discord for now.")}`);
    return page(`${head(`Season ${esc(season())} · Official`, "Rule <span>book</span>", "")}
      <p class="lead-p">${esc(rb.intro || "")}</p>
      <div class="rules"><nav class="card rules-toc">${rb.articles.map((a) => `<a href="#article-${a.num}"><span>${a.num}</span>${esc(a.title)}</a>`).join("")}</nav>
      <div>${rb.articles.map((a) => `<section class="card rule-art" id="article-${a.num}"><header><span class="rule-num">${a.num}</span><h2>${esc(a.title)}</h2></header><div class="rule-text">${md(a.body)}</div></section>`).join("")}</div></div>`);
  }
  function notFound() {
    return page(`${head("404", "Off the <span>field</span>", "")}${empty("Page not found", "That page doesn't exist, or its stats haven't been posted yet.", { join: false })}<p class="center"><a class="btn" href="/" data-link>Back to home</a></p>`);
  }

  // ---------------------------------------------------------------- router
  const SECTION_RE = /^\/(nfl|cfb)(\/.*)?$/;
  const routes = [
    [/^\/$/, chooserPage, "home"],
    [/^\/(nfl|cfb)\/?$/, sectionHome, "home"],
    [/^\/(nfl|cfb)\/scores\/?$/, scoresPage, "scores"],
    [/^\/(nfl|cfb)\/(standings|rankings)\/?$/, standingsPage, "standings"],
    [/^\/(nfl|cfb)\/stats\/?$/, () => statsPage(D.tabs[0] && D.tabs[0].key), "stats"],
    [/^\/(nfl|cfb)\/stats\/([a-z]+)\/?$/, (m) => statsPage(m[2]), "stats"],
    [/^\/(nfl|cfb)\/teams\/?$/, teamsPage, "teams"],
    [/^\/(nfl|cfb)\/(mvp|heisman|race)\/?$/, mvpPage, "race"],
    [/^\/game\/(\d+)\/?$/, (m) => gamePage(m[1]), "scores"],
    [/^\/team\/([^/]+)\/?$/, (m) => teamPage(m[1]), "teams"],
    [/^\/player\/([^/]+)\/?$/, (m) => playerPage(m[1]), "stats"],
    [/^\/awards\/?$/, awardsPage, "awards"],
    [/^\/records\/?$/, recordsPage, "records"],
    [/^\/points\/?$/, pointsPage, "points"],
    [/^\/(rules|rulebook)\/?$/, rulesPage, "rules"],
  ];
  const lastLg = () => { try { return localStorage.getItem("rufl-lg"); } catch (e) { return null; } };
  // which league a page belongs to: from the URL, or from the team/player/game it shows
  function routeLeague(path) {
    const m = path.match(SECTION_RE);
    if (m) return m[1].toUpperCase();
    let x;
    if ((x = path.match(/^\/team\/([^/]+)/))) { const t = teamById(decodeURIComponent(x[1])); return t ? leagueOf(t.name) : null; }
    if ((x = path.match(/^\/player\/([^/]+)/))) { const pl = D.players[decodeURIComponent(x[1])]; return pl ? leagueOf(pl.team) : null; }
    if ((x = path.match(/^\/game\/(\d+)/))) { const g = D.games.find((y) => String(y.id) === x[1]); return g ? leagueOf(g.home || g.away) : null; }
    return null;
  }
  // old links (/scores, /standings, /mvp ...) go to the same tab in the last-used league
  function legacyRedirect() {
    const m = location.pathname.match(/^\/(scores|standings|rankings|stats(?:\/[a-z]+)?|teams|mvp|heisman)\/?$/);
    if (!m || leagues().length < 1) return false;
    const k = (lastLg() || (leagues()[0] || {}).key || "NFL").toLowerCase();
    let rest = m[1];
    if (rest === "mvp" || rest === "heisman") rest = race(k.toUpperCase()).slug;
    history.replaceState({}, "", `/${k}/${rest}${location.search}`);
    return true;
  }
  // the same tab in the other league
  function switchHref(k) {
    const kl = k.toLowerCase(), m = location.pathname.match(SECTION_RE);
    if (!m) return `/${kl}`;
    let rest = m[2] || "";
    if (/^\/(mvp|heisman|race)\/?$/.test(rest)) rest = "/" + race(k).slug;
    return `/${kl}${rest}${/standings/.test(rest) ? location.search : ""}`;
  }
  function renderNav() {
    const L = leagues();
    const sw = $("#lgSwitch");
    if (sw) sw.innerHTML = L.length > 1 ? L.map((l) => `<a class="${l.key === state.lg ? "on" : ""} lgs-${esc(l.key)}" href="${switchHref(l.key)}" data-link aria-current="${l.key === state.lg ? "true" : "false"}">${esc(l.name)}</a>`).join("") : "";
    let items;
    if (state.lg) {
      const b = "/" + state.lg.toLowerCase(), r = race(state.lg);
      items = [[b, `${esc(lgObj(state.lg).name)} Home`, "home"], [b + "/scores", "Scores", "scores"], [b + "/standings", "Standings", "standings"], [b + "/stats", "Stats", "stats"], [b + "/teams", "Teams", "teams"], [b + "/" + r.slug, `${esc(r.label)} Race`, "race"]];
    } else {
      items = [["/", "Home", "home"], ...L.map((l) => [`/${l.key.toLowerCase()}`, `${esc(l.name)} League`, "lg-" + l.key])];
    }
    const hasRules = !!(D.rulebook && D.rulebook.articles && D.rulebook.articles.length);
    links.innerHTML = items.map(([h, t, k]) => `<a href="${h}" data-link data-sec="${k}">${t}</a>`).join("") + `
      <div class="more">
        <button class="more-btn" id="moreBtn" aria-expanded="false" aria-haspopup="true" data-sec="more">More <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <div class="more-menu">
          ${state.lg ? `<a href="/" data-link>All leagues</a>` : ""}
          <a href="/awards" data-link data-sec="awards">Weekly awards</a>
          <a href="/records" data-link data-sec="records">Record book</a>
          <a href="/points" data-link data-sec="points">How PTS work</a>
          ${hasRules ? `<a href="/rules" data-link data-sec="rules">Rule book</a>` : ""}
          <a href="/#bowl" data-link>Ultimate Bowl</a>
          <a href="/#join" data-link>How to join</a>
        </div>
      </div>`;
  }
  let section = null;
  function render(keepScroll) {
    if (!D) return;
    legacyRedirect();
    state.lg = routeLeague(location.pathname);
    if (state.lg) { try { localStorage.setItem("rufl-lg", state.lg); } catch (e) {} }
    document.body.dataset.lg = state.lg || "";
    renderNav();
    renderStrip();
    let html = null; section = null;
    for (const [re, fn, sec] of routes) {
      const m = location.pathname.match(re);
      if (m) { html = fn(m); section = sec; break; }
    }
    if (html == null) html = notFound();
    const y = scrollY;
    app.innerHTML = html;
    document.body.dataset.page = section || "none";
    if (keepScroll) scrollTo(0, y);
    setNav(section);
    afterRender();
    const h = $(".pagehead h1");
    const lgName = state.lg ? lgObj(state.lg).name : "";
    document.title = h && section !== "home" ? `${h.textContent.trim().replace(/\s+/g, " ")} · ${lgName ? lgName + " · " : ""}RUFL` : lgName ? `${lgName} · RUFL` : "RUFL · Ultimate Football League";
  }
  function go(href) {
    const u = new URL(href, location.origin);
    if (u.pathname !== location.pathname) { state.view = null; state.week = null; }
    if (u.pathname + u.search + u.hash === location.pathname + location.search + location.hash) return;
    history.pushState({}, "", u.pathname + u.search + u.hash);
    const samePage = u.pathname === location.pathname && D && $(".home") && u.pathname === "/";
    if (!samePage) render(false);
    if (u.hash) { const t = document.getElementById(u.hash.slice(1)); if (t) t.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); }
    else if (!samePage) scrollTo(0, 0);
    closeMenus();
  }
  function setNav(sec) {
    const moreSecs = ["awards", "records", "points", "rules"];
    $$(".links [data-sec]").forEach((a) => a.classList.toggle("active", a.dataset.sec === sec || (a.dataset.sec === "more" && moreSecs.includes(sec))));
  }

  // ---------------------------------------------------------------- after every render
  let io = null;
  function afterRender() {
    // reveal on scroll
    io && io.disconnect();
    io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const sibs = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
      el.style.transitionDelay = Math.min(6, Math.max(0, sibs.indexOf(el))) * 60 + "ms";
      el.classList.add("in");
      io.unobserve(el);
    }), { threshold: 0.08, rootMargin: "0px 0px -30px 0px" });
    $$(".reveal", app).forEach((el) => (reduce ? el.classList.add("in") : io.observe(el)));
    // row links
    $$("tr[data-href]", app).forEach((tr) => tr.addEventListener("click", (e) => { if (!e.target.closest("a")) go(tr.dataset.href); }));
    // week / view switches
    $$("[data-week]", app).forEach((b) => b.addEventListener("click", () => { state.week = b.dataset.week; render(true); }));
    $$("[data-view]", app).forEach((b) => b.addEventListener("click", () => { state.view = b.dataset.view; history.replaceState({}, "", sec("/standings") + (b.dataset.view === "conf" ? "" : "?view=" + b.dataset.view)); render(true); }));
    $$("[data-lg]", app).forEach((b) => b.addEventListener("click", () => {
      state.lg = b.dataset.lg || null;
      try { state.lg ? localStorage.setItem("rufl-lg", state.lg) : localStorage.removeItem("rufl-lg"); } catch (e) {}
      render(true);
    }));
    // spotlight
    $$(".fcard, .lcard, .tcard", app).forEach((c) => c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px");
    }));
    // centre the active week tab
    const on = $(".weeks .on", app); if (on) on.scrollIntoView({ block: "nearest", inline: "center" });
    fillLive();
    navState();
  }

  // ---------------------------------------------------------------- live Discord counts
  function fillLive() {
    if (!live) return;
    $$("[data-live]").forEach((el) => { const v = live[el.dataset.live]; if (v) el.textContent = num(v); });
  }
  function fetchLive() {
    const KEY = "rufl-live";
    const cached = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } };
    const c0 = cached();
    if (c0 && Date.now() - c0.t < 600000) { live = c0.v; fillLive(); return; }
    const code = invite().split("/").pop();
    fetch(`https://discord.com/api/v9/invites/${encodeURIComponent(code)}?with_counts=true&_=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        live = { members: d.approximate_member_count, online: d.approximate_presence_count }; fillLive();
        try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), v: live })); } catch (e) {}
      })
      .catch(() => {
        const c = cached();
        if (c) { live = c.v; fillLive(); return; }
        $$('[data-live="members"]').forEach((e) => (e.textContent = "3,800+"));
      });
  }

  // ---------------------------------------------------------------- nav, menus, search
  const nav = $("#nav"), burger = $("#burger"), links = $("#links");
  const moreBtnEl = () => $("#moreBtn");
  function navState() {
    nav.classList.toggle("solid", scrollY > 30 || section !== "home");
    document.body.classList.toggle("strip-on", section === "home" && scrollY > innerHeight * 0.75);
  }
  addEventListener("scroll", navState, { passive: true });
  function closeMenus() {
    burger.setAttribute("aria-expanded", "false"); links.classList.remove("open"); document.body.classList.remove("menu-open");
    moreBtnEl()?.setAttribute("aria-expanded", "false");
  }
  burger.addEventListener("click", () => {
    const open = burger.getAttribute("aria-expanded") !== "true";
    burger.setAttribute("aria-expanded", open); links.classList.toggle("open", open); document.body.classList.toggle("menu-open", open);
  });
  document.addEventListener("click", (e) => {
    const mb = e.target.closest("#moreBtn");
    if (mb) { mb.setAttribute("aria-expanded", mb.getAttribute("aria-expanded") !== "true"); return; }
    if (!e.target.closest(".more")) moreBtnEl()?.setAttribute("aria-expanded", "false");
    const a = e.target.closest("a[href]");
    if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    const href = a.getAttribute("href");
    if (href.startsWith("/") && !href.startsWith("//") && !/\.(png|jpg|json)$/.test(href)) { e.preventDefault(); go(href); }
  });
  addEventListener("popstate", () => { state.view = null; render(false); });

  const search = $("#search"), sIn = $("#searchIn"), sList = $("#searchList");
  let sIdx = 0, sItems = [];
  function openSearch() { closeMenus(); search.hidden = false; sIn.value = ""; sIdx = 0; drawSearch(); setTimeout(() => sIn.focus(), 20); }
  function closeSearch() { search.hidden = true; }
  function drawSearch() {
    if (!D) return;
    const q = sIn.value.trim().toLowerCase();
    const teams = D.teams.filter((t) => !q || t.name.toLowerCase().includes(q) || String(t.abbr || "").toLowerCase().includes(q)).slice(0, 6)
      .map((t) => ({ href: `/team/${t.id}`, html: `${mark(t.name, "sm")}<span><b>${esc(t.name)}</b><small>Team · ${recOf(t)}</small></span>` }));
    const players = Object.entries(D.players).filter(([k, p]) => q && (p.name.toLowerCase().includes(q) || k.includes(q))).sort((a, b) => b[1].pts - a[1].pts).slice(0, 8)
      .map(([k, p]) => ({ href: playerHref(k), html: `${hs(k, p.name, "sm")}<span><b class="pn">${esc(p.name)}</b><small>${esc(p.team || "Free agent")} · ${fmt(p.pts)} PTS</small></span>` }));
    const pages = [...leagues().flatMap((l) => { const b = "/" + l.key.toLowerCase(); return [[b, `${l.name} home`], [b + "/scores", `${l.name} scores`], [b + "/standings", `${l.name} standings`], [b + "/stats", `${l.name} stats`], [b + "/teams", `${l.name} teams`], [b + "/" + race(l.key).slug, `${l.name} ${race(l.key).label} race`]]; }),
      ["/awards", "Weekly awards"], ["/records", "Record book"], ["/points", "How PTS work"]]
      .filter(([, l]) => q && l.toLowerCase().includes(q)).map(([h, l]) => ({ href: h, html: `<span class="s-ico">↗</span><span><b>${l}</b><small>Page</small></span>` }));
    sItems = [...players, ...teams, ...pages];
    sIdx = Math.min(sIdx, Math.max(0, sItems.length - 1));
    sList.innerHTML = sItems.length ? sItems.map((x, i) => `<a href="${x.href}" class="${i === sIdx ? "on" : ""}">${x.html}</a>`).join("")
      : `<div class="empty-mini">${q ? `Nothing found for “${esc(q)}”.` : D.teams.length ? "" : "Players and teams show up here once the season's stats are posted."}</div>`;
  }
  $("#searchBtn").addEventListener("click", openSearch);
  sIn.addEventListener("input", () => { sIdx = 0; drawSearch(); });
  sIn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { sIdx = Math.min(sItems.length - 1, sIdx + 1); drawSearch(); e.preventDefault(); }
    if (e.key === "ArrowUp") { sIdx = Math.max(0, sIdx - 1); drawSearch(); e.preventDefault(); }
    if (e.key === "Enter" && sItems[sIdx]) { closeSearch(); go(sItems[sIdx].href); }
  });
  search.addEventListener("click", (e) => { if (e.target === search) closeSearch(); if (e.target.closest("a")) closeSearch(); });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeSearch(); closeMenus(); }
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
  });

  // ---------------------------------------------------------------- go
  $$(".discord-link").forEach((a) => (a.href = INVITE));
  load(true).then(fetchLive);
  setInterval(() => { if (!document.hidden) load(false); }, 60000);
})();
