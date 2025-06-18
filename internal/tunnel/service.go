package tunnel

import (
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"NodePassDash/internal/nodepass"
)

// Service 隧道管理服务
type Service struct {
	db *sql.DB
}

// OperationLog 操作日志结构
type OperationLog struct {
	ID         int64          `json:"id"`
	TunnelID   sql.NullInt64  `json:"tunnelId,omitempty"`
	TunnelName string         `json:"tunnelName"`
	Action     string         `json:"action"`
	Status     string         `json:"status"`
	Message    sql.NullString `json:"message,omitempty"`
	CreatedAt  time.Time      `json:"createdAt"`
}

// parsedURL 表示解析后的隧道 URL 各字段（与 SSE 模块保持一致）
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

// parseInstanceURL 解析隧道实例 URL（简化实现，与 SSE 保持一致）
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

	// 去除协议部分 protocol://
	if idx := strings.Index(raw, "://"); idx != -1 {
		raw = raw[idx+3:]
	}

	// 分离查询参数
	var queryPart string
	if qIdx := strings.Index(raw, "?"); qIdx != -1 {
		queryPart = raw[qIdx+1:]
		raw = raw[:qIdx]
	}

	// 分离路径
	var hostPart, pathPart string
	if pIdx := strings.Index(raw, "/"); pIdx != -1 {
		hostPart = raw[:pIdx]
		pathPart = raw[pIdx+1:]
	} else {
		hostPart = raw
	}

	// 解析 hostPart -> tunnelAddress:tunnelPort
	if hostPart != "" {
		if strings.Contains(hostPart, ":") {
			parts := strings.SplitN(hostPart, ":", 2)
			res.TunnelAddress = parts[0]
			res.TunnelPort = parts[1]
		} else {
			if _, err := strconv.Atoi(hostPart); err == nil {
				res.TunnelPort = hostPart
			} else {
				res.TunnelAddress = hostPart
			}
		}
	}

	// 解析 pathPart -> targetAddress:targetPort
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

	// 解析查询参数
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

// NewService 创建隧道服务实例
func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// GetTunnels 获取所有隧道列表
func (s *Service) GetTunnels() ([]TunnelWithStats, error) {
	slog.Debug("GetTunnels called")
	query := `
		SELECT 
			t.id, t.instanceId, t.name, t.endpointId, t.mode,
			t.tunnelAddress, t.tunnelPort, t.targetAddress, t.targetPort,
			t.tlsMode, t.certPath, t.keyPath, t.logLevel, t.commandLine,
			t.status, t.tcpRx, t.tcpTx, t.udpRx, t.udpTx,
			t.createdAt, t.updatedAt,
			e.name as endpointName
		FROM "Tunnel" t
		LEFT JOIN "Endpoint" e ON t.endpointId = e.id
		ORDER BY t.createdAt DESC
	`

	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tunnels []TunnelWithStats
	for rows.Next() {
		var t TunnelWithStats
		var modeStr, statusStr, tlsModeStr, logLevelStr string
		var instanceID sql.NullString
		var certPathNS, keyPathNS sql.NullString
		var endpointNameNS sql.NullString
		err := rows.Scan(
			&t.ID, &instanceID, &t.Name, &t.EndpointID, &modeStr,
			&t.TunnelAddress, &t.TunnelPort, &t.TargetAddress, &t.TargetPort,
			&tlsModeStr, &certPathNS, &keyPathNS, &logLevelStr, &t.CommandLine,
			&statusStr, &t.Traffic.TCPRx, &t.Traffic.TCPTx, &t.Traffic.UDPRx, &t.Traffic.UDPTx,
			&t.CreatedAt, &t.UpdatedAt,
			&endpointNameNS,
		)
		if err != nil {
			return nil, err
		}
		if instanceID.Valid {
			t.InstanceID = instanceID.String
		}
		if certPathNS.Valid {
			t.CertPath = certPathNS.String
		}
		if keyPathNS.Valid {
			t.KeyPath = keyPathNS.String
		}
		if endpointNameNS.Valid {
			t.EndpointName = endpointNameNS.String
		}

		t.Mode = TunnelMode(modeStr)
		t.Status = TunnelStatus(statusStr)
		t.TLSMode = TLSMode(tlsModeStr)
		t.LogLevel = LogLevel(logLevelStr)

		// 计算总流量
		t.Traffic.Total = t.Traffic.TCPRx + t.Traffic.TCPTx + t.Traffic.UDPRx + t.Traffic.UDPTx

		// 格式化流量数据
		t.Traffic.Formatted.TCPRx = formatTrafficBytes(t.Traffic.TCPRx)
		t.Traffic.Formatted.TCPTx = formatTrafficBytes(t.Traffic.TCPTx)
		t.Traffic.Formatted.UDPRx = formatTrafficBytes(t.Traffic.UDPRx)
		t.Traffic.Formatted.UDPTx = formatTrafficBytes(t.Traffic.UDPTx)
		t.Traffic.Formatted.Total = formatTrafficBytes(t.Traffic.Total)

		// 设置类型和头像
		t.Type = string(t.Mode)
		if t.Type == "server" {
			t.Type = "服务端"
		} else {
			t.Type = "客户端"
		}
		if len(t.EndpointName) > 0 {
			t.Avatar = string([]rune(t.EndpointName)[0])
		}

		// 设置状态信息
		switch t.Status {
		case StatusRunning:
			t.StatusInfo.Type = "success"
			t.StatusInfo.Text = "运行中"
		case StatusError:
			t.StatusInfo.Type = "warning"
			t.StatusInfo.Text = "错误"
		default:
			t.StatusInfo.Type = "danger"
			t.StatusInfo.Text = "已停止"
		}

		tunnels = append(tunnels, t)
	}

	return tunnels, nil
}

// CreateTunnel 创建新隧道
func (s *Service) CreateTunnel(req CreateTunnelRequest) (*Tunnel, error) {
	slog.Info("CreateTunnel", "name", req.Name, "endpointId", req.EndpointID, "mode", req.Mode)
	// 检查端点是否存在
	var endpointURL, endpointAPIPath, endpointAPIKey string
	err := s.db.QueryRow(
		"SELECT url, apiPath, apiKey FROM \"Endpoint\" WHERE id = ?",
		req.EndpointID,
	).Scan(&endpointURL, &endpointAPIPath, &endpointAPIKey)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("指定的端点不存在")
		}
		return nil, err
	}

	// 检查隧道名称是否重复
	var exists bool
	err = s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM \"Tunnel\" WHERE name = ?)", req.Name).Scan(&exists)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, errors.New("隧道名称已存在")
	}

	// 构建命令行
	commandLine := fmt.Sprintf("%s://%s:%d/%s:%d",
		req.Mode,
		req.TunnelAddress,
		req.TunnelPort,
		req.TargetAddress,
		req.TargetPort,
	)

	// 添加查询参数
	var queryParams []string

	if req.LogLevel != LogLevelInherit {
		queryParams = append(queryParams, fmt.Sprintf("log=%s", req.LogLevel))
	}

	if req.Mode == "server" && req.TLSMode != TLSModeInherit {
		var tlsModeNum string
		switch req.TLSMode {
		case TLSMode0:
			tlsModeNum = "0"
		case TLSMode1:
			tlsModeNum = "1"
		case TLSMode2:
			tlsModeNum = "2"
		}
		queryParams = append(queryParams, fmt.Sprintf("tls=%s", tlsModeNum))

		if req.TLSMode == TLSMode2 && req.CertPath != "" && req.KeyPath != "" {
			queryParams = append(queryParams,
				fmt.Sprintf("crt=%s", req.CertPath),
				fmt.Sprintf("key=%s", req.KeyPath),
			)
		}
	}

	if len(queryParams) > 0 {
		commandLine += "?" + strings.Join(queryParams, "&")
	}

	// 使用 NodePass 客户端创建实例
	npClient := nodepass.NewClient(endpointURL, endpointAPIPath, endpointAPIKey, nil)
	instanceID, remoteStatus, err := npClient.CreateInstance(commandLine)
	if err != nil {
		return nil, err
	}

	// 尝试查询是否已存在相同 endpointId+instanceId 的记录（可能由 SSE 先行创建）
	var existingID int64
	err = s.db.QueryRow(`SELECT id FROM "Tunnel" WHERE endpointId = ? AND instanceId = ?`, req.EndpointID, instanceID).Scan(&existingID)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	now := time.Now()
	if existingID == 0 {
		// 创建新记录
		result, err := s.db.Exec(`
			INSERT INTO "Tunnel" (
				instanceId, name, endpointId, mode,
				tunnelAddress, tunnelPort, targetAddress, targetPort,
				tlsMode, certPath, keyPath, logLevel, commandLine,
				status, createdAt, updatedAt
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`,
			instanceID,
			req.Name,
			req.EndpointID,
			req.Mode,
			req.TunnelAddress,
			req.TunnelPort,
			req.TargetAddress,
			req.TargetPort,
			req.TLSMode,
			req.CertPath,
			req.KeyPath,
			req.LogLevel,
			commandLine,
			"running",
			now,
			now,
		)
		if err != nil {
			return nil, err
		}

		existingID, err = result.LastInsertId()
		if err != nil {
			return nil, err
		}
	} else {
		// 已存在，仅更新名称（其余字段由 SSE 写入保持）
		_, err := s.db.Exec(`UPDATE "Tunnel" SET name = ?, updatedAt = ? WHERE id = ?`,
			req.Name,
			now,
			existingID,
		)
		if err != nil {
			return nil, err
		}
	}

	// 记录操作日志
	_, err = s.db.Exec(`
		INSERT INTO "TunnelOperationLog" (
			tunnelId, tunnelName, action, status, message
		) VALUES (?, ?, ?, ?, ?)
	`,
		existingID,
		req.Name,
		"create",
		"success",
		"隧道创建成功",
	)
	if err != nil {
		return nil, err
	}

	return &Tunnel{
		ID:            existingID,
		InstanceID:    instanceID,
		Name:          req.Name,
		EndpointID:    req.EndpointID,
		Mode:          TunnelMode(req.Mode),
		TunnelAddress: req.TunnelAddress,
		TunnelPort:    req.TunnelPort,
		TargetAddress: req.TargetAddress,
		TargetPort:    req.TargetPort,
		TLSMode:       req.TLSMode,
		CertPath:      req.CertPath,
		KeyPath:       req.KeyPath,
		LogLevel:      req.LogLevel,
		CommandLine:   commandLine,
		Status:        TunnelStatus(remoteStatus),
		CreatedAt:     now,
		UpdatedAt:     now,
	}, nil
}

// DeleteTunnel 删除隧道
func (s *Service) DeleteTunnel(instanceID string) error {
	slog.Info("DeleteTunnel", "instanceId", instanceID)
	// 获取隧道信息
	var tunnel struct {
		ID         int64
		Name       string
		EndpointID int64
	}
	err := s.db.QueryRow(`
		SELECT id, name, endpointId
		FROM "Tunnel"
		WHERE instanceId = ?
	`, instanceID).Scan(&tunnel.ID, &tunnel.Name, &tunnel.EndpointID)
	if err != nil {
		if err == sql.ErrNoRows {
			return errors.New("隧道不存在")
		}
		return err
	}

	// 获取端点信息
	var endpoint struct {
		URL     string
		APIPath string
		APIKey  string
	}
	err = s.db.QueryRow(`SELECT url, apiPath, apiKey FROM "Endpoint" WHERE id = ?`, tunnel.EndpointID).Scan(&endpoint.URL, &endpoint.APIPath, &endpoint.APIKey)
	if err != nil {
		return err
	}

	// 调用 NodePass API 删除隧道实例
	npClient := nodepass.NewClient(endpoint.URL, endpoint.APIPath, endpoint.APIKey, nil)
	if err := npClient.DeleteInstance(instanceID); err != nil {
		fmt.Printf("警告: %v，继续删除本地记录\n", err)
	}

	// 删除隧道记录
	result, err := s.db.Exec(`DELETE FROM "Tunnel" WHERE id = ?`, tunnel.ID)
	if err != nil {
		return err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return errors.New("隧道不存在")
	}

	// 记录操作日志
	_, err = s.db.Exec(`
		INSERT INTO "TunnelOperationLog" (
			tunnelId, tunnelName, action, status, message
		) VALUES (?, ?, ?, ?, ?)
	`,
		tunnel.ID,
		tunnel.Name,
		"delete",
		"success",
		"隧道删除成功",
	)
	return err
}

// UpdateTunnelStatus 更新隧道状态
func (s *Service) UpdateTunnelStatus(instanceID string, status TunnelStatus) error {
	result, err := s.db.Exec(`
		UPDATE "Tunnel" SET status = ?, updatedAt = ? WHERE instanceId = ?
	`,
		status, time.Now(), instanceID,
	)
	if err != nil {
		return err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return errors.New("隧道不存在")
	}

	return nil
}

// ControlTunnel 控制隧道状态（启动/停止/重启）
func (s *Service) ControlTunnel(req TunnelActionRequest) error {
	slog.Info("ControlTunnel", "instanceId", req.InstanceID, "action", req.Action)
	// 获取隧道和端点信息
	var tunnel struct {
		ID         int64
		Name       string
		EndpointID int64
	}
	var endpoint struct {
		URL     string
		APIPath string
		APIKey  string
	}

	err := s.db.QueryRow(`
		SELECT t.id, t.name, t.endpointId,
			   e.url, e.apiPath, e.apiKey
		FROM "Tunnel" t
		JOIN "Endpoint" e ON t.endpointId = e.id
		WHERE t.instanceId = ?
	`, req.InstanceID).Scan(
		&tunnel.ID, &tunnel.Name, &tunnel.EndpointID,
		&endpoint.URL, &endpoint.APIPath, &endpoint.APIKey,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return errors.New("隧道不存在")
		}
		return err
	}

	// 调用 NodePass API
	npClient := nodepass.NewClient(endpoint.URL, endpoint.APIPath, endpoint.APIKey, nil)
	if _, err = npClient.ControlInstance(req.InstanceID, req.Action); err != nil {
		return err
	}

	// 目标状态映射
	var targetStatus TunnelStatus
	switch req.Action {
	case "start", "restart":
		targetStatus = StatusRunning
	case "stop":
		targetStatus = StatusStopped
	default:
		targetStatus = "" // 不会发生，已验证
	}

	// 轮询数据库等待状态变更 (最多8秒)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		var curStatus string
		if err := s.db.QueryRow(`SELECT status FROM "Tunnel" WHERE instanceId = ?`, req.InstanceID).Scan(&curStatus); err == nil {
			if TunnelStatus(curStatus) == targetStatus {
				break // 成功
			}
		}
		time.Sleep(200 * time.Millisecond)
	}

	// 再次检查，若仍未到目标状态则手动更新
	var finalStatus string
	_ = s.db.QueryRow(`SELECT status FROM "Tunnel" WHERE instanceId = ?`, req.InstanceID).Scan(&finalStatus)
	if TunnelStatus(finalStatus) != targetStatus {
		_ = s.UpdateTunnelStatus(req.InstanceID, targetStatus)
	}

	// 记录操作日志
	_, err = s.db.Exec(`INSERT INTO "TunnelOperationLog" (tunnelId, tunnelName, action, status, message) VALUES (?, ?, ?, ?, ?)`,
		tunnel.ID,
		tunnel.Name,
		req.Action,
		"success",
		fmt.Sprintf("隧道%s成功", req.Action),
	)
	return err
}

// formatTrafficBytes 格式化流量数据
func formatTrafficBytes(bytes int64) string {
	const (
		_          = iota
		KB float64 = 1 << (10 * iota)
		MB
		GB
		TB
	)

	var size float64
	var unit string

	switch {
	case bytes >= int64(TB):
		size = float64(bytes) / TB
		unit = "TB"
	case bytes >= int64(GB):
		size = float64(bytes) / GB
		unit = "GB"
	case bytes >= int64(MB):
		size = float64(bytes) / MB
		unit = "MB"
	case bytes >= int64(KB):
		size = float64(bytes) / KB
		unit = "KB"
	default:
		size = float64(bytes)
		unit = "B"
	}

	return fmt.Sprintf("%.2f %s", size, unit)
}

// UpdateTunnel 更新隧道配置
func (s *Service) UpdateTunnel(req UpdateTunnelRequest) error {
	slog.Info("UpdateTunnel", "id", req.ID)
	// 检查隧道是否存在
	var exists bool
	err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM "Tunnel" WHERE id = ?)`, req.ID).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return errors.New("隧道不存在")
	}

	// 获取当前隧道信息
	var tunnel Tunnel
	err = s.db.QueryRow(`
		SELECT 
			id, instanceId, name, endpointId, mode,
			tunnelAddress, tunnelPort, targetAddress, targetPort,
			tlsMode, certPath, keyPath, logLevel, commandLine
		FROM "Tunnel" 
		WHERE id = ?
	`, req.ID).Scan(
		&tunnel.ID, &tunnel.InstanceID, &tunnel.Name, &tunnel.EndpointID, &tunnel.Mode,
		&tunnel.TunnelAddress, &tunnel.TunnelPort, &tunnel.TargetAddress, &tunnel.TargetPort,
		&tunnel.TLSMode, &tunnel.CertPath, &tunnel.KeyPath, &tunnel.LogLevel, &tunnel.CommandLine,
	)
	if err != nil {
		return err
	}

	// 获取端点信息
	var endpointURL, endpointAPIPath, endpointAPIKey string
	err = s.db.QueryRow(`SELECT url, apiPath, apiKey FROM "Endpoint" WHERE id = ?`, tunnel.EndpointID).Scan(&endpointURL, &endpointAPIPath, &endpointAPIKey)
	if err != nil {
		if err == sql.ErrNoRows {
			return errors.New("指定的端点不存在")
		}
		return err
	}

	// 更新隧道信息
	if req.Name != "" {
		tunnel.Name = req.Name
	}
	if req.TunnelAddress != "" {
		tunnel.TunnelAddress = req.TunnelAddress
	}
	if req.TunnelPort != 0 {
		tunnel.TunnelPort = req.TunnelPort
	}
	if req.TargetAddress != "" {
		tunnel.TargetAddress = req.TargetAddress
	}
	if req.TargetPort != 0 {
		tunnel.TargetPort = req.TargetPort
	}
	if req.TLSMode != "" {
		tunnel.TLSMode = req.TLSMode
	}
	if req.CertPath != "" {
		tunnel.CertPath = req.CertPath
	}
	if req.KeyPath != "" {
		tunnel.KeyPath = req.KeyPath
	}
	if req.LogLevel != "" {
		tunnel.LogLevel = req.LogLevel
	}

	// 构建命令行
	commandLine := fmt.Sprintf("%s://%s:%d/%s:%d",
		tunnel.Mode,
		tunnel.TunnelAddress,
		tunnel.TunnelPort,
		tunnel.TargetAddress,
		tunnel.TargetPort,
	)

	// 添加查询参数
	var queryParams []string

	if tunnel.LogLevel != LogLevelInherit {
		queryParams = append(queryParams, fmt.Sprintf("log=%s", tunnel.LogLevel))
	}

	if tunnel.Mode == ModeServer && tunnel.TLSMode != TLSModeInherit {
		var tlsModeNum string
		switch tunnel.TLSMode {
		case TLSMode0:
			tlsModeNum = "0"
		case TLSMode1:
			tlsModeNum = "1"
		case TLSMode2:
			tlsModeNum = "2"
		}
		queryParams = append(queryParams, fmt.Sprintf("tls=%s", tlsModeNum))

		if tunnel.TLSMode == TLSMode2 && tunnel.CertPath != "" && tunnel.KeyPath != "" {
			queryParams = append(queryParams,
				fmt.Sprintf("crt=%s", tunnel.CertPath),
				fmt.Sprintf("key=%s", tunnel.KeyPath),
			)
		}
	}

	if len(queryParams) > 0 {
		commandLine += "?" + strings.Join(queryParams, "&")
	}

	// 更新数据库
	_, err = s.db.Exec(`
		UPDATE "Tunnel" SET
			name = ?,
			tunnelAddress = ?,
			tunnelPort = ?,
			targetAddress = ?,
			targetPort = ?,
			tlsMode = ?,
			certPath = ?,
			keyPath = ?,
			logLevel = ?,
			commandLine = ?,
			updatedAt = ?
		WHERE id = ?
	`,
		tunnel.Name,
		tunnel.TunnelAddress,
		tunnel.TunnelPort,
		tunnel.TargetAddress,
		tunnel.TargetPort,
		tunnel.TLSMode,
		tunnel.CertPath,
		tunnel.KeyPath,
		tunnel.LogLevel,
		commandLine,
		time.Now(),
		tunnel.ID,
	)
	if err != nil {
		return err
	}

	// 调用 NodePass API 更新隧道实例
	npClient := nodepass.NewClient(endpointURL, endpointAPIPath, endpointAPIKey, nil)
	if err := npClient.UpdateInstance(tunnel.InstanceID, commandLine); err != nil {
		return err
	}

	return nil
}

// GetOperationLogs 获取最近 limit 条隧道操作日志
func (s *Service) GetOperationLogs(limit int) ([]OperationLog, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.Query(`SELECT id, tunnelId, tunnelName, action, status, message, createdAt FROM "TunnelOperationLog" ORDER BY createdAt DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []OperationLog
	for rows.Next() {
		var l OperationLog
		if err := rows.Scan(&l.ID, &l.TunnelID, &l.TunnelName, &l.Action, &l.Status, &l.Message, &l.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, nil
}

// GetInstanceIDByTunnelID 根据隧道数据库ID获取对应的实例ID (instanceId)
func (s *Service) GetInstanceIDByTunnelID(id int64) (string, error) {
	var instanceNS sql.NullString
	err := s.db.QueryRow(`SELECT instanceId FROM "Tunnel" WHERE id = ?`, id).Scan(&instanceNS)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", errors.New("隧道不存在")
		}
		return "", err
	}
	if !instanceNS.Valid || instanceNS.String == "" {
		return "", errors.New("隧道没有关联的实例ID")
	}
	return instanceNS.String, nil
}

// DeleteTunnelAndWait 触发远端删除后等待数据库记录被移除
// 该方法不会主动删除本地记录，而是假设有其它进程 (如 SSE 监听) 负责删除
// timeout 为等待的最长时长
func (s *Service) DeleteTunnelAndWait(instanceID string, timeout time.Duration) error {
	slog.Info("DeleteTunnelAndWait", "instanceId", instanceID, "timeout", timeout)
	// 获取隧道及端点信息（与 DeleteTunnel 中相同，但不删除本地记录）
	var tunnel struct {
		ID         int64
		Name       string
		EndpointID int64
	}
	err := s.db.QueryRow(`
		SELECT id, name, endpointId FROM "Tunnel" WHERE instanceId = ?
	`, instanceID).Scan(&tunnel.ID, &tunnel.Name, &tunnel.EndpointID)
	if err != nil {
		if err == sql.ErrNoRows {
			return errors.New("隧道不存在")
		}
		return err
	}

	var endpoint struct {
		URL     string
		APIPath string
		APIKey  string
	}
	if err := s.db.QueryRow(`SELECT url, apiPath, apiKey FROM "Endpoint" WHERE id = ?`, tunnel.EndpointID).
		Scan(&endpoint.URL, &endpoint.APIPath, &endpoint.APIKey); err != nil {
		return err
	}

	// 调用 NodePass API 删除实例
	npClient := nodepass.NewClient(endpoint.URL, endpoint.APIPath, endpoint.APIKey, nil)
	if err := npClient.DeleteInstance(instanceID); err != nil {
		return err
	}

	// 轮询等待数据库记录被删除
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		var exists bool
		if err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM "Tunnel" WHERE instanceId = ?)`, instanceID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return nil // 删除完成
		}
		time.Sleep(200 * time.Millisecond)
	}

	// 超时仍未删除，执行本地强制删除并刷新计数
	slog.Warn("等待删除超时，执行本地删除", "instanceId", instanceID)

	// 删除隧道记录
	result, err := s.db.Exec(`DELETE FROM "Tunnel" WHERE id = ?`, tunnel.ID)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return errors.New("隧道删除失败")
	}

	// 更新端点隧道计数
	_, _ = s.db.Exec(`UPDATE "Endpoint" SET tunnelCount = (
		SELECT COUNT(*) FROM "Tunnel" WHERE endpointId = ?
	) WHERE id = ?`, tunnel.EndpointID, tunnel.EndpointID)

	// 写入操作日志
	_, _ = s.db.Exec(`INSERT INTO "TunnelOperationLog" (
		tunnelId, tunnelName, action, status, message
	) VALUES (?, ?, ?, ?, ?)`,
		tunnel.ID,
		tunnel.Name,
		"delete",
		"success",
		"远端删除超时，本地强制删除",
	)

	return nil
}

// RenameTunnel 仅修改隧道名称，不调用远端 API
func (s *Service) RenameTunnel(id int64, newName string) error {
	slog.Info("RenameTunnel", "id", id, "newName", newName)

	// 检查名称重复
	var exists bool
	if err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM "Tunnel" WHERE name = ?)`, newName).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return errors.New("隧道名称已存在")
	}

	// 更新名称
	result, err := s.db.Exec(`UPDATE "Tunnel" SET name = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, newName, id)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return errors.New("隧道不存在")
	}

	// 记录操作日志
	_, _ = s.db.Exec(`INSERT INTO "TunnelOperationLog" (tunnelId, tunnelName, action, status, message) VALUES (?, ?, ?, ?, ?)`, id, newName, "rename", "success", "重命名成功")

	return nil
}

// DB 返回底层 *sql.DB 指针，供需要直接执行查询的调用者使用
func (s *Service) DB() *sql.DB {
	return s.db
}

// QuickCreateTunnel 根据完整 URL 快速创建隧道实例 (server://addr:port/target:port?params)
func (s *Service) QuickCreateTunnel(endpointID int64, rawURL string) error {
	// 粗解析协议
	idx := strings.Index(rawURL, "://")
	if idx == -1 {
		return errors.New("无效的隧道URL")
	}
	mode := rawURL[:idx]
	cfg := parseInstanceURL(rawURL, mode) // 复用 sse 里的同名私有函数，此处复制实现

	// 端口转换
	tp, _ := strconv.Atoi(cfg.TunnelPort)
	sp, _ := strconv.Atoi(cfg.TargetPort)

	req := CreateTunnelRequest{
		Name:          fmt.Sprintf("auto-%d-%d", endpointID, time.Now().Unix()),
		EndpointID:    endpointID,
		Mode:          mode,
		TunnelAddress: cfg.TunnelAddress,
		TunnelPort:    tp,
		TargetAddress: cfg.TargetAddress,
		TargetPort:    sp,
		TLSMode:       TLSMode(cfg.TLSMode),
		CertPath:      cfg.CertPath,
		KeyPath:       cfg.KeyPath,
		LogLevel:      LogLevel(cfg.LogLevel),
	}
	_, err := s.CreateTunnel(req)
	return err
}
