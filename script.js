/* ============================================================
   JUAN PABLO TORO · Portafolio
   Sin dependencias externas: tema, menú, máquina de escribir,
   reveal on scroll y resaltado del enlace activo.
============================================================ */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Tema claro / oscuro ---------- */
  var themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next = root.dataset.theme === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      localStorage.setItem("theme", next);
    });
  }

  /* Si el usuario nunca eligió tema, seguimos al sistema */
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
    if (!localStorage.getItem("theme")) root.dataset.theme = e.matches ? "dark" : "light";
  });

  /* ---------- Menú móvil ---------- */
  var navToggle = document.getElementById("navToggle");
  var navLinks = document.getElementById("navLinks");

  function setMenu(open) {
    document.body.classList.toggle("menu-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      setMenu(!document.body.classList.contains("menu-open"));
    });
    navLinks.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    document.addEventListener("click", function (e) {
      if (document.body.classList.contains("menu-open") && !e.target.closest(".nav-shell")) {
        setMenu(false);
      }
    });
    addEventListener("keydown", function (e) {
      if (e.key === "Escape") setMenu(false);
    });
  }

  /* ---------- Máquina de escribir ---------- */
  var typed = document.querySelector(".typed");
  if (typed) {
    var words;
    try {
      words = JSON.parse(typed.dataset.words);
    } catch (_) {
      words = [typed.textContent];
    }

    if (reduced || words.length < 2) {
      typed.textContent = words[0];
    } else {
      var w = 0;
      var i = 0;
      var deleting = false;

      (function step() {
        var word = words[w];
        typed.textContent = word.slice(0, i);

        var wait = deleting ? 45 : 75;

        if (!deleting && i === word.length) {
          deleting = true;
          wait = 1600;
        } else if (deleting && i === 0) {
          deleting = false;
          w = (w + 1) % words.length;
          wait = 320;
        } else {
          i += deleting ? -1 : 1;
        }

        setTimeout(step, wait);
      })();
    }
  }

  /* ---------- Reveal on scroll ---------- */
  var revealables = document.querySelectorAll(".reveal");

  function revealAll() {
    revealables.forEach(function (el) {
      el.style.transitionDelay = "";
      el.classList.add("in");
    });
  }

  if (reduced || !("IntersectionObserver" in window)) {
    revealAll();
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    /* escalona las tarjetas hermanas para que no entren todas de golpe */
    revealables.forEach(function (el) {
      var siblings = Array.prototype.filter.call(
        el.parentElement.children,
        function (c) {
          return c.classList.contains("reveal");
        }
      );
      var idx = siblings.indexOf(el);
      if (idx > 0) el.style.transitionDelay = Math.min(idx, 5) * 0.07 + "s";
      io.observe(el);
    });

    /* Red de seguridad: si el observer no llega a disparar (pestaña sin
       componer, navegador raro), el contenido no puede quedarse invisible. */
    setTimeout(function () {
      if (!document.querySelector(".reveal.in")) revealAll();
    }, 2500);
  }

  /* ---------- Enlace activo del nav ---------- */
  var sections = document.querySelectorAll("main section[id]");
  var linkFor = {};
  document.querySelectorAll("#navLinks a").forEach(function (a) {
    linkFor[a.getAttribute("href").slice(1)] = a;
  });

  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var link = linkFor[entry.target.id];
          if (!link) return;
          if (entry.isIntersecting) {
            Object.keys(linkFor).forEach(function (k) {
              linkFor[k].classList.remove("active");
            });
            link.classList.add("active");
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach(function (s) {
      spy.observe(s);
    });
  }

  /* ---------- Año del footer ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
