// กำหนด Google Apps Script Web App URL ที่นี่
const API_URL = "https://script.google.com/macros/s/AKfycbyLvnvU-sPSgyB233m5Ssl6lku3aKhjtptIM56Lrfvy4NP4wlFCvdpfrG2eUcAMzPYY/exec";

// App State
let appState = {
  apiUrl: API_URL,
  editor: '',
  products: [],
  suppliers: [],
  auditLogs: [],
  currentProductEdit: null, // SKU if editing
  currentSupplierEdit: null, // SupplierID if editing
  productsCurrentPage: 1,
  productsPerPage: 10,
  productsFilteredList: null,
  suppliersCurrentPage: 1,
  suppliersPerPage: 10,
  suppliersFilteredList: null,
  auditLogsCurrentPage: 1,
  auditLogsPerPage: 10,
  auditLogsFilteredList: null,
  printSelections: [],
  printProductFilteredList: null,
  printProductCurrentPage: 1,
  printProductPerPage: 10,
  printSupplierSelections: [],
  printSupplierFilteredList: null,
  goodsIssueBasket: []
};

// Document Ready
document.addEventListener('DOMContentLoaded', () => {
  // โหลดชื่อผู้แก้ไขล่าสุดจาก LocalStorage (เพื่อความสะดวกไม่ต้องพิมพ์ใหม่ทุกครั้ง)
  appState.editor = localStorage.getItem('inv_editor') || 'สมศรี (ผู้แก้ไข)';
  
  switchTab('products');
  toggleMailingAddressSync(); // กำหนดสถานะซิงค์ที่อยู่จัดส่ง
  
  // ตรวจสอบว่าได้กำหนดค่า API_URL เรียบร้อยแล้วหรือไม่
  const isApiConfigured = API_URL && API_URL !== "YOUR_GOOGLE_APPS_SCRIPT_URL_HERE" && API_URL.trim() !== "";
  
  if (!isApiConfigured) {
    showApiWarning(true);
    Swal.fire({
      title: 'ยังไม่ได้เชื่อมต่อ Google Sheets API',
      html: 'กรุณาเปิดไฟล์โค้ด <code class="bg-slate-100 px-1 py-0.5 rounded text-red-600 font-mono text-sm">js/app.js</code> แล้วใส่ URL ของ Google Apps Script ที่ตัวแปร <code class="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-mono text-sm">API_URL</code> บรรทัดแรกสุด เพื่อเปิดใช้งานการเชื่อมต่อคลังสินค้าจริง',
      icon: 'info',
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#3b82f6'
    });
    
    // แสดงข้อความแนะนำในตารางข้อมูล
    const emptyRowHtml = `<tr><td colspan="11" class="text-center py-8 text-slate-400 text-xs">กรุณาตั้งค่า API_URL ในไฟล์ js/app.js เพื่อเริ่มระบบคลังสินค้า</td></tr>`;
    document.getElementById('product-table-body').innerHTML = emptyRowHtml;
    document.getElementById('supplier-table-body').innerHTML = emptyRowHtml;
    document.getElementById('logs-table-body').innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400 text-xs">กรุณาตั้งค่า API_URL ในไฟล์ js/app.js เพื่อเริ่มระบบคลังสินค้า</td></tr>`;
  } else {
    showApiWarning(false);
    appState.apiUrl = API_URL;
    fetchDataAll();
  }
});

function showApiWarning(show) {
  const banner = document.getElementById('api-alert-banner');
  if (!banner) return;
  if (show) {
    banner.classList.remove('hidden');
    banner.classList.add('flex');
  } else {
    banner.classList.add('hidden');
    banner.classList.remove('flex');
  }
}

// API Fetch Functions
async function fetchDataAll() {
  if (!appState.apiUrl) return;
  showLoadingAll(true);
  try {
    const productsRes = await fetch(`${appState.apiUrl}?action=get_products`);
    const productsData = await productsRes.json();
    if (productsData.status === 'success') appState.products = productsData.data;

    const suppliersRes = await fetch(`${appState.apiUrl}?action=get_suppliers`);
    const suppliersData = await suppliersRes.json();
    if (suppliersData.status === 'success') appState.suppliers = suppliersData.data;

    const logsRes = await fetch(`${appState.apiUrl}?action=get_audit_logs`);
    const logsData = await logsRes.json();
    if (logsData.status === 'success') appState.auditLogs = logsData.data;

    populateSupplierDropdowns();
    populateGoodsIssueSuppliers();
    renderProducts();
    renderSuppliers();
    renderLogs();
  } catch (error) {
    console.error('Error fetching data:', error);
    Swal.fire({
      title: 'การเชื่อมต่อผิดพลาด',
      text: 'ไม่สามารถดึงข้อมูลจาก Google Sheets ได้ กรุณาตรวจสอบการตั้งค่า API_URL ในโค้ด และสิทธิ์การเข้าใช้งาน Web App ใน Google Apps Script',
      icon: 'error',
      confirmButtonText: 'รับทราบ',
      confirmButtonColor: '#ef4444'
    });
  } finally {
    showLoadingAll(false);
  }
}

async function fetchAuditLogs() {
  if (!appState.apiUrl) return;
  
  document.getElementById('logs-table-body').innerHTML = `
    <tr>
      <td colspan="10" class="text-center py-8 text-slate-400">กำลังโหลดประวัติใหม่...</td>
    </tr>
  `;
  
  try {
    const logsRes = await fetch(`${appState.apiUrl}?action=get_audit_logs`);
    const logsData = await logsRes.json();
    if (logsData.status === 'success') {
      appState.auditLogs = logsData.data;
      renderLogs();
    }
  } catch (error) {
    console.error(error);
    Swal.fire({
      title: 'เกิดข้อผิดพลาด',
      text: 'ไม่สามารถดึงข้อมูลประวัติการทำรายการจาก Google Sheets ได้',
      icon: 'error',
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#ef4444'
    });
  }
}

function showLoadingAll(isLoading) {
  const loadingHtml = `
    <tr>
      <td colspan="10" class="text-center py-8 text-slate-400 text-xs">
        <i class="fa-solid fa-spinner animate-spin mr-2"></i> กำลังดึงข้อมูลจากระบบ...
      </td>
    </tr>
  `;
  if (isLoading) {
    document.getElementById('product-table-body').innerHTML = loadingHtml;
    document.getElementById('supplier-table-body').innerHTML = loadingHtml;
    document.getElementById('logs-table-body').innerHTML = loadingHtml;
  }
}

// Dismiss mobile offcanvas programmatically
function dismissOffcanvas() {
  const offcanvasEl = document.getElementById('topNavbarMenu');
  if (offcanvasEl) {
    const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
    if (bsOffcanvas) {
      bsOffcanvas.hide();
    }
  }
}

// Tab Switcher
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab-btn').forEach(el => {
    el.classList.remove('active-tab');
    el.classList.add('text-slate-300');
  });

  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add('active');
  
  const targetBtn = document.getElementById(`tab-btn-${tabId}`);
  if (targetBtn) {
    targetBtn.classList.add('active-tab');
    targetBtn.classList.remove('text-slate-300');
  }

  const titles = {
    'products': 'จัดการสินค้า (Products)',
    'suppliers': 'จัดการคู่ค้า (Suppliers)',
    'goods-issue': 'เบิกสินค้า (Goods Issue)',
    'audit-logs': 'ประวัติการทำงาน (Audit Log)'
  };
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) pageTitle.innerText = titles[tabId];
}

// Helper format functions
function formatDate(isoString) {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('th-TH');
  } catch {
    return isoString;
  }
}

// Address Synchronization for Supplier Form
function toggleMailingAddressSync() {
  const sameAddress = document.getElementById('supplier-same-address').checked;
  const mailingGroup = document.getElementById('mailing-address-group');
  const mailingInput = document.getElementById('supplier-mailing-address');
  
  if (sameAddress) {
    mailingGroup.classList.add('hidden');
    mailingInput.required = false;
    syncMailingAddress();
  } else {
    mailingGroup.classList.remove('hidden');
    mailingInput.required = true;
    mailingInput.value = '';
  }
}

function syncMailingAddress() {
  const sameAddress = document.getElementById('supplier-same-address').checked;
  if (sameAddress) {
    const regAddress = document.getElementById('supplier-registered-address').value;
    document.getElementById('supplier-mailing-address').value = regAddress;
  }
}

// Rendering Lists
function renderProducts(filteredList = null) {
  if (filteredList !== null) {
    appState.productsFilteredList = filteredList;
    appState.productsCurrentPage = 1;
  } else {
    const queryInput = document.getElementById('search-products');
    const query = queryInput ? queryInput.value.trim() : '';
    if (!query) {
      appState.productsFilteredList = null;
    }
  }

  const list = appState.productsFilteredList || appState.products;
  const tbody = document.getElementById('product-table-body');
  
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center py-8 text-slate-400 text-xs">ไม่พบข้อมูลสินค้า</td></tr>`;
    const info = document.getElementById('product-pagination-info');
    const listContainer = document.getElementById('product-pagination-list');
    if (info) info.innerText = 'แสดงข้อมูล 0 - 0 จากทั้งหมด 0 รายการ';
    if (listContainer) listContainer.innerHTML = '';
    return;
  }
  
  const totalItems = list.length;
  const totalPages = Math.ceil(totalItems / appState.productsPerPage);
  
  if (appState.productsCurrentPage > totalPages) {
    appState.productsCurrentPage = totalPages;
  }
  if (appState.productsCurrentPage < 1) {
    appState.productsCurrentPage = 1;
  }

  const startIdx = (appState.productsCurrentPage - 1) * appState.productsPerPage;
  const endIdx = Math.min(startIdx + appState.productsPerPage, totalItems);
  const pageList = list.slice(startIdx, endIdx);

  tbody.innerHTML = pageList.map(item => `
    <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
      <td class="py-3 px-4 font-mono text-xs font-semibold text-blue-600">${item.SKU}</td>
      <td class="py-3 px-4 font-mono text-xs text-slate-700">${item.Barcode || '-'}</td>
      <td class="py-3 px-4 text-xs text-slate-500 font-mono">${item.Zone || '-'}</td>
      <td class="py-3 px-4 font-medium text-slate-800">${item.Name}</td>
      <td class="py-3 px-4 text-xs text-slate-500">${item.Category}</td>
      <td class="py-3 px-4 text-xs text-slate-600">${item.UOM}</td>
      <td class="py-3 px-4 text-xs text-slate-600 text-wrap" style="max-width: 150px;">${item.Description || '-'}</td>
      <td class="py-3 px-4 text-end font-semibold text-blue-800">${new Number(item.Quantity).toLocaleString('th-TH')}</td>
      <td class="py-3 px-4 text-xs text-slate-500 font-mono">${item.SupplierID || '-'}</td>
      <td class="py-3 px-4 text-xs text-slate-500">${formatDate(item.DateAdded)}</td>
      <td class="py-3 px-4 text-center">
        <div class="d-flex align-items-center justify-content-center gap-1.5">
          <button onclick="startEditProduct('${item.SKU}')" class="p-1 px-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-xs transition-all font-medium border-0">
            <i class="fa-solid fa-pen"></i> แก้ไข
          </button>
          <button onclick="deleteProduct('${item.SKU}')" class="p-1 px-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded text-xs transition-all font-medium border-0">
            <i class="fa-solid fa-trash"></i> ลบ
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  renderProductPagination(totalItems, totalPages);
}

function renderProductPagination(totalItems, totalPages) {
  const info = document.getElementById('product-pagination-info');
  const listContainer = document.getElementById('product-pagination-list');
  if (!info || !listContainer) return;

  const start = (appState.productsCurrentPage - 1) * appState.productsPerPage + 1;
  const end = Math.min(start + appState.productsPerPage - 1, totalItems);
  
  info.innerText = `แสดงข้อมูล ${start} - ${end} จากทั้งหมด ${totalItems} รายการ`;

  let paginationHtml = '';
  
  const prevDisabled = appState.productsCurrentPage === 1 ? 'disabled' : '';
  paginationHtml += `
    <li class="page-item ${prevDisabled}">
      <button class="page-link" onclick="changeProductPage(${appState.productsCurrentPage - 1})" aria-label="Previous">
        <span aria-hidden="true">&laquo;</span>
      </button>
    </li>
  `;

  let startPage = Math.max(1, appState.productsCurrentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  if (startPage > 1) {
    paginationHtml += `
      <li class="page-item">
        <button class="page-link" onclick="changeProductPage(1)">1</button>
      </li>
    `;
    if (startPage > 2) {
      paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    const activeClass = i === appState.productsCurrentPage ? 'active' : '';
    paginationHtml += `
      <li class="page-item ${activeClass}">
        <button class="page-link" onclick="changeProductPage(${i})">${i}</button>
      </li>
    `;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
    paginationHtml += `
      <li class="page-item">
        <button class="page-link" onclick="changeProductPage(${totalPages})">${totalPages}</button>
      </li>
    `;
  }

  const nextDisabled = appState.productsCurrentPage === totalPages ? 'disabled' : '';
  paginationHtml += `
    <li class="page-item ${nextDisabled}">
      <button class="page-link" onclick="changeProductPage(${appState.productsCurrentPage + 1})" aria-label="Next">
        <span aria-hidden="true">&raquo;</span>
      </button>
    </li>
  `;

  listContainer.innerHTML = paginationHtml;
}

function changeProductPage(pageNum) {
  appState.productsCurrentPage = pageNum;
  renderProducts();
}

function populateSupplierDropdowns() {
  const addSelect = document.getElementById('product-supplier-id');
  const editSelect = document.getElementById('edit-product-supplier-id');
  if (!addSelect || !editSelect) return;

  const defaultOption = '<option value="">-- ไม่ระบุคู่ค้า --</option>';
  const options = appState.suppliers.map(s => `<option value="${s.SupplierID}">${s.SupplierID} - ${s.CompanyName}</option>`).join('');
  
  addSelect.innerHTML = defaultOption + options;
  editSelect.innerHTML = defaultOption + options;
}

function renderSuppliers(filteredList = null) {
  if (filteredList !== null) {
    appState.suppliersFilteredList = filteredList;
    appState.suppliersCurrentPage = 1;
  } else {
    const queryInput = document.getElementById('search-suppliers');
    const query = queryInput ? queryInput.value.trim() : '';
    if (!query) {
      appState.suppliersFilteredList = null;
    }
  }

  const list = appState.suppliersFilteredList || appState.suppliers;
  const tbody = document.getElementById('supplier-table-body');
  
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400 text-xs">ไม่พบข้อมูลคู่ค้า</td></tr>`;
    const info = document.getElementById('supplier-pagination-info');
    const listContainer = document.getElementById('supplier-pagination-list');
    if (info) info.innerText = 'แสดงข้อมูล 0 - 0 จากทั้งหมด 0 รายการ';
    if (listContainer) listContainer.innerHTML = '';
    return;
  }
  
  const totalItems = list.length;
  const totalPages = Math.ceil(totalItems / appState.suppliersPerPage);
  
  if (appState.suppliersCurrentPage > totalPages) {
    appState.suppliersCurrentPage = totalPages;
  }
  if (appState.suppliersCurrentPage < 1) {
    appState.suppliersCurrentPage = 1;
  }

  const startIdx = (appState.suppliersCurrentPage - 1) * appState.suppliersPerPage;
  const endIdx = Math.min(startIdx + appState.suppliersPerPage, totalItems);
  const pageList = list.slice(startIdx, endIdx);

  tbody.innerHTML = pageList.map(item => `
    <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
      <td class="py-3 px-4 font-mono text-xs font-semibold text-blue-600">${item.SupplierID}</td>
      <td class="py-3 px-4 font-medium text-slate-800">${item.CompanyName}</td>
      <td class="py-3 px-4 font-mono text-xs text-slate-600">${item.TaxID}</td>
      <td class="py-3 px-4 text-xs text-slate-600">${item.ContactPerson || '-'}</td>
      <td class="py-3 px-4 text-xs text-slate-600">${item.Phone}</td>
      <td class="py-3 px-4 text-xs text-slate-600">${item.Email || '-'}</td>
      <td class="py-3 px-4 text-xs text-slate-600 text-wrap" style="max-width: 200px; min-width: 150px;">${item.RegisteredAddress || '-'}</td>
      <td class="py-3 px-4 text-xs text-slate-600 text-wrap" style="max-width: 200px; min-width: 150px;">${item.MailingAddress || '-'}</td>
      <td class="py-3 px-4 text-xs text-slate-600">${item.Creator || '-'}</td>
      <td class="py-3 px-4 text-center">
        <div class="d-flex align-items-center justify-content-center gap-1.5">
          <button onclick="startEditSupplier('${item.SupplierID}')" class="p-1 px-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-xs transition-all font-medium border-0">
            <i class="fa-solid fa-pen"></i> แก้ไข
          </button>
          <button onclick="deleteSupplier('${item.SupplierID}')" class="p-1 px-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded text-xs transition-all font-medium border-0">
            <i class="fa-solid fa-trash"></i> ลบ
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  renderSupplierPagination(totalItems, totalPages);
}

function renderSupplierPagination(totalItems, totalPages) {
  const info = document.getElementById('supplier-pagination-info');
  const listContainer = document.getElementById('supplier-pagination-list');
  if (!info || !listContainer) return;

  const start = (appState.suppliersCurrentPage - 1) * appState.suppliersPerPage + 1;
  const end = Math.min(start + appState.suppliersPerPage - 1, totalItems);
  
  info.innerText = `แสดงข้อมูล ${start} - ${end} จากทั้งหมด ${totalItems} รายการ`;

  let paginationHtml = '';
  
  const prevDisabled = appState.suppliersCurrentPage === 1 ? 'disabled' : '';
  paginationHtml += `
    <li class="page-item ${prevDisabled}">
      <button class="page-link" onclick="changeSupplierPage(${appState.suppliersCurrentPage - 1})" aria-label="Previous">
        <span aria-hidden="true">&laquo;</span>
      </button>
    </li>
  `;

  let startPage = Math.max(1, appState.suppliersCurrentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  if (startPage > 1) {
    paginationHtml += `
      <li class="page-item">
        <button class="page-link" onclick="changeSupplierPage(1)">1</button>
      </li>
    `;
    if (startPage > 2) {
      paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    const activeClass = i === appState.suppliersCurrentPage ? 'active' : '';
    paginationHtml += `
      <li class="page-item ${activeClass}">
        <button class="page-link" onclick="changeSupplierPage(${i})">${i}</button>
      </li>
    `;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
    paginationHtml += `
      <li class="page-item">
        <button class="page-link" onclick="changeSupplierPage(${totalPages})">${totalPages}</button>
      </li>
    `;
  }

  const nextDisabled = appState.suppliersCurrentPage === totalPages ? 'disabled' : '';
  paginationHtml += `
    <li class="page-item ${nextDisabled}">
      <button class="page-link" onclick="changeSupplierPage(${appState.suppliersCurrentPage + 1})" aria-label="Next">
        <span aria-hidden="true">&raquo;</span>
      </button>
    </li>
  `;

  listContainer.innerHTML = paginationHtml;
}

function changeSupplierPage(pageNum) {
  appState.suppliersCurrentPage = pageNum;
  renderSuppliers();
}

function renderLogs(filteredList = null) {
  if (filteredList !== null) {
    appState.auditLogsFilteredList = filteredList;
    appState.auditLogsCurrentPage = 1;
  } else {
    const queryInput = document.getElementById('search-logs');
    const query = queryInput ? queryInput.value.trim() : '';
    if (!query) {
      appState.auditLogsFilteredList = null;
    }
  }

  const list = appState.auditLogsFilteredList || appState.auditLogs;
  const tbody = document.getElementById('logs-table-body');
  
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400 text-xs">ไม่พบประวัติการทำรายการ</td></tr>`;
    const info = document.getElementById('logs-pagination-info');
    const listContainer = document.getElementById('logs-pagination-list');
    if (info) info.innerText = 'แสดงข้อมูล 0 - 0 จากทั้งหมด 0 รายการ';
    if (listContainer) listContainer.innerHTML = '';
    return;
  }
  
  const sorted = [...list].sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
  
  const totalItems = sorted.length;
  const totalPages = Math.ceil(totalItems / appState.auditLogsPerPage);
  
  if (appState.auditLogsCurrentPage > totalPages) {
    appState.auditLogsCurrentPage = totalPages;
  }
  if (appState.auditLogsCurrentPage < 1) {
    appState.auditLogsCurrentPage = 1;
  }

  const startIdx = (appState.auditLogsCurrentPage - 1) * appState.auditLogsPerPage;
  const endIdx = Math.min(startIdx + appState.auditLogsPerPage, totalItems);
  const pageList = sorted.slice(startIdx, endIdx);
  
  tbody.innerHTML = pageList.map(item => {
    let badgeClass = 'bg-slate-100 text-slate-700';
    if (item.ActionType === 'ADD') badgeClass = 'bg-emerald-100 text-emerald-800';
    else if (item.ActionType === 'EDIT') badgeClass = 'bg-blue-100 text-blue-800';
    else if (item.ActionType === 'DELETE') badgeClass = 'bg-red-100 text-red-800';
    
    return `
      <tr class="hover:bg-slate-50 border-b border-slate-100">
        <td class="py-2.5 px-4 text-slate-500 whitespace-nowrap">${formatDate(item.Timestamp)}</td>
        <td class="py-2.5 px-4 text-center">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}">${item.ActionType}</span>
        </td>
        <td class="py-2.5 px-4 font-semibold text-slate-700">${item.RecordType}</td>
        <td class="py-2.5 px-4 font-mono font-semibold text-blue-600">${item.PrimaryKey}</td>
        <td class="py-2.5 px-4 font-mono text-slate-500">${item.SupplierID || '-'}</td>
        <td class="py-2.5 px-4">${item.Details || '-'}</td>
        <td class="py-2.5 px-4 text-slate-600">${item.Creator || '-'}</td>
        <td class="py-2.5 px-4 text-slate-600">${item.Editor || '-'}</td>
        <td class="py-2.5 px-4 text-slate-600">${item.Preparer || '-'}</td>
        <td class="py-2.5 px-4 font-medium text-amber-800">${item.Reason || '-'}</td>
      </tr>
    `;
  }).join('');

  renderLogsPagination(totalItems, totalPages);
}

function renderLogsPagination(totalItems, totalPages) {
  const info = document.getElementById('logs-pagination-info');
  const listContainer = document.getElementById('logs-pagination-list');
  if (!info || !listContainer) return;

  const start = (appState.auditLogsCurrentPage - 1) * appState.auditLogsPerPage + 1;
  const end = Math.min(start + appState.auditLogsPerPage - 1, totalItems);
  
  info.innerText = `แสดงข้อมูล ${start} - ${end} จากทั้งหมด ${totalItems} รายการ`;

  let paginationHtml = '';
  
  const prevDisabled = appState.auditLogsCurrentPage === 1 ? 'disabled' : '';
  paginationHtml += `
    <li class="page-item ${prevDisabled}">
      <button class="page-link" onclick="changeLogsPage(${appState.auditLogsCurrentPage - 1})" aria-label="Previous">
        <span aria-hidden="true">&laquo;</span>
      </button>
    </li>
  `;

  let startPage = Math.max(1, appState.auditLogsCurrentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  if (startPage > 1) {
    paginationHtml += `
      <li class="page-item">
        <button class="page-link" onclick="changeLogsPage(1)">1</button>
      </li>
    `;
    if (startPage > 2) {
      paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    const activeClass = i === appState.auditLogsCurrentPage ? 'active' : '';
    paginationHtml += `
      <li class="page-item ${activeClass}">
        <button class="page-link" onclick="changeLogsPage(${i})">${i}</button>
      </li>
    `;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
    paginationHtml += `
      <li class="page-item">
        <button class="page-link" onclick="changeLogsPage(${totalPages})">${totalPages}</button>
      </li>
    `;
  }

  const nextDisabled = appState.auditLogsCurrentPage === totalPages ? 'disabled' : '';
  paginationHtml += `
    <li class="page-item ${nextDisabled}">
      <button class="page-link" onclick="changeLogsPage(${appState.auditLogsCurrentPage + 1})" aria-label="Next">
        <span aria-hidden="true">&raquo;</span>
      </button>
    </li>
  `;

  listContainer.innerHTML = paginationHtml;
}

function changeLogsPage(pageNum) {
  appState.auditLogsCurrentPage = pageNum;
  renderLogs();
}

// Filters
function filterProducts() {
  const queryInput = document.getElementById('search-products');
  const query = queryInput ? queryInput.value.toLowerCase().trim() : '';
  if (!query) {
    renderProducts(null);
    return;
  }
  const filtered = appState.products.filter(p => {
    const sku = String(p.SKU || '').toLowerCase();
    const name = String(p.Name || '').toLowerCase();
    const cat = String(p.Category || '').toLowerCase();
    const barcode = String(p.Barcode || '').toLowerCase();
    const zone = String(p.Zone || '').toLowerCase();
    const supplier = String(p.SupplierID || '').toLowerCase();
    return sku.includes(query) || name.includes(query) || cat.includes(query) || barcode.includes(query) || zone.includes(query) || supplier.includes(query);
  });
  renderProducts(filtered);
}

function filterSuppliers() {
  const queryInput = document.getElementById('search-suppliers');
  const query = queryInput ? queryInput.value.toLowerCase().trim() : '';
  if (!query) {
    renderSuppliers(null);
    return;
  }
  const filtered = appState.suppliers.filter(s => {
    const id = String(s.SupplierID || '').toLowerCase();
    const name = String(s.CompanyName || '').toLowerCase();
    const tax = String(s.TaxID || '').toLowerCase();
    const contact = String(s.ContactPerson || '').toLowerCase();
    return id.includes(query) || name.includes(query) || tax.includes(query) || contact.includes(query);
  });
  renderSuppliers(filtered);
}

function filterLogs() {
  const queryInput = document.getElementById('search-logs');
  const query = queryInput ? queryInput.value.toLowerCase().trim() : '';
  if (!query) {
    renderLogs(null);
    return;
  }
  const filtered = appState.auditLogs.filter(l => {
    const key = String(l.PrimaryKey || '').toLowerCase();
    const supplier = String(l.SupplierID || '').toLowerCase();
    const creator = String(l.Creator || '').toLowerCase();
    return key.includes(query) || supplier.includes(query) || creator.includes(query);
  });
  renderLogs(filtered);
}

// POST Helper Wrapper
async function callPostAPI(data) {
  const isApiConfigured = appState.apiUrl && appState.apiUrl !== "YOUR_GOOGLE_APPS_SCRIPT_URL_HERE" && appState.apiUrl.trim() !== "";
  if (!isApiConfigured) {
    Swal.fire({
      title: 'ยังไม่ได้เชื่อมต่อ API',
      text: 'กรุณากำหนดค่าตัวแปร API_URL ในไฟล์ js/app.js ก่อนส่งข้อมูลไปยัง Google Sheets',
      icon: 'warning',
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#f59e0b'
    });
    return { status: 'error' };
  }
  
  Swal.fire({
    title: 'กำลังทำรายการ...',
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });
  
  try {
    const response = await fetch(appState.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    if (!result || result.status !== 'success') {
      throw new Error(result.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลไปยัง Google Sheets');
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    await fetchDataAll();
    
    Swal.fire({
      title: 'ทำรายการสำเร็จ!',
      text: 'บันทึกข้อมูลเรียบร้อยแล้วและซิงค์ข้อมูลจริงกับ Google Sheets แล้ว',
      icon: 'success',
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#3b82f6'
    });
    return { status: 'success' };
  } catch (error) {
    console.error(error);
    Swal.fire({
      title: 'เกิดข้อผิดพลาด',
      text: error.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้',
      icon: 'error',
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#ef4444'
    });
    return { status: 'error', message: error.message };
  }
}

// Product CRUD Submits
async function saveProduct(event) {
  event.preventDefault();
  
  const sku = document.getElementById('product-sku').value.trim();
  const barcode = document.getElementById('product-barcode').value.trim();
  const name = document.getElementById('product-name').value.trim();
  const category = document.getElementById('product-category').value.trim();
  const uom = document.getElementById('product-uom').value.trim();
  const quantity = document.getElementById('product-quantity').value;
  const supplierId = document.getElementById('product-supplier-id').value.trim();
  const zone = document.getElementById('product-zone').value.trim();
  const description = document.getElementById('product-description').value.trim();
  const creator = document.getElementById('product-creator').value.trim();
  const preparer = document.getElementById('product-preparer').value.trim();
  
  // Creator Field strictly required validation
  if (!creator || creator.trim() === '') {
    Swal.fire('การกรอกข้อมูลไม่ครบถ้วน', 'ช่องผู้เพิ่ม/ผู้บันทึกข้อมูล (Creator) จำเป็นต้องระบุตัวตนก่อนทำรายการ!', 'warning');
    return;
  }
  
  if (!sku || !barcode || !name || !category || !uom || !quantity || !zone || !preparer) {
    Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'warning');
    return;
  }

  const payload = {
    action: 'add_product',
    sku,
    barcode,
    name,
    category,
    uom,
    quantity,
    supplierId,
    zone,
    description,
    creator,
    editor: '',
    preparer
  };

  try {
    const res = await callPostAPI(payload);
    if (res && res.status === 'success') {
      document.getElementById('product-form').reset();
    }
  } catch (error) {
    console.error(error);
  }
}

function startEditProduct(sku) {
  dismissOffcanvas();
  const product = appState.products.find(p => p.SKU === sku);
  if (!product) return;

  appState.currentProductEdit = sku;
  
  document.getElementById('edit-product-sku').value = product.SKU;
  document.getElementById('edit-product-barcode').value = product.Barcode || '';
  document.getElementById('edit-product-name').value = product.Name;
  document.getElementById('edit-product-category').value = product.Category;
  document.getElementById('edit-product-uom').value = product.UOM;
  document.getElementById('edit-product-quantity').value = product.Quantity;
  document.getElementById('edit-product-supplier-id').value = product.SupplierID || '';
  document.getElementById('edit-product-zone').value = product.Zone || '';
  document.getElementById('edit-product-description').value = product.Description || '';
  
  document.getElementById('edit-product-user-editor').value = appState.editor;
  document.getElementById('edit-product-reason').value = '';

  const modal = document.getElementById('edit-product-modal');
  modal.classList.remove('hidden');
}

function closeEditProductModal() {
  appState.currentProductEdit = null;
  document.getElementById('edit-product-form').reset();
  document.getElementById('edit-product-modal').classList.add('hidden');
}

async function submitEditProduct(event) {
  event.preventDefault();
  
  const sku = document.getElementById('edit-product-sku').value;
  const barcode = document.getElementById('edit-product-barcode').value.trim();
  const name = document.getElementById('edit-product-name').value.trim();
  const category = document.getElementById('edit-product-category').value.trim();
  const uom = document.getElementById('edit-product-uom').value.trim();
  const quantity = document.getElementById('edit-product-quantity').value;
  const supplierId = document.getElementById('edit-product-supplier-id').value.trim();
  const zone = document.getElementById('edit-product-zone').value.trim();
  const description = document.getElementById('edit-product-description').value.trim();
  const editorName = document.getElementById('edit-product-user-editor').value.trim();
  const reason = document.getElementById('edit-product-reason').value.trim();
  
  if (!name || !barcode || !category || !uom || !quantity || !zone || !editorName || !reason) {
    Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบถ้วน รวมถึงชื่อผู้ทำการแก้ไขและเหตุผล', 'warning');
    return;
  }

  appState.editor = editorName;
  localStorage.setItem('inv_editor', editorName);
  
  const payload = {
    action: 'edit_product',
    sku,
    barcode,
    name,
    category,
    uom,
    quantity,
    supplierId,
    zone,
    description,
    creator: '',
    editor: editorName,
    preparer: '',
    reason: reason
  };

  try {
    const res = await callPostAPI(payload);
    if (res && res.status === 'success') {
      closeEditProductModal();
    }
  } catch (error) {
    console.error(error);
  }
}

async function deleteProduct(sku) {
  const { value: formValues } = await Swal.fire({
    title: 'ยืนยันการลบสินค้า',
    text: 'การลบข้อมูลจะไม่สามารถกู้คืนได้ และจะบันทึกใน Audit Log เสมอ',
    icon: 'warning',
    html:
      '<div class="text-left space-y-3">' +
      '  <label class="block text-xs font-bold text-slate-700 mb-1">ชื่อผู้ทำการลบ (ระบุตัวตน) *</label>' +
      '  <input id="swal-input-delete-user" class="swal2-input m-0 w-full text-sm" placeholder="ระบุชื่อจริง-นามสกุลของคุณ" required>' +
      '  <label class="block text-xs font-bold text-slate-700 mb-1">เหตุผลในการลบสินค้า *</label>' +
      '  <input id="swal-input-delete-reason" class="swal2-input m-0 w-full text-sm" placeholder="ระบุสาเหตุการลบ เช่น สินค้าเลิกจำหน่าย">' +
      '</div>',
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'ลบข้อมูล',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#ef4444',
    preConfirm: () => {
      const deleteUser = document.getElementById('swal-input-delete-user').value.trim();
      const deleteReason = document.getElementById('swal-input-delete-reason').value.trim();
      if (!deleteUser || !deleteReason) {
        Swal.showValidationMessage('กรุณากรอกข้อมูลระบุตัวตนและเหตุผลในการลบให้ครบถ้วน');
        return false;
      }
      return { deleteUser, deleteReason };
    }
  });

  if (!formValues) return;

  const payload = {
    action: 'delete_product',
    sku,
    creator: '',
    editor: formValues.deleteUser,
    preparer: '',
    reason: formValues.deleteReason
  };

  try {
    await callPostAPI(payload);
  } catch (error) {
    console.error(error);
  }
}

// Supplier CRUD Submits
async function saveSupplier(event) {
  event.preventDefault();
  
  const supplierId = document.getElementById('supplier-id').value.trim();
  const companyName = document.getElementById('supplier-company-name').value.trim();
  const taxId = document.getElementById('supplier-tax-id').value.trim();
  const businessType = "";
  const contactPerson = document.getElementById('supplier-contact-person').value.trim();
  const phone = document.getElementById('supplier-phone').value.trim();
  const email = document.getElementById('supplier-email').value.trim();
  const registeredAddress = document.getElementById('supplier-registered-address').value.trim();
  const mailingAddress = document.getElementById('supplier-mailing-address').value.trim();
  const creator = document.getElementById('supplier-creator').value.trim();
  const preparer = document.getElementById('supplier-preparer').value.trim();
  
  // Creator Field strictly required validation
  if (!creator || creator.trim() === '') {
    Swal.fire('การกรอกข้อมูลไม่ครบถ้วน', 'ช่องผู้เพิ่ม/ผู้บันทึกข้อมูล (Creator) จำเป็นต้องระบุตัวตนก่อนทำรายการ!', 'warning');
    return;
  }
  
  if (!supplierId || !companyName || !taxId || !phone || !registeredAddress || !preparer) {
    Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลสำคัญ ให้ครบถ้วน', 'warning');
    return;
  }
  
  if (taxId.length !== 13) {
    Swal.fire('ข้อผิดพลาด', 'เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก', 'error');
    return;
  }

  const payload = {
    action: 'add_supplier',
    supplierId,
    companyName,
    taxId,
    businessType,
    contactPerson,
    phone,
    email,
    registeredAddress,
    mailingAddress,
    creator,
    editor: '',
    preparer
  };

  try {
    const res = await callPostAPI(payload);
    if (res && res.status === 'success') {
      document.getElementById('supplier-form').reset();
      toggleMailingAddressSync();
    }
  } catch (error) {
    console.error(error);
  }
}

function startEditSupplier(supplierId) {
  dismissOffcanvas();
  const supplier = appState.suppliers.find(s => s.SupplierID === supplierId);
  if (!supplier) return;

  appState.currentSupplierEdit = supplierId;
  
  document.getElementById('edit-supplier-id').value = supplier.SupplierID;
  document.getElementById('edit-supplier-company-name').value = supplier.CompanyName;
  document.getElementById('edit-supplier-tax-id').value = supplier.TaxID;
  document.getElementById('edit-supplier-contact-person').value = supplier.ContactPerson || '';
  document.getElementById('edit-supplier-phone').value = supplier.Phone;
  document.getElementById('edit-supplier-email').value = supplier.Email || '';
  document.getElementById('edit-supplier-registered-address').value = supplier.RegisteredAddress;
  document.getElementById('edit-supplier-mailing-address').value = supplier.MailingAddress || '';
  
  document.getElementById('edit-supplier-user-editor').value = appState.editor;
  document.getElementById('edit-supplier-reason').value = '';

  const modal = document.getElementById('edit-supplier-modal');
  modal.classList.remove('hidden');
}

function closeEditSupplierModal() {
  appState.currentSupplierEdit = null;
  document.getElementById('edit-supplier-form').reset();
  document.getElementById('edit-supplier-modal').classList.add('hidden');
}

async function submitEditSupplier(event) {
  event.preventDefault();
  
  const supplierId = document.getElementById('edit-supplier-id').value;
  const companyName = document.getElementById('edit-supplier-company-name').value.trim();
  const taxId = document.getElementById('edit-supplier-tax-id').value.trim();
  const businessType = "";
  const contactPerson = document.getElementById('edit-supplier-contact-person').value.trim();
  const phone = document.getElementById('edit-supplier-phone').value.trim();
  const email = document.getElementById('edit-supplier-email').value.trim();
  const registeredAddress = document.getElementById('edit-supplier-registered-address').value.trim();
  const mailingAddress = document.getElementById('edit-supplier-mailing-address').value.trim();
  const editorName = document.getElementById('edit-supplier-user-editor').value.trim();
  const reason = document.getElementById('edit-supplier-reason').value.trim();
  
  if (!companyName || !taxId || !phone || !registeredAddress || !editorName || !reason) {
    Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบถ้วน รวมถึงชื่อผู้ทำการแก้ไขและเหตุผล', 'warning');
    return;
  }

  appState.editor = editorName;
  localStorage.setItem('inv_editor', editorName);

  const payload = {
    action: 'edit_supplier',
    supplierId,
    companyName,
    taxId,
    businessType,
    contactPerson,
    phone,
    email,
    registeredAddress,
    mailingAddress,
    creator: '',
    editor: editorName,
    preparer: '',
    reason: reason
  };

  try {
    const res = await callPostAPI(payload);
    if (res && res.status === 'success') {
      closeEditSupplierModal();
    }
  } catch (error) {
    console.error(error);
  }
}

async function deleteSupplier(supplierId) {
  const { value: formValues } = await Swal.fire({
    title: 'ยืนยันการลบคู่ค้า',
    text: 'ข้อมูลคู่ค้าจะถูกนำออกจากระบบและบันทึกประวัติเสมอ',
    icon: 'warning',
    html:
      '<div class="text-left space-y-3">' +
      '  <label class="block text-xs font-bold text-slate-700 mb-1">ชื่อผู้ทำการลบ (ระบุตัวตน) *</label>' +
      '  <input id="swal-input-delete-user-sup" class="swal2-input m-0 w-full text-sm" placeholder="ระบุชื่อจริง-นามสกุลของคุณ" required>' +
      '  <label class="block text-xs font-bold text-slate-700 mb-1">เหตุผลในการลบคู่ค้า *</label>' +
      '  <input id="swal-input-delete-reason-sup" class="swal2-input m-0 w-full text-sm" placeholder="ระบุสาเหตุการลบ เช่น เลิกทำสัญญา">' +
      '</div>',
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'ลบข้อมูล',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#ef4444',
    preConfirm: () => {
      const deleteUser = document.getElementById('swal-input-delete-user-sup').value.trim();
      const deleteReason = document.getElementById('swal-input-delete-reason-sup').value.trim();
      if (!deleteUser || !deleteReason) {
        Swal.showValidationMessage('กรุณากรอกข้อมูลระบุตัวตนและเหตุผลในการลบให้ครบถ้วน');
        return false;
      }
      return { deleteUser, deleteReason };
    }
  });

  if (!formValues) return;

  const payload = {
    action: 'delete_supplier',
    supplierId,
    creator: '',
    editor: formValues.deleteUser,
    preparer: '',
    reason: formValues.deleteReason
  };

  try {
    await callPostAPI(payload);
  } catch (error) {
    console.error(error);
  }
}

// Print Module
function openPrintModal() {
  if (appState.products.length === 0) {
    Swal.fire('ข้อผิดพลาด', 'ไม่พบสินค้าใด ๆ ในระบบที่จะพิมพ์ใบตรวจสอบสต็อก', 'warning');
    return;
  }
  dismissOffcanvas();

  document.getElementById('print-input-preparer').value = appState.editor || 'สมศรี (ผู้แก้ไข)';
  
  // Lock Editor Name Strictly
  document.getElementById('print-input-editor').value = 'นายปาณชัย พรมภักดี';
  
  const dateStr = new Date().toLocaleDateString('th-TH', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  document.getElementById('print-date').innerText = dateStr;

  updatePrintNames();

  // Clear search and supplier filters
  const searchInput = document.getElementById('print-search-products');
  if (searchInput) searchInput.value = '';

  const supSelect = document.getElementById('print-filter-supplier');
  if (supSelect) {
    const options = appState.suppliers.map(s => `<option value="${s.SupplierID}">${s.SupplierID} - ${s.CompanyName}</option>`).join('');
    supSelect.innerHTML = '<option value="">-- แสดงสินค้าของทุกคู่ค้า --</option>' + options;
    supSelect.value = '';
  }

  // Reset print selections to all products by default
  appState.printSelections = appState.products.map(item => item.SKU);
  appState.printProductFilteredList = null;
  appState.printProductCurrentPage = 1;
  appState.printProductPerPage = 10;

  renderPrintSelectionList();
  renderPrintPreview();

  document.getElementById('print-modal').classList.remove('hidden');
}

function renderPrintSelectionList() {
  const tbody = document.getElementById('print-selection-body');
  if (!tbody) return;

  const list = appState.printProductFilteredList || appState.products;
  const totalItems = list.length;
  const totalPages = Math.ceil(totalItems / appState.printProductPerPage) || 1;

  if (appState.printProductCurrentPage > totalPages) appState.printProductCurrentPage = totalPages;
  if (appState.printProductCurrentPage < 1) appState.printProductCurrentPage = 1;

  const startIdx = (appState.printProductCurrentPage - 1) * appState.printProductPerPage;
  const endIdx = Math.min(startIdx + appState.printProductPerPage, totalItems);
  const pageList = list.slice(startIdx, endIdx);

  tbody.innerHTML = pageList.map(item => {
    const isChecked = appState.printSelections.includes(item.SKU);
    return `
      <tr id="print-select-row-${item.SKU}">
        <td class="text-center">
          <input type="checkbox" class="form-check-input form-check-input-lg" id="print-chk-${item.SKU}" ${isChecked ? 'checked' : ''} onchange="togglePrintProduct('${item.SKU}', this.checked)">
        </td>
        <td class="font-mono">${item.SKU}</td>
        <td class="font-mono text-xs text-muted">${item.Barcode || '-'}</td>
        <td class="font-mono text-xs text-muted">${item.SupplierID || '-'}</td>
        <td class="font-mono text-xs text-muted">${item.Zone || '-'}</td>
        <td class="fw-semibold text-dark">${item.Name}</td>
        <td>${item.Category}</td>
        <td class="text-end fw-medium">${new Number(item.Quantity).toLocaleString('th-TH')} ${item.UOM}</td>
      </tr>
    `;
  }).join('');
  
  renderPrintSelectionPagination(totalItems, totalPages);
}

function renderPrintSelectionPagination(totalItems, totalPages) {
  const info = document.getElementById('print-selection-pagination-info');
  const listContainer = document.getElementById('print-selection-pagination-list');
  if (!info || !listContainer) return;

  if (totalItems === 0) {
    info.innerText = 'ไม่พบข้อมูล';
    listContainer.innerHTML = '';
    return;
  }

  const start = (appState.printProductCurrentPage - 1) * appState.printProductPerPage + 1;
  const end = Math.min(start + appState.printProductPerPage - 1, totalItems);
  info.innerText = `แสดงข้อมูล ${start} - ${end} จากทั้งหมด ${totalItems} รายการ`;

  let paginationHtml = '';
  const prevDisabled = appState.printProductCurrentPage === 1 ? 'disabled' : '';
  paginationHtml += `
    <li class="page-item ${prevDisabled}">
      <button class="page-link" onclick="changePrintSelectionPage(${appState.printProductCurrentPage - 1})" aria-label="Previous">
        <span aria-hidden="true">&laquo;</span>
      </button>
    </li>
  `;

  let startPage = Math.max(1, appState.printProductCurrentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  if (startPage > 1) {
    paginationHtml += `
      <li class="page-item">
        <button class="page-link" onclick="changePrintSelectionPage(1)">1</button>
      </li>
    `;
    if (startPage > 2) {
      paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    const activeClass = i === appState.printProductCurrentPage ? 'active' : '';
    paginationHtml += `
      <li class="page-item ${activeClass}">
        <button class="page-link" onclick="changePrintSelectionPage(${i})">${i}</button>
      </li>
    `;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
    paginationHtml += `
      <li class="page-item">
        <button class="page-link" onclick="changePrintSelectionPage(${totalPages})">${totalPages}</button>
      </li>
    `;
  }

  const nextDisabled = appState.printProductCurrentPage === totalPages ? 'disabled' : '';
  paginationHtml += `
    <li class="page-item ${nextDisabled}">
      <button class="page-link" onclick="changePrintSelectionPage(${appState.printProductCurrentPage + 1})" aria-label="Next">
        <span aria-hidden="true">&raquo;</span>
      </button>
    </li>
  `;

  listContainer.innerHTML = paginationHtml;
}

function changePrintSelectionPage(pageNum) {
  appState.printProductCurrentPage = pageNum;
  renderPrintSelectionList();
}

function togglePrintProduct(sku, isChecked) {
  if (!appState.printSelections) {
    appState.printSelections = [];
  }

  if (isChecked) {
    if (!appState.printSelections.includes(sku)) {
      appState.printSelections.push(sku);
    }
  } else {
    appState.printSelections = appState.printSelections.filter(s => s !== sku);
  }

  renderPrintPreview();
}

function selectAllPrintProducts(shouldSelectAll) {
  const currentList = appState.printProductFilteredList || appState.products;
  if (shouldSelectAll) {
    currentList.forEach(item => {
      if (!appState.printSelections.includes(item.SKU)) {
        appState.printSelections.push(item.SKU);
      }
    });
  } else {
    const skusToRemove = currentList.map(item => item.SKU);
    appState.printSelections = appState.printSelections.filter(s => !skusToRemove.includes(s));
  }

  renderPrintSelectionList();
  renderPrintPreview();
}

function filterPrintSelection() {
  const query = document.getElementById('print-search-products').value.toLowerCase().trim();
  const selectedSupplier = document.getElementById('print-filter-supplier').value;
  
  let baseList = appState.products;
  if (selectedSupplier) {
    baseList = appState.products.filter(item => String(item.SupplierID || '') === selectedSupplier);
  }
  
  if (!query) {
    appState.printProductFilteredList = selectedSupplier ? baseList : null;
  } else {
    appState.printProductFilteredList = baseList.filter(item => {
      const matchesSKU = String(item.SKU || '').toLowerCase().includes(query);
      const matchesBarcode = String(item.Barcode || '').toLowerCase().includes(query);
      const matchesSupplier = String(item.SupplierID || '').toLowerCase().includes(query);
      return matchesSKU || matchesBarcode || matchesSupplier;
    });
  }
  appState.printProductCurrentPage = 1;
  renderPrintSelectionList();
  renderPrintPreview();
}

function filterPrintProductsBySupplier() {
  const selectedSupplier = document.getElementById('print-filter-supplier').value;
  if (!selectedSupplier) {
    appState.printProductFilteredList = null;
  } else {
    appState.printProductFilteredList = appState.products.filter(item => item.SupplierID === selectedSupplier);
  }
  appState.printProductCurrentPage = 1;
  renderPrintSelectionList();
  renderPrintPreview();
}

function renderPrintPreview() {
  const tbody = document.getElementById('print-table-body');
  if (!tbody) return;

  const selectedProducts = appState.products.filter(item => 
    appState.printSelections && appState.printSelections.includes(item.SKU)
  );

  if (selectedProducts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-4 text-muted">
          <i class="fa-solid fa-triangle-exclamation me-1"></i> ไม่มีสินค้าที่เลือกสำหรับสั่งพิมพ์
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = selectedProducts.map((item, index) => {
    const barcodeStr = (item.Barcode !== undefined && item.Barcode !== null) ? String(item.Barcode).trim() : '';
    const hasBarcode = barcodeStr !== '';
    return `
      <tr class="border-bottom border-secondary-subtle">
        <td class="py-2 px-2 border-end border-secondary-subtle text-center">${index + 1}</td>
        <td class="py-2 px-2 border-end border-secondary-subtle font-mono">${item.SKU}</td>
        <td class="py-2 px-2 border-end border-secondary-subtle text-center">
          ${hasBarcode ? `
            <div class="barcode-container">
              <svg class="barcode-svg" id="print-barcode-svg-${item.SKU}"></svg>
            </div>
          ` : '-'}
        </td>
        <td class="py-2 px-2 border-end border-secondary-subtle text-center font-mono">${item.Zone || '-'}</td>
        <td class="py-2 px-2 border-end border-secondary-subtle fw-semibold text-dark">${item.Name}</td>
        <td class="py-2 px-2 border-end border-secondary-subtle text-center font-mono" style="font-size: 0.9em;">${item.SupplierID || '-'}</td>
        <td class="py-2 px-2 border-end border-secondary-subtle text-center">${item.UOM}</td>
        <td class="py-2 px-2 border-end border-secondary-subtle text-end fw-medium">${new Number(item.Quantity).toLocaleString('th-TH')}</td>
        <td class="py-2 px-2 text-center text-secondary opacity-50" style="white-space: nowrap !important;">
          [ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ] ${item.UOM}
        </td>
      </tr>
    `;
  }).join('');

  // Call JsBarcode library on all SVG objects
  selectedProducts.forEach(item => {
    const barcodeStr = (item.Barcode !== undefined && item.Barcode !== null) ? String(item.Barcode).trim() : '';
    const hasBarcode = barcodeStr !== '';
    if (!hasBarcode) return;

    const val = barcodeStr;
    
    // Check if EAN-13 format is suitable (must be numeric and 12 or 13 digits)
    const isNumeric = /^\d+$/.test(val);
    const isEanLength = val.length === 12 || val.length === 13;
    const formatType = (isNumeric && isEanLength) ? "EAN13" : "CODE128";

    try {
      JsBarcode(`#print-barcode-svg-${item.SKU}`, val, {
        format: formatType,
        displayValue: true,
        fontSize: 10,
        textMargin: 2,
        height: 50,
        width: 2.0
      });
    } catch (e) {
      // Fallback to CODE128 if EAN13 generation fails (e.g. invalid checksum)
      try {
        JsBarcode(`#print-barcode-svg-${item.SKU}`, val, {
          format: "CODE128",
          displayValue: true,
          fontSize: 10,
          textMargin: 2,
          height: 50,
          width: 2.0
        });
      } catch (err) {
        console.error("Barcode generation failed for SKU " + item.SKU, err);
      }
    }
  });
}

function updatePrintNames() {
  const prepVal = document.getElementById('print-input-preparer').value.trim() || '-';
  // Strictly enforce locked editor name
  const editVal = "นายปาณชัย พรมภักดี";
  
  document.getElementById('print-preparer-name').innerText = prepVal;
  document.getElementById('print-editor-name').innerText = editVal;
  
  document.querySelector('.print-sign-preparer').innerText = prepVal;
  document.querySelector('.print-sign-editor').innerText = editVal;
}

function closePrintModal() {
  document.getElementById('print-modal').classList.add('hidden');
}

// Print Supplier Sheet Module
function openPrintSupplierModal() {
  if (appState.suppliers.length === 0) {
    Swal.fire('ข้อผิดพลาด', 'ไม่พบคู่ค้าใด ๆ ในระบบที่จะพิมพ์ใบตรวจสอบ', 'warning');
    return;
  }
  dismissOffcanvas();

  document.getElementById('print-sup-input-preparer').value = appState.editor || 'สมศรี (ผู้แก้ไข)';
  
  // Lock Editor Name Strictly
  document.getElementById('print-sup-input-editor').value = 'นายปาณชัย พรมภักดี';
  
  const dateStr = new Date().toLocaleDateString('th-TH', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  document.getElementById('print-sup-date').innerText = dateStr;

  updatePrintSupplierNames();

  const searchInput = document.getElementById('print-sup-search-suppliers');
  if (searchInput) searchInput.value = '';

  appState.printSupplierSelections = appState.suppliers.map(item => item.SupplierID);

  renderPrintSupplierSelectionList();
  renderPrintSupplierPreview();

  document.getElementById('print-supplier-modal').classList.remove('hidden');
}

function renderPrintSupplierSelectionList() {
  const tbody = document.getElementById('print-sup-selection-body');
  if (!tbody) return;

  tbody.innerHTML = appState.suppliers.map(item => {
    const isChecked = appState.printSupplierSelections.includes(item.SupplierID);
    return `
      <tr id="print-sup-select-row-${item.SupplierID}">
        <td class="text-center">
          <input type="checkbox" class="form-check-input form-check-input-lg" id="print-sup-chk-${item.SupplierID}" ${isChecked ? 'checked' : ''} onchange="togglePrintSupplier('${item.SupplierID}', this.checked)">
        </td>
        <td class="font-mono">${item.SupplierID}</td>
        <td class="fw-semibold text-dark">${item.CompanyName}</td>
        <td class="font-mono">${item.TaxID}</td>
        <td>${item.Phone}</td>
      </tr>
    `;
  }).join('');
}

function togglePrintSupplier(supplierId, isChecked) {
  if (!appState.printSupplierSelections) {
    appState.printSupplierSelections = [];
  }

  if (isChecked) {
    if (!appState.printSupplierSelections.includes(supplierId)) {
      appState.printSupplierSelections.push(supplierId);
    }
  } else {
    appState.printSupplierSelections = appState.printSupplierSelections.filter(s => s !== supplierId);
  }

  renderPrintSupplierPreview();
}

function selectAllPrintSuppliers(shouldSelectAll) {
  if (shouldSelectAll) {
    appState.printSupplierSelections = appState.suppliers.map(item => item.SupplierID);
  } else {
    appState.printSupplierSelections = [];
  }

  appState.suppliers.forEach(item => {
    const chk = document.getElementById(`print-sup-chk-${item.SupplierID}`);
    if (chk) {
      chk.checked = shouldSelectAll;
    }
  });

  renderPrintSupplierPreview();
}

function filterPrintSupplierSelection() {
  const query = document.getElementById('print-sup-search-suppliers').value.toLowerCase().trim();
  
  appState.suppliers.forEach(item => {
    const row = document.getElementById(`print-sup-select-row-${item.SupplierID}`);
    if (!row) return;

    const matchesID = String(item.SupplierID || '').toLowerCase().includes(query);
    const matchesName = String(item.CompanyName || '').toLowerCase().includes(query);
    const matchesTaxID = String(item.TaxID || '').toLowerCase().includes(query);
    const matchesPhone = String(item.Phone || '').toLowerCase().includes(query);

    if (matchesID || matchesName || matchesTaxID || matchesPhone) {
      row.classList.remove('d-none');
    } else {
      row.classList.add('d-none');
    }
  });
}

function renderPrintSupplierPreview() {
  const tbody = document.getElementById('print-sup-table-body');
  if (!tbody) return;

  const selectedSuppliers = appState.suppliers.filter(item => 
    appState.printSupplierSelections && appState.printSupplierSelections.includes(item.SupplierID)
  );

  if (selectedSuppliers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">
          <i class="fa-solid fa-triangle-exclamation me-1"></i> ไม่มีคู่ค้าที่เลือกสำหรับสั่งพิมพ์
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = selectedSuppliers.map((item, index) => `
    <tr class="border-bottom border-secondary-subtle">
      <td class="py-2 px-3 border-end border-secondary-subtle text-center">${index + 1}</td>
      <td class="py-2 px-3 border-end border-secondary-subtle font-mono">${item.SupplierID}</td>
      <td class="py-2 px-3 border-end border-secondary-subtle fw-semibold text-dark">${item.CompanyName}</td>
      <td class="py-2 px-3 border-end border-secondary-subtle font-mono">${item.TaxID}</td>
      <td class="py-2 px-3 border-end border-secondary-subtle">${item.ContactPerson || '-'}</td>
      <td class="py-2 px-3 border-end border-secondary-subtle">${item.Phone}</td>
      <td class="py-2 px-3 text-center text-secondary opacity-50">
        [ &nbsp; ] ถูกต้อง &nbsp; [ &nbsp; ] แก้ไข
      </td>
    </tr>
  `).join('');
}

function updatePrintSupplierNames() {
  const prepVal = document.getElementById('print-sup-input-preparer').value.trim() || '-';
  // Strictly lock editor name
  const editVal = "นายปาณชัย พรมภักดี";
  
  document.getElementById('print-sup-preparer-name').innerText = prepVal;
  document.getElementById('print-sup-editor-name').innerText = editVal;
  
  document.querySelectorAll('.print-sup-sign-preparer').forEach(el => el.innerText = prepVal);
  document.querySelectorAll('.print-sup-sign-editor').forEach(el => el.innerText = editVal);
}

function closePrintSupplierModal() {
  document.getElementById('print-supplier-modal').classList.add('hidden');
}

// =========================================================================
// 6. โมดูลการเบิกสินค้าออกจากคลัง (WMS Goods Issue)
// =========================================================================

function populateGoodsIssueSuppliers() {
  const selectEl = document.getElementById('issue-supplier-id');
  if (!selectEl) return;
  const options = appState.suppliers.map(s => `<option value="${s.SupplierID}">${s.SupplierID} - ${s.CompanyName}</option>`).join('');
  selectEl.innerHTML = '<option value="">-- เลือกรหัสคู่ค้า --</option>' + options;
}

function onIssueSupplierChange() {
  const supplierId = document.getElementById('issue-supplier-id').value;
  const compNameInput = document.getElementById('issue-company-name');
  const skuSelect = document.getElementById('issue-product-sku');
  
  if (!compNameInput || !skuSelect) return;
  
  compNameInput.value = '';
  skuSelect.innerHTML = '<option value="">-- เลือกสินค้า (กรองตามคู่ค้า) --</option>';
  document.getElementById('issue-product-zone').value = '-';
  document.getElementById('issue-product-onhand').value = '0';
  document.getElementById('issue-quantity').value = '';
  document.getElementById('issue-damaged-quantity').value = '0';
  document.getElementById('issue-remaining-preview').value = '0';
  
  if (!supplierId) return;
  
  const supplier = appState.suppliers.find(s => s.SupplierID === supplierId);
  if (supplier) {
    compNameInput.value = supplier.CompanyName;
  }
  
  const filteredProducts = appState.products.filter(p => p.SupplierID === supplierId);
  const options = filteredProducts.map(p => `<option value="${p.SKU}">${p.SKU} - ${p.Name}</option>`).join('');
  skuSelect.innerHTML = '<option value="">-- เลือกสินค้า (กรองตามคู่ค้า) --</option>' + options;
}

function onIssueProductChange() {
  const sku = document.getElementById('issue-product-sku').value;
  const zoneInput = document.getElementById('issue-product-zone');
  const onhandInput = document.getElementById('issue-product-onhand');
  
  if (!zoneInput || !onhandInput) return;
  
  zoneInput.value = '-';
  onhandInput.value = '0';
  document.getElementById('issue-quantity').value = '';
  document.getElementById('issue-damaged-quantity').value = '0';
  document.getElementById('issue-remaining-preview').value = '0';
  
  if (!sku) return;
  
  const product = appState.products.find(p => p.SKU === sku);
  if (product) {
    zoneInput.value = product.Zone || '-';
    onhandInput.value = product.Quantity || 0;
    calculateIssueRemaining();
  }
}

function calculateIssueRemaining() {
  const onhand = Number(document.getElementById('issue-product-onhand').value || 0);
  const issued = Number(document.getElementById('issue-quantity').value || 0);
  const damaged = Number(document.getElementById('issue-damaged-quantity').value || 0);
  
  const remaining = onhand - (issued + damaged);
  const remainingInput = document.getElementById('issue-remaining-preview');
  
  if (remainingInput) {
    remainingInput.value = remaining;
    if (remaining < 0) {
      remainingInput.classList.add('text-danger');
      remainingInput.classList.remove('text-primary');
    } else {
      remainingInput.classList.remove('text-danger');
      remainingInput.classList.add('text-primary');
    }
  }
}

function addGoodsIssueItem(event) {
  event.preventDefault();
  
  const supplierId = document.getElementById('issue-supplier-id').value;
  const compName = document.getElementById('issue-company-name').value;
  const sku = document.getElementById('issue-product-sku').value;
  const zone = document.getElementById('issue-product-zone').value;
  const onhand = Number(document.getElementById('issue-product-onhand').value || 0);
  const issued = Number(document.getElementById('issue-quantity').value || 0);
  const damaged = Number(document.getElementById('issue-damaged-quantity').value || 0);
  const remaining = onhand - (issued + damaged);
  
  if (!supplierId || !sku || issued <= 0) {
    Swal.fire('กรอกข้อมูลไม่ครบถ้วน', 'กรุณาเลือกคู่ค้า สินค้า และจำนวนที่จะเบิกให้ถูกต้อง', 'warning');
    return;
  }
  
  if (remaining < 0) {
    Swal.fire('สินค้าคงคลังไม่พอ', 'จำนวนเบิกรวมกับจำนวนชำรุดเสียหาย เกินยอดคงคลังที่มีอยู่จริง!', 'error');
    return;
  }
  
  const product = appState.products.find(p => p.SKU === sku);
  if (!product) return;
  
  // Check duplicate in basket
  if (appState.goodsIssueBasket.some(item => item.sku === sku)) {
    Swal.fire('สินค้าซ้ำในรายการ', 'มีสินค้านี้อยู่ในรายการที่จะเบิกอยู่แล้ว หากต้องการเปลี่ยนจำนวนกรุณาลบรายการเดิมออกก่อน', 'warning');
    return;
  }
  
  // Add to basket
  appState.goodsIssueBasket.push({
    supplierId,
    compName,
    sku,
    name: product.Name,
    zone,
    onhand,
    issuedQuantity: issued,
    damagedQuantity: damaged,
    remaining,
    uom: product.UOM,
    barcode: product.Barcode
  });
  
  // Reset item inputs, keeping supplier active for convenience
  document.getElementById('issue-product-sku').value = '';
  onIssueProductChange();
  
  renderGoodsIssueBasket();
  Swal.fire({
    title: 'เพิ่มลงรายการสำเร็จ!',
    icon: 'success',
    timer: 800,
    showConfirmButton: false
  });
}

function renderGoodsIssueBasket() {
  const tbody = document.getElementById('goods-issue-basket-body');
  if (!tbody) return;
  
  if (appState.goodsIssueBasket.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-5 text-muted">ยังไม่มีสินค้าในรายการเบิกออก</td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = appState.goodsIssueBasket.map((item, idx) => `
    <tr>
      <td class="font-mono text-xs">${item.supplierId}</td>
      <td class="font-mono text-xs text-blue-600 fw-semibold">${item.sku}</td>
      <td class="fw-semibold text-slate-800">${item.name}</td>
      <td class="font-mono text-xs text-muted">${item.zone}</td>
      <td class="text-end fw-semibold text-success">${item.issuedQuantity.toLocaleString('th-TH')} ${item.uom}</td>
      <td class="text-end text-danger">${item.damagedQuantity.toLocaleString('th-TH')} ${item.uom}</td>
      <td class="text-center">
        <button type="button" onclick="removeGoodsIssueItem('${item.sku}')" class="btn btn-sm btn-outline-danger border-0 p-1 px-2.5">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function removeGoodsIssueItem(sku) {
  appState.goodsIssueBasket = appState.goodsIssueBasket.filter(item => item.sku !== sku);
  renderGoodsIssueBasket();
}

function previewGoodsIssueBasket() {
  if (appState.goodsIssueBasket.length === 0) {
    Swal.fire('ตะกร้าว่างเปล่า', 'กรุณาเพิ่มสินค้าลงในรายการเบิกอย่างน้อย 1 รายการก่อนพรีวิว', 'warning');
    return;
  }
  
  const requester = document.getElementById('issue-requester').value.trim();
  const reason = document.getElementById('issue-reason').value.trim();
  
  if (!requester || !reason) {
    Swal.fire('ระบุข้อมูลจำเป็น', 'กรุณากรอกชื่อผู้เบิกสินค้าและเหตุผลในการเบิกออกก่อนทำรายการพรีวิว', 'warning');
    return;
  }
  
  // Set up preview document fields
  document.getElementById('print-issue-requester-name').innerText = requester;
  document.getElementById('print-issue-reason-val').innerText = reason;
  
  const dateStr = new Date().toLocaleDateString('th-TH', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  document.getElementById('print-issue-date').innerText = dateStr;
  
  // For multi-supplier / multi-product, show multiple/various
  const uniqueSuppliers = [...new Set(appState.goodsIssueBasket.map(item => item.supplierId))];
  document.getElementById('print-issue-supplier-id-val').innerText = uniqueSuppliers.join(', ');
  
  const uniqueCompanies = [...new Set(appState.goodsIssueBasket.map(item => item.compName))];
  document.getElementById('print-issue-company-name-val').innerText = uniqueCompanies.join(', ');
  
  document.querySelector('.print-issue-sign-requester').innerText = requester;
  
  const tbody = document.getElementById('print-issue-table-body');
  if (tbody) {
    tbody.innerHTML = appState.goodsIssueBasket.map((item, index) => {
      const barcodeStr = (item.barcode !== undefined && item.barcode !== null) ? String(item.barcode).trim() : '';
      const hasBarcode = barcodeStr !== '';
      return `
        <tr class="border-bottom border-secondary-subtle">
          <td class="py-2 px-2 border-end border-secondary-subtle text-center">${index + 1}</td>
          <td class="py-2 px-2 border-end border-secondary-subtle text-center">
            ${hasBarcode ? `
              <div class="barcode-container">
                <svg class="barcode-svg" id="print-issue-barcode-svg-${item.sku}"></svg>
              </div>
            ` : '-'}
          </td>
          <td class="py-2 px-2 border-end border-secondary-subtle font-mono text-center">${item.sku}</td>
          <td class="py-2 px-2 border-end border-secondary-subtle fw-semibold text-dark">${item.name}</td>
          <td class="py-2 px-2 border-end border-secondary-subtle text-center font-mono">${item.zone || '-'}</td>
          <td class="py-2 px-2 border-end border-secondary-subtle text-end">${item.onhand.toLocaleString('th-TH')}</td>
          <td class="py-2 px-2 border-end border-secondary-subtle text-end fw-bold text-success">${item.issuedQuantity.toLocaleString('th-TH')}</td>
          <td class="py-2 px-2 border-end border-secondary-subtle text-end text-danger">${item.damagedQuantity.toLocaleString('th-TH')}</td>
          <td class="py-2 px-2 border-end border-secondary-subtle text-center text-secondary opacity-50" style="white-space: nowrap !important;">
            [ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ]
          </td>
          <td class="py-2 px-2 text-center">${item.uom}</td>
        </tr>
      `;
    }).join('');
  }
  
  // Render Barcodes
  appState.goodsIssueBasket.forEach(item => {
    const barcodeStr = (item.barcode !== undefined && item.barcode !== null) ? String(item.barcode).trim() : '';
    const hasBarcode = barcodeStr !== '';
    if (!hasBarcode) return;
    
    const isNumeric = /^\d+$/.test(barcodeStr);
    const isEanLength = barcodeStr.length === 12 || barcodeStr.length === 13;
    const formatType = (isNumeric && isEanLength) ? "EAN13" : "CODE128";
    
    setTimeout(() => {
      try {
        JsBarcode(`#print-issue-barcode-svg-${item.sku}`, barcodeStr, {
          format: formatType,
          displayValue: true,
          fontSize: 10,
          textMargin: 2,
          height: 50,
          width: 2.0
        });
      } catch (e) {
        try {
          JsBarcode(`#print-issue-barcode-svg-${item.sku}`, barcodeStr, {
            format: "CODE128",
            displayValue: true,
            fontSize: 10,
            textMargin: 2,
            height: 50,
            width: 2.0
          });
        } catch (err) {
          console.error("Barcode generation failed in Goods Issue SKU " + item.sku, err);
        }
      }
    }, 100);
  });
  
  // Show Modal
  appState.currentIssue = {
    creator: requester,
    reason: reason,
    items: appState.goodsIssueBasket
  };
  
  document.getElementById('print-issue-modal').classList.remove('hidden');
}

async function confirmAndPrintIssue() {
  if (!appState.currentIssue) return;
  
  const payload = {
    action: 'issue_product',
    ...appState.currentIssue
  };
  
  try {
    const res = await callPostAPI(payload);
    if (res && res.status === 'success') {
      // Trigger print window
      window.print();
      
      // Clear basket & form
      appState.goodsIssueBasket = [];
      renderGoodsIssueBasket();
      
      document.getElementById('goods-issue-form').reset();
      onIssueSupplierChange();
      
      document.getElementById('issue-requester').value = '';
      document.getElementById('issue-reason').value = '';
      
      closePrintIssueModal();
    }
  } catch (error) {
    console.error(error);
  }
}

function closePrintIssueModal() {
  document.getElementById('print-issue-modal').classList.add('hidden');
  appState.currentIssue = null;
}
