-- Add reference number for QR PH / online payments
-- Run once in Supabase SQL editor.

alter table if exists payments add column if not exists reference_no text;
