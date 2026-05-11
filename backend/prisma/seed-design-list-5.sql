SET NOCOUNT ON;

DELETE FROM dbo.ErpDesignList WHERE id IN ('DL-001','DL-002','DL-003','DL-004','DL-005');

INSERT INTO dbo.ErpDesignList (
    id, opNo, projectNo, projectCode, designType, businessUnit, [name], [status],
    salesPerson, created, deadline, agingDays, agingLabel, clientName, projectName, assigneeName
)
VALUES
('DL-001', 'OP- 2026-001', 'BRI UAE-J24658-11-24', 'BRI UAE-J24658-11-24', 'Retail',  'Acme Corporation',       'Retail Store Redesign',      'WIP',       'John Doe',     '2026-02-02', '2026-02-15', 10, '10 days', 'Acme Corporation',       'Retail Store Redesign',      'John Doe'),
('DL-002', 'OP- 2026-002', 'BRI UAE-K98120-12-34', 'BRI UAE-K98120-12-34', 'Project', 'TechStart Inc',          'Office Complex Phase 1',     'Completed', 'Sarah Smith',  '2026-02-05', '2026-02-05', 15, '15 days', 'TechStart Inc',          'Office Complex Phase 1',     'Sarah Smith'),
('DL-003', 'OP- 2026-003', 'BRI UAE-M45012-01-25', 'BRI UAE-M45012-01-25', 'Retail',  'Fashion Hub',            'Boutique Showroom',          'Pending',   'Michael Chen', '2026-01-28', '2026-01-28', 23, '23 days', 'Fashion Hub',            'Boutique Showroom',          'Michael Chen'),
('DL-004', 'OP- 2026-004', 'BRI UAE-N33421-11-25', 'BRI UAE-N33421-11-25', 'Project', 'Green Valley Developers','Residential Tower A',        'Revision',  'Emma Wilson',  '2026-01-20', '2026-01-20', 31, '31 days', 'Green Valley Developers','Residential Tower A',        'Emma Wilson'),
('DL-005', 'OP- 2026-005', 'BRI UAE-KK6-11-Urban Outfitters', 'BRI UAE-KK6-11-Urban Outfitters', 'Retail', 'Urban Outfitters', 'Mall Kiosk Design', 'Approved', 'David Brown', '2026-02-15', '2026-01-15', 5, '5 days', 'Urban Outfitters', 'Mall Kiosk Design', 'David Brown');
