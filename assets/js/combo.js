/* A designed replacement for a native <select>.

   The native element stays in the DOM and remains the source of truth — this
   only draws the view and writes back. That is what keeps main.js unaware:
   it still reads `editionInput.value` and listens for `change`, exactly as it
   did when the browser drew the control.

   Implements the ARIA combobox/listbox pattern: the button owns the focus and
   the roles, the list is never in the tab order, and every key the native
   control answered to still works — arrows, Home/End, Enter, Escape, and
   type-ahead. */

const TYPE_AHEAD_MS = 1000;
const cityOf = (item) => item.title.toLowerCase().replace(/^ddx\s+/, '');

const CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

export function combo({ select, items, labelledBy }) {
  const root = document.createElement('div');
  root.className = 'combo';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'combo__btn';
  button.setAttribute('role', 'combobox');
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  if (labelledBy) button.setAttribute('aria-labelledby', labelledBy);

  const value = document.createElement('span');
  value.className = 'combo__value';
  const chev = document.createElement('span');
  chev.className = 'combo__chev';
  chev.innerHTML = CHEVRON;
  button.append(value, chev);

  const list = document.createElement('ul');
  list.className = 'combo__list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;

  const options = items.map((item, i) => {
    const li = document.createElement('li');
    li.className = 'combo__opt';
    li.setAttribute('role', 'option');
    li.id = `${select.id}-opt-${i}`;
    li.style.setProperty('--i', i);
    li.innerHTML = `<b>${item.title}</b><em>${item.meta || ''}</em>`;
    /* The row's index is looked up at click time, never captured here: `drop`
       splices entries out of both arrays, and a handler that closed over its
       original index would then commit its neighbour — or, for the last row,
       an index past the end of the list. */
    li.addEventListener('click', () => {
      const n = options.indexOf(li);
      if (n < 0) return;
      commit(n);
      close(true);
    });
    li.addEventListener('mousemove', () => {
      const n = options.indexOf(li);
      if (n >= 0) setActive(n);
    });
    list.append(li);
    return li;
  });

  root.append(button, list);
  select.parentNode.insertBefore(root, select);
  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  let open = false;
  let active = Math.max(0, items.findIndex((it) => it.value === select.value));

  const paint = () => {
    const chosen = items.findIndex((it) => it.value === select.value);
    value.innerHTML = chosen < 0 ? '' : `<b>${items[chosen].title}</b><em>${items[chosen].meta || ''}</em>`;
    options.forEach((li, i) => {
      li.setAttribute('aria-selected', String(i === chosen));
      li.classList.toggle('is-active', i === active);
    });
    button.setAttribute('aria-activedescendant', open ? options[active]?.id || '' : '');
  };

  function setActive(i) {
    active = (i + items.length) % items.length;
    paint();
    if (open) options[active]?.scrollIntoView({ block: 'nearest' });
  }

  /* Writing to the native select and firing `change` is the whole contract with
     the rest of the app — never update the label without doing both. */
  function commit(i) {
    if (select.value === items[i].value) return paint();
    select.value = items[i].value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    paint();
  }

  function openList() {
    if (open) return;
    open = true;
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    active = Math.max(0, items.findIndex((it) => it.value === select.value));
    /* One frame between unhiding and animating, or the transition has no start
       state to move from and the panel simply appears. */
    requestAnimationFrame(() => root.classList.add('is-open'));
    paint();
    options[active]?.scrollIntoView({ block: 'nearest' });
    document.addEventListener('pointerdown', onOutside, true);
  }

  function close(refocus) {
    if (!open) return;
    open = false;
    root.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown', onOutside, true);
    /* Stay in the DOM until the closing transition finishes, so it fades out
       instead of vanishing; `hidden` is what takes it out of the tab order. */
    const done = () => { if (!open) list.hidden = true; };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else setTimeout(done, 180);
    if (refocus) button.focus();
  }

  const onOutside = (e) => { if (!root.contains(e.target)) close(false); };

  button.addEventListener('click', () => (open ? close(true) : openList()));

  let typed = '';
  let typedAt = 0;
  root.addEventListener('keydown', (e) => {
    const k = e.key;
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (k === 'Escape') { e.preventDefault(); close(true); }
    else if (k === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (k === 'Home') { e.preventDefault(); setActive(0); }
    else if (k === 'End') { e.preventDefault(); setActive(items.length - 1); }
    else if (k === 'Enter') { e.preventDefault(); commit(active); close(true); }
    else if (k === 'Tab') { close(false); }
    else if (k.length === 1) {
      /* Type-ahead: keystrokes within a second build one search string.

         Space is the awkward one. On its own it selects, like any listbox — but
         mid-search it has to be a character, or "ddx t" commits on the space and
         the t lands nowhere. Whether a search is running decides which it is. */
      const now = Date.now();
      const searching = now - typedAt <= TYPE_AHEAD_MS;
      if (k === ' ' && !searching) {
        e.preventDefault();
        commit(active);
        close(true);
        return;
      }
      if (!/\S/.test(k) && !searching) return;
      typed = searching ? typed + k : k;
      typedAt = now;
      const q = typed.toLowerCase();
      /* Every entry reads "DDX <city>", so matching the whole title would make
         the first three keystrokes meaningless. Try the city first. */
      const hit =
        items.findIndex((it) => cityOf(it).startsWith(q)) >= 0
          ? items.findIndex((it) => cityOf(it).startsWith(q))
          : items.findIndex((it) => it.title.toLowerCase().startsWith(q));
      if (hit >= 0) setActive(hit);
    }
  });

  /* Takes an entry out of the list permanently. The placeholder is the empty
     state rather than a choice — once a real edition is picked there is nothing
     to go back to, so it leaves instead of sitting there as a dead end. */
  function drop(value_) {
    const i = items.findIndex((it) => it.value === value_);
    if (i < 0) return;
    items.splice(i, 1);
    options.splice(i, 1)[0].remove();
    [...select.options].find((o) => o.value === value_)?.remove();
    options.forEach((li, n) => {
      li.id = `${select.id}-opt-${n}`;
      li.style.setProperty('--i', n);
    });
    active = Math.max(0, items.findIndex((it) => it.value === select.value));
    paint();
  }

  paint();
  /* Whether this control is the one asking to be used next. main.js owns that
     decision — the combobox has no idea what else is on the page. */
  const attention = (on) => button.classList.toggle('attention', !!on);
  return { refresh: paint, drop, attention };
}
