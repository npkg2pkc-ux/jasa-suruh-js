/* ========================================
   JASA SURUH - Account Page (Gojek Style)
   Modern settings with Supabase integration
   ======================================== */
'use strict';

var AccountPage = (function () {
    var _initialized = false;
    var _supabaseUser = null; // data from users table

    var ROLE_LABELS = {
        user: 'Pengguna',
        pengguna: 'Pengguna',
        talent: 'Talent',
        penjual: 'Penjual',
        cs: 'CS',
        owner: 'Owner'
    };

    // ─── DOM Cache ───
    function $(id) { return document.getElementById(id); }

    // ─── Open Page ───
    function open() {
        var page = $('settingsPage');
        if (!page) return;
        page.classList.remove('hidden');

        // Show skeleton, hide content
        var skeleton = $('accSkeleton');
        var content = $('accContent');
        if (skeleton) skeleton.classList.remove('hidden');
        if (content) content.classList.add('hidden');

        _loadData().then(function () {
            if (skeleton) skeleton.classList.add('hidden');
            if (content) content.classList.remove('hidden');
        }).catch(function () {
            // Fallback to local session data
            _renderFromSession();
            if (skeleton) skeleton.classList.add('hidden');
            if (content) content.classList.remove('hidden');
        });

        if (!_initialized) _setupEvents();
    }

    // ─── Load from Supabase ───
    function _loadData() {
        var session = getSession();
        if (!session) return Promise.reject('No session');

        var sb = _getSb();
        if (!sb) {
            _renderFromSession();
            return Promise.resolve();
        }

        return sb.from('users')
            .select('id, nama, no_hp, email, foto_url, role')
            .eq('id', session.id)
            .single()
            .then(function (result) {
                if (result.error || !result.data) {
                    _renderFromSession();
                    return;
                }
                _supabaseUser = result.data;
                _render(_supabaseUser);
            });
    }

    // ─── Get Supabase client ───
    function _getSb() {
        if (typeof window.FB !== 'undefined' && window.FB._sb) return window.FB._sb;
        return null;
    }

    // ─── Render from Supabase data ───
    function _render(u) {
        var session = getSession();
        var rawRole = u.role || (session && session.role) || 'user';
        var role = rawRole === 'seller' ? 'penjual' : rawRole;

        _toggleStoreItem(role);

        $('accProfileName').textContent = u.nama || '-';
        $('accValName').textContent = u.nama || '-';
        $('accValPhone').textContent = _formatPhoneDisplay(u.no_hp) || '-';
        $('accValEmail').textContent = u.email || 'Belum diisi';
        $('accProfilePhone').textContent = _formatPhoneDisplay(u.no_hp) || '';

        var badge = $('accRoleBadge');
        if (badge) {
            badge.textContent = ROLE_LABELS[role] || role;
            badge.className = 'acc-role-badge role-' + role;
        }

        _loadAvatar(u.foto_url, session ? session.id : null);
    }

    // ─── Render from local session (fallback) ───
    function _renderFromSession() {
        var session = getSession();
        if (!session) return;

        var rawRole = session.role || 'user';
        var role = rawRole === 'seller' ? 'penjual' : rawRole;
        _toggleStoreItem(role);
        $('accProfileName').textContent = session.name || session.nama || '-';
        $('accValName').textContent = session.name || session.nama || '-';
        $('accValPhone').textContent = session.phone || session.no_hp || '-';
        $('accValEmail').textContent = session.email || 'Belum diisi';
        $('accProfilePhone').textContent = session.phone || session.no_hp || '';

        var badge = $('accRoleBadge');
        if (badge) {
            badge.textContent = ROLE_LABELS[role] || role;
            badge.className = 'acc-role-badge role-' + role;
        }

        _loadAvatar(session.foto_url, session.id);
    }

    // ─── Load Avatar ───
    function _loadAvatar(fotoUrl, userId) {
        var img = $('accAvatarImg');
        var fallback = $('accAvatarFallback');

        // Try Supabase Storage first
        if (fotoUrl) {
            var sb = _getSb();
            var publicUrl = fotoUrl;
            if (sb && !fotoUrl.startsWith('http') && !fotoUrl.startsWith('data:')) {
                var res = sb.storage.from('avatars').getPublicUrl(fotoUrl);
                if (res && res.data) publicUrl = res.data.publicUrl;
            }
            img.src = publicUrl;
            img.style.display = 'block';
            if (fallback) fallback.style.display = 'none';
            img.onerror = function () {
                _tryLocalPhoto(userId, img, fallback);
            };
            return;
        }

        // Try localStorage
        _tryLocalPhoto(userId, img, fallback);
    }

    function _tryLocalPhoto(userId, img, fallback) {
        var localPhoto = userId ? getProfilePhoto(userId) : '';
        if (localPhoto) {
            img.src = localPhoto;
            img.style.display = 'block';
            if (fallback) fallback.style.display = 'none';
        } else {
            img.style.display = 'none';
            if (fallback) fallback.style.display = '';
        }
    }

    // ─── Format phone display ───
    function _formatPhoneDisplay(phone) {
        if (!phone) return '';
        var cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('62')) cleaned = '0' + cleaned.slice(2);
        // Format: 0812-3456-7890
        if (cleaned.length >= 11) {
            return cleaned.slice(0, 4) + '-' + cleaned.slice(4, 8) + '-' + cleaned.slice(8);
        }
        return cleaned;
    }

    function _toggleStoreItem(role) {
        var storeItem = $('accItemStore');
        if (!storeItem) return;
        if (role === 'penjual' || role === 'seller') storeItem.classList.remove('hidden');
        else storeItem.classList.add('hidden');
    }

    // ─── Setup Events (once) ───
    function _setupEvents() {
        _initialized = true;

        // Back button
        $('settingsBtnBack').addEventListener('click', function () {
            $('settingsPage').classList.add('hidden');
            if (typeof resetBottomNavToHome === 'function') resetBottomNavToHome();
        });

        // Logout button → show confirmation
        $('settingsBtnLogout').addEventListener('click', function () {
            $('accLogoutConfirm').classList.remove('hidden');
        });

        // Logout confirm modal
        $('accLogoutOverlay').addEventListener('click', _closeLogoutModal);
        $('accLogoutCancelBtn').addEventListener('click', _closeLogoutModal);
        $('accLogoutConfirmBtn').addEventListener('click', function () {
            _closeLogoutModal();
            $('settingsPage').classList.add('hidden');
            if (typeof handleLogout === 'function') handleLogout();
        });

        // Photo edit
        $('accBtnEditPhoto').addEventListener('click', function () {
            $('accPhotoInput').click();
        });

        $('accPhotoInput').addEventListener('change', function () {
            var file = this.files[0];
            if (!file) return;
            this.value = '';
            _showPhotoPreview(file);
        });

        // Photo preview modal
        $('accPhotoOverlay').addEventListener('click', _closePhotoModal);
        $('accPhotoCancelBtn').addEventListener('click', _closePhotoModal);
        $('accPhotoConfirmBtn').addEventListener('click', function () {
            _uploadPhoto();
        });

        // Edit items
        $('accItemName').addEventListener('click', function () {
            _openEditModal('nama', 'Nama Lengkap', $('accValName').textContent);
        });
        $('accItemPhone').addEventListener('click', function () {
            _openEditModal('no_hp', 'Nomor HP', $('accValPhone').textContent.replace(/-/g, ''));
        });
        $('accItemEmail').addEventListener('click', function () {
            var val = $('accValEmail').textContent;
            _openEditModal('email', 'Email', val === 'Belum diisi' ? '' : val);
        });

        // Edit modal
        $('accModalOverlay').addEventListener('click', _closeEditModal);
        $('accModalCancel').addEventListener('click', _closeEditModal);
        $('accModalSave').addEventListener('click', _saveEdit);
        $('accModalInput').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') _saveEdit();
        });

        // PIN (placeholder)
        $('accItemPin').addEventListener('click', function () {
            if (typeof showToast === 'function') showToast('Fitur Ubah PIN segera hadir', 'info');
        });

        var storeItem = $('accItemStore');
        if (storeItem) {
            storeItem.addEventListener('click', function () {
                if (typeof openSellerStoreModal === 'function') {
                    openSellerStoreModal();
                } else if (typeof showToast === 'function') {
                    showToast('Menu Toko belum tersedia', 'error');
                }
            });
        }
    }

    // ─── Edit Modal ───
    var _editField = '';

    function _openEditModal(field, title, currentValue) {
        _editField = field;
        $('accModalTitle').textContent = 'Edit ' + title;
        var input = $('accModalInput');
        input.value = currentValue === '-' ? '' : currentValue;
        input.placeholder = title;
        if (field === 'no_hp') input.type = 'tel';
        else if (field === 'email') input.type = 'email';
        else input.type = 'text';

        $('accModalError').classList.add('hidden');
        $('accEditModal').classList.remove('hidden');
        setTimeout(function () { input.focus(); }, 100);
    }

    function _closeEditModal() {
        $('accEditModal').classList.add('hidden');
    }

    function _saveEdit() {
        var input = $('accModalInput');
        var val = input.value.trim();
        var error = $('accModalError');

        // Validate
        if (_editField === 'nama' && val.length < 2) {
            error.textContent = 'Nama minimal 2 karakter';
            error.classList.remove('hidden');
            return;
        }
        if (_editField === 'no_hp' && !/^0\d{9,12}$/.test(val)) {
            error.textContent = 'Nomor HP tidak valid (contoh: 08123456789)';
            error.classList.remove('hidden');
            return;
        }
        if (_editField === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
            error.textContent = 'Format email tidak valid';
            error.classList.remove('hidden');
            return;
        }

        var saveBtn = $('accModalSave');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Menyimpan...';

        var updateData = {};
        updateData[_editField] = val || null;

        // Format phone for storage
        if (_editField === 'no_hp' && val) {
            var cleaned = val.replace(/\D/g, '');
            if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
            updateData.no_hp = cleaned;
        }

        var session = getSession();
        var sb = _getSb();

        if (sb && session && session.id) {
            sb.from('users').update(updateData).eq('id', session.id)
                .then(function (result) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Simpan';
                    if (result.error) {
                        error.textContent = 'Gagal menyimpan: ' + result.error.message;
                        error.classList.remove('hidden');
                        return;
                    }
                    _onEditSuccess(val);
                });
        } else {
            // Offline / no Supabase — save to local session
            saveBtn.disabled = false;
            saveBtn.textContent = 'Simpan';
            _onEditSuccess(val);
        }
    }

    function _onEditSuccess(val) {
        _closeEditModal();

        // Update local session
        var session = getSession();
        if (session) {
            if (_editField === 'nama') {
                session.name = val;
                session.nama = val;
            } else if (_editField === 'no_hp') {
                session.phone = val;
                session.no_hp = val;
            } else if (_editField === 'email') {
                session.email = val;
            }
            setSession(session);
        }

        // Update UI
        if (_editField === 'nama') {
            $('accProfileName').textContent = val || '-';
            $('accValName').textContent = val || '-';
        } else if (_editField === 'no_hp') {
            $('accValPhone').textContent = _formatPhoneDisplay(val) || '-';
            $('accProfilePhone').textContent = _formatPhoneDisplay(val) || '';
        } else if (_editField === 'email') {
            $('accValEmail').textContent = val || 'Belum diisi';
        }

        if (typeof showToast === 'function') showToast('Berhasil diperbarui', 'success');
    }

    // ─── Photo Preview & Upload ───
    var _pendingPhotoFile = null;

    function _showPhotoPreview(file) {
        _pendingPhotoFile = file;
        var reader = new FileReader();
        reader.onload = function () {
            $('accPhotoPreviewImg').src = reader.result;
            $('accPhotoPreview').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    function _closePhotoModal() {
        $('accPhotoPreview').classList.add('hidden');
        _pendingPhotoFile = null;
    }

    function _uploadPhoto() {
        if (!_pendingPhotoFile) return;

        var confirmBtn = $('accPhotoConfirmBtn');
        var confirmText = $('accPhotoConfirmText');
        var spinner = $('accPhotoSpinner');
        confirmBtn.disabled = true;
        confirmText.textContent = 'Mengupload...';
        spinner.classList.remove('hidden');

        var session = getSession();
        var sb = _getSb();
        var file = _pendingPhotoFile;

        // Compress first
        var reader = new FileReader();
        reader.onload = function () {
            _compressImage(reader.result, 400, 0.7, function (compressedDataUrl) {
                // Convert data URL to blob
                var blob = _dataUrlToBlob(compressedDataUrl);
                var ext = file.name.split('.').pop() || 'jpg';
                var path = session.id + '.' + ext;

                if (sb) {
                    sb.storage.from('avatars').upload(path, blob, {
                        cacheControl: '3600',
                        upsert: true
                    }).then(function (result) {
                        if (result.error) {
                            // Fallback: save locally
                            _savePhotoLocally(compressedDataUrl, session);
                            _finishPhotoUpload();
                            return;
                        }
                        // Update foto_url in database
                        return sb.from('users').update({ foto_url: path }).eq('id', session.id)
                            .then(function () {
                                // Also save locally for fast access
                                if (typeof saveProfilePhoto === 'function') {
                                    saveProfilePhoto(session.id, compressedDataUrl);
                                }
                                _finishPhotoUpload();
                                // Update avatar display
                                var urlRes = sb.storage.from('avatars').getPublicUrl(path);
                                var avatarImg = $('accAvatarImg');
                                var avatarFallback = $('accAvatarFallback');
                                avatarImg.src = urlRes.data.publicUrl + '?t=' + Date.now();
                                avatarImg.style.display = 'block';
                                if (avatarFallback) avatarFallback.style.display = 'none';
                            });
                    }).catch(function () {
                        _savePhotoLocally(compressedDataUrl, session);
                        _finishPhotoUpload();
                    });
                } else {
                    _savePhotoLocally(compressedDataUrl, session);
                    _finishPhotoUpload();
                }
            });
        };
        reader.readAsDataURL(file);
    }

    function _savePhotoLocally(dataUrl, session) {
        if (typeof saveProfilePhoto === 'function') {
            saveProfilePhoto(session.id, dataUrl);
        }
        var avatarImg = $('accAvatarImg');
        var avatarFallback = $('accAvatarFallback');
        avatarImg.src = dataUrl;
        avatarImg.style.display = 'block';
        if (avatarFallback) avatarFallback.style.display = 'none';
    }

    function _finishPhotoUpload() {
        $('accPhotoConfirmBtn').disabled = false;
        $('accPhotoConfirmText').textContent = 'Upload';
        $('accPhotoSpinner').classList.add('hidden');
        _closePhotoModal();
        if (typeof showToast === 'function') showToast('Foto profil diperbarui', 'success');
    }

    // ─── Image Compress ───
    function _compressImage(dataUrl, maxDim, quality, callback) {
        var img = new Image();
        img.onload = function () {
            var canvas = document.createElement('canvas');
            var w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
                var ratio = Math.min(maxDim / w, maxDim / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            callback(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = dataUrl;
    }

    function _dataUrlToBlob(dataUrl) {
        var parts = dataUrl.split(',');
        var mime = parts[0].match(/:(.*?);/)[1];
        var bstr = atob(parts[1]);
        var n = bstr.length;
        var u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new Blob([u8arr], { type: mime });
    }

    // ─── Logout Modal ───
    function _closeLogoutModal() {
        $('accLogoutConfirm').classList.add('hidden');
    }

    return { open: open };
})();

window.AccountPage = AccountPage;
