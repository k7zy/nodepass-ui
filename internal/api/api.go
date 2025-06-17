package api

import (
	"database/sql"
	"log"

	"github.com/gorilla/mux"
	_ "github.com/mattn/go-sqlite3"
)

// SetupRoutes 向父级路由器注册所有 API 路由
// 由于 internal/server/server.go 仅传递父级 *mux.Router，我们在此函数内部
// 打开数据库连接并创建具体的 API Router，然后将其挂载到父路由上。
// 为了简化示例，此处使用默认数据库路径 ./public/sqlite.db。
// 在生产环境中，请考虑使用依赖注入或更灵活的配置方案。
func SetupRoutes(parent *mux.Router) {
	// 打开数据库连接
	db, err := sql.Open("sqlite3", "./public/sqlite.db")
	if err != nil {
		log.Printf("初始化数据库失败: %v", err)
		return
	}

	// 创建 API Router 并挂载到父级路由器（此处不共享 SSE 实例，传入 nil 即由内部创建）
	apiRouter := NewRouter(db, nil, nil)
	parent.PathPrefix("/").Handler(apiRouter)
}
