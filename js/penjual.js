/* ========================================
   JASA SURUH (JS) - Penjual Module
   Store Form, Products CRUD, Orders, Polling
   ======================================== */

var _penjualLastPendingIds = [];
var _penjualPendingOwnerId = '';
var _penjualPendingInitialized = false;
var _sellerStoreModalEventsSetup = false;
var _penjualProductsModalEventsSetup = false;
var _penjualProductFeeEventsSetup = false;
var _penjualSettingsCache = null;
var PENJUAL_SEEN_PENDING_KEY = 'js_penjual_seen_pending_orders';

function normalizeProductCategory(category) {
    var c = String(category || '').toLowerCase();
    if (c === 'grocery' || c === 'groceries') return 'shop';
    if (c === 'other' || c === 'lainnya') return 'shop';
    if (c === 'food' || c === 'drink' || c === 'snack' || c === 'shop' || c === 'medicine') return c;
    return 'shop';
}

function _formatCurrencyIdr(amount) {
    var n = Number(amount) || 0;
    if (typeof formatRupiah === 'function') return formatRupiah(n);
    return 'Rp ' + n.toLocaleString('id-ID');
}

function _getPenjualCommissionPercent() {
    var s = _penjualSettingsCache || {};
    var v = Number(s.commission_penjual_percent);
    return isFinite(v) && v >= 0 ? v : 10;
}

function loadPenjualSettings(forceRefresh) {
    if (_penjualSettingsCache && !forceRefresh) {
        return Promise.resolve(_penjualSettingsCache);
    }
    if (!isBackendConnected()) {
        _penjualSettingsCache = {};
        return Promise.resolve(_penjualSettingsCache);
    }
    return FB.get('getSettings')
        .then(function (r) { return r.json(); })
        .then(function (res) {
            _penjualSettingsCache = (res && res.success && res.data) ? res.data : {};
            return _penjualSettingsCache;
        })
        .catch(function () {
            _penjualSettingsCache = {};
            return _penjualSettingsCache;
        });
}

function updateProductNetEstimate() {
    var priceEl = document.getElementById('prodFormPrice');
    var hintEl = document.getElementById('prodNetEstimate');
    if (!priceEl || !hintEl) return;

    var price = Math.max(0, parseInt(priceEl.value, 10) || 0);
    var commPercent = _getPenjualCommissionPercent();
    var commission = Math.round(price * commPercent / 100);
    var sellerNet = Math.max(0, price - commission);

    if (price <= 0) {
        hintEl.textContent = 'Estimasi diterima seller setelah komisi ' + commPercent + '%: ' + _formatCurrencyIdr(0);
        return;
    }

    hintEl.textContent = 'Estimasi diterima seller: ' + _formatCurrencyIdr(sellerNet)
        + ' (potongan komisi ' + commPercent + '%: ' + _formatCurrencyIdr(commission) + ')';
}

function setupProductFeePreview() {
    if (_penjualProductFeeEventsSetup) return;
    var priceEl = document.getElementById('prodFormPrice');
    if (!priceEl) return;

    _penjualProductFeeEventsSetup = true;
    priceEl.addEventListener('input', updateProductNetEstimate);

    loadPenjualSettings(false).then(function () {
        updateProductNetEstimate();
    });
}

function _readSeenPendingMap() {
    try { return JSON.parse(localStorage.getItem(PENJUAL_SEEN_PENDING_KEY) || '{}') || {}; }
    catch (e) { return {}; }
}

function _writeSeenPendingMap(map) {
    try { localStorage.setItem(PENJUAL_SEEN_PENDING_KEY, JSON.stringify(map || {})); }
    catch (e) {}
}

function _getSeenPendingForSeller(sellerId) {
    var map = _readSeenPendingMap();
    var sid = String(sellerId || '');
    var ids = map[sid];
    return Array.isArray(ids) ? ids : [];
}

function _markPendingAsSeen(sellerId, orderId) {
    var sid = String(sellerId || '');
    var oid = String(orderId || '');
    if (!sid || !oid) return;

    var map = _readSeenPendingMap();
    var list = Array.isArray(map[sid]) ? map[sid] : [];
    if (list.indexOf(oid) < 0) list.push(oid);
    map[sid] = list;
    _writeSeenPendingMap(map);
}

function _cleanupSeenPending(sellerId, activePendingIds) {
    var sid = String(sellerId || '');
    if (!sid) return;

    var active = (activePendingIds || []).map(function (id) { return String(id); });
    var map = _readSeenPendingMap();
    var list = Array.isArray(map[sid]) ? map[sid] : [];
    map[sid] = list.filter(function (id) { return active.indexOf(String(id)) >= 0; });
    _writeSeenPendingMap(map);
}

// ══════════════════════════════════════════
// ═══ PENJUAL DASHBOARD ═══
// ══════════════════════════════════════════
function loadPenjualDashboard() {
    var session = getSession();
    if (!session || session.role !== 'penjual') return;
    var addrEl = document.getElementById('storeFormAddr');
    if (addrEl && session.address) addrEl.value = session.address;

    if (isBackendConnected()) {
        FB.get('getStoresByUser', { userId: session.id })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success && res.data && res.data.length > 0) {
                    _penjualStore = res.data[0];
                    populatePenjualStoreForm(_penjualStore);
                }
                loadPenjualProducts();
                loadPenjualOrders();
            }).catch(function () {
                loadPenjualProducts();
                loadPenjualOrders();
            });
    } else {
        loadPenjualProducts();
        loadPenjualOrders();
    }
}

function openSellerStoreModal() {
    var session = getSession();
    if (!session || session.role !== 'penjual') {
        showToast('Menu ini khusus akun Penjual', 'error');
        return;
    }

    var modal = document.getElementById('sellerStoreModal');
    if (!modal) return;

    if (!_sellerStoreModalEventsSetup) {
        _sellerStoreModalEventsSetup = true;
        var btnClose = document.getElementById('btnCloseSellerStoreModal');
        if (btnClose) btnClose.addEventListener('click', closeSellerStoreModal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeSellerStoreModal();
        });
    }

    // Ensure latest store data is reflected when opening modal.
    loadPenjualDashboard();
    modal.classList.remove('hidden');
}
window.openSellerStoreModal = openSellerStoreModal;

function closeSellerStoreModal() {
    var modal = document.getElementById('sellerStoreModal');
    if (modal) modal.classList.add('hidden');
}
window.closeSellerStoreModal = closeSellerStoreModal;

function openPenjualProductsModal() {
    var session = getSession();
    if (!session || (session.role !== 'penjual' && session.role !== 'seller')) {
        showToast('Menu ini khusus akun Penjual', 'error');
        return;
    }

    var modal = document.getElementById('penjualProductsModal');
    if (!modal) return;

    if (!_penjualProductsModalEventsSetup) {
        _penjualProductsModalEventsSetup = true;
        var btnClose = document.getElementById('btnClosePenjualProductsModal');
        if (btnClose) btnClose.addEventListener('click', closePenjualProductsModal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closePenjualProductsModal();
        });
    }

    modal.classList.remove('hidden');
    loadPenjualProducts();
}
window.openPenjualProductsModal = openPenjualProductsModal;

function closePenjualProductsModal() {
    var modal = document.getElementById('penjualProductsModal');
    if (modal) modal.classList.add('hidden');
    if (typeof resetBottomNavToHome === 'function') resetBottomNavToHome();
}
window.closePenjualProductsModal = closePenjualProductsModal;

function populatePenjualStoreForm(store) {
    if (!store) return;
    var nameEl = document.getElementById('storeFormName');
    var catEl = document.getElementById('storeFormCategory');
    var descEl = document.getElementById('storeFormDesc');
    var addrEl = document.getElementById('storeFormAddr');
    var toggle = document.getElementById('penjualStoreToggle');
    var statusLbl = document.getElementById('penjualStoreStatus');

    if (nameEl) nameEl.value = store.name || '';
    if (catEl) catEl.value = store.category || 'food';
    if (descEl) descEl.value = store.description || '';
    if (addrEl) addrEl.value = store.address || '';
    if (toggle) toggle.checked = store.isOpen;
    if (statusLbl) statusLbl.textContent = store.isOpen ? 'Online' : 'Offline';

    // Populate store photo
    var photoImg = document.getElementById('storePhotoImg');
    var photoPreview = document.getElementById('storePhotoPreview');
    var btnUpload = document.getElementById('storeBtnUpload');
    if (store.photo && photoImg) {
        photoImg.src = store.photo;
        photoImg.dataset.newUpload = '';
        photoImg.dataset.removed = '';
        if (photoPreview) photoPreview.style.display = 'block';
        if (btnUpload) btnUpload.style.display = 'none';
    } else {
        if (photoImg) {
            photoImg.src = '';
            photoImg.dataset.newUpload = '';
            photoImg.dataset.removed = '';
        }
        if (photoPreview) photoPreview.style.display = 'none';
        if (btnUpload) btnUpload.style.display = '';
    }
}

function handleStoreFormSubmit(e) {
    e.preventDefault();
    var session = getSession();
    if (!session) return;

    var name = (document.getElementById('storeFormName').value || '').trim();
    var category = document.getElementById('storeFormCategory').value;
    var desc = (document.getElementById('storeFormDesc').value || '').trim();
    var addr = (document.getElementById('storeFormAddr').value || '').trim() || session.address || '';
    var photoImg = document.getElementById('storePhotoImg');
    var isNewPhoto = photoImg && photoImg.dataset.newUpload === '1';
    var isPhotoRemoved = photoImg && photoImg.dataset.removed === '1';
    var photoData = '';

    if (isNewPhoto) {
        photoData = photoImg.src || '';
    } else if (isPhotoRemoved) {
        // User explicitly removed photo, persist empty value to backend.
        photoData = '';
    } else {
        photoData = (_penjualStore && _penjualStore.photo) || '';
    }

    if (!name) { showToast('Nama toko wajib diisi!', 'error'); return; }

    var btn = e.target.querySelector('.btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

    function doSaveStore(photo) {
        var storeData = {
            name: name,
            category: category,
            description: desc,
            address: addr,
            lat: session.lat || 0,
            lng: session.lng || 0,
            photo: photo
        };

        if (_penjualStore && _penjualStore.id) {
            backendPost({ action: 'updateStore', storeId: _penjualStore.id, fields: storeData })
                .then(function (res) {
                    if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Toko'; }
                    if (res && res.success) {
                        for (var k in storeData) _penjualStore[k] = storeData[k];
                        showToast('Toko berhasil diperbarui!', 'success');
                    } else {
                        showToast('Gagal memperbarui toko', 'error');
                    }
                });
        } else {
            var newStore = Object.assign({ action: 'createStore', id: generateId(), userId: session.id, isOpen: true, createdAt: Date.now() }, storeData);
            backendPost(newStore)
                .then(function (res) {
                    if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Toko'; }
                    if (res && res.success) {
                        _penjualStore = res.data || newStore;
                        showToast('Toko berhasil dibuat!', 'success');
                    } else {
                        showToast('Gagal membuat toko', 'error');
                    }
                });
        }
    }

    if (isNewPhoto && photoData.startsWith('data:')) {
        compressThumbnail(photoData, function (thumb) { doSaveStore(thumb); });
    } else {
        doSaveStore(photoData);
    }
}

function handlePenjualStoreToggle() {
    var toggle = document.getElementById('penjualStoreToggle');
    var statusLbl = document.getElementById('penjualStoreStatus');
    if (!toggle || !_penjualStore) {
        showToast('Simpan data toko terlebih dahulu!', 'error');
        if (toggle) toggle.checked = false;
        return;
    }
    var isOpen = toggle.checked;
    if (isOpen) {
        var balance = typeof getWalletBalance === 'function' ? getWalletBalance() : 0;
        if (balance < 50000) {
            toggle.checked = false;
            showToast('Saldo minimal Rp 50.000 untuk buka toko!', 'error');
            setTimeout(function () {
                if (confirm('Saldo Anda ' + formatRupiah(balance) + '. Minimal Rp 50.000 untuk bisa buka toko dan menerima pesanan.\n\nTop Up sekarang?')) {
                    openTopUpModal();
                }
            }, 300);
            return;
        }
    }
    if (statusLbl) statusLbl.textContent = isOpen ? 'Online' : 'Offline';
    _penjualStore.isOpen = isOpen;
    backendPost({ action: 'updateStore', storeId: _penjualStore.id, fields: { isOpen: isOpen } })
        .then(function () {
            showToast(isOpen ? 'Toko sekarang Buka! ✅' : 'Toko sekarang Tutup', isOpen ? 'success' : 'error');
        });
}

// ══════════════════════════════════════════
// ═══ PRODUCTS CRUD ═══
// ══════════════════════════════════════════
function loadPenjualProducts() {
    if (!_penjualStore || !_penjualStore.id) {
        renderPenjualProducts([]);
        return;
    }
    if (!isBackendConnected()) { renderPenjualProducts([]); return; }
    FB.get('getProductsByStore', { storeId: _penjualStore.id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            _penjualProducts = (res.success && res.data) ? res.data : [];
            renderPenjualProducts(_penjualProducts);
            var statEl = document.getElementById('penjualStatProducts');
            if (statEl) statEl.textContent = _penjualProducts.filter(function (p) { return p.isActive; }).length;
        }).catch(function () { renderPenjualProducts([]); });
}

function renderPenjualProducts(products) {
    var container = document.getElementById('penjualProductList');
    if (!container) return;
    var countEl = document.getElementById('penjualProductsModalCount');
    var subEl = document.getElementById('penjualProductsModalSub');

    var total = (products || []).length;
    var availableCount = (products || []).filter(function (p) {
        return (p.isAvailable !== undefined) ? !!p.isAvailable : ((Number(p.stock) || 0) > 0);
    }).length;
    if (countEl) countEl.textContent = total + ' produk';
    if (subEl) subEl.textContent = availableCount + ' tersedia • ' + (total - availableCount) + ' habis';

    if (!products || products.length === 0) {
        container.innerHTML = '<div class="skills-empty">Belum ada produk. Klik <strong>+ Tambah</strong> untuk menambahkan!</div>';
        return;
    }

    container.innerHTML = products.map(function (p) {
        var priceText = p.price ? 'Rp ' + Number(p.price).toLocaleString('id-ID') : '-';
        var isAvailable = (p.isAvailable !== undefined)
            ? !!p.isAvailable
            : ((Number(p.stock) || 0) > 0);
        var statusText = isAvailable ? '✅ Tersedia' : '⛔ Habis';
        return '<div class="ppm-card" data-pid="' + escapeHtml(p.id) + '">'
            + '<div class="ppm-top">'
            + (p.photo ? '<img class="ppm-img" src="' + p.photo + '" alt="' + escapeHtml(p.name || 'Produk') + '">' : '<div class="ppm-img ppm-img-placeholder">📦</div>')
            + '<div class="ppm-main">'
            + '<div class="ppm-name">' + escapeHtml(p.name || 'Produk') + '</div>'
            + '<div class="ppm-price">' + priceText + '</div>'
            + '</div>'
            + '<div class="ppm-actions">'
            + '<button class="ppm-icon-btn ppm-edit" data-pid="' + escapeHtml(p.id) + '" title="Edit">✏️</button>'
            + '<button class="ppm-icon-btn ppm-delete" data-pid="' + escapeHtml(p.id) + '" title="Hapus">✖</button>'
            + '</div>'
            + '</div>'
            + '<div class="ppm-bottom">'
            + '<span class="ppm-badge ' + (isAvailable ? 'on' : 'off') + '">' + statusText + '</span>'
            + '<label class="ppm-switch">'
            + '<input type="checkbox" class="ppm-toggle" data-pid="' + escapeHtml(p.id) + '" ' + (isAvailable ? 'checked' : '') + '>'
            + '<span>Tersedia</span>'
            + '</label>'
            + '</div>'
            + '</div>';
    }).join('');

    container.querySelectorAll('.ppm-edit').forEach(function (btn) {
        btn.addEventListener('click', function () { openEditProductModal(this.dataset.pid); });
    });
    container.querySelectorAll('.ppm-delete').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var pid = this.dataset.pid;
            if (confirm('Hapus produk ini?')) {
                backendPost({ action: 'deleteProduct', productId: pid }).then(function () {
                    showToast('Produk dihapus', 'success');
                    loadPenjualProducts();
                });
            }
        });
    });

    container.querySelectorAll('.ppm-toggle').forEach(function (input) {
        input.addEventListener('change', function () {
            var pid = this.dataset.pid;
            var val = !!this.checked;
            backendPost({ action: 'updateProduct', productId: pid, fields: { isAvailable: val, isActive: true } })
                .then(function (res) {
                    if (res && res.success) {
                        showToast(val ? 'Produk ditandai tersedia' : 'Produk ditandai habis', 'success');
                        loadPenjualProducts();
                    } else {
                        showToast('Gagal mengubah status produk', 'error');
                        loadPenjualProducts();
                    }
                })
                .catch(function () {
                    showToast('Gagal mengubah status produk', 'error');
                    loadPenjualProducts();
                });
        });
    });
}

function openAddProductModal() {
    var modal = document.getElementById('addProductModal');
    if (!modal) return;
    if (!_penjualStore || !_penjualStore.id) {
        showToast('Simpan data toko terlebih dahulu!', 'error');
        return;
    }
    document.getElementById('addProductTitle').textContent = 'Tambah Produk';
    document.getElementById('editProductId').value = '';
    document.getElementById('addProductForm').reset();
    document.getElementById('prodPhotoImg').src = '';
    document.getElementById('prodPhotoImg').dataset.newUpload = '';
    document.getElementById('prodPhotoPreview').style.display = 'none';
    document.getElementById('prodBtnUpload').style.display = '';
    updateProductNetEstimate();
    loadPenjualSettings(false).then(function () {
        updateProductNetEstimate();
    });
    modal.classList.remove('hidden');
}

function openEditProductModal(productId) {
    var product = _penjualProducts.find(function (p) { return p.id === productId; });
    if (!product) return;
    var modal = document.getElementById('addProductModal');
    if (!modal) return;
    document.getElementById('addProductTitle').textContent = 'Edit Produk';
    document.getElementById('editProductId').value = productId;
    document.getElementById('prodFormName').value = product.name || '';
    document.getElementById('prodFormCategory').value = normalizeProductCategory(product.category);
    document.getElementById('prodFormDesc').value = product.description || '';
    document.getElementById('prodFormPrice').value = product.price || '';
    var isAvailable = (product.isAvailable !== undefined)
        ? !!product.isAvailable
        : ((Number(product.stock) || 0) > 0);
    document.getElementById('prodFormAvailability').value = isAvailable ? 'available' : 'sold_out';
    if (product.photo) {
        document.getElementById('prodPhotoImg').src = product.photo;
        document.getElementById('prodPhotoImg').dataset.newUpload = '';
        document.getElementById('prodPhotoPreview').style.display = 'block';
        document.getElementById('prodBtnUpload').style.display = 'none';
    } else {
        document.getElementById('prodPhotoImg').src = '';
        document.getElementById('prodPhotoImg').dataset.newUpload = '';
        document.getElementById('prodPhotoPreview').style.display = 'none';
        document.getElementById('prodBtnUpload').style.display = '';
    }
    updateProductNetEstimate();
    loadPenjualSettings(false).then(function () {
        updateProductNetEstimate();
    });
    modal.classList.remove('hidden');
}

function handleProductFormSubmit(e) {
    e.preventDefault();
    if (!_penjualStore || !_penjualStore.id) { showToast('Data toko belum ada!', 'error'); return; }

    var productId = document.getElementById('editProductId').value;
    var name = (document.getElementById('prodFormName').value || '').trim();
    var category = normalizeProductCategory(document.getElementById('prodFormCategory').value);
    var desc = (document.getElementById('prodFormDesc').value || '').trim();
    var price = parseInt(document.getElementById('prodFormPrice').value) || 0;
    var availability = document.getElementById('prodFormAvailability').value;
    var isAvailable = availability !== 'sold_out';
    var photoImg = document.getElementById('prodPhotoImg');
    var isNewPhoto = photoImg.dataset.newUpload === '1';
    var photoData = isNewPhoto ? photoImg.src : (productId ? ((_penjualProducts.find(function (p) { return p.id === productId; }) || {}).photo || '') : '');

    if (!name || price < 500) { showToast('Nama dan harga minimal Rp 500 wajib diisi!', 'error'); return; }

    var btn = e.target.querySelector('.btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

    function doSave(photo) {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Produk'; }
        if (productId) {
            backendPost({ action: 'updateProduct', productId: productId, fields: { name: name, category: category, description: desc, price: price, isAvailable: isAvailable, photo: photo } })
                .then(function (res) {
                    if (res && res.success) {
                        showToast('Produk diperbarui!', 'success');
                        document.getElementById('addProductModal').classList.add('hidden');
                        loadPenjualProducts();
                    } else { showToast('Gagal memperbarui produk', 'error'); }
                });
        } else {
            backendPost({ action: 'createProduct', id: generateId(), storeId: _penjualStore.id, name: name, category: category, description: desc, price: price, isAvailable: isAvailable, photo: photo, isActive: true })
                .then(function (res) {
                    if (res && res.success) {
                        showToast('Produk berhasil ditambahkan!', 'success');
                        document.getElementById('addProductModal').classList.add('hidden');
                        loadPenjualProducts();
                    } else { showToast('Gagal menambahkan produk', 'error'); }
                });
        }
    }

    if (isNewPhoto && photoData.startsWith('data:')) {
        compressThumbnail(photoData, function (thumb) { doSave(thumb); });
    } else {
        doSave(photoData);
    }
}

function setupProductPhotoUpload() {
    var photoInput = document.getElementById('prodPhoto');
    var btnUpload = document.getElementById('prodBtnUpload');
    var photoPreview = document.getElementById('prodPhotoPreview');
    var photoImg = document.getElementById('prodPhotoImg');
    var removePhoto = document.getElementById('prodRemovePhoto');

    if (btnUpload && photoInput) {
        btnUpload.addEventListener('click', function () { photoInput.click(); });
        photoInput.addEventListener('change', function () {
            var file = this.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                photoImg.src = reader.result;
                photoImg.dataset.newUpload = '1';
                photoImg.dataset.removed = '';
                photoPreview.style.display = 'block';
                btnUpload.style.display = 'none';
            };
            reader.readAsDataURL(file);
            this.value = '';
        });
    }
    if (removePhoto) {
        removePhoto.addEventListener('click', function () {
            photoInput.value = '';
            photoImg.src = '';
            photoImg.dataset.newUpload = '';
            photoPreview.style.display = 'none';
            btnUpload.style.display = '';
        });
    }
}

function setupStorePhotoUpload() {
    var photoInput = document.getElementById('storePhoto');
    var btnUpload = document.getElementById('storeBtnUpload');
    var photoPreview = document.getElementById('storePhotoPreview');
    var photoImg = document.getElementById('storePhotoImg');
    var removePhoto = document.getElementById('storeRemovePhoto');

    if (btnUpload && photoInput) {
        btnUpload.addEventListener('click', function () { photoInput.click(); });
        photoInput.addEventListener('change', function () {
            var file = this.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                photoImg.src = reader.result;
                photoImg.dataset.newUpload = '1';
                photoPreview.style.display = 'block';
                btnUpload.style.display = 'none';
            };
            reader.readAsDataURL(file);
            this.value = '';
        });
    }
    if (removePhoto) {
        removePhoto.addEventListener('click', function () {
            if (photoInput) photoInput.value = '';
            photoImg.src = '';
            photoImg.dataset.newUpload = '';
            photoImg.dataset.removed = '1';
            photoPreview.style.display = 'none';
            btnUpload.style.display = '';
        });
    }
}

// ══════════════════════════════════════════
// ═══ PENJUAL ORDERS ═══
// ══════════════════════════════════════════
function loadPenjualOrders() {
    var session = getSession();
    if (!session || session.role !== 'penjual') return;
    if (!isBackendConnected()) return;
    FB.get('getOrdersByUser', { userId: session.id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                renderPenjualOrders(res.data, session);
                updatePenjualStats(res.data, session);
                checkNewPenjualOrders(res.data, session);
            }
        }).catch(function () {});
}

function checkNewPenjualOrders(orders, session) {
    if (!session) return;
    if (_penjualPendingOwnerId !== session.id) {
        _penjualPendingOwnerId = session.id;
        _penjualLastPendingIds = [];
        _penjualPendingInitialized = false;
    }

    var pending = orders.filter(function (o) {
        return o.sellerId === session.id && o.status === 'pending_seller';
    });
    var pendingIds = pending.map(function (o) { return String(o.id); });

    // Keep localStorage cache compact and allow re-notify if order left pending state.
    _cleanupSeenPending(session.id, pendingIds);

    // First snapshot after reload/login: treat existing pending orders as baseline,
    // so popup only appears for truly new orders that arrive afterwards.
    if (!_penjualPendingInitialized) {
        pending.forEach(function (o) { _markPendingAsSeen(session.id, o.id); });
        _penjualLastPendingIds = pendingIds;
        _penjualPendingInitialized = true;
        return;
    }

    var seenIds = _getSeenPendingForSeller(session.id);

    var newOrders = pending.filter(function (o) {
        var oid = String(o.id);
        var seenInSession = _penjualLastPendingIds.indexOf(oid) >= 0;
        var seenPersisted = seenIds.indexOf(oid) >= 0;
        return !seenInSession && !seenPersisted;
    });

    if (newOrders.length > 0) {
        _markPendingAsSeen(session.id, newOrders[0].id);
        showPenjualOrderNotification(newOrders[0]);
    }

    _penjualLastPendingIds = pendingIds;
}

function showPenjualOrderNotification(order) {
    var popup = document.getElementById('orderNotifPopup');
    if (!popup) return;

    var users = getUsers();
    var user = users.find(function (u) { return u.id === order.userId; });
    var userName = user ? user.name : 'Pembeli';
    var priceText = order.totalCost ? 'Rp ' + Number(order.totalCost).toLocaleString('id-ID') : '';

    document.getElementById('notifTitle').textContent = '🛒 Pesanan Baru!';
    document.getElementById('notifDesc').textContent = userName + ' memesan ' + (order.serviceType || 'produk') + (priceText ? ' - ' + priceText : '');

    popup.classList.remove('hidden');
    if (typeof playBellSound === 'function') playBellSound();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    addNotifItem({
        icon: '🛒',
        title: 'Pesanan Baru dari ' + userName,
        desc: (order.serviceType || 'Pesanan Produk') + (priceText ? ' - ' + priceText : ''),
        type: 'order',
        orderId: order.id
    });

    var dismissBtn = document.getElementById('notifBtnDismiss');
    var acceptBtn = document.getElementById('notifBtnAccept');

    var newDismiss = dismissBtn.cloneNode(true);
    dismissBtn.parentNode.replaceChild(newDismiss, dismissBtn);
    newDismiss.addEventListener('click', function () {
        _markPendingAsSeen(order.sellerId, order.id);
        popup.classList.add('hidden');
    });

    var newAccept = acceptBtn.cloneNode(true);
    acceptBtn.parentNode.replaceChild(newAccept, acceptBtn);
    newAccept.addEventListener('click', function () {
        _markPendingAsSeen(order.sellerId, order.id);
        popup.classList.add('hidden');
        openOrderTracking(order);
    });
}

function renderPenjualOrders(orders, session) {
    // Filter orders where this user is the seller (not talentId)
    var incoming = orders.filter(function (o) {
        return String(o.sellerId || '') === String(session.id || '') && (['pending_seller', 'preparing', 'pending'].indexOf(o.status) >= 0);
    });
    var inEl = document.getElementById('penjualIncomingOrders');
    var badgeEl = document.getElementById('penjualPendingBadge');
    if (!inEl) return;
    if (incoming.length === 0) {
        if (badgeEl) badgeEl.textContent = '';
        inEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><h3>Belum Ada Pesanan</h3><p>Pesanan produk dari pelanggan akan muncul di sini.</p></div>';
        return;
    }
    var users = getUsers();
    var statusLabels = { pending_seller: '🆕 Baru', preparing: '👨‍🍳 Menyiapkan', pending: '🔔 Baru' };
    inEl.innerHTML = incoming.map(function (o, idx) {
        var user = users.find(function (u) { return u.id === o.userId; });
        var userName = user ? user.name : 'Pelanggan';
        var priceText = o.price ? 'Rp ' + Number(o.price).toLocaleString('id-ID') : '-';
        var statusBadge = statusLabels[o.status] || 'Baru';
        return '<div class="td-order-card" data-idx="' + idx + '">'
            + '<div class="td-oc-top"><div class="td-oc-service">' + escapeHtml(o.serviceType || 'Pesanan Produk') + '</div>'
            + '<span class="otp-status-badge status-' + o.status + '">' + statusBadge + '</span></div>'
            + '<div class="td-oc-user">👤 ' + escapeHtml(userName) + '</div>'
            + '<div class="td-oc-bottom"><span class="td-oc-price">' + priceText + '</span>'
            + '<span class="td-oc-time">' + getTimeAgo(o.createdAt) + '</span></div></div>';
    }).join('');
    inEl.querySelectorAll('.td-order-card').forEach(function (card) {
        card.addEventListener('click', function () {
            var idx = parseInt(this.dataset.idx, 10);
            if (incoming[idx]) openOrderTracking(incoming[idx]);
        });
    });
    if (badgeEl) badgeEl.textContent = incoming.length > 0 ? incoming.length : '';
    // Note: penjualHeaderBadge is managed by updateNotifBadges() for notification count
    // Use penjualPendingBadge for order count instead
}

function updatePenjualStats(orders, session) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var todayOrders = orders.filter(function (o) {
        var isSellerOrder = String(o.sellerId || '') === String(session.id || '');
        var success = o.status === 'completed' || o.status === 'rated';
        if (!isSellerOrder || !success) return false;
        var ts = Number(o.completedAt || o.createdAt || 0);
        return ts >= today.getTime();
    });
    var earnings = orders.filter(function (o) { return o.status === 'completed' || o.status === 'rated'; })
        .reduce(function (sum, o) { return sum + (Number(o.price) || 0); }, 0);
    var statOrdersEl = document.getElementById('penjualStatOrders');
    var statEarnEl = document.getElementById('penjualStatEarning');
    if (statOrdersEl) statOrdersEl.textContent = todayOrders.length;
    if (statEarnEl) statEarnEl.textContent = 'Rp ' + earnings.toLocaleString('id-ID');
}

function startPenjualDashboardPolling() {
    if (_penjualDashPollTimer) { clearInterval(_penjualDashPollTimer); _penjualDashPollTimer = null; }
    if (_fbPenjualOrdersUnsub) { _fbPenjualOrdersUnsub(); _fbPenjualOrdersUnsub = null; }
    var session = getSession();
    if (!session) return;
    if (typeof FB !== 'undefined' && FB.isReady()) {
        _fbPenjualOrdersUnsub = FB.onOrdersForUser(session.id, function (res) {
            var s = getSession();
            if (s && s.role === 'penjual' && res.success && res.data) {
                renderPenjualOrders(res.data, s);
                updatePenjualStats(res.data, s);
                checkNewPenjualOrders(res.data, s);
            }
        });

        // Backup polling to avoid missed realtime events on some devices/networks.
        _penjualDashPollTimer = setInterval(function () {
            var s = getSession();
            if (s && s.role === 'penjual') {
                loadPenjualOrders();
            }
        }, 5000);
    } else {
        _penjualDashPollTimer = setInterval(function () {
            var s = getSession();
            if (s && s.role === 'penjual') {
                loadPenjualOrders();
            } else {
                clearInterval(_penjualDashPollTimer);
                _penjualDashPollTimer = null;
            }
        }, 10000);
    }
}
