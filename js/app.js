/* ========================================
   JASA SURUH (JS) - App Init
   Wires up event listeners & bootstraps the app
   ======================================== */

function init() {
    initDB();
    handleSplash();
    registerSW();

    // Auth: OTP Login
    if (typeof LoginPage !== 'undefined') LoginPage.init();

    // Multi-step registration
    if (typeof RegisterPage !== 'undefined') RegisterPage.init();

    var createCSForm = document.getElementById('createCSForm');
    if (createCSForm) createCSForm.addEventListener('submit', handleCreateCS);

    var createAdminForm = document.getElementById('createAdminForm');
    if (createAdminForm) createAdminForm.addEventListener('submit', handleCreateAdmin);

    setupRoleSelector();
    setupTalentToggle();
    setupTalentSkills();
    setupUserSearch();
    setupUserNotifBtn();
    setupPromoSlider();
    setupServiceClicks();
    setupBottomNav();
    setupCSDashboard();
    setupProductPhotoUpload();
    setupProductFeePreview();
    setupStorePhotoUpload();

    // Penjual: store form
    var storeForm = document.getElementById('storeForm');
    if (storeForm) storeForm.addEventListener('submit', handleStoreFormSubmit);

    // Penjual: store toggle
    var storeToggle = document.getElementById('penjualStoreToggle');
    if (storeToggle) storeToggle.addEventListener('change', handlePenjualStoreToggle);

    // Penjual: notif button
    var penjualNotifBtn = document.getElementById('penjualNotifBtn');
    if (penjualNotifBtn) penjualNotifBtn.addEventListener('click', function () { openNotifPopup(); });

    // Penjual: add product button
    var btnAddProduct = document.getElementById('btnAddProduct');
    if (btnAddProduct) btnAddProduct.addEventListener('click', openAddProductModal);

    // Product modal close
    var btnCloseProduct = document.getElementById('btnCloseProductModal');
    if (btnCloseProduct) btnCloseProduct.addEventListener('click', function () {
        document.getElementById('addProductModal').classList.add('hidden');
    });
    var addProductModal = document.getElementById('addProductModal');
    if (addProductModal) addProductModal.addEventListener('click', function (e) {
        if (e.target === addProductModal) addProductModal.classList.add('hidden');
    });

    // Product form submit
    var addProductForm = document.getElementById('addProductForm');
    if (addProductForm) addProductForm.addEventListener('submit', handleProductFormSubmit);

    // Owner: commission form
    var commissionForm = document.getElementById('commissionForm');
    if (commissionForm) commissionForm.addEventListener('submit', handleCommissionFormSubmit);

    // Owner: transactions button
    var ownerBtnTransactions = document.getElementById('ownerBtnTransactions');
    if (ownerBtnTransactions) ownerBtnTransactions.addEventListener('click', openAdminTransactions);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
