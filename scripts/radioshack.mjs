// Radio Shack: one Item Piles shop every Radio Shack on the map opens, stocked from Radio Shack's
// 1987 catalog (No. 406, in the stores from fall 1986), at its prices, or the 1986 catalog's where
// the 1987 one gives them ("Was $79.95 in 1986 catalog"). Things sold in pairs are sold singly at
// half the pair's price, so each can be handed to someone.
//
// Prices are in coins as pennies (cp), nickels (sp), dimes (ep), quarters (gp) and dollars (pp):
// the world's own currencies (Custom D&D 5e, Item Piles) say what they are worth and show them.
//
// Every item is also scrap for crafting later: flags.kg-cities.scrap { kind: "electronics", value }
// (1 per $10 of its price, at least 1). Anything that sends or receives over the air carries
// flags.kg-cities.radio { range, cityRange (miles: in the open, and between city buildings),
// channels, transmits, receives, via? }, for a radio feature to read if one is ever built.

const ID = "kg-cities";
const IMG = (k) => `modules/${ID}/assets/shops/${k}.svg`;
export const SHOP_ICON = IMG("radio-shack");

/** Radio data: miles in the open and among buildings, channels, sends and/or receives. */
const radio = (range, cityRange, channels, transmits, receives, via = null) => ({ range, cityRange, channels, transmits, receives, ...(via ? { via } : {}) });

/** [section, [{ name, price (dollars), pic, weight (lb), text, radio? }]]. */
export const CATALOG = [
  ["Computers", [
    { name: "Tandy 1000 EX personal computer", price: 799, pic: "computer", weight: 12, text: "A desktop computer, IBM PC compatible, with one 5¼-inch floppy drive and 256K of memory. Runs MS-DOS programs: writing, spreadsheets, record keeping, games, BASIC. Needs a monitor (or a TV with an adapter) and wall power. With a modem it can dial other computers." },
    { name: "Tandy CM-5 color monitor", price: 299.95, pic: "computer", weight: 25, text: "A 13-inch color screen for the Tandy 1000. Wall power." },
    { name: "TRS-80 Color Computer 3", price: 219.95, pic: "computer", weight: 4, text: "A home computer that plugs into any TV. Games on plug-in cartridges, programs in BASIC, saved to cassette tape or a disk drive (extra)." },
    { name: "Tandy 102 portable computer", price: 499, pic: "computer", weight: 3, text: "A laptop the size of a notebook, with an 8-line screen and a full keyboard. Runs about 20 hours on four AA batteries. Writes, keeps addresses and a schedule, and has a built-in modem: plug it into a phone jack, or into any handset with an acoustic coupler, to send text to another computer." },
    { name: "Tandy DMP 130 printer", price: 349.95, pic: "computer", weight: 11, text: "A dot-matrix printer for either computer, about 100 characters a second on tractor-feed paper. Wall power." },
    { name: "Modem DCM-3, 300 baud", price: 59.95, pic: "phone", weight: 1, text: "Connects a computer to a phone jack to call another computer: bulletin boards, CompuServe, an office mainframe, if you have the number and the password. About a page of text a minute." },
    { name: "Modem DCM-212, 1200 baud", price: 199.95, pic: "phone", weight: 1, text: "A faster modem that dials by itself: about four pages of text a minute. Plugs into a phone jack." },
    { name: "Acoustic coupler AC-4", price: 199.95, pic: "phone", weight: 2, text: "Rubber cups that grip any telephone handset, a payphone's or a hotel room's, so a computer can call out where there is no jack. 300 baud; noise in the room garbles it." }
  ]],
  ["Phones and recording", [
    { name: "Duofone ET-393 cordless phone", price: 79.95, pic: "phone", weight: 2, text: "A phone you carry around the house and yard, a few hundred feet from its base, which plugs into a phone jack. Not private: a scanner, or another cordless phone nearby, can pick up both sides of a call.", radio: radio(0.1, 0.05, 1, true, true) },
    { name: "Duofone TAD-242 phone and answering machine", price: 89.95, pic: "phone", weight: 3, text: "A telephone that answers its own line with a recorded greeting and tapes the caller's message. The messages are played back on the machine itself." },
    { name: "Duofone TAD-250 remote answering machine", price: 199.95, pic: "phone", weight: 3, text: "Answers the line and records messages, and can be checked from any other phone with its pocket remote: call home, beep it, hear your messages. Also records both sides of a call at the push of a button." },
    { name: "Telephone recording control", price: 19.95, pic: "cable", weight: 0.2, text: "Goes between a phone jack and a cassette recorder. When anyone on that line picks up, the recorder starts and tapes both sides of the call, and stops at hang-up. No beep. Needs a recorder and a tape." },
    { name: "Telephone pickup coil", price: 1.99, pic: "cable", weight: 0.1, text: "A suction cup that sticks on any telephone handset and plugs into a recorder, to tape a call from that phone, a payphone's included. The far side is fainter than the near side." },
    { name: "Realistic Micro-18 microcassette recorder", price: 49.95, pic: "tape", weight: 0.5, text: "A pocket recorder with a built-in microphone. Voice-activated: it records only while someone talks, up to three hours on one tape at slow speed. Picks up a conversation across a table or a small room." },
    { name: "MC-60 microcassette", price: 3.49, pic: "tape", weight: 0.1, text: "One hour of recording, two at slow speed." },
    { name: "Wireless FM tie-clip mike", price: 19.95, pic: "radio", weight: 0.1, text: "A microphone the size of a matchbox that sends what it hears to any FM radio tuned to its frequency, up to 250 feet away (less through walls). Runs about a day on its battery. Anyone else tuned to that frequency hears it too.", radio: radio(0.05, 0.03, 1, true, false) },
    { name: "Electret tie-clip mike", price: 14.95, pic: "radio", weight: 0.1, text: "A tiny wired microphone that clips behind a tie or a lapel, with a cord to a recorder in a pocket." }
  ]],
  ["Radio", [
    { name: "Realistic PRO-2004 scanner", price: 399.95, pic: "radio", weight: 6, text: "Listens only, never sends. Holds 300 channels and steps through them, stopping on any that is talking: police, fire, ambulances, taxis, the airport tower, CB radios, walkie-talkies, cordless and car phones. Police and fire dispatch carry across the city; a walkie-talkie or a cordless phone only from nearby. Wall power or a car's.", radio: radio(25, 10, 300, false, true) },
    { name: "Realistic PRO-31 hand-held scanner", price: 219.95, pic: "radio", weight: 1, text: "A pocket scanner that listens to 10 channels you key in: police, fire, ambulances, taxis and the rest. Earphone jack for listening quietly. Runs about a day on AA batteries.", radio: radio(15, 5, 10, false, true) },
    { name: "Realistic PRO-26 crystal scanner", price: 99.95, pic: "radio", weight: 1, text: "A pocket scanner for 4 channels, each needing its own crystal ($4.98 at the counter) cut for one frequency: pick the four that matter, such as the local police dispatch.", radio: radio(15, 5, 4, false, true) },
    { name: "Police Call radio guide", price: 6.95, pic: "book", weight: 0.5, text: "Every police, fire, ambulance and emergency frequency in the region, by town, so you know what to tune a scanner to." },
    { name: "Realistic TRC-217 walkie-talkie, 40 channels", price: 99.95, pic: "radio", weight: 2, text: "A 5-watt CB walkie-talkie on all 40 channels. Reaches another CB on the same channel about 2 miles in the open, half a mile between city buildings, not from underground. Push to talk, one voice at a time. Any CB or scanner on the channel hears everything. Runs about a day on AA batteries.", radio: radio(2, 0.5, 40, true, true) },
    { name: "Realistic TRC-218 walkie-talkie, 3 channels", price: 49.95, pic: "radio", weight: 2, text: "A 2-watt CB walkie-talkie set to channel 14 (two more channels with crystals from the counter). Reaches another on its channel about a mile in the open, a quarter mile between buildings. Push to talk. Any CB or scanner on the channel hears it. Runs about a day on AA batteries.", radio: radio(1, 0.25, 3, true, true) },
    { name: "Realistic TRC-500 headset walkie-talkie", price: 39.98, pic: "radio", weight: 1, text: "A hands-free radio headset, sold singly ($79.95 a pair). Voice-activated: talk and the other headset hears you, up to half a mile outdoors or a quarter mile indoors. Only talks to another TRC-500; a scanner can hear it. Runs about a day on a 9-volt battery.", radio: radio(0.5, 0.25, 1, true, true) },
    { name: "Realistic TRC-412 road emergency CB", price: 79.95, pic: "radio", weight: 3, text: "A complete car CB on all 40 channels: plug it into the cigarette lighter and set the magnet antenna on the roof. Reaches about 5 miles on the highway, a mile in the city. Channel 9 is emergencies; truckers on 19 know what is on the road. Stores in its case under a seat.", radio: radio(5, 1, 40, true, true) },
    { name: "Realistic DX-360 shortwave receiver", price: 79.95, pic: "radio", weight: 2, text: "Listens only: AM, FM and six shortwave bands. At night it picks up stations from around the world (the BBC, Voice of America, Radio Moscow, odd voices reading numbers). AA batteries or wall power.", radio: radio(5000, 5000, 9, false, true) },
    { name: "Road Patrol XK radar detector", price: 99.95, pic: "alarm", weight: 1, text: "Mounts on a dashboard or visor and plugs into the cigarette lighter. Beeps when a police radar gun is in use ahead, up to a mile or more on the highway, less in the city." }
  ]],
  ["Sound and video", [
    { name: "Realistic SCP-20 personal stereo cassette player", price: 39.95, pic: "tape", weight: 0.5, text: "A belt-clip tape player with headphones and an equalizer. Plays, does not record. Runs about a day on AA batteries." },
    { name: "Realistic SCR-19 AM/FM cassette boombox", price: 119.95, pic: "radio", weight: 9, text: "Six speakers, loud. Plays tapes and the radio, and records from the radio or its built-in microphones. About a day on C batteries, or wall power." },
    { name: "Nova-34 headphones", price: 4.95, pic: "radio", weight: 0.1, text: "Lightweight stereo headphones for any player or radio." },
    { name: "Realistic audio cassettes, 3 pack", price: 3.59, pic: "tape", weight: 0.3, text: "Three C-90 tapes, 90 minutes each." },
    { name: "Supertape VHS T-120", price: 7.99, pic: "tape", weight: 0.5, text: "A videotape: 2 hours at standard speed, 6 at slow." },
    { name: "Pocketvision color LCD TV", price: 199.95, pic: "computer", weight: 1, text: "A pocket TV with a 2.6-inch color screen that picks up broadcast stations, and plays a camcorder's or a VCR's video through its input. A few hours on AA batteries." }
  ]],
  ["Security", [
    { name: "Ultrasonic motion alarm", price: 59.95, pic: "alarm", weight: 3, text: "Plugs into a wall outlet and watches a 20 by 30 foot room. Anyone moving through it sets off a loud siren, at once or after an entry delay. Calls no one." },
    { name: "Infrared beam alarm", price: 69.95, pic: "alarm", weight: 2, text: "Throws an invisible beam up to 50 feet across a doorway or a hall to its reflector. Anyone breaking it sets off the alarm, or a chime for customers. Calls no one." },
    { name: "Mobile Alert silent car alarm", price: 79.95, pic: "alarm", weight: 3, text: "Sensors on a car's doors, hood and trunk set off a pager in your pocket up to 2 miles away, while the car stays quiet: you know, the thief does not.", radio: radio(2, 1, 1, true, false) },
    { name: "FM wireless intercom", price: 19.98, pic: "radio", weight: 1, text: "Sold singly ($39.95 a pair). Plugs into a wall outlet and talks to another plugged in elsewhere, through the electrical wiring: no wires to run, up to about 300 feet, often into the house or apartment next door. Lock the talk bar for hands-free listening.", radio: radio(0.06, 0.06, 1, true, true, "wiring") },
    { name: "FM wireless room monitor", price: 29.95, pic: "radio", weight: 1, text: "A transmitter and a receiver that both plug into wall outlets. Everything said in the transmitter's room is heard at the receiver, through the electrical wiring, up to about 300 feet. Sold for a baby's room.", radio: radio(0.06, 0.06, 1, true, true, "wiring") }
  ]],
  ["Tools and kits", [
    { name: "Micronta pocket autoranging multimeter", price: 29.95, pic: "tool", weight: 0.5, text: "Tells whether a wire is live, a fuse is good or a battery is dead, and how much: volts, amps, ohms." },
    { name: "5-piece soldering set", price: 4.95, pic: "tool", weight: 1, text: "A 30-watt iron, stand, solder, heat sink and instructions, for repairs and building kits." },
    { name: "10-piece electronic tool set", price: 14.95, pic: "tool", weight: 2, text: "Soldering iron, stand, solder, needle-nose pliers, cutters, three screwdrivers and a heat sink." },
    { name: "Science Fair 160-in-1 electronics kit", price: 29.95, pic: "tool", weight: 3, text: "Spring-clip circuits with no soldering: build a radio, a code key, alarms, a solar circuit and 150 more. A manual for each." },
    { name: "\"D\" cell searchlight", price: 2.99, pic: "battery", weight: 1, text: "A bright flashlight on three D cells (not included)." }
  ]],
  ["Batteries and odds", [
    { name: "Alkaline AA batteries, 4 pack", price: 2.99, pic: "battery", weight: 0.2, text: "Fresh power for anything gone dead." },
    { name: "Alkaline 9-volt battery", price: 1.99, pic: "battery", weight: 0.1, text: "For the walkie-talkie headsets, the wireless mike and the pagers of the day." },
    { name: "Alkaline D batteries, 2 pack", price: 2.49, pic: "battery", weight: 0.5, text: "For flashlights and the bigger portables." },
    { name: "Statesman pocket calculator", price: 7.95, pic: "computer", weight: 0.1, text: "A thin calculator with a memory, in a billfold case." },
    { name: "Armatron robot arm", price: 29.95, pic: "toy", weight: 3, text: "A toy arm worked by two joysticks: turns, reaches and grips with rubber pincers. Lifts small things, slowly." },
    { name: "Turbo Racer radio-controlled car", price: 39.95, pic: "toy", weight: 2, text: "A toy race car steered by a two-stick remote, on 27 MHz, up to about 100 feet away." }
  ]]
];

/** The coins prices are written in, as cents: dollars (pp), quarters (gp), dimes (ep), nickels (sp), pennies (cp). */
const CENTS = [["pp", 100], ["gp", 25], ["ep", 10], ["sp", 5], ["cp", 1]];

/** A price in coins: { value, denomination }, the largest coin it is a whole number of ($19.95 is 399 nickels). */
export function priceInCoins(dollarAmount) {
  const cents = Math.round((Number(dollarAmount) || 0) * 100);
  const [denomination, value] = CENTS.find(([, v]) => cents % v === 0);
  return { value: cents / value, denomination };
}

/** Scrap for crafting: 1 per $10 of the price, at least 1. */
export const scrapValue = (dollarAmount) => Math.max(1, Math.round((Number(dollarAmount) || 0) / 10));

/** The shop's items, as item data for this system. */
export function catalogItems() {
  const dnd = game.system.id === "dnd5e";
  const type = dnd ? "loot" : (game.documentTypes?.Item ?? []).find((t) => t !== "base") ?? "base";
  return CATALOG.flatMap(([cat, list]) => list.map((it) => ({
    name: it.name, type, img: IMG(it.pic),
    system: dnd ? { description: { value: `<p>${it.text}</p>` }, price: priceInCoins(it.price), weight: { value: it.weight, units: "lb" }, quantity: 1, type: { value: "gear" } } : {},
    flags: {
      "item-piles": { item: { customCategory: cat } },
      [ID]: { radioShack: true, dollars: it.price, scrap: { kind: "electronics", value: scrapValue(it.price) }, ...(it.radio ? { radio: it.radio } : {}) }
    }
  })));
}

/**
 * Make the Radio Shack: an Item Piles shop actor with the catalog, never out of stock, that buys
 * nothing back. Returns the actor. The GM's client.
 */
export async function makeRadioShack() {
  const api = game.itempiles?.API;
  if (!game.user.isGM || !api) throw new Error("The Radio Shack needs the Item Piles module, made by the GM.");
  const made = await api.createItemPile({
    createActor: true, actor: "Radio Shack", sceneId: game.user.viewedScene ?? canvas.scene?.id ?? "",
    tokenOverrides: { actorLink: true, name: "Radio Shack", texture: { src: SHOP_ICON } },
    actorOverrides: { img: SHOP_ICON },
    folders: ["KG Cities: shops"],
    items: catalogItems(),
    itemPileFlags: {
      enabled: true, type: "merchant", merchantImage: SHOP_ICON,
      infiniteQuantity: true, purchaseOnly: true, hideItemsWithZeroCost: false,
      // Open hours are left to the GM (Item Piles' own clock follows Simple Calendar, not Calendaria).
      description: "<p>America's technology store. Parts, pieces and gadgets, and a clerk who asks for your address at the register.</p>"
    }
  });
  const shop = made?.actorUuid ? await fromUuid(made.actorUuid) : null;
  if (shop && (shop.name !== "Radio Shack" || shop.img !== SHOP_ICON)) await shop.update({ name: "Radio Shack", img: SHOP_ICON });
  // The items go on a linked actor; if this Item Piles version left them off, put them on.
  if (shop && !shop.items.size) await shop.createEmbeddedDocuments("Item", catalogItems());
  return shop;
}
