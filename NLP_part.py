"""
╔══════════════════════════════════════════════════════════╗
║          MINECRAFT NLP BOT  —  Single File Version       ║
╚══════════════════════════════════════════════════════════╝

HOW TO INSTALL:
    pip install spacy
    python -m spacy download en_core_web_sm

HOW TO RUN (test mode, no Minecraft needed):
    python minecraft_bot.py

HOW TO RUN (connected to Java/Minecraft):
    python minecraft_bot.py --java

HOW TO ADD A NEW COMMAND:
    Scroll to the  ═══ COMMANDS ═══  section below.
    Copy any existing command block and edit it.
    That's it — nothing else to change!
"""

import re
import sys
import socket
import json
import argparse

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Load the spaCy NLP model
#
# spaCy reads sentences and understands grammar (nouns, verbs, names, numbers).
# We use the small English model "en_core_web_sm".
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
# This is the ONLY section you need to edit when adding new commands.
#
# Each command is a dictionary with these keys:
#
#   "triggers"  : list of words/phrases the player might say to trigger it
#   "params"    : what information to extract from the sentence
#                 each param has:
#                   "extract" → what to look for  (see extractor list below)
#                   "default" → fallback value if nothing is found
#   "build"     : a function that turns extracted params into a Minecraft command
#
# ─── Available extractors ────────────────────────────────────────────────────
#   "item"      → finds a Minecraft item  (e.g. "sword" → "diamond_sword")
#   "target"    → finds a player/target   (e.g. "me" → "@p", "everyone" → "@a")
#   "number"    → finds a number          (e.g. "five" → 5,  "10" → 10)
#   "mob"       → finds a mob name        (e.g. "zombie", "creeper")
#   "direction" → finds a direction       (e.g. "north", "up", "forward")
#   "message"   → captures remaining text as a chat message
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
    # "jump"  →  /bot jump 1
    "jump": {
        "triggers": ["jump", "leap", "hop", "bounce", "spring up"],
        "params": {
            "times": {"extract": "number", "default": 1},
        },
        "build": lambda p: f"/bot jump {p['times']}",
    },

    # ── FOLLOW ────────────────────────────────────────────────────────────────
    # "follow me"  →  /bot follow @p
    "follow": {
        "triggers": ["follow", "come to", "come here", "trail", "track", "chase"],
        "params": {
            "target": {"extract": "target", "default": "@p"},
        },
        "build": lambda p: f"/bot follow {p['target']}",
    },

    # ── ATTACK ────────────────────────────────────────────────────────────────
    # "attack the zombie"  →  /bot attack @e[type=zombie,limit=1,sort=nearest]
    "attack": {
        "triggers": ["attack", "kill", "fight", "hit", "strike", "slay", "destroy", "eliminate"],
        "params": {
            "mob": {"extract": "mob", "default": "zombie"},
        },
        "build": lambda p: f"/bot attack @e[type={p['mob']},limit=1,sort=nearest]",
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

    # ── BUILD ─────────────────────────────────────────────────────────────────
    # "build a stone wall to the north"  →  /bot build cobblestone north
    "build": {
        "triggers": ["build", "place", "construct", "put", "erect", "lay", "set down"],
        "params": {
            "block":     {"extract": "item",      "default": "cobblestone"},
            "direction": {"extract": "direction", "default": "north"},
        },
        "build": lambda p: f"/bot build {p['block']} {p['direction']}",
    },

    # ── CRAFT ─────────────────────────────────────────────────────────────────
    # "craft a pickaxe"  →  /bot craft diamond_pickaxe 1
    "craft": {
        "triggers": ["craft", "make", "fabricate", "forge", "craft me", "make me"],
        "params": {
            "item":   {"extract": "item",   "default": "crafting_table"},
            "amount": {"extract": "number", "default": 1},
        },
        "build": lambda p: f"/bot craft {p['item']} {p['amount']}",
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
    #
    # Example — an "eat" command:
    #
    # "eat": {
    #     "triggers": ["eat", "feed me", "consume", "nom"],
    #     "params": {
    #         "item": {"extract": "item", "default": "bread"},
    #     },
    #     "build": lambda p: f"/bot eat {p['item']}",
    # },
    # ────────────────────────────────────────────────────────────────────────
}


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — ITEM / MOB DICTIONARIES
#
# These map plain English words → official Minecraft names.
# Add more entries whenever you like.
# ─────────────────────────────────────────────────────────────────────────────

ITEM_ALIASES = {
    # Weapons & tools
    "sword": "diamond_sword", "pickaxe": "diamond_pickaxe",
    "axe": "diamond_axe",     "shovel": "diamond_shovel",
    "bow": "bow",              "arrow": "arrow",
    # Blocks & materials
    "wood": "oak_log",         "log": "oak_log",
    "stone": "cobblestone",    "dirt": "dirt",
    "sand": "sand",            "gravel": "gravel",
    "glass": "glass",          "wool": "white_wool",
    "torch": "torch",          "chest": "chest",
    "door": "oak_door",        "ladder": "ladder",
    "tnt": "tnt",
    # Ores & materials
    "coal": "coal",            "iron": "iron_ingot",
    "gold": "gold_ingot",      "diamond": "diamond",
    "emerald": "emerald",      "redstone": "redstone",
    # Food
    "food": "bread",           "bread": "bread",
    "apple": "apple",          "meat": "cooked_beef",
    "beef": "cooked_beef",     "steak": "cooked_beef",
    "fish": "cooked_cod",
    # Armour
    "helmet": "diamond_helmet",         "chestplate": "diamond_chestplate",
    "leggings": "diamond_leggings",     "boots": "diamond_boots",
    # Misc
    "potion": "potion",        "bucket": "bucket",
    "water": "water_bucket",   "book": "book",
    "map": "map",              "compass": "compass",
}

MOB_NAMES = {
    "zombie", "skeleton", "creeper", "spider", "enderman", "blaze",
    "witch",  "guardian", "phantom", "drowned", "husk", "stray",
    "pig",    "cow",      "sheep",   "chicken", "horse",
    "wolf",   "cat",      "villager", "iron_golem",
}

# Words that mean "this player" or "all players"
TARGET_MAP = {
    "me": "@s",  "myself": "@s",  "player": "@p",
    "everyone": "@a",  "all": "@a",  "all players": "@a",
    "nearest": "@p",   "random": "@r",
}

# Words that are filler in "say" sentences — stripped before sending the message
SAY_STOP_WORDS = {"say", "tell", "broadcast", "announce", "shout", "chat", "message", "type"}


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — EXTRACTORS
#
# These functions look inside a parsed sentence and pull out the relevant info.
# You don't need to edit these unless you want to add a new extractor type.
# ─────────────────────────────────────────────────────────────────────────────

def extract_item(doc, text):
    """Find a Minecraft item name in the sentence."""
    for alias, mc_name in ITEM_ALIASES.items():
        if alias in text:
            return mc_name
    return None

def extract_target(doc, text):
    """Find who the command is aimed at (player name, @p, @a, etc.)."""
    # spaCy: check for recognised person names
    for ent in doc.ents:
        if ent.label_ == "PERSON":
            return ent.text
    # Check our known target words
    for word, selector in TARGET_MAP.items():
        if word in text:
            return selector
    return "@p"   # default: nearest player

def extract_number(doc, text):
    """Find a number (digit or written word) in the sentence."""
    word_nums = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
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
    """Find a compass direction or movement direction."""
    directions = ["north", "south", "east", "west", "up", "down", "forward", "back", "left", "right"]
    for d in directions:
        if d in text:
            return d
    return None

def extract_message(doc, text):
    """Return the sentence with trigger words removed — used for /say."""
    words = [w for w in text.split() if w not in SAY_STOP_WORDS]
    return " ".join(words) if words else text

# Map extractor names (used in COMMANDS above) → actual functions
EXTRACTORS = {
    "item":      extract_item,
    "target":    extract_target,
    "number":    extract_number,
    "mob":       extract_mob,
    "direction": extract_direction,
    "message":   extract_message,
    "block":     extract_item,   # blocks use the same extractor as items
}


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — NLP PIPELINE
#
# parse_sentence() is the core function.
# It takes a plain English sentence and returns a Minecraft command string.
#
# Flow:
#   sentence → spaCy → detect intent → extract params → build command
# ─────────────────────────────────────────────────────────────────────────────

def build_trigger_map():
    """Build a lookup table: trigger_phrase → command_name."""
    trigger_map = {}
    for cmd_name, cmd in COMMANDS.items():
        for trigger in cmd["triggers"]:
            trigger_map[trigger.lower()] = cmd_name
    return trigger_map

# Build it once at startup
TRIGGER_MAP = build_trigger_map()


def detect_intent(doc, text):
    """
    Find which command the player is asking for.
    Checks longest triggers first so "pick up" beats "pick".
    """
    for trigger in sorted(TRIGGER_MAP, key=len, reverse=True):
        if trigger in text:
            return TRIGGER_MAP[trigger]
    # Fallback: try matching lemmas (base word forms), e.g. "jumps" → "jump"
    for token in doc:
        if token.lemma_ in TRIGGER_MAP:
            return TRIGGER_MAP[token.lemma_]
    return None


def extract_params(doc, text, cmd_name):
    """
    Extract all parameters defined for this command.
    Uses the extractor functions above.
    """
    params = {}
    cmd = COMMANDS[cmd_name]
    for param_name, definition in cmd["params"].items():
        extractor_fn = EXTRACTORS.get(definition["extract"])
        value = extractor_fn(doc, text) if extractor_fn else None
        params[param_name] = value if value is not None else definition["default"]
    return params


def parse_sentence(sentence):
    """
    Main function.
    Input:  "give me 5 diamonds"
    Output: ("/give @p diamond 5", "give")   ← (minecraft_command, intent_name)
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
# STEP 6 — BRIDGE TO JAVA
#
# When running in live mode (--java), commands are sent over a TCP socket.
# The Java bot server should listen on localhost:25575.
#
# Format sent:  { "command": "/give @p diamond 1" }\n
# ─────────────────────────────────────────────────────────────────────────────

def send_to_java(command, host="localhost", port=25575):
    try:
        with socket.create_connection((host, port), timeout=5) as sock:
            payload = json.dumps({"command": command}) + "\n"
            sock.sendall(payload.encode("utf-8"))
            response = sock.recv(1024).decode("utf-8").strip()
            return response
    except ConnectionRefusedError:
        return f"[!] Java server not running on {host}:{port}"
    except socket.timeout:
        return "[!] Connection timed out"
    except Exception as e:
        return f"[!] Error: {e}"


# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — TEST SUITE
#
# Run with:  python minecraft_bot.py --test
# Checks that every example sentence maps to the right command.
# ─────────────────────────────────────────────────────────────────────────────

TEST_CASES = [
    #  (sentence you type,                 expected command name)
    ("give me a diamond sword",             "give"),
    ("give Steve 10 arrows",               "give"),
    ("jump",                               "jump"),
    ("jump 3 times",                       "jump"),
    ("follow me",                          "follow"),
    ("come to me",                         "follow"),
    ("attack the zombie",                  "attack"),
    ("kill all skeletons",                 "attack"),
    ("collect diamonds",                   "collect"),
    ("mine 5 coal",                        "collect"),
    ("build a wall with stone",            "build"),
    ("place a torch",                      "build"),
    ("craft a pickaxe",                    "craft"),
    ("make 5 arrows",                      "craft"),
    ("say hello everyone",                 "say"),
    ("broadcast we won",                   "say"),
    ("summon a creeper",                   "summon"),
    ("spawn a zombie",                     "summon"),
    ("teleport to me",                     "teleport"),
    ("tp to Steve",                        "teleport"),
    ("stop",                               "stop"),
    ("halt everything",                    "stop"),
]

def run_tests():
    print("\n" + "─" * 55)
    print(f"  Running {len(TEST_CASES)} tests...")
    print("─" * 55)
    passed = failed = 0
    for sentence, expected in TEST_CASES:
        command, intent = parse_sentence(sentence)
        ok = intent == expected
        status = "✓ PASS" if ok else "✗ FAIL"
        print(f"  [{status}]  \"{sentence}\"")
        if ok:
            print(f"           → {command}")
            passed += 1
        else:
            print(f"           got={intent}  expected={expected}")
            failed += 1
        print()
    print("─" * 55)
    print(f"  {passed} passed,  {failed} failed  ({len(TEST_CASES)} total)")
    print("─" * 55 + "\n")
    return failed == 0


# ─────────────────────────────────────────────────────────────────────────────
# STEP 8 — INTERACTIVE CHAT LOOP
#
# Type sentences, get Minecraft commands back.
# In test mode:  commands are just printed.
# In Java mode:  commands are sent to the Java bot server over TCP.
# ─────────────────────────────────────────────────────────────────────────────

def run_chat(java_mode=False, host="localhost", port=25575):
    print("\n" + "═" * 55)
    print("  MINECRAFT NLP BOT")
    mode = f"LIVE → Java on {host}:{port}" if java_mode else "TEST MODE (no Minecraft needed)"
    print(f"  Mode: {mode}")
    print("═" * 55)
    print("  Type a sentence to get a command.")
    print("  Type  !commands  to list all loaded commands.")
    print("  Type  !quit      to exit.")
    print("═" * 55 + "\n")

    while True:
        try:
            sentence = input("You: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nBye!")
            break

        if not sentence:
            continue

        # Special chat commands
        if sentence == "!quit":
            print("Bye!")
            break
        if sentence == "!commands":
            print(f"  Loaded commands: {', '.join(COMMANDS.keys())}\n")
            continue

        # Parse the sentence
        command, intent = parse_sentence(sentence)

        if command is None:
            print(f"  ? Not understood. Try: 'give me a sword', 'follow me', 'attack the zombie'\n")
            continue

        print(f"  Intent  : {intent}")
        print(f"  Command : {command}")

        if java_mode:
            response = send_to_java(command, host, port)
            print(f"  Java    : {response}")
        print()


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────
import sys

if __name__ == "__main__":
    sentence = " ".join(sys.argv[1:])

    command, intent = parse_sentence(sentence)

    if command:
        print("Intent :", intent)
        print("Command:", command)
    else:
        print("Not understood")


# Enter your command: give amey 10 diamond pickaxe
# 
# Intent : give
# 
# Command: /give amey 10 diamond pickaxe diamond_pickaxe 10
# 
# ───────────────── SOCKET SERVER FOR NODE ─────────────────
import socket
import json

HOST = "localhost"
PORT = 25576   # different from your java port

def start_server():
    print(f"[NLP] Server running on {HOST}:{PORT}")

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind((HOST, PORT))
        server.listen()

        while True:
            conn, addr = server.accept()
            with conn:
                data = conn.recv(1024).decode("utf-8").strip()

                try:
                    req = json.loads(data)
                    sentence = req.get("message", "")

                    command, intent = parse_sentence(sentence)

                    response = {
                        "command": command,
                        "intent": intent
                    }

                except Exception as e:
                    response = {"error": str(e)}

                conn.sendall((json.dumps(response) + "\n").encode("utf-8"))

if __name__ == "__main__":
    start_server()