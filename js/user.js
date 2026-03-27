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
    'JS Medicine': 'js_medicine', 'JS Others': 'js_other', 'JS Other': 'js_other'
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
            if (name === 'JS Delivery') {
                openJSDeliveryPage();
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
    var profilePhoto = resolveTalentProfilePhoto(t);
    var skillDef = SKILL_DEFS.find(function (d) { return d.type === (t.skill.type || ''); });
    var heroIcon = skillDef ? skillDef.icon : '🧰';
    var heroHtml = photo
        ? '<img src="' + photo + '" alt="">'
        : '<div class="tdp-hero-placeholder">' + heroIcon + '</div>';

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
        ? '<div class="tdp-talent-avatar has-photo"><img src="' + profilePhoto + '" alt="' + escapeHtml(t.user.name) + '"><span class="tdp-verified-badge">✓</span></div>'
        : '<div class="tdp-talent-avatar">' + initial + '</div>';

    content.innerHTML = ''
        + '<div class="tdp-hero">' + heroHtml + '</div>'
        + '<div class="tdp-info">'
        + (serviceType ? '<div class="tdp-service-type">' + escapeHtml(serviceType) + '</div>' : '<div class="tdp-service-type">Layanan Talent</div>')
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
        + '<div class="tdp-talent-role">Talent Terverifikasi</div>'
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

function resolveTalentProfilePhoto(t) {
    if (!t || !t.user) return '';
    var uid = t.user.id;
    return resolveAvatarPublicUrl(t.user.foto_url)
        || t.user.photo
        || t.user.profilePhoto
        || t.user.avatar
        || getProfilePhoto(uid)
        || '';
}

function resolveAvatarPublicUrl(pathOrUrl) {
    var raw = String(pathOrUrl || '').trim();
    if (!raw) return '';
    if (raw.indexOf('http://') === 0 || raw.indexOf('https://') === 0 || raw.indexOf('data:') === 0) return raw;

    try {
        if (typeof window.FB !== 'undefined' && window.FB._sb && window.FB._sb.storage) {
            var res = window.FB._sb.storage.from('avatars').getPublicUrl(raw);
            if (res && res.data && res.data.publicUrl) return res.data.publicUrl;
        }
    } catch (e) {}

    return '';
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

function fetchSellerRating(sellerId, callback) {
    if (!sellerId) { callback({ avg: 0, count: 0 }); return; }
    if (_sellerRatingsCache && _sellerRatingsCache[sellerId]) {
        callback(_sellerRatingsCache[sellerId]);
        return;
    }
    if (!isBackendConnected()) { callback({ avg: 0, count: 0 }); return; }
    FB.get('getSellerRating', { sellerId: sellerId })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                _sellerRatingsCache[sellerId] = res.data;
                callback(res.data);
            } else {
                callback({ avg: 0, count: 0 });
            }
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

    // Fetch settings for dynamic fee
    FB.get('getSettings')
        .then(function (r) { return r.json(); })
        .then(function (sRes) {
            var feeAmount = 1000;
            if (sRes.success && sRes.data) {
                feeAmount = Number(sRes.data.service_fee_amount);
            }
            if (!isFinite(feeAmount) || feeAmount < 0) feeAmount = 1000;
            var fee = Math.max(0, Math.round(feeAmount));
            var totalCost = price + fee;

            openServicePaymentMethodModal({
                basePrice: price,
                feeAmount: fee,
                fee: fee,
                totalCost: totalCost
            }, function (paymentMethod) {
                if ((paymentMethod || 'jspay') === 'jspay' && getWalletBalance() < totalCost) {
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
                    totalCost: totalCost,
                    paymentMethod: paymentMethod || 'jspay',
                    userLat: session.lat || 0,
                    userLng: session.lng || 0,
                    userAddr: session.address || '',
                    talentLat: t.user.lat || 0,
                    talentLng: t.user.lng || 0
                };

                // Create order WITHOUT deducting balance.
                // Payment will be processed when talent accepts the order.
                return backendPost(orderData).then(function (res) {
                    if (res && res.success) {
                        var order = res.data || orderData;
                        order.status = 'pending';
                        order.createdAt = Date.now();
                        order.talentName = t.user.name;
                        order.userName = session.name;
                        showToast('Pesanan berhasil dibuat! Menunggu konfirmasi talent...', 'success');
                        document.getElementById('talentDetailPage').classList.add('hidden');
                        document.getElementById('serviceTalentPage').classList.add('hidden');
                        openOrderTracking(order);
                    } else {
                        showToast('Gagal membuat pesanan: ' + ((res && res.message) || 'Error'), 'error');
                    }
                });
            });
        }).catch(function () {
            showToast('Gagal memproses pesanan', 'error');
        });
}

function openServicePaymentMethodModal(costDetail, onConfirm) {
    var existing = document.getElementById('servicePaymentModal');
    if (existing) existing.remove();

    var detail = costDetail || {};
    var basePrice = Number(detail.basePrice) || 0;
    var feeAmount = Number(detail.feeAmount || detail.fee) || 0;
    var fee = Number(detail.fee) || 0;
    var totalCost = Number(detail.totalCost) || 0;

    var breakdownRows = ''
        + '<div class="svc-pay-breakdown-row"><span>Harga layanan</span><strong>' + formatRupiah(basePrice) + '</strong></div>'
        + '<div class="svc-pay-breakdown-row"><span>Biaya platform</span><strong>' + formatRupiah(Math.max(0, Math.round(feeAmount || fee))) + '</strong></div>';

    breakdownRows += '<div class="svc-pay-breakdown-row total"><span>Total estimasi</span><strong>' + formatRupiah(totalCost) + '</strong></div>';

    var overlay = document.createElement('div');
    overlay.id = 'servicePaymentModal';
    overlay.className = 'wallet-modal-overlay';
    overlay.innerHTML = '<div class="wallet-modal svc-pay-modal">'
        + '<div class="wallet-modal-header"><h3>Metode Pembayaran</h3><button class="wallet-modal-close" id="svcPayClose">&times;</button></div>'
        + '<div class="wallet-modal-body">'
        + '<div class="svc-pay-breakdown">'
        + '<div class="svc-pay-breakdown-title">Rincian Biaya</div>'
        + breakdownRows
        + '</div>'
        + '<div class="svc-pay-options">'
        + '<button type="button" class="svc-pay-btn active" data-method="jspay"><span class="svc-pay-icon">💳</span><span><strong>JSPay</strong><small>Saldo dipotong saat talent menerima pesanan</small></span></button>'
        + '<button type="button" class="svc-pay-btn" data-method="cod"><span class="svc-pay-icon">💵</span><span><strong>COD</strong><small>Bayar tunai langsung ke talent</small></span></button>'
        + '</div>'
        + '<button class="btn-primary" id="svcPayConfirmBtn" style="margin-top:12px">Lanjutkan Pesanan</button>'
        + '</div>'
        + '</div>';

    document.body.appendChild(overlay);

    var selected = 'jspay';
    var close = function () { overlay.remove(); };

    overlay.querySelector('#svcPayClose').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    overlay.querySelectorAll('.svc-pay-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            selected = btn.dataset.method || 'jspay';
            overlay.querySelectorAll('.svc-pay-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
        });
    });

    overlay.querySelector('#svcPayConfirmBtn').addEventListener('click', function () {
        close();
        if (typeof onConfirm === 'function') onConfirm(selected);
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

    // Hide category filter buttons when a specific category is selected
    var sortRow = page.querySelector('.stp-sort-row');
    if (sortRow) {
        sortRow.style.display = (_slpCurrentCat !== 'all') ? 'none' : '';
    }

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
        var sellerRating = (_sellerRatingsCache && _sellerRatingsCache[s.userId]) || { avg: 0, count: 0 };
        var storeImgHtml = s.photo
            ? '<img src="' + s.photo + '" alt="' + escapeHtml(s.name) + '" style="width:100%;height:100%;object-fit:cover;">'
            : '<div class="stc-img-placeholder" style="font-size:36px">' + icon + '</div>';
        return '<div class="stc" data-idx="' + idx + '">'
            + '<div class="stc-img">' + storeImgHtml
            + (distText ? '<span class="stc-dist-badge">📍 ' + distText + '</span>' : '') + '</div>'
            + '<div class="stc-body">'
            + '<div class="stc-name">' + escapeHtml(s.name) + '</div>'
            + (s.description ? '<div class="stc-desc">' + escapeHtml(s.description) + '</div>' : '')
            + '<div class="stc-bottom">'
            + '<span class="stc-price">' + icon + ' ' + (s.category === 'food' ? 'Makanan' : s.category === 'shop' ? 'Belanja' : s.category === 'medicine' ? 'Obat' : 'Lainnya') + '</span>'
            + '<span class="stc-rating" id="slpSellerRating-' + s.id + '"><span class="stc-rating-star">⭐</span> ' + sellerRating.avg.toFixed(1) + ' <small class="stc-rating-count">(' + sellerRating.count + ')</small></span>'
            + '</div></div></div>';
    }).join('');

    stores.forEach(function (s) {
        fetchSellerRating(s.userId, function (r) {
            var el = document.getElementById('slpSellerRating-' + s.id);
            if (!el) return;
            el.innerHTML = '<span class="stc-rating-star">⭐</span> ' + r.avg.toFixed(1) + ' <small class="stc-rating-count">(' + r.count + ')</small>';
        });
    });

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
    _shopCart = [];
    _shopSelectedPayment = 'jspay';
    var page = document.getElementById('storeDetailPage');
    if (!page) return;
    var titleEl = document.getElementById('sdpTitle');
    var subtitleEl = document.getElementById('sdpSubtitle');
    var footerEl = document.getElementById('sdpFooter');
    if (titleEl) titleEl.textContent = store.name;
    if (subtitleEl) subtitleEl.textContent = (store.address || '').split(',')[0];
    fetchSellerRating(store.userId, function (r) {
        if (subtitleEl) subtitleEl.textContent = ((store.address || '').split(',')[0] || '-') + ' • ⭐ ' + r.avg.toFixed(1) + ' (' + r.count + ')';
    });
    if (footerEl) footerEl.style.display = '';

    var productList = document.getElementById('sdpProductList');
    if (productList) productList.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">⏳</div><p>Memuat produk...</p></div>';

    page.classList.remove('hidden');

    if (isBackendConnected()) {
        FB.get('getProductsByStore', { storeId: store.id })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                _sdpProducts = (res.success && res.data) ? res.data.filter(function (p) { return p.isActive; }) : [];
                renderStoreProducts(_sdpProducts);
            }).catch(function () {
                if (productList) productList.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">❌</div><p>Gagal memuat produk</p></div>';
            });
    }

    if (!page._eventsSetup) {
        page._eventsSetup = true;
        document.getElementById('sdpBtnBack').addEventListener('click', function () { page.classList.add('hidden'); });
        document.getElementById('sdpBtnOrder').addEventListener('click', function () {
            openShopCheckoutModal();
        });
    }

    updateShopCartUI();
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
        var qtyInCart = _shopGetProductQty(p.id);
        var isAvailable = (p.isAvailable !== undefined)
            ? !!p.isAvailable
            : ((Number(p.stock) || 0) > 0);
        var statusText = isAvailable ? '✅ Tersedia' : '⛔ Habis';
        var unavailableClass = isAvailable ? '' : ' stc-unavailable';
        var minusDisabled = !isAvailable ? ' disabled' : '';
        var plusDisabled = !isAvailable ? ' disabled' : '';
        return '<div class="stc" data-idx="' + idx + '" style="cursor:pointer">'
            + '<div class="stc-img' + unavailableClass + '">'
            + (p.photo ? '<img src="' + p.photo + '" alt="">' : '<div class="stc-img-placeholder">📦</div>')
            + (!isAvailable ? '<div class="stc-unavailable-badge">HABIS</div>' : '')
            + '</div>'
            + '<div class="stc-body' + unavailableClass + '">'
            + '<div class="stc-name">' + escapeHtml(p.name) + '</div>'
            + (p.description ? '<div class="stc-desc">' + escapeHtml(p.description) + '</div>' : '')
            + '<div class="stc-bottom">'
            + '<span class="stc-price">' + priceText + '</span>'
            + '<span class="stc-rating">' + statusText + '</span>'
            + '<div class="stc-qty-wrap">'
            + '<button class="stc-qty-btn stc-qty-minus" data-minus-idx="' + idx + '" title="Kurangi"' + minusDisabled + '>-</button>'
            + '<span class="stc-qty-val">' + qtyInCart + '</span>'
            + '<button class="stc-qty-btn stc-qty-plus" data-plus-idx="' + idx + '" title="Tambah"' + plusDisabled + '>+</button>'
            + '</div>'
            + '</div></div></div>';
    }).join('');

    list.querySelectorAll('.stc-qty-plus').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var idx = parseInt(this.getAttribute('data-plus-idx'), 10);
            if (!products[idx]) return;
            var p = products[idx];
            var isAvailable = (p.isAvailable !== undefined)
                ? !!p.isAvailable
                : ((Number(p.stock) || 0) > 0);
            if (!isAvailable) return;
            var currentQty = _shopGetProductQty(products[idx].id);
            _shopSetProductQty(products[idx], currentQty + 1);
            renderStoreProducts(products);
        });
    });

    list.querySelectorAll('.stc-qty-minus').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var idx = parseInt(this.getAttribute('data-minus-idx'), 10);
            if (!products[idx]) return;
            var currentQty = _shopGetProductQty(products[idx].id);
            _shopSetProductQty(products[idx], currentQty - 1);
            renderStoreProducts(products);
        });
    });

    list.querySelectorAll('.stc').forEach(function (card) {
        card.addEventListener('click', function () {
            var idx = parseInt(this.dataset.idx, 10);
            if (!products[idx]) return;
            var p = products[idx];
            var isAvailable = (p.isAvailable !== undefined)
                ? !!p.isAvailable
                : ((Number(p.stock) || 0) > 0);
            if (!isAvailable) {
                showToast('Produk sedang habis', 'error');
                return;
            }
            openShopProductModal(products[idx]);
        });
    });

    if (footerEl) footerEl.style.display = '';
    updateShopCartUI();
}

var _shopCart = [];
var _shopSelectedPayment = 'jspay';

function _shopCartTotalQty() {
    return _shopCart.reduce(function (sum, it) { return sum + (Number(it.qty) || 0); }, 0);
}

function _shopCartSubtotal() {
    return _shopCart.reduce(function (sum, it) { return sum + ((Number(it.price) || 0) * (Number(it.qty) || 0)); }, 0);
}

function _shopGetProductQty(productId) {
    var item = _shopCart.find(function (it) { return it.productId === productId; });
    return item ? (Number(item.qty) || 0) : 0;
}

function _shopSetProductQty(product, qty) {
    if (!product || !product.id) return;
    var isAvailable = (product.isAvailable !== undefined)
        ? !!product.isAvailable
        : ((Number(product.stock) || 0) > 0);
    var safeQty = isAvailable ? Math.max(0, Number(qty) || 0) : 0;
    var idx = _shopCart.findIndex(function (it) { return it.productId === product.id; });

    if (idx >= 0) {
        if (safeQty === 0) {
            _shopCart.splice(idx, 1);
        } else {
            _shopCart[idx].qty = safeQty;
            _shopCart[idx].photo = _shopCart[idx].photo || product.photo || '';
            _shopCart[idx].isAvailable = true;
        }
    } else if (safeQty > 0) {
        _shopCart.push({
            productId: product.id,
            name: product.name || 'Produk',
            photo: product.photo || '',
            price: Number(product.price) || 0,
            qty: safeQty,
            isAvailable: true
        });
    }

    updateShopCartUI();
}

function updateShopCartUI() {
    var btn = document.getElementById('sdpBtnOrder');
    var qty = _shopCartTotalQty();
    if (!btn) return;
    if (qty > 0) {
        btn.textContent = '🛒 Keranjang (' + qty + ')';
    } else {
        btn.textContent = '🛒 Keranjang';
    }
}

function addProductToShopCart(product, qty) {
    var q = Number(qty) || 1;
    if (!product || q < 1) return;
    var isAvailable = (product.isAvailable !== undefined)
        ? !!product.isAvailable
        : ((Number(product.stock) || 0) > 0);
    if (!isAvailable) {
        showToast('Produk sedang habis', 'error');
        return;
    }
    var existing = _shopCart.find(function (it) { return it.productId === product.id; });
    if (existing) {
        existing.qty = existing.qty + q;
    } else {
        _shopCart.push({
            productId: product.id,
            name: product.name || 'Produk',
            photo: product.photo || '',
            price: Number(product.price) || 0,
            qty: q,
            isAvailable: true
        });
    }
    updateShopCartUI();
}

function openShopProductModal(product) {
    var modal = document.getElementById('shopProductModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'shopProductModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;z-index:12000;';
        modal.innerHTML = '<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,420px);background:#fff;border-radius:16px;padding:16px;">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
            + '<h3 id="shopProductModalTitle" style="margin:0;font-size:18px;"></h3>'
            + '<button id="shopProductModalClose" style="border:none;background:transparent;font-size:24px;line-height:1;">&times;</button>'
            + '</div>'
            + '<p id="shopProductModalDesc" style="margin:0 0 12px;color:#555;"></p>'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
            + '<strong id="shopProductModalPrice"></strong><span id="shopProductModalStock" style="color:#666;"></span>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">'
            + '<button id="shopQtyMinus" style="width:34px;height:34px;border:1px solid #ddd;border-radius:8px;background:#fff;">-</button>'
            + '<input id="shopQtyInput" type="number" min="1" value="1" style="width:70px;text-align:center;border:1px solid #ddd;border-radius:8px;height:34px;">'
            + '<button id="shopQtyPlus" style="width:34px;height:34px;border:1px solid #ddd;border-radius:8px;background:#fff;">+</button>'
            + '<button id="shopAddCartBtn" style="margin-left:auto;border:none;background:#FF6B00;color:#fff;padding:10px 14px;border-radius:10px;">+ Keranjang</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(modal);
        document.getElementById('shopProductModalClose').addEventListener('click', function () { modal.style.display = 'none'; });
        modal.addEventListener('click', function (e) { if (e.target === modal) modal.style.display = 'none'; });
    }

    document.getElementById('shopProductModalTitle').textContent = product.name || 'Produk';
    document.getElementById('shopProductModalDesc').textContent = product.description || 'Tanpa deskripsi';
    document.getElementById('shopProductModalPrice').textContent = formatRupiah(Number(product.price) || 0);
    var isAvailable = (product.isAvailable !== undefined)
        ? !!product.isAvailable
        : ((Number(product.stock) || 0) > 0);
    document.getElementById('shopProductModalStock').textContent = isAvailable ? '✅ Tersedia' : '⛔ Habis';
    var qtyInput = document.getElementById('shopQtyInput');
    qtyInput.value = '1';
    qtyInput.max = '9999';

    document.getElementById('shopQtyMinus').onclick = function () {
        var v = Math.max(1, (Number(qtyInput.value) || 1) - 1);
        qtyInput.value = String(v);
    };
    document.getElementById('shopQtyPlus').onclick = function () {
        var v = (Number(qtyInput.value) || 1) + 1;
        qtyInput.value = String(v);
    };
    document.getElementById('shopAddCartBtn').onclick = function () {
        if (!isAvailable) {
            showToast('Produk sedang habis', 'error');
            return;
        }
        var qty = Number(qtyInput.value) || 1;
        if (qty < 1) qty = 1;
        addProductToShopCart(product, qty);
        showToast(qty + 'x ' + (product.name || 'produk') + ' ditambahkan ke keranjang', 'success');
        modal.style.display = 'none';
    };

    modal.style.display = 'block';
}

function _buildShopCheckoutData(store, session) {
    var subtotal = _shopCartSubtotal();
    var distKm = 0;
    var storeLat = Number(store && store.lat);
    var storeLng = Number(store && store.lng);
    var userLat = Number(session && session.lat);
    var userLng = Number(session && session.lng);
    if (isFinite(storeLat) && isFinite(storeLng) && isFinite(userLat) && isFinite(userLng) && !(storeLat === 0 && storeLng === 0) && !(userLat === 0 && userLng === 0)) {
        distKm = haversineDistance(storeLat, storeLng, userLat, userLng);
    }
    var perKm = Number(_japPricePerKm) || 3000;
    var feeAmount = 1000;
    if (_shopSettingsCache) {
        feeAmount = Number(_shopSettingsCache.service_fee_amount);
        perKm = Number(_shopSettingsCache.delivery_fee_per_km) || 3000;
    }
    if (!isFinite(feeAmount) || feeAmount < 0) feeAmount = 1000;
    var minimumShortDistanceDelivery = 10000;
    if (_shopSettingsCache) {
        var configuredMinShop = Number(_shopSettingsCache.minimum_shop_fee);
        if (isFinite(configuredMinShop) && configuredMinShop >= 0) {
            minimumShortDistanceDelivery = Math.max(10000, Math.round(configuredMinShop));
        }
    }
    var shortDistanceKmLimit = 5;
    var deliveryFee = distKm > shortDistanceKmLimit
        ? Math.round(distKm * perKm)
        : minimumShortDistanceDelivery;
    var fee = Math.max(0, Math.round(feeAmount));
    var total = subtotal + deliveryFee + fee;
    return {
        subtotal: subtotal,
        distanceKm: distKm,
        deliveryFee: deliveryFee,
        feeAmount: fee,
        fee: fee,
        total: total
    };
}

var _shopSettingsCache = null;
function _ensureShopSettingsLoaded() {
    if (_shopSettingsCache) return Promise.resolve(_shopSettingsCache);
    return FB.get('getSettings').then(function (r) { return r.json(); }).then(function (res) {
        _shopSettingsCache = (res && res.success && res.data) ? res.data : {};
        return _shopSettingsCache;
    }).catch(function () {
        _shopSettingsCache = {};
        return _shopSettingsCache;
    });
}

function openShopCheckoutModal() {
    if (!_slpCurrentStore) { showToast('Data toko tidak ditemukan', 'error'); return; }
    if (_shopCart.length === 0) { showToast('Keranjang masih kosong', 'error'); return; }
    var session = getSession();
    if (!session || session.role !== 'user') { showToast('Hanya user yang bisa memesan', 'error'); return; }

    _ensureShopSettingsLoaded().then(function () {
        var data = _buildShopCheckoutData(_slpCurrentStore, session);
        var modal = document.getElementById('shopCheckoutModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'shopCheckoutModal';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;z-index:12001;';
            modal.innerHTML = '<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,460px);max-height:88vh;overflow:auto;background:#fff;border-radius:16px;padding:16px;">'
                + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><h3 style="margin:0;">🛒 Keranjang</h3><button id="shopCheckoutClose" style="border:none;background:transparent;font-size:24px;line-height:1;">&times;</button></div>'
                + '<div id="shopCheckoutItems"></div>'
                + '<div style="margin-top:12px;border-top:1px solid #eee;padding-top:10px;">'
                + '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Subtotal Produk</span><strong id="shopCoSubtotal"></strong></div>'
                + '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Ongkir <small id="shopCoDist"></small></span><strong id="shopCoDelivery"></strong></div>'
                + '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>Biaya Platform</span><strong id="shopCoFee"></strong></div>'
                + '<div style="display:flex;justify-content:space-between;font-size:17px;"><strong>Total</strong><strong id="shopCoTotal"></strong></div>'
                + '</div>'
                + '<div style="margin-top:12px;">'
                + '<div style="font-size:13px;color:#666;margin-bottom:6px;">Metode Pembayaran</div>'
                + '<div style="display:flex;gap:8px;">'
                + '<button id="shopPmJspay" type="button" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:10px;background:#fff;">💳 JsPay</button>'
                + '<button id="shopPmCod" type="button" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:10px;background:#fff;">💵 COD</button>'
                + '</div>'
                + '<div id="shopPmInfo" style="font-size:12px;color:#666;margin-top:6px;"></div>'
                + '</div>'
                + '<button id="shopCheckoutOrderBtn" style="margin-top:12px;width:100%;border:none;background:#FF6B00;color:#fff;padding:12px;border-radius:10px;font-weight:700;">Pesan Sekarang</button>'
                + '</div>';
            document.body.appendChild(modal);
            document.getElementById('shopCheckoutClose').addEventListener('click', function () { modal.style.display = 'none'; });
            modal.addEventListener('click', function (e) { if (e.target === modal) modal.style.display = 'none'; });
        }

        var itemHtml = _shopCart.map(function (it, idx) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f2f2f2;">'
                + '<div><div style="font-weight:600;">' + escapeHtml(it.name) + '</div><div style="font-size:12px;color:#666;">' + formatRupiah(it.price) + ' x ' + it.qty + '</div></div>'
                + '<div style="display:flex;align-items:center;gap:6px;">'
                + '<button data-act="minus" data-idx="' + idx + '" style="width:28px;height:28px;border:1px solid #ddd;background:#fff;border-radius:8px;">-</button>'
                + '<strong>' + it.qty + '</strong>'
                + '<button data-act="plus" data-idx="' + idx + '" style="width:28px;height:28px;border:1px solid #ddd;background:#fff;border-radius:8px;">+</button>'
                + '</div>'
                + '</div>';
        }).join('');
        document.getElementById('shopCheckoutItems').innerHTML = itemHtml;
        document.getElementById('shopCoSubtotal').textContent = formatRupiah(data.subtotal);
        document.getElementById('shopCoDist').textContent = data.distanceKm > 0 ? '(' + data.distanceKm.toFixed(1) + ' km)' : '(estimasi)';
        document.getElementById('shopCoDelivery').textContent = formatRupiah(data.deliveryFee);
        document.getElementById('shopCoFee').textContent = formatRupiah(data.fee);
        document.getElementById('shopCoTotal').textContent = formatRupiah(data.total);

        function applyPaymentUI() {
            var btnJ = document.getElementById('shopPmJspay');
            var btnC = document.getElementById('shopPmCod');
            var info = document.getElementById('shopPmInfo');
            btnJ.style.borderColor = _shopSelectedPayment === 'jspay' ? '#FF6B00' : '#ddd';
            btnC.style.borderColor = _shopSelectedPayment === 'cod' ? '#FF6B00' : '#ddd';
            info.textContent = _shopSelectedPayment === 'jspay'
                ? 'Saldo JsPay: ' + formatRupiah(getWalletBalance())
                : 'Bayar tunai saat pesanan sampai.';
        }

        document.getElementById('shopPmJspay').onclick = function () { _shopSelectedPayment = 'jspay'; applyPaymentUI(); };
        document.getElementById('shopPmCod').onclick = function () { _shopSelectedPayment = 'cod'; applyPaymentUI(); };
        applyPaymentUI();

        document.getElementById('shopCheckoutItems').querySelectorAll('button[data-act]').forEach(function (btn) {
            btn.onclick = function () {
                var idx = Number(this.getAttribute('data-idx'));
                var act = this.getAttribute('data-act');
                var item = _shopCart[idx];
                if (!item) return;
                if (act === 'minus') item.qty = Math.max(0, item.qty - 1);
                if (act === 'plus') item.qty = Math.min(item.stock || 9999, item.qty + 1);
                _shopCart = _shopCart.filter(function (it) { return it.qty > 0; });
                modal.style.display = 'none';
                updateShopCartUI();
                if (_shopCart.length > 0) openShopCheckoutModal();
            };
        });

        document.getElementById('shopCheckoutOrderBtn').onclick = function () {
            createProductOrder(_shopCart.slice(), _slpCurrentStore, _shopSelectedPayment, data, modal);
        };

        modal.style.display = 'block';
    });
}

function createProductOrder(cartItems, store, paymentMethod, pricing, checkoutModal) {
    var session = getSession();
    if (!session) { showToast('Silakan login terlebih dahulu', 'error'); return; }
    if (session.role !== 'user') { showToast('Hanya user yang bisa memesan', 'error'); return; }
    if (!store) { showToast('Data toko tidak ditemukan', 'error'); return; }
    if (!cartItems || cartItems.length === 0) { showToast('Keranjang kosong', 'error'); return; }

    var price = Number(pricing && pricing.subtotal) || _shopCartSubtotal();
    var deliveryFee = Number(pricing && pricing.deliveryFee) || 0;
    var fee = Number(pricing && pricing.fee) || 0;
    var totalCost = Number(pricing && pricing.total) || (price + deliveryFee + fee);
    paymentMethod = paymentMethod || 'jspay';

    if (paymentMethod === 'jspay') {
        var balance = (typeof getWalletBalance === 'function') ? getWalletBalance() : 0;
        if (balance < totalCost) {
            showToast('Saldo tidak cukup! Butuh ' + formatRupiah(totalCost) + '. Top up dulu atau pilih COD.', 'error');
            if (typeof openTopUpModal === 'function') openTopUpModal();
            return;
        }
    }

    showToast('Memproses pesanan...', 'success');
    var orderId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
    var totalQty = cartItems.reduce(function (s, it) { return s + (Number(it.qty) || 0); }, 0);
    var itemNames = cartItems.map(function (it) { return (it.name || 'Produk') + ' x' + (Number(it.qty) || 0); }).join(', ');

    var orderData = {
        action: 'createOrder',
        id: orderId,
        userId: session.id,
        talentId: '',
        sellerId: store.userId || '',
        storeId: store.id || '',
        storeName: store.name || '',
        storePhoto: store.photo || '',
        storeAddr: store.address || '',
        skillType: store.category || 'js_food',
        serviceType: 'Belanja ' + totalQty + ' item',
        description: 'Produk: ' + itemNames,
        items: cartItems,
        totalQty: totalQty,
        price: price,
        deliveryFee: deliveryFee,
        fee: fee,
        totalCost: totalCost,
        paymentMethod: paymentMethod,
        status: 'pending_seller',
        userLat: session.lat || 0,
        userLng: session.lng || 0,
        userAddr: session.address || '',
        storeLat: store.lat || 0,
        storeLng: store.lng || 0,
        talentLat: store.lat || 0,
        talentLng: store.lng || 0
    };

    backendPost(orderData).then(function (res) {
        if (res && res.success) {
            var order = res.data || orderData;
            order.status = 'pending_seller';
            order.createdAt = Date.now();
            order.storeName = store.name;
            order.storePhoto = store.photo || '';
            order.userName = session.name;

            try {
                addNotifItem({ userId: store.userId, icon: '🛒', title: 'Pesanan Baru!', desc: (store.name || 'Toko') + ' - ' + formatRupiah(totalCost), type: 'order', orderId: orderId });
            } catch (ne) {}

            _shopCart = [];
            updateShopCartUI();
            if (checkoutModal) checkoutModal.style.display = 'none';
            showToast('Pesanan berhasil! Menunggu penjual menerima pesanan...', 'success');
            document.getElementById('storeDetailPage').classList.add('hidden');
            document.getElementById('storeListPage').classList.add('hidden');
            openOrderTracking(order);
        } else {
            var errMsg = (res && res.message) || 'Server error';
            showToast('Gagal membuat pesanan: ' + errMsg, 'error');
        }
    }).catch(function (err) {
        showToast('Gagal memproses pesanan: ' + (err && err.message ? err.message : 'Error'), 'error');
    });
}

// ══════════════════════════════════════════
// ═══ JS ANTAR (OJEK) ═══
// ══════════════════════════════════════════
var _japRouteRequestToken = 0;
var _japSuggestSourceId = 'japDestInput';

function resetJSAntarState() {
    _japRouteRequestToken += 1;
    _japDestCoords = null;
    _japDestAddress = '';
    _japRouteDistKm = 0;
    _japPickOnMapMode = false;

    if (_japSuggestTimer) {
        clearTimeout(_japSuggestTimer);
        _japSuggestTimer = null;
    }

    var destInput = document.getElementById('japDestInput');
    if (destInput) destInput.value = '';

    var topSearchInput = document.getElementById('japTopSearchInput');
    if (topSearchInput) topSearchInput.value = '';

    var bottomSuggestions = document.getElementById('japDestSuggestions');
    if (bottomSuggestions) {
        bottomSuggestions.classList.add('hidden');
        bottomSuggestions.innerHTML = '';
    }

    var topSuggestions = document.getElementById('japTopSuggestions');
    if (topSuggestions) {
        topSuggestions.classList.add('hidden');
        topSuggestions.innerHTML = '';
    }

    var infoRow = document.getElementById('japInfoRow');
    if (infoRow) infoRow.classList.add('hidden');

    var noteWrap = document.getElementById('japNoteWrap');
    if (noteWrap) noteWrap.classList.add('hidden');

    var priceBreakdown = document.getElementById('japPriceBreakdown');
    if (priceBreakdown) priceBreakdown.classList.add('hidden');

    var payMethod = document.getElementById('japPayMethod');
    if (payMethod) payMethod.classList.add('hidden');

    var mapPickHint = document.getElementById('japMapPickHint');
    if (mapPickHint) mapPickHint.classList.add('hidden');

    var noteInput = document.getElementById('japNote');
    if (noteInput) noteInput.value = '';

    var btnOrder = document.getElementById('japBtnOrder');
    if (btnOrder) {
        btnOrder.disabled = true;
        btnOrder.textContent = '🏍️ Temukan Driver';
        delete btnOrder.dataset.price;
        delete btnOrder.dataset.fee;
        delete btnOrder.dataset.total;
    }

    _japSelectedPayment = 'jspay';
    var pmJspay = document.getElementById('japPmJspay');
    var pmCod = document.getElementById('japPmCod');
    if (pmJspay && pmCod) {
        pmJspay.classList.add('active');
        pmCod.classList.remove('active');
    }

    var topPickup = document.getElementById('japTopPickupText');
    if (topPickup) topPickup.textContent = 'Mendeteksi lokasi...';

    var topDest = document.getElementById('japTopDestText');
    if (topDest) topDest.textContent = 'Tambah tujuan';

    if (_japMap) {
        if (_japDestMarker) {
            _japMap.removeLayer(_japDestMarker);
            _japDestMarker = null;
        }
        if (_japRouteLine) {
            _japMap.removeLayer(_japRouteLine);
            _japRouteLine = null;
        }
        if (_japRouteFlowLine) {
            _japMap.removeLayer(_japRouteFlowLine);
            _japRouteFlowLine = null;
        }
    } else {
        _japDestMarker = null;
        _japRouteLine = null;
        _japRouteFlowLine = null;
    }

    updateJapTopCardState();
}

function openJSAntarPage() {
    var page = document.getElementById('jsAntarPage');
    if (!page) return;
    page.classList.remove('hidden');
    page.classList.add('jap-first-open');
    resetJSAntarState();
    document.getElementById('japPickupText').textContent = '📍 Mendeteksi lokasi...';

    if (!_japEventsSetup) {
        _japEventsSetup = true;
        var destInput = document.getElementById('japDestInput');
        var topSearchInputBind = document.getElementById('japTopSearchInput');
        document.getElementById('japBtnBack').addEventListener('click', closeJSAntarPage);
        if (destInput) {
            destInput.addEventListener('input', onJapDestInput);
            destInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); hideJapSuggestions(); }
            });
        }
        if (topSearchInputBind) {
            topSearchInputBind.addEventListener('input', onJapDestInput);
            topSearchInputBind.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); hideJapSuggestions(); }
            });
            topSearchInputBind.addEventListener('focus', function () {
                if (this.value.trim().length >= 3) searchPlaces(this.value.trim(), 'japTopSearchInput');
            });
        }
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
        var topAddBtn = document.getElementById('japTopAddBtn');
        if (topAddBtn) {
            topAddBtn.addEventListener('click', function () {
                enterJapAddDestinationMode();
            });
        }
        var topRecentBtn = document.getElementById('japTopRecentBtn');
        if (topRecentBtn) {
            topRecentBtn.addEventListener('click', function () {
                focusJapDestinationInput();
            });
        }
        var topHomeBtn = document.getElementById('japTopHomeBtn');
        if (topHomeBtn) {
            topHomeBtn.addEventListener('click', function () {
                var pickupText = document.getElementById('japPickupText');
                var pageEl = document.getElementById('jsAntarPage');
                var useTopInput = pageEl && pageEl.classList.contains('jap-first-open');
                var input = useTopInput ? document.getElementById('japTopSearchInput') : document.getElementById('japDestInput');
                var q = pickupText ? pickupText.textContent : '';
                if (input && q) {
                    input.value = q.split(',').slice(0, 2).join(',').trim();
                    input.dispatchEvent(new Event('input'));
                    input.focus();
                }
            });
        }
        document.addEventListener('click', function (e) {
            var bottomSugg = document.getElementById('japDestSuggestions');
            var topSugg = document.getElementById('japTopSuggestions');
            var bottomInput = document.getElementById('japDestInput');
            var topInput = document.getElementById('japTopSearchInput');
            var insideBottom = bottomSugg && bottomSugg.contains(e.target);
            var insideTop = topSugg && topSugg.contains(e.target);
            var isInput = e.target === bottomInput || e.target === topInput;
            if (!insideBottom && !insideTop && !isInput) {
                hideJapSuggestions();
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
                    var feeAmt = Number(res.data.service_fee_amount);
                    if (!isFinite(feeAmt) || feeAmt < 0) feeAmt = 1000;
                    _japServiceFeeAmount = Math.max(0, Math.round(feeAmt));
                }
            })
            .catch(function () {});
    }

    setTimeout(function () { initJapMap(); }, 100);
    initJapSheetDrag();
}

// ── Draggable Bottom Sheet for JS Antar ──
var _japSheetDragSetup = false;
function initJapSheetDrag() {
    if (_japSheetDragSetup) return;
    var handle = document.getElementById('japSheetHandle');
    var mapEl = document.getElementById('japMap');
    if (!handle || !mapEl) return;
    _japSheetDragSetup = true;

    var startY = 0, startH = 0, dragging = false;

    function getMinH() { return 0; }
    function getMaxH() {
        var page = document.getElementById('jsAntarPage');
        var header = page ? page.querySelector('.jap-header') : null;
        var headerH = header ? header.offsetHeight : 76;
        return window.innerHeight - headerH - 100;
    }
    function getDefaultH() { return Math.round(window.innerHeight * 0.32); }

    function snapMap(h) {
        mapEl.style.transition = 'height .35s cubic-bezier(.4,0,.2,1)';
        mapEl.style.height = Math.max(0, h) + 'px';
        setTimeout(function () { if (_japMap) _japMap.invalidateSize(); }, 380);
    }

    handle.addEventListener('touchstart', function (e) {
        dragging = true;
        startY = e.touches[0].clientY;
        startH = mapEl.offsetHeight;
        mapEl.style.transition = 'none';
    }, { passive: true });

    handle.addEventListener('touchmove', function (e) {
        if (!dragging) return;
        e.preventDefault();
        var dy = e.touches[0].clientY - startY;
        var newH = Math.max(getMinH(), Math.min(getMaxH(), startH + dy));
        mapEl.style.height = newH + 'px';
        if (_japMap) _japMap.invalidateSize();
    }, { passive: false });

    handle.addEventListener('touchend', function () {
        if (!dragging) return;
        dragging = false;
        var h = mapEl.offsetHeight;
        var pageH = window.innerHeight;
        // Snap thresholds
        if (h < pageH * 0.12) {
            snapMap(0); // Fullscreen sheet
        } else if (h > pageH * 0.45) {
            snapMap(Math.round(pageH * 0.55)); // Expanded map
        } else {
            snapMap(getDefaultH()); // Default
        }
    });

    // Reset to default height
    mapEl.style.height = getDefaultH() + 'px';
}

function closeJSAntarPage() {
    var page = document.getElementById('jsAntarPage');
    resetJSAntarState();
    if (page) page.classList.add('hidden');
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
        bindJapMapPremiumEffects();
        updateJapMapDepthClass();
        return;
    }

    _japMap = L.map('japMap', { zoomControl: false }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 20,
        subdomains: 'abcd'
    }).addTo(_japMap);
    L.control.zoom({ position: 'bottomright' }).addTo(_japMap);
    bindJapMapPremiumEffects();

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
    var pinClass = type === 'pickup' ? 'pickup' : 'dropoff';
    var pinText = type === 'pickup' ? '↑' : '';
    var icon = L.divIcon({
        html: '<div class="gm-route-pin ' + pinClass + '"><span>' + pinText + '</span></div>',
        className: 'gm-route-pin-wrapper',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
    });
    return L.marker([lat, lng], { icon: icon });
}

function animateJapMapTopCard() {
    var card = document.getElementById('japMapTopCard');
    if (!card) return;
    card.classList.remove('map-card-refresh');
    void card.offsetWidth;
    card.classList.add('map-card-refresh');
}

function updateJapTopCardState() {
    var page = document.getElementById('jsAntarPage');
    var topCard = document.getElementById('japMapTopCard');
    var searchMode = document.getElementById('japTopSearchMode');
    var routeMode = document.getElementById('japTopRouteMode');
    if (!page || !routeMode) return;

    var firstOpen = !_japDestCoords;
    page.classList.toggle('jap-first-open', firstOpen);
    if (topCard) topCard.classList.toggle('hidden', firstOpen);
    if (searchMode) searchMode.classList.add('hidden');
    routeMode.classList.toggle('hidden', firstOpen);
}

function focusJapDestinationInput() {
    var input = document.getElementById('japDestInput');
    if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function enterJapAddDestinationMode() {
    if (!_japMap) return;
    _japRouteRequestToken += 1;
    _japDestCoords = null;
    _japDestAddress = '';
    _japRouteDistKm = 0;

    if (_japDestMarker) {
        _japMap.removeLayer(_japDestMarker);
        _japDestMarker = null;
    }
    if (_japRouteLine) {
        _japMap.removeLayer(_japRouteLine);
        _japRouteLine = null;
    }
    if (_japRouteFlowLine) {
        _japMap.removeLayer(_japRouteFlowLine);
        _japRouteFlowLine = null;
    }

    var destInput = document.getElementById('japDestInput');
    if (destInput) destInput.value = '';

    var topDest = document.getElementById('japTopDestText');
    if (topDest) topDest.textContent = 'Tambah tujuan';

    var infoRow = document.getElementById('japInfoRow');
    if (infoRow) infoRow.classList.add('hidden');
    var priceBreakdown = document.getElementById('japPriceBreakdown');
    if (priceBreakdown) priceBreakdown.classList.add('hidden');
    var payMethod = document.getElementById('japPayMethod');
    if (payMethod) payMethod.classList.add('hidden');
    var noteWrap = document.getElementById('japNoteWrap');
    if (noteWrap) noteWrap.classList.add('hidden');

    var btnOrder = document.getElementById('japBtnOrder');
    if (btnOrder) {
        btnOrder.disabled = true;
        btnOrder.textContent = '🏍️ Temukan Driver';
        delete btnOrder.dataset.price;
        delete btnOrder.dataset.fee;
        delete btnOrder.dataset.total;
    }

    hideJapSuggestions();
    updateJapTopCardState();
    focusJapDestinationInput();
}

function getActiveJapSuggestionsEl() {
    var active = document.activeElement;
    if (active && active.id === 'japTopSearchInput') return document.getElementById('japTopSuggestions') || document.getElementById('japDestSuggestions');
    if (active && active.id === 'japDestInput') return document.getElementById('japDestSuggestions') || document.getElementById('japTopSuggestions');
    if (_japSuggestSourceId === 'japTopSearchInput') return document.getElementById('japTopSuggestions') || document.getElementById('japDestSuggestions');
    return document.getElementById('japDestSuggestions') || document.getElementById('japTopSuggestions');
}

function getJapSuggestionsElBySource(sourceId) {
    if (sourceId === 'japTopSearchInput') {
        return document.getElementById('japTopSuggestions') || document.getElementById('japDestSuggestions');
    }
    return document.getElementById('japDestSuggestions') || document.getElementById('japTopSuggestions');
}

function hideJapSuggestions() {
    var bottom = document.getElementById('japDestSuggestions');
    var top = document.getElementById('japTopSuggestions');
    if (bottom) bottom.classList.add('hidden');
    if (top) top.classList.add('hidden');
}

function syncJapDestinationInputs(value, sourceId) {
    var bottom = document.getElementById('japDestInput');
    var top = document.getElementById('japTopSearchInput');
    if (bottom && sourceId !== 'japDestInput') bottom.value = value;
    if (top && sourceId !== 'japTopSearchInput') top.value = value;
}

function updateJapMapDepthClass() {
    var mapEl = document.getElementById('japMap');
    var wrap = mapEl ? mapEl.parentElement : null;
    if (!wrap || !_japMap) return;
    var zoom = _japMap.getZoom();
    wrap.classList.remove('map-zoom-near', 'map-zoom-far');
    if (zoom >= 16) wrap.classList.add('map-zoom-near');
    else if (zoom <= 13) wrap.classList.add('map-zoom-far');
}

function bindJapMapPremiumEffects() {
    var mapEl = document.getElementById('japMap');
    var wrap = mapEl ? mapEl.parentElement : null;
    if (!wrap || !_japMap || _japMap._premiumFxBound) return;
    _japMap._premiumFxBound = true;

    var collapseTimer = null;
    function collapseOnMove() {
        wrap.classList.add('map-card-collapsed');
        if (collapseTimer) clearTimeout(collapseTimer);
    }
    function expandAfterMove() {
        if (collapseTimer) clearTimeout(collapseTimer);
        collapseTimer = setTimeout(function () {
            wrap.classList.remove('map-card-collapsed');
        }, 220);
    }

    _japMap.on('zoomend', updateJapMapDepthClass);
    _japMap.on('movestart', collapseOnMove);
    _japMap.on('moveend', expandAfterMove);
    updateJapMapDepthClass();
}

function updateJapPickupText(addr, lat, lng) {
    var el = document.getElementById('japPickupText');
    if (!el) return;
    if (addr) {
        el.textContent = addr;
        var topPickup = document.getElementById('japTopPickupText');
        if (topPickup) topPickup.textContent = addr.split(',').slice(0, 2).join(',').trim() || addr;
        animateJapMapTopCard();
    } else {
        reverseGeocode(lat, lng).then(function (a) {
            el.textContent = a;
            var topPickup = document.getElementById('japTopPickupText');
            if (topPickup) topPickup.textContent = a.split(',').slice(0, 2).join(',').trim() || a;
            animateJapMapTopCard();
        });
    }
}

function normalizeJapSearchText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function parseJapCoordinateInput(raw) {
    var text = String(raw || '').trim();
    if (!text) return null;

    function inRange(lat, lng) {
        return isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    }

    function asCoord(latStr, lngStr) {
        var lat = Number(latStr);
        var lng = Number(lngStr);
        if (!inRange(lat, lng)) return null;
        return { lat: lat, lng: lng };
    }

    var direct = text.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
    if (direct) {
        var parsedDirect = asCoord(direct[1], direct[2]);
        if (parsedDirect) return parsedDirect;
    }

    var urlAt = text.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
    if (urlAt) {
        var parsedAt = asCoord(urlAt[1], urlAt[2]);
        if (parsedAt) return parsedAt;
    }

    var url3d4d = text.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);
    if (url3d4d) {
        var parsed3d4d = asCoord(url3d4d[1], url3d4d[2]);
        if (parsed3d4d) return parsed3d4d;
    }

    try {
        var decoded = decodeURIComponent(text);
        var qMatch = decoded.match(/[?&](q|query)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/i);
        if (qMatch) {
            var parsedQ = asCoord(qMatch[2], qMatch[3]);
            if (parsedQ) return parsedQ;
        }
    } catch (e) {}

    return null;
}

function scoreJapPlaceResult(query, result) {
    var q = normalizeJapSearchText(query);
    var name = normalizeJapSearchText((result.display_name || '').split(',')[0]);
    var full = normalizeJapSearchText(result.display_name || '');
    if (!q || !full) return 0;

    var score = 0;
    if (name === q) score += 180;
    if (name.indexOf(q) === 0) score += 120;
    if (name.indexOf(q) >= 0) score += 70;
    if (full.indexOf(q) >= 0) score += 40;

    var tokens = q.split(' ').filter(Boolean);
    tokens.forEach(function (tok) {
        if (name.indexOf(tok) >= 0) score += 20;
        else if (full.indexOf(tok) >= 0) score += 8;
    });

    var type = String(result.type || '').toLowerCase();
    if (/(city|town|village|suburb|residential|road|house)/.test(type)) score += 6;

    return score;
}

function onJapDestInput() {
    var val = this.value.trim();
    var sourceId = this.id || 'japDestInput';
    _japSuggestSourceId = sourceId;
    syncJapDestinationInputs(this.value, this.id);
    if (_japSuggestTimer) clearTimeout(_japSuggestTimer);
    var sugg = getJapSuggestionsElBySource(sourceId);
    if (!sugg) return;
    if (val.length < 3) {
        hideJapSuggestions();
        if (sugg) sugg.innerHTML = '';
        return;
    }
    hideJapSuggestions();
    sugg.classList.remove('hidden');
    sugg.innerHTML = '<div class="jap-suggestion-item" style="color:var(--gray-400)">Mencari...</div>';
    _japSuggestTimer = setTimeout(function () {
        searchPlaces(val, sourceId);
    }, 380);
}

function searchPlaces(query, sourceId) {
    _japSuggestSourceId = sourceId || _japSuggestSourceId || 'japDestInput';
    var parsedCoord = parseJapCoordinateInput(query);
    var sourceEl = getJapSuggestionsElBySource(sourceId || _japSuggestSourceId);

    if (parsedCoord && sourceEl) {
        sourceEl.classList.remove('hidden');
        sourceEl.innerHTML = '<div class="jap-suggestion-item" style="color:var(--gray-400)">Membaca titik koordinat...</div>';
        reverseGeocode(parsedCoord.lat, parsedCoord.lng).then(function (addr) {
            var label = 'Koordinat: ' + parsedCoord.lat.toFixed(6) + ', ' + parsedCoord.lng.toFixed(6);
            renderJapSuggestions([
                {
                    lat: parsedCoord.lat,
                    lon: parsedCoord.lng,
                    display_name: (addr || label),
                    _label: label,
                    _isCoordinate: true
                }
            ], sourceId || _japSuggestSourceId);
        }).catch(function () {
            var label = 'Koordinat: ' + parsedCoord.lat.toFixed(6) + ', ' + parsedCoord.lng.toFixed(6);
            renderJapSuggestions([
                {
                    lat: parsedCoord.lat,
                    lon: parsedCoord.lng,
                    display_name: label,
                    _label: label,
                    _isCoordinate: true
                }
            ], sourceId || _japSuggestSourceId);
        });

        // Jika input berupa URL koordinat Google Maps, prioritaskan satu hasil koordinat saja.
        if (/google\.|goo\.gl\/maps|maps\.app\.goo\.gl|\/maps\//i.test(String(query || ''))) {
            return;
        }
    }

    var lat = _japPickupCoords ? _japPickupCoords.lat : -6.2088;
    var lng = _japPickupCoords ? _japPickupCoords.lng : 106.8456;
    var url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query)
        + '&format=json&limit=20&accept-language=id&countrycodes=id&addressdetails=1'
        + '&viewbox=' + (lng - 0.6) + ',' + (lat + 0.6) + ',' + (lng + 0.6) + ',' + (lat - 0.6)
        + '&bounded=0';
    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (results) {
            var list = Array.isArray(results) ? results.slice() : [];

            // Deduplikasi agar lebih banyak hasil unik dan relevan.
            var seen = {};
            var deduped = [];
            list.forEach(function (r) {
                var key = String(r.display_name || '') + '|' + String(r.lat || '') + '|' + String(r.lon || '');
                if (seen[key]) return;
                seen[key] = true;
                deduped.push(r);
            });

            deduped.forEach(function (r) {
                r._textScore = scoreJapPlaceResult(query, r);
            });

            deduped.sort(function (a, b) {
                return Number(b._textScore || 0) - Number(a._textScore || 0);
            });

            var ranked = deduped.slice(0, 10);

            if (parsedCoord) {
                ranked.unshift({
                    lat: parsedCoord.lat,
                    lon: parsedCoord.lng,
                    display_name: 'Koordinat: ' + parsedCoord.lat.toFixed(6) + ', ' + parsedCoord.lng.toFixed(6),
                    _label: 'Koordinat dari input',
                    _isCoordinate: true
                });
            }

            renderJapSuggestions(ranked, sourceId || _japSuggestSourceId);
        })
        .catch(function () {
            var sugg = getJapSuggestionsElBySource(sourceId || _japSuggestSourceId);
            if (sugg) sugg.innerHTML = '<div class="jap-suggestion-item" style="color:var(--red)">Gagal mencari lokasi</div>';
        });
}

function renderJapSuggestions(results, sourceId) {
    var sugg = getJapSuggestionsElBySource(sourceId || _japSuggestSourceId);
    if (!sugg) return;
    if (!results || results.length === 0) {
        sugg.innerHTML = '<div class="jap-suggestion-item" style="color:var(--gray-400)">Tidak ditemukan</div>';
        return;
    }
    sugg.innerHTML = '';
    results.forEach(function (r) {
        var parts = (r.display_name || '').split(',');
        var name = (r._label || parts[0] || '').trim();
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
    var shortDest = displayName.split(',').slice(0, 2).join(',').trim();
    syncJapDestinationInputs(shortDest, '');
    var topDest = document.getElementById('japTopDestText');
    if (topDest) topDest.textContent = shortDest || displayName;
    updateJapTopCardState();
    animateJapMapTopCard();
    hideJapSuggestions();

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
    var reqToken = ++_japRouteRequestToken;
    var url = 'https://router.project-osrm.org/route/v1/driving/' + fromLng + ',' + fromLat + ';' + toLng + ',' + toLat + '?overview=full&geometries=geojson';
    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var page = document.getElementById('jsAntarPage');
            if (reqToken !== _japRouteRequestToken || !page || page.classList.contains('hidden') || !_japMap || !_japDestCoords) return;
            var distKm = 0;
            var durationMin = 0;
            if (data.routes && data.routes.length > 0) {
                distKm = data.routes[0].distance / 1000;
                durationMin = Math.round(data.routes[0].duration / 60);
                var coords = data.routes[0].geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
                if (_japRouteLine) _japMap.removeLayer(_japRouteLine);
                if (_japRouteFlowLine) _japMap.removeLayer(_japRouteFlowLine);
                _japRouteLine = L.polyline(coords, { color: '#4285F4', weight: 5, opacity: 0.85, lineJoin: 'round', lineCap: 'round', className: 'jap-route-base' }).addTo(_japMap);
                _japRouteFlowLine = L.polyline(coords, { color: '#93C5FD', weight: 3, opacity: 0.95, dashArray: '10,14', lineJoin: 'round', lineCap: 'round', className: 'jap-route-flow' }).addTo(_japMap);
            } else {
                distKm = haversineDistance(fromLat, fromLng, toLat, toLng);
                durationMin = Math.round(distKm / 0.4);
                if (_japRouteLine) _japMap.removeLayer(_japRouteLine);
                if (_japRouteFlowLine) _japMap.removeLayer(_japRouteFlowLine);
                var straight = [[fromLat, fromLng], [toLat, toLng]];
                _japRouteLine = L.polyline(straight, { color: '#4285F4', weight: 4, opacity: 0.75, lineJoin: 'round', lineCap: 'round', className: 'jap-route-base' }).addTo(_japMap);
                _japRouteFlowLine = L.polyline(straight, { color: '#93C5FD', weight: 3, dashArray: '10,14', opacity: 0.9, lineJoin: 'round', lineCap: 'round', className: 'jap-route-flow' }).addTo(_japMap);
            }
            _japRouteDistKm = distKm;
            updateJapPriceInfo(distKm, durationMin);
        })
        .catch(function () {
            var page = document.getElementById('jsAntarPage');
            if (reqToken !== _japRouteRequestToken || !page || page.classList.contains('hidden') || !_japDestCoords) return;
            var distKm = haversineDistance(fromLat, fromLng, toLat, toLng);
            var durationMin = Math.round(distKm / 0.4);
            _japRouteDistKm = distKm;
            updateJapPriceInfo(distKm, durationMin);
        });
}

var _japSelectedPayment = 'jspay'; // 'jspay' or 'cod'
var _japServiceFeeAmount = 1000;

function updateJapPriceInfo(distKm, durationMin) {
    var price = Math.max(_japBaseFare, Math.round(_japPricePerKm * distKm));
    price = Math.ceil(price / 500) * 500;
    var serviceFee = Math.max(0, Math.round(_japServiceFeeAmount || 0));
    var fee = serviceFee;
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
        var feeLabel = document.getElementById('japPbFeeLabel');
        if (feeLabel) feeLabel.textContent = 'Biaya platform';
        document.getElementById('japPbFee').textContent = formatRupiah(serviceFee);
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
    var fee = Number(btn.dataset.fee);
    if (!isFinite(fee) || fee < 0) fee = Math.max(0, Math.round(_japServiceFeeAmount || 0));
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

// ══════════════════════════════════════════
// ═══ JS DELIVERY (PAKET) ═══
// ══════════════════════════════════════════
var _jdpMap = null;
var _jdpPickupMarker = null;
var _jdpDestMarker = null;
var _jdpRouteLine = null;
var _jdpPickupCoords = null;
var _jdpDestCoords = null;
var _jdpDestAddress = '';
var _jdpRouteDistKm = 0;
var _jdpRouteDurationMin = 0;
var _jdpRouteRequestToken = 0;
var _jdpSuggestTimer = null;
var _jdpSuggestType = '';
var _jdpPickMode = '';
var _jdpEventsSetup = false;
var _jdpSheetDragSetup = false;
var _jdpSelectedPayment = 'jspay';
var _jdpServiceFeeAmount = 1000;
var _jdpPerKm = 2000;
var _jdpMinimum = 10000;
var _jdpOverweightPerKg = 2000;

function resetJSDeliveryState() {
    _jdpRouteRequestToken += 1;
    _jdpDestCoords = null;
    _jdpDestAddress = '';
    _jdpRouteDistKm = 0;
    _jdpRouteDurationMin = 0;
    _jdpPickMode = '';

    if (_jdpSuggestTimer) {
        clearTimeout(_jdpSuggestTimer);
        _jdpSuggestTimer = null;
    }

    var idsToClear = ['jdpItemDesc', 'jdpWeightInput', 'jdpPickupInput', 'jdpDestInput', 'jdpPickupNote', 'jdpDestNote'];
    idsToClear.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });

    ['jdpPickupSuggestions', 'jdpDestSuggestions'].forEach(function (id) {
        var sugg = document.getElementById(id);
        if (sugg) { sugg.classList.add('hidden'); sugg.innerHTML = ''; }
    });

    var topDest = document.getElementById('jdpTopDestText');
    if (topDest) topDest.textContent = 'Tambah tujuan';
    var topPickup = document.getElementById('jdpTopPickupText');
    if (topPickup) topPickup.textContent = 'Mendeteksi lokasi...';

    var infoRow = document.getElementById('jdpInfoRow');
    if (infoRow) infoRow.classList.add('hidden');
    var bd = document.getElementById('jdpPriceBreakdown');
    if (bd) bd.classList.add('hidden');
    var pm = document.getElementById('jdpPayMethod');
    if (pm) pm.classList.add('hidden');
    var hint = document.getElementById('jdpMapPickHint');
    if (hint) hint.classList.add('hidden');

    var btn = document.getElementById('jdpBtnOrder');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '📦 Cari Driver';
        delete btn.dataset.price;
        delete btn.dataset.fee;
        delete btn.dataset.total;
        delete btn.dataset.distanceFee;
        delete btn.dataset.weightFee;
    }

    _jdpSelectedPayment = 'jspay';
    var pmJ = document.getElementById('jdpPmJspay');
    var pmC = document.getElementById('jdpPmCod');
    if (pmJ && pmC) {
        pmJ.classList.add('active');
        pmC.classList.remove('active');
    }

    if (_jdpMap) {
        if (_jdpDestMarker) { _jdpMap.removeLayer(_jdpDestMarker); _jdpDestMarker = null; }
        if (_jdpRouteLine) { _jdpMap.removeLayer(_jdpRouteLine); _jdpRouteLine = null; }
    } else {
        _jdpDestMarker = null;
        _jdpRouteLine = null;
    }
}

function openJSDeliveryPage() {
    var page = document.getElementById('jsDeliveryPage');
    if (!page) return;
    page.classList.remove('hidden');
    resetJSDeliveryState();
    var pText = document.getElementById('jdpPickupText');
    if (pText) pText.textContent = '📍 Mendeteksi lokasi...';

    if (!_jdpEventsSetup) {
        _jdpEventsSetup = true;
        document.getElementById('jdpBtnBack').addEventListener('click', closeJSDeliveryPage);
        document.getElementById('jdpBtnOrder').addEventListener('click', onJdpOrderClick);

        var destInput = document.getElementById('jdpDestInput');
        if (destInput) {
            destInput.addEventListener('input', onJdpDestInput);
            destInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); hideJdpSuggestions(); }
            });
        }

        var pickupInput = document.getElementById('jdpPickupInput');
        if (pickupInput) {
            pickupInput.addEventListener('input', onJdpPickupInput);
            pickupInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); hideJdpSuggestions(); }
            });
        }

        ['jdpItemDesc', 'jdpWeightInput'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', function () {
                    if (_jdpRouteDistKm > 0) updateJdpPriceInfo(_jdpRouteDistKm, _jdpRouteDurationMin);
                    else evaluateJdpReadyToOrder();
                });
            }
        });

        var topAdd = document.getElementById('jdpTopAddBtn');
        if (topAdd) topAdd.addEventListener('click', enterJdpAddDestinationMode);

        var pickPickup = document.getElementById('jdpBtnPickPickupOnMap');
        if (pickPickup) {
            pickPickup.addEventListener('click', function () {
                _jdpPickMode = 'pickup';
                var hint = document.getElementById('jdpMapPickHint');
                if (hint) {
                    hint.innerHTML = '👆 Ketuk peta untuk titik jemput &nbsp;<button type="button" id="jdpBtnCancelMapPick" class="jap-cancel-pick">Batal</button>';
                    hint.classList.remove('hidden');
                    bindJdpCancelMapPick();
                }
            });
        }

        var pickDest = document.getElementById('jdpBtnPickDestOnMap');
        if (pickDest) {
            pickDest.addEventListener('click', function () {
                _jdpPickMode = 'dest';
                var hint = document.getElementById('jdpMapPickHint');
                if (hint) {
                    hint.innerHTML = '👆 Ketuk peta untuk titik antar &nbsp;<button type="button" id="jdpBtnCancelMapPick" class="jap-cancel-pick">Batal</button>';
                    hint.classList.remove('hidden');
                    bindJdpCancelMapPick();
                }
            });
        }

        bindJdpCancelMapPick();

        document.addEventListener('click', function (e) {
            var destSugg = document.getElementById('jdpDestSuggestions');
            var destInput = document.getElementById('jdpDestInput');
            var pickupSugg = document.getElementById('jdpPickupSuggestions');
            var pickupInput = document.getElementById('jdpPickupInput');
            var outsideDest = !destSugg || (destInput && e.target !== destInput && !destSugg.contains(e.target));
            var outsidePickup = !pickupSugg || (pickupInput && e.target !== pickupInput && !pickupSugg.contains(e.target));
            if (outsideDest && outsidePickup) {
                hideJdpSuggestions();
            }
        });
    }

    if (isBackendConnected()) {
        FB.get('getSettings')
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.success && res.data) {
                    var feeAmt = Number(res.data.service_fee_amount);
                    if (!isFinite(feeAmt) || feeAmt < 0) feeAmt = 1000;
                    _jdpServiceFeeAmount = Math.max(0, Math.round(feeAmt));
                }
            })
            .catch(function () {});
    }

    setTimeout(function () { initJdpMap(); }, 100);
    initJdpSheetDrag();
}

function closeJSDeliveryPage() {
    var page = document.getElementById('jsDeliveryPage');
    resetJSDeliveryState();
    if (page) page.classList.add('hidden');
}

function bindJdpCancelMapPick() {
    var btn = document.getElementById('jdpBtnCancelMapPick');
    if (!btn || btn._jdpBound) return;
    btn._jdpBound = true;
    btn.addEventListener('click', function () {
        _jdpPickMode = '';
        var hint = document.getElementById('jdpMapPickHint');
        if (hint) hint.classList.add('hidden');
    });
}

function initJdpSheetDrag() {
    if (_jdpSheetDragSetup) return;
    var handle = document.getElementById('jdpSheetHandle');
    var mapEl = document.getElementById('jdpMap');
    if (!handle || !mapEl) return;
    _jdpSheetDragSetup = true;

    var startY = 0;
    var startH = 0;
    var dragging = false;

    function snapMap(h) {
        mapEl.style.transition = 'height .35s cubic-bezier(.4,0,.2,1)';
        mapEl.style.height = Math.max(0, h) + 'px';
        setTimeout(function () { if (_jdpMap) _jdpMap.invalidateSize(); }, 380);
    }

    handle.addEventListener('touchstart', function (e) {
        dragging = true;
        startY = e.touches[0].clientY;
        startH = mapEl.offsetHeight;
        mapEl.style.transition = 'none';
    }, { passive: true });

    handle.addEventListener('touchmove', function (e) {
        if (!dragging) return;
        e.preventDefault();
        var dy = e.touches[0].clientY - startY;
        var newH = Math.max(0, Math.min(window.innerHeight - 120, startH + dy));
        mapEl.style.height = newH + 'px';
        if (_jdpMap) _jdpMap.invalidateSize();
    }, { passive: false });

    handle.addEventListener('touchend', function () {
        if (!dragging) return;
        dragging = false;
        var h = mapEl.offsetHeight;
        var pageH = window.innerHeight;
        if (h < pageH * 0.12) snapMap(0);
        else if (h > pageH * 0.45) snapMap(Math.round(pageH * 0.55));
        else snapMap(Math.round(window.innerHeight * 0.32));
    });

    mapEl.style.height = Math.round(window.innerHeight * 0.32) + 'px';
}

function initJdpMap() {
    var session = getSession();
    var lat = (session && session.lat) ? Number(session.lat) : -6.2088;
    var lng = (session && session.lng) ? Number(session.lng) : 106.8456;

    if (_jdpMap) {
        _jdpMap.invalidateSize();
        _jdpMap.setView([lat, lng], 15);
        if (_jdpPickupMarker) _jdpPickupMarker.setLatLng([lat, lng]);
        else _jdpPickupMarker = createJdpMarker(lat, lng, 'pickup').addTo(_jdpMap);
        _jdpPickupCoords = { lat: lat, lng: lng };
        updateJdpPickupText(session && session.address ? session.address : null, lat, lng);
        return;
    }

    _jdpMap = L.map('jdpMap', { zoomControl: false }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 20,
        subdomains: 'abcd'
    }).addTo(_jdpMap);
    L.control.zoom({ position: 'bottomright' }).addTo(_jdpMap);

    _jdpPickupMarker = createJdpMarker(lat, lng, 'pickup').addTo(_jdpMap);
    _jdpPickupCoords = { lat: lat, lng: lng };

    if (session && session.address) {
        updateJdpPickupText(session.address, lat, lng);
    } else {
        reverseGeocode(lat, lng).then(function (addr) {
            updateJdpPickupText(addr, lat, lng);
        });
    }

    _jdpMap.on('click', function (e) {
        if (_jdpPickMode === 'pickup') {
            _jdpPickMode = '';
            _jdpPickupCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
            _jdpPickupMarker.setLatLng(e.latlng);
            var hint = document.getElementById('jdpMapPickHint');
            if (hint) hint.classList.add('hidden');
            reverseGeocode(e.latlng.lat, e.latlng.lng).then(function (addr) {
                updateJdpPickupText(addr, e.latlng.lat, e.latlng.lng);
                if (_jdpDestCoords) fetchJdpRoute(_jdpPickupCoords.lat, _jdpPickupCoords.lng, _jdpDestCoords.lat, _jdpDestCoords.lng);
            });
            return;
        }
        if (_jdpPickMode === 'dest') {
            _jdpPickMode = '';
            var h = document.getElementById('jdpMapPickHint');
            if (h) h.classList.add('hidden');
            reverseGeocode(e.latlng.lat, e.latlng.lng).then(function (addr) {
                selectJdpDestination(e.latlng.lat, e.latlng.lng, addr);
            });
        }
    });
}

function createJdpMarker(lat, lng, type) {
    var pinClass = type === 'pickup' ? 'pickup' : 'dropoff';
    var pinText = type === 'pickup' ? '↑' : '';
    var icon = L.divIcon({
        html: '<div class="gm-route-pin ' + pinClass + '"><span>' + pinText + '</span></div>',
        className: 'gm-route-pin-wrapper',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
    return L.marker([lat, lng], { icon: icon });
}

function updateJdpPickupText(addr, lat, lng) {
    var el = document.getElementById('jdpPickupText');
    if (!el) return;
    if (addr) {
        el.textContent = addr;
        var pickupInput = document.getElementById('jdpPickupInput');
        if (pickupInput) pickupInput.value = addr.split(',').slice(0, 2).join(',').trim() || addr;
        var top = document.getElementById('jdpTopPickupText');
        if (top) top.textContent = addr.split(',').slice(0, 2).join(',').trim() || addr;
    } else {
        reverseGeocode(lat, lng).then(function (a) {
            el.textContent = a;
            var pickupInput = document.getElementById('jdpPickupInput');
            if (pickupInput) pickupInput.value = a.split(',').slice(0, 2).join(',').trim() || a;
            var top = document.getElementById('jdpTopPickupText');
            if (top) top.textContent = a.split(',').slice(0, 2).join(',').trim() || a;
        });
    }
}

function focusJdpDestinationInput() {
    var input = document.getElementById('jdpDestInput');
    if (!input) return;
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function enterJdpAddDestinationMode() {
    _jdpRouteRequestToken += 1;
    _jdpDestCoords = null;
    _jdpDestAddress = '';
    _jdpRouteDistKm = 0;

    if (_jdpMap && _jdpDestMarker) {
        _jdpMap.removeLayer(_jdpDestMarker);
        _jdpDestMarker = null;
    }
    if (_jdpMap && _jdpRouteLine) {
        _jdpMap.removeLayer(_jdpRouteLine);
        _jdpRouteLine = null;
    }

    var destInput = document.getElementById('jdpDestInput');
    if (destInput) destInput.value = '';
    var topDest = document.getElementById('jdpTopDestText');
    if (topDest) topDest.textContent = 'Tambah tujuan';

    var infoRow = document.getElementById('jdpInfoRow');
    if (infoRow) infoRow.classList.add('hidden');
    var bd = document.getElementById('jdpPriceBreakdown');
    if (bd) bd.classList.add('hidden');
    var pm = document.getElementById('jdpPayMethod');
    if (pm) pm.classList.add('hidden');

    var btn = document.getElementById('jdpBtnOrder');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '📦 Cari Driver';
    }

    hideJdpSuggestions();
    focusJdpDestinationInput();
}

function hideJdpSuggestions() {
    ['jdpPickupSuggestions', 'jdpDestSuggestions'].forEach(function (id) {
        var sugg = document.getElementById(id);
        if (sugg) sugg.classList.add('hidden');
    });
}

function onJdpPickupInput() {
    var val = (this.value || '').trim();
    if (_jdpSuggestTimer) clearTimeout(_jdpSuggestTimer);
    var sugg = document.getElementById('jdpPickupSuggestions');
    if (!sugg) return;
    if (val.length < 3) {
        sugg.classList.add('hidden');
        sugg.innerHTML = '';
        return;
    }
    _jdpSuggestType = 'pickup';
    sugg.classList.remove('hidden');
    sugg.innerHTML = '<div class="jap-suggestion-item" style="color:var(--gray-400)">Mencari...</div>';
    _jdpSuggestTimer = setTimeout(function () {
        searchJdpPlaces(val, 'pickup');
    }, 450);
}

function onJdpDestInput() {
    var val = (this.value || '').trim();
    if (_jdpSuggestTimer) clearTimeout(_jdpSuggestTimer);
    var sugg = document.getElementById('jdpDestSuggestions');
    if (!sugg) return;
    if (val.length < 3) {
        sugg.classList.add('hidden');
        sugg.innerHTML = '';
        return;
    }
    _jdpSuggestType = 'dest';
    sugg.classList.remove('hidden');
    sugg.innerHTML = '<div class="jap-suggestion-item" style="color:var(--gray-400)">Mencari...</div>';
    _jdpSuggestTimer = setTimeout(function () {
        searchJdpPlaces(val, 'dest');
    }, 450);
}

function searchJdpPlaces(query, type) {
    var lat = _jdpPickupCoords ? _jdpPickupCoords.lat : -6.2088;
    var lng = _jdpPickupCoords ? _jdpPickupCoords.lng : 106.8456;
    var url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query)
        + '&format=json&limit=6&accept-language=id&countrycodes=id'
        + '&viewbox=' + (lng - 0.5) + ',' + (lat + 0.5) + ',' + (lng + 0.5) + ',' + (lat - 0.5)
        + '&bounded=0';
    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (results) {
            if (type && _jdpSuggestType && type !== _jdpSuggestType) return;
            renderJdpSuggestions(results, type || 'dest');
        })
        .catch(function () {
            var sugg = document.getElementById(type === 'pickup' ? 'jdpPickupSuggestions' : 'jdpDestSuggestions');
            if (sugg) sugg.innerHTML = '<div class="jap-suggestion-item" style="color:var(--red)">Gagal mencari lokasi</div>';
        });
}

function renderJdpSuggestions(results, type) {
    var isPickup = type === 'pickup';
    var sugg = document.getElementById(isPickup ? 'jdpPickupSuggestions' : 'jdpDestSuggestions');
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
            if (isPickup) {
                selectJdpPickup(Number(r.lat), Number(r.lon), r.display_name || name);
            } else {
                selectJdpDestination(Number(r.lat), Number(r.lon), r.display_name || name);
            }
        });
        sugg.appendChild(item);
    });
    sugg.classList.remove('hidden');
}

function selectJdpPickup(lat, lng, displayName) {
    _jdpPickupCoords = { lat: lat, lng: lng };
    if (_jdpPickupMarker) _jdpPickupMarker.setLatLng([lat, lng]);
    else if (_jdpMap) _jdpPickupMarker = createJdpMarker(lat, lng, 'pickup').addTo(_jdpMap);

    updateJdpPickupText(displayName, lat, lng);
    hideJdpSuggestions();

    if (_jdpDestCoords && _jdpMap) {
        var bounds = L.latLngBounds([lat, lng], [_jdpDestCoords.lat, _jdpDestCoords.lng]);
        _jdpMap.fitBounds(bounds, { padding: [40, 40] });
        fetchJdpRoute(lat, lng, _jdpDestCoords.lat, _jdpDestCoords.lng);
    } else if (_jdpMap) {
        _jdpMap.setView([lat, lng], Math.max(_jdpMap.getZoom(), 15));
    }
    evaluateJdpReadyToOrder();
}

function selectJdpDestination(lat, lng, displayName) {
    _jdpDestCoords = { lat: lat, lng: lng };
    _jdpDestAddress = displayName;
    var shortDest = displayName.split(',').slice(0, 2).join(',').trim();
    var input = document.getElementById('jdpDestInput');
    if (input) input.value = shortDest;
    var topDest = document.getElementById('jdpTopDestText');
    if (topDest) topDest.textContent = shortDest || displayName;
    hideJdpSuggestions();

    if (_jdpDestMarker) _jdpDestMarker.setLatLng([lat, lng]);
    else _jdpDestMarker = createJdpMarker(lat, lng, 'dest').addTo(_jdpMap);

    if (_jdpPickupCoords && _jdpMap) {
        var bounds = L.latLngBounds([_jdpPickupCoords.lat, _jdpPickupCoords.lng], [lat, lng]);
        _jdpMap.fitBounds(bounds, { padding: [40, 40] });
    }

    fetchJdpRoute(_jdpPickupCoords.lat, _jdpPickupCoords.lng, lat, lng);
}

function fetchJdpRoute(fromLat, fromLng, toLat, toLng) {
    var reqToken = ++_jdpRouteRequestToken;
    var url = 'https://router.project-osrm.org/route/v1/driving/' + fromLng + ',' + fromLat + ';' + toLng + ',' + toLat + '?overview=full&geometries=geojson';
    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var page = document.getElementById('jsDeliveryPage');
            if (reqToken !== _jdpRouteRequestToken || !page || page.classList.contains('hidden') || !_jdpMap || !_jdpDestCoords) return;
            var distKm = 0;
            var durationMin = 0;
            if (data.routes && data.routes.length > 0) {
                distKm = data.routes[0].distance / 1000;
                durationMin = Math.round(data.routes[0].duration / 60);
                var coords = data.routes[0].geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
                if (_jdpRouteLine) _jdpMap.removeLayer(_jdpRouteLine);
                _jdpRouteLine = L.polyline(coords, { color: '#2563EB', weight: 5, opacity: 0.88, lineJoin: 'round', lineCap: 'round' }).addTo(_jdpMap);
            } else {
                distKm = haversineDistance(fromLat, fromLng, toLat, toLng);
                durationMin = Math.round(distKm / 0.42);
                if (_jdpRouteLine) _jdpMap.removeLayer(_jdpRouteLine);
                _jdpRouteLine = L.polyline([[fromLat, fromLng], [toLat, toLng]], { color: '#2563EB', weight: 4, opacity: 0.8, lineJoin: 'round', lineCap: 'round' }).addTo(_jdpMap);
            }
            _jdpRouteDistKm = distKm;
            _jdpRouteDurationMin = durationMin;
            updateJdpPriceInfo(distKm, durationMin);
        })
        .catch(function () {
            var page = document.getElementById('jsDeliveryPage');
            if (reqToken !== _jdpRouteRequestToken || !page || page.classList.contains('hidden') || !_jdpDestCoords) return;
            var distKm = haversineDistance(fromLat, fromLng, toLat, toLng);
            var durationMin = Math.round(distKm / 0.42);
            _jdpRouteDistKm = distKm;
            _jdpRouteDurationMin = durationMin;
            updateJdpPriceInfo(distKm, durationMin);
        });
}

function getJdpWeightKg() {
    var w = Number(document.getElementById('jdpWeightInput').value || 0);
    if (!isFinite(w) || w < 0) return 0;
    return w;
}

function evaluateJdpReadyToOrder() {
    var btn = document.getElementById('jdpBtnOrder');
    if (!btn) return;
    var hasDesc = String(document.getElementById('jdpItemDesc').value || '').trim().length >= 3;
    var weight = getJdpWeightKg();
    var ready = hasDesc && weight > 0 && _jdpPickupCoords && _jdpDestCoords && _jdpRouteDistKm > 0;
    btn.disabled = !ready;
    if (!ready && !btn.dataset.total) btn.textContent = '📦 Cari Driver';
}

function updateJdpPriceInfo(distKm, durationMin) {
    var weight = getJdpWeightKg();
    var distanceFee = Math.max(_jdpMinimum, Math.round((_jdpPerKm || 2000) * distKm));
    var extraWeightKg = Math.max(0, weight - 5);
    var weightFee = Math.ceil(extraWeightKg) * _jdpOverweightPerKg;
    var fee = Math.max(0, Math.round(_jdpServiceFeeAmount || 0));
    var price = distanceFee + weightFee;
    var total = price + fee;

    var distText = distKm < 1 ? Math.round(distKm * 1000) + ' m' : distKm.toFixed(1) + ' km';
    var etaText = durationMin < 1 ? '< 1 menit' : durationMin + ' menit';
    if (durationMin === null || durationMin === undefined) etaText = '-';

    var dEl = document.getElementById('jdpDistance');
    var eEl = document.getElementById('jdpEta');
    if (dEl) dEl.textContent = distText;
    if (eEl) eEl.textContent = etaText;

    var infoRow = document.getElementById('jdpInfoRow');
    if (infoRow) infoRow.classList.remove('hidden');

    var bd = document.getElementById('jdpPriceBreakdown');
    if (bd) {
        bd.classList.remove('hidden');
        document.getElementById('jdpPbDistance').textContent = formatRupiah(distanceFee);
        document.getElementById('jdpPbWeight').textContent = formatRupiah(weightFee);
        document.getElementById('jdpPbFee').textContent = formatRupiah(fee);
        document.getElementById('jdpPbTotal').textContent = formatRupiah(total);
    }

    var pmEl = document.getElementById('jdpPayMethod');
    if (pmEl) {
        pmEl.classList.remove('hidden');
        var balEl = document.getElementById('jdpPmBalance');
        if (balEl) balEl.textContent = formatRupiah(getWalletBalance());
    }
    setupJdpPaymentToggle();

    var hint = document.getElementById('jdpWeightHint');
    if (hint) {
        hint.textContent = extraWeightKg > 0
            ? 'Biaya tambahan berat: ' + formatRupiah(weightFee) + ' (' + extraWeightKg.toFixed(1) + ' kg di atas 5 kg)'
            : 'Lebih dari 5 kg dikenakan Rp 2.000/kg';
    }

    var btn = document.getElementById('jdpBtnOrder');
    if (btn) {
        btn.dataset.price = String(price);
        btn.dataset.distanceFee = String(distanceFee);
        btn.dataset.weightFee = String(weightFee);
        btn.dataset.fee = String(fee);
        btn.dataset.total = String(total);
        btn.textContent = '📦 Cari Driver — ' + formatRupiah(total);
    }

    evaluateJdpReadyToOrder();
}

function setupJdpPaymentToggle() {
    var jspayBtn = document.getElementById('jdpPmJspay');
    var codBtn = document.getElementById('jdpPmCod');
    if (!jspayBtn || !codBtn || jspayBtn._pmSetup) return;
    jspayBtn._pmSetup = true;
    function selectPM(method) {
        _jdpSelectedPayment = method;
        jspayBtn.classList.toggle('active', method === 'jspay');
        codBtn.classList.toggle('active', method === 'cod');
    }
    jspayBtn.addEventListener('click', function () { selectPM('jspay'); });
    codBtn.addEventListener('click', function () { selectPM('cod'); });
}

function onJdpOrderClick() {
    if (!_jdpPickupCoords || !_jdpDestCoords) {
        showToast('Lengkapi titik jemput dan titik antar dulu!', 'error');
        return;
    }
    var session = getSession();
    if (!session) { showToast('Login dulu ya!', 'error'); return; }
    if (!isBackendConnected()) { showToast('Tidak ada koneksi ke server', 'error'); return; }

    var itemDesc = String(document.getElementById('jdpItemDesc').value || '').trim();
    var weightKg = getJdpWeightKg();
    if (itemDesc.length < 3) {
        showToast('Deskripsi barang minimal 3 karakter', 'error');
        return;
    }
    if (weightKg <= 0) {
        showToast('Isi berat estimasi barang dulu', 'error');
        return;
    }

    var btn = document.getElementById('jdpBtnOrder');
    var price = Number(btn.dataset.price) || 0;
    var distanceFee = Number(btn.dataset.distanceFee) || 0;
    var weightFee = Number(btn.dataset.weightFee) || 0;
    var fee = Number(btn.dataset.fee);
    if (!isFinite(fee) || fee < 0) fee = Math.max(0, Math.round(_jdpServiceFeeAmount || 0));
    var totalCost = Number(btn.dataset.total) || (price + fee);
    var paymentMethod = _jdpSelectedPayment || 'jspay';

    if (paymentMethod === 'jspay' && getWalletBalance() < totalCost) {
        showToast('Saldo JsPay tidak cukup! Butuh ' + formatRupiah(totalCost), 'error');
        return;
    }

    var pickupAddr = document.getElementById('jdpPickupInput').value || document.getElementById('jdpPickupText').textContent || '';
    var destAddr = document.getElementById('jdpDestInput').value || _jdpDestAddress;
    var pickupNote = String(document.getElementById('jdpPickupNote').value || '').trim();
    var destNote = String(document.getElementById('jdpDestNote').value || '').trim();

    btn.disabled = true;
    btn.textContent = '⏳ Mencari driver...';

    var desc = 'Barang: ' + itemDesc
        + '\nBerat: ' + weightKg.toFixed(1) + ' kg'
        + '\nJemput: ' + pickupAddr
        + '\nAntar: ' + destAddr
        + '\nJarak: ' + _jdpRouteDistKm.toFixed(1) + ' km';
    if (pickupNote) desc += '\nCatatan Jemput: ' + pickupNote;
    if (destNote) desc += '\nCatatan Antar: ' + destNote;

    var orderId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
    var orderData = {
        action: 'createOrder',
        id: orderId,
        userId: session.id,
        talentId: '',
        skillType: 'js_delivery',
        serviceType: 'JS Delivery',
        status: 'searching',
        description: desc,
        itemDescription: itemDesc,
        estimatedWeightKg: weightKg,
        pickupNote: pickupNote,
        destNote: destNote,
        price: price,
        distanceFee: distanceFee,
        overweightFee: weightFee,
        fee: fee,
        totalCost: totalCost,
        paymentMethod: paymentMethod,
        userLat: _jdpPickupCoords.lat,
        userLng: _jdpPickupCoords.lng,
        userAddr: pickupAddr,
        destLat: _jdpDestCoords.lat,
        destLng: _jdpDestCoords.lng,
        destAddr: destAddr,
        distanceKm: _jdpRouteDistKm
    };

    backendPost(orderData).then(function (res) {
        if (res && res.success && res.data) {
            var order = res.data;
            closeJSDeliveryPage();
            openOrderTracking(order);
            searchNearbyDriver(order);
        } else {
            btn.disabled = false;
            btn.textContent = '📦 Cari Driver — ' + formatRupiah(totalCost);
            showToast('Gagal membuat pesanan: ' + ((res && res.message) || 'coba lagi'), 'error');
        }
    }).catch(function () {
        btn.disabled = false;
        btn.textContent = '📦 Cari Driver — ' + formatRupiah(totalCost);
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
        showToast('Tidak ada driver tersedia saat ini.', 'error');
        // For product orders, go back to preparing (don't cancel the whole order)
        if (order.sellerId) {
            backendPost({ action: 'updateOrder', orderId: order.id, fields: { status: 'preparing' } });
            addNotifItem({ icon: '⚠️', title: 'Driver Tidak Ditemukan', desc: 'Belum ada driver. Akan dicari lagi.', type: 'order', orderId: order.id });
            if (order.sellerId) {
                addNotifItem({ userId: order.sellerId, icon: '⚠️', title: 'Belum Ada Driver', desc: 'Driver belum tersedia. Coba kirim ulang nanti.', type: 'order', orderId: order.id });
            }
        } else {
            backendPost({ action: 'updateOrder', orderId: order.id, fields: { status: 'cancelled', cancelledAt: Date.now(), cancelReason: 'no_driver' } });
            addNotifItem({ icon: '❌', title: 'Driver Tidak Ditemukan', desc: 'Tidak ada driver tersedia untuk pesanan Anda.', type: 'order', orderId: order.id });
        }
        return;
    }

    _searchDriverAttempts++;

    // For product orders: search drivers near STORE location (for pickup)
    // For JS Antar: search drivers near USER location
    var searchLat = order.sellerId ? (order.talentLat || order.userLat) : order.userLat;
    var searchLng = order.sellerId ? (order.talentLng || order.userLng) : order.userLng;

    FB.get('findNearbyTalents', {
        lat: searchLat,
        lng: searchLng,
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
        var isProduct = !!order.sellerId;
        var isDelivery = order.skillType === 'js_delivery';
        var notifTitle = isProduct
            ? '📦 Pesanan Ambil & Antar!'
            : (isDelivery ? '📦 Pesanan JS Delivery Baru!' : '🏍️ Pesanan JS Antar Baru!');
        var notifDesc = '';
        if (isProduct) {
            notifDesc = 'Ambil di ' + (order.storeName || 'Toko') + ' (' + distText + ') - ' + formatRupiah(order.deliveryFee || order.price);
        } else if (isDelivery) {
            var wt = Number(order.estimatedWeightKg) || 0;
            var wtText = wt > 0 ? (wt.toFixed(1) + ' kg') : '-';
            var itemShort = String(order.itemDescription || '').trim();
            if (itemShort.length > 36) itemShort = itemShort.slice(0, 33) + '...';
            notifDesc = (itemShort ? (itemShort + ' • ') : '') + 'Berat ' + wtText + ' • Jarak ' + distText + ' • Total ' + formatRupiah(order.totalCost || (order.price + (order.fee || 0)));
        } else {
            notifDesc = 'Jarak ' + distText + ' - ' + formatRupiah(order.price);
        }

        backendPost({
            action: 'updateOrder',
            orderId: order.id,
            fields: { talentId: nearest.id, status: 'pending', assignedAt: Date.now() }
        }).then(function () {
            // Notify the assigned talent
            addNotifItem({
                userId: nearest.id,
                icon: isProduct ? '📦' : '🏍️',
                title: notifTitle,
                desc: notifDesc,
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
