const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const collectBlock = require('mineflayer-collectblock').plugin
const pvp = require('mineflayer-pvp').plugin
const net = require('net')

const { GoalFollow, GoalBlock } = goals

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
function delayChat(msg) {
  setTimeout(() => bot.chat(msg), Math.random() * 800 + 400)
}

function setupMove() {
  const mcData = require('minecraft-data')(bot.version)
  bot.pathfinder.setMovements(new Movements(bot, mcData))
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
}

function attackMob(name) {
  idle = false

  const entity = bot.nearestEntity(e => {
    if (e.type !== 'mob') return false

    return (
      (e.name && e.name.toLowerCase().includes(name)) ||
      (e.mobType && e.mobType.toLowerCase().includes(name))
    )
  })

  if (!entity) {
    delayChat("No mob found")
    idle = true
    return
  }

  bot.lookAt(entity.position.offset(0, entity.height, 0))

  bot.pvp.attack(entity)
}

function stopAll() {
  bot.clearControlStates()
  bot.pathfinder.setGoal(null)
  bot.pvp.stop()
  idle = true
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

  client.on('data', (data) => {
    try {
      const res = JSON.parse(data.toString())
      callback(res)
    } catch (e) {
      console.log("NLP parse error:", e)
    }
    client.destroy()
  })

  client.on('error', (err) => {
    console.log("NLP server error:", err.message)
  })
}

// ---------------- COMMAND EXECUTOR ----------------
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