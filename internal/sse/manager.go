package sse

import (
	"bufio"
	"context"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"NodePassDash/internal/models"

	"github.com/r3labs/sse/v2"
)

// simpleHandler 实现自定义输出格式: 2025/06/15 11:09:19 INFO msg k=v ...
type simpleHandler struct {
	level slog.Level
	attrs []slog.Attr
}

func (h *simpleHandler) Enabled(_ context.Context, lvl slog.Level) bool {
	return lvl >= h.level
}

func (h *simpleHandler) Handle(_ context.Context, r slog.Record) error {
	if r.Level < h.level {
		return nil
	}

	// 时间、级别、消息
	ts := r.Time.Format("2006-01-02 15:04:05")
	level := strings.ToUpper(r.Level.String())
	msg := r.Message

	// 合并属性
	var b strings.Builder
	writeAttr := func(a slog.Attr) {
		fmt.Fprintf(&b, " %s=%v", a.Key, a.Value.Any())
	}
	for _, a := range h.attrs {
		writeAttr(a)
	}
	r.Attrs(func(a slog.Attr) bool {
		writeAttr(a)
		return true
	})

	fmt.Fprintf(os.Stdout, "%s %s %s%s\n", ts, level, msg, b.String())
	return nil
}

func (h *simpleHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	newH := *h
	newH.attrs = append(append([]slog.Attr(nil), h.attrs...), attrs...)
	return &newH
}

func (h *simpleHandler) WithGroup(name string) slog.Handler { return h }

func newSimpleHandler(level slog.Level) slog.Handler { return &simpleHandler{level: level} }

// Manager SSE连接管理器
type Manager struct {
	service *Service     // 负责业务处理的 Service，真正解析并落库等逻辑由它完成
	db      *sql.DB      // 数据库连接，用于查询端点信息、持久化数据
	mu      sync.RWMutex // 读写锁，保护并发访问 connections

	// 连接管理
	connections map[int64]*EndpointConnection
}

// NewManager 创建SSE管理器
func NewManager(db *sql.DB, service *Service) *Manager {
	return &Manager{
		service:     service,
		db:          db,
		connections: make(map[int64]*EndpointConnection),
	}
}

// InitializeSystem 初始化系统
func (m *Manager) InitializeSystem() error {
	slog.Info("开始初始化系统")
	// 统计需要重连的端点数量（过滤掉已明确失败的端点）
	var total int
	if err := m.db.QueryRow(`SELECT COUNT(*) FROM "Endpoint" WHERE status != 'FAIL'`).Scan(&total); err == nil {
		slog.Info("需要重连的端点数量", "total", total)
	}

	// 获取所有端点
	rows, err := m.db.Query(`
		SELECT id, url, apiPath, apiKey 
		FROM "Endpoint" 
		WHERE status != 'FAIL'
	`)
	if err != nil {
		return fmt.Errorf("查询端点失败: %v", err)
	}
	defer rows.Close()

	// 为每个端点创建SSE连接
	for rows.Next() {
		var endpoint struct {
			ID      int64
			URL     string
			APIPath string
			APIKey  string
		}
		if err := rows.Scan(&endpoint.ID, &endpoint.URL, &endpoint.APIPath, &endpoint.APIKey); err != nil {
			slog.Error("扫描端点数据失败", "err", err)
			continue
		}

		if err := m.ConnectEndpoint(endpoint.ID, endpoint.URL, endpoint.APIPath, endpoint.APIKey); err != nil {
			slog.Error("连接端点失败", "endpointID", endpoint.ID, "err", err)
		}
	}

	return nil
}

// ConnectEndpoint 连接端点SSE
func (m *Manager) ConnectEndpoint(endpointID int64, url, apiPath, apiKey string) error {
	slog.Info("尝试连接端点", "endpointID", endpointID, "url", url)
	m.mu.Lock()
	defer m.mu.Unlock()

	// 如果已存在连接，先关闭
	if conn, exists := m.connections[endpointID]; exists {
		slog.Info("已存在连接，先关闭", "endpointID", endpointID)
		conn.Cancel()
		delete(m.connections, endpointID)
	}

	// 创建新的上下文
	ctx, cancel := context.WithCancel(context.Background())

	// 创建连接
	conn := &EndpointConnection{
		EndpointID: endpointID,
		URL:        url,
		APIPath:    apiPath,
		APIKey:     apiKey,
		Client: &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
				DialContext: (&net.Dialer{
					Timeout:   30 * time.Second,
					KeepAlive: 30 * time.Second,
					DualStack: true, // 兼容 IPv4/IPv6
				}).DialContext,
			},
		},
		Cancel: cancel,
	}

	m.connections[endpointID] = conn
	slog.Info("已创建连接对象，准备启动监听", "endpointID", endpointID)

	// 启动SSE监听
	go m.listenSSE(ctx, conn)
	slog.Info("已启动 SSE 监听协程", "endpointID", endpointID)

	// 立即标记端点为 ONLINE（监听协程会负责后续状态更新）
	m.markEndpointOnline(endpointID)

	return nil
}

// DisconnectEndpoint 断开端点SSE连接
func (m *Manager) DisconnectEndpoint(endpointID int64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if conn, exists := m.connections[endpointID]; exists {
		slog.Info("正在断开 SSE 连接", "endpointID", endpointID)
		conn.Cancel()
		delete(m.connections, endpointID)
		slog.Info("SSE 连接已断开", "endpointID", endpointID)
	}
}

// listenSSE 使用 r3labs/sse 监听端点
func (m *Manager) listenSSE(ctx context.Context, conn *EndpointConnection) {
	sseURL := fmt.Sprintf("%s%s/events", conn.URL, conn.APIPath)
	slog.Info("开始监听 SSE (r3labs)", "endpointID", conn.EndpointID, "url", sseURL)

	client := sse.NewClient(sseURL)
	client.Headers["X-API-Key"] = conn.APIKey
	// 自签名 SSL
	client.Connection.Transport = &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	// 使用默认 ReconnectStrategy（指数退避），不限重试次数
	events := make(chan *sse.Event, 16)

	// 在独立 goroutine 中订阅；SubscribeChanRawWithContext 会阻塞直至 ctx.Done()
	go func() {
		if err := client.SubscribeChanRawWithContext(ctx, events); err != nil {
			slog.Error("SSE 订阅错误", "endpointID", conn.EndpointID, "err", err)
		}
	}()

	for {
		select {
		case <-ctx.Done():
			client.Unsubscribe(events)
			return
		case ev, ok := <-events:
			if !ok {
				slog.Warn("SSE 事件通道已关闭", "endpointID", conn.EndpointID)
				return
			}
			if ev == nil {
				continue
			}

			payload := strings.TrimSpace(string(ev.Data))
			if payload == "" {
				continue
			}

			var event struct {
				Type      string          `json:"type"`
				Time      interface{}     `json:"time"`
				Logs      interface{}     `json:"logs"`
				Instance  json.RawMessage `json:"instance"`
				Instances json.RawMessage `json:"instances"`
			}

			if err := json.Unmarshal([]byte(payload), &event); err != nil {
				slog.Warn("解码 SSE JSON 失败", "endpointID", conn.EndpointID, "err", err)
				continue
			}

			var logsStr string
			if event.Logs != nil {
				if s, ok := event.Logs.(string); ok {
					logsStr = s
				} else {
					logsStr = fmt.Sprintf("%v", event.Logs)
				}
			}

			switch event.Type {
			case "initial":
				if err := m.handleInitialEvent(conn.EndpointID, event.Instance, logsStr); err != nil {
					slog.Error("处理 initial 事件失败", "endpointID", conn.EndpointID, "err", err)
				}
			case "create", "update", "delete", "log":
				if err := m.handleInstanceEvent(conn.EndpointID, event.Type, event.Instance, logsStr); err != nil {
					slog.Error("处理实例事件失败", "endpointID", conn.EndpointID, "err", err)
				}
			}
		}
	}
}

// handleSSEStream 处理SSE流
func (m *Manager) handleSSEStream(ctx context.Context, conn *EndpointConnection, resp *http.Response) error {
	defer resp.Body.Close()

	reader := bufio.NewReader(resp.Body)
	var buffer strings.Builder

	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		chunk, err := reader.ReadString('\n')
		if err != nil {
			if errors.Is(err, io.EOF) {
				return fmt.Errorf("server closed connection")
			}
			return fmt.Errorf("read error: %v", err)
		}

		// 统一换行符，防止 CRLF 造成分隔符匹配失败
		chunk = strings.ReplaceAll(chunk, "\r\n", "\n")
		buffer.WriteString(chunk)

		dataStr := buffer.String()
		// 同样替换已有内容中的 CRLF，以防在上一次循环留下的 \r 字符
		dataStr = strings.ReplaceAll(dataStr, "\r\n", "\n")

		parts := strings.Split(dataStr, "\n\n")

		// 最后一个块可能是未完整的
		if !strings.HasSuffix(dataStr, "\n\n") {
			buffer.Reset()
			buffer.WriteString(parts[len(parts)-1])
			parts = parts[:len(parts)-1]
		} else {
			buffer.Reset()
		}

		for _, rawBlock := range parts {
			rawBlock = strings.TrimSpace(rawBlock)
			if rawBlock == "" {
				continue
			}

			// 拼接所有 data: 行
			var payloadBuilder strings.Builder
			for _, line := range strings.Split(rawBlock, "\n") {
				if strings.HasPrefix(line, "data:") {
					payloadBuilder.WriteString(strings.TrimSpace(strings.TrimPrefix(line, "data:")))
				}
			}

			payload := payloadBuilder.String()
			if payload == "" {
				continue
			}

			var event struct {
				Type      string          `json:"type"`
				Time      interface{}     `json:"time"`
				Logs      interface{}     `json:"logs"`
				Instance  json.RawMessage `json:"instance"`
				Instances json.RawMessage `json:"instances"`
			}

			if err := json.Unmarshal([]byte(payload), &event); err != nil {
				slog.Warn("解码 SSE JSON 失败", "endpointID", conn.EndpointID, "err", err)
				continue
			}
			if event.Type == "log" {
				slog.Debug("收到 SSE log事件", "endpointID", conn.EndpointID)
			} else {
				slog.Debug("收到 SSE 事件", "endpointID", conn.EndpointID, "payload", payload)
			}

			// 解析 logs 字段为字符串
			var logsStr string
			if event.Logs != nil {
				if s, ok := event.Logs.(string); ok {
					logsStr = s
				} else {
					logsStr = fmt.Sprintf("%v", event.Logs)
				}
			}

			switch event.Type {
			case "initial":
				raw := event.Instance
				if err := m.handleInitialEvent(conn.EndpointID, raw, logsStr); err != nil {
					slog.Error("处理 initial 事件失败", "endpointID", conn.EndpointID, "err", err)
				}
			case "create", "update", "delete", "log":
				if err := m.handleInstanceEvent(conn.EndpointID, event.Type, event.Instance, logsStr); err != nil {
					slog.Error("处理实例事件失败", "endpointID", conn.EndpointID, "err", err)
				}
			}
		}
	}
}

// handleInitialEvent 处理 initial 事件（批量实例）
func (m *Manager) handleInitialEvent(endpointID int64, instancesData json.RawMessage, logs string) error {
	// 定义与 JSON 对应的实例结构
	type instPayload struct {
		ID     string `json:"id"`
		Type   string `json:"type"`
		Status string `json:"status"`
		URL    string `json:"url"`
		TCPRx  int64  `json:"tcprx"`
		TCPTx  int64  `json:"tcptx"`
		UDPRx  int64  `json:"udprx"`
		UDPTx  int64  `json:"udptx"`
	}

	var instances []instPayload
	if err := json.Unmarshal(instancesData, &instances); err != nil {
		var single instPayload
		if err2 := json.Unmarshal(instancesData, &single); err2 != nil {
			return fmt.Errorf("解析实例数据失败: %v", err)
		}
		instances = []instPayload{single}
	}

	for _, inst := range instances {
		event := models.EndpointSSE{
			EventType:    models.SSEEventTypeInitial,
			PushType:     "initial",
			EventTime:    time.Now(),
			EndpointID:   endpointID,
			InstanceID:   inst.ID,
			InstanceType: &inst.Type,
			Status:       &inst.Status,
			URL:          &inst.URL,
			TCPRx:        inst.TCPRx,
			TCPTx:        inst.TCPTx,
			UDPRx:        inst.UDPRx,
			UDPTx:        inst.UDPTx,
			Logs:         &logs,
		}
		if err := m.service.ProcessEvent(endpointID, event); err != nil {
			slog.Error("处理实例初始事件失败", "endpointID", endpointID, "instanceID", inst.ID, "err", err)
		}
	}
	return nil
}

// handleInstanceEvent 处理 create/update/delete/log 单实例事件
func (m *Manager) handleInstanceEvent(endpointID int64, eventType string, instanceData json.RawMessage, logs string) error {
	var inst struct {
		ID     string `json:"id"`
		Type   string `json:"type"`
		Status string `json:"status"`
		URL    string `json:"url"`
		TCPRx  int64  `json:"tcprx"`
		TCPTx  int64  `json:"tcptx"`
		UDPRx  int64  `json:"udprx"`
		UDPTx  int64  `json:"udptx"`
	}
	if err := json.Unmarshal(instanceData, &inst); err != nil {
		return fmt.Errorf("解析实例数据失败: %v", err)
	}
	event := models.EndpointSSE{
		EventType:    models.SSEEventType(eventType),
		PushType:     eventType,
		EventTime:    time.Now(),
		EndpointID:   endpointID,
		InstanceID:   inst.ID,
		InstanceType: &inst.Type,
		Status:       &inst.Status,
		URL:          &inst.URL,
		TCPRx:        inst.TCPRx,
		TCPTx:        inst.TCPTx,
		UDPRx:        inst.UDPRx,
		UDPTx:        inst.UDPTx,
		Logs:         &logs,
	}
	if err := m.service.ProcessEvent(endpointID, event); err != nil {
		return err
	}
	return nil
}

// Close 关闭所有 SSE 连接
func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, conn := range m.connections {
		conn.Cancel()
	}
	m.connections = make(map[int64]*EndpointConnection)
}

// markEndpointFail 更新端点状态为 FAIL
func (m *Manager) markEndpointFail(endpointID int64) {
	if _, err := m.db.Exec(`UPDATE "Endpoint" SET status = 'FAIL', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, endpointID); err != nil {
		slog.Error("更新端点状态为 FAIL 失败", "endpointID", endpointID, "err", err)
	}
}

// markEndpointOnline 更新端点状态为 ONLINE
func (m *Manager) markEndpointOnline(endpointID int64) {
	if _, err := m.db.Exec(`UPDATE "Endpoint" SET status = 'ONLINE', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, endpointID); err != nil {
		slog.Error("更新端点状态为 ONLINE 失败", "endpointID", endpointID, "err", err)
	}
}

func init() {
	slog.SetDefault(slog.New(newSimpleHandler(slog.LevelDebug)))
}
