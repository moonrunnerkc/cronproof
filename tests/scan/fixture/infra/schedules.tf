resource "google_cloud_scheduler_job" "digest" {
  name     = "digest"
  schedule = "0 7 * * *"
  time_zone = "America/Chicago"

  http_target {
    uri = "https://example.com/digest"
  }
}

resource "google_cloud_scheduler_job" "cleanup_default_zone" {
  name     = "cleanup"
  schedule = "0 3 * * *"

  http_target {
    uri = "https://example.com/cleanup"
  }
}

resource "aws_cloudwatch_event_rule" "nightly" {
  name                = "nightly"
  schedule_expression = "cron(0 12 * * ? *)"
}

resource "aws_scheduler_schedule" "report" {
  name                = "report"
  schedule_expression = "cron(0 9 * * ? *)"
  schedule_expression_timezone = "Europe/London"

  flexible_time_window {
    mode = "OFF"
  }
}
