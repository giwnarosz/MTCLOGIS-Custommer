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
      headers = ['SKU', 'Barcode', 'Zone', 'Name', 'Category', 'UOM', 'Description', 'Quantity', 'SupplierID', 'DateAdded'];
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
      else if (postAction === 'issue_product') result = issueProduct(data);
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
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const products = getProducts();
  
  const targetSku = String(data.sku || '').trim().toLowerCase();
  const targetName = String(data.name || '').trim().toLowerCase();
  
  if (targetSku === '') {
    throw new Error('กรุณาระบุรหัสสินค้า (SKU)');
  }
  
  // Duplication checks: Case-insensitive, trimmed, ignoring empty rows
  const isDuplicateSku = products.some(p => {
    const val = String(p.SKU || '').trim().toLowerCase();
    return val !== '' && val === targetSku;
  });
  if (isDuplicateSku) {
    throw new Error('รหัสสินค้า (SKU) ซ้ำ ไม่สามารถเพิ่มได้');
  }
  
  const isDuplicateName = products.some(p => {
    const val = String(p.Name || '').trim().toLowerCase();
    return val !== '' && val === targetName;
  });
  if (isDuplicateName) {
    throw new Error('ชื่อสินค้าซ้ำ ไม่สามารถเพิ่มได้');
  }
  
  // Create row matching headers order dynamically
  const newRow = headers.map(header => {
    switch (header) {
      case 'SKU': return data.sku;
      case 'Barcode': return data.barcode || '';
      case 'SupplierID': return data.supplierId || '';
      case 'Zone': return data.zone || '';
      case 'Name': return data.name;
      case 'Category': return data.category;
      case 'UOM': return data.uom;
      case 'Description': return data.description || '';
      case 'Quantity': return Number(data.quantity);
      case 'DateAdded': return new Date().toISOString();
      default: return '';
    }
  });
  
  sheet.appendRow(newRow);
  
  logAudit('ADD', 'Product', data.sku, data.supplierId, `เพิ่มสินค้า: ${data.name} UOM: ${data.uom} จำนวน: ${data.quantity}`, data.creator, data.editor, data.preparer, 'เพิ่มใหม่');
  return 'Product added successfully';
}

function editProduct(data) {
  const sheet = getOrCreateSheet('Products');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const products = getProducts();

  const targetSku = String(data.sku || '').trim().toLowerCase();
  const targetName = String(data.name || '').trim().toLowerCase();

  const currentProduct = products.find(p => String(p.SKU || '').trim().toLowerCase() === targetSku);
  if (currentProduct && String(currentProduct.Name || '').trim().toLowerCase() !== targetName) {
    const isDuplicateName = products.some(p => {
      const pSku = String(p.SKU || '').trim().toLowerCase();
      const pName = String(p.Name || '').trim().toLowerCase();
      return pSku !== targetSku && pName !== '' && pName === targetName;
    });
    if (isDuplicateName) {
      throw new Error('ชื่อสินค้าซ้ำ ไม่สามารถแก้ไขเป็นชื่อนี้ได้');
    }
  }
  
  // Find column indices (1-based for getRange)
  const barcodeCol = headers.indexOf('Barcode') + 1;
  const supplierCol = headers.indexOf('SupplierID') + 1;
  const zoneCol = headers.indexOf('Zone') + 1;
  const nameCol = headers.indexOf('Name') + 1;
  const categoryCol = headers.indexOf('Category') + 1;
  const uomCol = headers.indexOf('UOM') + 1;
  const descCol = headers.indexOf('Description') + 1;
  const qtyCol = headers.indexOf('Quantity') + 1;

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === targetSku) {
      if (barcodeCol > 0) sheet.getRange(i + 1, barcodeCol).setValue(data.barcode || '');
      if (supplierCol > 0) sheet.getRange(i + 1, supplierCol).setValue(data.supplierId || '');
      if (zoneCol > 0) sheet.getRange(i + 1, zoneCol).setValue(data.zone || '');
      if (nameCol > 0) sheet.getRange(i + 1, nameCol).setValue(data.name);
      if (categoryCol > 0) sheet.getRange(i + 1, categoryCol).setValue(data.category);
      if (uomCol > 0) sheet.getRange(i + 1, uomCol).setValue(data.uom);
      if (descCol > 0) sheet.getRange(i + 1, descCol).setValue(data.description || '');
      if (qtyCol > 0) sheet.getRange(i + 1, qtyCol).setValue(Number(data.quantity));
      
      logAudit('EDIT', 'Product', data.sku, data.supplierId, `แก้ไขสินค้า: ${data.name} จำนวน: ${data.quantity}`, data.creator, data.editor, data.preparer, data.reason);
      return 'Product updated successfully';
    }
  }
  throw new Error('ไม่พบสินค้านี้');
}

function deleteProduct(data) {
  const sheet = getOrCreateSheet('Products');
  const rows = sheet.getDataRange().getValues();
  const targetSku = String(data.sku || '').trim().toLowerCase();
  
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === targetSku) {
      sheet.deleteRow(i + 1);
      logAudit('DELETE', 'Product', data.sku, '', `ลบสินค้า`, data.creator, data.editor, data.preparer, data.reason);
      return 'Product deleted successfully';
    }
  }
  throw new Error('ไม่พบสินค้านี้');
}

function issueProduct(data) {
  const sheet = getOrCreateSheet('Products');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  
  const skuCol = headers.indexOf('SKU') + 1;
  const qtyCol = headers.indexOf('Quantity') + 1;
  const zoneCol = headers.indexOf('Zone') + 1;
  const nameCol = headers.indexOf('Name') + 1;
  
  if (skuCol === 0 || qtyCol === 0) {
    throw new Error('ไม่พบโครงสร้างคอลัมน์ SKU หรือ Quantity ในชีต Products');
  }
  
  const items = data.items || [];
  if (items.length === 0) {
    throw new Error('กรุณาระบุสินค้าที่ต้องการเบิก');
  }
  
  // First validate all items to make sure none exceed on-hand qty (all-or-nothing check)
  for (let k = 0; k < items.length; k++) {
    const item = items[k];
    const targetSku = String(item.sku || '').trim().toLowerCase();
    const issuedQty = Number(item.issuedQuantity || 0);
    const damagedQty = Number(item.damagedQuantity || 0);
    const totalDeduct = issuedQty + damagedQty;
    
    if (totalDeduct <= 0) {
      throw new Error(`จำนวนรวมที่เบิกและเสียหายของ SKU ${item.sku} ต้องมากกว่า 0`);
    }
    
    let found = false;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][skuCol - 1] || '').trim().toLowerCase() === targetSku) {
        found = true;
        const currentQty = Number(rows[i][qtyCol - 1] || 0);
        if (currentQty < totalDeduct) {
          throw new Error(`สินค้า ${rows[i][nameCol - 1] || item.sku} คงคลังไม่เพียงพอ (มีอยู่ ${currentQty} แต่ต้องการเบิก/เสียหาย ${totalDeduct})`);
        }
        break;
      }
    }
    if (!found) {
      throw new Error(`ไม่พบสินค้า SKU ${item.sku} ในระบบ`);
    }
  }
  
  const results = [];
  // Perform the deduction and logging for each item
  for (let k = 0; k < items.length; k++) {
    const item = items[k];
    const targetSku = String(item.sku || '').trim().toLowerCase();
    const issuedQty = Number(item.issuedQuantity || 0);
    const damagedQty = Number(item.damagedQuantity || 0);
    const totalDeduct = issuedQty + damagedQty;
    
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][skuCol - 1] || '').trim().toLowerCase() === targetSku) {
        const currentQty = Number(rows[i][qtyCol - 1] || 0);
        const remainingQty = currentQty - totalDeduct;
        
        // Update sheet
        sheet.getRange(i + 1, qtyCol).setValue(remainingQty);
        // Update rows array in case there are duplicates or subsequent operations
        rows[i][qtyCol - 1] = remainingQty;
        
        const zoneVal = zoneCol > 0 ? rows[i][zoneCol - 1] : '';
        const nameVal = nameCol > 0 ? rows[i][nameCol - 1] : '';
        
        const details = `ตำแหน่ง: ${zoneVal} | ก่อนเบิก: ${currentQty} | เบิกออก: ${issuedQty} | เสียหาย: ${damagedQty} | หลังเบิก: ${remainingQty}`;
        
        logAudit(
          'ISSUE', 
          'Product', 
          item.sku, 
          item.supplierId, 
          details, 
          data.creator, 
          '', 
          'นายปาณชัย พรมภักดี', 
          data.reason
        );
        
        results.push({
          sku: item.sku,
          name: nameVal,
          zone: zoneVal,
          previousQuantity: currentQty,
          issuedQuantity: issuedQty,
          damagedQuantity: damagedQty,
          remainingQuantity: remainingQty
        });
        break;
      }
    }
  }
  
  return {
    message: 'เบิกสินค้าสำเร็จ',
    results: results
  };
}

// =========================================================================
// 4. ฟังก์ชันการจัดการคู่ค้า (Suppliers)
// =========================================================================

function addSupplier(data) {
  const sheet = getOrCreateSheet('Suppliers');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const suppliers = getSuppliers();
  
  const targetSupId = String(data.supplierId || '').trim().toLowerCase();
  const targetName = String(data.companyName || '').trim().toLowerCase();
  const targetTaxId = String(data.taxId || '').trim().toLowerCase();
  
  if (targetSupId === '') {
    throw new Error('กรุณาระบุรหัสคู่ค้า');
  }
  
  const isDuplicateId = suppliers.some(s => {
    const val = String(s.SupplierID || '').trim().toLowerCase();
    return val !== '' && val === targetSupId;
  });
  if (isDuplicateId) {
    throw new Error('รหัสคู่ค้า ซ้ำ');
  }
  
  const isDuplicateName = suppliers.some(s => {
    const val = String(s.CompanyName || '').trim().toLowerCase();
    return val !== '' && val === targetName;
  });
  if (isDuplicateName) {
    throw new Error('ชื่อบริษัท / ห้างหุ้นส่วน ซ้ำ');
  }
  
  const isDuplicateTax = suppliers.some(s => {
    const val = String(s.TaxID || '').trim().toLowerCase();
    return val !== '' && val === targetTaxId;
  });
  if (isDuplicateTax) {
    throw new Error('เลขประจำตัวผู้เสียภาษี ซ้ำ');
  }
  
  // Create row matching headers order dynamically
  const newRow = headers.map(header => {
    switch (header) {
      case 'SupplierID': return data.supplierId;
      case 'CompanyName': return data.companyName;
      case 'TaxID': return "'" + data.taxId;
      case 'BusinessType': return data.businessType || '';
      case 'ContactPerson': return data.contactPerson || '';
      case 'Phone': return "'" + data.phone;
      case 'Email': return data.email || '';
      case 'RegisteredAddress': return data.registeredAddress;
      case 'MailingAddress': return data.mailingAddress || '';
      case 'DateAdded': return new Date().toISOString();
      default: return '';
    }
  });

  sheet.appendRow(newRow);
  
  logAudit('ADD', 'Supplier', data.supplierId, data.supplierId, `เพิ่มคู่ค้า: ${data.companyName}`, data.creator, data.editor, data.preparer, 'เพิ่มใหม่');
  return 'Supplier added successfully';
}

function editSupplier(data) {
  const sheet = getOrCreateSheet('Suppliers');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const suppliers = getSuppliers();
  
  const targetSupId = String(data.supplierId || '').trim().toLowerCase();
  const targetName = String(data.companyName || '').trim().toLowerCase();
  const targetTaxId = String(data.taxId || '').trim().toLowerCase();
  
  const currentSupplier = suppliers.find(s => String(s.SupplierID || '').trim().toLowerCase() === targetSupId);
  if (currentSupplier) {
    if (String(currentSupplier.CompanyName || '').trim().toLowerCase() !== targetName) {
      const isDuplicateName = suppliers.some(s => {
        const sId = String(s.SupplierID || '').trim().toLowerCase();
        const sName = String(s.CompanyName || '').trim().toLowerCase();
        return sId !== targetSupId && sName !== '' && sName === targetName;
      });
      if (isDuplicateName) {
        throw new Error('ชื่อบริษัท / ห้างหุ้นส่วน ซ้ำ');
      }
    }
    if (String(currentSupplier.TaxID || '').trim().toLowerCase() !== targetTaxId) {
      const isDuplicateTax = suppliers.some(s => {
        const sId = String(s.SupplierID || '').trim().toLowerCase();
        const sTax = String(s.TaxID || '').trim().toLowerCase();
        return sId !== targetSupId && sTax !== '' && sTax === targetTaxId;
      });
      if (isDuplicateTax) {
        throw new Error('เลขประจำตัวผู้เสียภาษี ซ้ำ');
      }
    }
  }

  // Find column indices (1-based for getRange)
  const companyCol = headers.indexOf('CompanyName') + 1;
  const taxCol = headers.indexOf('TaxID') + 1;
  const businessCol = headers.indexOf('BusinessType') + 1;
  const contactCol = headers.indexOf('ContactPerson') + 1;
  const phoneCol = headers.indexOf('Phone') + 1;
  const emailCol = headers.indexOf('Email') + 1;
  const regAddressCol = headers.indexOf('RegisteredAddress') + 1;
  const mailAddressCol = headers.indexOf('MailingAddress') + 1;

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.supplierId) {
      if (companyCol > 0) sheet.getRange(i + 1, companyCol).setValue(data.companyName);
      if (taxCol > 0) sheet.getRange(i + 1, taxCol).setValue("'" + data.taxId);
      if (businessCol > 0) sheet.getRange(i + 1, businessCol).setValue(data.businessType || '');
      if (contactCol > 0) sheet.getRange(i + 1, contactCol).setValue(data.contactPerson || '');
      if (phoneCol > 0) sheet.getRange(i + 1, phoneCol).setValue("'" + data.phone);
      if (emailCol > 0) sheet.getRange(i + 1, emailCol).setValue(data.email || '');
      if (regAddressCol > 0) sheet.getRange(i + 1, regAddressCol).setValue(data.registeredAddress);
      if (mailAddressCol > 0) sheet.getRange(i + 1, mailAddressCol).setValue(data.mailingAddress || '');
      
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

function createMockData() {
  const sheetProducts = getOrCreateSheet('Products');
  const sheetSuppliers = getOrCreateSheet('Suppliers');
  const sheetLogs = getOrCreateSheet('AuditLogs');
  
  sheetProducts.clear();
  sheetProducts.appendRow(['SKU', 'Barcode', 'SupplierID', 'Zone', 'Name', 'Category', 'UOM', 'Description', 'Quantity', 'DateAdded']);
  
  sheetSuppliers.clear();
  sheetSuppliers.appendRow(['SupplierID', 'CompanyName', 'TaxID', 'BusinessType', 'ContactPerson', 'Phone', 'Email', 'RegisteredAddress', 'MailingAddress', 'DateAdded']);
  
  sheetLogs.clear();
  sheetLogs.appendRow(['Timestamp', 'ActionType', 'RecordType', 'PrimaryKey', 'SupplierID', 'Details', 'Creator', 'Editor', 'Preparer', 'Reason']);
  
  const p1 = ['PROD-COM-001', '8850001234567', 'SUP-001', 'A-01', 'คอมพิวเตอร์แล็ปท็อป 15 นิ้ว', 'อะไหล่', 'ชิ้น', 'สเปก Core i7, RAM 16GB, SSD 512GB', 15, new Date().toISOString()];
  const p2 = ['PROD-BOX-002', '8850007654321', 'SUP-002', 'B-02', 'กล่องกระดาษลูกฟูก ขนาด ก', 'บรรจุภัณฑ์', 'ลัง', 'กล่องใส่สินค้าหนา 3 ชั้น', 200, new Date().toISOString()];
  const p3 = ['PROD-KEY-003', '8850001112223', 'SUP-001', 'A-02', 'คีย์บอร์ดไร้สายบลูทูธ', 'อะไหล่', 'ชิ้น', 'คีย์บอร์ดไร้เสียงสำหรับสำนักงาน', 45, new Date().toISOString()];
  const p4 = ['PROD-PAP-004', '8850003334445', 'SUP-003', 'C-01', 'กระดาษ A4 80 แกรม', 'วัสดุสิ้นเปลือง', 'กล่อง', 'กระดาษถ่ายเอกสาร 5 รีม/กล่อง', 80, new Date().toISOString()];
  const p5 = ['PROD-PEN-005', '8850005556667', 'SUP-005', 'D-01', 'ปากกาเจลสีน้ำเงิน 0.5 มม.', 'วัสดุสิ้นเปลือง', 'กล่อง', 'บรรจุกระปุกละ 50 ด้าม', 120, new Date().toISOString()];
  
  const mockProducts = [p1, p2, p3, p4, p5];
  mockProducts.forEach(row => sheetProducts.appendRow(row));
  
  const s1 = ['SUP-001', 'บจก. ไทยแลนด์ดิจิตอล', '1234567890123', '', 'คุณสมศักดิ์ มั่งมี', '02-555-9999', 'sales@thaidigital.com', '99/9 ถนนวิภาวดีรังสิต กรุงเทพฯ', '99/9 ถนนวิภาวดีรังสิต กรุงเทพฯ', new Date().toISOString()];
  const s2 = ['SUP-002', 'หจก. รุ่งเรืองแพคเกจจิ้ง', '9876543210987', '', 'คุณจารุวรรณ ใฝ่ดี', '034-123456', 'info@rungruangpack.com', '123 ต.อ้อมใหญ่ จ.นครปฐม', '123 ต.อ้อมใหญ่ จ.นครปฐม', new Date().toISOString()];
  const s3 = ['SUP-003', 'บจก. สยามออฟฟิศซัพพลาย', '5554443332221', '', 'คุณธนพล รักเรียน', '02-111-2222', 'contact@siamoffice.co.th', '456 ถนนพหลโยธิน กรุงเทพฯ', '456 ถนนพหลโยธิน กรุงเทพฯ', new Date().toISOString()];
  const s4 = ['SUP-004', 'บจก. โกลบอลเทรดดิ้ง', '1112223334445', '', 'คุณสุรชัย ใจดี', '02-888-7777', 'surachai@globaltrade.com', '789 ถนนพระราม 9 กรุงเทพฯ', '789 ถนนพระราม 9 กรุงเทพฯ', new Date().toISOString()];
  const s5 = ['SUP-005', 'หจก. สมาร์ทสเตชั่นเนอรี่', '3330009998887', '', 'คุณวิภาวรรณ สวยงาม', '081-234-5678', 'wipawan@smartstation.com', '10/5 ถนนมิตรภาพ จ.นครราชสีมา', '10/5 ถนนมิตรภาพ จ.นครราชสีมา', new Date().toISOString()];
  
  const mockSuppliers = [s1, s2, s3, s4, s5];
  mockSuppliers.forEach(row => sheetSuppliers.appendRow(row));

  const prepName = 'นายปาณชัย พรมภักดี';
  const l1 = [new Date(), 'ADD', 'Product', 'PROD-COM-001', 'SUP-001', 'เพิ่มสินค้า: โน้ตบุ๊ก', 'นายสมชาย', '', prepName, 'เพิ่มระบบ'];
  const l2 = [new Date(), 'ADD', 'Product', 'PROD-BOX-002', 'SUP-002', 'เพิ่มสินค้า: กล่องลูกฟูก', 'นายสมชาย', '', prepName, 'เพิ่มระบบ'];
  const l3 = [new Date(), 'ADD', 'Supplier', 'SUP-001', 'SUP-001', 'เพิ่มคู่ค้า: บจก.ไทยแลนด์', 'นายสมชาย', '', prepName, 'เพิ่มระบบ'];
  const l4 = [new Date(), 'ADD', 'Supplier', 'SUP-002', 'SUP-002', 'เพิ่มคู่ค้า: หจก.รุ่งเรือง', 'นายสมชาย', '', prepName, 'เพิ่มระบบ'];
  
  const mockLogs = [l1, l2, l3, l4];
  mockLogs.forEach(row => sheetLogs.appendRow(row));
  
  return 'สร้างข้อมูลจำลองสำเร็จ!';
}
