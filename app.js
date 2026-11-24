(() => {
  // Change this one line when the league gets a permanent invite.
  const INVITE = "Z6WvRbmyQ";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = n => Number(n).toLocaleString("en-US");

  document.querySelectorAll(".discord-link").forEach(a => (a.href = "https://discord.gg/" + INVITE));
  document.getElementById("year").textContent = new Date().getFullYear();

  // nav background + active link
  const nav = document.querySelector(".nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 30);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const links = [...document.querySelectorAll(".links a")];
  const spy = new IntersectionObserver(es => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(l => l.classList.toggle("active", l.getAttribute("href") === "#" + e.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  links.forEach(l => { const s = document.querySelector(l.getAttribute("href")); if (s) spy.observe(s); });

  // mobile menu
  const burger = document.getElementById("burger");
  const menu = document.getElementById("links");
  const setMenu = open => { burger.setAttribute("aria-expanded", open); menu.classList.toggle("open", open); };
  burger.addEventListener("click", () => setMenu(burger.getAttribute("aria-expanded") !== "true"));
  menu.addEventListener("click", e => { if (e.target.closest("a")) setMenu(false); });
  addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });

  // count-up
  const countUp = el => {
    const end = Number(el.dataset.count);
    if (!end || reduce) { el.textContent = fmt(end); return; }
    const t0 = performance.now(), dur = 1400;
    const tick = t => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(end * e));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // scroll reveal
  const io = new IntersectionObserver(es => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const sibs = [...el.parentElement.children].filter(c => c.classList.contains("reveal"));
      el.style.transitionDelay = Math.max(0, sibs.indexOf(el)) * 80 + "ms";
      el.classList.add("in");
      el.querySelectorAll("[data-count]").forEach(countUp);
      io.unobserve(el);
    });
  }, { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach(el => io.observe(el));

  // card spotlight
  document.querySelectorAll(".card").forEach(c => c.addEventListener("pointermove", e => {
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", e.clientX - r.left + "px");
    c.style.setProperty("--my", e.clientY - r.top + "px");
  }));

  // hero parallax
  if (!reduce) {
    const bg = document.getElementById("heroBg"), logo = document.getElementById("heroLogo");
    let ticking = false;
    addEventListener("scroll", () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const y = Math.min(scrollY, innerHeight);
        bg.style.transform = `translateY(${y * 0.25}px) scale(1.08)`;
        logo.parentElement.style.transform = `translateY(${y * -0.12}px)`;
        ticking = false;
      });
    }, { passive: true });
  }

  // live member counts from the public invite
  fetch(`https://discord.com/api/v9/invites/${INVITE}?with_counts=true`)
    .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(d => {
      const vals = { members: d.approximate_member_count, online: d.approximate_presence_count };
      document.querySelectorAll("[data-live]").forEach(el => {
        const v = vals[el.dataset.live];
        if (!v) return;
        if (el.dataset.count !== undefined) {
          el.dataset.count = v;
          if (el.closest(".reveal.in") || !el.closest(".reveal")) el.textContent = fmt(v);
        } else el.textContent = fmt(v);
      });
    })
    .catch(() => {});
})();
