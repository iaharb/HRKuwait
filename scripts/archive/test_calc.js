export const calculateLeaveDays = (start, end, includeSat, holidays) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    let total = 0;
    let current = new Date(startDate);
    const detailed = [];
    while (current <= endDate) {
        const dayOfWeek = current.getDay();
        const dateStr = [current.getFullYear(), ('0' + (current.getMonth() + 1)).slice(-2), ('0' + current.getDate()).slice(-2)].join('-'); // avoid toLocaleDateString timezone issues
        const isHoliday = holidays.includes(dateStr);
        const isFriday = dayOfWeek === 5;
        const isSaturday = dayOfWeek === 6;

        // Original logic:
        // const dateStrOrigin = current.toLocaleDateString('en-CA');

        if (!isFriday && !(isSaturday && !includeSat) && !isHoliday) {
            total++;
            detailed.push({ date: dateStr, count: true });
        } else {
            detailed.push({ date: dateStr, count: false, isFriday, isSaturday, isHoliday });
        }
        current.setDate(current.getDate() + 1);
    }
    console.log(JSON.stringify(detailed, null, 2));
    return total;
};

const holidays = ["2026-01-01", "2026-02-25", "2026-02-26"];
console.log(calculateLeaveDays("2026-02-22", "2026-03-14", false, holidays));
