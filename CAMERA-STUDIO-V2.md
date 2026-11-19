# QR Turbo Camera Studio V2

Der bestehende BeamFerry-ZXing/WASM-Decoder bleibt für binäre V1/V2-Übertragungen zuständig; kein QR-URL-Scanner ersetzt ihn.

## Neu

- Kameravorschau ohne Beschnitt durch object-fit: contain.
- Echter Vollbildmodus und CSS-Fallback für mobile Browser, inklusive Scan, Kamerawechsel, Fokus, Licht und Zoom.
- QR-Layout 1, 4, 8 oder 16 Codes direkt in Simple.
- Kamerauflösung 720p/1080p/1440p/Auto, optionaler 120-FPS-Versuch und kompatible Fallbacks.
- Fokuskoordinaten berücksichtigen schwarze Ränder des Kamerabildes.
- QR-Konturen stammen aus den tatsächlichen WASM-Decoder-Hits.

## Empfehlungen

Für stabile Übertragungen zunächst 30 FPS und 1080p wählen. Für 16 QR-Codes die komplette 4×4-Matrix im Bild halten; bei fehlenden Codes manuell 16 QR aktivieren. 120 FPS sind experimentell und können die Auflösung reduzieren.

Browserabhängige Hardwarefunktionen werden nur dann angeboten, wenn die Kameratreiber sie bereitstellen. CI mit simulierten Kameras ersetzt keine Prüfung auf echten Smartphones.

## Externe Referenz

Die konkrete Implementierung von qr.magn.cc und ihr GitHub-Repository konnten nicht verifiziert werden. Es wurde kein nicht geprüftes Fremdprojekt kopiert. Die Änderungen wurden direkt in QR Turbo umgesetzt.
