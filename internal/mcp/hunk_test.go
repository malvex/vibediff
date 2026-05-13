package mcp

import (
	"strings"
	"testing"
)

const sampleFileDiff = `diff --git a/main.go b/main.go
index 1111111..2222222 100644
--- a/main.go
+++ b/main.go
@@ -10,3 +10,4 @@
 line10
-line11
+line11-new
+line12-added
 line13
@@ -100,3 +101,3 @@
 line100
-line101
+line101-new
 line102`

func TestExtractRelevantHunks(t *testing.T) {
	testCases := []struct {
		name        string
		line        int
		lineEnd     int
		side        string
		wantHeaders []string // hunk headers expected in output, in order
		wantEmpty   bool
	}{
		{
			name:        "matches first hunk by new-side overlap",
			line:        11,
			lineEnd:     11,
			side:        "right",
			wantHeaders: []string{"@@ -10,3 +10,4 @@"},
		},
		{
			name:        "matches second hunk by new-side overlap",
			line:        101,
			lineEnd:     101,
			side:        "right",
			wantHeaders: []string{"@@ -100,3 +101,3 @@"},
		},
		{
			name:        "range spanning both hunks keeps both",
			line:        10,
			lineEnd:     103,
			side:        "right",
			wantHeaders: []string{"@@ -10,3 +10,4 @@", "@@ -100,3 +101,3 @@"},
		},
		{
			name:      "no overlap returns empty",
			line:      50,
			lineEnd:   55,
			side:      "right",
			wantEmpty: true,
		},
		{
			name:        "left side restricts to old-side overlap",
			line:        11,
			lineEnd:     11,
			side:        "left",
			wantHeaders: []string{"@@ -10,3 +10,4 @@"},
		},
		{
			name:        "left side excludes hunk where old-side does not overlap",
			line:        103,
			lineEnd:     103,
			side:        "left",
			wantHeaders: nil, // old-side of second hunk is 100..102; new-side is 101..103
			wantEmpty:   true,
		},
		{
			name:        "empty side matches either side",
			line:        102,
			lineEnd:     102,
			side:        "",
			wantHeaders: []string{"@@ -100,3 +101,3 @@"},
		},
	}

	for _, test := range testCases {
		t.Run(test.name, func(t *testing.T) {
			got := extractRelevantHunks(sampleFileDiff, test.line, test.lineEnd, test.side)

			if test.wantEmpty {
				if got != "" {
					t.Fatalf("expected empty output, got:\n%s", got)
				}
				return
			}

			if !strings.Contains(got, "diff --git a/main.go b/main.go") {
				t.Errorf("output missing file header:\n%s", got)
			}
			for _, want := range test.wantHeaders {
				if !strings.Contains(got, want) {
					t.Errorf("output missing hunk header %q:\n%s", want, got)
				}
			}
			// Verify hunks not in wantHeaders are absent.
			allHeaders := []string{"@@ -10,3 +10,4 @@", "@@ -100,3 +101,3 @@"}
			for _, h := range allHeaders {
				if containsString(test.wantHeaders, h) {
					continue
				}
				if strings.Contains(got, h) {
					t.Errorf("output unexpectedly contains hunk header %q:\n%s", h, got)
				}
			}
		})
	}
}

func TestExtractRelevantHunksEmptyInput(t *testing.T) {
	if got := extractRelevantHunks("", 1, 1, ""); got != "" {
		t.Errorf("empty input should produce empty output, got %q", got)
	}
}

func TestHunkOverlapsMissingCount(t *testing.T) {
	// `@@ -10 +10 @@` (no count) means 1 line on each side.
	if !hunkOverlaps("@@ -10 +10 @@", 10, 10, "right") {
		t.Error("expected overlap on single-line hunk at line 10")
	}
	if hunkOverlaps("@@ -10 +10 @@", 11, 11, "right") {
		t.Error("did not expect overlap on line 11 for single-line hunk at 10")
	}
}

func containsString(s []string, x string) bool {
	for _, v := range s {
		if v == x {
			return true
		}
	}
	return false
}
