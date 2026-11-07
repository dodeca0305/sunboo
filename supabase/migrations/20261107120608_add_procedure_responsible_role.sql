-- Approved scope: one nullable role column and one value check only.
-- Keep all existing status values, RLS, grants, triggers and shared RPC unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.workspace_procedure_statuses ADD COLUMN responsible_role text;
ALTER TABLE public.workspace_procedure_statuses
  ADD CONSTRAINT workspace_procedure_statuses_responsible_role_check
  CHECK (responsible_role IS NULL OR responsible_role IN (
    'in_house_admin', 'tax_accountant', 'outsourced_provider', 'other', 'undecided'
  ));
COMMIT;
