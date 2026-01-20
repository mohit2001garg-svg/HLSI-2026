
import ExcelJS from 'exceljs';

export const exportToExcel = async (
  data: any[], 
  columns: { header: string; key: string; width?: number }[], 
  sheetName: string, 
  filename: string
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // 1. Setup Grid
  worksheet.columns = columns.map(col => ({ 
    key: col.key, 
    width: col.width || 15 
  }));

  // 2. Logo & Branding Logic
  let startRow = 1;
  
  try {
    const savedBranding = localStorage.getItem('app_branding');
    let logoUrl = 'asset/logo.png'; 
    let companyName = 'HI-LINE STONE';

    if (savedBranding) {
        const parsed = JSON.parse(savedBranding);
        if (parsed.logoUrl) logoUrl = parsed.logoUrl;
        if (parsed.companyName) companyName = parsed.companyName;
    }

    // Prepare white background for header area (Rows 1-5, enough columns to cover headers)
    for(let r=1; r<=5; r++) {
      for(let c=1; c<=Math.max(columns.length, 15); c++) {
        const cell = worksheet.getCell(r, c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      }
    }

    const response = await fetch(logoUrl);
    if (response.ok) {
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();

        const imageId = workbook.addImage({
            buffer: buffer,
            extension: 'png',
        });

        worksheet.addImage(imageId, {
            tl: { col: 0, row: 0 },
            ext: { width: 110, height: 75 }
        });

        worksheet.mergeCells(`C2:${String.fromCharCode(65 + Math.min(columns.length, 8))}3`); 
        const titleCell = worksheet.getCell('C2');
        titleCell.value = companyName + " - " + sheetName;
        titleCell.font = { name: 'Arial', size: 20, bold: true, color: { argb: 'FF000000' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

        startRow = 6;
    }
  } catch (err) {
    console.warn("Excel Logo Error:", err);
    startRow = 1; 
  }

  // 3. Create Custom Header Row
  const headerRow = worksheet.getRow(startRow);
  headerRow.values = columns.map(col => col.header);
  
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF5C4033' } // Dark brown
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 25;

  headerRow.eachCell((cell) => {
    cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
    };
  });

  // 4. Add Data Rows
  data.forEach(item => {
    const row = worksheet.addRow(item);
    row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });
  });

  // 5. Generate & Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
};
