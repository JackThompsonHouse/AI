const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mobile nav toggle
const menuToggle = document.getElementById('menuToggle');
const mobileNav = document.getElementById('mobileNav');

if (menuToggle && mobileNav) {
  menuToggle.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });

  mobileNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mobileNav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// Scroll reveal
const revealEls = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window && revealEls.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  revealEls.forEach((el) => observer.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('in-view'));
}

// Active tab tracking (editor-tab style nav)
const tabLinks = document.querySelectorAll('.tab-link');
const sectionMap = { top: 'hero', capabilities: 'capabilities', history: 'history', fix: 'fix', deploy: 'deploy' };

if ('IntersectionObserver' in window && tabLinks.length) {
  const tabObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const key = Object.keys(sectionMap).find((k) => sectionMap[k] === entry.target.id);
        tabLinks.forEach((link) => link.classList.toggle('active', link.dataset.section === key));
      });
    },
    { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
  );

  Object.values(sectionMap).forEach((id) => {
    const el = document.getElementById(id);
    if (el) tabObserver.observe(el);
  });
}

// Terminal typewriter — the hero's simulated session log
const terminalBody = document.getElementById('terminalBody');

if (terminalBody) {
  const lines = [
    { type: 'prompt', text: 'claude "rebuild this site to show what you can actually do"' },
    { type: 'blank' },
    { type: 'tool', text: '> Reading index.html, styles.css, main.js' },
    { type: 'tool', text: '> Reading git log (5 commits, 3 redeploys)' },
    { type: 'tool', text: '> Planning new information architecture' },
    { type: 'check', text: '  ✓ Hero — a real terminal, not a stock photo' },
    { type: 'check', text: '  ✓ Capabilities — demonstrated, not claimed' },
    { type: 'check', text: '  ✓ History — actual commits from this repo' },
    { type: 'check', text: '  ✓ Fix — a real diff from a real bug' },
    { type: 'tool', text: '> Writing index.html, styles.css, main.js' },
    { type: 'tool', text: '> git add -A && git commit && git push origin main' },
    { type: 'blank' },
    { type: 'ok', text: '✓ Done. Deployed to production.' },
  ];

  const appendCursor = () => {
    const cursor = document.createElement('span');
    cursor.className = 'tcursor';
    terminalBody.appendChild(cursor);
  };

  if (reducedMotion) {
    lines.forEach((line) => {
      if (line.type === 'blank') {
        terminalBody.appendChild(document.createElement('br'));
        return;
      }
      const div = document.createElement('div');
      div.className = 'tline-' + line.type;
      div.textContent = line.type === 'prompt' ? line.text : line.text;
      terminalBody.appendChild(div);
    });
    appendCursor();
  } else {
    let i = 0;
    const next = () => {
      if (i >= lines.length) {
        appendCursor();
        return;
      }
      const line = lines[i];
      i++;

      if (line.type === 'blank') {
        terminalBody.appendChild(document.createElement('br'));
        setTimeout(next, 90);
        return;
      }

      const div = document.createElement('div');
      div.className = 'tline-' + line.type;
      terminalBody.appendChild(div);

      if (line.type === 'prompt') {
        let ci = 0;
        const typeChar = () => {
          div.textContent = line.text.slice(0, ci + 1);
          ci++;
          if (ci < line.text.length) {
            setTimeout(typeChar, 20);
          } else {
            setTimeout(next, 420);
          }
        };
        typeChar();
      } else {
        div.textContent = line.text;
        setTimeout(next, line.type === 'ok' ? 260 : 110);
      }
    };
    next();
  }
}

// Footer year
const yearEl = document.getElementById('year');
if (yearEl) {
  yearEl.textContent = String(new Date().getFullYear());
}
