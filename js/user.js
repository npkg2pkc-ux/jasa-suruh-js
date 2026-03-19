/* ========================================
   JASA SURUH (JS) - User Module
   Search, Promo, Services, Talent Listing,
   Store Listing, JS Antar, Product Orders
   ======================================== */

// ══════════════════════════════════════════
// ═══ USER NOTIFICATION BUTTON ═══
// ══════════════════════════════════════════
function setupUserNotifBtn(userId) {
    var btn = document.getElementById('userNotifBtn');
    if (!btn) return;
    if (!btn._eventsSetup) {
        btn._eventsSetup = true;
        btn.addEventListener('click', function () { openNotifPopup(); });
    }
    // initNotifications() is called from core.js updateRoleUI() for all roles
}

// ══════════════════════════════════════════
// ═══ USER SEARCH ═══
// ══════════════════════════════════════════
function setupUserSearch() {
    var input = document.getElementById('userSearchInput');
    var overlay = document.getElementById('searchResultsOverlay');
    var btnClose = document.getElementById('btnCloseSearch');
    if (!input) return;

    var debounceTimer;
    input.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        var q = this.value.trim();
        if (q.length < 2) {
            if (overlay) overlay.classList.add('hidden');
            return;
        }
        debounceTimer = setTimeout(function () { searchTalents(q); }, 300);
    });

    input.addEventListener('focus', function () {
        if (this.value.trim().length >= 2) searchTalents(this.value.trim());
    });

    if (btnClose) {
        btnClose.addEventListener('click', function () {
            overlay.classList.add('hidden');
            input.value = '';
        });
    }
    if (overlay) {
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                overlay.classList.add('hidden');
                input.value = '';
            }
        });
    }
}

function searchTalents(query) {
    var overlay = document.getElementById('searchResultsOverlay');
    var container = document.getElementById('searchResults');
    if (!overlay || !container) return;

    var q = query.toLowerCase();
    var users = getUsers();
    var allSkills = getSkills();
    var session = getSession();
    var myLat = session ? (session.lat || 0) : 0;
    var myLng = session ? (session.lng || 0) : 0;

    var results = users
        .filter(function (u) { return u.role === 'talent'; })
        .map(function (u) {
            var rawSkills = allSkills[u.id] || [];
            var skillNames = rawSkills.map(function (s) { return (typeof s === 'string') ? s : (s.name || s.type || ''); });
            var matched = skillNames.filter(function (s) { return s.toLowerCase().indexOf(q) >= 0; });
            var dist = -1;
            if (myLat && myLng && u.lat && u.lng) {
                dist = haversineDistance(myLat, myLng, u.lat, u.lng);
            }
            return { user: u, skills: skillNames, matched: matched, distance: dist };
        })
        .filter(function (r) { return r.matched.length > 0; })
        .sort(function (a, b) {
            if (a.distance >= 0 && b.distance >= 0) return a.distance - b.distance;
            if (a.distance >= 0) return -1;
            if (b.distance >= 0) return 1;
            return b.matched.length - a.matched.length;
        });

    overlay.classList.remove('hidden');

    if (results.length === 0) {
        container.innerHTML = '<div class="search-no-result"><div class="empty-icon">🔍</div><p>Tidak ada talent dengan keahlian "' + escapeHtml(query) + '"</p></div>';
        return;
    }

    container.innerHTML = results.map(function (r) {
        var initial = (r.user.name || 'T').charAt(0).toUpperCase();
        var skillTags = r.skills.map(function (s) {
            var isMatch = s.toLowerCase().indexOf(q) >= 0;
            return '<span class="search-result-skill' + (isMatch ? ' highlight' : '') + '">' + escapeHtml(s) + '</span>';
        }).join('');
        var distText = '';
        if (r.distance >= 0) {
            distText = '<span class="search-result-distance">📍 ' + (r.distance < 1 ? (r.distance * 1000).toFixed(0) + ' m' : r.distance.toFixed(1) + ' km') + '</span>';
        } else if (r.user.address) {
            distText = '<span class="search-result-distance">📍 ' + escapeHtml(r.user.address) + '</span>';
        }
        return '<div class="search-result-card">'
            + '<div class="search-result-avatar">' + initial + '</div>'
            + '<div class="search-result-info">'
            + '<div class="search-result-name">' + escapeHtml(r.user.name) + '</div>'
            + distText
            + '<div class="search-result-skills">' + skillTags + '</div>'
            + '</div></div>';
    }).join('');
}

// ══════════════════════════════════════════
// ═══ PROMO SLIDER ═══
// ══════════════════════════════════════════
function setupPromoSlider() {
    var track = document.getElementById('promoTrack');
    var dots = document.querySelectorAll('#promoDots .dot');
    if (!track || dots.length === 0) return;

    var current = 0;
    var total = dots.length;
    var startX = 0, isDragging = false;

    function goTo(index) {
        current = ((index % total) + total) % total;
        track.style.transform = 'translateX(-' + (current * 100) + '%)';
        dots.forEach(function (d, i) { d.classList.toggle('active', i === current); });
    }

    var autoSlide = setInterval(function () { goTo(current + 1); }, 4000);

    track.addEventListener('touchstart', function (e) {
        startX = e.touches[0].clientX;
        isDragging = true;
        clearInterval(autoSlide);
    }, { passive: true });

    track.addEventListener('touchend', function (e) {
        if (!isDragging) return;
        isDragging = false;
        var diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
            goTo(current + (diff > 0 ? 1 : -1));
        }
        autoSlide = setInterval(function () { goTo(current + 1); }, 4000);
    }, { passive: true });

    dots.forEach(function (d, i) {
        d.addEventListener('click', function () {
            clearInterval(autoSlide);
            goTo(i);
            autoSlide = setInterval(function () { goTo(current + 1); }, 4000);
        });
    });
}

// ══════════════════════════════════════════
// ═══ SERVICE CLICKS ═══
// ══════════════════════════════════════════
var SERVICE_TYPE_MAP = {
    'JS Antar': 'js_antar', 'JS Shop': 'js_shop', 'JS Food': 'js_food',
    'JS Delivery': 'js_delivery', 'JS Clean': 'js_clean', 'JS Service': 'js_service',
    'JS Medicine': 'js_medicine', 'JS Others': 'js_other'
};
var ACTIVE_SERVICES = ['js_clean', 'js_antar', 'js_shop', 'js_food', 'js_delivery', 'js_service', 'js_medicine', 'js_other'];

function setupServiceClicks() {
    var STORE_SERVICES = { 'JS Food': 'food', 'JS Shop': 'shop', 'JS Medicine': 'medicine' };

    document.querySelectorAll('.service-item').forEach(function (item) {
        item.addEventListener('click', function () {
            var name = this.querySelector('.service-name').textContent;
            if (name === 'JS Antar') {
                openJSAntarPage();
                return;
            }
            if (STORE_SERVICES[name]) {
                openStoreListPage(STORE_SERVICES[name]);
                return;
            }
            var skillType = SERVICE_TYPE_MAP[name];
            if (skillType && ACTIVE_SERVICES.indexOf(skillType) >= 0) {
                openServiceTalentPage(skillType);
            } else {
                showToast('Layanan "' + name + '" segera hadir! 🚀');
            }
        });
    });
}

// ══════════════════════════════════════════
// ═══ SERVICE TALENT PAGE ═══
// ══════════════════════════════════════════
function openServiceTalentPage(skillType) {
    var page = document.getElementById('serviceTalentPage');
    if (!page) return;

    _stpCurrentType = skillType;
    _stpCurrentSort = 'nearest';
    var def = SKILL_DEFS.find(function (d) { return d.type === skillType; });

    var titleEl = document.getElementById('stpTitle');
    var subtitleEl = document.getElementById('stpSubtitle');
    if (titleEl) titleEl.textContent = def ? def.icon + ' ' + def.name : 'Talent Tersedia';
    if (subtitleEl) subtitleEl.textContent = def ? def.desc : 'Temukan jasa terdekat';

    var searchInput = document.getElementById('stpSearchInput');
    if (searchInput) searchInput.value = '';
    page.querySelectorAll('.stp-sort-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.sort === 'nearest');
    });

    _stpAllTalents = buildTalentList(skillType);
    renderTalentCards(_stpAllTalents);

    _stpAllTalents.forEach(function (t) {
        fetchTalentRating(t.user.id, function (r) {
            t.rating = r;
            var el = document.getElementById('stcRating-' + t.user.id);
            if (el) el.innerHTML = '<span class="stc-rating-star">⭐</span> '
                + (r.avg > 0 ? r.avg.toFixed(1) + ' <small class="stc-rating-count">(' + r.count + ')</small>' : 'Baru');
        });
    });

    page.classList.remove('hidden');

    if (!page._eventsSetup) {
        page._eventsSetup = true;

        document.getElementById('stpBtnBack').addEventListener('click', function () {
            page.classList.add('hidden');
        });

        searchInput.addEventListener('input', function () {
            filterAndRender();
        });

        page.querySelectorAll('.stp-sort-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                page.querySelectorAll('.stp-sort-btn').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                _stpCurrentSort = btn.dataset.sort;
                filterAndRender();
            });
        });
    }
}

function buildTalentList(skillType) {
    var session = getSession();
    var myLat = session ? (session.lat || 0) : 0;
    var myLng = session ? (session.lng || 0) : 0;
    var users = getUsers();
    var allSkills = getSkills();
    var cachedRatings = _talentRatingsCache || {};

    return users
        .filter(function (u) { return u.role === 'talent'; })
        .map(function (u) {
            var rawSkills = allSkills[u.id] || [];
            var skill = rawSkills.find(function (s) {
                return (typeof s === 'string') ? false : (s.type === skillType);
            });
            if (!skill) return null;
            var dist = -1;
            if (myLat && myLng && u.lat && u.lng) {
                dist = haversineDistance(myLat, myLng, u.lat, u.lng);
            }
            var photo = skill.photo || getSkillPhoto(u.id, skillType);
            var rating = cachedRatings[u.id] || { avg: 0, count: 0 };
            return { user: u, skill: skill, distance: dist, photo: photo, rating: rating };
        })
        .filter(function (r) { return r !== null; });
}

function filterAndRender() {
    var q = (document.getElementById('stpSearchInput').value || '').trim().toLowerCase();
    var filtered = _stpAllTalents;
    if (q.length > 0) {
        filtered = filtered.filter(function (t) {
            var name = (t.user.name || '').toLowerCase();
            var svc = (t.skill.serviceType || '').toLowerCase();
            var desc = (t.skill.description || '').toLowerCase();
            return name.indexOf(q) >= 0 || svc.indexOf(q) >= 0 || desc.indexOf(q) >= 0;
        });
    }
    filtered = filtered.slice().sort(function (a, b) {
        if (_stpCurrentSort === 'nearest') {
            if (a.distance >= 0 && b.distance >= 0) return a.distance - b.distance;
            if (a.distance >= 0) return -1;
            if (b.distance >= 0) return 1;
            return 0;
        } else if (_stpCurrentSort === 'cheapest') {
            var pa = Number(a.skill.price) || 999999999;
            var pb = Number(b.skill.price) || 999999999;
            return pa - pb;
        } else {
            return (a.user.name || '').localeCompare(b.user.name || '');
        }
    });
    renderTalentCards(filtered);
}

function renderTalentCards(talents) {
    var list = document.getElementById('stpList');
    var countEl = document.getElementById('stpCount');
    if (!list) return;

    if (countEl) {
        countEl.textContent = talents.length > 0 ? talents.length + ' jasa tersedia' : '';
    }

    if (talents.length === 0) {
        list.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">🔍</div><h3>Tidak Ditemukan</h3><p>Belum ada talent yang menawarkan layanan ini di sekitar Anda.</p></div>';
        return;
    }

    list.innerHTML = talents.map(function (t, idx) {
        var distText = '';
        if (t.distance >= 0) {
            distText = t.distance < 1 ? (t.distance * 1000).toFixed(0) + ' m' : t.distance.toFixed(1) + ' km';
        }
        var priceText = t.skill.price ? 'Rp ' + Number(t.skill.price).toLocaleString('id-ID') : '';
        var serviceType = t.skill.serviceType || '';
        var desc = t.skill.description || '';
        var addr = t.user.address || '';
        var photo = t.photo;
        var profilePhoto = getProfilePhoto(t.user.id);

        var imgHtml = photo
            ? '<img src="' + photo + '" alt="' + escapeHtml(serviceType) + '">'
            : '<div class="stc-img-placeholder">🧹</div>';

        var talentAvatarHtml = profilePhoto
            ? '<div class="stc-talent-badge"><img src="' + profilePhoto + '" alt="' + escapeHtml(t.user.name) + '"><span class="stc-verified-dot">✓</span></div>'
            : '';

        return '<div class="stc" data-idx="' + idx + '">'
            + '<div class="stc-img">'
            + imgHtml
            + (distText ? '<span class="stc-dist-badge">📍 ' + distText + '</span>' : '')
            + talentAvatarHtml
            + '</div>'
            + '<div class="stc-body">'
            + '<div class="stc-name">' + escapeHtml(t.user.name) + '</div>'
            + (serviceType ? '<div class="stc-service">' + escapeHtml(serviceType) + '</div>' : '')
            + (desc ? '<div class="stc-desc">' + escapeHtml(desc) + '</div>' : '')
            + '<div class="stc-bottom">'
            + (priceText ? '<span class="stc-price">' + priceText + '</span>' : '')
            + '<span class="stc-rating" id="stcRating-' + t.user.id + '"><span class="stc-rating-star">⭐</span> ' + (t.rating && t.rating.avg > 0 ? t.rating.avg.toFixed(1) + ' <small class="stc-rating-count">(' + t.rating.count + ')</small>' : 'Baru') + '</span>'
            + '</div>'
            + (addr && !distText ? '<div class="stc-addr">📍 ' + escapeHtml(addr) + '</div>' : '')
            + '</div>'
            + '</div>';
    }).join('');

    list.querySelectorAll('.stc').forEach(function (card) {
        card.addEventListener('click', function () {
            var idx = parseInt(this.dataset.idx, 10);
            if (talents[idx]) openTalentDetail(talents[idx]);
        });
    });
}

// ══════════════════════════════════════════
// ═══ TALENT DETAIL PAGE ═══
// ══════════════════════════════════════════
function openTalentDetail(t) {
    var page = document.getElementById('talentDetailPage');
    var content = document.getElementById('tdpContent');
    var titleEl = document.getElementById('tdpTitle');
    if (!page || !content) return;

    if (titleEl) titleEl.textContent = t.user.name;

    var photo = t.photo;
    var profilePhoto = getProfilePhoto(t.user.id);
    var heroHtml = photo
        ? '<img src="' + photo + '" alt="">'
        : '<div class="tdp-hero-placeholder">🧹</div>';

    var distText = '';
    if (t.distance >= 0) {
        distText = t.distance < 1 ? (t.distance * 1000).toFixed(0) + ' m' : t.distance.toFixed(1) + ' km';
    }
    var priceText = t.skill.price ? 'Rp ' + Number(t.skill.price).toLocaleString('id-ID') : 'Hubungi untuk harga';
    var serviceType = t.skill.serviceType || '';
    var desc = t.skill.description || 'Tidak ada deskripsi.';
    var addr = t.user.address || 'Lokasi tidak tersedia';
    var initial = (t.user.name || 'T').charAt(0).toUpperCase();

    var talentAvatarHtml = profilePhoto
        ? '<div class="tdp-talent-avatar has-photo"><img src="' + profilePhoto + '" alt="' + escapeHtml(t.user.name) + '"><span class="tdp-verified-badge">✓ Terverifikasi</span></div>'
        : '<div class="tdp-talent-avatar">' + initial + '</div>';

    content.innerHTML = ''
        + '<div class="tdp-hero">' + heroHtml + '</div>'
        + '<div class="tdp-info">'
        + '<div class="tdp-name">' + escapeHtml(t.user.name) + '</div>'
        + (serviceType ? '<div class="tdp-service-type">' + escapeHtml(serviceType) + '</div>' : '')
        + '<div class="tdp-meta-row">'
        + '<span class="tdp-meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2"/></svg> ' + escapeHtml(addr) + '</span>'
        + (distText ? '<span class="tdp-meta-item">📍 ' + distText + '</span>' : '')
        + '<span class="tdp-meta-item">⭐ <span id="tdpRating">-</span></span>'
        + '</div>'
        + '<div class="tdp-price-row">'
        + '<div class="tdp-price-label">Mulai dari</div>'
        + '<div class="tdp-price-value">' + priceText + '</div>'
        + '</div>'
        + '</div>'
        + '<div class="tdp-section">'
        + '<div class="tdp-section-title">Deskripsi Layanan</div>'
        + '<div class="tdp-desc-text">' + escapeHtml(desc) + '</div>'
        + '</div>'
        + '<div class="tdp-section">'
        + '<div class="tdp-section-title">Tentang Talent</div>'
        + '<div class="tdp-talent-card">'
        + talentAvatarHtml
        + '<div class="tdp-talent-info">'
        + '<div class="tdp-talent-name">' + escapeHtml(t.user.name) + '</div>'
        + '<div class="tdp-talent-addr">📍 ' + escapeHtml(addr) + '</div>'
        + '</div>'
        + '</div>'
        + '</div>'
        + '<div class="tdp-spacer"></div>';

    page.classList.remove('hidden');

    fetchTalentRating(t.user.id, function (r) {
        var el = document.getElementById('tdpRating');
        if (el) el.textContent = r.avg > 0 ? r.avg.toFixed(1) + ' (' + r.count + ')' : 'Belum ada rating';
    });

    if (!page._eventsSetup) {
        page._eventsSetup = true;
        document.getElementById('tdpBtnBack').addEventListener('click', function () {
            page.classList.add('hidden');
        });
    }
    var orderBtn = document.getElementById('tdpBtnOrder');
    var newBtn = orderBtn.cloneNode(true);
    orderBtn.parentNode.replaceChild(newBtn, orderBtn);
    newBtn.addEventListener('click', function () {
        createNewOrder(t);
    });
}

// ══════════════════════════════════════════
// ═══ FETCH TALENT RATING ═══
// ══════════════════════════════════════════
function fetchTalentRating(talentId, callback) {
    if (!isBackendConnected()) { callback({ avg: 0, count: 0 }); return; }
    FB.get('getTalentRating', { talentId: talentId })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                _talentRatingsCache[talentId] = res.data;
                callback(res.data);
            } else { callback({ avg: 0, count: 0 }); }
        })
        .catch(function () { callback({ avg: 0, count: 0 }); });
}

// ══════════════════════════════════════════
// ═══ CREATE NEW ORDER ═══
// ══════════════════════════════════════════
function createNewOrder(t) {
    var session = getSession();
    if (!session) { showToast('Silakan login terlebih dahulu', 'error'); return; }
    if (session.role !== 'user') { showToast('Hanya user yang bisa memesan', 'error'); return; }

    var price = Number(t.skill.price) || 0;
    var fee = Math.round(price * 0.1);
    var totalCost = price + fee;

    // Check wallet balance
    if (getWalletBalance() < totalCost) {
        showToast('Saldo tidak cukup! Butuh ' + formatRupiah(totalCost) + '. Silakan top up dulu.', 'error');
        openTopUpModal();
        return;
    }

    var orderId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);

    var orderData = {
        action: 'createOrder',
        id: orderId,
        userId: session.id,
        talentId: t.user.id,
        skillType: t.skill.type || '',
        serviceType: t.skill.serviceType || t.skill.name || '',
        description: t.skill.description || '',
        price: price,
        fee: fee,
        userLat: session.lat || 0,
        userLng: session.lng || 0,
        userAddr: session.address || '',
        talentLat: t.user.lat || 0,
        talentLng: t.user.lng || 0
    };

    showToast('Memproses pembayaran...', 'success');

    // Deduct wallet first
    backendPost({ action: 'walletPay', userId: session.id, amount: totalCost, orderId: orderId, description: 'Pembayaran pesanan ' + (t.skill.serviceType || t.skill.name || '') })
        .then(function (payRes) {
            if (!payRes || !payRes.success) {
                showToast((payRes && payRes.message) || 'Saldo tidak cukup!', 'error');
                return;
            }
            // Create order after payment
            return backendPost(orderData).then(function (res) {
                if (res && res.success) {
                    var order = res.data || orderData;
                    order.status = 'pending';
                    order.createdAt = Date.now();
                    order.talentName = t.user.name;
                    order.userName = session.name;
                    showToast('Pesanan berhasil dibuat! Saldo dipotong ' + formatRupiah(totalCost), 'success');
                    document.getElementById('talentDetailPage').classList.add('hidden');
                    document.getElementById('serviceTalentPage').classList.add('hidden');
                    openOrderTracking(order);
                } else {
                    // Refund if order creation fails
                    backendPost({ action: 'walletCredit', userId: session.id, amount: totalCost, orderId: orderId, type: 'refund', description: 'Refund - gagal buat pesanan' });
                    showToast('Gagal membuat pesanan: ' + ((res && res.message) || 'Error'), 'error');
                }
            });
        }).catch(function () {
            showToast('Gagal memproses pembayaran', 'error');
        });
}

// ══════════════════════════════════════════
// ═══ STORE LISTING PAGE (for users) ═══
// ══════════════════════════════════════════
function openStoreListPage(category) {
    var page = document.getElementById('storeListPage');
    if (!page) return;
    _slpCurrentCat = category || 'all';

    var titleEl = document.getElementById('slpTitle');
    var subtitleEl = document.getElementById('slpSubtitle');
    var catTitles = { food: '🍔 JS Food', shop: '🛒 JS Shop', medicine: '💊 JS Medicine', all: 'Semua Toko' };
    var catDescs = { food: 'Pesan makanan & minuman', shop: 'Belanja kebutuhan sehari-hari', medicine: 'Beli obat & vitamin', all: 'Toko & produk terdekat' };
    if (titleEl) titleEl.textContent = catTitles[_slpCurrentCat] || 'Toko & Produk';
    if (subtitleEl) subtitleEl.textContent = catDescs[_slpCurrentCat] || '';

    var searchInput = document.getElementById('slpSearchInput');
    if (searchInput) searchInput.value = '';

    page.querySelectorAll('.stp-sort-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.cat === _slpCurrentCat || (_slpCurrentCat === 'all' && b.dataset.cat === 'all'));
    });

    page.classList.remove('hidden');
    document.getElementById('slpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">⏳</div><p>Memuat toko...</p></div>';

    if (isBackendConnected()) {
        FB.get('getAllStores')
            .then(function (r) { return r.json(); })
            .then(function (res) {
                _slpAllStores = (res.success && res.data) ? res.data.filter(function (s) { return s.isOpen; }) : [];
                filterAndRenderStores();
            }).catch(function () {
                document.getElementById('slpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">❌</div><p>Gagal memuat toko</p></div>';
            });
    } else {
        document.getElementById('slpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📡</div><p>Tidak ada koneksi server</p></div>';
    }

    if (!page._eventsSetup) {
        page._eventsSetup = true;
        document.getElementById('slpBtnBack').addEventListener('click', function () { page.classList.add('hidden'); });
        document.getElementById('slpSearchInput').addEventListener('input', function () { filterAndRenderStores(); });
        page.querySelectorAll('.stp-sort-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                page.querySelectorAll('.stp-sort-btn').forEach(function (b) { b.classList.remove('active'); });
                this.classList.add('active');
                _slpCurrentCat = this.dataset.cat;
                filterAndRenderStores();
            });
        });
    }
}

function filterAndRenderStores() {
    var q = (document.getElementById('slpSearchInput').value || '').trim().toLowerCase();
    var filtered = _slpAllStores;
    if (_slpCurrentCat !== 'all') {
        filtered = filtered.filter(function (s) { return s.category === _slpCurrentCat; });
    }
    if (q.length >= 2) {
        filtered = filtered.filter(function (s) {
            return (s.name || '').toLowerCase().indexOf(q) >= 0 || (s.description || '').toLowerCase().indexOf(q) >= 0;
        });
    }
    var session = getSession();
    var myLat = session ? (session.lat || 0) : 0;
    var myLng = session ? (session.lng || 0) : 0;
    filtered = filtered.slice().sort(function (a, b) {
        if (myLat && myLng && a.lat && a.lng && b.lat && b.lng) {
            return haversineDistance(myLat, myLng, a.lat, a.lng) - haversineDistance(myLat, myLng, b.lat, b.lng);
        }
        return 0;
    });

    var countEl = document.getElementById('slpCount');
    if (countEl) countEl.textContent = filtered.length > 0 ? filtered.length + ' toko tersedia' : '';
    renderStoreCards(filtered);
}

function renderStoreCards(stores) {
    var list = document.getElementById('slpList');
    if (!list) return;
    var session = getSession();
    var myLat = session ? (session.lat || 0) : 0;
    var myLng = session ? (session.lng || 0) : 0;
    var catIcons = { food: '🍔', shop: '🛒', medicine: '💊', other: '📦' };

    if (stores.length === 0) {
        list.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">🔍</div><h3>Tidak Ditemukan</h3><p>Belum ada toko yang buka di kategori ini.</p></div>';
        return;
    }

    list.innerHTML = stores.map(function (s, idx) {
        var icon = catIcons[s.category] || '🏪';
        var dist = (myLat && myLng && s.lat && s.lng) ? haversineDistance(myLat, myLng, s.lat, s.lng) : -1;
        var distText = dist >= 0 ? (dist < 1 ? (dist * 1000).toFixed(0) + ' m' : dist.toFixed(1) + ' km') : '';
        return '<div class="stc" data-idx="' + idx + '">'
            + '<div class="stc-img"><div class="stc-img-placeholder" style="font-size:36px">' + icon + '</div>'
            + (distText ? '<span class="stc-dist-badge">📍 ' + distText + '</span>' : '') + '</div>'
            + '<div class="stc-body">'
            + '<div class="stc-name">' + escapeHtml(s.name) + '</div>'
            + (s.description ? '<div class="stc-desc">' + escapeHtml(s.description) + '</div>' : '')
            + '<div class="stc-bottom">'
            + '<span class="stc-price">' + icon + ' ' + (s.category === 'food' ? 'Makanan' : s.category === 'shop' ? 'Belanja' : s.category === 'medicine' ? 'Obat' : 'Lainnya') + '</span>'
            + '<span class="stc-rating">' + (s.address ? '📍 ' + escapeHtml((s.address || '').split(',')[0]) : '') + '</span>'
            + '</div></div></div>';
    }).join('');

    list.querySelectorAll('.stc').forEach(function (card) {
        card.addEventListener('click', function () {
            var idx = parseInt(this.dataset.idx, 10);
            if (stores[idx]) openStoreDetail(stores[idx]);
        });
    });
}

function openStoreDetail(store) {
    _slpCurrentStore = store;
    _sdpProducts = [];
    _sdpSelectedProduct = null;
    var page = document.getElementById('storeDetailPage');
    if (!page) return;
    var titleEl = document.getElementById('sdpTitle');
    var subtitleEl = document.getElementById('sdpSubtitle');
    var footerEl = document.getElementById('sdpFooter');
    if (titleEl) titleEl.textContent = store.name;
    if (subtitleEl) subtitleEl.textContent = (store.address || '').split(',')[0];
    if (footerEl) footerEl.style.display = 'none';

    var productList = document.getElementById('sdpProductList');
    if (productList) productList.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">⏳</div><p>Memuat produk...</p></div>';

    page.classList.remove('hidden');

    if (isBackendConnected()) {
        FB.get('getProductsByStore', { storeId: store.id })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                _sdpProducts = (res.success && res.data) ? res.data.filter(function (p) { return p.isActive && p.stock > 0; }) : [];
                renderStoreProducts(_sdpProducts);
            }).catch(function () {
                if (productList) productList.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">❌</div><p>Gagal memuat produk</p></div>';
            });
    }

    if (!page._eventsSetup) {
        page._eventsSetup = true;
        document.getElementById('sdpBtnBack').addEventListener('click', function () { page.classList.add('hidden'); });
        document.getElementById('sdpBtnOrder').addEventListener('click', function () {
            if (_sdpSelectedProduct) createProductOrder(_sdpSelectedProduct, _slpCurrentStore);
        });
    }
}

function renderStoreProducts(products) {
    var list = document.getElementById('sdpProductList');
    if (!list) return;
    var footerEl = document.getElementById('sdpFooter');

    if (products.length === 0) {
        list.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📦</div><h3>Tidak Ada Produk</h3><p>Toko ini belum memiliki produk yang tersedia.</p></div>';
        if (footerEl) footerEl.style.display = 'none';
        return;
    }

    list.innerHTML = products.map(function (p, idx) {
        var priceText = p.price ? 'Rp ' + Number(p.price).toLocaleString('id-ID') : '-';
        return '<div class="stc" data-idx="' + idx + '" style="cursor:pointer">'
            + '<div class="stc-img">'
            + (p.photo ? '<img src="' + p.photo + '" alt="">' : '<div class="stc-img-placeholder">📦</div>')
            + '</div>'
            + '<div class="stc-body">'
            + '<div class="stc-name">' + escapeHtml(p.name) + '</div>'
            + (p.description ? '<div class="stc-desc">' + escapeHtml(p.description) + '</div>' : '')
            + '<div class="stc-bottom">'
            + '<span class="stc-price">' + priceText + '</span>'
            + '<span class="stc-rating">Stok: ' + p.stock + '</span>'
            + '</div></div></div>';
    }).join('');

    list.querySelectorAll('.stc').forEach(function (card) {
        card.addEventListener('click', function () {
            var idx = parseInt(this.dataset.idx, 10);
            if (!products[idx]) return;
            _sdpSelectedProduct = products[idx];
            list.querySelectorAll('.stc').forEach(function (c) { c.style.border = ''; });
            this.style.border = '2px solid #FF6B00';
            if (footerEl) footerEl.style.display = '';
        });
    });
}

function createProductOrder(product, store) {
    var session = getSession();
    if (!session) { showToast('Silakan login terlebih dahulu', 'error'); return; }
    if (session.role !== 'user') { showToast('Hanya user yang bisa memesan', 'error'); return; }
    if (!store) { showToast('Data toko tidak ditemukan', 'error'); return; }

    var price = Number(product.price) || 0;
    var deliveryFee = 3000;
    var fee = Math.round(price * 0.1);
    var totalCost = price + deliveryFee + fee;

    // Check wallet balance
    if (getWalletBalance() < totalCost) {
        showToast('Saldo tidak cukup! Butuh ' + formatRupiah(totalCost) + '. Silakan top up dulu.', 'error');
        openTopUpModal();
        return;
    }

    var orderId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);

    var orderData = {
        action: 'createOrder',
        id: orderId,
        userId: session.id,
        talentId: store.userId,
        skillType: 'js_food',
        serviceType: product.name,
        description: 'Produk dari ' + store.name,
        price: price + deliveryFee,
        fee: fee,
        userLat: session.lat || 0,
        userLng: session.lng || 0,
        userAddr: session.address || '',
        talentLat: store.lat || 0,
        talentLng: store.lng || 0
    };

    showToast('Memproses pembayaran...', 'success');

    backendPost({ action: 'walletPay', userId: session.id, amount: totalCost, orderId: orderId, description: 'Pembayaran produk ' + product.name })
        .then(function (payRes) {
            if (!payRes || !payRes.success) {
                showToast((payRes && payRes.message) || 'Saldo tidak cukup!', 'error');
                return;
            }
            return backendPost(orderData).then(function (res) {
                if (res && res.success) {
                    var order = res.data || orderData;
                    order.status = 'pending';
                    order.createdAt = Date.now();
                    order.talentName = store.name;
                    order.userName = session.name;
                    showToast('Pesanan berhasil! Saldo dipotong ' + formatRupiah(totalCost), 'success');
                    document.getElementById('storeDetailPage').classList.add('hidden');
                    document.getElementById('storeListPage').classList.add('hidden');
                    openOrderTracking(order);
                } else {
                    backendPost({ action: 'walletCredit', userId: session.id, amount: totalCost, orderId: orderId, type: 'refund', description: 'Refund - gagal buat pesanan' });
                    showToast('Gagal membuat pesanan: ' + ((res && res.message) || 'Error'), 'error');
                }
            });
        }).catch(function () {
            showToast('Gagal memproses pembayaran', 'error');
        });
}

// ══════════════════════════════════════════
// ═══ JS ANTAR (OJEK) ═══
// ══════════════════════════════════════════
function openJSAntarPage() {
    var page = document.getElementById('jsAntarPage');
    if (!page) return;
    page.classList.remove('hidden');
    _japDestCoords = null;
    _japDestAddress = '';
    _japRouteDistKm = 0;
    _japPickOnMapMode = false;
    document.getElementById('japInfoRow').classList.add('hidden');
    document.getElementById('japNoteWrap').classList.add('hidden');
    document.getElementById('japBtnOrder').disabled = true;
    document.getElementById('japBtnOrder').textContent = '🏍️ Temukan Driver';
    document.getElementById('japDestInput').value = '';
    document.getElementById('japDestSuggestions').classList.add('hidden');
    document.getElementById('japDestSuggestions').innerHTML = '';
    document.getElementById('japPickupText').textContent = '📍 Mendeteksi lokasi...';
    var hint = document.getElementById('japMapPickHint');
    if (hint) hint.classList.add('hidden');

    if (!_japEventsSetup) {
        _japEventsSetup = true;
        document.getElementById('japBtnBack').addEventListener('click', closeJSAntarPage);
        document.getElementById('japDestInput').addEventListener('input', onJapDestInput);
        document.getElementById('japDestInput').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); document.getElementById('japDestSuggestions').classList.add('hidden'); }
        });
        document.getElementById('japBtnOrder').addEventListener('click', onJapOrderClick);
        var btnPickMap = document.getElementById('japBtnPickOnMap');
        if (btnPickMap) {
            btnPickMap.addEventListener('click', function () {
                _japPickOnMapMode = true;
                var h = document.getElementById('japMapPickHint');
                if (h) h.classList.remove('hidden');
                var mapEl = document.getElementById('japMap');
                if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' });
            });
        }
        var btnCancelPick = document.getElementById('japBtnCancelMapPick');
        if (btnCancelPick) {
            btnCancelPick.addEventListener('click', function () {
                _japPickOnMapMode = false;
                var h = document.getElementById('japMapPickHint');
                if (h) h.classList.add('hidden');
            });
        }
        document.addEventListener('click', function (e) {
            var sugg = document.getElementById('japDestSuggestions');
            var input = document.getElementById('japDestInput');
            if (sugg && !sugg.contains(e.target) && e.target !== input) {
                sugg.classList.add('hidden');
            }
        });
    }

    if (isBackendConnected()) {
        FB.get('getSettings')
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success && res.data) {
                    _japPricePerKm = Number(res.data.delivery_fee_per_km) || 3000;
                    _japBaseFare = Number(res.data.minimum_fee) || 5000;
                }
            })
            .catch(function () {});
    }

    setTimeout(function () { initJapMap(); }, 100);
}

function closeJSAntarPage() {
    var page = document.getElementById('jsAntarPage');
    if (page) page.classList.add('hidden');
    if (_japMap) {
        if (_japRouteLine) { _japMap.removeLayer(_japRouteLine); _japRouteLine = null; }
    }
}

function initJapMap() {
    var session = getSession();
    var lat = (session && session.lat) ? Number(session.lat) : -6.2088;
    var lng = (session && session.lng) ? Number(session.lng) : 106.8456;

    if (_japMap) {
        _japMap.invalidateSize();
        _japMap.setView([lat, lng], 15);
        if (_japPickupMarker) _japPickupMarker.setLatLng([lat, lng]);
        else _japPickupMarker = createJapMarker(lat, lng, 'pickup').addTo(_japMap);
        _japPickupCoords = { lat: lat, lng: lng };
        updateJapPickupText(session && session.address ? session.address : null, lat, lng);
        return;
    }

    _japMap = L.map('japMap', { zoomControl: false }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 20,
        subdomains: 'abcd'
    }).addTo(_japMap);
    L.control.zoom({ position: 'bottomright' }).addTo(_japMap);

    _japPickupMarker = createJapMarker(lat, lng, 'pickup').addTo(_japMap);
    _japPickupCoords = { lat: lat, lng: lng };

    if (session && session.address) {
        updateJapPickupText(session.address, lat, lng);
    } else {
        reverseGeocode(lat, lng).then(function (addr) {
            updateJapPickupText(addr, lat, lng);
        });
    }

    _japMap.on('click', function (e) {
        if (_japPickOnMapMode) {
            _japPickOnMapMode = false;
            var hint = document.getElementById('japMapPickHint');
            if (hint) hint.classList.add('hidden');
            reverseGeocode(e.latlng.lat, e.latlng.lng).then(function (addr) {
                selectJapDestination(e.latlng.lat, e.latlng.lng, addr);
                var inp = document.getElementById('japDestInput');
                if (inp) inp.value = addr.split(',').slice(0, 2).join(',').trim();
            });
        } else if (!_japDestCoords) {
            _japPickupCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
            _japPickupMarker.setLatLng(e.latlng);
            reverseGeocode(e.latlng.lat, e.latlng.lng).then(function (addr) {
                updateJapPickupText(addr, e.latlng.lat, e.latlng.lng);
            });
        }
    });
}

function createJapMarker(lat, lng, type) {
    var pinClass = type === 'pickup' ? 'gm-pin-green' : 'gm-pin-red';
    var emoji = type === 'pickup' ? '📍' : '🏁';
    var label = type === 'pickup' ? 'Jemput' : 'Tujuan';
    var icon = L.divIcon({
        html: '<div class="gm-pin ' + pinClass + '"><div class="gm-pin-head">' + emoji + '</div><div class="gm-pin-tail"></div></div><div class="gm-pin-label">' + label + '</div>',
        className: 'gm-pin-wrapper',
        iconSize: [36, 58],
        iconAnchor: [18, 46],
        popupAnchor: [0, -46]
    });
    return L.marker([lat, lng], { icon: icon });
}

function updateJapPickupText(addr, lat, lng) {
    var el = document.getElementById('japPickupText');
    if (!el) return;
    if (addr) {
        el.textContent = addr;
    } else {
        reverseGeocode(lat, lng).then(function (a) { el.textContent = a; });
    }
}

function onJapDestInput() {
    var val = this.value.trim();
    if (_japSuggestTimer) clearTimeout(_japSuggestTimer);
    var sugg = document.getElementById('japDestSuggestions');
    if (val.length < 3) {
        sugg.classList.add('hidden');
        sugg.innerHTML = '';
        return;
    }
    sugg.classList.remove('hidden');
    sugg.innerHTML = '<div class="jap-suggestion-item" style="color:var(--gray-400)">Mencari...</div>';
    _japSuggestTimer = setTimeout(function () {
        searchPlaces(val);
    }, 600);
}

function searchPlaces(query) {
    var lat = _japPickupCoords ? _japPickupCoords.lat : -6.2088;
    var lng = _japPickupCoords ? _japPickupCoords.lng : 106.8456;
    var url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query)
        + '&format=json&limit=6&accept-language=id&countrycodes=id'
        + '&viewbox=' + (lng - 0.5) + ',' + (lat + 0.5) + ',' + (lng + 0.5) + ',' + (lat - 0.5)
        + '&bounded=0';
    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (results) {
            renderJapSuggestions(results);
        })
        .catch(function () {
            var sugg = document.getElementById('japDestSuggestions');
            if (sugg) sugg.innerHTML = '<div class="jap-suggestion-item" style="color:var(--red)">Gagal mencari lokasi</div>';
        });
}

function renderJapSuggestions(results) {
    var sugg = document.getElementById('japDestSuggestions');
    if (!sugg) return;
    if (!results || results.length === 0) {
        sugg.innerHTML = '<div class="jap-suggestion-item" style="color:var(--gray-400)">Tidak ditemukan</div>';
        return;
    }
    sugg.innerHTML = '';
    results.forEach(function (r) {
        var parts = (r.display_name || '').split(',');
        var name = parts[0].trim();
        var addr = parts.slice(1, 4).join(',').trim();
        var item = document.createElement('div');
        item.className = 'jap-suggestion-item';
        item.innerHTML = '<div class="jap-suggestion-name">' + escapeHtml(name) + '</div>'
            + (addr ? '<div class="jap-suggestion-addr">' + escapeHtml(addr) + '</div>' : '');
        item.addEventListener('click', function () {
            selectJapDestination(Number(r.lat), Number(r.lon), r.display_name || name);
        });
        sugg.appendChild(item);
    });
    sugg.classList.remove('hidden');
}

function selectJapDestination(lat, lng, displayName) {
    _japDestCoords = { lat: lat, lng: lng };
    _japDestAddress = displayName;
    document.getElementById('japDestInput').value = displayName.split(',').slice(0, 2).join(',').trim();
    document.getElementById('japDestSuggestions').classList.add('hidden');

    if (_japDestMarker) {
        _japDestMarker.setLatLng([lat, lng]);
    } else {
        _japDestMarker = createJapMarker(lat, lng, 'dest').addTo(_japMap);
    }

    if (_japPickupCoords && _japMap) {
        var bounds = L.latLngBounds(
            [_japPickupCoords.lat, _japPickupCoords.lng],
            [lat, lng]
        );
        _japMap.fitBounds(bounds, { padding: [40, 40] });
    }

    fetchJapRoute(_japPickupCoords.lat, _japPickupCoords.lng, lat, lng);
}

function fetchJapRoute(fromLat, fromLng, toLat, toLng) {
    var url = 'https://router.project-osrm.org/route/v1/driving/' + fromLng + ',' + fromLat + ';' + toLng + ',' + toLat + '?overview=full&geometries=geojson';
    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var distKm = 0;
            var durationMin = 0;
            if (data.routes && data.routes.length > 0) {
                distKm = data.routes[0].distance / 1000;
                durationMin = Math.round(data.routes[0].duration / 60);
                var coords = data.routes[0].geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
                if (_japRouteLine) _japMap.removeLayer(_japRouteLine);
                _japRouteLine = L.polyline(coords, { color: '#4285F4', weight: 5, opacity: 0.85, lineJoin: 'round', lineCap: 'round' }).addTo(_japMap);
            } else {
                distKm = haversineDistance(fromLat, fromLng, toLat, toLng);
                durationMin = Math.round(distKm / 0.4);
                if (_japRouteLine) _japMap.removeLayer(_japRouteLine);
                _japRouteLine = L.polyline([[fromLat, fromLng], [toLat, toLng]], { color: '#4285F4', weight: 4, dashArray: '8,12', opacity: 0.6, lineJoin: 'round', lineCap: 'round' }).addTo(_japMap);
            }
            _japRouteDistKm = distKm;
            updateJapPriceInfo(distKm, durationMin);
        })
        .catch(function () {
            var distKm = haversineDistance(fromLat, fromLng, toLat, toLng);
            var durationMin = Math.round(distKm / 0.4);
            _japRouteDistKm = distKm;
            updateJapPriceInfo(distKm, durationMin);
        });
}

var _japSelectedPayment = 'jspay'; // 'jspay' or 'cod'

function updateJapPriceInfo(distKm, durationMin) {
    var price = Math.max(_japBaseFare, Math.round(_japPricePerKm * distKm));
    price = Math.ceil(price / 500) * 500;
    var fee = Math.round(price * 0.1);
    var totalCost = price + fee;

    var distText = distKm < 1
        ? Math.round(distKm * 1000) + ' m'
        : distKm.toFixed(1) + ' km';
    var etaText = durationMin < 1 ? '< 1 menit' : durationMin + ' menit';

    document.getElementById('japDistance').textContent = distText;
    document.getElementById('japEta').textContent = etaText;
    document.getElementById('japInfoRow').classList.remove('hidden');
    document.getElementById('japNoteWrap').classList.remove('hidden');

    // Price breakdown
    var bd = document.getElementById('japPriceBreakdown');
    if (bd) {
        bd.classList.remove('hidden');
        document.getElementById('japPbBase').textContent = formatRupiah(price);
        document.getElementById('japPbFee').textContent = formatRupiah(fee);
        document.getElementById('japPbTotal').textContent = formatRupiah(totalCost);
    }

    // Payment method
    var pmEl = document.getElementById('japPayMethod');
    if (pmEl) {
        pmEl.classList.remove('hidden');
        var balEl = document.getElementById('japPmBalance');
        if (balEl) balEl.textContent = formatRupiah(getWalletBalance());
    }
    _setupJapPaymentToggle();

    var btn = document.getElementById('japBtnOrder');
    btn.disabled = false;
    btn.textContent = '🏍️ Pesan Driver — ' + formatRupiah(totalCost);
    btn.dataset.price = price;
    btn.dataset.fee = fee;
    btn.dataset.total = totalCost;
}

function _setupJapPaymentToggle() {
    var jspayBtn = document.getElementById('japPmJspay');
    var codBtn = document.getElementById('japPmCod');
    if (!jspayBtn || !codBtn || jspayBtn._pmSetup) return;
    jspayBtn._pmSetup = true;

    function selectPM(method) {
        _japSelectedPayment = method;
        jspayBtn.classList.toggle('active', method === 'jspay');
        codBtn.classList.toggle('active', method === 'cod');
    }
    jspayBtn.addEventListener('click', function () { selectPM('jspay'); });
    codBtn.addEventListener('click', function () { selectPM('cod'); });
}

function onJapOrderClick() {
    if (!_japPickupCoords || !_japDestCoords) {
        showToast('Tentukan titik jemput dan tujuan dulu!', 'error');
        return;
    }
    var session = getSession();
    if (!session) { showToast('Login dulu ya!', 'error'); return; }
    if (!isBackendConnected()) {
        showToast('Tidak ada koneksi ke server', 'error');
        return;
    }
    var btn = document.getElementById('japBtnOrder');
    var price = Number(btn.dataset.price) || 0;
    var fee = Number(btn.dataset.fee) || Math.round(price * 0.1);
    var totalCost = Number(btn.dataset.total) || (price + fee);
    var paymentMethod = _japSelectedPayment || 'jspay';
    var note = (document.getElementById('japNote').value || '').trim();
    var pickupAddr = document.getElementById('japPickupText').textContent || '';
    var destAddr = document.getElementById('japDestInput').value || _japDestAddress;

    // JsPay: check wallet balance. COD: no wallet check for user
    if (paymentMethod === 'jspay' && getWalletBalance() < totalCost) {
        showToast('Saldo JsPay tidak cukup! Butuh ' + formatRupiah(totalCost) + '. Top up atau pilih bayar Tunai (COD).', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Mencari driver...';

    var desc = 'Antar dari: ' + pickupAddr + '\nTujuan: ' + destAddr + '\nJarak: ' + _japRouteDistKm.toFixed(1) + ' km';
    if (note) desc += '\nCatatan: ' + note;

    var orderId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);

    var orderData = {
        action: 'createOrder',
        id: orderId,
        userId: session.id,
        talentId: '',
        skillType: 'js_antar',
        serviceType: 'JS Antar Motor',
        status: 'searching',
        description: desc,
        price: price,
        fee: fee,
        totalCost: totalCost,
        paymentMethod: paymentMethod,
        userLat: _japPickupCoords.lat,
        userLng: _japPickupCoords.lng,
        userAddr: pickupAddr,
        destLat: _japDestCoords.lat,
        destLng: _japDestCoords.lng,
        destAddr: destAddr,
        distanceKm: _japRouteDistKm
    };

    // Create order first (NO wallet deduction), then search for driver
    backendPost(orderData).then(function (res) {
        if (res && res.success && res.data) {
            var order = res.data;
            closeJSAntarPage();
            openOrderTracking(order);
            // Start searching for nearby driver
            searchNearbyDriver(order);
        } else {
            btn.disabled = false;
            btn.textContent = '🏍️ Pesan Driver — ' + formatRupiah(totalCost);
            showToast('Gagal membuat pesanan: ' + ((res && res.message) || 'coba lagi'), 'error');
        }
    }).catch(function () {
        btn.disabled = false;
        btn.textContent = '🏍️ Pesan Driver — ' + formatRupiah(totalCost);
        showToast('Koneksi error, coba lagi', 'error');
    });
}

// ── Search for nearest online driver ──
var _searchDriverTimer = null;
var _searchDriverAttempts = 0;
var _searchDriverMaxAttempts = 6; // 6 attempts x 5s = 30s max search

function searchNearbyDriver(order) {
    _searchDriverAttempts = 0;
    // Restore excluded talents from order data (in case of re-search after rejection)
    _searchDriverExcluded = (order.excludedTalents || []).slice();
    _doSearchDriver(order);
}

var _searchDriverExcluded = [];

function _doSearchDriver(order) {
    if (_searchDriverAttempts >= _searchDriverMaxAttempts) {
        showToast('Tidak ada driver tersedia saat ini. Pesanan dibatalkan.', 'error');
        backendPost({ action: 'updateOrder', orderId: order.id, fields: { status: 'cancelled', cancelledAt: Date.now(), cancelReason: 'no_driver' } });
        addNotifItem({ icon: '❌', title: 'Driver Tidak Ditemukan', desc: 'Tidak ada driver tersedia untuk pesanan JS Antar Anda.', type: 'order', orderId: order.id });
        return;
    }

    _searchDriverAttempts++;

    FB.get('findNearbyTalents', {
        lat: order.userLat,
        lng: order.userLng,
        skillType: 'js_antar',
        excludeUserId: order.userId,
        excludeTalentIds: _searchDriverExcluded
    }).then(function (r) { return r.json(); })
    .then(function (res) {
        if (!res.success || !res.data || res.data.length === 0) {
            // No driver found yet, retry after 5s
            _searchDriverTimer = setTimeout(function () { _doSearchDriver(order); }, 5000);
            return;
        }

        // Found nearest talent — assign to order
        var nearest = res.data[0];
        var distText = nearest.distance < 1 ? (nearest.distance * 1000).toFixed(0) + 'm' : nearest.distance.toFixed(1) + 'km';

        backendPost({
            action: 'updateOrder',
            orderId: order.id,
            fields: { talentId: nearest.id, status: 'pending', assignedAt: Date.now() }
        }).then(function () {
            // Notify the assigned talent
            addNotifItem({
                userId: nearest.id,
                icon: '🏍️',
                title: 'Pesanan JS Antar Baru!',
                desc: 'Jarak ' + distText + ' - ' + formatRupiah(order.price),
                type: 'order',
                orderId: order.id
            });
        });
    }).catch(function () {
        _searchDriverTimer = setTimeout(function () { _doSearchDriver(order); }, 5000);
    });
}

function cancelDriverSearch() {
    if (_searchDriverTimer) {
        clearTimeout(_searchDriverTimer);
        _searchDriverTimer = null;
    }
}
window.cancelDriverSearch = cancelDriverSearch;
window.searchNearbyDriver = searchNearbyDriver;
