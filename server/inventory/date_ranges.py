from datetime import datetime, time, timedelta

from django.utils import timezone


def day_range(start, end=None):
    end = end or start
    start_at = timezone.make_aware(datetime.combine(start, time.min))
    end_at = timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min))
    return start_at, end_at
