/* ═══════════════════════════════════════════════════════════
   JASA SURUH — Staff Management System
   React + Supabase | Professional HR-style Dashboard
   Owner manages CS & Admin staff with multi-step form
   Login: Phone + OTP (no username/password)
   ═══════════════════════════════════════════════════════════ */
'use strict';

var StaffManagement = (function () {
    // ─── React Bindings ───
    var h = React.createElement;
    var html = htm.bind(h);
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;
    var useCallback = React.useCallback;
    var useMemo = React.useMemo;

    var _root = null;
    var _rootContainer = null;
    var _initialView = null;
    var _initialRole = null;
    var _initialEditId = null;
    var _mountOptions = {
        containerId: null,
        onClose: null
    };

    // ─── Config ───
    var MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    var COMPRESS_MAX_WIDTH = 1200;
    var COMPRESS_QUALITY = 0.8;

    // ═══════════════════════════════════
    // ═══ UTILITY FUNCTIONS ═══
    // ═══════════════════════════════════

    function formatPhone(phone) {
        if (!phone) return '-';
        var clean = phone.replace(/\D/g, '');
        // Convert 62xxx to 08xxx for display
        if (clean.startsWith('62')) clean = '0' + clean.slice(2);
        if (!clean.startsWith('0')) clean = '0' + clean;
        if (clean.length <= 4) return clean;
        if (clean.length <= 8) return clean.slice(0, 4) + '-' + clean.slice(4);
        return clean.slice(0, 4) + '-' + clean.slice(4, 8) + '-' + clean.slice(8);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        var d = new Date(dateStr);
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function formatDatetime(dateStr) {
        if (!dateStr) return '-';
        var d = new Date(dateStr);
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function validatePhone(phone) {
        var clean = phone.replace(/\D/g, '');
        // Indonesian phone: 08xxx or 628xxx, 10-15 digits
        return /^(08|628)\d{8,12}$/.test(clean);
    }

    // Normalize any phone format to 62xxx (no leading 0)
    function normalizePhone(phone) {
        var clean = (phone || '').replace(/\D/g, '');
        if (clean.startsWith('08')) clean = '62' + clean.slice(1);
        else if (clean.startsWith('8')) clean = '62' + clean;
        else if (!clean.startsWith('62')) clean = '62' + clean;
        return clean;
    }

    // Extract raw digits after country code (for input display)
    function phoneToRaw(phone) {
        var clean = (phone || '').replace(/\D/g, '');
        if (clean.startsWith('62')) return clean.slice(2);
        if (clean.startsWith('08')) return clean.slice(1);
        if (clean.startsWith('0')) return clean.slice(1);
        return clean;
    }

    function compressImage(file, maxWidth, quality) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onerror = function () { reject(new Error('Gagal membaca file')); };
            reader.onload = function (e) {
                var img = new Image();
                img.onerror = function () { reject(new Error('File bukan gambar valid')); };
                img.onload = function () {
                    var canvas = document.createElement('canvas');
                    var ratio = Math.min(maxWidth / img.width, 1);
                    canvas.width = Math.round(img.width * ratio);
                    canvas.height = Math.round(img.height * ratio);
                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob(function (blob) {
                        if (blob) resolve(blob);
                        else reject(new Error('Gagal compress gambar'));
                    }, 'image/jpeg', quality);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ═══════════════════════════════════
    // ═══ SERVICE LAYER ═══
    // ═══════════════════════════════════

    var StaffService = {
        getAll: function () {
            return FB.get('getAllStaff').then(function (r) { return r.json(); });
        },
        getById: function (id) {
            return FB.get('getStaffById', { id: id }).then(function (r) { return r.json(); });
        },
        create: function (data) {
            data.action = 'createStaff';
            return FB.post(data);
        },
        update: function (data) {
            data.action = 'updateStaff';
            return FB.post(data);
        },
        remove: function (id) {
            return FB.post({ action: 'deleteStaff', id: id });
        },
        uploadFile: function (path, file) {
            if (typeof FB.uploadStaffFile === 'function') {
                return FB.uploadStaffFile(path, file);
            }
            return Promise.reject(new Error('Upload tidak tersedia'));
        }
    };

    // Also register in users table for login compatibility
    function registerStaffInUsers(staffData) {
        var normalized = normalizePhone(staffData.no_hp);

        var userData = {
            action: 'register',
            id: staffData.id,
            name: staffData.nama,
            nama: staffData.nama,
            username: normalized,
            phone: normalized,
            no_hp: normalized,
            email: staffData.email || '',
            foto_url: staffData.foto_url || '',
            role: staffData.role,
            createdAt: Date.now()
        };
        return FB.post(userData);
    }

    // ═══════════════════════════════════
    // ═══ SHARED COMPONENTS ═══
    // ═══════════════════════════════════

    // — Toast —
    function Toast(props) {
        var msg = props.message, type = props.type, onClose = props.onClose;
        useEffect(function () {
            var t = setTimeout(onClose, 3000);
            return function () { clearTimeout(t); };
        }, []);
        var icons = { success: '✅', error: '❌', info: 'ℹ️' };
        return html`<div className="sf-toast sf-toast-${type}" onClick=${onClose}>
            <span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>
        </div>`;
    }

    // — Loading Spinner —
    function Spinner(props) {
        return html`<div className="sf-spinner-wrap">
            <div className="sf-spinner"></div>
            ${props.text && html`<p className="sf-spinner-text">${props.text}</p>`}
        </div>`;
    }

    // — Empty State —
    function EmptyState(props) {
        return html`<div className="sf-empty">
            <div className="sf-empty-icon">${props.icon || '📋'}</div>
            <h3>${props.title || 'Tidak ada data'}</h3>
            <p>${props.subtitle || ''}</p>
        </div>`;
    }

    // — Header Bar —
    function HeaderBar(props) {
        return html`<header className="sf-header">
            <button className="sf-header-back" onClick=${props.onBack}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <h2 className="sf-header-title">${props.title}</h2>
            ${props.action && html`<button className="sf-header-action" onClick=${props.onAction}>${props.action}</button>`}
        </header>`;
    }

    // ═══════════════════════════════════
    // ═══ STEP INDICATOR ═══
    // ═══════════════════════════════════

    var STEPS = [
        { num: 1, label: 'Data Dasar', icon: '👤' },
        { num: 2, label: 'Personal', icon: '📝' },
        { num: 3, label: 'Profesional', icon: '💼' },
        { num: 4, label: 'Dokumen', icon: '📄' },
        { num: 5, label: 'Review', icon: '✅' }
    ];

    function StepIndicator(props) {
        var current = props.current;
        return html`<div className="sf-stepper">
            ${STEPS.map(function (s) {
                var cls = 'sf-step';
                if (s.num < current) cls += ' sf-step-done';
                else if (s.num === current) cls += ' sf-step-active';
                return html`<div key=${s.num} className=${cls}>
                    <div className="sf-step-num">${s.num < current ? '✓' : s.num}</div>
                    <span className="sf-step-label">${s.label}</span>
                </div>`;
            })}
            <div className="sf-step-line" style=${{ width: ((current - 1) / (STEPS.length - 1) * 100) + '%' }}></div>
        </div>`;
    }

    // ═══════════════════════════════════
    // ═══ STEP 1: DATA DASAR ═══
    // ═══════════════════════════════════

    function StepBasic(props) {
        var data = props.data, onChange = props.onChange, errors = props.errors || {};
        return html`<div className="sf-step-content">
            <div className="sf-section-title">
                <span className="sf-section-icon">👤</span>
                <div>
                    <h3>Data Dasar</h3>
                    <p>Informasi identitas utama staff</p>
                </div>
            </div>

            <div className="sf-form-group">
                <label className="sf-label">Nama Lengkap <span className="sf-req">*</span></label>
                <input type="text" className="sf-input ${errors.nama ? 'sf-input-error' : ''}"
                    placeholder="Masukkan nama lengkap"
                    value=${data.nama || ''} 
                    onInput=${function (e) { onChange('nama', e.target.value); }} />
                ${errors.nama && html`<span className="sf-error">${errors.nama}</span>`}
            </div>

            <div className="sf-form-group">
                <label className="sf-label">Nomor HP (WhatsApp) <span className="sf-req">*</span></label>
                <div className="sf-input-prefix-wrap">
                    <span className="sf-input-prefix">+62</span>
                    <input type="tel" className="sf-input sf-input-with-prefix ${errors.no_hp ? 'sf-input-error' : ''}"
                        placeholder="8xxxxxxxxxx"
                        value=${data.no_hp || ''} 
                        onInput=${function (e) { 
                            var val = e.target.value.replace(/\D/g, '');
                            if (val.startsWith('62')) val = val.slice(2);
                            if (val.startsWith('0')) val = val.slice(1);
                            onChange('no_hp', val); 
                        }} />
                </div>
                ${errors.no_hp && html`<span className="sf-error">${errors.no_hp}</span>`}
                <span className="sf-hint">Nomor ini digunakan untuk login OTP</span>
            </div>

            <div className="sf-form-group">
                <label className="sf-label">Email</label>
                <input type="email" className="sf-input"
                    placeholder="email@contoh.com (opsional)"
                    value=${data.email || ''} 
                    onInput=${function (e) { onChange('email', e.target.value); }} />
            </div>

            <div className="sf-form-group">
                <label className="sf-label">Role Staff <span className="sf-req">*</span></label>
                <div className="sf-role-selector">
                    <button type="button" className="sf-role-btn ${data.role === 'cs' ? 'sf-role-active sf-role-cs' : ''}"
                        onClick=${function () { onChange('role', 'cs'); }}>
                        <span className="sf-role-icon">🎧</span>
                        <span className="sf-role-name">Customer Service</span>
                        <span className="sf-role-desc">Melayani pelanggan</span>
                    </button>
                    <button type="button" className="sf-role-btn ${data.role === 'admin' ? 'sf-role-active sf-role-admin' : ''}"
                        onClick=${function () { onChange('role', 'admin'); }}>
                        <span className="sf-role-icon">🔐</span>
                        <span className="sf-role-name">Admin</span>
                        <span className="sf-role-desc">Mengelola sistem</span>
                    </button>
                </div>
                ${errors.role && html`<span className="sf-error">${errors.role}</span>`}
            </div>
        </div>`;
    }

    // ═══════════════════════════════════
    // ═══ STEP 2: DATA PERSONAL ═══
    // ═══════════════════════════════════

    function StepPersonal(props) {
        var data = props.data, onChange = props.onChange;
        return html`<div className="sf-step-content">
            <div className="sf-section-title">
                <span className="sf-section-icon">📝</span>
                <div>
                    <h3>Data Personal</h3>
                    <p>Informasi pribadi karyawan</p>
                </div>
            </div>

            <div className="sf-form-group">
                <label className="sf-label">Jenis Kelamin</label>
                <div className="sf-radio-group">
                    <label className="sf-radio ${data.jenis_kelamin === 'Laki-laki' ? 'sf-radio-active' : ''}">
                        <input type="radio" name="gender" value="Laki-laki" checked=${data.jenis_kelamin === 'Laki-laki'}
                            onChange=${function () { onChange('jenis_kelamin', 'Laki-laki'); }} />
                        <span>👨 Laki-laki</span>
                    </label>
                    <label className="sf-radio ${data.jenis_kelamin === 'Perempuan' ? 'sf-radio-active' : ''}">
                        <input type="radio" name="gender" value="Perempuan" checked=${data.jenis_kelamin === 'Perempuan'}
                            onChange=${function () { onChange('jenis_kelamin', 'Perempuan'); }} />
                        <span>👩 Perempuan</span>
                    </label>
                </div>
            </div>

            <div className="sf-form-group">
                <label className="sf-label">Tanggal Lahir</label>
                <input type="date" className="sf-input"
                    value=${data.tanggal_lahir || ''}
                    onInput=${function (e) { onChange('tanggal_lahir', e.target.value); }} />
            </div>

            <div className="sf-form-group">
                <label className="sf-label">Alamat Lengkap</label>
                <textarea className="sf-textarea" rows="3"
                    placeholder="Jl. Contoh No. 123, RT/RW..."
                    value=${data.alamat || ''}
                    onInput=${function (e) { onChange('alamat', e.target.value); }}></textarea>
            </div>

            <div className="sf-form-group">
                <label className="sf-label">Kota / Domisili</label>
                <input type="text" className="sf-input"
                    placeholder="Contoh: Jakarta Selatan"
                    value=${data.kota || ''}
                    onInput=${function (e) { onChange('kota', e.target.value); }} />
            </div>
        </div>`;
    }

    // ═══════════════════════════════════
    // ═══ STEP 3: DATA PROFESIONAL ═══
    // ═══════════════════════════════════

    function StepProfessional(props) {
        var data = props.data, onChange = props.onChange;
        var eduOptions = ['SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2', 'S3', 'Lainnya'];
        return html`<div className="sf-step-content">
            <div className="sf-section-title">
                <span className="sf-section-icon">💼</span>
                <div>
                    <h3>Data Profesional</h3>
                    <p>Latar belakang pendidikan & keahlian</p>
                </div>
            </div>

            <div className="sf-form-group">
                <label className="sf-label">Pendidikan Terakhir</label>
                <div className="sf-chip-group">
                    ${eduOptions.map(function (opt) {
                        return html`<button key=${opt} type="button"
                            className="sf-chip ${data.pendidikan === opt ? 'sf-chip-active' : ''}"
                            onClick=${function () { onChange('pendidikan', opt); }}>${opt}</button>`;
                    })}
                </div>
            </div>

            <div className="sf-form-group">
                <label className="sf-label">Pengalaman Kerja</label>
                <textarea className="sf-textarea" rows="4"
                    placeholder="Ceritakan pengalaman kerja sebelumnya..."
                    value=${data.pengalaman || ''}
                    onInput=${function (e) { onChange('pengalaman', e.target.value); }}></textarea>
            </div>

            <div className="sf-form-group">
                <label className="sf-label">Keahlian</label>
                <textarea className="sf-textarea" rows="3"
                    placeholder="Contoh: Microsoft Office, Customer Handling, Social Media..."
                    value=${data.keahlian || ''}
                    onInput=${function (e) { onChange('keahlian', e.target.value); }}></textarea>
            </div>

            <div className="sf-form-group">
                <label className="sf-label">Catatan Tambahan</label>
                <textarea className="sf-textarea" rows="2"
                    placeholder="Info tambahan (opsional)"
                    value=${data.catatan || ''}
                    onInput=${function (e) { onChange('catatan', e.target.value); }}></textarea>
            </div>
        </div>`;
    }

    // ═══════════════════════════════════
    // ═══ STEP 4: FOTO & DOKUMEN ═══
    // ═══════════════════════════════════

    function StepDocuments(props) {
        var data = props.data, onChange = props.onChange, errors = props.errors || {};
        var compactLayout = !!props.compactLayout;
        var fotoRef = useRef(null);
        var ktpRef = useRef(null);
        var _s = useState(null), uploadProgress = _s[0], setUploadProgress = _s[1];

        function handleFileSelect(field, refEl) {
            var file = refEl.current && refEl.current.files[0];
            if (!file) return;
            if (file.size > MAX_FILE_SIZE) {
                onChange(field + '_error', 'Ukuran file max 5MB');
                return;
            }
            if (!file.type.startsWith('image/')) {
                onChange(field + '_error', 'File harus berupa gambar');
                return;
            }
            onChange(field + '_error', null);
            setUploadProgress(field);

            compressImage(file, COMPRESS_MAX_WIDTH, COMPRESS_QUALITY)
                .then(function (blob) {
                    // Create preview URL
                    var previewUrl = URL.createObjectURL(blob);
                    onChange(field + '_preview', previewUrl);
                    onChange(field + '_file', blob);
                    setUploadProgress(null);
                })
                .catch(function () {
                    onChange(field + '_error', 'Gagal memproses gambar');
                    setUploadProgress(null);
                });
        }

        function renderUploader(field, label, icon, ref) {
            var preview = data[field + '_preview'];
            var error = data[field + '_error'] || errors[field];
            var isUploading = uploadProgress === field;
            var emptyLabel = field === 'foto' ? 'Belum ada foto profil' : 'Belum ada foto KTP';

            return html`<div className="sf-upload-card ${compactLayout ? 'sf-upload-card-compact' : ''}">
                <div className="sf-upload-label">
                    <span>${icon}</span>
                    <div>
                        <h4>${label}</h4>
                        <p>JPG/PNG, max 5MB</p>
                    </div>
                </div>
                <input type="file" ref=${ref} accept="image/*" className="sf-file-input"
                    onChange=${function () { handleFileSelect(field, ref); }} />
                <div className="sf-upload-preview sf-upload-preview-frame ${compactLayout ? 'sf-upload-preview-compact' : ''} ${preview ? 'has-image' : ''}">
                    ${preview
                        ? html`<img src=${preview} alt=${label} />`
                        : html`<div className="sf-upload-empty">${emptyLabel}</div>`}

                    <div className="sf-upload-overlay">
                        <button type="button" className="sf-upload-inline-btn" onClick=${function () { ref.current && ref.current.click(); }}>
                            ${isUploading ? 'Memproses...' : (preview ? 'Ganti Foto' : 'Tambah Foto')}
                        </button>
                    </div>

                    ${preview && html`<button type="button" className="sf-upload-remove" onClick=${function () {
                        onChange(field + '_preview', null);
                        onChange(field + '_file', null);
                        onChange(field + '_url', null);
                        if (ref.current) ref.current.value = '';
                    }}>✕</button>`}
                </div>
                ${error && html`<span className="sf-error">${error}</span>`}
            </div>`;
        }

        return html`<div className="sf-step-content">
            <div className="sf-section-title">
                <span className="sf-section-icon">📄</span>
                <div>
                    <h3>Foto & Dokumen</h3>
                    <p>Upload foto profil dan identitas</p>
                </div>
            </div>

            <div className="sf-doc-grid ${compactLayout ? 'sf-doc-grid-compact' : ''}">
                ${renderUploader('foto', 'Foto Profil', '📸', fotoRef)}
                ${renderUploader('ktp', 'Foto KTP / Identitas', '🪪', ktpRef)}
            </div>
        </div>`;
    }

    // ═══════════════════════════════════
    // ═══ STEP 5: REVIEW ═══
    // ═══════════════════════════════════

    function StepReview(props) {
        var data = props.data, onEdit = props.onEdit;
        var roleLabel = data.role === 'admin' ? '🔐 Admin' : '🎧 Customer Service';
        var fullPhone = data.no_hp ? normalizePhone(data.no_hp) : '-';

        function Row(p) {
            return html`<div className="sf-review-row">
                <span className="sf-review-label">${p.label}</span>
                <span className="sf-review-value">${p.value || '-'}</span>
            </div>`;
        }

        return html`<div className="sf-step-content">
            <div className="sf-section-title">
                <span className="sf-section-icon">✅</span>
                <div>
                    <h3>Review Data</h3>
                    <p>Pastikan semua data sudah benar</p>
                </div>
            </div>

            <div className="sf-review-card">
                <div className="sf-review-head">
                    <h4>📋 Data Dasar</h4>
                    <button className="sf-review-edit" onClick=${function () { onEdit(1); }}>Edit</button>
                </div>
                <${Row} label="Nama" value=${data.nama} />
                <${Row} label="No HP" value=${formatPhone(fullPhone)} />
                <${Row} label="Email" value=${data.email} />
                <${Row} label="Role" value=${roleLabel} />
            </div>

            <div className="sf-review-card">
                <div className="sf-review-head">
                    <h4>📝 Data Personal</h4>
                    <button className="sf-review-edit" onClick=${function () { onEdit(2); }}>Edit</button>
                </div>
                <${Row} label="Jenis Kelamin" value=${data.jenis_kelamin} />
                <${Row} label="Tanggal Lahir" value=${formatDate(data.tanggal_lahir)} />
                <${Row} label="Alamat" value=${data.alamat} />
                <${Row} label="Kota" value=${data.kota} />
            </div>

            <div className="sf-review-card">
                <div className="sf-review-head">
                    <h4>💼 Data Profesional</h4>
                    <button className="sf-review-edit" onClick=${function () { onEdit(3); }}>Edit</button>
                </div>
                <${Row} label="Pendidikan" value=${data.pendidikan} />
                <${Row} label="Pengalaman" value=${data.pengalaman} />
                <${Row} label="Keahlian" value=${data.keahlian} />
                <${Row} label="Catatan" value=${data.catatan} />
            </div>

            <div className="sf-review-card">
                <div className="sf-review-head">
                    <h4>📄 Dokumen</h4>
                    <button className="sf-review-edit" onClick=${function () { onEdit(4); }}>Edit</button>
                </div>
                <div className="sf-review-photos">
                    ${data.foto_preview ? html`<div className="sf-review-thumb">
                        <img src=${data.foto_preview} alt="Foto" />
                        <span>Foto Profil</span>
                    </div>` : html`<span className="sf-review-no-photo">Foto belum diupload</span>`}
                    ${data.ktp_preview ? html`<div className="sf-review-thumb">
                        <img src=${data.ktp_preview} alt="KTP" />
                        <span>KTP</span>
                    </div>` : html`<span className="sf-review-no-photo">KTP belum diupload</span>`}
                </div>
            </div>
        </div>`;
    }

    // ═══════════════════════════════════
    // ═══ ADD STAFF WIZARD ═══
    // ═══════════════════════════════════

    function AddStaffWizard(props) {
        var onBack = props.onBack, onSuccess = props.onSuccess, presetRole = props.presetRole;
        var _s = useState(1), step = _s[0], setStep = _s[1];
        var _f = useState({ role: presetRole || '' }), formData = _f[0], setFormData = _f[1];
        var _e = useState({}), errors = _e[0], setErrors = _e[1];
        var _l = useState(false), loading = _l[0], setLoading = _l[1];
        var _t = useState(null), toast = _t[0], setToast = _t[1];

        function onChange(field, value) {
            setFormData(function (prev) {
                var next = Object.assign({}, prev);
                next[field] = value;
                return next;
            });
            // Clear error for this field
            setErrors(function (prev) {
                var next = Object.assign({}, prev);
                delete next[field];
                return next;
            });
        }

        function validateStep(num) {
            var errs = {};
            if (num === 1) {
                if (!formData.nama || formData.nama.trim().length < 2) errs.nama = 'Nama wajib diisi (min 2 karakter)';
                if (!formData.no_hp) errs.no_hp = 'Nomor HP wajib diisi';
                else if (!validatePhone('08' + formData.no_hp)) errs.no_hp = 'Format nomor HP tidak valid';
                if (!formData.role) errs.role = 'Pilih role staff';
            }
            setErrors(errs);
            return Object.keys(errs).length === 0;
        }

        function nextStep() {
            if (!validateStep(step)) return;
            setStep(Math.min(step + 1, 5));
        }

        function prevStep() {
            setStep(Math.max(step - 1, 1));
        }

        function goToStep(num) {
            setStep(num);
        }

        function handleSubmit() {
            if (loading) return;
            setLoading(true);

            var fullPhone = normalizePhone(formData.no_hp);
            var staffId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
            var uploadChain = Promise.resolve({ fotoUrl: null, ktpUrl: null });

            // Upload files if present
            if (formData.foto_file || formData.ktp_file) {
                uploadChain = Promise.all([
                    formData.foto_file
                        ? StaffService.uploadFile('avatars/' + staffId + '.jpg', formData.foto_file)
                            .then(function (r) { return r.success ? r.data : null; })
                            .catch(function () { return null; })
                        : Promise.resolve(null),
                    formData.ktp_file
                        ? StaffService.uploadFile('ktp/' + staffId + '.jpg', formData.ktp_file)
                            .then(function (r) { return r.success ? r.data : null; })
                            .catch(function () { return null; })
                        : Promise.resolve(null)
                ]).then(function (urls) {
                    return { fotoUrl: urls[0], ktpUrl: urls[1] };
                });
            }

            uploadChain.then(function (urls) {
                var staffData = {
                    id: staffId,
                    nama: formData.nama.trim(),
                    no_hp: fullPhone,
                    email: (formData.email || '').trim(),
                    role: formData.role,
                    foto_url: urls.fotoUrl,
                    ktp_url: urls.ktpUrl,
                    jenis_kelamin: formData.jenis_kelamin || null,
                    tanggal_lahir: formData.tanggal_lahir || null,
                    alamat: (formData.alamat || '').trim() || null,
                    kota: (formData.kota || '').trim() || null,
                    pendidikan: formData.pendidikan || null,
                    pengalaman: (formData.pengalaman || '').trim() || null,
                    keahlian: (formData.keahlian || '').trim() || null,
                    catatan: (formData.catatan || '').trim() || null
                };

                return StaffService.create(staffData).then(function (res) {
                    if (res && res.success) {
                        // Also register in users table for login
                        registerStaffInUsers(staffData);
                        return res;
                    }
                    throw new Error((res && res.message) || 'Gagal menyimpan data');
                });
            }).then(function () {
                setLoading(false);
                setToast({ message: 'Staff berhasil ditambahkan! 🎉', type: 'success' });
                setTimeout(function () { onSuccess && onSuccess(); }, 1500);
            }).catch(function (err) {
                setLoading(false);
                setToast({ message: err.message || 'Gagal menyimpan', type: 'error' });
            });
        }

        var stepContent = null;
        if (step === 1) stepContent = html`<${StepBasic} data=${formData} onChange=${onChange} errors=${errors} />`;
        else if (step === 2) stepContent = html`<${StepPersonal} data=${formData} onChange=${onChange} />`;
        else if (step === 3) stepContent = html`<${StepProfessional} data=${formData} onChange=${onChange} />`;
        else if (step === 4) stepContent = html`<${StepDocuments} data=${formData} onChange=${onChange} errors=${errors} />`;
        else if (step === 5) stepContent = html`<${StepReview} data=${formData} onEdit=${goToStep} />`;

        return html`<div className="sf-wizard">
            <${HeaderBar} title="Tambah Staff" onBack=${onBack} />
            <${StepIndicator} current=${step} />
            <div className="sf-wizard-body">
                ${stepContent}
            </div>
            <div className="sf-wizard-footer">
                ${step > 1 && html`<button className="sf-btn sf-btn-outline" onClick=${prevStep} disabled=${loading}>
                    ← Sebelumnya
                </button>`}
                ${step < 5 ? html`<button className="sf-btn sf-btn-primary" onClick=${nextStep}>
                    Selanjutnya →
                </button>` : html`<button className="sf-btn sf-btn-success" onClick=${handleSubmit} disabled=${loading}>
                    ${loading ? 'Menyimpan...' : '💾 Simpan Data'}
                </button>`}
            </div>
            ${toast && html`<${Toast} message=${toast.message} type=${toast.type} onClose=${function () { setToast(null); }} />`}
        </div>`;
    }

    // ═══════════════════════════════════
    // ═══ STAFF CARD ═══
    // ═══════════════════════════════════

    function StaffCard(props) {
        var staff = props.staff, onClick = props.onClick;
        var roleColor = staff.role === 'admin' ? '#EF4444' : '#8B5CF6';
        var roleLabel = staff.role === 'admin' ? 'Admin' : 'CS';
        var initial = (staff.nama || 'S').charAt(0).toUpperCase();
        var avatar = staff.foto_url
            ? html`<img src=${staff.foto_url} alt=${staff.nama} className="sf-card-avatar-img" />`
            : html`<span>${initial}</span>`;

        return html`<div className="sf-card" onClick=${function () { onClick(staff); }}>
            <div className="sf-card-avatar" style=${{ background: staff.foto_url ? 'transparent' : roleColor }}>
                ${avatar}
            </div>
            <div className="sf-card-info">
                <h4 className="sf-card-name">${escHtml(staff.nama)}</h4>
                <p className="sf-card-phone">${formatPhone(staff.no_hp)}</p>
            </div>
            <div className="sf-card-meta">
                <span className="sf-card-role" style=${{ color: roleColor, background: roleColor + '15' }}>${roleLabel}</span>
                ${staff.is_active === false && html`<span className="sf-card-inactive">Nonaktif</span>`}
            </div>
            <svg className="sf-card-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>`;
    }

    // ═══════════════════════════════════
    // ═══ STAFF LIST ═══
    // ═══════════════════════════════════

    function StaffList(props) {
        var onAdd = props.onAdd, onDetail = props.onDetail, onBack = props.onBack;
        var _s = useState([]), staffList = _s[0], setStaffList = _s[1];
        var _l = useState(true), loading = _l[0], setLoading = _l[1];
        var _q = useState(''), search = _q[0], setSearch = _q[1];
        var _f = useState('all'), filter = _f[0], setFilter = _f[1];

        useEffect(function () { loadData(); }, []);

        function loadData() {
            setLoading(true);
            StaffService.getAll().then(function (res) {
                if (res && res.success) setStaffList(res.data || []);
                setLoading(false);
            }).catch(function () { setLoading(false); });
        }

        var filtered = useMemo(function () {
            return staffList.filter(function (s) {
                if (filter !== 'all' && s.role !== filter) return false;
                if (search) {
                    var q = search.toLowerCase();
                    return (s.nama || '').toLowerCase().includes(q) ||
                           (s.no_hp || '').includes(q) ||
                           (s.kota || '').toLowerCase().includes(q);
                }
                return true;
            });
        }, [staffList, search, filter]);

        var adminCount = staffList.filter(function (s) { return s.role === 'admin'; }).length;
        var csCount = staffList.filter(function (s) { return s.role === 'cs'; }).length;

        return html`<div className="sf-list-page">
            <${HeaderBar} title="Kelola Staff" onBack=${onBack} action="+ Tambah" onAction=${onAdd} />

            <!-- Stats -->
            <div className="sf-stats-row">
                <div className="sf-stat-chip">
                    <span className="sf-stat-num">${staffList.length}</span>
                    <span>Total</span>
                </div>
                <div className="sf-stat-chip sf-stat-admin">
                    <span className="sf-stat-num">${adminCount}</span>
                    <span>Admin</span>
                </div>
                <div className="sf-stat-chip sf-stat-cs">
                    <span className="sf-stat-num">${csCount}</span>
                    <span>CS</span>
                </div>
            </div>

            <!-- Search -->
            <div className="sf-search-wrap">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                <input type="text" className="sf-search-input" placeholder="Cari nama, no HP, kota..."
                    value=${search} onInput=${function (e) { setSearch(e.target.value); }} />
                ${search && html`<button className="sf-search-clear" onClick=${function () { setSearch(''); }}>✕</button>`}
            </div>

            <!-- Filter tabs -->
            <div className="sf-filter-tabs">
                ${[['all', 'Semua'], ['admin', '🔐 Admin'], ['cs', '🎧 CS']].map(function (f) {
                    return html`<button key=${f[0]} className="sf-filter-tab ${filter === f[0] ? 'sf-filter-active' : ''}"
                        onClick=${function () { setFilter(f[0]); }}>${f[1]}</button>`;
                })}
            </div>

            <!-- List -->
            <div className="sf-card-list">
                ${loading ? html`<${Spinner} text="Memuat data staff..." />` :
                  filtered.length === 0 ? html`<${EmptyState} icon="👥" 
                    title=${search ? 'Tidak ditemukan' : 'Belum ada staff'}
                    subtitle=${search ? 'Coba kata kunci lain' : 'Tambahkan staff pertama Anda'} />` :
                  filtered.map(function (s) {
                      return html`<${StaffCard} key=${s.id} staff=${s} onClick=${onDetail} />`;
                  })
                }
            </div>
        </div>`;
    }

    // ═══════════════════════════════════
    // ═══ STAFF DETAIL MODAL ═══
    // ═══════════════════════════════════

    function StaffDetailModal(props) {
        var staffId = props.staffId, onClose = props.onClose, onEdit = props.onEdit, onDeleted = props.onDeleted;
        var _s = useState(null), staff = _s[0], setStaff = _s[1];
        var _l = useState(true), loading = _l[0], setLoading = _l[1];
        var _t = useState(null), toast = _t[0], setToast = _t[1];
        var _d = useState(false), deleting = _d[0], setDeleting = _d[1];

        useEffect(function () {
            StaffService.getById(staffId).then(function (res) {
                if (res && res.success) setStaff(res.data);
                setLoading(false);
            }).catch(function () { setLoading(false); });
        }, [staffId]);

        useEffect(function () {
            function onKeyDown(e) {
                if (e.key === 'Escape' && typeof onClose === 'function') onClose();
            }
            document.addEventListener('keydown', onKeyDown);
            return function () { document.removeEventListener('keydown', onKeyDown); };
        }, [onClose]);

        function handleDelete() {
            if (!staff) return;
            if (!confirm('Hapus staff ' + (staff.nama || '') + '? Data tidak bisa dikembalikan.')) return;
            setDeleting(true);
            StaffService.remove(staffId).then(function (res) {
                if (res && res.success) {
                    setToast({ message: 'Staff dihapus', type: 'success' });
                    setTimeout(function () {
                        if (onDeleted) onDeleted(staffId);
                        if (onClose) onClose();
                    }, 750);
                } else {
                    setToast({ message: 'Gagal menghapus', type: 'error' });
                    setDeleting(false);
                }
            }).catch(function () {
                setToast({ message: 'Gagal menghapus', type: 'error' });
                setDeleting(false);
            });
        }

        function handleToggleActive() {
            if (!staff) return;
            var newStatus = !staff.is_active;
            StaffService.update({ id: staffId, is_active: newStatus }).then(function (res) {
                if (res && res.success) {
                    setStaff(Object.assign({}, staff, { is_active: newStatus }));
                    setToast({ message: newStatus ? 'Staff diaktifkan' : 'Staff dinonaktifkan', type: 'success' });
                } else {
                    setToast({ message: 'Gagal mengubah status staff', type: 'error' });
                }
            }).catch(function () {
                setToast({ message: 'Gagal mengubah status staff', type: 'error' });
            });
        }

        var _ktpLb = useState(false), ktpLightbox = _ktpLb[0], setKtpLightbox = _ktpLb[1];

        var detailContent = null;
        if (loading) {
            detailContent = html`<${Spinner} text="Memuat detail staff..." />`;
        } else if (!staff) {
            detailContent = html`<${EmptyState} icon="❌" title="Staff tidak ditemukan" subtitle="Data staff tidak tersedia" />`;
        } else {
            var roleColor = staff.role === 'admin' ? '#EF4444' : '#8B5CF6';
            var roleLabel = staff.role === 'admin' ? '🔐 Admin' : '🎧 Customer Service';
            var roleIcon = staff.role === 'admin' ? '🔐' : '🎧';
            var initial = (staff.nama || 'S').charAt(0).toUpperCase();

            detailContent = html`<div className="sf-detail-modal-content sf-detail-v2">
                <!-- Hero Header -->
                <div className="sf-dm-hero">
                    <div className="sf-dm-hero-bg"></div>
                    <div className="sf-dm-hero-body">
                        <div className="sf-dm-avatar-ring" style=${{ '--ring-color': roleColor }}>
                            <div className="sf-dm-avatar" style=${{ background: staff.foto_url ? '#fff' : roleColor }}>
                                ${staff.foto_url
                                    ? html`<img src=${staff.foto_url} alt=${staff.nama} />`
                                    : html`<span>${initial}</span>`}
                            </div>
                            <span className="sf-dm-status-indicator" style=${{ background: staff.is_active !== false ? '#22C55E' : '#9CA3AF' }}></span>
                        </div>
                        <div className="sf-dm-hero-info">
                            <h2 className="sf-dm-name">${escHtml(staff.nama)}</h2>
                            <div className="sf-dm-badges">
                                <span className="sf-dm-role-badge" style=${{ color: roleColor, background: roleColor + '12', borderColor: roleColor + '30' }}>${roleLabel}</span>
                                <span className="sf-dm-active-badge" style=${{ background: staff.is_active !== false ? '#F0FDF4' : '#F9FAFB', color: staff.is_active !== false ? '#16A34A' : '#6B7280', borderColor: staff.is_active !== false ? '#BBF7D0' : '#E5E7EB' }}>
                                    ${staff.is_active !== false ? '● Aktif' : '○ Nonaktif'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="sf-dm-body">
                    <!-- Contact Card -->
                    <div className="sf-dm-section">
                        <div className="sf-dm-section-header">
                            <span className="sf-dm-section-icon">📱</span>
                            <h4>Kontak</h4>
                        </div>
                        <div className="sf-dm-grid">
                            <div className="sf-dm-field">
                                <span className="sf-dm-field-label">No HP</span>
                                <span className="sf-dm-field-value">${formatPhone(staff.no_hp)}</span>
                            </div>
                            <div className="sf-dm-field">
                                <span className="sf-dm-field-label">Email</span>
                                <span className="sf-dm-field-value">${staff.email || '-'}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Personal Card -->
                    <div className="sf-dm-section">
                        <div className="sf-dm-section-header">
                            <span className="sf-dm-section-icon">📝</span>
                            <h4>Data Personal</h4>
                        </div>
                        <div className="sf-dm-grid">
                            <div className="sf-dm-field">
                                <span className="sf-dm-field-label">Jenis Kelamin</span>
                                <span className="sf-dm-field-value">${staff.jenis_kelamin || '-'}</span>
                            </div>
                            <div className="sf-dm-field">
                                <span className="sf-dm-field-label">Tanggal Lahir</span>
                                <span className="sf-dm-field-value">${formatDate(staff.tanggal_lahir)}</span>
                            </div>
                            <div className="sf-dm-field sf-dm-field-full">
                                <span className="sf-dm-field-label">Alamat</span>
                                <span className="sf-dm-field-value">${staff.alamat || '-'}</span>
                            </div>
                            <div className="sf-dm-field">
                                <span className="sf-dm-field-label">Kota</span>
                                <span className="sf-dm-field-value">${staff.kota || '-'}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Professional Card -->
                    <div className="sf-dm-section">
                        <div className="sf-dm-section-header">
                            <span className="sf-dm-section-icon">💼</span>
                            <h4>Profesional</h4>
                        </div>
                        <div className="sf-dm-grid">
                            <div className="sf-dm-field">
                                <span className="sf-dm-field-label">Pendidikan</span>
                                <span className="sf-dm-field-value">${staff.pendidikan || '-'}</span>
                            </div>
                        </div>
                        ${staff.pengalaman && html`<div className="sf-dm-text-block">
                            <span className="sf-dm-field-label">Pengalaman</span>
                            <p>${staff.pengalaman}</p>
                        </div>`}
                        ${staff.keahlian && html`<div className="sf-dm-text-block">
                            <span className="sf-dm-field-label">Keahlian</span>
                            <p>${staff.keahlian}</p>
                        </div>`}
                        ${staff.catatan && html`<div className="sf-dm-text-block">
                            <span className="sf-dm-field-label">Catatan</span>
                            <p>${staff.catatan}</p>
                        </div>`}
                    </div>

                    <!-- KTP Document - Compact Thumbnail -->
                    ${staff.ktp_url && html`<div className="sf-dm-section">
                        <div className="sf-dm-section-header">
                            <span className="sf-dm-section-icon">🪪</span>
                            <h4>Dokumen KTP</h4>
                        </div>
                        <div className="sf-dm-ktp-row" onClick=${function () { setKtpLightbox(true); }}>
                            <div className="sf-dm-ktp-thumb">
                                <img src=${staff.ktp_url} alt="KTP" />
                            </div>
                            <div className="sf-dm-ktp-info">
                                <span className="sf-dm-ktp-name">Foto Identitas</span>
                                <span className="sf-dm-ktp-hint">Klik untuk memperbesar</span>
                            </div>
                            <svg className="sf-dm-ktp-expand" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                    </div>`}

                    <!-- Meta Info -->
                    <div className="sf-dm-section sf-dm-section-meta">
                        <div className="sf-dm-meta-row">
                            <span>Bergabung</span>
                            <span>${formatDatetime(staff.created_at)}</span>
                        </div>
                        <div className="sf-dm-meta-row">
                            <span>Staff ID</span>
                            <span className="sf-dm-meta-id">${staff.id}</span>
                        </div>
                    </div>
                </div>

                <!-- Actions -->
                <div className="sf-dm-actions">
                    <button className="sf-dm-action-btn sf-dm-btn-toggle" onClick=${handleToggleActive}>
                        <span>${staff.is_active !== false ? '⏸️' : '▶️'}</span>
                        ${staff.is_active !== false ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button className="sf-dm-action-btn sf-dm-btn-edit" onClick=${function () { if (onEdit) onEdit(staff); }}>
                        <span>✏️</span> Edit Data
                    </button>
                    <button className="sf-dm-action-btn sf-dm-btn-delete" onClick=${handleDelete} disabled=${deleting}>
                        <span>🗑️</span> ${deleting ? 'Menghapus...' : 'Hapus'}
                    </button>
                </div>
            </div>`;
        }

        return html`<div className="sf-detail-modal-backdrop" onClick=${function () { if (onClose) onClose(); }}>
            <div className="sf-detail-modal-card sf-dm-card-v2" role="dialog" aria-modal="true" aria-label="Detail Staff" onClick=${function (e) { e.stopPropagation(); }}>
                <div className="sf-dm-modal-header">
                    <div className="sf-dm-header-left">
                        <div className="sf-dm-header-dot"></div>
                        <span className="sf-dm-header-title">Detail Staff</span>
                    </div>
                    <button type="button" className="sf-dm-close-btn" onClick=${function () { if (onClose) onClose(); }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                    </button>
                </div>
                ${detailContent}
            </div>
            ${ktpLightbox && staff && staff.ktp_url && html`<div className="sf-dm-lightbox" onClick=${function () { setKtpLightbox(false); }}>
                <button className="sf-dm-lightbox-close" onClick=${function () { setKtpLightbox(false); }}>✕</button>
                <img src=${staff.ktp_url} alt="KTP" onClick=${function (e) { e.stopPropagation(); }} />
            </div>`}
            ${toast && html`<${Toast} message=${toast.message} type=${toast.type} onClose=${function () { setToast(null); }} />`}
        </div>`;
    }

    // ═══════════════════════════════════
    // ═══ EDIT STAFF ═══
    // ═══════════════════════════════════

    function EditStaff(props) {
        var staff = props.staff, onBack = props.onBack, onSuccess = props.onSuccess;
        var _f = useState(Object.assign({}, staff, {
            no_hp: phoneToRaw(staff.no_hp),
            foto_preview: staff.foto_url || null,
            ktp_preview: staff.ktp_url || null
        })), formData = _f[0], setFormData = _f[1];
        var _e = useState({}), errors = _e[0], setErrors = _e[1];
        var _l = useState(false), loading = _l[0], setLoading = _l[1];
        var _t = useState(null), toast = _t[0], setToast = _t[1];

        function onChange(field, value) {
            setFormData(function (prev) {
                var next = Object.assign({}, prev);
                next[field] = value;
                return next;
            });
            setErrors(function (prev) {
                var next = Object.assign({}, prev);
                delete next[field];
                return next;
            });
        }

        function validateForm() {
            var errs = {};
            if (!formData.nama || formData.nama.trim().length < 2) errs.nama = 'Nama wajib diisi';
            if (!formData.no_hp) errs.no_hp = 'Nomor HP wajib diisi';
            else if (!validatePhone('08' + formData.no_hp)) errs.no_hp = 'Format tidak valid';
            if (!formData.role) errs.role = 'Pilih role';
            setErrors(errs);
            return Object.keys(errs).length === 0;
        }

        function handleSave() {
            if (!validateForm()) return;
            if (loading) return;
            setLoading(true);

            var fullPhone = normalizePhone(formData.no_hp);
            var uploadChain = Promise.resolve({ fotoUrl: formData.foto_url, ktpUrl: formData.ktp_url });

            if (formData.foto_file || formData.ktp_file) {
                uploadChain = Promise.all([
                    formData.foto_file
                        ? StaffService.uploadFile('avatars/' + staff.id + '.jpg', formData.foto_file)
                            .then(function (r) { return r.success ? r.data : formData.foto_url; })
                            .catch(function () { return formData.foto_url; })
                        : Promise.resolve(formData.foto_url),
                    formData.ktp_file
                        ? StaffService.uploadFile('ktp/' + staff.id + '.jpg', formData.ktp_file)
                            .then(function (r) { return r.success ? r.data : formData.ktp_url; })
                            .catch(function () { return formData.ktp_url; })
                        : Promise.resolve(formData.ktp_url)
                ]).then(function (urls) { return { fotoUrl: urls[0], ktpUrl: urls[1] }; });
            }

            uploadChain.then(function (urls) {
                return StaffService.update({
                    id: staff.id,
                    nama: formData.nama.trim(),
                    no_hp: fullPhone,
                    email: (formData.email || '').trim(),
                    role: formData.role,
                    foto_url: urls.fotoUrl,
                    ktp_url: urls.ktpUrl,
                    jenis_kelamin: formData.jenis_kelamin || null,
                    tanggal_lahir: formData.tanggal_lahir || null,
                    alamat: (formData.alamat || '').trim() || null,
                    kota: (formData.kota || '').trim() || null,
                    pendidikan: formData.pendidikan || null,
                    pengalaman: (formData.pengalaman || '').trim() || null,
                    keahlian: (formData.keahlian || '').trim() || null,
                    catatan: (formData.catatan || '').trim() || null
                }).then(function (res) {
                    return { res: res, urls: urls };
                });
            }).then(function (result) {
                setLoading(false);
                var res = result.res;
                var urls = result.urls;
                if (res && res.success) {
                    // Sync users table too (phone, foto, nama, role)
                    registerStaffInUsers({
                        id: staff.id,
                        nama: formData.nama.trim(),
                        no_hp: fullPhone,
                        email: (formData.email || '').trim(),
                        foto_url: urls.fotoUrl || '',
                        role: formData.role
                    });
                    setToast({ message: 'Data berhasil diupdate! ✅', type: 'success' });
                    setTimeout(function () { onSuccess && onSuccess(); }, 1200);
                } else {
                    setToast({ message: (res && res.message) || 'Gagal menyimpan', type: 'error' });
                }
            }).catch(function (err) {
                setLoading(false);
                setToast({ message: err.message || 'Gagal menyimpan', type: 'error' });
            });
        }

        return html`<div className="sf-edit-page sf-edit-page-unified">
            <${HeaderBar} title="Edit Staff" onBack=${onBack} />

            <div className="sf-wizard-body sf-edit-body-unified">
                <div className="sf-edit-intro">
                    <h3>Edit Data Staff</h3>
                    <p>Semua data tersedia dalam satu form agar proses update lebih cepat.</p>
                </div>

                <${StepBasic} data=${formData} onChange=${onChange} errors=${errors} />
                <${StepPersonal} data=${formData} onChange=${onChange} />
                <${StepProfessional} data=${formData} onChange=${onChange} />
                <${StepDocuments} data=${formData} onChange=${onChange} errors=${errors} compactLayout=${true} />
            </div>

            <div className="sf-wizard-footer">
                <button className="sf-btn sf-btn-primary sf-btn-full" onClick=${handleSave} disabled=${loading}>
                    ${loading ? 'Menyimpan...' : '💾 Simpan Perubahan'}
                </button>
            </div>
            ${toast && html`<${Toast} message=${toast.message} type=${toast.type} onClose=${function () { setToast(null); }} />`}
        </div>`;
    }

    // ═══════════════════════════════════
    // ═══ MAIN APP ═══
    // ═══════════════════════════════════

    function StaffApp() {
        var _v = useState(_initialView || 'list'), view = _v[0], setView = _v[1];
        var _r = useState(_initialRole || ''), presetRole = _r[0], setPresetRole = _r[1];
        var _d = useState(null), selectedStaff = _d[0], setSelectedStaff = _d[1];
        var _e = useState(null), editStaff = _e[0], setEditStaff = _e[1];
        var _k = useState(0), listRefreshKey = _k[0], setListRefreshKey = _k[1];

        // Reset initial params after first render
        useEffect(function () {
            _initialView = null;
            _initialRole = null;
            _initialEditId = null;
        }, []);

        function refreshList() {
            setListRefreshKey(function (prev) { return prev + 1; });
        }

        function goList(refreshAfterOpen) {
            setView('list');
            setSelectedStaff(null);
            setEditStaff(null);
            if (refreshAfterOpen) refreshList();
        }

        function goAdd(role) {
            setPresetRole(role || '');
            setSelectedStaff(null);
            setEditStaff(null);
            setView('add');
        }

        function openDetail(staff) {
            setSelectedStaff(staff || null);
        }

        function closeDetail() {
            setSelectedStaff(null);
        }

        function goEdit(staff) {
            setSelectedStaff(null);
            setEditStaff(staff);
            setView('edit');
        }

        function handleClose() {
            if (_mountOptions && typeof _mountOptions.onClose === 'function') {
                _mountOptions.onClose();
                return;
            }
            var page = document.getElementById('staffManagementPage');
            if (page) page.classList.add('hidden');
        }

        if (view === 'add') {
            return html`<${AddStaffWizard} presetRole=${presetRole} onBack=${function () { goList(false); }} onSuccess=${function () { goList(true); }} />`;
        }
        if (view === 'edit' && editStaff) {
            return html`<${EditStaff} staff=${editStaff} onBack=${function () { goList(false); }} onSuccess=${function () { goList(true); }} />`;
        }

        return html`<div className="sf-list-stack">
            <${StaffList} key=${'staff-list-' + listRefreshKey} onAdd=${function () { goAdd(); }} onDetail=${openDetail} onBack=${handleClose} />
            ${selectedStaff && selectedStaff.id && html`<${StaffDetailModal}
                staffId=${selectedStaff.id}
                onClose=${closeDetail}
                onEdit=${goEdit}
                onDeleted=${function () { closeDetail(); refreshList(); }}
            />`}
        </div>`;
    }

    // ═══════════════════════════════════
    // ═══ MOUNT / PUBLIC API ═══
    // ═══════════════════════════════════

    function mount(container, initialView, initialRole, options) {
        if (!container) return;
        _initialView = initialView || 'list';
        _initialRole = initialRole || '';
        _mountOptions = Object.assign({ containerId: null, onClose: null }, options || {});

        if (_root && _rootContainer && _rootContainer !== container) {
            _root.unmount();
            _root = null;
            _rootContainer = null;
        }

        if (!_root) {
            _root = ReactDOM.createRoot(container);
            _rootContainer = container;
        }
        _root.render(html`<${StaffApp} key=${Date.now()} />`);
    }

    function unmount() {
        if (_root) {
            _root.unmount();
            _root = null;
            _rootContainer = null;
        }
    }

    return { mount: mount, unmount: unmount };
})();

// ─── Global Bridge Functions ───
function openStaffManagement(view, role, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var requestedContainer = opts.containerId ? document.getElementById(opts.containerId) : null;
    var legacyPage = document.getElementById('staffManagementPage');
    var legacyContainer = document.getElementById('staffAppRoot');
    var panelContainer = document.getElementById('ownerStaffPanelHost');
    var container = requestedContainer || legacyContainer || panelContainer;

    if (!container) return;

    if (container === legacyContainer && legacyPage) {
        legacyPage.classList.remove('hidden');
    }

    StaffManagement.mount(container, view || 'list', role || '', opts);
}
window.openStaffManagement = openStaffManagement;
