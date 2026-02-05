const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const session = require("express-session");
const path = require('path');
const bcrypt = require("bcryptjs");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");

const app = express();
const PORT = 3000;

/* =========================
   MIDDLEWARE
========================= */

app.use(express.json());

app.use(
  session({
    secret: "super-secret-key",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.static("public"));

const upload = multer({ dest: "uploads/" });

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/app", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/");
  }
  res.sendFile(path.join(__dirname, "public", "app.html"));
});

function requireAdmin(req, res, next) {
  // 👉 dopasuj do swojego systemu logowania
  if (!req.session || !req.session.user || !req.session.user.isAdmin) {
    return res.status(403).json({ error: "Brak uprawnień admina" });
  }
  next();
}

/* =========================
   BAZA DANYCH
========================= */

const db = new sqlite3.Database("database.db");

// tabela kont
db.run(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  typTestu TEXT NOT NULL,
  zlecajacy TEXT NOT NULL,
  nrProjektu TEXT NOT NULL,
  nazwaProjektu TEXT NOT NULL,
  opis TEXT
)`);
// konto admin
(async () => {
  const hash = await bcrypt.hash("admin", 10);
  db.run(
    "INSERT OR IGNORE INTO accounts (login, password, role) VALUES (?, ?, 'admin')",
    ["admin", hash]
  );
})();

/* =========================
   AUTORYZACJA
========================= */

function auth(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: "Nie zalogowany" });
}

function onlyAdmin(req, res, next) {
  db.get(
    "SELECT role FROM accounts WHERE id = ?",
    [req.session.userId],
    (err, user) => {
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Brak uprawnień" });
      }
      next();
    }
  );
}

/* =========================
   LOGOWANIE
========================= */

app.post("/login", (req, res) => {
  const { login, password } = req.body;

  db.get(
    "SELECT * FROM accounts WHERE login = ?",
    [login],
    async (err, user) => {
      if (!user) return res.status(401).json({ error: "Złe dane" });

      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.status(401).json({ error: "Złe dane" });

      req.session.userId = user.id;
      res.json({ success: true });
    }
  );
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.post("/register", async (req, res) => {
  const { login, password } = req.body;
  const hash = await bcrypt.hash(password, 10);

  db.run(
    "INSERT INTO accounts (login, password) VALUES (?, ?)",
    [login, hash],
    err => {
      if (err) return res.status(409).json({ error: "Użytkownik istnieje" });
      res.json({ success: true });
    }
  );
});

/* =========================
   API
========================= */

router.get("/tests", (req, res) => {
  db.all("SELECT * FROM tests ORDER BY id DESC", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

router.post("/tests", (req, res) => {
  const {
    typTestu,
    zlecajacy,
    nrProjektu,
    nazwaProjektu,
    opis
  } = req.body;

  const sql = `
    INSERT INTO tests (typTestu, zlecajacy, nrProjektu, nazwaProjektu, opis)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [typTestu, zlecajacy, nrProjektu, nazwaProjektu, opis],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      // zwracamy nowo dodany rekord
      res.json({
        id: this.lastID,
        typTestu,
        zlecajacy,
        nrProjektu,
        nazwaProjektu,
        opis
      });
    }
  );
});

router.post("/tests/delete", (req, res) => {
  const { ids } = req.body;

  if (!ids || ids.length === 0) {
    return res.status(400).json({ error: "Brak ID" });
  }

  const placeholders = ids.map(() => "?").join(",");

  db.run(
    `DELETE FROM tests WHERE id IN (${placeholders})`,
    ids,
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json({ deleted: this.changes });
    }
  );
});

app.post("/tests/import", requireAdmin, upload.single("file"), (req, res) => {
  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    let count = 0;

    rows.forEach(r => {
      const test = {
        typTestu: Number.isFinite(r["Rodzaj testu"])
          ? String(Math.trunc(r["Rodzaj testu"]))
          : String(r["Rodzaj testu"] || "").trim(),

        nazwaProjektu: String(r["Projekt"] || "").trim(),
        nrProjektu: String(r["Nr projektu"] || "").trim(),
        zlecajacy: String(r["Zleceniający"] || "").trim(),
        opis: ""
      };

      // 👉 TA SAMA logika co w POST /tests
      tests.push({
        id: nextId++,
        ...test
      });

      count++;
    });

    fs.unlinkSync(req.file.path);

    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Błąd importu Excela" });
  }
});

//sprawdzenie roli
app.get('/api/user-info', auth, (req, res) => {
  // Pobieramy dane użytkownika na podstawie sesji
  db.get("SELECT login, role FROM accounts WHERE id = ?", [req.session.userId], (err, user) => {
    if (err || !user) return res.status(500).json({ error: "Błąd" });
    res.json({ login: user.login, role: user.role });
  });
});


/* =========================
   🔐 ZMIANA RÓL
========================= */

// wszyscy -> user, oprócz smgcda07
app.put("/accounts/update-roles", auth, onlyAdmin, (req, res) => {
  db.run(
    "UPDATE accounts SET role = 'user' WHERE login != ?",
    ["smgcda07"],
    function (err) {
      if (err) {
        return res.status(500).json({ error: "Błąd bazy danych" });
      }
      res.json({ success: true, updated: this.changes });
    }
  );
});

db.all("SELECT id, login, role FROM accounts", (err, rows) => {
  if (err) {
    console.error("Błąd SQL:", err);
    return;
  }

  console.log("Użytkownicy w systemie:");
  rows.forEach(u => {
    console.log(
      `ID: ${u.id}, login: ${u.login}, rola: ${u.role}`
    );
  });
});

/* =========================
   🖥️ PANEL ADMINISTRATORA
========================= */

// Trasa wyświetlająca prostą tabelę z użytkownikami
app.get('/admin-panel', auth, onlyAdmin, (req, res) => {
  db.all("SELECT id, login, role FROM accounts", (err, rows) => {
    if (err) return res.status(500).send("Błąd bazy danych");

    // Budujemy wiersze tabeli
    let tableRows = rows.map(user => `
      <tr id="user-${user.id}">
        <td>${user.id}</td>
        <td>${user.login}</td>
        <td>${user.role}</td>
        <td>
          ${user.login !== 'admin' ? `<button onclick="deleteUser(${user.id})">Usuń</button>` : '<i>Główne konto</i>'}
        </td>
      </tr>
    `).join('');

    // Wysyłamy prosty HTML z listą i skryptem do usuwania
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Panel Admina</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #f4f4f4; }
          button { color: white; background: red; border: none; padding: 5px 10px; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>Panel Administratora</h1>
        <p>Zalogowany jako: ID ${req.session.userId}</p>
        <table>
          <thead><tr><th>ID</th><th>Login</th><th>Rola</th><th>Akcje</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <br>
        <a href="/app">Powrót do aplikacji</a>

        <script>
          async function deleteUser(id) {
            if(!confirm('Czy na pewno chcesz usunąć tego użytkownika?')) return;
            
            const response = await fetch('/admin/delete-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: id })
            });

            if (response.ok) {
              document.getElementById('user-' + id).remove();
              alert('Użytkownik został usunięty');
            } else {
              const err = await response.json();
              alert('Błąd: ' + err.error);
            }
          }
        </script>
      </body>
      </html>
    `);
  });
});

// Trasa obsługująca fizyczne usuwanie z bazy
app.post('/admin/delete-user', auth, onlyAdmin, (req, res) => {
  const { userId } = req.body;

  // Blokujemy możliwość usunięcia admina po ID (bezpieczeństwo)
  db.run(
    "DELETE FROM accounts WHERE id = ? AND login != 'admin'",
    [userId],
    function(err) {
      if (err) return res.status(500).json({ error: "Błąd bazy" });
      
      if (this.changes > 0) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: "Nie można usunąć tego użytkownika" });
      }
    }
  );
});
app.use(router);
/* =========================
   START
========================= */


app.listen(PORT, () => {
  console.log(`Serwer działa: http://localhost:${PORT}`);
});
