// Observe robfig/cron v3 (the library the Kubernetes CronJob controller
// uses) fire sequences across DST transitions. Reads scenarios.json
// (arg 1) and prints a fixture JSON to stdout.
package main

import (
	"encoding/json"
	"os"
	"runtime"
	"time"

	_ "time/tzdata"

	cron "github.com/robfig/cron/v3"
)

type scenario struct {
	ID             string `json:"id"`
	Expression     string `json:"expression"`
	Zone           string `json:"zone"`
	Direction      string `json:"direction"`
	WindowStartUtc string `json:"windowStartUtc"`
	WindowEndUtc   string `json:"windowEndUtc"`
}

type observed struct {
	ID                     string   `json:"id"`
	Expression             string   `json:"expression"`
	Zone                   string   `json:"zone"`
	Direction              string   `json:"direction"`
	WindowStartUtc         string   `json:"windowStartUtc"`
	WindowEndUtc           string   `json:"windowEndUtc"`
	ObservedFireInstantsUtc []string `json:"observedFireInstantsUtc"`
	Error                  string   `json:"error,omitempty"`
}

func observe(s scenario) observed {
	out := observed{ID: s.ID, Expression: s.Expression, Zone: s.Zone, Direction: s.Direction,
		WindowStartUtc: s.WindowStartUtc, WindowEndUtc: s.WindowEndUtc, ObservedFireInstantsUtc: []string{}}
	loc, err := time.LoadLocation(s.Zone)
	if err != nil {
		out.Error = err.Error()
		return out
	}
	sched, err := cron.ParseStandard(s.Expression)
	if err != nil {
		out.Error = err.Error()
		return out
	}
	start, _ := time.Parse(time.RFC3339, s.WindowStartUtc)
	end, _ := time.Parse(time.RFC3339, s.WindowEndUtc)
	cursor := start.In(loc)
	for i := 0; i < 5000; i++ {
		next := sched.Next(cursor)
		if next.IsZero() || next.After(end) {
			break
		}
		out.ObservedFireInstantsUtc = append(out.ObservedFireInstantsUtc,
			next.UTC().Format("2006-01-02T15:04:05.000Z"))
		cursor = next
	}
	return out
}

func main() {
	raw, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}
	var doc struct {
		Scenarios []scenario `json:"scenarios"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		panic(err)
	}
	results := make([]observed, 0, len(doc.Scenarios))
	for _, s := range doc.Scenarios {
		results = append(results, observe(s))
	}
	fixture := map[string]any{
		"scheduler":       "k8s-cronjob",
		"library":         "robfig/cron v3 (the parser the CronJob controller uses)",
		"schedulerVersion": "robfig/cron/v3 v3.0.1",
		"runtime":         runtime.Version(),
		"tzdbVersion":     "go time/tzdata (embedded)",
		"capturedVia":     "computed Schedule.Next() sequence over the window",
		"scenarios":       results,
	}
	encoded, _ := json.MarshalIndent(fixture, "", "  ")
	os.Stdout.Write(append(encoded, '\n'))
}
