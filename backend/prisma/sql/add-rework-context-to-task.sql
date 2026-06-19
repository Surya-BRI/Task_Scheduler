-- Adds rework context fields to ErpTSTask.
-- These fields are populated on the NEW revision task when a salesperson issues rework.
ALTER TABLE ErpTSTask ADD reworkNote            NVARCHAR(MAX) NULL;
ALTER TABLE ErpTSTask ADD reworkAttachmentUrl   NVARCHAR(500) NULL;
ALTER TABLE ErpTSTask ADD reworkAttachmentName  NVARCHAR(255) NULL;
ALTER TABLE ErpTSTask ADD reworkLinkUrl         NVARCHAR(500) NULL;
ALTER TABLE ErpTSTask ADD reworkLinkName        NVARCHAR(255) NULL;
-- Stores the id of the original task this revision was created from (not a FK to avoid circular ref)
ALTER TABLE ErpTSTask ADD previousRevisionTaskId NVARCHAR(36) NULL;
