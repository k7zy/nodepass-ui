-- 创建端点表
CREATE TABLE IF NOT EXISTS endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL UNIQUE,
    api_path TEXT NOT NULL,
    api_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OFFLINE',
    color TEXT DEFAULT 'default',
    last_check DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_endpoints_name ON endpoints(name);
CREATE INDEX IF NOT EXISTS idx_endpoints_url ON endpoints(url);
CREATE INDEX IF NOT EXISTS idx_endpoints_status ON endpoints(status);
CREATE INDEX IF NOT EXISTS idx_endpoints_created_at ON endpoints(created_at); 