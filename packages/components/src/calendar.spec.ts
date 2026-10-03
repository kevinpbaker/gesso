import { describe, expect, it } from 'vitest';

import { addDays, addMonths, clampDate, formatDate, monthGrid, parseIsoDate, startOfWeek, todayIso } from './calendar';

describe('calendar dates', () => {
  it('parses only real dates', () => {
    expect(parseIsoDate('2026-02-28')).not.toBeNull();
    expect(parseIsoDate('2026-02-29')).toBeNull();
    expect(parseIsoDate('2028-02-29')).not.toBeNull();
    expect(parseIsoDate('2026-2-1')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
  });

  it('adds days across months, years and a clock change', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    // The last Sunday of March is 23 hours long in much of Europe; a
    // calendar day is still one day.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('adds months, keeping the day or taking the month’s last', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
    expect(addMonths('2026-10-02', 12)).toBe('2027-10-02');
  });

  it('finds the start of a week for either first weekday', () => {
    // 2026-10-02 is a Friday.
    expect(startOfWeek('2026-10-02', 1)).toBe('2026-09-28');
    expect(startOfWeek('2026-10-02', 0)).toBe('2026-09-27');
  });

  it('lays a month out in whole weeks', () => {
    const october = monthGrid('2026-10', 1);
    expect(october).toHaveLength(5);
    expect(october[0]![0]).toBe('2026-09-28');
    expect(october.at(-1)!.at(-1)).toBe('2026-11-01');
    expect(october.every(week => week.length === 7)).toBe(true);
    // February 2026 starts on a Sunday, so a Sunday-first grid fits it in four rows.
    expect(monthGrid('2026-02', 0)).toHaveLength(4);
  });

  it('clamps to a range either end of which may be open', () => {
    expect(clampDate('2026-01-01', '2026-02-01', '')).toBe('2026-02-01');
    expect(clampDate('2026-05-01', '', '2026-04-30')).toBe('2026-04-30');
    expect(clampDate('2026-03-01', '', '')).toBe('2026-03-01');
  });

  it('formats as a calendar date, never a day out', () => {
    expect(formatDate('2026-10-02', { year: 'numeric', month: 'long', day: 'numeric' }, 'en-US')).toBe(
      'October 2, 2026'
    );
    expect(formatDate('nonsense', { year: 'numeric' }, 'en-US')).toBe('');
  });

  it('takes today from the local date', () => {
    expect(todayIso(new Date(2026, 9, 2, 23, 59))).toBe('2026-10-02');
    expect(todayIso(new Date(2026, 9, 3, 0, 1))).toBe('2026-10-03');
  });
});
