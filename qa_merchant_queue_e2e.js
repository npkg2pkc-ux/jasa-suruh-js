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

  const rows = Array.from(map.values())
    .filter((row) => matchesFilters(row, filters))
    .map(clone);

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

global.fetch = function () {
  return Promise.reject(new Error('No fetch calls expected in qa_merchant_queue_e2e.js'));
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

async function createOrder(payload) {
  return FB.post(Object.assign({ action: 'createOrder' }, payload));
}

async function getOrderById(orderId) {
  const allRes = await FB.get('getAllOrders').then(function (r) { return r.json(); });
  if (!allRes || !allRes.success || !Array.isArray(allRes.data)) return null;
  return allRes.data.find(function (o) { return String(o.id) === String(orderId); }) || null;
}

function makeBaseOrder(orderId, skillType, sellerId) {
  const payload = {
    id: orderId,
    userId: 'user-queue',
    talentId: '',
    skillType: skillType,
    serviceType: 'Produk Test',
    status: 'pending_seller',
    price: 25000,
    deliveryFee: 5000,
    fee: 1000,
    totalCost: 31000,
    createdAt: Date.now()
  };

  if (sellerId) {
    payload.sellerId = sellerId;
    payload.storeId = 'store-' + sellerId;
  }

  return payload;
}

(async function main() {
  const results = [];

  // Non product service should never get queue code
  let res = await createOrder(makeBaseOrder('ord-non-product-1', 'js_antar', 'seller-A'));
  let order = await getOrderById('ord-non-product-1');
  results.push(assert('create non-product order success', !!(res && res.success), JSON.stringify(res)));
  results.push(assert('non-product order has no queueCode', !String(order && order.queueCode || ''), JSON.stringify(order)));
  results.push(assert('non-product order has no queueSequence', !Number(order && order.queueSequence || 0), JSON.stringify(order)));

  // Seller A should increment queue for food/shop/medicine
  await createOrder(makeBaseOrder('ord-A-1', 'food', 'seller-A'));
  await createOrder(makeBaseOrder('ord-A-2', 'shop', 'seller-A'));
  await createOrder(makeBaseOrder('ord-A-3', 'medicine', 'seller-A'));

  const ordA1 = await getOrderById('ord-A-1');
  const ordA2 = await getOrderById('ord-A-2');
  const ordA3 = await getOrderById('ord-A-3');

  results.push(assert('seller A first queue code JS001', String(ordA1 && ordA1.queueCode || '') === 'JS001', JSON.stringify(ordA1)));
  results.push(assert('seller A second queue code JS002', String(ordA2 && ordA2.queueCode || '') === 'JS002', JSON.stringify(ordA2)));
  results.push(assert('seller A third queue code JS003', String(ordA3 && ordA3.queueCode || '') === 'JS003', JSON.stringify(ordA3)));
  results.push(assert('seller A sequence numeric', Number(ordA3 && ordA3.queueSequence || 0) === 3, JSON.stringify(ordA3)));

  // Seller B should start from JS001 independently
  await createOrder(makeBaseOrder('ord-B-1', 'js_food', 'seller-B'));
  let ordB1 = await getOrderById('ord-B-1');
  results.push(assert('seller B first queue code JS001', String(ordB1 && ordB1.queueCode || '') === 'JS001', JSON.stringify(ordB1)));

  // Retry same order id should keep the same queue code (idempotent create)
  await createOrder(Object.assign(makeBaseOrder('ord-B-1', 'js_food', 'seller-B'), { status: 'preparing' }));
  ordB1 = await getOrderById('ord-B-1');
  results.push(assert('retry same order id keeps JS001', String(ordB1 && ordB1.queueCode || '') === 'JS001', JSON.stringify(ordB1)));

  // New order for seller B should continue to JS002
  await createOrder(makeBaseOrder('ord-B-2', 'js_shop', 'seller-B'));
  const ordB2 = await getOrderById('ord-B-2');
  results.push(assert('seller B second queue code JS002', String(ordB2 && ordB2.queueCode || '') === 'JS002', JSON.stringify(ordB2)));

  // Missing sellerId should not generate queue code
  await createOrder(makeBaseOrder('ord-no-seller', 'js_medicine', ''));
  const ordNoSeller = await getOrderById('ord-no-seller');
  results.push(assert('order without seller has no queue code', !String(ordNoSeller && ordNoSeller.queueCode || ''), JSON.stringify(ordNoSeller)));

  let pass = 0;
  results.forEach(function (r, idx) {
    if (r.ok) pass++;
    console.log(String(idx + 1).padStart(2, '0') + '. [' + passFail(r.ok) + '] ' + r.name + (r.detail ? ' -> ' + r.detail : ''));
  });

  const total = results.length;
  console.log('');
  console.log('QUEUE QA SUMMARY: ' + pass + '/' + total + ' PASS');

  if (pass !== total) {
    process.exitCode = 1;
  }
})();
