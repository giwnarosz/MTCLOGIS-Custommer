// กำหนด Google Apps Script Web App URL ที่นี่ (ฝังไว้เพื่อให้ง่ายต่อการเรียนการสอนนักเรียน ปวส.)
const API_URL = "https://script.google.com/macros/s/AKfycbyx6OF4IZzXYiPi3zYndh6AIy9p7HKY49gV0Mldg83NIPPxmbw69_cEzLTwCaB52l6m/exec"; // <-- แก้ไข URL นี้เป็น URL ของ Web App ที่คุณ Deploy ไว้

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
  auditLogsCurrentPage: 1,
  auditLogsPerPage: 10,
  auditLogsFilteredList: null
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
    const emptyRowHtml = `<tr><td colspan="6" class="text-center py-8 text-slate-400 text-xs">กรุณาตั้งค่า API_URL ในไฟล์ js/app.js เพื่อเริ่มระบบคลังสินค้า</td></tr>`;
    document.getElementById('product-table-body').innerHTML = emptyRowHtml;
    document.getElementById('supplier-table-body').innerHTML = emptyRowHtml;
    document.getElementById('logs-table-body').innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400 text-xs">กรุณาตั้งค่า API_URL ในไฟล์ js/app.js เพื่อเริ่มระบบคลังสินค้า</td></tr>`;
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
      <td colspan="9" class="text-center py-8 text-slate-400">กำลังโหลดประวัติใหม่...</td>
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
    'audit-logs': 'ประวัติการทำงาน (Audit Logs)'
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

// Auto-generation Helpers (Removed for teaching purposes, SKU and Supplier ID are manually input by students)

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
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400 text-xs">ไม่พบข้อมูลสินค้า</td></tr>`;
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
      <td class="py-3 px-4 font-medium text-slate-800">${item.Name}</td>
      <td class="py-3 px-4 text-xs text-slate-500">${item.Category}</td>
      <td class="py-3 px-4 text-xs text-slate-600">${item.UOM}</td>
      <td class="py-3 px-4 text-right font-semibold text-blue-800">${new Number(item.Quantity).toLocaleString('th-TH')}</td>
      <td class="py-3 px-4 text-center">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="startEditProduct('${item.SKU}')" class="p-1 px-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-xs transition-all font-medium">
            <i class="fa-solid fa-pen"></i> แก้ไข
          </button>
          <button onclick="deleteProduct('${item.SKU}')" class="p-1 px-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded text-xs transition-all font-medium">
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

  for (let i = 1; i <= totalPages; i++) {
    const activeClass = i === appState.productsCurrentPage ? 'active' : '';
    paginationHtml += `
      <li class="page-item ${activeClass}">
        <button class="page-link" onclick="changeProductPage(${i})">${i}</button>
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

function renderSuppliers(filteredList = null) {
  const list = filteredList || appState.suppliers;
  const tbody = document.getElementById('supplier-table-body');
  
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400 text-xs">ไม่พบข้อมูลคู่ค้า</td></tr>`;
    return;
  }
  
  tbody.innerHTML = list.map(item => `
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
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400 font-xs">ไม่พบประวัติการทำรายการ</td></tr>`;
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

  for (let i = 1; i <= totalPages; i++) {
    const activeClass = i === appState.auditLogsCurrentPage ? 'active' : '';
    paginationHtml += `
      <li class="page-item ${activeClass}">
        <button class="page-link" onclick="changeLogsPage(${i})">${i}</button>
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
  const query = document.getElementById('search-products').value.toLowerCase().trim();
  if (!query) {
    renderProducts(null);
    return;
  }
  const filtered = appState.products.filter(p => 
    p.SKU.toLowerCase().includes(query) || 
    p.Name.toLowerCase().includes(query) ||
    p.Category.toLowerCase().includes(query) ||
    (p.Creator && p.Creator.toLowerCase().includes(query))
  );
  renderProducts(filtered);
}

function filterSuppliers() {
  const query = document.getElementById('search-suppliers').value.toLowerCase().trim();
  if (!query) {
    renderSuppliers();
    return;
  }
  const filtered = appState.suppliers.filter(s => 
    s.SupplierID.toLowerCase().includes(query) || 
    s.CompanyName.toLowerCase().includes(query) ||
    s.TaxID.includes(query) ||
    (s.Phone && s.Phone.toLowerCase().includes(query))
  );
  renderSuppliers(filtered);
}

function filterLogs() {
  const query = document.getElementById('search-logs').value.toLowerCase().trim();
  if (!query) {
    renderLogs(null);
    return;
  }
  const filtered = appState.auditLogs.filter(l => 
    l.PrimaryKey.toLowerCase().includes(query) || 
    l.RecordType.toLowerCase().includes(query) ||
    (l.Details && l.Details.toLowerCase().includes(query)) ||
    (l.Reason && l.Reason.toLowerCase().includes(query)) ||
    (l.Creator && l.Creator.toLowerCase().includes(query)) ||
    (l.Editor && l.Editor.toLowerCase().includes(query)) ||
    (l.Preparer && l.Preparer.toLowerCase().includes(query))
  );
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
        'Content-Type': 'text/plain' // ใช้ text/plain เพื่อป้องกันปัญหา CORS preflight OPTIONS ใน Google Apps Script
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    if (!result || result.status !== 'success') {
      throw new Error(result.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลไปยัง Google Sheets');
    }
    
    // ตั้งหน่วงเวลารอ Google Sheets ทำงาน
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
  const name = document.getElementById('product-name').value.trim();
  const category = document.getElementById('product-category').value;
  const uom = document.getElementById('product-uom').value;
  const quantity = document.getElementById('product-quantity').value;
  const description = document.getElementById('product-description').value.trim();
  const creator = document.getElementById('product-creator').value.trim();
  const preparer = document.getElementById('product-preparer').value.trim();
  
  if (!sku || !name || !category || !uom || !quantity || !creator || !preparer) {
    Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบถ้วน รวมถึงชื่อผู้บันทึกและผู้จัดทำ', 'warning');
    return;
  }

  const payload = {
    action: 'add_product',
    sku,
    name,
    category,
    uom,
    quantity,
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
  const product = appState.products.find(p => p.SKU === sku);
  if (!product) return;

  appState.currentProductEdit = sku;
  
  document.getElementById('edit-product-sku').value = product.SKU;
  document.getElementById('edit-product-name').value = product.Name;
  document.getElementById('edit-product-category').value = product.Category;
  document.getElementById('edit-product-uom').value = product.UOM;
  document.getElementById('edit-product-quantity').value = product.Quantity;
  document.getElementById('edit-product-description').value = product.Description || '';
  
  document.getElementById('edit-product-user-editor').value = appState.editor;
  document.getElementById('edit-product-reason').value = '';

  const modal = document.getElementById('edit-product-modal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.firstElementChild.classList.remove('scale-95');
    modal.firstElementChild.classList.add('scale-100');
  }, 10);
}

function closeEditProductModal() {
  appState.currentProductEdit = null;
  document.getElementById('edit-product-form').reset();
  
  const modal = document.getElementById('edit-product-modal');
  modal.firstElementChild.classList.remove('scale-100');
  modal.firstElementChild.classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 150);
}

async function submitEditProduct(event) {
  event.preventDefault();
  
  const sku = document.getElementById('edit-product-sku').value;
  const name = document.getElementById('edit-product-name').value.trim();
  const category = document.getElementById('edit-product-category').value;
  const uom = document.getElementById('edit-product-uom').value;
  const quantity = document.getElementById('edit-product-quantity').value;
  const description = document.getElementById('edit-product-description').value.trim();
  const editorName = document.getElementById('edit-product-user-editor').value.trim();
  const reason = document.getElementById('edit-product-reason').value.trim();
  
  if (!name || !category || !uom || !quantity || !editorName || !reason) {
    Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบถ้วน รวมถึงชื่อผู้ทำการแก้ไขและเหตุผล', 'warning');
    return;
  }

  appState.editor = editorName;
  localStorage.setItem('inv_editor', editorName);
  
  const payload = {
    action: 'edit_product',
    sku,
    name,
    category,
    uom,
    quantity,
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
  
  if (!supplierId || !companyName || !taxId || !phone || !registeredAddress || !creator || !preparer) {
    Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลสำคัญ รวมถึงชื่อผู้บันทึกและผู้จัดทำ ให้ครบถ้วน', 'warning');
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
      toggleMailingAddressSync(); // Reset address check
    }
  } catch (error) {
    console.error(error);
  }
}

function startEditSupplier(supplierId) {
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
  setTimeout(() => {
    modal.firstElementChild.classList.remove('scale-95');
    modal.firstElementChild.classList.add('scale-100');
  }, 10);
}

function closeEditSupplierModal() {
  appState.currentSupplierEdit = null;
  document.getElementById('edit-supplier-form').reset();
  
  const modal = document.getElementById('edit-supplier-modal');
  modal.firstElementChild.classList.remove('scale-100');
  modal.firstElementChild.classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 150);
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

  document.getElementById('print-input-preparer').value = appState.editor || 'สมศรี (ผู้แก้ไข)';
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

  // Clear search field
  const searchInput = document.getElementById('print-search-products');
  if (searchInput) searchInput.value = '';

  // Initialize print selections (all products selected by default)
  appState.printSelections = appState.products.map(item => item.SKU);

  // Render selection checklist UI
  renderPrintSelectionList();

  // Render printable preview area
  renderPrintPreview();

  togglePrintCostColumn();

  const modal = document.getElementById('print-modal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.firstElementChild.classList.remove('scale-95');
    modal.firstElementChild.classList.add('scale-100');
  }, 10);
}

function renderPrintSelectionList() {
  const tbody = document.getElementById('print-selection-body');
  if (!tbody) return;

  tbody.innerHTML = appState.products.map(item => {
    const isChecked = appState.printSelections.includes(item.SKU);
    return `
      <tr id="print-select-row-${item.SKU}">
        <td class="text-center">
          <input type="checkbox" class="form-check-input form-check-input-lg" id="print-chk-${item.SKU}" ${isChecked ? 'checked' : ''} onchange="togglePrintProduct('${item.SKU}', this.checked)">
        </td>
        <td class="font-mono">${item.SKU}</td>
        <td class="fw-semibold text-dark">${item.Name}</td>
        <td>${item.Category}</td>
        <td class="text-end fw-medium">${new Number(item.Quantity).toLocaleString('th-TH')} ${item.UOM}</td>
      </tr>
    `;
  }).join('');
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
  if (shouldSelectAll) {
    appState.printSelections = appState.products.map(item => item.SKU);
  } else {
    appState.printSelections = [];
  }

  // Update checkboxes in the list
  appState.products.forEach(item => {
    const chk = document.getElementById(`print-chk-${item.SKU}`);
    if (chk) {
      chk.checked = shouldSelectAll;
    }
  });

  renderPrintPreview();
}

function filterPrintSelection() {
  const query = document.getElementById('print-search-products').value.toLowerCase().trim();
  
  appState.products.forEach(item => {
    const row = document.getElementById(`print-select-row-${item.SKU}`);
    if (!row) return;

    const matchesSKU = item.SKU.toLowerCase().includes(query);
    const matchesName = item.Name.toLowerCase().includes(query);
    const matchesCategory = item.Category.toLowerCase().includes(query);

    if (matchesSKU || matchesName || matchesCategory) {
      row.classList.remove('d-none');
    } else {
      row.classList.add('d-none');
    }
  });
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
        <td colspan="7" class="text-center py-4 text-muted">
          <i class="fa-solid fa-triangle-exclamation me-1"></i> ไม่มีสินค้าที่เลือกสำหรับสั่งพิมพ์
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = selectedProducts.map((item, index) => `
    <tr class="border-bottom border-secondary-subtle">
      <td class="py-2 px-3 border-end border-secondary-subtle text-center">${index + 1}</td>
      <td class="py-2 px-3 border-end border-secondary-subtle font-mono">${item.SKU}</td>
      <td class="py-2 px-3 border-end border-secondary-subtle fw-semibold text-dark">${item.Name}</td>
      <td class="py-2 px-3 border-end border-secondary-subtle">${item.Category}</td>
      <td class="py-2 px-3 border-end border-secondary-subtle text-center">${item.UOM}</td>
      <td class="py-2 px-3 border-end border-secondary-subtle text-end fw-medium">${new Number(item.Quantity).toLocaleString('th-TH')}</td>
      <td class="py-2 px-3 text-center text-secondary opacity-50">
        [ &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; ] ${item.UOM}
      </td>
    </tr>
  `).join('');
}

function updatePrintNames() {
  const prepVal = document.getElementById('print-input-preparer').value.trim() || '-';
  const editVal = document.getElementById('print-input-editor').value.trim() || '-';
  
  document.getElementById('print-preparer-name').innerText = prepVal;
  document.getElementById('print-editor-name').innerText = editVal;
  
  document.querySelector('.print-sign-preparer').innerText = prepVal;
  document.querySelector('.print-sign-editor').innerText = editVal;
}

function closePrintModal() {
  const modal = document.getElementById('print-modal');
  modal.firstElementChild.classList.remove('scale-100');
  modal.firstElementChild.classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 150);
}

function togglePrintCostColumn() {
  // Cost column functionality is deprecated since we replaced price/cost with Quantity,
  // but we keep the method stub to prevent errors.
}

// Print Supplier Sheet Module
function openPrintSupplierModal() {
  if (appState.suppliers.length === 0) {
    Swal.fire('ข้อผิดพลาด', 'ไม่พบคู่ค้าใด ๆ ในระบบที่จะพิมพ์ใบตรวจสอบ', 'warning');
    return;
  }

  document.getElementById('print-sup-input-preparer').value = appState.editor || 'สมศรี (ผู้แก้ไข)';
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

  // Clear search field
  const searchInput = document.getElementById('print-sup-search-suppliers');
  if (searchInput) searchInput.value = '';

  // Initialize print selections (all suppliers selected by default)
  appState.printSupplierSelections = appState.suppliers.map(item => item.SupplierID);

  // Render selection checklist UI
  renderPrintSupplierSelectionList();

  // Render printable preview area
  renderPrintSupplierPreview();

  const modal = document.getElementById('print-supplier-modal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.firstElementChild.classList.remove('scale-95');
    modal.firstElementChild.classList.add('scale-100');
  }, 10);
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

  // Update checkboxes in the list
  appState.suppliers.forEach(item => {
    const chk = document.getElementById(`print-sup-chk-${item.SupplierID}`);
    if (chk) {
      chk.checked = shouldSelectAll;
    }
  });

  renderPrintSupplierPreview();
}

// Filter the supplier checklist as typing
function filterPrintSupplierSelection() {
  const query = document.getElementById('print-sup-search-suppliers').value.toLowerCase().trim();
  
  appState.suppliers.forEach(item => {
    const row = document.getElementById(`print-sup-select-row-${item.SupplierID}`);
    if (!row) return;

    const matchesID = item.SupplierID.toLowerCase().includes(query);
    const matchesName = item.CompanyName.toLowerCase().includes(query);
    const matchesTaxID = item.TaxID.toLowerCase().includes(query);
    const matchesPhone = (item.Phone || '').toLowerCase().includes(query);

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
  const editVal = document.getElementById('print-sup-input-editor').value.trim() || '-';
  
  document.getElementById('print-sup-preparer-name').innerText = prepVal;
  document.getElementById('print-sup-editor-name').innerText = editVal;
  
  document.querySelectorAll('.print-sup-sign-preparer').forEach(el => el.innerText = prepVal);
  document.querySelectorAll('.print-sup-sign-editor').forEach(el => el.innerText = editVal);
}

function closePrintSupplierModal() {
  const modal = document.getElementById('print-supplier-modal');
  modal.firstElementChild.classList.remove('scale-100');
  modal.firstElementChild.classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 150);
}

