const sqlite3 = require('sqlite3').verbose();
// Podstaw nazwę swojego pliku bazy poniżej:
const db = new sqlite3.Database('./database.db');

db.serialize(() => {
  console.log("🔍 ANALIZA STRUKTURY BAZY DANYCH:\n");

  // 1. Pobieramy listę wszystkich tabel
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      console.error("Błąd podczas pobierania tabel:", err.message);
      return;
    }

    if (tables.length === 0) {
      console.log("Baza jest pusta.");
      return;
    }

    // 2. Dla każdej tabeli sprawdzamy jej kolumny
    tables.forEach((table) => {
      db.all(`PRAGMA table_info(${table.name})`, (err, columns) => {
        if (err) {
          console.error(`Błąd podczas sprawdzania tabeli ${table.name}:`, err.message);
          return;
        }

        console.log(`\n📋 TABELA: ${table.name.toUpperCase()}`);
        console.log("-----------------------------------------");
        console.log("ID | NAZWA KOLUMNY      | TYP       | PK?");
        console.log("-----------------------------------------");
        
        columns.forEach((col) => {
          // Formatowanie dla czytelności (proste wyrównanie)
          const pk = col.pk === 1 ? "TAK" : "nie";
          const name = col.name.padEnd(18);
          const type = col.type.padEnd(10);
          console.log(`${col.cid}  | ${name} | ${type} | ${pk}`);
        });
      });
    });
  });
});