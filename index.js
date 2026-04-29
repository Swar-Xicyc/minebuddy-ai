const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const collectBlock = require('mineflayer-collectblock').plugin
const pvp = require('mineflayer-pvp').plugin
const net = require('net')
const Vec3 = require('vec3')

const { GoalFollow, GoalBlock } = goals

const bot = mineflayer.createBot({ host: '127.0.0.1', port: 52779, username: 'MineBuddy' })
bot.loadPlugin(pathfinder)
bot.loadPlugin(collectBlock)
bot.loadPlugin(pvp)

let idle = true
<<<<<<< Updated upstream

// ---------------- UTILS ----------------
function delayChat(msg) {
  setTimeout(() => bot.chat(msg), Math.random() * 800 + 400)
=======
let mcData = null

bot.once('spawn', () => {
  mcData = require('minecraft-data')(bot.version)
  setTimeout(() => {
    console.log(`[Init] bot.version = ${bot.version}`)
    const sword = mcData.itemsByName['wooden_sword']
    const r = sword ? bot.recipesAll(sword.id, null, null) : []
    console.log(`[Init] wooden_sword server recipes: ${r.length}`)
  }, 3000)
})

let recipesReady = false
bot.on('set_recipe', () => { recipesReady = true })
setTimeout(() => { recipesReady = true }, 5000)

// ── UTILS ──────────────────────────────────────────────────────────────────

function delayChat(msg, minMs = 400, maxMs = 1200) {
  setTimeout(() => bot.chat(msg), Math.random() * (maxMs - minMs) + minMs)
}
function humanPause(minMs = 300, maxMs = 900) {
  return new Promise(r => setTimeout(r, Math.random() * (maxMs - minMs) + minMs))
>>>>>>> Stashed changes
}
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)] }

function setupMove() {
  const md = require('minecraft-data')(bot.version)
  const mv = new Movements(bot, md)
  mv.canDig = true
  bot.pathfinder.setMovements(mv)
}
<<<<<<< Updated upstream

// ---------------- ACTIONS ----------------
function jump(times = 1) {
  idle = false
  let count = 0

  const interval = setInterval(() => {
    bot.setControlState('jump', true)
    setTimeout(() => bot.setControlState('jump', false), 300)

    count++
    if (count >= times) {
      clearInterval(interval)
      idle = true
    }
=======
async function walkTo(x, y, z, range = 1) {
  setupMove()
  await bot.pathfinder.goto(new GoalNear(x, y, z, range))
  await humanPause(200, 400)
}

// ── JUMP ───────────────────────────────────────────────────────────────────

function jump(times = 1) {
  idle = false
  let count = 0
  const iv = setInterval(() => {
    bot.setControlState('jump', true)
    setTimeout(() => bot.setControlState('jump', false), 300)
    if (++count >= times) { clearInterval(iv); idle = true }
>>>>>>> Stashed changes
  }, 700)
}

// ── FOLLOW ─────────────────────────────────────────────────────────────────

function followPlayer() {
<<<<<<< Updated upstream
  const target = bot.nearestEntity(e => e.type === 'player')
  if (!target) return delayChat("Can't see you")

=======
  const t = bot.nearestEntity(e => e.type === 'player')
  if (!t) return delayChat("Can't see you")
>>>>>>> Stashed changes
  setupMove()
  idle = false
  bot.pathfinder.setGoal(new GoalFollow(t, 2), true)
}

// ── PILLAR UP ──────────────────────────────────────────────────────────────

async function pillarUp(blocksHigh = 5) {
  idle = false

  const PRIO = [
    'cobblestone','dirt','gravel',
    'oak_planks','spruce_planks','birch_planks','jungle_planks',
    'acacia_planks','dark_oak_planks','mangrove_planks','cherry_planks',
    'stone','sand'
  ]
  let pillarItem = null
  for (const n of PRIO) {
    const d = mcData?.itemsByName[n]
    if (d && bot.inventory.count(d.id, null) > 0) {
      pillarItem = bot.inventory.items().find(i => i.name === n)
      break
    }
  }
  if (!pillarItem) { delayChat("no solid blocks to pillar with"); idle = true; return }

  delayChat(`pillaring up ${blocksHigh} with ${pillarItem.name}`)
  await humanPause(300, 500)
  try { await bot.equip(pillarItem, 'hand') } catch(e) {}

  function waitForGround(ms = 2000) {
    return new Promise(res => {
      if (bot.entity.onGround) return res()
      const t = Date.now()
      const tick = () => {
        if (bot.entity.onGround || Date.now()-t > ms) return res()
        bot.once('physicsTick', tick)
      }
      bot.once('physicsTick', tick)
    })
  }
  function waitForAirborne(ms = 600) {
    return new Promise(res => {
      if (!bot.entity.onGround) return res()
      const t = Date.now()
      const tick = () => {
        if (!bot.entity.onGround || Date.now()-t > ms) return res()
        bot.once('physicsTick', tick)
      }
      bot.once('physicsTick', tick)
    })
  }

  let placed = 0
  while (placed < blocksHigh) {
    const cur = bot.inventory.items().find(i => i.name === pillarItem.name)
    if (!cur || cur.count === 0) { delayChat(`ran out of ${pillarItem.name}`); break }

    bot.setControlState('jump', true)
    await waitForAirborne(400)
    bot.setControlState('jump', false)

    await bot.waitForTicks(2)

    const feet = bot.entity.position.floored()
    let belowBlock = null
    for (let dy = 0; dy >= -3; dy--) {
      const b = bot.blockAt(feet.offset(0, dy, 0))
      if (b && b.name !== 'air') { belowBlock = b; break }
    }

    if (belowBlock) {
      try {
        await bot.lookAt(belowBlock.position.offset(0.5, 1, 0.5))
        await bot.placeBlock(belowBlock, new Vec3(0, 1, 0))
        placed++
        console.log(`[Pillar] ${placed}/${blocksHigh}`)
      } catch(e) { console.log('[Pillar] place error:', e.message) }
    }

    await waitForGround(1500)
    await bot.waitForTicks(2)
  }

  delayChat(`went up ${placed} blocks`)
  idle = true
}

// ── COLLECT ────────────────────────────────────────────────────────────────

const ALL_LOG_TYPES = [
  'oak_log','spruce_log','birch_log','jungle_log','acacia_log',
  'dark_oak_log','mangrove_log','cherry_log','bamboo_block','crimson_stem','warped_stem'
]

const COLLECT_BLOCK_MAP = {
  'cobblestone': b => b.name === 'stone' || b.name === 'cobblestone',
  'stone':       b => b.name === 'stone' || b.name === 'cobblestone',
  'wood':        b => ALL_LOG_TYPES.includes(b.name),
  'log':         b => ALL_LOG_TYPES.includes(b.name),
  'oak_log':     b => ALL_LOG_TYPES.includes(b.name),
}

// FIX BUG 3 & 4: Equip the best tool before digging a block (pickaxe for stone,
// axe for wood, etc.). Also fixed early-exit on dig errors — now skips bad blocks
// instead of aborting the whole collect loop, so "get 5 cobblestone" works correctly.
const TOOL_PREFERENCES = {
  pickaxe: ['stone','cobblestone','granite','diorite','andesite','sandstone','iron_ore',
            'gold_ore','coal_ore','diamond_ore','emerald_ore','redstone_ore','deepslate',
            'netherrack','obsidian','blackstone','basalt','gravel'],
  axe:     ALL_LOG_TYPES.concat(['oak_planks','spruce_planks','birch_planks','jungle_planks',
            'acacia_planks','dark_oak_planks','crafting_table','chest','barrel']),
  shovel:  ['dirt','grass_block','sand','gravel','soul_sand','soul_soil','clay','snow'],
}

const TOOL_PRIO = {
  pickaxe: ['netherite_pickaxe','diamond_pickaxe','iron_pickaxe','stone_pickaxe','golden_pickaxe','wooden_pickaxe'],
  axe:     ['netherite_axe','diamond_axe','iron_axe','stone_axe','golden_axe','wooden_axe'],
  shovel:  ['netherite_shovel','diamond_shovel','iron_shovel','stone_shovel','golden_shovel','wooden_shovel'],
}

async function equipBestToolFor(blockName) {
  let toolType = null
  for (const [type, blocks] of Object.entries(TOOL_PREFERENCES)) {
    if (blocks.some(b => blockName.includes(b) || b.includes(blockName))) {
      toolType = type; break
    }
  }
  if (!toolType) return  // no preferred tool (e.g. leaves, grass)

  const prio = TOOL_PRIO[toolType] || []
  for (const toolName of prio) {
    const tool = bot.inventory.items().find(i => i.name === toolName)
    if (tool) {
      try { await bot.equip(tool, 'hand') } catch(e) {}
      return
    }
  }
  // No matching tool found — dig with whatever is in hand
}

async function collectItem(name) {
  idle = false
<<<<<<< Updated upstream

  const mcData = require('minecraft-data')(bot.version)

  let block = bot.findBlock({
    matching: (b) => b.name.includes(name),
    maxDistance: 64
  })

  if (!block) {
    delayChat("No block nearby")
    idle = true
    return
  }

  try {
    const pos = block.position

    // Move next to the block instead of ON it
    const GoalNear = require('mineflayer-pathfinder').goals.GoalNear
    await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 1))

    // Try multiple faces (THIS is the key fix)
    const directions = [
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },   // top
      { x: 0, y: -1, z: 0 }   // bottom
    ]

    let success = false

    for (let dir of directions) {
      const facePos = pos.offset(dir.x, dir.y, dir.z)

      try {
        await bot.lookAt(facePos)
        await bot.waitForTicks(5)

        await bot.dig(block)
        success = true
        break
      } catch (e) {
        // try next face
      }
    }

    if (!success) {
      delayChat("Can't reach block")
    }

  } catch (e) {
    console.log("DIG ERROR:", e.message)
    delayChat("Failed to mine")
  }

  idle = true
=======
  let collected = 0
  const matchFn = COLLECT_BLOCK_MAP[name] || (b => b.name.includes(name))

  while (collected < count) {
    const block = bot.findBlock({ matching: matchFn, maxDistance: 64 })
    if (!block) {
      delayChat(collected === 0 ? `no ${name} nearby` : `got ${collected}, couldn't find more`)
      idle = true
      return collected > 0
    }
    try {
      const pos = block.position
      await walkTo(pos.x, pos.y, pos.z, 2)

      // FIX BUG 3: Equip the right tool before digging
      await equipBestToolFor(block.name)

      await bot.lookAt(pos.offset(0.5, 0.5, 0.5))
      await humanPause(100, 250)

      const fresh = bot.blockAt(pos)
      if (!fresh || fresh.name === 'air') {
        // Block already gone (another player/physics), count it and move on
        collected++
        continue
      }

      await bot.dig(fresh)
      collected++

      // FIX BUG 4: Only print progress updates, never early-exit on success
      if (count > 1 && collected < count) {
        if (collected === 1) delayChat(pickRandom([`getting ${name}...`, 'on it']))
        else if (collected % 5 === 0) delayChat(`got ${collected} so far`)
        await humanPause(200, 500)
      }
    } catch(e) {
      console.log("DIG ERROR:", e.message)
      // FIX BUG 4: Don't abort on a single dig failure — skip this block and keep going
      await humanPause(200, 400)
      continue
    }
  }
  delayChat(pickRandom([`got ${count} ${name}`, `collected ${count} ${name}`, `done`]))
  idle = true
  return true
}

// ── ATTACK ─────────────────────────────────────────────────────────────────
// FIX BUG 2: Modern mineflayer (1.18+) populates bot.entities lazily and some
// entity objects arrive without a fully-resolved position until the server sends
// their metadata. Guard against missing/NaN positions before calling distanceTo.
// Also widen the search to 64 blocks and remove the hard NON_MOB type filter —
// instead rely on mcData entity-kind lookup so passive/hostile mobs both match.

function debugEntities() {
  const nearby = Object.values(bot.entities).filter(e => {
    if (e === bot.entity) return false
    if (!e.position || isNaN(e.position.x)) return false
    return e.position.distanceTo(bot.entity.position) < 24
  })
  if (!nearby.length) { delayChat("no entities within 24 blocks"); return }
  nearby.slice(0, 8).forEach(e => {
    const resolved = mcData?.entities?.[e.entityType]?.name ?? '?'
    const dist = Math.round(e.position.distanceTo(bot.entity.position))
    bot.chat(`type=${e.type} name=${e.name??'?'} resolved=${resolved} dist=${dist}`)
  })
>>>>>>> Stashed changes
}

async function equipBestWeapon() {
  const PRIO = [
    'netherite_sword','diamond_sword','iron_sword','stone_sword','golden_sword','wooden_sword',
    'netherite_axe','diamond_axe','iron_axe','stone_axe','golden_axe','wooden_axe'
  ]
  for (const n of PRIO) {
    const w = bot.inventory.items().find(i => i.name === n)
    if (w) {
      try { await bot.equip(w, 'hand'); return n } catch(e) {}
    }
  }
  return null
}

async function attackMob(name) {
  idle = false
  const weapon = await equipBestWeapon()
  if (weapon) {
    delayChat(pickRandom([`using my ${weapon}`, `${weapon} ready`]))
    await humanPause(200, 400)
  }

<<<<<<< Updated upstream
  const entity = bot.nearestEntity(e => {
    if (e.type !== 'mob') return false

    return (
      (e.name && e.name.toLowerCase().includes(name)) ||
      (e.mobType && e.mobType.toLowerCase().includes(name))
    )
  })

  if (!entity) {
    delayChat("No mob found")
=======
  // FIX BUG 2: Filter out entities with invalid/missing positions before
  // computing distance, and expand search radius from 32 → 64 blocks.
  const nearby = Object.values(bot.entities).filter(e => {
    if (e === bot.entity) return false
    if (!e.position || isNaN(e.position.x) || isNaN(e.position.y)) return false
    return e.position.distanceTo(bot.entity.position) < 64
  })
  console.log(`[Attack] ${nearby.length} entities nearby:`)
  nearby.forEach(e => {
    const rn = mcData?.entities?.[e.entityType]?.name ?? 'unknown'
    console.log(`  type=${e.type} name=${e.name??'?'} resolved=${rn} eType=${e.entityType}`)
  })

  // Entities that are definitely NOT mobs (by type string or mcData kind)
  const NON_MOB_TYPES = new Set(['player','orb','experience_orb','object','item_frame',
                                  'painting','leash_knot','area_effect_cloud'])

  // FIX BUG 2: Also check mcData entity "kind" field ('mob'|'passive'|'hostile'|'neutral')
  // to correctly identify mobs regardless of what e.type contains.
  function isMobEntity(e) {
    if (NON_MOB_TYPES.has(e.type)) return false
    const meta = mcData?.entities?.[e.entityType]
    if (!meta) {
      // Unknown entity type — if e.type is 'mob' or null/undefined, treat as mob
      return e.type === 'mob' || !e.type || e.type === 'living'
    }
    // mcData kind values: 'mob', 'passive_mobs', 'hostile_mobs', 'neutral', etc.
    const kind = (meta.kind || meta.type || '').toLowerCase()
    return kind.includes('mob') || kind === 'passive' || kind === 'hostile' || kind === 'neutral'
  }

  const entity = bot.nearestEntity(e => {
    if (e === bot.entity) return false
    if (!e.position || isNaN(e.position.x)) return false
    if (e.position.distanceTo(bot.entity.position) > 64) return false
    if (!isMobEntity(e)) return false

    if (name && name !== 'mob') {
      const resolved = mcData?.entities?.[e.entityType]?.name ?? ''
      const names = [e.name, e.displayName, resolved].filter(Boolean).map(n => n.toLowerCase())
      return names.some(n => n.includes(name.toLowerCase()))
    }
    return true
  })

  if (!entity) {
    console.log('[Attack] No target found')
    delayChat(pickRandom(["can't see any mobs", "no mobs nearby", "nothing to attack"]))
>>>>>>> Stashed changes
    idle = true
    return
  }

<<<<<<< Updated upstream
  bot.lookAt(entity.position.offset(0, entity.height, 0))

=======
  const tName = mcData?.entities?.[entity.entityType]?.name ?? entity.name ?? 'mob'
  console.log(`[Attack] Targeting ${tName}`)
  delayChat(pickRandom([`going for the ${tName}`, `attacking ${tName}`]))

  setupMove()
  bot.pathfinder.setGoal(new GoalFollow(entity, 2), true)
>>>>>>> Stashed changes
  bot.pvp.attack(entity)
  idle = true
}

function stopAll() {
  bot.clearControlStates()
  bot.pathfinder.setGoal(null)
  bot.pvp.stop()
  idle = true
<<<<<<< Updated upstream
=======
  delayChat("Stopped")
}

// ── CRAFTING ───────────────────────────────────────────────────────────────

const ALL_PLANK_TYPES = [
  'oak_planks','spruce_planks','birch_planks','jungle_planks','acacia_planks',
  'dark_oak_planks','mangrove_planks','cherry_planks','bamboo_planks',
  'crimson_planks','warped_planks'
]

const INGREDIENT_TO_BLOCK = {
  'iron_ingot': 'iron_ore', 'gold_ingot': 'gold_ore',
  'diamond': 'diamond_ore', 'coal': 'coal_ore',
  'emerald': 'emerald_ore', 'redstone': 'redstone_ore',
  'cobblestone': 'stone',   'stone': 'stone',
  'sand': 'sand',           'gravel': 'gravel',
}

const NON_CRAFTABLE = new Set([
  'diamond','emerald','coal','sand','dirt','gravel','iron_ore','gold_ore','iron_ingot','gold_ingot'
])
const EQUIP_SLOTS = {
  sword:'hand', pickaxe:'hand', axe:'hand', shovel:'hand', hoe:'hand', bow:'hand', crossbow:'hand',
  helmet:'head', chestplate:'torso', leggings:'legs', boots:'feet'
}
const CRAFT_PHRASES = {
  gatherStart: m => pickRandom([`getting ${m}...`, `grabbing some ${m}`, `need ${m}, one sec`]),
  craftStart:  i => pickRandom([`crafting ${i}...`, `making ${i} now`, `putting together ${i}`]),
  craftDone:   i => pickRandom([`done! made ${i}`, `${i} crafted!`, `got your ${i}`]),
  needTable:   () => pickRandom(["need a crafting table", "gotta use a crafting table"]),
  noTable:     () => pickRandom(["can't find a crafting table", "no crafting table around"]),
  missingMats: (m,c) => pickRandom([`still need ${c}x ${m}`, `missing ${c} ${m}`]),
  cantGather:  (m,c) => pickRandom([`couldn't find ${m} (need ${c})`, `no ${m} in range`]),
  subCraft:    m => pickRandom([`making ${m} first`, `need to craft ${m} first`]),
}

function findClosestLog() {
  let closest = null, closestDist = Infinity
  for (const lt of ALL_LOG_TYPES) {
    const b = bot.findBlock({ matching: b => b.name === lt, maxDistance: 64 })
    if (!b) continue
    const d = bot.entity.position.distanceTo(b.position)
    if (d < closestDist) { closestDist = d; closest = b }
  }
  return closest ? closest.name.replace(/_log$|_stem$|_block$/, '') : null
}

function findBestAvailableWood() {
  for (const pt of ALL_PLANK_TYPES) {
    const d = mcData?.itemsByName[pt]
    if (d && bot.inventory.count(d.id, null) > 0) return pt.replace(/_planks$/, '')
  }
  return findClosestLog()
}

function getTotalPlanks() {
  let t = 0
  for (const pt of ALL_PLANK_TYPES) {
    const d = mcData?.itemsByName[pt]
    if (d) t += bot.inventory.count(d.id, null)
  }
  return t
}

function getServerRecipes(itemId) {
  const r = bot.recipesAll(itemId, null, null)
  return (r && r.length > 0) ? r : []
}

function getMissingIngredients(recipe) {
  const slots = recipe.inShape
    ? recipe.inShape.flat().filter(Boolean)
    : (recipe.ingredients || []).filter(Boolean)
  const needed = {}
  for (const ing of slots) {
    if (!ing || ing.id == null || ing.id === -1) continue
    const item = mcData.items[ing.id]
    if (!item) continue
    needed[item.name] = (needed[item.name] || 0) + (ing.count || 1)
  }
  const missing = []
  for (const [name, count] of Object.entries(needed)) {
    const d = mcData.itemsByName[name]
    if (!d) { missing.push({ name, count }); continue }
    const inInv = bot.inventory.count(d.id, null)
    if (count - inInv > 0) missing.push({ name, count: count - inInv })
  }
  return missing
}

function remapPlank(n) {
  if (!n.endsWith('_planks')) return n
  const exact = mcData.itemsByName[n]
  if (exact && bot.inventory.count(exact.id, null) > 0) return n
  for (const pt of ALL_PLANK_TYPES) {
    const d = mcData?.itemsByName[pt]
    if (d && bot.inventory.count(d.id, null) > 0) return pt
  }
  const wood = findClosestLog()
  return wood ? `${wood}_planks` : n
}

async function gatherMaterial(name, countNeeded) {
  console.log(`[Gather] Need ${countNeeded}x ${name}`)

  if (name.endsWith('_planks')) {
    if (getTotalPlanks() >= countNeeded) return true
    const wood = findClosestLog()
    const logType = wood ? `${wood}_log` : 'oak_log'
    const ok = await mineBlocks(logType, Math.ceil(countNeeded / 4), b => b.name === logType)
    if (!ok) return false
    return await craftItem(wood ? `${wood}_planks` : 'oak_planks', countNeeded, 'keep', true)
  }

  if (name === 'stick') return await craftItem('stick', countNeeded, 'keep', true)

  if (ALL_LOG_TYPES.includes(name)) return await mineBlocks(name, countNeeded, b => b.name === name)

  const blockName = INGREDIENT_TO_BLOCK[name] || name
  const matchFn = blockName === 'stone'
    ? b => b.name === 'stone' || b.name === 'cobblestone'
    : b => b.name === blockName || b.name.includes(blockName)
  return await mineBlocks(name, countNeeded, matchFn)
}

// FIX BUG 3: mineBlocks now equips the right tool before each dig
async function mineBlocks(label, countNeeded, matchFn) {
  let got = 0
  while (got < countNeeded) {
    const block = bot.findBlock({ matching: matchFn, maxDistance: 64 })
    if (!block) { console.log(`[Gather] Can't find ${label}`); return false }
    try {
      const pos = block.position
      await walkTo(pos.x, pos.y, pos.z, 2)
      // Equip the correct tool for this block type
      await equipBestToolFor(block.name)
      await bot.lookAt(pos)
      await humanPause(150, 350)
      const fresh = bot.blockAt(pos)
      if (!fresh || fresh.name === 'air') { got++; continue }
      await bot.dig(fresh)
      got++
      if (got < countNeeded) await humanPause(200, 400)
    } catch(e) { console.log(`[Gather] Dig error: ${e.message}`); return false }
  }
  return true
}

// FIX BUG 1: Revised crafting table placement and lookup.
// After placing, search within a wider radius (16 blocks) and add a small delay
// so the block has time to register in the chunk data before we call findBlock.
async function placeCraftingTable() {
  const item = bot.inventory.items().find(i => i.name === 'crafting_table')
  if (!item) return false
  try {
    await bot.equip(item, 'hand')
    const feet = bot.entity.position.floored()
    const candidates = [
      feet.offset(0, -1, 0),
      feet.offset(1, -1, 0), feet.offset(-1, -1, 0),
      feet.offset(0, -1, 1), feet.offset(0, -1, -1),
    ]
    for (const pos of candidates) {
      const b = bot.blockAt(pos)
      if (b && b.name !== 'air') {
        await bot.placeBlock(b, new Vec3(0, 1, 0))
        console.log('[Craft] Placed crafting table at', pos)
        // FIX BUG 1: Wait for block to register in chunk before searching for it
        await humanPause(500, 800)
        return true
      }
    }
  } catch(e) { console.log('[Craft] Place table error:', e.message) }
  return false
}

// FIX BUG 1: needsTable detection was unreliable for recipes where inShape rows
// contain exactly 3 columns (which IS a 3x3 recipe but the old check was
// `row.length > 2`, meaning it was never true for a standard 3-wide shape).
// A recipe requires a table when inShape has more than 1 row OR any row has
// more than 2 filled slots. We also now check the recipe.requiresTable flag
// properly since mineflayer sets it on server recipes.
function recipeNeedsTable(recipe) {
  if (recipe.requiresTable === true) return true
  if (!recipe.inShape) return false
  const filledRows = recipe.inShape.filter(row => row && row.some(s => s && s.id !== -1))
  if (filledRows.length > 2) return true
  if (filledRows.some(row => row && row.filter(s => s && s.id !== -1).length > 2)) return true
  // A pickaxe is 3 wide — detect by checking max column index used
  for (const row of recipe.inShape) {
    if (row && row.length >= 3 && row[2] && row[2].id !== -1) return true
  }
  return false
}

async function craftItem(itemName, amount = 1, afterCraft = 'keep', isSubCraft = false) {
  if (!isSubCraft) idle = false
  if (!mcData) { delayChat("still loading"); idle = true; return false }

  const MAT_PRIO = ['wooden','stone','iron','golden','diamond','netherite','leather','chainmail']

  function resolveItem(name) {
    const exact = mcData.itemsByName[name]
    if (exact) {
      const r = getServerRecipes(exact.id)
      if (r.length > 0) return { item: exact, recipes: r, name }
    }
    const base = name.replace(/^(wooden|stone|iron|golden|diamond|netherite|leather|chainmail)_/, '')
    const candidates = Object.values(mcData.itemsByName).filter(i =>
      i.name === base || i.name.endsWith('_'+base) || i.name.startsWith(base+'_')
    )
    candidates.sort((a, b) => {
      const rank = n => { for (let i=0; i<MAT_PRIO.length; i++) if (n.startsWith(MAT_PRIO[i]+'_')) return i; return 99 }
      return rank(a.name) - rank(b.name)
    })
    console.log(`[Craft] Resolving '${name}' → candidates: ${candidates.map(c=>c.name).join(', ')}`)
    for (const c of candidates) {
      const r = getServerRecipes(c.id)
      if (r.length > 0) { console.log(`[Craft] Resolved → '${c.name}'`); return { item: c, recipes: r, name: c.name } }
    }
    if (!recipesReady) { delayChat("recipes still loading, try again in a sec"); return null }
    return null
  }

  const resolved = resolveItem(itemName)
  if (!resolved) { if (recipesReady) delayChat(`Don't know how to craft ${itemName}`); idle = true; return false }

  let { item, recipes } = resolved
  itemName = resolved.name

  if (NON_CRAFTABLE.has(itemName)) { delayChat(`${itemName} must be collected, not crafted`); idle = true; return false }

  const closestWood = findBestAvailableWood()

  function recipeScore(r) {
    const slots = r.inShape ? r.inShape.flat().filter(Boolean) : (r.ingredients||[]).filter(Boolean)
    let score = slots.length
    for (const ing of slots) {
      if (!ing || ing.id == null || ing.id === -1) continue
      const iName = mcData.items[ing.id]?.name || ''
      if (iName.endsWith('_planks')) {
        const d = mcData.itemsByName[iName]
        if (d && bot.inventory.count(d.id, null) > 0) { score -= 10; continue }
        if (closestWood && iName.startsWith(closestWood+'_')) continue
        score += 20
      }
      if (ALL_LOG_TYPES.includes(iName) && closestWood && !iName.startsWith(closestWood)) score += 50
    }
    return score
  }

  const recipe = recipes.reduce((best, r) => recipeScore(r) < recipeScore(best) ? r : best)

  const rawMissing = getMissingIngredients(recipe)
  const missing = []
  for (const m of rawMissing) {
    const remapped = remapPlank(m.name)
    const d = mcData.itemsByName[remapped]
    const inInv = d ? bot.inventory.count(d.id, null) : 0
    const deficit = m.count - inInv
    if (deficit > 0) missing.push({ name: remapped, count: deficit })
  }

  if (missing.length > 0) {
    delayChat(`need: ${missing.map(m => `${m.count}x ${m.name}`).join(', ')}`)
    await humanPause(500, 900)
  }

  for (const mat of missing) {
    await humanPause(300, 600)
    const matItem = mcData.itemsByName[mat.name]
    const matRecipes = matItem ? getServerRecipes(matItem.id) : []
    if (matRecipes.length > 0) {
      delayChat(CRAFT_PHRASES.subCraft(mat.name))
      await humanPause(500, 1000)
      const ok = await craftItem(mat.name, mat.count, 'keep', true)
      if (!ok) { delayChat(CRAFT_PHRASES.missingMats(mat.name, mat.count)); idle = true; return false }
    } else {
      delayChat(CRAFT_PHRASES.gatherStart(mat.name))
      await humanPause(400, 800)
      const ok = await gatherMaterial(mat.name, mat.count)
      if (!ok) { delayChat(CRAFT_PHRASES.cantGather(mat.name, mat.count)); idle = true; return false }
    }
  }

  // FIX BUG 1: Use corrected needsTable logic
  const needsTable = recipeNeedsTable(recipe)

  let tableBlock = null

  if (needsTable) {
    delayChat(CRAFT_PHRASES.needTable())
    await humanPause(300, 600)

    const tableBlockId = mcData.blocksByName['crafting_table']?.id

    // FIX BUG 1: Search wider radius (32→64) for existing crafting table
    tableBlock = bot.findBlock({ matching: tableBlockId, maxDistance: 64 })

    if (!tableBlock) {
      if (!bot.inventory.items().some(i => i.name === 'crafting_table')) {
        delayChat("no table nearby, crafting one")
        await humanPause(300, 600)
        const ok = await craftItem('crafting_table', 1, 'keep', true)
        if (!ok) { delayChat(CRAFT_PHRASES.noTable()); idle = true; return false }
      }
      const placed = await placeCraftingTable()
      if (!placed) { delayChat("couldn't place crafting table"); idle = true; return false }
      // FIX BUG 1: Search wider radius after placing (block may land 1-2 blocks away)
      tableBlock = bot.findBlock({ matching: tableBlockId, maxDistance: 16 })
    }

    if (!tableBlock) { delayChat(CRAFT_PHRASES.noTable()); idle = true; return false }

    try {
      const pos = tableBlock.position
      await walkTo(pos.x, pos.y, pos.z, 2)
      await bot.lookAt(pos.offset(0.5, 0.5, 0.5))
      await humanPause(300, 600)
    } catch(e) { delayChat("can't reach crafting table"); idle = true; return false }
  }

  try {
    delayChat(CRAFT_PHRASES.craftStart(itemName))
    await humanPause(600, 1200)

    let finalRecipe = bot.recipesFor(item.id, null, amount, tableBlock ?? null)[0]
    if (!finalRecipe) {
      finalRecipe = recipe
      console.log('[Craft] recipesFor empty, using pre-resolved recipe')
    }
    if (!finalRecipe) { delayChat(`can't figure out recipe for ${itemName}`); idle = true; return false }

    await bot.craft(finalRecipe, amount, tableBlock ?? null)
    await humanPause(300, 600)
    delayChat(CRAFT_PHRASES.craftDone(itemName))
  } catch(e) {
    console.log("CRAFT ERROR:", e.message)
    delayChat(`craft failed: ${e.message}`)
    idle = true; return false
  }

  if (!isSubCraft) {
    await humanPause(400, 800)
    await handlePostCraft(itemName, afterCraft)
  }
  idle = true
  return true
}

async function handlePostCraft(itemName, action) {
  const item = bot.inventory.items().find(i => i.name === itemName)
  if (!item) { delayChat(`can't find ${itemName} in inventory`); return }

  if (action === 'drop') {
    try { await bot.tossStack(item); delayChat(`dropped ${itemName}`) } catch(e) { delayChat(`couldn't drop ${itemName}`) }
    return
  }
  if (action === 'equip') {
    let slot = null
    for (const kw in EQUIP_SLOTS) if (itemName.includes(kw)) { slot = EQUIP_SLOTS[kw]; break }
    if (!slot) { delayChat(`not sure where ${itemName} goes`); return }
    try { await bot.equip(item, slot); delayChat(`${itemName} equipped`) } catch(e) { delayChat(`couldn't equip ${itemName}`) }
    return
  }
  delayChat(pickRandom([`${itemName} in my inventory`, `keeping ${itemName}`]))
>>>>>>> Stashed changes
}

// ── GIVE (drop from own inventory) ─────────────────────────────────────────

async function giveItemToPlayer(itemName, amount) {
  idle = false
  if (!mcData) { delayChat("still loading"); idle = true; return }

  let resolvedName = itemName
  if (!mcData.itemsByName[itemName]) {
    const match = Object.values(mcData.itemsByName).find(i => i.name.includes(itemName))
    if (!match) { delayChat(`don't know what ${itemName} is`); idle = true; return }
    resolvedName = match.name
  }

  const totalHave = bot.inventory.items()
    .filter(i => i.name === resolvedName)
    .reduce((s, i) => s + i.count, 0)

  if (totalHave === 0) { delayChat(`I don't have any ${resolvedName}`); idle = true; return }

  const toDrop = amount === 'all' ? totalHave : Math.min(amount, totalHave)

  const player = bot.nearestEntity(e => e.type === 'player')
  if (player) {
    setupMove()
    try { await bot.pathfinder.goto(new GoalNear(player.position.x, player.position.y, player.position.z, 2)) }
    catch(e) {}
  }

  try {
    const d = mcData.itemsByName[resolvedName]
    await bot.toss(d.id, null, toDrop)
    delayChat(pickRandom([
      `dropped ${toDrop}x ${resolvedName}`,
      `there, ${toDrop} ${resolvedName} on the ground`,
      `tossed ${toDrop}x ${resolvedName} for you`
    ]))
  } catch(e) {
    console.log('[Give] toss error:', e.message)
    delayChat(`couldn't drop ${resolvedName}`)
  }
  idle = true
}

// ── IDLE LOOK ──────────────────────────────────────────────────────────────
bot.on('physicsTick', () => {
  if (!idle) return
<<<<<<< Updated upstream

  const player = bot.nearestEntity(e => e.type === 'player')
  if (!player) return

  bot.lookAt(player.position.offset(0, player.height, 0), true)
=======
  const p = bot.nearestEntity(e => e.type === 'player')
  if (p) bot.lookAt(p.position.offset(0, p.height ?? 1.6, 0), true)
>>>>>>> Stashed changes
})

// ── NLP BRIDGE ─────────────────────────────────────────────────────────────
function askNLP(message, callback) {
  const client = new net.Socket()
<<<<<<< Updated upstream

  client.connect(25576, '127.0.0.1', () => {
    client.write(JSON.stringify({ message }) + '\n')
  })

  client.on('data', (data) => {
    try {
      const res = JSON.parse(data.toString())
      callback(res)
    } catch (e) {
      console.log("NLP parse error:", e)
=======
  client.connect(25576, '127.0.0.1', () => client.write(JSON.stringify({ message }) + '\n'))
  let buf = ''
  client.on('data', d => {
    buf += d.toString()
    if (buf.includes('\n')) {
      try { callback(JSON.parse(buf.trim())) } catch(e) { console.log("NLP parse error:", e.message) }
      client.destroy()
>>>>>>> Stashed changes
    }
    client.destroy()
  })
  client.on('error', e => console.log("NLP error:", e.message))
}

<<<<<<< Updated upstream
// ---------------- COMMAND EXECUTOR ----------------
function executeCommand(cmd) {
  if (!cmd) return

  console.log("Executing:", cmd)
=======
// ── COMMAND EXECUTOR ───────────────────────────────────────────────────────
function executeCommand(cmd) {
  if (!cmd) return
  console.log("Exec:", cmd)
>>>>>>> Stashed changes

  if (cmd.startsWith('/bot jump')) {
    jump(parseInt(cmd.split(' ')[2]) || 1)
  } else if (cmd.startsWith('/bot follow')) {
    followPlayer()
<<<<<<< Updated upstream
  }

  else if (cmd.startsWith('/bot collect')) {
    const item = cmd.split(' ')[2]
    collectItem(item)
  }

  else if (cmd.startsWith('/bot attack')) {
    const match = cmd.match(/type=(\w+)/)
    if (match) attackMob(match[1])
  }

  else if (cmd === '/bot stop') {
    stopAll()
  }

  else {
    // fallback → send raw Minecraft command
=======
  } else if (cmd.startsWith('/bot collect')) {
    const p = cmd.split(' ')
    collectItem(p[2], parseInt(p[3]) || 1)
  } else if (cmd.startsWith('/bot attack')) {
    const m = cmd.match(/type=(\w+)/)
    if (m) attackMob(m[1]); else delayChat("Don't know what to attack")
  } else if (cmd.startsWith('/bot craft')) {
    const p = cmd.split(' ')
    const action = ['drop','equip','keep'].includes(p[4]) ? p[4] : 'keep'
    craftItem(p[2], parseInt(p[3]) || 1, action)
  } else if (cmd.startsWith('/bot give')) {
    const p = cmd.split(' ')
    const amt = p[3] === 'all' ? 'all' : (parseInt(p[3]) || 1)
    giveItemToPlayer(p[2], amt)
  } else if (cmd.startsWith('/bot pillar')) {
    pillarUp(parseInt(cmd.split(' ')[2]) || 5)
  } else if (cmd === '/bot stop') {
    stopAll()
  } else {
>>>>>>> Stashed changes
    bot.chat(cmd)
  }
}

// ── CHAT ───────────────────────────────────────────────────────────────────
bot.on('chat', (username, message) => {
  if (username === bot.username) return
<<<<<<< Updated upstream

  console.log("User:", message)

  askNLP(message, (res) => {
    if (res.error) {
      console.log("NLP Error:", res.error)
      return
    }

    console.log("Intent:", res.intent)
    console.log("Command:", res.command)

=======
  console.log("User:", message)
  if (message.trim().toLowerCase() === 'entities') { debugEntities(); return }
  askNLP(message, res => {
    if (res.error) { console.log("NLP Error:", res.error); return }
    console.log("Intent:", res.intent, "| Cmd:", res.command)
>>>>>>> Stashed changes
    executeCommand(res.command)
  })
})
