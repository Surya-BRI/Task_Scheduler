IF OBJECT_ID(N'dbo.ErpProjectList', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ErpProjectList (
        id NVARCHAR(50) NOT NULL PRIMARY KEY,
        projectId NVARCHAR(150) NOT NULL,
        projectName NVARCHAR(500) NOT NULL,
        salesPerson NVARCHAR(150) NOT NULL,
        category NVARCHAR(20) NOT NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_ErpProjectList_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_ErpProjectList_updatedAt DEFAULT SYSUTCDATETIME(),

        CONSTRAINT CK_ErpProjectList_category CHECK (category IN ('Retail', 'Project'))
    );

    CREATE INDEX IX_ErpProjectList_projectId ON dbo.ErpProjectList(projectId);
    CREATE INDEX IX_ErpProjectList_category ON dbo.ErpProjectList(category);
    CREATE INDEX IX_ErpProjectList_salesPerson ON dbo.ErpProjectList(salesPerson);
END;
