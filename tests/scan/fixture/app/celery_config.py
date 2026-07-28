from celery import Celery
from celery.schedules import crontab

app = Celery("tasks")

app.conf.beat_schedule = {
    "nightly-report": {
        "task": "tasks.report",
        "schedule": crontab(minute=0, hour=2),
    },
    "quarter-hourly": {
        "task": "tasks.poll",
        "schedule": crontab(minute="*/15"),
    },
}
