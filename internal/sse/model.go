package sse

import (
	"context"
	"net/http"
	"time"
)

// EventType SSE事件类型
type EventType string

const (
	EventTypeInitial  EventType = "initial"
	EventTypeCreate   EventType = "create"
	EventTypeUpdate   EventType = "update"
	EventTypeDelete   EventType = "delete"
	EventTypeShutdown EventType = "shutdown"
	EventTypeLog      EventType = "log"
)

// EndpointStatus 端点状态
type EndpointStatus string

const (
	EndpointStatusOnline  EndpointStatus = "ONLINE"
	EndpointStatusOffline EndpointStatus = "OFFLINE"
	EndpointStatusFail    EndpointStatus = "FAIL"
)

// SSEEvent SSE事件数据
type SSEEvent struct {
	ID           int64         `json:"id"`
	EventType    EventType     `json:"eventType"`
	PushType     string        `json:"pushType"`
	EventTime    time.Time     `json:"eventTime"`
	EndpointID   int64         `json:"endpointId"`
	InstanceID   string        `json:"instanceId"`
	InstanceType string        `json:"instanceType,omitempty"`
	Status       string        `json:"status,omitempty"`
	URL          string        `json:"url,omitempty"`
	TcpRx        int64         `json:"tcpRx,omitempty"`
	TcpTx        int64         `json:"tcpTx,omitempty"`
	UdpRx        int64         `json:"udpRx,omitempty"`
	UdpTx        int64         `json:"udpTx,omitempty"`
	Logs         string        `json:"logs,omitempty"`
	CreatedAt    time.Time     `json:"createdAt"`
}

// EndpointConnection 端点连接状态
type EndpointConnection struct {
	EndpointID int64
	URL        string
	APIPath    string
	APIKey     string
	Client     *http.Client
	Cancel     context.CancelFunc
	IsHealthy  bool
	RetryCount int
	MaxRetries int
	LastError  string
	LastEventTime time.Time
	ReconnectTimer *time.Timer
	ManuallyDisconnected bool
}

// Event 事件类型
type Event struct {
	Type    string      `json:"type"`
	Data    interface{} `json:"data"`
	Message string      `json:"message,omitempty"`
}

// Client SSE 客户端
type Client struct {
	ID     string
	Writer http.ResponseWriter
	Events chan Event
} 