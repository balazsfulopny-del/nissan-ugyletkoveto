# Ügyletkövető

Feladatok a szerződéskötéstől az átadásig, dokumentumok (titkosítva), jóváírás számítás és jutalék. Telepíthető webapp telefonra és gépre, internet nélkül is működik.

- **Adatok:** Supabase (EU, Frankfurt). Szerkezet és hozzáférési szabályok: `supabase/schema.sql`. Minden sor a tulajdonos fiókjához kötött.
- **Dokumentumok:** a készüléken titkosítva (AES-GCM, a kulcsot a PIN védi), csak így kerülnek a felhőbe.
- **Szinkron:** helyi tár (IndexedDB) és kimenő sor mezőszinten; élő frissítés a Supabase Realtime-on.
- **Közzététel:** minden `main` push után a GitHub Actions lefuttatja a teszteket és kiteszi a GitHub Pages-re.

Fejlesztés: `npm ci`, `npm run dev`, tesztek: `npm test` és `npm run e2e` (két készülék, rossz hálózat szimulálva).
