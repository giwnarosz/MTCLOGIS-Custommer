// =========================================================================
// 1. ตั้งค่าการเชื่อมต่อฐานข้อมูล Google Sheets
// =========================================================================

// (ทางเลือก) หากสร้างสคริปต์นี้เป็นแบบ Standalone (เปิด Apps Script แยกต่างหาก ไม่ได้เปิดจากใน Google Sheets)
// ให้นำ ID ของ Google Sheets (คัดลอกได้จาก URL ของชีตของคุณ) มาวางใส่ในเครื่องหมายคำพูดด้านล่าง
// เช่น: const SPREADSHEET_ID = "1NBDytEODJxXJiiQEpBuSOjllnQK20zi0fz3aMkpOGyc";
const SPREADSHEET_ID = "1NBDytEODJxXJiiQEpBuSOjllnQK20zi0fz3aMkpOGyc"; 

/**
 * ฟังก์ชันช่วยเปิดสเปรดชีตที่กำลังใช้งานอย่างถูกต้อง
 */
function getActiveSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch (e) {
      // หากเปิดด้วย ID ไม่ได้ ให้ลองดึงแบบ Active เผื่อเป็น Container-bound script
      const activeSs = SpreadsheetApp.getActiveSpreadsheet();
      if (activeSs) return activeSs;
      throw new Error("ไม่สามารถเปิด Google Sheets ด้วย ID ที่ระบุได้ และไม่มีสเปรดชีตที่กำลังใช้งาน: " + e.toString());
    }
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error(
      "ไม่พบ Google Sheets ที่เชื่อมต่อ! " +
      "กรุณาตรวจสอบว่าคุณได้สร้างสคริปต์นี้จากเมนู 'ส่วนขยาย (Extensions)' -> 'Apps Script' ในหน้า Google Sheets " +
      "หรือนำ ID ของ Google Sheets มากรอกใส่ที่ตัวแปร SPREADSHEET_ID ที่บรรทัดแรกสุดของสคริปต์นี้"
    );
  }
  return ss;
}

/**
 * ฟังก์ชันช่วยดึงชีต หรือสร้างใหม่พร้อมหัวตารางหากไม่มีชีตนั้น (Self-healing database)
 */
function getOrCreateSheet(sheetName) {
  const ss = getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    let headers = [];
    if (sheetName === 'Products') {
      headers = ['SKU', 'Name', 'Category', 'UOM', 'Description', 'Quantity', 'SupplierID', 'DateAdded'];
    } else if (sheetName === 'Suppliers') {
      headers = ['SupplierID', 'CompanyName', 'TaxID', 'BusinessType', 'ContactPerson', 'Phone', 'Email', 'RegisteredAddress', 'MailingAddress', 'DateAdded'];
    } else if (sheetName === 'AuditLogs') {
      headers = ['Timestamp', 'ActionType', 'RecordType', 'PrimaryKey', 'SupplierID', 'Details', 'Creator', 'Editor', 'Preparer', 'Reason'];
    }
    if (headers.length > 0) {
      sheet.appendRow(headers);
    }
  }
  return sheet;
}

// =========================================================================
// 2. การจัดการ API Request (doGet & doPost)
// =========================================================================

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  try {
    let result = {};

    if (method === 'GET') {
      const action = e.parameter.action;
      if (action === 'get_products') result = getProducts();
      else if (action === 'get_suppliers') result = getSuppliers();
      else if (action === 'get_audit_logs') result = getAuditLogs();
      else throw new Error('Invalid GET action');
    } else if (method === 'POST') {
      const data = JSON.parse(e.postData.contents);
      const postAction = data.action;
      
      if (postAction === 'add_product') result = addProduct(data);
      else if (postAction === 'edit_product') result = editProduct(data);
      else if (postAction === 'delete_product') result = deleteProduct(data);
      else if (postAction === 'add_supplier') result = addSupplier(data);
      else if (postAction === 'edit_supplier') result = editSupplier(data);
      else if (postAction === 'delete_supplier') result = deleteSupplier(data);
      else throw new Error('Invalid POST action');
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Helper ในการดึงข้อมูลจากชีตเป็นรูปแบบ Array of Objects
function getSheetData(sheetName) {
  const sheet = getOrCreateSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const headers = data[0];
  const rows = data.slice(1);
  
  return rows.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

function getProducts() { return getSheetData('Products'); }
function getSuppliers() { return getSheetData('Suppliers'); }
function getAuditLogs() { return getSheetData('AuditLogs'); }

function logAudit(actionType, recordType, primaryKey, supplierId, details, user1, user2, user3, reason) {
  const sheet = getOrCreateSheet('AuditLogs');
  const timestamp = new Date();
  sheet.appendRow([timestamp, actionType, recordType, primaryKey, supplierId || '', details, user1, user2, user3, reason || '-']);
}

// =========================================================================
// 3. ฟังก์ชันการจัดการสินค้า (Products)
// =========================================================================

function addProduct(data) {
  const sheet = getOrCreateSheet('Products');
  const products = getProducts();
  
  if (products.some(p => p.SKU === data.sku)) {
    throw new Error('รหัสสินค้า (SKU) ซ้ำ ไม่สามารถเพิ่มได้');
  }
  if (products.some(p => p.Name === data.name)) {
    throw new Error('ชื่อสินค้าซ้ำ ไม่สามารถเพิ่มได้');
  }
  
  sheet.appendRow([
    data.sku, 
    data.name, 
    data.category, 
    data.uom, 
    data.description || '', 
    Number(data.quantity), 
    data.supplierId || '',
    new Date().toISOString()
  ]);
  
  logAudit('ADD', 'Product', data.sku, data.supplierId, `เพิ่มสินค้า: ${data.name} UOM: ${data.uom} จำนวน: ${data.quantity}`, data.creator, data.editor, data.preparer, 'เพิ่มใหม่');
  return 'Product added successfully';
}

function editProduct(data) {
  const sheet = getOrCreateSheet('Products');
  const rows = sheet.getDataRange().getValues();
  const products = getProducts();

  const currentProduct = products.find(p => p.SKU === data.sku);
  if (currentProduct && currentProduct.Name !== data.name) {
    if (products.some(p => p.Name === data.name)) {
      throw new Error('ชื่อสินค้าซ้ำ ไม่สามารถแก้ไขเป็นชื่อนี้ได้');
    }
  }
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.sku) {
      sheet.getRange(i + 1, 2).setValue(data.name);
      sheet.getRange(i + 1, 3).setValue(data.category);
      sheet.getRange(i + 1, 4).setValue(data.uom);
      sheet.getRange(i + 1, 5).setValue(data.description || '');
      sheet.getRange(i + 1, 6).setValue(Number(data.quantity));
      sheet.getRange(i + 1, 7).setValue(data.supplierId || '');
      
      logAudit('EDIT', 'Product', data.sku, data.supplierId, `แก้ไขสินค้า: ${data.name} จำนวน: ${data.quantity}`, data.creator, data.editor, data.preparer, data.reason);
      return 'Product updated successfully';
    }
  }
  throw new Error('ไม่พบสินค้านี้');
}

function deleteProduct(data) {
  const sheet = getOrCreateSheet('Products');
  const rows = sheet.getDataRange().getValues();
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.sku) {
      sheet.deleteRow(i + 1);
      logAudit('DELETE', 'Product', data.sku, '', `ลบสินค้า`, data.creator, data.editor, data.preparer, data.reason);
      return 'Product deleted successfully';
    }
  }
  throw new Error('ไม่พบสินค้านี้');
}

// =========================================================================
// 4. ฟังก์ชันการจัดการคู่ค้า (Suppliers)
// =========================================================================

function addSupplier(data) {
  const sheet = getOrCreateSheet('Suppliers');
  const suppliers = getSuppliers();
  
  if (suppliers.some(s => s.SupplierID === data.supplierId)) {
    throw new Error('รหัสคู่ค้า ซ้ำ');
  }
  if (suppliers.some(s => s.CompanyName === data.companyName)) {
    throw new Error('ชื่อบริษัท / ห้างหุ้นส่วน ซ้ำ');
  }
  if (suppliers.some(s => s.TaxID === data.taxId)) {
    throw new Error('เลขประจำตัวผู้เสียภาษี ซ้ำ');
  }
  
  sheet.appendRow([
    data.supplierId, 
    data.companyName, 
    data.taxId, 
    data.businessType || '', 
    data.contactPerson || '',
    data.phone, 
    data.email || '',
    data.registeredAddress,
    data.mailingAddress || '',
    new Date().toISOString()
  ]);
  
  logAudit('ADD', 'Supplier', data.supplierId, data.supplierId, `เพิ่มคู่ค้า: ${data.companyName}`, data.creator, data.editor, data.preparer, 'เพิ่มใหม่');
  return 'Supplier added successfully';
}

function editSupplier(data) {
  const sheet = getOrCreateSheet('Suppliers');
  const rows = sheet.getDataRange().getValues();
  const suppliers = getSuppliers();
  
  const currentSupplier = suppliers.find(s => s.SupplierID === data.supplierId);
  if (currentSupplier) {
    if (currentSupplier.CompanyName !== data.companyName && suppliers.some(s => s.CompanyName === data.companyName)) {
      throw new Error('ชื่อบริษัท / ห้างหุ้นส่วน ซ้ำ');
    }
    if (currentSupplier.TaxID !== data.taxId && suppliers.some(s => s.TaxID === data.taxId)) {
      throw new Error('เลขประจำตัวผู้เสียภาษี ซ้ำ');
    }
  }

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.supplierId) {
      sheet.getRange(i + 1, 2).setValue(data.companyName);
      sheet.getRange(i + 1, 3).setValue(data.taxId);
      sheet.getRange(i + 1, 4).setValue(data.businessType || '');
      sheet.getRange(i + 1, 5).setValue(data.contactPerson || '');
      sheet.getRange(i + 1, 6).setValue(data.phone);
      sheet.getRange(i + 1, 7).setValue(data.email || '');
      sheet.getRange(i + 1, 8).setValue(data.registeredAddress);
      sheet.getRange(i + 1, 9).setValue(data.mailingAddress || '');
      
      logAudit('EDIT', 'Supplier', data.supplierId, data.supplierId, `แก้ไขคู่ค้า: ${data.companyName}`, data.creator, data.editor, data.preparer, data.reason);
      return 'Supplier updated successfully';
    }
  }
  throw new Error('ไม่พบคู่ค้านี้');
}

function deleteSupplier(data) {
  const sheet = getOrCreateSheet('Suppliers');
  const rows = sheet.getDataRange().getValues();
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.supplierId) {
      sheet.deleteRow(i + 1);
      logAudit('DELETE', 'Supplier', data.supplierId, data.supplierId, `ลบคู่ค้า`, data.creator, data.editor, data.preparer, data.reason);
      return 'Supplier deleted successfully';
    }
  }
  throw new Error('ไม่พบคู่ค้านี้');
}

// =========================================================================
// 5. ตัวช่วยสร้างข้อมูลจำลองเริ่มต้น (Mock Data Seeder)
// =========================================================================

/**
 * ฟังก์ชันสร้างข้อมูลจำลองเริ่มต้น 5 รายการ
 * สามารถเลือกชื่อฟังก์ชันนี้และกด "เรียกใช้ (Run)" บน Google Apps Script เพื่อเติมข้อมูลทดสอบลงในสเปรดชีตอัตโนมัติ
 */
function createMockData() {
  // สร้างชีตทั้งหมดและใส่หัวตาราง
  const sheetProducts = getOrCreateSheet('Products');
  const sheetSuppliers = getOrCreateSheet('Suppliers');
  const sheetLogs = getOrCreateSheet('AuditLogs');
  
  // เคลียร์ข้อมูลเดิมในตารางออก
  sheetProducts.clear();
  sheetProducts.appendRow(['SKU', 'Name', 'Category', 'UOM', 'Description', 'Quantity', 'DateAdded']);
  
  sheetSuppliers.clear();
  sheetSuppliers.appendRow(['SupplierID', 'CompanyName', 'TaxID', 'BusinessType', 'ContactPerson', 'Phone', 'Email', 'RegisteredAddress', 'MailingAddress', 'DateAdded']);
  
  sheetLogs.clear();
  sheetLogs.appendRow(['Timestamp', 'ActionType', 'RecordType', 'PrimaryKey', 'SupplierID', 'Details', 'Creator', 'Editor', 'Preparer', 'Reason']);
  
  // เติมสินค้าสินค้าทดสอบ
  const p1 = ['PROD-COM-001', 'คอมพิวเตอร์แล็ปท็อป 15 นิ้ว', 'อะไหล่', 'ชิ้น', 'สเปก Core i7, RAM 16GB, SSD 512GB', 15, 'SUP-001', new Date().toISOString()];
  const p2 = ['PROD-BOX-002', 'กล่องกระดาษลูกฟูก ขนาด ก', 'บรรจุภัณฑ์', 'ลัง', 'กล่องใส่สินค้าหนา 3 ชั้น', 200, 'SUP-002', new Date().toISOString()];
  const p3 = ['PROD-KEY-003', 'คีย์บอร์ดไร้สายบลูทูธ', 'อะไหล่', 'ชิ้น', 'คีย์บอร์ดไร้เสียงสำหรับสำนักงาน', 45, 'SUP-001', new Date().toISOString()];
  const p4 = ['PROD-PAP-004', 'กระดาษ A4 80 แกรม', 'วัสดุสิ้นเปลือง', 'กล่อง', 'กระดาษถ่ายเอกสาร 5 รีม/กล่อง', 80, 'SUP-003', new Date().toISOString()];
  const p5 = ['PROD-PEN-005', 'ปากกาเจลสีน้ำเงิน 0.5 มม.', 'วัสดุสิ้นเปลือง', 'กล่อง', 'บรรจุกระปุกละ 50 ด้าม', 120, 'SUP-005', new Date().toISOString()];
  
  const mockProducts = [p1, p2, p3, p4, p5];
  mockProducts.forEach(row => sheetProducts.appendRow(row));
  
  // เติมข้อมูลคู่ค้าทดสอบ
  const s1 = ['SUP-001', 'บจก. ไทยแลนด์ดิจิตอล', '1234567890123', '', 'คุณสมศักดิ์ มั่งมี', '02-555-9999', 'sales@thaidigital.com', '99/9 ถนนวิภาวดีรังสิต กรุงเทพฯ', '99/9 ถนนวิภาวดีรังสิต กรุงเทพฯ', new Date().toISOString()];
  const s2 = ['SUP-002', 'หจก. รุ่งเรืองแพคเกจจิ้ง', '9876543210987', '', 'คุณจารุวรรณ ใฝ่ดี', '034-123456', 'info@rungruangpack.com', '123 ต.อ้อมใหญ่ จ.นครปฐม', '123 ต.อ้อมใหญ่ จ.นครปฐม', new Date().toISOString()];
  const s3 = ['SUP-003', 'บจก. สยามออฟฟิศซัพพลาย', '5554443332221', '', 'คุณธนพล รักเรียน', '02-111-2222', 'contact@siamoffice.co.th', '456 ถนนพหลโยธิน กรุงเทพฯ', '456 ถนนพหลโยธิน กรุงเทพฯ', new Date().toISOString()];
  const s4 = ['SUP-004', 'บจก. โกลบอลเทรดดิ้ง', '1112223334445', '', 'คุณสุรชัย ใจดี', '02-888-7777', 'surachai@globaltrade.com', '789 ถนนพระราม 9 กรุงเทพฯ', '789 ถนนพระราม 9 กรุงเทพฯ', new Date().toISOString()];
  const s5 = ['SUP-005', 'หจก. สมาร์ทสเตชั่นเนอรี่', '3330009998887', '', 'คุณวิภาวรรณ สวยงาม', '081-234-5678', 'wipawan@smartstation.com', '10/5 ถนนมิตรภาพ จ.นครราชสีมา', '10/5 ถนนมิตรภาพ จ.นครราชสีมา', new Date().toISOString()];
  
  const mockSuppliers = [s1, s2, s3, s4, s5];
  mockSuppliers.forEach(row => sheetSuppliers.appendRow(row));

  // เติมประวัติทดสอบ
  const prepName = 'นายปาณชัย พรมภักดี';
  const l1 = [new Date(), 'ADD', 'Product', 'PROD-COM-001', 'SUP-001', 'เพิ่มสินค้า: โน้ตบุ๊ก', 'นายสมชาย', '', prepName, 'เพิ่มระบบ'];
  const l2 = [new Date(), 'ADD', 'Product', 'PROD-BOX-002', 'SUP-002', 'เพิ่มสินค้า: กล่องลูกฟูก', 'นายสมชาย', '', prepName, 'เพิ่มระบบ'];
  const l3 = [new Date(), 'ADD', 'Supplier', 'SUP-001', 'SUP-001', 'เพิ่มคู่ค้า: บจก.ไทยแลนด์', 'นายสมชาย', '', prepName, 'เพิ่มระบบ'];
  const l4 = [new Date(), 'ADD', 'Supplier', 'SUP-002', 'SUP-002', 'เพิ่มคู่ค้า: หจก.รุ่งเรือง', 'นายสมชาย', '', prepName, 'เพิ่มระบบ'];
  
  const mockLogs = [l1, l2, l3, l4];
  mockLogs.forEach(row => sheetLogs.appendRow(row));
  
  return 'สร้างข้อมูลจำลอง 5 รายการลงในชีตของคุณสำเร็จเรียบร้อยแล้ว!';
}
