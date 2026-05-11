DECLARE @targetTable SYSNAME;
DECLARE @sql NVARCHAR(MAX);

IF OBJECT_ID(N'dbo.ErpDesignList', N'U') IS NOT NULL
    RETURN;

IF EXISTS (
    SELECT 1
    FROM sys.tables
    WHERE name LIKE '%DesignList%'
)
    SET @targetTable = N'ErpSdlrDesignList';
ELSE
    SET @targetTable = N'ErpDesignList';

IF OBJECT_ID(N'dbo.' + @targetTable, N'U') IS NULL
BEGIN
    SET @sql = N'
    CREATE TABLE dbo.' + QUOTENAME(@targetTable) + N' (
        id NVARCHAR(50) NOT NULL PRIMARY KEY,
        opNo NVARCHAR(100) NOT NULL,
        projectNo NVARCHAR(150) NOT NULL,
        projectCode NVARCHAR(150) NULL,
        designType NVARCHAR(20) NOT NULL,
        businessUnit NVARCHAR(200) NOT NULL,
        [name] NVARCHAR(255) NOT NULL,
        [status] NVARCHAR(20) NOT NULL,
        salesPerson NVARCHAR(150) NOT NULL,
        created DATE NOT NULL,
        deadline DATE NOT NULL,
        agingDays INT NOT NULL,
        agingLabel NVARCHAR(50) NULL,
        clientName NVARCHAR(255) NULL,
        projectName NVARCHAR(255) NULL,
        assigneeName NVARCHAR(150) NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_' + @targetTable + N'_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_' + @targetTable + N'_updatedAt DEFAULT SYSUTCDATETIME(),

        CONSTRAINT CK_' + @targetTable + N'_designType CHECK (designType IN (''Retail'', ''Project'')),
        CONSTRAINT CK_' + @targetTable + N'_status CHECK ([status] IN (''WIP'', ''Completed'', ''Pending'', ''Revision'', ''Approved'')),
        CONSTRAINT CK_' + @targetTable + N'_agingDays CHECK (agingDays >= 0)
    );

    CREATE INDEX IX_' + @targetTable + N'_opNo ON dbo.' + QUOTENAME(@targetTable) + N'(opNo);
    CREATE INDEX IX_' + @targetTable + N'_projectNo ON dbo.' + QUOTENAME(@targetTable) + N'(projectNo);
    CREATE INDEX IX_' + @targetTable + N'_status ON dbo.' + QUOTENAME(@targetTable) + N'([status]);
    CREATE INDEX IX_' + @targetTable + N'_designType ON dbo.' + QUOTENAME(@targetTable) + N'(designType);
    CREATE INDEX IX_' + @targetTable + N'_deadline ON dbo.' + QUOTENAME(@targetTable) + N'(deadline);';

    EXEC sp_executesql @sql;
END;
