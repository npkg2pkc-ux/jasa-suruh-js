/* ========================================
   JASA SURUH (JS) - Google Apps Script
   Database Akun di Google Sheets
   ========================================

   CARA SETUP:
   1. Buka https://sheets.google.com → Buat spreadsheet baru
   2. Rename Sheet1 menjadi "Users"
   3. Isi baris pertama (header) dengan kolom:
      A1: id | B1: name | C1: phone | D1: username | E1: password | F1: role | G1: createdAt
   4. (Opsional) Buat sheet kedua "Skills" dengan header:
      A1: userId | B1: skills
      — Sheet ini akan auto-dibuat jika belum ada
   5. Buka menu Extensions → Apps Script
   6. Hapus semua isi default, paste seluruh code.gs ini
   7. Klik Deploy → New deployment
   8. Pilih type: Web app
   9. Execute as: Me
   10. Who has access: Anyone
   11. Klik Deploy → Salin URL web app
   12. Paste URL tersebut ke variabel SCRIPT_URL di app.js
   ======================================== */

// Nama sheet untuk data akun
var SHEET_NAME = 'Users';
var SKILLS_SHEET_NAME = 'Skills';

/**
 * Mendapatkan sheet Users
 */
function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

/**
 * Ambil semua data users sebagai array of objects
 */
function getAllUsers() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // hanya header

  var headers = data[0];
  var users = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var user = {};
    for (var j = 0; j < headers.length; j++) {
      user[headers[j]] = row[j];
    }
    // Pastikan tipe string
    user.id = String(user.id || '');
    user.name = String(user.name || '');
    user.phone = String(user.phone || '');
    user.username = String(user.username || '');
    user.password = String(user.password || '');
    user.role = String(user.role || '');
    user.createdAt = user.createdAt ? Number(user.createdAt) : 0;
    users.push(user);
  }
  return users;
}

/**
 * Cari baris berdasarkan id user (return row number, 1-indexed)
 */
function findRowById(id) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      return i + 1; // 1-indexed row number
    }
  }
  return -1;
}

/**
 * Cek apakah username sudah ada
 */
function usernameExists(username) {
  var users = getAllUsers();
  for (var i = 0; i < users.length; i++) {
    if (users[i].username === username) return true;
  }
  return false;
}

/**
 * Tambah user baru ke sheet
 */
function addUser(userData) {
  var sheet = getSheet();
  sheet.appendRow([
    userData.id || '',
    userData.name || '',
    userData.phone || '',
    userData.username || '',
    userData.password || '',
    userData.role || '',
    userData.createdAt || Date.now()
  ]);
}

/**
 * Hapus user berdasarkan id
 */
function deleteUserById(id) {
  var row = findRowById(id);
  if (row > 1) {
    getSheet().deleteRow(row);
    return true;
  }
  return false;
}

// ========== SKILLS SHEET ==========

/**
 * Mendapatkan atau membuat sheet Skills
 * Format: A = userId, B = skills (JSON array string)
 */
function getSkillsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SKILLS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SKILLS_SHEET_NAME);
    sheet.appendRow(['userId', 'skills']);
  }
  return sheet;
}

/**
 * Ambil semua skills sebagai object { userId: [skill1, skill2, ...] }
 */
function getAllSkillsData() {
  var sheet = getSkillsSheet();
  var data = sheet.getDataRange().getValues();
  var result = {};
  for (var i = 1; i < data.length; i++) {
    var uid = String(data[i][0] || '');
    var skillsStr = String(data[i][1] || '[]');
    try {
      result[uid] = JSON.parse(skillsStr);
    } catch (e) {
      result[uid] = [];
    }
  }
  return result;
}

/**
 * Update skills untuk user tertentu
 */
function updateUserSkills(userId, skillsArray) {
  var sheet = getSkillsSheet();
  var data = sheet.getDataRange().getValues();
  var found = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      sheet.getRange(i + 1, 2).setValue(JSON.stringify(skillsArray));
      found = true;
      break;
    }
  }
  if (!found) {
    sheet.appendRow([userId, JSON.stringify(skillsArray)]);
  }
}

/**
 * Handle GET requests — ambil semua users
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'getAll';

  var result = {};

  if (action === 'getAll') {
    result = { success: true, data: getAllUsers() };
  } else if (action === 'getAllSkills') {
    result = { success: true, data: getAllSkillsData() };
  } else if (action === 'login') {
    var username = e.parameter.username || '';
    var password = e.parameter.password || '';
    var users = getAllUsers();
    var found = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].username === username && users[i].password === password) {
        found = users[i];
        break;
      }
    }
    if (found) {
      result = { success: true, data: found };
    } else {
      result = { success: false, message: 'Username atau password salah' };
    }
  } else {
    result = { success: false, message: 'Action tidak dikenal' };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle POST requests — register, createCS, delete
 */
function doPost(e) {
  var result = {};

  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || '';

    if (action === 'register' || action === 'createCS') {
      // Validasi data
      if (!body.name || !body.username || !body.password || !body.role) {
        result = { success: false, message: 'Data tidak lengkap' };
      } else if (usernameExists(body.username)) {
        result = { success: false, message: 'Username sudah digunakan' };
      } else {
        var newUser = {
          id: body.id || (Date.now().toString(36) + Math.random().toString(36).substr(2, 8)),
          name: body.name,
          phone: body.phone || '-',
          username: body.username,
          password: body.password,
          role: body.role,
          createdAt: body.createdAt || Date.now()
        };
        addUser(newUser);
        result = { success: true, data: newUser, message: 'Akun berhasil dibuat' };
      }

    } else if (action === 'delete') {
      var id = body.id || '';
      if (!id) {
        result = { success: false, message: 'ID tidak ditemukan' };
      } else {
        var deleted = deleteUserById(id);
        result = deleted
          ? { success: true, message: 'User berhasil dihapus' }
          : { success: false, message: 'User tidak ditemukan' };
      }

    } else if (action === 'updateSkills') {
      var userId = body.userId || '';
      var skills = body.skills || [];
      if (!userId) {
        result = { success: false, message: 'userId tidak ditemukan' };
      } else {
        updateUserSkills(userId, skills);
        result = { success: true, message: 'Skills berhasil diupdate' };
      }

    } else {
      result = { success: false, message: 'Action tidak dikenal' };
    }

  } catch (err) {
    result = { success: false, message: 'Error: ' + err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
