"""
╔══════════════════════════════════════════════════════════╗
║          MINECRAFT NLP BOT  —  Single File Version       ║
╚══════════════════════════════════════════════════════════╝

HOW TO INSTALL:
    pip install spacy
    python -m spacy download en_core_web_sm

HOW TO RUN (socket server for Node bot):
    python NLP_part.py

HOW TO ADD A NEW COMMAND:
    Scroll to the  ═══ COMMANDS ═══  section below.
    Copy any existing command block and edit it.
    That's it — nothing else to change!
"""

import re
import sys
import socket
import json

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Load the spaCy NLP model
# ─────────────────────────────────────────────────────────────────────────────
try:
    import spacy
    nlp = spacy.load("en_core_web_sm")
except OSError:
    print("ERROR: spaCy model missing. Run:  python -m spacy download en_core_web_sm")
    sys.exit(1)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — COMMANDS
#
# Each command needs:
#   "triggers" : words/phrases that activate this command
#   "params"   : what to extract from the sentence
#   "build"    : function that turns params → Minecraft command string
#
# Available extractors:
#   "item"      → Minecraft item name  (e.g. "sword" → "diamond_sword")
#   "target"    → player target        (e.g. "me" → "@p", "everyone" → "@a")
#   "number"    → a number             (e.g. "five" → 5, "10" → 10)
#   "mob"       → mob name             (e.g. "zombie", "creeper")
#   "direction" → compass direction    (e.g. "north", "up", "forward")
#   "message"   → remaining text       (used for /say)
# ─────────────────────────────────────────────────────────────────────────────

COMMANDS = {

    # ── GIVE ──────────────────────────────────────────────────────────────────
    # "give me a sword"  →  /give @p diamond_sword 1
    "give": {
        "triggers": ["give", "hand", "hand over", "provide", "pass", "get me", "drop me"],
        "params": {
            "target": {"extract": "target", "default": "@p"},
            "item":   {"extract": "item",   "default": "diamond"},
            "amount": {"extract": "number", "default": 1},
        },
        "build": lambda p: f"/give {p['target']} {p['item']} {p['amount']}",
    },

    # ── JUMP ──────────────────────────────────────────────────────────────────
    # "jump 3 times"  →  /bot jump 3
    "jump": {
        "triggers": ["jump", "leap", "hop", "bounce", "spring up"],
        "params": {
            "times": {"extract": "number", "default": 1},
        },
        "build": lambda p: f"/bot jump {p['times']}",
    },

    # ── FOLLOW ────────────────────────────────────────────────────────────────
    # "follow me"  →  /bot follow
    "follow": {
        "triggers": ["follow", "come to", "come here", "trail", "track", "chase"],
        "params": {},
        "build": lambda p: "/bot follow",
    },

    # ── ATTACK ────────────────────────────────────────────────────────────────
    # "attack the zombie"  →  /bot attack type=zombie
    "attack": {
        "triggers": ["attack", "kill", "fight", "hit", "strike", "slay", "destroy", "eliminate"],
        "params": {
            "mob": {"extract": "mob", "default": "zombie"},
        },
        "build": lambda p: f"/bot attack type={p['mob']}",
    },

    # ── COLLECT ───────────────────────────────────────────────────────────────
    # "collect 5 diamonds"  →  /bot collect diamond 5
    "collect": {
        "triggers": ["collect", "pick up", "gather", "fetch", "mine", "grab", "harvest", "loot"],
        "params": {
            "item":   {"extract": "item",   "default": "diamond"},
            "amount": {"extract": "number", "default": 1},
        },
        "build": lambda p: f"/bot collect {p['item']} {p['amount']}",
    },

    # ── CRAFT ─────────────────────────────────────────────────────────────────
    # "craft a pickaxe and drop it"    →  /bot craft diamond_pickaxe 1 drop
    # "make me a sword and equip it"   →  /bot craft diamond_sword 1 equip
    # "craft a chest"                  →  /bot craft chest 1 keep
    "craft": {
        "triggers": ["craft", "make", "fabricate", "forge", "craft me", "make me"],
        "params": {
            "item":   {"extract": "item",   "default": "crafting_table"},
            "amount": {"extract": "number", "default": 1},
            "action": {"extract": "craft_action", "default": "keep"},
        },
        "build": lambda p: f"/bot craft {p['item']} {p['amount']} {p['action']}",
    },

    # ── SAY ───────────────────────────────────────────────────────────────────
    # "say hello everyone"  →  /say hello everyone
    "say": {
        "triggers": ["say", "tell", "broadcast", "announce", "shout", "chat"],
        "params": {
            "message": {"extract": "message", "default": "Hello!"},
        },
        "build": lambda p: f"/say {p['message']}",
    },

    # ── SUMMON ────────────────────────────────────────────────────────────────
    # "summon a zombie"  →  /summon zombie ~ ~ ~
    "summon": {
        "triggers": ["summon", "spawn", "conjure", "create a mob", "spawn a mob"],
        "params": {
            "mob": {"extract": "mob", "default": "pig"},
        },
        "build": lambda p: f"/summon {p['mob']} ~ ~ ~",
    },

    # ── TELEPORT ──────────────────────────────────────────────────────────────
    # "teleport to me"  →  /tp @s @p
    "teleport": {
        "triggers": ["teleport", "tp", "warp", "go to", "travel to", "port to"],
        "params": {
            "target": {"extract": "target", "default": "@p"},
        },
        "build": lambda p: f"/tp @s {p['target']}",
    },

    # ── STOP ──────────────────────────────────────────────────────────────────
    # "stop"  →  /bot stop
    "stop": {
        "triggers": ["stop", "halt", "freeze", "cancel", "abort", "cease", "pause", "idle"],
        "params": {},
        "build": lambda p: "/bot stop",
    },

    # ────────────────────────────────────────────────────────────────────────
    # ↓↓↓  ADD YOUR NEW COMMANDS HERE  ↓↓↓
    # ────────────────────────────────────────────────────────────────────────
}


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — ITEM / MOB DICTIONARIES
# ─────────────────────────────────────────────────────────────────────────────

ITEM_ALIASES = {
    # Weapons & tools
    "sword":    "wooden_sword",    "pickaxe":  "wooden_pickaxe",
    "axe":      "wooden_axe",      "shovel":   "wooden_shovel",
    "bow":      "bow",              "arrow":    "arrow",
    # Blocks & materials
    "wood":     "oak_log",          "log":      "oak_log",
    "plank":    "oak_planks",       "planks":   "oak_planks",
    "stone":    "cobblestone",      "dirt":     "dirt",
    "sand":     "sand",             "gravel":   "gravel",
    "glass":    "glass",            "wool":     "white_wool",
    "torch":    "torch",            "chest":    "chest",
    "door":     "oak_door",         "ladder":   "ladder",
    "tnt":      "tnt",              "stick":    "stick",
    # Ores & materials
    "coal":     "coal",             "iron":     "iron_ingot",
    "gold":     "gold_ingot",       "diamond":  "diamond",
    "emerald":  "emerald",          "redstone": "redstone",
    # Food
    "food":     "bread",            "bread":    "bread",
    "apple":    "apple",            "meat":     "cooked_beef",
    "beef":     "cooked_beef",      "steak":    "cooked_beef",
    "fish":     "cooked_cod",
    # Armour
    "helmet":     "diamond_helmet",     "chestplate": "diamond_chestplate",
    "leggings":   "diamond_leggings",   "boots":      "diamond_boots",
    # Misc
    "potion":   "potion",           "bucket":   "bucket",
    "water":    "water_bucket",     "book":     "book",
    "map":      "map",              "compass":  "compass",
    "table":    "crafting_table",   "crafting table": "crafting_table",
}

MOB_NAMES = {
    "zombie", "skeleton", "creeper", "spider", "enderman", "blaze",
    "witch",  "guardian", "phantom", "drowned", "husk", "stray",
    "pig",    "cow",      "sheep",   "chicken", "horse",
    "wolf",   "cat",      "villager", "iron_golem",
}

# Words that mean "this player" or "all players"
# FIX: TARGET_MAP is checked BEFORE spaCy entities to avoid misclassification
TARGET_MAP = {
    "me":       "@p",
    "myself":   "@p",
    "player":   "@p",
    "everyone": "@a",
    "all":      "@a",
    "nearest":  "@p",
    "random":   "@r",
}

# Filler words stripped before sending a /say message
SAY_STOP_WORDS = {"say", "tell", "broadcast", "announce", "shout", "chat", "message", "type"}


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — EXTRACTORS
# ─────────────────────────────────────────────────────────────────────────────

def extract_item(doc, text):
    """Find a Minecraft item name in the sentence."""
    # Check multi-word aliases first (e.g. "crafting table")
    for alias in sorted(ITEM_ALIASES, key=len, reverse=True):
        if alias in text:
            return ITEM_ALIASES[alias]
    return None

def extract_target(doc, text):
    """
    Find who the command is aimed at.
    FIX: checks TARGET_MAP first, then falls back to spaCy PERSON entity.
    This prevents player names like 'Steve' being swapped with NLP noise.
    """
    for word, selector in TARGET_MAP.items():
        if word in text:
            return selector
    # Only use spaCy PERSON if no keyword matched
    for ent in doc.ents:
        if ent.label_ == "PERSON":
            return ent.text
    return "@p"

def extract_number(doc, text):
    """Find a number (digit or written word) in the sentence."""
    word_nums = {
        "one": 1,   "two": 2,    "three": 3, "four": 4,  "five": 5,
        "six": 6,   "seven": 7,  "eight": 8, "nine": 9,  "ten": 10,
        "twenty": 20, "thirty": 30, "fifty": 50, "hundred": 100,
    }
    for word, num in word_nums.items():
        if word in text:
            return num
    match = re.search(r"\b(\d+)\b", text)
    return int(match.group(1)) if match else None

def extract_mob(doc, text):
    """Find a mob name in the sentence."""
    for mob in MOB_NAMES:
        if mob in text:
            return mob
    return None

def extract_direction(doc, text):
    """Find a compass or movement direction."""
    directions = ["north", "south", "east", "west", "up", "down", "forward", "back", "left", "right"]
    for d in directions:
        if d in text:
            return d
    return None

def extract_message(doc, text):
    """Return the sentence with trigger words stripped — used for /say."""
    words = [w for w in text.split() if w not in SAY_STOP_WORDS]
    return " ".join(words) if words else text

# Keywords that signal the player wants the bot to drop the crafted item
DROP_TRIGGERS  = {"drop", "throw", "toss", "give", "hand", "pass", "leave"}
# Keywords that signal the player wants the bot to equip the crafted item
EQUIP_TRIGGERS = {"equip", "wear", "put on", "use", "hold", "wield"}

def extract_craft_action(doc, text):
    """
    Detect whether the player wants the bot to drop or equip the crafted item.
    Examples:
      "craft a sword and equip it"   → 'equip'
      "make me a pickaxe, drop it"   → 'drop'
      "craft a chest"                → 'keep'  (default)
    """
    # Check multi-word triggers first
    for phrase in EQUIP_TRIGGERS:
        if phrase in text:
            return "equip"
    for phrase in DROP_TRIGGERS:
        if phrase in text:
            return "drop"
    return "keep"

EXTRACTORS = {
    "item":         extract_item,
    "target":       extract_target,
    "number":       extract_number,
    "mob":          extract_mob,
    "direction":    extract_direction,
    "message":      extract_message,
    "block":        extract_item,
    "craft_action": extract_craft_action,
}


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — NLP PIPELINE
# ─────────────────────────────────────────────────────────────────────────────

def build_trigger_map():
    trigger_map = {}
    for cmd_name, cmd in COMMANDS.items():
        for trigger in cmd["triggers"]:
            trigger_map[trigger.lower()] = cmd_name
    return trigger_map

TRIGGER_MAP = build_trigger_map()


def detect_intent(doc, text):
    """
    Find which command the player is asking for.
    Checks longest triggers first so 'pick up' beats 'pick'.
    Falls back to lemma matching so 'jumps' → 'jump'.
    """
    for trigger in sorted(TRIGGER_MAP, key=len, reverse=True):
        if trigger in text:
            return TRIGGER_MAP[trigger]
    for token in doc:
        if token.lemma_ in TRIGGER_MAP:
            return TRIGGER_MAP[token.lemma_]
    return None


def extract_params(doc, text, cmd_name):
    params = {}
    cmd = COMMANDS[cmd_name]
    for param_name, definition in cmd["params"].items():
        extractor_fn = EXTRACTORS.get(definition["extract"])
        value = extractor_fn(doc, text) if extractor_fn else None
        params[param_name] = value if value is not None else definition["default"]
    return params


def parse_sentence(sentence):
    """
    Main entry point.
    Input:  "give me 5 diamonds"
    Output: ("/give @p diamond 5", "give")
            or (None, None) if nothing matched
    """
    text = sentence.strip().lower()
    doc  = nlp(text)

    intent = detect_intent(doc, text)
    if intent is None:
        return None, None

    params  = extract_params(doc, text, intent)
    command = COMMANDS[intent]["build"](params)
    return command, intent


# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — SOCKET SERVER FOR NODE BOT
#
# Node's index.js connects here on port 25576.
# Receives:  { "message": "attack the zombie" }
# Sends:     { "command": "/bot attack type=zombie", "intent": "attack" }
# ─────────────────────────────────────────────────────────────────────────────

HOST = "localhost"
PORT = 25576

def start_server():
    print(f"[NLP] Server listening on {HOST}:{PORT}")

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((HOST, PORT))
        server.listen()

        while True:
            conn, addr = server.accept()
            with conn:
                try:
                    data = conn.recv(4096).decode("utf-8").strip()
                    req  = json.loads(data)
                    sentence = req.get("message", "")

                    command, intent = parse_sentence(sentence)
                    response = {"command": command, "intent": intent}

                except Exception as e:
                    response = {"error": str(e)}

                conn.sendall((json.dumps(response) + "\n").encode("utf-8"))


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT — only one __main__ block (FIX: removed duplicate)
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    start_server()