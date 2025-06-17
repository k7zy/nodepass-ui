package sse

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"NodePassDash/internal/models"
)

// Service SSE服务
type Service struct {
	// 客户端管理
	clients    map[string]*Client            // 全局客户端
	tunnelSubs map[string]map[string]*Client // 隧道订阅者
	mu         sync.RWMutex

	// 数据存储
	db *sql.DB

	// 事件缓存
	eventCache     map[int64][]models.EndpointSSE // 端点事件缓存
	eventCacheMu   sync.RWMutex
	maxCacheEvents int

	// 健康检查
	healthCheckInterval time.Duration
	lastEventTime       map[int64]time.Time
	lastEventMu         sync.RWMutex

	// 上下文控制
	ctx    context.Context
	cancel context.CancelFunc
}

// NewService 创建SSE服务实例
func NewService(db *sql.DB) *Service {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Service{
		clients:             make(map[string]*Client),
		tunnelSubs:          make(map[string]map[string]*Client),
		db:                  db,
		eventCache:          make(map[int64][]models.EndpointSSE),
		maxCacheEvents:      100,
		healthCheckInterval: 30 * time.Second,
		lastEventTime:       make(map[int64]time.Time),
		ctx:                 ctx,
		cancel:              cancel,
	}

	// 启动健康检查
	go s.startHealthCheck()

	return s
}

// AddClient 添加新的SSE客户端
func (s *Service) AddClient(clientID string, w http.ResponseWriter) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.clients[clientID] = &Client{
		ID:     clientID,
		Writer: w,
	}

	// 记录日志
	slog.Info("SSE客户端已添加", "clientID", clientID, "totalClients", len(s.clients))
}

// RemoveClient 移除SSE客户端
func (s *Service) RemoveClient(clientID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.clients, clientID)

	// 记录日志
	slog.Info("SSE客户端已移除", "clientID", clientID, "remaining", len(s.clients))

	// 清理隧道订阅
	for tunnelID, subs := range s.tunnelSubs {
		delete(subs, clientID)
		if len(subs) == 0 {
			delete(s.tunnelSubs, tunnelID)
		}
	}
}

// SubscribeToTunnel 订阅隧道事件
func (s *Service) SubscribeToTunnel(clientID, tunnelID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.tunnelSubs[tunnelID]; !exists {
		s.tunnelSubs[tunnelID] = make(map[string]*Client)
	}

	if client, exists := s.clients[clientID]; exists {
		s.tunnelSubs[tunnelID][clientID] = client
		slog.Info("客户端订阅隧道", "clientID", clientID, "tunnelID", tunnelID, "subCount", len(s.tunnelSubs[tunnelID]))
	}
}

// UnsubscribeFromTunnel 取消隧道订阅
func (s *Service) UnsubscribeFromTunnel(clientID, tunnelID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if subs, exists := s.tunnelSubs[tunnelID]; exists {
		delete(subs, clientID)
		if len(subs) == 0 {
			delete(s.tunnelSubs, tunnelID)
		}
		slog.Info("客户端取消隧道订阅", "clientID", clientID, "tunnelID", tunnelID, "remainingSubs", len(subs))
	}
}

// ProcessEvent 处理SSE事件
func (s *Service) ProcessEvent(endpointID int64, event models.EndpointSSE) error {
	s.storeEvent(event)
	// 分派到具体事件处理器
	switch event.EventType {
	case models.SSEEventTypeInitial:
		s.handleInitialEvent(event)
	case models.SSEEventTypeCreate:
		s.handleCreateEvent(event)
	case models.SSEEventTypeUpdate:
		s.handleUpdateEvent(event)
	case models.SSEEventTypeDelete:
		s.handleDeleteEvent(event)
	case models.SSEEventTypeLog:
		s.handleLogEvent(event)
	}

	// 更新最后事件时间
	s.updateLastEventTime(endpointID)

	// 推流
	if event.EventType == models.SSEEventTypeLog {
		if event.InstanceID != "" {
			s.sendTunnelUpdateByInstanceId(event.InstanceID, event)
		}
		return nil
	}

	if event.InstanceID != "" {
		s.sendTunnelUpdateByInstanceId(event.InstanceID, event)
	}
	// s.sendGlobalUpdate(event)

	return nil
}

// storeEvent 存储SSE事件
func (s *Service) storeEvent(event models.EndpointSSE) error {
	// 插入数据库
	_, err := s.db.Exec(`
		INSERT INTO "EndpointSSE" (
			eventType, pushType, eventTime, endpointId,
			instanceId, instanceType, status, url,
			tcpRx, tcpTx, udpRx, udpTx,
			logs, createdAt
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		event.EventType, event.PushType, event.EventTime, event.EndpointID,
		event.InstanceID, event.InstanceType, event.Status, event.URL,
		event.TCPRx, event.TCPTx, event.UDPRx, event.UDPTx,
		event.Logs, time.Now(),
	)
	if err != nil {
		return err
	}

	// 更新事件缓存
	s.updateEventCache(event)

	return nil
}

// updateEventCache 更新事件缓存
func (s *Service) updateEventCache(event models.EndpointSSE) {
	s.eventCacheMu.Lock()
	defer s.eventCacheMu.Unlock()

	cache := s.eventCache[event.EndpointID]
	cache = append(cache, event)

	// 保持缓存大小
	if len(cache) > s.maxCacheEvents {
		cache = cache[len(cache)-s.maxCacheEvents:]
	}

	s.eventCache[event.EndpointID] = cache
}

// broadcastEvent 广播事件到所有相关客户端
func (s *Service) broadcastEvent(event models.EndpointSSE) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// 序列化事件
	eventJSON, err := json.Marshal(event)
	if err != nil {
		slog.Warn("序列化事件失败", "err", err)
		return
	}

	// 构造SSE消息
	message := fmt.Sprintf("data: %s\n\n", eventJSON)

	// 发送到所有全局客户端
	for _, client := range s.clients {
		fmt.Fprint(client.Writer, message)
		if f, ok := client.Writer.(http.Flusher); ok {
			f.Flush()
		}
	}

	// 如果是隧道相关事件，发送到订阅者
	if event.InstanceID != "" {
		if subs, exists := s.tunnelSubs[event.InstanceID]; exists {
			for _, client := range subs {
				fmt.Fprint(client.Writer, message)
				if f, ok := client.Writer.(http.Flusher); ok {
					f.Flush()
				}
			}
		}
	}
}

// updateLastEventTime 更新最后事件时间
func (s *Service) updateLastEventTime(endpointID int64) {
	s.lastEventMu.Lock()
	defer s.lastEventMu.Unlock()
	s.lastEventTime[endpointID] = time.Now()
}

// startHealthCheck 启动健康检查
func (s *Service) startHealthCheck() {
	ticker := time.NewTicker(s.healthCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.performHealthCheck()
		}
	}
}

// performHealthCheck 执行健康检查
func (s *Service) performHealthCheck() {
	s.lastEventMu.RLock()
	defer s.lastEventMu.RUnlock()

	now := time.Now()
	threshold := now.Add(-2 * s.healthCheckInterval)

	// 检查每个端点的最后事件时间
	for endpointID, lastEvent := range s.lastEventTime {
		if lastEvent.Before(threshold) {
			// 创建离线事件
			event := models.EndpointSSE{
				EventType:  models.SSEEventTypeUpdate,
				PushType:   "status_update",
				EventTime:  now,
				EndpointID: endpointID,
				Status:     stringPtr("OFFLINE"),
			}

			// 处理事件
			if err := s.ProcessEvent(endpointID, event); err != nil {
				slog.Warn("处理端点离线事件失败", "endpointID", endpointID, "err", err)
			}
		}
	}
}

// Close 关闭SSE服务
func (s *Service) Close() {
	s.cancel()
}

// stringPtr 创建字符串指针
func stringPtr(s string) *string {
	return &s
}

// valueOrEmpty 返回指针指向的值，若指针为 nil 则返回提供的默认值（泛型实现）
// 使用泛型以支持多种类型，不对值做比较，仅返回零值或默认值
func valueOrEmpty[T any](p *T, def T) T {
	if p == nil {
		return def
	}
	return *p
}

// ============================= 新增辅助方法 =============================

// sendTunnelUpdateByInstanceId 按隧道实例 ID 推送事件，仅发送给订阅了该隧道的客户端
func (s *Service) sendTunnelUpdateByInstanceId(instanceID string, data interface{}) {
	// 为避免在读锁状态下修改 map，拆分为两步：读取 +（可能）清理
	s.mu.RLock()
	subs, exists := s.tunnelSubs[instanceID]
	s.mu.RUnlock()

	if !exists || len(subs) == 0 {
		// 没有订阅者，记录调试日志后退出
		slog.Debug("无隧道订阅者，跳过推送", "instanceID", instanceID)
		return
	}

	// 记录推送准备日志
	payload, err := json.Marshal(data)
	if err != nil {
		slog.Warn("序列化隧道事件失败", "err", err)
		return
	}

	message := fmt.Sprintf("data: %s\n\n", payload)

	failedIDs := make([]string, 0)
	sent := 0

	for id, client := range subs {
		if _, err := fmt.Fprint(client.Writer, message); err == nil {
			if f, ok := client.Writer.(http.Flusher); ok {
				f.Flush()
			}
			sent++
		} else {
			failedIDs = append(failedIDs, id)
		}
	}

	if len(failedIDs) > 0 {
		s.mu.Lock()
		for _, fid := range failedIDs {
			delete(subs, fid)
		}
		// 若订阅者列表空，则移除隧道映射
		if len(subs) == 0 {
			delete(s.tunnelSubs, instanceID)
		}
		s.mu.Unlock()
	}

	slog.Info("隧道事件已推送", "sent", sent, "instanceID", instanceID)
}

// sendGlobalUpdate 推送全局事件（仪表盘 / 列表等使用），会发送给所有客户端
func (s *Service) sendGlobalUpdate(data interface{}) {
	payload, err := json.Marshal(data)
	if err != nil {
		slog.Warn("序列化全局事件失败", "err", err)
		return
	}

	message := fmt.Sprintf("data: %s\n\n", payload)

	s.mu.RLock()
	clientsCopy := make(map[string]*Client, len(s.clients))
	for id, cl := range s.clients {
		clientsCopy[id] = cl
	}
	s.mu.RUnlock()

	failedIDs := make([]string, 0)
	sent := 0

	for id, client := range clientsCopy {
		if _, err := fmt.Fprint(client.Writer, message); err == nil {
			if f, ok := client.Writer.(http.Flusher); ok {
				f.Flush()
			}
			sent++
		} else {
			failedIDs = append(failedIDs, id)
		}
	}

	if len(failedIDs) > 0 {
		s.mu.Lock()
		for _, fid := range failedIDs {
			delete(s.clients, fid)
		}
		s.mu.Unlock()
	}

	slog.Info("全局事件已推送", "sent", sent)
}

// updateTunnelData 根据事件更新 Tunnel 表及 Endpoint.tunnelCount
func (s *Service) updateTunnelData(event models.EndpointSSE) {
	// 记录函数调用及关键字段
	slog.Debug("updateTunnelData", "eventType", event.EventType, "instanceID", event.InstanceID, "endpointID", event.EndpointID)

	// log 事件仅用于日志推流，无需更新隧道表
	if event.EventType == models.SSEEventTypeLog || event.InstanceID == "" {
		return
	}

	// 使用事务保证一致性
	tx, err := s.db.Begin()
	if err != nil {
		slog.Error("开始事务失败", "err", err)
		return
	}

	defer func() {
		_ = tx.Rollback()
	}()

	// 判断隧道是否存在（endpointId + instanceId 唯一）
	var tunnelID int64
	err = tx.QueryRow(`SELECT id FROM "Tunnel" WHERE endpointId = ? AND instanceId = ?`, event.EndpointID, event.InstanceID).Scan(&tunnelID)

	now := time.Now()

	statusVal := ""
	if event.Status != nil {
		statusVal = *event.Status
	}

	if err == sql.ErrNoRows {
		// 仅在 create/initial 事件时插入
		if event.EventType == models.SSEEventTypeCreate || event.EventType == models.SSEEventTypeInitial {
			// 若类型为空则跳过处理，避免回显消息写库
			if event.InstanceType == nil || *event.InstanceType == "" {
			} else {
				slog.Info("sse推送创建隧道实例", "instanceID", event.InstanceID, "endpointID", event.EndpointID, "instanceType", *event.InstanceType)
				// 解析 URL 获取详细配置
				var (
					tunnelAddr, tunnelPort, targetAddr, targetPort, tlsMode, logLevel, commandLine string
					cfg                                                                            parsedURL
				)
				if event.URL != nil {
					cfg = parseInstanceURL(*event.URL, *event.InstanceType)
					tunnelAddr = cfg.TunnelAddress
					tunnelPort = cfg.TunnelPort
					targetAddr = cfg.TargetAddress
					targetPort = cfg.TargetPort
					tlsMode = cfg.TLSMode
					logLevel = cfg.LogLevel
					commandLine = *event.URL
				}

				if tlsMode == "" {
					tlsMode = "inherit"
				}
				if logLevel == "" {
					logLevel = "inherit"
				}

				_, err = tx.Exec(`INSERT INTO "Tunnel" (
					instanceId, endpointId, name, mode,
					status, tunnelAddress, tunnelPort, targetAddress, targetPort,
					tlsMode, certPath, keyPath, logLevel, commandLine,
					tcpRx, tcpTx, udpRx, udpTx,
					createdAt, updatedAt, lastEventTime
				) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
					event.InstanceID,
					event.EndpointID,
					event.InstanceID,
					*event.InstanceType,
					statusVal,
					tunnelAddr,
					tunnelPort,
					targetAddr,
					targetPort,
					tlsMode,
					cfg.CertPath,
					cfg.KeyPath,
					logLevel,
					commandLine,
					event.TCPRx,
					event.TCPTx,
					event.UDPRx,
					event.UDPTx,
					now,
					now,
					event.EventTime,
				)
				if err != nil {
					slog.Error("插入隧道记录失败", "err", err)
					return
				}
				slog.Info("隧道记录已插入", "instanceID", event.InstanceID)
			}
		}
	} else if err == nil {
		// 读取当前状态以判断是否需要更新
		var currentStatus string
		if err := tx.QueryRow(`SELECT status FROM "Tunnel" WHERE id = ?`, tunnelID).Scan(&currentStatus); err != nil {
			slog.Warn("查询当前隧道状态失败", "err", err)
		}

		if statusVal != "" && statusVal == currentStatus {
			// 状态一致，无需更新
			slog.Debug("隧道状态未变化，跳过更新", "instanceID", event.InstanceID, "status", currentStatus)
		} else {
			slog.Info("sse推送更新隧道实例", "instanceID", event.InstanceID, "endpointID", event.EndpointID, "oldStatus", currentStatus, "newStatus", statusVal)

			// 如果是 delete 事件，直接删除记录
			if event.EventType == models.SSEEventTypeDelete {
				slog.Info("命中删除")
				if _, err := tx.Exec(`DELETE FROM "Tunnel" WHERE endpointId = ? AND instanceId = ?`, event.EndpointID, event.InstanceID); err != nil {
					slog.Warn("删除隧道记录失败", "err", err)
				} else {
					slog.Info("已删除隧道记录", "endpointID", event.EndpointID, "instanceID", event.InstanceID)
				}
			} else {
				// 更新已有隧道
				var setParts []string
				var args []interface{}

				if statusVal != "" {
					setParts = append(setParts, "status = ?")
					args = append(args, statusVal)
				}

				setParts = append(setParts, "tcpRx = ?", "tcpTx = ?", "udpRx = ?", "udpTx = ?", "lastEventTime = ?", "updatedAt = ?")
				args = append(args, event.TCPRx, event.TCPTx, event.UDPRx, event.UDPTx, event.EventTime, now)

				query := fmt.Sprintf(`UPDATE "Tunnel" SET %s WHERE instanceId = ?`, strings.Join(setParts, ", "))
				args = append(args, event.InstanceID)

				if _, err := tx.Exec(query, args...); err != nil {
					slog.Error("更新隧道记录失败", "err", err)
					return
				}
			}
		}
	} else {
		slog.Error("查询隧道记录失败", "err", err)
		return
	}

	// 重新计算并更新 Endpoint.tunnelCount
	_, err = tx.Exec(`UPDATE "Endpoint" SET tunnelCount = (
		SELECT COUNT(*) FROM "Tunnel" WHERE endpointId = ?
	) WHERE id = ?`, event.EndpointID, event.EndpointID)
	if err != nil {
		slog.Error("更新端点隧道计数失败", "err", err)
		return
	}

	slog.Debug("端点隧道计数已刷新", "endpointID", event.EndpointID)

	_ = tx.Commit()

	// slog.Info("updateTunnelData 完成", "instanceID", event.InstanceID, "eventType", event.EventType)
}

// parseInstanceURL 解析隧道实例 URL，返回各字段（简化版）
type parsedURL struct {
	TunnelAddress string
	TunnelPort    string
	TargetAddress string
	TargetPort    string
	TLSMode       string
	LogLevel      string
	CertPath      string
	KeyPath       string
}

func parseInstanceURL(raw, mode string) parsedURL {
	// 默认值
	res := parsedURL{
		TLSMode:  "inherit",
		LogLevel: "inherit",
		CertPath: "",
		KeyPath:  "",
	}

	if raw == "" {
		return res
	}

	// 分离 protocol://hostPart/pathPart?query
	var hostPart, pathPart, queryPart string
	// strip protocol
	if idx := strings.Index(raw, "://"); idx != -1 {
		raw = raw[idx+3:]
	}

	// split query
	if qIdx := strings.Index(raw, "?"); qIdx != -1 {
		queryPart = raw[qIdx+1:]
		raw = raw[:qIdx]
	}

	// split path
	if pIdx := strings.Index(raw, "/"); pIdx != -1 {
		hostPart = raw[:pIdx]
		pathPart = raw[pIdx+1:]
	} else {
		hostPart = raw
	}

	// hostPart => tunnel address:port
	if hostPart != "" {
		if strings.Contains(hostPart, ":") {
			parts := strings.SplitN(hostPart, ":", 2)
			res.TunnelAddress = parts[0]
			res.TunnelPort = parts[1]
		} else {
			// 只有端口或地址
			if _, err := strconv.Atoi(hostPart); err == nil {
				res.TunnelPort = hostPart
			} else {
				res.TunnelAddress = hostPart
			}
		}
	}

	// pathPart => target address:port
	if pathPart != "" {
		if strings.Contains(pathPart, ":") {
			parts := strings.SplitN(pathPart, ":", 2)
			res.TargetAddress = parts[0]
			res.TargetPort = parts[1]
		} else {
			if _, err := strconv.Atoi(pathPart); err == nil {
				res.TargetPort = pathPart
			} else {
				res.TargetAddress = pathPart
			}
		}
	}

	// query params
	if queryPart != "" {
		for _, kv := range strings.Split(queryPart, "&") {
			if kv == "" {
				continue
			}
			parts := strings.SplitN(kv, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key, val := parts[0], parts[1]
			switch key {
			case "tls":
				if mode == "server" {
					switch val {
					case "0":
						res.TLSMode = "mode0"
					case "1":
						res.TLSMode = "mode1"
					case "2":
						res.TLSMode = "mode2"
					}
				}
			case "log":
				res.LogLevel = strings.ToLower(val)
			case "crt":
				res.CertPath = val
			case "key":
				res.KeyPath = val
			}
		}
	}

	return res
}

// ======================== 事件处理器 ============================

func (s *Service) handleInitialEvent(e models.EndpointSSE) {
	if e.InstanceType == nil || *e.InstanceType == "" {
		slog.Debug("initial 跳过无效实例", "instanceID", e.InstanceID)
		return
	}
	cfg := parseInstanceURL(ptrString(e.URL), *e.InstanceType)
	if err := s.withTx(func(tx *sql.Tx) error { return s.tunnelCreate(tx, e, cfg) }); err != nil {
		slog.Error("initial 创建隧道失败", "err", err)
	}
}

func (s *Service) handleCreateEvent(e models.EndpointSSE) {
	cfg := parseInstanceURL(ptrString(e.URL), *e.InstanceType)
	if err := s.withTx(func(tx *sql.Tx) error { return s.tunnelCreate(tx, e, cfg) }); err != nil {
		slog.Error("create 创建隧道失败", "err", err)
	}
}

func (s *Service) handleUpdateEvent(e models.EndpointSSE) {
	if err := s.withTx(func(tx *sql.Tx) error {
		cfg := parseInstanceURL(ptrString(e.URL), ptrStringDefault(e.InstanceType, ""))
		return s.tunnelUpdate(tx, e, cfg)
	}); err != nil {
		slog.Error("更新隧道失败", "err", err)
	}
}

func (s *Service) handleDeleteEvent(e models.EndpointSSE) {
	if err := s.withTx(func(tx *sql.Tx) error { return s.tunnelDelete(tx, e.EndpointID, e.InstanceID) }); err != nil {
		slog.Error("删除隧道失败", "err", err)
	}
	slog.Info("删除隧道成功", "instanceID", e.InstanceID)
}

func (s *Service) handleLogEvent(e models.EndpointSSE) {
	// slog.Debug("处理 log 事件", "instanceID", e.InstanceID)

}

// =============== 隧道 CRUD ===============

func (s *Service) tunnelExists(tx *sql.Tx, endpointID int64, instanceID string) (bool, error) {
	var cnt int
	if err := tx.QueryRow(`SELECT COUNT(1) FROM "Tunnel" WHERE endpointId = ? AND instanceId = ?`, endpointID, instanceID).Scan(&cnt); err != nil {
		return false, err
	}
	return cnt > 0, nil
}

func (s *Service) tunnelCreate(tx *sql.Tx, e models.EndpointSSE, cfg parsedURL) error {
	exists, err := s.tunnelExists(tx, e.EndpointID, e.InstanceID)
	if err != nil || exists {
		return err
	}
	name := e.InstanceID
	if cfg.LogLevel == "" {
		cfg.LogLevel = "inherit"
	}
	if cfg.TLSMode == "" {
		cfg.TLSMode = "inherit"
	}

	_, err = tx.Exec(`INSERT INTO "Tunnel" (
		instanceId, endpointId, name, mode, status,
		tunnelAddress, tunnelPort, targetAddress, targetPort,
		tlsMode, certPath, keyPath, logLevel, commandLine,
		tcpRx, tcpTx, udpRx, udpTx, createdAt, updatedAt, lastEventTime
	) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		e.InstanceID, e.EndpointID, name, ptrStringDefault(e.InstanceType, ""), ptrStringDefault(e.Status, "stopped"),
		cfg.TunnelAddress, cfg.TunnelPort, cfg.TargetAddress, cfg.TargetPort,
		cfg.TLSMode, cfg.CertPath, cfg.KeyPath, cfg.LogLevel, ptrString(e.URL),
		e.TCPRx, e.TCPTx, e.UDPRx, e.UDPTx, time.Now(), time.Now(), e.EventTime,
	)
	if err != nil {
		return err
	}

	// 更新端点隧道计数
	_, err = tx.Exec(`UPDATE "Endpoint" SET tunnelCount = (
		SELECT COUNT(*) FROM "Tunnel" WHERE endpointId = ?
	) WHERE id = ?`, e.EndpointID, e.EndpointID)
	return err
}

func (s *Service) tunnelUpdate(tx *sql.Tx, e models.EndpointSSE, cfg parsedURL) error {
	var curStatus string
	var curTCPRx, curTCPTx, curUDPRx, curUDPTx int64
	var curEventTime sql.NullTime

	err := tx.QueryRow(`SELECT status, tcpRx, tcpTx, udpRx, udpTx, lastEventTime FROM "Tunnel" WHERE endpointId = ? AND instanceId = ?`, e.EndpointID, e.InstanceID).
		Scan(&curStatus, &curTCPRx, &curTCPTx, &curUDPRx, &curUDPTx, &curEventTime)
	if err == sql.ErrNoRows {
		slog.Debug("update 跳过不存在的隧道", "instanceID", e.InstanceID)
		return nil // 尚未创建对应记录，等待后续 create/initial
	}
	if err != nil {
		return err // 查询错误
	}

	newStatus := ptrStringDefault(e.Status, curStatus)

	statusChanged := newStatus != curStatus
	trafficChanged := curTCPRx != e.TCPRx || curTCPTx != e.TCPTx || curUDPRx != e.UDPRx || curUDPTx != e.UDPTx

	// 只有状态/流量变化且事件时间更新时才更新
	if !statusChanged && !trafficChanged {
		return nil
	}

	if curEventTime.Valid && !e.EventTime.After(curEventTime.Time) {
		slog.Debug("旧事件时间，跳过更新", "instanceID", e.InstanceID)
		return nil
	}

	_, err = tx.Exec(`UPDATE "Tunnel" SET status = ?, tcpRx = ?, tcpTx = ?, udpRx = ?, udpTx = ?, lastEventTime = ?, updatedAt = ? WHERE endpointId = ? AND instanceId = ?`,
		newStatus, e.TCPRx, e.TCPTx, e.UDPRx, e.UDPTx, e.EventTime, time.Now(), e.EndpointID, e.InstanceID)
	return err
}

func (s *Service) tunnelDelete(tx *sql.Tx, endpointID int64, instanceID string) error {
	exists, err := s.tunnelExists(tx, endpointID, instanceID)
	if err != nil {
		return err
	}
	if !exists {
		slog.Debug("delete 跳过，不存在记录", "instanceID", instanceID)
		return nil // 无需删除
	}

	if _, err := tx.Exec(`DELETE FROM "Tunnel" WHERE endpointId = ? AND instanceId = ?`, endpointID, instanceID); err != nil {
		return err
	}

	// 更新端点隧道计数
	_, err = tx.Exec(`UPDATE "Endpoint" SET tunnelCount = (
		SELECT COUNT(*) FROM "Tunnel" WHERE endpointId = ?
	) WHERE id = ?`, endpointID, endpointID)
	return err
}

func (s *Service) withTx(fn func(*sql.Tx) error) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

// helper
func ptrString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func ptrStringDefault(s *string, def string) string {
	if s == nil || *s == "" {
		return def
	}
	return *s
}
