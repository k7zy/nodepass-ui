package db

import (
	"database/sql"
	"log"
	"sync"

	_ "github.com/mattn/go-sqlite3"
)

var (
	db   *sql.DB
	once sync.Once
)

// DB 获取数据库单例
func DB() *sql.DB {
	once.Do(func() {
		var err error
		db, err := sql.Open("sqlite3", "file:public/sqlite.db")
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
	// --------  兼容旧版本：为 Tunnel 表添加 min / max 列 --------
	if err := ensureColumn(db, "Tunnel", "min", "INTEGER"); err != nil {
		return err
	}
	if err := ensureColumn(db, "Tunnel", "max", "INTEGER"); err != nil {
		return err
	}

	return nil
}

// ensureColumn 检查列是否存在，不存在则自动 ALTER TABLE 添加
func ensureColumn(db *sql.DB, table, column, typ string) error {
	// 查询表信息
	rows, err := db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var exists bool
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull int
		var dfltValue interface{}
		var pk int
		_ = rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk)
		if name == column {
			exists = true
			break
		}
	}

	if !exists {
		// 注意：SQLite ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，因此需要手动检查
		_, err := db.Exec(`ALTER TABLE "` + table + `" ADD COLUMN ` + column + ` ` + typ)
		return err
	}
	return nil
}
