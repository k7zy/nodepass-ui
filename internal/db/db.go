package db

import (
    "database/sql"
    _ "github.com/mattn/go-sqlite3"
    "log"
    "sync"
)

var (
    db   *sql.DB
    once sync.Once
)

// DB 获取数据库单例
func DB() *sql.DB {
    once.Do(func() {
        var err error
        db, err = sql.Open("sqlite3", "data.db?_journal_mode=WAL")
        if err != nil {
            log.Fatal(err)
        }

        // 初始化表结构
        if err := initSchema(db); err != nil {
            log.Fatal(err)
        }
    })
    return db
}

// 初始化数据库Schema
func initSchema(db *sql.DB) error {
    _, err := db.Exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `)
    return err
} 