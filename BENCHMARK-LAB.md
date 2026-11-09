# QR Turbo Benchmark Lab

## Ziel

Das Lab ist unter /benchmark/ in QR Turbo integriert. V1-/V2-Pakete, der Originalsender und die bestehenden Empfänger werden nicht ersetzt. Es bleibt ein statisches Browserprojekt für Vercel und vergleichbare Anbieter.

## Tatsächlich implementierter automatischer Test

1. Reproduzierbare Datei aus einstellbarer Größe, Seed und Datenmuster.
2. Echte BeamFerry-Dateiverpackung und LT-Fountain-Encoding.
3. V1-/V2-Paketheader mit 1, 4, 8 oder 16 QR-Positionen.
4. Optional deterministischer, simulierter Paketverlust und Duplikate.
5. Paketeingang über den Originalparser, FEC-Rekonstruktion durch LTDecoder.
6. Container-Wiederaufbau, Originaldatei-Entpackung, Bytevergleich und SHA-256.

Der Test misst **Codec-Leistung**, keine reale Bildschirm-/Kameraübertragung. Ein einzelner erkannter Header zählt nie als erfolgreiche Dateiübertragung.

## Kennzahlen

| Messwert | Methode | Typ |
|---|---|---|
| Codec MiB/s | Quelldatei-Bytes / vollständige Laufzeit / 2^20 | Berechnet aus Zeitmessung |
| Encoder-Pakete/s | Tatsächlich erzeugte Datenpakete / Laufzeit | Berechnet |
| Decode P50/P95/P99 | performance.now um parseFrame und LTDecoder.addFrame je empfangenem Paket | Gemessen |
| Duplikate | Wiederholte Sequenznummern | Gezählt |
| FEC-Overhead | erzeugte Pakete / erforderliche FEC-Blöcke - 1 | Berechnet |
| Blöcke gelöst | LTDecoder.solvedCount | Gemessen |
| Dateierfolg | Vollständige Rekonstruktion, Bytevergleich und SHA-256 | Verifiziert |
| Optischer Goodput | Kein realer optischer Übertragungspfad im Codec-Lauf | Nicht verfügbar |
| Tatsächliche Kamera-/Display-FPS | Keine Messung durch Codec-Test | Nicht verfügbar |
| CPU-/GPU-Gesamtauslastung, thermische Drosselung | Keine universelle Browser-API | Nicht verfügbar |

Im V2-Modus 8/16 QR bei 90 oder 120 Ziel-FPS werden ab dem zweiten Simulationsschritt vier Kacheln aktualisiert. Alle 16 QR-Kacheln sind nicht 16 neue Nutzlastsymbole pro Schritt. Ziel-FPS sind keine gemessenen FPS.

## Bedienung

- Einfach / Erweitert, fünf Presets sowie frei konfigurierte Werte.
- Auto-Matrix bis zu 120 Konfigurationen mit Warmup, Wiederholungen, Pause, Fortsetzen, Abbrechen und Retry.
- Sichtbare Originalsender-Vorschau. Eingebettete Originalempfänger für Kamera, Videodatei und Bildschirm.
- Lokaler MediaStream-Adapter mit echtem Videobild und Vorschau-FPS.
- IndexedDB mit localStorage-Fallback, CSV, JSON, HTML-Bericht, Diagnoselog und Regressionserkennung nur bei vergleichbaren Parametern.

## Bekannte Einschränkungen

Die drei Originalscanner-Quellen sind bedienbar, ihre Hardware-/QR-Laufzeitmetriken werden aber noch nicht automatisch in die Benchmark-Tabelle importiert. Optische Live-Benchmarks mit echter Kamera, echte QR-Bilddecodierung, CPU-Prozentwerte, GPU-Prozentwerte und Temperaturdaten sind bewusst nicht simuliert. Für einen realen Hardware-Vergleich muss ein echtes Gerät mit der Originalscanner-Seite und erfolgreicher Dateiübertragung getestet werden.

Die automatische Testdatei bleibt lokal im Browser; es ist kein Backend nötig.

## Tests

npm run test

npm run build

npm run test:dist

node scripts/test-benchmark-browser.mjs

Die Browser-Suite läuft in GitHub Actions nach dem Build. Sie überprüft die Codemodi, Presets, Export, Persistenz und mobile Darstellung.
