-- Revert database/025_sj_appointments.sql.
-- WARNING: running this permanently deletes only SJ Appointment bookings and logs.
drop table if exists public.sj_appointment_logs;
drop table if exists public.sj_appointments;
