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
var SETTINGS_SHEET_NAME = 'Settings';
var STORES_SHEET_NAME = 'Stores';
var PRODUCTS_SHEET_NAME = 'Products';

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

// ========== ORDERS SHEET ==========
var ORDERS_SHEET_NAME = 'Orders';
function getOrdersSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ORDERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ORDERS_SHEET_NAME);
    sheet.appendRow(['id','userId','talentId','skillType','serviceType','description','price','fee','status','createdAt','acceptedAt','startedAt','completedAt','proofPhoto','userLat','userLng','userAddr','talentLat','talentLng','rating','review']);
  }
  return sheet;
}

function getAllOrders() {
  var sheet = getOrdersSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var orders = [];
  for (var i = 1; i < data.length; i++) {
    var o = {};
    for (var j = 0; j < headers.length; j++) o[headers[j]] = data[i][j];
    o.id = String(o.id || '');
    o.userId = String(o.userId || '');
    o.talentId = String(o.talentId || '');
    o.price = Number(o.price) || 0;
    o.fee = Number(o.fee) || 0;
    o.rating = o.rating !== '' && o.rating !== undefined ? Number(o.rating) : 0;
    o.createdAt = Number(o.createdAt) || 0;
    o.acceptedAt = Number(o.acceptedAt) || 0;
    o.startedAt = Number(o.startedAt) || 0;
    o.completedAt = Number(o.completedAt) || 0;
    o.userLat = Number(o.userLat) || 0;
    o.userLng = Number(o.userLng) || 0;
    o.talentLat = Number(o.talentLat) || 0;
    o.talentLng = Number(o.talentLng) || 0;
    orders.push(o);
  }
  return orders;
}

function findOrderRow(orderId) {
  var sheet = getOrdersSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(orderId)) return i + 1;
  }
  return -1;
}

function createOrder(o) {
  var sheet = getOrdersSheet();
  sheet.appendRow([o.id, o.userId, o.talentId, o.skillType||'', o.serviceType||'', o.description||'', o.price||0, o.fee||0, o.status||'pending', o.createdAt||Date.now(), 0,0,0, '', o.userLat||0, o.userLng||0, o.userAddr||'', o.talentLat||0, o.talentLng||0, 0, '']);
}

function updateOrderField(orderId, field, value) {
  var sheet = getOrdersSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var col = headers.indexOf(field);
  if (col < 0) return false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(orderId)) {
      sheet.getRange(i + 1, col + 1).setValue(value);
      return true;
    }
  }
  return false;
}

function updateOrderFields(orderId, fields) {
  var sheet = getOrdersSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(orderId)) {
      for (var key in fields) {
        var col = headers.indexOf(key);
        if (col >= 0) sheet.getRange(i + 1, col + 1).setValue(fields[key]);
      }
      return true;
    }
  }
  return false;
}

function getOrdersByUser(userId) {
  return getAllOrders().filter(function(o) { return o.userId === String(userId) || o.talentId === String(userId); });
}

// ========== MESSAGES SHEET ==========
var MESSAGES_SHEET_NAME = 'Messages';
function getMessagesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MESSAGES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MESSAGES_SHEET_NAME);
    sheet.appendRow(['id','orderId','senderId','senderName','text','photo','createdAt']);
  }
  return sheet;
}

function getMessagesByOrder(orderId) {
  var sheet = getMessagesSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var msgs = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(orderId)) {
      var m = {};
      for (var j = 0; j < headers.length; j++) m[headers[j]] = data[i][j];
      m.createdAt = Number(m.createdAt) || 0;
      msgs.push(m);
    }
  }
  return msgs;
}

function addMessage(msg) {
  var sheet = getMessagesSheet();
  sheet.appendRow([msg.id||'', msg.orderId||'', msg.senderId||'', msg.senderName||'', msg.text||'', msg.photo||'', msg.createdAt||Date.now()]);
}

// ========== RATING HELPERS ==========
function getTalentRating(talentId) {
  var orders = getAllOrders();
  var total = 0, count = 0;
  for (var i = 0; i < orders.length; i++) {
    if (orders[i].talentId === String(talentId) && orders[i].rating > 0) {
      total += orders[i].rating;
      count++;
    }
  }
  return count > 0 ? { avg: Math.round(total / count * 10) / 10, count: count } : { avg: 0, count: 0 };
}

// ========== SETTINGS SHEET ==========
function getSettingsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
    sheet.appendRow(['key', 'value']);
    // Default commission settings
    var defaults = [
      ['platform_fee', '2000'],
      ['delivery_fee_per_km', '3000'],
      ['service_fee_percent', '10'],
      ['commission_talent_percent', '15'],
      ['commission_penjual_percent', '10'],
      ['minimum_fee', '5000']
    ];
    for (var i = 0; i < defaults.length; i++) {
      sheet.appendRow(defaults[i]);
    }
  }
  return sheet;
}

function getSettings() {
  var sheet = getSettingsSheet();
  var data = sheet.getDataRange().getValues();
  var settings = {};
  for (var i = 1; i < data.length; i++) {
    settings[String(data[i][0])] = String(data[i][1]);
  }
  return settings;
}

function updateSetting(key, value) {
  var sheet = getSettingsSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(key)) {
      sheet.getRange(i + 1, 2).setValue(value);
      return true;
    }
  }
  // Key doesn't exist, add new row
  sheet.appendRow([key, value]);
  return true;
}

function updateMultipleSettings(settingsObj) {
  for (var key in settingsObj) {
    updateSetting(key, settingsObj[key]);
  }
  return true;
}

// ========== STORES SHEET ==========
function getStoresSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STORES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STORES_SHEET_NAME);
    sheet.appendRow(['id','userId','name','category','description','address','lat','lng','photo','isOpen','createdAt']);
  }
  return sheet;
}

function getAllStores() {
  var sheet = getStoresSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var stores = [];
  for (var i = 1; i < data.length; i++) {
    var s = {};
    for (var j = 0; j < headers.length; j++) s[headers[j]] = data[i][j];
    s.id = String(s.id || '');
    s.userId = String(s.userId || '');
    s.name = String(s.name || '');
    s.category = String(s.category || '');
    s.description = String(s.description || '');
    s.address = String(s.address || '');
    s.lat = Number(s.lat) || 0;
    s.lng = Number(s.lng) || 0;
    s.photo = String(s.photo || '');
    s.isOpen = String(s.isOpen) === 'true' || s.isOpen === true;
    s.createdAt = Number(s.createdAt) || 0;
    stores.push(s);
  }
  return stores;
}

function getStoresByUser(userId) {
  return getAllStores().filter(function(s) { return s.userId === String(userId); });
}

function getStoreById(storeId) {
  var stores = getAllStores();
  for (var i = 0; i < stores.length; i++) {
    if (stores[i].id === String(storeId)) return stores[i];
  }
  return null;
}

function createStore(s) {
  var sheet = getStoresSheet();
  sheet.appendRow([s.id||'', s.userId||'', s.name||'', s.category||'', s.description||'', s.address||'', s.lat||0, s.lng||0, s.photo||'', s.isOpen !== undefined ? s.isOpen : true, s.createdAt||Date.now()]);
}

function updateStoreFields(storeId, fields) {
  var sheet = getStoresSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(storeId)) {
      for (var key in fields) {
        var col = headers.indexOf(key);
        if (col >= 0) sheet.getRange(i + 1, col + 1).setValue(fields[key]);
      }
      return true;
    }
  }
  return false;
}

// ========== PRODUCTS SHEET ==========
function getProductsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PRODUCTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PRODUCTS_SHEET_NAME);
    sheet.appendRow(['id','storeId','name','category','description','price','stock','photo','isActive','createdAt']);
  }
  return sheet;
}

function getAllProducts() {
  var sheet = getProductsSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var products = [];
  for (var i = 1; i < data.length; i++) {
    var p = {};
    for (var j = 0; j < headers.length; j++) p[headers[j]] = data[i][j];
    p.id = String(p.id || '');
    p.storeId = String(p.storeId || '');
    p.name = String(p.name || '');
    p.category = String(p.category || '');
    p.description = String(p.description || '');
    p.price = Number(p.price) || 0;
    p.stock = Number(p.stock) || 0;
    p.photo = String(p.photo || '');
    p.isActive = String(p.isActive) === 'true' || p.isActive === true;
    p.createdAt = Number(p.createdAt) || 0;
    products.push(p);
  }
  return products;
}

function getProductsByStore(storeId) {
  return getAllProducts().filter(function(p) { return p.storeId === String(storeId); });
}

function createProduct(p) {
  var sheet = getProductsSheet();
  sheet.appendRow([p.id||'', p.storeId||'', p.name||'', p.category||'', p.description||'', p.price||0, p.stock||0, p.photo||'', p.isActive !== undefined ? p.isActive : true, p.createdAt||Date.now()]);
}

function updateProductFields(productId, fields) {
  var sheet = getProductsSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(productId)) {
      for (var key in fields) {
        var col = headers.indexOf(key);
        if (col >= 0) sheet.getRange(i + 1, col + 1).setValue(fields[key]);
      }
      return true;
    }
  }
  return false;
}

function deleteProduct(productId) {
  var sheet = getProductsSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(productId)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// ========== COMMISSION CALCULATOR ==========
function calculateCommission(orderType, price, distanceKm) {
  var settings = getSettings();
  var platformFee = Number(settings.platform_fee) || 2000;
  var deliveryPerKm = Number(settings.delivery_fee_per_km) || 3000;
  var servicePercent = Number(settings.service_fee_percent) || 10;
  var commTalent = Number(settings.commission_talent_percent) || 15;
  var commPenjual = Number(settings.commission_penjual_percent) || 10;
  var minFee = Number(settings.minimum_fee) || 5000;

  var deliveryFee = Math.round(deliveryPerKm * (distanceKm || 0));
  var serviceFee = Math.round(price * servicePercent / 100);
  var totalFee = Math.max(platformFee + serviceFee, minFee);

  var result = {
    price: price,
    platformFee: platformFee,
    deliveryFee: deliveryFee,
    serviceFee: serviceFee,
    totalFee: totalFee,
    totalPrice: price + totalFee + deliveryFee
  };

  if (orderType === 'product') {
    result.penjualEarning = Math.round(price * (100 - commPenjual) / 100);
    result.talentEarning = Math.round(deliveryFee * (100 - commTalent) / 100);
    result.ownerEarning = price - result.penjualEarning + deliveryFee - result.talentEarning + platformFee + serviceFee;
  } else {
    result.talentEarning = Math.round(price * (100 - commTalent) / 100);
    result.ownerEarning = price - result.talentEarning + platformFee + serviceFee;
  }

  return result;
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
    result = uid ? { success: true, data: getUserSkillsById(uid) } : { success: false, message: 'userId tidak ditemukan' };
  } else if (action === 'getAllOrders') {
    result = { success: true, data: getAllOrders() };
  } else if (action === 'getOrdersByUser') {
    var ouid = e.parameter.userId || '';
    result = ouid ? { success: true, data: getOrdersByUser(ouid) } : { success: false, message: 'userId tidak ditemukan' };
  } else if (action === 'getMessages') {
    var oid = e.parameter.orderId || '';
    result = oid ? { success: true, data: getMessagesByOrder(oid) } : { success: false, message: 'orderId tidak ditemukan' };
  } else if (action === 'getTalentRating') {
    var tid = e.parameter.talentId || '';
    result = tid ? { success: true, data: getTalentRating(tid) } : { success: false, message: 'talentId tidak ditemukan' };
  } else if (action === 'getSettings') {
    result = { success: true, data: getSettings() };
  } else if (action === 'getAllStores') {
    result = { success: true, data: getAllStores() };
  } else if (action === 'getStoresByUser') {
    var suid = e.parameter.userId || '';
    result = suid ? { success: true, data: getStoresByUser(suid) } : { success: false, message: 'userId tidak ditemukan' };
  } else if (action === 'getStoreById') {
    var sid = e.parameter.storeId || '';
    result = sid ? { success: true, data: getStoreById(sid) } : { success: false, message: 'storeId tidak ditemukan' };
  } else if (action === 'getAllProducts') {
    result = { success: true, data: getAllProducts() };
  } else if (action === 'getProductsByStore') {
    var psid = e.parameter.storeId || '';
    result = psid ? { success: true, data: getProductsByStore(psid) } : { success: false, message: 'storeId tidak ditemukan' };
  } else if (action === 'calculateCommission') {
    var cType = e.parameter.orderType || 'service';
    var cPrice = Number(e.parameter.price) || 0;
    var cDist = Number(e.parameter.distance) || 0;
    result = { success: true, data: calculateCommission(cType, cPrice, cDist) };
  } else if (action === 'login') {
    var username = e.parameter.username || '';
    var password = e.parameter.password || '';
    var users = getAllUsers();
    var found = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].username === username && users[i].password === password) { found = users[i]; break; }
    }
    result = found ? { success: true, data: found } : { success: false, message: 'Username atau password salah' };
  } else {
    result = { success: false, message: 'Action tidak dikenal' };
  }

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
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

    } else if (action === 'createOrder') {
      var oData = {
        id: body.id || (Date.now().toString(36) + Math.random().toString(36).substr(2,8)),
        userId: body.userId, talentId: body.talentId, skillType: body.skillType,
        serviceType: body.serviceType, description: body.description,
        price: body.price || 0, fee: body.fee || 0, status: 'pending',
        createdAt: Date.now(), userLat: body.userLat||0, userLng: body.userLng||0,
        userAddr: body.userAddr||'', talentLat: body.talentLat||0, talentLng: body.talentLng||0
      };
      createOrder(oData);
      result = { success: true, data: oData };

    } else if (action === 'updateOrder') {
      var oId = body.orderId || '';
      var fields = body.fields || {};
      if (!oId) { result = { success: false, message: 'orderId tidak ditemukan' }; }
      else {
        updateOrderFields(oId, fields);
        result = { success: true, message: 'Order diupdate' };
      }

    } else if (action === 'sendMessage') {
      var msgData = {
        id: body.id || (Date.now().toString(36) + Math.random().toString(36).substr(2,8)),
        orderId: body.orderId, senderId: body.senderId, senderName: body.senderName,
        text: body.text || '', photo: body.photo || '', createdAt: Date.now()
      };
      addMessage(msgData);
      result = { success: true, data: msgData };

    } else if (action === 'rateOrder') {
      var rOid = body.orderId || '';
      var rating = Number(body.rating) || 0;
      var review = body.review || '';
      if (!rOid || rating < 1 || rating > 5) { result = { success: false, message: 'Data rating tidak valid' }; }
      else {
        updateOrderFields(rOid, { rating: rating, review: review, status: 'rated' });
        result = { success: true, message: 'Rating berhasil' };
      }

    } else if (action === 'updateTalentLocation') {
      var tlOid = body.orderId || '';
      var tlat = body.lat || 0;
      var tlng = body.lng || 0;
      if (tlOid) {
        updateOrderFields(tlOid, { talentLat: tlat, talentLng: tlng });
        result = { success: true };
      } else { result = { success: false, message: 'orderId tidak ditemukan' }; }

    } else if (action === 'updateSettings') {
      var settingsData = body.settings || {};
      updateMultipleSettings(settingsData);
      result = { success: true, message: 'Settings berhasil diupdate' };

    } else if (action === 'createStore') {
      var storeData = {
        id: body.id || (Date.now().toString(36) + Math.random().toString(36).substr(2,8)),
        userId: body.userId || '',
        name: body.name || '',
        category: body.category || '',
        description: body.description || '',
        address: body.address || '',
        lat: body.lat || 0,
        lng: body.lng || 0,
        photo: body.photo || '',
        isOpen: body.isOpen !== undefined ? body.isOpen : true,
        createdAt: Date.now()
      };
      if (!storeData.name || !storeData.userId) {
        result = { success: false, message: 'Nama toko dan userId wajib diisi' };
      } else {
        createStore(storeData);
        result = { success: true, data: storeData, message: 'Toko berhasil dibuat' };
      }

    } else if (action === 'updateStore') {
      var usId = body.storeId || '';
      var usFields = body.fields || {};
      if (!usId) { result = { success: false, message: 'storeId tidak ditemukan' }; }
      else {
        updateStoreFields(usId, usFields);
        result = { success: true, message: 'Toko diupdate' };
      }

    } else if (action === 'createProduct') {
      var prodData = {
        id: body.id || (Date.now().toString(36) + Math.random().toString(36).substr(2,8)),
        storeId: body.storeId || '',
        name: body.name || '',
        category: body.category || '',
        description: body.description || '',
        price: body.price || 0,
        stock: body.stock || 0,
        photo: body.photo || '',
        isActive: body.isActive !== undefined ? body.isActive : true,
        createdAt: Date.now()
      };
      if (!prodData.name || !prodData.storeId) {
        result = { success: false, message: 'Nama produk dan storeId wajib diisi' };
      } else {
        createProduct(prodData);
        result = { success: true, data: prodData, message: 'Produk berhasil ditambahkan' };
      }

    } else if (action === 'updateProduct') {
      var upId = body.productId || '';
      var upFields = body.fields || {};
      if (!upId) { result = { success: false, message: 'productId tidak ditemukan' }; }
      else {
        updateProductFields(upId, upFields);
        result = { success: true, message: 'Produk diupdate' };
      }

    } else if (action === 'deleteProduct') {
      var dpId = body.productId || '';
      if (!dpId) { result = { success: false, message: 'productId tidak ditemukan' }; }
      else {
        var deleted = deleteProduct(dpId);
        result = deleted ? { success: true, message: 'Produk dihapus' } : { success: false, message: 'Produk tidak ditemukan' };
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
