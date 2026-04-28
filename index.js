const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const collectBlock = require('mineflayer-collectblock').plugin
const pvp = require('mineflayer-pvp').plugin
const net = require('net')

const { GoalFollow, GoalNear } = goals

// ---------------- BOT SETUP ----------------
const bot = mineflayer.createBot({
  host: '127.0.0.1',
  port: 52779,
  username: 'MineBuddy'
})

bot.loadPlugin(pathfinder)
bot.loadPlugin(collectBlock)
bot.loadPlugin(pvp)

let idle = true

// ---------------- UTILS ----------------

// Sends a chat message with a human-feeling random delay
function delayChat(msg, minMs = 400, maxMs = 1200) {
  setTimeout(() => bot.chat(msg), Math.random() * (maxMs - minMs) + minMs)
}

// Pause like a human thinking before doing the next thing
function humanPause(minMs = 300, maxMs = 900) {
  return new Promise(resolve =>
    setTimeout(resolve, Math.random() * (maxMs - minMs) + minMs)
  )
}

function setupMove() {
  const mcData = require('minecraft-data')(bot.version)
  bot.pathfinder.setMovements(new Movements(bot, mcData))
}

// Walk somewhere then optionally look around briefly, like a player would
async function walkTo(x, y, z, range = 1) {
  setupMove()
  await bot.pathfinder.goto(new GoalNear(x, y, z, range))
  // small head-bob look as if examining the block
  await humanPause(200, 500)
}

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
  }, 700)
}

function followPlayer() {
  const target = bot.nearestEntity(e => e.type === 'player')
  if (!target) return delayChat("Can't see you")
  setupMove()
  idle = false
  bot.pathfinder.setGoal(new GoalFollow(target, 2), true)
}

async function collectItem(name) {
  idle = false
  const block = bot.findBlock({
    matching: (b) => b.name.includes(name),
    maxDistance: 64
  })

  if (!block) {
    delayChat("No block nearby")
    idle = true
    return false
  }

  try {
    const pos = block.position
    await walkTo(pos.x, pos.y, pos.z, 1)

    const directions = [
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }
    ]

    for (const dir of directions) {
      try {
        await bot.lookAt(pos.offset(dir.x, dir.y, dir.z))
        await bot.waitForTicks(5)
        await bot.dig(block)
        idle = true
        return true
      } catch (_) { /* try next face */ }
    }

    delayChat("Can't reach block")
  } catch (e) {
    console.log("DIG ERROR:", e.message)
    delayChat("Failed to mine")
  }

  idle = true
  return false
}

// Mob entity types mineflayer uses across versions
const MOB_TYPES = new Set(['mob', 'hostile', 'passive', 'neutral', 'animal'])

function getMobEntityName(e) {
  // mineflayer stores the mob kind in different fields depending on version
  return (
    e.name ||
    e.mobType ||
    e.entityType ||
    (e.entity && e.entity.name) ||
    ''
  ).toLowerCase()
}

function attackMob(name) {
  idle = false

  // Dump nearby entities to console so we can debug if it still fails
  const nearby = Object.values(bot.entities).filter(e =>
    e !== bot.entity &&
    e.position.distanceTo(bot.entity.position) < 32
  )
  console.log('[Attack] Nearby entities:', nearby.map(e =>
    `type=${e.type} name=${e.name ?? '?'} mobType=${e.mobType ?? '?'}`
  ))

  const entity = bot.nearestEntity(e => {
    if (e === bot.entity) return false
    if (e.type === 'player') return false   // never attack players
    if (e.type === 'object') return false   // skip dropped items, boats etc.

    const entityName = getMobEntityName(e)

    // If a specific mob was named, match it — otherwise attack anything hostile
    if (name && name !== 'mob') {
      return entityName.includes(name)
    }

    // Generic "attack" with no specific target — pick nearest non-player entity
    return MOB_TYPES.has(e.type) || entityName.length > 0
  })

  if (!entity) {
    // Log what types ARE around to help debug
    const types = [...new Set(nearby.map(e => e.type))].join(', ')
    console.log('[Attack] No match. Types around:', types || 'none')
    delayChat("No mob found")
    idle = true
    return
  }

  console.log(`[Attack] Targeting: type=${entity.type} name=${entity.name ?? '?'}`)
  bot.lookAt(entity.position.offset(0, entity.height ?? 1, 0))
  bot.pvp.attack(entity)
}

function stopAll() {
  bot.clearControlStates()
  bot.pathfinder.setGoal(null)
  bot.pvp.stop()
  idle = true
  delayChat("Stopped")
}

// ---------------- CRAFTING SYSTEM ----------------
// Maps ingredient item names → world block names to search for.
// Wood-based entries are intentionally omitted here — they're resolved
// dynamically at craft time using findClosestLog().
const INGREDIENT_TO_BLOCK = {
  'iron_ingot':   'iron_ore',
  'gold_ingot':   'gold_ore',
  'diamond':      'diamond_ore',
  'coal':         'coal_ore',
  'emerald':      'emerald_ore',
  'redstone':     'redstone_ore',
  'cobblestone':  'stone',
  'sand':         'sand',
  'gravel':       'gravel',
}

// All log types Minecraft knows about
const ALL_LOG_TYPES = [
  'oak_log', 'spruce_log', 'birch_log', 'jungle_log',
  'acacia_log', 'dark_oak_log', 'mangrove_log',
  'cherry_log', 'bamboo_block', 'crimson_stem', 'warped_stem'
]

// Find the nearest log of any type and return its wood prefix (e.g. 'cherry')
function findClosestLog() {
  let closest = null
  let closestDist = Infinity

  for (const logType of ALL_LOG_TYPES) {
    const block = bot.findBlock({
      matching: (b) => b.name === logType,
      maxDistance: 64
    })
    if (!block) continue
    const dist = bot.entity.position.distanceTo(block.position)
    if (dist < closestDist) {
      closestDist = dist
      closest = block
    }
  }

  if (!closest) return null
  // e.g. 'cherry_log' → 'cherry',  'oak_log' → 'oak'
  return closest.name.replace(/_log$|_stem$|_block$/, '')
}

// Non-craftable raw resources — things that must be mined, not crafted.
// stone/cobblestone and wood logs are excluded so tool recipes work correctly.
const NON_CRAFTABLE = new Set([
  'diamond', 'emerald', 'coal', 'sand', 'dirt',
  'gravel', 'iron_ore', 'gold_ore', 'iron_ingot', 'gold_ingot'
])

// Items that can be equipped and which slot they go into
const EQUIP_SLOTS = {
  sword:      'hand',
  pickaxe:    'hand',
  axe:        'hand',
  shovel:     'hand',
  hoe:        'hand',
  bow:        'hand',
  helmet:     'head',
  chestplate: 'torso',
  leggings:   'legs',
  boots:      'feet'
}

// Humanlike chat phrases so the bot doesn't sound robotic
const CRAFT_PHRASES = {
  gatherStart:  (mat) => pickRandom([
    `getting ${mat}...`,
    `lemme grab some ${mat}`,
    `need ${mat}, one sec`,
    `brb getting ${mat}`
  ]),
  craftStart:   (item) => pickRandom([
    `crafting ${item}...`,
    `making the ${item} now`,
    `alright, putting together ${item}`,
    `on it, making ${item}`
  ]),
  craftDone:    (item) => pickRandom([
    `done! made ${item}`,
    `there you go, ${item} is ready`,
    `${item} crafted!`,
    `got your ${item}`
  ]),
  needTable:    () => pickRandom([
    "need a crafting table for this, one sec",
    "gotta use a crafting table",
    "this needs a 3x3, looking for a table"
  ]),
  noTable:      () => pickRandom([
    "can't find a crafting table nearby",
    "no crafting table around here",
    "need a crafting table but can't find one"
  ]),
  missingMats:  (mat) => pickRandom([
    `still need ${mat}`,
    `missing ${mat}`,
    `don't have enough ${mat}`
  ]),
  cantGather:   (mat) => pickRandom([
    `couldn't find ${mat} nearby`,
    `no ${mat} in range`,
    `can't reach any ${mat}`
  ]),
  subCraft:     (mat) => pickRandom([
    `crafting ${mat} first`,
    `making ${mat} before that`,
    `need to make ${mat} first`
  ]),
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Get a list of what's missing from inventory for a recipe
function getMissingIngredients(recipe, mcData) {
  const ingredients = recipe.inShape
    ? recipe.inShape.flat().filter(Boolean)
    : (recipe.ingredients || [])

  const needed = {}
  for (const ing of ingredients) {
    if (!ing || ing.id === -1) continue
    const ingItem = mcData.items[ing.id]
    if (!ingItem) continue
    needed[ingItem.name] = (needed[ingItem.name] || 0) + (ing.count || 1)
  }

  const missing = []
  for (const [name, count] of Object.entries(needed)) {
    const itemDef = mcData.itemsByName[name]
    if (!itemDef) continue
    const inInv = bot.inventory.count(itemDef.id, null)
    const deficit = count - inInv
    if (deficit > 0) missing.push({ name, count: deficit })
  }

  return missing
}

// Gather a raw material from the world (mines one block at a time)
async function gatherMaterial(name, countNeeded, mcData) {
  // For any *_planks or *_log ingredient, resolve to the closest actual log in the world
  const isWoodIngredient = ALL_LOG_TYPES.some(lt =>
    name === lt || name.endsWith('_planks') || name === 'stick'
  )
  let blockName
  if (isWoodIngredient) {
    const wood = findClosestLog()
    blockName = wood ? `${wood}_log` : 'oak_log' // fallback to oak if nothing found
    console.log(`[Craft] Wood ingredient '${name}' → gathering '${blockName}'`)
  } else {
    blockName = INGREDIENT_TO_BLOCK[name] || name.replace('_ingot', '_ore')
  }
  let gathered = 0

  while (gathered < countNeeded) {
    const block = bot.findBlock({
      matching: (b) => b.name.includes(blockName),
      maxDistance: 64
    })

    if (!block) {
      console.log(`[Craft] Can't find ${blockName}`)
      return false
    }

    try {
      const pos = block.position
      await walkTo(pos.x, pos.y, pos.z, 1)

      // Look at the block briefly (humanlike inspection)
      await bot.lookAt(pos)
      await humanPause(200, 500)
      await bot.dig(block)

      gathered++
      console.log(`[Craft] Gathered ${gathered}/${countNeeded} ${name}`)

      // Small pause between digs — no robot spam-clicking
      if (gathered < countNeeded) await humanPause(300, 700)
    } catch (e) {
      console.log(`[Craft] Gather error: ${e.message}`)
      return false
    }
  }

  return true
}

// Core recursive craft function
// afterCraft: 'drop' | 'equip' | 'keep' — what to do with the final item
async function craftItem(itemName, amount = 1, afterCraft = 'keep', isSubCraft = false) {
  idle = false
  const mcData = require('minecraft-data')(bot.version)

  // --- Resolve item name ---
  const item = mcData.itemsByName[itemName]
  if (!item) {
    delayChat(`Don't know what ${itemName} is`)
    idle = true
    return false
  }

  // --- Non-craftable resource ---
  if (NON_CRAFTABLE.has(itemName)) {
    delayChat(`${itemName} is collected, not crafted`)
    idle = true
    return false
  }

  // --- Find recipes ---
  const recipes = bot.recipesAll(item.id, null, null)
  if (!recipes || recipes.length === 0) {
    delayChat(`No recipe exists for ${itemName}`)
    idle = true
    return false
  }

  // Find the closest available log so we pick the matching recipe variant.
  // e.g. if cherry trees are nearest, cherry_planks recipe wins.
  const closestWood = findClosestLog() // e.g. 'cherry', 'oak', null
  console.log(`[Craft] Closest wood type: ${closestWood ?? 'unknown, defaulting to fewest slots'}`)

  function recipeScore(r) {
    const slots = r.inShape ? r.inShape.flat().filter(Boolean) : (r.ingredients || [])
    let score = slots.length // base: fewer slots = simpler recipe
    for (const ing of slots) {
      if (!ing || ing.id === -1) continue
      const ingName = mcData.items[ing.id]?.name || ''
      const isWood = ALL_LOG_TYPES.some(lt => ingName.startsWith(lt.replace(/_log$|_stem$|_block$/, '')))
      if (isWood && closestWood) {
        // Reward matching the closest wood, penalise everything else
        if (!ingName.startsWith(closestWood)) score += 50
      }
    }
    return score
  }
  const recipe = recipes.reduce((best, r) => recipeScore(r) < recipeScore(best) ? r : best)

  // --- Check + resolve missing ingredients ---
  const missing = getMissingIngredients(recipe, mcData)

  for (const mat of missing) {
    // Small pause before announcing each gap
    await humanPause(400, 900)

    const matItem = mcData.itemsByName[mat.name]
    const matRecipes = matItem ? bot.recipesAll(matItem.id, null, null) : null

    if (matRecipes && matRecipes.length > 0) {
      // Sub-craft the ingredient
      delayChat(CRAFT_PHRASES.subCraft(mat.name))
      await humanPause(600, 1200)
      const ok = await craftItem(mat.name, mat.count, 'keep', true)
      if (!ok) {
        delayChat(CRAFT_PHRASES.missingMats(mat.name))
        idle = true
        return false
      }
    } else {
      // Gather raw material from the world
      delayChat(CRAFT_PHRASES.gatherStart(mat.name))
      await humanPause(500, 1000)
      const ok = await gatherMaterial(mat.name, mat.count, mcData)
      if (!ok) {
        delayChat(CRAFT_PHRASES.cantGather(mat.name))
        idle = true
        return false
      }
    }
  }

  // --- Find crafting table if needed (recipes with 3-row inShape need 3x3 grid) ---
  const needsTable = recipe.inShape && recipe.inShape.length > 2
  let table = null

  if (needsTable) {
    delayChat(CRAFT_PHRASES.needTable())
    await humanPause(400, 800)

    table = bot.findBlock({
      matching: mcData.blocksByName.crafting_table?.id,
      maxDistance: 32
    })

    if (!table) {
      delayChat(CRAFT_PHRASES.noTable())
      idle = true
      return false
    }

    try {
      const pos = table.position
      await walkTo(pos.x, pos.y, pos.z, 1)
      // Look at the table like you're about to use it
      await bot.lookAt(pos)
      await humanPause(300, 700)
    } catch (e) {
      delayChat("Can't reach crafting table")
      idle = true
      return false
    }
  }

  // --- Craft ---
  try {
    delayChat(CRAFT_PHRASES.craftStart(itemName))
    await humanPause(700, 1400) // simulate the player opening the menu, clicking

    const finalRecipe = bot.recipesFor(item.id, null, amount, table)[0]
    if (!finalRecipe) {
      delayChat(`Still missing something for ${itemName}`)
      idle = true
      return false
    }

    await bot.craft(finalRecipe, amount, table)
    await humanPause(400, 800) // pause after crafting, like closing the menu

    delayChat(CRAFT_PHRASES.craftDone(itemName))
  } catch (e) {
    console.log("CRAFT ERROR:", e.message)
    delayChat(`Craft failed: ${e.message}`)
    idle = true
    return false
  }

  // --- Post-craft action (only for the top-level craft call) ---
  if (!isSubCraft) {
    await humanPause(500, 1000)
    await handlePostCraft(itemName, afterCraft)
  }

  idle = true
  return true
}

// What to do after crafting: equip it, drop it, or keep it in inventory
async function handlePostCraft(itemName, action) {
  const item = bot.inventory.items().find(i => i.name === itemName)
  if (!item) {
    delayChat(`Hmm, can't find ${itemName} in my inventory`)
    return
  }

  if (action === 'drop') {
    try {
      await bot.tossStack(item)
      delayChat(pickRandom([
        `there, dropped ${itemName}`,
        `${itemName} dropped for you`,
        `tossed the ${itemName}`
      ]))
    } catch (e) {
      delayChat(`Couldn't drop ${itemName}`)
    }
    return
  }

  if (action === 'equip') {
    // Find which slot this item fits
    let slot = null
    for (const keyword in EQUIP_SLOTS) {
      if (itemName.includes(keyword)) {
        slot = EQUIP_SLOTS[keyword]
        break
      }
    }

    if (!slot) {
      delayChat(`${itemName} doesn't go anywhere I know, keeping it`)
      return
    }

    try {
      await bot.equip(item, slot)
      delayChat(pickRandom([
        `${itemName} equipped`,
        `put on the ${itemName}`,
        `wearing ${itemName} now`
      ]))
    } catch (e) {
      delayChat(`Crafted ${itemName} but couldn't equip it`)
    }
    return
  }

  // 'keep' — just leave it in inventory, confirm
  delayChat(pickRandom([
    `${itemName} is in my inventory`,
    `keeping ${itemName} in my bag`,
    `stored ${itemName}`
  ]))
}

// ---------------- IDLE LOOK ----------------
bot.on('physicsTick', () => {
  if (!idle) return
  const player = bot.nearestEntity(e => e.type === 'player')
  if (!player) return
  bot.lookAt(player.position.offset(0, player.height, 0), true)
})

// ---------------- NLP BRIDGE ----------------
function askNLP(message, callback) {
  const client = new net.Socket()

  client.connect(25576, '127.0.0.1', () => {
    client.write(JSON.stringify({ message }) + '\n')
  })

  let buffer = ''
  client.on('data', (data) => {
    buffer += data.toString()
    if (buffer.includes('\n')) {
      try {
        const res = JSON.parse(buffer.trim())
        callback(res)
      } catch (e) {
        console.log("NLP parse error:", e.message)
      }
      client.destroy()
    }
  })

  client.on('error', (err) => {
    console.log("NLP server error:", err.message)
  })
}

// ---------------- COMMAND EXECUTOR ----------------
// afterCraft intent: NLP passes 'drop' or 'equip' via command suffix
// e.g. "/bot craft diamond_sword 1 drop"  or  "/bot craft diamond_sword 1 equip"
function executeCommand(cmd) {
  if (!cmd) return
  console.log("Executing:", cmd)

  if (cmd.startsWith('/bot jump')) {
    const times = parseInt(cmd.split(' ')[2]) || 1
    jump(times)
  }

  else if (cmd.startsWith('/bot follow')) {
    followPlayer()
  }

  else if (cmd.startsWith('/bot collect')) {
    const parts = cmd.split(' ')
    collectItem(parts[2])
  }

  else if (cmd.startsWith('/bot attack')) {
    const match = cmd.match(/type=(\w+)/)
    if (match) attackMob(match[1])
    else delayChat("Don't know what to attack")
  }

  else if (cmd.startsWith('/bot craft')) {
    const parts     = cmd.split(' ')
    const itemName  = parts[2]
    const amount    = parseInt(parts[3]) || 1
    // 4th arg is post-craft action: drop | equip | keep (default keep)
    const action    = ['drop', 'equip', 'keep'].includes(parts[4]) ? parts[4] : 'keep'
    craftItem(itemName, amount, action)
  }

  else if (cmd === '/bot stop') {
    stopAll()
  }

  else {
    bot.chat(cmd)
  }
}

// ---------------- CHAT LISTENER ----------------
bot.on('chat', (username, message) => {
  if (username === bot.username) return
  console.log("User:", message)

  askNLP(message, (res) => {
    if (res.error) {
      console.log("NLP Error:", res.error)
      return
    }
    console.log("Intent:", res.intent)
    console.log("Command:", res.command)
    executeCommand(res.command)
  })
})