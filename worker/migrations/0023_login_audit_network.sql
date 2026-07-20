-- Migration 0023: extend LoginAuditEvents with raw per-header IP fields
-- Additive only — existing rows get NULL for new columns.

ALTER TABLE LoginAuditEvents ADD COLUMN cf_connecting_ip TEXT;
ALTER TABLE LoginAuditEvents ADD COLUMN true_client_ip   TEXT;
ALTER TABLE LoginAuditEvents ADD COLUMN x_forwarded_for  TEXT;
ALTER TABLE LoginAuditEvents ADD COLUMN remote_addr      TEXT;
