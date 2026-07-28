package com.example;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ScheduledTasks {

    // explicit zone attribute
    @Scheduled(cron = "0 0 2 * * *", zone = "Asia/Tokyo")
    public void nightly() {
    }

    // no zone attribute: zone is UNKNOWN (server default)
    @Scheduled(cron = "0 15 4 * * MON")
    public void weekly() {
    }

    // property placeholder: UNRESOLVED, never parsed
    @Scheduled(cron = "${app.cleanup.cron}")
    public void cleanup() {
    }
}
