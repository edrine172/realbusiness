import { describe, expect, it } from 'vitest';
import { attendanceRecordWage } from './staffAttendance';

describe('attendanceRecordWage', () => {
  it('uses the saved attendance wage as the calendar amount', () => {
    expect(attendanceRecordWage({ attended: true, daily_wage: '4000.00' })).toBe(4000);
  });

  it('does not count a saved wage for an absent worker', () => {
    expect(attendanceRecordWage({ attended: false, daily_wage: '4000.00' })).toBe(0);
  });
});
