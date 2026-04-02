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

const tipCalls = [];
const tipFailOrders = new Set(['ord-tip-insufficient']);

global.fetch = function (url, opts) {
  if (String(url || '') !== '/api/wallet/pay') {
    return Promise.reject(new Error('Unexpected fetch URL: ' + String(url || '')));
  }

  let body = {};
  try {
    body = JSON.parse((opts && opts.body) || '{}');
  } catch (e) {
    body = {};
  }

  const operation = String(body.operation || '').toLowerCase();
  if (operation !== 'tipdriver') {
    return Promise.resolve({
      json: function () {
        return Promise.resolve({ success: false, message: 'Unsupported operation for this QA script' });
      }
    });
  }

  tipCalls.push(clone(body));
  if (tipFailOrders.has(String(body.orderId || ''))) {
    return Promise.resolve({
      json: function () {
        return Promise.resolve({ success: false, message: 'Saldo tidak cukup untuk memberi tip' });
      }
    });
  }

  const amount = Math.max(0, Math.round(Number(body.amount) || 0));
  return Promise.resolve({
    json: function () {
      return Promise.resolve({
        success: true,
        orderId: body.orderId,
        userId: body.userId,
        driverId: body.driverId,
        amount: amount,
        paidAt: Date.now(),
        debitTransactionId: 'tip_user_' + body.orderId + '_' + body.userId,
        creditTransactionId: 'tip_driver_' + body.orderId + '_' + body.driverId,
        debitLedgerId: 'wl_debit_' + body.orderId,
        creditLedgerId: 'wl_credit_' + body.orderId,
        userBalance: 90000,
        driverBalance: 15000
      });
    }
  });
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
if (!FB || typeof FB.post !== 'function' || typeof FB.get !== 'function') {
  throw new Error('window.FB tidak tersedia setelah load supabase.js');
}

function passFail(ok) {
  return ok ? 'PASS' : 'FAIL';
}

function assert(name, condition, detail) {
  return { name, ok: !!condition, detail: detail || '' };
}

async function createOrder(orderId, userId, talentId, status) {
  return FB.post({
    action: 'createOrder',
    id: orderId,
    userId: userId,
    talentId: talentId,
    skillType: 'js_antar',
    serviceType: 'JS Antar',
    status: status,
    price: 12000,
    fee: 2000,
    deliveryFee: 0,
    createdAt: Date.now()
  });
}

async function getOrderById(orderId) {
  const allRes = await FB.get('getAllOrders').then(function (r) { return r.json(); });
  if (!allRes || !allRes.success || !Array.isArray(allRes.data)) return null;
  return allRes.data.find(function (o) { return String(o.id) === String(orderId); }) || null;
}

(async function main() {
  const results = [];

  let res = await createOrder('ord-tip-ok', 'user-tip-1', 'driver-tip-1', 'completed');
  results.push(assert('Create order untuk tip sukses', !!(res && res.success), (res && res.message) || ''));

  res = await FB.post({
    action: 'rateOrder',
    orderId: 'ord-tip-ok',
    actorId: 'user-tip-1',
    rating: 5,
    review: 'Mantap',
    ratedAt: Date.now(),
    driverTip: 10000
  });
  results.push(assert('Rate order + tip sukses', !!(res && res.success), (res && res.message) || ''));

  let order = await getOrderById('ord-tip-ok');
  results.push(assert('Order menjadi rated', !!(order && order.status === 'rated'), order ? order.status : 'order null'));
  results.push(assert('driverTipPaid tersimpan true', !!(order && order.driverTipPaid === true), order ? JSON.stringify({ driverTipPaid: order.driverTipPaid }) : 'order null'));
  results.push(assert('driverTipPaidAmount sesuai nominal', !!(order && Number(order.driverTipPaidAmount) === 10000), order ? String(order.driverTipPaidAmount) : 'order null'));
  results.push(assert('Call tip API terjadi sekali', tipCalls.length === 1, 'tipCalls=' + tipCalls.length));

  res = await FB.post({
    action: 'rateOrder',
    orderId: 'ord-tip-ok',
    actorId: 'user-tip-1',
    rating: 5,
    review: 'Mantap lagi',
    ratedAt: Date.now(),
    driverTip: 10000
  });
  results.push(assert('Rate ulang nominal sama tetap sukses', !!(res && res.success), (res && res.message) || ''));
  results.push(assert('Rate ulang tidak panggil tip API lagi', tipCalls.length === 1, 'tipCalls=' + tipCalls.length));

  res = await FB.post({
    action: 'rateOrder',
    orderId: 'ord-tip-ok',
    actorId: 'user-tip-1',
    rating: 5,
    review: 'Ubah tip',
    ratedAt: Date.now(),
    driverTip: 15000
  });
  results.push(assert('Rate ulang nominal beda ditolak', !!(res && !res.success && String(res.message || '').toLowerCase().indexOf('tidak bisa diubah') >= 0), (res && res.message) || ''));

  res = await createOrder('ord-tip-insufficient', 'user-tip-2', 'driver-tip-2', 'completed');
  results.push(assert('Create order untuk skenario saldo kurang', !!(res && res.success), (res && res.message) || ''));

  res = await FB.post({
    action: 'rateOrder',
    orderId: 'ord-tip-insufficient',
    actorId: 'user-tip-2',
    rating: 5,
    review: 'Saldo kurang',
    ratedAt: Date.now(),
    driverTip: 5000
  });
  results.push(assert('Rate dengan saldo kurang ditolak', !!(res && !res.success && String(res.message || '').toLowerCase().indexOf('saldo tidak cukup') >= 0), (res && res.message) || ''));

  order = await getOrderById('ord-tip-insufficient');
  results.push(assert('Order saldo kurang tetap belum rated', !!(order && order.status === 'completed'), order ? order.status : 'order null'));

  res = await createOrder('ord-tip-zero', 'user-tip-3', 'driver-tip-3', 'completed');
  results.push(assert('Create order tanpa tip', !!(res && res.success), (res && res.message) || ''));

  res = await FB.post({
    action: 'rateOrder',
    orderId: 'ord-tip-zero',
    actorId: 'user-tip-3',
    rating: 4,
    review: 'Tanpa tip',
    ratedAt: Date.now(),
    driverTip: 0
  });
  results.push(assert('Rate tanpa tip tetap sukses', !!(res && res.success), (res && res.message) || ''));

  order = await getOrderById('ord-tip-zero');
  results.push(assert('Rate tanpa tip tidak set driverTipPaid', !!(order && !order.driverTipPaid), order ? JSON.stringify({ driverTipPaid: order.driverTipPaid }) : 'order null'));

  let passed = 0;
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    if (item.ok) passed++;
    const suffix = item.ok ? '' : (' | ' + item.detail);
    console.log(String(i + 1).padStart(2, '0') + '. [' + passFail(item.ok) + '] ' + item.name + suffix);
  }

  console.log('\nTOTAL: ' + passed + '/' + results.length + ' PASS');
  if (passed !== results.length) process.exitCode = 1;
})().catch(function (err) {
  console.error('Script gagal:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
