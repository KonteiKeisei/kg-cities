const ID = "kg-cities";
const keyOf = (name) => String(name ?? "").trim().toLowerCase();

export const storeLogo = (name) => game.settings.get(ID, "storeLogos")?.[keyOf(name)] || "";

/** Match a brand across cities, including banks' standalone ATMs. Preserve every card field. */
export function withStoreLogo(cities, name, icon, actorUuid = null) {
  let updated = 0;
  const landmarks = Object.fromEntries(Object.entries(cities).map(([city, saved]) => [city, { ...saved, list: (saved?.list ?? []).map((place) => {
    if (!place.chain || (keyOf(place.bank || place.name) !== keyOf(name) && !(actorUuid && place.chainActor === actorUuid))) return place;
    updated++;
    return { ...place, icon };
  }) }]));
  return { landmarks, updated };
}

/** Save one brand's logo for existing stores, future placement, and its shared merchant. */
export async function setStoreLogo(name, path, actor = null) {
  if (!game.user.isGM) throw new Error("Only the GM can change store logos.");
  const icon = String(path ?? "").trim().replaceAll("\\", "/");
  if (!icon) throw new Error("Choose a logo image first.");
  const saved = game.settings.get(ID, "storeLogos") ?? {};
  await game.settings.set(ID, "storeLogos", { ...saved, [keyOf(name)]: icon });
  const { landmarks, updated } = withStoreLogo(game.settings.get(ID, "landmarks") ?? {}, name, icon, actor?.uuid);
  if (updated) await game.settings.set(ID, "landmarks", landmarks);
  if (actor) {
    const changes = { img: icon, "prototypeToken.texture.src": icon };
    if (actor.flags?.["item-piles"]?.data?.type === "merchant") changes["flags.item-piles.data.merchantImage"] = icon;
    await actor.update(changes);
    for (const scene of game.scenes) {
      const tokens = [...scene.tokens].filter((t) => t.actorId === actor.id).map((t) => ({ _id: t.id, "texture.src": icon }));
      if (tokens.length) await scene.updateEmbeddedDocuments("Token", tokens);
    }
  }
  return updated;
}
