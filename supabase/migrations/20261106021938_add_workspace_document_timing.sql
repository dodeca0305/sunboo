-- Approved scope: nullable document dates and one paired-period CHECK only.
-- No backfill, function/trigger/ACL/RLS changes or legacy migrations.
ALTER TABLE public.workspace_documents
  ADD COLUMN period_start date,
  ADD COLUMN period_end date,
  ADD COLUMN document_date date,
  ADD CONSTRAINT workspace_documents_period_pair_check CHECK (
    (period_start IS NULL AND period_end IS NULL)
    OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_start <= period_end)
  );
