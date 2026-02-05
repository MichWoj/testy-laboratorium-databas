const form = document.getElementById('test-form');
const testsList = document.getElementById('tests');
const deleteBtn = document.getElementById('delete');

const typTestuInput = document.getElementById('typTestu');
const zlecajacyInput = document.getElementById('zlecajacy');
const nrProjektuInput = document.getElementById('nrProjektu');
const nazwaProjektuInput = document.getElementById('nazwaProjektu');
const opisInput = document.getElementById('opis');

const importBtn = document.getElementById('importExcel');
const excelInput = document.getElementById('excelFile');

// pobierz testy
async function loadTests() {
  const res = await fetch('/tests');
  const tests = await res.json();

  testsList.innerHTML = '';

  tests.forEach((test) => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
        <td><input type="checkbox" value="${test.id}"></td>
        <td>${test.id}</td>
        <td>${test.typTestu}</td>
        <td>${test.nazwaProjektu}</td>
        <td>${test.nrProjektu}</td>
        <td>${test.zlecajacy}</td>
        <td>${test.opis || ''}</td> 
      `;

    testsList.appendChild(tr);
  });
}

// dodaj test
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  await fetch('/tests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      typTestu: typTestuInput.value,
      zlecajacy: zlecajacyInput.value,
      nrProjektu: nrProjektuInput.value,
      nazwaProjektu: nazwaProjektuInput.value,
      opis: opisInput.value,
    }),
  });

  form.reset();
  loadTests();
});

//importuj z pliku

if (importBtn) {
  importBtn.addEventListener('click', async () => {
    const file = excelInput.files[0];
    if (!file) {
      alert('Wybierz plik Excel');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/tests/import', {
      method: 'POST',
      body: formData,
    });

    const result = await res.json();

    alert(`Zaimportowano ${result.count} testów`);
    loadTests();
  });
}

// usuń zaznaczone testy
deleteBtn.addEventListener('click', async () => {
  const checked = document.querySelectorAll(
    "#tests input[type='checkbox']:checked"
  );

  const ids = Array.from(checked).map((cb) => Number(cb.value));

  if (ids.length === 0) {
    alert('Zaznacz testy do usunięcia');
    return;
  }

  await fetch('/tests/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });

  loadTests();
});

loadTests();

// logout
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logout');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/logout', { method: 'POST' });
      location.href = '/login.html';
    });
  }
});
