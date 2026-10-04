// Editing points of interest (GM): a banner while edit mode is on, a quick menu when a plain
// building or empty map is clicked, and the editor docked beside the sidebar for labels, points
// of interest and safe havens. Design: tools/mockups/ui-mockup.html.

const CLICK_PX = 6;
const CLICK_MS = 500;
const NEIGHBOUR_METRES = 80;
const SHOW = { label: "label", gold: "gold", haven: "haven" };
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const MODEL_NAMES = { "old-north-church": "Old North Church", "uss-constitution": "USS Constitution", "wtc-twin-towers": "World Trade Center towers" };

export class PoiEditor {
  /** places: PlaceStore; landmarks: LandmarkStore; search: SearchData; card: HoverCard; api: lat/lon <-> scene. */
  constructor({ places, landmarks, search, card, api }) {
    Object.assign(this, { places, landmarks, search, card, api });
    this.layer = null;
    this.editing = false;
    this.click = null;
    this.banner = null;
    this.menu = null;
    this.panel = null;
    this.poi = null;
    this.moving = false;
    this.onDown = (e) => this.#down(e);
    this.onUp = (e) => this.#up(e);
    this.onKey = (e) => this.#key(e);
  }

  attach(layer) {
    this.detach();
    this.layer = layer;
    canvas.stage.on("pointerdown", this.onDown);
    canvas.stage.on("pointerup", this.onUp);
    if (this.editing) this.#showBanner();
  }

  detach() {
    canvas?.stage?.off("pointerdown", this.onDown);
    canvas?.stage?.off("pointerup", this.onUp);
    this.#closeMenu();
    this.#closePanel();
    this.banner?.remove();
    this.banner = null;
    this.layer = null;
  }

  setEditing(editing) {
    this.editing = editing;
    this.layer?.setEditing(editing);
    this.card.hide();
    if (editing) {
      this.#showBanner();
      document.addEventListener("keydown", this.onKey, true);
    } else {
      this.#closeMenu();
      this.#closePanel();
      this.banner?.remove();
      this.banner = null;
      document.removeEventListener("keydown", this.onKey, true);
    }
    // Keep the sidebar toggle in step when edit mode ends from here (Done or Esc).
    const tool = ui.controls?.controls?.notes?.tools?.kgCitiesEdit;
    if (tool) tool.active = editing;
    ui.controls?.render();
  }

  /* ---------------------------------------- */
  /*  Banner and keys                          */
  /* ---------------------------------------- */

  #showBanner() {
    if (this.banner || !this.layer) return;
    this.banner = document.createElement("div");
    this.banner.className = "kgc-ui kgc-panel kgc-banner";
    this.banner.innerHTML = `<span class="dot"></span><b>Editing points of interest</b>
      <span class="hint">Click a <b>label</b>, <b>landmark</b> or <b>building</b> · <b>Shift</b>-click for a pin</span>
      <button type="button" class="btn pill primary">Done <span class="kbd">Esc</span></button>`;
    this.banner.querySelector("button").addEventListener("click", () => this.setEditing(false));
    document.body.append(this.banner);
  }

  /** Esc closes the menu, then the editor, then edit mode; 1-3 pick from the quick menu. */
  #key(e) {
    const typing = e.target instanceof HTMLElement && e.target.matches("input, textarea, select");
    if (e.key === "Escape") {
      if (this.moving) { this.moving = false; this.#syncMove(); }
      else if (this.menu) this.#closeMenu();
      else if (this.panel) this.#closePanel();
      else this.setEditing(false);
      e.preventDefault(); e.stopPropagation();
      return;
    }
    if (this.menu && !typing) {
      const item = this.menu.querySelector(`[data-key="${e.key}"]`);
      if (item) { item.click(); e.preventDefault(); e.stopPropagation(); }
    }
  }

  /* ---------------------------------------- */
  /*  Clicks                                   */
  /* ---------------------------------------- */

  #down(event) {
    if (event.button !== 0 || !this.editing) return;
    this.click = { x: event.global.x, y: event.global.y, t: Date.now() };
  }

  #up(event) {
    const c = this.click;
    this.click = null;
    if (!c || !this.layer || !this.editing) return;
    if (Math.hypot(event.global.x - c.x, event.global.y - c.y) > CLICK_PX || Date.now() - c.t > CLICK_MS) return;
    const at = event.getLocalPosition(canvas.stage);
    if (this.moving) return this.#moveTo(at, { shift: event.shiftKey });
    this.#closeMenu();
    const target = this.#resolve(at, { shift: event.shiftKey });
    if (!target) return;
    if (target.lm || target.place) return this.open(target);
    this.#showMenu(target, event.global);
  }

  /** What a click means: a landmark, a label, or a new POI on a building or a spot. */
  #resolve(at, { shift }) {
    const lmId = this.layer.landmarkAt(at);
    const lm = lmId ? this.landmarks.get(lmId) : null;
    if (lm) return { lm, place: this.#placeFor(lm) };
    const placeId = this.layer.placeAt(at);
    const place = placeId ? this.places.byId.get(placeId) : null;
    if (place) return { place, lm: this.#landmarkFor(place) };
    const ll = this.api.sceneToLatLon(at.x, at.y);
    if (!ll) return null;
    const building = shift ? null : this.layer.buildingAt(at);
    return { lat: ll.lat, lon: ll.lon, building, neighbours: building ? this.#neighbours(at, building) : [] };
  }

  #placeFor(lm) {
    const id = lm.placeId ?? this.places.covers.get(lm.id);
    return id ? this.places.byId.get(id) ?? null : null;
  }

  #landmarkFor(place) {
    for (const [lmId, pid] of this.places.covers) {
      if (pid === place.id) return this.landmarks.get(lmId);
    }
    return this.landmarks.list.find((l) => l.placeId === place.id) ?? null;
  }

  #neighbours(at, building) {
    return this.layer.buildingsNear(at, NEIGHBOUR_METRES).filter((b) => b.id !== building.id);
  }

  /** The building under a place, so a label can become a lit building. */
  #buildingUnder(lat, lon) {
    const at = this.api.latLonToScene(lat, lon);
    const building = at ? this.layer?.buildingAt(at) : null;
    return building ? { building, neighbours: this.#neighbours(at, building) } : { building: null, neighbours: [] };
  }

  /* ---------------------------------------- */
  /*  Quick menu                               */
  /* ---------------------------------------- */

  #showMenu(target, global) {
    const b = target.building;
    const floors = b?.h ? Math.max(1, Math.round(b.h / 3.5)) : null;
    this.menu = document.createElement("div");
    this.menu.className = "kgc-ui kgc-panel kgc-menu";
    this.menu.innerHTML = `
      <div class="head"><b>${b ? "A building" : "A spot on the map"}</b>${b ? (floors ? `${floors} floor${floors === 1 ? "" : "s"}, about ${Math.round(b.h * 3.28084)} ft` : "height not mapped") : `${target.lat.toFixed(5)}, ${target.lon.toFixed(5)}`}</div>
      <div class="item" tabindex="0" data-key="1" data-show="gold"><i class="fa-solid fa-landmark"></i>Make a point of interest<span class="kbd k">1</span></div>
      <div class="item" tabindex="0" data-key="2" data-show="haven"><i class="fa-solid fa-house-chimney"></i>Make a safe haven<span class="kbd k">2</span></div>
      <div class="item" tabindex="0" data-key="3" data-show="label"><i class="fa-solid fa-tag"></i>Add a label here<span class="kbd k">3</span></div>
      ${b ? `<hr><div class="item" tabindex="0" data-key="4" data-show="gold" data-pin="1"><i class="fa-solid fa-location-pin"></i>Drop a pin instead<span class="kbd k">4</span></div>` : ""}`;
    document.body.append(this.menu);
    const rect = canvas.app.view.getBoundingClientRect();
    const w = this.menu.offsetWidth, h = this.menu.offsetHeight;
    let left = rect.left + global.x + 12, top = rect.top + global.y + 12;
    if (left + w > window.innerWidth - 8) left = rect.left + global.x - w - 12;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    Object.assign(this.menu.style, { left: `${left}px`, top: `${top}px` });
    this.menu.addEventListener("click", (e) => {
      const item = e.target.closest(".item");
      if (!item) return;
      const pin = !!item.dataset.pin;
      this.#closeMenu();
      this.open({ ...target, building: pin ? null : target.building, neighbours: pin ? [] : target.neighbours }, { show: item.dataset.show });
    });
  }

  #closeMenu() {
    this.menu?.remove();
    this.menu = null;
  }

  /* ---------------------------------------- */
  /*  Docked editor                            */
  /* ---------------------------------------- */

  /** Open the editor on a POI: { place, lm } to edit, or { lat, lon, building } to add (with show). */
  open({ place = null, lm = null, lat, lon, building = null, neighbours = [] }, { show = null } = {}) {
    this.card.hide();
    this.#closePanel();
    if (!lm && place) ({ building, neighbours } = this.#buildingUnder(place.lat, place.lon));
    const poi = { place, lm, lat: lm?.lat ?? place?.lat ?? lat, lon: lm?.lon ?? place?.lon ?? lon, building, neighbours };
    const footprint = !!(lm?.buildings?.length || building);
    this.poi = poi;
    this.draft = {
      show: show ?? (lm ? (lm.tone === "haven" ? SHOW.haven : SHOW.gold) : SHOW.label),
      shape: lm?.model ? `model:${lm.model}` : lm ? (lm.buildings?.length ? "building" : "pin") : footprint ? "building" : "pin",
      footprint
    };
    this.#render();
  }

  #pageOptions(selected) {
    const groups = game.journal.contents.filter((j) => j.pages.size).sort((a, b) => a.name.localeCompare(b.name))
      .map((j) => `<optgroup label="${esc(j.name)}">${j.pages.contents.sort((a, b) => a.sort - b.sort)
        .map((p) => `<option value="${p.uuid}" ${p.uuid === selected ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>`);
    return `<option value="">(no page)</option>${groups.join("")}`;
  }

  #sceneOptions(selected) {
    return `<option value="">(no scene)</option>${game.scenes.contents.sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => `<option value="${s.id}" ${s.id === selected ? "selected" : ""}>${esc(s.name)}</option>`).join("")}`;
  }

  #render() {
    const { place, lm } = this.poi;
    const d = this.draft;
    const isNew = !place && !lm;
    const name = lm?.name ?? place?.name ?? "";
    const hidden = lm ? !!lm.hidden : !!place?.hidden;
    const kinds = [...new Set(this.places.places.map((p) => p.kind))].sort();
    const origin = place && !place.gmAdded && !place.custom
      ? `Map data today: ${esc(place.base.name)} (${esc(String(place.base.kind).replace(/_/g, " "))}). Label set by: ${esc(place.why)}.`
      : place?.custom && !place.gmAdded ? "From the city's period list." : "";
    const model = lm?.model;
    const shapeRow = model
      ? `<div class="locked" data-tooltip="This is a custom model and cannot be changed."><i class="fa-solid fa-cube"></i>
          <span class="v">Custom model<small>${esc(MODEL_NAMES[model] ?? model.replace(/-/g, " "))}</small></span><i class="fa-solid fa-lock"></i></div>`
      : `<div class="shape">
          <button type="button" data-shape="building" class="${d.shape === "building" ? "on" : ""}" ${d.footprint ? "" : "disabled data-tooltip=\"No building here: click one on the map with Move\""}><i class="fa-solid fa-building"></i>Building</button>
          <button type="button" data-shape="pin" class="${d.shape === "pin" ? "on" : ""}"><i class="fa-solid fa-location-pin"></i>Pin</button></div>`;
    const right = (document.getElementById("sidebar")?.offsetWidth ?? 300) + 14;
    if (!this.panel) {
      this.panel = document.createElement("form");
      this.panel.className = "kgc-ui kgc-panel kgc-editor";
      this.panel.addEventListener("submit", (e) => { e.preventDefault(); this.#save(); });
      document.body.append(this.panel);
    }
    this.panel.style.right = `${right}px`;
    this.panel.innerHTML = `
      <div class="top">
        <div class="crumb"><span>${isNew ? "New point on the map" : lm ? (d.show === SHOW.haven ? "Safe haven" : "Point of interest") : "Map label"}</span>
          <button type="button" class="btn ghost small" data-act="close" data-tooltip="Close (Esc)"><i class="fa-solid fa-xmark"></i></button></div>
        <input class="title" name="name" value="${esc(name)}" placeholder="Name" aria-label="Name" autocomplete="off">
        <div class="where"><i class="fa-solid fa-location-dot"></i><span class="addr">${this.poi.lat.toFixed(5)}, ${this.poi.lon.toFixed(5)}</span>
          <button type="button" class="btn small" data-act="move"><i class="fa-solid fa-arrows-up-down-left-right"></i>Move</button></div>
        <div class="seg" role="radiogroup">
          <button type="button" data-show="label" class="${d.show === SHOW.label ? "on" : ""}"><i class="fa-solid fa-tag"></i>Label</button>
          <button type="button" data-show="gold" class="${d.show === SHOW.gold ? "on" : ""}"><i class="fa-solid fa-landmark"></i>Point of interest</button>
          <button type="button" data-show="haven" class="${d.show === SHOW.haven ? "on" : ""}"><i class="fa-solid fa-house-chimney"></i>Safe haven</button>
        </div>
      </div>
      <div class="scroll">
        <div class="sec poi">
          <h5>Story <span>shown on the hover card</span></h5>
          <label class="field"><i class="fa-solid fa-book-open"></i><select name="page">${this.#pageOptions(lm?.page)}</select></label>
          <div class="imgrow"><div class="thumb">${lm?.img ? "" : `<i class="fa-solid fa-image"></i>`}</div>
            <label class="field"><input name="img" value="${esc(lm?.img ?? "")}" placeholder="Image (from the page)"><button type="button" class="btn ghost small" data-act="browse" data-tooltip="Browse"><i class="fa-solid fa-folder-open"></i></button></label></div>
          <textarea name="summary" placeholder="A line or two for the hover card (from the page when blank)">${esc(lm?.summary ?? "")}</textarea>
        </div>
        <div class="sec poi">
          <h5>Scene <span>GM only</span></h5>
          <label class="field"><i class="fa-solid fa-film"></i><select name="scene">${this.#sceneOptions(lm?.scene)}</select></label>
          <p class="tip"><i class="fa-solid fa-circle-info"></i>Clicking offers you this scene to view or activate. Players still get the page.</p>
        </div>
        <div class="sec label">
          <h5>Label</h5>
          <label class="field"><i class="fa-solid fa-shapes"></i><input name="kind" list="kgc-kinds" value="${esc(place?.kind ?? "")}" placeholder="Kind (restaurant, park…), sets when it appears"><datalist id="kgc-kinds">${kinds.map((k) => `<option value="${esc(k)}">`).join("")}</datalist></label>
          <label class="field"><i class="fa-solid fa-note-sticky"></i><input name="note" value="${esc(place?.note ?? "")}" placeholder="Note (GM only)"></label>
          ${origin ? `<p class="origin">${origin}</p>` : ""}
        </div>
        <div class="sec">
          <h5>On the map</h5>
          <div class="poi">${shapeRow}
            <label class="toggle">Glow<input type="checkbox" name="glow" ${lm?.glow !== false ? "checked" : ""}></label></div>
          <label class="toggle"><span>Hidden from players<small>You still see it, struck through while editing.</small></span><input type="checkbox" name="hidden" ${hidden ? "checked" : ""}></label>
        </div>
      </div>
      <div class="bottom">
        ${isNew ? "" : `<button type="button" class="btn danger" data-act="remove" data-tooltip="Remove from the map"><i class="fa-solid fa-trash"></i></button>`}
        ${place?.edited && !place.gmAdded ? `<button type="button" class="btn ghost" data-act="undo" data-tooltip="Undo my label edit"><i class="fa-solid fa-rotate-left"></i></button>` : ""}
        <span class="grow"></span>
        <button type="button" class="btn" data-act="close">Cancel</button>
        <button type="submit" class="btn primary"><i class="fa-solid fa-floppy-disk"></i>${isNew ? "Add" : "Save"}</button>
      </div>`;
    this.#sync();
    this.#wire();
    this.search.addressAt(this.poi.lat, this.poi.lon).then((a) => {
      const el = this.panel?.querySelector(".addr");
      if (a && el) el.textContent = [a.text, a.area].filter(Boolean).join(", ");
    }).catch(() => {});
    this.#thumb();
    this.panel.querySelector(".title").focus();
  }

  /** Show the sections for the chosen kind of point. */
  #sync() {
    const label = this.draft.show === SHOW.label;
    for (const el of this.panel.querySelectorAll(".poi")) el.hidden = label;
    // A label needs a kind; a landmark made from a label keeps its label fields too.
    for (const el of this.panel.querySelectorAll(".sec.label")) el.hidden = !label && !this.poi.place;
    for (const b of this.panel.querySelectorAll(".seg button")) b.classList.toggle("on", b.dataset.show === this.draft.show);
  }

  #thumb() {
    const img = this.panel?.elements.img.value.trim();
    const thumb = this.panel?.querySelector(".thumb");
    if (!thumb) return;
    thumb.style.backgroundImage = img ? `url('${foundry.utils.getRoute(img)}')` : "";
    thumb.innerHTML = img ? "" : `<i class="fa-solid fa-image"></i>`;
  }

  #wire() {
    const form = this.panel;
    form.querySelector(".seg").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-show]");
      if (!b) return;
      this.draft.show = b.dataset.show;
      this.#sync();
    });
    form.querySelector(".shape")?.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-shape]");
      if (!b || b.disabled) return;
      this.draft.shape = b.dataset.shape;
      for (const x of form.querySelectorAll(".shape button")) x.classList.toggle("on", x === b);
    });
    form.elements.img.addEventListener("change", () => this.#thumb());
    form.elements.page.addEventListener("change", () => {
      // A page picked for a nameless point names it.
      if (!form.elements.name.value.trim()) form.elements.name.value = form.elements.page.selectedOptions[0]?.text ?? "";
    });
    form.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "close") this.#closePanel();
      else if (act === "browse") {
        new foundry.applications.apps.FilePicker.implementation({ type: "image", current: form.elements.img.value, callback: (path) => { form.elements.img.value = path; this.#thumb(); } }).render(true);
      } else if (act === "move") { this.moving = !this.moving; this.#syncMove(); }
      else if (act === "remove") this.#confirmRemove(e.target.closest("[data-act]"));
      else if (act === "confirm-remove") await this.#remove();
      else if (act === "undo") {
        const place = this.poi.place;
        await this.places.save((x) => { delete x.edits[place.id]; if (place.editKey) delete x.edits[place.editKey]; });
        this.#closePanel();
      }
    });
  }

  #syncMove() {
    const b = this.panel?.querySelector('[data-act="move"]');
    if (b) b.classList.toggle("primary", this.moving);
    if (this.banner) this.banner.querySelector(".hint").innerHTML = this.moving
      ? "Click the map where it goes · a building takes the point onto it · <b>Shift</b> for a spot"
      : "Click a <b>label</b>, <b>landmark</b> or <b>building</b> · <b>Shift</b>-click for a pin";
  }

  /** Move: the point (and its building, unless shift) to where the GM clicked. */
  #moveTo(at, { shift }) {
    this.moving = false;
    this.#syncMove();
    const ll = this.api.sceneToLatLon(at.x, at.y);
    if (!ll || !this.poi) return;
    const building = shift ? null : this.layer.buildingAt(at);
    Object.assign(this.poi, { lat: ll.lat, lon: ll.lon, building, neighbours: building ? this.#neighbours(at, building) : [], moved: true });
    this.draft.footprint = !!building;
    this.draft.shape = building ? "building" : "pin";
    // Keep what was typed: re-render from the current form values.
    const keep = this.#read();
    this.#render();
    for (const [k, v] of Object.entries(keep)) {
      const el = this.panel.elements[k];
      if (!el) continue;
      if (el.type === "checkbox") el.checked = !!v; else if (v != null) el.value = v;
    }
    this.#thumb();
  }

  #confirmRemove(button) {
    const what = esc(this.poi.lm?.name ?? this.poi.place?.name);
    const keepsLabel = this.poi.place && !this.poi.place.gmAdded;
    button.outerHTML = `<span class="confirm"><i class="fa-solid fa-triangle-exclamation"></i>Remove ${what}?${keepsLabel ? " (its label is hidden)" : ""}
      <button type="button" class="btn danger small" data-act="confirm-remove">Remove</button></span>`;
  }

  #closePanel() {
    this.moving = false;
    this.#syncMove();
    this.panel?.remove();
    this.panel = null;
    this.poi = null;
  }

  #read() {
    const f = this.panel.elements;
    return {
      name: f.name.value.trim(), show: this.draft.show, kind: f.kind.value.trim(), hidden: f.hidden.checked,
      note: f.note.value.trim(), page: f.page.value || null, scene: f.scene.value || null,
      img: f.img.value.trim() || null, summary: f.summary.value.trim() || null,
      shape: this.poi.lm?.model ? `model:${this.poi.lm.model}` : this.draft.shape, glow: f.glow.checked
    };
  }

  /* ---------------------------------------- */
  /*  Saving                                   */
  /* ---------------------------------------- */

  async #save() {
    const v = this.#read();
    const poi = this.poi;
    this.#closePanel();
    let { place, lm } = poi;
    const asLabel = v.show === SHOW.label;
    const name = v.name || lm?.name || place?.name || (asLabel ? "Place" : "Landmark");

    // The label: kept in step with the name, or made when a landmark becomes a plain label.
    if (place) {
      await this.places.save((e) => {
        // An edit found again by name moves to the place's own id.
        if (place.editKey && e.edits[place.editKey]) { e.edits[place.id] = { ...e.edits[place.editKey], ...e.edits[place.id] }; delete e.edits[place.editKey]; }
        const fields = { name, kind: v.kind || place.kind, note: v.note, ...(asLabel ? { hidden: v.hidden } : {}) };
        if (place.gmAdded) e.added[place.id] = { ...e.added[place.id], ...fields, ...(poi.moved ? { lat: +poi.lat.toFixed(6), lon: +poi.lon.toFixed(6) } : {}) };
        else if (fields.name !== place.name || fields.kind !== place.kind || fields.note !== (place.note ?? "") || (asLabel && v.hidden !== place.hidden)) {
          e.edits[place.id] = { ...e.edits[place.id], ...fields, base: place.base };
        }
      });
    } else if (asLabel) {
      const id = `gm:${foundry.utils.randomID()}`;
      await this.places.save((e) => {
        e.added[id] = { name, kind: v.kind || "attraction", lat: +poi.lat.toFixed(6), lon: +poi.lon.toFixed(6), note: v.note, hidden: v.hidden };
      });
    }

    // The landmark: gone when shown as a label, otherwise made or updated.
    const list = this.landmarks.list;
    if (asLabel) {
      if (lm) await this.landmarks.save(list.filter((l) => l.id !== lm.id), { remove: lm.id });
      return;
    }
    const base = lm ? { ...lm } : { id: `gm:${foundry.utils.randomID()}`, page: null };
    if (!lm || poi.moved) {
      Object.assign(base, { lat: +poi.lat.toFixed(6), lon: +poi.lon.toFixed(6) });
      if (poi.building) Object.assign(base, { buildings: [poi.building], neighbours: poi.neighbours });
      else { delete base.buildings; delete base.neighbours; }
      if (lm && poi.moved) base.shapeEdited = true;
    }
    const made = this.#apply(base, { ...v, name });
    if (place) made.placeId = place.id;
    await this.landmarks.save(lm ? list.map((l) => (l.id === lm.id ? made : l)) : [...list, made]);
  }

  #apply(lm, v) {
    const out = { ...lm, name: v.name, tone: v.show === SHOW.haven ? "haven" : "gold", page: v.page, scene: v.scene, img: v.img, summary: v.summary, glow: v.glow, hidden: v.hidden };
    const before = lm.model ? `model:${lm.model}` : lm.buildings?.length ? "building" : "pin";
    // A shape the GM chose by hand is kept even when the city's map data for it changes.
    if (v.shape !== before) out.shapeEdited = true;
    if (v.shape === "pin") { delete out.model; delete out.buildings; delete out.neighbours; }
    else if (v.shape.startsWith("model:")) out.model = v.shape.slice(6);
    else delete out.model;
    return out;
  }

  /** Remove the landmark, and its label too: a GM-added one is deleted, a mapped one hidden. */
  async #remove() {
    const { place, lm } = this.poi;
    this.#closePanel();
    if (place) {
      await this.places.save((e) => {
        if (place.gmAdded) delete e.added[place.id];
        else e.edits[place.id] = { ...e.edits[place.id], hidden: true, base: place.base };
      });
    }
    if (lm) await this.landmarks.save(this.landmarks.list.filter((l) => l.id !== lm.id), { remove: lm.id });
  }
}
