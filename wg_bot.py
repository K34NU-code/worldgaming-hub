"""
WorldGaming-Bot
===============

Module:
  1. Rollenauswahl per Dropdown            -> /rollen-nachricht
  2. Beta-Bewerbung mit Formular + Ticket  -> /beta-nachricht, /beta-welle, /beta-plaetze,
                                              /beta-entfernen, /beta-status
  3. LoL-Patchnotes (automatisch alle 30 Min.) -> /patchnotes-test
  4. Lizenzschlüssel fürs Hub (Supabase)     -> /lizenz-erstellen, /lizenz-reset, /lizenz-sperren
  5. Download-Nachricht mit aktueller Version -> /download-nachricht
  6. Tägliches Backup von data.json in den Channel #bot-backup (falls vorhanden)
  7. Inaktivitäts-Sperre (Warnung nach 10, Sperre nach 14 Tagen)
                                              -> /inaktiv-status, /inaktiv-ausnahme, /inaktiv-sperre
  8. Discord-Punkte für Beta-Tester (Nachrichten und Voice, Meldung im Punkte-Channel) -> /punkte, /rangliste, /pack-einloesen

Gespeicherte Daten (Tickets, Sperren, Wellen, letzter Patch) liegen in "data.json".
"""

import asyncio
import hashlib
import io
import json
import re
import secrets
import sys
import time
from datetime import datetime, timezone, time as dtime
from pathlib import Path

import aiohttp
import discord
from discord import app_commands
from discord.ext import tasks

HERE = Path(__file__).parent
TOKEN_FILE = HERE / "token.txt"
DATA_FILE = HERE / "data.json"
SUPABASE_FILE = HERE / "supabase.json"   # {"url": "...", "secret_key": "..."} - nur auf dem Server

# Rollen- und Channelnamen auf dem Server
MEMBER_ROLE = "🎮 Mitglied"
MOD_ROLE = "🛡️ Moderator"
DEV_ROLE = "💻 Overlay-Dev"
BETA_ROLE = "🧪 Beta-Tester"
OPEN_ROLE = "⏳ Bewerbung offen"
REJECTED_ROLE = "🚫 Beta abgelehnt"
LOG_CHANNEL = "bewerbungen"
MOD_LOG_CHANNEL = "mod-log"
BACKUP_CHANNEL = "bot-backup"
TICKET_CATEGORY = "📨 BEWERBUNGEN"

DEFAULT_WAVE = 10
COOLDOWN_DAYS = 30
COLOR = 0x1ABC9C


# ===========================================================================
# Datenspeicher
# ===========================================================================
class Store:
    def __init__(self, path):
        self.path = path
        self.lock = asyncio.Lock()
        if path.exists():
            self.data = json.loads(path.read_text(encoding="utf-8"))
        else:
            self.data = {}
        self.data.setdefault("wave", {"limit": DEFAULT_WAVE, "accepted": 0, "number": 1})
        self.data.setdefault("tickets", {})      # user_id -> Ticketdaten
        self.data.setdefault("rejections", {})   # user_id -> Zeitpunkt der Ablehnung
        self.data.setdefault("panel", None)      # {"channel": id, "message": id}
        self.data.setdefault("inactivity", {"live": False, "start": 0, "exempt": [],
                                            "warned": {}, "last_report": 0})
        self.data.setdefault("points", {})       # user_id -> Punkte
        self.data.setdefault("pack_buys", {})    # user_id -> {"week": "2026-W45", "count": 1}

    async def save(self):
        async with self.lock:
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, indent=2, ensure_ascii=False), encoding="utf-8")
            tmp.replace(self.path)

    @property
    def wave(self):
        return self.data["wave"]

    @property
    def tickets(self):
        return self.data["tickets"]

    @property
    def rejections(self):
        return self.data["rejections"]

    def ticket_by_channel(self, channel_id):
        for uid, t in self.tickets.items():
            if t["channel"] == channel_id:
                return uid, t
        return None, None

    def wave_full(self):
        return self.wave["accepted"] >= self.wave["limit"]


store = Store(DATA_FILE)


def role(guild, name):
    return discord.utils.get(guild.roles, name=name)


def is_staff(member):
    if member.guild_permissions.administrator:
        return True
    names = {r.name for r in member.roles}
    return MOD_ROLE in names or DEV_ROLE in names


def cooldown_left(user_id):
    ts = store.rejections.get(str(user_id))
    if not ts:
        return 0
    left = ts + COOLDOWN_DAYS * 86400 - time.time()
    return max(0, left)


async def send_dm(user, text):
    try:
        await user.send(text)
        return True
    except (discord.Forbidden, discord.HTTPException):
        return False


# ===========================================================================
# Modul 1: Rollenauswahl
# ===========================================================================
LANES = ["Top", "Jungle", "Mid", "ADC", "Support"]
RANKS = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald",
         "Diamond", "Master", "Grandmaster", "Challenger"]

GROUPS = [
    {"id": "sprache", "placeholder": "🌍 Sprache / Language", "max": 2, "options": [
        ("Deutsch", "🇩🇪 Deutsch", "🇩🇪"),
        ("English", "🇬🇧 English", "🇬🇧"),
    ]},
    {"id": "games", "placeholder": "🎮 Was machst du hier? / What are you here for?", "max": 3, "options": [
        ("League of Legends", "⚔️ League of Legends", "⚔️"),
        ("Andere Games / Other games", "🎲 Andere Games", "🎲"),
        ("Nur zum Quatschen / Just chatting", "💬 Nur zum Quatschen", "💬"),
    ]},
    {"id": "lane", "placeholder": "🧭 Lane (League of Legends)", "max": 5,
     "options": [(n, n, None) for n in LANES]},
    {"id": "rang", "placeholder": "🏆 Rang / Rank (League of Legends)", "max": 1,
     "options": [(n, n, None) for n in RANKS]},
    {"id": "pings", "placeholder": "🔔 Pings", "max": 3, "options": [
        ("Overlay-Updates", "🔔 Overlay-Updates", None),
        ("Events", "🔔 Events", None),
        ("Mitspielersuche / Looking for group", "🔔 Mitspielersuche", None),
    ]},
]


class RoleSelect(discord.ui.Select):
    def __init__(self, group):
        self.group = group
        options = [discord.SelectOption(label=label, value=r, emoji=emoji)
                   for label, r, emoji in group["options"]]
        super().__init__(
            custom_id=f"wg_roles:{group['id']}",
            placeholder=group["placeholder"],
            min_values=0,
            max_values=min(group["max"], len(options)),
            options=options,
        )

    async def callback(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        guild = interaction.guild
        member = interaction.user
        wanted = set(self.values)

        add, remove, missing = [], [], []
        for _, name, _ in self.group["options"]:
            r = role(guild, name)
            if r is None:
                missing.append(name)
                continue
            if name in wanted and r not in member.roles:
                add.append(r)
            elif name not in wanted and r in member.roles:
                remove.append(r)

        new_member = False
        mitglied = role(guild, MEMBER_ROLE)
        if mitglied and mitglied not in member.roles:
            add.append(mitglied)
            new_member = True

        try:
            if add:
                await member.add_roles(*add, reason="Rollenauswahl")
            if remove:
                await member.remove_roles(*remove, reason="Rollenauswahl")
        except discord.Forbidden:
            await interaction.followup.send(
                "❌ Ich darf diese Rollen nicht vergeben. Bitte melde das einem Admin.\n"
                "❌ I'm not allowed to assign these roles. Please tell an admin.",
                ephemeral=True)
            return

        lines = [f"✅ {r.name}" for r in add if r != mitglied]
        lines += [f"➖ {r.name}" for r in remove]
        if not lines:
            lines.append("Keine Änderung. / No changes.")
        if new_member:
            lines.append("\n🎉 Willkommen! Du siehst jetzt den ganzen Server.\n"
                         "🎉 Welcome! You can now see the whole server.")
        if missing:
            print(f"[Rollen] Fehlende Rollen auf {guild.name}: {', '.join(missing)}")
        await interaction.followup.send("\n".join(lines), ephemeral=True)


class RoleView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        for g in GROUPS:
            self.add_item(RoleSelect(g))


def role_embed():
    e = discord.Embed(
        title="🎭 Rollen auswählen / Choose your roles",
        colour=discord.Colour(0x2ECC71),
        description=(
            "**🇩🇪** Wähle unten aus, was zu dir passt. Du kannst deine Auswahl "
            "jederzeit ändern. Jede neue Auswahl in einem Menü **ersetzt** die alte "
            "in diesem Menü. Alles abwählen entfernt die Rollen wieder.\n\n"
            "**🇬🇧** Pick what fits you below. You can change it any time. "
            "A new choice in a menu **replaces** your previous one in that menu. "
            "Deselecting everything removes those roles."
        ),
    )
    e.add_field(name="⚔️ League of Legends",
                value="Schaltet die League-Kategorie frei.\nUnlocks the League category.",
                inline=False)
    e.add_field(name="🧭 Lane & 🏆 Rang",
                value="Optional, nur für LoL-Spieler.\nOptional, for LoL players only.",
                inline=False)
    e.set_footer(text="WorldGaming")
    return e


# ===========================================================================
# Modul 2: Beta-Bewerbung
# ===========================================================================
QUESTIONS = [
    ("riot", "Riot-ID (Name#Tag)"),
    ("rank", "Rang & Main-Lane / Rank & main lane"),
    ("time", "Spielzeit pro Woche / Hours per week"),
    ("why", "Warum willst du testen? / Why test?"),
    ("exp", "Feedback & Test-Erfahrung / Experience"),
]


# ---------- Panel in #beta-bewerbung -----------------------------------------
def panel_embed():
    w = store.wave
    full = store.wave_full()
    status = ("🔴 **Welle voll / Wave full**" if full
              else "🟢 **Bewerbungen offen / Applications open**")
    e = discord.Embed(
        title="🧪 Beta-Bewerbung / Beta application",
        colour=discord.Colour(COLOR),
        description=(
            "**🇩🇪** Du willst den **WorldGaming Hub** vor allen anderen testen? "
            "Klick auf den Button und beantworte 5 kurze Fragen. Danach öffnet sich "
            "ein privates Ticket, in dem wir uns bei dir melden.\n\n"
            "**🇬🇧** Want to test the **WorldGaming Hub** before everyone else? "
            "Click the button and answer 5 short questions. A private ticket will "
            "open where we'll get back to you.\n\n" + status
        ),
    )
    e.add_field(name=f"Welle / Wave {w['number']}",
                value=f"Plätze / Spots: **{w['accepted']} / {w['limit']}**", inline=True)
    e.add_field(name="Nach Ablehnung / After rejection",
                value=f"{COOLDOWN_DAYS} Tage warten / wait {COOLDOWN_DAYS} days", inline=True)
    e.set_footer(text="WorldGaming Hub · Closed Beta")
    return e


class PanelView(discord.ui.View):
    def __init__(self, disabled=False):
        super().__init__(timeout=None)
        btn = discord.ui.Button(
            label="Für die Beta bewerben / Apply",
            emoji="📝",
            style=discord.ButtonStyle.secondary if disabled else discord.ButtonStyle.success,
            custom_id="wg_apply:open",
            disabled=disabled,
        )
        btn.callback = self.apply
        self.add_item(btn)

    async def apply(self, interaction: discord.Interaction):
        member = interaction.user
        guild = interaction.guild
        names = {r.name for r in member.roles}

        if BETA_ROLE in names:
            msg = "✅ Du bist schon Beta-Tester! / You're already a beta tester!"
        elif str(member.id) in store.tickets:
            ch = guild.get_channel(store.tickets[str(member.id)]["channel"])
            where = ch.mention if ch else "dein Ticket"
            msg = (f"📨 Du hast schon eine offene Bewerbung: {where}\n"
                   f"📨 You already have an open application: {where}")
        elif cooldown_left(member.id) > 0 or REJECTED_ROLE in names:
            days = int(cooldown_left(member.id) // 86400) + 1
            msg = (f"⏳ Du kannst dich in **{days} Tagen** erneut bewerben.\n"
                   f"⏳ You can apply again in **{days} days**.")
        elif store.wave_full():
            msg = ("🔴 Die aktuelle Welle ist voll. Hol dir die Rolle **🔔 Overlay-Updates**, "
                   "dann wirst du gepingt, wenn es weitergeht.\n"
                   "🔴 The current wave is full. Grab **🔔 Overlay-Updates** to get pinged.")
        else:
            await interaction.response.send_modal(ApplyModal())
            return
        await interaction.response.send_message(msg, ephemeral=True)


async def update_panel(guild):
    p = store.data.get("panel")
    if not p:
        return
    ch = guild.get_channel(p["channel"])
    if ch is None:
        return
    try:
        msg = await ch.fetch_message(p["message"])
        await msg.edit(embed=panel_embed(), view=PanelView(disabled=store.wave_full()))
    except discord.HTTPException:
        pass


# ---------- Formular ---------------------------------------------------------
class ApplyModal(discord.ui.Modal, title="Beta-Bewerbung / Beta application"):
    riot = discord.ui.TextInput(label=QUESTIONS[0][1], placeholder="z. B. / e.g. Keanu#EUW",
                                max_length=40)
    rank = discord.ui.TextInput(label=QUESTIONS[1][1], placeholder="z. B. / e.g. Gold 2, Mid",
                                max_length=100)
    hours = discord.ui.TextInput(label=QUESTIONS[2][1], placeholder="z. B. / e.g. 10",
                                 max_length=50)
    why = discord.ui.TextInput(label=QUESTIONS[3][1], style=discord.TextStyle.paragraph,
                               max_length=1000)
    exp = discord.ui.TextInput(label=QUESTIONS[4][1], style=discord.TextStyle.paragraph,
                               placeholder="Würdest du Bugs melden? / Would you report bugs?",
                               max_length=1000)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        guild = interaction.guild
        member = interaction.user

        if str(member.id) in store.tickets:
            await interaction.followup.send("📨 Du hast schon eine offene Bewerbung.", ephemeral=True)
            return

        answers = {
            "riot": self.riot.value, "rank": self.rank.value, "time": self.hours.value,
            "why": self.why.value, "exp": self.exp.value,
        }
        channel = await create_ticket(guild, member, answers)

        r = role(guild, OPEN_ROLE)
        if r:
            try:
                await member.add_roles(r, reason="Beta-Bewerbung")
            except discord.HTTPException:
                pass

        await interaction.followup.send(
            f"✅ Danke! Deine Bewerbung ist in {channel.mention}. Wir melden uns dort.\n"
            f"✅ Thanks! Your application is in {channel.mention}. We'll reply there.",
            ephemeral=True)


# ---------- Ticket -----------------------------------------------------------
async def get_ticket_category(guild):
    cat = discord.utils.get(guild.categories, name=TICKET_CATEGORY)
    if cat:
        return cat
    ow = {guild.default_role: discord.PermissionOverwrite(view_channel=False)}
    for name in (MOD_ROLE, DEV_ROLE):
        r = role(guild, name)
        if r:
            ow[r] = discord.PermissionOverwrite(view_channel=True, send_messages=True,
                                                read_message_history=True)
    return await guild.create_category(TICKET_CATEGORY, overwrites=ow,
                                       reason="Kategorie fuer Beta-Bewerbungen")


def slug(text):
    s = re.sub(r"[^a-z0-9-]", "", text.lower().replace(" ", "-").replace(".", "-"))
    return s[:20] or "user"


def answers_embed(member, answers, status="🟡 Offen / Open"):
    e = discord.Embed(title=f"📝 Beta-Bewerbung: {member.display_name}",
                      colour=discord.Colour(COLOR))
    e.set_thumbnail(url=member.display_avatar.url)
    for key, label in QUESTIONS:
        e.add_field(name=label, value=answers.get(key) or "-", inline=False)
    created = discord.utils.format_dt(member.created_at, "D")
    joined = discord.utils.format_dt(member.joined_at, "D") if member.joined_at else "-"
    e.add_field(name="Discord-Account erstellt", value=created, inline=True)
    e.add_field(name="Auf dem Server seit", value=joined, inline=True)
    e.add_field(name="Status", value=status, inline=False)
    e.set_footer(text=f"User-ID: {member.id}")
    return e


async def create_ticket(guild, member, answers):
    cat = await get_ticket_category(guild)
    ow = dict(cat.overwrites)
    ow[member] = discord.PermissionOverwrite(view_channel=True, send_messages=True,
                                             read_message_history=True, attach_files=True)
    ch = await guild.create_text_channel(f"bewerbung-{slug(member.name)}", category=cat,
                                         overwrites=ow, reason="Beta-Bewerbung")

    pings = " ".join(r.mention for r in (role(guild, MOD_ROLE), role(guild, DEV_ROLE)) if r)
    await ch.send(
        f"{member.mention} {pings}\n"
        "**🇩🇪** Danke für deine Bewerbung! Das Team schaut sie sich an. "
        "Hier kannst du auch Fragen stellen.\n"
        "**🇬🇧** Thanks for applying! The team will review it. You can ask questions here too.",
        embed=answers_embed(member, answers),
        view=StaffView(),
        allowed_mentions=discord.AllowedMentions(users=True, roles=True),
    )
    store.tickets[str(member.id)] = {
        "channel": ch.id, "answers": answers, "status": "open",
        "created": time.time(), "name": str(member), "decided_by": None,
    }
    await store.save()
    return ch


class RejectModal(discord.ui.Modal, title="Bewerbung ablehnen"):
    grund = discord.ui.TextInput(label="Grund (die Person bekommt ihn per DM)",
                                 style=discord.TextStyle.paragraph, max_length=200)

    async def on_submit(self, interaction: discord.Interaction):
        await handle_staff(interaction, "reject", self.grund.value.strip())


class StaffView(discord.ui.View):
    """Buttons im Ticket. Nur Mods/Devs/Admins duerfen klicken."""

    def __init__(self, decided=False):
        super().__init__(timeout=None)
        if not decided:
            self._add("Annehmen / Accept", "✅", discord.ButtonStyle.success, "accept")
            self._add("Warteliste / Waitlist", "⏳", discord.ButtonStyle.secondary, "waitlist")
            self._add("Ablehnen / Reject", "❌", discord.ButtonStyle.danger, "reject")
        self._add("Ticket schließen / Close", "🔒", discord.ButtonStyle.secondary, "close")

    def _add(self, label, emoji, style, action):
        b = discord.ui.Button(label=label, emoji=emoji, style=style,
                              custom_id=f"wg_app:{action}")

        async def cb(interaction, action=action):
            await handle_staff(interaction, action)
        b.callback = cb
        self.add_item(b)


async def handle_staff(interaction: discord.Interaction, action: str, grund=None):
    guild = interaction.guild
    staff = interaction.user
    uid, ticket = store.ticket_by_channel(interaction.channel.id)

    if action != "close" and not is_staff(staff):
        await interaction.response.send_message("Nur das Team kann entscheiden.", ephemeral=True)
        return
    if action == "close" and not is_staff(staff):
        await interaction.response.send_message("Nur das Team kann Tickets schließen.", ephemeral=True)
        return
    if ticket is None:
        await interaction.response.send_message(
            "Zu diesem Channel gibt es keine gespeicherte Bewerbung mehr.", ephemeral=True)
        return

    member = guild.get_member(int(uid))
    if member is None:
        try:
            member = await guild.fetch_member(int(uid))
        except discord.HTTPException:
            member = None

    if action == "close":
        await interaction.response.send_message("🔒 Ticket wird in 5 Sekunden geschlossen ...")
        await close_ticket(guild, uid, ticket, staff, member)
        return

    if action == "accept" and store.wave_full():
        await interaction.response.send_message(
            f"🔴 Welle {store.wave['number']} ist voll ({store.wave['accepted']}/{store.wave['limit']}). "
            "Starte mit `/beta-welle` eine neue Welle oder setz die Person auf die Warteliste.",
            ephemeral=True)
        return

    if action == "reject" and not grund:
        await interaction.response.send_modal(RejectModal())   # kommt mit dem Grund zurück
        return

    await interaction.response.defer()
    open_r, beta_r, rej_r = role(guild, OPEN_ROLE), role(guild, BETA_ROLE), role(guild, REJECTED_ROLE)
    dm_ok = True

    license_note = ""
    if action == "accept":
        if member:
            await member.add_roles(*[r for r in (beta_r,) if r], reason=f"Beta angenommen von {staff}")
            await member.remove_roles(*[r for r in (open_r, rej_r) if r and r in member.roles])
            key_text = ""
            if supabase_config():
                try:
                    key = await license_create(member)
                    key_text = "\n\n" + license_dm_text(key)
                    license_note = "\n🔑 Lizenzschlüssel erstellt und per DM verschickt."
                except Exception as e:  # noqa: BLE001
                    print(f"[Lizenz] Fehler beim Erstellen: {e}", flush=True)
                    license_note = "\n⚠️ Lizenzschlüssel konnte nicht erstellt werden – bitte `/lizenz-erstellen` nutzen."
            dm_ok = await send_dm(member,
                f"🎉 **Glückwunsch!** Deine Bewerbung für die Beta des WorldGaming Hub wurde angenommen. "
                f"Den Download findest du jetzt auf dem Server im Channel **download**.\n\n"
                f"🎉 **Congrats!** You've been accepted to the WorldGaming Hub beta. "
                f"You'll find the download in the **download** channel." + key_text)
            if not dm_ok and license_note.startswith("\n🔑"):
                license_note = ("\n⚠️ Schlüssel erstellt, aber die DM kam nicht an. "
                                "Mit `/lizenz-erstellen` einen neuen erzeugen und selbst schicken.")
        store.wave["accepted"] += 1
        store.rejections.pop(uid, None)
        ticket["status"] = "accepted"
        status_text = f"✅ Angenommen von {staff.display_name}"
        decided = True
    elif action == "waitlist":
        ticket["status"] = "waitlist"
        if member:
            dm_ok = await send_dm(member,
                "⏳ Deine Bewerbung für die WorldGaming-Hub-Beta steht auf der **Warteliste**. "
                "Wir melden uns, sobald neue Plätze frei werden.\n\n"
                "⏳ Your WorldGaming Hub beta application is on the **waitlist**. "
                "We'll get back to you when new spots open up.")
        status_text = f"⏳ Warteliste (von {staff.display_name})"
        decided = False
    else:  # reject
        if member:
            await member.add_roles(*[r for r in (rej_r,) if r], reason=f"Beta abgelehnt von {staff}")
            if open_r and open_r in member.roles:
                await member.remove_roles(open_r)
            dm_ok = await send_dm(member,
                f"Danke für deine Bewerbung für die WorldGaming-Hub-Beta. Diesmal hat es leider "
                f"nicht geklappt.\n**Grund:** {grund}\n"
                f"Du kannst dich in **{COOLDOWN_DAYS} Tagen** erneut bewerben.\n\n"
                f"Thanks for applying to the WorldGaming Hub beta. Unfortunately it didn't work "
                f"out this time.\n**Reason:** {grund}\n"
                f"You can apply again in **{COOLDOWN_DAYS} days**.")
        store.rejections[uid] = time.time()
        ticket["status"] = "rejected"
        ticket["reason"] = grund
        status_text = f"❌ Abgelehnt von {staff.display_name}: {grund}"
        decided = True

    ticket["decided_by"] = str(staff)
    await store.save()

    # Ticketnachricht aktualisieren
    try:
        msg = interaction.message
        if member:
            await msg.edit(embed=answers_embed(member, ticket["answers"], status_text),
                           view=StaffView(decided=decided))
        else:
            await msg.edit(view=StaffView(decided=decided))
    except discord.HTTPException:
        pass
    note = "" if dm_ok else "\n⚠️ DM konnte nicht zugestellt werden (DMs geschlossen)."
    await interaction.followup.send(f"{status_text}{note}{license_note}")
    if action == "accept":
        await update_panel(guild)


async def close_ticket(guild, uid, ticket, staff, member):
    channel = guild.get_channel(ticket["channel"])

    # Wurde nie entschieden: Rolle "Bewerbung offen" wieder entfernen
    if ticket["status"] in ("open", "waitlist") and member:
        r = role(guild, OPEN_ROLE)
        if r and r in member.roles:
            try:
                await member.remove_roles(r)
            except discord.HTTPException:
                pass

    # Protokoll erstellen
    lines = []
    if channel:
        async for m in channel.history(limit=500, oldest_first=True):
            stamp = m.created_at.strftime("%d.%m.%Y %H:%M")
            text = m.content or ""
            if m.embeds and not text:
                text = f"[Embed: {m.embeds[0].title}]"
            lines.append(f"[{stamp}] {m.author}: {text}")
    transcript = discord.File(io.BytesIO("\n".join(lines).encode("utf-8")),
                              filename=f"ticket-{ticket['name']}.txt")

    log = discord.utils.get(guild.text_channels, name=LOG_CHANNEL)
    if log:
        labels = {"open": "🟡 Ohne Entscheidung geschlossen", "waitlist": "⏳ Warteliste",
                  "accepted": "✅ Angenommen", "rejected": "❌ Abgelehnt"}
        e = discord.Embed(title=f"📁 Bewerbung: {ticket['name']}", colour=discord.Colour(COLOR))
        for key, label in QUESTIONS:
            e.add_field(name=label, value=ticket["answers"].get(key) or "-", inline=False)
        e.add_field(name="Ergebnis", value=labels.get(ticket["status"], ticket["status"]), inline=True)
        if ticket.get("reason"):
            e.add_field(name="Grund", value=ticket["reason"], inline=True)
        e.add_field(name="Entschieden von", value=ticket.get("decided_by") or "-", inline=True)
        e.add_field(name="Geschlossen von", value=str(staff), inline=True)
        e.set_footer(text=f"User-ID: {uid}")
        e.timestamp = datetime.now(timezone.utc)
        await log.send(embed=e, file=transcript)

    store.tickets.pop(uid, None)
    await store.save()
    if channel:
        await asyncio.sleep(5)
        try:
            await channel.delete(reason=f"Ticket geschlossen von {staff}")
        except discord.HTTPException:
            pass


# ===========================================================================
# Modul 3: LoL-Patchnotes
# ===========================================================================
DDRAGON_VERSIONS = "https://ddragon.leagueoflegends.com/api/versions.json"
PATCH_CHANNEL = "patch-notes"
PATCH_HOOK_NAME = "LoL Patchnotes"
PATCH_OVERVIEW_DE = "https://www.leagueoflegends.com/de-de/news/tags/patch-notes/"
PATCH_OVERVIEW_EN = "https://www.leagueoflegends.com/en-gb/news/tags/patch-notes/"


def patch_from_version(version):
    """Data-Dragon-Version (z. B. 16.21.1) -> Patchname (z. B. 26.21)."""
    major, minor = (int(x) for x in version.split(".")[:2])
    # Riot zaehlt Data Dragon seit 2025 als 15.x, 16.x ... -> Patch 25.x, 26.x
    year = major if major >= 20 else major + 10
    return year, minor


async def fetch_text(session, url):
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as r:
            if r.status != 200:
                return None
            return await r.text()
    except (aiohttp.ClientError, asyncio.TimeoutError):
        return None


async def latest_version(session):
    try:
        async with session.get(DDRAGON_VERSIONS, timeout=aiohttp.ClientTimeout(total=15)) as r:
            if r.status != 200:
                return None
            versions = await r.json(content_type=None)
            return versions[0] if versions else None
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
        return None


async def build_patch_embed(session, version):
    year, num = patch_from_version(version)
    url_de = f"https://www.leagueoflegends.com/de-de/news/game-updates/patch-{year}-{num}-notes/"
    url_en = f"https://www.leagueoflegends.com/en-gb/news/game-updates/patch-{year}-{num}-notes/"

    page = await fetch_text(session, url_de)
    if page is None:
        url_de, url_en = PATCH_OVERVIEW_DE, PATCH_OVERVIEW_EN
    image = None
    if page:
        m = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', page) or \
            re.search(r'<meta[^>]+content="([^"]+)"[^>]+property="og:image"', page)
        if m:
            image = m.group(1).replace("&amp;", "&")

    e = discord.Embed(
        title=f"📜 Patch {year}.{num} ist da! / is live!",
        url=url_de,
        colour=discord.Colour(0xC89B3C),
        description=(
            f"**🇩🇪** Patch **{year}.{num}** ist live. Alle Änderungen an Champions, Items "
            f"und mehr findest du in den [offiziellen Patchnotes]({url_de}).\n\n"
            f"**🇬🇧** Patch **{year}.{num}** is live. Check out all champion, item and other "
            f"changes in the [official patch notes]({url_en})."
        ),
    )
    if image:
        e.set_image(url=image)
    e.set_footer(text=f"Spielversion / Game version {version}")
    e.timestamp = datetime.now(timezone.utc)
    return e


async def post_patch(guild, session, version):
    channel = discord.utils.get(guild.text_channels, name=PATCH_CHANNEL)
    if channel is None:
        return False
    hook = None
    for h in await channel.webhooks():
        if h.name == PATCH_HOOK_NAME:
            hook = h
            break
    if hook is None:
        hook = await channel.create_webhook(name=PATCH_HOOK_NAME, reason="LoL-Patchnotes")
    embed = await build_patch_embed(session, version)
    avatar = f"https://ddragon.leagueoflegends.com/cdn/{version}/img/profileicon/29.png"
    await hook.send(embed=embed, username=PATCH_HOOK_NAME, avatar_url=avatar)
    return True



# ===========================================================================
# Modul 4: Lizenzschlüssel fürs Hub
# ===========================================================================
KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # ohne 0/O und 1/I


def supabase_config():
    try:
        c = json.loads(SUPABASE_FILE.read_text(encoding="utf-8"))
        if c.get("url") and c.get("secret_key"):
            return c
    except (OSError, ValueError):
        pass
    return None


def new_license_key():
    body = "".join(secrets.choice(KEY_ALPHABET) for _ in range(12))
    return f"WG-{body[0:4]}-{body[4:8]}-{body[8:12]}"


def key_hash(key):
    norm = re.sub(r"[^A-Z0-9]", "", key.upper())
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


async def sb_request(method, path, body=None, prefer="return=minimal"):
    c = supabase_config()
    if c is None:
        raise RuntimeError("supabase.json fehlt auf dem Server")
    key = c["secret_key"]
    headers = {"apikey": key, "Content-Type": "application/json", "Prefer": prefer}
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    url = c["url"].rstrip("/") + path
    async with bot.session.request(method, url, json=body, headers=headers,
                                   timeout=aiohttp.ClientTimeout(total=15)) as r:
        if r.status >= 300:
            text = await r.text()
            raise RuntimeError(f"Supabase {r.status}: {text[:200]}")
        if "return=representation" in prefer:
            return await r.json(content_type=None)
        return None


async def license_revoke(discord_id, grund=None):
    """Sperrt alle aktiven Schlüssel einer Person. Gibt die Anzahl zurück."""
    rows = await sb_request(
        "PATCH", f"/rest/v1/lizenzen?discord_id=eq.{discord_id}&revoked=is.false",
        {"revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat(),
         "revoked_reason": grund},
        prefer="return=representation")
    return len(rows or [])


def removal_dm_text(guild_name, grund):
    return (f"🔒 **{guild_name}:** Dein Zugang zum WorldGaming Hub wurde entfernt.\n"
            f"**Grund:** {grund}\n\n"
            f"🔒 **{guild_name}:** Your access to the WorldGaming Hub has been removed.\n"
            f"**Reason:** {grund}")


async def send_log(guild, embed):
    """Schreibt ins mod-log. Geht das nicht: in #bewerbungen.
    Gibt den Channelnamen zurück oder None, wenn beides nicht ging."""
    for name in (MOD_LOG_CHANNEL, LOG_CHANNEL):
        ch = discord.utils.get(guild.text_channels, name=name)
        if ch is None:
            continue
        try:
            await ch.send(embed=embed)
            return name
        except discord.HTTPException:
            continue
    return None


async def log_removal(guild, nutzer, von, grund, titel):
    e = discord.Embed(title=titel, colour=discord.Colour(COLOR),
                      timestamp=datetime.now(timezone.utc))
    e.add_field(name="Nutzer", value=f"{nutzer.mention} ({nutzer})", inline=False)
    e.add_field(name="Grund", value=grund, inline=False)
    e.add_field(name="Von", value=str(von), inline=False)
    return await send_log(guild, e)


async def license_create(member):
    """Alten Schlüssel sperren, neuen anlegen. Gibt den Klartext-Schlüssel zurück."""
    await license_revoke(member.id, "Neuer Schlüssel erstellt")
    key = new_license_key()
    await sb_request("POST", "/rest/v1/lizenzen", {
        "key_hash": key_hash(key),
        "key_hint": key[-4:],
        "discord_id": str(member.id),
        "discord_name": member.display_name[:60],
    })
    return key


async def license_reset(discord_id):
    """Gibt den aktiven Schlüssel für einen neuen PC frei."""
    rows = await sb_request(
        "PATCH", f"/rest/v1/lizenzen?discord_id=eq.{discord_id}&revoked=is.false",
        {"device_hash": None, "activated_at": None},
        prefer="return=representation")
    return len(rows or [])


def license_dm_text(key):
    return (
        f"🔑 **Dein persönlicher Beta-Schlüssel für den WorldGaming Hub:**\n"
        f"```{key}```\n"
        f"**So geht's:** Lade das Setup im Channel **download** herunter, installiere es und gib "
        f"beim ersten Start diesen Schlüssel ein. Er wird dabei **an deinen PC gebunden** und "
        f"funktioniert nirgendwo sonst – also bitte nicht weitergeben.\n"
        f"Neuer PC? Melde dich bei uns, dann setzen wir ihn zurück.\n\n"
        f"🔑 **Your personal WorldGaming Hub beta key** is above. Download the setup in **download**, "
        f"install it and enter the key on first start. It gets locked to your PC, so please don't share it."
    )


# ===========================================================================
# Modul 5: Download-Nachricht (zeigt immer die neueste Version von GitHub)
# ===========================================================================
GITHUB_REPO = "K34NU-code/worldgaming-hub"
RELEASES_URL = f"https://github.com/{GITHUB_REPO}/releases/latest"
GITHUB_API = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"


async def latest_release(session):
    """Holt Version, Datum und Setup-Link des neuesten Releases (oder None)."""
    try:
        async with session.get(GITHUB_API, headers={"Accept": "application/vnd.github+json",
                                                    "User-Agent": "WorldGaming-Bot"},
                               timeout=aiohttp.ClientTimeout(total=15)) as r:
            if r.status != 200:
                return None
            d = await r.json(content_type=None)
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
        return None
    setup = next((a.get("browser_download_url") for a in d.get("assets", [])
                  if str(a.get("name", "")).lower().endswith(".exe")), None)
    return {
        "version": str(d.get("tag_name") or d.get("name") or "").lstrip("vV"),
        "date": d.get("published_at"),
        "setup": setup,
        "page": d.get("html_url") or RELEASES_URL,
    }


def download_embed(rel):
    version = rel["version"] if rel else "?"
    e = discord.Embed(
        title="📥 WorldGaming Hub – Download",
        colour=discord.Colour(COLOR),
        description=(
            "**🇩🇪**\n"
            "1️⃣ Klick unten auf **Setup herunterladen** und installiere das Hub.\n"
            "2️⃣ Beim ersten Start gibst du deinen **Beta-Schlüssel** ein (kam vom Bot per DM).\n"
            "3️⃣ Updates kommen danach **automatisch**.\n"
            "Probleme? Schreib in **bug-reports**.\n\n"
            "**🇬🇧**\n"
            "1️⃣ Click **Setup herunterladen** below and install the Hub.\n"
            "2️⃣ Enter your **beta key** on first start (the bot sent it via DM).\n"
            "3️⃣ Updates install **automatically** after that.\n"
            "Problems? Post in **bug-reports**."
        ),
    )
    e.add_field(name="Version", value=f"**{version}**", inline=True)
    if rel and rel.get("date"):
        try:
            dt = datetime.fromisoformat(rel["date"].replace("Z", "+00:00"))
            e.add_field(name="Veröffentlicht / Released", value=discord.utils.format_dt(dt, "D"), inline=True)
        except ValueError:
            pass
    e.add_field(name="System", value="Windows 10/11", inline=True)
    e.set_footer(text="Der Schlüssel gilt nur für einen PC · The key works on one PC only")
    return e


def download_view(rel):
    v = discord.ui.View(timeout=None)
    url = (rel or {}).get("setup") or RELEASES_URL
    v.add_item(discord.ui.Button(label="Setup herunterladen / Download", emoji="⬇️",
                                 style=discord.ButtonStyle.link, url=url))
    v.add_item(discord.ui.Button(label="Alle Versionen / All releases", style=discord.ButtonStyle.link,
                                 url=f"https://github.com/{GITHUB_REPO}/releases"))
    return v


async def update_download_message(guild_or_none=None):
    p = store.data.get("download_msg")
    if not p:
        return
    rel = await latest_release(bot.session)
    if not rel or rel["version"] == p.get("version"):
        return
    ch = bot.get_channel(p["channel"])
    if ch is None:
        return
    try:
        msg = await ch.fetch_message(p["message"])
        await msg.edit(embed=download_embed(rel), view=download_view(rel))
        p["version"] = rel["version"]
        await store.save()
        print(f"[Download] Nachricht auf Version {rel['version']} aktualisiert", flush=True)
    except discord.HTTPException:
        pass



async def send_backup():
    if not DATA_FILE.exists():
        return False
    sent = False
    for g in bot.guilds:
        ch = discord.utils.get(g.text_channels, name=BACKUP_CHANNEL)
        if ch is None:
            continue
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        try:
            await ch.send(f"💾 Backup vom {stamp} ({len(store.tickets)} offene Tickets, "
                          f"Welle {store.wave['number']}: {store.wave['accepted']}/{store.wave['limit']})",
                          file=discord.File(io.BytesIO(DATA_FILE.read_bytes()), filename=f"data-{stamp}.json"))
            sent = True
        except discord.HTTPException as e:
            print(f"[Backup] Senden fehlgeschlagen: {e}", flush=True)
    return sent

# ===========================================================================
# Bot
# ===========================================================================
# ===========================================================================
# Modul 7: Inaktivitäts-Sperre
# ===========================================================================
# Es zählt das letzte gewertete League-Spiel mit laufendem Hub (Spalte last_game).
# Für Leute ohne Spiel zählen Erstellung bzw. Aktivierung des Schlüssels, und niemand
# wird früher als 14 Tage nach dem Einschalten von /inaktiv-sperre gesperrt.
# Bis dahin läuft nur der Probelauf: Der Bot meldet einmal täglich im mod-log, wen es
# treffen würde, und tut sonst nichts.
INACTIVE_WARN_DAYS = 10
INACTIVE_REMOVE_DAYS = 14
INACTIVE_REASON = "Inactivity"
ROLE_REMOVED_REASON = "Beta-Rolle entfernt / Beta role removed"


def parse_ts(value):
    if not value:
        return 0
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def beta_members(user_id):
    """Die Person auf allen Servern, auf denen sie die Beta-Rolle hat."""
    found = []
    for g in bot.guilds:
        m = g.get_member(int(user_id))
        r = role(g, BETA_ROLE)
        if m and r and r in m.roles:
            found.append(m)
    return found


async def inactive_list():
    """[(user_id, members, Tage seit der letzten Nutzung)], längste Pause zuerst.
    Enthält nur aktive Schlüssel von Beta-Testern ohne Ausnahme."""
    s = store.data["inactivity"]
    rows = await sb_request(
        "GET", "/rest/v1/lizenzen?revoked=is.false"
               "&select=discord_id,created_at,activated_at,last_game",
        prefer="return=representation")
    now = time.time()
    result = []
    for row in rows or []:
        uid = row["discord_id"]
        members = beta_members(uid)
        if not members or uid in s["exempt"] or any(is_staff(m) for m in members):
            continue
        last = max(parse_ts(row.get("last_game")), parse_ts(row.get("activated_at")),
                   parse_ts(row.get("created_at")), s["start"])
        result.append((uid, members, (now - last) / 86400))
    result.sort(key=lambda x: x[2], reverse=True)
    return result


def inactive_warn_text(days_left):
    return (f"⏰ **WorldGaming Hub:** Du hast seit {INACTIVE_WARN_DAYS} Tagen kein Spiel mit dem Hub gespielt. "
            f"Spiel in den nächsten {days_left} Tagen eine Runde mit laufendem Hub, sonst wird dein "
            f"Beta-Platz automatisch für neue Tester freigegeben.\n\n"
            f"⏰ **WorldGaming Hub:** You haven't played a game with the Hub for {INACTIVE_WARN_DAYS} days. "
            f"Play a game with the Hub running within the next {days_left} days, otherwise your "
            f"beta spot will automatically be given to new testers.")


async def remove_inactive(user_id, members):
    await license_revoke(user_id, INACTIVE_REASON)
    for m in members:
        await m.remove_roles(role(m.guild, BETA_ROLE), reason=f"Automatisch: {INACTIVE_REASON}")
        await log_removal(m.guild, m, bot.user, INACTIVE_REASON, "🔒 Automatisch aus der Beta entfernt")
    await send_dm(members[0], removal_dm_text(members[0].guild.name, INACTIVE_REASON))
    if store.wave["accepted"] > 0:
        store.wave["accepted"] -= 1
        await update_panel(members[0].guild)


async def inactivity_tick():
    if not supabase_config():
        return
    s = store.data["inactivity"]
    now = time.time()
    due = [x for x in await inactive_list() if x[2] >= INACTIVE_WARN_DAYS]

    if not s["live"]:
        if due and now - s["last_report"] >= 86400:
            lines = {}
            for _uid, members, days in due:
                action = "würde gesperrt" if days >= INACTIVE_REMOVE_DAYS else "würde gewarnt"
                m = members[0]
                lines.setdefault(m.guild, []).append(f"{m.display_name}: {int(days)} Tage, {action}")
            for g, entries in lines.items():
                e = discord.Embed(title="🧪 Probelauf Inaktivitäts-Sperre", colour=discord.Colour(COLOR),
                                  description="\n".join(entries)[:3900])
                e.set_footer(text="Noch passiert nichts. Scharf schalten: /inaktiv-sperre")
                await send_log(g, e)
            s["last_report"] = now
            await store.save()
        return

    warned = s["warned"]
    due_ids = {uid for uid, _m, _d in due}
    for uid in list(warned):
        if uid not in due_ids:
            warned.pop(uid)            # hat wieder gespielt oder ist weg
    wait = (INACTIVE_REMOVE_DAYS - INACTIVE_WARN_DAYS) * 86400
    for uid, members, days in due:
        if uid not in warned:
            # Auch nach einer Bot-Pause: erst warnen, dann die volle Frist abwarten
            await send_dm(members[0], inactive_warn_text(INACTIVE_REMOVE_DAYS - INACTIVE_WARN_DAYS))
            warned[uid] = now
        elif days >= INACTIVE_REMOVE_DAYS and now - warned[uid] >= wait:
            await remove_inactive(uid, members)
            warned.pop(uid)
    await store.save()


# ===========================================================================
# Modul 8: Discord-Punkte
# ===========================================================================
# Gezählt wird nur, DASS jemand schreibt. Der Text wird weder gelesen noch gespeichert.
MESSAGE_POINTS = 1
MESSAGE_COOLDOWN = 60       # höchstens 1x pro Minute
VOICE_POINTS = 1            # pro 10 Minuten, siehe voice_points
PACK_PRICE = 50             # Discord-Punkte für ein Kartenpack im Hub
PACK_WEEK_LIMIT = 3


def add_points(user_id, amount):
    uid = str(user_id)
    store.data["points"][uid] = store.data["points"].get(uid, 0) + amount
    bot.points_dirty = True


def is_beta(member):
    return any(r.name == BETA_ROLE for r in member.roles)


def voice_earners(channel):
    """Wer bekommt gerade Punkte? Mindestens zwei Leute müssen wirklich dabei sein,
    Punkte bekommen nur Beta-Tester."""
    active = [m for m in channel.members if not m.bot and m.voice
              and not (m.voice.self_mute or m.voice.self_deaf or m.voice.mute or m.voice.deaf)]
    return [m for m in active if is_beta(m)] if len(active) >= 2 else []


async def post_voice_points(member, earned):
    """Meldung im Punkte-Channel, sobald jemand Voice verlässt."""
    channel = discord.utils.find(lambda c: "punkte" in c.name.lower(), member.guild.text_channels)
    if channel is None:
        return
    total = store.data["points"].get(str(member.id), 0)
    try:
        await channel.send(f"⭐ **{member.display_name}** hat im Voice **{earned}** Punkte gesammelt. Gesamt: **{total}**\n"
                           f"⭐ **{member.display_name}** earned **{earned}** points in voice. Total: **{total}**")
    except discord.HTTPException as e:
        print(f"[Punkte] Meldung fehlgeschlagen: {e}", flush=True)


class WGBot(discord.Client):
    def __init__(self):
        intents = discord.Intents.default()
        intents.members = True
        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)
        self.points_dirty = False
        self.message_times = {}     # user_id -> letzte gewertete Nachricht
        self.voice_session = {}     # user_id -> Punkte seit dem Betreten von Voice

    async def setup_hook(self):
        self.add_view(RoleView())
        self.add_view(PanelView())
        self.add_view(StaffView())
        self.session = aiohttp.ClientSession()
        self.cooldown_check.start()
        self.patch_check.start()
        self.download_check.start()
        self.daily_backup.start()
        self.inactivity_check.start()
        self.voice_points.start()

    async def close(self):
        if getattr(self, "session", None):
            await self.session.close()
        await super().close()

    @tasks.loop(minutes=30)
    async def patch_check(self):
        """Prueft alle 30 Minuten, ob es einen neuen LoL-Patch gibt."""
        version = await latest_version(self.session)
        if not version:
            return
        patch = ".".join(version.split(".")[:2])
        last = store.data.get("last_patch")
        if last is None:
            # Erster Start: aktuellen Patch merken, nichts posten
            store.data["last_patch"] = patch
            await store.save()
            print(f"[Patchnotes] Aktueller Patch gemerkt: {version}", flush=True)
            return
        if patch == last:
            return
        print(f"[Patchnotes] Neuer Patch: {version}", flush=True)
        for g in self.guilds:
            try:
                await post_patch(g, self.session, version)
            except discord.HTTPException as e:
                print(f"[Patchnotes] Posten auf {g.name} fehlgeschlagen: {e}", flush=True)
        store.data["last_patch"] = patch
        await store.save()

    @patch_check.before_loop
    async def before_patch(self):
        await self.wait_until_ready()

    @tasks.loop(minutes=30)
    async def download_check(self):
        """Neue Version auf GitHub? Dann die Download-Nachricht aktualisieren."""
        await update_download_message()

    @download_check.before_loop
    async def before_download(self):
        await self.wait_until_ready()

    @tasks.loop(time=dtime(hour=4, minute=30, tzinfo=timezone.utc))
    async def daily_backup(self):
        """Schickt data.json einmal am Tag in #bot-backup (Sicherung außerhalb des Servers)."""
        await send_backup()

    @daily_backup.before_loop
    async def before_backup(self):
        await self.wait_until_ready()

    async def on_ready(self):
        for g in self.guilds:
            self.tree.copy_global_to(guild=g)
            await self.tree.sync(guild=g)
        print(f"Online als {self.user} auf: {', '.join(g.name for g in self.guilds)}", flush=True)

    async def on_message(self, message):
        """Punkte fürs Schreiben (ohne den Inhalt anzusehen)."""
        if message.guild is None or message.author.bot or message.is_system():
            return
        if not is_beta(message.author):
            return
        now = time.time()
        if now - self.message_times.get(message.author.id, 0) < MESSAGE_COOLDOWN:
            return
        self.message_times[message.author.id] = now
        add_points(message.author.id, MESSAGE_POINTS)

    @tasks.loop(minutes=10)
    async def voice_points(self):
        for g in self.guilds:
            for channel in g.voice_channels:
                if channel == g.afk_channel:
                    continue
                for m in voice_earners(channel):
                    add_points(m.id, VOICE_POINTS)
                    self.voice_session[m.id] = self.voice_session.get(m.id, 0) + VOICE_POINTS
        if self.points_dirty:
            self.points_dirty = False
            await store.save()

    async def on_voice_state_update(self, member, before, after):
        """Voice ganz verlassen: Punkte der Sitzung melden. Channel-Wechsel zählt nicht."""
        if before.channel is None or after.channel is not None:
            return
        earned = self.voice_session.pop(member.id, 0)
        if earned:
            await post_voice_points(member, earned)

    @voice_points.before_loop
    async def before_voice(self):
        await self.wait_until_ready()

    @tasks.loop(hours=1)
    async def inactivity_check(self):
        try:
            await inactivity_tick()
        except Exception as e:  # noqa: BLE001
            print(f"[Inaktivität] Fehler: {e!r}", flush=True)

    @inactivity_check.before_loop
    async def before_inactivity(self):
        await self.wait_until_ready()

    async def on_guild_channel_delete(self, channel):
        uid, ticket = store.ticket_by_channel(channel.id)
        if uid:
            store.tickets.pop(uid, None)
            await store.save()

    async def on_member_update(self, before, after):
        """Beta-Rolle von Hand weggenommen -> Lizenz sperren."""
        had = any(r.name == BETA_ROLE for r in before.roles)
        has = any(r.name == BETA_ROLE for r in after.roles)
        if had and not has and supabase_config():
            try:
                n = await license_revoke(after.id, ROLE_REMOVED_REASON)
                if n:
                    print(f"[Lizenz] {after} gesperrt (Beta-Rolle entfernt)", flush=True)
                    await send_dm(after, removal_dm_text(after.guild.name, ROLE_REMOVED_REASON))
                    await log_removal(after.guild, after, "von Hand", ROLE_REMOVED_REASON,
                                      "🔒 Hub-Schlüssel gesperrt")
            except Exception as e:  # noqa: BLE001
                print(f"[Lizenz] Sperren fehlgeschlagen: {e}", flush=True)

    async def on_member_remove(self, member):
        if supabase_config():
            try:
                await license_revoke(member.id, "Server verlassen")
            except Exception as e:  # noqa: BLE001
                print(f"[Lizenz] Sperren fehlgeschlagen: {e}", flush=True)
        t = store.tickets.get(str(member.id))
        if t:
            ch = member.guild.get_channel(t["channel"])
            if ch:
                await ch.send(f"👋 {member} hat den Server verlassen. Ticket kann geschlossen werden.")

    @tasks.loop(hours=1)
    async def cooldown_check(self):
        """Nimmt nach 30 Tagen die Rolle 'Beta abgelehnt' wieder weg."""
        changed = False
        for uid, ts in list(store.rejections.items()):
            if time.time() - ts < COOLDOWN_DAYS * 86400:
                continue
            for g in self.guilds:
                m = g.get_member(int(uid))
                r = role(g, REJECTED_ROLE)
                if m and r and r in m.roles:
                    try:
                        await m.remove_roles(r, reason="30-Tage-Sperre abgelaufen")
                    except discord.HTTPException:
                        pass
            store.rejections.pop(uid, None)
            changed = True
        if changed:
            await store.save()

    @cooldown_check.before_loop
    async def before_cooldown(self):
        await self.wait_until_ready()


bot = WGBot()


@bot.tree.error
async def on_app_error(interaction, error):
    print(f"[Fehler] {error!r}", flush=True)
    text = "❌ Da ist etwas schiefgelaufen. Bitte nochmal versuchen."
    try:
        if interaction.response.is_done():
            await interaction.followup.send(text, ephemeral=True)
        else:
            await interaction.response.send_message(text, ephemeral=True)
    except discord.HTTPException:
        pass


# ---------- Admin-Befehle ----------------------------------------------------
@bot.tree.command(name="rollen-nachricht", description="Postet die Rollenauswahl in diesen Channel")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def post_roles(interaction: discord.Interaction):
    await interaction.channel.send(embed=role_embed(), view=RoleView())
    await interaction.response.send_message("✅ Rollenauswahl gepostet.", ephemeral=True)


@bot.tree.command(name="beta-nachricht", description="Postet die Beta-Bewerbung mit Button in diesen Channel")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def post_panel(interaction: discord.Interaction):
    msg = await interaction.channel.send(embed=panel_embed(),
                                         view=PanelView(disabled=store.wave_full()))
    store.data["panel"] = {"channel": interaction.channel.id, "message": msg.id}
    await store.save()
    await interaction.response.send_message("✅ Bewerbungsnachricht gepostet.", ephemeral=True)


@bot.tree.command(name="beta-welle", description="Startet eine neue Beta-Welle mit X Plätzen")
@app_commands.describe(plaetze="Wie viele Plätze hat die neue Welle?")
@app_commands.rename(plaetze="plätze")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def new_wave(interaction: discord.Interaction, plaetze: app_commands.Range[int, 0, 500]):
    store.wave["number"] += 1
    store.wave["limit"] = plaetze
    store.wave["accepted"] = 0
    await store.save()
    await update_panel(interaction.guild)
    await interaction.response.send_message(
        f"✅ Welle {store.wave['number']} gestartet mit {plaetze} Plätzen.", ephemeral=True)


@bot.tree.command(name="beta-plaetze", description="Setzt die belegten (und optional die gesamten) Plätze der aktuellen Welle")
@app_commands.describe(belegt="Wie viele Plätze sind belegt?",
                       gesamt="Optional: wie viele Plätze hat die Welle insgesamt?")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def set_spots(interaction: discord.Interaction,
                    belegt: app_commands.Range[int, 0, 500],
                    gesamt: app_commands.Range[int, 0, 500] = None):
    if gesamt is not None:
        store.wave["limit"] = gesamt
    store.wave["accepted"] = belegt
    await store.save()
    await update_panel(interaction.guild)
    w = store.wave
    await interaction.response.send_message(
        f"✅ Welle {w['number']}: jetzt {w['accepted']} / {w['limit']} Plätze belegt.", ephemeral=True)


@bot.tree.command(name="beta-entfernen", description="Nimmt jemandem die Beta-Rolle weg und gibt den Platz wieder frei")
@app_commands.describe(nutzer="Wer soll aus der Beta raus?",
                       grund="Warum? Die Person sieht das, z. B. Inactivity",
                       platz_freigeben="Soll ein Platz in der aktuellen Welle frei werden? (Standard: ja)")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def remove_tester(interaction: discord.Interaction, nutzer: discord.Member,
                        grund: app_commands.Range[str, 1, 200],
                        platz_freigeben: bool = True):
    r = role(interaction.guild, BETA_ROLE)
    if r is None or r not in nutzer.roles:
        await interaction.response.send_message(f"{nutzer.display_name} ist kein Beta-Tester.",
                                                ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    # Erst sperren, dann die Rolle nehmen: Sonst sperrt on_member_update zuerst,
    # und der Grund käme nicht mehr in der Datenbank an.
    lic = ""
    if supabase_config():
        try:
            n = await license_revoke(nutzer.id, grund)
            lic = f" Lizenzschlüssel gesperrt ({n})." if n else ""
        except Exception as e:  # noqa: BLE001
            lic = f" ⚠️ Lizenz konnte nicht gesperrt werden: {e}"
    await nutzer.remove_roles(r, reason=f"Aus der Beta entfernt von {interaction.user}: {grund}")
    dm_ok = await send_dm(nutzer, removal_dm_text(interaction.guild.name, grund))
    log_ch = await log_removal(interaction.guild, nutzer, interaction.user, grund, "🔒 Aus der Beta entfernt")
    hinweise = ("" if dm_ok else " ⚠️ DM kam nicht an.") + (
        "" if log_ch == MOD_LOG_CHANNEL else
        f" ⚠️ Der Bot konnte nicht in #{MOD_LOG_CHANNEL} schreiben"
        + (f", steht stattdessen in #{log_ch}." if log_ch else "."))
    if platz_freigeben and store.wave["accepted"] > 0:
        store.wave["accepted"] -= 1
        await store.save()
        await update_panel(interaction.guild)
    w = store.wave
    await interaction.followup.send(
        f"✅ {nutzer.display_name} ist raus aus der Beta. Welle {w['number']}: "
        f"{w['accepted']} / {w['limit']} Plätze belegt.{lic}{hinweise}", ephemeral=True)


@bot.tree.command(name="beta-status", description="Zeigt den Stand der Beta-Bewerbungen")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def beta_status(interaction: discord.Interaction):
    w = store.wave
    open_t = [t for t in store.tickets.values() if t["status"] == "open"]
    wait_t = [t for t in store.tickets.values() if t["status"] == "waitlist"]
    beta_r = role(interaction.guild, BETA_ROLE)
    text = (
        f"**Welle {w['number']}:** {w['accepted']} / {w['limit']} Plätze vergeben\n"
        f"**Offene Tickets:** {len(open_t)}\n"
        f"**Warteliste:** {len(wait_t)}"
        + (" (" + ", ".join(t["name"] for t in wait_t) + ")" if wait_t else "") + "\n"
        f"**Beta-Tester insgesamt:** {len(beta_r.members) if beta_r else '?'}\n"
        f"**In 30-Tage-Sperre:** {len(store.rejections)}"
    )
    await interaction.response.send_message(text, ephemeral=True)


@bot.tree.command(name="patchnotes-test", description="Postet die Patchnotes des aktuellen LoL-Patches in #patch-notes")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def patch_test(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True, thinking=True)
    version = await latest_version(bot.session)
    if not version:
        await interaction.followup.send("❌ Konnte die aktuelle Version nicht abrufen.", ephemeral=True)
        return
    ok = await post_patch(interaction.guild, bot.session, version)
    await interaction.followup.send(
        f"✅ Patch {version} gepostet." if ok else f"❌ Channel #{PATCH_CHANNEL} nicht gefunden.",
        ephemeral=True)



@bot.tree.command(name="lizenz-erstellen", description="Erstellt einen neuen Hub-Schlüssel (alter wird gesperrt) und schickt ihn per DM")
@app_commands.describe(nutzer="Für wen?")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def cmd_license_create(interaction: discord.Interaction, nutzer: discord.Member):
    await interaction.response.defer(ephemeral=True, thinking=True)
    if not supabase_config():
        await interaction.followup.send("❌ supabase.json fehlt auf dem Server.", ephemeral=True)
        return
    try:
        key = await license_create(nutzer)
    except Exception as e:  # noqa: BLE001
        await interaction.followup.send(f"❌ Fehler: {e}", ephemeral=True)
        return
    dm_ok = await send_dm(nutzer, license_dm_text(key))
    await interaction.followup.send(
        f"✅ Neuer Schlüssel für {nutzer.display_name}: `{key}`\n"
        + ("📨 Per DM verschickt." if dm_ok else "⚠️ DM kam nicht an – bitte selbst schicken."),
        ephemeral=True)


@bot.tree.command(name="lizenz-reset", description="Gibt den Hub-Schlüssel für einen neuen PC frei")
@app_commands.describe(nutzer="Wer hat einen neuen PC?")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def cmd_license_reset(interaction: discord.Interaction, nutzer: discord.Member):
    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        n = await license_reset(nutzer.id)
    except Exception as e:  # noqa: BLE001
        await interaction.followup.send(f"❌ Fehler: {e}", ephemeral=True)
        return
    await interaction.followup.send(
        f"✅ Schlüssel von {nutzer.display_name} freigegeben – er kann ihn jetzt auf dem neuen PC eingeben."
        if n else f"{nutzer.display_name} hat keinen aktiven Schlüssel.", ephemeral=True)


@bot.tree.command(name="lizenz-sperren", description="Sperrt den Hub-Schlüssel einer Person")
@app_commands.describe(nutzer="Wessen Schlüssel?",
                       grund="Warum? Die Person bekommt das per DM, z. B. Inactivity")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def cmd_license_revoke(interaction: discord.Interaction, nutzer: discord.Member,
                             grund: app_commands.Range[str, 1, 200]):
    await interaction.response.defer(ephemeral=True, thinking=True)
    try:
        n = await license_revoke(nutzer.id, grund)
    except Exception as e:  # noqa: BLE001
        await interaction.followup.send(f"❌ Fehler: {e}", ephemeral=True)
        return
    dm_note = ""
    if n:
        if not await send_dm(nutzer, removal_dm_text(interaction.guild.name, grund)):
            dm_note = " ⚠️ DM kam nicht an."
        await log_removal(interaction.guild, nutzer, interaction.user, grund, "🔒 Hub-Schlüssel gesperrt")
    await interaction.followup.send(
        f"✅ {n} Schlüssel von {nutzer.display_name} gesperrt. Das Hub läuft bei ihm spätestens "
        f"nach dem nächsten Start bzw. innerhalb von 6 Stunden nicht mehr.{dm_note}"
        if n else f"{nutzer.display_name} hat keinen aktiven Schlüssel.", ephemeral=True)



@bot.tree.command(name="inaktiv-status", description="Zeigt, wer bald wegen Inaktivität gewarnt oder gesperrt wird")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def inactive_status(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True, thinking=True)
    s = store.data["inactivity"]
    try:
        rows = await inactive_list()
    except Exception as e:  # noqa: BLE001
        await interaction.followup.send(f"❌ Fehler: {e}", ephemeral=True)
        return
    lines = [f"**Modus:** {'🔴 scharf' if s['live'] else '🧪 Probelauf'}",
             f"**Ausnahmen:** {len(s['exempt'])} (dazu automatisch Admins, Mods und Overlay-Devs)"]
    lines += [f"{members[0].display_name}: {int(days)} Tage"
              + (" ⏰ gewarnt" if uid in s["warned"] else "")
              for uid, members, days in rows[:30]]
    await interaction.followup.send("\n".join(lines)[:1900], ephemeral=True)


@bot.tree.command(name="inaktiv-ausnahme", description="Nimmt jemanden von der Inaktivitäts-Sperre aus (oder wieder rein)")
@app_commands.describe(nutzer="Wer?", ausnehmen="Ja: wird nie gesperrt. Nein: Ausnahme entfernen.")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def inactive_exempt(interaction: discord.Interaction, nutzer: discord.Member, ausnehmen: bool = True):
    exempt = store.data["inactivity"]["exempt"]
    uid = str(nutzer.id)
    if ausnehmen and uid not in exempt:
        exempt.append(uid)
    elif not ausnehmen and uid in exempt:
        exempt.remove(uid)
    await store.save()
    await interaction.response.send_message(
        f"✅ {nutzer.display_name} ist {'jetzt ausgenommen' if ausnehmen else 'nicht mehr ausgenommen'}.",
        ephemeral=True)


@bot.tree.command(name="inaktiv-sperre", description="Schaltet die automatische Sperre scharf oder zurück auf Probelauf")
@app_commands.describe(aktiv="Ja: scharf, alle haben ab jetzt 14 Tage. Nein: nur Probelauf.")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def inactive_live(interaction: discord.Interaction, aktiv: bool):
    s = store.data["inactivity"]
    if aktiv and not s["live"]:
        s["start"] = time.time()
        s["warned"] = {}
    s["live"] = aktiv
    await store.save()
    await interaction.response.send_message(
        f"✅ Die Sperre ist scharf. Warnung nach {INACTIVE_WARN_DAYS}, Sperre nach {INACTIVE_REMOVE_DAYS} Tagen ab jetzt."
        if aktiv else "✅ Die Sperre ist aus, es läuft nur noch der Probelauf.", ephemeral=True)


@bot.tree.command(name="punkte", description="Zeigt deinen Punktestand")
@app_commands.describe(nutzer="Optional: von wem?")
@app_commands.guild_only()
async def show_points(interaction: discord.Interaction, nutzer: discord.Member = None):
    who = nutzer or interaction.user
    points = store.data["points"].get(str(who.id), 0)
    await interaction.response.send_message(f"⭐ {who.display_name}: **{points}** Punkte", ephemeral=True)


@bot.tree.command(name="pack-einloesen", description=f"Tauscht {PACK_PRICE} Punkte gegen ein Kartenpack im Hub")
@app_commands.guild_only()
async def redeem_pack(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True, thinking=True)
    uid = str(interaction.user.id)
    points = store.data["points"]
    if points.get(uid, 0) < PACK_PRICE:
        await interaction.followup.send(
            f"Du hast {points.get(uid, 0)} Punkte, ein Pack kostet {PACK_PRICE}.\n"
            f"You have {points.get(uid, 0)} points, a pack costs {PACK_PRICE}.", ephemeral=True)
        return
    week = datetime.now(timezone.utc).strftime("%G-W%V")
    buys = store.data["pack_buys"].get(uid, {})
    count = buys.get("count", 0) if buys.get("week") == week else 0
    if count >= PACK_WEEK_LIMIT:
        await interaction.followup.send(
            f"Du hast diese Woche schon {PACK_WEEK_LIMIT} Packs eingelöst.\n"
            f"You already redeemed {PACK_WEEK_LIMIT} packs this week.", ephemeral=True)
        return
    # Erst abziehen, damit ein Doppelklick nicht zweimal einlöst
    points[uid] -= PACK_PRICE
    try:
        keys = await sb_request("GET", f"/rest/v1/lizenzen?discord_id=eq.{uid}&revoked=is.false&select=key_hint",
                                prefer="return=representation")
        if not keys:
            points[uid] += PACK_PRICE
            await interaction.followup.send("Dafür brauchst du einen aktiven Hub-Schlüssel.\n"
                                            "You need an active Hub key for this.", ephemeral=True)
            return
        await sb_request("POST", "/rest/v1/rpc/karten_pack_gutschreiben",
                         {"p_discord": uid, "p_anzahl": 1}, prefer="return=representation")
    except Exception as e:  # noqa: BLE001
        points[uid] += PACK_PRICE
        print(f"[Karten] Pack einlösen fehlgeschlagen: {e}", flush=True)
        await interaction.followup.send("❌ Das hat nicht geklappt, deine Punkte sind noch da.\n"
                                        "❌ That didn't work, you still have your points.", ephemeral=True)
        return
    store.data["pack_buys"][uid] = {"week": week, "count": count + 1}
    await store.save()
    await interaction.followup.send(
        f"📦 Das Pack liegt jetzt in deinem Hub unter **Packs**. Noch {points[uid]} Punkte.\n"
        f"📦 The pack is now in your Hub under **Packs**. {points[uid]} points left.", ephemeral=True)


@bot.tree.command(name="rangliste", description="Zeigt die Top 10 der Discord-Punkte")
@app_commands.guild_only()
async def show_ranking(interaction: discord.Interaction):
    entries = []
    for uid, points in sorted(store.data["points"].items(), key=lambda x: x[1], reverse=True):
        m = interaction.guild.get_member(int(uid))
        if m:
            entries.append(f"**{len(entries) + 1}.** {m.display_name}: {points}")
        if len(entries) == 10:
            break
    e = discord.Embed(title="⭐ Rangliste", colour=discord.Colour(COLOR),
                      description="\n".join(entries) or "Noch keine Punkte.")
    await interaction.response.send_message(embed=e)


@bot.tree.command(name="download-nachricht", description="Postet die Download-Nachricht (immer neueste Version) in diesen Channel")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def post_download(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True, thinking=True)
    rel = await latest_release(bot.session)
    msg = await interaction.channel.send(embed=download_embed(rel), view=download_view(rel))
    store.data["download_msg"] = {"channel": interaction.channel.id, "message": msg.id,
                                  "version": rel["version"] if rel else None}
    await store.save()
    await interaction.followup.send(
        f"✅ Download-Nachricht gepostet (Version {rel['version']})." if rel
        else "✅ Gepostet – aber GitHub war gerade nicht erreichbar, der Button führt zur Release-Seite.",
        ephemeral=True)



@bot.tree.command(name="backup-jetzt", description="Schickt sofort ein Backup von data.json in #bot-backup")
@app_commands.default_permissions(administrator=True)
@app_commands.guild_only()
async def backup_now(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True, thinking=True)
    ok = await send_backup()
    await interaction.followup.send("✅ Backup gesendet." if ok else
                                    f"❌ Kein Channel #{BACKUP_CHANNEL} gefunden (oder noch keine data.json).",
                                    ephemeral=True)


def main():
    if not TOKEN_FILE.exists():
        sys.exit("token.txt fehlt.")
    token = TOKEN_FILE.read_text(encoding="utf-8-sig").strip().strip('"').strip("'")
    bot.run(token)


if __name__ == "__main__":
    main()
