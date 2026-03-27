/* ========================================
   JASA SURUH (JS) - Talent Module
   Skills Modal/Form, Toggle, Dashboard,
   Orders Polling, Notifications
   ======================================== */

// ══════════════════════════════════════════
// ═══ TALENT: SETUP SKILLS MODAL ═══
// ══════════════════════════════════════════
function setupTalentSkills() {
    var btnOpen = document.getElementById('btnOpenSkillModal');
    var modal = document.getElementById('skillModal');
    var btnClose = document.getElementById('btnCloseSkillModal');
    var modalContainer = modal ? modal.querySelector('.talent-skill-modal-container') : null;
    var formModal = document.getElementById('skillFormModal');
    var btnCloseForm = document.getElementById('btnCloseSkillForm');
    var detailForm = document.getElementById('skillDetailForm');
    var priceInput = document.getElementById('sfPrice');
    var feeInfo = document.getElementById('sfFeeInfo');

    function resetTalentNavToHome() {
        var pageTalent = document.getElementById('page-talent');
        if (!pageTalent || pageTalent.classList.contains('hidden')) return;

        var nav = pageTalent.querySelector('.bottom-nav');
        if (!nav) return;
        nav.querySelectorAll('.nav-item').forEach(function (item) {
            item.classList.toggle('active', item.dataset.page === 'home');
        });
    }

    function closeSkillModal() {
        if (!modal) return;
        modal.classList.add('hidden');
        if (modalContainer) {
            modalContainer.style.transform = '';
            modalContainer.style.transition = '';
        }
        resetTalentNavToHome();
    }

    if (!modal) return;

    if (btnOpen) btnOpen.addEventListener('click', function () { openSkillModal(); });
    btnClose.addEventListener('click', function () { closeSkillModal(); });
    modal.addEventListener('click', function (e) { if (e.target === modal) closeSkillModal(); });

    if (btnCloseForm) btnCloseForm.addEventListener('click', function () { formModal.classList.add('hidden'); });
    if (formModal) formModal.addEventListener('click', function (e) { if (e.target === formModal) formModal.classList.add('hidden'); });

    // Price → fee calculator
    if (priceInput && feeInfo) {
        priceInput.addEventListener('input', function () {
            var price = parseInt(this.value) || 0;
            if (price > 0) {
                var fee = Math.ceil(price * 0.05);
                var talent = price - fee;
                feeInfo.innerHTML = 'Biaya pengembang: <strong>Rp ' + fee.toLocaleString('id-ID') + '</strong> — Anda terima: <strong>Rp ' + talent.toLocaleString('id-ID') + '</strong>';
            } else {
                feeInfo.innerHTML = '';
            }
        });
    }

    // Photo upload with auto-compress to ~500KB
    var photoInput = document.getElementById('sfPhoto');
    var btnUpload = document.getElementById('sfBtnUpload');
    var photoPreview = document.getElementById('sfPhotoPreview');
    var photoImg = document.getElementById('sfPhotoImg');
    var removePhoto = document.getElementById('sfRemovePhoto');

    function compressImage(file, maxSizeKB, callback) {
        var maxBytes = maxSizeKB * 1024;
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function () {
            URL.revokeObjectURL(url);
            var canvas = document.createElement('canvas');
            var w = img.width, h = img.height;
            var maxDim = 1200;
            if (w > maxDim || h > maxDim) {
                var ratio = Math.min(maxDim / w, maxDim / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            var quality = 0.9;
            var result = canvas.toDataURL('image/jpeg', quality);
            while (result.length > maxBytes * 1.37 && quality > 0.1) {
                quality -= 0.1;
                result = canvas.toDataURL('image/jpeg', quality);
            }
            if (result.length > maxBytes * 1.37) {
                var scale = Math.sqrt((maxBytes * 1.37) / result.length);
                canvas.width = Math.round(w * scale);
                canvas.height = Math.round(h * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                result = canvas.toDataURL('image/jpeg', 0.7);
            }
            callback(result);
        };
        img.src = url;
    }

    if (btnUpload && photoInput) {
        btnUpload.addEventListener('click', function () { photoInput.click(); });
        photoInput.addEventListener('change', function () {
            var file = this.files[0];
            if (!file) return;
            compressImage(file, 500, function (dataUrl) {
                photoImg.src = dataUrl;
                photoImg.dataset.newUpload = '1';
                photoPreview.style.display = 'block';
                btnUpload.style.display = 'none';
            });
        });
    }
    if (removePhoto) {
        removePhoto.addEventListener('click', function () {
            photoInput.value = '';
            photoImg.src = '';
            photoPreview.style.display = 'none';
            btnUpload.style.display = '';
        });
    }

    // Handle detail form submit (Clean / Service)
    if (detailForm) {
        detailForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var session = getSession();
            if (!session) return;

            var skillType = document.getElementById('skillFormType').value;
            var serviceType = document.getElementById('sfServiceType').value.trim();
            var description = document.getElementById('sfDescription').value.trim();
            var photoData = document.getElementById('sfPhotoImg').src || '';
            var isNewUpload = document.getElementById('sfPhotoImg').dataset.newUpload === '1';
            var price = parseInt(document.getElementById('sfPrice').value) || 0;

            if (!serviceType || !description || price < 1000) {
                showToast('Lengkapi semua data! Harga minimal Rp 1.000', 'error');
                return;
            }

            var def = SKILL_DEFS.find(function (d) { return d.type === skillType; });
            var skills = getUserSkills(session.id);
            var existingSkill = skills.find(function (s) { return s.type === skillType; });

            function finishSave(photoThumb) {
                var filtered = skills.filter(function (s) { return s.type !== skillType; });
                var skillObj = {
                    type: skillType,
                    name: def ? def.name : skillType,
                    serviceType: serviceType,
                    description: description,
                    price: price
                };
                if (photoThumb) skillObj.photo = photoThumb;
                filtered.push(skillObj);
                setUserSkills(session.id, filtered);
                backendPost({ action: 'updateSkills', userId: session.id, skills: skillsForBackend(filtered) });

                formModal.classList.add('hidden');
                detailForm.reset();
                document.getElementById('sfPhotoImg').src = '';
                document.getElementById('sfPhotoImg').dataset.newUpload = '';
                document.getElementById('sfPhotoPreview').style.display = 'none';
                document.getElementById('sfBtnUpload').style.display = '';
                feeInfo.innerHTML = '';
                renderTalentSkills();
                showToast('"' + (def ? def.name : skillType) + '" berhasil ditambahkan!', 'success');
            }

            if (isNewUpload && photoData.startsWith('data:')) {
                compressThumbnail(photoData, function (thumb) {
                    finishSave(thumb);
                });
            } else {
                var existingPhoto = existingSkill ? (existingSkill.photo || '') : '';
                finishSave(existingPhoto);
            }
        });
    }

    renderTalentSkills();
}

// ══════════════════════════════════════════
// ═══ SKILL MODAL & FORM HELPERS ═══
// ══════════════════════════════════════════
function getOrderedSkillDefs() {
    return SKILL_DEFS.slice().sort(function (a, b) {
        function rank(type) {
            if (type === 'js_clean') return 2;
            if (type === 'js_service') return 3;
            return 1;
        }
        var ra = rank(a.type);
        var rb = rank(b.type);
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
    });
}

function openSkillAddPicker(sortedDefs, activeTypes) {
    var body = document.getElementById('skillModalBody');
    if (!body) return;

    var inactiveDefs = sortedDefs.filter(function (def) { return activeTypes.indexOf(def.type) < 0; });
    body.innerHTML = '<div class="skill-modal-topbar">'
        + '<button type="button" class="skill-modal-back-btn" id="btnSkillBack">← Kembali</button>'
        + '<div class="skill-modal-summary"><strong>' + inactiveDefs.length + ' tersedia</strong> • siap ditambahkan</div>'
        + '</div>'
        + (inactiveDefs.length === 0
            ? '<div class="skill-modal-empty">Semua keahlian sudah ditambahkan.</div>'
            : inactiveDefs.map(function (def) {
                return '<div class="skill-option-card" data-type="' + def.type + '" data-hasform="' + def.hasForm + '">'
                    + '<div class="skill-option-left">'
                    + '<span class="skill-option-icon">' + def.icon + '</span>'
                    + '<div class="skill-option-info">'
                    + '<span class="skill-option-name">' + escapeHtml(def.name) + '</span>'
                    + '<span class="skill-option-desc">' + escapeHtml(def.desc) + '</span>'
                    + '</div>'
                    + '</div>'
                    + '<div class="skill-option-right">'
                    + '<span class="skill-status-pill is-inactive">Tidak Aktif</span>'
                    + '<div class="skill-option-actions">'
                    + (def.hasForm ? '<button class="btn-skill-activate btn-form">Tambah</button>' : '<button class="btn-skill-activate">Aktifkan</button>')
                    + '</div>'
                    + '</div>'
                    + '</div>';
            }).join(''));

    var btnBack = document.getElementById('btnSkillBack');
    if (btnBack) btnBack.addEventListener('click', function () { openSkillModal(); });

    body.querySelectorAll('.skill-option-card').forEach(function (card) {
        var type = card.dataset.type;
        var hasForm = card.dataset.hasform === 'true';
        var btnActivate = card.querySelector('.btn-skill-activate');
        if (btnActivate) {
            btnActivate.addEventListener('click', function (e) {
                e.stopPropagation();
                if (hasForm) {
                    openSkillForm(type);
                } else {
                    activateSimpleSkill(type);
                    openSkillModal();
                }
            });
        }
    });
}

function openSkillModal() {
    var session = getSession();
    if (!session) return;

    var modal = document.getElementById('skillModal');
    var body = document.getElementById('skillModalBody');
    if (!modal || !body) return;

    var skills = getUserSkills(session.id);
    var activeTypes = skills.map(function (s) { return s.type; });
    var sortedDefs = getOrderedSkillDefs();

    var activeDefs = sortedDefs.filter(function (def) { return activeTypes.indexOf(def.type) >= 0; });
    var inactiveCount = sortedDefs.length - activeDefs.length;

    body.innerHTML = '<div class="skill-modal-topbar">'
        + '<div class="skill-modal-summary">'
        + '<strong>' + activeDefs.length + ' aktif</strong> • ' + inactiveCount + ' belum ditambahkan'
        + '</div>'
        + '<button type="button" class="btn-primary skill-modal-add-btn" id="btnSkillAddQuick">+ Tambah</button>'
        + '</div>'
        + (activeDefs.length === 0
            ? '<div class="skill-modal-empty">Belum ada keahlian aktif. Klik <strong>+ Tambah</strong> untuk menambahkan.</div>'
            : activeDefs.map(function (def) {
                var rightHtml;
                if (def.hasForm) {
                    rightHtml = '<span class="skill-status-pill is-active">Aktif</span>'
                        + '<div class="skill-option-actions">'
                        + '<button class="btn-skill-edit">✏️ Edit</button>'
                        + '<button class="btn-skill-toggle is-active">Nonaktifkan</button>'
                        + '</div>';
                } else {
                    rightHtml = '<span class="skill-status-pill is-active">Aktif</span>'
                        + '<div class="skill-option-actions">'
                        + '<button class="btn-skill-toggle is-active">Nonaktifkan</button>'
                        + '</div>';
                }
                return '<div class="skill-option-card active" data-type="' + def.type + '" data-hasform="' + def.hasForm + '">'
            + '<div class="skill-option-left">'
            + '<span class="skill-option-icon">' + def.icon + '</span>'
            + '<div class="skill-option-info">'
            + '<span class="skill-option-name">' + escapeHtml(def.name) + '</span>'
            + '<span class="skill-option-desc">' + escapeHtml(def.desc) + '</span>'
            + '</div>'
            + '</div>'
            + '<div class="skill-option-right">' + rightHtml + '</div>'
            + '</div>';
            }).join(''));

    var addQuickBtn = document.getElementById('btnSkillAddQuick');
    if (addQuickBtn) {
        addQuickBtn.addEventListener('click', function () {
            openSkillAddPicker(sortedDefs, activeTypes);
        });
    }

    body.querySelectorAll('.skill-option-card').forEach(function (card) {
        var type = card.dataset.type;
        var hasForm = card.dataset.hasform === 'true';

        var btnEdit = card.querySelector('.btn-skill-edit');
        var btnToggle = card.querySelector('.btn-skill-toggle');
        var btnActivate = card.querySelector('.btn-skill-activate');

        if (btnToggle) {
            btnToggle.addEventListener('click', function (e) {
                e.stopPropagation();
                if (confirm('Hapus keahlian ini?')) {
                    removeSkillByType(type);
                    openSkillModal();
                }
            });
        }
        if (btnEdit) {
            btnEdit.addEventListener('click', function (e) {
                e.stopPropagation();
                openSkillForm(type);
            });
        }
        if (btnActivate) {
            btnActivate.addEventListener('click', function (e) {
                e.stopPropagation();
                if (hasForm) {
                    openSkillForm(type);
                } else {
                    activateSimpleSkill(type);
                    openSkillModal();
                }
            });
        }
    });

    modal.classList.remove('hidden');
}

function activateSimpleSkill(type) {
    var session = getSession();
    if (!session) return;
    var def = SKILL_DEFS.find(function (d) { return d.type === type; });
    var skills = getUserSkills(session.id);
    if (skills.some(function (s) { return s.type === type; })) return;
    skills.push({ type: type, name: def ? def.name : type });
    setUserSkills(session.id, skills);
    backendPost({ action: 'updateSkills', userId: session.id, skills: skillsForBackend(skills) });
    renderTalentSkills();
    showToast('"' + (def ? def.name : type) + '" diaktifkan!', 'success');
}

function openSkillForm(type) {
    var def = SKILL_DEFS.find(function (d) { return d.type === type; });
    var formModal = document.getElementById('skillFormModal');
    var modal = document.getElementById('skillModal');

    document.getElementById('skillFormTitle').textContent = 'Detail ' + (def ? def.name : type);
    document.getElementById('skillFormType').value = type;

    var session = getSession();
    if (session) {
        var skills = getUserSkills(session.id);
        var existing = skills.find(function (s) { return s.type === type; });
        if (existing) {
            document.getElementById('sfServiceType').value = existing.serviceType || '';
            document.getElementById('sfDescription').value = existing.description || '';
            var existingPhoto = existing.photo || getSkillPhoto(session.id, type);
            if (existingPhoto) {
                document.getElementById('sfPhotoImg').src = existingPhoto;
                document.getElementById('sfPhotoImg').dataset.newUpload = '';
                document.getElementById('sfPhotoPreview').style.display = 'block';
                document.getElementById('sfBtnUpload').style.display = 'none';
            } else {
                document.getElementById('sfPhotoImg').src = '';
                document.getElementById('sfPhotoImg').dataset.newUpload = '';
                document.getElementById('sfPhotoPreview').style.display = 'none';
                document.getElementById('sfBtnUpload').style.display = '';
            }
            document.getElementById('sfPrice').value = existing.price || '';
            document.getElementById('sfPrice').dispatchEvent(new Event('input'));
        } else {
            document.getElementById('skillDetailForm').reset();
            document.getElementById('sfPhotoImg').src = '';
            document.getElementById('sfPhotoPreview').style.display = 'none';
            document.getElementById('sfBtnUpload').style.display = '';
            document.getElementById('sfFeeInfo').innerHTML = '';
        }
    }

    if (type === 'js_clean') {
        document.getElementById('sfServiceType').placeholder = 'cth: Bersihkan Taman, Kamar Mandi, dll';
    } else if (type === 'js_service') {
        document.getElementById('sfServiceType').placeholder = 'cth: Service AC, Elektronik, dll';
    }

    modal.classList.add('hidden');
    formModal.classList.remove('hidden');
}

function removeSkillByType(type) {
    var session = getSession();
    if (!session) return;
    var skills = getUserSkills(session.id);
    var filtered = skills.filter(function (s) { return s.type !== type; });
    setUserSkills(session.id, filtered);
    removeSkillPhoto(session.id, type);
    backendPost({ action: 'updateSkills', userId: session.id, skills: skillsForBackend(filtered) });
    renderTalentSkills();
    showToast('Keahlian dinonaktifkan', 'success');
}

function renderTalentSkills() {
    var container = document.getElementById('talentSkillsList');
    if (!container) return;
    var session = getSession();
    if (!session) return;

    var skills = getUserSkills(session.id);
    if (skills.length === 0) {
        container.innerHTML = '<div class="skills-empty">Belum ada keahlian. Klik <strong>+ Tambah</strong> untuk menambahkan!</div>';
        return;
    }

    container.innerHTML = skills.map(function (s) {
        var def = SKILL_DEFS.find(function (d) { return d.type === s.type; });
        var icon = def ? def.icon : '📌';
        var hasDetail = s.serviceType || s.description;
        var hasForm = def && def.hasForm;
        var html = '<div class="skill-card">'
            + '<div class="skill-card-header">'
            + '<span class="skill-card-icon">' + icon + '</span>'
            + '<span class="skill-card-name">' + escapeHtml(s.name) + '</span>'
            + '<div class="skill-card-actions">'
            + (hasForm ? '<button class="skill-card-edit" data-type="' + escapeHtml(s.type) + '">✏️</button>' : '')
            + '<button class="skill-card-remove" data-type="' + escapeHtml(s.type) + '">&times;</button>'
            + '</div>'
            + '</div>';
        if (hasDetail) {
            html += '<div class="skill-card-detail">'
                + '<span class="skill-detail-type">' + escapeHtml(s.serviceType) + '</span>'
                + (s.price ? '<span class="skill-detail-price">Rp ' + s.price.toLocaleString('id-ID') + '</span>' : '')
                + '</div>';
        }
        html += '</div>';
        return html;
    }).join('');

    container.querySelectorAll('.skill-card-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
            if (confirm('Hapus keahlian ini?')) {
                removeSkillByType(this.dataset.type);
            }
        });
    });
    container.querySelectorAll('.skill-card-edit').forEach(function (btn) {
        btn.addEventListener('click', function () {
            openSkillForm(this.dataset.type);
        });
    });
}

// ══════════════════════════════════════════
// ═══ TALENT ONLINE TOGGLE ═══
// ══════════════════════════════════════════
var _talentPushStatusTimer = null;
var _talentPushWatchHooked = false;

function _setTalentPushStatus(text, status) {
    var statusEl = document.getElementById('talentPushStatusText');
    if (!statusEl) return;

    statusEl.textContent = text;
    statusEl.classList.remove('is-active', 'is-warning', 'is-error', 'is-checking');
    if (status) statusEl.classList.add(status);
}

function _setTalentPushAction(visible, text, disabled) {
    var btn = document.getElementById('talentPushEnableBtn');
    if (!btn) return;
    btn.classList.toggle('hidden', !visible);
    btn.textContent = text || 'Aktifkan';
    btn.disabled = !!disabled;
}

function refreshTalentPushStatus(forceEnsure) {
    var session = getSession();
    if (!session || session.role !== 'talent') return Promise.resolve(false);

    var supportsPush = ('Notification' in window) && ('serviceWorker' in navigator) && ('PushManager' in window);
    if (!supportsPush) {
        _setTalentPushStatus('Push tidak didukung browser ini', 'is-error');
        _setTalentPushAction(false, '', false);
        return Promise.resolve(false);
    }

    if (Notification.permission === 'denied') {
        _setTalentPushStatus('Push diblokir di browser', 'is-error');
        _setTalentPushAction(true, 'Buka Pengaturan', false);
        return Promise.resolve(false);
    }

    if (Notification.permission === 'default' && forceEnsure) {
        return Notification.requestPermission().then(function (perm) {
            if (perm !== 'granted') {
                _setTalentPushStatus('Izin notifikasi belum diberikan', 'is-warning');
                _setTalentPushAction(true, 'Izinkan', false);
                return false;
            }
            return refreshTalentPushStatus(true);
        }).catch(function () {
            _setTalentPushStatus('Gagal meminta izin notifikasi', 'is-error');
            _setTalentPushAction(true, 'Coba Lagi', false);
            return false;
        });
    }

    if (Notification.permission === 'default') {
        _setTalentPushStatus('Izin notifikasi belum diberikan', 'is-warning');
        _setTalentPushAction(true, 'Izinkan', false);
        return Promise.resolve(false);
    }

    _setTalentPushStatus('Push: sinkronisasi...', 'is-checking');
    _setTalentPushAction(false, '', true);

    return navigator.serviceWorker.ready
        .then(function (reg) {
            return reg.pushManager.getSubscription().then(function (sub) {
                if (sub) return true;

                if (forceEnsure && typeof window.ensurePushSubscriptionForCurrentUser === 'function') {
                    return window.ensurePushSubscriptionForCurrentUser();
                }

                return false;
            });
        })
        .then(function (ok) {
            if (ok) {
                _setTalentPushStatus('Push aktif - order masuk realtime', 'is-active');
                _setTalentPushAction(false, '', false);
                return true;
            }

            _setTalentPushStatus('Push belum aktif di perangkat ini', 'is-warning');
            _setTalentPushAction(true, 'Sinkronkan', false);
            return false;
        })
        .catch(function () {
            _setTalentPushStatus('Gagal cek status push', 'is-error');
            _setTalentPushAction(true, 'Coba Lagi', false);
            return false;
        });
}
window.refreshTalentPushStatus = refreshTalentPushStatus;

function _startTalentPushStatusWatcher() {
    if (_talentPushStatusTimer) return;

    _talentPushStatusTimer = setInterval(function () {
        var session = getSession();
        if (!session || session.role !== 'talent') return;
        refreshTalentPushStatus(false);
    }, 25000);

    if (_talentPushWatchHooked) return;
    _talentPushWatchHooked = true;

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        var session = getSession();
        if (!session || session.role !== 'talent') return;
        refreshTalentPushStatus(false);
    });

    window.addEventListener('focus', function () {
        var session = getSession();
        if (!session || session.role !== 'talent') return;
        refreshTalentPushStatus(false);
    });
}

function setupTalentToggle() {
    var toggle = document.getElementById('talentOnlineToggle');
    var label = document.getElementById('talentStatusLabel');
    if (!toggle || !label) return;

    function applyOnlineUI(isOnline) {
        toggle.checked = !!isOnline;
        label.textContent = isOnline ? 'Online' : 'Offline';
        label.classList.toggle('online', !!isOnline);
    }

    function saveOnlineState(isOnline) {
        var session = getSession();
        if (!session) return;

        session.isOnline = !!isOnline;
        setSession(session);

        var users = getUsers();
        var idx = users.findIndex(function (u) { return String(u.id) === String(session.id); });
        if (idx >= 0) {
            users[idx].isOnline = !!isOnline;
            saveUsers(users);
        }
    }

    function restoreOnlineState() {
        var session = getSession();
        if (!session || session.role !== 'talent') {
            applyOnlineUI(false);
            return;
        }

        var isOnline = null;
        if (typeof session.isOnline === 'boolean') {
            isOnline = session.isOnline;
        } else {
            var users = getUsers();
            var me = users.find(function (u) { return String(u.id) === String(session.id); });
            if (me && typeof me.isOnline === 'boolean') isOnline = me.isOnline;
        }

        applyOnlineUI(!!isOnline);
    }

    // Initial restore (important when app is reopened).
    restoreOnlineState();

    function hasValidLocation(session) {
        if (!session) return false;
        var lat = Number(session.lat);
        var lng = Number(session.lng);
        return isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0);
    }

    function syncTalentLocation(session) {
        return getCurrentPosition().then(function (pos) {
            return reverseGeocode(pos.lat, pos.lng).then(function (address) {
                var latest = getSession();
                if (latest && latest.id === session.id) {
                    latest.lat = pos.lat;
                    latest.lng = pos.lng;
                    latest.address = address;
                    setSession(latest);
                    displayUserAddress(latest);
                }
                backendPost({ action: 'updateLocation', userId: session.id, lat: pos.lat, lng: pos.lng, address: address });
            });
        });
    }

    toggle.addEventListener('change', function () {
        var session = getSession();
        if (this.checked) {
            var balance = typeof getWalletBalance === 'function' ? getWalletBalance() : 0;
            if (balance < 50000) {
                this.checked = false;
                showToast('Saldo minimal Rp 50.000 untuk bisa Online!', 'error');
                setTimeout(function () {
                    if (confirm('Saldo Anda ' + formatRupiah(balance) + '. Minimal Rp 50.000 untuk bisa menerima orderan.\n\nTop Up sekarang?')) {
                        openTopUpModal();
                    }
                }, 300);
                return;
            }
            if (!session) return;

            var goOnline = function () {
                applyOnlineUI(true);
                saveOnlineState(true);
                showToast('Anda sekarang Online! ✅', 'success');
                backendPost({ action: 'setOnlineStatus', userId: session.id, isOnline: true });
            };

            if (!hasValidLocation(session)) {
                toggle.disabled = true;
                label.textContent = 'Memuat lokasi...';
                syncTalentLocation(session).then(function () {
                    toggle.disabled = false;
                    goOnline();
                }).catch(function () {
                    toggle.disabled = false;
                    applyOnlineUI(false);
                    saveOnlineState(false);
                    showToast('Aktifkan izin lokasi agar bisa Online.', 'error');
                });
                return;
            }

            // Refresh location in background when going online, but don't block UI.
            syncTalentLocation(session).then(function () {}).catch(function () {});
            goOnline();
        } else {
            applyOnlineUI(false);
            saveOnlineState(false);
            showToast('Anda sekarang Offline', 'error');
            if (session) backendPost({ action: 'setOnlineStatus', userId: session.id, isOnline: false });
        }
    });

    var notifBtn = document.getElementById('talentNotifBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', function () {
            openNotifPopup();
        });
    }

    var pushBtn = document.getElementById('talentPushEnableBtn');
    if (pushBtn) {
        pushBtn.addEventListener('click', function () {
            if (!('Notification' in window)) {
                showToast('Browser ini belum mendukung notifikasi.', 'error');
                return;
            }

            if (Notification.permission === 'denied') {
                showToast('Izin notifikasi diblokir. Aktifkan lagi dari pengaturan browser.', 'error');
                return;
            }

            refreshTalentPushStatus(true).then(function (ok) {
                if (ok) showToast('Push notifikasi driver sudah aktif.', 'success');
            });
        });
    }

    refreshTalentPushStatus(false);
    _startTalentPushStatusWatcher();
}

function syncTalentOnlineToggleFromSession() {
    var toggle = document.getElementById('talentOnlineToggle');
    var label = document.getElementById('talentStatusLabel');
    if (!toggle || !label) return;

    var session = getSession();
    if (!session || session.role !== 'talent') return;

    var isOnline = null;
    if (typeof session.isOnline === 'boolean') {
        isOnline = session.isOnline;
    } else {
        var users = getUsers();
        var me = users.find(function (u) { return String(u.id) === String(session.id); });
        if (me && typeof me.isOnline === 'boolean') isOnline = me.isOnline;
    }

    toggle.checked = !!isOnline;
    label.textContent = isOnline ? 'Online' : 'Offline';
    label.classList.toggle('online', !!isOnline);
}

// ══════════════════════════════════════════
// ═══ TALENT DASHBOARD ORDERS ═══
// ══════════════════════════════════════════
function loadTalentDashboardOrders() {
    var session = getSession();
    if (!session || session.role !== 'talent') return;
    if (!isBackendConnected()) return;

    FB.get('getOrdersByUser', { userId: session.id })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                var orders = res.data;
                renderTalentDashboardOrders(orders, session);
                updateTalentStats(orders, session);
                checkNewPendingOrders(orders, session);
            }
        })
        .catch(function () {});
}

function renderTalentDashboardOrders(orders, session) {
    var users = getUsers();

    var incoming = orders.filter(function (o) { return o.talentId === session.id && o.status === 'pending'; });
    var active = orders.filter(function (o) {
        return o.talentId === session.id && ['accepted', 'on_the_way', 'arrived', 'in_progress'].indexOf(o.status) >= 0;
    });

    var inEl = document.getElementById('talentIncomingOrders');
    if (inEl) {
        if (incoming.length === 0) {
            inEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><h3>Belum Ada Pesanan</h3><p>Pesanan baru dari pelanggan akan muncul di sini.</p></div>';
        } else {
            inEl.innerHTML = incoming.map(function (o, idx) {
                var user = users.find(function (u) { return u.id === o.userId; });
                var userName = user ? user.name : 'Pelanggan';
                var priceText = o.price ? 'Rp ' + Number(o.price).toLocaleString('id-ID') : '-';
                var timeAgo = getTimeAgo(o.createdAt);
                return '<div class="td-order-card" data-order-id="' + o.id + '" data-src="incoming" data-idx="' + idx + '">'
                    + '<div class="td-oc-top">'
                    + '<div class="td-oc-service">' + escapeHtml(o.serviceType || o.skillType || 'Pesanan') + '</div>'
                    + '<span class="otp-status-badge status-pending">Baru</span>'
                    + '</div>'
                    + '<div class="td-oc-user">👤 ' + escapeHtml(userName) + '</div>'
                    + '<div class="td-oc-bottom">'
                    + '<span class="td-oc-price">' + priceText + '</span>'
                    + '<span class="td-oc-time">' + timeAgo + '</span>'
                    + '</div>'
                    + '</div>';
            }).join('');

            inEl.querySelectorAll('.td-order-card').forEach(function (card) {
                card.addEventListener('click', function () {
                    var idx = parseInt(this.dataset.idx, 10);
                    if (incoming[idx]) openOrderTracking(incoming[idx]);
                });
            });
        }
    }

    var actEl = document.getElementById('talentActiveOrders');
    if (actEl) {
        if (active.length === 0) {
            actEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h3>Tidak Ada Pesanan Aktif</h3><p>Pesanan yang sedang dikerjakan akan muncul di sini.</p></div>';
        } else {
            actEl.innerHTML = active.map(function (o, idx) {
                var user = users.find(function (u) { return u.id === o.userId; });
                var userName = user ? user.name : 'Pelanggan';
                var priceText = o.price ? 'Rp ' + Number(o.price).toLocaleString('id-ID') : '-';
                var statusText = getStatusLabel(o.status, o.skillType);
                return '<div class="td-order-card active-card" data-src="active" data-idx="' + idx + '">'
                    + '<div class="td-oc-top">'
                    + '<div class="td-oc-service">' + escapeHtml(o.serviceType || o.skillType || 'Pesanan') + '</div>'
                    + '<span class="otp-status-badge status-' + o.status + '">' + statusText + '</span>'
                    + '</div>'
                    + '<div class="td-oc-user">👤 ' + escapeHtml(userName) + '</div>'
                    + '<div class="td-oc-bottom">'
                    + '<span class="td-oc-price">' + priceText + '</span>'
                    + '</div>'
                    + '</div>';
            }).join('');

            actEl.querySelectorAll('.td-order-card').forEach(function (card) {
                card.addEventListener('click', function () {
                    var idx = parseInt(this.dataset.idx, 10);
                    if (active[idx]) openOrderTracking(active[idx]);
                });
            });
        }
    }

    var badgeEl = document.getElementById('talentPendingBadge');
    if (badgeEl) badgeEl.textContent = incoming.length > 0 ? incoming.length : '';

    // Note: talentHeaderBadge is managed by updateNotifBadges() for notification count
    // Use talentPendingBadge for order count instead
}

function updateTalentStats(orders, session) {
    var myOrders = orders.filter(function (o) { return o.talentId === session.id; });

    function getDriverNetIncome(order) {
        if (!order) return 0;

        var isProductDelivery = !!(order.sellerId && String(order.sellerId) !== String(order.talentId));
        var subtotal = Number(order.price) || 0;
        var deliveryFee = Number(order.deliveryFee) || 0;
        var platformFee = Number(order.fee) || 0;
        var paymentMethod = String(order.paymentMethod || 'jspay').toLowerCase();
        var isCOD = paymentMethod === 'cod';

        var defaultCommissionPercent = isProductDelivery ? 10 : 15;
        var commissionPercent = Number(order.commissionPercent);
        if (!isFinite(commissionPercent) || commissionPercent < 0) {
            commissionPercent = defaultCommissionPercent;
        }

        var commissionAmount = Number(order.commissionAmount);
        if (!isFinite(commissionAmount) || commissionAmount < 0) {
            commissionAmount = Math.round(subtotal * commissionPercent / 100);
        }

        var grossDriverIncome = isProductDelivery ? deliveryFee : subtotal;
        var driverDeduction = 0;
        if (isCOD) {
            driverDeduction = platformFee + commissionAmount;
        } else if (!isProductDelivery) {
            driverDeduction = commissionAmount;
        }

        return grossDriverIncome - driverDeduction;
    }

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayTs = today.getTime();
    var todayOrders = myOrders.filter(function (o) {
        var success = o.status === 'completed' || o.status === 'rated';
        if (!success) return false;
        var ts = Number(o.completedAt || o.createdAt || 0);
        return ts >= todayTs;
    });

    var earnings = myOrders.filter(function (o) { return o.status === 'completed' || o.status === 'rated'; })
        .reduce(function (sum, o) { return sum + getDriverNetIncome(o); }, 0);

    var ratedOrders = myOrders.filter(function (o) { return o.rating > 0; });
    var ratingAvg = ratedOrders.length > 0
        ? ratedOrders.reduce(function (sum, o) { return sum + o.rating; }, 0) / ratedOrders.length
        : 0;

    var statOrdersEl = document.getElementById('talentStatOrders');
    var statEarningEl = document.getElementById('talentStatEarning');
    var statRatingEl = document.getElementById('talentStatRating');
    if (statOrdersEl) statOrdersEl.textContent = todayOrders.length;
    if (statEarningEl) statEarningEl.textContent = 'Rp ' + earnings.toLocaleString('id-ID');
    if (statRatingEl) statRatingEl.textContent = ratingAvg > 0 ? ratingAvg.toFixed(1) : '0.0';
}

function checkNewPendingOrders(orders, session) {
    var pending = orders.filter(function (o) { return o.talentId === session.id && o.status === 'pending'; });
    var pendingIds = pending.map(function (o) { return o.id; });

    var newOrders = pending.filter(function (o) { return _talentLastPendingIds.indexOf(o.id) < 0; });

    // Show notification for new pending orders (even on first load)
    if (newOrders.length > 0) {
        showOrderNotification(newOrders[0]);
    }

    _talentLastPendingIds = pendingIds;
}

function showOrderNotification(order) {
    var popup = document.getElementById('orderNotifPopup');
    if (!popup) return;

    var users = getUsers();
    var user = users.find(function (u) { return u.id === order.userId; });
    var userName = user ? user.name : 'Pelanggan';
    var priceText = order.price ? 'Rp ' + Number(order.price).toLocaleString('id-ID') : '';

    document.getElementById('notifTitle').textContent = '🔔 Pesanan Baru!';
    document.getElementById('notifDesc').textContent = userName + ' memesan ' + (order.serviceType || 'layanan') + (priceText ? ' - ' + priceText : '');

    popup.classList.remove('hidden');

    var dismissBtn = document.getElementById('notifBtnDismiss');
    var acceptBtn = document.getElementById('notifBtnAccept');

    var newDismiss = dismissBtn.cloneNode(true);
    dismissBtn.parentNode.replaceChild(newDismiss, dismissBtn);
    newDismiss.addEventListener('click', function () { popup.classList.add('hidden'); });

    var newAccept = acceptBtn.cloneNode(true);
    acceptBtn.parentNode.replaceChild(newAccept, acceptBtn);
    newAccept.addEventListener('click', function () {
        popup.classList.add('hidden');
        openOrderTracking(order);
    });
}

function startTalentDashboardPolling() {
    if (_talentDashPollTimer) { clearInterval(_talentDashPollTimer); _talentDashPollTimer = null; }
    if (_fbTalentOrdersUnsub) { _fbTalentOrdersUnsub(); _fbTalentOrdersUnsub = null; }
    var session = getSession();
    if (!session) return;
    if (typeof FB !== 'undefined' && FB.isReady()) {
        _fbTalentOrdersUnsub = FB.onOrdersForUser(session.id, function (res) {
            var s = getSession();
            if (s && s.role === 'talent' && res.success && res.data) {
                renderTalentDashboardOrders(res.data, s);
                updateTalentStats(res.data, s);
                checkNewPendingOrders(res.data, s);
            }
        });
        // Also poll as backup - Supabase Realtime can miss filter changes
        _talentDashPollTimer = setInterval(function () {
            var s = getSession();
            if (s && s.role === 'talent') {
                loadTalentDashboardOrders();
            }
        }, 5000);
    } else {
        _talentDashPollTimer = setInterval(function () {
            var s = getSession();
            if (s && s.role === 'talent') {
                loadTalentDashboardOrders();
            } else {
                clearInterval(_talentDashPollTimer);
                _talentDashPollTimer = null;
            }
        }, 10000);
    }
}
