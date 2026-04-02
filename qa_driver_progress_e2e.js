const fs = require('fs');
const path = require('path');
const vm = require('vm');

function clone(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

const db = {
  orders: new Map(),
  locations: new Map(),
};

function getTableMap(tableName) {
  if (tableName === 'orders') return db.orders;
  if (tableName === 'locations') return db.locations;
  return null;
}

function getRowKey(tableName, row) {
  if (tableName === 'orders') return String(row.id || '');
  if (tableName === 'locations') return String(row.order_id || '');
  return '';
}

function readField(row, col) {
  if (col === 'data->>sellerId') return String((row.data && row.data.sellerId) || '');
  return row[col];
}

function matchesFilters(row, filters) {
  for (const f of filters) {
    const actual = readField(row, f.col);
    if (String(actual) !== String(f.val)) return false;
  }
  return true;
}

function selectRows(tableName, filters, single) {
  const map = getTableMap(tableName);
  if (!map) return { data: single ? null : [], error: null };
  const rows = Array.from(map.values()).filter((row) => matchesFilters(row, filters)).map(clone);
  if (single) {
    if (!rows.length) {
      return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
    }
    return { data: rows[0], error: null };
  }
  return { data: rows, error: null };
}

function upsertRow(tableName, payload) {
  const map = getTableMap(tableName);
  if (!map) return { data: null, error: null };
  const row = clone(payload);
  const key = getRowKey(tableName, row);
  if (!key) return { data: null, error: { message: 'missing key' } };
  map.set(key, row);
  return { data: row, error: null };
}

function updateWhere(tableName, col, val, payload) {
  const map = getTableMap(tableName);
  if (!map) return { data: [], error: null };
  let count = 0;
  for (const [key, row] of map.entries()) {
    if (String(readField(row, col)) === String(val)) {
      map.set(key, Object.assign({}, row, clone(payload)));
      count++;
    }
  }
  return { data: new Array(count), error: null };
}

function deleteWhere(tableName, col, val) {
  const map = getTableMap(tableName);
  if (!map) return { data: [], error: null };
  let count = 0;
  for (const [key, row] of map.entries()) {
    if (String(readField(row, col)) === String(val)) {
      map.delete(key);
      count++;
    }
  }
  return { data: new Array(count), error: null };
}

function buildSelectQuery(tableName) {
  const state = { filters: [] };
  const query = {
    eq(col, val) {
      state.filters.push({ col, val });
      return query;
    },
    filter(col, op, val) {
      state.filters.push({ col, val });
      return query;
    },
    order() {
      return query;
    },
    single() {
      return Promise.resolve(selectRows(tableName, state.filters, true));
    },
    then(resolve, reject) {
      return Promise.resolve(selectRows(tableName, state.filters, false)).then(resolve, reject);
    },
    catch(reject) {
      return Promise.resolve(selectRows(tableName, state.filters, false)).catch(reject);
    }
  };
  return query;
}

const fakeSupabaseClient = {
  from(tableName) {
    return {
      select() {
        return buildSelectQuery(tableName);
      },
      upsert(payload) {
        return Promise.resolve(upsertRow(tableName, payload));
      },
      insert(payload) {
        return Promise.resolve(upsertRow(tableName, payload));
      },
      update(payload) {
        return {
          eq(col, val) {
            return Promise.resolve(updateWhere(tableName, col, val, payload));
          }
        };
      },
      delete() {
        return {
          eq(col, val) {
            return Promise.resolve(deleteWhere(tableName, col, val));
          }
        };
      }
    };
  },
  channel() {
    return {
      on() { return this; },
      subscribe() { return {}; }
    };
  },
  removeChannel() {},
  storage: {
    from() {
      return {
        upload() { return Promise.resolve({ data: null, error: null }); },
        getPublicUrl() { return { data: { publicUrl: '' } }; }
      };
    }
  }
};

global.window = {};
global.supabase = {
  createClient() {
    return fakeSupabaseClient;
  }
};

const supabaseFile = path.join(process.cwd(), 'supabase.js');
vm.runInThisContext(fs.readFileSync(supabaseFile, 'utf8'), { filename: 'supabase.js' });

const FB = global.window.FB;
if (!FB || typeof FB.post !== 'function') {
  throw new Error('window.FB.post tidak tersedia setelah load supabase.js');
}

function passFail(ok) {
  return ok ? 'PASS' : 'FAIL';
}

function isRejectedNearTarget(message, expectedTargetText) {
  const msg = String(message || '').toLowerCase();
  return msg.includes('ditolak') && msg.includes('sekitar') && msg.includes(expectedTargetText);
}

async function createBaseOrder(orderId, skillType, withStoreCoords) {
  const body = {
    action: 'createOrder',
    id: orderId,
    userId: 'user-1',
    talentId: 'driver-1',
    sellerId: 'seller-1',
    skillType,
    serviceType: skillType,
    status: 'on_the_way',
    userLat: -6.200000,
    userLng: 106.816000,
    storeLat: withStoreCoords ? -6.175392 : 0,
    storeLng: withStoreCoords ? 106.827153 : 0,
    destLat: -6.170000,
    destLng: 106.830000,
    createdAt: Date.now()
  };
  return FB.post(body);
}

async function updateStatus(orderId, status, lat, lng) {
  return FB.post({
    action: 'updateOrder',
    orderId,
    actorId: 'driver-1',
    fields: {
      status,
      talentId: 'driver-1',
      talentLat: lat,
      talentLng: lng,
      talentLastLocationAt: Date.now()
    }
  });
}

async function runServiceCase(skillType) {
  const caseResults = [];
  const idMain = 'ord-' + skillType + '-main';
  const idNoStore = 'ord-' + skillType + '-nostore';

  const farFromStore = { lat: -6.188500, lng: 106.816500 };
  const nearStore = { lat: -6.175390, lng: 106.827150 };
  const farFromBuyer = { lat: -6.175390, lng: 106.827150 };
  const nearBuyer = { lat: -6.200020, lng: 106.816020 };

  let res = await createBaseOrder(idMain, skillType, true);
  caseResults.push({
    name: 'Create order awal',
    ok: !!(res && res.success),
    detail: (res && res.message) || ''
  });

  res = await updateStatus(idMain, 'arrived', farFromStore.lat, farFromStore.lng);
  caseResults.push({
    name: 'on_the_way -> arrived saat jauh dari toko ditolak',
    ok: !!(res && !res.success && isRejectedNearTarget(res.message, 'titik toko')),
    detail: (res && res.message) || ''
  });

  res = await updateStatus(idMain, 'arrived', nearStore.lat, nearStore.lng);
  caseResults.push({
    name: 'on_the_way -> arrived saat dekat toko berhasil',
    ok: !!(res && res.success),
    detail: (res && res.message) || ''
  });

  res = await updateStatus(idMain, 'in_progress', farFromStore.lat, farFromStore.lng);
  caseResults.push({
    name: 'arrived -> in_progress saat jauh dari toko ditolak',
    ok: !!(res && !res.success && isRejectedNearTarget(res.message, 'titik toko')),
    detail: (res && res.message) || ''
  });

  res = await updateStatus(idMain, 'in_progress', nearStore.lat, nearStore.lng);
  caseResults.push({
    name: 'arrived -> in_progress saat dekat toko berhasil',
    ok: !!(res && res.success),
    detail: (res && res.message) || ''
  });

  res = await updateStatus(idMain, 'completed', farFromBuyer.lat, farFromBuyer.lng);
  caseResults.push({
    name: 'in_progress -> completed saat jauh dari pembeli ditolak',
    ok: !!(res && !res.success && isRejectedNearTarget(res.message, 'lokasi user/pembeli')),
    detail: (res && res.message) || ''
  });

  res = await updateStatus(idMain, 'completed', nearBuyer.lat, nearBuyer.lng);
  caseResults.push({
    name: 'in_progress -> completed saat dekat pembeli berhasil',
    ok: !!(res && res.success),
    detail: (res && res.message) || ''
  });

  res = await createBaseOrder(idNoStore, skillType, false);
  caseResults.push({
    name: 'Create order tanpa koordinat toko',
    ok: !!(res && res.success),
    detail: (res && res.message) || ''
  });

  res = await updateStatus(idNoStore, 'arrived', nearBuyer.lat, nearBuyer.lng);
  caseResults.push({
    name: 'on_the_way -> arrived tanpa koordinat toko ditolak (no fallback ke user)',
    ok: !!(res && !res.success && String(res.message || '').toLowerCase().includes('titik koordinat tujuan belum tersedia')),
    detail: (res && res.message) || ''
  });

  return caseResults;
}

(async function main() {
  const services = ['js_food', 'js_shop', 'js_medicine'];
  let total = 0;
  let passed = 0;

  for (const svc of services) {
    const result = await runServiceCase(svc);
    console.log('\n=== ' + svc + ' ===');
    result.forEach((item, idx) => {
      total++;
      if (item.ok) passed++;
      const suffix = item.ok ? '' : (' | ' + item.detail);
      console.log(String(idx + 1).padStart(2, '0') + '. [' + passFail(item.ok) + '] ' + item.name + suffix);
    });
  }

  console.log('\nTOTAL: ' + passed + '/' + total + ' PASS');
  if (passed !== total) process.exitCode = 1;
})().catch((err) => {
  console.error('Script gagal:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
