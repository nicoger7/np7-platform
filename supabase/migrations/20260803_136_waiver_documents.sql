-- 136 · The signed waiver as a document, not a database blob.
--
-- A liability release is only useful if you can show WHAT was agreed, THAT it
-- was them, and that neither has changed. The signature lived as a base64 blob
-- on the row: no file to attach to anything, and no fingerprint tying the
-- signature to the exact wording on screen at the time.
--
--   document_url    — the rendered PDF on R2 (archived text + signature + evidence)
--   document_sha256 — SHA-256 over (waiver text + signed name + timestamp), so a
--                     later alteration of any of the three is detectable
alter table exp_waiver_signatures add column if not exists document_url text;
alter table exp_waiver_signatures add column if not exists document_sha256 text;
