package api

import (
	"fmt"
	"log/slog"
	"net/http"

	"NodePassDash/internal/sse"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

// SSEHandler SSE处理器
type SSEHandler struct {
	sseService *sse.Service
}

// NewSSEHandler 创建SSE处理器实例
func NewSSEHandler(sseService *sse.Service) *SSEHandler {
	return &SSEHandler{
		sseService: sseService,
	}
}

// HandleGlobalSSE 处理全局SSE连接
func (h *SSEHandler) HandleGlobalSSE(w http.ResponseWriter, r *http.Request) {
	// 设置SSE响应头
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// 生成客户端ID
	clientID := uuid.New().String()

	// 发送连接成功消息
	fmt.Fprintf(w, "data: %s\n\n", `{"type":"connected","message":"连接成功"}`)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	slog.Info("前端建立全局SSE连接", "clientID", clientID, "remote", r.RemoteAddr)

	// 添加客户端
	h.sseService.AddClient(clientID, w)
	defer h.sseService.RemoveClient(clientID)

	// 保持连接直到客户端断开
	<-r.Context().Done()

	slog.Info("全局SSE连接关闭", "clientID", clientID, "remote", r.RemoteAddr)
}

// HandleTunnelSSE 处理隧道SSE连接
func (h *SSEHandler) HandleTunnelSSE(w http.ResponseWriter, r *http.Request) {
	// 设置SSE响应头
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	vars := mux.Vars(r)
	tunnelID := vars["tunnelId"]
	if tunnelID == "" {
		http.Error(w, "Missing tunnelId", http.StatusBadRequest)
		return
	}

	// 生成客户端ID
	clientID := uuid.New().String()

	// 发送连接成功消息
	fmt.Fprintf(w, "data: %s\n\n", `{"type":"connected","message":"连接成功"}`)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	slog.Info("前端请求隧道SSE订阅", "tunnelID", tunnelID, "clientID", clientID, "remote", r.RemoteAddr)

	// 添加客户端并订阅隧道
	h.sseService.AddClient(clientID, w)
	h.sseService.SubscribeToTunnel(clientID, tunnelID)
	defer func() {
		h.sseService.UnsubscribeFromTunnel(clientID, tunnelID)
		h.sseService.RemoveClient(clientID)
	}()

	// 保持连接直到客户端断开
	<-r.Context().Done()

	slog.Info("隧道SSE连接关闭", "tunnelID", tunnelID, "clientID", clientID, "remote", r.RemoteAddr)
}
