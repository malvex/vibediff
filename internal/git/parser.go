package git

import (
	"regexp"
	"strconv"
	"strings"
)

type diffParser struct {
	lines   []string
	current int
}

func newDiffParser(diff string) *diffParser {
	return &diffParser{
		lines: strings.Split(diff, "\n"),
	}
}

func (p *diffParser) parse() ([]FileDiff, error) {
	var files []FileDiff

	for p.current < len(p.lines) {
		line := p.lines[p.current]

		if strings.HasPrefix(line, "diff --git") {
			file := p.parseFile()
			if file != nil {
				files = append(files, *file)
			}
		} else {
			p.current++
		}
	}

	return files, nil
}

func (p *diffParser) parseFile() *FileDiff {
	file := &FileDiff{
		Hunks: []Hunk{},
	}

	diffLine := p.lines[p.current]
	paths := regexp.MustCompile(`diff --git a/(.*) b/(.*)`).FindStringSubmatch(diffLine)
	if len(paths) >= 3 {
		file.OldPath = paths[1]
		file.Path = paths[2]
	}
	p.current++

	for p.current < len(p.lines) && !strings.HasPrefix(p.lines[p.current], "diff --git") {
		line := p.lines[p.current]

		switch {
		case strings.HasPrefix(line, "new file"):
			file.Status = FileStatusAdded
		case strings.HasPrefix(line, "deleted file"):
			file.Status = FileStatusDeleted
		case strings.HasPrefix(line, "rename from"):
			file.Status = FileStatusRenamed
			file.OldPath = strings.TrimPrefix(line, "rename from ")
		case strings.HasPrefix(line, "Binary files"):
			file.IsBinary = true
		case strings.HasPrefix(line, "@@"):
			if hunk := p.parseHunk(); hunk != nil {
				file.Hunks = append(file.Hunks, *hunk)
				continue
			}
		}
		p.current++
	}

	if file.Status == "" {
		file.Status = FileStatusModified
	}

	for _, hunk := range file.Hunks {
		for _, line := range hunk.Lines {
			switch line.Type {
			case LineTypeAdded:
				file.Additions++
			case LineTypeDeleted:
				file.Deletions++
			}
		}
	}

	return file
}

func (p *diffParser) parseHunk() *Hunk {
	header := p.lines[p.current]
	matches := regexp.MustCompile(`@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)`).FindStringSubmatch(header)
	if len(matches) < 5 {
		return nil
	}

	hunk := &Hunk{
		Header: header,
		Lines:  []Line{},
	}

	hunk.OldStart, _ = strconv.Atoi(matches[1])
	if matches[2] != "" {
		hunk.OldLines, _ = strconv.Atoi(matches[2])
	} else {
		hunk.OldLines = 1
	}

	hunk.NewStart, _ = strconv.Atoi(matches[3])
	if matches[4] != "" {
		hunk.NewLines, _ = strconv.Atoi(matches[4])
	} else {
		hunk.NewLines = 1
	}

	p.current++

	oldLine := hunk.OldStart
	newLine := hunk.NewStart

	for p.current < len(p.lines) {
		if p.current >= len(p.lines) || strings.HasPrefix(p.lines[p.current], "@@") || strings.HasPrefix(p.lines[p.current], "diff --git") {
			break
		}

		line := p.lines[p.current]
		if len(line) == 0 {
			p.current++
			continue
		}

		lineObj := Line{
			Content: line,
		}

		switch line[0] {
		case '+':
			lineObj.Type = LineTypeAdded
			num := newLine
			lineObj.NewNumber = &num
			newLine++
			lineObj.Content = line[1:]
		case '-':
			lineObj.Type = LineTypeDeleted
			num := oldLine
			lineObj.OldNumber = &num
			oldLine++
			lineObj.Content = line[1:]
		case ' ':
			lineObj.Type = LineTypeContext
			oldNum := oldLine
			newNum := newLine
			lineObj.OldNumber = &oldNum
			lineObj.NewNumber = &newNum
			oldLine++
			newLine++
			lineObj.Content = line[1:]
		case '\\':
			p.current++
			continue
		default:
			p.current++
			continue
		}

		hunk.Lines = append(hunk.Lines, lineObj)
		p.current++
	}

	return hunk
}
