const XLSX = require('xlsx');

// Read payroll-1.xlsx
console.log('\n========== PAYROLL-1.XLSX ==========\n');
const workbook1 = XLSX.readFile('./temp-peyroll-form/payroll-1.xlsx');
const sheet1Name = workbook1.SheetNames[0];
const sheet1 = workbook1.Sheets[sheet1Name];
const data1 = XLSX.utils.sheet_to_json(sheet1, { header: 1, defval: null });

console.log('Sheet name:', sheet1Name);
console.log('Total rows:', data1.length);
console.log('\nFirst 30 rows (showing all columns):');
data1.slice(0, 30).forEach((row, idx) => {
    console.log(`Row ${idx}:`, row);
});

// Read Overall-payroll.xlsx
console.log('\n\n========== OVERALL-PAYROLL.XLSX ==========\n');
const workbook2 = XLSX.readFile('./temp-peyroll-form/Overall-payroll.xlsx');
const sheet2Name = workbook2.SheetNames[0];
const sheet2 = workbook2.Sheets[sheet2Name];
const data2 = XLSX.utils.sheet_to_json(sheet2, { header: 1, defval: null });

console.log('Sheet name:', sheet2Name);
console.log('Total rows:', data2.length);
console.log('\nAll rows (showing all columns):');
data2.forEach((row, idx) => {
    console.log(`Row ${idx}:`, row);
});

// Calculate max length (last non-empty row)
let maxLength = 0;
for (let i = data2.length - 1; i >= 0; i--) {
    const row = data2[i];
    if (row && row.some(cell => cell !== null && cell !== undefined && cell !== '')) {
        maxLength = i + 1; // +1 because index starts at 0
        break;
    }
}

console.log('\n\nMax length (last row with data):', maxLength);
console.log('Number of employees to generate:', maxLength - 3);

// Show specific cells for verification
console.log('\n\n========== CELL MAPPING VERIFICATION ==========\n');
console.log('File B (Overall-payroll) - Key cells:');
console.log('B1 (Month/Period):', sheet2['B1']?.v);
for (let i = 4; i <= Math.min(10, maxLength); i++) {
    console.log(`\nEmployee ${i - 3} (Row ${i}):`);
    console.log(`  A${i}:`, sheet2[`A${i}`]?.v);
    console.log(`  B${i}:`, sheet2[`B${i}`]?.v);
    console.log(`  C${i}:`, sheet2[`C${i}`]?.v);
    console.log(`  D${i}:`, sheet2[`D${i}`]?.v);
    console.log(`  E${i}:`, sheet2[`E${i}`]?.v);
}

console.log('\n\nFile A (payroll-1) - Target cells:');
console.log('M1:', sheet1['M1']?.v);
console.log('C5:', sheet1['C5']?.v);
console.log('H5:', sheet1['H5']?.v);
console.log('C6:', sheet1['C6']?.v);
console.log('C7:', sheet1['C7']?.v);
console.log('H7:', sheet1['H7']?.v);
