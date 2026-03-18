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
 * Mendapatkan atau membuat sheet Users
 */
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['id', 'name', 'phone', 'username', 'password', 'role', 'createdAt', 'lat', 'lng', 'address']);
  }
  return sheet;
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
    user.lat = user.lat !== undefined && user.lat !== '' ? Number(user.lat) : 0;
    user.lng = user.lng !== undefined && user.lng !== '' ? Number(user.lng) : 0;
    user.address = String(user.address || '');
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
    userData.createdAt || Date.now(),
    userData.lat || 0,
    userData.lng || 0,
    userData.address || ''
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
 * Format: A = userId, B = skills (JSON array of objects)
 * Setiap skill object:
 *   Skill sederhana: { type: "js_antar", name: "JS Antar" }
 *   Skill dengan form: { type: "js_clean", name: "JS Clean", serviceType: "...", description: "...", photo: "...", price: 50000 }
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
 * Ambil semua skills sebagai object { userId: [{type, name, ...}, ...] }
 */
function getAllSkillsData() {
  var sheet = getSkillsSheet();
  var data = sheet.getDataRange().getValues();
  var result = {};
  for (var i = 1; i < data.length; i++) {
    var uid = String(data[i][0] || '');
    var skillsStr = String(data[i][1] || '[]');
    try {
      var parsed = JSON.parse(skillsStr);
      // Pastikan selalu array
      result[uid] = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      result[uid] = [];
    }
  }
  return result;
}

/**
 * Ambil skills untuk satu user
 */
function getUserSkillsById(userId) {
  var all = getAllSkillsData();
  return all[String(userId)] || [];
}

/**
 * Update skills untuk user tertentu
 * skillsArray = array of skill objects
 */
function updateUserSkills(userId, skillsArray) {
  var sheet = getSkillsSheet();
  var data = sheet.getDataRange().getValues();
  var jsonStr = JSON.stringify(skillsArray);
  var found = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      sheet.getRange(i + 1, 2).setValue(jsonStr);
      found = true;
      break;
    }
  }
  if (!found) {
    sheet.appendRow([userId, jsonStr]);
  }
}

/**
 * Hapus skills user (saat user dihapus)
 */
function deleteUserSkills(userId) {
  var sheet = getSkillsSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// ── Google Drive Photo Storage ──
function getOrCreatePhotoFolder() {
  var folderName = 'JS_App_Photos';
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(folderName);
}

function uploadPhotoToDrive(base64Data, fileName) {
  var folder = getOrCreatePhotoFolder();
  var parts = base64Data.split(',');
  var decoded = Utilities.base64Decode(parts.length > 1 ? parts[1] : parts[0]);
  var blob = Utilities.newBlob(decoded, 'image/jpeg', fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

function deletePhotoFromDrive(url) {
  if (!url) return;
  var match = url.match(/id=([a-zA-Z0-9_-]+)/);
  if (!match) return;
  try {
    var file = DriveApp.getFileById(match[1]);
    file.setTrashed(true);
  } catch (e) { /* file may already be deleted */ }
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
  } else if (action === 'getUserSkills') {
    var uid = e.parameter.userId || '';
    if (!uid) {
      result = { success: false, message: 'userId tidak ditemukan' };
    } else {
      result = { success: true, data: getUserSkillsById(uid) };
    }
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
        if (deleted) {
          deleteUserSkills(id); // Hapus skills user juga
          result = { success: true, message: 'User berhasil dihapus' };
        } else {
          result = { success: false, message: 'User tidak ditemukan' };
        }
      }

    } else if (action === 'updateLocation') {
      var locUserId = body.userId || '';
      var lat = body.lat || 0;
      var lng = body.lng || 0;
      var address = body.address || '';
      if (!locUserId) {
        result = { success: false, message: 'userId tidak ditemukan' };
      } else {
        var locRow = findRowById(locUserId);
        if (locRow > 1) {
          var locSheet = getSheet();
          // Ensure columns exist (H=lat, I=lng, J=address)
          var headers = locSheet.getRange(1, 1, 1, locSheet.getLastColumn()).getValues()[0];
          var latCol = headers.indexOf('lat') + 1;
          var lngCol = headers.indexOf('lng') + 1;
          var addrCol = headers.indexOf('address') + 1;
          // If columns don't exist, add them
          if (latCol === 0) { latCol = locSheet.getLastColumn() + 1; locSheet.getRange(1, latCol).setValue('lat'); }
          if (lngCol === 0) { lngCol = locSheet.getLastColumn() + 1; locSheet.getRange(1, lngCol).setValue('lng'); }
          if (addrCol === 0) { addrCol = locSheet.getLastColumn() + 1; locSheet.getRange(1, addrCol).setValue('address'); }
          locSheet.getRange(locRow, latCol).setValue(lat);
          locSheet.getRange(locRow, lngCol).setValue(lng);
          locSheet.getRange(locRow, addrCol).setValue(address);
          result = { success: true, message: 'Lokasi berhasil diupdate' };
        } else {
          result = { success: false, message: 'User tidak ditemukan' };
        }
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

    } else if (action === 'uploadPhoto') {
      var photoData = body.photo || '';
      var photoFileName = body.fileName || ('photo_' + Date.now() + '.jpg');
      var oldUrl = body.oldUrl || '';
      if (!photoData) {
        result = { success: false, message: 'Data foto kosong' };
      } else {
        // Delete old photo if replacing
        if (oldUrl) deletePhotoFromDrive(oldUrl);
        var url = uploadPhotoToDrive(photoData, photoFileName);
        result = { success: true, url: url };
      }

    } else if (action === 'deletePhoto') {
      var delUrl = body.url || '';
      if (delUrl) deletePhotoFromDrive(delUrl);
      result = { success: true, message: 'Foto dihapus' };

    } else {

  } catch (err) {
    result = { success: false, message: 'Error: ' + err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
