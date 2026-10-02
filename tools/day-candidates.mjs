// Toned-down day palettes for the GM to choose from (tools/preview.html?cand=<key>).
// Each overrides the colours of PALETTES.day in scripts/style.mjs.

export const DAY_CANDIDATES = {
  // A: Overcast. Warm grey, like daylight under cloud; the closest to the reference, much dimmer.
  overcast: {
    land: "#c4bfb5", water: "#86a7c4", park: "#a9bb9a", wood: "#9db08f", campus: "#bcb7b8",
    building: "#b1aa9d", buildingLine: "#9d968a",
    road: "#e1ddd4", major: "#e8e2d4", highway: "#d9c58c", casing: "#a59e91", casingOpacity: 1,
    runway: "#aaa69e", rail: "#8a867f", boundary: "#9a948a",
    label: "#2e2c29", roadLabel: "#45423d", minorLabel: "#5f5b55", waterLabel: "#3b5670", halo: "#d6d1c7",
    wallDark: "#8f887b", wallLit: "#c7c0b3", roofLow: "#bdb6a9", roofMid: "#b3ac9f", roofHigh: "#a9a295"
  },
  // B: Slate. Cool blue-grey, calm and low-contrast; sits well next to the night look.
  slate: {
    land: "#a9b2bb", water: "#6f8fae", park: "#93a98f", wood: "#869c84", campus: "#a3a8b4",
    building: "#97a0aa", buildingLine: "#838c96",
    road: "#cfd5db", major: "#d9dde1", highway: "#c9bf9a", casing: "#88919b", casingOpacity: 1,
    runway: "#98a0a8", rail: "#727a83", boundary: "#7e8791",
    label: "#1f262d", roadLabel: "#323a42", minorLabel: "#4b545d", waterLabel: "#2c4763", halo: "#bcc4cc",
    wallDark: "#76808a", wallLit: "#aab3bc", roofLow: "#a0a9b2", roofMid: "#97a0a9", roofHigh: "#8d96a0"
  },
  // C: Parchment. An old printed street atlas: tan land, muted sage parks, faded blue water.
  parchment: {
    land: "#cbbfa5", water: "#8ea9b8", park: "#aab48e", wood: "#9ba783", campus: "#c4b9a6",
    building: "#b8ab92", buildingLine: "#a39680",
    road: "#e4dac6", major: "#ebdfc5", highway: "#d8b878", casing: "#a6987f", casingOpacity: 1,
    runway: "#b0a68f", rail: "#8b806d", boundary: "#9a8d77",
    label: "#3a3024", roadLabel: "#4d4234", minorLabel: "#66594a", waterLabel: "#3f5868", halo: "#d8ccb3",
    wallDark: "#958771", wallLit: "#cbbea6", roofLow: "#c1b49b", roofMid: "#b7aa91", roofHigh: "#ad9f87"
  },
  // E: Retro (Snazzy Maps "Retro" as it renders): pale grey land, roads as dark navy lines,
  // green parks, blue water. Dark text with a pale outline; dark building edges; leaning walls
  // in clear shadow against light roofs.
  retro: {
    land: "#d0d3d4", water: "#6f93b4", park: "#86c197", wood: "#78b289", campus: "#c9ccd1",
    building: "#c2c6ca", buildingLine: "#7c8591",
    road: "#62709d", major: "#4a5a8e", highway: "#394880", casing: "#d0d3d4", casingOpacity: 0,
    runway: "#8e97ad", rail: "#3f518c", boundary: "#8f96a0",
    label: "#11162a", roadLabel: "#18203d", minorLabel: "#262f4c", waterLabel: "#1c3550", halo: "#f1f3f4",
    transit: "#3f518c",
    wallDark: "#6b737d", wallLit: "#a4acb4", roofLow: "#d6dadd", roofMid: "#ced3d7", roofHigh: "#c5cbd0"
  },
  // F: Retro, dim. The same a step darker, for long sessions in Foundry's dark interface.
  retroDim: {
    land: "#b1b6b9", water: "#56789b", park: "#6fa47f", wood: "#639872", campus: "#aab0b6",
    building: "#a3a9ae", buildingLine: "#646d78",
    road: "#4f5d8a", major: "#3d4c7d", highway: "#2f3d6e", casing: "#b1b6b9", casingOpacity: 0,
    runway: "#76809a", rail: "#33447a", boundary: "#79808b",
    label: "#0b0f1e", roadLabel: "#121931", minorLabel: "#1f2740", waterLabel: "#132a40", halo: "#dde1e3",
    transit: "#33447a",
    wallDark: "#565e68", wallLit: "#8b939b", roofLow: "#b9bfc3", roofMid: "#b1b7bc", roofHigh: "#a8afb5"
  },
  // G: Retro, bold. The brightest ground with the strongest lines: black text, near-black
  // building edges and deep shadows, for readability over everything else.
  retroBold: {
    land: "#d8dbdc", water: "#5f88b0", park: "#7cbd8f", wood: "#6dad80", campus: "#cfd2d7",
    building: "#c7cbcf", buildingLine: "#4f5864",
    road: "#55649a", major: "#3c4c88", highway: "#2a3a78", casing: "#d8dbdc", casingOpacity: 0,
    runway: "#7f89a3", rail: "#2f4184", boundary: "#7a828e",
    label: "#05070f", roadLabel: "#0c1228", minorLabel: "#1a2238", waterLabel: "#0f2a48", halo: "#ffffff",
    transit: "#2f4184",
    wallDark: "#4f5761", wallLit: "#8f98a2", roofLow: "#dfe2e4", roofMid: "#d6dade", roofHigh: "#ccd1d6"
  },  // H: Retro, final candidate. G's black text, dark edges and deep shadows on ground toned down
  // to the original's brightness, with the original's teal water.
  retroH: {
    land: "#c4c8ca", water: "#6c978b", park: "#79b48a", wood: "#6ca77d", campus: "#bcc0c6",
    building: "#b8bdc1", buildingLine: "#4f5864",
    road: "#55649a", major: "#3c4c88", highway: "#2a3a78", casing: "#c4c8ca", casingOpacity: 0,
    runway: "#7f89a3", rail: "#2f4184", boundary: "#7a828e",
    label: "#05070f", roadLabel: "#0c1228", minorLabel: "#1a2238", waterLabel: "#123a32", halo: "#eef0f1",
    transit: "#2f4184",
    wallDark: "#4f5761", wallLit: "#8a939c", roofLow: "#cfd3d6", roofMid: "#c7cbcf", roofHigh: "#bec3c8"
  },
  // D: Dusk daylight. Mid-tone, the night map's structure lifted toward day: easiest on the eyes
  // in a dark Foundry interface, light labels on darker ground.
  dusk: {
    land: "#4f5d6e", water: "#2f4a68", park: "#4f6e63", wood: "#476457", campus: "#56607a",
    building: "#5d6b7c", buildingLine: "#6f7d8e",
    road: "#7c8a9b", major: "#8b99aa", highway: "#a89a74", casing: "#3f4b59", casingOpacity: 1,
    runway: "#76869a", rail: "#6a7787", boundary: "#7b8899",
    label: "#eef2f6", roadLabel: "#d3dbe3", minorLabel: "#b4bfca", waterLabel: "#a9c2db", halo: "#3c4857",
    wallDark: "#3d4857", wallLit: "#6c7a8b", roofLow: "#65738a", roofMid: "#6f7d93", roofHigh: "#7b899f"
  }
};
