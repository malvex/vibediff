package mcp

import (
	"bytes"
	"encoding/json"
)

// encodeJSON serializes a value to a stable JSON string. SetEscapeHTML(false)
// keeps angle brackets and ampersands in diff hunks readable for the agent
// rather than escaping them to < / > / &.
func encodeJSON(v any) (string, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return "", err
	}
	return buf.String(), nil
}
