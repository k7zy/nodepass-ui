package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"NodePassDash/internal/dashboard"
)

// DashboardHandler 仪表盘相关的处理器
type DashboardHandler struct {
	dashboardService *dashboard.Service
}

// NewDashboardHandler 创建仪表盘处理器实例
func NewDashboardHandler(dashboardService *dashboard.Service) *DashboardHandler {
	return &DashboardHandler{
		dashboardService: dashboardService,
	}
}

// HandleGetStats 获取仪表盘统计数据
func (h *DashboardHandler) HandleGetStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取时间范围参数
	timeRange := r.URL.Query().Get("range")
	if timeRange == "" {
		timeRange = "all"
	}

	// 验证时间范围参数
	var validRange bool
	switch dashboard.TimeRange(timeRange) {
	case dashboard.TimeRangeToday,
		dashboard.TimeRangeWeek,
		dashboard.TimeRangeMonth,
		dashboard.TimeRangeYear,
		dashboard.TimeRangeAllTime:
		validRange = true
	}

	if !validRange {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "无效的时间范围参数",
		})
		return
	}

	// 获取统计数据
	stats, err := h.dashboardService.GetStats(dashboard.TimeRange(timeRange))
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "获取仪表盘数据失败: " + err.Error(),
		})
		return
	}

	// 直接输出统计数据，保持与前端期望的数据结构一致
	json.NewEncoder(w).Encode(stats)
}

// HandleTrafficTrend GET /api/dashboard/traffic-trend
func (h *DashboardHandler) HandleTrafficTrend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// hours 参数可选
	hrsStr := r.URL.Query().Get("hours")
	hours := 24
	if hrsStr != "" {
		if v, err := strconv.Atoi(hrsStr); err == nil && v > 0 {
			hours = v
		}
	}

	trend, err := h.dashboardService.GetTrafficTrend(hours)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "data": trend, "count": len(trend)})
}
