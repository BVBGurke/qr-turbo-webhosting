# QR Turbo – Highspeed-QR-Dateiübertragung (Webhosting)

**Statische Website auf Basis von [BeamFerry](https://github.com/shuipashui/beamferry) (MIT-Lizenz).**

Übertrage Dateien rein optisch: Ein PC zeigt animierte QR-Codes, ein Smartphone liest sie über seine Kamera. Oder du empfängst direkt aus einem geteilten PC-Bildschirm. Keine Cloud und kein Backend nötig.

## Inhalt

- `site/`: neue deutsche Startseite mit responsivem Dark-Mode-Design
- `scripts/build.mjs`: reproduzierbarer Build aus dem gepinnten BeamFerry-GitHub-Commit
- `vercel.json`, `netlify.toml`, `wrangler.toml`: Hosting-Vorlagen
- `.github/workflows/pages.yml`: GitHub Pages Build + Deployment
- `dist/`: entsteht erst beim Build und ist anschließend **komplett statisch**

**Wichtig:** Dieses ZIP enthält den Quellcode und das Build-System. Die großen Decoder-/WASM-Dateien werden **während des Builds aus GitHub bezogen**. Das ZIP ist deshalb kein direkt per FTP hochladbares Fertig-Build.

## Schnellstart

Voraussetzungen **nur zum Bauen**: Node.js 22+, Git, Internetverbindung.

```bash
npm run build
npm run preview
```

Dann `http://localhost:8080` öffnen. Browser-Kamerazugriff funktioniert auf `localhost`, aber auf einem Handy über eine normale HTTP-LAN-IP **nicht**.

Das fertige `dist/`-Verzeichnis kann auf jedem statischen Host per HTTPS veröffentlicht werden. Alle Originaldateien einschließlich WASM werden lokal gehostet.

### Cloudflare Pages (empfohlen)

1. Den ZIP-Inhalt in ein **eigenes GitHub-Repository** hochladen.
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git.
3. Repository wählen, Framework: `None`.
4. **Build command:** `npm run build`
5. **Build output directory:** `dist`
6. Node.js 22 verwenden (wenn nötig `NODE_VERSION=22` als Variable setzen).
7. Deployen, anschließend Domain verbinden – HTTPS wird bereitgestellt.

Hinweis: **Direct Upload** von Cloudflare erwartet bereits `dist/`, nicht den ungeöffneten Quellcode-ZIP.

### Vercel

1. GitHub-Repository importieren.
2. Das Projekt enthält eine `vercel.json` mit Build-Befehl und Output-Pfad.
3. Deployment durchführen; die Dateien werden auf Vercel statisch ausgeliefert.

### Netlify

Repository importieren – die `netlify.toml` setzt `npm run build` und `dist`.

### GitHub Pages

1. ZIP in ein öffentliches oder privates Repository mit Branch `main` laden.
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Workflow läuft beim Push auf `main`, baut BeamFerry und veröffentlicht `dist/`.

### Klassischer Webserver / FTP / Nginx

Auf einem PC mit Git + Node 22 `npm run build` ausführen. Danach **nur den Inhalt von `dist/`** in deinen Webroot hochladen. Der Webserver sollte `.wasm` als `application/wasm` ausliefern. Die Kameraseite braucht HTTPS.

## URLs nach dem Deployment

- `/` – deutsche Startseite
- `/send/` – Hochgeschwindigkeits-Sender
- `/receive/` – Empfänger mit Smartphone-Kamera
- `/screen/` – Empfänger per PC-Bildschirmaufnahme

Auch in Unterverzeichnissen, etwa `https://example.com/qr/`, werden die Links relativ aufgelöst. Der QR-Code zur Empfängerseite verweist automatisch auf **deine Domain**, nicht auf die BeamFerry-Demo.

## Geschwindigkeitsprofile

| Profil | Einstellung | Eignung |
|---|---|---|
| Stabil und schnell | 4 QR-Codes, 2068 B, 30 FPS | Empfohlenes Startprofil laut Upstream |
| Weniger dichte QR-Codes | 4 QR-Codes, 1465 B, 30 FPS | Bei Unschärfe, Moiré, schwachen Kameras |
| Experimental | 4 QR-Codes, 50–60 FPS | Nur bei entsprechendem Display und zuverlässiger Erkennung |

BeamFerry dokumentiert einen Windows/Edge-Test (Desktop-Screen-Capture) mit **425 KB/s über die vollständige Sitzung**. Das ist *kein* Smartphone-Kamera-Benchmark und keine garantierte Transferrate. Auf Smartphones können reale Werte deutlich niedriger sein. Die Übertragung ist durch Kamera, Display, Licht, Fokus und QR-Dichte begrenzt.

## Grenzen und Sicherheit

- Übertragung ist optisch/lokal. Webseite lädt beim ersten Öffnen die **statischen Ressourcen** vom Host, aber keine Datei wird zum Host hochgeladen.
- Jede Kamera mit Sicht auf den Bildschirm kann den QR-Stream aufzeichnen. **Keine Verschlüsselung oder Authentifizierung!** Vertrauliche Dateien vorher verschlüsseln.
- Maximale Dateigröße im Web-Receiver aktuell **64 MiB**.
- Ein gemeinsames Netzwerk zwischen Sender und Empfänger ist zur Datenübertragung nicht erforderlich.
- Browser benötigen **HTTPS oder localhost** für Kamera- und Bildschirmfreigabe.
- Die UI ist teilweise ins Deutsche übertragen. Status- und Diagnosemeldungen können in bestimmten Fällen noch Originaltexte zeigen.
- Der Build benötigt Zugriff auf GitHub und den npm-Paketserver. Das fertige Hosting benötigt kein GitHub und kein Node.js.

## Technischer Aufbau

`npm run build` lädt den geprüften Upstream-Commit `44d8c9b64c920183f5f250a6d9deb1978a385004`, führt dort `npm ci && npm run build` aus und kopiert die produzierten Web-Sender-/Empfänger-/WASM-Dateien nach `dist/`. Die Sender-URL wird auf `../receive/` umgestellt, sodass alle Daten auf der eigenen Domain bleiben. Die eigentlichen QR-, Fountain-FEC- und WASM-Algorithmen werden nicht verändert.

Den Upstream auf den neuesten Stand stellen (auf eigenes Risiko, falls Schnittstellen geändert wurden):

```bash
UPSTREAM_REF=main npm run build
```

Unter Windows PowerShell:

```powershell
$env:UPSTREAM_REF='main'; npm run build
```

Bei einem geänderten Upstream können die absichtlich strikten HTML-Patches einen Build abbrechen, damit der QR-Empfänger-Link nicht still zur fremden Demo zeigt.

## Lizenz / Attribution

Original: [shuipashui/beamferry](https://github.com/shuipashui/beamferry), MIT License (Copyright 2026 AirFerry Lite contributors). Aus dem Upstream werden beim Build `LICENSE` sowie `THIRD_PARTY_NOTICES.md` nach `dist/licenses/` kopiert. Diese Dateien beim Hosting und bei Weitergabe behalten. Die QR-Turbo-Startseite und das Build-Skript wurden eigenständig ergänzt. Von BeamFerry verwendete Drittanbieter-/Decoder-Lizenzen sind über die Hinweise im veröffentlichten Verzeichnis einsehbar.