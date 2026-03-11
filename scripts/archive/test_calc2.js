function test(timezoneOffsetHours) {
    const start = "2026-02-22";
    const end = "2026-03-14";
    const startDate = new Date(start);
    const endDate = new Date(end);

    // shift timezone
    startDate.setHours(startDate.getHours() + timezoneOffsetHours);
    endDate.setHours(endDate.getHours() + timezoneOffsetHours);

    let total = 0;
    let current = new Date(startDate);
    let fridays = 0;
    let saturdays = 0;
    let holidaysCount = 0;
    const holidays = ["2026-01-01", "2026-02-25", "2026-02-26"];

    while (current <= endDate) {
        const dayOfWeek = current.getDay();
        const dateStr = [current.getFullYear(), ('0' + (current.getMonth() + 1)).slice(-2), ('0' + current.getDate()).slice(-2)].join('-');
        const isHoliday = holidays.includes(dateStr);
        const isFriday = dayOfWeek === 5;
        const isSaturday = dayOfWeek === 6;
        if (isFriday) fridays++;
        if (isSaturday) saturdays++;
        if (isHoliday) holidaysCount++;

        // The buggy code used:
        // const dateStrOrigin = current.toLocaleDateString('en-CA');
        // if (!isFriday && !(isSaturday && !includeSat) && !isHoliday) total++;

        current.setDate(current.getDate() + 1);
    }
    return { fridays, saturdays, holidaysCount };
}

console.log("Normal UTC:", test(0));
console.log("Shifted -5 (EST):", test(-5));
