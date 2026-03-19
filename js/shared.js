/* ========================================
   JASA SURUH (JS) - Shared Pages Module
   Order Tracking, Chat, Rating, Settings,
   Orders List, Bottom Nav, PWA, Splash
   ======================================== */

// ══════════════════════════════════════════
// ═══ NOTIFICATION POPUP ═══
// ══════════════════════════════════════════
var _notifItems = [];

function openNotifPopup() {
    var popup = document.getElementById('notifPopup');
    if (!popup) return;
    popup.classList.remove('hidden');
    renderNotifItems();

    if (!popup._eventsSetup) {
        popup._eventsSetup = true;
        document.getElementById('notifPopupClose').addEventListener('click', function () { popup.classList.add('hidden'); });
        document.getElementById('notifPopupOverlay').addEventListener('click', function () { popup.classList.add('hidden'); });
    }
}
window.openNotifPopup = openNotifPopup;

function addNotifItem(item) {
    // item: { icon, title, desc, time, id, onClick }
    // Prevent duplicates by id
    if (item.id && _notifItems.some(function (n) { return n.id === item.id; })) return;
    _notifItems.unshift(item);
    // Keep max 50
    if (_notifItems.length > 50) _notifItems = _notifItems.slice(0, 50);
    updateNotifBadges();
}
window.addNotifItem = addNotifItem;

function updateNotifBadges() {
    var count = _notifItems.length;
    ['userHeaderBadge', 'talentHeaderBadge', 'penjualHeaderBadge'].forEach(function (id) {
        var badge = document.getElementById(id);
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 9 ? '9+' : count;
                badge.style.display = '';
            } else {
                badge.style.display = 'none';
            }
        }
    });
}

function renderNotifItems() {
    var body = document.getElementById('notifPopupBody');
    if (!body) return;
    if (_notifItems.length === 0) {
        body.innerHTML = '<div class="notif-empty"><div class="notif-empty-icon">🔕</div><p>Belum ada notifikasi</p></div>';
        return;
    }
    var html = '';
    _notifItems.forEach(function (n, i) {
        html += '<div class="notif-item' + (n.unread ? ' unread' : '') + '" data-idx="' + i + '">';
        html += '<div class="notif-item-icon">' + (n.icon || '🔔') + '</div>';
        html += '<div class="notif-item-body">';
        html += '<div class="notif-item-title">' + (n.title || '') + '</div>';
        html += '<div class="notif-item-desc">' + (n.desc || '') + '</div>';
        if (n.time) html += '<div class="notif-item-time">' + n.time + '</div>';
        html += '</div></div>';
    });
    body.innerHTML = html;
    body.querySelectorAll('.notif-item').forEach(function (el) {
        el.addEventListener('click', function () {
            var idx = parseInt(this.dataset.idx);
            var item = _notifItems[idx];
            if (item) {
                item.unread = false;
                if (typeof item.onClick === 'function') item.onClick();
            }
            document.getElementById('notifPopup').classList.add('hidden');
        });
    });
}

// ══════════════════════════════════════════
// ═══ ORDER TRACKING PAGE ═══
// ══════════════════════════════════════════
function openOrderTracking(order) {
    _currentOrder = order;
    var page = document.getElementById('orderTrackingPage');
    if (!page) return;

    var session = getSession();
    var isTalent = session && session.id === order.talentId;
    var isUser = session && session.id === order.userId;

    document.getElementById('otpTitle').textContent = order.serviceType || 'Pesanan';
    updateOrderStatusBadge(order.status);
    renderOrderInfo(order, isTalent);
    renderOrderActions(order, isTalent, isUser);
    initTrackingMap(order);

    page.classList.remove('hidden');

    if (!page._eventsSetup) {
        page._eventsSetup = true;
        document.getElementById('otpBtnBack').addEventListener('click', function () {
            page.classList.add('hidden');
            stopPolling();
        });
        document.getElementById('otpChatFab').addEventListener('click', function () {
            if (_currentOrder) openChat(_currentOrder);
        });
    }

    startOrderPolling(order.id);
}

function updateOrderStatusBadge(status) {
    var badge = document.getElementById('otpStatus');
    if (!badge) return;
    var TRACKING_STATUS = {
        pending: 'Menunggu Konfirmasi',
        accepted: 'Diterima',
        on_the_way: 'Dalam Perjalanan',
        arrived: 'Sudah Tiba',
        in_progress: 'Sedang Dikerjakan',
        completed: 'Selesai',
        rated: 'Sudah Dinilai'
    };
    badge.textContent = TRACKING_STATUS[status] || status;
    badge.className = 'otp-status-badge status-' + status;
}

function renderOrderInfo(order, isTalent) {
    var el = document.getElementById('otpInfoContent');
    if (!el) return;
    var users = getUsers();
    var other = users.find(function (u) {
        return u.id === (isTalent ? order.userId : order.talentId);
    });
    var otherName = other ? other.name : 'Unknown';
    var priceText = order.price ? 'Rp ' + Number(order.price).toLocaleString('id-ID') : '-';
    var feeText = order.fee ? 'Rp ' + Number(order.fee).toLocaleString('id-ID') : '-';
    var addrText = order.userAddr || 'Tidak tersedia';
    var isAntar = order.skillType === 'js_antar';

    el.innerHTML = ''
        + '<div class="otp-info-row"><span class="otp-info-label">' + (isTalent ? 'Pelanggan' : 'Driver') + '</span><span class="otp-info-val">' + escapeHtml(otherName) + '</span></div>'
        + '<div class="otp-info-row"><span class="otp-info-label">Layanan</span><span class="otp-info-val">' + escapeHtml(order.serviceType || '') + '</span></div>'
        + (isAntar ? '<div class="otp-info-row"><span class="otp-info-label">📍 Jemput</span><span class="otp-info-val">' + escapeHtml(addrText) + '</span></div>' : '<div class="otp-info-row"><span class="otp-info-label">Alamat</span><span class="otp-info-val">' + escapeHtml(addrText) + '</span></div>')
        + (isAntar && order.destAddr ? '<div class="otp-info-row"><span class="otp-info-label">🏁 Tujuan</span><span class="otp-info-val">' + escapeHtml(String(order.destAddr)) + '</span></div>' : '')
        + (isAntar && order.distanceKm ? '<div class="otp-info-row"><span class="otp-info-label">Jarak</span><span class="otp-info-val">' + Number(order.distanceKm).toFixed(1) + ' km</span></div>' : '')
        + '<div class="otp-info-row"><span class="otp-info-label">Harga</span><span class="otp-info-val">' + priceText + '</span></div>'
        + '<div class="otp-info-row"><span class="otp-info-label">Biaya Layanan</span><span class="otp-info-val">' + feeText + '</span></div>'
        + (order.proofPhoto ? '<div class="otp-proof"><img src="' + order.proofPhoto + '" alt="Bukti"></div>' : '');
}

function renderOrderActions(order, isTalent, isUser) {
    var el = document.getElementById('otpActions');
    if (!el) return;
    el.innerHTML = '';

    if (isTalent) {
        if (order.status === 'pending') {
            el.innerHTML = '<button class="otp-btn otp-btn-accept" id="otpBtnAccept">✅ Terima Pesanan</button>';
            document.getElementById('otpBtnAccept').addEventListener('click', function () { updateOrderStatus(order.id, 'accepted', { acceptedAt: Date.now() }); });
        } else if (order.status === 'accepted') {
            el.innerHTML = '<button class="otp-btn otp-btn-otw" id="otpBtnOtw">🏍️ Menuju Lokasi</button>';
            document.getElementById('otpBtnOtw').addEventListener('click', function () { updateOrderStatus(order.id, 'on_the_way', {}); startTalentLocationBroadcast(order.id); });
        } else if (order.status === 'on_the_way') {
            el.innerHTML = '<button class="otp-btn otp-btn-arrive" id="otpBtnArrive">📍 Sudah Tiba</button>';
            document.getElementById('otpBtnArrive').addEventListener('click', function () { updateOrderStatus(order.id, 'arrived', {}); });
        } else if (order.status === 'arrived') {
            el.innerHTML = '<button class="otp-btn otp-btn-start" id="otpBtnStart">🔨 Mulai Mengerjakan</button>';
            document.getElementById('otpBtnStart').addEventListener('click', function () { updateOrderStatus(order.id, 'in_progress', { startedAt: Date.now() }); });
        } else if (order.status === 'in_progress') {
            el.innerHTML = '<button class="otp-btn otp-btn-complete" id="otpBtnComplete">✅ Selesai + Upload Bukti</button><input type="file" id="otpProofInput" accept="image/*" capture="environment" style="display:none">';
            document.getElementById('otpBtnComplete').addEventListener('click', function () {
                document.getElementById('otpProofInput').click();
            });
            document.getElementById('otpProofInput').addEventListener('change', function () {
                var file = this.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function () {
                    compressThumbnail(reader.result, function (proofThumb) {
                        updateOrderStatus(order.id, 'completed', { completedAt: Date.now(), proofPhoto: proofThumb });
                    });
                };
                reader.readAsDataURL(file);
                this.value = '';
            });
        }
    }

    if (isUser && order.status === 'completed') {
        el.innerHTML = '<button class="otp-btn otp-btn-rate" id="otpBtnRate">⭐ Beri Rating</button>';
        document.getElementById('otpBtnRate').addEventListener('click', function () { openRatingPage(order); });
    }
}

function updateOrderStatus(orderId, newStatus, extraFields) {
    var fields = extraFields || {};
    fields.status = newStatus;
    backendPost({ action: 'updateOrder', orderId: orderId, fields: fields }).then(function (res) {
        if (res && res.success) {
            if (_currentOrder && _currentOrder.id === orderId) {
                _currentOrder.status = newStatus;
                for (var k in extraFields) _currentOrder[k] = extraFields[k];
                updateOrderStatusBadge(newStatus);
                var session = getSession();
                renderOrderActions(_currentOrder, session && session.id === _currentOrder.talentId, session && session.id === _currentOrder.userId);
                renderOrderInfo(_currentOrder, session && session.id === _currentOrder.talentId);
            }
            showToast('Status diperbarui!', 'success');
        } else {
            showToast('Gagal update status', 'error');
        }
    });
}

// ══════════════════════════════════════════
// ═══ MAP TRACKING (Leaflet + OSRM) ═══
// ══════════════════════════════════════════
function initTrackingMap(order) {
    var container = document.getElementById('otpMapContainer');
    if (!container) return;

    if (_otpMap) { _otpMap.remove(); _otpMap = null; }

    var userLat = Number(order.userLat) || -6.2;
    var userLng = Number(order.userLng) || 106.8;
    var talentLat = Number(order.talentLat) || userLat;
    var talentLng = Number(order.talentLng) || userLng;
    var isAntar = order.skillType === 'js_antar';
    var destLat = isAntar && order.destLat ? Number(order.destLat) : null;
    var destLng = isAntar && order.destLng ? Number(order.destLng) : null;

    var centerLat = (userLat + talentLat) / 2;
    var centerLng = (userLng + talentLng) / 2;

    _otpMap = L.map(container).setView([centerLat, centerLng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(_otpMap);

    var userIcon = L.divIcon({
        html: '<div style="background:' + (isAntar ? '#22C55E' : '#2196F3') + ';color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">' + (isAntar ? '🟢' : '📍') + '</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        className: ''
    });
    _otpUserMarker = L.marker([userLat, userLng], { icon: userIcon }).addTo(_otpMap).bindPopup(isAntar ? 'Titik Jemput' : 'Lokasi Anda');

    var talentIcon = L.divIcon({
        html: '<div style="background:#FF6B00;color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">🏍️</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        className: ''
    });
    _otpTalentMarker = L.marker([talentLat, talentLng], { icon: talentIcon }).addTo(_otpMap).bindPopup('Driver');

    var points = [[userLat, userLng], [talentLat, talentLng]];
    if (isAntar && destLat && destLng) {
        var destIcon = L.divIcon({
            html: '<div style="background:#EF4444;color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">🏁</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            className: ''
        });
        L.marker([destLat, destLng], { icon: destIcon }).addTo(_otpMap).bindPopup('Tujuan: ' + escapeHtml(String(order.destAddr || '')));
        points.push([destLat, destLng]);
    }

    var bounds = L.latLngBounds(points);
    _otpMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });

    fetchAndDrawRoute(talentLat, talentLng, userLat, userLng);

    setTimeout(function () { if (_otpMap) _otpMap.invalidateSize(); }, 300);
}

function fetchAndDrawRoute(fromLat, fromLng, toLat, toLng) {
    if (!_otpMap) return;
    var url = 'https://router.project-osrm.org/route/v1/driving/' + fromLng + ',' + fromLat + ';' + toLng + ',' + toLat + '?overview=full&geometries=geojson';

    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.routes && data.routes.length > 0) {
                var coords = data.routes[0].geometry.coordinates.map(function (c) {
                    return [c[1], c[0]];
                });
                if (_otpRouteLine) _otpMap.removeLayer(_otpRouteLine);
                _otpRouteLine = L.polyline(coords, { color: '#FF6B00', weight: 4, opacity: 0.8 }).addTo(_otpMap);
            }
        })
        .catch(function () {
            if (_otpRouteLine) _otpMap.removeLayer(_otpRouteLine);
            _otpRouteLine = L.polyline([[fromLat, fromLng], [toLat, toLng]], { color: '#FF6B00', weight: 3, dashArray: '10,10' }).addTo(_otpMap);
        });
}

function updateTalentMarkerPosition(lat, lng) {
    if (_otpTalentMarker) {
        _otpTalentMarker.setLatLng([lat, lng]);
    }
    if (_currentOrder) {
        fetchAndDrawRoute(lat, lng, Number(_currentOrder.userLat), Number(_currentOrder.userLng));
    }
}

// ══════════════════════════════════════════
// ═══ POLLING (Order status + Location) ═══
// ══════════════════════════════════════════
function startOrderPolling(orderId) {
    stopPolling();
    if (typeof FB !== 'undefined' && FB.isReady()) {
        _fbOrderUnsub = FB.onOrder(orderId, function (order) {
            if (!order || !_currentOrder || _currentOrder.id !== orderId) return;
            var oldStatus = _currentOrder.status;
            for (var key in order) { _currentOrder[key] = order[key]; }
            if (oldStatus !== order.status) {
                updateOrderStatusBadge(order.status);
                var session = getSession();
                renderOrderActions(_currentOrder, session && session.id === _currentOrder.talentId, session && session.id === _currentOrder.userId);
                renderOrderInfo(_currentOrder, session && session.id === _currentOrder.talentId);
            }
        });
        _fbLocUnsub = FB.onTalentLocation(orderId, function (loc) {
            if (loc && loc.lat && loc.lng) {
                updateTalentMarkerPosition(Number(loc.lat), Number(loc.lng));
            }
            if (loc && _currentOrder) {
                _currentOrder.talentLat = loc.lat;
                _currentOrder.talentLng = loc.lng;
            }
        });
    } else {
        pollOrderUpdate(orderId);
        _locationPollTimer = setInterval(function () { pollOrderUpdate(orderId); }, 8000);
    }
}

function stopPolling() {
    if (_locationPollTimer) { clearInterval(_locationPollTimer); _locationPollTimer = null; }
    if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
    if (_fbOrderUnsub) { _fbOrderUnsub(); _fbOrderUnsub = null; }
    if (_fbLocUnsub) { _fbLocUnsub(); _fbLocUnsub = null; }
    if (_fbMsgUnsub) { _fbMsgUnsub(); _fbMsgUnsub = null; }
}

function pollOrderUpdate(orderId) {
    if (!isBackendConnected()) return;
    FB.get('getOrdersByUser', { userId: getSession().id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                var order = res.data.find(function (o) { return o.id === orderId; });
                if (order && _currentOrder && _currentOrder.id === orderId) {
                    var oldStatus = _currentOrder.status;
                    for (var key in order) _currentOrder[key] = order[key];

                    if (oldStatus !== order.status) {
                        updateOrderStatusBadge(order.status);
                        var session = getSession();
                        renderOrderActions(_currentOrder, session && session.id === _currentOrder.talentId, session && session.id === _currentOrder.userId);
                        renderOrderInfo(_currentOrder, session && session.id === _currentOrder.talentId);
                    }

                    if (order.talentLat && order.talentLng) {
                        updateTalentMarkerPosition(Number(order.talentLat), Number(order.talentLng));
                    }
                }
            }
        })
        .catch(function () {});
}

function startTalentLocationBroadcast(orderId) {
    function broadcast() {
        getCurrentPosition().then(function (pos) {
            backendPost({
                action: 'updateTalentLocation',
                orderId: orderId,
                lat: pos.lat,
                lng: pos.lng
            });
        }).catch(function () {});
    }
    broadcast();
    if (!_locationPollTimer) {
        _locationPollTimer = setInterval(broadcast, 10000);
    }
}

// ══════════════════════════════════════════
// ═══ CHAT SYSTEM ═══
// ══════════════════════════════════════════
function openChat(order) {
    _chatOrderId = order.id;
    _chatMessages = [];
    var page = document.getElementById('chatPage');
    if (!page) return;

    var session = getSession();
    var users = getUsers();
    var isTalent = session && session.id === order.talentId;
    var other = users.find(function (u) { return u.id === (isTalent ? order.userId : order.talentId); });
    document.getElementById('chatTitle').textContent = other ? other.name : 'Chat';
    document.getElementById('chatSubtitle').textContent = order.serviceType || '';
    document.getElementById('chatMessages').innerHTML = '<div class="chat-system">Chat pesanan #' + order.id.substr(0, 8) + '</div>';
    document.getElementById('chatInput').value = '';

    page.classList.remove('hidden');

    if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
    if (_fbMsgUnsub) { _fbMsgUnsub(); _fbMsgUnsub = null; }
    if (typeof FB !== 'undefined' && FB.isReady()) {
        _fbMsgUnsub = FB.onMessages(order.id, function (res) {
            if (res.success && res.data) {
                _chatMessages = res.data;
                renderChatMessages();
            }
        });
    } else {
        fetchChatMessages(order.id);
        _chatPollTimer = setInterval(function () { fetchChatMessages(order.id); }, 5000);
    }

    if (!page._eventsSetup) {
        page._eventsSetup = true;
        document.getElementById('chatBtnBack').addEventListener('click', function () {
            page.classList.add('hidden');
            if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
            if (_fbMsgUnsub) { _fbMsgUnsub(); _fbMsgUnsub = null; }
        });
        document.getElementById('chatBtnSend').addEventListener('click', function () { sendChatMessage(); });
        document.getElementById('chatInput').addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
        });
        document.getElementById('chatBtnPhoto').addEventListener('click', function () {
            document.getElementById('chatPhotoInput').click();
        });
        document.getElementById('chatPhotoInput').addEventListener('change', function () {
            var file = this.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                compressThumbnail(reader.result, function (thumb) {
                    sendChatMessage(thumb);
                });
            };
            reader.readAsDataURL(file);
            this.value = '';
        });
    }
}

function fetchChatMessages(orderId) {
    if (!isBackendConnected()) return;
    FB.get('getMessages', { orderId: orderId })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                _chatMessages = res.data;
                renderChatMessages();
            }
        })
        .catch(function () {});
}

function renderChatMessages() {
    var container = document.getElementById('chatMessages');
    if (!container) return;
    var session = getSession();
    if (!session) return;

    var html = '<div class="chat-system">Chat pesanan dimulai</div>';
    _chatMessages.forEach(function (m) {
        var isMine = String(m.senderId) === String(session.id);
        var cls = isMine ? 'chat-msg sent' : 'chat-msg received';
        var time = new Date(Number(m.createdAt));
        var timeStr = time.getHours().toString().padStart(2, '0') + ':' + time.getMinutes().toString().padStart(2, '0');

        html += '<div class="' + cls + '">';
        if (!isMine) html += '<div class="chat-sender">' + escapeHtml(String(m.senderName || '')) + '</div>';
        if (m.photo) html += '<img class="chat-photo" src="' + m.photo + '" alt="Foto">';
        if (m.text) html += '<div class="chat-text">' + escapeHtml(String(m.text)) + '</div>';
        html += '<div class="chat-time">' + timeStr + '</div>';
        html += '</div>';
    });
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function sendChatMessage(photo) {
    var session = getSession();
    if (!session || !_chatOrderId) return;
    var input = document.getElementById('chatInput');
    var text = (input.value || '').trim();
    if (!text && !photo) return;

    var msgData = {
        action: 'sendMessage',
        orderId: _chatOrderId,
        senderId: session.id,
        senderName: session.name,
        text: text,
        photo: photo || ''
    };

    input.value = '';

    _chatMessages.push({
        senderId: session.id,
        senderName: session.name,
        text: text,
        photo: photo || '',
        createdAt: Date.now()
    });
    renderChatMessages();

    backendPost(msgData).catch(function () { showToast('Gagal mengirim pesan', 'error'); });
}

// ══════════════════════════════════════════
// ═══ RATING PAGE ═══
// ══════════════════════════════════════════
function openRatingPage(order) {
    _ratingOrder = order;
    _ratingValue = 0;
    var page = document.getElementById('ratingPage');
    if (!page) return;

    var users = getUsers();
    var talent = users.find(function (u) { return u.id === order.talentId; });
    document.getElementById('ratingTalentName').textContent = talent ? talent.name : 'Talent';
    document.getElementById('ratingServiceDesc').textContent = order.serviceType || '';
    document.getElementById('ratingEmoji').textContent = '⭐';
    document.getElementById('ratingLabel').textContent = 'Ketuk bintang untuk menilai';
    document.getElementById('ratingReview').value = '';

    document.querySelectorAll('#ratingStars .star').forEach(function (s) { s.classList.remove('active'); });

    page.classList.remove('hidden');

    if (!page._eventsSetup) {
        page._eventsSetup = true;
        document.getElementById('ratingBtnBack').addEventListener('click', function () {
            page.classList.add('hidden');
        });
        document.querySelectorAll('#ratingStars .star').forEach(function (star) {
            star.addEventListener('click', function () {
                _ratingValue = parseInt(this.dataset.val, 10);
                var emojis = ['', '😞', '😐', '🙂', '😊', '🤩'];
                var labels = ['', 'Sangat Buruk', 'Kurang Baik', 'Cukup Baik', 'Baik', 'Sangat Baik!'];
                document.getElementById('ratingEmoji').textContent = emojis[_ratingValue] || '⭐';
                document.getElementById('ratingLabel').textContent = labels[_ratingValue] || '';
                document.querySelectorAll('#ratingStars .star').forEach(function (s) {
                    s.classList.toggle('active', parseInt(s.dataset.val, 10) <= _ratingValue);
                });
            });
        });
        document.getElementById('ratingSubmitBtn').addEventListener('click', function () { submitRating(); });
    }
}

function submitRating() {
    if (!_ratingOrder || _ratingValue < 1) { showToast('Pilih rating terlebih dahulu', 'error'); return; }
    var review = (document.getElementById('ratingReview').value || '').trim();

    backendPost({
        action: 'rateOrder',
        orderId: _ratingOrder.id,
        rating: _ratingValue,
        review: review
    }).then(function (res) {
        if (res && res.success) {
            showToast('Rating berhasil dikirim! Terima kasih 🎉', 'success');
            document.getElementById('ratingPage').classList.add('hidden');
            if (_ratingOrder.talentId) delete _talentRatingsCache[_ratingOrder.talentId];
            if (_currentOrder && _currentOrder.id === _ratingOrder.id) {
                _currentOrder.status = 'rated';
                _currentOrder.rating = _ratingValue;
                _currentOrder.review = review;
                var session = getSession();
                updateOrderStatusBadge('rated');
                renderOrderActions(_currentOrder, session && session.id === _currentOrder.talentId, session && session.id === _currentOrder.userId);
            }
            var olp = document.getElementById('ordersListPage');
            if (olp && !olp.classList.contains('hidden')) openOrdersList();
        } else {
            showToast('Gagal mengirim rating', 'error');
        }
    });
}

// ══════════════════════════════════════════
// ═══ SETTINGS / AKUN PAGE ═══
// ══════════════════════════════════════════
function openSettingsPage() {
    var page = document.getElementById('settingsPage');
    if (!page) return;
    var session = getSession();
    if (!session) return;

    var ROLE_LABELS = { user: 'Pengguna', talent: 'Talent', penjual: 'Penjual', cs: 'CS', owner: 'Owner' };
    var roleLabel = ROLE_LABELS[session.role] || session.role;

    document.getElementById('settingsProfileName').textContent = session.name || '-';
    document.getElementById('settingsInfoName').textContent = session.name || '-';
    document.getElementById('settingsInfoUsername').textContent = session.username || '-';
    document.getElementById('settingsInfoPhone').textContent = session.phone || '-';
    document.getElementById('settingsInfoRole').textContent = roleLabel;

    var badge = document.getElementById('settingsRoleBadge');
    if (badge) { badge.textContent = roleLabel; badge.className = 'settings-role-badge role-' + session.role; }

    var photo = getProfilePhoto(session.id);
    var avatarImg = document.getElementById('settingsAvatarImg');
    var avatarIcon = document.getElementById('settingsAvatarIcon');
    if (photo) {
        avatarImg.src = photo; avatarImg.style.display = 'block'; avatarIcon.style.display = 'none';
    } else {
        avatarImg.style.display = 'none'; avatarIcon.style.display = '';
    }

    document.getElementById('settingsPhotoChangeBtn').style.display = session.role === 'talent' ? '' : 'none';

    page.classList.remove('hidden');

    if (!page._eventsSetup) {
        page._eventsSetup = true;

        document.getElementById('settingsBtnBack').addEventListener('click', function () {
            page.classList.add('hidden');
            resetBottomNavToHome();
        });

        document.getElementById('settingsBtnLogout').addEventListener('click', function () {
            page.classList.add('hidden');
            handleLogout();
        });

        document.getElementById('settingsBtnChangePhoto').addEventListener('click', function () {
            document.getElementById('settingsPhotoInput').click();
        });

        document.getElementById('settingsPhotoInput').addEventListener('change', function () {
            var file = this.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                compressThumbnail(reader.result, function (thumb) {
                    var s = getSession();
                    if (!s) return;
                    saveProfilePhoto(s.id, thumb);
                    avatarImg.src = thumb; avatarImg.style.display = 'block'; avatarIcon.style.display = 'none';
                    showToast('Foto profil berhasil diperbarui! 📸', 'success');
                });
            };
            reader.readAsDataURL(file);
            this.value = '';
        });
    }
}

// ══════════════════════════════════════════
// ═══ ORDERS LIST PAGE ═══
// ══════════════════════════════════════════
function openOrdersList() {
    var page = document.getElementById('ordersListPage');
    if (!page) return;
    var session = getSession();
    if (!session) return;

    document.getElementById('olpTitle').textContent = session.role === 'talent' ? 'Pesanan Masuk' : 'Pesanan Saya';
    page.classList.remove('hidden');

    document.getElementById('olpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">⏳</div><p>Memuat pesanan...</p></div>';

    FB.get('getOrdersByUser', { userId: session.id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                _ordersListData = res.data;
                filterOrdersList('active');
            } else {
                document.getElementById('olpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📭</div><p>Belum ada pesanan</p></div>';
            }
        })
        .catch(function () {
            document.getElementById('olpList').innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">❌</div><p>Gagal memuat pesanan</p></div>';
        });

    if (!page._eventsSetup) {
        page._eventsSetup = true;
        document.getElementById('olpBtnBack').addEventListener('click', function () {
            page.classList.add('hidden');
            resetBottomNavToHome();
        });
        document.querySelectorAll('#olpTabs .olp-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                document.querySelectorAll('#olpTabs .olp-tab').forEach(function (t) { t.classList.remove('active'); });
                tab.classList.add('active');
                filterOrdersList(tab.dataset.filter);
            });
        });
    }
}

function filterOrdersList(filter) {
    var filtered = _ordersListData;
    if (filter === 'active') {
        filtered = filtered.filter(function (o) { return ['pending', 'accepted', 'on_the_way', 'arrived', 'in_progress'].indexOf(o.status) >= 0; });
    } else if (filter === 'completed') {
        filtered = filtered.filter(function (o) { return o.status === 'completed' || o.status === 'rated'; });
    }
    renderOrderCards(filtered);
}

function renderOrderCards(orders) {
    var list = document.getElementById('olpList');
    if (!list) return;
    var session = getSession();
    var users = getUsers();

    if (orders.length === 0) {
        list.innerHTML = '<div class="stp-empty"><div class="stp-empty-icon">📭</div><p>Tidak ada pesanan</p></div>';
        return;
    }

    list.innerHTML = orders.map(function (o, idx) {
        var isTalent = session && session.id === o.talentId;
        var other = users.find(function (u) { return u.id === (isTalent ? o.userId : o.talentId); });
        var otherName = other ? other.name : 'Unknown';
        var priceText = o.price ? 'Rp ' + Number(o.price).toLocaleString('id-ID') : '-';
        var dateText = new Date(Number(o.createdAt)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        var statusText = STATUS_LABELS[o.status] || o.status;

        var rateRow = '';
        if (!isTalent && o.status === 'completed') {
            rateRow = '<button class="olp-rate-btn" data-ridx="' + idx + '">⭐ Beri Rating Sekarang</button>';
        } else if (o.status === 'rated' && o.rating > 0) {
            var stars = '';
            for (var s = 1; s <= 5; s++) stars += (s <= o.rating ? '★' : '☆');
            var reviewSnip = o.review ? ' · <em>' + escapeHtml(String(o.review).substr(0, 35)) + (o.review.length > 35 ? '…' : '') + '</em>' : '';
            rateRow = '<div class="olp-rated-badge">' + stars + reviewSnip + '</div>';
        }

        return '<div class="olp-card" data-idx="' + idx + '">'
            + '<div class="olp-card-top">'
            + '<div class="olp-card-service">' + escapeHtml(o.serviceType || o.skillType || '') + '</div>'
            + '<span class="otp-status-badge status-' + o.status + '">' + statusText + '</span>'
            + '</div>'
            + '<div class="olp-card-name">👤 ' + escapeHtml(otherName) + '</div>'
            + '<div class="olp-card-bottom">'
            + '<span class="olp-card-price">' + priceText + '</span>'
            + '<span class="olp-card-date">' + dateText + '</span>'
            + '</div>'
            + (rateRow ? '<div class="olp-rate-row">' + rateRow + '</div>' : '')
            + '</div>';
    }).join('');

    list.querySelectorAll('.olp-card').forEach(function (card) {
        card.addEventListener('click', function () {
            var idx = parseInt(this.dataset.idx, 10);
            if (orders[idx]) openOrderTracking(orders[idx]);
        });
    });

    list.querySelectorAll('.olp-rate-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var idx = parseInt(this.dataset.ridx, 10);
            if (orders[idx]) openRatingPage(orders[idx]);
        });
    });
}

// ══════════════════════════════════════════
// ═══ RESET BOTTOM NAV ═══
// ══════════════════════════════════════════
function resetBottomNavToHome() {
    document.querySelectorAll('.bottom-nav').forEach(function (nav) {
        // Only reset the visible nav (inside visible page)
        if (nav.closest('.page') && nav.closest('.page').classList.contains('hidden')) return;
        nav.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
        var homeBtn = nav.querySelector('.nav-item[data-page="home"]');
        if (homeBtn) homeBtn.classList.add('active');
    });
}
window.resetBottomNavToHome = resetBottomNavToHome;

// ══════════════════════════════════════════
// ═══ BOTTOM NAV ═══
// ══════════════════════════════════════════
function setupBottomNav() {
    document.querySelectorAll('.bottom-nav').forEach(function (nav) {
        nav.querySelectorAll('.nav-item').forEach(function (item) {
            item.addEventListener('click', function () {
                nav.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
                this.classList.add('active');
                var page = this.dataset.page;
                if (page === 'pesanan') {
                    openOrdersList();
                } else if (page === 'chat') {
                    openOrdersList();
                } else if (page === 'tickets' || page === 'reports') {
                    openAdminTransactions();
                } else if (page === 'products') {
                    var prodSec = document.getElementById('penjualProductsSection');
                    if (prodSec) prodSec.scrollIntoView({ behavior: 'smooth' });
                } else if (page === 'earning') {
                    showToast('Rincian pendapatan segera hadir! 🚀');
                } else if (page === 'home') {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else if (page === 'akun' || page === 'profil' || page === 'settings') {
                    openSettingsPage();
                } else if (page === 'users') {
                    var userListSec = document.getElementById('ownerUserList') || document.getElementById('csUserList');
                    if (userListSec) userListSec.scrollIntoView({ behavior: 'smooth' });
                } else if (page === 'cs-manage') {
                    var csFormSec = document.getElementById('createCSForm');
                    if (csFormSec) csFormSec.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    });
}

// ══════════════════════════════════════════
// ═══ PWA & SPLASH ═══
// ══════════════════════════════════════════
window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
});

function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
    }
}

function handleSplash() {
    var splash = document.getElementById('splash');
    var app = document.getElementById('app');

    setTimeout(function () {
        splash.classList.add('fade-out');
        app.classList.remove('hidden');

        var urlPage = pageFromPath(window.location.pathname);

        var session = getSession();
        if (session) {
            var users = getUsers();
            var valid = users.find(function (u) { return u.id === session.id && u.username === session.username; });
            if (valid) {
                if (urlPage && urlPage !== 'login' && urlPage !== 'register') {
                    showPage(urlPage);
                } else {
                    showPage(valid.role);
                }
                updateRoleUI(valid);
                return;
            }
            clearSession();
        }

        if (urlPage === 'register') {
            showPage('register');
        } else {
            showPage('login');
        }
    }, 1800);
}
