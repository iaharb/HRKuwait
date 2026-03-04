const current = new Date('2026-02-22T12:00:00Z');
const end = new Date('2026-03-14T12:00:00Z');
let d = 0;
while (current <= end) {
    d++;
    current.setUTCDate(current.getUTCDate() + 1);
}
console.log("Total calendar days:", d); 
