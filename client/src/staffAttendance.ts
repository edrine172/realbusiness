import type { StaffAttendance } from './api';

export const attendanceRecordWage = (record: Pick<StaffAttendance, 'attended' | 'daily_wage'>) =>
  record.attended ? Number(record.daily_wage) : 0;
