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
  const state = { sort: {}, view: null, week: null };

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
    const c = (t && t.color) || "#6b4bb3";
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
  function head(kick, title, extra = "", mark = "") {
    return `<header class="pagehead reveal"><span class="ghost" aria-hidden="true">${esc(mark || title)}</span>
      <div><p class="kicker">${kick}</p><h1>${title}</h1></div>${extra}</header>`;
  }
  function empty(title, text, opts = {}) {
    return `<div class="empty reveal"><img src="/img/logo.png" alt="" width="90" height="88" loading="lazy">
      <h3>${esc(title)}</h3><p>${esc(text)}</p>
      ${opts.join !== false ? `<a class="btn discord-link" href="${esc(invite())}" target="_blank" rel="noopener">${DC}Join the Discord</a>` : ""}</div>`;
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
    // score bug strip
    const strip = $("#strip");
    const fin = D.games.filter(scored).slice(0, 14);
    strip.hidden = !fin.length;
    strip.innerHTML = fin.length ? `<span class="strip-label">Finals</span><div class="strip-track">${fin.map((g) => {
      const hw = g.hs > g.as, aw = g.as > g.hs;
      return `<a class="bug" href="${gameHref(g.id)}" data-link>
        <span class="bug-wk">${esc(String(g.week || "").replace("Week ", "WK "))}</span>
        <span class="bug-row ${aw ? "w" : ""}">${mark(g.away, "xs")}<b>${esc((teamBy(g.away) || {}).abbr || abbr(g.away))}</b><em>${g.as}</em></span>
        <span class="bug-row ${hw ? "w" : ""}">${mark(g.home, "xs")}<b>${esc((teamBy(g.home) || {}).abbr || abbr(g.home))}</b><em>${g.hs}</em></span>
      </a>`;
    }).join("")}</div>` : "";
    if (D.league.demo && !$(".demo-flag")) document.body.insertAdjacentHTML("beforeend", `<div class="demo-flag">Demo data · preview only</div>`);
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
    return `<a class="lcard reveal" href="/stats/${t.key.toLowerCase()}" data-link style="--tc:${esc((tm && tm.color) || "#8b3dff")}">
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
  function homePage() {
    const L = D.league, s = season();
    const games = D.games.filter((g) => String(g.season) === s);
    const latest = games.find(scored);
    const board = D.leaders[s] || {};
    const confs = D.conferences.map((c) => ({ name: c.name, teams: confTeams(c) })).filter((c) => c.teams.length);
    const mv = D.mvp[s] || [];
    const power = D.teams.filter((t) => t.prank).sort((a, b) => a.prank - b.prank).slice(0, 5);
    const thisWeek = pickWeek();

    const hero = `<section class="hero">
      <div class="hero-bg" id="heroBg" aria-hidden="true"></div>
      <div class="hero-shade" aria-hidden="true"></div>
      <div class="hero-inner">
        <div class="hero-copy">
          <p class="eyebrow"><span class="dot"></span>Season ${esc(L.season)}${hasGames() && L.week ? ` · Week ${esc(L.week)}` : " · Series 1"} is live</p>
          <h1 class="hero-h1"><span class="h1-top">The</span><span class="h1-main">Ultimate</span><span class="h1-main outline">Football</span><span class="h1-main">League</span></h1>
          <p class="lede">RUFL is where Roblox's Ultimate Football players go to compete for real. Draft into a team, run it every week, and play for a <strong>$200 Ultimate Bowl</strong>.</p>
          <div class="cta-row">
            <a class="btn btn-lg discord-link" href="${esc(invite())}" target="_blank" rel="noopener">${DC}Join the Discord</a>
            <a class="btn btn-lg btn-ghost" href="${hasGames() ? "/scores" : "/#join"}" data-link>${hasGames() ? "Latest scores" : "How it works"}</a>
          </div>
          <p class="live-pill"><span class="pulse"></span><b data-live="online">–</b> online now · <b data-live="members">–</b> members</p>
        </div>
        <div class="hero-logo" aria-hidden="true"><div class="glow"></div><img src="/img/logo.png" alt="" width="484" height="471" id="heroLogo"></div>
      </div>
    </section>
    <div class="ticker" aria-hidden="true"><div class="track">${Array(2).fill(`<span>Season ${esc(L.season)}</span><i>★</i><span>$200 Ultimate Bowl</span><i>★</i><span>Teams are signing</span><i>★</i><span>Free agents wanted</span><i>★</i><span>Ultimate Football</span><i>★</i><span>Series 1</span><i>★</i>`).join("")}</div></div>`;

    // ----- league dashboard (only once games exist)
    let dash = "";
    if (latest) {
      const p = latest.potg;
      dash += `<section class="wrap blk">
        ${sh("Game center", ["/scores", "All scores"], esc(latest.week))}
        <div class="gc-grid">
          <a class="gc-feature card reveal" href="${gameHref(latest.id)}" data-link>
            <span class="gc-tag">Latest final</span>
            ${scoreboard(latest, false)}
            ${latest.recap ? `<p class="gc-recap">${esc(latest.recap)}</p>` : ""}
            ${p ? `<div class="potg">${hs(p.key, p.player, "md")}<span><small>Player of the game</small><b>${esc(p.player)}</b><em>${esc(p.phrase || "")}</em></span><span class="potg-pts">${fmt(p.pts)}<small>PTS</small></span></div>` : ""}
            <span class="gc-more">Box score ${ARW}</span>
          </a>
          <div class="card gc-week reveal">
            <div class="gc-week-head"><b>${esc(thisWeek ? thisWeek.week : "This week")}</b><span>${thisWeek && thisWeek.matchups.every((m) => m.hs != null) ? "Final" : "Matchups"}</span></div>
            ${(thisWeek ? thisWeek.matchups : games.slice(0, 6)).map(miniGame).join("")}
          </div>
        </div>
      </section>`;
    }
    if (latest && Object.keys(board).length) {
      dash += `<section class="wrap blk">${sh("Stat leaders", ["/stats", "All stats"], `Season ${esc(s)}`)}
        <div class="lgrid">${D.tabs.map((t) => leaderCard(t, board[t.key] || [])).join("")}</div></section>`;
    }
    if (latest && (confs.length || D.teams.length)) {
      const cards = confs.length ? confs.map((c) => `<div class="card st-card reveal"><div class="st-head"><h3>${esc(c.name)}</h3><span>Conference</span></div>${standingsTable(c.teams, { compact: true, conf: true })}</div>`).join("")
        : `<div class="card st-card reveal">${standingsTable(leagueOrder(), { compact: true })}</div>`;
      dash += `<section class="wrap blk">${sh("Standings", ["/standings", "Full standings"])}<div class="st-grid">${cards}</div></section>`;
    }
    if (latest && mv.length) {
      const step = (e, place) => e ? `<a class="pod p${place} reveal" href="${playerHref(e.key)}" data-link style="--tc:${esc((teamBy(e.team) || {}).color || "#8b3dff")}">
          ${hs(e.key, e.player, "xl")}<b>${esc(e.player)}</b><small>${esc(e.team || "Free agent")}</small>
          <span class="pod-block"><em>${place}</em><span>${fmt(e.pts)} PTS</span></span></a>` : "<div></div>";
      dash += `<section class="wrap blk mvp-blk">
        <div>${sh("MVP race", ["/mvp", "Full race"])}<div class="podium">${step(mv[1], 2)}${step(mv[0], 1)}${step(mv[2], 3)}</div></div>
        ${power.length ? `<div>${sh("Power rankings", ["/standings?view=power", "All"])}<div class="card pr-list reveal">${power.map((t) => `<a class="pr-row" href="/team/${t.id}" data-link style="--tc:${esc(t.color)}">
            <span class="pr-rk">${t.prank}</span>${mark(t.name, "sm")}<span class="pr-nm"><b>${esc(t.name)}</b><small>${recOf(t)} · ${diffTxt(t.diff)}</small></span>${move(t.move)}</a>`).join("")}</div></div>` : ""}
      </section>`;
    }
    if (latest && D.awards.length) {
      const a = D.awards[0];
      dash += `<section class="wrap blk">${sh("Player of the week", ["/awards", "All awards"], esc(a.week))}${awardCard(a)}</section>`;
    }
    if (!latest) {
      dash = `<section class="wrap blk">${kickoff()}</section>`;
    }

    const landing = `
    <section class="stats-strip wrap">
      <div class="stat reveal"><b class="num" data-live="members">–</b><span>Members</span></div>
      <div class="stat reveal"><b class="num" data-live="online">–</b><span>Online now</span></div>
      <div class="stat reveal"><b class="num accent">$200</b><span>Ultimate Bowl prize</span></div>
      <div class="stat reveal"><b class="num">${esc(L.season)}</b><span>Seasons deep</span></div>
    </section>
    <section class="about wrap" id="about">
      <div class="section-head reveal"><p class="kicker">The League</p><h2>Not a pickup game.<br><span>A league.</span></h2>
        <p class="sub">RUFL takes Ultimate Football on Roblox and gives it everything a real league has: teams with front offices, a full season, standings that matter and a championship with money on it.</p></div>
      <div class="cards">
        ${feature("M12 2 3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6l-9-4Z", "Real teams", "Every team has its own owner, coaches and roster. Sign, trade and build something that lasts past one game.")}
        ${feature("M4 4h16v4H4zM4 10h10v4H4zM4 16h13v4H4z", "A full season", "Scheduled games, standings and playoffs, with every stat tracked on this site.")}
        ${feature("M7 3h10v3h3v3a5 5 0 0 1-5 5h-.3A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A5 5 0 0 1 9.3 14H9a5 5 0 0 1-5-5V6h3V3Zm0 5H6v1a3 3 0 0 0 1.4 2.5A5 5 0 0 1 7 9V8Zm10 0v1a5 5 0 0 1-.4 2.5A3 3 0 0 0 18 9V8h-1Z", "$200 on the line", "The season ends at the Ultimate Bowl. Win it and your team takes home the $200 prize and the bragging rights.")}
        ${feature("M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 1c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4ZM8 13.5c-.4 0-.9 0-1.4.1A5 5 0 0 1 9 17v3H0v-2.5C0 15.3 4.5 13.5 8 13.5Z", "A big community", "Thousands of members, with announcements, highlights and game-day talk all in one Discord.")}
      </div>
    </section>
    <section class="season" id="season"><div class="wrap season-grid">
      <div class="section-head reveal"><p class="kicker">Season ${esc(L.season)} · Series 1</p><h2>The road to the<br><span>Ultimate Bowl</span></h2>
        <p class="sub">Here is how a RUFL season plays out, from signing day to the final snap.</p>
        <a class="btn btn-lg discord-link" href="${esc(invite())}" target="_blank" rel="noopener">Sign up for Season ${esc(L.season)}</a></div>
      <ol class="road">
        <li class="reveal"><span class="step">01</span><div><h3>Sign up</h3><p>Join the Discord, get verified and put yourself on the free-agent board.</p></div></li>
        <li class="reveal"><span class="step">02</span><div><h3>Get signed</h3><p>Front offices are always scouting. Show up, play well and teams will come to you.</p></div></li>
        <li class="reveal"><span class="step">03</span><div><h3>Regular season</h3><p>Play your scheduled games. Every result goes into the standings.</p></div></li>
        <li class="reveal"><span class="step">04</span><div><h3>Playoffs</h3><p>The top teams move on. One bad game and the season is over.</p></div></li>
        <li class="reveal final"><span class="step">UB</span><div><h3>Ultimate Bowl</h3><p>Two teams, one title, $200 on the line.</p></div></li>
      </ol></div></section>
    <section class="bowl wrap" id="bowl">
      <div class="section-head center reveal"><p class="kicker">Ultimate Bowl</p><h2>Every season ends <span>here</span></h2><p class="sub">The biggest game in RUFL, built up all season.</p></div>
      <div class="bowl-grid">
        <figure class="bowl-card reveal"><img src="/img/bowl5.jpg" alt="Ultimate Bowl V poster" loading="lazy" width="960" height="540"><figcaption><b>Ultimate Bowl V</b><span>RUFL title game</span></figcaption></figure>
        <figure class="bowl-card reveal"><img src="/img/bowl4.jpg" alt="Ultimate Bowl IV poster" loading="lazy" width="960" height="540"><figcaption><b>Ultimate Bowl IV</b><span>Tampa Bay Buccaneers Stadium</span></figcaption></figure>
      </div>
      <div class="next-bowl reveal"><div><p class="kicker">Up next</p><h3>Season ${esc(L.season)}'s Ultimate Bowl</h3><p>Season ${esc(L.season)}'s champion is decided here. Will your name be on it?</p></div><div class="prize"><span>Prize</span><b>$200</b></div></div>
    </section>
    <section class="join wrap" id="join">
      <div class="section-head center reveal"><p class="kicker">How to Join</p><h2>Three steps to <span>game day</span></h2></div>
      <div class="steps">
        <div class="join-step reveal"><span class="big">1</span><h3>Join the Discord</h3><p>Everything in RUFL runs through the server: signings, schedules, results and announcements.</p><a class="link discord-link" href="${esc(invite())}" target="_blank" rel="noopener">${esc(invite().replace("https://", ""))} →</a></div>
        <div class="join-step reveal"><span class="big">2</span><h3>Get verified</h3><p>Link your Roblox account and pick your roles so teams can find you.</p></div>
        <div class="join-step reveal"><span class="big">3</span><h3>Get signed</h3><p>Teams are always looking for players. Hit the free-agent channel and let them know what you can do.</p></div>
      </div>
    </section>
    <section class="faq wrap" id="faq">
      <div class="section-head center reveal"><p class="kicker">FAQ</p><h2>Questions?</h2></div>
      <div class="qa">
        <details class="reveal"><summary>What game does RUFL play?</summary><p>Ultimate Football on Roblox. All league games are played there.</p></details>
        <details class="reveal"><summary>Do I need a team to join?</summary><p>No. Join the Discord as a free agent. Teams are always looking for players, and the free-agent channel is where they look.</p></details>
        <details class="reveal"><summary>What is the Ultimate Bowl?</summary><p>The championship game at the end of every RUFL season. This season the winning team plays for $200.</p></details>
        <details class="reveal"><summary>Where do the stats on this site come from?</summary><p>From the stat sheets of every official RUFL game. Scores, standings, leaders and player pages update after each game is posted.</p></details>
        <details class="reveal"><summary>Can I join in the middle of a season?</summary><p>Yes. Teams sign players during the season, so join the Discord and get on the free-agent board.</p></details>
      </div>
    </section>
    <section class="final">
      <div class="final-bg" aria-hidden="true"></div>
      <div class="wrap final-inner reveal">
        <img src="/img/logo.png" alt="RUFL logo" width="160" height="156" loading="lazy">
        <h2>Your team is<br><span>waiting.</span></h2>
        <p><b data-live="members">Thousands of</b> members are already in. Season ${esc(L.season)} doesn't wait.</p>
        <a class="btn btn-lg discord-link" href="${esc(invite())}" target="_blank" rel="noopener">${DC}Join RUFL on Discord</a>
      </div>
    </section>`;
    return `<div class="home">${hero}${dash}${landing}</div>`;
  }
  const feature = (path, title, text) => `<article class="fcard reveal"><div class="ico"><svg viewBox="0 0 24 24"><path d="${path}"/></svg></div><h3>${title}</h3><p>${text}</p></article>`;
  const move = (m) => (m > 0 ? `<span class="mv up" title="Up ${m}">▲${m}</span>` : m < 0 ? `<span class="mv down" title="Down ${-m}">▼${-m}</span>` : `<span class="mv">–</span>`);

  function miniGame(m) {
    const ok = m.hs != null && m.as != null;
    const hw = ok && m.hs > m.as, aw = ok && m.as > m.hs;
    const row = (name, sc, w, l) => `<span class="mg-row ${w ? "w" : ""} ${l ? "l" : ""}">${mark(name, "xs")}<b>${esc(name || "TBD")}</b><em>${ok ? sc : ""}</em></span>`;
    const inner = `${row(m.away, m.as, aw, ok && !aw)}${row(m.home, m.hs, hw, ok && !hw)}<span class="mg-st">${ok ? "Final" : "Upcoming"}</span>`;
    const id = m.game_id ?? m.id;
    return ok && id != null ? `<a class="mg" href="${gameHref(id)}" data-link>${inner}</a>` : `<div class="mg">${inner}</div>`;
  }

  function kickoff() {
    const L = D.league;
    const teams = D.teams.slice(0, 16);
    return `<div class="kickoff reveal">
      <div class="ko-text">
        <p class="kicker">Season ${esc(L.season)} stats</p>
        <h2>The stat book <span>opens soon</span></h2>
        <p>Scores, standings, stat leaders, the MVP race and every player's numbers land here as soon as Season ${esc(L.season)} games are posted.</p>
        <div class="ko-links">
          <a href="/scores" data-link>Scores</a><a href="/standings" data-link>Standings</a><a href="/stats" data-link>Stat leaders</a><a href="/mvp" data-link>MVP race</a>
        </div>
      </div>
      <div class="ko-art" aria-hidden="true">${teams.length ? teams.map((t, i) => `<span style="--i:${i}">${mark(t.name, "md")}</span>`).join("")
        : `<div class="ko-board"><div><span>HOME</span><b>00</b></div><div class="ko-q"><span>QTR</span><b>1</b></div><div><span>AWAY</span><b>00</b></div></div>`}</div>
    </div>`;
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
    const games = D.games.filter((g) => String(g.season) === s);
    let body = "", picker = "";
    if (weeks.length) {
      const w = pickWeek();
      picker = `<div class="weeks" role="tablist">${weeks.map((x) => {
        const done = x.matchups.length && x.matchups.every((m) => m.hs != null);
        return `<button class="wk ${x.week === w.week ? "on" : ""}" data-week="${esc(x.week)}" role="tab" aria-selected="${x.week === w.week}"><span>${esc(String(x.week).replace("Week ", "WK "))}</span><small>${done ? "Final" : x.matchups.some((m) => m.hs != null) ? "Live" : "Next"}</small></button>`;
      }).join("")}</div>`;
      body = `<div class="score-grid">${w.matchups.map((m) => {
        const g = m.game_id != null ? D.games.find((x) => x.id === m.game_id) : null;
        return scoreCard(g || { home: m.home, away: m.away, hs: m.hs, as: m.as, week: w.week, id: m.game_id });
      }).join("")}</div>`;
    } else if (games.length) {
      const byWeek = {};
      games.forEach((g) => (byWeek[g.week || "Other"] = byWeek[g.week || "Other"] || []).push(g));
      body = Object.entries(byWeek).sort((a, b) => weekNum(b[0]) - weekNum(a[0])).map(([wk, list]) =>
        `<section class="blk-sm">${sh(esc(wk))}<div class="score-grid">${list.map(scoreCard).join("")}</div></section>`).join("");
    } else {
      body = empty("No games yet", `Season ${s} scores show up here as soon as the first game is posted.`);
    }
    return page(`${head(`Season ${esc(s)}`, "Scores", "", "Scores")}${picker}${body}`);
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
      <a class="crumb" href="/scores" data-link>${BACK} Scores</a>
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
    const confs = D.conferences.map((c) => ({ name: c.name, teams: confTeams(c) })).filter((c) => c.teams.length);
    const views = [["conf", "Conferences"], ["league", "League"], ["power", "Power rankings"]].filter(([k]) => k !== "conf" || confs.length);
    let view = state.view || qv || views[0][0];
    if (!views.some(([k]) => k === view)) view = views[0][0];
    state.view = view;
    if (!D.teams.length) return page(`${head(`Season ${esc(season())}`, "Standings", "", "Standings")}${empty("No standings yet", "Standings fill in once teams play their first games.")}`);
    const seg = `<div class="seg" role="tablist">${views.map(([k, l]) => `<button class="${k === view ? "on" : ""}" data-view="${k}" role="tab" aria-selected="${k === view}">${l}</button>`).join("")}</div>`;
    let body = "";
    if (view === "conf") body = `<div class="st-stack">${confs.map((c) => `<section class="card st-card reveal"><div class="st-head"><h3>${esc(c.name)}</h3><span>${c.teams.length} teams</span></div>${standingsTable(c.teams, { conf: true })}</section>`).join("")}</div>`;
    else if (view === "league") body = `<section class="card st-card reveal">${standingsTable(leagueOrder(), { conf: confs.length > 0 })}</section>`;
    else {
      const list = D.teams.filter((t) => t.prank).sort((a, b) => a.prank - b.prank);
      const max = Math.max(1, ...list.map((t) => t.power || 0));
      body = list.length ? `<div class="power">${list.map((t) => `<a class="pw-row card reveal" href="/team/${t.id}" data-link style="--tc:${esc(t.color)}">
          <span class="pw-rk">${t.prank}</span>${move(t.move)}${mark(t.name, "md")}
          <span class="pw-nm"><b>${esc(t.name)}</b><small>${recOf(t)} · ${diffTxt(t.diff)} PD · ${esc(t.streak || "")}</small></span>
          <span class="pw-bar"><i style="width:${((t.power || 0) / max) * 100}%"></i></span><span class="pw-v">${fmt(t.power)}</span></a>`).join("")}</div>
          <p class="note">Power score mixes record, point differential and recent form.</p>` : empty("No power rankings yet", "Power rankings start after the first week of games.", { join: false });
    }
    return page(`${head(`Season ${esc(season())}`, "Standings", seg, "Standings")}${body}`);
  }

  // ---------------------------------------------------------------- STATS
  function statsPage(key) {
    const t = tab(String(key || "").toUpperCase()) || D.tabs[0];
    if (!t) return page(`${head("Stat leaders", "Stats")}${empty("No stats yet", "Stat leaders show up once games are posted.")}`);
    const ask = new URLSearchParams(location.search).get("season");
    const opts = [...D.league.seasons.map(String).reverse(), ...(D.leaders.all ? ["all"] : [])];
    const s = opts.includes(ask) ? ask : season();
    const rows = ((D.leaders[s] || {})[t.key] || []).map((r, i) => ({ ...r, rank: i + 1 }));
    const q = s !== season() ? `?season=${s}` : "";
    const tabsNav = `<nav class="pills" aria-label="Stat categories">${D.tabs.map((x) => `<a class="${x.key === t.key ? "on" : ""}" href="/stats/${x.key.toLowerCase()}${q}" data-link><b>${esc(x.pos)}</b><span>${esc(x.label)}</span></a>`).join("")}</nav>`;
    const seasonSel = opts.length > 1 ? `<label class="sel"><span>Season</span><select id="seasonSel">${opts.map((o) => `<option value="${o}" ${o === s ? "selected" : ""}>${o === "all" ? "All time" : "Season " + o}</option>`).join("")}</select></label>` : "";
    const top3 = rows.slice(0, 3);
    setTimeout(() => {
      const draw = () => drawStatTable(t, rows, ($("#statSearch")?.value || "").toLowerCase());
      $("#statSearch")?.addEventListener("input", draw);
      $("#seasonSel")?.addEventListener("change", (e) => go(`/stats/${t.key.toLowerCase()}${e.target.value === season() ? "" : "?season=" + e.target.value}`));
      draw();
    });
    return page(`${head(s === "all" ? "All time" : `Season ${esc(s)}`, `${esc(t.label)} <span>leaders</span>`, seasonSel, "Stats")}
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
    const groups = D.conferences.map((c) => ({ name: c.name, teams: confTeams(c) })).filter((g) => g.teams.length);
    const others = D.teams.filter((t) => !groups.some((g) => g.teams.includes(t)));
    if (others.length) groups.push({ name: groups.length ? "Other teams" : "All teams", teams: others });
    const card = (t) => `<a class="tcard reveal" href="/team/${t.id}" data-link style="--tc:${esc(t.color || "#6b4bb3")}">
        <span class="tc-glow" aria-hidden="true"></span>${mark(t.name, "lg")}
        <span class="tc-nm"><b>${esc(t.name)}</b><small>${t.gp ? `<em>${recOf(t)}</em>${t.conf ? ` · ${confRec(t)} conf` : ""} · <span class="${diffCls(t.diff)}">${diffTxt(t.diff)}</span>` : "No games yet"}</small>${t.gp ? form(t.last5) : ""}</span></a>`;
    return page(`${head(`Season ${esc(season())}`, "Teams", "", "Teams")}
      ${groups.length ? groups.map((g) => `<section class="blk-sm">${sh(esc(g.name), null, `${g.teams.length} teams`)}<div class="tgrid">${g.teams.map(card).join("")}</div></section>`).join("")
        : empty("Teams coming soon", "Every RUFL team gets its own page here, with its roster, schedule and leaders.")}`);
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
      <a class="crumb" href="/teams" data-link>${BACK} Teams</a>
      <section class="ent-hero reveal ${lt ? "lt" : ""}" style="--tc:${esc(t.color || "#6b4bb3")}">
        <span class="ent-ghost" aria-hidden="true">${esc(t.abbr || abbr(t.name))}</span>
        ${mark(t.name, "xxl")}
        <div class="ent-id"><p class="ent-k">${esc(t.conf || D.league.name)}${crank ? ` · ${ord(crank)} in conference` : ""}</p><h1>${esc(t.name)}</h1>
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
      <a class="crumb" href="/stats" data-link>${BACK} Stat leaders</a>
      <section class="ent-hero player reveal ${lum(c) > 0.6 ? "lt" : ""}" style="--tc:${esc(c)}">
        <span class="ent-ghost" aria-hidden="true">${esc(tabsHere.map((x) => x.pos).join(" ") || "RUFL")}</span>
        ${hs(key, p.name, "xxl")}
        <div class="ent-id"><p class="ent-k">${p.team ? `${mark(p.team, "xs")} ${teamLink(p.team)}` : "Free agent"}${p.role ? ` · <span class="role">${esc(p.role)}</span>` : ""}${tabsHere.length ? " · " + tabsHere.map((x) => x.pos).join(" / ") : ""}</p><h1 class="nocase">${esc(p.name)}</h1></div>
        <div class="ent-big"><b>${fmt(curPts)}</b><small>Season ${esc(s)} PTS</small></div>
      </section>
      <div class="statbar reveal">
        <div><b>${p.gp}</b><span>Games</span></div>
        ${p.mvp_rank ? `<div><b>${ord(p.mvp_rank)}</b><span>MVP race</span></div>` : ""}
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
    const rows = D.mvp[s] || [];
    return page(`${head(`Season ${esc(s)}`, "MVP <span>race</span>", "", "MVP")}
      ${rows.length ? `${legend()}<div class="mvp-list">${mvpRows(rows, 50)}</div><p class="note">Total PTS across every position a player has stats at. The bar shows where the points come from.</p>`
        : empty("The race hasn't started", "The MVP race ranks every player by total PTS once games are posted.")}`);
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
    return page(`${head(`Season ${esc(season())}`, "Weekly <span>awards</span>", "", "Awards")}
      ${D.awards.length ? `<div class="award-list">${D.awards.map(awardCard).join("")}</div>` : empty("No awards yet", "Player and Team of the Week are picked from each week's games.")}`);
  }
  function recordsPage() {
    const r = D.records;
    const card = (x, isSeason) => `<a class="rcard reveal" href="${playerHref(x.key)}" data-link>
      <span class="r-lbl">${esc(x.label)}</span><span class="r-val">${esc(x.value)}</span>
      <span class="r-by">${hs(x.key, x.player, "sm")}<span><b>${esc(x.player)}</b><small>${isSeason ? `Season ${esc(x.season)}` : esc([x.week, x.opp ? "vs " + x.opp : "", `Season ${x.season}`].filter(Boolean).join(" · "))}</small></span></span></a>`;
    return page(`${head("All time", "Record <span>book</span>", "", "Records")}
      <section class="blk-sm">${sh("Single game")}${r.game.length ? `<div class="rgrid">${r.game.map((x) => card(x, false)).join("")}</div>` : empty("No records yet", "Records are set as games are posted.", { join: false })}</section>
      <section class="blk-sm">${sh("Single season")}${r.season.length ? `<div class="rgrid">${r.season.map((x) => card(x, true)).join("")}</div>` : empty("No records yet", "Season records fill in as the season goes.", { join: false })}</section>`);
  }
  function pointsPage() {
    return page(`${head("Scoring", "How <span>PTS</span> work", "", "PTS")}
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
    if (!rb || !rb.articles || !rb.articles.length) return page(`${head("Official", "Rule <span>book</span>", "", "Rules")}${empty("No rule book yet", "League staff haven't published the rule book here yet. The rules live in the Discord for now.")}`);
    return page(`${head(`Season ${esc(season())} · Official`, "Rule <span>book</span>", "", "Rules")}
      <p class="lead-p">${esc(rb.intro || "")}</p>
      <div class="rules"><nav class="card rules-toc">${rb.articles.map((a) => `<a href="#article-${a.num}"><span>${a.num}</span>${esc(a.title)}</a>`).join("")}</nav>
      <div>${rb.articles.map((a) => `<section class="card rule-art" id="article-${a.num}"><header><span class="rule-num">${a.num}</span><h2>${esc(a.title)}</h2></header><div class="rule-text">${md(a.body)}</div></section>`).join("")}</div></div>`);
  }
  function notFound() {
    return page(`${head("404", "Off the <span>field</span>", "", "404")}${empty("Page not found", "That page doesn't exist, or its stats haven't been posted yet.", { join: false })}<p class="center"><a class="btn" href="/" data-link>Back to home</a></p>`);
  }

  // ---------------------------------------------------------------- router
  const routes = [
    [/^\/$/, homePage, "home"],
    [/^\/scores\/?$/, scoresPage, "scores"],
    [/^\/game\/(\d+)\/?$/, (m) => gamePage(m[1]), "scores"],
    [/^\/(standings|rankings)\/?$/, standingsPage, "standings"],
    [/^\/stats\/?$/, () => statsPage(D.tabs[0] && D.tabs[0].key), "stats"],
    [/^\/stats\/([a-z]+)\/?$/, (m) => statsPage(m[1]), "stats"],
    [/^\/player\/([^/]+)\/?$/, (m) => playerPage(m[1]), "stats"],
    [/^\/teams\/?$/, teamsPage, "teams"],
    [/^\/team\/([^/]+)\/?$/, (m) => teamPage(m[1]), "teams"],
    [/^\/(mvp|heisman)\/?$/, mvpPage, "mvp"],
    [/^\/awards\/?$/, awardsPage, "awards"],
    [/^\/records\/?$/, recordsPage, "records"],
    [/^\/points\/?$/, pointsPage, "points"],
    [/^\/(rules|rulebook)\/?$/, rulesPage, "rules"],
  ];
  let section = null;
  function render(keepScroll) {
    if (!D) return;
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
    document.title = h && section !== "home" ? `${h.textContent.trim().replace(/\s+/g, " ")} · RUFL` : "RUFL · Ultimate Football League";
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
    $$("[data-view]", app).forEach((b) => b.addEventListener("click", () => { state.view = b.dataset.view; history.replaceState({}, "", "/standings" + (b.dataset.view === "conf" ? "" : "?view=" + b.dataset.view)); render(true); }));
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
    fetch(`https://discord.com/api/v9/invites/${encodeURIComponent(code)}?with_counts=true`)
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
  const nav = $("#nav"), burger = $("#burger"), links = $("#links"), moreBtn = $("#moreBtn");
  function navState() {
    nav.classList.toggle("solid", scrollY > 30 || section !== "home");
    document.body.classList.toggle("strip-on", section === "home" && scrollY > innerHeight * 0.75);
  }
  addEventListener("scroll", () => {
    navState();
    if (reduce || section !== "home") return;
    const bg = $("#heroBg"), lg = $("#heroLogo");
    if (!bg) return;
    const y = Math.min(scrollY, innerHeight);
    bg.style.transform = `translateY(${y * 0.25}px) scale(1.08)`;
    if (lg) lg.parentElement.style.transform = `translateY(${y * -0.12}px)`;
  }, { passive: true });
  function closeMenus() {
    burger.setAttribute("aria-expanded", "false"); links.classList.remove("open"); document.body.classList.remove("menu-open");
    moreBtn.setAttribute("aria-expanded", "false");
  }
  burger.addEventListener("click", () => {
    const open = burger.getAttribute("aria-expanded") !== "true";
    burger.setAttribute("aria-expanded", open); links.classList.toggle("open", open); document.body.classList.toggle("menu-open", open);
  });
  moreBtn.addEventListener("click", (e) => { e.stopPropagation(); moreBtn.setAttribute("aria-expanded", moreBtn.getAttribute("aria-expanded") !== "true"); });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".more")) moreBtn.setAttribute("aria-expanded", "false");
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
      .map(([k, p]) => ({ href: playerHref(k), html: `${hs(k, p.name, "sm")}<span><b>${esc(p.name)}</b><small>${esc(p.team || "Free agent")} · ${fmt(p.pts)} PTS</small></span>` }));
    const pages = [["/scores", "Scores"], ["/standings", "Standings"], ["/stats", "Stat leaders"], ["/mvp", "MVP race"], ["/awards", "Weekly awards"], ["/records", "Record book"], ["/points", "How PTS work"]]
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
