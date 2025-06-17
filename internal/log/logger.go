package log

import (
	"fmt"
	"log/slog"
	"os"
)

// L 为全局 logger 实例，彩色、带时间戳，默认 Debug 级别
var L = newLogger()

// Fields 类型别名，方便调用方构造字段
// 示例: logx.Infof(logx.Fields{"endpointID": 1}, "msg: %s", v)
type Fields = map[string]any

// newLogger 初始化 slog.Logger
func newLogger() *slog.Logger {
	// 自定义 TextHandler，使输出格式接近官方文档示例：
	// 2023/08/04 16:09:19 INFO hello, world key=value ...
	handler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			switch a.Key {
			case slog.TimeKey:
				// 时间格式调整为 yyyy/MM/dd HH:mm:ss
				if a.Value.Kind() == slog.KindTime {
					t := a.Value.Time()
					a.Key = ""
					a.Value = slog.StringValue(t.Format("2006/01/02 15:04:05"))
				}
			case slog.LevelKey:
				// 仅输出 INFO/DEBUG 等，不带 key
				a.Key = ""
			case slog.MessageKey:
				// 不改变，保持默认
			}
			return a
		},
	})
	return slog.New(handler)
}

// convert Fields 到 slog 属性 slice
func toAttrs(fields Fields) []any {
	if len(fields) == 0 {
		return nil
	}
	attrs := make([]any, 0, len(fields)*2)
	for k, v := range fields {
		attrs = append(attrs, k, v)
	}
	return attrs
}

// Debugf 调试级别日志
func Debugf(fields Fields, format string, args ...interface{}) {
	L.Debug(fmt.Sprintf(format, args...), toAttrs(fields)...)
}

// Infof 信息级别日志
func Infof(fields Fields, format string, args ...interface{}) {
	L.Info(fmt.Sprintf(format, args...), toAttrs(fields)...)
}

// Warnf 警告级别日志
func Warnf(fields Fields, format string, args ...interface{}) {
	L.Warn(fmt.Sprintf(format, args...), toAttrs(fields)...)
}

// Errorf 错误级别日志
func Errorf(fields Fields, format string, args ...interface{}) {
	L.Error(fmt.Sprintf(format, args...), toAttrs(fields)...)
}
