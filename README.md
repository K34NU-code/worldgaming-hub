# WorldGaming-Bot

Eigener Discord-Bot für den WorldGaming-Server.

| Modul | Befehle |
|---|---|
| Rollenauswahl (Dropdowns) | `/rollen-nachricht` |
| Beta-Bewerbung mit Ticket | `/beta-nachricht`, `/beta-welle`, `/beta-plaetze`, `/beta-entfernen`, `/beta-status` |
| LoL-Patchnotes (automatisch) | `/patchnotes-test` |
| Lizenzschlüssel fürs Hub | `/lizenz-erstellen`, `/lizenz-reset`, `/lizenz-sperren` |
| Inaktivitäts-Sperre | `/inaktiv-status`, `/inaktiv-ausnahme`, `/inaktiv-sperre` |
| Discord-Punkte | `/punkte`, `/rangliste`, `/pack-einloesen` |
| Download-Nachricht | `/download-nachricht` |
| Tägliches Backup von data.json in #bot-backup | `/backup-jetzt` |

## Dateien

| Datei | Wofür |
|---|---|
| `wg_bot.py` | der Bot |
| `setup_server.sh` | richtet den Bot auf einem neuen Ubuntu-Server als Dienst ein |
| `backup_server.sh` | richtet das tägliche Backup von data.json auf dem Server ein |
| `deploy.cmd` | Windows: neue Version auf den Server laden und neu starten |
| `umbau_worldgaming.py`, `check_server.py`, `setup_testserver.py`, `check_testserver.py` | einmalige Werkzeuge für den Server-Umbau |

## Geheimnisse (nicht im Repo!)

- `token.txt` – Bot-Token aus dem Discord Developer Portal
- `supabase.json` – `{"url": "...", "secret_key": "sb_secret_..."}`
- `oracle.key` – SSH-Schlüssel für den Oracle-Server

Diese Dateien liegen nur auf dem PC (`C:\Projekte\wg-bot`) und auf dem Server (`~/wg-bot`).

## Server neu aufsetzen (falls er mal weg ist)

1. Neue Oracle-Instanz (Ubuntu 24.04, Ampere A1), öffentliche IP zuweisen
2. `scp -i oracle.key wg_bot.py token.txt supabase.json setup_server.sh backup_server.sh ubuntu@IP:~/`
3. `ssh -i oracle.key ubuntu@IP` → `bash setup_server.sh` → `bash backup_server.sh`
4. Letztes Backup aus #bot-backup herunterladen und als `~/wg-bot/data.json` hochladen,
   dann `sudo systemctl restart wg-bot`
