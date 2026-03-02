const XLSX = require('xlsx');

function run() {
    const workbook = XLSX.readFile('C:/projects/hrportal/Salary Calculations.xlsx', { cellFormula: true });

    for (const sheetName of workbook.SheetNames) {
        console.log(`\n\n=== SHEET: ${sheetName} ===`);
        const sheet = workbook.Sheets[sheetName];

        // Print raw data
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        console.log("--- RAW DATA ---");
        console.table(data);

        // Print formulas
        console.log("--- FORMULAS ---");
        for (const cell in sheet) {
            if (cell.startsWith('!')) continue;
            if (sheet[cell].f) {
                console.log(`${cell}: Formula => ${sheet[cell].f} | Computed Value => ${sheet[cell].v}`);
            }
        }
    }
}

run();
