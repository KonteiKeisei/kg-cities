// Place links in any text: @CityPlace[city:id]{Name} opens that place's card (ported from KG
// Realms' @Place). Ids are stable, so renaming a place does not break its links.

export const PLACE_LINK = /@CityPlace\[([^\]\s]+)\](?:\{([^}]*)\})?/g;

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function placeTarget(ref) {
  const parts = ref?.kind === "landmark" ? [ref.city, ref.id] : null;
  if (!parts || parts.some((p) => typeof p !== "string" || !p || p.length > 256)) return null;
  return parts.map(encodeURIComponent).join(":");
}

export function placeReference(target) {
  if (typeof target !== "string" || target.length > 1600) return null;
  let parts;
  try { parts = target.split(":").map(decodeURIComponent); } catch { return null; }
  if (parts.length !== 2 || parts.some((p) => !p || p.length > 256)) return null;
  return { kind: "landmark", city: parts[0], id: parts[1] };
}

export function placeToken(ref, name) {
  const target = placeTarget(ref);
  if (!target) throw Error("Invalid place reference");
  return `@CityPlace[${target}]{${String(name ?? "Place").replace(/[{}\r\n]/g, " ")}}`;
}

/** Search the places on offer: exact, then starts with, then a word starting with, then contains. */
export function findPlaceLinks(query, entries, limit = 30) {
  const q = fold(query).trim();
  if (!q) return [];
  return entries.filter((e) => placeTarget(e.ref)).map((e) => {
    const n = fold(e.name);
    const score = n === q ? 100 : n.startsWith(q) ? 80 : n.split(/[\s'-]+/).some((w) => w.startsWith(q)) ? 60 : n.includes(q) ? 40 : fold(e.where).includes(q) ? 20 : 0;
    return { ...e, score };
  }).filter((e) => e.score).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Foundry's enrichment runs after secrets are removed. Links work in any journal or chat too. */
export function registerPlaceLinks(cards) {
  CONFIG.TextEditor.enrichers.push({
    pattern: PLACE_LINK,
    enricher: (match) => {
      const ref = placeReference(match[1]);
      if (!ref) return null;
      const a = document.createElement("a");
      a.className = "kgc-link kgc-place-link";
      a.href = "#";
      a.dataset.kgcPlace = placeTarget(ref);
      a.dataset.tooltip = "Open the place card";
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-landmark";
      a.append(icon, document.createTextNode(match[2] || "Place"));
      return a;
    }
  });
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[data-kgc-place]");
    if (!a || a.closest('prose-mirror, [contenteditable="true"]')) return;
    e.preventDefault();
    e.stopPropagation();
    const ref = placeReference(a.dataset.kgcPlace);
    if (ref) cards.open(ref, { warnMissing: true }).catch((err) => {
      console.error("kg-cities | place link:", err);
      ui.notifications.warn("KG Cities: this place card could not be opened.");
    });
  });
}

/** Capture ProseMirror's view through its documented plugins event, before the element initializes. */
export function capturePlaceEditor(event, setView) {
  const Plugin = globalThis.foundry?.prosemirror?.Plugin;
  if (!Plugin) return;
  event.plugins.kgCitiesPlaceLinks = new Plugin({ view(view) {
    setView(view);
    return { destroy() { setView(null); } };
  } });
}

export function insertPlaceToken(editor, view, token, selection) {
  if (view && !view.isDestroyed) {
    const { from, to } = view.state.selection;
    view.dispatch(view.state.tr.insertText(token, from, to).scrollIntoView());
    view.focus();
    return true;
  }
  if (editor?.tagName === "TEXTAREA") {
    const { start, end } = selection ?? { start: editor.selectionStart, end: editor.selectionEnd };
    editor.setRangeText(token, start, end, "end");
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.focus();
    return true;
  }
  return false;
}
