package instance

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// Instance 实例信息
type Instance struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Status string `json:"status"`
	TcpRx  int64  `json:"tcp_rx"`
	TcpTx  int64  `json:"tcp_tx"`
	UdpRx  int64  `json:"udp_rx"`
	UdpTx  int64  `json:"udp_tx"`
	Error  string `json:"error,omitempty"`
}

// Service 实例管理服务
type Service struct {
	db *sql.DB
}

// NewService 创建实例服务
func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// GetInstances 获取指定端点的所有实例
func (s *Service) GetInstances(endpointURL, endpointAPIPath, endpointAPIKey string) ([]Instance, error) {
	// 构建API URL
	apiURL := fmt.Sprintf("%s%s/instances", endpointURL, endpointAPIPath)

	// 创建请求
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}

	// 设置API Key
	req.Header.Set("X-API-Key", endpointAPIKey)

	// 发送请求
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("调用NodePass API失败: %v", err)
	}
	defer resp.Body.Close()

	// 检查响应状态
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("NodePass API返回错误状态码: %d", resp.StatusCode)
	}

	// 解析响应
	var instances []Instance
	if err := json.NewDecoder(resp.Body).Decode(&instances); err != nil {
		return nil, fmt.Errorf("解析NodePass API响应失败: %v", err)
	}

	return instances, nil
}

// GetInstance 获取单个实例信息
func (s *Service) GetInstance(endpointURL, endpointAPIPath, endpointAPIKey, instanceID string) (*Instance, error) {
	// 构建API URL
	apiURL := fmt.Sprintf("%s%s/instances/%s", endpointURL, endpointAPIPath, instanceID)

	// 创建请求
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}

	// 设置API Key
	req.Header.Set("X-API-Key", endpointAPIKey)

	// 发送请求
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("调用NodePass API失败: %v", err)
	}
	defer resp.Body.Close()

	// 检查响应状态
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("NodePass API返回错误状态码: %d", resp.StatusCode)
	}

	// 解析响应
	var instance Instance
	if err := json.NewDecoder(resp.Body).Decode(&instance); err != nil {
		return nil, fmt.Errorf("解析NodePass API响应失败: %v", err)
	}

	return &instance, nil
}

// ControlInstance 控制实例状态（启动/停止/重启）
func (s *Service) ControlInstance(endpointURL, endpointAPIPath, endpointAPIKey, instanceID, action string) error {
	// 构建API URL
	apiURL := fmt.Sprintf("%s%s/instances/%s", endpointURL, endpointAPIPath, instanceID)

	// 构建请求体
	reqBody := struct {
		Action string `json:"action"`
	}{
		Action: action,
	}

	// 序列化请求体
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	// 创建请求
	req, err := http.NewRequest("PATCH", apiURL, strings.NewReader(string(jsonData)))
	if err != nil {
		return err
	}

	// 设置请求头
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", endpointAPIKey)

	// 发送请求
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("调用NodePass API失败: %v", err)
	}
	defer resp.Body.Close()

	// 检查响应状态
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("NodePass API返回错误状态码: %d", resp.StatusCode)
	}

	return nil
}

func (s *Service) GetInstanceTraffic(id int) ([]byte, error) {
	rows, err := s.db.Query("SELECT traffic_history FROM instances WHERE id = ?", id)
	if err != nil {
		return nil, fmt.Errorf("查询实例流量历史失败: %v", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, sql.ErrNoRows
	}

	var trafficHistory []byte
	if err := rows.Scan(&trafficHistory); err != nil {
		return nil, fmt.Errorf("读取流量历史数据失败: %v", err)
	}

	return trafficHistory, nil
}
