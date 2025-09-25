// Persisted theme toggle
    const root = document.documentElement;
    const toggle = document.getElementById('themeToggle');
    const label = document.getElementById('toggleLabel');
    const sunIcon = document.getElementById('sunIcon');

    const setTheme = (mode) => {
      root.setAttribute('data-theme', mode);
      label.textContent = mode === 'light' ? 'Light' : 'Dark';
      sunIcon.style.opacity = mode === 'light' ? 1 : 0.75;
      localStorage.setItem('pfp-theme', mode);
    };

    // Load stored theme or OS preference
    const stored = localStorage.getItem('pfp-theme');
    if (stored) setTheme(stored); else if (matchMedia && matchMedia('(prefers-color-scheme: light)').matches) setTheme('light');

    toggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      setTheme(next);
    });

    // Card hover glow follows mouse
    const moveTargets = document.querySelectorAll('[data-move]');
    moveTargets.forEach(card => {
      card.addEventListener('pointermove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mx', x + '%');
        card.style.setProperty('--my', y + '%');
      });
    });

    // FAQ accordion
    document.querySelectorAll('.faq-item').forEach(item => {
      const q = item.querySelector('.faq-q');
      q.addEventListener('click', () => {
        const open = item.classList.toggle('open');
        q.querySelector('span').textContent = open ? '–' : '+';
      });
    });

    // Year
    document.getElementById('year').textContent = new Date().getFullYear();

    // Copy buttons for deal codes
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.closest('.deal').querySelector('.code-box');
        if (!input) return;
        input.select();
        input.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(input.value).then(() => {
          const old = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => (btn.textContent = old), 1200);
        });
      });
    });




// Deal tag filter
const filterContainer = document.getElementById('deal-filters');
if (filterContainer) {
  const buttons = filterContainer.querySelectorAll('.filter-btn');
  const deals = document.querySelectorAll('.deal');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      // update active button
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tag = btn.getAttribute('data-tag');

      deals.forEach(card => {
        const pill = card.querySelector('.pill');
        const cardTag = pill ? pill.textContent.trim() : "";

        if (tag === 'all' || cardTag === tag) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}
// ============ Dynamic Tag Filters (multi-select + animated) ============
(function initDealFilters() {
  const container = document.getElementById('deal-filters');
  if (!container) return;

  const dealCards = [...document.querySelectorAll('.deal')];

  // 1) Collect unique tags from the cards' .pill elements
  const tagSet = new Set();
  dealCards.forEach(card => {
    const pills = [...card.querySelectorAll('.pill')];
    pills.forEach(p => {
      const t = (p.textContent || '').trim();
      if (t) tagSet.add(t);
    });
  });

  const tags = Array.from(tagSet).sort(); // e.g., ["CFDs", "Futures", "Software"]

  // 2) Build chips (checkbox style). "All" first, checked by default.
  container.innerHTML = '';
  const makeChip = (label, value, checked = false) => {
    const wrap = document.createElement('label');
    wrap.className = 'filter-chip' + (checked ? ' active' : '');
    wrap.innerHTML = `<input type="checkbox" value="${value}" ${checked ? 'checked' : ''}><span>${label}</span>`;
    return wrap;
  };

  const allChip = makeChip('All', '__ALL__', true);
  container.appendChild(allChip);
  tags.forEach(t => container.appendChild(makeChip(t, t, false)));

  const chips = [...container.querySelectorAll('.filter-chip')];
  const inputs = [...container.querySelectorAll('input[type="checkbox"]')];

  // 3) Filter logic (multi-select OR). "All" shows everything.
  const applyFilter = () => {
    const activeValues = inputs.filter(i => i.checked && i.value !== '__ALL__').map(i => i.value);
    const showAll = activeValues.length === 0;

    // Chip active styles
    chips.forEach(chip => {
      const input = chip.querySelector('input');
      chip.classList.toggle('active', input.checked);
    });

    dealCards.forEach(card => {
      // read tags from .pill(s) inside the card
      const pillTexts = [...card.querySelectorAll('.pill')].map(p => (p.textContent || '').trim());
      const match = showAll || pillTexts.some(t => activeValues.includes(t));

      animateToggle(card, match);
    });
  };

  // 4) Animate show/hide helpers
  const animateToggle = (el, shouldShow) => {
    if (shouldShow) {
      if (el.classList.contains('is-hidden')) {
        el.classList.remove('is-hidden');     // un-display: none
        // force reflow so the next class change animates
        void el.offsetWidth;
        el.classList.remove('is-hiding');     // animate to visible
      }
    } else {
      if (!el.classList.contains('is-hidden')) {
        el.classList.add('is-hiding');        // animate to transparent/scale
        el.addEventListener('transitionend', () => {
          el.classList.add('is-hidden');      // remove from layout after fade
        }, { once: true });
      }
    }
  };

  // 5) Events: multi-select with an "All" checkbox that behaves smartly
  container.addEventListener('change', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;

    const all = inputs.find(i => i.value === '__ALL__');

    if (target.value === '__ALL__') {
      // If "All" toggled on -> clear others
      if (all.checked) {
        inputs.forEach(i => { if (i !== all) i.checked = false; });
      } else {
        // never leave all unchecked with nothing else selected
        all.checked = true;
      }
    } else {
      // If any specific selected -> turn off "All"
      const anySpecific = inputs.some(i => i.value !== '__ALL__' && i.checked);
      all.checked = !anySpecific;
    }

    applyFilter();
  });

  // Initial state: show all
  applyFilter();
})();


// Hover glow for promo cards
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.promo-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--promo-x', `${x}%`);
      card.style.setProperty('--promo-y', `${y}%`);
    });
    card.addEventListener('mouseleave', () => {
      card.style.removeProperty('--promo-x');
      card.style.removeProperty('--promo-y');
    });
  });
});


document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('header .nav');
  const navToggle = document.getElementById('navToggle');
  const links = document.querySelectorAll('header .nav-links a');

  if (nav && navToggle) {
    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('copyCodeBtn');
  if (!btn) return;

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText('JLXTRADES');
      btn.textContent = 'Copied!';
      btn.classList.add('is-copied');
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('is-copied');
      }, 1400);
    } catch {
      // Fallback for older browsers: put code in URL hash to show somewhere if needed
    }
    // Navigate to deals (works from any page)
    const target = new URL('index.html#deals', location.href);
    location.href = target.href;
  });
});


