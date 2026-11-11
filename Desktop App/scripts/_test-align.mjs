const ExcelJS = require('exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('t');
  const cell = sheet.getCell(1,1);
  cell.value = 100;
  cell.alignment = { vertical: 'middle' };
  // mimic moneyCells
  cell.numFmt = '#,##0';
  cell.alignment = { ...(cell.alignment || {}), horizontal: 'right' };
  console.log('alignment after spread', cell.alignment);
  const buf = await wb.xlsx.writeBuffer();
  console.log('wrote', buf.byteLength);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
