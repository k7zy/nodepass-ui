package main

import (
    "log"
    "NodePassDash/internal/db"
    "NodePassDash/internal/server"
)

func main() {
    // 初始化数据库
    if db.DB() == nil {
        log.Fatal("Failed to initialize database")
    }

    // 启动服务器
    srv := server.NewServer()
    log.Println("Server starting on :3000")
    if err := srv.Start(); err != nil {
        log.Fatal(err)
    }
} 
 