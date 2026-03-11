const calculateLeaveDays = (start, end, includeSat, holidays) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    let total = 0;
    let current = new Date(startDate);

    while (current <= endDate) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const isHoliday = holidays.includes(dateStr);

        if (!isHoliday) {
            total++;
        }
        current.setDate(current.getDate() + 1);
    }
    return total;
};

const holidays = ["2026-01-01", "2026-02-25", "2026-02-26", "2026-03-01"];
console.log("Calculated:", calculateLeaveDays("2026-02-22", "2026-03-14", false, holidays));
