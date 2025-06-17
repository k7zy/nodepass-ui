package dashboard

import (
	"database/sql"
	"fmt"
	"sort"
	"time"
)

// Service 仪表盘服务
type Service struct {
	db *sql.DB
}

// NewService 创建仪表盘服务实例
func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// GetStats 获取仪表盘统计数据
func (s *Service) GetStats(timeRange TimeRange) (*DashboardStats, error) {
	stats := &DashboardStats{}

	// 获取时间范围
	startTime := time.Now()
	switch timeRange {
	case TimeRangeToday:
		startTime = time.Date(startTime.Year(), startTime.Month(), startTime.Day(), 0, 0, 0, 0, startTime.Location())
	case TimeRangeWeek:
		startTime = startTime.AddDate(0, 0, -7)
	case TimeRangeMonth:
		startTime = startTime.AddDate(0, -1, 0)
	case TimeRangeYear:
		startTime = startTime.AddDate(-1, 0, 0)
	case TimeRangeAllTime:
		startTime = time.Time{} // 零时间，表示不限制时间范围
	}

	// 获取总览数据
	err := s.db.QueryRow(`
		SELECT 
			COUNT(DISTINCT e.id) as total_endpoints,
			COUNT(DISTINCT t.id) as total_tunnels,
			COUNT(DISTINCT CASE WHEN t.status = 'running' THEN t.id END) as running_tunnels,
			COUNT(DISTINCT CASE WHEN t.status = 'stopped' THEN t.id END) as stopped_tunnels,
			COUNT(DISTINCT CASE WHEN t.status = 'error' THEN t.id END) as error_tunnels,
			COALESCE(SUM(t.tcpRx + t.tcpTx + t.udpRx + t.udpTx), 0) as total_traffic
		FROM "Endpoint" e
		LEFT JOIN "Tunnel" t ON e.id = t.endpointId
		WHERE (? = '' OR t.createdAt >= ?)
	`, startTime, startTime).Scan(
		&stats.Overview.TotalEndpoints,
		&stats.Overview.TotalTunnels,
		&stats.Overview.RunningTunnels,
		&stats.Overview.StoppedTunnels,
		&stats.Overview.ErrorTunnels,
		&stats.Overview.TotalTraffic,
	)
	if err != nil {
		return nil, fmt.Errorf("获取总览数据失败: %v", err)
	}

	// 获取流量统计
	var tcpRx, tcpTx, udpRx, udpTx int64
	err = s.db.QueryRow(`
		SELECT 
			COALESCE(SUM(tcpRx), 0) as tcp_rx,
			COALESCE(SUM(tcpTx), 0) as tcp_tx,
			COALESCE(SUM(udpRx), 0) as udp_rx,
			COALESCE(SUM(udpTx), 0) as udp_tx
		FROM "Tunnel"
		WHERE (? = '' OR createdAt >= ?)
	`, startTime, startTime).Scan(&tcpRx, &tcpTx, &udpRx, &udpTx)
	if err != nil {
		return nil, fmt.Errorf("获取流量统计失败: %v", err)
	}

	// 设置流量统计数据
	stats.Traffic.TCP.Rx.Value = tcpRx
	stats.Traffic.TCP.Rx.Formatted = formatTrafficBytes(tcpRx)
	stats.Traffic.TCP.Tx.Value = tcpTx
	stats.Traffic.TCP.Tx.Formatted = formatTrafficBytes(tcpTx)
	stats.Traffic.UDP.Rx.Value = udpRx
	stats.Traffic.UDP.Rx.Formatted = formatTrafficBytes(udpRx)
	stats.Traffic.UDP.Tx.Value = udpTx
	stats.Traffic.UDP.Tx.Formatted = formatTrafficBytes(udpTx)

	totalTraffic := tcpRx + tcpTx + udpRx + udpTx
	stats.Traffic.Total.Value = totalTraffic
	stats.Traffic.Total.Formatted = formatTrafficBytes(totalTraffic)

	// 获取端点状态分布
	err = s.db.QueryRow(`
		SELECT 
			COUNT(CASE WHEN lastCheck >= datetime('now', '-5 minutes') THEN 1 END) as online,
			COUNT(CASE WHEN lastCheck < datetime('now', '-5 minutes') THEN 1 END) as offline,
			COUNT(*) as total
		FROM "Endpoint"
		WHERE (? = '' OR createdAt >= ?)
	`, startTime, startTime).Scan(
		&stats.EndpointStatus.Online,
		&stats.EndpointStatus.Offline,
		&stats.EndpointStatus.Total,
	)
	if err != nil {
		return nil, fmt.Errorf("获取端点状态分布失败: %v", err)
	}

	// 获取隧道类型分布
	err = s.db.QueryRow(`
		SELECT 
			COUNT(CASE WHEN mode = 'server' THEN 1 END) as server,
			COUNT(CASE WHEN mode = 'client' THEN 1 END) as client,
			COUNT(*) as total
		FROM "Tunnel"
		WHERE (? = '' OR createdAt >= ?)
	`, startTime, startTime).Scan(
		&stats.TunnelTypes.Server,
		&stats.TunnelTypes.Client,
		&stats.TunnelTypes.Total,
	)
	if err != nil {
		return nil, fmt.Errorf("获取隧道类型分布失败: %v", err)
	}

	// 获取最近的操作日志
	rows, err := s.db.Query(`
		SELECT 
			id, tunnelId, tunnelName, action, status, message, createdAt
		FROM "TunnelOperationLog"
		WHERE (? = '' OR createdAt >= ?)
		ORDER BY createdAt DESC
		LIMIT 10
	`, startTime, startTime)
	if err != nil {
		return nil, fmt.Errorf("获取操作日志失败: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var log struct {
			ID        int64  `json:"id"`
			TunnelID  int64  `json:"tunnelId"`
			Name      string `json:"name"`
			Action    string `json:"action"`
			Status    string `json:"status"`
			Message   string `json:"message"`
			CreatedAt string `json:"createdAt"`
		}
		err := rows.Scan(
			&log.ID,
			&log.TunnelID,
			&log.Name,
			&log.Action,
			&log.Status,
			&log.Message,
			&log.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("读取操作日志失败: %v", err)
		}
		stats.RecentLogs = append(stats.RecentLogs, log)
	}

	// 获取最活跃的隧道
	rows, err = s.db.Query(`
		SELECT 
			id, name, mode,
			(tcpRx + tcpTx + udpRx + udpTx) as total_traffic
		FROM "Tunnel"
		WHERE (? = '' OR createdAt >= ?)
		ORDER BY total_traffic DESC
		LIMIT 5
	`, startTime, startTime)
	if err != nil {
		return nil, fmt.Errorf("获取最活跃隧道失败: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var t struct {
			ID      int64
			Name    string
			Mode    string
			Traffic int64
		}
		err := rows.Scan(&t.ID, &t.Name, &t.Mode, &t.Traffic)
		if err != nil {
			return nil, fmt.Errorf("读取隧道数据失败: %v", err)
		}

		tunnelType := "客户端"
		if t.Mode == "server" {
			tunnelType = "服务端"
		}

		stats.TopTunnels = append(stats.TopTunnels, struct {
			ID        int64  `json:"id"`
			Name      string `json:"name"`
			Type      string `json:"type"`
			Traffic   int64  `json:"traffic"`
			Formatted string `json:"formatted"`
		}{
			ID:        t.ID,
			Name:      t.Name,
			Type:      tunnelType,
			Traffic:   t.Traffic,
			Formatted: formatTrafficBytes(t.Traffic),
		})
	}

	return stats, nil
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

// TrafficTrendItem 流量趋势条目
type TrafficTrendItem struct {
	HourTime    string `json:"hourTime"`    // 2025-06-15 11:00:00
	HourDisplay string `json:"hourDisplay"` // 11:00
	TCPRx       int64  `json:"tcpRx"`
	TCPTx       int64  `json:"tcpTx"`
	UDPRx       int64  `json:"udpRx"`
	UDPTx       int64  `json:"udpTx"`
	RecordCount int    `json:"recordCount"`
}

// GetTrafficTrend 获取最近 hours 小时内的流量趋势，默认24小时
func (s *Service) GetTrafficTrend(hours int) ([]TrafficTrendItem, error) {
	if hours <= 0 {
		hours = 24
	}

	// 查询最近 hours 小时的 EndpointSSE 记录 (initial、update)
	rows, err := s.db.Query(`
		SELECT eventTime, tcpRx, tcpTx, udpRx, udpTx
		FROM "EndpointSSE"
		WHERE pushType IN ('initial','update')
		  AND eventTime >= datetime('now', ?||' hours')
		  AND (tcpRx IS NOT NULL OR tcpTx IS NOT NULL OR udpRx IS NOT NULL OR udpTx IS NOT NULL)
		ORDER BY eventTime DESC
		LIMIT 500`, -hours)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type rec struct {
		t                          time.Time
		tcpRx, tcpTx, udpRx, udpTx sql.NullInt64
	}

	hourly := make(map[string]*TrafficTrendItem)

	for rows.Next() {
		var r rec
		if err := rows.Scan(&r.t, &r.tcpRx, &r.tcpTx, &r.udpRx, &r.udpTx); err != nil {
			return nil, err
		}

		hourKey := r.t.Format("2006-01-02 15:00:00")
		if _, ok := hourly[hourKey]; !ok {
			hourly[hourKey] = &TrafficTrendItem{
				HourTime:    hourKey,
				HourDisplay: r.t.Format("15:00"),
			}
		}
		item := hourly[hourKey]
		if r.tcpRx.Valid {
			item.TCPRx += r.tcpRx.Int64
		}
		if r.tcpTx.Valid {
			item.TCPTx += r.tcpTx.Int64
		}
		if r.udpRx.Valid {
			item.UDPRx += r.udpRx.Int64
		}
		if r.udpTx.Valid {
			item.UDPTx += r.udpTx.Int64
		}
		item.RecordCount++
	}

	// 转为 slice 并排序
	var list []TrafficTrendItem
	for _, v := range hourly {
		list = append(list, *v)
	}
	// sort by HourTime asc
	sort.Slice(list, func(i, j int) bool { return list[i].HourTime < list[j].HourTime })

	// 只取最近 hours 条 (可能不足)
	if len(list) > hours {
		list = list[len(list)-hours:]
	}

	return list, nil
}
